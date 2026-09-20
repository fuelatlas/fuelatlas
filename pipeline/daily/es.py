"""Spain — Geoportal de Gasolineras (Ministerio para la Transición Ecológica).

The nationwide endpoint returns one 12 MB document, and the server trickles it
out at around 15 kB/s — a quarter of an hour for a single request, which is not
something a daily job can lean on. The per-province endpoints serve the same
data in 52 pieces at the same rate each, so fetching them concurrently gets the
whole country in a few minutes. A province that fails is reported and skipped
rather than failing the country.

Decimals are written with a comma.
"""

from __future__ import annotations

import datetime as dt
import logging
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout, as_completed

import ssl

import requests
from requests.adapters import HTTPAdapter
from urllib3.poolmanager import PoolManager
from urllib3.util.retry import Retry

from pipeline.daily.base import DailyPrices, parse_decimal

log = logging.getLogger(__name__)

BASE = (
    "https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes"
)
PROVINCES_URL = f"{BASE}/Listados/Provincias/"
PROVINCE_URL = f"{BASE}/EstacionesTerrestres/FiltroProvincia/{{id}}"

#: Connect timeout, then read timeout — the body arrives slowly by design.
TIMEOUTS = (30, 120)
WORKERS = 6

#: Wall-clock budget for the whole country. The portal has bad days on which a
#: request neither fails nor finishes; without a ceiling the run sits there
#: indefinitely, which is no good in a script someone runs by hand. Whatever has
#: arrived by then is used, and the shortfall is reported. Requests already in
#: flight cannot be interrupted, so the real ceiling is the budget plus one read
#: timeout — about seven minutes in the worst case.
BUDGET_SECONDS = 300

FIELDS = {
    "Precio Gasolina 95 E5": "euro95",
    "Precio Gasoleo A": "diesel",
    "Precio Gases licuados del petróleo": "lpg",
}


class Spain:
    country = "ES"
    name = "Geoportal de Gasolineras (MITECO)"
    minimum_stations = 8000

    def fetch(self) -> DailyPrices:
        session = _session()
        provinces = _provinces(session)
        prices = DailyPrices(country=self.country, date=dt.date.today(), source=self.name)
        failures: list[str] = []
        reported: dt.date | None = None

        started = time.monotonic()
        with ThreadPoolExecutor(max_workers=WORKERS) as pool:
            futures = {
                pool.submit(_province, session, code): code for code in provinces
            }
            try:
                for future in as_completed(futures, timeout=BUDGET_SECONDS):
                    code = futures[future]
                    try:
                        payload = future.result()
                    except Exception as error:
                        failures.append(f"{code}: {type(error).__name__}")
                        continue
                    reported = reported or _report_date(payload.get("Fecha", ""))
                    for station in payload.get("ListaEESSPrecio", []):
                        for field, product in FIELDS.items():
                            raw = station.get(field)
                            if not raw:
                                continue
                            value = parse_decimal(str(raw))
                            if value is not None:
                                prices.add(product, value)
            except FuturesTimeout:
                outstanding = [code for future, code in futures.items() if not future.done()]
                failures.extend(f"{code}: budget" for code in outstanding)
                log.warning(
                    "ES: %.0fs budget spent, %d provinces still outstanding",
                    time.monotonic() - started,
                    len(outstanding),
                )
                for future in futures:
                    future.cancel()

        if failures:
            log.warning("ES: %d of %d provinces failed: %s", len(failures), len(provinces), failures[:5])
        if len(failures) > len(provinces) // 4:
            raise RuntimeError(f"ES: {len(failures)} of {len(provinces)} provinces failed")
        if reported:
            prices.date = reported
        return prices


class _LegacyTlsAdapter(HTTPAdapter):
    """Talks to a server that modern OpenSSL defaults refuse.

    The Geoportal's TLS stack fails the handshake outright under Python's
    default context — ``UNEXPECTED_EOF_WHILE_READING`` — while curl, with its
    more permissive defaults, connects fine. Re-enabling legacy renegotiation
    and dropping the cipher security level to 1 makes the handshake succeed.

    Certificate verification stays on; what is relaxed is the cipher floor, and
    only for this one host, which serves public read-only price data.
    """

    def __init__(self, context: ssl.SSLContext, **kwargs) -> None:
        self._context = context
        super().__init__(**kwargs)

    def init_poolmanager(self, connections, maxsize, block=False, **kwargs):  # type: ignore[override]
        self.poolmanager = PoolManager(
            num_pools=connections,
            maxsize=maxsize,
            block=block,
            ssl_context=self._context,
            **kwargs,
        )


def _session() -> requests.Session:
    """A session tuned to this server: legacy TLS, plus retries.

    Beyond the handshake, the server also drops connections under load and
    times out on the larger provinces. Both are transient, so every call is
    retried with a backoff.
    """
    context = ssl.create_default_context()
    context.options |= getattr(ssl, "OP_LEGACY_SERVER_CONNECT", 0x4)
    try:
        context.set_ciphers("DEFAULT@SECLEVEL=1")
    except ssl.SSLError:  # already permissive enough on this build
        pass

    session = requests.Session()
    retry = Retry(
        total=4,
        backoff_factor=1.5,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset({"GET"}),
    )
    session.mount(
        "https://",
        _LegacyTlsAdapter(context, max_retries=retry, pool_maxsize=WORKERS),
    )
    return session


def _provinces(session: requests.Session) -> list[str]:
    response = session.get(PROVINCES_URL, timeout=TIMEOUTS)
    response.raise_for_status()
    codes = [entry["IDPovincia"] for entry in response.json() if entry.get("IDPovincia")]
    if len(codes) < 40:
        raise ValueError(f"{PROVINCES_URL}: only {len(codes)} provinces listed")
    return codes


def _province(session: requests.Session, code: str) -> dict:
    response = session.get(PROVINCE_URL.format(id=code), timeout=TIMEOUTS)
    response.raise_for_status()
    return response.json()


def _report_date(raw: str) -> dt.date:
    """``'20/09/2026 10:04:01'`` -> date; today if the field is missing."""
    token = raw.strip().split(" ")[0]
    try:
        return dt.datetime.strptime(token, "%d/%m/%Y").date()
    except ValueError:
        return dt.date.today()

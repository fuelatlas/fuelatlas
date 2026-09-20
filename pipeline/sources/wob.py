"""Reader for the European Commission's Weekly Oil Bulletin.

The Commission publishes four workbooks behind stable document UUIDs. The
``filename`` query parameter their website appends is a stale label — the
document node itself always serves the current week, so the UUID is all we
store.

Three of them are tiny (current week), the history workbook is ~4.5 MB and
covers every week since 2005 plus the exchange rates and the full history of
tax rate changes.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import logging
from dataclasses import dataclass, field
from pathlib import Path

import openpyxl
import requests

from pipeline.mapping import AGGREGATE_ROWS, COUNTRY_BY_NAME, PRODUCTS

log = logging.getLogger(__name__)

BASE = "https://energy.ec.europa.eu/document/download/"

FILES: dict[str, str] = {
    "with_tax": "264c2d0f-f161-4ea3-a777-78faae59bea0_en",
    "wo_tax": "78311f92-68f8-4b82-b5cf-1293beeaae77_en",
    "duties": "ccdc6e96-6792-40cb-b0b4-b6609f1e30d0_en",
    "history": "906e60ca-8b6a-44e7-8589-652854d2fd3f_en",
}

#: Sheet name -> key used downstream, for both the weekly and the history workbook.
RATE_SHEETS = {
    "VAT": "vat",
    "Excise duties": "excise",
    "Other Indirect Taxes": "other",
}

USER_AGENT = (
    "eu-fuel-price-map/0.1 (+https://github.com/; static site build; contact via repo)"
)


class ParseError(RuntimeError):
    """Raised when a workbook no longer looks the way we expect.

    Deliberately fatal: silently publishing misread numbers would be worse than
    a red build with yesterday's data still online.
    """


# --- download -----------------------------------------------------------------


def download(name: str, cache_dir: Path, *, force: bool = False) -> Path:
    """Fetch one workbook into ``cache_dir`` and return its path."""
    url = BASE + FILES[name]
    cache_dir.mkdir(parents=True, exist_ok=True)
    target = cache_dir / f"{name}.xlsx"
    if target.exists() and not force:
        log.info("using cached %s", target)
        return target
    log.info("downloading %s", url)
    resp = requests.get(url, timeout=180, headers={"User-Agent": USER_AGENT})
    resp.raise_for_status()
    ctype = resp.headers.get("content-type", "")
    if "spreadsheet" not in ctype and not resp.content.startswith(b"PK"):
        raise ParseError(f"{name}: expected an xlsx, got content-type {ctype!r}")
    target.write_bytes(resp.content)
    log.info("  %s -> %s (%.1f kB)", name, target, len(resp.content) / 1024)
    return target


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


# --- shared helpers -----------------------------------------------------------

EXCEL_EPOCH = dt.date(1899, 12, 30)


def as_date(value: object) -> dt.date | None:
    """Excel serial number or datetime -> date."""
    if isinstance(value, dt.datetime):
        return value.date()
    if isinstance(value, dt.date):
        return value
    if isinstance(value, (int, float)) and value > 20000:
        return EXCEL_EPOCH + dt.timedelta(days=int(value))
    return None


def as_float(value: object) -> float | None:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    if isinstance(value, str):
        text = value.strip().replace(",", ".")
        try:
            return float(text)
        except ValueError:
            return None
    return None


def _country_code(raw: object) -> str | None:
    """``'AT_'`` or ``'AT'`` -> ``'AT'``; aggregates and blanks -> ``None``."""
    if not isinstance(raw, str):
        return None
    code = raw.strip().rstrip("_").upper()
    return code if len(code) == 2 and code.isalpha() else None


# --- weekly price files -------------------------------------------------------


@dataclass
class WeeklyPrices:
    date: dt.date
    #: ``{iso2: {product_key: EUR per 1000 l (or per t)}}``
    by_country: dict[str, dict[str, float]] = field(default_factory=dict)
    #: ``{"EU27"|"EA20": {product_key: value}}`` — Commission-weighted, copied as is.
    aggregates: dict[str, dict[str, float]] = field(default_factory=dict)


def load_weekly_prices(path: Path) -> WeeklyPrices:
    """Parse ``prices with taxes`` / ``prices without taxes``.

    Layout: row 1 product headers, ``A2`` the reference date, rows 3+ one country
    per row (English name in column A, values in B..G), and two weighted
    aggregate rows at the bottom.
    """
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    try:
        ws = wb.worksheets[0]
        rows = list(ws.iter_rows(values_only=True))
    finally:
        wb.close()

    if len(rows) < 10:
        raise ParseError(f"{path.name}: only {len(rows)} rows, expected ~31")

    date = as_date(rows[1][0])
    if date is None:
        raise ParseError(f"{path.name}: no reference date in A2 (found {rows[1][0]!r})")

    out = WeeklyPrices(date=date)
    for row in rows[2:]:
        label = row[0]
        if not isinstance(label, str):
            continue
        label = label.strip()
        values = {}
        for product in PRODUCTS:
            value = as_float(row[1 + product.column]) if len(row) > 1 + product.column else None
            if value is not None and value > 0:
                values[product.key] = value
        if not values:
            continue
        if label in COUNTRY_BY_NAME:
            out.by_country[COUNTRY_BY_NAME[label]] = values
        else:
            for marker, key in AGGREGATE_ROWS.items():
                if marker in label:
                    out.aggregates[key] = values
                    break

    missing = set(COUNTRY_BY_NAME.values()) - set(out.by_country)
    if missing:
        raise ParseError(f"{path.name}: no prices for {sorted(missing)}")
    return out


# --- tax rate files -----------------------------------------------------------


@dataclass(frozen=True)
class RateSet:
    """Tax rates of one country, in force since ``since``.

    ``vat`` values are percentages; ``excise`` and ``other`` are amounts in the
    country's own currency per 1000 l (or per tonne for heavy fuel oil).
    """

    since: dt.date | None
    values: dict[str, float]


def _read_rate_sheet(ws, *, history: bool) -> dict[str, list[RateSet]]:
    """Rows of ``CTR | since | values...`` -> ``{iso2: [RateSet, ...]}``.

    The weekly workbook holds one row per country, the history workbook one row
    per rate change; both are read the same way and sorted oldest first.
    """
    out: dict[str, list[RateSet]] = {}
    code: str | None = None
    for row in ws.iter_rows(values_only=True):
        if not row:
            continue
        # The country code sits in a merged cell spanning every rate change of
        # that country, so openpyxl reports it only on the first of the rows.
        code = _country_code(row[0]) or (code if history else None)
        if code is None:
            continue
        since = as_date(row[1]) if len(row) > 1 else None
        if history and since is None:
            continue  # header or spacer row inside the block
        values = {}
        for product in PRODUCTS:
            col = 2 + product.column  # A=CTR, B=since, C.. = products
            value = as_float(row[col]) if len(row) > col else None
            if value is not None:
                values[product.key] = value
        if values:
            out.setdefault(code, []).append(RateSet(since=since, values=values))
    for entries in out.values():
        entries.sort(key=lambda r: r.since or dt.date.min)
    if not history:
        for code, entries in out.items():
            if len(entries) != 1:
                raise ParseError(f"weekly rate sheet: {code} has {len(entries)} rows, expected 1")
    return out


def load_duties(path: Path) -> dict[str, dict[str, RateSet]]:
    """Current VAT / excise / other-levy rates -> ``{kind: {iso2: RateSet}}``."""
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    try:
        out: dict[str, dict[str, RateSet]] = {}
        for sheet_name, key in RATE_SHEETS.items():
            if sheet_name not in wb.sheetnames:
                raise ParseError(f"{path.name}: sheet {sheet_name!r} missing")
            per_country = _read_rate_sheet(wb[sheet_name], history=False)
            out[key] = {code: entries[0] for code, entries in per_country.items()}
    finally:
        wb.close()

    for key in RATE_SHEETS.values():
        missing = set(COUNTRY_BY_NAME.values()) - set(out[key])
        if missing:
            raise ParseError(f"{path.name}: {key} missing for {sorted(missing)}")
    return out


# --- history workbook ---------------------------------------------------------


@dataclass
class History:
    #: ``{iso2: {date: {product: {"with_tax": v, "wo_tax": v}}}}``, EUR per unit.
    prices: dict[str, dict[dt.date, dict[str, dict[str, float]]]]
    #: ``{iso2: {date: units of national currency per EUR}}``
    fx: dict[str, dict[dt.date, float]]
    #: ``{kind: {iso2: [RateSet, ...]}}`` sorted oldest first.
    rates: dict[str, dict[str, list[RateSet]]]


_SERIES_SUFFIX = {"price_with_tax": "with_tax", "price_wo_tax": "wo_tax"}
#: History headers spell products slightly differently from our keys.
_HISTORY_PRODUCT = {
    "euro95": "euro95",
    "diesel": "diesel",
    "heating_oil": "heating_oil",
    "fuel_oil_1": "fuel_oil_ls",
    "fuel_oil_2": "fuel_oil_hs",
    "lpg": "lpg",
}


def _parse_header(header: object) -> tuple[str, str, str] | None:
    """``'DE_price_with_tax_euro95'`` -> ``('DE', 'with_tax', 'euro95')``."""
    if not isinstance(header, str) or "_" not in header:
        return None
    code, _, rest = header.partition("_")
    code = code.upper()
    if len(code) != 2 or not code.isalpha():
        return None  # EU_ / EUR_ aggregates
    rest_lower = rest.lower()
    for prefix, series in _SERIES_SUFFIX.items():
        if rest_lower.startswith(prefix + "_"):
            product = _HISTORY_PRODUCT.get(rest_lower[len(prefix) + 1 :])
            if product:
                return code, series, product
    return None


def _load_history_price_sheet(ws, prices, fx) -> None:
    rows = ws.iter_rows(values_only=True)
    header = next(rows)
    columns: dict[int, tuple[str, str, str]] = {}
    fx_columns: dict[int, str] = {}
    for idx, cell in enumerate(header):
        parsed = _parse_header(cell)
        if parsed:
            columns[idx] = parsed
        elif isinstance(cell, str) and cell.lower().endswith("_exchange_rate"):
            code = _country_code(cell.split("_")[0])
            if code:
                fx_columns[idx] = code
    if not columns:
        raise ParseError("history: no recognisable price columns in header row")

    for row in rows:
        date = as_date(row[0]) if row else None
        if date is None:
            continue
        for idx, code in fx_columns.items():
            rate = as_float(row[idx]) if len(row) > idx else None
            if rate and rate > 0:
                fx.setdefault(code, {})[date] = rate
        for idx, (code, series, product) in columns.items():
            value = as_float(row[idx]) if len(row) > idx else None
            if value is None or value <= 0:
                continue
            prices.setdefault(code, {}).setdefault(date, {}).setdefault(product, {})[series] = value


def load_history(path: Path) -> History:
    """Parse the 2005-onwards workbook (prices, exchange rates, rate changes)."""
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    try:
        prices: dict[str, dict[dt.date, dict[str, dict[str, float]]]] = {}
        fx: dict[str, dict[dt.date, float]] = {}
        for sheet_name in ("Prices with taxes", "Prices wo taxes"):
            if sheet_name not in wb.sheetnames:
                raise ParseError(f"history: sheet {sheet_name!r} missing")
            _load_history_price_sheet(wb[sheet_name], prices, fx)

        rates: dict[str, dict[str, list[RateSet]]] = {}
        for sheet_name, key in RATE_SHEETS.items():
            if sheet_name not in wb.sheetnames:
                raise ParseError(f"history: sheet {sheet_name!r} missing")
            rates[key] = _read_rate_sheet(wb[sheet_name], history=True)
    finally:
        wb.close()

    if len(prices) < 20:
        raise ParseError(f"history: only {len(prices)} countries parsed")
    return History(prices=prices, fx=fx, rates=rates)


def rates_at(entries: list[RateSet], date: dt.date) -> dict[str, float]:
    """Rates in force on ``date``, merged forward per product.

    A row only lists the products whose rate actually changed, so a product
    keeps its previous value until a later row overrides it.
    """
    merged: dict[str, float] = {}
    for entry in entries:
        if entry.since is not None and entry.since > date:
            break
        merged.update(entry.values)
    return merged

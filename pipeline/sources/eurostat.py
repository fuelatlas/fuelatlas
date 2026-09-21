"""Median equivalised disposable income per country, from Eurostat.

Used to express a fuel price as a share of what people actually have to spend.
The figure is the EU-SILC median equivalised disposable income (``ilc_di03``):
household income after taxes and transfers, adjusted for household size. It is
not a wage — it is what a household has at its disposal — which is the right
denominator for "how much does filling up hurt".

The United Kingdom is deliberately absent: Eurostat still lists it as a
territory but stopped publishing values for it, so it carries no burden figure
and the map leaves it blank.
"""

from __future__ import annotations

import logging

import requests

log = logging.getLogger(__name__)

URL = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/ilc_di03"

#: Median (not mean — a handful of high incomes should not move a national
#: figure), both sexes, all ages, in euro so it divides into a euro price.
PARAMS = {
    "format": "JSON",
    "lang": "en",
    "lastTimePeriod": "1",
    "statinfo": "MED_EI",
    "sex": "T",
    "age": "TOTAL",
    "unit": "EUR",
}

#: Eurostat spells two of the bulletin's countries differently.
FROM_EUROSTAT = {"EL": "GR", "UK": "GB"}

#: Below this many countries something is wrong with the query, not with the
#: data — fail loudly rather than publish a map with three values on it.
MIN_COUNTRIES = 20


def median_income() -> tuple[dict[str, float], str]:
    """``({country: euro per year}, reference year)``.

    Keys use the same country codes as the rest of the pipeline.
    """
    log.info("downloading %s", URL)
    response = requests.get(URL, params=PARAMS, timeout=120)
    response.raise_for_status()
    payload = response.json()
    if "dimension" not in payload:
        raise ValueError(f"{URL}: unexpected response {payload!r:.200}")

    geo = payload["dimension"]["geo"]["category"]["index"]
    by_position = {position: code for code, position in geo.items()}
    year = next(iter(payload["dimension"]["time"]["category"]["index"]))

    # Every dimension but geo is pinned to one value, so the flat JSON-stat
    # index is the position within geo.
    out: dict[str, float] = {}
    for position, value in payload["value"].items():
        code = by_position.get(int(position))
        if code is None or value is None:
            continue
        code = FROM_EUROSTAT.get(code, code)
        if len(code) == 2:  # skip EU, EA and other aggregates
            out[code] = float(value)

    if len(out) < MIN_COUNTRIES:
        raise ValueError(f"{URL}: only {len(out)} countries, expected at least {MIN_COUNTRIES}")
    log.info("  income -> %d countries, reference year %s", len(out), year)
    return out, year

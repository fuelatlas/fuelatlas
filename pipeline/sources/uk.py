"""United Kingdom — DESNZ weekly road fuel prices.

The UK left the Oil Bulletin with Brexit (its series there stops on
2020-12-21), but the Department for Energy Security and Net Zero publishes the
same thing nationally: a weekly UK-wide weighted average pump price together
with the statutory duty rate and the VAT rate, on the same Monday reference day
the Commission uses. Covers about 90 % of retail volume. Open Government
Licence v3.0.

Unlike the Commission's tax tables, the duty here is the statutory rate
published alongside the price in the same file, so the net price is derived
exactly rather than reconciled.
"""

from __future__ import annotations

import csv
import datetime as dt
import io
import logging
import re

import requests

from pipeline.sources.wob import USER_AGENT, ParseError

log = logging.getLogger(__name__)

PAGE = "https://www.gov.uk/government/statistics/weekly-road-fuel-prices"

#: The publication ships two CSVs — an archive and the current one from 2018 on.
CURRENT_CSV = re.compile(
    r"https://assets\.publishing\.service\.gov\.uk/media/[0-9a-f]+/CSV[^\"']*\.csv"
)

#: Column header fragments -> (product, field). The headers are verbose and have
#: been reworded before, so they are matched on their distinctive parts.
COLUMNS: dict[tuple[str, str], tuple[str, str]] = {
    ("ulsp", "pump price"): ("euro95", "gross"),
    ("ulsd", "pump price"): ("diesel", "gross"),
    ("ulsp", "duty rate"): ("euro95", "duty"),
    ("ulsd", "duty rate"): ("diesel", "duty"),
    ("ulsp", "vat"): ("euro95", "vat_rate"),
    ("ulsd", "vat"): ("diesel", "vat_rate"),
}


def csv_url() -> str:
    """Find the current CSV — its URL carries a content hash that changes."""
    response = requests.get(PAGE, timeout=120, headers={"User-Agent": USER_AGENT})
    response.raise_for_status()
    matches = CURRENT_CSV.findall(response.text)
    if not matches:
        raise ParseError(f"{PAGE}: no current CSV link found")
    return matches[0]


def _map_columns(header: list[str]) -> dict[int, tuple[str, str]]:
    mapping: dict[int, tuple[str, str]] = {}
    for index, name in enumerate(header):
        lowered = name.lower()
        for (fuel, field), target in COLUMNS.items():
            if fuel in lowered and field in lowered:
                mapping[index] = target
                break
    missing = set(COLUMNS.values()) - set(mapping.values())
    if missing:
        raise ParseError(f"UK CSV: columns missing for {sorted(missing)}")
    return mapping


def load(url: str | None = None) -> dict[dt.date, dict[str, dict[str, float]]]:
    """``{date: {product: {"gross": pence/l, "duty": pence/l, "vat_rate": %}}}``."""
    url = url or csv_url()
    response = requests.get(url, timeout=180, headers={"User-Agent": USER_AGENT})
    response.raise_for_status()

    reader = csv.reader(io.StringIO(response.content.decode("utf-8-sig")))
    header = next(reader)
    mapping = _map_columns(header)

    out: dict[dt.date, dict[str, dict[str, float]]] = {}
    for row in reader:
        if not row or not row[0].strip():
            continue
        try:
            date = dt.datetime.strptime(row[0].strip(), "%d/%m/%Y").date()
        except ValueError:
            continue
        week: dict[str, dict[str, float]] = {}
        for index, (product, field) in mapping.items():
            if index >= len(row):
                continue
            raw = row[index].strip()
            if not raw:
                continue
            try:
                week.setdefault(product, {})[field] = float(raw)
            except ValueError:
                continue
        complete = {
            product: values
            for product, values in week.items()
            if {"gross", "duty", "vat_rate"} <= set(values)
        }
        if complete:
            out[date] = complete

    if len(out) < 100:
        raise ParseError(f"UK CSV: only {len(out)} weeks parsed")
    return out

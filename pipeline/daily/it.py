"""Italy — Osservaprezzi Carburanti (MIMIT), published every morning at 08:00.

Pipe-separated, with the extraction date on line 1 and a header on line 2. Only
the generic grades are counted: the file also carries branded premium diesels
(Blue Diesel, HVOlution, Hi-Q) whose prices would inflate a national average.
"""

from __future__ import annotations

import datetime as dt
import logging

import requests

from pipeline.daily.base import TIMEOUT, DailyPrices, parse_decimal

log = logging.getLogger(__name__)

URL = "https://www.mimit.gov.it/images/exportCSV/prezzo_alle_8.csv"

PRODUCTS = {"Benzina": "euro95", "Gasolio": "diesel", "GPL": "lpg"}


class Italy:
    country = "IT"
    name = "Osservaprezzi Carburanti (MIMIT)"
    minimum_stations = 15000

    def fetch(self) -> DailyPrices:
        response = requests.get(URL, timeout=TIMEOUT)
        response.raise_for_status()
        lines = response.text.splitlines()
        if len(lines) < 3 or not lines[0].lower().startswith("estrazione"):
            raise ValueError(f"{URL}: unexpected header {lines[:1]}")

        date = _extraction_date(lines[0])
        prices = DailyPrices(country=self.country, date=date, source=self.name)

        # Each station reports the same grade twice, self-service and attended,
        # and attended runs some 30 cents dearer. One price per station and
        # grade, self-service preferred — that is the price on the roadside sign.
        best: dict[tuple[str, str], tuple[bool, float]] = {}
        for line in lines[2:]:
            fields = line.split("|")
            if len(fields) < 4:
                continue
            station, fuel, raw, is_self = fields[0], fields[1].strip(), fields[2], fields[3].strip()
            product = PRODUCTS.get(fuel)
            value = parse_decimal(raw)
            if product is None or value is None:
                continue
            key = (station, product)
            self_service = is_self == "1"
            current = best.get(key)
            if current is None or (self_service and not current[0]):
                best[key] = (self_service, value)

        for (_, product), (_, value) in best.items():
            prices.add(product, value)
        return prices


def _extraction_date(header: str) -> dt.date:
    token = header.split()[-1]
    return dt.date.fromisoformat(token)

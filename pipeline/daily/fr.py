"""France — prix-carburants.gouv.fr, the live feed on data.economie.gouv.fr.

Every station's current price, refreshed continuously. The bulk export endpoint
returns the whole file in one request; the paginated records endpoint would
need a hundred.
"""

from __future__ import annotations

import datetime as dt
import logging

import requests

from pipeline.daily.base import TIMEOUT, DailyPrices, parse_decimal

log = logging.getLogger(__name__)

DATASET = "prix-des-carburants-en-france-flux-instantane-v2"
URL = f"https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/{DATASET}/exports/json"

#: E10 rather than pure SP95: both are 95-octane, but only about 2 800 French
#: stations still sell SP95 against 8 700 selling E10, so SP95 would sample a
#: specialty grade instead of the national average.
FIELDS = {"e10_prix": "euro95", "gazole_prix": "diesel", "gplc_prix": "lpg"}


class France:
    country = "FR"
    name = "prix-carburants.gouv.fr"
    minimum_stations = 7000

    def fetch(self) -> DailyPrices:
        response = requests.get(
            URL,
            params={"select": ",".join(FIELDS)},
            timeout=TIMEOUT,
            headers={"Accept": "application/json"},
        )
        response.raise_for_status()
        rows = response.json()
        if not isinstance(rows, list) or not rows:
            raise ValueError(f"{URL}: expected a list of stations, got {type(rows).__name__}")

        prices = DailyPrices(country=self.country, date=dt.date.today(), source=self.name)
        for row in rows:
            for field, product in FIELDS.items():
                raw = row.get(field)
                if raw in (None, ""):
                    continue
                value = parse_decimal(str(raw))
                if value is not None:
                    prices.add(product, value)
        return prices

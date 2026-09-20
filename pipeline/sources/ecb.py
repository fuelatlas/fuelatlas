"""Euro reference exchange rates from the ECB.

Needed only for sources outside the euro area that the Oil Bulletin does not
cover — the bulletin carries its own rates for its own countries, and those are
used there so the conversion matches the Commission's published figures.
"""

from __future__ import annotations

import datetime as dt
import logging
from xml.etree import ElementTree as ET

import requests

log = logging.getLogger(__name__)

#: Every daily rate since 1999. The 90-day file would cover the current week but
#: not the UK's series back to 2018.
URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.xml"

NS = {"ecb": "http://www.ecb.int/vocabulary/2002-08-01/eurofxref"}


def daily_rates() -> dict[dt.date, dict[str, float]]:
    """``{date: {currency: units of that currency per EUR}}``."""
    response = requests.get(URL, timeout=120)
    response.raise_for_status()
    root = ET.fromstring(response.content)

    out: dict[dt.date, dict[str, float]] = {}
    for day in root.iter("{http://www.ecb.int/vocabulary/2002-08-01/eurofxref}Cube"):
        time = day.get("time")
        if not time:
            continue
        rates = {}
        for entry in day:
            currency, rate = entry.get("currency"), entry.get("rate")
            if currency and rate:
                rates[currency] = float(rate)
        if rates:
            out[dt.date.fromisoformat(time)] = rates
    if not out:
        raise ValueError(f"{URL}: no rates parsed")
    return out


def rate_on(rates: dict[dt.date, dict[str, float]], currency: str, date: dt.date) -> float:
    """Rate for ``date``, or the most recent one before it (weekends, holidays)."""
    for offset in range(0, 10):
        day = rates.get(date - dt.timedelta(days=offset))
        if day and currency in day:
            return day[currency]
    raise LookupError(f"no {currency} rate within 10 days of {date}")

"""Shared contract for the national daily price sources.

The weekly bulletin is a consumption-weighted average collected by each member
state; these are ungrouped station prices scraped from national price portals.
The two are never mixed into one series — a daily figure only ever answers
"what are pumps charging today", next to the weekly number, never inside it.
"""

from __future__ import annotations

import datetime as dt
import logging
import statistics
from dataclasses import dataclass, field
from typing import Protocol

log = logging.getLogger(__name__)

#: Anything outside this band is a data-entry error, not a price (EUR per litre).
PLAUSIBLE = (0.30, 4.50)

#: Fraction trimmed from each tail before averaging. Portals carry stale entries
#: and the odd cent-priced typo; a 5 % trim removes them without a judgement call.
TRIM = 0.05

TIMEOUT = 180


@dataclass
class DailyPrices:
    """Raw per-station prices for one country on one day, in EUR per litre."""

    country: str
    date: dt.date
    source: str
    by_product: dict[str, list[float]] = field(default_factory=dict)

    def add(self, product: str, price: float) -> None:
        if PLAUSIBLE[0] <= price <= PLAUSIBLE[1]:
            self.by_product.setdefault(product, []).append(price)


class Adapter(Protocol):
    country: str
    name: str
    #: Below this many stations the sample is not a national average.
    minimum_stations: int

    def fetch(self) -> DailyPrices: ...


@dataclass
class Aggregate:
    mean: float  # trimmed mean, EUR per 1000 l
    median: float
    stations: int


def aggregate(prices: list[float]) -> Aggregate | None:
    """Trimmed mean, median and sample size — all in EUR per 1000 l."""
    if len(prices) < 3:
        return None
    ordered = sorted(prices)
    cut = int(len(ordered) * TRIM)
    trimmed = ordered[cut : len(ordered) - cut] or ordered
    return Aggregate(
        mean=statistics.fmean(trimmed) * 1000,
        median=statistics.median(ordered) * 1000,
        stations=len(prices),
    )


def parse_decimal(raw: str) -> float | None:
    """Portals disagree on the decimal separator; accept either."""
    text = raw.strip().replace(",", ".")
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None

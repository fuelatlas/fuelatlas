"""Aggregation rules for the daily station feeds."""

from __future__ import annotations

import pytest

from pipeline.daily.base import DailyPrices, aggregate, parse_decimal
from pipeline.daily.it import Italy

import datetime as dt


def test_trimmed_mean_ignores_the_tails():
    """A portal's stale cent-priced entries must not drag the average down."""
    prices = [1.70] * 98 + [0.01, 9.99]

    result = aggregate(prices)

    assert result is not None
    assert result.mean == pytest.approx(1700.0, abs=1.0)
    assert result.median == pytest.approx(1700.0, abs=1.0)
    assert result.stations == 100


def test_implausible_prices_never_enter_the_sample():
    prices = DailyPrices(country="XX", date=dt.date(2026, 9, 18), source="test")
    for value in (1.85, 0.02, 12.0, 2.10):
        prices.add("euro95", value)

    assert prices.by_product["euro95"] == [1.85, 2.10]


def test_too_few_prices_is_not_an_average():
    assert aggregate([1.7, 1.8]) is None


def test_decimal_comma_and_point_both_parse():
    assert parse_decimal("1,869") == 1.869
    assert parse_decimal("1.869") == 1.869
    assert parse_decimal("") is None
    assert parse_decimal("n/a") is None


def test_italy_keeps_one_price_per_station_preferring_self_service():
    """Attended service runs ~30 cents dearer and would skew the mean."""
    lines = [
        "Estrazione del 2026-09-18",
        "idImpianto|descCarburante|prezzo|isSelf|dtComu",
        "1|Benzina|2.459|0|17/09/2026 20:00:13",  # attended
        "1|Benzina|2.159|1|17/09/2026 20:00:12",  # self-service, wins
        "2|Benzina|2.199|1|17/09/2026 20:00:12",
        "3|Benzina|2.399|0|17/09/2026 20:00:12",  # attended only, still counted
        "3|Blue Diesel|2.999|1|17/09/2026 20:00:12",  # branded grade, ignored
    ]
    prices = _parse(lines)

    assert sorted(prices.by_product["euro95"]) == [2.159, 2.199, 2.399]
    assert "Blue Diesel" not in prices.by_product


def _parse(lines: list[str]) -> DailyPrices:
    """Run Italy's parser over canned lines, without touching the network."""
    import types

    adapter = Italy()
    fake = types.SimpleNamespace(text="\n".join(lines), raise_for_status=lambda: None)
    import pipeline.daily.it as module

    original = module.requests.get
    module.requests.get = lambda *a, **k: fake  # type: ignore[assignment]
    try:
        return adapter.fetch()
    finally:
        module.requests.get = original  # type: ignore[assignment]

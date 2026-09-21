"""The Eurostat income reader and the JSON-stat shape it has to survive."""

from __future__ import annotations

import pytest
import requests

from pipeline.sources import eurostat


class _Response:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        pass

    def json(self):
        return self._payload


def _payload(countries: dict[str, float], year: str = "2025") -> dict:
    """A JSON-stat reply with every dimension but geo pinned to one value."""
    index = {code: position for position, code in enumerate(countries)}
    return {
        "dimension": {
            "geo": {"category": {"index": index}},
            "time": {"category": {"index": {year: 0}}},
        },
        "value": {str(index[code]): value for code, value in countries.items()},
    }


@pytest.fixture
def served(monkeypatch):
    def serve(payload):
        monkeypatch.setattr(requests, "get", lambda *a, **k: _Response(payload))

    return serve


#: Filler with real two-letter codes — three-letter ones would be dropped as
#: aggregates and the reply would fall below the minimum.
FILLER = ["AT", "BE", "BG", "CY", "CZ", "DK", "EE", "ES", "FI", "FR",
          "HR", "HU", "IE", "IT", "LT", "LU", "LV", "NL", "PL", "PT"]


def _twenty_countries() -> dict[str, float]:
    return {code: 10000.0 + n for n, code in enumerate(FILLER)}


def test_reads_income_per_country(served):
    served(_payload({**_twenty_countries(), "DE": 28891.0}))

    income, year = eurostat.median_income()

    assert income["DE"] == 28891.0
    assert year == "2025"


def test_renames_the_two_codes_that_differ_from_the_bulletin(served):
    served(_payload({**_twenty_countries(), "EL": 13612.0, "UK": 25000.0}))

    income, _ = eurostat.median_income()

    assert income["GR"] == 13612.0
    assert "EL" not in income
    assert income["GB"] == 25000.0


def test_drops_aggregates_like_eu27(served):
    served(_payload({**_twenty_countries(), "EU27_2020": 20000.0, "EA20": 21000.0}))

    income, _ = eurostat.median_income()

    assert "EU27_2020" not in income
    assert "EA20" not in income


def test_skips_countries_without_a_value(served):
    payload = _payload({**_twenty_countries(), "MT": 22034.0})
    payload["value"][str(len(payload["dimension"]["geo"]["category"]["index"]) - 1)] = None
    served(payload)

    income, _ = eurostat.median_income()

    assert "MT" not in income


def test_rejects_a_reply_with_too_few_countries(served):
    served(_payload({"DE": 28891.0, "FR": 25000.0}))

    with pytest.raises(ValueError, match="expected at least"):
        eurostat.median_income()


def test_rejects_a_reply_that_is_not_json_stat(served):
    served({"error": [{"status": 400, "label": "INVALID_QUERY_DIMENSION"}]})

    with pytest.raises(ValueError, match="unexpected response"):
        eurostat.median_income()

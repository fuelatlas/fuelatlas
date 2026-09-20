"""The DESNZ reader, including the headers it has to survive."""

from __future__ import annotations

import datetime as dt

import pytest
import requests

from pipeline.model import build_from_duty
from pipeline.sources import uk
from pipeline.sources.wob import ParseError

HEADER = (
    "Date,"
    "ULSP (Ultra low sulphur unleaded petrol) Pump price in pence/litre,"
    "ULSD (Ultra low sulphur diesel) Pump price in pence/litre,"
    "ULSP (Ultra low sulphur unleaded petrol) Duty rate in pence/litre,"
    "ULSD (Ultra low sulphur diesel) Duty rate in pence/litre,"
    "ULSP (Ultra low sulphur unleaded petrol) VAT percentage rate,"
    "ULSD (Ultra low sulphur diesel) VAT percentage rate"
)


def _csv(rows: list[str]) -> str:
    return "\n".join([HEADER, *rows])


def _weekly_rows(count: int = 120) -> list[str]:
    """Distinct Mondays, so the reader sees a real series rather than repeats."""
    start = dt.date(2024, 1, 1)
    return [
        f"{(start + dt.timedelta(weeks=index)).strftime('%d/%m/%Y')}"
        ",168.14,190.72,52.95,52.95,20,20"
        for index in range(count)
    ]


class _Response:
    def __init__(self, text: str) -> None:
        self.content = text.encode("utf-8")

    def raise_for_status(self) -> None:
        pass


@pytest.fixture
def served(monkeypatch):
    def serve(text: str):
        monkeypatch.setattr(requests, "get", lambda *a, **k: _Response(text))
    return serve


def test_reads_price_duty_and_vat_per_week(served):
    served(_csv([*_weekly_rows(), "14/09/2026,168.14,190.72,52.95,52.95,20,20"]))

    weeks = uk.load("http://example.invalid/fuel.csv")

    assert dt.date(2026, 9, 14) in weeks
    assert weeks[dt.date(2026, 9, 14)]["euro95"] == {
        "gross": 168.14,
        "duty": 52.95,
        "vat_rate": 20.0,
    }


def test_reworded_headers_still_match(served):
    """Headers are matched on their distinctive parts, not verbatim."""
    reworded = HEADER.replace("in pence/litre", "(p/litre)").replace(
        "Ultra low sulphur unleaded petrol", "unleaded petrol - ultra low sulphur"
    )
    served("\n".join([reworded, *_weekly_rows(), "14/09/2026,168.14,190.72,52.95,52.95,20,20"]))

    weeks = uk.load("http://example.invalid/fuel.csv")

    assert weeks[dt.date(2026, 9, 14)]["euro95"]["gross"] == 168.14


def test_a_missing_column_is_fatal(served):
    served("\n".join(["Date,something else", "14/09/2026,1"]))

    with pytest.raises(ParseError, match="columns missing"):
        uk.load("http://example.invalid/fuel.csv")


def test_a_truncated_file_is_fatal(served):
    served(_csv(["14/09/2026,168.14,190.72,52.95,52.95,20,20"]))

    with pytest.raises(ParseError, match="only 1 weeks"):
        uk.load("http://example.invalid/fuel.csv")


def test_uk_breakdown_is_exact():
    """Pence per litre, 2026-09-14: 168.14 pump, 52.95 duty, 20 % VAT."""
    result = build_from_duty(
        country="GB", product="euro95", date=dt.date(2026, 9, 14),
        gross=168.14, duty=52.95, vat_rate=20.0,
    )

    assert result.vat == pytest.approx(28.02, abs=0.01)
    assert result.net == pytest.approx(87.17, abs=0.01)
    assert result.net + result.tax_total == pytest.approx(168.14, abs=0.001)
    assert result.notes == []

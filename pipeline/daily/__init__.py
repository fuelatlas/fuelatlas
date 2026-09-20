"""Daily station-price adapters, one per country with an open national feed.

Only countries whose portal publishes every station are here. Austria's
E-Control API returns the five cheapest per query, which is a ranking rather
than a sample, so no national average can be built from it. Germany's MTS-K
data is available through Tankerkönig but its terms forbid passing the
datasets on — an aggregate could be published, but not from an endpoint that
serves only 25 km radius queries without a biased station sample.
"""

from __future__ import annotations

from pipeline.daily.base import Adapter
from pipeline.daily.es import Spain
from pipeline.daily.fr import France
from pipeline.daily.it import Italy

ADAPTERS: tuple[Adapter, ...] = (Italy(), France(), Spain())

/**
 * Where to put a country's label so it lands *inside* the country.
 *
 * The area-weighted centroid is the obvious choice and the wrong one: for
 * Italy it falls in the Tyrrhenian Sea, for Croatia inside Bosnia, for Denmark
 * in the Kattegat. What is wanted is the pole of inaccessibility — the interior
 * point farthest from any edge, which is also the point with the most room
 * around it for a pill.
 *
 * This is a grid search with successive refinement rather than the full
 * quadtree algorithm: at map scale the extra precision buys nothing, and the
 * whole thing runs once per country at construction.
 */

type Ring = [number, number][];

const GRID = 24;
const REFINEMENTS = 4;

/** Largest ring of a projected polygon, by bounding-box area. */
function largestRing(rings: Ring[]): Ring | null {
  let best: Ring | null = null;
  let bestArea = -1;
  for (const ring of rings) {
    if (ring.length < 4) continue;
    const xs = ring.map((point) => point[0]);
    const ys = ring.map((point) => point[1]);
    const area = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
    if (area > bestArea) {
      bestArea = area;
      best = ring;
    }
  }
  return best;
}

function pointInRing(x: number, y: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distanceToEdges(x: number, y: number, ring: Ring): number {
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    const dx = xj - xi;
    const dy = yj - yi;
    const lengthSquared = dx * dx + dy * dy;
    let t = lengthSquared ? ((x - xi) * dx + (y - yi) * dy) / lengthSquared : 0;
    t = Math.max(0, Math.min(1, t));
    const px = xi + t * dx;
    const py = yi + t * dy;
    best = Math.min(best, Math.hypot(x - px, y - py));
  }
  return best;
}

/** Projected rings of a GeoJSON geometry, as produced by a d3 path stream. */
export function ringsOf(geometry: GeoJSON.Geometry, project: (p: [number, number]) => [number, number] | null): Ring[] {
  const polygons: number[][][][] =
    geometry.type === "Polygon"
      ? [geometry.coordinates as number[][][]]
      : geometry.type === "MultiPolygon"
        ? (geometry.coordinates as number[][][][])
        : [];

  const rings: Ring[] = [];
  for (const polygon of polygons) {
    const outer = polygon[0];
    if (!outer) continue;
    const projected: Ring = [];
    for (const point of outer) {
      const mapped = project([point[0]!, point[1]!]);
      if (mapped) projected.push(mapped);
    }
    if (projected.length >= 4) rings.push(projected);
  }
  return rings;
}

/** The interior point with the most clearance, or null if none was found. */
export function labelAnchor(rings: Ring[]): [number, number] | null {
  const ring = largestRing(rings);
  if (!ring) return null;

  const xs = ring.map((point) => point[0]);
  const ys = ring.map((point) => point[1]);
  let minX = Math.min(...xs);
  let maxX = Math.max(...xs);
  let minY = Math.min(...ys);
  let maxY = Math.max(...ys);

  let best: [number, number] | null = null;
  let bestDistance = -1;

  for (let pass = 0; pass < REFINEMENTS; pass += 1) {
    const stepX = (maxX - minX) / GRID;
    const stepY = (maxY - minY) / GRID;
    if (stepX <= 0 || stepY <= 0) break;

    for (let ix = 0; ix <= GRID; ix += 1) {
      for (let iy = 0; iy <= GRID; iy += 1) {
        const x = minX + ix * stepX;
        const y = minY + iy * stepY;
        if (!pointInRing(x, y, ring)) continue;
        const distance = distanceToEdges(x, y, ring);
        if (distance > bestDistance) {
          bestDistance = distance;
          best = [x, y];
        }
      }
    }
    if (!best) return null;
    // Zoom in around the winner and search again.
    minX = best[0] - stepX;
    maxX = best[0] + stepX;
    minY = best[1] - stepY;
    maxY = best[1] + stepY;
  }
  return best;
}

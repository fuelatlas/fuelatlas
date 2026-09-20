import { geoAzimuthalEqualArea, geoPath, type GeoProjection } from "d3-geo";

import { tierColor } from "./colors";
import { labelAnchor, ringsOf } from "./label-anchor";

export interface MapCallbacks {
  onHover(country: string | null, event?: PointerEvent | FocusEvent): void;
  onSelect(country: string): void;
}

const SVG_NS = "http://www.w3.org/2000/svg";

const VIEW_WIDTH = 890;
const VIEW_HEIGHT = 760;

/**
 * Below this viewport width the map is a few hundred pixels across, and a label
 * sized for a desktop renders at about five pixels. The mobile layout uses a
 * much larger label and therefore fits far fewer of them: only countries whose
 * own outline can hold one keep it, and the rest are read from the table, which
 * opens by default at that size.
 */
const NARROW_VIEWPORT = 720;

const LABEL_FONT = { wide: 12.5, narrow: 22 };

/** True when the map is small enough to need the phone layout. */
export function isNarrowViewport(): boolean {
  return window.innerWidth < NARROW_VIEWPORT;
}

/** Half-height of a label pill, in viewBox units, per mode. */
const LABEL_PAD = { x: 5, y: 2.5 };

/** A label this far from its anchor gets a line drawn back to its country. */
const LEADER_THRESHOLD = 14;

/**
 * Candidate offsets, tried nearest-first: the anchor itself, then rings of
 * increasing radius. Small countries wedged into central Europe need to travel
 * a long way — Luxembourg has no room at all between Belgium, France and
 * Germany — so the outer rings reach well past the country itself.
 */
const ESCAPES: [number, number][] = buildEscapes();

function buildEscapes(): [number, number][] {
  const out: [number, number][] = [[0, 0]];
  for (const radius of [16, 26, 38, 52, 68, 86, 106, 130, 158]) {
    const steps = radius <= 26 ? 8 : 16;
    for (let index = 0; index < steps; index += 1) {
      const angle = (index / steps) * Math.PI * 2;
      out.push([
        Math.round(Math.cos(angle) * radius * 1.35), // wider than tall: labels are wide
        Math.round(Math.sin(angle) * radius),
      ]);
    }
  }
  return out;
}

/** Occupancy raster resolution, in viewBox units. */
const CELL = 5;
const GRID_COLUMNS = Math.ceil(VIEW_WIDTH / CELL);
const GRID_ROWS = Math.ceil(VIEW_HEIGHT / CELL);

/**
 * Cost per raster cell a candidate label would cover, plus what travelling
 * costs. Tuned so a label stays put when it sits partly over water — that reads
 * fine — but leaves rather than cover a neighbouring country, where the reader
 * would have to trace a line to know whose price it is.
 */
const COST = { own: 0, empty: 0.3, other: 4 };
const COST_PER_UNIT_MOVED = 0.3;

interface LabelEntry {
  group: SVGGElement;
  pill: SVGRectElement;
  text: SVGTextElement;
  leader: SVGLineElement;
  /** Preferred position in viewBox units, before collisions are resolved. */
  anchor: [number, number];
  /** Projected area: bigger countries keep their spot, smaller ones move. */
  area: number;
  /** Index into the occupancy raster, so a label can tell its own land apart. */
  ownership: number;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/**
 * ETRS89-LAEA (EPSG:3035) — the projection every official European map uses.
 * Rotating by the negated centre longitude and latitude puts 10°E/52°N at the
 * centre of an azimuthal equal-area projection, which is what EPSG:3035 is.
 */
function projection(): GeoProjection {
  return geoAzimuthalEqualArea().rotate([-10, -52]);
}

/** Diagonal hatch marking "no figures for this country", never a tier. */
function noDataPattern(): SVGDefsElement {
  const defs = document.createElementNS(SVG_NS, "defs");
  const pattern = document.createElementNS(SVG_NS, "pattern");
  pattern.setAttribute("id", "no-data-hatch");
  pattern.setAttribute("width", "6");
  pattern.setAttribute("height", "6");
  pattern.setAttribute("patternUnits", "userSpaceOnUse");
  pattern.setAttribute("patternTransform", "rotate(45)");
  const background = document.createElementNS(SVG_NS, "rect");
  background.setAttribute("width", "6");
  background.setAttribute("height", "6");
  background.setAttribute("class", "hatch-bg");
  const stripe = document.createElementNS(SVG_NS, "line");
  stripe.setAttribute("x1", "0");
  stripe.setAttribute("y1", "0");
  stripe.setAttribute("x2", "0");
  stripe.setAttribute("y2", "6");
  stripe.setAttribute("class", "hatch-line");
  pattern.append(background, stripe);
  defs.append(pattern);
  return defs;
}

export class EuropeMap {
  private readonly svg: SVGSVGElement;
  private readonly dataLayer: SVGGElement;
  private readonly labelLayer: SVGGElement;
  private readonly paths = new Map<string, SVGPathElement>();
  private readonly labels = new Map<string, LabelEntry>();
  /** Which country covers each raster cell; 0 means sea or a country we skip. */
  private readonly occupancy = new Uint8Array(GRID_COLUMNS * GRID_ROWS);
  private selected: string | null = null;
  private narrow = false;

  constructor(
    container: HTMLElement,
    geometry: GeoJSON.FeatureCollection,
    callbacks: MapCallbacks,
    private readonly nameOf: (country: string) => string,
  ) {
    const covered = geometry.features.filter((feature) => feature.properties?.["covered"]);
    const context = geometry.features.filter((feature) => !feature.properties?.["covered"]);

    const proj = projection().fitExtent(
      [
        [28, 28],
        [VIEW_WIDTH - 28, VIEW_HEIGHT - 28],
      ],
      { type: "FeatureCollection", features: covered } as GeoJSON.FeatureCollection,
    );
    const path = geoPath(proj);

    this.svg = document.createElementNS(SVG_NS, "svg");
    this.svg.setAttribute("viewBox", `0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`);
    this.svg.setAttribute("class", "map");
    this.svg.setAttribute("role", "img");
    this.svg.append(noDataPattern());

    const contextLayer = this.group("map-context");
    for (const feature of context) {
      const element = document.createElementNS(SVG_NS, "path");
      element.setAttribute("d", path(feature) ?? "");
      contextLayer.append(element);
    }

    this.dataLayer = this.group("map-data");
    this.labelLayer = this.group("map-labels");

    covered.forEach((feature, index) => {
      const code = String(feature.id);
      const element = document.createElementNS(SVG_NS, "path");
      element.setAttribute("d", path(feature) ?? "");
      element.setAttribute("tabindex", "0");
      element.setAttribute("role", "button");
      element.dataset["country"] = code;

      element.addEventListener("pointerenter", (event) => callbacks.onHover(code, event));
      element.addEventListener("pointermove", (event) => callbacks.onHover(code, event));
      element.addEventListener("pointerleave", () => callbacks.onHover(null));
      element.addEventListener("focus", (event) => callbacks.onHover(code, event));
      element.addEventListener("blur", () => callbacks.onHover(null));
      element.addEventListener("click", () => callbacks.onSelect(code));
      element.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          callbacks.onSelect(code);
        }
      });

      this.paths.set(code, element);
      this.dataLayer.append(element);

      const ownership = index + 1;
      this.rasterise(element, ownership);
      this.createLabel(code, feature, path, proj, ownership);
    });

    container.append(this.svg);
  }

  private group(className: string): SVGGElement {
    const group = document.createElementNS(SVG_NS, "g");
    group.setAttribute("class", className);
    this.svg.append(group);
    return group;
  }

  /**
   * Mark which raster cells this country covers.
   *
   * Uses the browser's own fill test rather than a hand-written
   * point-in-polygon, and only walks the country's bounding box, which keeps
   * the whole raster well under a frame's worth of work.
   */
  private rasterise(element: SVGPathElement, ownership: number): void {
    const bounds = element.getBBox();
    const point = this.svg.createSVGPoint();
    const firstColumn = Math.max(0, Math.floor(bounds.x / CELL));
    const lastColumn = Math.min(GRID_COLUMNS - 1, Math.ceil((bounds.x + bounds.width) / CELL));
    const firstRow = Math.max(0, Math.floor(bounds.y / CELL));
    const lastRow = Math.min(GRID_ROWS - 1, Math.ceil((bounds.y + bounds.height) / CELL));

    for (let column = firstColumn; column <= lastColumn; column += 1) {
      for (let row = firstRow; row <= lastRow; row += 1) {
        point.x = column * CELL + CELL / 2;
        point.y = row * CELL + CELL / 2;
        if (element.isPointInFill(point)) {
          this.occupancy[row * GRID_COLUMNS + column] = ownership;
        }
      }
    }
  }

  private createLabel(
    code: string,
    feature: GeoJSON.Feature,
    path: ReturnType<typeof geoPath>,
    proj: GeoProjection,
    ownership: number,
  ): void {
    const anchor =
      labelAnchor(ringsOf(feature.geometry, (point) => proj(point) as [number, number] | null)) ??
      (path.centroid(feature) as [number, number]);
    if (!Number.isFinite(anchor[0]) || !Number.isFinite(anchor[1])) return;

    const group = document.createElementNS(SVG_NS, "g");
    const pill = document.createElementNS(SVG_NS, "rect");
    pill.setAttribute("class", "label-pill");
    pill.setAttribute("rx", "7");
    const text = document.createElementNS(SVG_NS, "text");
    text.setAttribute("class", "label-text");
    text.setAttribute("text-anchor", "middle");
    text.setAttribute("dy", "0.34em");
    const leader = document.createElementNS(SVG_NS, "line");
    leader.setAttribute("class", "label-leader");
    leader.setAttribute("visibility", "hidden");

    this.labelLayer.append(leader);
    group.append(pill, text);
    this.labelLayer.append(group);

    this.labels.set(code, {
      group,
      pill,
      text,
      leader,
      anchor,
      area: path.area(feature),
      ownership,
    });
  }

  /**
   * Recolour every country. `values` is keyed by ISO code (absent = no data);
   * `average` is the EU-27 figure the diverging scale is anchored on.
   */
  paint(values: Map<string, number>, average: number, label: (country: string) => string): void {
    for (const [code, element] of this.paths) {
      const value = values.get(code);
      if (value === undefined) {
        element.setAttribute("class", "no-data");
        element.removeAttribute("fill");
      } else {
        element.setAttribute("class", "");
        element.setAttribute("fill", tierColor(value, average));
      }
      // The accessible name carries the number, so the map is readable without hover.
      element.setAttribute("aria-label", `${this.nameOf(code)}: ${label(code)}`);
      const title =
        element.querySelector("title") ??
        element.appendChild(document.createElementNS(SVG_NS, "title"));
      title.textContent = `${this.nameOf(code)} — ${label(code)}`;
    }

    this.placeLabels(values, label);
  }

  /**
   * Write the values into the labels and find each one a clear spot.
   *
   * Central Europe puts eight countries inside a 120-unit square, and Luxembourg
   * is smaller than its own price tag, so collisions are the rule rather than
   * the exception. Bigger countries keep their anchor and smaller neighbours
   * step aside, preferring — in order — their own territory, then open sea,
   * then, only if nothing else is free, a neighbour's. Anything that moved gets
   * a line drawn back to the country it belongs to.
   */
  private placeLabels(values: Map<string, number>, label: (country: string) => string): void {
    this.narrow = isNarrowViewport();
    const fontSize = this.narrow ? LABEL_FONT.narrow : LABEL_FONT.wide;

    const pending: { entry: LabelEntry; box: Box }[] = [];
    for (const [code, entry] of this.labels) {
      const value = values.get(code);
      entry.group.style.display = value === undefined ? "none" : "";
      entry.leader.setAttribute("visibility", "hidden");
      if (value === undefined) continue;

      entry.text.textContent = label(code);
      entry.text.style.fontSize = `${fontSize}px`;
      entry.group.setAttribute("transform", `translate(${entry.anchor[0]},${entry.anchor[1]})`);

      // Measured after the text is set, so the pill fits whatever the metric prints.
      const measured = entry.text.getBBox();
      entry.pill.setAttribute("x", String(measured.x - LABEL_PAD.x));
      entry.pill.setAttribute("y", String(measured.y - LABEL_PAD.y));
      entry.pill.setAttribute("width", String(measured.width + LABEL_PAD.x * 2));
      entry.pill.setAttribute("height", String(measured.height + LABEL_PAD.y * 2));
      pending.push({
        entry,
        box: {
          x: entry.anchor[0] + measured.x - LABEL_PAD.x,
          y: entry.anchor[1] + measured.y - LABEL_PAD.y,
          width: measured.width + LABEL_PAD.x * 2,
          height: measured.height + LABEL_PAD.y * 2,
        },
      });
    }

    pending.sort((a, b) => b.entry.area - a.entry.area);
    const placed: Box[] = [];

    for (const { entry, box } of pending) {
      const choice = this.narrow
        ? this.fitWithoutMoving(entry, box, placed)
        : this.findSpot(entry, box, placed);

      if (!choice) {
        // Nothing legible was available: on a phone the table carries this one.
        entry.group.style.display = "none";
        continue;
      }

      placed.push({ ...box, x: box.x + choice[0], y: box.y + choice[1] });
      const x = entry.anchor[0] + choice[0];
      const y = entry.anchor[1] + choice[1];
      entry.group.setAttribute("transform", `translate(${x.toFixed(1)},${y.toFixed(1)})`);

      const displacement = Math.hypot(choice[0], choice[1]);
      if (displacement > LEADER_THRESHOLD) {
        entry.leader.setAttribute("visibility", "visible");
        entry.leader.setAttribute("x1", entry.anchor[0].toFixed(1));
        entry.leader.setAttribute("y1", entry.anchor[1].toFixed(1));
        entry.leader.setAttribute("x2", x.toFixed(1));
        entry.leader.setAttribute("y2", y.toFixed(1));
      }
    }
  }

  /** Desktop: the cheapest free spot, however far it has to travel. */
  private findSpot(entry: LabelEntry, box: Box, placed: Box[]): [number, number] | null {
    let best: [number, number] | null = null;
    let bestCost = Infinity;

    for (const escape of ESCAPES) {
      const candidate: Box = { ...box, x: box.x + escape[0], y: box.y + escape[1] };
      if (candidate.x < 2 || candidate.y < 2) continue;
      if (candidate.x + candidate.width > VIEW_WIDTH - 2) continue;
      if (candidate.y + candidate.height > VIEW_HEIGHT - 2) continue;
      if (placed.some((other) => overlaps(candidate, other))) continue;

      const cost =
        this.terrainCost(candidate, entry.ownership) +
        Math.hypot(escape[0], escape[1]) * COST_PER_UNIT_MOVED;
      if (cost < bestCost) {
        bestCost = cost;
        best = escape;
        if (cost === 0) break; // sitting on its own country, unmoved
      }
    }
    return best;
  }

  /**
   * Phone: a label only stays if it fits where it belongs.
   *
   * Leader lines criss-crossing a 350-pixel map are worse than no label, and at
   * the mobile font size there is no room to route them. What drops out here is
   * in the table, which opens by default on narrow screens.
   */
  private fitWithoutMoving(entry: LabelEntry, box: Box, placed: Box[]): [number, number] | null {
    if (box.x < 2 || box.y < 2) return null;
    if (box.x + box.width > VIEW_WIDTH - 2 || box.y + box.height > VIEW_HEIGHT - 2) return null;
    if (placed.some((other) => overlaps(box, other))) return null;
    // Must sit essentially on its own country, not spilling onto a neighbour.
    const cover = this.coverage(box, entry.ownership);
    return cover.other / Math.max(1, cover.total) < 0.2 ? [0, 0] : null;
  }

  /** How many raster cells under this box are own land, open space, or a neighbour. */
  private coverage(box: Box, ownership: number): { own: number; empty: number; other: number; total: number } {
    let own = 0;
    let empty = 0;
    let other = 0;
    const firstColumn = Math.max(0, Math.floor(box.x / CELL));
    const lastColumn = Math.min(GRID_COLUMNS - 1, Math.floor((box.x + box.width) / CELL));
    const firstRow = Math.max(0, Math.floor(box.y / CELL));
    const lastRow = Math.min(GRID_ROWS - 1, Math.floor((box.y + box.height) / CELL));

    for (let column = firstColumn; column <= lastColumn; column += 1) {
      for (let row = firstRow; row <= lastRow; row += 1) {
        const occupant = this.occupancy[row * GRID_COLUMNS + column];
        if (occupant === ownership) own += 1;
        else if (occupant === 0) empty += 1;
        else other += 1;
      }
    }
    return { own, empty, other, total: own + empty + other };
  }

  /** What this position costs: own land is free, open space is cheap, neighbours are not. */
  private terrainCost(box: Box, ownership: number): number {
    const cover = this.coverage(box, ownership);
    return cover.own * COST.own + cover.empty * COST.empty + cover.other * COST.other;
  }

  select(country: string | null): void {
    if (this.selected) this.paths.get(this.selected)?.classList.remove("selected");
    this.selected = country;
    if (country) {
      const element = this.paths.get(country);
      element?.classList.add("selected");
      // Raise it so its outline is not overdrawn by a neighbour.
      if (element) this.dataLayer.append(element);
    }
  }
}

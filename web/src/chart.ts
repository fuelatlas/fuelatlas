/**
 * Two-line time series (price with and without taxes) with a snapping crosshair.
 *
 * Hand-rolled SVG rather than a charting library: two series on one axis needs a
 * path generator and a bisector, and nothing else.
 */

import { partColor } from "./colors";
import type { Series } from "./data";
import { euroPerLitre, isoDate } from "./format";
import { t } from "./i18n";

// Sized for the side column, not the page: a 720-unit viewBox squeezed into a
// 440px panel renders 10px type at 6px. Keep the box close to its drawn width.
const WIDTH = 520;
const HEIGHT = 230;
const PAD = { top: 14, right: 74, bottom: 24, left: 42 };

const PLOT_WIDTH = WIDTH - PAD.left - PAD.right;
const PLOT_HEIGHT = HEIGHT - PAD.top - PAD.bottom;

const SVG_NS = "http://www.w3.org/2000/svg";

function el<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

export function timeSeries(series: Series, onHover?: (index: number | null) => void): HTMLElement {
  const figure = document.createElement("figure");
  figure.className = "chart";

  const count = series.dates.length;
  const values = [...series.gross, ...series.net];
  const max = Math.max(...values) * 1.05;
  const min = Math.min(0, Math.min(...values));

  const x = (index: number) => PAD.left + (index / Math.max(1, count - 1)) * PLOT_WIDTH;
  const y = (value: number) => PAD.top + PLOT_HEIGHT - ((value - min) / (max - min)) * PLOT_HEIGHT;

  const svg = el("svg", { viewBox: `0 0 ${WIDTH} ${HEIGHT}`, class: "chart-svg", role: "img" });
  svg.setAttribute("aria-label", t("history.title"));

  // Recessive gridlines and y ticks in EUR per litre.
  const gridGroup = el("g", { class: "grid" });
  const tickStep = niceStep(max - min);
  for (let value = Math.ceil(min / tickStep) * tickStep; value <= max; value += tickStep) {
    const yPos = y(value);
    gridGroup.append(el("line", { x1: PAD.left, x2: WIDTH - PAD.right, y1: yPos, y2: yPos }));
    const label = el("text", { x: PAD.left - 8, y: yPos + 4, class: "tick", "text-anchor": "end" });
    label.textContent = euroPerLitre(value, 2);
    gridGroup.append(label);
  }
  svg.append(gridGroup);

  // Year ticks, thinned so labels never collide.
  const yearGroup = el("g", { class: "grid years" });
  let lastYear = "";
  const yearStep = Math.max(1, Math.round(count / 180));
  for (let index = 0; index < count; index += 1) {
    const year = series.dates[index]!.slice(0, 4);
    if (year === lastYear || Number(year) % yearStep !== 0) continue;
    lastYear = year;
    const label = el("text", { x: x(index), y: HEIGHT - 8, class: "tick", "text-anchor": "middle" });
    label.textContent = year;
    yearGroup.append(label);
  }
  svg.append(yearGroup);

  const line = (points: number[]) =>
    points.map((value, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join("");

  svg.append(el("path", { d: line(series.gross), class: "series", stroke: partColor("excise"), fill: "none" }));
  svg.append(el("path", { d: line(series.net), class: "series", stroke: partColor("net"), fill: "none" }));

  // Direct labels at the right end — identity without reading the legend.
  const labelGross = el("text", { x: WIDTH - PAD.right + 8, y: y(series.gross[count - 1]!) + 4, class: "direct" });
  labelGross.textContent = t("history.gross");
  labelGross.setAttribute("fill", partColor("excise"));
  const labelNet = el("text", { x: WIDTH - PAD.right + 8, y: y(series.net[count - 1]!) + 4, class: "direct" });
  labelNet.textContent = t("history.net");
  labelNet.setAttribute("fill", partColor("net"));
  svg.append(labelGross, labelNet);

  const crosshair = el("line", { class: "crosshair", y1: PAD.top, y2: PAD.top + PLOT_HEIGHT });
  crosshair.setAttribute("visibility", "hidden");
  const dotGross = el("circle", { r: 4.5, class: "dot", fill: partColor("excise") });
  const dotNet = el("circle", { r: 4.5, class: "dot", fill: partColor("net") });
  dotGross.setAttribute("visibility", "hidden");
  dotNet.setAttribute("visibility", "hidden");
  svg.append(crosshair, dotGross, dotNet);

  const readout = document.createElement("figcaption");
  readout.className = "chart-readout";

  const setIndex = (index: number | null) => {
    if (index === null) {
      crosshair.setAttribute("visibility", "hidden");
      dotGross.setAttribute("visibility", "hidden");
      dotNet.setAttribute("visibility", "hidden");
      readout.replaceChildren(defaultCaption(series));
      onHover?.(null);
      return;
    }
    const xPos = x(index);
    crosshair.setAttribute("visibility", "visible");
    crosshair.setAttribute("x1", String(xPos));
    crosshair.setAttribute("x2", String(xPos));
    for (const [dot, value] of [
      [dotGross, series.gross[index]!],
      [dotNet, series.net[index]!],
    ] as const) {
      dot.setAttribute("visibility", "visible");
      dot.setAttribute("cx", String(xPos));
      dot.setAttribute("cy", String(y(value)));
    }
    readout.replaceChildren(caption(series, index));
    onHover?.(index);
  };

  const surface = el("rect", {
    x: PAD.left, y: PAD.top, width: PLOT_WIDTH, height: PLOT_HEIGHT, class: "chart-surface",
  });
  surface.addEventListener("pointermove", (event) => {
    const box = svg.getBoundingClientRect();
    const relative = ((event.clientX - box.left) / box.width) * WIDTH;
    const index = Math.round(((relative - PAD.left) / PLOT_WIDTH) * (count - 1));
    setIndex(Math.min(count - 1, Math.max(0, index)));
  });
  surface.addEventListener("pointerleave", () => setIndex(null));
  svg.append(surface);

  figure.append(svg, readout);
  setIndex(null);
  return figure;
}

function keyed(label: string, value: string, color: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const wrapper = document.createElement("span");
  wrapper.className = "readout-item";
  const stroke = document.createElement("span");
  stroke.className = "key-line";
  stroke.style.background = color;
  const strong = document.createElement("strong");
  strong.textContent = value;
  const name = document.createElement("span");
  name.className = "muted";
  name.textContent = label;
  wrapper.append(stroke, strong, name);
  fragment.append(wrapper);
  return fragment;
}

function caption(series: Series, index: number): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const date = document.createElement("span");
  date.className = "readout-date";
  date.textContent = isoDate(series.dates[index]!);
  fragment.append(date);
  fragment.append(keyed(t("history.gross"), euroPerLitre(series.gross[index]!), partColor("excise")));
  fragment.append(keyed(t("history.net"), euroPerLitre(series.net[index]!), partColor("net")));
  return fragment;
}

function defaultCaption(series: Series): DocumentFragment {
  return caption(series, series.dates.length - 1);
}

function niceStep(span: number): number {
  const rough = span / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  for (const factor of [1, 2, 2.5, 5, 10]) {
    if (rough <= factor * magnitude) return factor * magnitude;
  }
  return 10 * magnitude;
}

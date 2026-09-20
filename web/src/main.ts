import { TIER_BOUNDS, isDark, tiers } from "./colors";
import {
  loadGeometry, loadLatest, loadMeta, metricValue,
  type Latest, type Meta, type Metric,
} from "./data";
import { DetailPanel } from "./detail";
import { euroPerLitre, euroPlain, isoDate, percent, signedPercent } from "./format";
import { lang, setLang, t, type Lang } from "./i18n";
import { EuropeMap, isNarrowViewport } from "./map";
import { renderOverview } from "./overview";
import { defaultSort, renderTable, type Sort } from "./table";
import { Tooltip } from "./tooltip";

const METRICS: Metric[] = ["net", "gross", "tax_share", "tax_total"];

interface State {
  product: string;
  metric: Metric;
  country: string | null;
  sort: Sort;
}

const state: State = {
  product: "euro95",
  metric: "net",
  country: null,
  sort: defaultSort("net"),
};

let latest: Latest;
let meta: Meta;
let map: EuropeMap;
let tooltip: Tooltip;
let detail: DetailPanel;

function $(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`missing #${id}`);
  return element;
}

function countryName(code: string): string {
  return latest.names[code]?.[lang()] ?? code;
}

function productLabel(key: string): string {
  const product = latest.products.find((entry) => entry.key === key);
  return product ? product[lang()] : key;
}

/** Countries that have the selected product, with the selected metric applied. */
function currentValues(): Map<string, number> {
  const values = new Map<string, number>();
  for (const [code, products] of Object.entries(latest.countries)) {
    const entry = products[state.product];
    if (entry) values.set(code, metricValue(entry, state.metric));
  }
  return values;
}

function formatMetric(value: number): string {
  return state.metric === "tax_share" ? percent(value) : euroPerLitre(value);
}

/**
 * The form drawn on the map. On a phone the map is barely 350 px across, so the
 * label has to be both larger and shorter — the currency symbol and the third
 * decimal are dropped, which is what lets the bigger countries keep a label at
 * all. Full precision stays in the tooltip and the table.
 */
function formatCompact(value: number): string {
  if (state.metric === "tax_share") return percent(value, 0);
  return isNarrowViewport() ? euroPlain(value) : euroPerLitre(value);
}

function euAverage(): number | null {
  const aggregate = latest.aggregates["EU27"]?.[state.product];
  if (!aggregate) return null;
  switch (state.metric) {
    case "net":
      return aggregate.net;
    case "gross":
      return aggregate.gross;
    case "tax_total":
      return aggregate.gross - aggregate.net;
    case "tax_share":
      return (aggregate.gross - aggregate.net) / aggregate.gross;
  }
}

// --- rendering ---------------------------------------------------------------

function render(): void {
  const values = currentValues();
  const ranking = [...values.entries()].sort((a, b) => b[1] - a[1]).map(([code]) => code);

  const average = euAverage() ?? median(values);
  map.paint(values, average, (code) => {
    const value = values.get(code);
    return value === undefined ? t("nodata") : formatCompact(value);
  });
  map.select(state.country);

  renderControls();
  renderLegend(values, average);
  renderTableSection(ranking);

  if (state.country) {
    const entry = latest.countries[state.country]?.[state.product];
    if (entry) {
      detail.show({
        country: state.country,
        name: countryName(state.country),
        product: state.product,
        productLabel: productLabel(state.product),
        entry,
        ...(latest.exchange_rates[state.country]
          ? { rate: latest.exchange_rates[state.country]! }
          : {}),
      });
    } else {
      detail.clear();
    }
  } else {
    detail.showOverview(
      renderOverview({
        latest,
        metric: state.metric,
        product: state.product,
        ranking,
        values,
        name: countryName,
        format: formatMetric,
        onSelect: select,
      }),
    );
  }

  map.select(state.country);
  window.__ranking = ranking;
  syncUrl();
}

function segmented(
  host: HTMLElement,
  options: { value: string; label: string; title?: string }[],
  active: string,
  onPick: (value: string) => void,
): void {
  host.replaceChildren();
  for (const option of options) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = option.label;
    button.className = option.value === active ? "chip active" : "chip";
    button.setAttribute("aria-pressed", String(option.value === active));
    if (option.title) button.title = option.title;
    button.addEventListener("click", () => onPick(option.value));
    host.append(button);
  }
}

function renderControls(): void {
  segmented(
    $("product-switch"),
    latest.products.map((product) => ({ value: product.key, label: product[lang()] })),
    state.product,
    (value) => {
      state.product = value;
      render();
    },
  );

  segmented(
    $("metric-switch"),
    METRICS.map((metric) => ({
      value: metric,
      label: t(`metric.${metric}`),
      title: t(`metric.${metric}.help`),
    })),
    state.metric,
    (value) => {
      state.metric = value as Metric;
      state.sort = defaultSort(state.metric);
      render();
    },
  );

  $("metric-help").textContent = t(`metric.${state.metric}.help`);
  $("label-product").textContent = t("product");
  $("label-metric").textContent = t("metric");
  $("app-title").textContent = t("title");
  $("app-subtitle").textContent = t("subtitle");
  $("week-label").textContent = `${t("week")}: ${t("week.of")} ${isoDate(latest.week)}`;
  $("lang-toggle").textContent = lang() === "de" ? "EN" : "DE";
  $("lang-toggle").title = t("lang.toggle");
  $("theme-toggle").title = t("theme.toggle");
}

function median(values: Map<string, number>): number {
  const ordered = [...values.values()].sort((a, b) => a - b);
  return ordered[Math.floor(ordered.length / 2)] ?? 0;
}

function renderLegend(values: Map<string, number>, average: number): void {
  const host = $("legend");
  host.replaceChildren();
  if (values.size === 0) return;

  const numbers = [...values.values()];
  // "cheaper/dearer" is about money; a share is lower or higher.
  const ends =
    state.metric === "tax_share"
      ? ["legend.lower", "legend.higher"]
      : ["legend.cheap", "legend.expensive"];

  const low = document.createElement("span");
  low.className = "legend-end";
  low.textContent = `${formatMetric(Math.min(...numbers))} · ${t(ends[0]!)}`;

  const scale = document.createElement("div");
  scale.className = "legend-scale";
  for (const step of tiers()) {
    const swatch = document.createElement("span");
    swatch.style.background = step;
    scale.append(swatch);
  }

  // Boundaries sit on the seams between tiers, so a country's colour can be
  // placed on the scale without reading its number.
  const ticks = document.createElement("div");
  ticks.className = "legend-ticks";
  TIER_BOUNDS.forEach((bound, index) => {
    const tick = document.createElement("span");
    tick.style.left = `${((index + 1) / tiers().length) * 100}%`;
    tick.textContent = Math.abs(bound) < 0.05 ? "" : signedPercent(bound);
    ticks.append(tick);
  });
  const anchor = document.createElement("span");
  anchor.className = "legend-anchor";
  anchor.style.left = "50%";
  anchor.textContent = `${t("eu.average")} ${formatMetric(average)}`;
  ticks.append(anchor);

  const track = document.createElement("div");
  track.className = "legend-track";
  track.append(scale, ticks);

  const high = document.createElement("span");
  high.className = "legend-end";
  high.textContent = `${t(ends[1]!)} · ${formatMetric(Math.max(...numbers))}`;

  host.append(low, track, high);
}

function renderTableSection(ranking: string[]): void {
  const host = $("table-host");
  if (host.hidden) return;
  const names: Record<string, string> = {};
  for (const code of ranking) names[code] = countryName(code);
  const scroller = document.createElement("div");
  scroller.className = "table-scroll";
  scroller.append(
    renderTable({
      entries: ranking.map((code) => [code, latest.countries[code]![state.product]!]),
      names,
      metric: state.metric,
      sort: state.sort,
      compact: isNarrowViewport(),
      onSort: (sort) => {
        state.sort = sort;
        render();
      },
      onSelect: select,
    }),
  );
  host.replaceChildren(scroller);
}

function renderFooter(): void {
  const host = $("sources");
  host.replaceChildren();
  const heading = document.createElement("strong");
  heading.textContent = `${t("sources")}: `;
  host.append(heading);
  meta.sources.forEach((source, index) => {
    const link = document.createElement("a");
    link.href = source.url;
    link.rel = "noreferrer";
    link.textContent = source[lang()];
    host.append(link);
    if (index < meta.sources.length - 1) host.append(document.createTextNode(" · "));
  });
  const licence = document.createElement("p");
  licence.className = "muted";
  licence.textContent = meta.sources.map((source) => source.licence[lang()]).join(" · ");
  host.append(licence);
}

// --- interaction -------------------------------------------------------------

function select(country: string | null): void {
  state.country = state.country === country ? null : country;
  render();
}

function hover(country: string | null, event?: PointerEvent | FocusEvent): void {
  if (!country) {
    tooltip.hide();
    return;
  }
  const entry = latest.countries[country]?.[state.product];
  if (!entry) {
    tooltip.hide();
    return;
  }
  const ranking = window.__ranking ?? [];
  tooltip.show(
    {
      country,
      name: countryName(country),
      entry,
      metric: state.metric,
      rank: ranking.indexOf(country) + 1,
      total: ranking.length,
      euAverage: euAverage(),
    },
    event,
  );
}

function syncUrl(): void {
  const params = new URLSearchParams();
  params.set("lang", lang());
  params.set("product", state.product);
  params.set("metric", state.metric);
  if (state.country) params.set("country", state.country);
  history.replaceState(null, "", `?${params}`);
}

function applyUrl(): void {
  const params = new URLSearchParams(location.search);
  const urlLang = params.get("lang");
  const stored = localStorage.getItem("lang");
  setLang((urlLang ?? stored ?? navigatorLang()) === "en" ? "en" : "de");

  const product = params.get("product");
  if (product && latest.products.some((entry) => entry.key === product)) state.product = product;
  const metric = params.get("metric") as Metric | null;
  if (metric && METRICS.includes(metric)) state.metric = metric;
  const country = params.get("country");
  if (country && latest.countries[country]) state.country = country;
}

function navigatorLang(): Lang {
  return navigator.language.startsWith("de") ? "de" : "en";
}

function applyTheme(theme: string | null): void {
  if (theme) document.documentElement.dataset["theme"] = theme;
  else delete document.documentElement.dataset["theme"];
  $("theme-toggle").textContent = isDark() ? "☀" : "☾";
}

// --- boot --------------------------------------------------------------------

async function main(): Promise<void> {
  [latest, meta] = await Promise.all([loadLatest(), loadMeta()]);
  const geometry = await loadGeometry();

  applyUrl();
  applyTheme(localStorage.getItem("theme"));

  tooltip = new Tooltip($("map-host"));
  detail = new DetailPanel($("detail"), () => select(null));
  map = new EuropeMap(
    $("map-host"),
    geometry,
    { onHover: hover, onSelect: (code) => select(code) },
    countryName,
  );

  $("lang-toggle").addEventListener("click", () => {
    const next: Lang = lang() === "de" ? "en" : "de";
    setLang(next);
    localStorage.setItem("lang", next);
    renderFooter();
    render();
  });

  $("theme-toggle").addEventListener("click", () => {
    const next = isDark() ? "light" : "dark";
    localStorage.setItem("theme", next);
    applyTheme(next);
    render(); // the ramps and segment colours are per-theme selections
  });

  const tableToggle = $("table-toggle");
  tableToggle.addEventListener("click", () => {
    const host = $("table-host");
    host.hidden = !host.hidden;
    tableToggle.textContent = host.hidden ? t("table.show") : t("table.hide");
    if (!host.hidden) render();
  });
  // On a phone most labels cannot fit on the map, so the table opens by default.
  if (window.innerWidth < 720) $("table-host").hidden = false;
  tableToggle.textContent = $("table-host").hidden ? t("table.show") : t("table.hide");

  // Label placement depends on the viewport width, so a resize re-runs it.
  let resizeTimer: number | undefined;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => render(), 150);
  });

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (!localStorage.getItem("theme")) {
      applyTheme(null);
      render();
    }
  });

  renderFooter();
  render();
  $("app").dataset["ready"] = "true";
}

declare global {
  interface Window {
    __ranking?: string[];
  }
}

main().catch((error: unknown) => {
  const message = document.createElement("p");
  message.className = "error";
  message.textContent = String(error);
  $("app").append(message);
});

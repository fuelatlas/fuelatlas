import { BURDEN_TIER_BOUNDS, TIER_BOUNDS, isDark, tiers } from "./colors";
import {
  loadGeometry, loadLatest, loadMeta, metricValue,
  type Latest, type Meta, type Metric,
} from "./data";
import { DetailPanel } from "./detail";
import { euroAmount, euroPerLitre, euroPlain, isoDate, percent, signedPercent } from "./format";
import { lang, setLang, t, type Lang } from "./i18n";
import { EuropeMap, isNarrowViewport } from "./map";
import { renderOverview } from "./overview";
import { defaultSort, renderTable, type Sort } from "./table";
import { Tooltip } from "./tooltip";

const BASE_METRICS: Metric[] = ["net", "gross", "tax_share", "tax_total"];

/**
 * The burden metric only exists when the build managed to fetch incomes. If
 * Eurostat was down that week the option disappears rather than showing an
 * empty map.
 */
/** The help line, with the income year filled in where the text asks for it. */
function metricHelp(metric: Metric): string {
  return t(`metric.${metric}.help`).replace("{year}", latest.income?.year ?? "—");
}

function metrics(): Metric[] {
  const hasIncome = Object.keys(latest.income?.values ?? {}).length > 0;
  return hasIncome ? [...BASE_METRICS, "burden"] : BASE_METRICS;
}

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
  const income = latest.income?.values ?? {};
  for (const [code, products] of Object.entries(latest.countries)) {
    const entry = products[state.product];
    if (!entry) continue;
    const value = metricValue(entry, state.metric, income[code]);
    if (value !== undefined) values.set(code, value);
  }
  return values;
}

/**
 * "Belastung" is the one metric whose number nobody can read off the map
 * without being told what it is, so selecting it unfolds the arithmetic on a
 * real country rather than leaving a percentage to be guessed at.
 */
function renderExplainer(): void {
  const host = $("metric-explainer");
  host.replaceChildren();
  if (state.metric !== "burden") {
    host.hidden = true;
    return;
  }
  host.hidden = false;

  const title = document.createElement("strong");
  title.textContent = t("explain.burden.title");

  const body = document.createElement("p");
  body.textContent = t("explain.burden.body").replace("{year}", latest.income?.year ?? "—");

  const formula = document.createElement("p");
  formula.className = "formula";
  formula.textContent = t("explain.burden.formula");

  host.append(title, body, formula);

  // Worked through on the country that carries the heaviest burden this week,
  // set against the lightest — two real rows beat an abstract ratio.
  const values = [...currentValues().entries()].sort((a, b) => b[1] - a[1]);
  const heaviest = values[0];
  const lightest = values[values.length - 1];
  const incomes = latest.income?.values ?? {};
  if (heaviest && lightest) {
    const [code, share] = heaviest;
    const entry = latest.countries[code]?.[state.product];
    const income = incomes[code];
    if (entry && income) {
      const example = document.createElement("p");
      example.className = "worked";
      const label = document.createElement("strong");
      label.textContent = `${t("explain.burden.example").replace("{country}", countryName(code))} `;
      example.append(
        label,
        document.createTextNode(
          `${euroPerLitre(entry.gross)} ÷ (${euroAmount(income)} ÷ 365 = ` +
            `${euroAmount(income / 365, 2)}) = ${percent(share, 1)}`,
        ),
      );
      const reading = document.createElement("p");
      reading.textContent = t("explain.burden.reading")
        .replace("{value}", percent(share, 1))
        .replace("{other}", countryName(lightest[0]))
        .replace("{othervalue}", percent(lightest[1], 1));
      host.append(example, reading);
    }
  }

  const missing = document.createElement("p");
  missing.className = "muted";
  missing.textContent = t("explain.burden.missing");
  host.append(missing);
}

/** Burden spreads far wider than a price does, so it gets its own bands. */
function tierBounds(): readonly number[] {
  return state.metric === "burden" ? BURDEN_TIER_BOUNDS : TIER_BOUNDS;
}

function isShare(metric: Metric): boolean {
  return metric === "tax_share" || metric === "burden";
}

function formatMetric(value: number): string {
  if (state.metric === "burden") return percent(value, 1);
  return state.metric === "tax_share" ? percent(value) : euroPerLitre(value);
}

/**
 * The form drawn on the map. On a phone the map is barely 350 px across, so the
 * label has to be both larger and shorter — the currency symbol and the third
 * decimal are dropped, which is what lets the bigger countries keep a label at
 * all. Full precision stays in the tooltip and the table.
 */
function formatCompact(value: number): string {
  if (isShare(state.metric)) return percent(value, state.metric === "burden" ? 1 : 0);
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
    case "burden":
      // No EU-wide income in the artefact, so the colour scale centres on the
      // median of the countries instead — see the caller's `?? median(...)`.
      return null;
  }
}

// --- rendering ---------------------------------------------------------------

function render(): void {
  const values = currentValues();
  const ranking = [...values.entries()].sort((a, b) => b[1] - a[1]).map(([code]) => code);

  const average = euAverage() ?? median(values);
  map.paint(
    values,
    average,
    (code) => {
      const value = values.get(code);
      return value === undefined ? t("nodata") : formatCompact(value);
    },
    tierBounds(),
  );
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
    metrics().map((metric) => ({
      value: metric,
      label: t(`metric.${metric}`),
      title: metricHelp(metric),
    })),
    state.metric,
    (value) => {
      state.metric = value as Metric;
      state.sort = defaultSort(state.metric);
      render();
    },
  );

  $("metric-help").textContent = metricHelp(state.metric);
  renderExplainer();
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
  const ends = isShare(state.metric)
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
  tierBounds().forEach((bound, index) => {
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

const METHODOLOGY_URL = "https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en";

/** GitHub serves this statement in both interface languages. */
function githubPrivacyUrl(): string {
  return `https://docs.github.com/${lang()}/site-policy/privacy-policies/github-general-privacy-statement`;
}

// A single line above the map: the caveat belongs where the numbers are read,
// but spelling it out in full up here would cast more doubt than is warranted.
// The detail sits in the footer, the link goes to the Commission's per-country
// notes.
function renderCaveat(): void {
  const host = $("caveat-top");
  host.replaceChildren();
  const link = document.createElement("a");
  link.href = METHODOLOGY_URL;
  link.rel = "noreferrer";
  link.textContent = `${t("caveat.short.link")} →`;
  host.append(document.createTextNode(`${t("caveat.short")} `), link);
}

function renderFooter(): void {
  const host = $("sources");
  host.replaceChildren();

  // Every country reports to the bulletin its own way, and the spread between
  // two of them can be smaller than the spread between two methods. Saying so
  // belongs next to the numbers, not only in the README.
  const caveat = document.createElement("p");
  caveat.className = "caveat";
  const caveatTitle = document.createElement("strong");
  caveatTitle.textContent = `${t("caveat.title")}: `;
  const caveatLink = document.createElement("a");
  caveatLink.href = METHODOLOGY_URL;
  caveatLink.rel = "noreferrer";
  caveatLink.textContent = t("caveat.link");
  caveat.append(caveatTitle, document.createTextNode(`${t("caveat.body")} `), caveatLink);
  host.append(caveat);

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

  // The site itself processes nothing; the hosting does. Saying which is which
  // is the part GitHub's own statement cannot cover, so it goes first and the
  // link carries the rest.
  const privacy = document.createElement("p");
  privacy.className = "privacy";
  const privacyTitle = document.createElement("strong");
  privacyTitle.textContent = `${t("privacy.title")}: `;
  const privacyLink = document.createElement("a");
  privacyLink.href = githubPrivacyUrl();
  privacyLink.rel = "noreferrer";
  privacyLink.textContent = t("privacy.link");
  privacy.append(privacyTitle, document.createTextNode(`${t("privacy.body")} `), privacyLink);
  host.append(privacy);
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
  const value = currentValues().get(country);
  if (value === undefined) {
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
      value,
      income: latest.income?.values[country],
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
  // Anything we cannot place — an unknown ?lang=, a stale stored value — is
  // English, which is the safer guess for a reader we know nothing about.
  setLang((urlLang ?? stored ?? navigatorLang()) === "de" ? "de" : "en");

  const product = params.get("product");
  if (product && latest.products.some((entry) => entry.key === product)) state.product = product;
  const metric = params.get("metric") as Metric | null;
  if (metric && metrics().includes(metric)) state.metric = metric;
  const country = params.get("country");
  if (country && latest.countries[country]) state.country = country;
}

// The whole preference list, not just its first entry: a browser set to a
// language the site does not speak — Swiss German, say — may still rank German
// second, and that reader is better served in German than in English.
function navigatorLang(): Lang {
  const preferred = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const tag of preferred) {
    const code = tag.toLowerCase();
    if (code.startsWith("de")) return "de";
    if (code.startsWith("en")) return "en";
  }
  return "en";
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
    renderCaveat();
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

  renderCaveat();
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

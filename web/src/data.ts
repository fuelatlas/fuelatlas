/** Shapes written by `pipeline/build.py`. All money is EUR per 1000 litres. */

export interface Breakdown {
  gross: number;
  net: number;
  vat: number;
  excise: number;
  other: number;
  vat_rate: number;
  tax_share: number;
  notes?: string[];
  /** Excise as printed in the Commission's table, when it disagrees with the derived value. */
  excise_table?: number;
}

export interface ProductInfo {
  key: string;
  unit: string;
  de: string;
  en: string;
}

export interface ExchangeRate {
  currency: string;
  /** Euro per unit of the national currency. */
  eur_per_unit: number;
  /** Units of the national currency per euro — the readable direction. */
  units_per_eur: number;
  source: "wob" | "ecb";
  date: string;
}

export interface Latest {
  week: string;
  unit: string;
  products: ProductInfo[];
  countries: Record<string, Record<string, Breakdown>>;
  aggregates: Record<string, Record<string, { gross: number; net: number }>>;
  names: Record<string, { de: string; en: string }>;
  exchange_rates: Record<string, ExchangeRate>;
  income?: Income;
}

/** Median equivalised disposable income, one figure per country and year. */
export interface Income {
  year: string;
  unit: string;
  values: Record<string, number>;
}

export interface Series {
  dates: string[];
  gross: number[];
  net: number[];
}

export interface CountryHistory {
  country: string;
  series: Record<string, Series>;
}

export interface Source {
  id: string;
  de: string;
  en: string;
  url: string;
  licence: { de: string; en: string };
}

export interface Meta {
  generated_at: string;
  week: string;
  sources: Source[];
  notes: string[];
  exchange_rates: Record<string, number>;
}

const BASE = import.meta.env.BASE_URL;

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE}data/${path}`);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return (await response.json()) as T;
}

export const loadLatest = () => getJson<Latest>("latest.json");

export const loadMeta = () => getJson<Meta>("meta.json");
export const loadGeometry = () => getJson<GeoJSON.FeatureCollection>("europe.geo.json");

const historyCache = new Map<string, Promise<CountryHistory>>();

export function loadHistory(country: string): Promise<CountryHistory> {
  let pending = historyCache.get(country);
  if (!pending) {
    pending = getJson<CountryHistory>(`history/${country}.json`);
    historyCache.set(country, pending);
  }
  return pending;
}

export type Metric = "net" | "gross" | "tax_share" | "tax_total" | "burden";

/**
 * The number the map colours and the table sorts by, in EUR/1000 l (or a
 * fraction). `burden` needs the country's income as well and returns undefined
 * without it, which is how the United Kingdom stays blank on that metric.
 */
export function metricValue(
  entry: Breakdown,
  metric: Metric,
  income?: number,
): number | undefined {
  switch (metric) {
    case "net":
      return entry.net;
    case "gross":
      return entry.gross;
    case "tax_share":
      return entry.tax_share;
    case "tax_total":
      return entry.vat + entry.excise + entry.other;
    case "burden":
      // One litre at the pump against one day's income, both in euro.
      return income ? entry.gross / 1000 / (income / 365) : undefined;
  }
}

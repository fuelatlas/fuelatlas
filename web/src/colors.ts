/**
 * Sequential blue ramp from the validated reference palette, steps 100-700.
 *
 * A choropleth is continuous magnitude, so the full range is in play and the
 * lightest step is allowed to recede toward the surface. Dark mode is its own
 * selection of steps rather than an inversion: on the dark surface the ramp runs
 * from a dim blue up to a bright one, so "more" still reads as "stronger".
 */
const LIGHT_RAMP = [
  "#cde2fb", "#b7d3f6", "#9ec5f4", "#86b6ef", "#6da7ec",
  "#5598e7", "#3987e5", "#2a78d6", "#256abf", "#1c5cab",
  "#184f95", "#104281", "#0d366b",
];

const DARK_RAMP = [
  "#104281", "#184f95", "#1c5cab", "#256abf", "#2a78d6",
  "#3987e5", "#5598e7", "#6da7ec", "#86b6ef", "#9ec5f4",
  "#b7d3f6", "#cde2fb",
];

/**
 * Price tiers, diverging around the EU-27 average: green below it, amber at it,
 * red above it. A single-hue ramp spent most of its range on the pack — 22 of
 * 28 countries sit within 12 % of the average — so the map read as one shade.
 *
 * A green-to-red scale is the one scheme colour-vision deficiency hits hardest,
 * so the tier is never the only carrier of the value: every country on the map
 * shows its own number, and the table lists all of them. Within that, the steps
 * are chosen so the ramp still works as shape rather than hue — both arms are
 * lightness-monotone, symmetric to within 0.05 OKLab L, and no two neighbouring
 * steps sit closer than 0.065 L, so even with hue removed the tiers stay
 * ordered.
 *
 * Light mode is light at the midpoint and dark at both ends; dark mode is
 * stepped the other way, dim at the midpoint and bright at the ends.
 */
const TIERS_LIGHT = ["#12653a", "#3f9e5c", "#93cc85", "#f4c95d", "#ef9042", "#dd5a2f", "#a32718"];
const TIERS_DARK = ["#5ec278", "#3a9b57", "#2a7546", "#57491d", "#8f5526", "#cf5430", "#ef8f6b"];

/**
 * Upper bounds of each tier as a deviation from the EU average. Relative rather
 * than absolute so the same bands work for a price in euro and for a tax share
 * in per cent.
 */
export const TIER_BOUNDS = [-0.15, -0.08, -0.03, 0.03, 0.08, 0.15];

/**
 * The burden metric needs its own bands. Prices cluster — 22 of 28 countries
 * within 12 % of the average — but a price measured against income spreads by a
 * factor of six, from 1.3 % of a day's income in Luxembourg to 8.4 % in Romania.
 * Run through the bands above, that puts ten countries in the bottom tier and
 * twelve in the top and empties the middle. These bounds spread the same 27
 * countries across all seven steps.
 */
export const BURDEN_TIER_BOUNDS = [-0.5, -0.3, -0.12, 0.15, 0.45, 0.9];

export function tiers(): readonly string[] {
  return isDark() ? TIERS_DARK : TIERS_LIGHT;
}

/** Which tier a value falls into, 0 (far below average) to 6 (far above). */
export function tierOf(
  value: number,
  average: number,
  bounds: readonly number[] = TIER_BOUNDS,
): number {
  if (!average) return 3;
  const deviation = value / average - 1;
  for (let index = 0; index < bounds.length; index += 1) {
    if (deviation < bounds[index]!) return index;
  }
  return bounds.length;
}

export function tierColor(
  value: number,
  average: number,
  bounds: readonly number[] = TIER_BOUNDS,
): string {
  return tiers()[tierOf(value, average, bounds)]!;
}

/** Stack segments use categorical slots 1-4 in fixed order (never cycled). */
export const PART_COLORS = {
  light: { net: "#2a78d6", excise: "#eb6834", other: "#1baf7a", vat: "#eda100" },
  dark: { net: "#3987e5", excise: "#d95926", other: "#199e70", vat: "#c98500" },
} as const;

export type PartKey = keyof (typeof PART_COLORS)["light"];

/** Order of the stacked bar, bottom (product) to top (VAT) — matches the price build-up. */
export const PART_ORDER: PartKey[] = ["net", "excise", "other", "vat"];

export function isDark(): boolean {
  const stamped = document.documentElement.dataset.theme;
  if (stamped === "dark") return true;
  if (stamped === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function ramp(): readonly string[] {
  return isDark() ? DARK_RAMP : LIGHT_RAMP;
}

export function partColor(part: PartKey): string {
  return PART_COLORS[isDark() ? "dark" : "light"][part];
}

/** Quantise a 0..1 position onto the ramp — discrete steps read better than a gradient. */
export function rampColor(position: number): string {
  const steps = ramp();
  if (!Number.isFinite(position)) return steps[0]!;
  const index = Math.min(steps.length - 1, Math.max(0, Math.round(position * (steps.length - 1))));
  return steps[index]!;
}

export function scalePosition(value: number, min: number, max: number): number {
  return max > min ? (value - min) / (max - min) : 0.5;
}

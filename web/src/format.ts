import { lang } from "./i18n";

const LOCALE: Record<string, string> = { de: "de-DE", en: "en-IE" };

function locale(): string {
  return LOCALE[lang()] ?? "en-IE";
}

/** EUR per 1000 l -> a "1,847 €" style string in cents per litre. */
export function cents(perThousandLitres: number, digits = 1): string {
  return new Intl.NumberFormat(locale(), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(perThousandLitres / 10);
}

/** EUR per 1000 l -> "1,85 €" per litre. */
export function euroPerLitre(perThousandLitres: number, digits = 3): string {
  return new Intl.NumberFormat(locale(), {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(perThousandLitres / 1000);
}

/** EUR per 1000 l -> "1,18" — no symbol, two decimals, for cramped map labels. */
export function euroPlain(perThousandLitres: number): string {
  return new Intl.NumberFormat(locale(), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(perThousandLitres / 1000);
}

/** A plain euro amount — incomes, not per-litre prices. */
export function euroAmount(value: number, digits = 0): string {
  return new Intl.NumberFormat(locale(), {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function percent(fraction: number, digits = 1): string {
  return new Intl.NumberFormat(locale(), {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(fraction);
}

export function signedPercent(fraction: number): string {
  const formatted = percent(Math.abs(fraction), 0);
  if (Math.abs(fraction) < 0.005) return "±0 %";
  return (fraction > 0 ? "+" : "−") + formatted;
}

/** A plain number in the interface language, for rates and counts. */
export function number(value: number, maxDigits = 4): string {
  return new Intl.NumberFormat(locale(), {
    maximumFractionDigits: maxDigits,
  }).format(value);
}

export function isoDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return lang() === "de" ? `${day}.${month}.${year}` : `${day}/${month}/${year}`;
}

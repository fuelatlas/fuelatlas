import { PART_ORDER, partColor, type PartKey } from "./colors";
import type { Breakdown } from "./data";
import { cents, number, percent } from "./format";
import { t } from "./i18n";

/** The four parts of a pump price, bottom of the stack first. */
export function parts(entry: Breakdown): { key: PartKey; value: number }[] {
  return PART_ORDER.map((key) => ({ key, value: entry[key] })).filter((part) => part.value > 0);
}

/**
 * A stacked bar of the price build-up.
 *
 * Segments are flex items with `flex-basis: 0`, so the 2px surface gaps come out
 * of the track and the remaining width stays exactly proportional to the values.
 */
export function stackedBar(entry: Breakdown): HTMLElement {
  const bar = document.createElement("div");
  bar.className = "stack";
  bar.setAttribute("role", "img");
  bar.setAttribute(
    "aria-label",
    parts(entry)
      .map((part) => `${t(`part.${part.key}`)} ${cents(part.value)}`)
      .join(", "),
  );

  for (const part of parts(entry)) {
    const segment = document.createElement("div");
    segment.className = "stack-part";
    segment.style.flexGrow = String(part.value);
    segment.style.background = partColor(part.key);
    bar.append(segment);
  }
  return bar;
}

/**
 * Value-led rows keyed by a short stroke of the segment colour.
 *
 * The second column is each part's share of the pump price, which is not the
 * same number as a tax rate and was being read as one: 19 % VAT on the net
 * price is 16 % of what the customer pays. The column is therefore captioned,
 * and the VAT row carries its own rate in its name.
 */
export function breakdownRows(entry: Breakdown): HTMLElement {
  const list = document.createElement("dl");
  list.className = "parts";

  // Spans both columns rather than sitting in the value column: as the widest
  // thing in that column it dictated its width, squeezing the labels until
  // "Energie-/Verbrauchsteuer" broke mid-word.
  const shareCaption = document.createElement("dd");
  shareCaption.className = "parts-caption";
  shareCaption.textContent = t("parts.share");
  list.append(shareCaption);

  for (const part of parts(entry)) {
    const key = document.createElement("dt");
    const swatch = document.createElement("span");
    swatch.className = "key-line";
    swatch.style.background = partColor(part.key);
    const name =
      part.key === "vat"
        ? `${t("part.vat")} (${formatRate(entry.vat_rate)})`
        : t(`part.${part.key}`);
    // A real element, not a text node: the text has to be its own flex item to
    // get min-width:0, otherwise it never shrinks and runs into the figures.
    const label = document.createElement("span");
    label.className = "part-name";
    label.textContent = name;
    key.append(swatch, label);

    const value = document.createElement("dd");
    const amount = document.createElement("strong");
    amount.textContent = `${cents(part.value)} ct`;
    const share = document.createElement("span");
    share.className = "muted";
    share.textContent = percent(part.value / entry.gross, 0);
    value.append(amount, share);

    list.append(key, value);
  }
  return list;
}

/** "19 %" — the statutory rate, shown next to the VAT row's name. A no-break
 *  space keeps the number and the sign on one line when the label wraps. */
function formatRate(rate: number): string {
  return `${number(rate, 1)}\u00A0%`;
}

export function notesFor(entry: Breakdown): HTMLElement | null {
  if (!entry.notes?.length) return null;
  const box = document.createElement("p");
  box.className = "notes";
  box.textContent = entry.notes.map((note) => t(`note.${note}`)).join(" ");
  return box;
}

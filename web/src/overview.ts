/**
 * The detail panel's resting state: the EU-27 reference figures and the two
 * ends of the range, shown until a country is picked. It occupies the same slot
 * as a country's detail view, so the panel is never an empty box.
 */

import type { Latest, Metric } from "./data";
import { euroPerLitre, percent } from "./format";
import { t } from "./i18n";

export interface OverviewContext {
  latest: Latest;
  metric: Metric;
  product: string;
  ranking: string[];
  values: Map<string, number>;
  name(country: string): string;
  format(value: number): string;
  onSelect(country: string): void;
}

export function renderOverview(context: OverviewContext): Node[] {
  const title = document.createElement("h3");
  title.textContent = t("eu.average");

  const aggregate = context.latest.aggregates["EU27"]?.[context.product];
  const figures = document.createElement("div");
  figures.className = "figures";
  if (aggregate) {
    const tax = aggregate.gross - aggregate.net;
    figures.append(
      figure(euroPerLitre(aggregate.net), t("metric.net")),
      figure(euroPerLitre(aggregate.gross), t("metric.gross")),
      figure(percent(tax / aggregate.gross), t("metric.tax_share")),
    );
  }

  const left = document.createElement("div");
  left.append(title, figures, ends(context));

  const right = document.createElement("div");
  const hint = document.createElement("p");
  hint.className = "muted hint";
  hint.textContent = t("hint.select");
  right.append(hint);

  const body = document.createElement("div");
  body.className = "detail-body";
  body.append(left, right);
  return [body];
}

function ends(context: OverviewContext): HTMLElement {
  const { ranking, values } = context;
  const list = document.createElement("div");
  list.className = "ends";

  const pairs: [string | undefined, string][] = [
    [ranking[ranking.length - 1], t("overview.cheapest")],
    [ranking[0], t("overview.dearest")],
  ];
  for (const [code, label] of pairs) {
    if (!code) continue;
    const value = values.get(code);
    if (value === undefined) continue;

    const row = document.createElement("button");
    row.type = "button";
    row.className = "end-row";
    row.addEventListener("click", () => context.onSelect(code));

    const caption = document.createElement("span");
    caption.className = "muted";
    caption.textContent = label;
    const name = document.createElement("span");
    name.className = "end-name";
    name.textContent = context.name(code);
    const amount = document.createElement("strong");
    amount.textContent = context.format(value);

    row.append(caption, name, amount);
    list.append(row);
  }
  return list;
}

function figure(value: string, label: string): HTMLElement {
  const box = document.createElement("div");
  box.className = "figure";
  const strong = document.createElement("strong");
  strong.textContent = value;
  const caption = document.createElement("span");
  caption.textContent = label;
  box.append(strong, caption);
  return box;
}

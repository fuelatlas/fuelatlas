import { breakdownRows, notesFor, stackedBar } from "./breakdown";
import type { Breakdown, Metric } from "./data";
import { euroPerLitre, percent, signedPercent } from "./format";
import { t } from "./i18n";

export interface TooltipContext {
  country: string;
  name: string;
  entry: Breakdown;
  metric: Metric;
  rank: number;
  total: number;
  euAverage: number | null;
}

const OFFSET = 16;

export class Tooltip {
  private readonly element: HTMLElement;

  constructor(private readonly host: HTMLElement) {
    this.element = document.createElement("div");
    this.element.className = "tooltip";
    this.element.hidden = true;
    this.element.setAttribute("role", "status");
    host.append(this.element);
  }

  hide(): void {
    this.element.hidden = true;
  }

  show(context: TooltipContext, event?: PointerEvent | FocusEvent): void {
    this.element.replaceChildren(...render(context));
    this.element.hidden = false;
    this.position(event);
  }

  private position(event?: PointerEvent | FocusEvent): void {
    const bounds = this.host.getBoundingClientRect();
    const box = this.element.getBoundingClientRect();

    let x: number;
    let y: number;
    if (event && "clientX" in event) {
      x = event.clientX - bounds.left + OFFSET;
      y = event.clientY - bounds.top + OFFSET;
    } else if (event?.target instanceof SVGGraphicsElement) {
      // Keyboard focus: anchor to the country itself.
      const target = event.target.getBoundingClientRect();
      x = target.right - bounds.left + OFFSET;
      y = target.top - bounds.top;
    } else {
      x = OFFSET;
      y = OFFSET;
    }

    this.element.style.left = `${Math.max(8, Math.min(x, bounds.width - box.width - 8))}px`;
    this.element.style.top = `${Math.max(8, Math.min(y, bounds.height - box.height - 8))}px`;
  }
}

function render(context: TooltipContext): Node[] {
  const { entry, metric } = context;

  const title = document.createElement("h3");
  title.textContent = context.name;

  const headline = document.createElement("p");
  headline.className = "headline";
  const value = document.createElement("strong");
  value.textContent =
    metric === "tax_share"
      ? percent(entry.tax_share)
      : euroPerLitre(metricNumber(entry, metric));
  const caption = document.createElement("span");
  caption.textContent = t(`metric.${metric}`);
  headline.append(value, caption);

  const context_line = document.createElement("p");
  context_line.className = "context-line";
  const rank = document.createElement("span");
  rank.textContent = `${t("rank")} ${context.rank}/${context.total}`;
  context_line.append(rank);
  if (context.euAverage !== null && context.euAverage > 0) {
    const delta = document.createElement("span");
    const own = metric === "tax_share" ? entry.tax_share : metricNumber(entry, metric);
    delta.textContent = `${signedPercent(own / context.euAverage - 1)} ${t("vs.eu")}`;
    context_line.append(delta);
  }

  const nodes: Node[] = [title, headline, context_line, stackedBar(entry), breakdownRows(entry)];

  const total = document.createElement("p");
  total.className = "total-line";
  const totalLabel = document.createElement("span");
  totalLabel.textContent = t("metric.gross");
  const totalValue = document.createElement("strong");
  totalValue.textContent = euroPerLitre(entry.gross);
  total.append(totalLabel, totalValue);
  nodes.push(total);

  const notes = notesFor(entry);
  if (notes) nodes.push(notes);
  return nodes;
}

function metricNumber(entry: Breakdown, metric: Metric): number {
  switch (metric) {
    case "net":
      return entry.net;
    case "gross":
      return entry.gross;
    case "tax_total":
      return entry.vat + entry.excise + entry.other;
    case "tax_share":
      return entry.tax_share;
  }
}

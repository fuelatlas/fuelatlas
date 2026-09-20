import { breakdownRows, notesFor, stackedBar } from "./breakdown";
import { timeSeries } from "./chart";
import { loadHistory, type Breakdown, type ExchangeRate } from "./data";
import { euroPerLitre, isoDate, number, percent } from "./format";
import { t } from "./i18n";

export interface DetailContext {
  country: string;
  name: string;
  product: string;
  productLabel: string;
  entry: Breakdown;
  /** Set for countries outside the euro area, whose figures were converted. */
  rate?: ExchangeRate;
}

export class DetailPanel {
  private token = 0;

  constructor(
    private readonly element: HTMLElement,
    private readonly onClose: () => void,
  ) {}

  clear(): void {
    this.token += 1;
    this.element.hidden = true;
    this.element.replaceChildren();
  }

  /** The panel's resting state: EU-wide context instead of an empty column. */
  showOverview(nodes: Node[]): void {
    this.token += 1;
    this.element.hidden = false;
    this.element.replaceChildren(...nodes);
  }

  show(context: DetailContext): void {
    const token = ++this.token;
    this.element.hidden = false;

    const left = document.createElement("div");
    left.append(...summary(context));
    const right = document.createElement("div");
    const body = document.createElement("div");
    body.className = "detail-body";
    body.append(left, right);
    this.element.replaceChildren(...header(context, this.onClose), body);

    const placeholder = document.createElement("p");
    placeholder.className = "muted";
    placeholder.textContent = t("history.loading");
    right.append(placeholder);

    loadHistory(context.country)
      .then((history) => {
        if (token !== this.token) return; // a later selection won the race
        const series = history.series[context.product];
        if (!series) {
          placeholder.textContent = t("nodata");
          return;
        }
        const heading = document.createElement("h4");
        heading.textContent = `${t("history.title")} — ${context.productLabel}`;
        placeholder.replaceWith(heading, timeSeries(series));
      })
      .catch(() => {
        if (token === this.token) placeholder.textContent = t("nodata");
      });

    this.element.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

function header(context: DetailContext, onClose: () => void): Node[] {
  const bar = document.createElement("div");
  bar.className = "detail-header";

  const title = document.createElement("h3");
  title.textContent = context.name;

  const close = document.createElement("button");
  close.type = "button";
  close.className = "close";
  close.textContent = "✕";
  close.setAttribute("aria-label", t("close"));
  close.addEventListener("click", onClose);

  bar.append(title, close);
  return [bar];
}

function summary(context: DetailContext): Node[] {
  const { entry } = context;

  const figures = document.createElement("div");
  figures.className = "figures";
  figures.append(
    figure(euroPerLitre(entry.net), t("metric.net")),
    figure(euroPerLitre(entry.gross), t("metric.gross")),
    figure(percent(entry.tax_share), t("metric.tax_share")),
  );

  const nodes: Node[] = [figures, stackedBar(entry), breakdownRows(entry)];
  const notes = notesFor(entry);
  if (notes) nodes.push(notes);
  if (context.rate) nodes.push(conversionNote(context.rate));
  return nodes;
}

/** Which rate the euro figures came from — the site is otherwise silent on it. */
function conversionNote(rate: ExchangeRate): HTMLElement {
  const note = document.createElement("p");
  note.className = "notes";
  note.textContent = `${t("fx.converted")} 1 € = ${number(rate.units_per_eur)} ${rate.currency} (${t(
    `fx.source.${rate.source}`,
  )}, ${isoDate(rate.date)})`;
  return note;
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

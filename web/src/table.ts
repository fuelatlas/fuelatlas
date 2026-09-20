/**
 * The hover-free path to every number on the map — required for keyboard and
 * screen-reader users, and the fastest way to compare two countries by eye.
 * Every column sorts, ascending and descending.
 */

import { partColor } from "./colors";
import type { Breakdown, Metric } from "./data";
import { cents, euroPerLitre, percent } from "./format";
import { t } from "./i18n";

export type SortColumn = "country" | "net" | "excise" | "other" | "vat" | "gross" | "tax_share";
export type SortDirection = "asc" | "desc";

export interface Sort {
  column: SortColumn;
  direction: SortDirection;
}

export interface TableContext {
  entries: [string, Breakdown][];
  names: Record<string, string>;
  metric: Metric;
  sort: Sort;
  /** Phone layout: the breakdown columns are hidden, so headings go short. */
  compact: boolean;
  onSort(sort: Sort): void;
  onSelect(country: string): void;
}

const COLUMNS: { key: Exclude<SortColumn, "country">; label: string; short?: string }[] = [
  { key: "net", label: "part.net", short: "col.net.short" },
  { key: "excise", label: "part.excise" },
  { key: "other", label: "part.other" },
  { key: "vat", label: "part.vat" },
  { key: "gross", label: "metric.gross", short: "col.gross.short" },
  { key: "tax_share", label: "metric.tax_share", short: "col.tax_share.short" },
];

const PART_KEYS = new Set(["net", "excise", "other", "vat"]);

/** The sort the table opens with: the mapped metric, dearest first. */
export function defaultSort(metric: Metric): Sort {
  const column: SortColumn = metric === "tax_total" ? "gross" : metric;
  return { column, direction: "desc" };
}

export function renderTable(context: TableContext): HTMLElement {
  const { sort } = context;
  const sorted = [...context.entries].sort((a, b) => {
    const order = sort.direction === "asc" ? 1 : -1;
    if (sort.column === "country") {
      return (context.names[a[0]] ?? a[0]).localeCompare(context.names[b[0]] ?? b[0]) * order;
    }
    return (a[1][sort.column] - b[1][sort.column]) * order;
  });

  const table = document.createElement("table");
  table.className = "data-table";

  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  headRow.append(sortableHeader(context, "country", t("table.country"), "left"));
  for (const column of COLUMNS) {
    const heading = context.compact && column.short ? t(column.short) : t(column.label);
    const cell = sortableHeader(context, column.key, heading, "right");
    if (PART_KEYS.has(column.key)) {
      const stroke = document.createElement("span");
      stroke.className = "key-line";
      stroke.style.background = partColor(column.key as "net" | "excise" | "other" | "vat");
      cell.firstElementChild?.prepend(stroke);
    }
    headRow.append(cell);
  }
  head.append(headRow);

  const body = document.createElement("tbody");
  for (const [code, entry] of sorted) {
    const row = document.createElement("tr");
    row.tabIndex = 0;
    row.addEventListener("click", () => context.onSelect(code));
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter") context.onSelect(code);
    });

    const name = document.createElement("th");
    name.scope = "row";
    name.textContent = context.names[code] ?? code;
    row.append(name);

    for (const column of COLUMNS) {
      const cell = document.createElement("td");
      if (column.key === "tax_share") {
        cell.textContent = percent(entry.tax_share);
      } else if (column.key === "gross") {
        cell.textContent = euroPerLitre(entry.gross);
      } else {
        cell.textContent = `${cents(entry[column.key])} ct`;
      }
      if (column.key === sort.column) cell.classList.add("sorted");
      row.append(cell);
    }
    body.append(row);
  }

  table.append(head, body);
  return table;
}

function sortableHeader(
  context: TableContext,
  column: SortColumn,
  label: string,
  align: "left" | "right",
): HTMLTableCellElement {
  const cell = document.createElement("th");
  cell.scope = "col";
  cell.style.textAlign = align;

  const active = context.sort.column === column;
  cell.setAttribute("aria-sort", active ? (context.sort.direction === "asc" ? "ascending" : "descending") : "none");

  const button = document.createElement("button");
  button.type = "button";
  button.className = active ? "sort-button active" : "sort-button";
  button.append(document.createTextNode(label));

  const arrow = document.createElement("span");
  arrow.className = "sort-arrow";
  // A column that is not sorted still shows where clicking would take you.
  arrow.textContent = active ? (context.sort.direction === "asc" ? "↑" : "↓") : "↕";
  button.append(arrow);

  button.addEventListener("click", () => {
    if (!active) {
      // Names read best A-Z; numbers read best largest-first.
      context.onSort({ column, direction: column === "country" ? "asc" : "desc" });
    } else {
      context.onSort({ column, direction: context.sort.direction === "asc" ? "desc" : "asc" });
    }
  });

  cell.append(button);
  return cell;
}

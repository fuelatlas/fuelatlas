export type Lang = "de" | "en";

type Dict = Record<string, string>;

const de: Dict = {
  "title": "Was Sprit wirklich kostet",
  "page.title": "Was Sprit wirklich kostet — Kraftstoffpreise in Europa ohne Steuern",
  "subtitle": "Kraftstoffpreise in der EU — ohne Steuern und Abgaben verglichen",
  "product": "Kraftstoff",
  "metric": "Darstellung",
  "metric.net": "Preis ohne Steuern",
  "metric.gross": "Preis an der Zapfsäule",
  "metric.tax_share": "Steueranteil",
  "metric.tax_total": "Steuerlast",
  "metric.net.help": "Der reine Produktpreis — was das Land ohne staatliche Aufschläge zahlt.",
  "metric.gross.help": "Was Autofahrerinnen und Autofahrer tatsächlich an der Zapfsäule zahlen.",
  "metric.tax_share.help": "Anteil von Steuern und Abgaben am Endpreis.",
  "metric.tax_total.help": "Steuern und Abgaben zusammen, je Liter.",
  "part.net": "Produktpreis",
  "part.excise": "Energie-/Verbrauchsteuer",
  "part.other": "Sonstige Abgaben",
  "part.vat": "Mehrwertsteuer",
  "parts.share": "Anteil am Endpreis",
  "legend.cheap": "günstiger",
  "legend.expensive": "teurer",
  "legend.lower": "niedriger",
  "legend.higher": "höher",
  "nodata": "Keine Daten",
  "week": "Datenstand",
  "week.of": "Woche vom",
  "hint.select": "Land anklicken für Verlauf seit 2005",
  "overview.cheapest": "Am günstigsten",
  "overview.dearest": "Am teuersten",
  "eu.average": "EU-27-Durchschnitt",
  "rank": "Rang",
  "of27": "von 27",
  "vs.eu": "zum EU-Schnitt",
  "table.show": "Alle Länder als Tabelle",
  "table.hide": "Tabelle ausblenden",
  "table.country": "Land",
  "col.net.short": "Netto",
  "col.gross.short": "Zapfsäule",
  "col.tax_share.short": "Steuern",
  "history.title": "Verlauf seit 2005",
  "history.gross": "Mit Steuern",
  "history.net": "Ohne Steuern",
  "history.loading": "Lade Verlauf …",
  "close": "Schließen",
  "sources": "Quellen",
  "note.excise_table_outdated":
    "Die Verbrauchsteuer ist aus dem amtlichen Preispaar abgeleitet; die Steuertabelle der Kommission nennt für diese Woche einen abweichenden Satz.",
  "note.levies_exceed_specific_duty":
    "Die gemeldeten Abgaben übersteigen die gesamte Verbrauchsteuer; sie sind hier zusammengefasst.",
  "note.vat_rate_implausible": "Der gemeldete Mehrwertsteuersatz passt nicht zum Preispaar dieser Woche.",
  "note.other_levies_unknown": "Für dieses Land sind keine gesonderten Abgaben gemeldet.",
  "methodology": "Methodik",
  "theme.toggle": "Design wechseln",
  "lang.toggle": "Sprache wechseln",
  "perLitre": "je Liter",
  "fx.converted": "Umgerechnet mit",
  "fx.source.wob": "Kurs des Weekly Oil Bulletin",
  "fx.source.ecb": "EZB-Referenzkurs",
};

const en: Dict = {
  "title": "What fuel really costs",
  "page.title": "What fuel really costs — European fuel prices before tax",
  "subtitle": "EU fuel prices, compared with taxes and duties stripped out",
  "product": "Fuel",
  "metric": "Show",
  "metric.net": "Price before tax",
  "metric.gross": "Price at the pump",
  "metric.tax_share": "Tax share",
  "metric.tax_total": "Tax burden",
  "metric.net.help": "The product price alone — what the country pays before the state adds anything.",
  "metric.gross.help": "What drivers actually hand over at the pump.",
  "metric.tax_share.help": "Share of taxes and duties in the final price.",
  "metric.tax_total.help": "Taxes and duties combined, per litre.",
  "part.net": "Product price",
  "part.excise": "Excise duty",
  "part.other": "Other levies",
  "part.vat": "VAT",
  "parts.share": "share of pump price",
  "legend.cheap": "cheaper",
  "legend.expensive": "dearer",
  "legend.lower": "lower",
  "legend.higher": "higher",
  "nodata": "No data",
  "week": "Data as of",
  "week.of": "week of",
  "hint.select": "Click a country for its series since 2005",
  "overview.cheapest": "Cheapest",
  "overview.dearest": "Dearest",
  "eu.average": "EU-27 average",
  "rank": "Rank",
  "of27": "of 27",
  "vs.eu": "vs EU average",
  "table.show": "All countries as a table",
  "table.hide": "Hide table",
  "table.country": "Country",
  "col.net.short": "Net",
  "col.gross.short": "Pump",
  "col.tax_share.short": "Tax",
  "history.title": "Since 2005",
  "history.gross": "With taxes",
  "history.net": "Before taxes",
  "history.loading": "Loading series …",
  "close": "Close",
  "sources": "Sources",
  "note.excise_table_outdated":
    "The excise duty is derived from the official price pair; the Commission's tax table quotes a different rate for this week.",
  "note.levies_exceed_specific_duty":
    "Reported levies exceed the entire specific duty, so they are shown combined.",
  "note.vat_rate_implausible": "The reported VAT rate does not fit this week's price pair.",
  "note.other_levies_unknown": "No separate levies are reported for this country.",
  "methodology": "Methodology",
  "theme.toggle": "Switch theme",
  "lang.toggle": "Switch language",
  "perLitre": "per litre",
  "fx.converted": "Converted at",
  "fx.source.wob": "Weekly Oil Bulletin rate",
  "fx.source.ecb": "ECB reference rate",
};

const DICTS: Record<Lang, Dict> = { de, en };

let current: Lang = "en";

export function setLang(lang: Lang): void {
  current = lang;
  document.documentElement.lang = lang;
  document.title = t("page.title");
}

export function lang(): Lang {
  return current;
}

export function t(key: string): string {
  return DICTS[current][key] ?? key;
}

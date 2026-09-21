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
  "metric.burden": "Belastung",
  "explain.burden.title": "Was „Belastung“ hier heißt",
  "explain.burden.body":
    "Der Preis eines Liters an der Zapfsäule, geteilt durch das, was einer Person an einem Tag zur Verfügung steht. Zugrunde liegt das verfügbare Einkommen im Median — also netto: nach Abzug von Steuern und Sozialabgaben, wobei Renten und andere Sozialleistungen als Einkommen zählen. Der Haushaltsbetrag wird auf die Haushaltsgröße umgerechnet (erster Erwachsener 1,0; weitere Personen ab 14 Jahren 0,5; Kinder darunter 0,3). Eurostat EU-SILC, Bezugsjahr {year}.",
  "explain.burden.formula": "Preis je Liter ÷ (Jahreseinkommen ÷ 365)",
  "explain.burden.example": "Beispiel {country}:",
  "explain.burden.reading":
    "Ein Liter kostet dort also {value} dessen, was eine Person an einem Tag zur Verfügung hat. Zum Vergleich: in {other} sind es {othervalue}.",
  "burden.income": "Nettoeinkommen (Median)",
  "burden.perDay": "davon an einem Tag",
  "explain.burden.missing":
    "Für das Vereinigte Königreich veröffentlicht Eurostat keine Einkommen mehr; es bleibt bei dieser Darstellung ohne Farbe.",
  "metric.burden.help":
    "Was ein Liter an der Zapfsäule kostet, gemessen am verfügbaren Nettoeinkommen: Anteil eines Tageseinkommens. Medianeinkommen von Eurostat, Bezugsjahr {year}. Für das Vereinigte Königreich liegen keine Werte vor.",
  "part.net": "Produktpreis",
  // Soft hyphens: the word is wider than the tooltip column and would
  // otherwise be broken wherever the line happens to end.
  "part.excise": "Energie-/Ver\u00ADbrauch\u00ADsteuer",
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
  "privacy.title": "Datenschutz",
  "privacy.body":
    "Diese Seite erhebt selbst keine Daten: keine Cookies, kein Tracking, keine Formulare, keine externen Schriften oder CDNs. Die Wahl von Sprache und Design wird im Browser gespeichert und verlässt das Gerät nicht. Gehostet wird die Seite bei GitHub Pages; beim Abruf fallen dort Server-Logs mit IP-Adresse an, für die GitHub verantwortlich ist.",
  "privacy.link": "Datenschutzerklärung von GitHub",
  "caveat.title": "Zur Vergleichbarkeit",
  "caveat.body":
    "Die Länder erheben ihre Preise unterschiedlich, und das begrenzt jeden Vergleich. 13 Staaten melden nach Absatzmenge gewichtete Mittelwerte, 14 ein ungewichtetes Mittel über die erfassten Tankstellen. Luxemburg meldet amtliche Höchstpreise — gezahlt wird weniger. In Irland liefert ein einziges Mineralölunternehmen den Landesdurchschnitt für Benzin und Diesel. Rabatte rechnen nur einzelne Länder heraus, und die Marktabdeckung reicht von rund 70 % bis nahezu vollständig. Ein Abstand von ein bis zwei Cent zwischen zwei Ländern kann daher allein aus der Erhebungsmethode stammen. Für die Belastung gilt derselbe Vorbehalt ein zweites Mal: die Einkommen stammen aus EU-SILC, das die Mitgliedstaaten ebenfalls unterschiedlich erheben, und sie beziehen sich auf ein ganzes Jahr, die Preise auf eine Woche.",
  "caveat.link": "Methodik der einzelnen Länder bei der Kommission",
  "caveat.short":
    "Jedes Land ermittelt seine Preise anders — kleine Abstände zwischen zwei Ländern sagen daher wenig aus.",
  "caveat.short.link": "Wie die Länder messen",
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
  "metric.burden": "Burden",
  "explain.burden.title": "What “burden” means here",
  "explain.burden.body":
    "The price of one litre at the pump, divided by what one person has available on one day. The basis is median disposable income — net, that is: after taxes and social contributions, with pensions and other benefits counted as income. The household figure is divided by an adjusted headcount (first adult 1.0, each further person aged 14+ 0.5, each younger child 0.3). Eurostat EU-SILC, reference year {year}.",
  "explain.burden.formula": "price per litre ÷ (annual income ÷ 365)",
  "explain.burden.example": "Example {country}:",
  "explain.burden.reading":
    "So a litre there costs {value} of what one person has available in a day. For comparison, in {other} it is {othervalue}.",
  "burden.income": "Median income, after tax",
  "burden.perDay": "of which in one day",
  "explain.burden.missing":
    "Eurostat no longer publishes incomes for the United Kingdom, so it stays uncoloured on this metric.",
  "metric.burden.help":
    "What a litre at the pump costs measured against disposable income, after tax: the share of one day's income. Median income from Eurostat, reference year {year}. No figures are available for the United Kingdom.",
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
  "privacy.title": "Privacy",
  "privacy.body":
    "This site collects nothing itself: no cookies, no tracking, no forms, no external fonts or CDNs. Your choice of language and theme is kept in your browser and never leaves your device. The site is hosted on GitHub Pages, where each request leaves a server log entry including your IP address, for which GitHub is responsible.",
  "privacy.link": "GitHub's privacy statement",
  "caveat.title": "On comparability",
  "caveat.body":
    "Countries collect their prices in different ways, and that limits every comparison. 13 report averages weighted by the volume sold, 14 an unweighted mean across the stations they survey. Luxembourg reports official maximum prices — drivers pay less. In Ireland a single oil company supplies the national average for petrol and diesel. Only some countries strip out discounts, and market coverage ranges from about 70 % to nearly complete. A gap of one or two cents between two countries may therefore come from the method alone. The burden metric carries the same caveat twice over: incomes come from EU-SILC, which member states also survey differently, and they cover a whole year where the prices cover a week.",
  "caveat.link": "Per-country methodology at the Commission",
  "caveat.short":
    "Every country works out its prices differently, so a small gap between two of them means little.",
  "caveat.short.link": "How the countries measure",
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

// Copy into your application; import this local file, not a private package path.
// Complete bundles avoid English fallback when optional controls appear later.
/** @satisfies {Required<import('@vmitsaras/raveldex/addons/ui/inline').InlineUIMessages>} */
const inline = Object.freeze({
  label: 'Website durchsuchen', placeholder: 'Suchbegriff', submit: 'Suchen', clear: 'Suche löschen',
  idle: 'Geben Sie einen Suchbegriff ein.', searching: 'Suche läuft…',
  noResults: 'Keine Treffer für „{query}“. Versuchen Sie einen anderen Suchbegriff.',
  noResultsFiltered: 'Keine Treffer mit diesen Filtern. Ändern Sie einen Filter oder löschen Sie Suche und Filter.',
  resultsLabel: 'Suchergebnisse', resultsOne: '{total} Ergebnis. Angezeigt: {count}.', resultsMany: 'Ergebnisse: {total}. Angezeigt: {count}.',
  error: 'Die Suche konnte nicht abgeschlossen werden. Versuchen Sie es erneut oder ändern Sie den Suchbegriff.', retry: 'Suche erneut versuchen',
  composing: 'Schließen Sie die Texteingabe ab, um zu suchen.', loadMore: 'Weitere Ergebnisse laden',
  newResults: 'Zu den neuen Ergebnissen', resultsAdded: 'Hinzugefügt: {added}. Angezeigt: {start}–{end} von {total}.',
  previous: 'Vorherige Ergebnisse', next: 'Nächste Ergebnisse', paginationLabel: 'Ergebnisseiten',
  pageSummary: 'Angezeigt: {start}–{end} von {total}.',
  windowLimit: 'Dieses Fenster zeigt {count} Ergebnisse; {remaining} verbleiben. Mit „Nächste Ergebnisse“ geht es weiter.',
  revisionChanged: 'Die Ergebnisse haben sich geändert. Versuchen Sie die Suche erneut, um aktuelle Ergebnisse zu sehen.',
  all: 'Alle', emptyValue: '(Leere Zeichenfolge)', nullValue: 'Ohne Wert', missingValue: 'Nicht angegeben',
  unlistedValue: '{value} (nicht in den angezeigten Werten)',
  facetSummary: 'Unterschiedliche Werte: {total}; nicht angezeigte Werte: {omitted}. Die Anzahlen berücksichtigen die aktuellen Filter.',
  snippetOmissions: 'Nicht hervorgehobene weitere Fundstellen: {count}.',
  snippetLimits: 'Ein Teil des passenden Texts wird wegen der Ausschnittgrenzen oder langer Treffer nicht angezeigt.',
  sectionCaption: 'Passender Text auf dieser Seite', sectionOmissions: 'Weiterer passender Text wird nicht angezeigt.',
  sectionUnavailable: 'Passender Text ist nicht verfügbar. Versuchen Sie die Suche erneut.',
  sectionStale: 'Passender Text ist wegen veralteter Seitenzuordnungen nicht verfügbar. Laden Sie die aktuellen Zuordnungen neu.',
});
/** @satisfies {Required<import('@vmitsaras/raveldex/addons/ui/inline').InlineUIMessages>} */
const inlineWithFilters = Object.freeze({ ...inline, clear: 'Suche und Filter löschen', idle: 'Geben Sie einen Suchbegriff ein, um Filteroptionen zu sehen.' });
/** @satisfies {Required<import('@vmitsaras/raveldex/addons/ui/modal').ModalUIMessages>} */
const modal = Object.freeze({
  title: 'Dokumentation durchsuchen', close: 'Suche schließen',
  escapeHint: '„Suche schließen“ schließt dieses Fenster. Escape kann zuerst das Suchfeld leeren.',
  shortcutHint: 'Strg/Befehl+K öffnet die Suche außerhalb von Textfeldern.',
});
/** @satisfies {Required<import('@vmitsaras/raveldex/addons/ui/dropdown').DropdownUIMessages>} */
const dropdown = Object.freeze({
  label: 'Website durchsuchen', placeholder: 'Suchbegriff', submit: 'Suchen', clear: 'Suche löschen',
  idle: 'Geben Sie einen Suchbegriff ein.', composing: 'Schließen Sie die Texteingabe ab, um zu suchen.', searching: 'Suche läuft…',
  noResults: 'Keine Treffer für „{query}“. Ändern Sie den Suchbegriff oder öffnen Sie die vollständige Ergebnisseite.',
  resultsLabel: 'Suchergebnisse', resultsOne: '{total} Ergebnis. Angezeigt: {count}.', resultsMany: 'Ergebnisse: {total}. Angezeigt: {count}.',
  error: 'Die Suche konnte nicht abgeschlossen werden. Versuchen Sie es erneut oder ändern Sie den Suchbegriff.',
  retry: 'Suche erneut versuchen', fullResults: 'Alle Ergebnisse ansehen',
  closed: 'Suche ausgeblendet. Ändern Sie den Suchbegriff oder wählen Sie „Suchen“, um sie wieder zu öffnen.',
  noSpace: 'Für diese Ergebnisliste ist nicht genug Platz. Öffnen Sie die vollständige Ergebnisseite.',
  keyboardHint: 'Pfeil hoch/runter wählt ein Ergebnis. Enter öffnet es; ohne Auswahl startet Enter die Suche. Escape blendet Ergebnisse aus. Tab führt weiter.',
});
/** @satisfies {Required<import('@vmitsaras/raveldex/addons/ui/directory/view').DirectoryViewMessages>} */
const directory = Object.freeze({
  label: 'Ressourcen durchsuchen', placeholder: 'Suchbegriff', submit: 'Suchen', clear: 'Alles zurücksetzen',
  filters: 'Ressourcen filtern', closeFilters: 'Filter schließen',
  countHint: 'Die Anzahlen gelten für alle aktuellen Ergebnisse mit Ihrem Suchbegriff und Ihren Filtern, nicht nur für diese Seite. Innerhalb einer Gruppe genügt eine der ausgewählten Optionen. Jede weitere ausgewählte Gruppe muss ebenfalls passen. Eine Option mit 0 kann zusammen mit einer anderen Option ihrer Gruppe zusätzliche Ergebnisse liefern.',
  selectedFilters: 'Ausgewählte Filter', remove: 'Entfernen: {group}: {value}', unknownCount: 'Anzahl nicht verfügbar', emptyValue: '(Leer)',
  omittedCounts: 'Anzahlen für {shown} von {total} Werten verfügbar. Weitere Anzahlen sind nicht verfügbar.', resultsLabel: 'Ergebnisse',
  idle: 'Suchen Sie oder durchsuchen Sie alle Ressourcen.', waiting: 'Die Suche wartet auf Ihre Eingabe.',
  composing: 'Schließen Sie die Texteingabe ab, um zu suchen.', searching: 'Suche läuft…',
  noResults: 'Keine Treffer für „{query}“. Ändern Sie den Suchbegriff oder setzen Sie alles zurück, um Ressourcen zu durchsuchen.',
  noResultsFiltered: 'Keine Treffer mit diesen Filtern. Ändern oder entfernen Sie einen Filter, oder setzen Sie alles zurück.',
  noResultsBrowse: 'Keine Ressourcen vorhanden. Mit „Ergebnisse aktualisieren“ können Sie nach Änderungen suchen.',
  resultOne: '1 Ergebnis. Angezeigt: {start}–{end}.', results: 'Ergebnisse: {total}. Angezeigt: {start}–{end}.',
  previous: 'Vorherige Seite', next: 'Nächste Seite', page: 'Seite {page} von {pages}.',
  error: 'Die Suche konnte nicht abgeschlossen werden. Aktualisieren Sie die Ergebnisse oder ändern Sie Suche und Filter.',
  stale: 'Die Sammlung hat sich geändert. Aktualisieren Sie die Ergebnisse.', retry: 'Ergebnisse aktualisieren',
  invalid: 'Suche oder Auswahl überschreitet die Grenzen. Entfernen Sie eine Option oder kürzen Sie den Suchbegriff.',
});

// These are application data, not a locale registry or a runtime language setter.
export const german = Object.freeze({ inline, inlineWithFilters, modal, dropdown, directory, imageUnavailable: 'Bild nicht verfügbar' });

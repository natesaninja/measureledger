# Screens

Hash-routed single page (`js/app.js`). Top bar: Projects · Search · Calc · More, plus a units chip that cycles ft-in → dec ft → in → m → cm → mm.

| Route | Screen | Status |
|---|---|---|
| `#/` | **Projects** — favorites first, then recent; ＋ quick-add per project; archived toggle; New project (blank or from template) | ✅ |
| `#/p/:id` | **Project** — measurement list (favorites/recent), search + tag/mode/date filters, ＋ Add (FAB), Paste/CSV import with preview, Project ⋯ menu (CSV, report, share file, rename, archive, delete w/ confirm) | ✅ |
| dialog | **Add/Edit measurement** — label (autocomplete), value with live parse preview, kind, mode, reference, group, tags, notes, timestamp; Save + next; delete w/ confirm | ✅ |
| dialog | **Import** — paste or file, default unit for bare numbers, preview of parsed rows and skipped lines | ✅ |
| `#/search` | **Search all** — across projects, favorites only, same filters | ✅ |
| `#/calc` | **Calculators** — area, volume, Pythagorean, squareness (diagonals + tolerance), slope, flooring boxes, drywall sheets, fence/deck posts, cut list; inputs accept any unit and suggest saved measurements | ✅ |
| `#/report/:id` | **Report** — printable table with dual units → Print / Save as PDF | ✅ |
| `#/settings` | **More** — theme (dark/light/high-contrast), units, fraction precision, backup/restore, project file import, erase all | ✅ |
| `#/audit` | **Audit trail** | ✅ |
| `#/p/:id/plan` | Floor plan sketch canvas | roadmap |
| — | Photo attachments + annotation (IndexedDB) | roadmap |
| — | History comparison view (same label across dates/projects) | roadmap (search covers basic cross-project lookup) |

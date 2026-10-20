# Screens

Hash-routed single page. The top bar has Projects · Search · Compare · Calc · More, plus a units chip that cycles ft-in → dec ft → in → m → cm → mm. Heavy modules (sketch, photos, report, xlsx, ble) are loaded with `import()` only when needed. All of them are precached for offline use.

| Route | Screen | Status |
|---|---|---|
| `#/` | **Projects**: favorites first, quick-add, archived toggle, new project from a template, banner when the last backup is >7 days old | ✅ |
| `#/p/:id` | **Project** with tabs: *Readings* (list + filters), *Plan* (→ editor), *Photos & voice*, *Form* (job form), *Calcs* (saved results). The ⋯ menu has CSV, XLSX, standard/detailed report, plan, share file, rename, archive, delete | ✅ |
| dialog | **Add/Edit measurement**: parses length, area, volume, angle and pitch; mode `pitch` switches kind to slope; photos and voice notes on saved readings | ✅ |
| overlay | **Photo annotator**: arrow, line, box, text, pinned reading, color, undo, export annotated JPG, delete | ✅ |
| `#/plan/:id` | **Plan editor** (SVG): floors, rooms (draw by taps or start from a rectangle), snap 45°/10 cm, select a wall → assign reading or typed length, label, openings; diagonal checks; area, perimeter, wall gross/net, volume, closure gap, squareness; export SVG/PNG/DXF 2D/DXF 3D/points CSV | ✅ |
| `#/search` | **Search all** | ✅ |
| `#/compare` | **Compare**: labels used more than once → table across projects and dates with Δ vs previous and Δ vs first, plus range and spread | ✅ |
| `#/calc` | **Calculators**: roof pitch/rafter, earthworks (grid or average depth, swell), area, volume, Pythagorean, squareness, slope, flooring, drywall, posts, cut list; "Save to project" | ✅ |
| `#/report/:id[/detailed]` | **Report**: standard (summary, form, dual-unit readings, plans, calcs) or detailed (+ wall/opening tables, annotated photos, voice note list, change history) → Print / Save PDF | ✅ |
| `#/settings` | **More**: theme, units, precision, backup (with media)/restore, last backup date, audit, compare, Bluetooth lab | ✅ |
| `#/ble` | **Bluetooth lab** (experimental, Chrome/Android/desktop only, hidden on iOS) | 🧪 |
| `#/audit` | **Audit trail** | ✅ |

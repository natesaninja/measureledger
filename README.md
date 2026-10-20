# MeasureLedger

Offline-first PWA companion for the **Mileseey S50** laser distance meter. The Smart Life app captures; MeasureLedger organizes measurements into jobs, converts units, runs job-site calculators, and exports clean reports.

Vanilla JS, no framework, no build step — same stack as Iron Ledger and MacroLedger.

## Features
- Projects: create from blank or templates (room, exterior wall, deck/posts, vehicle clearance, cabinet fit, plumbing runs, fence, laminate flooring), rename, favorite, archive, delete (with confirm)
- Measurements: value, kind (length/area/volume/angle), S50 mode, reference edge, room/group, tags, notes, timestamp, favorite, source
- Unit parsing: `12' 6 1/2"`, `12'6`, `12 ft 6 in`, `12.54 ft`, `3.82 m`, `382 cm`, `3820mm`, `36"`, `3,82 m`; display in ft-in (1/2–1/32"), decimal ft, in, m, cm, mm
- Import: paste notes (`Label: value #tag`) or CSV, with preview and skipped-line report
- Search & filter: text, tag, mode, date range, per project or across all
- Calculators: area, volume, Pythagorean, diagonal squareness, slope, flooring boxes, drywall sheets (w/ openings + waste), posts, cut list (with kerf)
- Export: full JSON backup/restore, per-project CSV (Excel-friendly, UTF-8 BOM), shareable project file, printable report → PDF
- Audit trail of changes; dark, light, and high-contrast outdoor themes; large tap targets
- Works fully offline after first load (service worker, versioned cache)

## Setup
```bash
cd measureledger
python3 -m http.server 8000   # or: npx serve .
# open http://localhost:8000
npm test                      # node --test, no dependencies
```
Opening `index.html` via `file://` won't work (ES modules + service worker need http).

## Deploy (GitHub Pages)
Push to a repo → Settings → Pages → deploy from branch `main`, folder `/`. All paths are relative so it works under `/<repo>/`.
**On every release bump `CACHE` in `sw.js`** so installed clients pick up the new files.

## Layout
```
index.html  manifest.webmanifest  sw.js
css/app.css
js/app.js        UI + router
js/units.js      parse/format/convert (canonical meters)
js/calc.js       calculators
js/csv.js        CSV + paste import/export
js/model.js      schema, factories, migrations
js/store.js      localStorage, audit, filtering
js/templates.js  job templates
docs/            DATA_MODEL.md, SCREENS.md
tests/           node --test suites
```

## Data & backup
Everything is stored in this browser's localStorage. Export a backup from **More → Export full backup** regularly. See `docs/DATA_MODEL.md`.

## Roadmap
1. Floor plan / room sketch canvas (drop measurements on walls, derived area/perimeter)
2. Photo attachments in IndexedDB + annotation with pinned measurements
3. Comparison/history view (same label across dates and jobs)
4. Bluetooth import from the S50 (Web Bluetooth where supported; `source: "ble"` already in the schema)
5. Direct .xlsx export, more material calculators (paint, concrete, decking boards)

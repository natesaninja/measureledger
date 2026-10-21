# MeasureLedger

Offline-first PWA companion for the **Mileseey S50** laser distance meter. The Smart Life app captures; MeasureLedger organizes measurements into jobs, converts units, runs job-site calculators, and exports clean reports.

Vanilla JS, no framework, no build step — same stack as Iron Ledger and MacroLedger.

## Features
**Projects & readings**
- Projects: blank or from templates (room, exterior wall, deck/posts, vehicle clearance, cabinet fit, plumbing runs, fence, laminate flooring); rename, favorite, archive, delete with confirm
- Measurements: value, kind (length/area/volume/angle/**slope**), S50 mode (incl. pitch), reference edge, room/group, tags, notes, timestamp, favorite, source
- Parsing for every kind:
  - lengths: `12' 6 1/2"`, `12.54 ft`, `3.82 m`, `382 cm`
  - areas: `120 sq ft`, `12 m²`, `12' x 10'`
  - volumes: `3 cu yd`, `500 L`, `2m x 3m x 0.5m`
  - angles/pitch: `30°`, `6/12`, `50%`, `4' / 12'`
- Display in ft-in (1/2–1/32"), decimal ft, in, m, cm, mm
- Import from pasted notes or CSV with a preview; search and filter by text/tag/mode/date; **compare** the same label across rooms, projects and time with differences

**Plans** (`#/plan/:id`)
- SVG room sketch: draw wall by wall, or start from a rectangle; multiple rooms and floors
- Assign readings to walls and the plan rescales to true dimensions. Walls without a reading are adjusted so the room closes; any closure gap is reported
- Automatic area, perimeter, volume, gross/net wall (paint) area. Doors/windows/openings on walls are subtracted
- Squareness from diagonals; measured diagonal checks
- Export SVG, PNG, **DXF** 2D or 3D-extruded walls, and Moasure-style **points CSV**

**Photos & voice**
- Photos from the camera or files, downscaled and stored in IndexedDB, attached to a project or a reading
- Annotator: arrows, lines, boxes, text, and **pins that show a saved reading's live value**; export annotated JPG
- Voice notes via MediaRecorder, stored in IndexedDB

**Calculators**: roof pitch (x/12, °, %, rafter length), earthworks/excavation (grid or average depth, swell), area, volume, Pythagorean, squareness, slope, flooring boxes, drywall sheets, posts, cut list. Results can be saved to a project.

**Job forms**: each template has a form whose fields fill from readings with matching labels, plus derived values and manual overrides. Included in reports and XLSX.

**Export & backup**
- **Real .xlsx** with a built-in, dependency-free writer that works offline (Measurements, Rooms, Walls, Form, Calculations sheets)
- CSV (UTF-8 BOM), shareable project file
- Standard and detailed print/PDF reports with dual units, plans, annotated photos, forms, calcs and history
- Full JSON backup **including photos and voice notes** (base64); a reminder appears after 7 days without a backup

**Bluetooth (experimental)**: a device-adapter interface plus a Web Bluetooth GATT scanner/logger for reverse-engineering the S50 (Chrome on Android/desktop; hidden on iOS). **The S50 is not supported for direct capture yet**; see [docs/BLUETOOTH.md](docs/BLUETOOTH.md).

**App**: works fully offline after the first load (versioned service-worker precache), installable (PNG + SVG icons), dark/light/high-contrast outdoor themes, large tap targets, audit trail.

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
js/app.js         UI + router (core screens)
js/units.js       parse/format/convert: length, area, volume, angle/pitch
js/calc.js        calculators (incl. roof, earthworks)
js/csv.js         CSV + paste import/export
js/model.js       schema v3, factories, migrations
js/store.js       localStorage, audit, filtering, compare, backup reminder
js/templates.js   job templates
js/forms.js       job forms filled from readings
js/media.js       IndexedDB media store, base64 backup, image downscale
js/photos.js      photo/voice UI + annotator           (lazy)
js/sketch-geom.js plan geometry solver, SVG, points CSV
js/sketch.js      plan editor UI + exports              (lazy)
js/dxf.js         DXF R12 writer
js/xlsx.js        dependency-free XLSX writer           (lazy)
js/report.js      standard/detailed report              (lazy)
js/ble.js         Bluetooth adapter interface + scanner
docs/            DATA_MODEL.md, SCREENS.md
tests/           node --test suites
```

## Data & backup
Everything is stored in this browser's localStorage. Export a backup from **More → Export full backup** regularly. See `docs/DATA_MODEL.md`.

Photos and voice notes are in IndexedDB. **Full backups include them**, so backup files can be large.

## Roadmap
1. S50 Bluetooth adapter once the protocol is reverse-engineered (see docs/BLUETOOTH.md)
2. Curved/angled walls beyond 45° snapping; drag-to-edit corners
3. Paint, concrete and decking material calculators wired to plan wall/floor areas
4. Background sync / multi-device (currently single-device + backups)

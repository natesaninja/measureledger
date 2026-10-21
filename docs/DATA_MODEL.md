# MeasureLedger data model (schema v3)

Structured data lives in one JSON document in `localStorage["measureledger.v1"]`. The key name is stable; the version is in `schemaVersion`. **Photos and voice notes live in IndexedDB** (`measureledger-media`, store `media`), never in localStorage.

## Canonical units
- **Lengths are stored in meters** as plain numbers (`value`).
- **Areas in m², volumes in m³, angles in degrees** — determined by `kind`.
- The user's original input is kept in `original` (e.g. `12' 6 1/2"`) and the parsed unit in `unit` (`ftin|ft|in|m|cm|mm|yd`), so nothing is lost in round-trips and display can be in any unit.

## Root
```json
{ "schemaVersion": 3, "projects": [], "measurements": [], "audit": [], "rooms": [], "calcs": [],
  "settings": { "unit": "ftin", "theme": "dark", "denom": 16, "lastBackupAt": null } }
```

## Project
| field | type | notes |
|---|---|---|
| id | string | `p_…` |
| name, description | string | |
| tags | string[] | |
| favorite, archived | bool | |
| template | string\|null | template id used to seed it; also selects the job form |
| form | object | manual overrides for job-form fields `{ fieldKey: value }` (canonical units) |
| createdAt, updatedAt | ISO string | |

## Measurement (flat list, linked by `projectId`)
| field | type | notes |
|---|---|---|
| id | string | `m_…` |
| projectId | string | |
| label | string | "North wall" |
| value | number\|null | canonical (m / m² / m³ / °). `null` = placeholder from a template |
| kind | `length\|area\|volume\|angle\|slope` | slope = roof pitch, stored in degrees |
| unit | string | unit the value was entered in |
| original | string | raw input text |
| mode | `distance\|area\|volume\|p2p\|pythagorean\|continuous\|angle\|manual\|pitch` | S50 measuring mode |
| reference | `rear\|front\|tripod\|pin\|""` | meter reference edge |
| group | string | room / wall / section |
| notes | string | |
| tags | string[] | |
| photoIds | string[] | IndexedDB keys (roadmap) |
| favorite | bool | |
| source | `manual\|paste\|csv\|ble\|template\|import` | `ble` reserved for Bluetooth capture |
| device | object\|null | future: `{ model:"S50", serial, rawPayload }` |
| measuredAt, createdAt, updatedAt | ISO string | |

## Room (plan) — `rooms[]`
| field | notes |
|---|---|
| id, projectId, name, floor | rooms are grouped into floors by `floor` label |
| height | wall height (m), used for wall/paint area and 3D DXF |
| pts | `[{x,y}]` corners as drawn (m) |
| closed | polygon closed? |
| walls[i] | `{ label?, measId?, length? }` for the wall from pts[i] to pts[i+1]; `length` (m) overrides `measId` |
| openings | `[{ wall, type: door\|window\|opening, offset, width, height, sill }]` (m) |
| diagonals | `[{ a, b, measId?, length? }]` corner indexes, for squareness checks |
| offset | `{x,y}` position of the room on its floor (m) |

**Solver** (`js/sketch-geom.js#solveRoom`): each wall keeps its drawn direction. Walls with a reading use the true length. Other walls are scaled by the median reading/drawn ratio. In a closed room with 2+ walls that have no reading, those walls are then adjusted, as little as possible (least squares), so the outline closes. Outputs: true vertices, area (shoelace), perimeter, closure gap, gross/opening/net wall area, volume and diagonal differences.

## Saved calculation — `calcs[]`
`{ id, projectId, type, title, inputs: { name: rawText }, result: text, at }`

## Media record (IndexedDB)
`{ id, kind: photo|audio, mime, blob, projectId, measurementId|null, name, width, height, duration, annotations: [...], createdAt }`
Annotations are normalized to the image (0–1): `{ t: arrow|line|box|text|pin, x1, y1, x2?, y2?, text?, measId?, color }`. `pin` shows the live value of a saved reading.

## Audit entry
`{ id, at, action: create|update|delete|archive|unarchive|import|export|restore, entity: project|measurement|db, entityId, projectId, summary }` — newest first, capped at 2000.

## Files
- **Full backup**: `{ app:"MeasureLedger", exportedAt, data:<root>, media:[{...record without blob, b64}] }`. Media is included as base64. Restore validates, refuses newer schemas, migrates older ones, and replaces everything after confirm.
- **Project file** (share): `{ app, kind:"project", schemaVersion, project, measurements, rooms, calcs }`. Imported as a new project with fresh ids; wall/diagonal reading links are remapped. Media isn't included; use a full backup for that.
- **XLSX**: Measurements, Rooms, Walls, Form and Calculations sheets, written by the built-in `js/xlsx.js` (stored ZIP, no dependencies).
- **DXF** (R12 ASCII, meters): layers WALLS, OPENINGS, LABELS and optionally WALLS3D (3DFACE walls extruded to room height). Y is flipped to DXF y-up.
- **Points CSV**: `Point,X,Y,Z,Room,Floor,Label,Unit` for every corner, Moasure style, in m or ft.
- **CSV**: UTF-8 BOM, CRLF, columns `id,label,value_display,value_m,kind,mode,unit,reference,tags,notes,favorite,source,createdAt,updatedAt`. Re-importing prefers `value_m`; otherwise parses `value`/`value_display`.

## Migrations (`js/model.js#migrate`)
Pure, idempotent, never mutates input.
- v2 → v3: adds `rooms`, `calcs`, `settings.lastBackupAt`, `project.form`.
- v1 → v2: measurements nested in `project.measurements` with `valueM` → flat `measurements[]` with `value`, `kind`, `source`, `photoIds`; settings defaulted.
Add a new `if (v < N)` block per version and bump `SCHEMA_VERSION`.

## Future Bluetooth
A BLE adapter only has to produce `newMeasurement({ value: meters, unit, mode, source:'ble', device:{…} })` and push it — the rest of the app is source-agnostic.

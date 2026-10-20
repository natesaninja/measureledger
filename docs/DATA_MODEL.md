# MeasureLedger data model (schema v2)

All data lives in one JSON document in `localStorage["measureledger.v1"]` (key name is stable; the version inside is `schemaVersion`). Photos (roadmap) will go in IndexedDB, referenced by id, never in localStorage.

## Canonical units
- **Lengths are stored in meters** as plain numbers (`value`).
- **Areas in m², volumes in m³, angles in degrees** — determined by `kind`.
- The user's original input is kept in `original` (e.g. `12' 6 1/2"`) and the parsed unit in `unit` (`ftin|ft|in|m|cm|mm|yd`), so nothing is lost in round-trips and display can be in any unit.

## Root
```json
{ "schemaVersion": 2, "projects": [], "measurements": [], "audit": [],
  "settings": { "unit": "ftin", "theme": "dark", "denom": 16 } }
```

## Project
| field | type | notes |
|---|---|---|
| id | string | `p_…` |
| name, description | string | |
| tags | string[] | |
| favorite, archived | bool | |
| template | string\|null | template id used to seed it |
| createdAt, updatedAt | ISO string | |

## Measurement (flat list, linked by `projectId`)
| field | type | notes |
|---|---|---|
| id | string | `m_…` |
| projectId | string | |
| label | string | "North wall" |
| value | number\|null | canonical (m / m² / m³ / °). `null` = placeholder from a template |
| kind | `length\|area\|volume\|angle` | |
| unit | string | unit the value was entered in |
| original | string | raw input text |
| mode | `distance\|area\|volume\|p2p\|pythagorean\|continuous\|angle\|manual` | S50 measuring mode |
| reference | `rear\|front\|tripod\|pin\|""` | meter reference edge |
| group | string | room / wall / section |
| notes | string | |
| tags | string[] | |
| photoIds | string[] | IndexedDB keys (roadmap) |
| favorite | bool | |
| source | `manual\|paste\|csv\|ble\|template\|import` | `ble` reserved for Bluetooth capture |
| device | object\|null | future: `{ model:"S50", serial, rawPayload }` |
| measuredAt, createdAt, updatedAt | ISO string | |

## Audit entry
`{ id, at, action: create|update|delete|archive|unarchive|import|export|restore, entity: project|measurement|db, entityId, projectId, summary }` — newest first, capped at 2000.

## Files
- **Full backup**: `{ app:"MeasureLedger", exportedAt, data:<root> }`. Restore validates, refuses newer schemas, migrates older ones, and replaces everything after confirm.
- **Project file** (share): `{ app, kind:"project", schemaVersion, project, measurements }` — imported as a new project with fresh ids.
- **CSV**: UTF-8 BOM, CRLF, columns `id,label,value_display,value_m,kind,mode,unit,reference,tags,notes,favorite,source,createdAt,updatedAt`. Re-importing prefers `value_m`; otherwise parses `value`/`value_display`.

## Migrations (`js/model.js#migrate`)
Pure, idempotent, never mutates input.
- v1 → v2: measurements nested in `project.measurements` with `valueM` → flat `measurements[]` with `value`, `kind`, `source`, `photoIds`; settings defaulted.
Add a new `if (v < N)` block per version and bump `SCHEMA_VERSION`.

## Future Bluetooth
A BLE adapter only has to produce `newMeasurement({ value: meters, unit, mode, source:'ble', device:{…} })` and push it — the rest of the app is source-agnostic.

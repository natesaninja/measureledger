# Bluetooth (experimental groundwork)

**Status: the Mileseey S50 is NOT supported for direct capture.** Its BLE protocol isn't documented. Keep using the Smart Life app to capture, then paste or CSV-import into MeasureLedger. This document covers the groundwork for adding it later.

## What exists
- `js/ble.js`
  - **Adapter interface**: `registerAdapter({ id, name, match(device), optionalServices, decode(serviceUuid, charUuid, DataView) → { meters, mode? } | null })`.
  - **`scan(log)`**: an experimental Web Bluetooth scanner. The user picks any device (`acceptAllDevices`). It connects to GATT, lists every primary service and characteristic, reads readable characteristics, subscribes to every notify/indicate characteristic and logs each notification as hex. It also logs `guessDecodes()` (ASCII number, float32 LE, uint32/uint16 LE in mm) and any registered adapter's decode.
  - `CANDIDATE_SERVICES`: common UART/serial-bridge services (FFE0, FFF0, FFB0, Nordic UART 6E400001, Device Info 180A, Battery 180F, FEE7, AE30). Web Bluetooth only exposes services listed in `optionalServices`, so new UUIDs found with a generic BLE explorer (e.g. nRF Connect) must be added here.
- **Bluetooth lab screen** (`#/ble`, linked from More): Scan & connect, Disconnect, Download log (JSON). It only appears when `navigator.bluetooth` exists and the device isn't iOS (`bleSupported()`). Web Bluetooth works in Chrome/Edge on Android, ChromeOS, Windows and macOS. It does not work on iOS Safari/Chrome or Firefox.
- **Data model**: measurements carry `source: "ble"` and `device: { model, id, raw }` so captured readings flow through the same list, search, export and audit trail.

## Reverse-engineering workflow
1. Close Smart Life on the phone, because the meter usually accepts only one connection. Turn on the S50's Bluetooth.
2. Open MeasureLedger → More → Bluetooth lab → Scan & connect, then pick the meter.
3. Note which characteristics are subscribed. Take readings of known distances, e.g. 1.000 m, 2.500 m, then 3' 0".
4. Download the log. Look for the hex payload that changes with each reading, and check the guessed decodes against the known distances.
5. Once the framing is understood (header bytes, value offset and encoding, unit/mode flags, checksum), write an adapter:
```js
import { registerAdapter } from './ble.js';
registerAdapter({ id: 's50', name: 'Mileseey S50', optionalServices: ['0000ffe0-0000-1000-8000-00805f9b34fb'],
  match: d => /S50|Mileseey/i.test(d.name || ''),
  decode: (svc, chr, dv) => /* parse dv */ null });
```
6. Add a "capture into project" button that turns `decode()` results into `newMeasurement({ value: meters, unit: 'm', mode, source: 'ble', device: { model: 'S50' } })`.

## Limits
- No pairing/bonding control. Some meters need a write "handshake" before they notify. If so, add the write to the adapter after inspecting Smart Life traffic, e.g. with an Android HCI snoop log.
- Background capture isn't possible; the page must stay open.
- Don't rely on any guessed decode until it's confirmed against known distances.

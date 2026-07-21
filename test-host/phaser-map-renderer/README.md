# Phaser map renderer spike

Isolated browser lab for evaluating Phaser as a strategy-map renderer. It is
not loaded by the Shipping Game plugin, is not referenced by `plugin.json`, and
does not change the game-engine state or export schemas.

The spike reuses the repository's bundled Natural Earth/world-atlas contours.
`generated/map-contours.js` is deterministically produced from
`src/assets/map-contours.json` so the browser does not fetch map data at
runtime.

## Run

```bash
node test-host/phaser-map-renderer/build-data.js
node test-host/phaser-map-renderer/spike-test.js
python3 -m http.server 8774
```

Open:

```text
http://127.0.0.1:8774/test-host/phaser-map-renderer/
```

Drag the map to pan. Use the mouse wheel, trackpad, or the `+` and `−` buttons
to zoom. `Reset view` returns to the Black Sea framing. The fictional vessel
moves automatically along a waypoint corridor; `Pause motion` freezes and
resumes the simulation.

The vessel card and map label show load state instead of course. A laden ship
shows its commodity and metric tonnes (for this fixture: `CORN · 32,521 MT`);
a vessel without cargo is rendered as `BALLAST / IN BALLAST`.

The accelerated voyage cycle models port work and employment between sea
passages: load in Odesa, sail laden to Batumi, discharge, shift to Batumi
Roads, wait for a voyage order, position in ballast to Constanța, wait at
anchor for loading, berth and load, then sail laden to Samsun. The animation
stops at `READY TO DISCHARGE`; `Replay cycle` starts the sequence again.

The corridor separates port approaches from offshore legs. The spike test
checks every offshore leg against the bundled coastline and rejects a segment
that cuts across a shore contour.

## Runtime boundary

- Phaser is vendored locally at exact version `3.90.0`.
- No CDN, tile service, web font, `fetch`, XHR, WebSocket, or runtime import is
  used.
- The page CSP includes `connect-src 'none'`.
- All route, port, and vessel data is fictional training data.

See [vendor/NOTICE.md](vendor/NOTICE.md) and
[vendor/LICENSE.phaser-3.90.0.md](vendor/LICENSE.phaser-3.90.0.md).

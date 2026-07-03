# Shipping Game - Skipi Plugin Lab

First-party Skipi plugin lab for `app.skipi.plugins.shipping-game`.

Phase A scope:

- bundled first-party artifact only;
- static bundled map contours, no tile servers;
- one fictional vessel marker;
- role selector for `captain`, `commercial_manager`, `shipowner`;
- one playable `commercial_manager` scenario with six decisions;
- local versioned score and event log;
- JSON export;
- lab-only assistant tunnel through `/tmp/skipi-game-assistant`;
- scripted fallback when the assistant bridge is absent or times out.

## Build

```bash
node src/build.js
```

Writes:

```text
dist/plugins/shipping-game/
  plugin.json
  index.js
  index.css
  assets/map-contours.json
  checksums.json
  CHANGELOG.md
  REPORT.md
```

## Test

```bash
node src/build.js
node test-host/engine-test.js
node test-host/artifact-readiness-test.js
node test-host/isolation-smoke.mjs
```

Browser lab:

```bash
python3 -m http.server 8774
# http://127.0.0.1:8774/test-host/index.html
# http://127.0.0.1:8774/test-host/contract-test.html
```

Optional assistant bridge:

```bash
node tools/assistant-bridge-server.js
# in the dedicated Game Assistant window, use assistant/GAME_ASSISTANT_BOOT.md
```

## Stop-Lines

- Do not edit Skipi homes in this phase.
- Do not edit `_host-runtime`.
- Do not add runtime network access to the plugin.
- Do not use real vessel, crew, company, token, Firebase, or backend data.
- Integration into Seafarer is Phase B and requires a separate HOME_TASK GO.


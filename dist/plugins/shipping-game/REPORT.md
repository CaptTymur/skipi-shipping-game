# Shipping Game - Artifact Report

Status: Phase A.2 plugin-lab artifact.

Scope:

- bundled first-party only;
- no home integration;
- no direct network in plugin runtime;
- no real vessel, crew, company or backend data;
- assistant bridge is lab-only and host-mediated through `hostApi.assistant.ask`.
- `commercial_manager` Phase A flow remains playable;
- `shipowner` adds deterministic local economy loop with fictional vessels, charter gates, OPEX, sale and honest failure state.

Build:

```bash
node src/build.js
```

Tests:

```bash
node test-host/engine-test.js
node test-host/artifact-readiness-test.js
node test-host/isolation-smoke.mjs
google-chrome --headless --disable-gpu --no-sandbox --virtual-time-budget=25000 --dump-dom http://127.0.0.1:8774/test-host/contract-test.html
```

Known contract request for runtime 1.1:

- additive manifest enum `kind: "game"`;
- additive host capability `assistant.chat` if the assistant becomes a real host-mediated capability outside the lab.

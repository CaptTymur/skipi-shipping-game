# Shipping Game - Artifact Report

Status: Phase A plugin-lab artifact.

Scope:

- bundled first-party only;
- no home integration;
- no direct network in plugin runtime;
- no real vessel, crew, company or backend data;
- assistant bridge is lab-only and host-mediated through `hostApi.assistant.ask`.

Build:

```bash
node src/build.js
```

Tests:

```bash
node test-host/engine-test.js
node test-host/artifact-readiness-test.js
node test-host/isolation-smoke.mjs
```

Known contract request for runtime 1.1:

- additive manifest enum `kind: "game"`;
- additive host capability `assistant.chat` if the assistant becomes a real host-mediated capability outside the lab.


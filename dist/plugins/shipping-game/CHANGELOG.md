# Changelog - Shipping Game

## 0.2.0 - Phase A.2

- Added playable `shipowner` role with deterministic economy loop.
- Added fictional vessel purchase choices, detailing, OPEX ticks, class/vetting charter gates, NPC charter offers, freight settlement, vessel sale and arrest/game-over failure.
- Centralized tunable economic constants in one commented `ECONOMY_CONFIG` block.
- Extended local score, debrief and export log while keeping `shipping-game.log.v1` compatibility.
- Updated lab-only Game Assistant boot context for shipowner cash, OPEX, class/vetting and sale decisions.
- Expanded engine and browser contract tests for the shipowner loop.

## 0.1.0 - Phase A

- Added bundled map-first Shipping Game prototype.
- Added Natural Earth/world-atlas contour asset behind `MapRenderer`.
- Added one fictional vessel marker.
- Added role selector with `commercial_manager` playable and two honest coming-soon roles.
- Added six-decision scenario, consequences, debrief, local score and JSON export.
- Added lab-only assistant tunnel client and boot instructions.
- Added unit, artifact-readiness and host-runtime isolation checks.

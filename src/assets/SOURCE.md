# Map Contours Source

`map-contours.json` is a pinned bundled copy of `world-atlas@2.0.2/land-110m.json`.

The world-atlas package derives its land data from Natural Earth 1:110m land
vectors. Natural Earth vector data is public domain. The plugin does not contact
tile servers or remote map services at runtime.

Phase A intentionally keeps the game logic independent from this data format:
only `MapRenderer` reads the TopoJSON structure.


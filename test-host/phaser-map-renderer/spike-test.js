#!/usr/bin/env node
'use strict';

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Core = require('./map-core.js');
const Model = require('./strategy-model.js');

const HERE = __dirname;
const ROOT = path.join(HERE, '..', '..');
const VENDOR = path.join(HERE, 'vendor', 'phaser-3.90.0.min.js');
const LICENSE = path.join(HERE, 'vendor', 'LICENSE.phaser-3.90.0.md');
const SOURCE_CONTOURS = path.join(ROOT, 'src', 'assets', 'map-contours.json');
const GENERATED_CONTOURS = path.join(HERE, 'generated', 'map-contours.js');
const results = [];

function check(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, detail: error.message });
  }
}
function read(file) { return fs.readFileSync(file, 'utf8'); }
function sha(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

check('Phaser vendor exact SHA-256', function () {
  assert.strictEqual(sha(VENDOR), 'e92ddef111ba42e92d316979c732311757093688ea1810591cb7aa2858eba7a7');
});
check('Phaser MIT license is unmodified', function () {
  assert.strictEqual(sha(LICENSE), '080f3d5539e766bb556df5b8e86c4f5d581ece35c692b80956ca352b84d29134');
  assert.match(read(LICENSE), /The MIT License \(MIT\)/);
});
check('vendor notice pins phaser@3.90.0 and npm integrity', function () {
  const notice = read(path.join(HERE, 'vendor', 'NOTICE.md'));
  assert.match(notice, /Exact version: `3\.90\.0`/);
  assert.match(notice, /sha512-\/cziz\/5ZIn02uDkC9RzN8VF9x3Gs3Xd/);
});
check('HTML uses only exact local Phaser vendor', function () {
  const html = read(path.join(HERE, 'index.html'));
  assert.match(html, /src="vendor\/phaser-3\.90\.0\.min\.js"/);
  assert.doesNotMatch(html, /https?:\/\//);
  assert.match(html, /connect-src 'none'/);
});
check('CSP permits Phaser built-in data textures without network access', function () {
  const html = read(path.join(HERE, 'index.html'));
  assert.match(html, /img-src data:/);
  assert.match(html, /connect-src 'none'/);
});
check('authored runtime has no network API', function () {
  const authored = [
    read(path.join(HERE, 'index.html')),
    read(path.join(HERE, 'map-core.js')),
    read(path.join(HERE, 'strategy-model.js')),
    read(path.join(HERE, 'spike.js'))
  ].join('\n');
  assert.doesNotMatch(authored, /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|import\s*\(/);
});
check('generated contours exactly match bundled source data', function () {
  const sandbox = {};
  vm.runInNewContext(read(GENERATED_CONTOURS), sandbox);
  const source = JSON.parse(read(SOURCE_CONTOURS));
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(sandbox.SkipiShippingGameBundledContours)),
    source
  );
});
check('bundled contours decode into usable land rings', function () {
  const topology = JSON.parse(read(SOURCE_CONTOURS));
  const rings = Core.landRings(topology);
  assert.ok(rings.length > 10);
  assert.ok(rings.reduce(function (count, ring) { return count + ring.length; }, 0) > 1000);
});
check('strategy model has ports, exactly one vessel and a route', function () {
  assert.strictEqual(Model.ports.length, 5);
  assert.ok(Model.vessel);
  assert.strictEqual(Object.keys(Model.routes).length, 3);
  Object.keys(Model.routes).forEach(function (key) {
    assert.ok(Model.routes[key].path.length >= 5);
    assert.ok(Core.nauticalMiles(Model.routes[key].path) > 300);
  });
});
check('voyage lifecycle follows loading, discharge, orders, ballast and next cargo', function () {
  assert.deepStrictEqual(
    Model.voyagePhases.map(function (phase) { return phase.kind; }),
    [
      'loading',
      'sailing_laden',
      'discharging',
      'shifting_to_roads',
      'awaiting_orders',
      'order_received',
      'sailing_ballast',
      'awaiting_loading',
      'berthing',
      'loading',
      'sailing_laden',
      'ready_to_discharge'
    ]
  );
  assert.strictEqual(Model.voyagePhases[0].port.id, 'odesa');
  assert.strictEqual(Model.voyagePhases[2].port.id, 'batumi');
  assert.strictEqual(Model.voyagePhases[7].anchorage.id, 'constanta-roads');
  assert.strictEqual(Model.voyagePhases[9].port.id, 'constanta');
  assert.strictEqual(Model.voyagePhases[11].port.id, 'samsun');
  assert.strictEqual(Model.voyagePhases[6].loadState, 'ballast');
  assert.strictEqual(Model.voyagePhases[10].cargo.quantityMt, 32521);
});
check('navigation path uses sea waypoints without crossing bundled coastline', function () {
  const topology = JSON.parse(read(SOURCE_CONTOURS));
  let seaSegments = 0;
  Object.keys(Model.routes).forEach(function (routeKey) {
    const path = Model.routes[routeKey].path;
    for (let index = 1; index < path.length; index++) {
      const from = path[index - 1];
      const to = path[index];
      if (from.kind !== 'sea' || to.kind !== 'sea') continue;
      seaSegments++;
      assert.strictEqual(
        Core.crossesCoastline(topology, from, to),
        false,
        routeKey + ' crosses coastline: ' + from.id + ' -> ' + to.id
      );
    }
  });
  assert.ok(seaSegments >= 8);
});
check('motion control and per-frame vessel update are present', function () {
  const html = read(path.join(HERE, 'index.html'));
  const runtime = read(path.join(HERE, 'spike.js'));
  assert.match(html, /id="toggle-motion"/);
  assert.match(html, /id="next-phase"/);
  assert.match(runtime, /updateVesselMotion/);
  assert.match(runtime, /advanceVoyagePhase/);
  assert.match(runtime, /prototype\.update/);
});
check('vessel load state replaces course and supports laden or ballast', function () {
  const html = read(path.join(HERE, 'index.html'));
  const runtime = read(path.join(HERE, 'spike.js'));
  const laden = Model.loadStatus(Model.vessel);
  const ballast = Model.loadStatus({ loadState: 'ballast' });
  assert.deepStrictEqual(laden, { state: 'LADEN', detail: 'CORN · 32,521 MT' });
  assert.deepStrictEqual(ballast, { state: 'BALLAST', detail: 'IN BALLAST' });
  assert.match(html, /id="vessel-load-state"/);
  assert.match(html, /id="vessel-load-detail"/);
  assert.doesNotMatch(html + runtime, /086°|heading-value|formatHeading/);
});
check('spike stays isolated from plugin manifest and production runtime', function () {
  const manifest = read(path.join(ROOT, 'plugin.json'));
  const runtime = read(path.join(ROOT, 'src', 'runtime.js'));
  assert.doesNotMatch(manifest, /phaser|map-renderer-spike/i);
  assert.doesNotMatch(runtime, /phaser|map-renderer-spike/i);
});

let passed = 0;
results.forEach(function (result) {
  if (result.ok) passed++;
  console.log((result.ok ? 'PASS ' : 'FAIL ') + result.name +
    (result.detail ? ': ' + result.detail : ''));
});
console.log('\n' + (passed === results.length ? 'PHASER SPIKE OK ' : 'PHASER SPIKE FAIL ') +
  passed + '/' + results.length);
process.exit(passed === results.length ? 0 : 1);

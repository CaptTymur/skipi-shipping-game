#!/usr/bin/env node
/* Build the bundled Shipping Game artifact from src/.
   Deterministic: same source bytes -> same dist bytes and checksums. */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const SRC = __dirname;
const OUT = path.join(ROOT, 'dist', 'plugins', 'shipping-game');
const ASSET_OUT = path.join(OUT, 'assets');

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(SRC, name), 'utf8'));
}
function read(name) {
  return fs.readFileSync(path.join(SRC, name), 'utf8');
}
function write(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
}
function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}
function fileInfo(rel) {
  const b = fs.readFileSync(path.join(OUT, rel));
  return { bytes: b.length, sha256: sha256(b) };
}

const manifest = readJson('manifest.json');
const scenario = readJson('scenario.json');
const mapContoursText = fs.readFileSync(path.join(SRC, 'assets', 'map-contours.json'), 'utf8');
const mapContours = JSON.parse(mapContoursText);

let runtime = ''
  + read('game-engine.js') + '\n'
  + read('map-renderer.js') + '\n'
  + read('runtime.js');

runtime = runtime
  .replace('__MANIFEST_JSON__', () => JSON.stringify(manifest))
  .replace('__SCENARIO_JSON__', () => JSON.stringify(scenario))
  .replace('__MAP_CONTOURS_JSON__', () => JSON.stringify(mapContours));

['__MANIFEST_JSON__', '__SCENARIO_JSON__', '__MAP_CONTOURS_JSON__'].forEach((token) => {
  if (runtime.indexOf(token) !== -1) throw new Error('build: placeholder still present: ' + token);
});

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(ASSET_OUT, { recursive: true });
write(path.join(OUT, 'index.js'), runtime);
write(path.join(OUT, 'index.css'), read('index.css'));
write(path.join(OUT, 'plugin.json'), JSON.stringify(manifest, null, 2) + '\n');
write(path.join(ASSET_OUT, 'map-contours.json'), mapContoursText.endsWith('\n') ? mapContoursText : mapContoursText + '\n');
fs.copyFileSync(path.join(SRC, 'assets', 'SOURCE.md'), path.join(ASSET_OUT, 'SOURCE.md'));
fs.copyFileSync(path.join(ROOT, 'CHANGELOG.md'), path.join(OUT, 'CHANGELOG.md'));
fs.copyFileSync(path.join(ROOT, 'REPORT.md'), path.join(OUT, 'REPORT.md'));

const rels = [
  'plugin.json',
  'index.js',
  'index.css',
  'assets/map-contours.json',
  'assets/SOURCE.md',
  'CHANGELOG.md',
  'REPORT.md'
];
const files = {};
const checksums = {
  schema: 'skipi.plugin-checksums.v1',
  plugin: manifest.fqid,
  generated_by: 'src/build.js',
  files: files
};
rels.forEach((rel) => {
  const info = fileInfo(rel);
  files[rel] = info;
  checksums[rel] = 'sha256:' + info.sha256;
});
write(path.join(OUT, 'checksums.json'), JSON.stringify(checksums, null, 2) + '\n');

console.log('built shipping-game artifact -> dist/plugins/shipping-game/');
rels.concat(['checksums.json']).forEach((rel) => {
  const p = path.join(OUT, rel);
  if (fs.existsSync(p)) console.log('  ' + rel.padEnd(26) + fs.statSync(p).size + ' bytes');
});

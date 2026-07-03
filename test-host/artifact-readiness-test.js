#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const ART = path.join(ROOT, 'dist', 'plugins', 'shipping-game');
const results = [];
function check(name, cond) { results.push({ name, ok: !!cond }); }
function read(rel) { return fs.readFileSync(path.join(ART, rel), 'utf8'); }
function sha(rel) { return crypto.createHash('sha256').update(fs.readFileSync(path.join(ART, rel))).digest('hex'); }

const required = ['plugin.json', 'index.js', 'index.css', 'assets/map-contours.json', 'assets/SOURCE.md', 'checksums.json', 'CHANGELOG.md', 'REPORT.md'];
required.forEach((rel) => check('artifact file exists: ' + rel, fs.existsSync(path.join(ART, rel))));

let manifest = {}, checksums = {};
try { manifest = JSON.parse(read('plugin.json')); check('plugin.json parses', true); } catch (e) { check('plugin.json parses', false); }
try { checksums = JSON.parse(read('checksums.json')); check('checksums.json parses', true); } catch (e) { check('checksums.json parses', false); }

check('manifest fqid correct', manifest.fqid === 'app.skipi.plugins.shipping-game');
check('manifest kind utility pending game enum', manifest.kind === 'utility');
check('bundled first-party only', manifest.distribution && manifest.distribution.mode === 'bundled_first_party' && manifest.distribution.remote_code === false);
check('network none and data none', manifest.network === 'none' && manifest.data_access === 'none');
check('only seafarer supported in Phase A', Array.isArray(manifest.supported_hosts) && manifest.supported_hosts.length === 1 && manifest.supported_hosts[0] === 'seafarer');
check('top-level local_storage permission present', Array.isArray(manifest.permissions) && manifest.permissions.indexOf('local_storage') >= 0);
check('role capability only local_storage', manifest.roles && manifest.roles.seafarer && JSON.stringify(manifest.roles.seafarer.capabilities) === JSON.stringify(['local_storage']));
check('safety disclaimer present', manifest.safety && manifest.safety.requires_disclaimer === true && /Игровая симуляция/.test(manifest.safety.disclaimer || ''));

required.filter((rel) => rel !== 'checksums.json').forEach((rel) => {
  const file = checksums.files && checksums.files[rel];
  check('checksum files entry for ' + rel, !!(file && file.sha256 && file.bytes > 0));
  check('checksum simple entry for ' + rel, checksums[rel] === 'sha256:' + sha(rel));
  check('checksum hash matches for ' + rel, file && file.sha256 === sha(rel));
});

const artifactText = ['index.js', 'index.css', 'plugin.json'].map(read).join('\n');
const banned = [
  ['fetch call', /\bfetch\s*\(/],
  ['XMLHttpRequest', /\bXMLHttpRequest\b/],
  ['WebSocket', /\bWebSocket\b/],
  ['sendBeacon', /\bsendBeacon\b/],
  ['EventSource', /\bEventSource\b/],
  ['importScripts', /\bimportScripts\b/],
  ['document.cookie', /\bdocument\.cookie\b/],
  ['indexedDB', /\bindexedDB\b/],
  ['Firebase', /\bFirebase\b|Firestore|office\.capt-tymur\.com/i],
  ['authorization surface', /\bAuthorization\b|\bBearer\b|api[_-]?key|secret/i],
  ['direct filesystem', /\brequire\s*\(\s*['"]fs['"]|process\.env|\/tmp\/|\/home\/|C:\\\\/i],
  ['direct host DOM reach', /\bparent\.document\b|\btop\.document\b|\bopener\.document\b/i]
];
banned.forEach(([name, re]) => check('no ' + name, !re.test(artifactText)));
check('no iframe created by plugin artifact', !/<iframe|\bcreateElement\s*\(\s*['"]iframe/i.test(artifactText));
check('launcher/runtime contains disclaimer copy', artifactText.indexOf('Игровая симуляция') >= 0);

let map = {};
try { map = JSON.parse(read('assets/map-contours.json')); check('map contours parse', true); } catch (e) { check('map contours parse', false); }
check('map contours are bundled TopoJSON', map.type === 'Topology' && map.objects && map.objects.land && Array.isArray(map.arcs));
check('map source is not a tile URL', read('assets/map-contours.json').indexOf('http') < 0);
check('map source note names Natural Earth/world-atlas', /Natural Earth/.test(read('assets/SOURCE.md')) && /world-atlas/.test(read('assets/SOURCE.md')));

let pass = 0;
results.forEach((r) => { if (r.ok) pass++; console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name); });
console.log('\n' + (pass === results.length ? 'ARTIFACT OK ' : 'ARTIFACT FAIL ') + pass + '/' + results.length);
process.exit(pass === results.length ? 0 : 1);

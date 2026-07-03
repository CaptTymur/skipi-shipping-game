#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { runIsolationContract } from '../../_host-runtime/harness/isolation-contract.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const ART = path.join(ROOT, 'dist', 'plugins', 'shipping-game');
const RUNTIME = '/home/linux/Developer/skipi-plugins/_host-runtime/dist/plugin-host-bridge.js';
const VERSION = fs.readFileSync('/home/linux/Developer/skipi-plugins/_host-runtime/dist/RUNTIME_VERSION', 'utf8').trim();

function read(rel) { return fs.readFileSync(path.join(ART, rel), 'utf8'); }

const runtimeSource = fs.readFileSync(RUNTIME, 'utf8');
const manifest = JSON.parse(read('plugin.json'));
const js = read('index.js');
const css = read('index.css');

console.log('Pinned _host-runtime: ' + VERSION);
const result = await runIsolationContract({
  slug: 'shipping-game',
  runtimeSource,
  makeLoader: (perms) => ({
    async install() {
      return {
        ok: true,
        source: 'shipping-game-artifact',
        pack: {
          entrypoints: manifest.entrypoints,
          files: { 'index.js': js, 'index.css': css },
          permissions: perms.slice()
        }
      };
    }
  }),
  secretKey: 'skipi_seafarer_secret',
  secretVal: 'SECRET-SEAFARER-VALUE-DO-NOT-LEAK'
});

console.log('\n' + (result.fail === 0 ? 'ISOLATION OK ' : 'ISOLATION FAIL ') + result.pass + '/' + (result.pass + result.fail));
process.exit(result.fail === 0 ? 0 : 1);

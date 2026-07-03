#!/usr/bin/env node
/* Lab-only HTTP bridge: browser test-host -> /tmp/skipi-game-assistant file queue.
   No model calls, no credentials. A dedicated Game Assistant window writes res-*.json. */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const DIR = process.env.SKIPI_GAME_ASSISTANT_DIR || '/tmp/skipi-game-assistant';
const HOST = '127.0.0.1';
const PORT = Number(process.env.SKIPI_GAME_ASSISTANT_PORT || 8786);

function ensureDir() { fs.mkdirSync(DIR, { recursive: true }); }
function json(res, code, body) {
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS, GET'
  });
  res.end(JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let b = '';
    req.on('data', (c) => { b += c; if (b.length > 128000) reject(new Error('body too large')); });
    req.on('end', () => resolve(b));
    req.on('error', reject);
  });
}
function safeId(v) {
  return String(v || ('req-' + Date.now() + '-' + Math.random().toString(16).slice(2))).replace(/[^a-zA-Z0-9_.-]/g, '-');
}
function waitFor(file, ms) {
  const started = Date.now();
  return new Promise((resolve) => {
    const timer = setInterval(() => {
      if (fs.existsSync(file)) {
        clearInterval(timer);
        try { resolve(JSON.parse(fs.readFileSync(file, 'utf8'))); }
        catch (e) { resolve({ error: 'bad response json: ' + e.message }); }
      } else if (Date.now() - started >= ms) {
        clearInterval(timer);
        resolve(null);
      }
    }, 250);
  });
}

ensureDir();
const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return json(res, 200, { ok: true });
  if (req.method === 'GET' && req.url === '/health') return json(res, 200, { ok: true, dir: DIR });
  if (req.method !== 'POST' || req.url !== '/ask') return json(res, 404, { ok: false, error: 'not_found' });
  try {
    const body = JSON.parse(await readBody(req));
    const id = safeId(body.id);
    const request = {
      id,
      ts: new Date().toISOString(),
      role: body.role || 'commercial_manager',
      scenario_id: body.scenario_id || 'unknown',
      question: body.question || '',
      game_state_summary: body.game_state_summary || {}
    };
    const reqFile = path.join(DIR, 'req-' + id + '.json');
    const resFile = path.join(DIR, 'res-' + id + '.json');
    fs.writeFileSync(reqFile + '.tmp', JSON.stringify(request, null, 2) + '\n');
    fs.renameSync(reqFile + '.tmp', reqFile);
    const answer = await waitFor(resFile, 10500);
    if (!answer) return json(res, 504, { ok: false, id, error: 'assistant_timeout' });
    return json(res, 200, answer);
  } catch (e) {
    return json(res, 400, { ok: false, error: e.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log('Shipping Game assistant bridge listening on http://' + HOST + ':' + PORT);
  console.log('Queue: ' + DIR);
});


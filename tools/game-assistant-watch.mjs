#!/usr/bin/env node
/* Helper for the dedicated "Game Assistant" window.
   It watches /tmp/skipi-game-assistant and can either print pending requests or
   answer them with a local scripted response for bridge plumbing tests. */
import fs from 'node:fs';
import path from 'node:path';

const DIR = process.env.SKIPI_GAME_ASSISTANT_DIR || '/tmp/skipi-game-assistant';
const scripted = process.argv.includes('--scripted');
fs.mkdirSync(DIR, { recursive: true });

function responseFor(req) {
  return {
    id: req.id,
    answer: 'Game Assistant: for ' + (req.role || 'commercial_manager') + ', keep the commercial upside visible but do not hide operational risk. Decide only what you can explain in the debrief.',
    advice: 'Ask: who benefits, who carries the risk, and what fact would change the decision?'
  };
}

console.log('Watching ' + DIR + (scripted ? ' (scripted responder mode)' : ' (print-only mode)'));
setInterval(() => {
  const files = fs.readdirSync(DIR).filter((f) => /^req-.*\.json$/.test(f)).sort();
  files.forEach((f) => {
    const reqFile = path.join(DIR, f);
    let req;
    try { req = JSON.parse(fs.readFileSync(reqFile, 'utf8')); } catch (e) { return; }
    const resFile = path.join(DIR, 'res-' + req.id + '.json');
    if (fs.existsSync(resFile)) return;
    if (scripted) {
      fs.writeFileSync(resFile + '.tmp', JSON.stringify(responseFor(req), null, 2) + '\n');
      fs.renameSync(resFile + '.tmp', resFile);
      console.log('answered ' + req.id);
    } else {
      console.log('\nREQUEST ' + req.id);
      console.log(JSON.stringify(req, null, 2));
      console.log('Write response JSON to: ' + resFile);
    }
  });
}, 1000);


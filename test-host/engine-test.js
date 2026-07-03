#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const Engine = require('../src/game-engine.js');

const scenario = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'scenario.json'), 'utf8'));
const results = [];
function check(name, cond) { results.push({ name, ok: !!cond }); }

check('seafarer host accepted', Engine.validateHost('seafarer').ok === true);
check('unknown host fails closed', Engine.validateHost('broker').ok === false && Engine.validateHost('broker').gate === 'unknown-host');
check('commercial_manager is playable', Engine.roleStatus('commercial_manager', scenario).ok === true);
check('captain is coming soon', Engine.roleStatus('captain', scenario).state === 'coming_soon');
check('shipowner is coming soon', Engine.roleStatus('shipowner', scenario).state === 'coming_soon');
check('unknown role rejected', Engine.roleStatus('pirate', scenario).state === 'unknown_role');

let state = Engine.makeInitialState(scenario, { role: 'commercial_manager' });
check('initial state starts playing', state.status === 'playing' && state.step_index === 0);
check('scenario has six decisions', scenario.steps.length === 6);

const choices = [
  'balanced-steel',
  'firm-demurrage',
  'ask-options',
  'split-plan',
  'documented-compromise',
  'reposition-clean'
];
choices.forEach((id, idx) => {
  const r = Engine.chooseOption(scenario, state, id);
  check('decision ' + (idx + 1) + ' accepted', r.ok === true);
  state = r.state;
});

check('state completed after six choices', state.status === 'complete' && state.decisions.length === 6);
check('score changed after choices', Engine.totalScore(state) !== Engine.totalScore(Engine.makeInitialState(scenario, { role: 'commercial_manager' })));
check('debrief includes total score', Engine.debrief(scenario, state).score_total === Engine.totalScore(state));
check('assistant payload contains no real vessel id', JSON.stringify(Engine.assistantPayload(scenario, state, 'test')).indexOf('7533197') < 0);
const exported = Engine.exportLog(scenario, state, { identity_mode: 'anonymous_lab' });
check('export log schema/version present', exported.schema === 'shipping-game.log.v1' && exported.plugin.version === '0.1.0');
check('export includes debrief when complete', !!exported.debrief);
check('invalid option rejected', Engine.chooseOption(scenario, state, 'missing').ok === false);

let pass = 0;
results.forEach((r) => { if (r.ok) pass++; console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name); });
console.log('\n' + (pass === results.length ? 'ENGINE OK ' : 'ENGINE FAIL ') + pass + '/' + results.length);
process.exit(pass === results.length ? 0 : 1);


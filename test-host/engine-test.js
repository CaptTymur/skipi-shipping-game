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
check('shipowner is playable', Engine.roleStatus('shipowner', scenario).ok === true);
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
check('export log schema/version present', exported.schema === 'shipping-game.log.v1' && exported.plugin.version === '0.2.0');
check('export includes debrief when complete', !!exported.debrief);
check('invalid option rejected', Engine.chooseOption(scenario, state, 'missing').ok === false);

function shipownerHappyPath() {
  let s = Engine.makeInitialState(scenario, { role: 'shipowner' });
  const out = {};
  out.initial = s;
  s = Engine.buyVessel(s, 'coaster-aurora').state;
  out.afterBuy = s;
  out.blockedOffer = Engine.availableCharter(s);
  s = Engine.improveRating(s, 'vetting').state;
  out.afterVetting = s;
  const saleBeforeDetail = Engine.salePrice(s);
  s = Engine.improveDetail(s, 'technical-description').state;
  out.saleBeforeDetail = saleBeforeDetail;
  out.saleAfterDetail = Engine.salePrice(s);
  out.offer = Engine.availableCharter(s);
  s = Engine.acceptCharter(s).state;
  out.afterAccept = s;
  let tick = Engine.tickOwnerTurn(s);
  out.tick1 = tick;
  s = tick.state;
  tick = Engine.tickOwnerTurn(s);
  out.tick2 = tick;
  s = tick.state;
  out.final = s;
  return out;
}

let owner = Engine.makeInitialState(scenario, { role: 'shipowner' });
check('shipowner starts at buy state', owner.status === 'shipowner_buy' && owner.owner.balance === Engine.economyConfig.startingCapital);
let bought = Engine.buyVessel(owner, 'coaster-aurora');
check('shipowner can buy fictional vessel', bought.ok && bought.state.owner.vessel.id === 'coaster-aurora');
check('buy deducts purchase price', bought.state.owner.balance === Engine.economyConfig.startingCapital - Engine.economyConfig.vessels[0].price);
check('charter blocked below vetting threshold', Engine.availableCharter(bought.state).ok === false && Engine.availableCharter(bought.state).reason === 'vetting_below_threshold');
let tanker = Engine.buyVessel(owner, 'tanker-selene').state;
check('charter blocked below class threshold', Engine.availableCharter(tanker).reason === 'class_below_threshold');

let happy = shipownerHappyPath();
check('vetting action opens charter gate', happy.afterVetting.owner.vessel.vettingRating >= Engine.economyConfig.ratingGate.vettingMin);
check('detail raises sale price', happy.saleAfterDetail > happy.saleBeforeDetail);
check('NPC commercial manager brings deterministic charter', happy.offer && happy.offer.ok && happy.offer.freight > 0);
check('accept charter makes vessel busy', happy.afterAccept.owner.charter && happy.afterAccept.owner.charter.remaining_turns === happy.offer.duration_turns);
check('OPEX tick deducts balance before freight', happy.tick1.state.owner.balance < happy.afterAccept.owner.balance && happy.tick1.freight_paid === 0);
check('freight paid on completion', happy.tick2.freight_paid === happy.offer.freight && !happy.final.owner.charter);
check('ratings decay after turns', happy.final.owner.vessel.classRating < happy.afterAccept.owner.vessel.classRating && happy.final.owner.vessel.vettingRating < happy.afterAccept.owner.vessel.vettingRating);

let same = shipownerHappyPath();
check('shipowner path deterministic balance', same.final.owner.balance === happy.final.owner.balance);
check('shipowner path deterministic ratings', same.final.owner.vessel.classRating === happy.final.owner.vessel.classRating && same.final.owner.vessel.vettingRating === happy.final.owner.vessel.vettingRating);

let sold = Engine.sellVessel(happy.final);
check('sale closes shipowner loop', sold.ok && sold.state.status === 'shipowner_sold' && !sold.state.owner.vessel);
check('shipowner export stays log v1 and includes debrief', Engine.exportLog(scenario, sold.state, {}).schema === 'shipping-game.log.v1' && !!Engine.exportLog(scenario, sold.state, {}).debrief);

let fail = Engine.buyVessel(owner, 'tanker-selene').state;
fail = Engine.tickOwnerTurn(fail).state;
check('negative balance gives warning first', fail.owner.failure_stage === 'warning' && fail.status !== 'game_over');
fail = Engine.tickOwnerTurn(fail).state;
check('second negative OPEX arrests vessel and ends game', fail.status === 'game_over' && fail.owner.failure_stage === 'arrested');
check('cannot sell after arrest', Engine.sellVessel(fail).ok === false);

let pass = 0;
results.forEach((r) => { if (r.ok) pass++; console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name); });
console.log('\n' + (pass === results.length ? 'ENGINE OK ' : 'ENGINE FAIL ') + pass + '/' + results.length);
process.exit(pass === results.length ? 0 : 1);

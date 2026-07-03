/* Shipping Game scenario engine.
   UMD shape: Node tests can require it; plugin runtime uses the browser global.
   No DOM, no storage, no network. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SkipiShippingGameEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function clamp(n) { n = Number(n) || 0; return Math.max(0, Math.min(100, n)); }
  function nowIso() { return new Date().toISOString(); }

  var ROLE_LABELS = {
    captain: 'Captain',
    commercial_manager: 'Commercial manager',
    shipowner: 'Shipowner'
  };

  function validateHost(hostId) {
    if (hostId !== 'seafarer') return { ok: false, gate: hostId ? 'unknown-host' : 'missing-host' };
    return { ok: true, gate: 'ok' };
  }

  function roleStatus(role, scenario) {
    if (!ROLE_LABELS[role]) return { ok: false, state: 'unknown_role' };
    if (role !== scenario.playable_role) return { ok: false, state: 'coming_soon' };
    return { ok: true, state: 'playable' };
  }

  function makeInitialState(scenario, opts) {
    opts = opts || {};
    return {
      schema: 'shipping-game.state.v1',
      scenario_id: scenario.id,
      role: opts.role || null,
      status: opts.role ? (roleStatus(opts.role, scenario).ok ? 'playing' : roleStatus(opts.role, scenario).state) : 'role_select',
      step_index: 0,
      score_start: clone(scenario.starting_score),
      score: clone(scenario.starting_score),
      decisions: [],
      assistant: [],
      created_at: nowIso(),
      updated_at: nowIso(),
      completed_at: null
    };
  }

  function currentStep(scenario, state) {
    if (!state || state.status !== 'playing') return null;
    return scenario.steps[state.step_index] || null;
  }

  function findOption(step, optionId) {
    if (!step) return null;
    for (var i = 0; i < step.options.length; i++) if (step.options[i].id === optionId) return step.options[i];
    return null;
  }

  function applyEffect(score, effect) {
    var next = clone(score);
    Object.keys(effect || {}).forEach(function (k) {
      next[k] = clamp((next[k] == null ? 0 : next[k]) + effect[k]);
    });
    return next;
  }

  function chooseOption(scenario, state, optionId) {
    var step = currentStep(scenario, state);
    var option = findOption(step, optionId);
    if (!step || !option) return { ok: false, state: state, error: 'invalid_option' };
    var next = clone(state);
    next.score = applyEffect(next.score, option.effect);
    next.decisions.push({
      step_id: step.id,
      option_id: option.id,
      label: option.label,
      effect: clone(option.effect),
      consequence: option.consequence,
      ts: nowIso()
    });
    next.step_index += 1;
    next.updated_at = nowIso();
    if (next.step_index >= scenario.steps.length) {
      next.status = 'complete';
      next.completed_at = nowIso();
    }
    return { ok: true, state: next, consequence: option.consequence };
  }

  function scoreDelta(state) {
    var out = {};
    Object.keys(state.score || {}).forEach(function (k) {
      out[k] = (state.score[k] || 0) - (state.score_start[k] || 0);
    });
    return out;
  }

  function totalScore(state) {
    var s = state.score || {};
    return Math.round((s.cash || 0) * 0.28 + (s.safety || 0) * 0.32 + (s.reputation || 0) * 0.28 + (s.learning || 0) * 0.12);
  }

  function debrief(scenario, state) {
    var d = scoreDelta(state);
    var best = Object.keys(d).sort(function (a, b) { return d[b] - d[a]; })[0] || 'learning';
    var weak = Object.keys(d).sort(function (a, b) { return d[a] - d[b]; })[0] || 'cash';
    return {
      title: 'Debrief',
      summary: 'You completed the fixture loop as commercial manager. Strongest dimension: ' + best + '. Weakest pressure point: ' + weak + '.',
      score_total: totalScore(state),
      score_delta: d,
      lesson: 'The game is about rational tradeoffs: employment, safety, owner cash and long-term counterparty trust rarely move in the same direction.'
    };
  }

  function assistantPayload(scenario, state, question) {
    var step = currentStep(scenario, state);
    return {
      id: 'ask-' + Date.now(),
      role: state.role || 'none',
      scenario_id: scenario.id,
      question: question || (step ? step.prompt : 'Give a short debrief.'),
      game_state_summary: {
        status: state.status,
        step_index: state.step_index,
        current_step: step ? { id: step.id, title: step.title } : null,
        score: clone(state.score),
        decisions: state.decisions.map(function (d) { return { step_id: d.step_id, option_id: d.option_id }; })
      }
    };
  }

  function scriptedAssistant(payload) {
    var role = payload && payload.role ? payload.role : 'commercial_manager';
    var q = payload && payload.question ? payload.question : 'the next decision';
    return {
      answer: 'Assistant offline. Scripted guidance for ' + role + ': name the commercial upside, name the operational risk, then choose the option that you can defend after the voyage. Current question: ' + q,
      advice: 'Keep the decision reversible when facts are weak.',
      offline: true
    };
  }

  function exportLog(scenario, state, meta) {
    return {
      schema: 'shipping-game.log.v1',
      exported_at: nowIso(),
      plugin: { id: 'app.skipi.plugins.shipping-game', version: '0.1.0' },
      scenario: { id: scenario.id, title: scenario.title, vessel: scenario.vessel },
      meta: meta || {},
      state: clone(state),
      debrief: state.status === 'complete' ? debrief(scenario, state) : null
    };
  }

  return {
    roleLabels: ROLE_LABELS,
    validateHost: validateHost,
    roleStatus: roleStatus,
    makeInitialState: makeInitialState,
    currentStep: currentStep,
    chooseOption: chooseOption,
    scoreDelta: scoreDelta,
    totalScore: totalScore,
    debrief: debrief,
    assistantPayload: assistantPayload,
    scriptedAssistant: scriptedAssistant,
    exportLog: exportLog
  };
});


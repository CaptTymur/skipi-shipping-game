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

  // ECONOMY_CONFIG is intentionally the single tuning block for Phase A.2.
  // Tymur can tune prices, OPEX, rating gates, freight and sale math here
  // without reading the rest of the deterministic engine.
  var ECONOMY_CONFIG = {
    // Initial owner liquidity and failure timing.
    startingCapital: 420000,
    warningBalance: 0,
    arrestAfterNegativeTurns: 2,
    // Minimum ratings required before the NPC commercial manager can fix a charter.
    ratingGate: { classMin: 62, vettingMin: 58 },
    // Per-turn technical deterioration after OPEX is paid.
    ratingDecayPerTurn: { classRating: 3, vettingRating: 4, condition: 2 },
    // Value math: detail improves charter freight and sale price; condition drives sale multiplier.
    detailSaleBonus: 26000,
    detailCharterBonus: 7000,
    ratingFreightWeight: 480,
    saleConditionWeight: 0.003,
    saleBaseMultiplier: 0.58,
    // Paid rating recovery actions.
    survey: { id: 'class-survey', label: 'Class survey', cost: 28000, classRating: 18, condition: 4 },
    inspection: { id: 'vetting-inspection', label: 'Vetting inspection', cost: 22000, vettingRating: 20 },
    // One-time detailing actions. They spend cash now and raise marketability/value.
    detailActions: [
      { id: 'technical-description', label: 'Write technical description', cost: 8000, detail: 1, condition: 1 },
      { id: 'hold-photos', label: 'Add hold photo placeholders', cost: 12000, detail: 1, condition: 2 },
      { id: 'machinery-notes', label: 'Detail machinery notes', cost: 16000, detail: 1, condition: 3 }
    ],
    // Fictional purchase choices. No real vessel data.
    vessels: [
      {
        id: 'coaster-aurora',
        name: 'MV Aurora Coast',
        type: 'Coaster',
        price: 220000,
        baseValue: 220000,
        condition: 64,
        classRating: 66,
        vettingRating: 55,
        opexPerTurn: 18000,
        freightBase: 54000,
        charterDuration: 2,
        marker: { lon: 31.4, lat: 43.0, label: 'MV Aurora Coast' },
        description: 'Older coaster. Cheap entry price, thin vetting acceptance.'
      },
      {
        id: 'bulker-nereid',
        name: 'MV Nereid Bay',
        type: 'Small bulker',
        price: 340000,
        baseValue: 340000,
        condition: 72,
        classRating: 70,
        vettingRating: 62,
        opexPerTurn: 26000,
        freightBase: 83000,
        charterDuration: 3,
        marker: { lon: 29.7, lat: 42.4, label: 'MV Nereid Bay' },
        description: 'Balanced small bulker. Better acceptance, higher daily pressure.'
      },
      {
        id: 'tanker-selene',
        name: 'MT Selene Star',
        type: 'Small tanker',
        price: 395000,
        baseValue: 395000,
        condition: 68,
        classRating: 59,
        vettingRating: 68,
        opexPerTurn: 31000,
        freightBase: 105000,
        charterDuration: 3,
        marker: { lon: 33.2, lat: 41.9, label: 'MT Selene Star' },
        description: 'Higher upside tanker. Class rating must be fixed before better charters.'
      }
    ]
  };

  function validateHost(hostId) {
    if (hostId !== 'seafarer') return { ok: false, gate: hostId ? 'unknown-host' : 'missing-host' };
    return { ok: true, gate: 'ok' };
  }

  function roleStatus(role, scenario) {
    if (!ROLE_LABELS[role]) return { ok: false, state: 'unknown_role' };
    var playable = scenario.playable_roles || [scenario.playable_role];
    if (playable.indexOf(role) < 0) return { ok: false, state: 'coming_soon' };
    return { ok: true, state: 'playable' };
  }

  function makeInitialState(scenario, opts) {
    opts = opts || {};
    var status = opts.role ? (roleStatus(opts.role, scenario).ok ? 'playing' : roleStatus(opts.role, scenario).state) : 'role_select';
    var out = {
      schema: 'shipping-game.state.v1',
      scenario_id: scenario.id,
      role: opts.role || null,
      status: status,
      step_index: 0,
      score_start: clone(scenario.starting_score),
      score: clone(scenario.starting_score),
      decisions: [],
      assistant: [],
      created_at: nowIso(),
      updated_at: nowIso(),
      completed_at: null
    };
    if (opts.role === 'shipowner' && status === 'playing') {
      out.status = 'shipowner_buy';
      out.owner = makeOwnerState();
    }
    return out;
  }

  function makeOwnerState() {
    return {
      schema: 'shipping-game.owner.v1',
      turn: 0,
      balance: ECONOMY_CONFIG.startingCapital,
      capital_start: ECONOMY_CONFIG.startingCapital,
      vessel: null,
      detail_level: 0,
      completed_details: [],
      charter: null,
      last_offer: null,
      negative_turns: 0,
      failure_stage: 'none',
      history: []
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
    if (state && state.role === 'shipowner' && state.owner) return ownerScore(state);
    var s = state.score || {};
    return Math.round((s.cash || 0) * 0.28 + (s.safety || 0) * 0.32 + (s.reputation || 0) * 0.28 + (s.learning || 0) * 0.12);
  }

  function debrief(scenario, state) {
    if (state.role === 'shipowner' && state.owner) return ownerDebrief(state);
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
        decisions: state.decisions.map(function (d) { return { step_id: d.step_id, option_id: d.option_id }; }),
        owner: state.owner ? ownerPublicSummary(state) : null
      }
    };
  }

  function scriptedAssistant(payload) {
    var role = payload && payload.role ? payload.role : 'commercial_manager';
    var q = payload && payload.question ? payload.question : 'the next decision';
    if (role === 'shipowner') {
      return {
        answer: 'Assistant offline. Scripted shipowner guidance: protect liquidity first, then ratings, then upside. A vessel that cannot pass class or vetting gates is not an asset in the charter market. Current question: ' + q,
        advice: 'Do not buy freight with hidden technical debt.',
        offline: true
      };
    }
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
      plugin: { id: 'app.skipi.plugins.shipping-game', version: '0.2.0' },
      scenario: { id: scenario.id, title: scenario.title, vessel: scenario.vessel },
      meta: meta || {},
      state: clone(state),
      debrief: (state.status === 'complete' || state.status === 'shipowner_sold' || state.status === 'game_over') ? debrief(scenario, state) : null
    };
  }

  function vesselById(id) {
    for (var i = 0; i < ECONOMY_CONFIG.vessels.length; i++) if (ECONOMY_CONFIG.vessels[i].id === id) return ECONOMY_CONFIG.vessels[i];
    return null;
  }

  function detailById(id) {
    for (var i = 0; i < ECONOMY_CONFIG.detailActions.length; i++) if (ECONOMY_CONFIG.detailActions[i].id === id) return ECONOMY_CONFIG.detailActions[i];
    return null;
  }

  function ownerEvent(owner, type, detail) {
    owner.history.push({ ts: nowIso(), turn: owner.turn, type: type, detail: detail || {} });
  }

  function ownerPublicSummary(state) {
    var o = state.owner;
    if (!o) return null;
    return {
      status: state.status,
      turn: o.turn,
      balance: o.balance,
      vessel: o.vessel ? { id: o.vessel.id, name: o.vessel.name, type: o.vessel.type } : null,
      detail_level: o.detail_level,
      classRating: o.vessel ? o.vessel.classRating : null,
      vettingRating: o.vessel ? o.vessel.vettingRating : null,
      condition: o.vessel ? o.vessel.condition : null,
      charter: o.charter ? { id: o.charter.id, freight: o.charter.freight, remaining_turns: o.charter.remaining_turns } : null,
      failure_stage: o.failure_stage
    };
  }

  function buyVessel(state, vesselId) {
    if (!state || state.role !== 'shipowner' || !state.owner) return { ok: false, state: state, error: 'not_shipowner' };
    if (state.owner.vessel) return { ok: false, state: state, error: 'vessel_already_owned' };
    var v = vesselById(vesselId);
    if (!v) return { ok: false, state: state, error: 'unknown_vessel' };
    if (state.owner.balance < v.price) return { ok: false, state: state, error: 'insufficient_capital' };
    var next = clone(state);
    next.owner.vessel = clone(v);
    next.owner.balance -= v.price;
    next.status = 'shipowner_operating';
    next.updated_at = nowIso();
    ownerEvent(next.owner, 'buy_vessel', { vessel_id: v.id, price: v.price, balance: next.owner.balance });
    return { ok: true, state: next };
  }

  function applyOwnerCost(owner, amount) {
    owner.balance -= amount;
    return owner.balance;
  }

  function improveDetail(state, detailId) {
    var action = detailById(detailId);
    if (!state || state.role !== 'shipowner' || !state.owner || !state.owner.vessel) return { ok: false, state: state, error: 'no_vessel' };
    if (!action) return { ok: false, state: state, error: 'unknown_detail' };
    if (state.owner.completed_details.indexOf(action.id) >= 0) return { ok: false, state: state, error: 'detail_done' };
    if (state.owner.balance < action.cost) return { ok: false, state: state, error: 'insufficient_balance' };
    var next = clone(state);
    applyOwnerCost(next.owner, action.cost);
    next.owner.detail_level += action.detail;
    next.owner.completed_details.push(action.id);
    next.owner.vessel.condition = clamp(next.owner.vessel.condition + action.condition);
    next.updated_at = nowIso();
    ownerEvent(next.owner, 'detail_vessel', { detail_id: action.id, cost: action.cost, detail_level: next.owner.detail_level });
    updateOwnerFailure(next);
    return { ok: true, state: next };
  }

  function improveRating(state, kind) {
    if (!state || state.role !== 'shipowner' || !state.owner || !state.owner.vessel) return { ok: false, state: state, error: 'no_vessel' };
    var cfg = kind === 'class' ? ECONOMY_CONFIG.survey : kind === 'vetting' ? ECONOMY_CONFIG.inspection : null;
    if (!cfg) return { ok: false, state: state, error: 'unknown_rating_action' };
    if (state.owner.balance < cfg.cost) return { ok: false, state: state, error: 'insufficient_balance' };
    var next = clone(state);
    applyOwnerCost(next.owner, cfg.cost);
    if (kind === 'class') {
      next.owner.vessel.classRating = clamp(next.owner.vessel.classRating + cfg.classRating);
      next.owner.vessel.condition = clamp(next.owner.vessel.condition + cfg.condition);
    } else {
      next.owner.vessel.vettingRating = clamp(next.owner.vessel.vettingRating + cfg.vettingRating);
    }
    next.updated_at = nowIso();
    ownerEvent(next.owner, kind === 'class' ? 'class_survey' : 'vetting_inspection', { cost: cfg.cost });
    updateOwnerFailure(next);
    return { ok: true, state: next };
  }

  function charterGate(state) {
    if (!state || !state.owner || !state.owner.vessel) return { ok: false, reason: 'no_vessel' };
    var v = state.owner.vessel, gate = ECONOMY_CONFIG.ratingGate;
    if (v.classRating < gate.classMin) return { ok: false, reason: 'class_below_threshold', copy: 'vessel not accepted by charterers — class rating below threshold' };
    if (v.vettingRating < gate.vettingMin) return { ok: false, reason: 'vetting_below_threshold', copy: 'vessel not accepted by charterers — vetting rating below threshold' };
    return { ok: true, reason: 'accepted' };
  }

  function availableCharter(state) {
    if (!state || !state.owner || !state.owner.vessel) return null;
    if (state.owner.charter) return null;
    var gate = charterGate(state);
    if (!gate.ok) return { ok: false, reason: gate.reason, copy: gate.copy };
    var v = state.owner.vessel;
    var ratingExcess = (v.classRating + v.vettingRating) - (ECONOMY_CONFIG.ratingGate.classMin + ECONOMY_CONFIG.ratingGate.vettingMin);
    var freight = Math.max(0, Math.round(v.freightBase + state.owner.detail_level * ECONOMY_CONFIG.detailCharterBonus + ratingExcess * ECONOMY_CONFIG.ratingFreightWeight));
    return {
      ok: true,
      id: 'charter-' + v.id + '-turn-' + state.owner.turn,
      cargo: v.type === 'Small tanker' ? 'Clean product parcel' : 'Steel and project cargo',
      duration_turns: v.charterDuration,
      freight: freight,
      copy: 'NPC commercial manager found a charter. Quality reflects class, vetting and vessel detail.'
    };
  }

  function acceptCharter(state) {
    if (!state || !state.owner || !state.owner.vessel) return { ok: false, state: state, error: 'no_vessel' };
    if (state.owner.charter) return { ok: false, state: state, error: 'already_busy' };
    var offer = availableCharter(state);
    if (!offer || !offer.ok) return { ok: false, state: state, error: offer ? offer.reason : 'no_offer', offer: offer };
    var next = clone(state);
    next.owner.charter = {
      id: offer.id,
      cargo: offer.cargo,
      freight: offer.freight,
      duration_turns: offer.duration_turns,
      remaining_turns: offer.duration_turns
    };
    next.owner.last_offer = offer;
    next.updated_at = nowIso();
    ownerEvent(next.owner, 'accept_charter', { charter_id: offer.id, freight: offer.freight, duration_turns: offer.duration_turns });
    return { ok: true, state: next, offer: offer };
  }

  function tickOwnerTurn(state) {
    if (!state || state.role !== 'shipowner' || !state.owner || !state.owner.vessel) return { ok: false, state: state, error: 'no_vessel' };
    if (state.status === 'game_over' || state.status === 'shipowner_sold') return { ok: false, state: state, error: 'closed' };
    var next = clone(state);
    var o = next.owner, v = o.vessel;
    o.turn += 1;
    applyOwnerCost(o, v.opexPerTurn);
    v.classRating = clamp(v.classRating - ECONOMY_CONFIG.ratingDecayPerTurn.classRating);
    v.vettingRating = clamp(v.vettingRating - ECONOMY_CONFIG.ratingDecayPerTurn.vettingRating);
    v.condition = clamp(v.condition - ECONOMY_CONFIG.ratingDecayPerTurn.condition);
    var freightPaid = 0;
    if (o.charter) {
      o.charter.remaining_turns -= 1;
      if (o.charter.remaining_turns <= 0) {
        freightPaid = o.charter.freight;
        o.balance += freightPaid;
        ownerEvent(o, 'freight_paid', { charter_id: o.charter.id, freight: freightPaid });
        o.charter = null;
      }
    }
    ownerEvent(o, 'opex_tick', { opex: v.opexPerTurn, freight_paid: freightPaid, balance: o.balance });
    next.updated_at = nowIso();
    updateOwnerFailure(next);
    return { ok: true, state: next, freight_paid: freightPaid };
  }

  function updateOwnerFailure(state) {
    var o = state.owner;
    if (!o) return state;
    if (o.balance < ECONOMY_CONFIG.warningBalance) {
      o.negative_turns += 1;
      if (o.negative_turns >= ECONOMY_CONFIG.arrestAfterNegativeTurns) {
        o.failure_stage = 'arrested';
        state.status = 'game_over';
        state.completed_at = nowIso();
        ownerEvent(o, 'game_over_arrest', { balance: o.balance });
      } else {
        o.failure_stage = 'warning';
        ownerEvent(o, 'negative_balance_warning', { balance: o.balance });
      }
    } else {
      o.negative_turns = 0;
      if (o.failure_stage === 'warning') o.failure_stage = 'none';
    }
    return state;
  }

  function salePrice(state) {
    if (!state || !state.owner || !state.owner.vessel) return 0;
    var o = state.owner, v = o.vessel;
    var conditionMultiplier = ECONOMY_CONFIG.saleBaseMultiplier + v.condition * ECONOMY_CONFIG.saleConditionWeight;
    return Math.max(0, Math.round(v.baseValue * conditionMultiplier + o.detail_level * ECONOMY_CONFIG.detailSaleBonus));
  }

  function sellVessel(state) {
    if (!state || state.role !== 'shipowner' || !state.owner || !state.owner.vessel) return { ok: false, state: state, error: 'no_vessel' };
    if (state.status === 'game_over') return { ok: false, state: state, error: 'arrested' };
    var next = clone(state);
    var price = salePrice(next);
    next.owner.balance += price;
    ownerEvent(next.owner, 'sell_vessel', { vessel_id: next.owner.vessel.id, price: price, balance: next.owner.balance });
    next.owner.vessel = null;
    next.owner.charter = null;
    next.status = 'shipowner_sold';
    next.completed_at = nowIso();
    next.updated_at = nowIso();
    return { ok: true, state: next, price: price };
  }

  function ownerScore(state) {
    var o = state.owner;
    if (!o) return 0;
    var rating = o.vessel ? (o.vessel.classRating + o.vessel.vettingRating + o.vessel.condition) / 3 : 50;
    var liquidity = Math.max(0, Math.min(100, Math.round(o.balance / ECONOMY_CONFIG.startingCapital * 100)));
    return Math.round(liquidity * 0.45 + rating * 0.35 + o.detail_level * 6 + (o.history.length > 0 ? 5 : 0));
  }

  function ownerDebrief(state) {
    var o = state.owner;
    var sold = state.status === 'shipowner_sold';
    var gameOver = state.status === 'game_over';
    return {
      title: sold ? 'Ship sale debrief' : gameOver ? 'Arrest debrief' : 'Shipowner debrief',
      summary: sold
        ? 'You sold the vessel and closed the loop with balance ' + o.balance + '.'
        : gameOver
          ? 'The vessel was arrested after negative liquidity persisted. The owner loop failed honestly.'
          : 'You are still operating the vessel.',
      score_total: ownerScore(state),
      owner: ownerPublicSummary(state),
      lesson: 'Shipowner rationality starts with liquidity. Detail, class and vetting can create value, but OPEX punishes slow decisions.'
    };
  }

  function ownerMapMarker(state) {
    return state && state.owner && state.owner.vessel ? state.owner.vessel.marker : null;
  }

  return {
    economyConfig: ECONOMY_CONFIG,
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
    exportLog: exportLog,
    ownerPublicSummary: ownerPublicSummary,
    buyVessel: buyVessel,
    improveDetail: improveDetail,
    improveRating: improveRating,
    charterGate: charterGate,
    availableCharter: availableCharter,
    acceptCharter: acceptCharter,
    tickOwnerTurn: tickOwnerTurn,
    salePrice: salePrice,
    sellVessel: sellVessel,
    ownerScore: ownerScore,
    ownerMapMarker: ownerMapMarker
  };
});

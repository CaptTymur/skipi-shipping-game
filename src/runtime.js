/* SKIPI_FIXTURE_PLUGIN shipping-game runtime marker for host-runtime isolation smoke. */
(function () {
  'use strict';

  var KEY = 'shipping-game';
  var MANIFEST = __MANIFEST_JSON__;
  var SCENARIO = __SCENARIO_JSON__;
  var MAP_CONTOURS = __MAP_CONTOURS_JSON__;
  var Engine = window.SkipiShippingGameEngine;
  var MapRenderer = window.SkipiShippingGameMapRenderer;
  var current = null;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function hostIdOf(hostApi) {
    return String((hostApi && hostApi.host && hostApi.host.id) || (hostApi && hostApi.hostId) || '').toLowerCase();
  }
  function hostContext(hostApi) {
    try {
      if (hostApi && hostApi.host && typeof hostApi.host.getContext === 'function') return hostApi.host.getContext() || {};
      if (hostApi && typeof hostApi.getContext === 'function') return hostApi.getContext() || {};
    } catch (e) {}
    return {};
  }
  function maybePromise(v) { return v && typeof v.then === 'function' ? v : Promise.resolve(v); }
  function makeStore(hostApi) {
    var hs = hostApi && hostApi.storage;
    var has = hs && typeof hs.get === 'function' && typeof hs.set === 'function';
    return {
      get: function (k) { if (!has) return Promise.resolve(null); try { return maybePromise(hs.get(k)); } catch (e) { return Promise.resolve(null); } },
      set: function (k, v) { if (!has) return Promise.resolve(); try { return maybePromise(hs.set(k, v)); } catch (e) { return Promise.resolve(); } },
      remove: function (k) { if (!hs || typeof hs.remove !== 'function') return Promise.resolve(); try { return maybePromise(hs.remove(k)); } catch (e) { return Promise.resolve(); } }
    };
  }

  function createInstance(container, hostApi) {
    var hostId = hostIdOf(hostApi);
    var hostGate = Engine.validateHost(hostId);
    var store = makeStore(hostApi);
    var identity = hostContext(hostApi);
    var root = el('section', 'sg');
    var state = Engine.makeInitialState(SCENARIO);
    var logs = [];
    var savedScore = null;
    var assistantStatus = 'idle';
    var assistantText = SCENARIO.briefing;
    var lastExport = null;
    var destroyed = false;
    var readyResolve;
    var ready = new Promise(function (resolve) { readyResolve = resolve; });

    function storageKey(k) { return 'shipping-game.' + k; }
    function loadJson(key, fallback) {
      return store.get(storageKey(key)).then(function (v) {
        if (v == null || v === '') return fallback;
        if (typeof v === 'object') return v;
        try { return JSON.parse(v); } catch (e) { return fallback; }
      });
    }
    function saveJson(key, value) { return store.set(storageKey(key), JSON.stringify(value)); }
    function logEvent(type, detail) {
      logs.push({ schema: 'shipping-game.event.v1', ts: new Date().toISOString(), type: type, detail: detail || {} });
      if (logs.length > 120) logs = logs.slice(logs.length - 120);
      saveJson('logs.v1', logs);
    }
    function persistState() {
      saveJson('state.v1', state);
      saveJson('score.v1', { schema: 'shipping-game.score.v1', updated_at: new Date().toISOString(), value: state.score, total: Engine.totalScore(state) });
    }
    function title(s) {
      if (hostApi && hostApi.navigation && typeof hostApi.navigation.setTitle === 'function') {
        try { hostApi.navigation.setTitle(s); } catch (e) {}
      }
    }

    function renderClosed(reason) {
      root.innerHTML = '<div class="sg-closed"><h1>Shipping Game</h1><div class="sg-pill bad">Fail-closed</div>'
        + '<p>' + esc(reason) + '</p><p class="sg-muted">Supported host for Phase A: Skipi Seafarer. No production assistant capability is requested.</p></div>';
    }

    function render() {
      if (destroyed) return;
      clear(root);
      if (!hostGate.ok) {
        renderClosed(hostGate.gate === 'missing-host' ? 'Host identity is missing.' : 'Unsupported host: ' + hostId);
        return;
      }
      title('Игра в судоходство');

      var header = el('div', 'sg-header');
      var hgroup = el('div', 'sg-hgroup');
      hgroup.appendChild(el('div', 'sg-kicker', 'Skipi Plugin · Phase A.2'));
      hgroup.appendChild(el('h1', null, 'Игра в судоходство'));
      hgroup.appendChild(el('p', null, 'Карта, коммерческий loop и минимальная экономика судовладельца.'));
      header.appendChild(hgroup);
      var score = el('div', 'sg-score');
      score.innerHTML = '<span>Total</span><strong>' + Engine.totalScore(state) + '</strong>';
      header.appendChild(score);
      root.appendChild(header);

      var safety = el('div', 'sg-safety');
      safety.textContent = MANIFEST.safety.disclaimer;
      root.appendChild(safety);

      var layout = el('div', 'sg-layout');
      var mapPanel = el('div', 'sg-map-panel');
      var mapBox = el('div', 'sg-map');
      mapPanel.appendChild(mapBox);
      var mapMeta = el('div', 'sg-map-meta');
      mapMeta.textContent = 'Bundled Natural Earth/world-atlas contours. Training vessel is fictional.';
      mapPanel.appendChild(mapMeta);
      layout.appendChild(mapPanel);

      var side = el('div', 'sg-side');
      side.appendChild(rolePanel());
      side.appendChild(gamePanel());
      side.appendChild(assistantPanel());
      layout.appendChild(side);
      root.appendChild(layout);

      MapRenderer.render(mapBox, { contours: MAP_CONTOURS, vessel: Engine.ownerMapMarker(state) || SCENARIO.vessel.marker });
    }

    function rolePanel() {
      var panel = el('div', 'sg-panel');
      panel.appendChild(el('h2', null, 'Role'));
      var roles = ['captain', 'commercial_manager', 'shipowner'];
      var grid = el('div', 'sg-role-grid');
      roles.forEach(function (role) {
        var st = Engine.roleStatus(role, SCENARIO);
        var b = el('button', 'sg-role' + (state.role === role ? ' active' : '') + (!st.ok ? ' disabled' : ''), Engine.roleLabels[role]);
        b.type = 'button';
        b.setAttribute('data-role', role);
        if (st.ok) {
          b.addEventListener('click', function () {
            state = Engine.makeInitialState(SCENARIO, { role: role });
            assistantText = role === 'shipowner'
              ? 'You are acting as the shipowner. Start with liquidity: buy a fictional vessel, improve its detail and ratings, then decide whether to accept work, invest, wait or sell.'
              : SCENARIO.briefing;
            logEvent('role_selected', { role: role, identity_mode: identity.user_id ? 'host' : 'anonymous_lab' });
            persistState();
            render();
          });
        } else {
          b.disabled = true;
          b.title = 'Coming soon';
        }
        var sub = el('span', null, st.ok ? 'playable' : 'soon');
        b.appendChild(sub);
        grid.appendChild(b);
      });
      panel.appendChild(grid);
      var mode = identity.user_id || identity.seafarer_id ? 'Host identity injected' : 'Anonymous local lab mode';
      panel.appendChild(el('div', 'sg-muted', mode));
      return panel;
    }

    function gamePanel() {
      var panel = el('div', 'sg-panel sg-game-panel');
      if (!state.role) {
        panel.appendChild(el('h2', null, 'Scenario'));
        panel.appendChild(el('p', null, SCENARIO.briefing_ru));
        panel.appendChild(el('div', 'sg-muted', 'Choose Commercial manager to start the playable Phase A scenario.'));
        return panel;
      }
      if (state.status === 'coming_soon') {
        panel.appendChild(el('h2', null, Engine.roleLabels[state.role]));
        panel.appendChild(el('p', null, 'Эта роль есть в модели данных, но в Phase A ещё не играбельна.'));
        return panel;
      }
      if (state.role === 'shipowner') return shipownerPanel(panel);
      if (state.status === 'complete') {
        var d = Engine.debrief(SCENARIO, state);
        panel.appendChild(el('h2', null, 'Debrief'));
        panel.appendChild(el('p', null, d.summary));
        panel.appendChild(scoreGrid(d.score_delta));
        panel.appendChild(el('p', 'sg-muted', d.lesson));
        var exportBtn = el('button', 'sg-primary', 'Export JSON log');
        exportBtn.type = 'button';
        exportBtn.addEventListener('click', exportLog);
        panel.appendChild(exportBtn);
        if (lastExport) {
          var a = el('a', 'sg-export-link', 'Download generated log');
          a.href = lastExport.href;
          a.download = lastExport.name;
          panel.appendChild(a);
        }
        return panel;
      }
      var step = Engine.currentStep(SCENARIO, state);
      panel.appendChild(el('div', 'sg-step-count', 'Decision ' + (state.step_index + 1) + ' / ' + SCENARIO.steps.length));
      panel.appendChild(el('h2', null, step.title));
      panel.appendChild(el('p', null, step.prompt));
      var opts = el('div', 'sg-options');
      step.options.forEach(function (o) {
        var b = el('button', 'sg-option', o.label);
        b.type = 'button';
        b.addEventListener('click', function () {
          var r = Engine.chooseOption(SCENARIO, state, o.id);
          if (!r.ok) return;
          state = r.state;
          assistantText = r.consequence;
          logEvent('decision', { step_id: step.id, option_id: o.id, consequence: r.consequence, score: state.score });
          persistState();
          render();
        });
        opts.appendChild(b);
      });
      panel.appendChild(opts);
      panel.appendChild(scoreGrid(Engine.scoreDelta(state)));
      return panel;
    }

    function money(n) {
      n = Math.round(Number(n) || 0);
      return '$' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    function shipownerPanel(panel) {
      var owner = state.owner;
      panel.classList.add('sg-owner-panel');
      panel.appendChild(el('h2', null, 'Shipowner loop'));
      if (!owner) {
        panel.appendChild(el('p', null, 'Shipowner state is missing. Start a new run.'));
        return panel;
      }

      if (state.status === 'shipowner_buy') {
        panel.appendChild(el('p', null, 'Start capital: ' + money(owner.balance) + '. Buy one fictional vessel. The cheaper ship leaves more liquidity; the stronger ship gets accepted faster.'));
        var list = el('div', 'sg-vessel-list');
        Engine.economyConfig.vessels.forEach(function (v) {
          var card = el('button', 'sg-vessel-card');
          card.type = 'button';
          card.setAttribute('data-vessel-id', v.id);
          card.innerHTML = '<strong>' + esc(v.name) + '</strong><span>' + esc(v.type) + '</span>'
            + '<em>Price ' + esc(money(v.price)) + ' · OPEX/turn ' + esc(money(v.opexPerTurn)) + '</em>'
            + '<small>Class ' + esc(v.classRating) + ' · Vetting ' + esc(v.vettingRating) + ' · Condition ' + esc(v.condition) + '</small>'
            + '<p>' + esc(v.description) + '</p>';
          card.addEventListener('click', function () { ownerAction('buy_vessel', function () { return Engine.buyVessel(state, v.id); }); });
          list.appendChild(card);
        });
        panel.appendChild(list);
        return panel;
      }

      if (state.status === 'shipowner_sold' || state.status === 'game_over') {
        var d = Engine.debrief(SCENARIO, state);
        panel.appendChild(el('p', null, d.summary));
        panel.appendChild(ownerMetrics());
        panel.appendChild(el('p', 'sg-muted', d.lesson));
        appendExportButton(panel);
        return panel;
      }

      var vsl = owner.vessel;
      if (!vsl) {
        panel.appendChild(el('p', null, 'No vessel owned.'));
        return panel;
      }

      panel.appendChild(ownerMetrics());
      if (owner.failure_stage === 'warning') {
        panel.appendChild(el('div', 'sg-owner-warning', 'Warning: balance is below zero. If liquidity stays negative after the next OPEX tick, the vessel is arrested and the game ends.'));
      }

      var vessel = el('div', 'sg-owner-vessel');
      vessel.innerHTML = '<strong>' + esc(vsl.name) + '</strong><span>' + esc(vsl.type) + '</span>'
        + '<p>' + esc(vsl.description) + '</p>'
        + '<div class="sg-photo-slots"><span>Hull photo slot</span><span>Hold photo slot</span><span>Engine room photo slot</span></div>';
      panel.appendChild(vessel);

      var offer = Engine.availableCharter(state);
      var offerBox = el('div', 'sg-owner-offer');
      if (owner.charter) {
        offerBox.innerHTML = '<strong>Vessel busy</strong><span>' + esc(owner.charter.cargo) + ' · remaining turns ' + esc(owner.charter.remaining_turns) + '</span><em>Freight on completion: ' + esc(money(owner.charter.freight)) + '</em>';
      } else if (offer && offer.ok) {
        offerBox.innerHTML = '<strong>NPC commercial manager offer</strong><span>' + esc(offer.cargo) + ' · ' + esc(offer.duration_turns) + ' turns</span><em>Freight ' + esc(money(offer.freight)) + '</em>';
        var accept = el('button', 'sg-primary', 'Accept charter');
        accept.type = 'button';
        accept.addEventListener('click', function () { ownerAction('accept_charter', function () { return Engine.acceptCharter(state); }); });
        offerBox.appendChild(accept);
      } else {
        offerBox.innerHTML = '<strong>No acceptable charter</strong><span>' + esc((offer && offer.copy) || 'NPC commercial manager has no offer this turn.') + '</span>';
      }
      panel.appendChild(offerBox);

      var actions = el('div', 'sg-owner-actions');
      Engine.economyConfig.detailActions.forEach(function (a) {
        var done = owner.completed_details.indexOf(a.id) >= 0;
        var b = el('button', 'sg-secondary', (done ? 'Done · ' : '') + a.label + ' (' + money(a.cost) + ')');
        b.type = 'button';
        b.disabled = done || owner.balance < a.cost;
        b.addEventListener('click', function () { ownerAction('detail_vessel', function () { return Engine.improveDetail(state, a.id); }); });
        actions.appendChild(b);
      });

      var survey = el('button', 'sg-secondary', 'Survey class (' + money(Engine.economyConfig.survey.cost) + ')');
      survey.type = 'button';
      survey.disabled = owner.balance < Engine.economyConfig.survey.cost;
      survey.addEventListener('click', function () { ownerAction('class_survey', function () { return Engine.improveRating(state, 'class'); }); });
      actions.appendChild(survey);

      var vet = el('button', 'sg-secondary', 'Vetting inspection (' + money(Engine.economyConfig.inspection.cost) + ')');
      vet.type = 'button';
      vet.disabled = owner.balance < Engine.economyConfig.inspection.cost;
      vet.addEventListener('click', function () { ownerAction('vetting_inspection', function () { return Engine.improveRating(state, 'vetting'); }); });
      actions.appendChild(vet);

      var tick = el('button', 'sg-primary', 'Next turn: pay OPEX');
      tick.type = 'button';
      tick.addEventListener('click', function () { ownerAction('opex_tick', function () { return Engine.tickOwnerTurn(state); }); });
      actions.appendChild(tick);

      var sell = el('button', 'sg-secondary', 'Sell vessel now (' + money(Engine.salePrice(state)) + ')');
      sell.type = 'button';
      sell.addEventListener('click', function () { ownerAction('sell_vessel', function () { return Engine.sellVessel(state); }); });
      actions.appendChild(sell);

      panel.appendChild(actions);
      appendExportButton(panel);
      return panel;
    }

    function ownerMetrics() {
      var owner = state.owner, v = owner && owner.vessel;
      var box = el('div', 'sg-owner-metrics');
      [
        ['Balance', money(owner.balance)],
        ['Turn', owner.turn],
        ['Class', v ? v.classRating : '—'],
        ['Vetting', v ? v.vettingRating : '—'],
        ['Condition', v ? v.condition : '—'],
        ['Detail', owner.detail_level]
      ].forEach(function (pair) {
        var item = el('div', 'sg-owner-metric');
        item.innerHTML = '<span>' + esc(pair[0]) + '</span><strong>' + esc(pair[1]) + '</strong>';
        box.appendChild(item);
      });
      return box;
    }

    function ownerAction(type, fn) {
      var r = fn();
      if (!r || !r.ok) {
        assistantText = 'Action unavailable: ' + ((r && (r.error || (r.offer && r.offer.copy))) || 'unknown');
        render();
        return;
      }
      state = r.state;
      var owner = state.owner || {};
      if (type === 'opex_tick') {
        assistantText = r.freight_paid
          ? 'Freight received: ' + money(r.freight_paid) + '. OPEX and rating decay were applied.'
          : 'OPEX paid. Ratings and condition decayed one step.';
      } else if (type === 'accept_charter') {
        assistantText = 'Charter accepted. Vessel is busy; freight is paid on completion.';
      } else if (type === 'sell_vessel') {
        assistantText = 'Vessel sold for ' + money(r.price) + '.';
      } else if (type === 'buy_vessel') {
        assistantText = 'Vessel purchased. Detail and ratings now decide whether work arrives before OPEX hurts.';
      } else {
        assistantText = 'Investment applied. Detail, rating or condition improved.';
      }
      logEvent(type, { owner: Engine.ownerPublicSummary(state), balance: owner.balance });
      persistState();
      render();
    }

    function appendExportButton(panel) {
      var exportBtn = el('button', 'sg-secondary', 'Export JSON log');
      exportBtn.type = 'button';
      exportBtn.addEventListener('click', exportLog);
      panel.appendChild(exportBtn);
      if (lastExport) {
        var a = el('a', 'sg-export-link', 'Download generated log');
        a.href = lastExport.href;
        a.download = lastExport.name;
        panel.appendChild(a);
      }
    }

    function scoreGrid(delta) {
      var box = el('div', 'sg-score-grid');
      ['cash', 'safety', 'reputation', 'learning'].forEach(function (k) {
        var item = el('div', 'sg-score-item');
        item.innerHTML = '<span>' + esc(k) + '</span><strong>' + esc(state.score[k]) + '</strong><em>' + (delta[k] >= 0 ? '+' : '') + esc(delta[k] || 0) + '</em>';
        box.appendChild(item);
      });
      return box;
    }

    function assistantPanel() {
      var panel = el('div', 'sg-panel sg-assistant');
      panel.appendChild(el('h2', null, 'Assistant'));
      var status = el('div', 'sg-assistant-status ' + assistantStatus, assistantStatus === 'offline' ? 'assistant offline' : assistantStatus);
      panel.appendChild(status);
      panel.appendChild(el('p', null, assistantText));
      var btn = el('button', 'sg-secondary', 'Ask assistant');
      btn.type = 'button';
      btn.disabled = assistantStatus === 'asking';
      btn.addEventListener('click', askAssistant);
      panel.appendChild(btn);
      return panel;
    }

    function askAssistant() {
      var payload = Engine.assistantPayload(SCENARIO, state, state.role === 'shipowner'
        ? 'What should I consider as shipowner before the next economic decision?'
        : 'What should I consider before the next decision?');
      assistantStatus = 'asking';
      assistantText = 'Waiting for lab assistant...';
      render();
      var ask = hostApi && hostApi.assistant && typeof hostApi.assistant.ask === 'function'
        ? hostApi.assistant.ask(payload)
        : Promise.reject(new Error('assistant capability absent'));
      var timeout = new Promise(function (_, reject) {
        setTimeout(function () { reject(new Error('assistant timeout')); }, 10000);
      });
      Promise.race([maybePromise(ask), timeout]).then(function (res) {
        assistantStatus = 'online';
        assistantText = (res && (res.answer || res.advice)) || 'Assistant returned an empty answer.';
        state.assistant.push({ ts: new Date().toISOString(), payload: payload, response: res, offline: false });
        logEvent('assistant_answer', { offline: false, answer: assistantText });
        persistState();
        render();
      }).catch(function () {
        var fallback = Engine.scriptedAssistant(payload);
        assistantStatus = 'offline';
        assistantText = fallback.answer;
        state.assistant.push({ ts: new Date().toISOString(), payload: payload, response: fallback, offline: true });
        logEvent('assistant_answer', { offline: true, answer: assistantText });
        persistState();
        render();
      });
    }

    function exportLog() {
      var log = Engine.exportLog(SCENARIO, state, {
        identity_mode: identity.user_id || identity.seafarer_id ? 'host' : 'anonymous_lab',
        nickname: identity.nickname || null,
        events: logs
      });
      var json = JSON.stringify(log, null, 2);
      lastExport = {
        name: 'shipping-game-' + SCENARIO.id + '-' + Date.now() + '.json',
        href: 'data:application/json;charset=utf-8,' + encodeURIComponent(json),
        json: json
      };
      logEvent('export_log', { bytes: json.length });
      render();
    }

    function init() {
      container.appendChild(root);
      Promise.all([
        loadJson('state.v1', null),
        loadJson('logs.v1', []),
        loadJson('score.v1', null)
      ]).then(function (vals) {
        if (destroyed) return;
        if (vals[0] && vals[0].scenario_id === SCENARIO.id) state = vals[0];
        logs = Array.isArray(vals[1]) ? vals[1] : [];
        savedScore = vals[2] || null;
        if (savedScore && savedScore.value && state.status === 'role_select') state.score = savedScore.value;
        logEvent('mount', { host: hostId || 'none' });
        render();
        if (readyResolve) readyResolve(true);
      });
    }

    function destroy() {
      destroyed = true;
      clear(container);
    }

    function testApi() {
      return {
        ready: ready,
        snapshot: function () {
          var step = Engine.currentStep(SCENARIO, state);
          return {
            hostGate: hostGate.gate,
            role: state.role,
            status: state.status,
            step_index: state.step_index,
            complete: state.status === 'complete',
            total: Engine.totalScore(state),
            decisions: state.decisions.length,
            owner: state.owner ? Engine.ownerPublicSummary(state) : null,
            assistantStatus: assistantStatus,
            exportReady: !!lastExport,
            mapPaths: root.querySelectorAll ? root.querySelectorAll('.sg-map-land').length : 0,
            vesselMarkers: root.querySelectorAll ? root.querySelectorAll('.sg-vessel-marker').length : 0,
            optionCount: step ? step.options.length : 0,
            text: root.textContent || ''
          };
        },
        selectRole: function (role) {
          var btn = root.querySelector('[data-role="' + role + '"]');
          if (btn && !btn.disabled) btn.click();
        },
        chooseFirst: function () {
          var btn = root.querySelector('.sg-option');
          if (btn) btn.click();
        },
        buyVessel: function (id) {
          var btn = root.querySelector('[data-vessel-id="' + id + '"]');
          if (btn) btn.click();
        },
        ownerAction: function (selector) {
          var btn = root.querySelector(selector);
          if (btn) btn.click();
        },
        ownerActionText: function (text) {
          var btn = Array.prototype.slice.call(root.querySelectorAll('button')).filter(function (b) { return b.textContent.indexOf(text) >= 0; })[0];
          if (btn) btn.click();
        },
        acceptCharter: function () {
          var btn = Array.prototype.slice.call(root.querySelectorAll('button')).filter(function (b) { return b.textContent.indexOf('Accept charter') >= 0; })[0];
          if (btn) btn.click();
        },
        nextTurn: function () {
          var btn = Array.prototype.slice.call(root.querySelectorAll('button')).filter(function (b) { return b.textContent.indexOf('Next turn') >= 0; })[0];
          if (btn) btn.click();
        },
        sellVessel: function () {
          var btn = Array.prototype.slice.call(root.querySelectorAll('button')).filter(function (b) { return b.textContent.indexOf('Sell vessel') >= 0; })[0];
          if (btn) btn.click();
        },
        askAssistant: askAssistant,
        exportLog: exportLog,
        lastExport: function () { return lastExport; }
      };
    }

    init();
    return { destroy: destroy, testApi: testApi() };
  }

  function mount(container, hostApi) {
    if (!container) throw new Error('[shipping-game] mount requires a container');
    if (current) { try { current.destroy(); } catch (e) {} }
    clear(container);
    current = createInstance(container, hostApi || {});
    if (window.__SKIPI_PLUGIN_TEST__) window.SkipiPlugins[KEY].__test = current.testApi;
  }

  function unmount() {
    if (current) { try { current.destroy(); } catch (e) {} }
    current = null;
    if (window.SkipiPlugins && window.SkipiPlugins[KEY]) {
      try { delete window.SkipiPlugins[KEY].__test; } catch (e) {}
    }
  }

  window.SkipiPlugins = window.SkipiPlugins || {};
  window.SkipiPlugins[KEY] = { manifest: MANIFEST, mount: mount, unmount: unmount };
})();

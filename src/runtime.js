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
      hgroup.appendChild(el('div', 'sg-kicker', 'Skipi Plugin · Phase A'));
      hgroup.appendChild(el('h1', null, 'Игра в судоходство'));
      hgroup.appendChild(el('p', null, 'Карта, один кораблик и первый коммерческий role-loop.'));
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

      MapRenderer.render(mapBox, { contours: MAP_CONTOURS, vessel: SCENARIO.vessel.marker });
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
            assistantText = SCENARIO.briefing;
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
      var payload = Engine.assistantPayload(SCENARIO, state, 'What should I consider before the next decision?');
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


(function () {
  'use strict';
  window.__SKIPI_PLUGIN_TEST__ = true;
  var results = [];
  function check(name, cond) { results.push({ name: name, ok: !!cond }); }
  function finish() {
    var pass = results.filter(function (r) { return r.ok; }).length;
    var total = results.length;
    var ok = pass === total;
    document.getElementById('result').textContent = (ok ? 'PASS ' : 'FAIL ') + pass + '/' + total;
    document.getElementById('result').className = ok ? 'ok' : 'fail';
    document.title = (ok ? 'PASS ' : 'FAIL ') + pass + '/' + total;
    document.getElementById('lines').innerHTML = results.map(function (r) {
      return (r.ok ? '<span class="ok">PASS</span> ' : '<span class="fail">FAIL</span> ') + r.name;
    }).join('\n');
    window.__TEST_DONE__ = true;
  }
  function plugin() { return window.SkipiPlugins && window.SkipiPlugins['shipping-game']; }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function waitReady(p) { return p.__test && p.__test.ready ? p.__test.ready : Promise.resolve(); }

  window.addEventListener('DOMContentLoaded', function () {
    (async function () {
      try {
        var p = plugin();
        check('plugin registered', !!p);
        check('manifest is shipping-game', p && p.manifest && p.manifest.fqid === 'app.skipi.plugins.shipping-game');
        var hostApi = window.createShippingGameLabHost({ nickname: 'Contract Tester' });
        hostApi.assistant.ask = function (payload) {
          return Promise.resolve({ id: payload.id, answer: 'Live lab answer for ' + payload.role, advice: 'Keep the voyage defensible.' });
        };
        p.mount(document.getElementById('mount'), hostApi);
        await waitReady(p);
        var t = p.__test;
        var s = t.snapshot();
        check('host gate ok', s.hostGate === 'ok');
        check('map contours rendered', s.mapPaths > 10);
        check('one vessel marker rendered', s.vesselMarkers === 1);
        check('role select initial state', s.status === 'role_select');
        check('disclaimer visible', s.text.indexOf('Игровая симуляция') >= 0);

        t.selectRole('commercial_manager');
        await sleep(0);
        s = t.snapshot();
        check('commercial manager starts playable scenario', s.role === 'commercial_manager' && s.status === 'playing');
        check('decision has options', s.optionCount === 3);

        for (var i = 0; i < 6; i++) {
          t.chooseFirst();
          await sleep(0);
        }
        s = t.snapshot();
        check('six decisions complete scenario', s.complete === true && s.decisions === 6);
        check('score changed', s.total !== 50);

        await t.askAssistant();
        await sleep(20);
        s = t.snapshot();
        check('assistant online path works with hostApi.assistant.ask', s.assistantStatus === 'online');

        t.exportLog();
        await sleep(0);
        s = t.snapshot();
        check('export log generated', s.exportReady === true && t.lastExport() && t.lastExport().json.indexOf('shipping-game.log.v1') >= 0);

        p.unmount();
        check('unmount clears container', document.getElementById('mount').children.length === 0);
        check('unmount removes test handle', !p.__test);

        var timeoutHost = window.createShippingGameLabHost({ nickname: 'Offline Tester' });
        timeoutHost.assistant.ask = function () { return new Promise(function () {}); };
        p.mount(document.getElementById('mount'), timeoutHost);
        await waitReady(p);
        p.__test.selectRole('commercial_manager');
        await sleep(0);
        p.__test.askAssistant();
        await sleep(10250);
        check('assistant timeout falls back offline', p.__test.snapshot().assistantStatus === 'offline');
        check('offline fallback copy is honest', p.__test.snapshot().text.indexOf('Assistant offline') >= 0);
        p.unmount();

        var closedHost = { host: { id: 'broker' }, storage: hostApi.storage, navigation: hostApi.navigation, theme: hostApi.theme };
        p.mount(document.getElementById('mount'), closedHost);
        await waitReady(p);
        check('unknown host fail-closed', p.__test.snapshot().hostGate === 'unknown-host');
        p.unmount();
      } catch (e) {
        check('uncaught: ' + e.message, false);
      }
      finish();
    })();
  });
})();

(function () {
  'use strict';

  function createStorage() {
    var prefix = 'shipping-game-lab:';
    return {
      get: function (k) {
        try { return localStorage.getItem(prefix + k); } catch (e) { return null; }
      },
      set: function (k, v) {
        try { localStorage.setItem(prefix + k, String(v)); } catch (e) {}
      },
      remove: function (k) {
        try { localStorage.removeItem(prefix + k); } catch (e) {}
      }
    };
  }

  function askViaBridge(payload) {
    var url = 'http://127.0.0.1:8786/ask';
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (r) {
      if (!r.ok) throw new Error('assistant bridge HTTP ' + r.status);
      return r.json();
    });
  }

  window.createShippingGameLabHost = function createShippingGameLabHost(opts) {
    opts = opts || {};
    var theme = opts.theme || 'light';
    var subs = [];
    return {
      host: {
        id: 'seafarer',
        version: 'lab',
        platform: 'desktop',
        getContext: function () {
          return {
            mode: 'lab',
            user_id: 'lab-local-player',
            nickname: opts.nickname || 'Tymur'
          };
        }
      },
      theme: {
        get: function () { return theme; },
        subscribe: function (cb) {
          if (typeof cb === 'function') subs.push(cb);
          return function () { subs = subs.filter(function (f) { return f !== cb; }); };
        }
      },
      storage: createStorage(),
      navigation: {
        setTitle: function (t) { document.title = t || 'Shipping Game Lab'; },
        closePlugin: function () {}
      },
      assistant: {
        ask: askViaBridge
      },
      __setTheme: function (t) {
        theme = t || 'light';
        subs.forEach(function (cb) { try { cb(theme); } catch (e) {} });
      }
    };
  };
})();


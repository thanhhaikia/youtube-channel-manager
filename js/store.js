/* Local persistence. Everything stays in this browser: localStorage for data and settings,
   sessionStorage for the short-lived Google access tokens. */
(function (root, factory) {
  var metrics = (typeof module === 'object' && module.exports) ? require('./metrics.js') : root.YTM.metrics;
  var mod = factory(root, metrics);
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else { root.YTM = root.YTM || {}; root.YTM.store = mod; }
})(typeof self !== 'undefined' ? self : globalThis, function (root, M) {
  'use strict';

  var KEY = 'ytm.v1';
  var TOKEN_KEY = 'ytm.tokens';
  var EXPORT_VERSION = 1;

  function memoryStorage() {
    var m = {};
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
      setItem: function (k, v) { m[k] = String(v); },
      removeItem: function (k) { delete m[k]; }
    };
  }

  function pick(name) {
    try {
      var s = root[name];
      if (!s) return memoryStorage();
      s.setItem('ytm.probe', '1'); s.removeItem('ytm.probe');
      return s;
    } catch (e) { return memoryStorage(); }
  }

  function blank() {
    return {
      settings: { apiKey: '', clientId: '', monetary: false, days: 28, videoCount: 50 },
      channels: {}, order: [], snapshots: {}, videos: {}, analytics: {},
      quota: { day: '', used: 0 }
    };
  }

  function create(opts) {
    opts = opts || {};
    var local = opts.local || pick('localStorage');
    var session = opts.session || pick('sessionStorage');
    var state = blank();
    var tokens = {};
    var saveError = null;

    function load() {
      state = blank();
      try {
        var raw = JSON.parse(local.getItem(KEY) || 'null');
        if (raw && typeof raw === 'object') {
          Object.keys(state).forEach(function (k) {
            if (raw[k] && typeof raw[k] === 'object') state[k] = k === 'settings' ? Object.assign(state.settings, raw.settings) : raw[k];
          });
          if (!Array.isArray(state.order)) state.order = [];
        }
      } catch (e) { /* corrupted data: start empty */ }
      state.order = state.order.filter(function (id) { return state.channels[id]; });
      Object.keys(state.channels).forEach(function (id) { if (state.order.indexOf(id) < 0) state.order.push(id); });
      try { tokens = JSON.parse(session.getItem(TOKEN_KEY) || '{}') || {}; } catch (e) { tokens = {}; }
      return state;
    }

    function save() {
      try { local.setItem(KEY, JSON.stringify(state)); saveError = null; return true; }
      catch (e) { saveError = e; return false; }
    }

    /* ---- channels ---- */

    var USER_FIELDS = ['group', 'note', 'addedAt', 'owned', 'email', 'demo'];

    function upsertChannel(ch, extra) {
      var prev = state.channels[ch.id] || {};
      var next = Object.assign({}, prev, ch);
      USER_FIELDS.forEach(function (f) { if (prev[f] !== undefined && ch[f] === undefined) next[f] = prev[f]; });
      Object.assign(next, extra || {});
      if (!next.group) next.group = 'ref';
      if (!next.addedAt) next.addedAt = new Date().toISOString();
      if (next.note == null) next.note = '';
      state.channels[ch.id] = next;
      if (state.order.indexOf(ch.id) < 0) state.order.push(ch.id);
      return next;
    }

    function patchChannel(id, patch) {
      if (!state.channels[id]) return null;
      Object.assign(state.channels[id], patch);
      return state.channels[id];
    }

    function removeChannel(id) {
      delete state.channels[id]; delete state.snapshots[id]; delete state.videos[id]; delete state.analytics[id];
      state.order = state.order.filter(function (x) { return x !== id; });
      clearToken(id);
    }

    function list(group) {
      return state.order.map(function (id) { return state.channels[id]; })
        .filter(function (c) { return c && (!group || group === 'all' || c.group === group); });
    }

    function recordSnapshot(id, date) {
      var c = state.channels[id];
      if (!c) return;
      state.snapshots[id] = M.addSnapshot(state.snapshots[id], { d: M.dayKey(date || new Date()), s: c.subs, v: c.views, n: c.videos });
    }

    function setVideos(id, items) { if (state.channels[id]) state.videos[id] = { fetchedAt: new Date().toISOString(), items: items }; }
    function setAnalytics(id, data) { if (state.channels[id]) state.analytics[id] = Object.assign({ fetchedAt: new Date().toISOString() }, data); }

    /* ---- quota (estimate, resets with the Pacific Time day) ---- */

    function addQuota(units, now) {
      var day = M.pacificDayKey(now || new Date());
      if (state.quota.day !== day) state.quota = { day: day, used: 0 };
      state.quota.used += units;
    }

    function quotaUsed(now) {
      return state.quota.day === M.pacificDayKey(now || new Date()) ? state.quota.used : 0;
    }

    /* ---- tokens ---- */

    function saveTokens() { try { session.setItem(TOKEN_KEY, JSON.stringify(tokens)); } catch (e) { /* ignore */ } }

    function setToken(channelId, token, expiresInSec, now) {
      tokens[channelId] = { t: token, exp: (now || Date.now()) + (expiresInSec || 3600) * 1000 };
      saveTokens();
    }

    function getToken(channelId, now) {
      var e = tokens[channelId];
      if (!e) return null;
      if (e.exp - 60000 <= (now || Date.now())) return null;
      return e.t;
    }

    function clearToken(channelId) { delete tokens[channelId]; saveTokens(); }

    function anyToken(now) {
      var ids = Object.keys(tokens);
      for (var i = 0; i < ids.length; i++) { var t = getToken(ids[i], now); if (t) return t; }
      return null;
    }

    /* ---- export / import (never includes tokens, API key or client ID) ---- */

    function exportData() {
      return {
        app: 'youtube-channel-manager', version: EXPORT_VERSION, exportedAt: new Date().toISOString(),
        channels: state.channels, order: state.order, snapshots: state.snapshots,
        videos: state.videos, analytics: state.analytics
      };
    }

    function importData(obj, mode) {
      if (!obj || obj.app !== 'youtube-channel-manager' || typeof obj.channels !== 'object' || !obj.channels) {
        throw new Error('Tệp không đúng định dạng sao lưu của ứng dụng này.');
      }
      if (mode === 'replace') {
        state.channels = {}; state.order = []; state.snapshots = {}; state.videos = {}; state.analytics = {};
      }
      var n = 0;
      (Array.isArray(obj.order) ? obj.order : Object.keys(obj.channels)).forEach(function (id) {
        var c = obj.channels[id];
        if (!c || typeof c !== 'object' || c.id !== id) return;
        var existing = state.channels[id];
        if (!existing) state.channels[id] = c;
        else {
          /* Newer statistics win; the user's own fields stay unless they are empty here. */
          var newer = c.fetchedAt && (!existing.fetchedAt || c.fetchedAt > existing.fetchedAt);
          var merged = newer ? Object.assign({}, existing, c) : Object.assign({}, c, existing);
          USER_FIELDS.forEach(function (f) { merged[f] = existing[f] || c[f]; });
          state.channels[id] = merged;
        }
        ['videos', 'analytics'].forEach(function (k) {
          var inc = obj[k] && obj[k][id], cur = state[k][id];
          if (inc && typeof inc === 'object' && (!cur || (inc.fetchedAt || '') > (cur.fetchedAt || ''))) state[k][id] = inc;
        });
        if (state.order.indexOf(id) < 0) state.order.push(id);
        var merged = state.snapshots[id] || [];
        ((obj.snapshots && obj.snapshots[id]) || []).forEach(function (s) {
          if (s && typeof s.d === 'string' && !merged.some(function (x) { return x.d === s.d; })) merged = M.addSnapshot(merged, s);
        });
        state.snapshots[id] = merged;
        n++;
      });
      return n;
    }

    function clearAll() {
      var settings = state.settings;
      state = blank();
      state.settings = settings;
      tokens = {}; saveTokens();
    }

    load();

    return {
      load: load, save: save, get state() { return state; }, get saveError() { return saveError; },
      upsertChannel: upsertChannel, patchChannel: patchChannel, removeChannel: removeChannel, list: list,
      recordSnapshot: recordSnapshot, setVideos: setVideos, setAnalytics: setAnalytics,
      addQuota: addQuota, quotaUsed: quotaUsed,
      setToken: setToken, getToken: getToken, clearToken: clearToken, anyToken: anyToken,
      exportData: exportData, importData: importData, clearAll: clearAll
    };
  }

  return { create: create, memoryStorage: memoryStorage, KEY: KEY };
});

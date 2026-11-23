/* Application state, data loading and event handling. Rendering lives in views.js. */
(function (root) {
  'use strict';
  var Y = root.YTM, M = Y.metrics, api = Y.api;
  var store = Y.store.create();
  var FATAL = ['quotaExceeded', 'dailyLimitExceeded', 'keyInvalid', 'accessNotConfigured', 'network', 'noAuth'];
  var STALE_MS = 3 * 3600 * 1000;
  var HISTORY_DAYS = 180;

  var ui = {
    hash: root.location.hash, group: 'all', sort: 'subs', deltaDays: 7, busy: '',
    detail: { growth: 's', ana: 'views', vsort: 'date', vq: '', all: false },
    compare: null,
    vids: { group: 'all', channel: '', sort: 'date', q: '', limit: 60 }
  };

  api.setCostListener(function (n) { store.addQuota(n); });

  function settings() { return store.state.settings; }
  function channel(id) { return store.state.channels[id]; }
  function isReal(id) { var c = channel(id); return !!c && !c.demo; }

  function publicAuth() {
    if (settings().apiKey) return { key: settings().apiKey };
    var t = store.anyToken();
    return t ? { token: t } : null;
  }

  function connState(c) {
    if (c.demo) return 'demo';
    if (c.missing) return 'missing';
    if (!c.owned) return 'public';
    return store.getToken(c.id) ? 'connected' : 'expired';
  }

  /* ---- feedback ---- */

  function toast(msg, type) {
    var box = document.getElementById('toasts');
    var el = document.createElement('div');
    el.className = 'toast ' + (type || 'info');
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(function () { el.remove(); }, type === 'error' ? 9000 : 5000);
  }

  function setBusy(text) {
    ui.busy = text || '';
    var bar = document.getElementById('busy');
    bar.textContent = ui.busy;
    bar.hidden = !ui.busy;
    Array.prototype.forEach.call(document.querySelectorAll('[data-busy-disable]'), function (b) { b.disabled = !!ui.busy; });
  }

  function persist() {
    if (!store.save()) toast('Không lưu được dữ liệu vào trình duyệt (bộ nhớ đầy). Hãy xóa bớt kênh hoặc xuất dữ liệu ra tệp.', 'error');
  }

  function fail(err) {
    setBusy('');
    toast(err && err.name === 'ApiError' ? api.explain(err) : (err && err.message) || 'Có lỗi xảy ra.', 'error');
    Y.views.render();
  }

  function pool(items, size, worker) {
    var i = 0, stop = null;
    function next() {
      if (stop || i >= items.length) return Promise.resolve();
      var item = items[i++];
      return worker(item).then(next, function (e) { stop = stop || e; });
    }
    var runners = [];
    for (var k = 0; k < Math.min(size, items.length); k++) runners.push(next());
    return Promise.all(runners).then(function () { if (stop) throw stop; });
  }

  /* ---- loading ---- */

  function loadAnalytics(id, token, days) {
    var c = channel(id);
    return api.fetchAnalytics(id, token, { days: days || settings().days, historyDays: HISTORY_DAYS, monetary: settings().monetary })
      .then(function (a) {
        var known = {};
        ((store.state.videos[id] || {}).items || []).forEach(function (v) { known[v.id] = v.title; });
        var missing = a.topVideos.filter(function (v) { return !known[v.id]; }).map(function (v) { return v.id; });
        var titles = missing.length ? api.fetchVideos(missing, { token: token }).then(function (list) {
          list.forEach(function (v) { known[v.id] = v.title; });
        }, function () {}) : Promise.resolve();
        return titles.then(function () {
          a.topVideos.forEach(function (v) { v.title = known[v.id] || v.id; });
          store.setAnalytics(id, a);
          store.patchChannel(id, { anaError: '' });
        });
      }, function (err) {
        if (err.reason === 'authError') { Y.auth.invalidate(token); store.clearToken(id); }
        store.patchChannel(id, { anaError: api.explain(err) });
        if (c && err.reason === 'network') throw err;
      });
  }

  /* Recent videos and, for signed-in channels, private analytics. */
  function loadDetails(ids) {
    var done = 0;
    return pool(ids, 4, function (id) {
      var c = channel(id);
      if (!c) return Promise.resolve();
      var token = c.owned ? store.getToken(id) : null;
      var auth = token ? { token: token } : publicAuth();
      if (!auth) return Promise.reject(new api.ApiError(0, 'noAuth'));
      return api.fetchRecentVideos(c.uploads, auth, settings().videoCount).then(null, function (err) {
        if (err.reason === 'authError' && token) {
          Y.auth.invalidate(token); store.clearToken(id); token = null;
          var pub = publicAuth();
          if (pub) return api.fetchRecentVideos(c.uploads, pub, settings().videoCount);
        }
        throw err;
      }).then(function (items) { store.setVideos(id, items); }, function (err) {
        if (FATAL.indexOf(err.reason) >= 0) throw err;
        store.patchChannel(id, { videoError: api.explain(err) });
      }).then(function () {
        if (token && c.scopeOk !== false) return loadAnalytics(id, token);
      }).then(function () {
        done++;
        setBusy('Đang tải video và số liệu: ' + done + '/' + ids.length + ' kênh…');
      });
    });
  }

  /* Android app only: renews lapsed sign-ins without showing anything, one request per account. */
  function renewSilently(ids) {
    if (!Y.auth.isNative()) return Promise.resolve();
    var byEmail = {};
    ids.forEach(function (id) {
      var c = channel(id);
      if (c && c.owned && c.email && !c.signedOut && !store.getToken(id)) (byEmail[c.email] = byEmail[c.email] || []).push(id);
    });
    return Object.keys(byEmail).reduce(function (p, email) {
      return p.then(function () {
        return Y.auth.requestToken({ hint: email, monetary: settings().monetary, silent: true }).then(function (res) {
          byEmail[email].forEach(function (id) { store.setToken(id, res.token, res.expiresIn); });
        }, function () { /* stays expired; the user can reconnect */ });
      });
    }, Promise.resolve());
  }

  /* Forgets a token the API rejected, for every channel signed in with it. */
  function dropToken(token) {
    Y.auth.invalidate(token);
    store.state.order.forEach(function (id) { if (store.getToken(id) === token) store.clearToken(id); });
  }

  /* Public channel data. A rejected sign-in is dropped and the next one (or a renewed one) is tried. */
  function fetchPublic(ids, tries) {
    return renewSilently(ids).then(function () {
      var auth = publicAuth();
      if (!auth) throw new api.ApiError(0, 'noAuth');
      return api.fetchChannels(ids, auth).then(null, function (err) {
        if (err.reason !== 'authError' || !auth.token) throw err;
        dropToken(auth.token);
        if (tries <= 1) throw err;
        return fetchPublic(ids, tries - 1);
      });
    });
  }

  function refresh(ids, quiet) {
    ids = (ids || store.state.order).filter(isReal);
    if (!ids.length) { if (!quiet) toast('Chưa có kênh thật nào để làm mới.'); return Promise.resolve(); }
    if (ui.busy) return Promise.resolve();
    setBusy('Đang tải thông tin ' + ids.length + ' kênh…');
    var now = new Date().toISOString();
    return fetchPublic(ids, 3).then(function (fresh) {
      var found = {};
      fresh.forEach(function (c) {
        found[c.id] = true;
        if (!channel(c.id)) return;
        store.upsertChannel(c, { fetchedAt: now, missing: false, videoError: '' });
        store.recordSnapshot(c.id);
      });
      ids.forEach(function (id) { if (!found[id]) store.patchChannel(id, { missing: true }); });
      return loadDetails(ids.filter(function (id) { return found[id]; }));
    }).then(function () {
      if (ids.length === store.state.order.filter(isReal).length) settings().lastRefresh = now;
      persist(); setBusy('');
      if (!quiet) toast('Đã cập nhật ' + ids.length + ' kênh.', 'ok');
      Y.views.render();
    }, function (err) {
      persist();
      if (quiet && err.reason === 'noAuth') { setBusy(''); Y.views.render(); } else fail(err);
    });
  }

  function addChannel(input) {
    var auth = publicAuth();
    if (!auth) { toast('Cần API key hoặc đăng nhập Google trước khi thêm kênh. Mở Cài đặt để thiết lập.', 'error'); return Promise.resolve(); }
    if (!api.parseChannelInput(input)) { toast('Không nhận ra kênh từ nội dung vừa nhập. Hãy dán link kênh, @handle hoặc link một video của kênh.', 'error'); return Promise.resolve(); }
    setBusy('Đang tìm kênh…');
    return api.resolveChannel(input, auth).then(function (c) {
      var existed = !!channel(c.id);
      store.upsertChannel(c, { fetchedAt: new Date().toISOString(), missing: false });
      store.recordSnapshot(c.id);
      persist();
      return loadDetails([c.id]).then(function () {
        persist(); setBusy('');
        toast(existed ? 'Kênh "' + c.title + '" đã có trong danh sách, đã cập nhật lại.' : 'Đã thêm kênh "' + c.title + '".', 'ok');
        Y.views.render();
      });
    }).then(null, fail);
  }

  /* Google sign-in. With `hintId` it renews the session of that channel. */
  function connect(hintId) {
    var s = settings();
    if (!s.clientId && !Y.auth.isNative()) {
      toast('Hãy nhập OAuth Client ID trong Cài đặt trước khi đăng nhập Google.', 'error');
      navigate('#/settings');
      return Promise.resolve(false);
    }
    var hint = hintId && channel(hintId) ? channel(hintId).email : '';
    return Y.auth.requestToken({ clientId: s.clientId, monetary: s.monetary, hint: hint, prompt: hint ? '' : 'select_account' }).then(function (res) {
      setBusy('Đang lấy thông tin kênh…');
      return Promise.all([api.fetchMyChannels(res.token), api.fetchUserEmail(res.token)]).then(function (r) {
        var mine = r[0], email = r[1], now = new Date().toISOString();
        if (!mine.length) { setBusy(''); toast('Tài khoản Google vừa chọn chưa có kênh YouTube nào.', 'error'); return false; }
        var scopeOk = Y.auth.hasAnalyticsScope(res.scope);
        mine.forEach(function (c) {
          store.upsertChannel(c, { group: 'mine', owned: true, email: email, scopeOk: scopeOk, signedOut: false, fetchedAt: now, missing: false, demo: false });
          store.setToken(c.id, res.token, res.expiresIn);
          store.recordSnapshot(c.id);
        });
        persist();
        var ids = mine.map(function (c) { return c.id; });
        if (hintId && ids.indexOf(hintId) < 0) {
          toast('Tài khoản vừa chọn không quản lý kênh "' + channel(hintId).title + '". Đã kết nối kênh "' + mine[0].title + '".', 'error');
        } else if (!scopeOk) {
          toast('Đã kết nối "' + mine[0].title + '" nhưng chưa có quyền xem YouTube Analytics. Kết nối lại và tick đủ các ô quyền để xem số liệu riêng.', 'error');
        } else {
          toast('Đã kết nối kênh "' + mine[0].title + '".', 'ok');
        }
        return loadDetails(ids).then(function () { persist(); setBusy(''); Y.views.render(); return true; });
      });
    }).then(null, function (err) { fail(err); return false; });
  }

  function reconnectAll() {
    var ids = store.list().filter(function (c) { return connState(c) === 'expired'; }).map(function (c) { return c.id; });
    return ids.reduce(function (p, id) {
      return p.then(function (ok) { return ok === false ? false : connect(id); });
    }, Promise.resolve(true));
  }

  function changePeriod(id, days) {
    settings().days = days;
    persist();
    Y.views.render();
    var token = isReal(id) && store.getToken(id);
    if (!token) return Promise.resolve();
    setBusy('Đang tải số liệu ' + days + ' ngày…');
    return loadAnalytics(id, token, days).then(function () { persist(); setBusy(''); Y.views.render(); }, fail);
  }

  /* ---- data management ---- */

  function download(name, text, type) {
    if (Y.auth.isNative()) { Y.auth.native().saveFile(name, type, text); return; }
    var blob = new Blob([text], { type: type });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  function csvCell(v) {
    var s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function buildCsv() {
    var head = ['Tên kênh', 'Handle', 'ID kênh', 'Nhóm', 'Người đăng ký', 'Lượt xem', 'Số video', 'Lượt xem TB (video gần đây)',
      'Tỉ lệ tương tác (%)', 'Video mỗi tuần', 'Video mới nhất', 'Cập nhật lúc', 'Ghi chú'];
    var rows = store.list().map(function (c) {
      var vs = M.videoStats((store.state.videos[c.id] || {}).items);
      return [c.title, c.handle, c.id, c.group === 'mine' ? 'Kênh của tôi' : 'Tham khảo', c.subs, c.views, c.videos,
        vs.avgViews == null ? '' : Math.round(vs.avgViews), vs.engagement == null ? '' : (vs.engagement * 100).toFixed(2),
        vs.perWeek == null ? '' : vs.perWeek.toFixed(2), vs.lastUpload ? vs.lastUpload.slice(0, 10) : '', c.fetchedAt || '', c.note || ''];
    });
    return '\ufeff' + [head].concat(rows).map(function (r) { return r.map(csvCell).join(','); }).join('\r\n');
  }

  function loadDemo() {
    var d = Y.demo.build();
    d.order.forEach(function (id) {
      store.state.channels[id] = d.channels[id];
      if (store.state.order.indexOf(id) < 0) store.state.order.push(id);
      store.state.snapshots[id] = d.snapshots[id];
      store.state.videos[id] = d.videos[id];
      if (d.analytics[id]) store.state.analytics[id] = d.analytics[id];
    });
    persist();
  }

  function removeDemo() {
    store.list().filter(function (c) { return c.demo; }).forEach(function (c) { store.removeChannel(c.id); });
    persist();
  }

  function importFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var n = store.importData(JSON.parse(reader.result), 'merge');
        persist();
        toast('Đã nhập ' + n + ' kênh từ tệp sao lưu.', 'ok');
        Y.views.render();
      } catch (e) { toast(e instanceof SyntaxError ? 'Tệp không phải JSON hợp lệ.' : e.message, 'error'); }
    };
    reader.readAsText(file);
  }

  function testKey() {
    var key = settings().apiKey;
    if (!key) { toast('Chưa nhập API key.', 'error'); return Promise.resolve(); }
    setBusy('Đang kiểm tra API key…');
    return api.fetchChannels(['UC_x5XG1OV2P6uZZ5FSM9Ttw'], { key: key }).then(function () {
      persist(); setBusy(''); toast('API key hoạt động.', 'ok'); Y.views.render();
    }, fail);
  }

  /* ---- navigation ---- */

  function onRoute() {
    ui.detail.all = false; ui.detail.vq = ''; ui.vids.limit = 60;
    Y.views.render();
    root.scrollTo(0, 0);
  }

  /* The route is kept in memory, so the app also works where the address cannot change
     (for example when the page is embedded as a document without its own URL). */
  function navigate(hash) {
    if (hash === ui.hash) return;
    ui.hash = hash;
    try { if (root.location.protocol !== 'about:' && root.location.hash !== hash) root.location.hash = hash; } catch (e) { /* ignore */ }
    onRoute();
  }

  /* ---- events ---- */

  var noteTimer = null;

  var actions = {
    'refresh-all': function () { refresh(); },
    'refresh-one': function (el) { refresh([el.dataset.id]); },
    'connect': function () { connect(); },
    'reconnect': function (el) { connect(el.dataset.id); },
    'reconnect-all': function () { reconnectAll(); },
    'remove': function (el) {
      var c = channel(el.dataset.id);
      if (!c || !root.confirm('Xóa kênh "' + c.title + '" khỏi danh sách? Lịch sử theo dõi của kênh này cũng bị xóa.')) return;
      store.removeChannel(c.id); persist();
      if (/^#\/channel\//.test(ui.hash)) navigate('#/');
      else Y.views.render();
    },
    'group': function (el) { ui.group = el.dataset.value; Y.views.render(); },
    'sort-videos': function (el) { ui.detail.vsort = el.dataset.value; Y.views.render(); },
    'show-all-videos': function () { ui.detail.all = true; Y.views.render(); },
    'more-videos': function () { ui.vids.limit += 60; Y.views.render(); },
    'growth': function (el) { ui.detail.growth = el.dataset.value; Y.views.render(); },
    'ana': function (el) { ui.detail.ana = el.dataset.value; Y.views.render(); },
    'period': function (el) { changePeriod(el.dataset.id, Number(el.dataset.value)); },
    'compare-toggle': function (el) {
      var i = ui.compare.indexOf(el.dataset.id);
      if (i >= 0) ui.compare.splice(i, 1); else ui.compare.push(el.dataset.id);
      Y.views.render();
    },
    'demo-load': function () { loadDemo(); toast('Đã nạp dữ liệu mẫu.', 'ok'); navigate('#/'); Y.views.render(); },
    'demo-remove': function () { removeDemo(); toast('Đã xóa dữ liệu mẫu.', 'ok'); Y.views.render(); },
    'export-json': function () { download('youtube-channels-' + M.dayKey(new Date()) + '.json', JSON.stringify(store.exportData(), null, 1), 'application/json'); },
    'export-csv': function () { download('youtube-channels-' + M.dayKey(new Date()) + '.csv', buildCsv(), 'text/csv;charset=utf-8'); },
    'import': function () { document.getElementById('import-file').click(); },
    'test-key': function () { testKey(); },
    'toggle-key': function () { var i = document.getElementById('set-key'); i.type = i.type === 'password' ? 'text' : 'password'; },
    'disconnect': function (el) {
      var t = store.getToken(el.dataset.id);
      if (t) Y.auth.revoke(t);
      store.clearToken(el.dataset.id);
      store.patchChannel(el.dataset.id, { signedOut: true });
      persist();
      toast('Đã ngắt phiên đăng nhập của kênh này trên thiết bị.', 'ok');
      Y.views.render();
    },
    'clear-all': function () {
      if (!root.confirm('Xóa toàn bộ kênh và lịch sử theo dõi trên trình duyệt này? Không thể hoàn tác (hãy xuất tệp sao lưu trước nếu cần).')) return;
      store.clearAll(); persist(); Y.views.render();
    }
  };

  var changes = {
    'sort': function (el) { ui.sort = el.value; Y.views.render(); },
    'delta': function (el) { ui.deltaDays = Number(el.value); Y.views.render(); },
    'channel-group': function (el) { store.patchChannel(el.dataset.id, { group: el.value }); persist(); Y.views.render(); },
    'vids-group': function (el) { ui.vids.group = el.value; ui.vids.channel = ''; Y.views.render(); },
    'vids-channel': function (el) { ui.vids.channel = el.value; Y.views.render(); },
    'vids-sort': function (el) { ui.vids.sort = el.value; Y.views.render(); },
    'set-key': function (el) { settings().apiKey = el.value.trim(); persist(); },
    'set-client': function (el) { settings().clientId = el.value.trim(); persist(); if (settings().clientId) Y.auth.preload(); },
    'set-monetary': function (el) { settings().monetary = el.checked; persist(); },
    'set-videocount': function (el) { settings().videoCount = Number(el.value); persist(); },
    'import-file': function (el) { if (el.files[0]) importFile(el.files[0]); el.value = ''; }
  };

  var inputs = {
    'note': function (el) {
      store.patchChannel(el.dataset.id, { note: el.value });
      clearTimeout(noteTimer);
      noteTimer = setTimeout(function () { noteTimer = null; persist(); }, 500);
    },
    'detail-q': function (el) { ui.detail.vq = el.value; Y.views.renderPart('detail-videos'); },
    'vids-q': function (el) { ui.vids.q = el.value; Y.views.renderPart('all-videos'); }
  };

  function init() {
    document.addEventListener('click', function (e) {
      var link = e.target.closest('a[href^="#"]');
      if (link && e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        var href = link.getAttribute('href');
        e.preventDefault();
        if (href.indexOf('#/') === 0) navigate(href);
        else document.getElementById('view').focus();
        return;
      }
      var el = e.target.closest('[data-action]');
      if (!el || el.disabled) return;
      var fn = actions[el.dataset.action];
      if (fn) { e.preventDefault(); fn(el); }
    });
    document.addEventListener('change', function (e) {
      var fn = e.target.dataset && changes[e.target.dataset.change];
      if (fn) fn(e.target);
    });
    document.addEventListener('input', function (e) {
      var fn = e.target.dataset && inputs[e.target.dataset.input];
      if (fn) fn(e.target);
    });
    document.addEventListener('submit', function (e) {
      if (e.target.dataset.form !== 'add') return;
      e.preventDefault();
      var input = e.target.querySelector('input');
      var value = input.value.trim();
      if (!value || ui.busy) return;
      addChannel(value).then(function () { if (!ui.busy) { var i = document.querySelector('[data-form="add"] input'); if (i) i.value = ''; } });
    });
    root.addEventListener('hashchange', function () {
      if (root.location.hash === ui.hash) return;
      ui.hash = root.location.hash;
      onRoute();
    });
    root.addEventListener('pagehide', function () {
      if (noteTimer) { clearTimeout(noteTimer); noteTimer = null; persist(); }
    });
    root.addEventListener('storage', function (e) {
      if (e.key !== Y.store.KEY || ui.busy) return;
      store.load();
      Y.views.render();
    });
    Y.views.render();
    if (settings().clientId) Y.auth.preload();
    var last = settings().lastRefresh ? +new Date(settings().lastRefresh) : 0;
    if (Date.now() - last > STALE_MS && store.state.order.some(isReal) && (publicAuth() || Y.auth.isNative())) refresh(null, true);
  }

  Y.app = {
    store: store, ui: ui, settings: settings, channel: channel, connState: connState, publicAuth: publicAuth,
    refresh: refresh, connect: connect, addChannel: addChannel, toast: toast, init: init, buildCsv: buildCsv
  };
})(typeof self !== 'undefined' ? self : globalThis);

/* Rendering: builds HTML strings from the stored data. All external text goes through esc(). */
(function (root) {
  'use strict';
  var Y = root.YTM, M = Y.metrics, C = Y.charts, api = Y.api, esc = C.esc;
  var WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  var regionNames = null;
  try { regionNames = new Intl.DisplayNames(['vi'], { type: 'region' }); } catch (e) { regionNames = null; }

  function app() { return Y.app; }
  function st() { return Y.app.store.state; }
  function videosOf(id) { return (st().videos[id] || {}).items || []; }
  function country(code) { try { return (regionNames && code && regionNames.of(code)) || code || ''; } catch (e) { return code; } }
  function img(url, cls) {
    if (!/^(https:\/\/[\w.-]+\.(ggpht|ytimg|googleusercontent)\.com\/|data:image\/)/.test(url || '')) return '<span class="' + cls + ' ph"></span>';
    return '<img class="' + cls + '" src="' + esc(url) + '" alt="" loading="lazy" referrerpolicy="no-referrer">';
  }
  function chLink(c) { return c.demo ? '' : 'https://www.youtube.com/channel/' + encodeURIComponent(c.id); }
  function vLink(c, v) { return c.demo ? '' : 'https://www.youtube.com/watch?v=' + encodeURIComponent(v.id); }
  function ext(url, text, cls) {
    return url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener" class="' + (cls || '') + '">' + text + '</a>' : '<span class="' + (cls || '') + '">' + text + '</span>';
  }
  function opt(value, label, cur) { return '<option value="' + esc(value) + '"' + (String(cur) === String(value) ? ' selected' : '') + '>' + esc(label) + '</option>'; }
  function tabs(action, items, cur, extra) {
    return '<div class="tabs" role="group">' + items.map(function (i) {
      return '<button type="button" class="tab' + (String(cur) === String(i[0]) ? ' on' : '') + '" data-action="' + action + '" data-value="' + esc(i[0]) + '"' +
        (extra || '') + ' aria-pressed="' + (String(cur) === String(i[0])) + '">' + esc(i[1]) + '</button>';
    }).join('') + '</div>';
  }
  function delta(d, compact) {
    if (!d) return '<span class="delta none" title="Chưa đủ lịch sử. Số thay đổi xuất hiện sau khi làm mới ở ít nhất hai ngày khác nhau.">—</span>';
    var cls = d.delta > 0 ? 'up' : d.delta < 0 ? 'down' : 'flat';
    return '<span class="delta ' + cls + '" title="Thay đổi trong ' + d.days + ' ngày (từ ' + esc(M.fmtDate(d.from)) + ')">' + esc(M.fmtSigned(d.delta, compact)) + '</span>';
  }
  function change(x) {
    if (x == null) return '';
    return '<span class="delta ' + (x > 0 ? 'up' : x < 0 ? 'down' : 'flat') + '">' + (x > 0 ? '+' : x < 0 ? '−' : '') + esc(M.fmtPercent(Math.abs(x))) + '</span>';
  }
  function kpi(label, value, sub, title) {
    return '<div class="kpi"' + (title ? ' title="' + esc(title) + '"' : '') + '><div class="kpi-label">' + esc(label) + '</div><div class="kpi-value">' + value + '</div>' +
      (sub ? '<div class="kpi-sub">' + sub + '</div>' : '') + '</div>';
  }
  var BADGES = {
    connected: ['ok', 'Đã kết nối'], expired: ['warn', 'Hết phiên'], demo: ['muted', 'Dữ liệu mẫu'],
    'public': ['muted', 'Tham khảo'], missing: ['bad', 'Không tìm thấy']
  };
  function badge(c) {
    var s = app().connState(c), b = BADGES[s];
    if (s === 'public' && c.group === 'mine') b = ['muted', 'Chưa đăng nhập'];
    return '<span class="badge ' + b[0] + '">' + b[1] + '</span>';
  }
  function anaSummary(id, days) {
    var a = st().analytics[id];
    return a && a.daily && a.daily.length ? M.analyticsSummary(a.daily, a.daily[a.daily.length - 1].day, days) : null;
  }
  function row(c) {
    var snaps = st().snapshots[c.id] || [], d = app().ui.deltaDays;
    return {
      c: c, vs: M.videoStats(videosOf(c.id)), dS: M.snapshotDelta(snaps, 's', d), dV: M.snapshotDelta(snaps, 'v', d),
      dN: M.snapshotDelta(snaps, 'n', d), ana: anaSummary(c.id, 28), snaps: snaps
    };
  }

  /* ---------- dashboard ---------- */

  function addForm() {
    return '<form class="add" data-form="add"><label class="sr" for="add-input">Thêm kênh</label>' +
      '<input id="add-input" type="text" placeholder="Dán link kênh, @handle hoặc link video để thêm kênh tham khảo" autocomplete="off">' +
      '<button class="btn" data-busy-disable>Thêm kênh</button></form>';
  }

  function onboarding() {
    return '<section class="card hero"><h1>Quản lý tất cả kênh YouTube ở một nơi</h1>' +
      '<p>Đăng nhập từng tài khoản Google để theo dõi kênh của bạn (kể cả số liệu riêng như thời gian xem, người đăng ký tăng giảm), và thêm kênh của người khác để tham khảo, so sánh.</p>' +
      '<div class="steps">' +
      '<div class="step"><b>1. Thiết lập một lần</b><p>Nhập OAuth Client ID và API key của bạn trong Cài đặt. Có hướng dẫn từng bước.</p><a class="btn" href="#/settings">Mở Cài đặt</a></div>' +
      '<div class="step"><b>2. Đăng nhập kênh của bạn</b><p>Mỗi kênh đăng nhập một lần bằng tài khoản Google tương ứng.</p><button class="btn primary" data-action="connect" data-busy-disable>Đăng nhập Google</button></div>' +
      '<div class="step"><b>3. Hoặc xem thử trước</b><p>Nạp vài kênh mẫu (số liệu không có thật) để xem giao diện.</p><button class="btn" data-action="demo-load">Xem dữ liệu mẫu</button></div>' +
      '</div>' + addForm() + '</section>';
  }

  var SORTS = {
    subs: function (r) { return r.c.subs; }, views: function (r) { return r.c.views; }, videos: function (r) { return r.c.videos; },
    dsubs: function (r) { return r.dS ? r.dS.delta : null; }, dviews: function (r) { return r.dV ? r.dV.delta : null; },
    avg: function (r) { return r.vs.avgViews; }, eng: function (r) { return r.vs.engagement; },
    last: function (r) { return r.vs.lastUpload ? +new Date(r.vs.lastUpload) : null; }
  };

  function dashboard() {
    var a = app(), ui = a.ui, all = a.store.list();
    if (!all.length) return onboarding();
    var rows = a.store.list(ui.group).map(row);
    if (ui.sort === 'title') rows.sort(function (x, y) { return x.c.title.localeCompare(y.c.title, 'vi'); });
    else rows.sort(function (x, y) { var f = SORTS[ui.sort], p = f(x), q = f(y); return (q == null ? -Infinity : q) - (p == null ? -Infinity : p); });
    var sum = function (f) { var s = 0, any = false; rows.forEach(function (r) { var v = f(r); if (v != null) { s += v; any = true; } }); return any ? s : null; };
    var sumDelta = function (k) {
      var s = 0, days = 0, from = null;
      rows.forEach(function (r) { if (r[k]) { s += r[k].delta; days = Math.max(days, r[k].days); from = !from || r[k].from < from ? r[k].from : from; } });
      return from ? { delta: s, days: days, from: from } : null;
    };
    var anaRows = rows.filter(function (r) { return r.ana; });
    var expired = all.filter(function (c) { return a.connState(c) === 'expired'; });
    var html = '';
    if (all.some(function (c) { return c.demo; })) {
      html += '<div class="notice">Đang hiển thị dữ liệu mẫu, số liệu không có thật. <button class="link" data-action="demo-remove">Xóa dữ liệu mẫu</button></div>';
    }
    if (expired.length) {
      html += '<div class="notice warn">' + expired.length + ' kênh đã hết phiên đăng nhập Google (mỗi phiên kéo dài khoảng 1 giờ). Số liệu công khai vẫn cập nhật; số liệu riêng cần kết nối lại. ' +
        '<button class="link" data-action="reconnect-all" data-busy-disable>Kết nối lại tất cả</button></div>';
    }
    html += '<div class="toolbar">' + tabs('group', [['all', 'Tất cả (' + all.length + ')'], ['mine', 'Kênh của tôi'], ['ref', 'Kênh tham khảo']], ui.group) +
      '<div class="spacer"></div><button class="btn primary" data-action="connect" data-busy-disable>Đăng nhập Google để thêm kênh</button></div>';
    html += '<div class="kpis">' +
      kpi('Người đăng ký', esc(M.fmtCompact(sum(function (r) { return r.c.subs; }))), delta(sumDelta('dS'), true) + ' <small>' + ui.deltaDays + ' ngày</small>') +
      kpi('Tổng lượt xem', esc(M.fmtCompact(sum(function (r) { return r.c.views; }))), delta(sumDelta('dV'), true) + ' <small>' + ui.deltaDays + ' ngày</small>') +
      kpi('Số video', esc(M.fmtInt(sum(function (r) { return r.c.videos; }))), delta(sumDelta('dN')) + ' <small>' + ui.deltaDays + ' ngày</small>');
    if (anaRows.length) {
      var cur = function (k) { return anaRows.reduce(function (s, r) { return s + (r.ana.current[k] || 0); }, 0); };
      var prev = function (k) { return anaRows.reduce(function (s, r) { return s + (r.ana.previous[k] || 0); }, 0); };
      var note = 'Tổng của ' + anaRows.length + ' kênh đã đăng nhập, so với 28 ngày trước đó';
      html += kpi('Lượt xem 28 ngày', esc(M.fmtCompact(cur('views'))), change(M.pctChange(cur('views'), prev('views'))), note) +
        kpi('Thời gian xem 28 ngày', esc(M.fmtHours(cur('minutes'))), change(M.pctChange(cur('minutes'), prev('minutes'))), note) +
        kpi('Người đăng ký ròng 28 ngày', esc(M.fmtSigned(cur('net'), true)), change(M.pctChange(cur('net'), prev('net'))), note);
    }
    html += '</div>';
    html += '<section class="card"><div class="card-head"><h2>Danh sách kênh</h2><div class="controls">' +
      '<label>Sắp xếp <select data-change="sort">' + [['subs', 'Người đăng ký'], ['views', 'Lượt xem'], ['videos', 'Số video'], ['dsubs', 'Tăng người đăng ký'],
        ['dviews', 'Tăng lượt xem'], ['avg', 'Lượt xem TB/video'], ['eng', 'Tương tác'], ['last', 'Video mới nhất'], ['title', 'Tên kênh']].map(function (o) { return opt(o[0], o[1], ui.sort); }).join('') + '</select></label>' +
      '<label>Thay đổi trong <select data-change="delta">' + [[1, '1 ngày'], [7, '7 ngày'], [30, '30 ngày'], [90, '90 ngày']].map(function (o) { return opt(o[0], o[1], ui.deltaDays); }).join('') + '</select></label></div></div>';
    if (!rows.length) html += '<p class="empty">Chưa có kênh nào trong nhóm này.</p>';
    else {
      html += '<div class="table-wrap"><table class="table"><thead><tr><th>Kênh</th><th class="num">Người đăng ký</th><th class="num">Lượt xem</th><th class="num">Video</th>' +
        '<th class="num" title="Trung bình lượt xem của các video gần đây">Lượt xem TB/video</th><th class="num" title="(Thích + bình luận) / lượt xem của các video gần đây">Tương tác</th>' +
        '<th class="num">Video/tuần</th><th>Video mới nhất</th><th class="num" title="Chỉ có với kênh đã đăng nhập Google">Lượt xem 28 ngày</th><th>Xu hướng</th></tr></thead><tbody>';
      rows.forEach(function (r) {
        var c = r.c, state = a.connState(c);
        html += '<tr><td><a class="ch" href="#/channel/' + encodeURIComponent(c.id) + '">' + img(c.thumb, 'avatar') +
          '<span><b>' + esc(c.title) + '</b><small>' + esc(c.handle || '') + '</small></span></a><span class="state">' + badge(c) +
          (state === 'expired' ? ' <button class="btn small" data-action="reconnect" data-id="' + esc(c.id) + '" data-busy-disable>Kết nối lại</button>' : '') + '</span></td>' +
          '<td class="num">' + (c.hiddenSubs ? '<span title="Kênh ẩn số người đăng ký">Ẩn</span>' : esc(M.fmtCompact(c.subs))) + '<br>' + delta(r.dS, true) + '</td>' +
          '<td class="num">' + esc(M.fmtCompact(c.views)) + '<br>' + delta(r.dV, true) + '</td>' +
          '<td class="num">' + esc(M.fmtInt(c.videos)) + '<br>' + delta(r.dN) + '</td>' +
          '<td class="num">' + esc(M.fmtCompact(r.vs.avgViews == null ? null : Math.round(r.vs.avgViews))) + '</td>' +
          '<td class="num">' + esc(M.fmtPercent(r.vs.engagement, 2)) + '</td>' +
          '<td class="num">' + esc(r.vs.perWeek == null ? '—' : M.fmtCompact(Math.round(r.vs.perWeek * 10) / 10)) + '</td>' +
          '<td>' + esc(M.fmtAgo(r.vs.lastUpload)) + '</td>' +
          '<td class="num">' + (r.ana ? esc(M.fmtCompact(r.ana.current.views)) + '<br>' + change(r.ana.change.views) : '—') + '</td>' +
          '<td>' + C.spark(r.snaps.slice(-30).map(function (s) { return s.v; })) + '</td></tr>';
      });
      html += '</tbody></table></div>';
    }
    return html + addForm() + '</section>';
  }

  /* ---------- videos ---------- */

  var VSORT = {
    date: function (v) { return +new Date(v.publishedAt) || 0; }, views: function (v) { return v.views || 0; },
    likes: function (v) { return v.likes || 0; }, comments: function (v) { return v.comments || 0; },
    eng: function (v) { return M.videoEngagement(v) || 0; }, dur: function (v) { return v.duration || 0; }, ratio: function (v) { return v.ratio || 0; }
  };

  function videoRows(list, withChannel) {
    return list.map(function (v) {
      var c = v.ch, hot = v.ratio >= 2;
      return '<tr><td><div class="vid">' + ext(vLink(c, v), img(v.thumb, 'thumb')) + '<span>' + ext(vLink(c, v), esc(v.title), 'vtitle') +
        (withChannel ? '<small><a href="#/channel/' + encodeURIComponent(c.id) + '">' + esc(c.title) + '</a></small>' : '') + '</span></div></td>' +
        '<td>' + esc(M.fmtDate(v.publishedAt)) + '</td><td class="num">' + esc(M.fmtInt(v.views)) + '</td>' +
        '<td class="num">' + esc(M.fmtInt(v.likes)) + '</td><td class="num">' + esc(M.fmtInt(v.comments)) + '</td>' +
        '<td class="num">' + esc(M.fmtPercent(M.videoEngagement(v), 2)) + '</td><td class="num">' + esc(M.fmtDuration(v.duration)) + '</td>' +
        '<td class="num">' + (v.ratio == null ? '—' : '<span class="' + (hot ? 'hot' : '') + '" title="Lượt xem so với mức trung vị các video gần đây của kênh">×' + esc(M.fmtCompact(Math.round(v.ratio * 10) / 10)) + '</span>') + '</td></tr>';
    }).join('');
  }

  function videoHead(action, cur) {
    var cols = [['', 'Video'], ['date', 'Ngày đăng'], ['views', 'Lượt xem'], ['likes', 'Thích'], ['comments', 'Bình luận'], ['eng', 'Tương tác'], ['dur', 'Thời lượng'], ['ratio', 'So với kênh']];
    return '<thead><tr>' + cols.map(function (c, i) {
      if (!c[0] || !action) return '<th' + (i > 1 ? ' class="num"' : '') + '>' + c[1] + '</th>';
      return '<th' + (i > 1 ? ' class="num"' : '') + ' aria-sort="' + (cur === c[0] ? 'descending' : 'none') + '"><button class="th' + (cur === c[0] ? ' on' : '') + '" data-action="' + action + '" data-value="' + c[0] + '">' + c[1] + (cur === c[0] ? ' ↓' : '') + '</button></th>';
    }).join('') + '</tr></thead>';
  }

  function withRatio(c) {
    var items = videosOf(c.id), med = M.median(items.map(function (v) { return v.views || 0; }));
    return items.map(function (v) { return Object.assign({ ch: c, ratio: med > 0 && items.length >= 5 ? v.views / med : null }, v); });
  }

  function filterSort(list, q, sort) {
    q = (q || '').trim().toLowerCase();
    if (q) list = list.filter(function (v) { return v.title.toLowerCase().indexOf(q) >= 0; });
    var f = VSORT[sort] || VSORT.date;
    return list.slice().sort(function (x, y) { return f(y) - f(x); });
  }

  function detailVideos(c) {
    var d = app().ui.detail, list = filterSort(withRatio(c), d.vq, d.vsort);
    if (!list.length) return '<p class="empty">' + (d.vq ? 'Không có video nào khớp từ khóa.' : esc(c.videoError || 'Chưa có danh sách video. Bấm "Làm mới" để tải.')) + '</p>';
    var shown = d.all ? list : list.slice(0, 15);
    return '<div class="table-wrap"><table class="table">' + videoHead('sort-videos', d.vsort) + '<tbody>' + videoRows(shown) + '</tbody></table></div>' +
      (list.length > shown.length ? '<button class="btn" data-action="show-all-videos">Xem tất cả ' + list.length + ' video</button>' : '');
  }

  function allVideos() {
    var a = app(), f = a.ui.vids, list = [];
    a.store.list(f.group).forEach(function (c) { if (!f.channel || f.channel === c.id) list = list.concat(withRatio(c)); });
    list = filterSort(list, f.q, f.sort);
    if (!list.length) return '<p class="empty">Không có video nào.</p>';
    return '<p class="muted">' + list.length + ' video</p><div class="table-wrap"><table class="table">' + videoHead('', '') + '<tbody>' + videoRows(list.slice(0, f.limit), true) + '</tbody></table></div>' +
      (list.length > f.limit ? '<button class="btn" data-action="more-videos">Xem thêm</button>' : '');
  }

  function videosPage() {
    var a = app(), f = a.ui.vids;
    if (!a.store.list().length) return onboarding();
    return '<section class="card"><div class="card-head"><h1>Video gần đây của các kênh</h1></div><div class="controls wrap">' +
      '<label>Nhóm <select data-change="vids-group">' + opt('all', 'Tất cả', f.group) + opt('mine', 'Kênh của tôi', f.group) + opt('ref', 'Kênh tham khảo', f.group) + '</select></label>' +
      '<label>Kênh <select data-change="vids-channel">' + opt('', 'Tất cả kênh', f.channel) + a.store.list(f.group).map(function (c) { return opt(c.id, c.title, f.channel); }).join('') + '</select></label>' +
      '<label>Sắp xếp <select data-change="vids-sort">' + [['date', 'Mới nhất'], ['views', 'Nhiều lượt xem nhất'], ['eng', 'Tương tác cao nhất'], ['ratio', 'Nổi bật so với kênh']].map(function (o) { return opt(o[0], o[1], f.sort); }).join('') + '</select></label>' +
      '<label>Tìm <input type="search" data-input="vids-q" value="' + esc(f.q) + '" placeholder="Từ khóa trong tiêu đề"></label></div>' +
      '<div id="all-videos">' + allVideos() + '</div></section>';
  }

  /* ---------- channel detail ---------- */

  function analyticsSection(c) {
    var a = app(), s = a.store.state, ana = s.analytics[c.id], days = s.settings.days, state = a.connState(c);
    var html = '<section class="card"><div class="card-head"><h2>Số liệu riêng của kênh (YouTube Analytics)</h2>' +
      tabs('period', [[7, '7 ngày'], [28, '28 ngày'], [90, '90 ngày']], days, ' data-id="' + esc(c.id) + '"') + '</div>';
    if (state === 'expired') {
      html += '<div class="notice warn">Phiên đăng nhập Google của kênh này đã hết hạn. ' + (ana ? 'Đang hiển thị số liệu lưu lúc ' + esc(M.fmtAgo(ana.fetchedAt)) + '. ' : '') +
        '<button class="link" data-action="reconnect" data-id="' + esc(c.id) + '" data-busy-disable>Kết nối lại</button></div>';
    }
    if (c.anaError) html += '<div class="notice warn">' + esc(c.anaError) + '</div>';
    if (c.scopeOk === false) html += '<div class="notice warn">Lần đăng nhập trước chưa cấp quyền xem YouTube Analytics. Kết nối lại và tick đủ các ô quyền.</div>';
    if (!ana || !ana.daily || !ana.daily.length) return html + '<p class="empty">Chưa có số liệu riêng. Đăng nhập Google của kênh này rồi bấm "Làm mới".</p></section>';
    var sm = anaSummary(c.id, days), cur = sm.current, ch = sm.change;
    html += '<p class="muted">Từ ' + esc(M.fmtDate(sm.start)) + ' đến ' + esc(M.fmtDate(sm.end)) + ', so với ' + days + ' ngày trước đó. YouTube thường chậm 2–3 ngày.</p><div class="kpis">' +
      kpi('Lượt xem', esc(M.fmtCompact(cur.views)), change(ch.views)) +
      kpi('Thời gian xem', esc(M.fmtHours(cur.minutes)), change(ch.minutes)) +
      kpi('Thời lượng xem TB', esc(cur.avgDur == null ? '—' : M.fmtDuration(cur.avgDur)), change(ch.avgDur)) +
      kpi('Người đăng ký ròng', esc(M.fmtSigned(cur.net, true)), '<small>+' + esc(M.fmtInt(cur.gained)) + ' / −' + esc(M.fmtInt(cur.lost)) + '</small> ' + change(ch.net)) +
      kpi('Lượt thích', esc(M.fmtCompact(cur.likes)), change(ch.likes)) +
      kpi('Bình luận', esc(M.fmtCompact(cur.comments)), change(ch.comments)) +
      kpi('Chia sẻ', esc(M.fmtCompact(cur.shares)), change(ch.shares)) +
      (cur.revenue != null ? kpi('Doanh thu ước tính', esc(M.fmtCompact(Math.round(cur.revenue * 100) / 100)) + ' $', change(ch.revenue)) : '') + '</div>';
    var metric = a.ui.detail.ana;
    var pick = { views: function (r) { return r.views; }, minutes: function (r) { return r.minutes == null ? null : r.minutes / 60; }, net: function (r) { return r.gained == null ? null : r.gained - (r.lost || 0); } }[metric];
    html += tabs('ana', [['views', 'Lượt xem'], ['minutes', 'Giờ xem'], ['net', 'Người đăng ký ròng']], metric) +
      C.line(sm.rows.map(function (r) { return { label: M.fmtDate(r.day).slice(0, 5), value: pick(r) }; }), { zero: true, title: 'Số liệu theo ngày' });
    var breakdownNote = ana.days !== days ? '<p class="muted">Các bảng dưới đây đang theo kỳ ' + ana.days + ' ngày lưu lần trước' + (state === 'connected' ? '.' : '; kết nối lại để tải kỳ ' + days + ' ngày.') + '</p>' : '';
    var label = function (map) { return function (x) { return { label: map ? (map[x.key] || x.key) : country(x.key), value: x.views }; }; };
    /* Shares are of all views in the period, not only of the rows shown. */
    var sumViews = function (list) { return (list || []).reduce(function (t, x) { return t + (x.views || 0); }, 0); };
    var share = { share: true, total: Math.max(sumViews(ana.traffic), sumViews(ana.devices), sumViews(ana.countries)) };
    html += breakdownNote + '<div class="grid3"><div><h3>Nguồn truy cập</h3>' + C.hbars((ana.traffic || []).slice(0, 8).map(label(api.TRAFFIC_LABELS)), share) + '</div>' +
      '<div><h3>Quốc gia</h3>' + C.hbars((ana.countries || []).slice(0, 8).map(label(null)), share) + '</div>' +
      '<div><h3>Thiết bị</h3>' + C.hbars((ana.devices || []).map(label(api.DEVICE_LABELS)), share) + '</div></div>';
    if ((ana.topVideos || []).length) {
      html += '<h3>Video nhiều lượt xem nhất trong kỳ</h3><div class="table-wrap"><table class="table"><thead><tr><th>Video</th><th class="num">Lượt xem</th><th class="num">Giờ xem</th><th class="num">Thời lượng xem TB</th><th class="num">Người đăng ký mới</th></tr></thead><tbody>' +
        ana.topVideos.map(function (v) {
          return '<tr><td>' + ext(vLink(c, v), esc(v.title || v.id), 'vtitle') + '</td><td class="num">' + esc(M.fmtInt(v.views)) + '</td><td class="num">' + esc(M.fmtHours(v.minutes)) +
            '</td><td class="num">' + esc(M.fmtDuration(v.avgDur)) + '</td><td class="num">' + esc(M.fmtInt(v.gained)) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    return html + '</section>';
  }

  function channelPage(id) {
    var a = app(), c = a.channel(id);
    if (!c) return '<section class="card"><p class="empty">Không tìm thấy kênh này trong danh sách.</p><a class="btn" href="#/">Về Tổng quan</a></section>';
    var r = row(c), state = a.connState(c), d = a.ui.detail;
    var html = '<a class="back" href="#/">← Tổng quan</a><section class="card head">' + img(c.thumb, 'avatar big') + '<div class="head-main"><h1>' + esc(c.title) + ' ' + badge(c) + '</h1>' +
      '<p class="muted">' + [c.handle, country(c.country), c.publishedAt ? 'Tạo ngày ' + M.fmtDate(c.publishedAt) : '', c.email && !c.demo ? c.email : '',
        c.fetchedAt ? 'Cập nhật ' + M.fmtAgo(c.fetchedAt) : ''].filter(Boolean).map(esc).join(' · ') + '</p>' +
      '<div class="controls wrap"><label>Nhóm <select data-change="channel-group" data-id="' + esc(c.id) + '">' + opt('mine', 'Kênh của tôi', c.group) + opt('ref', 'Kênh tham khảo', c.group) + '</select></label>' +
      (c.demo ? '' : ext(chLink(c), 'Mở trên YouTube', 'btn') + '<button class="btn" data-action="refresh-one" data-id="' + esc(c.id) + '" data-busy-disable>Làm mới</button>') +
      (state === 'expired' || (state === 'public' && c.group === 'mine') ? '<button class="btn primary" data-action="reconnect" data-id="' + esc(c.id) + '" data-busy-disable>' + (state === 'expired' ? 'Kết nối lại' : 'Đăng nhập Google của kênh này') + '</button>' : '') +
      (state === 'connected' ? '<button class="btn" data-action="disconnect" data-id="' + esc(c.id) + '">Ngắt phiên</button>' : '') +
      '<button class="btn danger" data-action="remove" data-id="' + esc(c.id) + '">Xóa kênh</button></div></div></section>';
    if (c.missing) html += '<div class="notice warn">YouTube không trả về kênh này trong lần làm mới gần nhất (kênh có thể đã bị xóa hoặc đổi ID).</div>';
    html += '<div class="kpis">' + kpi('Người đăng ký', c.hiddenSubs ? 'Ẩn' : esc(M.fmtCompact(c.subs)), delta(r.dS, true) + ' <small>' + a.ui.deltaDays + ' ngày</small>', c.hiddenSubs ? '' : M.fmtInt(c.subs)) +
      kpi('Tổng lượt xem', esc(M.fmtCompact(c.views)), delta(r.dV, true) + ' <small>' + a.ui.deltaDays + ' ngày</small>', M.fmtInt(c.views)) +
      kpi('Số video', esc(M.fmtInt(c.videos)), delta(r.dN)) +
      kpi('Lượt xem TB/video', esc(M.fmtCompact(r.vs.avgViews == null ? null : Math.round(r.vs.avgViews))), '<small>trung vị ' + esc(M.fmtCompact(Math.round(r.vs.medianViews || 0))) + '</small>', r.vs.count + ' video gần đây') +
      kpi('Tương tác', esc(M.fmtPercent(r.vs.engagement, 2)), '<small>(thích + bình luận) / lượt xem</small>') +
      kpi('Tần suất đăng', esc(r.vs.perWeek == null ? '—' : M.fmtCompact(Math.round(r.vs.perWeek * 10) / 10)) + ' <small>video/tuần</small>', '<small>' + r.vs.last30 + ' video trong 30 ngày</small>') + '</div>';
    if (c.owned) html += analyticsSection(c);
    var key = d.growth, name = { s: 'Người đăng ký', v: 'Lượt xem', n: 'Số video' }[key];
    html += '<section class="card"><div class="card-head"><h2>Tăng trưởng theo thời gian</h2>' + tabs('growth', [['s', 'Người đăng ký'], ['v', 'Lượt xem'], ['n', 'Số video']], key) + '</div>' +
      C.line(r.snaps.map(function (s) { return { label: M.fmtDate(s.d).slice(0, 5), value: s[key] }; }), { title: name, empty: 'Biểu đồ này dựng từ các lần làm mới, mỗi ngày một điểm. Hãy mở ứng dụng và làm mới ở ít nhất hai ngày khác nhau.' }) +
      '<p class="muted">YouTube không cung cấp lịch sử của kênh công khai, nên ứng dụng tự lưu một điểm mỗi ngày bạn làm mới (' + r.snaps.length + ' ngày đã lưu).</p></section>';
    html += '<section class="card"><div class="card-head"><h2>Video gần đây</h2><label class="sr" for="dq">Tìm video</label><input id="dq" type="search" data-input="detail-q" value="' + esc(d.vq) + '" placeholder="Tìm theo tiêu đề"></div>' +
      '<div id="detail-videos">' + detailVideos(c) + '</div></section>';
    if (r.vs.count) {
      var hours = [0, 0, 0, 0, 0, 0, 0, 0];
      r.vs.hours.forEach(function (n, h) { hours[Math.floor(h / 3)] += n; });
      html += '<section class="card"><h2>Thói quen đăng video</h2><p class="muted">Theo ' + r.vs.count + ' video gần đây, giờ trên máy của bạn.</p><div class="grid2"><div><h3>Theo thứ trong tuần</h3>' +
        C.columns(r.vs.weekdays.slice(1).concat(r.vs.weekdays[0]), WEEKDAYS.slice(1).concat('CN')) + '</div><div><h3>Theo khung giờ</h3>' +
        C.columns(hours, ['0–3h', '3–6h', '6–9h', '9–12h', '12–15h', '15–18h', '18–21h', '21–24h']) + '</div></div></section>';
    }
    html += '<section class="card"><h2><label for="note">Ghi chú của tôi</label></h2><textarea id="note" rows="4" data-input="note" data-id="' + esc(c.id) + '" placeholder="Ý tưởng, việc cần làm, nhận xét về kênh này. Tự động lưu.">' + esc(c.note || '') + '</textarea>' +
      (c.description ? '<details><summary>Mô tả kênh</summary><p class="desc">' + esc(c.description) + '</p></details>' : '') + '</section>';
    return html;
  }

  /* ---------- compare ---------- */

  function comparePage() {
    var a = app(), all = a.store.list();
    if (!all.length) return onboarding();
    if (!a.ui.compare) a.ui.compare = all.slice(0, 8).map(function (c) { return c.id; });
    var sel = a.ui.compare, rows = all.filter(function (c) { return sel.indexOf(c.id) >= 0; }).map(row);
    var html = '<section class="card"><h1>So sánh kênh</h1><p class="muted">Chọn các kênh muốn đặt cạnh nhau.</p><div class="chips">' + all.map(function (c) {
      var on = sel.indexOf(c.id) >= 0;
      return '<button class="chip' + (on ? ' on' : '') + '" data-action="compare-toggle" data-id="' + esc(c.id) + '" aria-pressed="' + on + '">' + img(c.thumb, 'avatar tiny') + esc(c.title) + '</button>';
    }).join('') + '</div></section>';
    if (rows.length < 2) return html + '<p class="empty">Chọn ít nhất hai kênh để so sánh.</p>';
    var metrics = [
      ['Người đăng ký', function (r) { return r.c.subs; }, M.fmtCompact],
      ['Tổng lượt xem', function (r) { return r.c.views; }, M.fmtCompact],
      ['Số video', function (r) { return r.c.videos; }, M.fmtInt],
      ['Lượt xem TB mỗi video gần đây', function (r) { return r.vs.avgViews == null ? null : Math.round(r.vs.avgViews); }, M.fmtCompact],
      ['Lượt xem trung vị mỗi video gần đây', function (r) { return r.vs.medianViews == null ? null : Math.round(r.vs.medianViews); }, M.fmtCompact],
      ['Tỉ lệ tương tác', function (r) { return r.vs.engagement; }, function (x) { return M.fmtPercent(x, 2); }],
      ['Video mỗi tuần', function (r) { return r.vs.perWeek == null ? null : Math.round(r.vs.perWeek * 10) / 10; }, M.fmtCompact],
      ['Lượt xem trên mỗi người đăng ký', function (r) { return r.c.subs ? Math.round(r.c.views / r.c.subs * 10) / 10 : null; }, M.fmtCompact]
    ];
    html += '<div class="grid2">' + metrics.map(function (m) {
      var items = rows.map(function (r) { return { label: r.c.title, value: m[1](r) }; }).sort(function (x, y) { return (y.value || 0) - (x.value || 0); });
      return '<section class="card"><h2>' + m[0] + '</h2>' + C.hbars(items, { format: m[2] }) + '</section>';
    }).join('') + '</div>';
    return html;
  }

  /* ---------- settings ---------- */

  function settingsPage() {
    var a = app(), s = a.settings(), origin = root.location.origin, canAuth = Y.auth.supported();
    var owned = a.store.list().filter(function (c) { return c.owned && !c.demo; });
    var used = a.store.quotaUsed();
    return '<h1>Cài đặt</h1>' +
      '<section class="card"><h2>1. Đăng nhập Google (kênh của tôi)</h2>' +
      (canAuth ? '' : '<div class="notice warn">Bạn đang mở ứng dụng bằng tệp trực tiếp. Đăng nhập Google chỉ chạy được qua địa chỉ http(s): dùng trang GitHub Pages hoặc chạy <code>npm start</code> rồi mở http://localhost:8080.</div>') +
      '<label class="field" for="set-client">OAuth Client ID<input id="set-client" type="text" data-change="set-client" value="' + esc(s.clientId) + '" placeholder="xxxxxxxx.apps.googleusercontent.com" autocomplete="off" spellcheck="false"></label>' +
      '<label class="check"><input type="checkbox" data-change="set-monetary"' + (s.monetary ? ' checked' : '') + '> Xin thêm quyền xem doanh thu ước tính (chỉ có số liệu với kênh đã bật kiếm tiền; cần kết nối lại sau khi bật)</label>' +
      '<details><summary>Cách lấy OAuth Client ID (làm một lần, khoảng 10 phút)</summary><ol class="guide">' +
      '<li>Mở <a href="https://console.cloud.google.com/" target="_blank" rel="noopener">Google Cloud Console</a>, tạo một dự án mới (ví dụ "YouTube Manager").</li>' +
      '<li>Vào "APIs &amp; Services" → "Library", bật hai API: <b>YouTube Data API v3</b> và <b>YouTube Analytics API</b>.</li>' +
      '<li>Vào "OAuth consent screen" (Google Auth Platform): chọn loại <b>External</b>, điền tên ứng dụng và email. Ở mục "Audience" → "Test users", thêm tất cả email Google mà bạn dùng để quản lý các kênh.</li>' +
      '<li>Vào "Credentials" (Clients) → "Create credentials" → "OAuth client ID" → loại <b>Web application</b>. Ở "Authorized JavaScript origins" thêm đúng địa chỉ này: <code>' + esc(canAuth ? origin : 'https://<tên-bạn>.github.io') + '</code></li>' +
      '<li>Sao chép "Client ID" và dán vào ô ở trên. Không cần "Client secret".</li>' +
      '<li>Về Tổng quan, bấm "Đăng nhập Google để thêm kênh". Lần đầu Google sẽ báo "ứng dụng chưa được xác minh": chọn "Advanced" → "Go to …" vì đây là ứng dụng của chính bạn, rồi tick đủ các ô quyền.</li></ol></details>' +
      '<h3>Tài khoản đã kết nối</h3>' + (owned.length ? '<ul class="accounts">' + owned.map(function (c) {
        var stt = a.connState(c);
        return '<li>' + img(c.thumb, 'avatar tiny') + '<a href="#/channel/' + encodeURIComponent(c.id) + '">' + esc(c.title) + '</a> <small>' + esc(c.email || '') + '</small> ' + badge(c) +
          (stt === 'expired' ? ' <button class="btn small" data-action="reconnect" data-id="' + esc(c.id) + '" data-busy-disable>Kết nối lại</button>' : '') + '</li>';
      }).join('') + '</ul>' : '<p class="muted">Chưa có tài khoản nào.</p>') +
      '<button class="btn primary" data-action="connect" data-busy-disable>Thêm tài khoản Google</button>' +
      '<p class="muted">Ứng dụng chỉ xin quyền xem (không sửa, không xóa được gì trên kênh). Mỗi phiên đăng nhập kéo dài khoảng 1 giờ theo quy định của Google cho ứng dụng chạy trên trình duyệt; hết giờ bấm "Kết nối lại". Mã đăng nhập không được lưu lâu dài và không gửi đi đâu ngoài Google.</p></section>' +
      '<section class="card"><h2>2. API key (số liệu công khai, kênh tham khảo)</h2>' +
      '<label class="field" for="set-key">YouTube Data API key<span class="row"><input id="set-key" type="password" data-change="set-key" value="' + esc(s.apiKey) + '" placeholder="AIza..." autocomplete="off" spellcheck="false">' +
      '<button class="btn" type="button" data-action="toggle-key">Hiện/ẩn</button><button class="btn" type="button" data-action="test-key" data-busy-disable>Kiểm tra</button></span></label>' +
      '<p class="muted">Có API key thì số liệu công khai của mọi kênh tự cập nhật mà không cần đăng nhập lại. Tạo trong cùng dự án Google Cloud: "Credentials" → "Create credentials" → "API key", rồi giới hạn key cho "YouTube Data API v3"' + (canAuth ? ' và cho trang <code>' + esc(origin) + '/*</code>' : '') + '. Key chỉ lưu trên trình duyệt này.</p>' +
      '<label class="field" for="set-vc">Số video gần đây tải cho mỗi kênh<select id="set-vc" data-change="set-videocount">' + [10, 25, 50].map(function (n) { return opt(n, n + ' video', s.videoCount); }).join('') + '</select></label>' +
      '<p class="muted">Hạn mức đã dùng hôm nay (ước tính): <b>' + esc(M.fmtInt(used)) + '</b> / 10.000 đơn vị. Mỗi lần làm mới tốn khoảng 2 đơn vị cho mỗi kênh.</p></section>' +
      '<section class="card"><h2>3. Dữ liệu</h2><p class="muted">Mọi dữ liệu nằm trên trình duyệt của thiết bị này. Xuất tệp sao lưu để chuyển sang máy khác hoặc phòng khi xóa dữ liệu trình duyệt. Tệp sao lưu không chứa API key hay mã đăng nhập.</p>' +
      '<div class="controls wrap"><button class="btn" data-action="export-json">Xuất sao lưu (JSON)</button><button class="btn" data-action="export-csv">Xuất bảng kênh (CSV)</button>' +
      '<button class="btn" data-action="import">Nhập từ tệp sao lưu</button><input id="import-file" type="file" accept="application/json,.json" data-change="import-file" hidden>' +
      (a.store.list().some(function (c) { return c.demo; }) ? '<button class="btn" data-action="demo-remove">Xóa dữ liệu mẫu</button>' : '<button class="btn" data-action="demo-load">Nạp dữ liệu mẫu</button>') +
      '<button class="btn danger" data-action="clear-all">Xóa toàn bộ dữ liệu</button></div></section>';
  }

  /* ---------- router ---------- */

  function route() {
    var h = app().ui.hash.replace(/^#\/?/, ''), parts = h.split('/');
    if (parts[0] === 'channel' && parts[1]) return { name: 'channel', id: decodeURIComponent(parts[1]) };
    return { name: ['videos', 'compare', 'settings'].indexOf(parts[0]) >= 0 ? parts[0] : 'home' };
  }

  function render() {
    var r = route(), a = app();
    var html = r.name === 'channel' ? channelPage(r.id) : r.name === 'videos' ? videosPage() : r.name === 'compare' ? comparePage() : r.name === 'settings' ? settingsPage() : dashboard();
    document.getElementById('view').innerHTML = html;
    Array.prototype.forEach.call(document.querySelectorAll('nav a'), function (link) {
      var on = link.dataset.route === r.name || (r.name === 'channel' && link.dataset.route === 'home');
      link.classList.toggle('on', on);
      if (on) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    });
    var last = a.settings().lastRefresh;
    document.getElementById('last-refresh').textContent = last ? 'Cập nhật ' + M.fmtAgo(last) : '';
    Array.prototype.forEach.call(document.querySelectorAll('[data-busy-disable]'), function (b) { b.disabled = !!a.ui.busy; });
    var c = r.name === 'channel' && a.channel(r.id);
    document.title = (c ? c.title + ' · ' : '') + 'Quản lý kênh YouTube';
  }

  function renderPart(id) {
    var el = document.getElementById(id), r = route();
    if (!el) return;
    if (id === 'detail-videos') { var c = app().channel(r.id); if (c) el.innerHTML = detailVideos(c); }
    else if (id === 'all-videos') el.innerHTML = allVideos();
  }

  Y.views = { render: render, renderPart: renderPart };
})(typeof self !== 'undefined' ? self : globalThis);

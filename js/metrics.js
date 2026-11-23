/* Pure helpers: number/date formatting, snapshots, video and analytics statistics. */
(function (root, factory) {
  var mod = factory();
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else { root.YTM = root.YTM || {}; root.YTM.metrics = mod; }
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  var DAY_MS = 86400000;

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function dayKey(date) {
    var d = date instanceof Date ? date : new Date(date);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function addDays(key, n) {
    var p = key.split('-').map(Number);
    var d = new Date(p[0], p[1] - 1, p[2] + n);
    return dayKey(d);
  }

  function daysBetween(a, b) {
    var pa = a.split('-').map(Number), pb = b.split('-').map(Number);
    return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / DAY_MS);
  }

  /* YouTube quota resets at midnight Pacific Time. */
  function pacificDayKey(date) {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date || new Date());
    } catch (e) {
      return dayKey(date || new Date());
    }
  }

  function parseDuration(iso) {
    var m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(iso || '');
    if (!m) return 0;
    return (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0);
  }

  function fmtDuration(sec) {
    sec = Math.round(sec || 0);
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h ? h + ':' + pad(m) + ':' + pad(s) : m + ':' + pad(s);
  }

  function fmtInt(n) {
    if (n == null || isNaN(n)) return '—';
    return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  function trimDec(x, digits) {
    var s = x.toFixed(digits);
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s.replace('.', ',');
  }

  /* Compact Vietnamese style: 1,2 N (nghìn), 3,4 Tr (triệu), 5,6 T (tỷ). */
  function fmtCompact(n) {
    if (n == null || isNaN(n)) return '—';
    var sign = n < 0 ? '-' : '', a = Math.abs(n);
    if (a < 1000) return sign + trimDec(a, a % 1 ? 1 : 0);
    var units = [[1e9, ' T'], [1e6, ' Tr'], [1e3, ' N']];
    for (var i = 0; i < units.length; i++) {
      if (a >= units[i][0]) {
        var v = a / units[i][0];
        return sign + trimDec(v, v >= 100 ? 0 : v >= 10 ? 1 : 2) + units[i][1];
      }
    }
    return sign + a;
  }

  function fmtSigned(n, compact) {
    if (n == null || isNaN(n)) return '—';
    var s = compact ? fmtCompact(Math.abs(n)) : fmtInt(Math.abs(n));
    return (n > 0 ? '+' : n < 0 ? '−' : '') + s;
  }

  function fmtPercent(x, digits) {
    if (x == null || !isFinite(x)) return '—';
    return trimDec(x * 100, digits == null ? 1 : digits) + '%';
  }

  function fmtHours(minutes) {
    if (minutes == null || isNaN(minutes)) return '—';
    return fmtCompact(Math.round(minutes / 6) / 10) + ' giờ';
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d)) return '—';
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
  }

  function fmtAgo(iso, now) {
    if (!iso) return '—';
    var diff = ((now ? new Date(now) : new Date()) - new Date(iso)) / 1000;
    if (isNaN(diff)) return '—';
    if (diff < 60) return 'vừa xong';
    if (diff < 3600) return Math.floor(diff / 60) + ' phút trước';
    if (diff < 86400) return Math.floor(diff / 3600) + ' giờ trước';
    if (diff < 86400 * 30) return Math.floor(diff / 86400) + ' ngày trước';
    if (diff < 86400 * 365) return Math.floor(diff / (86400 * 30)) + ' tháng trước';
    return Math.floor(diff / (86400 * 365)) + ' năm trước';
  }

  /* ---- snapshots: [{d:'YYYY-MM-DD', s:subs, v:views, n:videos}] sorted by day ---- */

  function addSnapshot(list, snap, maxLen) {
    var out = (list || []).filter(function (x) { return x.d !== snap.d; });
    out.push(snap);
    out.sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : 0; });
    maxLen = maxLen || 800;
    return out.length > maxLen ? out.slice(out.length - maxLen) : out;
  }

  /* Change of `key` over roughly the last `days` days. Uses the newest snapshot that is
     at least `days` old, else the oldest one. Returns null with fewer than two days. */
  function snapshotDelta(list, key, days) {
    if (!list || list.length < 2) return null;
    var last = list[list.length - 1];
    var target = addDays(last.d, -days);
    var base = null;
    for (var i = list.length - 2; i >= 0; i--) {
      if (list[i].d <= target) { base = list[i]; break; }
    }
    if (!base) base = list[0];
    if (base[key] == null || last[key] == null) return null;
    return { delta: last[key] - base[key], days: daysBetween(base.d, last.d), from: base.d, to: last.d };
  }

  function median(nums) {
    if (!nums.length) return 0;
    var a = nums.slice().sort(function (x, y) { return x - y; });
    var mid = a.length >> 1;
    return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
  }

  /* ---- video list statistics (items: {publishedAt, views, likes, comments, duration}) ---- */

  function videoStats(items, now) {
    items = items || [];
    var res = {
      count: items.length, avgViews: null, medianViews: null, engagement: null,
      perWeek: null, last30: 0, lastUpload: null, weekdays: [0, 0, 0, 0, 0, 0, 0],
      hours: new Array(24).fill(0), outliers: [], avgDuration: null
    };
    if (!items.length) return res;
    var views = [], sumV = 0, sumE = 0, sumD = 0, tMin = Infinity, tMax = -Infinity;
    var nowMs = now ? +new Date(now) : Date.now();
    items.forEach(function (it) {
      var v = it.views || 0;
      views.push(v); sumV += v; sumE += (it.likes || 0) + (it.comments || 0); sumD += it.duration || 0;
      var t = +new Date(it.publishedAt);
      if (!isNaN(t)) {
        if (t < tMin) tMin = t;
        if (t > tMax) tMax = t;
        var d = new Date(t);
        res.weekdays[d.getDay()]++;
        res.hours[d.getHours()]++;
        if (nowMs - t <= 30 * DAY_MS) res.last30++;
      }
    });
    res.avgViews = sumV / items.length;
    res.medianViews = median(views);
    res.engagement = sumV > 0 ? sumE / sumV : null;
    res.avgDuration = sumD / items.length;
    if (isFinite(tMax)) res.lastUpload = new Date(tMax).toISOString();
    if (items.length >= 2 && tMax > tMin) res.perWeek = (items.length - 1) / ((tMax - tMin) / (7 * DAY_MS));
    if (res.medianViews > 0 && items.length >= 5) {
      res.outliers = items.filter(function (it) { return (it.views || 0) >= 2 * res.medianViews; })
        .sort(function (a, b) { return b.views - a.views; });
    }
    return res;
  }

  function videoEngagement(it) {
    return it.views > 0 ? ((it.likes || 0) + (it.comments || 0)) / it.views : null;
  }

  /* ---- analytics: daily rows [{day, views, minutes, gained, lost, ...}] ---- */

  var SUM_KEYS = ['views', 'minutes', 'gained', 'lost', 'likes', 'comments', 'shares', 'revenue'];

  function sumRows(rows) {
    var t = { days: rows.length };
    SUM_KEYS.forEach(function (k) {
      var has = false, s = 0;
      rows.forEach(function (r) { if (r[k] != null) { has = true; s += +r[k]; } });
      t[k] = has ? s : null;
    });
    t.net = t.gained == null ? null : t.gained - (t.lost || 0);
    t.avgDur = t.views ? (t.minutes * 60) / t.views : null;
    return t;
  }

  /* Totals for the last `days` days ending at `end`, compared with the `days` before. */
  function analyticsSummary(daily, end, days) {
    var start = addDays(end, -(days - 1));
    var prevStart = addDays(start, -days);
    var cur = [], prev = [];
    (daily || []).forEach(function (r) {
      if (r.day >= start && r.day <= end) cur.push(r);
      else if (r.day >= prevStart && r.day < start) prev.push(r);
    });
    var c = sumRows(cur), p = sumRows(prev), change = {};
    ['views', 'minutes', 'net', 'gained', 'likes', 'comments', 'shares', 'revenue', 'avgDur'].forEach(function (k) {
      change[k] = (c[k] != null && p[k] != null && p[k] > 0 && prev.length) ? (c[k] - p[k]) / p[k] : null;
    });
    return { start: start, end: end, current: c, previous: p, change: change, rows: cur };
  }

  function pctChange(cur, prev) {
    return prev > 0 ? (cur - prev) / prev : null;
  }

  return {
    DAY_MS: DAY_MS, dayKey: dayKey, addDays: addDays, daysBetween: daysBetween, pacificDayKey: pacificDayKey,
    parseDuration: parseDuration, fmtDuration: fmtDuration, fmtInt: fmtInt, fmtCompact: fmtCompact,
    fmtSigned: fmtSigned, fmtPercent: fmtPercent, fmtHours: fmtHours, fmtDate: fmtDate, fmtAgo: fmtAgo,
    addSnapshot: addSnapshot, snapshotDelta: snapshotDelta, median: median, videoStats: videoStats,
    videoEngagement: videoEngagement, sumRows: sumRows, analyticsSummary: analyticsSummary, pctChange: pctChange
  };
});

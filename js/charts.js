/* Small dependency-free charts rendered as SVG/HTML strings. */
(function (root) {
  'use strict';
  var M = root.YTM.metrics;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function niceStep(span, target) {
    var raw = span / target, mag = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / mag;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
  }

  /* points: [{label, value}], opts: {zero, height, format, color} */
  function line(points, opts) {
    opts = opts || {};
    points = (points || []).filter(function (p) { return p.value != null && !isNaN(p.value); });
    if (points.length < 2) return '<div class="chart-empty">' + esc(opts.empty || 'Chưa đủ dữ liệu để vẽ biểu đồ.') + '</div>';
    var W = 720, H = opts.height || 220, L = 56, R = 12, T = 12, B = 26;
    var fmt = opts.format || M.fmtCompact;
    var vals = points.map(function (p) { return p.value; });
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    if (opts.zero) lo = Math.min(0, lo);
    if (hi === lo) { hi = lo + 1; if (!opts.zero && lo > 0) lo = lo - 1; }
    var step = niceStep(hi - lo, 4);
    var y0 = Math.floor(lo / step) * step, y1 = Math.ceil(hi / step) * step;
    var xs = function (i) { return L + (W - L - R) * (i / (points.length - 1)); };
    var ys = function (v) { return T + (H - T - B) * (1 - (v - y0) / (y1 - y0)); };
    var svg = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(opts.title || 'Biểu đồ') + '">';
    for (var t = y0; t <= y1 + step / 2; t += step) {
      var y = ys(t).toFixed(1);
      svg += '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '"/>' +
        '<text class="tick" x="' + (L - 8) + '" y="' + y + '" text-anchor="end" dominant-baseline="middle">' + esc(fmt(t)) + '</text>';
    }
    var d = points.map(function (p, i) { return (i ? 'L' : 'M') + xs(i).toFixed(1) + ' ' + ys(p.value).toFixed(1); }).join(' ');
    svg += '<path class="area" d="' + d + ' L' + xs(points.length - 1).toFixed(1) + ' ' + ys(y0).toFixed(1) + ' L' + L + ' ' + ys(y0).toFixed(1) + ' Z"/>';
    svg += '<path class="line" d="' + d + '"/>';
    var labelIdx = [0, Math.floor((points.length - 1) / 2), points.length - 1].filter(function (v, i, a) { return a.indexOf(v) === i; });
    labelIdx.forEach(function (i) {
      var anchor = i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle';
      svg += '<text class="tick" x="' + xs(i).toFixed(1) + '" y="' + (H - 7) + '" text-anchor="' + anchor + '">' + esc(points[i].label) + '</text>';
    });
    var bw = (W - L - R) / (points.length - 1);
    points.forEach(function (p, i) {
      svg += '<g class="pt"><rect x="' + (xs(i) - bw / 2).toFixed(1) + '" y="' + T + '" width="' + bw.toFixed(1) + '" height="' + (H - T - B) + '"/>' +
        '<circle cx="' + xs(i).toFixed(1) + '" cy="' + ys(p.value).toFixed(1) + '" r="4"/>' +
        '<title>' + esc(p.label + ': ' + (opts.tipFormat || M.fmtInt)(p.value)) + '</title></g>';
    });
    return svg + '</svg>';
  }

  function spark(values) {
    values = (values || []).filter(function (v) { return v != null; });
    if (values.length < 2) return '';
    var W = 90, H = 26, lo = Math.min.apply(null, values), hi = Math.max.apply(null, values);
    if (hi === lo) hi = lo + 1;
    var pts = values.map(function (v, i) {
      return (W * i / (values.length - 1)).toFixed(1) + ',' + (2 + (H - 4) * (1 - (v - lo) / (hi - lo))).toFixed(1);
    }).join(' ');
    return '<svg class="spark" viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true"><polyline points="' + pts + '"/></svg>';
  }

  /* items: [{label, value, sub}] horizontal bars */
  function hbars(items, opts) {
    opts = opts || {};
    items = items || [];
    if (!items.length) return '<div class="chart-empty">' + esc(opts.empty || 'Chưa có dữ liệu.') + '</div>';
    var fmt = opts.format || M.fmtCompact;
    var max = Math.max.apply(null, items.map(function (i) { return i.value || 0; })) || 1;
    var total = opts.total || items.reduce(function (s, i) { return s + (i.value || 0); }, 0);
    return '<div class="hbars">' + items.map(function (i) {
      var pct = opts.share && total ? ' <small>' + M.fmtPercent((i.value || 0) / total, 0) + '</small>' : '';
      return '<div class="hbar"><div class="hbar-label" title="' + esc(i.label) + '">' + esc(i.label) + '</div>' +
        '<div class="hbar-track"><div class="hbar-fill" style="width:' + Math.max(0, (i.value || 0) / max * 100).toFixed(1) + '%"></div></div>' +
        '<div class="hbar-value">' + esc(i.value == null ? '—' : fmt(i.value)) + pct + '</div></div>';
    }).join('') + '</div>';
  }

  /* values/labels: vertical columns */
  function columns(values, labels) {
    var max = Math.max.apply(null, values) || 1;
    return '<div class="cols">' + values.map(function (v, i) {
      return '<div class="col" title="' + esc(labels[i] + ': ' + v) + '"><div class="col-bar" style="height:' + (v / max * 100).toFixed(1) + '%"></div>' +
        '<div class="col-label">' + esc(labels[i]) + '</div></div>';
    }).join('') + '</div>';
  }

  root.YTM.charts = { esc: esc, line: line, spark: spark, hbars: hbars, columns: columns };
})(typeof self !== 'undefined' ? self : globalThis);

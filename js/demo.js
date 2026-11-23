/* Sample data so the app can be explored before connecting real channels. All of it is made up. */
(function (root) {
  'use strict';
  var M = root.YTM.metrics;

  function rng(seed) {
    return function () {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
  }

  function avatar(letter, color) {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="88" height="88"><rect width="88" height="88" fill="' + color + '"/>' +
      '<text x="44" y="58" font-size="40" font-family="Arial" font-weight="700" fill="#fff" text-anchor="middle">' + letter + '</text></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  var CHANNELS = [
    { id: 'DEMO_1', title: 'Bếp Nhà Mẫu', handle: '@bepnhamau', group: 'mine', subs: 48200, views: 9150000, videos: 214, daily: 6200, color: '#1565c0', topic: 'Cách nấu' },
    { id: 'DEMO_2', title: 'Học Tiếng Anh Mẫu', handle: '@hoctienganhmau', group: 'mine', subs: 12750, views: 1480000, videos: 96, daily: 1500, color: '#1b7f3b', topic: 'Bài học' },
    { id: 'DEMO_3', title: 'Du Lịch Mẫu', handle: '@dulichmau', group: 'mine', subs: 3100, views: 265000, videos: 41, daily: 420, color: '#00796b', topic: 'Hành trình' },
    { id: 'DEMO_4', title: 'Kênh Tham Khảo A', handle: '@thamkhaoa', group: 'ref', subs: 1250000, views: 412000000, videos: 890, daily: 180000, color: '#283593', topic: 'Tập' },
    { id: 'DEMO_5', title: 'Kênh Tham Khảo B', handle: '@thamkhaob', group: 'ref', subs: 305000, views: 58000000, videos: 1320, daily: 31000, color: '#2e7d32', topic: 'Số' },
    { id: 'DEMO_6', title: 'Kênh Tham Khảo C', handle: '@thamkhaoc', group: 'ref', subs: 87000, views: 11200000, videos: 150, daily: 9000, color: '#0277bd', topic: 'Video' }
  ];

  var TRAFFIC = ['SUBSCRIBER', 'RELATED_VIDEO', 'YT_SEARCH', 'SHORTS', 'YT_CHANNEL', 'EXT_URL', 'NOTIFICATION', 'PLAYLIST'];
  var COUNTRIES = ['VN', 'US', 'JP', 'KR', 'AU', 'DE'];
  var DEVICES = ['MOBILE', 'DESKTOP', 'TV', 'TABLET'];

  function shares(rand, keys, total) {
    var w = keys.map(function (_, i) { return (0.4 + rand()) / (i + 1); });
    var sum = w.reduce(function (a, b) { return a + b; }, 0);
    return keys.map(function (k, i) {
      var v = Math.round(total * w[i] / sum);
      return { key: k, views: v, minutes: Math.round(v * (2 + rand() * 2)) };
    }).sort(function (a, b) { return b.views - a.views; });
  }

  function build(now) {
    now = now ? new Date(now) : new Date();
    var today = M.dayKey(now);
    var out = { channels: {}, order: [], snapshots: {}, videos: {}, analytics: {} };
    CHANNELS.forEach(function (c, idx) {
      var rand = rng(1234 + idx * 77);
      var mine = c.group === 'mine';
      var dailySubs = c.daily / 140;

      /* 60 daily snapshots ending today */
      var snaps = [], subs = c.subs, views = c.views, vids = c.videos;
      for (var d = 0; d < 60; d++) {
        snaps.unshift({ d: M.addDays(today, -d), s: Math.round(subs), v: Math.round(views), n: vids });
        views -= c.daily * (0.7 + rand() * 0.6);
        subs -= dailySubs * (0.5 + rand());
        if (rand() < 0.3 && vids > 1) vids--;
      }

      /* 30 recent videos */
      var items = [], t = now.getTime() - (2 + rand() * 30) * 3600000, base = c.daily * 4;
      for (var i = 0; i < 30; i++) {
        var boost = rand() < 0.1 ? 3 + rand() * 5 : 0.4 + rand() * 1.2;
        var age = Math.min(1, (i + 1) / 6);
        var v = Math.round(base * boost * age);
        items.push({
          id: c.id + '_v' + i, title: c.topic + ' số ' + (c.videos - i) + ' (dữ liệu mẫu)',
          publishedAt: new Date(t).toISOString(), thumb: '', views: v,
          likes: Math.round(v * (0.02 + rand() * 0.03)), comments: Math.round(v * (0.002 + rand() * 0.004)),
          duration: Math.round(rand() < 0.25 ? 20 + rand() * 40 : 240 + rand() * 900), live: ''
        });
        t -= (1.5 + rand() * 4) * M.DAY_MS;
      }

      out.channels[c.id] = {
        id: c.id, title: c.title, handle: c.handle, description: 'Đây là kênh mẫu để bạn xem thử giao diện. Số liệu không có thật.',
        thumb: avatar(c.title[0], c.color), country: 'VN', publishedAt: '2019-0' + (idx + 1) + '-15T08:00:00Z', uploads: '',
        subs: c.subs, hiddenSubs: false, views: c.views, videos: c.videos, keywords: '',
        group: c.group, owned: mine, email: mine ? 'demo' + (idx + 1) + '@example.com' : '', note: '', demo: true,
        addedAt: now.toISOString(), fetchedAt: now.toISOString()
      };
      out.order.push(c.id);
      out.snapshots[c.id] = snaps;
      out.videos[c.id] = { fetchedAt: now.toISOString(), items: items };

      if (mine) {
        var daily = [];
        for (var k = 179; k >= 0; k--) {
          var trend = 1 - k / 400;
          var dv = Math.round(c.daily * trend * (0.7 + rand() * 0.6));
          var gained = Math.round(dailySubs * trend * (0.8 + rand() * 0.9));
          daily.push({
            day: M.addDays(today, -k), views: dv, minutes: Math.round(dv * (2.2 + rand())), gained: gained,
            lost: Math.round(gained * (0.1 + rand() * 0.25)), likes: Math.round(dv * 0.03), comments: Math.round(dv * 0.004),
            shares: Math.round(dv * 0.002), revenue: null
          });
        }
        var total28 = daily.slice(-28).reduce(function (s, r) { return s + r.views; }, 0);
        out.analytics[c.id] = {
          fetchedAt: now.toISOString(), days: 28, start: M.addDays(today, -27), end: today, daily: daily,
          traffic: shares(rand, TRAFFIC, total28), countries: shares(rand, COUNTRIES, total28), devices: shares(rand, DEVICES, total28),
          topVideos: items.slice().sort(function (a, b) { return b.views - a.views; }).slice(0, 10).map(function (it) {
            var vv = Math.round(it.views * 0.35);
            return { id: it.id, title: it.title, views: vv, minutes: Math.round(vv * 2.6), avgDur: Math.round(it.duration * 0.45), gained: Math.round(vv / 160) };
          })
        };
      }
    });
    return out;
  }

  root.YTM.demo = { build: build };
})(typeof self !== 'undefined' ? self : globalThis);

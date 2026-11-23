/* YouTube Data API v3 + YouTube Analytics API v2 client (read-only). */
(function (root, factory) {
  var metrics = (typeof module === 'object' && module.exports) ? require('./metrics.js') : root.YTM.metrics;
  var mod = factory(root, metrics);
  if (typeof module === 'object' && module.exports) module.exports = mod;
  else { root.YTM = root.YTM || {}; root.YTM.api = mod; }
})(typeof self !== 'undefined' ? self : globalThis, function (root, M) {
  'use strict';

  var DATA_BASE = 'https://www.googleapis.com/youtube/v3/';
  var ANALYTICS_URL = 'https://youtubeanalytics.googleapis.com/v2/reports';
  var USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

  /* Quota cost in units of the Data API methods used here. */
  var COST = { channels: 1, playlistItems: 1, videos: 1, search: 100 };

  var fetchImpl = null;
  var onCost = null;

  function setFetch(fn) { fetchImpl = fn; }
  function setCostListener(fn) { onCost = fn; }
  function doFetch(url, opts) { return (fetchImpl || root.fetch.bind(root))(url, opts); }

  function ApiError(status, reason, message) {
    this.name = 'ApiError';
    this.status = status;
    this.reason = reason;
    this.message = message || reason;
  }
  ApiError.prototype = Object.create(Error.prototype);

  var REASON_TEXT = {
    noAuth: 'Chưa có API key hoặc tài khoản Google nào đang kết nối. Vào Cài đặt để nhập.',
    network: 'Không kết nối được tới máy chủ Google. Kiểm tra mạng rồi thử lại.',
    quotaExceeded: 'Đã hết hạn mức API trong ngày (10.000 đơn vị). Hạn mức đặt lại lúc 0 giờ giờ Thái Bình Dương (khoảng 14–15 giờ Việt Nam).',
    dailyLimitExceeded: 'Đã hết hạn mức API trong ngày.',
    rateLimitExceeded: 'Gửi yêu cầu quá nhanh. Chờ vài giây rồi thử lại.',
    keyInvalid: 'API key không hợp lệ. Kiểm tra lại trong Cài đặt.',
    accessNotConfigured: 'Dự án Google Cloud chưa bật API cần thiết (YouTube Data API v3 hoặc YouTube Analytics API).',
    authError: 'Phiên đăng nhập Google đã hết hạn. Bấm "Kết nối lại".',
    forbidden: 'Tài khoản đang đăng nhập không có quyền xem dữ liệu này.',
    insufficientPermissions: 'Chưa cấp đủ quyền khi đăng nhập Google. Kết nối lại và tick đủ các quyền.',
    channelNotFound: 'Không tìm thấy kênh.',
    notFound: 'Không tìm thấy dữ liệu.'
  };

  function explain(err) {
    if (err && err.name === 'ApiError') return REASON_TEXT[err.reason] || err.message || 'Lỗi API (' + err.status + ').';
    return (err && err.message) || String(err);
  }

  function classify(status, body) {
    var e = (body && body.error) || {};
    var reason = (e.errors && e.errors[0] && e.errors[0].reason) || '';
    var msg = e.message || '';
    if (status === 401) reason = 'authError';
    else if (status === 400 && /API key not valid/i.test(msg)) reason = 'keyInvalid';
    else if (status === 403 && /has not been used|is disabled|accessNotConfigured|SERVICE_DISABLED/i.test(msg + reason)) reason = 'accessNotConfigured';
    else if (status === 403 && /insufficient.*(scope|permission)/i.test(msg + reason)) reason = 'insufficientPermissions';
    else if (status === 403 && /quota/i.test(reason + msg)) reason = /daily/i.test(reason) ? 'dailyLimitExceeded' : 'quotaExceeded';
    else if (status === 429) reason = 'rateLimitExceeded';
    else if (status === 404 && !reason) reason = 'notFound';
    else if (!reason) reason = status === 403 ? 'forbidden' : 'http' + status;
    return new ApiError(status, reason, msg);
  }

  function buildUrl(base, params) {
    var q = [];
    Object.keys(params).forEach(function (k) {
      if (params[k] == null || params[k] === '') return;
      q.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k]));
    });
    return base + (q.length ? '?' + q.join('&') : '');
  }

  function getJson(base, params, auth) {
    auth = auth || {};
    var p = Object.assign({}, params), headers = { Accept: 'application/json' };
    if (auth.token) headers.Authorization = 'Bearer ' + auth.token;
    else if (auth.key) p.key = auth.key;
    else return Promise.reject(new ApiError(0, 'noAuth'));
    return doFetch(buildUrl(base, p), { headers: headers }).then(function (res) {
      return res.text().then(function (text) {
        var body = null;
        try { body = text ? JSON.parse(text) : null; } catch (e) { body = null; }
        if (!res.ok) throw classify(res.status, body);
        return body || {};
      });
    }, function () { throw new ApiError(0, 'network'); });
  }

  function dataGet(method, params, auth) {
    return getJson(DATA_BASE + method, params, auth).then(function (body) {
      if (onCost) onCost(COST[method] || 1);
      return body;
    }, function (err) {
      /* Failed calls still cost quota unless they never reached Google. */
      if (onCost && err.reason !== 'noAuth' && err.reason !== 'network' && err.reason !== 'authError') onCost(COST[method] || 1);
      throw err;
    });
  }

  /* ---- channel input parsing ---- */

  var ID_RE = /^UC[\w-]{22}$/;

  function parseChannelInput(input) {
    var s = String(input || '').trim();
    if (!s) return null;
    if (ID_RE.test(s)) return { type: 'id', value: s };
    if (s[0] === '@') return { type: 'handle', value: s.split(/[\/?#\s]/)[0] };
    var m = /^(?:https?:\/\/)?(?:www\.|m\.|music\.)?(youtube\.com|youtu\.be)\/(.*)$/i.exec(s);
    if (m) {
      var host = m[1].toLowerCase(), rest = m[2], path = rest.split(/[?#]/)[0], seg = path.split('/').filter(Boolean);
      var dec = function (x) { try { return decodeURIComponent(x); } catch (e) { return x; } };
      if (host === 'youtu.be') return seg[0] ? { type: 'video', value: seg[0] } : null;
      if (!seg.length) return null;
      if (seg[0] === 'channel' && seg[1]) return { type: 'id', value: seg[1] };
      if (seg[0][0] === '@') return { type: 'handle', value: dec(seg[0]) };
      if (seg[0] === 'c' && seg[1]) return { type: 'custom', value: dec(seg[1]) };
      if (seg[0] === 'user' && seg[1]) return { type: 'username', value: dec(seg[1]) };
      if (seg[0] === 'watch') {
        var v = /[?&]v=([\w-]{6,})/.exec(rest);
        return v ? { type: 'video', value: v[1] } : null;
      }
      if ((seg[0] === 'shorts' || seg[0] === 'live' || seg[0] === 'embed') && seg[1]) return { type: 'video', value: seg[1] };
      if (['feed', 'results', 'playlist', 'hashtag', 'gaming', 'premium'].indexOf(seg[0]) >= 0) return null;
      return { type: 'custom', value: dec(seg[0]) };
    }
    if (/^https?:\/\//i.test(s)) return null;
    return { type: 'custom', value: s };
  }

  /* ---- normalisers ---- */

  var CHANNEL_PARTS = 'snippet,statistics,contentDetails,brandingSettings';

  function num(x) { return x == null ? null : Number(x); }

  function pickThumb(t) {
    t = t || {};
    return (t.medium || t.high || t.default || {}).url || '';
  }

  function normalizeChannel(item) {
    var sn = item.snippet || {}, st = item.statistics || {}, cd = item.contentDetails || {};
    var br = (item.brandingSettings || {}).channel || {};
    return {
      id: item.id,
      title: sn.title || '',
      description: sn.description || '',
      handle: sn.customUrl || '',
      thumb: pickThumb(sn.thumbnails),
      country: sn.country || br.country || '',
      publishedAt: sn.publishedAt || '',
      uploads: (cd.relatedPlaylists || {}).uploads || '',
      subs: st.hiddenSubscriberCount ? null : num(st.subscriberCount),
      hiddenSubs: !!st.hiddenSubscriberCount,
      views: num(st.viewCount),
      videos: num(st.videoCount),
      keywords: br.keywords || ''
    };
  }

  function normalizeVideo(item) {
    var sn = item.snippet || {}, st = item.statistics || {};
    return {
      id: item.id,
      title: sn.title || '',
      publishedAt: sn.publishedAt || '',
      thumb: pickThumb(sn.thumbnails),
      views: num(st.viewCount) || 0,
      likes: num(st.likeCount),
      comments: num(st.commentCount),
      duration: M.parseDuration((item.contentDetails || {}).duration),
      live: sn.liveBroadcastContent && sn.liveBroadcastContent !== 'none' ? sn.liveBroadcastContent : ''
    };
  }

  /* ---- Data API ---- */

  function chunk(arr, n) {
    var out = [];
    for (var i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out;
  }

  function fetchChannels(ids, auth) {
    var out = [];
    return chunk(ids, 50).reduce(function (p, part) {
      return p.then(function () {
        return dataGet('channels', { part: CHANNEL_PARTS, id: part.join(',') }, auth);
      }).then(function (body) {
        (body.items || []).forEach(function (it) { out.push(normalizeChannel(it)); });
      });
    }, Promise.resolve()).then(function () { return out; });
  }

  function fetchMyChannels(token) {
    return dataGet('channels', { part: CHANNEL_PARTS, mine: 'true' }, { token: token })
      .then(function (body) { return (body.items || []).map(normalizeChannel); });
  }

  function firstChannel(params, auth) {
    return dataGet('channels', Object.assign({ part: CHANNEL_PARTS }, params), auth)
      .then(function (body) { return body.items && body.items[0] ? normalizeChannel(body.items[0]) : null; });
  }

  function notFound() { return new ApiError(404, 'channelNotFound'); }

  /* Resolve a link, @handle, channel ID, video link or name to one channel. */
  function resolveChannel(input, auth) {
    var parsed = parseChannelInput(input);
    if (!parsed) return Promise.reject(notFound());
    var must = function (c) { if (!c) throw notFound(); return c; };
    if (parsed.type === 'id') return firstChannel({ id: parsed.value }, auth).then(must);
    if (parsed.type === 'handle') return firstChannel({ forHandle: parsed.value }, auth).then(must);
    if (parsed.type === 'username') {
      return firstChannel({ forUsername: parsed.value }, auth).then(function (c) {
        return c || firstChannel({ forHandle: '@' + parsed.value }, auth);
      }).then(must);
    }
    if (parsed.type === 'video') {
      return dataGet('videos', { part: 'snippet', id: parsed.value }, auth).then(function (body) {
        var it = body.items && body.items[0];
        if (!it) throw notFound();
        return firstChannel({ id: it.snippet.channelId }, auth);
      }).then(must);
    }
    /* custom URL or free text: try as a handle first (1 unit), then search (100 units). */
    var guess = /^[\w.\-·]{3,30}$/.test(parsed.value) ? firstChannel({ forHandle: '@' + parsed.value }, auth) : Promise.resolve(null);
    return guess.then(function (c) {
      if (c) return c;
      return dataGet('search', { part: 'snippet', type: 'channel', q: parsed.value, maxResults: 1 }, auth).then(function (body) {
        var it = body.items && body.items[0];
        if (!it) throw notFound();
        return firstChannel({ id: it.snippet.channelId || (it.id || {}).channelId }, auth);
      });
    }).then(must);
  }

  /* Most recent uploads with statistics (2 quota units per 50 videos). */
  function fetchRecentVideos(uploadsPlaylistId, auth, max) {
    if (!uploadsPlaylistId) return Promise.resolve([]);
    max = Math.min(max || 50, 50);
    return dataGet('playlistItems', { part: 'contentDetails', playlistId: uploadsPlaylistId, maxResults: max }, auth)
      .then(function (body) {
        var ids = (body.items || []).map(function (it) { return it.contentDetails && it.contentDetails.videoId; }).filter(Boolean);
        if (!ids.length) return [];
        return fetchVideos(ids, auth);
      }, function (err) {
        if (err.status === 404) return [];
        throw err;
      })
      .then(function (list) {
        return list.sort(function (a, b) { return a.publishedAt < b.publishedAt ? 1 : -1; });
      });
  }

  function fetchVideos(ids, auth) {
    var out = [];
    return chunk(ids, 50).reduce(function (p, part) {
      return p.then(function () {
        return dataGet('videos', { part: 'snippet,statistics,contentDetails', id: part.join(',') }, auth);
      }).then(function (body) {
        (body.items || []).forEach(function (it) { out.push(normalizeVideo(it)); });
      });
    }, Promise.resolve()).then(function () { return out; });
  }

  function fetchUserEmail(token) {
    return getJson(USERINFO_URL, {}, { token: token }).then(function (b) { return b.email || ''; }, function () { return ''; });
  }

  /* ---- Analytics API ---- */

  function report(channelId, token, params) {
    return getJson(ANALYTICS_URL, Object.assign({ ids: 'channel==' + channelId }, params), { token: token }).then(function (body) {
      var names = (body.columnHeaders || []).map(function (h) { return h.name; });
      return (body.rows || []).map(function (row) {
        var o = {};
        names.forEach(function (n, i) { o[n] = row[i]; });
        return o;
      });
    });
  }

  var DAILY_METRICS = 'views,estimatedMinutesWatched,averageViewDuration,subscribersGained,subscribersLost,likes,comments,shares';

  function mapDaily(r) {
    return {
      day: r.day, views: r.views, minutes: r.estimatedMinutesWatched, gained: r.subscribersGained,
      lost: r.subscribersLost, likes: r.likes, comments: r.comments, shares: r.shares,
      revenue: r.estimatedRevenue == null ? null : r.estimatedRevenue
    };
  }

  /* Private statistics for an owned channel. `days` is the shown period; twice as many
     days of daily data (or `historyDays`) are fetched so the period can be compared with
     the one before it.
     Sections other than `daily` are optional: a failure there leaves them empty. */
  function fetchAnalytics(channelId, token, opts) {
    opts = opts || {};
    var days = opts.days || 28;
    var end = opts.end || M.dayKey(new Date());
    var dailyStart = M.addDays(end, -((opts.historyDays || days * 2) - 1));
    var soft = function (p) { return p.then(null, function () { return []; }); };
    var daily = function (withRevenue) {
      return report(channelId, token, {
        startDate: dailyStart, endDate: end, dimensions: 'day', sort: 'day',
        metrics: DAILY_METRICS + (withRevenue ? ',estimatedRevenue' : '')
      });
    };
    var dailyP = opts.monetary
      ? daily(true).then(null, function (err) { if (err.reason === 'authError') throw err; return daily(false); })
      : daily(false);
    return dailyP.then(function (rows) {
      /* Recent days are not processed yet, so the period ends at the last day that has data. */
      var dataEnd = rows.length ? rows[rows.length - 1].day : end;
      var start = M.addDays(dataEnd, -(days - 1));
      var range = { startDate: start, endDate: dataEnd };
      return Promise.all([
        soft(report(channelId, token, Object.assign({ dimensions: 'insightTrafficSourceType', metrics: 'views,estimatedMinutesWatched', sort: '-views' }, range))),
        soft(report(channelId, token, Object.assign({ dimensions: 'video', metrics: 'views,estimatedMinutesWatched,averageViewDuration,subscribersGained', sort: '-views', maxResults: 10 }, range))),
        soft(report(channelId, token, Object.assign({ dimensions: 'country', metrics: 'views,estimatedMinutesWatched', sort: '-views', maxResults: 10 }, range))),
        soft(report(channelId, token, Object.assign({ dimensions: 'deviceType', metrics: 'views,estimatedMinutesWatched', sort: '-views' }, range)))
      ]).then(function (r) {
        return {
          days: days, start: start, end: dataEnd,
          daily: rows.map(mapDaily),
          traffic: r[0].map(function (x) { return { key: x.insightTrafficSourceType, views: x.views, minutes: x.estimatedMinutesWatched }; }),
          topVideos: r[1].map(function (x) { return { id: x.video, views: x.views, minutes: x.estimatedMinutesWatched, avgDur: x.averageViewDuration, gained: x.subscribersGained }; }),
          countries: r[2].map(function (x) { return { key: x.country, views: x.views, minutes: x.estimatedMinutesWatched }; }),
          devices: r[3].map(function (x) { return { key: x.deviceType, views: x.views, minutes: x.estimatedMinutesWatched }; })
        };
      });
    });
  }

  var TRAFFIC_LABELS = {
    ADVERTISING: 'Quảng cáo', ANNOTATION: 'Chú thích', CAMPAIGN_CARD: 'Thẻ chiến dịch', END_SCREEN: 'Màn hình kết thúc',
    EXT_URL: 'Trang web bên ngoài', HASHTAGS: 'Hashtag', LIVE_REDIRECT: 'Chuyển hướng trực tiếp', NO_LINK_EMBEDDED: 'Nhúng (không rõ nguồn)',
    NO_LINK_OTHER: 'Trực tiếp hoặc không rõ', NOTIFICATION: 'Thông báo', PLAYLIST: 'Danh sách phát', PRODUCT_PAGE: 'Trang sản phẩm',
    PROMOTED: 'Quảng bá', RELATED_VIDEO: 'Video đề xuất', SHORTS: 'Feed Shorts', SOUND_PAGE: 'Trang âm thanh',
    SUBSCRIBER: 'Tính năng duyệt xem (trang chủ, đăng ký)', YT_CHANNEL: 'Trang kênh', YT_OTHER_PAGE: 'Trang YouTube khác',
    YT_PLAYLIST_PAGE: 'Trang danh sách phát', YT_SEARCH: 'Tìm kiếm YouTube', VIDEO_REMIXES: 'Remix video'
  };
  var DEVICE_LABELS = { MOBILE: 'Điện thoại', DESKTOP: 'Máy tính', TABLET: 'Máy tính bảng', TV: 'TV', GAME_CONSOLE: 'Máy chơi game', UNKNOWN_PLATFORM: 'Không rõ' };

  return {
    COST: COST, ApiError: ApiError, explain: explain, classify: classify, buildUrl: buildUrl,
    setFetch: setFetch, setCostListener: setCostListener,
    parseChannelInput: parseChannelInput, normalizeChannel: normalizeChannel, normalizeVideo: normalizeVideo,
    fetchChannels: fetchChannels, fetchMyChannels: fetchMyChannels, resolveChannel: resolveChannel,
    fetchRecentVideos: fetchRecentVideos, fetchVideos: fetchVideos, fetchUserEmail: fetchUserEmail,
    fetchAnalytics: fetchAnalytics, TRAFFIC_LABELS: TRAFFIC_LABELS, DEVICE_LABELS: DEVICE_LABELS
  };
});

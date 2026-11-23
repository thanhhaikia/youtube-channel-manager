const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../js/api.js');

function mockFetch(handler) {
  const calls = [];
  api.setFetch(async (url, opts) => {
    const u = new URL(url);
    calls.push({ url: u, headers: (opts && opts.headers) || {} });
    const r = handler(u, opts) || { status: 404, body: { error: { message: 'no mock' } } };
    const status = r.status || 200;
    return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(r.body) };
  });
  return calls;
}

const channelItem = (id, extra = {}) => ({
  id,
  snippet: { title: 'Kênh ' + id, customUrl: '@kenh', publishedAt: '2020-01-01T00:00:00Z', country: 'VN', thumbnails: { default: { url: 'd.jpg' }, medium: { url: 'm.jpg' } } },
  statistics: { viewCount: '1000', subscriberCount: '50', videoCount: '7', hiddenSubscriberCount: false, ...extra },
  contentDetails: { relatedPlaylists: { uploads: 'UU' + id.slice(2) } }
});

const ID = 'UC' + 'a'.repeat(22);

test('parseChannelInput recognises links, handles, IDs and video links', () => {
  const p = api.parseChannelInput;
  assert.deepEqual(p(ID), { type: 'id', value: ID });
  assert.deepEqual(p('https://www.youtube.com/channel/' + ID + '/videos'), { type: 'id', value: ID });
  assert.deepEqual(p('@MrBeast'), { type: 'handle', value: '@MrBeast' });
  assert.deepEqual(p('https://youtube.com/@MrBeast/featured?x=1'), { type: 'handle', value: '@MrBeast' });
  assert.deepEqual(p('youtube.com/c/SomeName'), { type: 'custom', value: 'SomeName' });
  assert.deepEqual(p('https://www.youtube.com/user/google'), { type: 'username', value: 'google' });
  assert.deepEqual(p('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1'), { type: 'video', value: 'dQw4w9WgXcQ' });
  assert.deepEqual(p('https://youtu.be/dQw4w9WgXcQ?si=x'), { type: 'video', value: 'dQw4w9WgXcQ' });
  assert.deepEqual(p('https://m.youtube.com/shorts/abc123DEF45'), { type: 'video', value: 'abc123DEF45' });
  assert.deepEqual(p('https://www.youtube.com/LegacyName'), { type: 'custom', value: 'LegacyName' });
  assert.deepEqual(p('Tên kênh nào đó'), { type: 'custom', value: 'Tên kênh nào đó' });
  assert.equal(p(''), null);
  assert.equal(p('https://example.com/abc'), null);
  assert.equal(p('https://www.youtube.com/feed/subscriptions'), null);
});

test('normalizeChannel handles hidden subscriber counts', () => {
  const c = api.normalizeChannel(channelItem(ID, { hiddenSubscriberCount: true }));
  assert.equal(c.subs, null);
  assert.equal(c.hiddenSubs, true);
  assert.equal(c.views, 1000);
  assert.equal(c.thumb, 'm.jpg');
  assert.equal(c.uploads, 'UU' + 'a'.repeat(22));
});

test('resolveChannel by handle uses the API key and costs 1 unit', async () => {
  let cost = 0;
  api.setCostListener((n) => { cost += n; });
  const calls = mockFetch((u) => u.searchParams.get('forHandle') === '@abc' ? { body: { items: [channelItem(ID)] } } : { body: {} });
  const c = await api.resolveChannel('https://youtube.com/@abc', { key: 'KEY' });
  assert.equal(c.id, ID);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.searchParams.get('key'), 'KEY');
  assert.equal(calls[0].headers.Authorization, undefined);
  assert.equal(cost, 1);
  api.setCostListener(null);
});

test('resolveChannel from a video link looks up the owner channel', async () => {
  mockFetch((u) => {
    if (u.pathname.endsWith('/videos')) return { body: { items: [{ id: 'v1', snippet: { channelId: ID } }] } };
    if (u.pathname.endsWith('/channels') && u.searchParams.get('id') === ID) return { body: { items: [channelItem(ID)] } };
  });
  assert.equal((await api.resolveChannel('https://youtu.be/v1abcdef', { key: 'K' })).id, ID);
});

test('resolveChannel falls back to search for free text and reports not found', async () => {
  let cost = 0;
  api.setCostListener((n) => { cost += n; });
  mockFetch((u) => {
    if (u.pathname.endsWith('/search')) return { body: { items: [{ id: { channelId: ID }, snippet: { channelId: ID } }] } };
    if (u.searchParams.get('id') === ID) return { body: { items: [channelItem(ID)] } };
    return { body: { items: [] } };
  });
  assert.equal((await api.resolveChannel('somename', { key: 'K' })).id, ID);
  assert.equal(cost, 102);
  api.setCostListener(null);
  mockFetch(() => ({ body: { items: [] } }));
  await assert.rejects(api.resolveChannel('@nobody', { key: 'K' }), (e) => e.reason === 'channelNotFound');
});

test('token auth sends a Bearer header and no key', async () => {
  const calls = mockFetch(() => ({ body: { items: [channelItem(ID)] } }));
  const list = await api.fetchMyChannels('TOKEN');
  assert.equal(list[0].id, ID);
  assert.equal(calls[0].headers.Authorization, 'Bearer TOKEN');
  assert.equal(calls[0].url.searchParams.get('key'), null);
  assert.equal(calls[0].url.searchParams.get('mine'), 'true');
});

test('fetchChannels batches 50 ids per request', async () => {
  const ids = Array.from({ length: 120 }, (_, i) => 'UC' + String(i).padStart(22, '0'));
  const calls = mockFetch((u) => ({ body: { items: u.searchParams.get('id').split(',').map((id) => channelItem(id)) } }));
  const out = await api.fetchChannels(ids, { key: 'K' });
  assert.equal(out.length, 120);
  assert.equal(calls.length, 3);
});

test('fetchRecentVideos joins playlist items with video statistics, newest first', async () => {
  mockFetch((u) => {
    if (u.pathname.endsWith('/playlistItems')) return { body: { items: [{ contentDetails: { videoId: 'a' } }, { contentDetails: { videoId: 'b' } }] } };
    if (u.pathname.endsWith('/videos')) {
      assert.equal(u.searchParams.get('id'), 'a,b');
      return { body: { items: [
        { id: 'a', snippet: { title: 'A', publishedAt: '2026-01-01T00:00:00Z' }, statistics: { viewCount: '10', likeCount: '2' }, contentDetails: { duration: 'PT1M5S' } },
        { id: 'b', snippet: { title: 'B', publishedAt: '2026-02-01T00:00:00Z' }, statistics: { viewCount: '20', commentCount: '1' }, contentDetails: { duration: 'PT10S' } }
      ] } };
    }
  });
  const v = await api.fetchRecentVideos('UUx', { key: 'K' });
  assert.deepEqual(v.map((x) => x.id), ['b', 'a']);
  assert.equal(v[1].duration, 65);
  assert.equal(v[1].comments, null);
  assert.equal(v[0].likes, null);
  mockFetch(() => ({ status: 404, body: { error: { errors: [{ reason: 'playlistNotFound' }] } } }));
  assert.deepEqual(await api.fetchRecentVideos('UUx', { key: 'K' }), []);
  assert.deepEqual(await api.fetchRecentVideos('', { key: 'K' }), []);
});

test('errors are classified and explained in Vietnamese', async () => {
  mockFetch(() => ({ status: 403, body: { error: { message: 'The request cannot be completed because you have exceeded your quota.', errors: [{ reason: 'quotaExceeded' }] } } }));
  await assert.rejects(api.fetchChannels([ID], { key: 'K' }), (e) => e.reason === 'quotaExceeded' && /hạn mức/.test(api.explain(e)));
  mockFetch(() => ({ status: 400, body: { error: { message: 'API key not valid. Please pass a valid API key.', errors: [{ reason: 'badRequest' }] } } }));
  await assert.rejects(api.fetchChannels([ID], { key: 'K' }), (e) => e.reason === 'keyInvalid');
  mockFetch(() => ({ status: 401, body: { error: { message: 'Invalid Credentials' } } }));
  await assert.rejects(api.fetchMyChannels('T'), (e) => e.reason === 'authError');
  mockFetch(() => ({ status: 403, body: { error: { message: 'YouTube Analytics API has not been used in project 1 before or it is disabled.' } } }));
  await assert.rejects(api.fetchMyChannels('T'), (e) => e.reason === 'accessNotConfigured');
  await assert.rejects(api.fetchChannels([ID], {}), (e) => e.reason === 'noAuth');
  api.setFetch(async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(api.fetchChannels([ID], { key: 'K' }), (e) => e.reason === 'network');
});

test('fetchAnalytics maps report rows and tolerates failing optional sections', async () => {
  const calls = mockFetch((u) => {
    const dim = u.searchParams.get('dimensions');
    if (dim === 'day') {
      return { body: {
        columnHeaders: ['day', 'views', 'estimatedMinutesWatched', 'averageViewDuration', 'subscribersGained', 'subscribersLost', 'likes', 'comments', 'shares'].map((name) => ({ name })),
        rows: [['2026-01-12', 10, 30, 180, 2, 1, 3, 1, 0], ['2026-01-13', 20, 50, 150, 4, 0, 5, 2, 1]]
      } };
    }
    if (dim === 'insightTrafficSourceType') return { body: { columnHeaders: [{ name: 'insightTrafficSourceType' }, { name: 'views' }, { name: 'estimatedMinutesWatched' }], rows: [['YT_SEARCH', 20, 40]] } };
    if (dim === 'video') return { body: { columnHeaders: [{ name: 'video' }, { name: 'views' }, { name: 'estimatedMinutesWatched' }, { name: 'averageViewDuration' }, { name: 'subscribersGained' }], rows: [['vid1', 9, 20, 100, 1]] } };
    if (dim === 'country') return { status: 400, body: { error: { message: 'bad query' } } };
    return { body: { columnHeaders: [] } };
  });
  const a = await api.fetchAnalytics(ID, 'TOK', { days: 7, end: '2026-01-14' });
  assert.equal(a.start, '2026-01-07');
  assert.equal(a.end, '2026-01-13');
  assert.equal(a.daily.length, 2);
  assert.deepEqual(a.daily[1], { day: '2026-01-13', views: 20, minutes: 50, gained: 4, lost: 0, likes: 5, comments: 2, shares: 1, revenue: null });
  assert.deepEqual(a.traffic, [{ key: 'YT_SEARCH', views: 20, minutes: 40 }]);
  assert.equal(a.topVideos[0].id, 'vid1');
  assert.deepEqual(a.countries, []);
  assert.deepEqual(a.devices, []);
  const day = calls.find((c) => c.url.searchParams.get('dimensions') === 'day');
  assert.equal(day.url.searchParams.get('ids'), 'channel==' + ID);
  assert.equal(day.url.searchParams.get('startDate'), '2026-01-01');
  assert.equal(day.url.searchParams.get('endDate'), '2026-01-14');
  const traffic = calls.find((c) => c.url.searchParams.get('dimensions') === 'insightTrafficSourceType');
  assert.equal(traffic.url.searchParams.get('startDate'), '2026-01-07');
  assert.equal(traffic.url.searchParams.get('endDate'), '2026-01-13');
  assert.equal(day.headers.Authorization, 'Bearer TOK');
  assert.ok(!/estimatedRevenue/.test(day.url.searchParams.get('metrics')));
});

test('fetchAnalytics retries without revenue when the monetary scope is missing', async () => {
  let n = 0;
  mockFetch((u) => {
    if (u.searchParams.get('dimensions') !== 'day') return { body: {} };
    n++;
    if (/estimatedRevenue/.test(u.searchParams.get('metrics'))) return { status: 403, body: { error: { message: 'Forbidden' } } };
    return { body: { columnHeaders: [{ name: 'day' }, { name: 'views' }], rows: [['2026-01-01', 5]] } };
  });
  const a = await api.fetchAnalytics(ID, 'TOK', { days: 7, end: '2026-01-14', monetary: true });
  assert.equal(n, 2);
  assert.equal(a.daily[0].views, 5);
  assert.equal(a.daily[0].revenue, null);
});

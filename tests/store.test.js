const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../js/store.js');

const mk = () => {
  const local = S.memoryStorage(), session = S.memoryStorage();
  return { local, session, store: S.create({ local, session }) };
};

test('channels keep user fields across refreshes and persist', () => {
  const { local, session, store } = mk();
  store.upsertChannel({ id: 'A', title: 'A', subs: 1, views: 10, videos: 1 }, { group: 'mine', owned: true });
  store.patchChannel('A', { note: 'ghi chú' });
  store.upsertChannel({ id: 'A', title: 'A2', subs: 2, views: 20, videos: 2 });
  store.upsertChannel({ id: 'B', title: 'B' });
  assert.equal(store.state.channels.A.title, 'A2');
  assert.equal(store.state.channels.A.group, 'mine');
  assert.equal(store.state.channels.A.note, 'ghi chú');
  assert.equal(store.state.channels.B.group, 'ref');
  assert.deepEqual(store.list('mine').map((c) => c.id), ['A']);
  assert.deepEqual(store.list().map((c) => c.id), ['A', 'B']);
  assert.ok(store.save());
  const again = S.create({ local, session });
  assert.equal(again.state.channels.A.subs, 2);
  assert.deepEqual(again.state.order, ['A', 'B']);
});

test('snapshots are one per day and removed with the channel', () => {
  const { store } = mk();
  store.upsertChannel({ id: 'A', subs: 1, views: 10, videos: 1 });
  store.recordSnapshot('A', new Date(2026, 0, 1, 9));
  store.patchChannel('A', { subs: 5 });
  store.recordSnapshot('A', new Date(2026, 0, 1, 20));
  store.recordSnapshot('A', new Date(2026, 0, 2, 8));
  assert.deepEqual(store.state.snapshots.A.map((s) => [s.d, s.s]), [['2026-01-01', 5], ['2026-01-02', 5]]);
  store.setVideos('A', [{ id: 'v' }]);
  store.removeChannel('A');
  assert.equal(store.state.snapshots.A, undefined);
  assert.equal(store.state.videos.A, undefined);
  assert.deepEqual(store.state.order, []);
});

test('tokens expire and live only in session storage', () => {
  const { local, session, store } = mk();
  store.setToken('A', 'tok', 3600, 1000);
  assert.equal(store.getToken('A', 1000), 'tok');
  assert.equal(store.anyToken(1000), 'tok');
  assert.equal(store.getToken('A', 1000 + 3600 * 1000 - 30000), null);
  assert.equal(store.getToken('B', 1000), null);
  store.save();
  assert.ok(!/tok/.test(local.getItem(S.KEY)));
  assert.ok(/tok/.test(session.getItem('ytm.tokens')));
  store.clearToken('A');
  assert.equal(store.anyToken(1000), null);
});

test('quota estimate resets with the Pacific day', () => {
  const { store } = mk();
  const d1 = new Date('2026-11-23T05:00:00Z'), d2 = new Date('2026-11-23T09:00:00Z');
  store.addQuota(5, d1); store.addQuota(100, d1);
  assert.equal(store.quotaUsed(d1), 105);
  assert.equal(store.quotaUsed(d2), 0);
  store.addQuota(1, d2);
  assert.equal(store.quotaUsed(d2), 1);
});

test('export leaves out secrets; import merges and validates', () => {
  const { store } = mk();
  store.state.settings.apiKey = 'SECRETKEY';
  store.state.settings.clientId = 'CLIENT';
  store.upsertChannel({ id: 'A', title: 'A', subs: 1, fetchedAt: '2026-01-01T00:00:00Z' }, { group: 'mine' });
  store.recordSnapshot('A', new Date(2026, 0, 1));
  store.setToken('A', 'tok', 3600);
  const dump = JSON.parse(JSON.stringify(store.exportData()));
  assert.ok(!/SECRETKEY|CLIENT|tok/.test(JSON.stringify(dump)));

  const other = mk().store;
  other.upsertChannel({ id: 'A', title: 'cũ', subs: 0, fetchedAt: '2025-01-01T00:00:00Z' }, { note: 'ghi chú ở máy này' });
  other.recordSnapshot('A', new Date(2025, 11, 31));
  other.upsertChannel({ id: 'C', title: 'C' });
  assert.equal(other.importData(dump, 'merge'), 1);
  assert.equal(other.state.channels.A.title, 'A');
  assert.equal(other.state.channels.A.note, 'ghi chú ở máy này');
  assert.equal(other.state.channels.A.group, 'ref');
  const older = JSON.parse(JSON.stringify(dump));
  older.channels.A.fetchedAt = '2020-01-01T00:00:00Z';
  older.channels.A.title = 'rất cũ';
  older.channels.A.note = 'ghi chú trong tệp';
  other.patchChannel('A', { note: '' });
  other.importData(older, 'merge');
  assert.equal(other.state.channels.A.title, 'A');
  assert.equal(other.state.channels.A.note, 'ghi chú trong tệp');
  assert.equal(other.state.snapshots.A.length, 2);
  assert.ok(other.state.channels.C);
  other.importData(dump, 'replace');
  assert.equal(other.state.channels.C, undefined);
  assert.throws(() => other.importData({ foo: 1 }), /định dạng/);
});

test('corrupted storage starts empty; clearAll keeps settings', () => {
  const local = S.memoryStorage();
  local.setItem(S.KEY, '{not json');
  const store = S.create({ local, session: S.memoryStorage() });
  assert.deepEqual(store.state.order, []);
  store.state.settings.apiKey = 'K';
  store.upsertChannel({ id: 'A' });
  store.clearAll();
  assert.equal(store.state.settings.apiKey, 'K');
  assert.deepEqual(store.list(), []);
});

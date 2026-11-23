const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../js/metrics.js');

test('parseDuration handles ISO 8601 durations', () => {
  assert.equal(M.parseDuration('PT1H2M3S'), 3723);
  assert.equal(M.parseDuration('PT45S'), 45);
  assert.equal(M.parseDuration('P1DT1M'), 86460);
  assert.equal(M.parseDuration('P0D'), 0);
  assert.equal(M.parseDuration(undefined), 0);
  assert.equal(M.fmtDuration(3723), '1:02:03');
  assert.equal(M.fmtDuration(59), '0:59');
});

test('number formatting uses Vietnamese conventions', () => {
  assert.equal(M.fmtInt(1234567), '1.234.567');
  assert.equal(M.fmtInt(null), '—');
  assert.equal(M.fmtCompact(999), '999');
  assert.equal(M.fmtCompact(1200), '1,2 N');
  assert.equal(M.fmtCompact(15300), '15,3 N');
  assert.equal(M.fmtCompact(3450000), '3,45 Tr');
  assert.equal(M.fmtCompact(2000000000), '2 T');
  assert.equal(M.fmtCompact(-1500), '-1,5 N');
  assert.equal(M.fmtSigned(1500, true), '+1,5 N');
  assert.equal(M.fmtSigned(-20), '−20');
  assert.equal(M.fmtSigned(0), '0');
  assert.equal(M.fmtPercent(0.1234), '12,3%');
  assert.equal(M.fmtHours(600), '10 giờ');
});

test('day helpers', () => {
  assert.equal(M.addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(M.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(M.daysBetween('2026-01-01', '2026-01-31'), 30);
  assert.equal(M.pacificDayKey(new Date('2026-11-23T07:30:00Z')), '2026-11-22');
});

test('addSnapshot keeps one entry per day, sorted', () => {
  let list = [];
  list = M.addSnapshot(list, { d: '2026-01-02', s: 10 });
  list = M.addSnapshot(list, { d: '2026-01-01', s: 5 });
  list = M.addSnapshot(list, { d: '2026-01-02', s: 12 });
  assert.deepEqual(list, [{ d: '2026-01-01', s: 5 }, { d: '2026-01-02', s: 12 }]);
  assert.equal(M.addSnapshot(list, { d: '2026-01-03', s: 1 }, 2).length, 2);
});

test('snapshotDelta picks the snapshot at least N days old, else the oldest', () => {
  const list = [
    { d: '2026-01-01', s: 100 }, { d: '2026-01-20', s: 150 }, { d: '2026-01-27', s: 180 }, { d: '2026-01-30', s: 200 }
  ];
  assert.deepEqual(M.snapshotDelta(list, 's', 7), { delta: 50, days: 10, from: '2026-01-20', to: '2026-01-30' });
  assert.equal(M.snapshotDelta(list, 's', 3).delta, 20);
  assert.equal(M.snapshotDelta(list, 's', 365).delta, 100);
  assert.equal(M.snapshotDelta([{ d: '2026-01-01', s: 1 }], 's', 7), null);
  assert.equal(M.snapshotDelta([{ d: '2026-01-01', s: null }, { d: '2026-01-02', s: 5 }], 's', 1), null);
});

test('videoStats computes averages, cadence and outliers', () => {
  const now = '2026-02-01T00:00:00Z';
  const items = [];
  for (let i = 0; i < 8; i++) {
    items.push({ publishedAt: new Date(Date.parse('2026-01-29T10:00:00Z') - i * 7 * M.DAY_MS).toISOString(), views: 100, likes: 8, comments: 2, duration: 60 });
  }
  items[3].views = 1000;
  const s = M.videoStats(items, now);
  assert.equal(s.count, 8);
  assert.equal(s.medianViews, 100);
  assert.equal(s.avgViews, 212.5);
  assert.equal(Math.round(s.perWeek * 100), 100);
  assert.equal(s.last30, 4);
  assert.equal(s.outliers.length, 1);
  assert.equal(s.outliers[0].views, 1000);
  assert.equal(s.engagement, 80 / 1700);
  assert.equal(s.lastUpload, '2026-01-29T10:00:00.000Z');
  assert.equal(s.weekdays.reduce((a, b) => a + b), 8);
  const empty = M.videoStats([]);
  assert.equal(empty.count, 0);
  assert.equal(empty.avgViews, null);
});

test('analyticsSummary compares the period with the one before it', () => {
  const daily = [];
  for (let i = 0; i < 14; i++) {
    daily.push({ day: M.addDays('2026-01-01', i), views: i < 7 ? 10 : 20, minutes: i < 7 ? 30 : 40, gained: 3, lost: 1 });
  }
  const s = M.analyticsSummary(daily, '2026-01-14', 7);
  assert.equal(s.start, '2026-01-08');
  assert.equal(s.current.views, 140);
  assert.equal(s.previous.views, 70);
  assert.equal(s.change.views, 1);
  assert.equal(s.current.net, 14);
  assert.equal(s.change.net, 0);
  assert.equal(s.current.revenue, null);
  assert.equal(s.current.avgDur, 120);
  assert.equal(s.rows.length, 7);
  const reported = M.sumRows([{ views: 10, minutes: 30, avgDur: 60 }, { views: 30, minutes: 30, avgDur: 20 }]);
  assert.equal(reported.avgDur, 30);
  const noPrev = M.analyticsSummary(daily.slice(7), '2026-01-14', 7);
  assert.equal(noPrev.change.views, null);
});

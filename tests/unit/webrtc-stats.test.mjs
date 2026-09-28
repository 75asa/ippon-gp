// web/src/shared/webrtc-stats.js の単体テスト。node --test tests/unit/ で実行（依存なし）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  readRtpStats, bitrateKbps, shortCodec, watchQuality,
  formatQuality, formatQualityRecord, toQualityRecord, qualityRecordEquals,
} from '../../web/src/shared/webrtc-stats.js';

// getStats() が返す RTCStatsReport 相当（Map でよい）を組み立てる
function report({ type, kind, extra = {}, codecId = 'c1', mime = 'video/H264' }) {
  const m = new Map();
  m.set('rtp1', { type, kind, codecId, ...extra });
  m.set('c1', { type: 'codec', mimeType: mime });
  return m;
}

test('readRtpStats: outbound-rtp video を取り出す', () => {
  const r = report({ type: 'outbound-rtp', kind: 'video', extra: { frameWidth: 1920, frameHeight: 1080, framesPerSecond: 29.7, bytesSent: 12345, timestamp: 1000, qualityLimitationReason: 'bandwidth' } });
  const s = readRtpStats(r, 'outbound', 'video');
  assert.deepEqual(s, { width: 1920, height: 1080, fps: 29.7, bytes: 12345, timestamp: 1000, qualityLimitationReason: 'bandwidth', codec: 'video/H264' });
});

test('readRtpStats: inbound は qualityLimitationReason を持たない（null）', () => {
  const r = report({ type: 'inbound-rtp', kind: 'video', extra: { frameWidth: 1280, frameHeight: 720, framesPerSecond: 30, bytesReceived: 500, timestamp: 2000 } });
  const s = readRtpStats(r, 'inbound', 'video');
  assert.equal(s.qualityLimitationReason, null);
  assert.equal(s.bytes, 500);
});

test('readRtpStats: qualityLimitationReason が無ければ none 扱い', () => {
  const r = report({ type: 'outbound-rtp', kind: 'video', extra: { frameWidth: 640, frameHeight: 480, bytesSent: 1, timestamp: 1 } });
  assert.equal(readRtpStats(r, 'outbound', 'video').qualityLimitationReason, 'none');
});

test('readRtpStats: 種類が違えば null（audio の outbound-rtp は無視）', () => {
  const r = report({ type: 'outbound-rtp', kind: 'audio' });
  assert.equal(readRtpStats(r, 'outbound', 'video'), null);
});

test('readRtpStats: report が無ければ null', () => {
  assert.equal(readRtpStats(null, 'outbound', 'video'), null);
});

test('bitrateKbps: bytes と timestamp の差から kbps を出す', () => {
  // 50000 bytes を 1000ms で送った = 400,000 bit / 1s = 400 kbps
  const prev = { bytes: 1000, timestamp: 0 };
  const curr = { bytes: 51000, timestamp: 1000 };
  assert.equal(bitrateKbps(prev, curr), 400);
});

test('bitrateKbps: 4.2Mbps 相当の数字になる', () => {
  const prev = { bytes: 0, timestamp: 0 };
  const curr = { bytes: 525000, timestamp: 1000 }; // 525000*8 = 4,200,000 bit / 1s = 4200 kbps
  assert.equal(bitrateKbps(prev, curr), 4200);
});

test('bitrateKbps: prev が無い / dt<=0 / bytes 減少（再接続でリセット）なら null', () => {
  assert.equal(bitrateKbps(null, { bytes: 1, timestamp: 1 }), null);
  assert.equal(bitrateKbps({ bytes: 1, timestamp: 1000 }, { bytes: 2, timestamp: 1000 }), null);
  assert.equal(bitrateKbps({ bytes: 1000, timestamp: 0 }, { bytes: 10, timestamp: 1000 }), null);
});

test('shortCodec: video/ プレフィックスを外して大文字化', () => {
  assert.equal(shortCodec('video/H264'), 'H264');
  assert.equal(shortCodec('video/VP8'), 'VP8');
  assert.equal(shortCodec(null), null);
  assert.equal(shortCodec(''), null);
});

test('formatQuality: 解像度・fps・Mbps・コーデックをまとめる', () => {
  assert.equal(
    formatQuality({ width: 1920, height: 1080, fps: 30, kbps: 4200, codec: 'H264', limit: 'none' }),
    '1920×1080 30fps 4.2Mbps H264',
  );
});

test('formatQuality: limit が none 以外なら末尾に付く', () => {
  assert.equal(
    formatQuality({ width: 640, height: 480, fps: 15, kbps: 300, codec: 'VP8', limit: 'cpu' }),
    '640×480 15fps 300kbps VP8 (cpu)',
  );
});

test('formatQuality: width が無ければ空文字', () => {
  assert.equal(formatQuality(null), '');
  assert.equal(formatQuality({}), '');
});

test('formatQualityRecord: RTDB 形（res が "1920x1080"）を表示用に整形', () => {
  assert.equal(
    formatQualityRecord({ res: '1920x1080', fps: 30, kbps: 4200, codec: 'H264', limit: 'bandwidth', ts: 1 }),
    '1920×1080 30fps 4.2Mbps H264 (bandwidth)',
  );
  assert.equal(formatQualityRecord(null), '');
});

test('toQualityRecord: 丸め・クランプして RTDB の形にする', () => {
  const rec = toQualityRecord({ width: 1920, height: 1080, fps: 29.6, kbps: 4234, codec: 'H264', limit: 'bandwidth' }, 123);
  assert.deepEqual(rec, { res: '1920x1080', fps: 30, kbps: 4200, codec: 'H264', limit: 'bandwidth', ts: 123 });
});

test('toQualityRecord: 解像度が無ければ null', () => {
  assert.equal(toQualityRecord(null), null);
  assert.equal(toQualityRecord({ fps: 30 }), null);
});

test('toQualityRecord: 未知の limit は none に、範囲外の数値はクランプ、コーデックは記号を落とす', () => {
  const rec = toQualityRecord({ width: 99999, height: -5, fps: 99999, kbps: -10, codec: 'video/vp9; extra=1', limit: 'weird' }, 1);
  assert.equal(rec.res, '7680x1'); // width は上限、height は下限 1 にクランプ
  assert.equal(rec.fps, 240);
  assert.equal(rec.kbps, 0);
  assert.equal(rec.limit, 'none');
  assert.equal(rec.codec, 'videovp9extra1'.slice(0, 16));
});

test('toQualityRecord: codec が無ければ unknown', () => {
  assert.equal(toQualityRecord({ width: 100, height: 100 }, 1).codec, 'unknown');
});

test('qualityRecordEquals: res/codec/limit が同じで fps・kbps が許容差以内なら同じ扱い', () => {
  const a = { res: '1920x1080', fps: 30, kbps: 4200, codec: 'H264', limit: 'none', ts: 1 };
  const b = { res: '1920x1080', fps: 29, kbps: 4100, codec: 'H264', limit: 'none', ts: 999 };
  assert.ok(qualityRecordEquals(a, b));
});

test('qualityRecordEquals: res / codec / limit の違いは同じ扱いにしない', () => {
  const base = { res: '1920x1080', fps: 30, kbps: 4200, codec: 'H264', limit: 'none' };
  assert.ok(!qualityRecordEquals(base, { ...base, res: '1280x720' }));
  assert.ok(!qualityRecordEquals(base, { ...base, codec: 'VP8' }));
  assert.ok(!qualityRecordEquals(base, { ...base, limit: 'bandwidth' }));
  assert.ok(!qualityRecordEquals(base, { ...base, kbps: 5000 }));
});

test('qualityRecordEquals: null 同士 / 片方 null', () => {
  assert.ok(qualityRecordEquals(null, null));
  assert.ok(!qualityRecordEquals(null, {}));
});

// watchQuality 用の偽 RTCPeerConnection。呼び出しごとに samples[] を順番に返す
function fakePc(samples) {
  let calls = 0;
  return {
    connectionState: 'connected',
    get calls() { return calls; },
    async getStats() {
      const s = samples[Math.min(calls, samples.length - 1)];
      calls++;
      return s;
    },
  };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('watchQuality: 2 回目以降でビットレートが計算され、コールバックに渡る', async () => {
  const s1 = report({ type: 'outbound-rtp', kind: 'video', extra: { frameWidth: 1920, frameHeight: 1080, framesPerSecond: 30, bytesSent: 0, timestamp: 0 } });
  const s2 = report({ type: 'outbound-rtp', kind: 'video', extra: { frameWidth: 1920, frameHeight: 1080, framesPerSecond: 30, bytesSent: 525000, timestamp: 1000, qualityLimitationReason: 'bandwidth' } });
  const pc = fakePc([s1, s2]);
  const got = [];
  const stop = watchQuality(pc, 'outbound', (q) => got.push(q), { intervalMs: 5 });
  await wait(40);
  stop();
  assert.ok(got.length >= 2, `at least 2 samples, got ${got.length}`);
  assert.equal(got[0].kbps, null); // 1 回目は差分が取れない
  assert.equal(got[1].kbps, 4200);
  assert.equal(got[1].limit, 'bandwidth');
  assert.equal(got[1].codec, 'H264');
});

test('watchQuality: stop() 後は getStats を呼ばない', async () => {
  const s = report({ type: 'outbound-rtp', kind: 'video', extra: { frameWidth: 1920, frameHeight: 1080, bytesSent: 0, timestamp: 0 } });
  const pc = fakePc([s]);
  const stop = watchQuality(pc, 'outbound', () => {}, { intervalMs: 5 });
  await wait(15);
  stop();
  const n = pc.calls;
  await wait(30);
  assert.equal(pc.calls, n);
});

test('watchQuality: connectionState が closed なら getStats を呼ばず止まる', async () => {
  const s = report({ type: 'outbound-rtp', kind: 'video', extra: { frameWidth: 1920, frameHeight: 1080, bytesSent: 0, timestamp: 0 } });
  const pc = fakePc([s]);
  pc.connectionState = 'closed';
  watchQuality(pc, 'outbound', () => assert.fail('closed なのに呼ばれた'), { intervalMs: 5 });
  await wait(20);
  assert.equal(pc.calls, 0);
});

test('watchQuality: 解像度が無い（まだ outbound-rtp が無い）サンプルは通知しない', async () => {
  const empty = new Map();
  const s = report({ type: 'outbound-rtp', kind: 'video', extra: { frameWidth: 1920, frameHeight: 1080, bytesSent: 0, timestamp: 0 } });
  const pc = fakePc([empty, empty, s]);
  const got = [];
  const stop = watchQuality(pc, 'outbound', (q) => got.push(q), { intervalMs: 5 });
  await wait(200);
  stop();
  assert.ok(got.length >= 1);
  assert.equal(got[0].width, 1920);
});

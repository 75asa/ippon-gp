// web/src/shared/webrtc-stats.js の単体テスト。node --test tests/unit/ で実行（依存なし）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  readRtpStats, bitrateKbps, shortCodec, watchQuality, watchConnectionState, readCandidatePairStats,
  formatQuality, formatQualityRecord, toQualityRecord, qualityRecordEquals, isQualityStale,
} from '../../web/src/shared/webrtc-stats.js';

// getStats() が返す RTCStatsReport 相当（Map でよい）を組み立てる。
// pair を渡すと selected candidate-pair とその local/remote candidate も入れる。
function report({ type, kind, extra = {}, codecId = 'c1', mime = 'video/H264', pair }) {
  const m = new Map();
  m.set('rtp1', { type, kind, codecId, ...extra });
  m.set('c1', { type: 'codec', mimeType: mime });
  if (pair) {
    const { local = 'host', remote = 'host', nominated = true, selected = true, state = 'succeeded' } = pair;
    m.set('pair1', { type: 'candidate-pair', nominated, selected, state, localCandidateId: 'lc1', remoteCandidateId: 'rc1' });
    m.set('lc1', { type: 'local-candidate', candidateType: local });
    m.set('rc1', { type: 'remote-candidate', candidateType: remote });
  }
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

test('bitrateKbps: prev が無い / dt<=0 / bytes 減少（再接続でリセット。新 SSRC 相当）なら null', () => {
  assert.equal(bitrateKbps(null, { bytes: 1, timestamp: 1 }), null);
  assert.equal(bitrateKbps({ bytes: 1, timestamp: 1000 }, { bytes: 2, timestamp: 1000 }), null);
  assert.equal(bitrateKbps({ bytes: 1000, timestamp: 0 }, { bytes: 10, timestamp: 1000 }), null);
});

test('bitrateKbps: ポーリング間隔が一定でなくても timestamp の実差分で計算する（バックグラウンドでのタイマースロットル対策）', () => {
  // 2 秒間隔を期待していても、タブがバックグラウンドに回ってタイマーが間引かれ、
  // 実際には 7.3 秒後にしか呼ばれなかったケース。timestamp の差分を使うので狂わない。
  const prev = { bytes: 10_000, timestamp: 0 };
  const curr = { bytes: 10_000 + 3_650_000, timestamp: 7300 }; // 3,650,000*8 / 7300 = 4000 kbps
  assert.equal(bitrateKbps(prev, curr), 4000);
});

test('bitrateKbps: ポーリングが早まって間隔が短くても正しく計算する', () => {
  const prev = { bytes: 0, timestamp: 1000 };
  const curr = { bytes: 25_000, timestamp: 1200 }; // 200ms で 25000*8 = 200,000 bit → 1000 kbps
  assert.equal(bitrateKbps(prev, curr), 1000);
});

test('readCandidatePairStats: nominated+succeeded な pair の local/remote candidateType を取り出す', () => {
  const r = report({ type: 'outbound-rtp', kind: 'video', pair: { local: 'host', remote: 'srflx' } });
  assert.deepEqual(readCandidatePairStats(r), { local: 'host', remote: 'srflx' });
});

test('readCandidatePairStats: nominated が無ければ selected フラグにフォールバックする', () => {
  const r = report({ type: 'outbound-rtp', kind: 'video', pair: { local: 'host', remote: 'host', nominated: false, selected: true, state: 'succeeded' } });
  assert.deepEqual(readCandidatePairStats(r), { local: 'host', remote: 'host' });
});

test('readCandidatePairStats: pair が無ければ null', () => {
  const r = report({ type: 'outbound-rtp', kind: 'video' });
  assert.equal(readCandidatePairStats(r), null);
  assert.equal(readCandidatePairStats(null), null);
});

test('readCandidatePairStats: relay 経由も種別としてそのまま返す（TURN 無し構成では異常のはず）', () => {
  const r = report({ type: 'outbound-rtp', kind: 'video', pair: { local: 'relay', remote: 'srflx' } });
  assert.deepEqual(readCandidatePairStats(r), { local: 'relay', remote: 'srflx' });
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

test('formatQuality: path が host/host なら何も付かない', () => {
  assert.equal(
    formatQuality({ width: 1920, height: 1080, fps: 30, kbps: 4200, codec: 'H264', limit: 'none', path: { local: 'host', remote: 'host' } }),
    '1920×1080 30fps 4.2Mbps H264',
  );
});

test('formatQuality: path が NAT 越え（host/srflx 等）なら [NAT] が付く', () => {
  assert.equal(
    formatQuality({ width: 1920, height: 1080, fps: 30, kbps: 4200, codec: 'H264', limit: 'none', path: { local: 'host', remote: 'srflx' } }),
    '1920×1080 30fps 4.2Mbps H264 [NAT]',
  );
});

test('formatQuality: path に relay が混ざると [RELAY?]（TURN 無し構成での異常）', () => {
  assert.equal(
    formatQuality({ width: 1920, height: 1080, fps: 30, kbps: 4200, codec: 'H264', limit: 'none', path: { local: 'relay', remote: 'srflx' } }),
    '1920×1080 30fps 4.2Mbps H264 [RELAY?]',
  );
});

test('formatQuality: path が無ければ何も付かない', () => {
  assert.equal(
    formatQuality({ width: 1920, height: 1080, fps: 30, kbps: 4200, codec: 'H264', limit: 'none' }),
    '1920×1080 30fps 4.2Mbps H264',
  );
});

test('formatQualityRecord: RTDB 形（res が "1920x1080"）を表示用に整形', () => {
  assert.equal(
    formatQualityRecord({ res: '1920x1080', fps: 30, kbps: 4200, codec: 'H264', limit: 'bandwidth', path: 'host', ts: 1 }),
    '1920×1080 30fps 4.2Mbps H264 (bandwidth)',
  );
  assert.equal(formatQualityRecord(null), '');
});

test('formatQualityRecord: path が nat なら [NAT]、unknown なら何も付かない', () => {
  assert.equal(
    formatQualityRecord({ res: '1920x1080', fps: 30, kbps: 4200, codec: 'H264', limit: 'none', path: 'nat', ts: 1 }),
    '1920×1080 30fps 4.2Mbps H264 [NAT]',
  );
  assert.equal(
    formatQualityRecord({ res: '1920x1080', fps: 30, kbps: 4200, codec: 'H264', limit: 'none', path: 'unknown', ts: 1 }),
    '1920×1080 30fps 4.2Mbps H264',
  );
});

test('toQualityRecord: 丸め・クランプして RTDB の形にする（path も host/nat/unknown に変換）', () => {
  const rec = toQualityRecord({ width: 1920, height: 1080, fps: 29.6, kbps: 4234, codec: 'H264', limit: 'bandwidth', path: { local: 'host', remote: 'host' } }, 123);
  assert.deepEqual(rec, { res: '1920x1080', fps: 30, kbps: 4200, codec: 'H264', limit: 'bandwidth', path: 'host', ts: 123 });
});

test('toQualityRecord: path が host/host 以外なら nat、無ければ unknown', () => {
  const base = { width: 1920, height: 1080, fps: 30, kbps: 4200, codec: 'H264', limit: 'none' };
  assert.equal(toQualityRecord({ ...base, path: { local: 'host', remote: 'srflx' } }, 1).path, 'nat');
  assert.equal(toQualityRecord({ ...base, path: { local: 'relay', remote: 'relay' } }, 1).path, 'nat');
  assert.equal(toQualityRecord({ ...base, path: null }, 1).path, 'unknown');
  assert.equal(toQualityRecord(base, 1).path, 'unknown');
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

test('qualityRecordEquals: res / codec / limit / path の違いは同じ扱いにしない', () => {
  const base = { res: '1920x1080', fps: 30, kbps: 4200, codec: 'H264', limit: 'none', path: 'host' };
  assert.ok(!qualityRecordEquals(base, { ...base, res: '1280x720' }));
  assert.ok(!qualityRecordEquals(base, { ...base, codec: 'VP8' }));
  assert.ok(!qualityRecordEquals(base, { ...base, limit: 'bandwidth' }));
  assert.ok(!qualityRecordEquals(base, { ...base, kbps: 5000 }));
  assert.ok(!qualityRecordEquals(base, { ...base, path: 'nat' }));
});

test('qualityRecordEquals: path が無い（旧レコード）場合は unknown 扱いで比較する', () => {
  const a = { res: '1920x1080', fps: 30, kbps: 4200, codec: 'H264', limit: 'none' };
  const b = { res: '1920x1080', fps: 30, kbps: 4200, codec: 'H264', limit: 'none', path: 'unknown' };
  assert.ok(qualityRecordEquals(a, b));
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

test('watchQuality: selected candidate pair の path もサンプルに乗る', async () => {
  const s1 = report({ type: 'outbound-rtp', kind: 'video', extra: { frameWidth: 1920, frameHeight: 1080, bytesSent: 0, timestamp: 0 }, pair: { local: 'host', remote: 'srflx' } });
  const pc = fakePc([s1]);
  const got = [];
  const stop = watchQuality(pc, 'outbound', (q) => got.push(q), { intervalMs: 5 });
  await wait(15);
  stop();
  assert.ok(got.length >= 1);
  assert.deepEqual(got[0].path, { local: 'host', remote: 'srflx' });
});

test('watchQuality: 再ネゴシエーション等で bytes がリセット（新 SSRC 相当）されると、その回は kbps が null に戻る', async () => {
  const s1 = report({ type: 'outbound-rtp', kind: 'video', extra: { frameWidth: 1920, frameHeight: 1080, bytesSent: 100_000, timestamp: 1000 } });
  const s2 = report({ type: 'outbound-rtp', kind: 'video', extra: { frameWidth: 1920, frameHeight: 1080, bytesSent: 625_000, timestamp: 2000 } }); // 4200kbps 相当
  // カメラ切替などで送信が作り直され、カウンターが 0 から再スタート
  const s3 = report({ type: 'outbound-rtp', kind: 'video', extra: { frameWidth: 1280, frameHeight: 720, bytesSent: 1_000, timestamp: 100 } });
  const pc = fakePc([s1, s2, s3]);
  const got = [];
  const stop = watchQuality(pc, 'outbound', (q) => got.push(q), { intervalMs: 5 });
  await wait(50);
  stop();
  assert.ok(got.length >= 3, `at least 3 samples, got ${got.length}`);
  assert.equal(got[0].kbps, null);
  assert.equal(got[1].kbps, 4200);
  assert.equal(got[2].kbps, null); // リセット直後は差分が負になるので null（誤ったスパイク値を出さない）
  assert.equal(got[2].width, 1280);
});

// watchConnectionState 用の偽 RTCPeerConnection。addEventListener/removeEventListener と
// connectionState だけ持つ最小限のもの。_setState() で状態変化イベントを起こす
function fakeConnPc(initialState = 'new') {
  let listeners = [];
  return {
    connectionState: initialState,
    get listenerCount() { return listeners.length; },
    addEventListener(type, cb) { if (type === 'connectionstatechange') listeners.push(cb); },
    removeEventListener(type, cb) { if (type === 'connectionstatechange') listeners = listeners.filter((l) => l !== cb); },
    _setState(state) { this.connectionState = state; listeners.slice().forEach((cb) => cb()); },
  };
}

test('watchConnectionState: connecting を経由して connected になっても onConnected が呼ばれる（#94 の回帰: { once: true } だと呼ばれない）', () => {
  const pc = fakeConnPc('new');
  const connected = [];
  const disconnected = [];
  watchConnectionState(pc, { onConnected: () => connected.push(1), onDisconnected: () => disconnected.push(1) });
  pc._setState('connecting'); // { once: true } のバグでは、ここで listener が外れて connected を一生観測できない
  assert.equal(connected.length, 0, 'connecting ではまだ呼ばれない');
  pc._setState('connected');
  assert.equal(connected.length, 1, 'connecting の後の connected で呼ばれる');
  assert.equal(disconnected.length, 0);
});

test('watchConnectionState: 登録時点で既に connected なら即座に呼ぶ', () => {
  const pc = fakeConnPc('connected');
  let called = 0;
  watchConnectionState(pc, { onConnected: () => called++ });
  assert.equal(called, 1);
});

test('watchConnectionState: onConnected は 1 回だけ。再度 connected になっても増えない', () => {
  const pc = fakeConnPc('new');
  let called = 0;
  watchConnectionState(pc, { onConnected: () => called++ });
  pc._setState('connecting');
  pc._setState('connected');
  pc._setState('disconnected');
  pc._setState('connected');
  assert.equal(called, 1);
});

test('watchConnectionState: disconnected / failed / closed で onDisconnected が呼ばれる（何度でも）', () => {
  const pc = fakeConnPc('new');
  const disconnected = [];
  watchConnectionState(pc, { onDisconnected: () => disconnected.push(pc.connectionState) });
  pc._setState('connecting');
  pc._setState('failed');
  pc._setState('connecting');
  pc._setState('closed');
  assert.deepEqual(disconnected, ['failed', 'closed']);
});

test('watchConnectionState: 登録時点で既に切断済みなら即座に onDisconnected を呼ぶ', () => {
  const pc = fakeConnPc('failed');
  let called = 0;
  watchConnectionState(pc, { onDisconnected: () => called++ });
  assert.equal(called, 1);
});

test('watchConnectionState: 戻り値で止めると listener が外れ、以後どちらも呼ばれない', () => {
  const pc = fakeConnPc('new');
  let connected = 0;
  let disconnected = 0;
  const stop = watchConnectionState(pc, { onConnected: () => connected++, onDisconnected: () => disconnected++ });
  assert.equal(pc.listenerCount, 1);
  stop();
  assert.equal(pc.listenerCount, 0);
  pc._setState('connected');
  pc._setState('failed');
  assert.equal(connected, 0);
  assert.equal(disconnected, 0);
});

test('watchConnectionState: コールバック省略でも例外にならない', () => {
  const pc = fakeConnPc('new');
  assert.doesNotThrow(() => {
    watchConnectionState(pc, {});
    pc._setState('connected');
    pc._setState('failed');
  });
});

test('isQualityStale: 15 秒以内なら新しい、超えたら古い', () => {
  assert.equal(isQualityStale(1000, 1000), false);
  assert.equal(isQualityStale(1000, 1000 + 15000), false);
  assert.equal(isQualityStale(1000, 1000 + 15001), true);
});

test('isQualityStale: ts / serverNow が数値でなければ古い扱い（未接続と同じ表示にする）', () => {
  assert.equal(isQualityStale(null, 1000), true);
  assert.equal(isQualityStale(undefined, 1000), true);
  assert.equal(isQualityStale(1000, null), true);
  assert.equal(isQualityStale('1000', 2000), true);
});

test('isQualityStale: staleMs を変えられる', () => {
  assert.equal(isQualityStale(1000, 6001, 5000), true);
  assert.equal(isQualityStale(1000, 6000, 5000), false);
});

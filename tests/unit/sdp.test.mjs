// web/src/shared/sdp.js の単体テスト。node --test tests/unit/ で実行（依存なし）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preferCodec, setBitrateHints, watchSendingCodec } from '../../web/src/shared/sdp.js';

// Chrome の offer（抜粋）。VP8 が先頭、H.264 は packetization-mode=0/1 の両方がある
const CHROME = [
  'v=0', 'o=- 1 2 IN IP4 127.0.0.1', 's=-', 't=0 0', 'a=group:BUNDLE 0',
  'm=video 9 UDP/TLS/RTP/SAVPF 96 97 98 99 100 101 102 103 45 46',
  'c=IN IP4 0.0.0.0', 'a=mid:0', 'a=sendonly',
  'a=rtpmap:96 VP8/90000', 'a=rtcp-fb:96 nack',
  'a=rtpmap:97 rtx/90000', 'a=fmtp:97 apt=96',
  'a=rtpmap:98 VP9/90000', 'a=fmtp:98 profile-id=0',
  'a=rtpmap:99 rtx/90000', 'a=fmtp:99 apt=98',
  'a=rtpmap:100 H264/90000', 'a=fmtp:100 level-asymmetry-allowed=1;packetization-mode=0;profile-level-id=42e01f',
  'a=rtpmap:101 rtx/90000', 'a=fmtp:101 apt=100',
  'a=rtpmap:102 H264/90000', 'a=fmtp:102 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f',
  'a=rtpmap:103 rtx/90000', 'a=fmtp:103 apt=102',
  'a=rtpmap:45 AV1/90000',
  'a=rtpmap:46 red/90000', '',
].join('\r\n');

const mline = (sdp) => sdp.split(/\r?\n/).find((l) => l.startsWith('m=video'));

test('H.264 を先頭にし、packetization-mode=1 と対応する RTX を優先する', () => {
  const out = preferCodec(CHROME, 'H264');
  assert.equal(mline(out), 'm=video 9 UDP/TLS/RTP/SAVPF 102 100 103 101 96 97 98 99 45 46');
  assert.ok(out.endsWith('\r\n'), 'CRLF と末尾の改行を保つ');
  assert.equal(out.split('\r\n').length, CHROME.split('\r\n').length, 'm= 行以外は変えない');
});

test('VP9 を指定すると VP9 と RTX が先頭になる', () => {
  assert.equal(mline(preferCodec(CHROME, 'vp9')), 'm=video 9 UDP/TLS/RTP/SAVPF 98 99 96 97 100 101 102 103 45 46');
});

test('H.264 が無い SDP はそのまま返す', () => {
  const noH264 = CHROME.replace(/a=rtpmap:10[02] H264/g, (m) => m.replace('H264', 'XXXX'));
  assert.equal(preferCodec(noH264, 'H264'), noH264);
});

test('音声だけ・空の SDP でも壊れない', () => {
  const audio = 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=rtpmap:111 opus/48000/2\r\n';
  assert.equal(preferCodec(audio, 'H264'), audio);
  assert.equal(setBitrateHints(audio, { startKbps: 3000 }), audio);
  assert.equal(preferCodec('', 'H264'), '');
});

test('映像コーデックに開始 / 上限ビットレートを付け、RTX / RED には付けない', () => {
  const out = setBitrateHints(CHROME, { startKbps: 3000, maxKbps: 6000 });
  const lines = out.split('\r\n');
  const hint = 'x-google-start-bitrate=3000;x-google-max-bitrate=6000';
  assert.ok(lines.includes(`a=fmtp:102 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f;${hint}`));
  assert.ok(lines.includes(`a=fmtp:98 profile-id=0;${hint}`));
  // fmtp が無い VP8 / AV1 には rtpmap の直後に足す
  assert.equal(lines[lines.indexOf('a=rtpmap:96 VP8/90000') + 1], `a=fmtp:96 ${hint}`);
  assert.equal(lines[lines.indexOf('a=rtpmap:45 AV1/90000') + 1], `a=fmtp:45 ${hint}`);
  assert.ok(!out.includes('a=fmtp:97 apt=96;x-google'), 'RTX には付けない');
  assert.ok(!lines.some((l) => l.startsWith('a=fmtp:46 ')), 'RED には付けない');
});

test('二重に適用しても重複しない / 開始ビットレート未指定なら何もしない', () => {
  const once = setBitrateHints(CHROME, { startKbps: 3000 });
  assert.equal(setBitrateHints(once, { startKbps: 3000 }), once);
  assert.equal(setBitrateHints(CHROME, {}), CHROME);
});

// getStats を差し替えた偽の RTCPeerConnection。n 回目から outbound-rtp が出る
function fakePc(appearsAt) {
  let calls = 0;
  return {
    connectionState: 'connected',
    get calls() { return calls; },
    async getStats() {
      calls++;
      const m = new Map();
      if (calls >= appearsAt) {
        m.set('o', { type: 'outbound-rtp', kind: 'video', codecId: 'c' });
        m.set('c', { type: 'codec', mimeType: 'video/H264' });
      }
      return m;
    },
  };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('watchSendingCodec: 統計が出るまで待ち、見つけたら 1 回だけ通知して止まる', async () => {
  const pc = fakePc(3);
  const got = [];
  watchSendingCodec(pc, (c) => got.push(c), { intervalMs: 5, timeoutMs: 1000 });
  await wait(80);
  assert.deepEqual(got, ['video/H264']);
  assert.equal(pc.calls, 3);
});

test('watchSendingCodec: 止める関数・タイムアウト・closed で止まる', async () => {
  const a = fakePc(Infinity);
  const stop = watchSendingCodec(a, () => assert.fail(), { intervalMs: 5, timeoutMs: 1000 });
  await wait(20); stop();
  const n = a.calls; await wait(30);
  assert.equal(a.calls, n, 'stop 後は getStats を呼ばない');

  const b = fakePc(Infinity);
  watchSendingCodec(b, () => assert.fail(), { intervalMs: 5, timeoutMs: 20 });
  await wait(60); const m = b.calls; await wait(30);
  assert.equal(b.calls, m, 'タイムアウト後は止まる');

  const c = fakePc(Infinity); c.connectionState = 'closed';
  watchSendingCodec(c, () => assert.fail(), { intervalMs: 5 });
  await wait(20);
  assert.equal(c.calls, 0, 'closed なら getStats を呼ばない');
});

test('LF 改行の SDP でも動く', () => {
  const lf = CHROME.replace(/\r\n/g, '\n');
  assert.equal(mline(preferCodec(lf, 'H264')), 'm=video 9 UDP/TLS/RTP/SAVPF 102 100 103 101 96 97 98 99 45 46');
  assert.ok(!preferCodec(lf, 'H264').includes('\r'));
});

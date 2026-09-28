// pc.getStats() から配信品質（解像度・fps・ビットレート・コーデック・qualityLimitationReason）を取り出す純粋関数（#63）。
// CAM（送信側 outbound-rtp）・MAIN（受信側 inbound-rtp）の両方の状態表示と、HOST に見せる RTDB 要約の組み立てに使う。
// qualityLimitationReason は Chrome の送信側 outbound-rtp にしか無い（受信側からは分からない）ので、
// MAIN が HOST 用に書く camera_quality の limit は、CAM から PeerJS の DataConnection 経由で送られてくる値を使う（main/index.html 側で合成）。

const RTP_TYPE = { outbound: 'outbound-rtp', inbound: 'inbound-rtp' };
const BYTES_KEY = { outbound: 'bytesSent', inbound: 'bytesReceived' };
const LIMIT_VALUES = new Set(['none', 'bandwidth', 'cpu', 'other']);

// report は RTCStatsReport（Map 互換: forEach / get を持つ）。テストでは素の Map を渡す。
function findRtp(report, type, kind) {
  let found = null;
  report.forEach((s) => { if (s.type === type && s.kind === kind) found = s; });
  return found;
}

function codecMime(report, codecId) {
  if (!codecId || !report.get) return null;
  const c = report.get(codecId);
  return c ? c.mimeType : null;
}

// 選ばれている candidate-pair を探す。ブラウザ間の差を吸収するため nominated+succeeded を優先し、
// 無ければ selected（Chrome の古い実装。将来的に無くなる想定の互換フラグ）にフォールバックする。
function findSelectedPair(report) {
  let pair = null;
  report.forEach((s) => { if (s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded') pair = s; });
  if (!pair) report.forEach((s) => { if (s.type === 'candidate-pair' && s.selected) pair = s; });
  return pair;
}

/**
 * getStats() の report から、選ばれている ICE candidate pair の local/remote 種別
 * （'host' | 'srflx' | 'prflx' | 'relay'）を取り出す。まだ選ばれていなければ null。
 * TURN を使っていない構成（#63 参照）では 'relay' は基本出ない。会場 Wi-Fi をまたいで
 * NAT 越え（'srflx'）になっていないか＝画質低下がエンコーダ制限か経路かの切り分けに使う。
 */
export function readCandidatePairStats(report) {
  if (!report) return null;
  const pair = findSelectedPair(report);
  if (!pair || !report.get) return null;
  const local = report.get(pair.localCandidateId);
  const remote = report.get(pair.remoteCandidateId);
  if (!local && !remote) return null;
  return {
    local: local ? local.candidateType || null : null,
    remote: remote ? remote.candidateType || null : null,
  };
}

/**
 * getStats() の 1 回分の report から、指定方向（'outbound' | 'inbound'）・種類（既定 'video'）の
 * rtp 統計を取り出す。無ければ null。
 */
export function readRtpStats(report, direction = 'outbound', kind = 'video') {
  const type = RTP_TYPE[direction];
  if (!type || !report) return null;
  const rtp = findRtp(report, type, kind);
  if (!rtp) return null;
  return {
    width: typeof rtp.frameWidth === 'number' ? rtp.frameWidth : null,
    height: typeof rtp.frameHeight === 'number' ? rtp.frameHeight : null,
    fps: typeof rtp.framesPerSecond === 'number' ? rtp.framesPerSecond : null,
    bytes: typeof rtp[BYTES_KEY[direction]] === 'number' ? rtp[BYTES_KEY[direction]] : null,
    timestamp: typeof rtp.timestamp === 'number' ? rtp.timestamp : null,
    // qualityLimitationReason は送信側だけ。無指定なら 'none' 扱い
    qualityLimitationReason: direction === 'outbound' ? (rtp.qualityLimitationReason || 'none') : null,
    codec: codecMime(report, rtp.codecId),
  };
}

/** 直近 2 サンプルの bytes / timestamp（ms）差からビットレート（kbps）を出す。差が取れなければ null */
export function bitrateKbps(prev, curr) {
  if (!prev || !curr) return null;
  if (typeof prev.bytes !== 'number' || typeof curr.bytes !== 'number') return null;
  if (typeof prev.timestamp !== 'number' || typeof curr.timestamp !== 'number') return null;
  const dtMs = curr.timestamp - prev.timestamp;
  if (dtMs <= 0) return null;
  const dBytes = curr.bytes - prev.bytes;
  if (dBytes < 0) return null; // 再接続などで bytesSent/Received がリセットされた
  return (dBytes * 8) / dtMs; // (bytes*8 bit) / dtMs = kbps
}

/** 'video/H264' → 'H264' のように短くする。無ければ null */
export function shortCodec(mime) {
  if (!mime) return null;
  return String(mime).replace(/^video\//i, '').toUpperCase();
}

const DEAD_CONNECTION_STATES = new Set(['disconnected', 'failed', 'closed']);

/**
 * RTCPeerConnection の connectionState の変化を見て、
 * 初めて 'connected' になったら onConnected() を、'disconnected' / 'failed' / 'closed' になったら
 * onDisconnected() を呼ぶ。pc がすでに 'connected' / 切断済みなら登録した時点で即座に呼ぶ。
 *
 * `{ once: true }` は使わない: 最初に発火する connectionstatechange は 'connecting' 等が多く、
 * once だとそこで listener が外れて 'connected' を一生観測できなくなる（#94 で実際に起きた回帰）。
 * onConnected は 1 回だけ呼ぶが、その後も onDisconnected の監視は続ける。
 * 戻り値の関数で監視を止められる（以後どちらのコールバックも呼ばれない）。
 */
export function watchConnectionState(pc, { onConnected, onDisconnected } = {}) {
  let connectedFired = false;
  let stopped = false;
  const handleChange = () => {
    if (stopped) return;
    const state = pc.connectionState;
    if (!connectedFired && state === 'connected') {
      connectedFired = true;
      if (onConnected) onConnected();
    } else if (DEAD_CONNECTION_STATES.has(state)) {
      if (onDisconnected) onDisconnected();
    }
  };
  pc.addEventListener('connectionstatechange', handleChange);
  handleChange(); // 登録時点で既に connected / 切断済みなら、イベントを待たずに即反映する
  return () => { stopped = true; pc.removeEventListener('connectionstatechange', handleChange); };
}

/**
 * getStats を定期的に見て、品質サンプル { width, height, fps, kbps, codec, limit } を渡す。
 * pc.connectionState が 'closed' になったら止まる。戻り値の関数で途中で止められる。
 * direction: 'outbound'（CAM の送信側）| 'inbound'（MAIN の受信側）
 */
export function watchQuality(pc, direction, onQuality, { intervalMs = 2000, kind = 'video' } = {}) {
  let stopped = false;
  let timer = null;
  let prev = null;
  const stop = () => { stopped = true; clearTimeout(timer); };
  const tick = async () => {
    if (stopped) return;
    if (pc.connectionState === 'closed') return stop();
    let report = null;
    try { report = await pc.getStats(); } catch (e) { report = null; }
    if (stopped) return;
    if (pc.connectionState === 'closed') return stop();
    if (report) {
      const curr = readRtpStats(report, direction, kind);
      if (curr && curr.width) {
        const kbps = bitrateKbps(prev, curr);
        onQuality({
          width: curr.width,
          height: curr.height,
          fps: curr.fps != null ? Math.round(curr.fps) : null,
          kbps: kbps != null ? Math.round(kbps) : null,
          codec: shortCodec(curr.codec),
          limit: curr.qualityLimitationReason,
          path: readCandidatePairStats(report),
        });
        prev = curr;
      }
    }
    if (stopped) return;
    timer = setTimeout(tick, intervalMs);
  };
  tick();
  return stop;
}

function formatMbps(kbps) {
  if (kbps == null) return '';
  return kbps >= 1000 ? `${(kbps / 1000).toFixed(1)}Mbps` : `${Math.round(kbps)}kbps`;
}

// host/host（同一ネットワーク内で直結）なら何も付けない。片方でも NAT 越え（srflx）だと '[NAT]'、
// TURN 非対応構成のはずの relay が出たら '[RELAY?]' として異常を目立たせる（#63 コメント参照）
function formatPath(path) {
  if (!path || (!path.local && !path.remote)) return '';
  if (path.local === 'host' && path.remote === 'host') return '';
  if (path.local === 'relay' || path.remote === 'relay') return ' [RELAY?]';
  return ' [NAT]';
}

/** CAM / MAIN の画面表示用。q = { width, height, fps, kbps, codec, limit, path }（watchQuality の出力そのもの） */
export function formatQuality(q) {
  if (!q || !q.width) return '';
  const res = `${q.width}×${q.height}`;
  const fps = q.fps != null ? `${q.fps}fps` : '';
  const mbps = formatMbps(q.kbps);
  const codec = q.codec || '';
  const limit = q.limit && q.limit !== 'none' ? ` (${q.limit})` : '';
  return [res, fps, mbps, codec].filter(Boolean).join(' ') + limit + formatPath(q.path);
}

/** HOST 表示用。rec = RTDB の camera_quality（{ res: "1920x1080", fps, kbps, codec, limit, path, ts }） */
export function formatQualityRecord(rec) {
  if (!rec || !rec.res) return '';
  const res = rec.res.replace('x', '×');
  const fps = rec.fps != null ? `${rec.fps}fps` : '';
  const mbps = formatMbps(rec.kbps);
  const codec = rec.codec || '';
  const limit = rec.limit && rec.limit !== 'none' ? ` (${rec.limit})` : '';
  const path = rec.path && rec.path !== 'host' ? (rec.path === 'unknown' ? '' : ' [NAT]') : '';
  return [res, fps, mbps, codec].filter(Boolean).join(' ') + limit + path;
}

const clampInt = (n, min, max) => Math.max(min, Math.min(max, Math.round(n)));

// ビットレートは Mbps 換算した数字だけ見れば十分なので、100kbps 単位に丸めて書き込み頻度のノイズを減らす
const roundKbps = (kbps) => Math.round(kbps / 100) * 100;

/**
 * watchQuality の出力（+ CAM から送られてきた limit）を RTDB camera_quality の形にする。
 * 値は database.rules.json の範囲に収まるよう丸め・クランプする。解像度が無ければ書くものが無いので null。
 */
// { local, remote } → RTDB に書く 1 語（host/nat/unknown）。relay もひとまず nat に丸める
// （#63 のコメント参照。この構成は TURN 無しなので relay は基本出ないはずで、出たら経路異常として nat 扱いで十分警告になる）
function pathToRecordValue(path) {
  if (!path || (!path.local && !path.remote)) return 'unknown';
  return path.local === 'host' && path.remote === 'host' ? 'host' : 'nat';
}

export function toQualityRecord(q, ts = Date.now()) {
  if (!q || !q.width || !q.height) return null;
  const width = clampInt(q.width, 1, 7680);
  const height = clampInt(q.height, 1, 4320);
  const fps = clampInt(q.fps || 0, 0, 240);
  const kbps = clampInt(roundKbps(q.kbps || 0), 0, 100000);
  const codec = String(q.codec || 'unknown').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 16) || 'unknown';
  const limit = LIMIT_VALUES.has(q.limit) ? q.limit : 'none';
  const path = pathToRecordValue(q.path);
  return { res: `${width}x${height}`, fps, kbps, codec, limit, path, ts };
}

/** 2 つの camera_quality レコードが「操作員から見て同じ」かどうか（ts は無視。kbps/fps は多少のブレを許す） */
export function qualityRecordEquals(a, b, { fpsTolerance = 2, kbpsTolerance = 200 } = {}) {
  if (!a || !b) return a === b;
  return a.res === b.res
    && a.codec === b.codec
    && a.limit === b.limit
    && (a.path || 'unknown') === (b.path || 'unknown')
    && Math.abs((a.fps || 0) - (b.fps || 0)) <= fpsTolerance
    && Math.abs((a.kbps || 0) - (b.kbps || 0)) <= kbpsTolerance;
}

/**
 * camera_quality の ts が古すぎる（配信が切れているのに値だけ残っている）かどうか。
 * ts / serverNow はどちらも「サーバー時刻」基準の ms（HOST 側は Date.now() + .info/serverTimeOffset で見積もる）。
 * ts が数値でなければ古い扱い（未接続と同じ表示にする）。
 */
export function isQualityStale(ts, serverNow, staleMs = 15000) {
  if (typeof ts !== 'number' || typeof serverNow !== 'number') return true;
  return serverNow - ts > staleMs;
}

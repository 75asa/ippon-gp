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

/** CAM / MAIN の画面表示用。q = { width, height, fps, kbps, codec, limit }（watchQuality の出力そのもの） */
export function formatQuality(q) {
  if (!q || !q.width) return '';
  const res = `${q.width}×${q.height}`;
  const fps = q.fps != null ? `${q.fps}fps` : '';
  const mbps = formatMbps(q.kbps);
  const codec = q.codec || '';
  const limit = q.limit && q.limit !== 'none' ? ` (${q.limit})` : '';
  return [res, fps, mbps, codec].filter(Boolean).join(' ') + limit;
}

/** HOST 表示用。rec = RTDB の camera_quality（{ res: "1920x1080", fps, kbps, codec, limit, ts }） */
export function formatQualityRecord(rec) {
  if (!rec || !rec.res) return '';
  const res = rec.res.replace('x', '×');
  const fps = rec.fps != null ? `${rec.fps}fps` : '';
  const mbps = formatMbps(rec.kbps);
  const codec = rec.codec || '';
  const limit = rec.limit && rec.limit !== 'none' ? ` (${rec.limit})` : '';
  return [res, fps, mbps, codec].filter(Boolean).join(' ') + limit;
}

const clampInt = (n, min, max) => Math.max(min, Math.min(max, Math.round(n)));

// ビットレートは Mbps 換算した数字だけ見れば十分なので、100kbps 単位に丸めて書き込み頻度のノイズを減らす
const roundKbps = (kbps) => Math.round(kbps / 100) * 100;

/**
 * watchQuality の出力（+ CAM から送られてきた limit）を RTDB camera_quality の形にする。
 * 値は database.rules.json の範囲に収まるよう丸め・クランプする。解像度が無ければ書くものが無いので null。
 */
export function toQualityRecord(q, ts = Date.now()) {
  if (!q || !q.width || !q.height) return null;
  const width = clampInt(q.width, 1, 7680);
  const height = clampInt(q.height, 1, 4320);
  const fps = clampInt(q.fps || 0, 0, 240);
  const kbps = clampInt(roundKbps(q.kbps || 0), 0, 100000);
  const codec = String(q.codec || 'unknown').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 16) || 'unknown';
  const limit = LIMIT_VALUES.has(q.limit) ? q.limit : 'none';
  return { res: `${width}x${height}`, fps, kbps, codec, limit, ts };
}

/** 2 つの camera_quality レコードが「操作員から見て同じ」かどうか（ts は無視。kbps/fps は多少のブレを許す） */
export function qualityRecordEquals(a, b, { fpsTolerance = 2, kbpsTolerance = 200 } = {}) {
  if (!a || !b) return a === b;
  return a.res === b.res
    && a.codec === b.codec
    && a.limit === b.limit
    && Math.abs((a.fps || 0) - (b.fps || 0)) <= fpsTolerance
    && Math.abs((a.kbps || 0) - (b.kbps || 0)) <= kbpsTolerance;
}

// CAM → MAIN の映像の SDP を書き換える純粋関数（#61）。PeerJS の sdpTransform から使う。
// PeerJS は transceiver を内部で作るので setCodecPreferences を差し込めない。代わりに SDP の順番とパラメータを変える。
// どちらの関数も、対象が見つからなければ SDP をそのまま返す（H.264 が無い端末では VP8 / VP9 のまま）。

// config.js の IPPON_CONFIG.camera で上書きできる既定値（CAM と MAIN で共有）。ビットレートは bps
export const CODEC_DEFAULTS = {
  preferredCodec: 'H264', // 'H264' | 'VP8' | 'VP9' | 'AV1'。相手が対応していなければ自動で他のコーデックになる
  startBitrate: 3000000, // 接続直後の開始ビットレート（WebRTC の既定は 300kbps 前後から徐々に上がる）
  maxBitrate: 6000000,
};

const EOL = (sdp) => (sdp.includes('\r\n') ? '\r\n' : '\n');

// SDP を「セッション部」と「m= セクションごと」の行配列に分ける
function split(sdp) {
  const eol = EOL(sdp);
  const lines = sdp.split(eol);
  const trailing = lines.length && lines[lines.length - 1] === '' ? lines.pop() : null;
  const sections = [[]];
  for (const l of lines) {
    if (l.startsWith('m=')) sections.push([]);
    sections[sections.length - 1].push(l);
  }
  return { eol, sections, trailing };
}

function join({ eol, sections, trailing }) {
  const out = sections.flat();
  if (trailing !== null) out.push(trailing);
  return out.join(eol);
}

// m=video セクションのペイロード番号ごとの情報
function payloads(section) {
  const info = new Map();
  for (const l of section) {
    let m = l.match(/^a=rtpmap:(\d+) ([^/]+)\//);
    if (m) { info.set(m[1], { ...(info.get(m[1]) || {}), codec: m[2].toUpperCase() }); continue; }
    m = l.match(/^a=fmtp:(\d+) (.*)$/);
    if (m) info.set(m[1], { ...(info.get(m[1]) || {}), fmtp: m[2] });
  }
  return info;
}

const isVideo = (section) => section[0] && section[0].startsWith('m=video');
const AUX = new Set(['RTX', 'RED', 'ULPFEC', 'FLEXFEC-03']);

/**
 * m=video のペイロード順を並べ替え、codec（'H264' / 'VP8' / 'VP9' / 'AV1'）を先頭にする。
 * H.264 はハードウェアエンコードが効きやすい packetization-mode=1 を優先する。
 * 対応する RTX（再送用）のペイロードも一緒に前へ出す。
 */
export function preferCodec(sdp, codec = 'H264') {
  if (!sdp || !codec) return sdp;
  const want = String(codec).toUpperCase();
  const parsed = split(sdp);
  for (const section of parsed.sections) {
    if (!isVideo(section)) continue;
    const mParts = section[0].split(' ');
    const order = mParts.slice(3);
    const info = payloads(section);
    const matches = order.filter((pt) => info.get(pt)?.codec === want);
    if (!matches.length) continue;
    if (want === 'H264') {
      const pm1 = (pt) => /packetization-mode=1/.test(info.get(pt)?.fmtp || '');
      matches.sort((a, b) => Number(pm1(b)) - Number(pm1(a)));
    }
    const rtxOf = (p) => order.filter((pt) => info.get(pt)?.codec === 'RTX' && new RegExp(`(^|;)\\s*apt=${p}(;|$)`).test(info.get(pt)?.fmtp || ''));
    const rtx = matches.flatMap(rtxOf);
    const front = [...matches, ...rtx];
    section[0] = [...mParts.slice(0, 3), ...front, ...order.filter((pt) => !front.includes(pt))].join(' ');
  }
  return join(parsed);
}

/**
 * m=video の各コーデックに開始 / 上限ビットレート（kbps）を付ける。Chrome 系の送信側が、受け取った SDP から読む。
 * 送信側（CAM）が読むのは相手（MAIN）の SDP なので、MAIN の answer に対して使う。Safari は無視する（害はない）。
 */
export function setBitrateHints(sdp, { startKbps, maxKbps } = {}) {
  if (!sdp || !(startKbps > 0)) return sdp;
  const hint = [`x-google-start-bitrate=${Math.round(startKbps)}`];
  if (maxKbps > 0) hint.push(`x-google-max-bitrate=${Math.round(maxKbps)}`);
  const parsed = split(sdp);
  for (const section of parsed.sections) {
    if (!isVideo(section)) continue;
    const info = payloads(section);
    const targets = section[0].split(' ').slice(3).filter((pt) => info.get(pt)?.codec && !AUX.has(info.get(pt).codec));
    for (const pt of targets) {
      const i = section.findIndex((l) => l.startsWith(`a=fmtp:${pt} `));
      if (i >= 0) {
        if (!/x-google-start-bitrate/.test(section[i])) section[i] += ';' + hint.join(';');
      } else {
        const r = section.findIndex((l) => l.startsWith(`a=rtpmap:${pt} `));
        section.splice(r + 1, 0, `a=fmtp:${pt} ${hint.join(';')}`);
      }
    }
  }
  return join(parsed);
}

/** 実際に使われている送信コーデック（getStats の outbound-rtp → codec）。無ければ null */
export async function sendingCodec(pc) {
  try {
    const stats = await pc.getStats();
    let codecId = null;
    stats.forEach((s) => { if (s.type === 'outbound-rtp' && s.kind === 'video') codecId = s.codecId; });
    const c = codecId && stats.get(codecId);
    return c ? c.mimeType : null;
  } catch (e) {
    return null;
  }
}

/**
 * 送信コーデックが分かるまで getStats を定期的に見る。接続直後は outbound-rtp がまだ無いことが多いため。
 * 見つかったら onCodec(mimeType) を呼んで止まる。timeoutMs を過ぎても止まる。戻り値の関数で途中で止められる。
 */
export function watchSendingCodec(pc, onCodec, { intervalMs = 1500, timeoutMs = 30000 } = {}) {
  let stopped = false;
  let timer = null;
  const deadline = Date.now() + timeoutMs;
  const stop = () => { stopped = true; clearTimeout(timer); };
  const tick = async () => {
    if (stopped) return;
    if (pc.connectionState === 'closed') return stop();
    const codec = await sendingCodec(pc);
    if (stopped) return;
    if (pc.connectionState === 'closed') return stop(); // 取得中に切断されたら通知しない
    if (codec) { stop(); onCodec(codec); return; }
    if (Date.now() >= deadline) return stop();
    timer = setTimeout(tick, intervalMs);
  };
  tick();
  return stop;
}

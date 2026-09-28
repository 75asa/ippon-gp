// MAIN の素材読み込み状況を HOST から見えるようにする（#26 の残り）。
// MAIN（web/main/）が clients/main に要約を書き、HOST（web/host/）がそれを読んで表示する。
// 形の制約は firebase/database.rules.json、スキーマは docs/ARCHITECTURE.md §3 と揃えること。
//
// 複数の MAIN タブが同時に開いている場合、書き込みは最後に render() した方が勝つ（last-writer-wins）。
// MAIN が閉じる・リロードされると onDisconnect().remove() で clients/main が消えるが、
// 2 つ目の MAIN タブがまだ生きていても、先に閉じた方の onDisconnect が clients/main を消してしまう
// （ノードを共有しているため）。次にどちらかの MAIN で状態が変わればまた書き込まれる。

export const CLIENTS_MAIN_PATH = 'clients/main';

// failed に載せる短いパスの最大件数（実際の失敗件数は failedCount に入るので、
// 一覧が切り詰められても件数自体は正しく伝わる）
export const MAX_FAILED = 10;
export const FAILED_LABEL_MAX_LEN = 100;

// Storage の URL からファイル名相当の短いラベルを取り出す（MAIN の素材読み込み表示と同じ考え方）
export function shortLabel(url) {
  const s = String(url);
  const m = s.match(/\/o\/([^?]+)/);
  let label = s;
  if (m) {
    try {
      label = decodeURIComponent(m[1]);
    } catch {
      label = m[1];
    }
  }
  return label.length > FAILED_LABEL_MAX_LEN ? label.slice(0, FAILED_LABEL_MAX_LEN) : label;
}

// order（追跡している URL の一覧、重複なし）と state（url -> 'loading' | 'ok' | 'error'）から
// RTDB に送る要約を作る（ts は含めない。呼び出し側で serverTimestamp 等を足す）。
export function buildMainStatus(order, state) {
  let loaded = 0;
  const failedAll = [];
  order.forEach((url) => {
    const s = state[url];
    if (s === 'ok') loaded++;
    else if (s === 'error') failedAll.push(shortLabel(url));
  });
  return {
    loaded,
    total: order.length,
    failed: failedAll.slice(0, MAX_FAILED),
    failedCount: failedAll.length,
  };
}

// ts を除いた内容が同じか（同じなら書き込みを省略してよい）
export function statusEquals(a, b) {
  if (!a || !b) return false;
  if (a.loaded !== b.loaded || a.total !== b.total || a.failedCount !== b.failedCount) return false;
  if (a.failed.length !== b.failed.length) return false;
  return a.failed.every((v, i) => v === b.failed[i]);
}

// 直近の書き込みから十分な時間が経っているか（連続する読み込み完了イベントで RTDB に書き込みすぎないための間引き）。
// finished（全件 loading が無い状態）になった時点の書き込みは、間引かずに必ず行う。
export function shouldWriteNow(lastWriteAt, now, minIntervalMs, finished) {
  if (finished) return true;
  if (lastWriteAt == null) return true;
  return now - lastWriteAt >= minIntervalMs;
}

// HOST 側の表示用: 進行中 / 完了 / 一部失敗 を判定する
export function mainStatusPhase(v) {
  if (!v || typeof v.loaded !== 'number' || typeof v.total !== 'number' || v.total <= 0) return 'unknown';
  const failedCount = typeof v.failedCount === 'number' ? v.failedCount : (Array.isArray(v.failed) ? v.failed.length : 0);
  if (failedCount > 0) return 'error';
  if (v.loaded >= v.total) return 'done';
  return 'loading';
}

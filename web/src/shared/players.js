// 回答者の定義（#80）。
// 正は RTDB の settings/players（{ "1": { last, first }, ... }）。キーは回答者番号 N（1〜5）で、
// 顔写真 portrait_playerN.png と scores[N - 1] に対応する。設定が無いときは DEFAULT_PLAYERS。
// 形の制約は firebase/database.rules.json と揃えること。

export const PLAYERS_PATH = 'settings/players';
export const PLAYER_COUNT = 5; // 回答者数の上限（素材 portrait_player1..5・scores の要素数）。実際の人数は settings/playerCount
export const PLAYER_COUNT_PATH = 'settings/playerCount';
export const DEFAULT_PLAYER_COUNT = 5;
export const MIN_PLAYER_COUNT = 2;
export const MAX_PLAYER_COUNT = 5; // 顔写真・scores が 1..5 の 5 人分までのため
export const NAME_MAX = 20;

// 回答者番号 1〜5 の順
export const DEFAULT_PLAYERS = [
  { last: 'WAKUSHIMA', first: 'AIKO' },
  { last: 'AGATA', first: 'TOMOYA' },
  { last: 'TOKUMOTO', first: 'TAKASHI' },
  { last: 'AOKI', first: 'MARINA' },
  { last: 'SAGAWA', first: 'SO' },
];

// 回答者数（#18）。正は settings/playerCount（整数）。無い・範囲外のときは 5。
// N 人のときは回答者 1..N を使い、N+1..5 の表示だけを隠す（scores は常に 5 要素のまま、隠した人の点は残る）。
// 制約は firebase/database.rules.json と揃えること。
export function playerCountFromValue(val) {
  return Number.isInteger(val) && val >= MIN_PLAYER_COUNT && val <= MAX_PLAYER_COUNT ? val : DEFAULT_PLAYER_COUNT;
}
// 表示位置 pos（左から 0〜4）の回答者を、回答者数 count のとき表示するか。左側（番号の大きい回答者）から隠す
export const isPosVisible = (pos, count) => pos >= PLAYER_COUNT - count;

// 画面の左からの並び（表示位置 0〜4）は回答者番号 5 → 1
export const playerAt = (pos) => PLAYER_COUNT - pos;
// その回答者のスコアが入っている scores の index
export const scoreIndex = (n) => n - 1;

// RTDB の値 → 回答者番号順の配列 [{ n, last, first }]。
// RTDB は数値キーのオブジェクトを配列で返すことがある（index 0 は空）ので両方を受ける。
// 1 人でも欠けていれば初期値を返し、isDefault を立てる。
export function playersFromValue(val) {
  const list = [];
  if (val && typeof val === 'object') {
    for (let n = 1; n <= PLAYER_COUNT; n++) {
      const p = val[n] ?? val[String(n)];
      if (!p || typeof p.last !== 'string') break;
      list.push({ n, last: p.last, first: typeof p.first === 'string' ? p.first : '' });
    }
  }
  if (list.length < PLAYER_COUNT) {
    return { players: DEFAULT_PLAYERS.map((p, i) => ({ n: i + 1, ...p })), isDefault: true };
  }
  return { players: list, isDefault: false };
}

export function playersToRecord(list) {
  const rec = {};
  list.forEach((p, i) => {
    const first = p.first.trim();
    rec[String(i + 1)] = first ? { last: p.last.trim(), first } : { last: p.last.trim() };
  });
  return rec;
}

export function validatePlayers(list) {
  const errors = [];
  list.forEach((p, i) => {
    const last = p.last.trim();
    if (!last) errors.push(`回答者 ${i + 1} の名前（上段）が空です`);
    else if (last.length > NAME_MAX) errors.push(`回答者 ${i + 1} の名前（上段）が長すぎます（${NAME_MAX} 文字まで）`);
    if (p.first.trim().length > NAME_MAX) errors.push(`回答者 ${i + 1} の名前（下段）が長すぎます（${NAME_MAX} 文字まで）`);
  });
  return errors;
}

// 名前は誰でも書き換えられる RTDB から来るので、innerHTML に入れるときは必ずエスケープする
export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

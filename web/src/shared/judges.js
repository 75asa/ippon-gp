// 審査員の席の定義（#78）。
// 正は RTDB の settings/judges（{ "1": { name, kind }, ... }、席番号は 1 からの連番）。
// 設定が無いときは DEFAULT_JUDGES を使う。形の制約は firebase/database.rules.json と揃えること。

export const JUDGES_PATH = 'settings/judges';

// 下限 = IPPON に必要な票数（#79 で設定化するまで 6 固定）。上限 = JUDGE のレイアウトとルールの前提
export const MIN_SEATS = 6;
export const MAX_SEATS = 10;
export const NAME_MAX = 20;

export const KINDS = { panel: '審査員', venue: '会場審査員' };

export const DEFAULT_JUDGES = [
  { name: 'KIHARA', kind: 'panel' },
  { name: 'HARADA', kind: 'panel' },
  { name: 'SHIBUTANI', kind: 'panel' },
  { name: 'KIYOSHIMA', kind: 'panel' },
  { name: 'NAKAMURA', kind: 'panel' },
  { name: 'HAMADA', kind: 'panel' },
  { name: '会場審査員1', kind: 'venue' },
  { name: '会場審査員2', kind: 'venue' },
  { name: '会場審査員3', kind: 'venue' },
  { name: '会場審査員4', kind: 'venue' },
];

// RTDB の値 → 席番号順の配列 [{ seat, name, kind }]。
// RTDB は数値キーのオブジェクトを配列で返すことがある（index 0 は空）ので両方を受ける。
// 値が無い・形が壊れているときは初期値を返し、isDefault を立てる。
export function judgesFromValue(val) {
  const list = [];
  if (val && typeof val === 'object') {
    for (let seat = 1; seat <= MAX_SEATS; seat++) {
      const j = val[seat] ?? val[String(seat)];
      if (!j || typeof j.name !== 'string') break;
      list.push({ seat, name: j.name, kind: j.kind in KINDS ? j.kind : 'panel' });
    }
  }
  if (list.length < MIN_SEATS) {
    return { judges: DEFAULT_JUDGES.map((j, i) => ({ seat: i + 1, ...j })), isDefault: true };
  }
  return { judges: list, isDefault: false };
}

// 配列（並び順 = 席番号）→ RTDB に書く値
export function judgesToRecord(list) {
  const rec = {};
  list.forEach((j, i) => { rec[String(i + 1)] = { name: j.name.trim(), kind: j.kind }; });
  return rec;
}

// 保存前の検証。エラーメッセージの配列（空なら OK）
export function validateJudges(list) {
  const errors = [];
  if (list.length < MIN_SEATS || list.length > MAX_SEATS) {
    errors.push(`席の数は ${MIN_SEATS}〜${MAX_SEATS} にしてください（いま ${list.length} 席）`);
  }
  list.forEach((j, i) => {
    const name = j.name.trim();
    if (!name) errors.push(`${i + 1} 番の名前が空です`);
    else if (name.length > NAME_MAX) errors.push(`${i + 1} 番の名前が長すぎます（${NAME_MAX} 文字まで）`);
    if (!(j.kind in KINDS)) errors.push(`${i + 1} 番の種別が不正です`);
  });
  return errors;
}

// お題数（#18）。
// 正は RTDB の settings/odaiCount（整数）。無いときは 6。
// 素材（image_question1..6.png / mp3_question1..6.mp3）が 1〜6 の 6 問分しか無いため、範囲はそこに固定。
// 制約は firebase/database.rules.json と揃えること。

export const ODAI_COUNT_PATH = 'settings/odaiCount';
export const DEFAULT_ODAI_COUNT = 6;
export const MIN_ODAI_COUNT = 1;
export const MAX_ODAI_COUNT = 6; // 素材が 1..6 の 6 問分までのため

export function odaiCountFromValue(val) {
  return Number.isInteger(val) && val >= MIN_ODAI_COUNT && val <= MAX_ODAI_COUNT ? val : DEFAULT_ODAI_COUNT;
}

// IPPON に必要な票数（#79）。
// 正は RTDB の settings/ipponThreshold（整数）。無いときは 6。
// 範囲は 1〜審査員の定員（最大 10）。制約は firebase/database.rules.json と揃えること。

export const THRESHOLD_PATH = 'settings/ipponThreshold';
export const DEFAULT_THRESHOLD = 6;
export const MAX_THRESHOLD = 10;

export function thresholdFromValue(val) {
  return Number.isInteger(val) && val >= 1 && val <= MAX_THRESHOLD ? val : DEFAULT_THRESHOLD;
}

// 票数 → 演出の段階（採点フレーム main_{step}.png と投票音 {step}.mp3 の番号）。
// 素材は 6 段（1〜5 が途中、6 が IPPON 直前の音 / 満タンの枠）なので、
// IPPON 前の票は 1〜5 に割り振り、IPPON の票で 6 にする。threshold が 6 なら票数そのまま。
export function voteStep(votes, threshold) {
  if (votes <= 0) return 0;
  if (votes >= threshold) return 6;
  if (threshold <= 2) return 5;
  return Math.max(1, Math.min(5, Math.round(votes * 5 / (threshold - 1))));
}

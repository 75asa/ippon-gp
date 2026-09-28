// HOST の状態遷移をまとめた純粋関数（#22）。
// 従来は「remove(agenda) → set(odai,n) → remove(votes) → set(mode,'odai')」のように
// 1 遷移で複数キーを順番にバラバラの書き込みで送っていたため、
// HOST 側の agenda リスナー（remove(agenda) を検知して previousMode に戻す）が
// 割り込んで新しい mode を巻き戻すことがあった（既知の競合、docs/ARCHITECTURE.md §3.1）。
//
// ここでは「1 遷移 = 1 つのパッチオブジェクト」として、影響するキーをすべて列挙する。
// 呼び出し側（web/host/index.html）は `update(ref(db), modeUpdates(action, payload))` の
// ように Firebase の複数パス update() に渡し、1 回のアトミックな書き込みにする。
// 値が null のキーは update() の仕様どおり「削除」を意味する。
//
// mode の取りうる値は firebase/database.rules.json の enum と揃える。
import { MAX_ODAI_COUNT } from './odai.js';

export const MODES = ['taiki', 'odai', 'saiten', 'scoreboard', 'agenda'];

export const MODE_ACTIONS = ['taiki', 'odai', 'saiten', 'scoreboard', 'resetVotes', 'agendaClear'];

// n: お題番号（'odai' のときだけ必須）。max: お題数の設定（settings/odaiCount、省略時は素材がある 6）。
// ルールも同じ上限で odai を拒否するので、範囲外を書いて遷移全体（1 回の update）が失敗しないよう、ここで弾く
export function modeUpdates(action, payload = {}) {
  switch (action) {
    case 'taiki':
      // 待機モード。前の問の残骸（agenda/answer_text/votes/revealed/odai）を片付けて taiki 画像を出す
      return {
        agenda: null,
        answer_text: null,
        votes: null,
        revealed: null,
        taiki: true,
        odai: null,
        mode: 'taiki',
      };

    case 'saiten':
      // 採点モード。OP動画等の音声を採点モード切替の間だけ止めない（keep_audio、§3.1 の既知タイミングハック）。
      // 2 秒後に呼び出し側が keep_audio を消す（従来どおり据え置き。理由は PR 参照）
      return {
        keep_audio: true,
        agenda: null,
        answer_text: null,
        odai: null,
        taiki: null,
        votes: null,
        revealed: null,
        mode: 'saiten',
      };

    case 'scoreboard':
      // 結果モード（スコアボード）
      return {
        agenda: null,
        answer_text: null,
        odai: null,
        taiki: null,
        votes: null,
        revealed: null,
        mode: 'scoreboard',
      };

    case 'odai': {
      const n = payload.n;
      const max = payload.max ?? MAX_ODAI_COUNT;
      if (!Number.isInteger(n) || n < 1 || n > max) {
        throw new Error(`modeUpdates(odai): n must be an integer 1..${max}, got ${n}`);
      }
      return {
        agenda: null,
        answer_text: null,
        taiki: null,
        odai: n,
        votes: null,
        revealed: false,
        mode: 'odai',
      };
    }

    case 'resetVotes':
      // 投票をリセット（モードは変えない）
      return {
        votes: null,
        revealed: false,
      };

    case 'agendaClear':
      // 投影中のアジェンダだけ止める（mode は変えない。次の遷移で上書きされる）
      return {
        agenda: null,
      };

    default:
      throw new Error('modeUpdates: unknown action ' + action);
  }
}

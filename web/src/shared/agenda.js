// HOST の agenda 監視リスナーの判断をまとめた純粋関数（#22 のフォローアップ）。
//
// `agenda`（HOST が投影する画像/動画の URL）が「値あり→無し」に変わったとき、HOST がすべきことは
// 状況によって違う:
//   - MAIN 側の自動終了（OP動画などが最後まで再生された） → previousMode に戻し、見た目もリセット
//   - HOST が明示的に停止/離脱した（差し替え無し）        → previousMode には戻さないが、見た目はリセット
//   - HOST が別の agenda 項目に切り替え中（動画↔動画、画像→動画など）
//     → この直後に新しい agenda 値を書くので、currentAgendaKey・ボタン表示は
//       呼び出し側（web/host/index.html の toggleAgendaVideo）がすでに更新済み。
//       ここで見た目をリセットすると、切替先のボタンが「■ 再生中」のまま
//       内部状態だけ null に戻ってしまい、次に押したときに停止できず再生し直してしまう
//       （PR #92 レビューで見つかった回帰）。
//
// hostInitiated / replacing の 2 つの事実だけで決まるようにし、呼び出し側に
// 「どのケースか」を推測させない（推測がバグの原因だった）。
export function agendaClearAction({ hostInitiated, replacing }) {
  if (!hostInitiated) {
    // MAIN 側の自動終了（またはHOSTが何も指示していない = 想定外の削除）。安全側に倒して両方リセットする
    return { resetCurrentKey: true, resetButtons: true, restoreMode: true };
  }
  if (replacing) {
    // HOSTが別の agenda 項目に切り替え中。何もしない（呼び出し側がすでに管理している）
    return { resetCurrentKey: false, resetButtons: false, restoreMode: false };
  }
  // HOSTが明示的に停止 or agendaモードから離脱した（差し替え無し）
  return { resetCurrentKey: true, resetButtons: true, restoreMode: false };
}

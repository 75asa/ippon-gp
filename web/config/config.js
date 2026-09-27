// 環境ごとの設定。各画面（index 以外）が <head> で読み込みます。
// 自分のイベントで使う場合はこのファイルだけを自分の Firebase プロジェクトの値に書き換えてください
// （Firebase の Web API キーは公開前提の識別子で、秘密情報ではありません。アクセス制御は RTDB / Storage のルールで行います）。
// ひな形: config.example.js
window.IPPON_CONFIG = {
  firebase: {
    apiKey: "AIzaSyB2z2bmt99MBu2tqRJbAQqTRkM0cImnZp0",
    authDomain: "song-ogiri-gp.firebaseapp.com",
    databaseURL: "https://song-ogiri-gp-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "song-ogiri-gp",
    storageBucket: "song-ogiri-gp.firebasestorage.app",
    messagingSenderId: "286637315309",
    appId: "1:286637315309:web:2747142f5166b1e56ce8e4"
  },
  // Firebase Storage のオブジェクト URL のベース。末尾は "/o/" で終わること
  storageBase: "https://firebasestorage.googleapis.com/v0/b/song-ogiri-gp.firebasestorage.app/o/",
  // CAM → MAIN の映像設定（任意。省略時は 1080p / 30fps / 6Mbps 上限 / 解像度優先）
  camera: {
    width: 1920, height: 1080, frameRate: 30,
    maxBitrate: 6000000,
    degradationPreference: "maintain-resolution",  // 帯域不足時に fps を落として解像度を守る。"balanced" / "maintain-framerate"
    contentHint: "detail",                          // 顔のアップ = 精細さ優先。動きが多いなら "motion"
  },
};

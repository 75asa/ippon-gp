// config.js のひな形。自分の Firebase プロジェクトの値に置き換えて config.js として保存してください。
// Firebase コンソール → プロジェクトの設定 → マイアプリ → SDK の設定と構成 からコピーできます。
window.IPPON_CONFIG = {
  firebase: {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    databaseURL: "https://YOUR_PROJECT-default-rtdb.REGION.firebasedatabase.app",
    projectId: "YOUR_PROJECT",
    storageBucket: "YOUR_PROJECT.firebasestorage.app",
    messagingSenderId: "000000000000",
    appId: "1:000000000000:web:xxxxxxxxxxxxxxxx"
  },
  // Firebase Storage のオブジェクト URL のベース。末尾は "/o/" で終わること
  storageBase: "https://firebasestorage.googleapis.com/v0/b/YOUR_PROJECT.firebasestorage.app/o/",
  // CAM → MAIN の映像設定（任意。省略時は 1080p / 30fps / H.264 / 開始 3Mbps・上限 6Mbps / 解像度優先）
  camera: {
    width: 1920, height: 1080, frameRate: 30,
    maxBitrate: 6000000,
    startBitrate: 3000000,                          // 接続直後の開始ビットレート（既定の 300kbps 前後から始めない）
    preferredCodec: "H264",                         // スマホのハードウェアエンコーダが使える。映らない端末があれば "VP8"
    degradationPreference: "maintain-resolution",  // 帯域不足時に fps を落として解像度を守る。"balanced" / "maintain-framerate"
    contentHint: "detail",                          // 顔のアップ = 精細さ優先。動きが多いなら "motion"
  },
};

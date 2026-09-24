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
  // CAM → MAIN の映像設定（任意。省略時は 1080p / 30fps / 6Mbps 上限 / 解像度優先）
  camera: {
    width: 1920, height: 1080, frameRate: 30,
    maxBitrate: 6000000,
    degradationPreference: "maintain-resolution",  // 帯域不足時に fps を落として解像度を守る。"balanced" / "maintain-framerate"
    contentHint: "detail",                          // 顔のアップ = 精細さ優先。動きが多いなら "motion"
  },
  storageBase: "https://firebasestorage.googleapis.com/v0/b/YOUR_PROJECT.firebasestorage.app/o/",
};

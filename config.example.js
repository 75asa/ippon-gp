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
};

// 環境ごとの設定。各画面（index 以外）が <head> で読み込みます。
// 自分のイベントで使う場合はこのファイルだけを自分の Firebase プロジェクトの値に書き換えてください
// （Firebase の Web API キーは公開前提の識別子で、秘密情報ではありません。アクセス制御は RTDB / Storage のルールで行います）。
// ひな形: config.example.js
window.IPPON_CONFIG = {
  firebase: {
    apiKey: "AIzaSyC-mISssQxyO67vl3JxbbBktqXoDvmGLdk",
    authDomain: "song-fes-ippon-gp.firebaseapp.com",
    databaseURL: "https://song-fes-ippon-gp-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "song-fes-ippon-gp",
    storageBucket: "song-fes-ippon-gp.firebasestorage.app",
    messagingSenderId: "727959135173",
    appId: "1:727959135173:web:5d983f22d1164a11a6e1ac"
  },
  // Firebase Storage のオブジェクト URL のベース。末尾は "/o/" で終わること
  storageBase: "https://firebasestorage.googleapis.com/v0/b/song-fes-ippon-gp.firebasestorage.app/o/",
};

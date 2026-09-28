// Firebase JS SDK の読み込み口（#15）。バージョンはここ 1 箇所で管理する。
// gstatic の ES Modules は SRI を付けられないので、URL（バージョン）を固定して各画面はこのモジュール経由で import する。
// 上げるときは、下の 2 行のバージョンを揃えて書き換える。
export * from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js';
export * from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-database.js';

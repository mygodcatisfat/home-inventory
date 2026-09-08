/* =========================================================
   開機腳本：必須在任何 CSS 之前同步執行

   為什麼獨立成外部檔案而不是內嵌在 index.html：
   內嵌 script 會逼 CSP 開放 script-src 'unsafe-inline'，
   那等於讓 CSP 對 XSS 幾乎失去防護力。搬出來之後就能鎖成 'self'。
   ========================================================= */

(function () {
  /* ---- 主題：避免載入時閃爍（FOUC） ----
     localStorage 存取單獨包 try/catch：讀不到偏好時要能優雅退回
     「跟隨系統」，而不是連帶跳過設定 data-theme 這件事本身。 */
  var pref = null;
  try { pref = localStorage.getItem('theme'); } catch (e) { /* 環境禁用 storage */ }
  var dark = pref ? pref === 'dark'
                  : window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
})();

/* ---- 停用畫面縮放 ----
   iOS Safari 從 iOS 10 起刻意忽略 viewport 的 user-scalable=no，
   必須另外攔截 WebKit 專屬的 gesture 事件才擋得住雙指縮放。
   立體圖的雙指縮放走的是 Pointer Events，不受影響。

   雙擊縮放不用 CSS 的 touch-action 擋：把它設在 html 根元素上
   會干擾 WebKit 的原生捲動合成，導致 sticky 頁首與內容對不齊。
   改成偵測「兩次點擊間隔小於 300ms 就視為雙擊」，只攔截該手勢本身。 */
['gesturestart', 'gesturechange', 'gestureend'].forEach(function (t) {
  document.addEventListener(t, function (e) { e.preventDefault(); }, { passive: false });
});

(function () {
  var lastTouchEnd = 0;
  document.addEventListener('touchend', function (e) {
    var now = Date.now();
    if (now - lastTouchEnd <= 300) e.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });
})();

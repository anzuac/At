// loader.js — 同步順序載入 + 載完後補發初始化事件
(function () {
  if (!window.MANIFEST || !Array.isArray(window.MANIFEST.scripts)) {
    alert('[loader] MANIFEST 未定義或格式錯誤'); return;
  }

  const ver = (typeof window.LOADER_VER === 'number' || typeof window.LOADER_VER === 'string') ? String(window.LOADER_VER) : '';
  const withVer = (src) => ver ? `${src}?v=${encodeURIComponent(ver)}` : src;

  function loadOne(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = withVer(src);
      s.async = false;
      s.onload  = () => {
        console.log(`[loader] 載入成功: ${src}`);
        resolve(src);
      };
      s.onerror = () => {
        const errorMsg = `載入失敗：${src}`;
        console.error(`[loader] ${errorMsg}`);
        reject(new Error(errorMsg));
      };
      document.head.appendChild(s);
    });
  }

  async function loadAll(list) {
    try {
      for (const src of list) {
        await loadOne(src);
      }
      console.log('[loader] 所有檔案載入完成。');

      // 所有腳本載入完成後，手動觸發 DOMContentLoaded 事件
      // 這能確保那些依賴此事件的初始化程式碼能夠被執行
      try {
        console.log('[loader] 正在手動觸發 DOMContentLoaded 事件...');
        document.dispatchEvent(new Event('DOMContentLoaded', {
          bubbles: true,
          cancelable: true
        }));
      } catch (e) {
        console.error('[loader] 手動觸發事件失敗:', e);
      }

      console.log('[loader] 載入流程結束，請檢查遊戲是否已正常啟動。');

    } catch (err) {
      alert(err.message);
    }
  }

  loadAll(window.MANIFEST.scripts);
})();

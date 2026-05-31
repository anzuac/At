// dev/dev_tools.js — 開發者專用：一鍵清除所有儲存與快取（ES2020+）
(function(){
  const DEV_TOOL_VISIBLE = true;

  // === 主功能：完全清除所有儲存與快取 ===
  function clearAllStorage() {
    try { localStorage.clear(); } catch(e) { console.warn("localStorage 清除失敗", e); }
    try { sessionStorage.clear(); } catch(e) { console.warn("sessionStorage 清除失敗", e); }

    // IndexedDB
    if (window.indexedDB && typeof indexedDB.databases === "function") {
      indexedDB.databases().then((dbs) =>{
        dbs.forEach((db) =>{
          try { indexedDB.deleteDatabase(db.name); } catch(e) { console.warn("IndexedDB 刪除失敗", e); }
        });
      }).catch((e) =>{ console.warn("indexedDB.databases() 失敗", e); });
    } else if (window.indexedDB) {
      // 舊版瀏覽器無法列舉，只嘗試刪一個常見命名
      try { indexedDB.deleteDatabase("GAME_SAVE_V2"); } catch(e){}
    }

    // Cache Storage (Service Worker)
    if (window.caches && typeof caches.keys === "function") {
      caches.keys().then((keys) =>{
        keys.forEach((k) =>{ caches.delete(k); });
      });
    }

    // 若有遊戲特定清理
    try {
      if (typeof window.clearSave === "function") window.clearSave();
      if (typeof window.resetAllSystems === "function") window.resetAllSystems();
    } catch(e) {}

    console.log("🧹 已清除所有儲存與快取。3 秒後自動重新整理。");
    alert("🧹 已清除所有儲存與快取。\n頁面將自動重新整理。");

    setTimeout(() =>{ location.reload(true); }, 1000);
  }

  // Console 可呼叫
  window.__DEV_CLEAR_SAVES = clearAllStorage;

  // === UI 按鈕 ===
  function mountButton(){
    if (!DEV_TOOL_VISIBLE) return;
    if (document.getElementById("__devClearBtn")) return;

    const btn = document.createElement("button");
    btn.id = "__devClearBtn";
    btn.textContent = "🧹清除所有存檔";
    btn.title = "清空所有儲存、快取與資料庫，並重新整理";
    btn.onclick = function(){
      const ok = confirm("⚠️ 確定要清除所有存檔與快取？\n（包括 localStorage、sessionStorage、IndexedDB、CacheStorage）");
      if (ok) clearAllStorage();
    };
    btn.style.position = "fixed";
    btn.style.right = "10px";
    btn.style.bottom = "10px";
    btn.style.zIndex = "100000";
    btn.style.border = "none";
    btn.style.borderRadius = "8px";
    btn.style.padding = "8px 14px";
    btn.style.background = "#e53935";
    btn.style.color = "#fff";
    btn.style.fontSize = "13px";
    btn.style.fontWeight = "600";
    btn.style.cursor = "pointer";
    btn.style.opacity = "0.9";
    btn.style.boxShadow = "0 2px 6px rgba(0,0,0,0.2)";
    btn.onmouseenter = function(){ btn.style.opacity = "1"; };
    btn.onmouseleave = function(){ btn.style.opacity = "0.9"; };

    document.body.appendChild(btn);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountButton);
  } else {
    mountButton();
  }
})();
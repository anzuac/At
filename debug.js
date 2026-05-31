// ===== Debug 控制（放在 main.js
//window.DEBUG_MODE = false; // 測試時 true, 上線時改 false最上面，且要先於其它腳本載入）=====
window.DEBUG_MODE = true; // 發佈改成 false 就全靜音
// 只允許有標籤的訊息印出（例：[EqBonus]、[Skills]、[SaveLoad]）
window.DEBUG_ALLOW = new Set(["EqBonus", "Skills", "SaveLoad"]);

// 包一層過濾 console.log/info/warn
(function () {
  const wrap = (orig) => function (...args) {
    if (!window.DEBUG_MODE) return;                 // 全關
    if (args.length && typeof args[0] === "string") {
      const m = args[0].match(/^\[(\w+)\]/);        // 抓 [Tag]
      if (m && !window.DEBUG_ALLOW.has(m[1])) return; // 不在白名單就不印
    }
    return orig.apply(this, args);
  };
  console.log  = wrap(console.log);
  console.info = wrap(console.info);
  console.warn = wrap(console.warn);
})();
// ======================================================
// stock_hub.js — 股票中心完整修正版（TAB單行滑動版）
// ======================================================
(function(w) {
  "use strict";

  const _tabs = [];
  let _activeId = null;
  let _modal = null;
  let _body = null;
  let _tabBar = null;

  let _rerenderPending = false;
  let _progSwitchEnabled = false;

  // 邏輯 / 畫面更新定時器
  let _logicTimer = null;
  let _renderTimer = null;

  // 邏輯每秒更新一次
  const LOGIC_INTERVAL_MS = 1000;

  // 畫面每秒更新一次
  const RENDER_INTERVAL_MS = 1000;

  function getTab(id) {
    for (let i = 0; i < _tabs.length; i++) {
      if (_tabs[i].id === id) return _tabs[i];
    }
    return null;
  }

  function renderActive(force) {

    if (!_body) return;

    const cur = getTab(_activeId);

    if (!cur) return;

    const currentOwner =
      _body.getAttribute(
        "data-tab-owner"
      );

    // 非強制更新時優先 update()
    if (
      !force &&
      currentOwner === String(cur.id)
    ) {

      if (
        typeof cur.update === "function"
      ) {

        try {

          cur.update(_body);

        } catch (e) {

          console.error(
            "StockHub update error:",
            e
          );

        }

        return;
      }

      // fallback render()
      try {

        cur.render(_body);

      } catch (e) {

        console.error(
          "StockHub render fallback error:",
          e
        );

      }

      return;
    }

    // 強制 render
    _body.innerHTML = "";

    _body.setAttribute(
      "data-tab-owner",
      String(cur.id || "")
    );

    try {

      cur.render(_body);

    } catch (e) {

      console.error(
        "StockHub render error:",
        e
      );

      _body.innerHTML =
        '<div style="color:red;padding:20px;">渲染發生錯誤: ' +
        (e && e.message
          ? e.message
          : e) +
        "</div>";
    }
  }

  function switchTo(id, force) {

    if (
      !force &&
      !_progSwitchEnabled
    ) return;

    const cur = getTab(id);

    if (!cur) return;

    if (
      _activeId === id &&
      !force
    ) return;

    const old = getTab(_activeId);

    if (
      old &&
      typeof old.onClose === "function"
    ) {

      try {

        old.onClose();

      } catch (_) {}
    }

    _activeId = id;

    renderActive(true);

    if (
      cur &&
      typeof cur.onOpen === "function"
    ) {

      try {

        cur.onOpen();

      } catch (_) {}
    }

    rebuildTabBar();
  }

  function ensureModal() {

    if (_modal) return;

    // =========================================
    // TAB Scroll Style
    // =========================================
    if (
      !document.getElementById(
        "stockHubScrollStyle"
      )
    ) {

      const style =
        document.createElement("style");

      style.id =
        "stockHubScrollStyle";

      style.innerHTML = `

      .stockhub-tabs-scroll{
        scrollbar-width:none;
        -ms-overflow-style:none;
      }

      .stockhub-tabs-scroll::-webkit-scrollbar{
        display:none;
      }

      .stockhub-tabs-scroll button{
        flex:0 0 auto;
        white-space:nowrap;
      }

      `;

      document.head.appendChild(style);
    }

    const m =
      document.createElement("div");

    m.id = "stockHubModal";

    m.style.cssText =
      "position:fixed;" +
      "inset:0;" +
      "display:none;" +
      "align-items:center;" +
      "justify-content:center;" +
      "background:rgba(0,0,0,.7);" +
      "z-index:9999;" +
      "padding:12px;";

    const wrap =
      document.createElement("div");

    wrap.style.cssText =
      "width:min(960px,96vw);" +
      "max-height:92vh;" +
      "overflow:hidden;" +
      "background:#0b1220;" +
      "color:#e5e7eb;" +
      "border:1px solid #334155;" +
      "border-radius:14px;" +
      "box-shadow:0 12px 36px rgba(0,0,0,.5);" +
      "font-family:system-ui,sans-serif;" +
      "display:flex;" +
      "flex-direction:column;";

    // =========================================
    // Header
    // =========================================
    const head =
      document.createElement("div");

    head.style.cssText =
      "background:linear-gradient(90deg,#0f172a,#111827);" +
      "padding:12px 16px;" +
      "border-bottom:1px solid #334155;" +
      "display:flex;" +
      "align-items:center;" +
      "justify-content:space-between;";

    head.innerHTML =

      '<div style="display:flex;align-items:center;gap:14px;">' +

        '<div style="font-weight:800;font-size:1.15rem;letter-spacing:.5px;">索蘭德金融</div>' +

        '<div id="stockHubMarketStatus" style="' +
          'font-size:12px;' +
          'font-weight:900;' +
          'padding:4px 10px;' +
          'border-radius:999px;' +
          'background:#1e293b;' +
          'color:#cbd5e1;' +
          'border:1px solid #334155;' +
          'white-space:nowrap;' +
        '">' +

          '讀取中...' +

        '</div>' +

      '</div>' +

      '<button id="stockHubClose" style="' +
        'background:#ef4444;' +
        'color:#fff;' +
        'border:0;' +
        'padding:6px 12px;' +
        'border-radius:6px;' +
        'cursor:pointer;' +
        'font-weight:bold;' +
      '">✖</button>';

    // =========================================
    // Tabs
    // =========================================
    const tabs =
      document.createElement("div");

    tabs.id = "stockHubTabs";

    tabs.className =
      "stockhub-tabs-scroll";

    tabs.style.cssText =
      "display:flex;" +
      "gap:8px;" +
      "padding:10px 12px;" +
      "background:#07101d;" +
      "border-bottom:1px solid #1f2937;" +
      "flex-wrap:nowrap;" +
      "overflow-x:auto;" +

      "overflow-y:hidden;" +
      "-webkit-overflow-scrolling:touch;";


// =========================================
// Desktop Drag Scroll
// =========================================
let isDown = false;
let startX;
let scrollLeft;

tabs.addEventListener("mousedown", (e) => {
  isDown = true;
  startX = e.pageX - tabs.offsetLeft;
  scrollLeft = tabs.scrollLeft;
  tabs.style.cursor = "grabbing";
});

tabs.addEventListener("mouseleave", () => {
  isDown = false;
  tabs.style.cursor = "grab";
});

tabs.addEventListener("mouseup", () => {
  isDown = false;
  tabs.style.cursor = "grab";
});

tabs.addEventListener("mousemove", (e) => {
  if (!isDown) return;

  e.preventDefault();

  const x = e.pageX - tabs.offsetLeft;
  const walk = (x - startX) * 1.5;

  tabs.scrollLeft = scrollLeft - walk;
});

tabs.style.cursor = "grab";


    // =========================================
    // Body
    // =========================================
    const body =
      document.createElement("div");

    body.id = "stockHubBody";

    body.style.cssText =
      "padding:16px;" +
      "overflow-y:auto;" +
      "flex:1;" +
      "background:#0b1220;" +
      "-webkit-overflow-scrolling:touch;";

    wrap.appendChild(head);
    wrap.appendChild(tabs);
    wrap.appendChild(body);

    m.appendChild(wrap);

    document.body.appendChild(m);

    _modal = m;
    _body = body;
    _tabBar = tabs;

    document.getElementById(
      "stockHubClose"
    ).onclick = close;

    m.onclick = function(e) {

      if (e.target === m) {

        close();
      }
    };
  }

  function updateMarketStatus() {

    const el =
      document.getElementById(
        "stockHubMarketStatus"
      );

    if (!el) return;

    const state =
      w.StockStateManager &&
      w.StockStateManager.getState
        ? w.StockStateManager.getState()
        : null;

    if (!state) {

      el.textContent =
        "市場資料缺失";

      return;
    }

    const engine =
      w.StockMarketEngine || {};

    const phase =
      String(
        state.marketPhase || ""
      );

    const elapsed =
      Math.max(
        0,
        Math.floor(
          Number(
            state.phaseElapsedSec || 0
          )
        )
      );

    const PREOPEN_SEC =
      Number(
        engine.MARKET_PREOPEN_SEC || 5
      );

    const OPEN_SEC =
      Number(
        engine.MARKET_OPEN_SEC || 10
      );

    const CLOSED_SEC =
      Number(
        engine.MARKET_CLOSE_SEC || 5
      );

    let totalSec = 0;

    if (phase === "preopen") {

      totalSec = PREOPEN_SEC;

    } else if (phase === "open") {

      totalSec = OPEN_SEC;

    } else {

      totalSec = CLOSED_SEC;
    }

    const remain =
      Math.max(
        0,
        totalSec - elapsed
      );

    const min =
      Math.floor(remain / 60);

    const sec =
      remain % 60;

    const timeText =
      String(min).padStart(2, "0") +
      ":" +
      String(sec).padStart(2, "0");

    if (phase === "preopen") {

      el.style.background =
        "#3f2a04";

      el.style.borderColor =
        "#92400e";

      el.style.color =
        "#facc15";

      el.innerHTML =
        "🟡 撮合中　⏳ " +
        timeText;

      return;
    }

    if (phase === "open") {

      el.style.background =
        "#052e16";

      el.style.borderColor =
        "#166534";

      el.style.color =
        "#4ade80";

      el.innerHTML =
        "🟢 開盤中　⏳ " +
        timeText;

      return;
    }

    el.style.background =
      "#3f1d1d";

    el.style.borderColor =
      "#7f1d1d";

    el.style.color =
      "#fca5a5";

    el.innerHTML =
      "🔴 休市中　⏳ " +
      timeText;
  }

  function rebuildTabBar() {

    if (!_modal) {

      ensureModal();
    }

    _tabBar.innerHTML = "";

    for (
      let i = 0;
      i < _tabs.length;
      i++
    ) {

      (function(def) {

        const btn =
          document.createElement(
            "button"
          );

        btn.textContent =
          def.title;

        const isActive =
          _activeId === def.id;

        btn.style.cssText =

          "flex:0 0 auto;" +
          "white-space:nowrap;" +
          "background:" +
          (isActive
            ? "#16a34a"
            : "#334155") +
          ";" +

          "color:#fff;" +
          "border:0;" +
          "padding:8px 16px;" +
          "border-radius:8px;" +
          "cursor:pointer;" +
          "transition:background 0.2s;" +
          "font-weight:600;";

        btn.onmouseenter =
          function() {

            if (
              _activeId !== def.id
            ) {

              btn.style.background =
                "#475569";
            }
          };

        btn.onmouseleave =
          function() {

            if (
              _activeId !== def.id
            ) {

              btn.style.background =
                "#334155";
            }
          };

        btn.onclick =
          function() {

            switchTo(
              def.id,
              true
            );
          };

        _tabBar.appendChild(btn);

      })(_tabs[i]);
    }
  }

  function registerTab(def) {

    if (
      !def ||
      !def.id ||
      !def.title
    ) return;

    for (
      let i = 0;
      i < _tabs.length;
      i++
    ) {

      if (
        _tabs[i].id === def.id
      ) {

        _tabs[i] = def;

        if (
          _activeId === def.id
        ) {

          _rerenderPending =
            true;
        }

        rebuildTabBar();

        return;
      }
    }

    _tabs.push(def);

    if (!_activeId) {

      _activeId = def.id;
    }

    rebuildTabBar();
  }

  function open() {

    ensureModal();

    _modal.style.display =
      "flex";

    rebuildTabBar();

    renderActive(true);
  }

  function close() {

    if (_modal) {

      _modal.style.display =
        "none";
    }

    const t =
      getTab(_activeId);

    if (
      t &&
      typeof t.onClose ===
        "function"
    ) {

      try {

        t.onClose();

      } catch (_) {}
    }
  }

  function runLogicTick() {

    for (
      let i = 0;
      i < _tabs.length;
      i++
    ) {

      if (
        _tabs[i] &&
        typeof _tabs[i].tick ===
          "function"
      ) {

        try {

          _tabs[i].tick(1);

        } catch (e) {

          console.error(
            "StockHub tick error:",
            e
          );
        }
      }
    }
  }

  function runRenderTick() {

    if (!_modal) return;

    if (
      (_modal.style.display ===
        "flex") ||
      _rerenderPending
    ) {

      updateMarketStatus();

      const cur =
        getTab(_activeId);

      if (cur) {

        if (_rerenderPending) {

          renderActive(true);

        } else {

          renderActive(false);
        }
      }

      _rerenderPending = false;
    }
  }

  function stopLoops() {

    if (_logicTimer) {

      clearInterval(
        _logicTimer
      );

      _logicTimer = null;
    }

    if (_renderTimer) {

      clearInterval(
        _renderTimer
      );

      _renderTimer = null;
    }
  }

  function startLoops() {

    stopLoops();

    _logicTimer =
      setInterval(
        () => {

          runLogicTick();

        },
        LOGIC_INTERVAL_MS
      );

    _renderTimer =
      setInterval(
        () => {

          runRenderTick();

        },
        RENDER_INTERVAL_MS
      );
  }

  function init() {

    ensureModal();

    startLoops();
  }

  if (
    document.readyState ===
    "loading"
  ) {

    document.addEventListener(
      "DOMContentLoaded",
      init
    );

  } else {

    init();
  }

  w.StockHub = {

    open,

    close,

    registerTab,

    enableProgrammaticSwitch(on) {

        _progSwitchEnabled =
          !!on;
      },

    switchTo,

    requestRerender() {

        _rerenderPending =
          true;
      },

    getActiveId() {

        return _activeId;
      },

    restartLoops() {

        startLoops();
      },

    stopLoops() {

        stopLoops();
      }
  };

})(window);
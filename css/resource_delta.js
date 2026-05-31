// ui/resource_bind.js
// Reactive player.gold/gem/stone
// - 數值變動會更新 UI + 閃爍特效
// - 可選 +/− 浮字（依資源上色）
// - 可選音效（依資源播放）
// - 提供開關與自訂設定 API

(function () {
  const FORMAT = n => Number(n ?? 0).toLocaleString();

  // ===== 顏色設定 =====
  const COLORS = {
    incDefault: "#7fff8a", // 正數預設色
    dec: "#ff7c7c",        // 負數色
    perResource: {
      gold:  "#ffd95e",
      gem:   "#7de9ff",
      stone: "#d1d5db"
    }
  };

  // ===== 音效設定 =====
  const SOUNDS = {
    gold:  "https://assets.mixkit.co/sfx/preview/mixkit-coin-win-1998.mp3",    // 你可以換成自己檔案路徑
    gem:   "audio/gem.mp3",
    stone: "audio/stone.mp3",
    gain:  "audio/gain.mp3",    // 泛用加
    loss:  "audio/loss.mp3"     // 泛用減
  };

  let RB_ENABLED = true;      // 閃爍開關
  let FLOAT_ENABLED = true;   // 浮字開關
  let SOUND_ENABLED = true;   // 音效開關

  // ======= 音效播放 =======
  function playSound(resourceKey, diff) {
    if (!SOUND_ENABLED) return;
    let path = null;

    // 優先資源專屬音效
    if (SOUNDS[resourceKey]) path = SOUNDS[resourceKey];
    else path = diff >= 0 ? SOUNDS.gain : SOUNDS.loss;

    if (!path) return;

    try {
      const audio = new Audio(path);
      audio.volume = 0.4;       // 調整音量
      audio.play().catch(()=>{}); // 忽略靜音環境錯誤
    } catch (e) {
      console.warn("[ResourceBinder] 音效播放失敗:", e);
    }
  }

  // ======= 閃爍動畫 =======
  function flash(el) {
    if (!el || !RB_ENABLED) return;
    el.classList.remove("res-change-fx");
    requestAnimationFrame(() => {
      el.classList.add("res-change-fx");
      el.addEventListener("animationend", () => {
        el.classList.remove("res-change-fx");
      }, { once: true });
    });
  }

  // ======= 浮出數字 =======
  function floatDelta(el, diff, resourceKey) {
    if (!FLOAT_ENABLED || !el || !diff) return;

    const rect = el.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top;

    const badge = document.createElement("div");
    badge.className = "res-float" + (diff < 0 ? " loss" : "");
    const sign = diff >= 0 ? "+" : "";
    badge.textContent = sign + Math.abs(diff).toLocaleString();

    if (diff >= 0) {
      badge.style.color =
        (COLORS.perResource && COLORS.perResource[resourceKey]) ||
        COLORS.incDefault;
    } else {
      badge.style.color = COLORS.dec;
    }

    badge.style.left = x + "px";
    badge.style.top = (y - 2) + "px";
    document.body.appendChild(badge);
    badge.addEventListener("animationend", () => badge.remove(), { once: true });
  }

  // ======= 綁定 Player 屬性 =======
  function bindOne(playerObj, key, domId) {
    const el = document.getElementById(domId);
    const hiddenKey = `__${key}`;
    playerObj[hiddenKey] = typeof playerObj[key] === "number" ? playerObj[key] : 0;

    Object.defineProperty(playerObj, key, {
      get() { return playerObj[hiddenKey]; },
      set(v) {
        const prev = playerObj[hiddenKey];
        const nv = Number(v) || 0;
        if (nv === prev) return;

        playerObj[hiddenKey] = nv;

        if (el) {
          el.textContent = FORMAT(nv);
          flash(el);
          floatDelta(el, nv - prev, key);
        }

        // ✅ 播放音效
        playSound(key, nv - prev);
      },
      configurable: true,
      enumerable: true
    });

    if (el) el.textContent = FORMAT(playerObj[hiddenKey]);
  }

  function bindPlayerResources(
    playerObj,
    idMap = { gold: "gold", gem: "gem", stone: "stone" }
  ) {
    for (const [key, domId] of Object.entries(idMap)) {
      if (key in playerObj) bindOne(playerObj, key, domId);
    }
  }

  // ======= 對外 API =======
  window.ResourceBinder = {
    bindPlayerResources,
    setEnabled(flag) { RB_ENABLED = !!flag; },
    setFloatEnabled(flag) { FLOAT_ENABLED = !!flag; },
    setSoundEnabled(flag) { SOUND_ENABLED = !!flag; },

    // 手動顯示 +/− 浮字
    showDelta(idOrEl, delta, resourceKey) {
      const el = typeof idOrEl === "string" ? document.getElementById(idOrEl) : idOrEl;
      if (!el) return;
      floatDelta(el, Number(delta), resourceKey);
      playSound(resourceKey, delta);
    },

    // 自訂顏色
    setColors(newColors = {}) {
      if (newColors.incDefault) COLORS.incDefault = newColors.incDefault;
      if (newColors.dec) COLORS.dec = newColors.dec;
      if (newColors.perResource) {
        COLORS.perResource = { ...COLORS.perResource, ...newColors.perResource };
      }
    },

    // 自訂音效路徑
    setSounds(newSounds = {}) {
      Object.assign(SOUNDS, newSounds);
    },

    getColors() { return JSON.parse(JSON.stringify(COLORS)); },
    getSounds() { return JSON.parse(JSON.stringify(SOUNDS)); }
  };
})();


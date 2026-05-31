// save_core.js — 只使用 SaveHub 的核心存檔（無單槽 / 無舊版遷移）
(() => {
  "use strict";

  // ===== SaveHub 內的 namespace =====
  // 最終存檔位置會在 localStorage key "43536" 裡的 data.playerCore
  const HUB_NS = "-37（2";

  // 存檔節流（避免每一點小變動都寫檔）
  const SAVE_MIN_INTERVAL_MS = 1500;   // 兩次存檔至少間隔 1.5 秒
  const FLUSH_TIMEOUT_MS     = 3000;   // 最久 3 秒內一定會寫一次

  let savePending = false;
  let lastSaveAt  = 0;
  let flushTimer  = null;

  const BOOT_TS = Date.now();
  function bootBusy(){ return (Date.now() - BOOT_TS) < 2000; }
  function now(){ return Date.now(); }

  // ===== 存檔內容組裝：把目前 player 狀態組成一個純物件 =====
  function buildSaveState() {
    if (typeof player === "undefined" || !player) return null;

    return {
      savedAt: now(),

      // 基本資訊
      nickname: player.nickname ?? "",
      job:      player.job ?? "",

      // 等級/資源
      level:      Number(player.level)      || 1,
      exp:        Number(player.exp)        || 0,
      statPoints: Number(player.statPoints) || 0,
      gold:       Number(player.gold)       || 0,
      gem:        Number(player.gem)        || 0,
      stone:      Number(player.stone)      || 0,

      // 基礎能力值
      baseStats: {
        hp:  Number(player.baseStats?.hp)  || 100,
        atk: Number(player.baseStats?.atk) || 10,
        def: Number(player.baseStats?.def) || 5,
        mp:  Number(player.baseStats?.mp)  || 0,
        str: Number(player.baseStats?.str) || 0,
        agi: Number(player.baseStats?.agi) || 0,
        int: Number(player.baseStats?.int) || 0,
        luk: Number(player.baseStats?.luk) || 0,
      },

      // 其他設定
      magicShieldEnabled: !!player.magicShieldEnabled,
      baseSkillDamage: Number(player.baseSkillDamage ?? 0.10),

      // Core Bonus
      coreBonusData: player.coreBonus?.bonusData ?? null,

      // 元素裝備
      elementEquipmentData: (typeof window.getElementGearData === "function")
        ? window.getElementGearData()
        : (window.elementGearData ?? null),

      // 道具 / 技能 / 轉職紀錄 / 回復系統
      inventoryData: window.inventory || {},
      skillsState: (typeof window.Skills_exportState === "function")
        ? window.Skills_exportState()
        : null,
      jobChangeDoneLevels: Array.from(window.__jobChangeDoneLevels || new Set()),
      recoveryLevel: (player?.recoverySystem?.level ?? 1),

      // 即時資源
      currentHP: Number.isFinite(player.currentHP) ? player.currentHP : undefined,
      currentMP: Number.isFinite(player.currentMP) ? player.currentMP : undefined,
    };
  }

  // ===== 將 SaveHub 讀出的資料套回遊戲狀態 =====
  function applyLoadedState(loadedData) {
    if (!loadedData || typeof loadedData !== "object") return;
    const p = player;
    if (!p) return;

    // 基本資料
    p.nickname = (typeof loadedData.nickname === "string")
      ? loadedData.nickname
      : (p.nickname ?? "");
    p.job      = (typeof loadedData.job === "string")
      ? loadedData.job
      : (p.job ?? "");

    // 等級/資源
    p.level      = Number(loadedData.level)      || 1;
    p.exp        = Number(loadedData.exp)        || 0;
    p.statPoints = Number(loadedData.statPoints) || 0;
    p.gold       = Number(loadedData.gold)       || 0;
    p.gem        = Number(loadedData.gem)        || 0;
    p.stone      = Number(loadedData.stone)      || 0;

    // 狀態
    p.magicShieldEnabled = !!loadedData.magicShieldEnabled;
    p.baseSkillDamage    = Number(loadedData.baseSkillDamage ?? 0.10);

    // 基礎能力值
    if (loadedData.baseStats) {
      p.baseStats = p.baseStats || {};
      Object.assign(p.baseStats, loadedData.baseStats);
    }

    // Core Bonus
    if (loadedData.coreBonusData) {
      p.coreBonus = p.coreBonus || {};
      p.coreBonus.bonusData = p.coreBonus.bonusData || {};
      Object.assign(p.coreBonus.bonusData, loadedData.coreBonusData);
    }

    // 道具
    if (loadedData.inventoryData && window.inventory) {
      Object.assign(window.inventory, loadedData.inventoryData);
    }

    // 技能
    if (loadedData.skillsState &&
        typeof window.Skills_applyState === "function") {
      window.Skills_applyState(loadedData.skillsState);
    }

    // 轉職紀錄
    window.__jobChangeDoneLevels =
      new Set(loadedData.jobChangeDoneLevels || []);

    // 回復系統
    p.recoverySystem = p.recoverySystem || {};
    p.recoverySystem.level =
      Number(loadedData.recoveryLevel) || 1;

    // 元素裝備
    if (loadedData.elementEquipmentData) {
      if (window.elementGearData) {
        Object.assign(window.elementGearData, loadedData.elementEquipmentData);
      }
      if (typeof window.applyElementEquipmentBonusToPlayer === "function") {
        window.applyElementEquipmentBonusToPlayer();
      }
    }

    // 重新計算總能力
    if (typeof window.recomputeTotalStats === "function") {
      window.recomputeTotalStats();
    }

    // HP/MP 回復
    const maxHP = p.totalStats?.hp ?? 100;
    const maxMP = p.totalStats?.mp ?? 0;

    if (typeof loadedData.currentHP === "number") {
      p.currentHP = Math.max(0, Math.min(loadedData.currentHP, maxHP));
    } else {
      p.currentHP = maxHP;
    }

    if (typeof loadedData.currentMP === "number") {
      p.currentMP = Math.max(0, Math.min(loadedData.currentMP, maxMP));
    } else {
      p.currentMP = maxMP;
    }

    // 遊戲中即時狀態
    p.shield = 0;
    p.statusEffects = {};
    p.expToNext = (typeof window.getExpToNext === "function")
      ? window.getExpToNext(p.level)
      : 100;

    if (typeof window.rebuildActiveSkills === "function") {
      window.rebuildActiveSkills();
    }
    if (typeof window.updateAllUI === "function") {
      window.updateAllUI();
    }
  }

  // ===== SaveHub 讀寫 =====
  function saveToHub(state) {
    if (!state) return;
    if (typeof window.SaveHub === "undefined") {
      console.warn("[SaveCore] SaveHub 尚未載入，無法存檔");
      return;
    }
    try {
      // replace: true → 每次整個覆蓋
      window.SaveHub.set(HUB_NS, state, { replace: true });
    } catch (e) {
      console.error("[SaveCore] SaveHub 寫入失敗：", e);
    }
  }

  function loadFromHub() {
    if (typeof window.SaveHub === "undefined") {
      console.warn("[SaveCore] SaveHub 尚未載入，無法讀檔");
      return false;
    }
    try {
      // 不給 defaultObj → 純讀，不會寫檔
      const node = window.SaveHub.get(HUB_NS);
      if (!node || typeof node !== "object") return false;

      applyLoadedState(node);
      return true;
    } catch (e) {
      console.error("[SaveCore] 從 SaveHub 載入失敗：", e);
      return false;
    }
  }

  // ===== 真正寫檔（只寫 Hub）=====
  function saveGameNow(reason) {
    try {
      const state = buildSaveState();
      if (!state) return;

      saveToHub(state);
      lastSaveAt = now();
      savePending = false;

      // 除錯想看原因可以開這行
      // console.log("[SaveCore] flush", { reason, ts: lastSaveAt });
    } catch (e) {
      console.error("❌ Save failed:", e);
    }
  }

  // ===== 排程存檔：所有 saveGame() 最終都走這裡 =====
  function scheduleSave() {
    savePending = true;

    // 開場前 2 秒不急著寫（讓模組初始化穩定）
    if (bootBusy()) return;

    const elapsed = now() - lastSaveAt;
    if (elapsed >= SAVE_MIN_INTERVAL_MS) {
      // 間隔夠久 → 直接寫
      clearTimeout(flushTimer);
      flushTimer = null;
      saveGameNow("interval");
    } else if (!flushTimer) {
      // 間隔太短 → 排一個 timeout，最久 FLUSH_TIMEOUT_MS 秒內一定寫
      flushTimer = setTimeout(function () {
        flushTimer = null;
        if (savePending) saveGameNow("timeout");
      }, Math.min(SAVE_MIN_INTERVAL_MS - elapsed, FLUSH_TIMEOUT_MS));
    }
  }

  // ===== 對外 API =====
  function saveGame() {
    scheduleSave();
  }

  let __loadingOnce__ = false;
  function loadGame() {
    if (__loadingOnce__) return true;
    __loadingOnce__ = true;

    const ok = loadFromHub();
    __loadingOnce__ = false;
    return ok;
  }

  function hasGameSave() {
    try {
      if (typeof window.SaveHub === "undefined") return false;
      const node = window.SaveHub.get(HUB_NS);
      return !!(node && typeof node === "object");
    } catch (_e) {
      return false;
    }
  }

  // ===== 對外暴露（Schema 也丟出去，之後要用都可以）=====
  window.GameSaveSchema = {
    build:  buildSaveState,
    apply:  applyLoadedState
  };

  window.saveGame    = saveGame;
  window.loadGame    = loadGame;
  window.hasGameSave = hasGameSave;

  // 頁面關閉 / 隱藏：如果還有 pending 存檔就立刻寫一次
  window.addEventListener("beforeunload", function () {
    if (savePending) saveGameNow("beforeunload");
  });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden" && savePending) {
      saveGameNow("hidden");
    }
  });
})();
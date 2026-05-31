// map/difficulty.js
(function () {
  const DEFAULTS = {
    hp:1, atk:1, def:1, exp:1, gold:1, stone:1, item:1,
    eliteChance:0.0,
    monsterSpeedMul:1, // 怪物攻速倍率
  };

  const PRESET = {
    simple1:   
    { label:"弱化",  hp:0.5,   atk:0.5,   def:0.3,   exp:0.33,    gold:0.4,    stone:0.3,   item:0.3,   eliteChance:0, monsterSpeedMul:0.7   },
    simple:  
    { label:"簡單",  hp:1.00,   atk:1.00,   def:1.00,   exp:1,    gold:1,    stone:1,   item:1,   eliteChance:0.10, monsterSpeedMul:1.3   },
    normal:   
    { label:"普通",  hp:1.7, atk:1.6, def:1.6, exp:1.2,  gold:1.1,  stone:1.2,   item:1.1, eliteChance:0.10, monsterSpeedMul:1.7 },
    hard:     
    { label:"困難",  hp:2.6,   atk:2,   def:2,   exp:1.25, gold:1.25, stone:1.4,   item:1.2, eliteChance:0.15, monsterSpeedMul:2.2},
    hell:     
    { label:"地獄",  hp:3.8,   atk:3,   def:3,   exp:1.5,  gold:1.5,  stone:1.6,   item:1.4, eliteChance:0.18, monsterSpeedMul:2.7   },
    nightmare:
    { label:"噩夢",  hp:5,   atk:4,   def:4,   exp:1.75, gold:1.75, stone:1.8,   item:1.6, eliteChance:0.20, monsterSpeedMul:3.5 },
dev:      
    { label:"測試",  hp:10000, atk:0,   def:0,   exp:0,    gold:0,    stone:0,   item:0,   eliteChance:0.00, monsterSpeedMul:1   },
  };

  let currentKey = "simple1";

  // 對外：取得目前難度
  window.getCurrentDifficulty = function () {
    const p = PRESET[currentKey] || PRESET.simple;
    return {
      hp:+p.hp||DEFAULTS.hp, atk:+p.atk||DEFAULTS.atk, def:+p.def||DEFAULTS.def,
      exp:+p.exp||DEFAULTS.exp, gold:+p.gold||DEFAULTS.gold, stone:+p.stone||DEFAULTS.stone,
      item:+p.item||DEFAULTS.item, eliteChance:+p.eliteChance||DEFAULTS.eliteChance,
      monsterSpeedMul:+p.monsterSpeedMul||DEFAULTS.monsterSpeedMul,
    };
  };

  // 對外：鎖/解鎖難度下拉
  window.setDifficultySelectDisabled = function (disabled) {
    const sel = document.getElementById("difficultySelect");
    if (sel) sel.disabled = !!disabled;
  };

  // 初始化 UI + 同步攻速倍率
  window.initDifficultyUI = function () {
    const sel = document.getElementById("difficultySelect");
    if (!sel) return;

    // 建立選項
    sel.innerHTML = "";
    for (const key of Object.keys(PRESET)) {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = PRESET[key].label;
      if (key === currentKey) opt.selected = true;
      sel.appendChild(opt);
    }

    // 切換難度：若已被鎖定則不處理；否則更新 key 並把攻速倍率丟給中控
    sel.onchange = (e) => {
      if (sel.disabled) return; // 被鎖時忽略變更
      currentKey = e.target.value || "simple";
      const d = window.getCurrentDifficulty();
      window.setMonsterSpeedPct?.(Number(d.monsterSpeedMul) || 1);
    };

    // 初次載入 → 也同步一次攻速倍率
    const d = window.getCurrentDifficulty();
    window.setMonsterSpeedPct?.(Number(d.monsterSpeedMul) || 1);

    // ★ 不改 rpg.js：在這裡「補回」開始鍵就鎖定
    const btnStart = document.getElementById("btnStart");
    if (btnStart && !btnStart._bindLockOnce) {
      btnStart._bindLockOnce = true;
      btnStart.addEventListener("click", () => {
        // 只有從未鎖定 → 進入鎖定（避免重覆操作）
        if (!sel.disabled) window.setDifficultySelectDisabled(true);
        // 也在開戰瞬間再同步一次攻速倍率（以防有人剛改完難度就開戰）
        const d2 = window.getCurrentDifficulty();
        window.setMonsterSpeedPct?.(Number(d2.monsterSpeedMul) || 1);
      });
    }
    // 解鎖不在這做，仍沿用你原本在擊殺/停止後於 rpg.js 內呼叫的那邏輯
  };

  // 自動初始化
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initDifficultyUI);
  } else {
    initDifficultyUI();
  }
})();
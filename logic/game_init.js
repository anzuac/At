// 📦 game_init.js —— rAF 主迴圈 + 充能條（玩家/怪物）+ APS 顯示 + 節流更新

// ===== 可調參數（毫秒 / 倍數） =====
var RT = {
  // 基準（100% 時的間隔）
  basePlayerMs: 2000,
  baseMonsterMs: 2000,

  // 目前實際使用的間隔（會被動態回填）
  playerActMs: 2000,
  monsterActMs: 2000,

  // 系統節奏
  tickMs: 1000,   // 狀態/冷卻/DoT 節奏
  uiMs: 100,      // UI 節流（避免每幀重繪）

  // 安全下限（避免過快）
  minActMs: 10,

  // 固定覆寫（≠null 即採用固定毫秒、不吃百分比）
  playerMsFixed: null,
  monsterMsFixed: null,

  // 額外百分比覆寫（乘在最終上，1=不變）
  playerPctOverride: 1,
  monsterPctOverride: 1
};

// ===== rAF 迴圈累加器 =====
var _lastTs = 0, _accP = 0, _accM = 0, _accT = 0, _accUI = 0;
var _loopOn = false;

// ===== 對外 setter（變更時重置累加器，避免爆跑） =====
function _resetAccumulators(){ _accP = _accM = _accT = _accUI = 0; }

window.setAttackSpeed = function (ms) {
  var v = Number(ms);
  if (isFinite(v) && v > 0) { RT.playerMsFixed = v; _resetAccumulators(); }
};
window.setMonsterSpeed = function (ms) {
  var v = Number(ms);
  if (isFinite(v) && v > 0) { RT.monsterMsFixed = v; _resetAccumulators(); }
};
window.setPlayerSpeedPct = function (pct) {
  var p = Number(pct);
  RT.playerPctOverride = (isFinite(p) && p > 0) ? p : 1;
  RT.playerMsFixed = null; // 回自動
  _resetAccumulators();
};
window.setMonsterSpeedPct = function (pct) {
  var p = Number(pct);
  RT.monsterPctOverride = (isFinite(p) && p > 0) ? p : 1;
  RT.monsterMsFixed = null;
  _resetAccumulators();
};
window.setTickMs = function (ms) {
  var v = Number(ms);
  if (isFinite(v) && v >= 16) { RT.tickMs = v; _resetAccumulators(); }
};
window.setUiMs = function (ms) {
  var v = Number(ms);
  if (isFinite(v) && v >= 16) { RT.uiMs = v; _resetAccumulators(); }
};

// ===== 依攻速百分比換算實際間隔（每幀重算，Buff/裝備即時生效） =====
// ======================
//  重新計算玩家/怪物出手間隔
//  —— 整合：
//     ✔ 玩家攻速能力表（attackSpeedPct）
//     ✔ 玩家狀態：slow（緩速）
//     ✔ 玩家（預留）buff：haste
//     ✔ 玩家外部強制覆寫（playerPctOverride）
//     ✔ 怪物速度（speedPct / attackSpeedPct）
//     ✔ 怪物 haste buff
// ======================
function _recalcIntervals() {

  /* =========================================================
   *  玩家攻速處理（Player）
   * ========================================================= */

  let wantPlayerMs;

  // （1）固定毫秒覆寫：setAttackSpeed(...) 時使用，不吃 buff %，
  //     通常用於暫停、調試、強制加速等
  if (RT.playerMsFixed && RT.playerMsFixed > 0) {

    wantPlayerMs = RT.playerMsFixed;

  } else {

    // (2) 玩家基礎攻速百分比（能力表）
    //     attackSpeedPct = 1.2 → 攻速 +20%
    let aspd = 1;
    if (window.player && player.totalStats) {
      const raw = Number(player.totalStats.attackSpeedPct);
      aspd = (isFinite(raw) && raw > 0) ? raw : 1;
    }

    // (3) 玩家狀態影響 —— Slow（緩速）
    //     ★ 建議 slow 時攻速降低 40% → 乘 0.6
    let slowMul = 1;
    if (player?.statusEffects?.slow > 0) {
      slowMul *= 0.6;  // 你可改成 0.7 / 0.8（= 緩速較弱）
    }

    // (4) 預留：玩家 haste（加速）buff
    //     若你未來做玩家 Buff，可以在這裡加入：
    //     if (player.statusEffects.haste > 0) slowMul *= 1.2;
    //     目前保持空白。

    // (5) 最終有效攻速倍率（越高越快）
    const effPct = aspd * slowMul * (RT.playerPctOverride || 1);

    // (6) 最終換算毫秒：base / 倍數
    wantPlayerMs = Math.max(RT.minActMs, Math.round(RT.basePlayerMs / effPct));
  }

  // 若間隔變更 → 清空累積器，避免連續觸發
  if (RT.playerActMs !== wantPlayerMs) {
    RT.playerActMs = wantPlayerMs;
    _accP = 0;
  }


  /* =========================================================
   *  怪物攻速處理（Monster）
   * ========================================================= */

  let wantMonsterMs;

  // （1）外部強制覆寫
  if (RT.monsterMsFixed && RT.monsterMsFixed > 0) {

    wantMonsterMs = RT.monsterMsFixed;

  } else {

    // (2) 怪物基礎攻速 speedPct / attackSpeedPct
    let mpct = 1;
    if (window.currentMonster) {

      // speedPct / attackSpeedPct 二選一（你原本的寫法保留）
      const rawM = Number(currentMonster.attackSpeedPct ?? currentMonster.speedPct ?? 1);
      mpct = (isFinite(rawM) && rawM > 0) ? rawM : 1;

      // (3) 怪物加速 buff（haste）
      const haste = currentMonster.statusEffects?.haste;
      if (haste && Number(haste.mul) && haste.duration > 0) {
        mpct *= Number(haste.mul); // e.g. 1.2 倍
      }

      // (4) 若你未來想做怪物 slow，也可在這裡 *0.7
      //     if (currentMonster.statusEffects?.slow > 0) mpct *= 0.7;
    }

    // (5) 最終倍率
    const effMpct = mpct * (RT.monsterPctOverride || 1);

    // (6) 間隔 = base / 倍數
    wantMonsterMs = Math.max(RT.minActMs, Math.round(RT.baseMonsterMs / effMpct));
  }

  // 若怪物攻速變更也要清積累器
  if (RT.monsterActMs !== wantMonsterMs) {
    RT.monsterActMs = wantMonsterMs;
    _accM = 0;
  }
}

// ===== 充能條：依「累積/間隔」顯示 0→100% =====
function updateChargeBars() {
  // APS 文字（次/秒）
  var pAps = (1000 / RT.playerActMs);
  var mAps = (1000 / RT.monsterActMs);
  var pTxt = document.getElementById("hudPlayerAPS");
  var mTxt = document.getElementById("hudMonsterAPS");
  if (pTxt) pTxt.textContent = pAps.toFixed(2) + "/s";
  if (mTxt) mTxt.textContent = mAps.toFixed(2) + "/s";

  // 充能百分比：累積 / 間隔
  var pFill = document.getElementById("playerApsFill");
  var mFill = document.getElementById("monsterApsFill");

  if (pFill && RT.playerActMs > 0) {
    var pPct = Math.max(0, Math.min(100, Math.round((_accP / RT.playerActMs) * 100)));
    pFill.style.width = pPct + "%";
  }
  if (mFill && RT.monsterActMs > 0) {
    var mPct = Math.max(0, Math.min(100, Math.round((_accM / RT.monsterActMs) * 100)));
    mFill.style.width = mPct + "%";
  }
}

// 出手瞬間：條滿 + 閃一下，再歸零重充
function flashAndReset(fillEl) {
  if (!fillEl) return;
  fillEl.style.width = "100%";           // 視覺明確達到滿格
  fillEl.classList.remove("flash");
  void fillEl.offsetWidth;               // 強制回流以重觸發動畫
  fillEl.classList.add("flash");
}

// ===== rAF 主迴圈 =====
function _loop(ts) {
  if (!_loopOn) return;
  if (_lastTs === 0) _lastTs = ts;
  var dt = ts - _lastTs; _lastTs = ts;

  _recalcIntervals();

  if (window.autoEnabled) {
    _accT  += dt; // 狀態/冷卻/DoT
    _accP  += dt; // 玩家充能
    _accM  += dt; // 怪物充能
    _accUI += dt; // UI 節流

    // —— 每秒節奏 —— //
    while (_accT >= RT.tickMs) { window.rtTickSec?.(); _accT -= RT.tickMs; }

    // —— 玩家出手 —— //
    while (_accP >= RT.playerActMs) {
      flashAndReset(document.getElementById("playerApsFill"));
      window.rtPlayerAct?.();            // 真正出手
      _accP -= RT.playerActMs;           // 歸零（留餘量）
      if (!window.autoEnabled) break;
    }

    // —— 怪物出手 —— //
    while (_accM >= RT.monsterActMs) {
      flashAndReset(document.getElementById("monsterApsFill"));
      window.rtMonsterAct?.();
      _accM -= RT.monsterActMs;
      if (!window.autoEnabled) break;
    }

    // —— UI 更新（節流） —— //
    if (_accUI >= RT.uiMs) {
      window.updateResourceUI?.();
      if (window.currentMonster && typeof window.updateMonsterInfo === "function") {
        window.updateMonsterInfo(window.currentMonster, Math.max(window.monsterHP || 0, 0));
      }
      updateChargeBars();                // 更新充能條 + APS 文字
      _accUI = 0;
    }
  }

  requestAnimationFrame(_loop);
}

// ===== DOMContentLoaded：初始化/事件綁定/啟動迴圈 =====
window.addEventListener("DOMContentLoaded", function () {
  // ====== 你的地圖/等級填入（相容保留） ======
  var levelSelect = document.getElementById("levelRange");
  var mapSelect   = document.getElementById("mapSelect");

  if (typeof levelRangeOptions !== 'undefined' && levelSelect && levelSelect.options.length === 0) {
    for (var i = 0; i < levelRangeOptions.length; i++) {
      var rng = levelRangeOptions[i];
      var opt = document.createElement("option");
      opt.value = rng.value;
      opt.textContent = rng.label;
      levelSelect.appendChild(opt);
    }
  }
  if (typeof mapOptions !== 'undefined' && mapSelect && mapSelect.options.length === 0) {
    for (var j = 0; j < mapOptions.length; j++) {
      var mp = mapOptions[j];
      var opt2 = document.createElement("option");
      opt2.value = mp.value;
      opt2.textContent = mp.label;
      mapSelect.appendChild(opt2);
    }
  }

  if (levelSelect) levelSelect.addEventListener("change", function(){
    window.selectedRange = levelSelect.value;
  });
  if (mapSelect)   mapSelect.addEventListener("change", function(){
    window.selectedMap = mapSelect.value;
  });

  // Start：開啟自動戰鬥（如無怪則自動生新怪）
  var btnStart = document.getElementById('btnStart');
  if (btnStart) btnStart.addEventListener('click', function () {
    if (!window.autoEnabled) {
      window.autoEnabled = true;

      if (!window.currentMonster) {
        if (window.BattleGate && typeof window.BattleGate.requestAutoSpawn === "function") {
          window.BattleGate.requestAutoSpawn();
        } else if (typeof window.spawnNewMonster === "function") {
          window.spawnNewMonster();
        }
      }
      if (typeof window.setDifficultySelectDisabled === "function") {
        window.setDifficultySelectDisabled(true);
      }
      _resetAccumulators();
    }
  });

  // Stop：優雅停止（通常在本場結束後停）
  var btnStop  = document.getElementById('btnStop');
  if (btnStop) btnStop.addEventListener('click', function () {
    window.stopAfterEncounter = true; // 交由你的戰鬥流程在適當時機檢查並停下
  });

  // 啟動 rAF 主迴圈（只開一次）
  if (!_loopOn) { _loopOn = true; requestAnimationFrame(_loop); }
});

// ===== 除錯/診斷用：把 RT 掛到 window 方便在 console 查看 =====
window.__RT = RT;
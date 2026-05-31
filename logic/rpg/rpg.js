// 📦 rpg.js —— 即時制核心（中控）
// 需求：Rpg_玩家.js、Rpg_怪物.js、statusEffects.js、(可選) battleUtils.js 已先載入

// ===== 安全墊片（避免未定義報錯）=====
if (typeof window.applyPlayerStatus === 'undefined') {
  window.applyPlayerStatus = function(type, turns) {
    if (!type || !isFinite(turns) || !window.player) return;
    player.statusEffects = player.statusEffects || {};
    const cur = player.statusEffects[type] || 0;
    player.statusEffects[type] = Math.max(cur, Math.max(0, Math.floor(turns)));
  };
}

// ===== 小工具：取目前「整秒」=====
function _nowSec() {
  return Math.floor((typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000);
}
function _clamp(n, lo, hi){ return Math.max(lo, Math.min(hi, n)); }

// ===== 全域狀態（單純全域變數）=====
let selectedRange = "1-10";
let selectedMap   = "all";

// 多體 / 單體通用狀態
let battleMode   = "single";  // "single" or "multi"
let monsters     = [];        // 場上所有怪物
let targetIndex  = 0;         // 玩家目前鎖定的怪物索引（多體用）

let currentMonster = null;
let monsterHP = 0;
const isDead = false;

let autoEnabled = false;         // 是否啟動自動戰鬥（按鈕或外部控制）
let stopAfterEncounter = false;  // 優雅停止：打完本隻就停

// 以下兩者由 battleUtils.js 管：這裡只參照，不新建/清理
const respawnTimer = null;
const deathTimer   = null;

// ===== 戰鬥日誌（單框） + 左右雙框代理 =====
function logPrepend(text) {
  const log = document.getElementById("battleLog");
  if (!log) return;

  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  const timeStr = "[" + hh + ":" + mm + ":" + ss + "]";

  const entry = document.createElement("div");
  entry.textContent = timeStr + " " + text;
  log.insertBefore(entry, log.firstChild);
}
function postPlayer(msg){
  if (!msg) return;
  if (window.LogDual && LogDual.player) LogDual.player(String(msg));
  else logPrepend(String(msg));
}
function postMonster(msg){
  if (!msg) return;
  if (window.LogDual && LogDual.monster) LogDual.monster(String(msg));
  else logPrepend(String(msg));
}
function postReward(msg){
  if (!msg) return;
  if (window.LogDual && LogDual.player) LogDual.player(String(msg));
  else logPrepend(String(msg));
}

// ===== 閃避百分比（玩家/怪物共用）=====
function getEvasionPercent(entity) {
  let eva = 0;

  // 玩家或怪物 dodgePercent
  if (entity && isFinite(Number(entity.dodgePercent))) {
    eva = Number(entity.dodgePercent);

    // 保留小數 0~1 的設計，如果有人給 1.0 就是 100%
    if (eva < 0) eva = 0;
    if (eva > 1) eva = 1;
  }

  // 若 BossCore 有額外 evasion 屬性，也走 0~1 小數
  if (typeof BossCore !== "undefined" && BossCore && typeof BossCore.getStat === "function") {
    let statEva = Number(BossCore.getStat(entity, "evasion") || 0);
    if (isFinite(statEva)) {
      if (statEva < 0) statEva = 0;
      if (statEva > 1) statEva = 1;
      eva = Math.max(eva, statEva);
    }
  }

  return eva; // ⭐ 回傳 0~1 小數，不再回傳 0~100
}
// ===== 多體輔助：目標選擇 / 全死判定 =====
function getFirstAliveIndex() {
  if (!Array.isArray(monsters)) return -1;
  for (let i = 0; i < monsters.length; i++) {
    const m = monsters[i];
    if (m && m.hp > 0) return i;
  }
  return -1;
}
function areAllMonstersDead() {
  if (Array.isArray(monsters) && monsters.length > 0) {
    for (let i = 0; i < monsters.length; i++) {
      const m = monsters[i];
      if (m && m.hp > 0) return false;
    }
    return true;
  }
  // 單體相容
  return !currentMonster || monsterHP <= 0;
}
function refreshCurrentMonster() {
  if (Array.isArray(monsters) && monsters.length > 0) {
    // 1) 優先維持「目前選取目標」（targetIndex）
    if (
      targetIndex >= 0 &&
      targetIndex < monsters.length &&
      monsters[targetIndex] &&
      monsters[targetIndex].hp > 0
    ) {
      currentMonster = monsters[targetIndex];
      monsterHP = Math.max(0, Number(currentMonster.hp || 0));
      return;
    }

    // 2) 目前選的怪已死／不合法 → 改選第一隻活著的
    const idx = getFirstAliveIndex();
    if (idx === -1) {
      currentMonster = null;
      monsterHP = 0;
      targetIndex = -1;
    } else {
      targetIndex = idx;
      currentMonster = monsters[idx];
      monsterHP = Math.max(0, Number(currentMonster.hp || 0));
    }
    return;
  }

  // 單體相容（保險）
  if (!currentMonster || currentMonster.hp <= 0) {
    currentMonster = null;
    monsterHP = 0;
    targetIndex = -1;
  } else {
    monsterHP = Math.max(0, Number(currentMonster.hp || 0));
  }
}

// ===== 戰鬥模式切換（給 UI 按鈕用）=====
function toggleBattleMode() {
  battleMode = (battleMode === "single") ? "multi" : "single";
  const btn = document.getElementById("btnToggleMode");
  if (btn) {
    btn.textContent = (battleMode === "single") ? "單體模式" : "多體模式";
  }
  // 切模式只影響下一場遇敵，不動當前戰鬥
}

function _randInt(min, max) {
  min = Math.floor(min);
  max = Math.floor(max);
  if (max < min) { const t = min; min = max; max = t; }
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function spawnNewMonster() {
  const mapSel = document.getElementById("mapSelect");
  const lvlSel = document.getElementById("levelRange");

  selectedMap   = (mapSel && mapSel.value) ? mapSel.value : (selectedMap || "all");
  selectedRange = (lvlSel && lvlSel.value) ? lvlSel.value : (selectedRange || "1-10");

  if (typeof getMonster !== "function") {
    console.warn("getMonster 未載入；無法生怪");
    return;
  }

  // 每次遇敵重置怪物陣列
  monsters = [];
  currentMonster = null;
  monsterHP = 0;
  targetIndex = 0;

  // ------ 依地圖取怪物上下限 ------
  let minCount = 3;
  let maxCount = 5;

  if (Array.isArray(window.mapOptions)) {
    const cfg = window.mapOptions.find(x => x.value === selectedMap);
    if (cfg) {
      minCount = Number(cfg.monsterMin ?? minCount);
      maxCount = Number(cfg.monsterMax ?? maxCount);
    }
  }

  // 單體模式：固定 1 隻
  // 多體模式：依地圖範圍隨機 min~max
  let count = 1;
  if (battleMode === "multi") {
    minCount = Math.max(1, Math.floor(minCount));
    maxCount = Math.max(minCount, Math.floor(maxCount));

    count = _randInt(minCount, maxCount);
  }

  // ------ 生怪 ------
  for (let i = 0; i < count; i++) {
    const m = getMonster(selectedMap, selectedRange);
    if (!m) continue;

    m.maxHp = (typeof m.maxHp === "number") ? m.maxHp : m.hp;
    m.statusEffects     = m.statusEffects     || {};
    m.statusResistance  = m.statusResistance  || {};

    // ⭐ Boss 一性質：直接覆蓋，只出一隻
    if (m.isBoss) {
      monsters = [m];
      break;
    }

    monsters.push(m);
  }

  if (!monsters.length) return;

  refreshCurrentMonster();

  // 自動戰鬥鎖選單
  if (autoEnabled && typeof window.setDifficultySelectDisabled === "function") {
    window.setDifficultySelectDisabled(true);
  }

  if (monsters.length === 1) {
    postPlayer("👾 遭遇 " + currentMonster.name);
  } else {
    postPlayer("👾 遭遇 " + monsters.length + " 隻怪物");
  }

  const nowSec = _nowSec();
  if (typeof updateMonsterInfo === "function" && currentMonster) {
    updateMonsterInfo(currentMonster, monsterHP, nowSec);
  }
}

// ===== 單隻怪物死亡掉落（普攻 / 技能 / DoT 共用）=====
function _grantMonsterDrop(mon, nowSec) {
  if (!mon) return;

  const drop = (typeof getDrop === "function") ? getDrop(mon) : { gold: 0, stone: 0, exp: 0, items: [] };
  if (drop.gold && typeof addGoldFromKill === "function") addGoldFromKill(drop.gold, 1);
  if (drop.stone && typeof addStone === "function") addStone(drop.stone);
  if (typeof gainExp === "function") gainExp(drop.exp || 0);

  if (window.RewardTracker && window.RewardTracker.record) {
    window.RewardTracker.record(
      { exp: drop.exp || 0, gold: drop.gold || 0, stone: drop.stone || 0 },
      { monster: mon ? mon.name : "", map: selectedMap },
      (drop.items && drop.items.slice) ? drop.items : []
    );
  }
  const dropItemsText = (drop.items && drop.items.length > 0)
    ? "，並獲得 " + drop.items.join("、")
    : "";

  postPlayer(
    "🎉 擊敗 " + mon.name +
    "，獲得 楓幣 " + drop.gold +
    (drop.stone > 0 ? "、強化石 " + drop.stone + " 顆" : "") +
    "、EXP " + drop.exp + dropItemsText
  );
}

// ===== 整波結束（全部怪物死亡後，倒數重生 / Boss Gate 結算）=====
function _onMonsterDead(nowSec) {
  // 是否為 Boss 戰（這一波有 Boss）
  let hasBoss = false;
  if (Array.isArray(monsters) && monsters.length > 0) {
    for (let i = 0; i < monsters.length; i++) {
      if (monsters[i] && monsters[i].isBoss) { hasBoss = true; break; }
    }
  } else if (currentMonster && currentMonster.isBoss) {
    hasBoss = true;
  }

  // ⭐ 特殊 Boss 挑戰結算（成功）
  if (hasBoss && window.SpecialBossGate && typeof SpecialBossGate.onBattleEnd === "function") {
    try { SpecialBossGate.onBattleEnd(true); } catch (e) { console.warn(e); }
  }

  if (typeof clearMonsterInfo === "function") clearMonsterInfo();
  currentMonster = null;
  monsterHP = 0;
  monsters = [];
  targetIndex = -1;

  if (stopAfterEncounter) {
    autoEnabled = false;
    stopAfterEncounter = false;
    if (typeof window.setDifficultySelectDisabled === "function") {
      window.setDifficultySelectDisabled(false);
    }
  } else if (autoEnabled) {
    if (typeof startRespawnCountdown === "function") startRespawnCountdown();
  } else {
    if (typeof window.setDifficultySelectDisabled === "function") {
      window.setDifficultySelectDisabled(false);
    }
  }

  if (typeof updateResourceUI === "function") updateResourceUI();
}

// ===== 每秒滴答（狀態/自 Buff/CD/HP 同步 + 輕量 UI）=====
function rtTickSec() {
  if (isDead || !autoEnabled) return;
  if (window.BattleGate && window.BattleGate.isLocked && window.BattleGate.isLocked()) return;

  const nowSec = _nowSec();
  window._NOW_SEC = nowSec;  // 提供給 UI 使用（其他功能還是可以用）
  window.round    = nowSec;

  // 1) 玩家持續狀態
  if (typeof processPlayerStatusEffects === "function") processPlayerStatusEffects();

  // 2) 怪物持續狀態（DoT）
  if (battleMode === "single") {
    if (currentMonster && typeof processMonsterStatusEffects === "function") {
      const prevHp = Number(currentMonster.hp || 0);

      const out = processMonsterStatusEffects(currentMonster, player, nowSec);
      if (out && out.events && out.events.length) {
        for (let i = 0; i < out.events.length; i++) {
          const ev = out.events[i];
          if (ev.damage > 0) {
            currentMonster.hp = Math.max(0, Number(currentMonster.hp || 0) - ev.damage);
            monsterHP = currentMonster.hp;

            if (window.LogDual && LogDual.monster) LogDual.monster(ev.text + "（HP：" + monsterHP + "）");
            else logPrepend(ev.text + "（HP：" + monsterHP + "）");

            if (monsterHP <= 0) break;
          }
        }
      }

      // DoT 擊殺：給掉落（單體）
      if (prevHp > 0 && currentMonster.hp <= 0) {
        _grantMonsterDrop(currentMonster, nowSec);
      }
    }
  } else {
    // 多體：每一隻怪都跑狀態
    if (Array.isArray(monsters) && typeof processMonsterStatusEffects === "function") {
      for (let mi = 0; mi < monsters.length; mi++) {
        const m = monsters[mi];
        if (!m || m.hp <= 0) continue;

        const prevHpM = Number(m.hp || 0);

        const out2 = processMonsterStatusEffects(m, player, nowSec);
        if (out2 && out2.events && out2.events.length) {
          for (let j = 0; j < out2.events.length; j++) {
            const ev2 = out2.events[j];
            if (ev2.damage > 0) {
              m.hp = Math.max(0, Number(m.hp || 0) - ev2.damage);
              if (window.LogDual && LogDual.monster) LogDual.monster("[#" + (mi+1) + "] " + ev2.text + "（HP：" + m.hp + "）");
              else logPrepend("[#" + (mi+1) + "] " + ev2.text + "（HP：" + m.hp + "）");
              if (m.hp <= 0) break;
            }
          }
        }

        // 多體 DoT 擊殺：單隻掉落
        if (prevHpM > 0 && m.hp <= 0) {
          _grantMonsterDrop(m, nowSec);
        }
      }
      // 同步目前目標
      refreshCurrentMonster();
    }
  }

  // 3) 怪物自我 Buff
  if (battleMode === "single") {
    if (currentMonster && typeof processMonsterBuffs === "function") {
      processMonsterBuffs(currentMonster);
      monsterHP = Math.max(0, Number(currentMonster.hp || 0));
    }
  } else {
    if (Array.isArray(monsters) && typeof processMonsterBuffs === "function") {
      for (let bi = 0; bi < monsters.length; bi++) {
        const bm = monsters[bi];
        if (!bm || bm.hp <= 0) continue;
        processMonsterBuffs(bm);
      }
      refreshCurrentMonster();
    }
  }

  // 4) DoT 可能擊殺：只在「全部怪死光」時才視為整波結束
  if (areAllMonstersDead()) {
    _onMonsterDead(nowSec);
    return;
  }

  // 5) 技能冷卻
  if (typeof reduceSkillCooldowns === "function") reduceSkillCooldowns();
  if (currentMonster) {
    const hasBossTick = typeof currentMonster._tickEndTurn === "function";
    if (hasBossTick) currentMonster._tickEndTurn(currentMonster);
    else if (typeof reduceMonsterSkillCooldowns === "function") reduceMonsterSkillCooldowns(currentMonster);
  }

  // 6) 輕量 UI
  if (typeof updateResourceUI === "function") updateResourceUI();
  if (currentMonster && typeof updateMonsterInfo === "function") {
    updateMonsterInfo(currentMonster, monsterHP, nowSec);
  }
}

// ===== 玩家出手（委派 Rpg_玩家；中控只做後續/掉落）=====
function rtPlayerAct() {
  if (isDead || !autoEnabled) return;
  if (window.BattleGate && window.BattleGate.isLocked && window.BattleGate.isLocked()) return;

  if (!currentMonster) {
    if (window.BattleGate && window.BattleGate.requestAutoSpawn) {
      window.BattleGate.requestAutoSpawn();
    } else if (typeof spawnNewMonster === "function") {
      spawnNewMonster();
    }
    return;
  }

  // 多體：記錄出手前有哪些怪還活著，用來判斷這一招打死了幾隻
  let preAliveFlags = null;
  if (Array.isArray(monsters) && monsters.length > 0) {
    preAliveFlags = [];
    for (let pi = 0; pi < monsters.length; pi++) {
      const pm = monsters[pi];
      preAliveFlags[pi] = !!(pm && pm.hp > 0);
    }
  }

  const r = (window.Rpg_玩家 && typeof Rpg_玩家.actOnce === "function")
    ? Rpg_玩家.actOnce()
    : { did:false };

  if (r && r.text) {
    postPlayer(r.text);
  }

  // 兼容舊檔：若玩家行動只改了 monsterHP，這裡同步回 currentMonster.hp
  if (currentMonster) {
    const cap = currentMonster.maxHp || Infinity;
    const hpFromLogic = Math.max(0, Math.min(cap, monsterHP));
    const hpFromSource = isFinite(currentMonster.hp)
      ? Math.max(0, Math.min(cap, Number(currentMonster.hp)))
      : hpFromLogic;
    const merged = Math.min(hpFromLogic, hpFromSource);
    currentMonster.hp = merged;
    monsterHP = merged;
  }

  // ── 判斷這一回合打死了哪些怪 ──
  const killedMonsters = [];

  if (Array.isArray(monsters) && monsters.length > 0 && preAliveFlags) {
    // 多體模式：看哪些「原本活著」的怪現在變成 hp <= 0
    for (let i = 0; i < monsters.length && i < preAliveFlags.length; i++) {
      const m = monsters[i];
      if (!m) continue;
      if (!preAliveFlags[i]) continue;     // 本來就死的，不算這一回合
      if (m.hp <= 0) {
        killedMonsters.push(m);
      }
    }
  } else if (currentMonster && monsterHP <= 0) {
    // 單體模式：維持原本邏輯
    killedMonsters.push(currentMonster);
  }

  // ── 擊殺處理 ──
  if (killedMonsters.length === 1) {
    // ✅ 一次只死一隻：沿用原本「單體掉落訊息」行為
    const mon = killedMonsters[0];
    const wasElite = !!mon.isElite;
    const wasBoss  = !!mon.isBoss;

    // 成就
    if (window.Achievements && typeof Achievements.onKill === "function") {
      Achievements.onKill(1);
    }
    if (wasElite && window.Achievements && typeof Achievements.onEliteKill === "function") {
      Achievements.onEliteKill(1);
    }
    if (wasBoss && window.Achievements && typeof Achievements.onBossKill === "function") {
      Achievements.onBossKill(1);
    }

    const nowSecKill = _nowSec();

    // 單隻怪物掉落（沿用原本 _grantMonsterDrop，會自己發一行訊息）
    _grantMonsterDrop(mon, nowSecKill);

    // 標記死亡
    if (Array.isArray(monsters)) {
      mon.hp = 0;
    }
    if (mon === currentMonster) {
      monsterHP = mon.hp;
    }

    // 全部怪物死光 → 整波結束（重生倒數）
    if (areAllMonstersDead()) {
      _onMonsterDead(nowSecKill);
      return;
    } else {
      // 還有其他怪，切換到下一隻
      refreshCurrentMonster();
    }

  } else if (killedMonsters.length > 1) {
    // ✅ 群體技能同一招打死多隻：每隻都算掉落，但只顯示一行「總掉落」
    const nowSecKill2 = _nowSec();

    let totalGold  = 0;
    let totalStone = 0;
    let totalExp   = 0;
    const itemMap    = Object.create(null); // { itemName: count }

    for (let k = 0; k < killedMonsters.length; k++) {
      const km = killedMonsters[k];
      const wasEliteM = !!km.isElite;
      const wasBossM  = !!km.isBoss;

      // 成就（每隻各算一次）
      if (window.Achievements && typeof Achievements.onKill === "function") {
        Achievements.onKill(1);
      }
      if (wasEliteM && window.Achievements && typeof Achievements.onEliteKill === "function") {
        Achievements.onEliteKill(1);
      }
      if (wasBossM && window.Achievements && typeof Achievements.onBossKill === "function") {
        Achievements.onBossKill(1);
      }

      // 直接在這裡算掉落 & 給獎勵（不呼叫 _grantMonsterDrop，避免多行訊息）
      const drop = (typeof getDrop === "function") ? getDrop(km) : { gold: 0, stone: 0, exp: 0, items: [] };

      // 實際給獎勵（跟 _grantMonsterDrop 內部同一套）
      if (drop.gold && typeof addGoldFromKill === "function") addGoldFromKill(drop.gold, 1);
      if (drop.stone && typeof addStone === "function") addStone(drop.stone);
      if (typeof gainExp === "function") gainExp(drop.exp || 0);

      if (window.RewardTracker && window.RewardTracker.record) {
        window.RewardTracker.record(
          { exp: drop.exp || 0, gold: drop.gold || 0, stone: drop.stone || 0 },
          { monster: km ? km.name : "", map: selectedMap },
          (drop.items && drop.items.slice) ? drop.items : []
        );
      }

      // 累加本次總掉落
      totalGold  += drop.gold  || 0;
      totalStone += drop.stone || 0;
      totalExp   += drop.exp   || 0;

      if (Array.isArray(drop.items)) {
        for (let di = 0; di < drop.items.length; di++) {
          const itemName = drop.items[di];
          if (!itemName) continue;
          if (!itemMap[itemName]) itemMap[itemName] = 0;
          itemMap[itemName] += 1;
        }
      }

      // 標記死亡
      if (Array.isArray(monsters)) {
        km.hp = 0;
      }
      if (km === currentMonster) {
        monsterHP = km.hp;
      }
    }

    // 組成「總掉落」訊息（只顯示一行）
    const parts = [];
    parts.push("群體技能擊敗 " + killedMonsters.length + " 隻怪物");
    parts.push("獲得 楓幣 " + totalGold);
    if (totalStone > 0) {
      parts.push("強化石 " + totalStone + " 顆");
    }
    parts.push("EXP " + totalExp);

    let itemText = "";
    const itemNames = [];
    for (const name in itemMap) {
  if (!Object.prototype.hasOwnProperty.call(itemMap, name)) continue;
  itemNames.push(name + " ×" + itemMap[name]);
}
    if (itemNames.length > 0) {
      itemText = "，並獲得 " + itemNames.join("、");
    }

    postPlayer("🎉 " + parts.join("、") + itemText);

    // 檢查是否整波結束
    if (areAllMonstersDead()) {
      _onMonsterDead(nowSecKill2);
      return;
    } else {
      refreshCurrentMonster();
    }
  }

  // 玩家死亡
  if (player.currentHP <= 0 && !isDead) {
    // 特殊 Boss 挑戰失敗（玩家死）
    if (window.SpecialBossGate && typeof SpecialBossGate.onBattleEnd === "function") {
      try { SpecialBossGate.onBattleEnd(false); } catch (e) { console.warn(e); }
    }
    if (typeof startDeathCountdown === "function") startDeathCountdown();
    return;
  }

  // UI
  const nowSec = _nowSec();
  if (typeof updateResourceUI === "function") updateResourceUI();
  if (currentMonster && typeof updateMonsterInfo === "function") {
    updateMonsterInfo(currentMonster, Math.max(monsterHP, 0), nowSec);
  }
}

// ===== 怪物出手（委派 Rpg_怪物；中控只做後續）=====
function rtMonsterAct() {
  if (isDead || !autoEnabled) return;
  if (window.BattleGate && window.BattleGate.isLocked && window.BattleGate.isLocked()) return;

  if (battleMode === "single") {
    if (!currentMonster) return;

    const nowSec = _nowSec();

    const r = (window.Rpg_怪物 && typeof Rpg_怪物.actOnce === "function")
      ? Rpg_怪物.actOnce()
      : { did:false };

    if (r && r.text) {
      postMonster(r.text);
    }

    // 玩家死亡
    if (player.currentHP <= 0 && !isDead) {
      if (window.SpecialBossGate && typeof SpecialBossGate.onBattleEnd === "function") {
        try { SpecialBossGate.onBattleEnd(false); } catch (e) { console.warn(e); }
      }
      if (typeof startDeathCountdown === "function") startDeathCountdown();
      return;
    }

    if (typeof updateResourceUI === "function") updateResourceUI();
    if (currentMonster && typeof updateMonsterInfo === "function") {
      updateMonsterInfo(currentMonster, Math.max(monsterHP, 0), nowSec);
    }
    return;
  }

  // 多體：每一隻活著的怪各跑一次 actOnce
  if (!Array.isArray(monsters) || !monsters.length) return;

  const nowSecMulti = _nowSec();

  for (let i = 0; i < monsters.length; i++) {
    const m = monsters[i];
    if (!m || m.hp <= 0) continue;

    // 暫時把 currentMonster / monsterHP 切到這一隻，讓 Rpg_怪物 使用全域
    const oldCurrent = currentMonster;
    const oldHP      = monsterHP;

    currentMonster = m;
    monsterHP      = m.hp;

    const r2 = (window.Rpg_怪物 && typeof Rpg_怪物.actOnce === "function")
      ? Rpg_怪物.actOnce()
      : { did:false };

    if (r2 && r2.text) {
      postMonster("[" + (i + 1) + "] " + r2.text);
    }

    // 同步傷害結果
    m.hp = monsterHP;

    // 還原
    currentMonster = oldCurrent;
    monsterHP      = oldHP;

    if (player.currentHP <= 0 && !isDead) {
      if (window.SpecialBossGate && typeof SpecialBossGate.onBattleEnd === "function") {
        try { SpecialBossGate.onBattleEnd(false); } catch (e) { console.warn(e); }
      }
      if (typeof startDeathCountdown === "function") startDeathCountdown();
      return;
    }
  }

  // 更新目前目標與 UI
  refreshCurrentMonster();

  if (typeof updateResourceUI === "function") updateResourceUI();
  if (currentMonster && typeof updateMonsterInfo === "function") {
    updateMonsterInfo(currentMonster, Math.max(monsterHP, 0), nowSecMulti);
  }
}

// ===== 對外（供 game_init.js 呼叫）=====
window.spawnNewMonster  = spawnNewMonster;
window.rtTickSec        = rtTickSec;
window.rtPlayerAct      = rtPlayerAct;
window.rtMonsterAct     = rtMonsterAct;
window.toggleBattleMode = toggleBattleMode;

// 舊介面（回合制）保留空函式，避免外部誤呼叫報錯
window.battleRound = function(){ /* 即時制已取代回合制 */ };



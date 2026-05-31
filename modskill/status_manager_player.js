// 📦 status_manager_player.js（玩家狀態：以「秒」為單位 + DoT 吃怪物 ATK）
// 變更重點：
// 1) DoT 改為吃「currentMonster.atk * 30%」，會自然吃到 BossCore 的攻擊 Buff / 難度已套用在 atk 的影響
// 2) 預留「難度額外 DoT 倍率」dotAtkMul（預設 1，不會重複加乘你現有的怪物 ATK 難度調整）
// 3) 機率可用 0~1 或 0~100；訊息逐條輸出；修正 ICON 名稱（用 PLAYER_ICON）
// 4) 新增 applyPlayerStatus，支援 stun / fear / silence / slow / blind 等控場

/** 產生 min~max（含）的隨機整數 */
function getRandomInt(min, max) {
  min = Math.ceil(min); max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/* ---------- 訊息/機率小工具 ---------- */
const PLAYER_ICON = {
  poison:"☠️", burn:"🔥", paralyze:"⚡", weaken:"🌀", freeze:"❄️", bleed:"🩸",
  curse:"🕯️", blind:"🙈", stun:"💫", slow:"🐌", fear:"😱", silence:"🔇"
};
const NAME_ZH     = {
  poison:"中毒", burn:"燃燒", paralyze:"麻痺", weaken:"虛弱", freeze:"凍傷", bleed:"流血",
  curse:"詛咒", blind:"致盲", stun:"暈眩", slow:"緩速", fear:"恐懼", silence:"沉默"
};

function pct(x) {
  const n = Number(x);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n <= 1 ? n * 100 : n; // 0.25 => 25，25 => 25，100 => 100
}
function say(lines) {
  if (!lines || !lines.length) return;
  for (const line of lines) {
    if (typeof window.postPlayer === 'function') postPlayer(line);
    else if (typeof logPrepend === 'function') logPrepend(line);
  }
}

/*
  ⚙️ 統一設定（全部以「秒」解讀）
  duration: 狀態持續秒數隨機範圍 [min, max]
  cooldown: 狀態冷卻秒數隨機範圍 [min, max]
  type: 'damage' | 'debuff'
  overlap: 'refresh' | 'stack'
  mAtkPct: (可選) 若想讓某狀態不是 30%，可以在這裡指定該狀態的 DoT 百分比（吃怪物 ATK）
*/
const statusConfig = {
  poison: {
    duration: [3, 5],
    cooldown: [10, 15],
    type: 'damage',
    overlap: 'refresh',
    // mAtkPct: 0.30,
    logText: (damage) => `☠️ 你中毒了，損失 ${damage} HP`,
    logTextEnd: () => `☠️ 中毒效果結束`
  },
  burn: {
    duration: [15, 25],
    cooldown: [33, 45],
    type: 'damage',
    overlap: 'refresh',
    // mAtkPct: 0.30,
    logText: (damage) => `🔥 你燃燒中，損失 ${damage} HP`,
    logTextEnd: () => `🔥 燃燒效果結束`
  },
  paralyze: {
    duration: [1, 2],
    cooldown: [15, 18],
    type: 'debuff',
    overlap: 'refresh',
    logTextEnd: () => `⚡ 麻痺效果結束`
  },
  weaken: {
    duration: [2, 4],
    cooldown: [14, 16],
    type: 'debuff',
    overlap: 'refresh',
    logTextEnd: () => `🌀 虛弱效果結束`
  },
  freeze: {
    duration: [4, 6],
    cooldown: [15, 18],
    type: 'damage',
    overlap: 'refresh',
    // mAtkPct: 0.30,
    logText: (damage) => `❄️ 凍傷造成 ${damage} 傷害`,
    logTextEnd: () => `❄️ 凍傷效果結束`
  },
  bleed: {
    duration: [3, 5],
    cooldown: [14, 16],
    type: 'damage',
    overlap: 'stack',
    // mAtkPct: 0.30,
    logText: (damage) => `🩸 流血造成 ${damage} 傷害`,
    logTextEnd: () => `🩸 流血效果結束`
  },
  // ========= 新增的控場 / Debuff =========
  stun: {
    duration: [1, 2],
    cooldown: [8, 12],
    type: 'debuff',
    overlap: 'refresh',
    logTextEnd: () => `💫 暈眩效果結束`
  },
  slow: {
    duration: [3, 5],
    cooldown: [10, 14],
    type: 'debuff',
    overlap: 'refresh',
    logTextEnd: () => `🐌 緩速效果結束`
  },
  blind: {
    duration: [3, 5],
    cooldown: [12, 16],
    type: 'debuff',
    overlap: 'refresh',
    logTextEnd: () => `🙈 致盲效果結束`
  },
  fear: {
    duration: [2, 3],
    cooldown: [12, 16],
    type: 'debuff',
    overlap: 'refresh',
    logTextEnd: () => `😱 恐懼效果結束`
  },
  silence: {
    duration: [2, 3],
    cooldown: [12, 16],
    type: 'debuff',
    overlap: 'refresh',
    logTextEnd: () => `🔇 沉默效果結束`
  },
  curse: {
    duration: [10, 15],
    cooldown: [20, 30],
    type: 'debuff',
    overlap: 'refresh',
    logTextEnd: () => `🕯️ 詛咒效果結束`
  }
};

// === 預設 DoT 百分比（吃怪物 ATK 的 30%）
const DEFAULT_DOT_PCT = 0.30;

/**
 * 怪物對玩家施加狀態（冷卻/持續皆以「秒」計）
 * - 機率同時支援 0~1 或 0~100
 * - 訊息逐條輸出
 * - 走「怪物被動/異常表」用：monster.poison / monster.poisonChance 之類
 */
function applyStatusFromMonster(monster) {
  if (!monster || !player) return;

  player.statusEffects  ||= {};
  player.statusCooldown ||= {};

  const logs = [];

  for (const status in statusConfig) {
    const cfg = statusConfig[status];
    const has = monster[status] || (monster.extra && monster.extra[status]);

    // 機率：允許 0.25 或 25
    const rawChance  = monster[status + 'Chance'] ?? (monster.extra && monster.extra[status + 'Chance']) ?? 0;
    const chancePct  = pct(rawChance);

    // 具備、通過機率、且不在冷卻
    if (has && (Math.random() * 100 < chancePct) && !player.statusCooldown[status]) {
      const [dMin, dMax] = cfg.duration;
      const [cMin, cMax] = cfg.cooldown;
      const newSecs = getRandomInt(dMin, dMax);

      if (cfg.overlap === 'stack') {
        player.statusEffects[status] = (player.statusEffects[status] || 0) + newSecs;
        logs.push(`${PLAYER_ICON[status] || "✨"} ${monster.name} 對你施加【${NAME_ZH[status] || status}】（+${newSecs}s）`);
      } else {
        player.statusEffects[status] = newSecs;
        logs.push(`${PLAYER_ICON[status] || "✨"} ${monster.name} 對你施加【${NAME_ZH[status] || status}】（${newSecs}s）`);
      }

      // 設定冷卻
      player.statusCooldown[status] = getRandomInt(cMin, cMax);
    }
  }

  if (logs.length > 0) say(logs);
}

/**
 * 主動施加狀態給玩家（例如一般怪技能的控場）
 * - 由技能直接呼叫：applyPlayerStatus("stun", 2)
 * - 會套用 statusConfig 的 overlap / cooldown 設定
 */
function applyPlayerStatus(status, durationSec) {
  if (!player) return;
  player.statusEffects  ||= {};
  player.statusCooldown ||= {};

  const cfg = statusConfig[status] || {
    duration: [durationSec || 1, durationSec || 1],
    cooldown: [1, 1],
    type: 'debuff',
    overlap: 'refresh'
  };

  // 若在冷卻中，就不再附加（避免一直被無限暈鎖）
  if (player.statusCooldown[status] && player.statusCooldown[status] > 0) {
    return;
  }

  const [dMin, dMax] = cfg.duration;
  const [cMin, cMax] = cfg.cooldown;

  const addSecs = durationSec && durationSec > 0
    ? Math.floor(durationSec)
    : getRandomInt(dMin, dMax);

  if (cfg.overlap === 'stack') {
    player.statusEffects[status] = (player.statusEffects[status] || 0) + addSecs;
  } else {
    // refresh 模式：取較大的剩餘秒數
    const cur = Number(player.statusEffects[status] || 0);
    player.statusEffects[status] = Math.max(cur, addSecs);
  }

  // 設定冷卻（技能型 CC 也共用同一組 cooldown 範圍）
  player.statusCooldown[status] = getRandomInt(cMin, cMax);

  const icon = PLAYER_ICON[status] || "✨";
  const name = NAME_ZH[status] || status;
  say([`${icon} 你受到【${name}】效果（${addSecs}s）`]);
}

/**
 * 每秒處理玩家狀態效果
 * - DoT = currentMonster.atk * (每狀態 mAtkPct 或預設 30%)
 * - 若你想讓難度再「額外」影響 DoT，請在 difficulty PRESET 加 dotAtkMul（不加就不變）
 *   例：normal: { ..., dotAtkMul: 1.0 }, hell: { ..., dotAtkMul: 1.25 }
 */
function processPlayerStatusEffects() {
  if (!player.statusEffects) return;

  const logs = [];

  // 1) 讀取怪物當前 ATK（BossCore 套過面板後的值）
  const m = window.currentMonster || null;
  const monsterAtkBase = Math.max(0, Number(m?.atk ?? m?.baseAtk ?? 0));

  // 2) 讀取「難度額外 DoT 倍率」，預設 1（避免和你原本已對怪物 ATK 做的難度加成重複）
  const diff = (typeof window.getCurrentDifficulty === 'function') ? window.getCurrentDifficulty() : null;
  const dotDiffMul = Number(diff?.dotAtkMul ?? 1) || 1;

  // 實際 DoT 使用的 ATK
  const monsterAtkForDot = Math.floor(monsterAtkBase * dotDiffMul);

  for (const status in player.statusEffects) {
    const cfg = statusConfig[status];
    const secsLeft = player.statusEffects[status];

    if (secsLeft > 0) {
      if (cfg && cfg.type === 'damage') {
        // 3) 每種狀態自己的百分比（沒有就走 DEFAULT_DOT_PCT）
        const rate = (typeof cfg.mAtkPct === 'number') ? Math.max(0, cfg.mAtkPct) : DEFAULT_DOT_PCT;
        const damage = Math.floor(monsterAtkForDot * rate);

        if (damage > 0) {
          player.currentHP = Math.max(0, (player.currentHP || 0) - damage);
          logs.push(cfg.logText ? cfg.logText(damage) : `${NAME_ZH[status] || status} 造成 ${damage} 傷害`);
        }
      }

      // 倒數 1 秒
      player.statusEffects[status] = secsLeft - 1;

      // 結束訊息
      if (player.statusEffects[status] <= 0) {
        if (cfg?.logTextEnd) logs.push(cfg.logTextEnd());
        delete player.statusEffects[status];
      }
    }
  }

  // 冷卻以秒遞減
  if (player.statusCooldown) {
    for (const status in player.statusCooldown) {
      if (player.statusCooldown[status] > 0) {
        player.statusCooldown[status]--;
        if (player.statusCooldown[status] <= 0) {
          delete player.statusCooldown[status];
        }
      }
    }
  }

  if (logs.length > 0) say(logs);
  if (typeof updateResourceUI === 'function') updateResourceUI(); // 讓 HP 變化馬上反映
}

// 對外（可保留你原本的全域名稱）
window.applyStatusFromMonster   = applyStatusFromMonster;
window.processPlayerStatusEffects = processPlayerStatusEffects;
window.applyPlayerStatus        = applyPlayerStatus;
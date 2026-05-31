// === Playerbuff.js ===
// 玩家狀態處理（護盾、閃避、回復增益等）＋ 技能增益過期檢查
// ⚠️ 注意：這份檔案不再定義 autoUseSkills，避免覆蓋玩家技能中控版本。

function applyPlayerStatusEffects() {
  if (!player.statusEffects) return;
  
  let effectsLog = "";
  
  // 護盾倒數
  if (player.statusEffects.shield && player.statusEffects.shield.turns > 0) {
    player.statusEffects.shield.turns--;
    if (player.statusEffects.shield.turns === 0) {
      effectsLog += "🛡️ 護盾效果已結束<br>";
      delete player.statusEffects.shield;
    }
  }
  
  // 閃避倒數
  if (player.statusEffects.evasion && player.statusEffects.evasion.turns > 0) {
    player.statusEffects.evasion.turns--;
    if (player.statusEffects.evasion.turns === 0) {
      effectsLog += "💨 閃避強化已結束<br>";
      delete player.statusEffects.evasion;
    }
  }
  
  // 回復增益倒數
  if (player.statusEffects.healBoost && player.statusEffects.healBoost.turns > 0) {
    player.statusEffects.healBoost.turns--;
    if (player.statusEffects.healBoost.turns === 0) {
      effectsLog += "💖 回復增益已結束<br>";
      delete player.statusEffects.healBoost;
    }
  }
  
  // 其他狀態…（保留擴充位）
  
  if (effectsLog) logPrepend(effectsLog);
}

// ✅ 技能加成效果過期檢查（維持時間制 buff 的到期清理）
function checkExpiredSkillBuffs() {
  const now = Date.now();
  
  // 檢查所有技能
  if (!Array.isArray(skills)) return;
  skills.forEach(skill => {
    if (skill.type === "buff" && skill.activeUntil && now > skill.activeUntil) {
      // 清理與紀錄
      player.skillBonus.atkPercent = 0;
      player.skillBonus.defPercent = 0;
      
      if (player.statusEffects) {
        delete player.statusEffects.atkBoost;
        delete player.statusEffects.defBoost;
      }
      
      skill.activeUntil = 0;
      if (typeof skill.expire === "function") {
        try { skill.expire(); } catch {}
      }
      logPrepend(`⏳ ${skill.name} 效果結束。`);
    }
  });
}

// ⛔ 重要：這份檔案不要定義 autoUseSkills！
// 如要保留歷史版本供參考，請用不同名稱，且不要被任何地方呼叫。
// function autoUseSkills_legacy(monster) { /* 你的舊內容（禁用） */ }
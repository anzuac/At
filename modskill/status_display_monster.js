function getMonsterBuiltInEffects(monster) {
  const builtInEffects = [];

  if (monster.poison) builtInEffects.push(`☠️ 中毒（${monster.poisonChance}%）`);
  if (monster.burn) builtInEffects.push(`🔥 燃燒（${monster.burnChance}%）`);
  if (monster.paralyze) builtInEffects.push(`⚡ 麻痺（${monster.paralyzeChance}%）`);
  if (monster.weaken) builtInEffects.push(`🌀 虛弱（${monster.weakenChance}%）`);
  if (monster.freeze) builtInEffects.push(`❄️ 凍傷（${monster.freezeChance}%）`);
  if (monster.bleed) builtInEffects.push(`🩸 流血（${monster.bleedChance}%）`);
  if (monster.curse) builtInEffects.push(`🧿 詛咒（${monster.curseChance}%）`);
  if (monster.blind) builtInEffects.push(`🌫️ 致盲（${monster.blindChance}%）`);
  if (monster.dodgePercent > 0) builtInEffects.push(`💨 閃避率 ${monster.dodgePercent.toFixed(1)}%`);

  return builtInEffects.length > 0 ? builtInEffects.join("、") : "無";
}

function getMonsterAbnormalEffects(monster) {
  const se = monster.statusEffects || {};
  const abnormalEffects = [];
  
  if (se.poison > 0) abnormalEffects.push(`☠️ 中毒(${se.poison})`);
  if (se.burn > 0) abnormalEffects.push(`🔥 燃燒(${se.burn})`);
  if (se.paralyze > 0) abnormalEffects.push(`⚡ 麻痺(${se.paralyze})`);
  if (se.weaken > 0) abnormalEffects.push(`🌀 虛弱(${se.weaken})`);
  if (se.freeze > 0) abnormalEffects.push(`❄️ 凍傷(${se.freeze})`);
  if (se.bleed > 0) abnormalEffects.push(`🩸 流血(${se.bleed})`);
  if (se.curse > 0) abnormalEffects.push(`🧿 詛咒(${se.curse})`);
  if (se.blind > 0) abnormalEffects.push(`🌫️ 致盲(${se.blind})`);
  
  return abnormalEffects.length > 0 ? abnormalEffects.join("、") : "無";
}

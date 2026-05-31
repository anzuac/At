//resources.js



// 金幣（任意來源）
window.addGold = function(amount){
  if (!amount) return;
  player.gold = (player.gold||0) + amount;
  if (amount > 0) DM_onGoldGained && DM_onGoldGained(amount);
  updateResourceUI && updateResourceUI();
  
  // ====== 自動存檔 ======
  saveGame();
};

// 強化石（任意來源）
window.addStone = function(amount){
  if (!amount) return;
  player.stone = (player.stone||0) + amount;
  if (amount > 0) DM_onStoneGained && DM_onStoneGained(amount);
  updateResourceUI && updateResourceUI();
  
  // ====== 自動存檔 ======
  saveGame();
};

// 鑽石（任意來源，拿到鑽石時用；重複任務只需偵測「消費」，這個純加值）
window.addDiamond = function(amount){
  if (!amount) return;
  player.gem = (player.gem||0) + amount;
  updateResourceUI && updateResourceUI();
  
  // ====== 自動存檔 ======
  saveGame();
};

// 打怪專用（同時計入「擊殺數」+「金幣獲得」）
window.addGoldFromKill = function(amount, kills){
  if (amount) {
    player.gold = (player.gold||0) + amount;
    if (amount > 0) DM_onGoldGained && DM_onGoldGained(amount);
  }
  DM_onMonsterKilled && DM_onMonsterKilled(Math.max(1, kills||1));
  updateResourceUI && updateResourceUI();
  
  // ====== 自動存檔 ======
  saveGame();
};

// 鑽石消費（唯一出口）
window.spendDiamond = function(amount){
  amount = amount|0;
  if (amount <= 0) return false;
  if ((player.gem|0) < amount) return false;
  player.gem -= amount;
  RM_onDiamondSpent && RM_onDiamondSpent(amount);  // 重複任務：消費累積
  updateResourceUI && updateResourceUI();
  
  // ====== 自動存檔 ======
  saveGame();
  
  return true;
};

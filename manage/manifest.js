// 統一定義版本字串，使用當前時間戳記來強制更新快取
window.LOADER_VER = new Date().getTime();

// 依順序定義所有腳本檔案
window.MANIFEST = {
  scripts: [
    // === stats ===
    "stats_system/player.js",
    "stats_system/resources.js",
    "stats_system/jobs.js",
    "stats_system/main.js",
    "logic/rpg/rpg.js", // 這裡將 rpg.js 移到比較早的位置，因為它可能是一些核心邏輯

    // === map / monster ===
    "map/map_data.js",
    "map/monster_data.js",
    "map/monster_utils.js",
    "map/elite_monsters.js",
    "map/difficulty.js",

    // === item ===
    "item/inventory.js",
    "item/shop_system.js",


    // === element equipment (新) ===
    "equipment2/element_equipment.js",
    "equipment2/element_upgrade.js",
    "equipment2/element_advance.js",
    "equipment2/element_starforce.js",
    "equipment2/element_breakthrough.js",

    // === others ===
    "clover/clover.js",

    // === recover & monster status ===
    "recovery/recovery_module.js",
    "modskill/status_manager_player.js",
    "skill/player_buffs.js",
    "modskill/monster_skills.js",
    "modskill/status_display_monster.js",
    "modskill/monster_buffs.js",

    // === UI/logic ===


// ... 其他檔案 ...

// === skills ===
// 1. 最核心的 UI 控制邏輯，它定義了技能系統的基礎框架
"skill/ui.js",

// 2. 接著載入技能控制器，它會依賴 UI 核心來讀取技能
"skill/skills_controller.js",

// 3. 最後才載入各種職業和通用技能的資料，這些檔案會被控制器讀取
"skill/skills_common.js",
"skill/skills_warrior.js",
"skill/skills_mage.js",
"skill/skills_archer.js",
"skill/skills_thief.js",

// ... 其他檔案 ...



    // === quests & misc ===
    "quest/mission_rewards.js",
    "quest/quest_core_es5.js",
    "quest/quest_weekly_es5.js",
    "quest/quest_daily_es5.js",
    "quest/quest_repeat_es5.js",
    "floating.js",
    
    // 將 game_init.js 放在最後載入，確保其他檔案都已準備就緒
    "logic/game_init.js",
    "test_mode.js",
    "dev_tools.js"
  ]
};


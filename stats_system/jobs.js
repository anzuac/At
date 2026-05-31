const jobs = {
  // === 一轉：父系（創角選擇） ===
  warrior: {
    name: "戰士",
    statMultipliers: { str: 1.1, agi: 0.2, int: 0, luck: 0 }
  },
  mage: {
    name: "法師",
    statMultipliers: { str: 0, agi: 0, int: 1.1, luck: 0.2 }
  },
  archer: {
    name: "弓箭手",
    statMultipliers: { str: 0.2, agi: 1.1, int: 0, luck: 0 }
  },
  thief: {
    name: "盜賊",
    statMultipliers: { str: 0, agi: 0.2, int: 0, luck: 1.1 }
  },
  
  // ======================
  // 戰士 → 狂戰士線
  // ======================
  warrior_berserker2: {
    name: "狂戰士",
    parent: "warrior",
    statMultipliers: { str: 1.5, agi: 0.4, int: 0, luck: 0 }
  },
  warrior_berserker3: {
    name: "狂戰將軍",
    parent: "warrior_berserker2",
    statMultipliers: { str: 1.7, agi: 0.5, int: 0, luck: 0 }
  },
  warrior_berserker4: {
    name: "狂戰霸主",
    parent: "warrior_berserker3",
    statMultipliers: { str: 2, agi: 0.6, int: 0, luck: 0 }
  },
  warrior_berserker5: {
    name: "狂戰戰皇",
    parent: "warrior_berserker4",
    statMultipliers: { str: 2.4, agi: 0.8, int: 0, luck: 0 }
  },
  warrior_berserker6: {
    name: "狂戰魔神",
    parent: "warrior_berserker5",
    statMultipliers: { str: 2.8, agi: 1.0, int: 0, luck: 0 }
  },
  
  // 戰士 → 盾騎士線
  warrior_guardian2: {
    name: "盾騎士",
    parent: "warrior",
    statMultipliers: { str: 1.4, agi: 0.5, int: 0, luck: 0 }
  },
  warrior_guardian3: {
    name: "聖盾騎士",
    parent: "warrior_guardian2",
    statMultipliers: { str: 1.6, agi: 0.6, int: 0, luck: 0 }
  },
  warrior_guardian4: {
    name: "鋼鐵聖盾",
    parent: "warrior_guardian3",
    statMultipliers: { str: 1.9, agi: 0.7, int: 0, luck: 0 }
  },
  warrior_guardian5: {
    name: "堅壁聖衛",
    parent: "warrior_guardian4",
    statMultipliers: { str: 2.3, agi: 0.9, int: 0, luck: 1.0 }
  },
  warrior_guardian6: {
    name: "永恆聖盾",
    parent: "warrior_guardian5",
    statMultipliers: { str: 2.7, agi: 1.1, int: 0, luck: 0 }
  },
  
  // ======================
  // 法師 → 牧師線
  // ======================
  mage_priest2: {
    name: "牧師",
    parent: "mage",
    statMultipliers: { str: 0, agi: 0, int: 1.5, luck: 0.4 }
  },
  mage_priest3: {
    name: "聖光牧師",
    parent: "mage_priest2",
    statMultipliers: { str: 0, agi: 0, int: 1.7, luck: 0.5 }
  },
  mage_priest4: {
    name: "神聖主教",
    parent: "mage_priest3",
    statMultipliers: { str: 0, agi: 0, int: 2, luck: 0.6 }
  },
  mage_priest5: {
    name: "聖潔大主教",
    parent: "mage_priest4",
    statMultipliers: { str: 0, agi: 0, int: 2.4, luck: 0.8 }
  },
  mage_priest6: {
    name: "神選聖導師",
    parent: "mage_priest5",
    statMultipliers: { str: 0, agi: 0, int: 2.8, luck: 1 }
  },
  
  // 法師 → 元素師線
  mage_elementalist2: {
    name: "元素師",
    parent: "mage",
    statMultipliers: { str: 0, agi: 0, int: 1.6, luck: 0.3 }
  },
  mage_elementalist3: {
    name: "高等元素師",
    parent: "mage_elementalist2",
    statMultipliers: { str: 0, agi: 0, int: 1.8, luck: 0.4 }
  },
  mage_elementalist4: {
    name: "元素宗師",
    parent: "mage_elementalist3",
    statMultipliers: { str: 0, agi: 0, int: 2.1, luck: 0.5 }
  },
  mage_elementalist5: {
    name: "星界元素王",
    parent: "mage_elementalist4",
    statMultipliers: { str: 0, agi: 0, int: 2.6, luck: 0.6 }
  },
  mage_elementalist6: {
    name: "萬象法神",
    parent: "mage_elementalist5",
    statMultipliers: { str: 0, agi: 0, int: 3.1, luck: 0.7 }
  },
  
  // ======================
  // 弓箭手 → 神射手線
  // ======================
  archer_marksman2: {
    name: "神射手",
    parent: "archer",
    statMultipliers: { str: 0.4, agi: 1.5, int: 0, luck: 0 }
  },
  archer_marksman3: {
    name: "狙擊神手",
    parent: "archer_marksman2",
    statMultipliers: { str: 0.5, agi: 1.7, int: 0, luck: 0}
  },
  archer_marksman4: {
    name: "獵隼之眼",
    parent: "archer_marksman3",
    statMultipliers: { str: 0.6, agi: 2, int: 0, luck: 0 }
  },
  archer_marksman5: {
    name: "天穹狙神",
    parent: "archer_marksman4",
    statMultipliers: { str: 0.7, agi: 2.5, int: 0, luck: 0 }
  },
  archer_marksman6: {
    name: "星辰神射王",
    parent: "archer_marksman5",
    statMultipliers: { str: 0.8, agi: 3, int: 0, luck: 0 }
  },
  
  // 弓箭手 → 精靈射手線
  archer_elf2: {
    name: "精靈射手",
    parent: "archer",
    statMultipliers: { str: 0.3, agi: 1.6, int: 0, luck: 0 }
  },
  archer_elf3: {
    name: "森林狩手",
    parent: "archer_elf2",
    statMultipliers: { str: 0.4, agi: 1.8, int: 0, luck: 0 }
  },
  archer_elf4: {
    name: "林間遊俠",
    parent: "archer_elf3",
    statMultipliers: { str: 0.5, agi: 2.1, int: 0, luck: 0 }
  },
  archer_elf5: {
    name: "精靈遊俠王",
    parent: "archer_elf4",
    statMultipliers: { str: 0.6, agi: 2.6, int: 0, luck: 0 }
  },
  archer_elf6: {
    name: "自然守護神射",
    parent: "archer_elf5",
    statMultipliers: { str: 0.7, agi: 3.1, int: 0, luck: 0 }
  },
  
  // ======================
  // 盜賊 → 刺客線
  // ======================
  thief_assassin2: {
    name: "刺客",
    parent: "thief",
    statMultipliers: { str: 0, agi: 0.3, int: 0, luck: 1.6 }
  },
  thief_assassin3: {
    name: "暗影刺客",
    parent: "thief_assassin2",
    statMultipliers: { str: 0, agi: 0.4, int: 0, luck: 1.8 }
  },
  thief_assassin4: {
    name: "血刃夜行者",
    parent: "thief_assassin3",
    statMultipliers: { str: 0, agi: 0.6, int: 0, luck: 2 }
  },
  thief_assassin5: {
    name: "幻影刺皇",
    parent: "thief_assassin4",
    statMultipliers: { str: 0, agi: 0.7, int: 0, luck: 2.5 }
  },
  thief_assassin6: {
    name: "審判暗神",
    parent: "thief_assassin5",
    statMultipliers: { str: 0, agi: 0.8, int: 0, luck: 3 }
  },
  
  // 盜賊 → 影武者線
  thief_shadow2: {
    name: "影武者",
    parent: "thief",
    statMultipliers: { str: 0.2, agi: 0.2, int: 0, luck: 1.5 }
  },
  thief_shadow3: {
    name: "幻影影武者",
    parent: "thief_shadow2",
    statMultipliers: { str: 0.3, agi: 0.3, int: 0, luck: 1.6 }
  },
  thief_shadow4: {
    name: "朧月忍者",
    parent: "thief_shadow3",
    statMultipliers: { str: 0.4, agi: 0.4, int: 0, luck: 1.8 }
  },
  thief_shadow5: {
    name: "暗影之王",
    parent: "thief_shadow4",
    statMultipliers: { str: 0.5, agi: 0.5, int: 0, luck: 2.2 }
  },
  thief_shadow6: {
    name: "萬影魔皇",
    parent: "thief_shadow5",
    statMultipliers: { str: 0.6, agi: 0.6, int: 0, luck: 2.6 }
  }
};

window.jobs = jobs;
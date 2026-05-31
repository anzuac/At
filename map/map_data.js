// ✅ 模組化怪物系統重構版（含自動轉換屬性區間）map_

const mapOptions = [
  { label: "全部地區", value: "all", minLevel: 1, defBasePct: 0.10, monsterMin: 5, monsterMax: 14 },
  
  { label: "森林地區", value: "forest", minLevel: 10, defBasePct: 0.15, monsterMin: 2, monsterMax: 5 },
  { label: "沼澤地區", value: "swamp", minLevel: 20, defBasePct: 0.20, monsterMin: 2, monsterMax: 5 },
  { label: "熔岩地區", value: "lava", minLevel: 30, defBasePct: 0.20, monsterMin: 2, monsterMax: 5 },
  { label: "天水之境", value: "aqua", minLevel: 40, defBasePct: 0.20, monsterMin: 2, monsterMax: 5 },
  { label: "風靈山巔", value: "wind", minLevel: 50, defBasePct: 0.25, monsterMin: 2, monsterMax: 5 },
  { label: "雷光之域", value: "lightning", minLevel: 60, defBasePct: 0.25, monsterMin: 2, monsterMax: 5 },
  { label: "冰霜谷地", value: "ice", minLevel: 70, defBasePct: 0.25, monsterMin: 2, monsterMax: 5 },
  { label: "黯影森林", value: "shadow", minLevel: 80, defBasePct: 0.25, monsterMin: 2, monsterMax: 5 },
  { label: "煉獄深淵", value: "hell", minLevel: 90, defBasePct: 0.25, monsterMin: 2, monsterMax: 5 },
  { label: "聖光神殿", value: "holy", minLevel: 100, defBasePct: 0.25, monsterMin: 2, monsterMax: 5 },
  { label: "核心地區", value: "core", minLevel: 110, defBasePct: 0.30, monsterMin: 2, monsterMax: 5 },
  { label: "未知地區", value: "max", minLevel: 1000, defBasePct: 12.20, monsterMin: 2, monsterMax: 5 }
];

const levelRangeOptions = Array.from({ length: 2000 }, (_, i) => {
  const start = i * 10 + 1;
  const end = Math.min(start + 9, 20000);
  return { label: `等級 ${start}～${end}`, value: `${start}-${end}` };
});


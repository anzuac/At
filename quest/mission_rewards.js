// 任務獎勵配置（共用）— 新版（請先載入此檔，再載 quest_*）
var missionRewards = {
  // 每 6 小時會從此池中抽任務（每次最多新增 3 個，未領任務到 10 個就不補）
  dailyTemplates: [
    {
      templateId: "kill",
      type: "kills",
      targetMin: 5,
      targetMax: 20,
      buildName: function(target){ return "擊敗 " + target + " 隻怪"; }
    },
    {
      templateId: "gold",
      type: "goldGain",
      targetMin: 100,
      targetMax: 300,
      buildName: function(target){ return "獲得金幣 " + target; }
    },
    {
      templateId: "stone",
      type: "stoneGain",
      targetMin: 10,
      targetMax: 50,
      buildName: function(target){ return "獲得強化石 " + target; }
    }
  ],

  // 每週：沿用你原設計（里程碑）
  weekly: [
    { target:  5, rewards: [ {type:"diamond",amount:5},                  {type:"medal",amount:5} ] },
    { target: 10, rewards: [ {type:"item", key:"高級探索券", amount:5},  {type:"medal",amount:5} ] },
    { target: 15, rewards: [ {type:"diamond",amount:10},                 {type:"medal",amount:5} ] },
    { target: 20, rewards: [ {type:"item", key:"高級探索券", amount:10}, {type:"medal",amount:10} ] },
    { target: 25, rewards: [ {type:"diamond",amount:15},                 {type:"medal",amount:10} ] },
    { target: 30, rewards: [ {type:"item", key:"sp點數券", amount:5},    {type:"medal",amount:10} ] },
    { target: 35, rewards: [ {type:"item", key:"技能強化券", amount:3},   {type:"medal",amount:10} ] },
    { target: 40, rewards: [ {type:"item", key:"高級探索券", amount:20}, {type:"medal",amount:20} ] },
    { target: 45, rewards: [ {type:"item", key:"鑽石抽獎券", amount:5} ] },
    { target: 50, rewards: [ {type:"item", key:"sp點數券", amount:5},    {type:"item", key:"高級探索券", amount:20} ] }
  ]
};
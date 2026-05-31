// ======================================================
// CardSystem_Full_SingleFile.js
// 完整單檔版本：抽卡 / 強化 / 潛能 / UI / SaveHub保護
// ======================================================
(function(w,d){
"use strict";

// =========================
// 設定與常量
// =========================
const NS = "player_cards_v3";
const RANKS = ["特殊","稀有","罕見","傳說","唯一"];
const CARD_CONF = {特殊:{max:5,shard:2},稀有:{max:10,shard:5},罕見:{max:15,shard:10},傳說:{max:20,shard:20},唯一:{max:30,shard:100}};
const CARD_NAMES = {特殊:"新兵冒險者",稀有:"資深守衛",罕見:"王國騎士",傳說:"大魔導師",唯一:"創世英雄"};
const JUMP_RATE = {稀有:20,罕見:10,傳說:1.5,唯一:0.3};
const MULT = {特殊:1,稀有:2,罕見:3,傳說:4,唯一:5};

// =========================
// SaveHub 初始化保護
// =========================
function fresh(){return {diamonds:10000,owned:{}};}
if(w.SaveHub){w.SaveHub.registerNamespaces({[NS]:{version:1,migrate:o=>o||fresh()}});}
function load(){let d=w.SaveHub.get(NS);if(!d){d=fresh();w.SaveHub.set(NS,d);}return d;}
function save(d){w.SaveHub.set(NS,d);updateBonus();}

// =========================
// 潛能抽取
// =========================
function downgrade(g){const i=RANKS.indexOf(g);if(i<=0)return["特殊","特殊","特殊"];return[g,RANKS[i-1],RANKS[i-1]];}
function rollStat(grade){
    const m=MULT[grade];let r=Math.random()*100,c=0;
    const pick=(k,v,p=true)=>({key:k,value:v*(p?m:1),isPercent:p});
    c+=3.3;if(r<c){const s=["strPct","agiPct","intPct","lukPct"];return pick(s[Math.floor(Math.random()*4)],3);}
    c+=2.7;if(r<c)return pick("allStatPct",2);
    c+=1.6;if(r<c)return pick("atkPct",3);
    c+=2.2;if(r<c)return pick("defPct",3);
    c+=3;if(r<c)return pick("hpPct",6);
    c+=2;if(r<c){const t=["normalDamagePct","eliteDamagePct","bossDamagePct"];return pick(t[Math.floor(Math.random()*3)],3);}
    c+=4;if(r<c)return pick("critRatePct",3);
    c+=3;if(r<c)return pick("critMultiplierPct",4);
    c+=2.7;if(r<c)return pick("dodgePercent",2);
    c+=5;if(r<c){const b=["dropBonusPct","expBonusPct","goldBonusPct"];return pick(b[Math.floor(Math.random()*3)],5);}
    c+=2;if(r<c)return pick("attackSpeedPct",5);
    const flat=[["str",7],["agi",7],["int",7],["luk",7],["allStatFlat",6],["atk",10],["def",15],["hp",800]];
    const f=flat[Math.floor(Math.random()*flat.length)];
    return {key:f[0],value:f[1],isPercent:false};
}

// =========================
// 核心系統
// =========================
w.CardSystem={
    draw(){
        const d=load();
        if(d.diamonds<300)return alert("鑽石不足");
        d.diamonds-=300;
        let r=Math.random()*100,g="特殊";
        if(r<0.01)g="唯一";else if(r<1)g="傳說";else if(r<10)g="罕見";else if(r<30)g="稀有";
        const n=CARD_NAMES[g];
        if(d.owned[n])w.addItem("卡牌碎片",CARD_CONF[g].shard);
        else d.owned[n]={name:n,rank:g,level:0,fail:0,potentials:[{grade:"特殊",stat:null},{grade:"特殊",stat:null},{grade:"特殊",stat:null}]};
        save(d);
    },
    enhance(name){
        const d=load(),c=d.owned[name];if(!c)return;if(c.level>=CARD_CONF[c.rank].max)return alert("已達上限");
        if(w.getItemQuantity("卡牌碎片")<20)return alert("碎片不足");removeItem("卡牌碎片",20);
        const rate=Math.min(10+c.fail*2,70);Math.random()*100<rate?(c.level++,c.fail=0):c.fail++;
        save(d);
    },
    rollPotential(name){
        const d=load(),c=d.owned[name];if(!c)return;if(w.getItemQuantity("潛能方塊")<1)return alert("方塊不足");
        removeItem("潛能方塊",1);let fg="特殊";["唯一","傳說","罕見","稀有"].forEach(g=>{if(RANKS.indexOf(g)<=RANKS.indexOf(c.rank)&&Math.random()*100<JUMP_RATE[g]&&fg==="特殊")fg=g;});
        c.potentials=downgrade(fg).map(g=>({grade:g,stat:rollStat(g)}));save(d);
    }
};

// =========================
// 數值聚合
// =========================
function updateBonus(){
    if(!w.coreBonus||!w.PotentialBonus)return;
    const d=load();
    const core={atk:0,def:0,hp:0,mp:0},pot={};
    Object.values(d.owned).forEach(c=>{
        core.atk+=c.level*5;core.def+=c.level*5;core.hp+=c.level*50;core.mp+=c.level*5;
        c.potentials.forEach(p=>{if(!p.stat)return;pot[p.stat.key]=(pot[p.stat.key]||0)+p.stat.value;});
    });
    w.coreBonus.bonusData.card_enhance=core;
    w.PotentialBonus.bonusData.card_potential=pot;
}
setTimeout(updateBonus,300);

// =========================
// UI
// =========================
w.CardSystemUI={
    root:null,sel:null,
    open(){
        if(this.root)return;
        const r=d.createElement("div");r.id="card-ui-root";
        r.style.position="fixed";r.style.inset="5%";r.style.background="rgba(10,10,20,0.98)";r.style.color="#fff";r.style.zIndex=9999;r.style.display="flex";r.style.flexDirection="row";
        r.innerHTML=`<div style="width:30%;overflow:auto;"><h3>卡牌列表</h3><div id="card-list"></div></div><div style="flex:1;overflow:auto;"><h3>詳情</h3><div id="card-detail">請選擇卡牌</div></div><button id="card-close" style="position:absolute;top:5px;right:10px;">×</button>`;
        d.body.appendChild(r);this.root=r;
        r.querySelector("#card-close").onclick=()=>this.close();
        this.renderList();
    },
    close(){if(this.root)this.root.remove();this.root=null;this.sel=null;},
    renderList(){
        const list=this.root.querySelector("#card-list");list.innerHTML="";
        const d=load();
        Object.values(d.owned||{}).forEach(c=>{
            const e=d.createElement("div");e.textContent=`${c.name}【${c.rank}】`;e.style.padding="4px";e.style.borderBottom="1px solid #333";e.style.cursor="pointer";
            e.onclick=()=>{this.sel=c.name;this.renderDetail();};
            list.appendChild(e);
        });
    },
    renderDetail(){
        const box=this.root.querySelector("#card-detail");const d=load();const c=d.owned[this.sel];if(!c)return;
        box.innerHTML=`<div>${c.name}</div><div>Lv.${c.level}</div><ul>${c.potentials.map(p=>{if(!p.stat)return`<li>${p.grade} 未洗</li>`;return`<li style="color:${p.grade==='稀有'?'#5af':p.grade==='罕見'?'#a5f':p.grade==='傳說'?'#fa5':p.grade==='唯一'?'#f55':'#aaa'}">${p.grade} ${p.stat.key}+${p.stat.value}${p.stat.isPercent?"%":""}</li>`}).join("")}</ul><button id="e">強化</button><button id="r">洗潛能</button>`;
        box.querySelector("#e").onclick=()=>{w.CardSystem.enhance(c.name);this.renderDetail();};
        box.querySelector("#r").onclick=()=>{w.CardSystem.rollPotential(c.name);this.renderDetail();};
    }
};
})(window,document);
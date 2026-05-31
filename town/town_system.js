(function (w) {
  "use strict";
  if (!w.TownHub) return;

  const NS = 'town_integrated_v3';
  const CONFIG = {
    MAX_LEVEL: 100,
    BASE_ESSENCE_COST: 30,
    BASE_GOLD: 100000000000000,
    BASE_STONE: 10,
    BASE_ENHANCE: 10 / 60, // 約 0.166/分
    BASE_EXP: 10,
    TIME_UNIT_HR: 1,
    SKIP_GEM_PER_MIN: 5,
    OFFLINE_BASE_HR: 4,
    OFFLINE_BASE_RATE: 0.30,
    BONUS_MAX_LEVEL: 10
  };

  var Utils = {
    now: () => Math.floor(Date.now() / 1000),
    fmt: (n) => (n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    fmtRate: (n) => n >= 1 ? Math.floor(n).toLocaleString() : n.toFixed(2),
    getUpgradeCost: (lv) => Math.floor(CONFIG.BASE_ESSENCE_COST * Math.pow(lv, 1.25)),
    getTotalTime: (lv) => lv * CONFIG.TIME_UNIT_HR * 3600,
    getRemain: (start, lv) => {
      if (!start || start <= 1) return 0;
      return Math.max(0, Utils.getTotalTime(lv) - (Utils.now() - start));
    }
  };

  // =========================================================
  // ✅ 精華整合（不改背包，只在 Town 這邊讀/扣）
  // 規則：
  // 1) 「精華」(完全同名) 優先扣
  // 2) 其他冠名精華（包含「精華」但不是「精華」也不是「元素精華」）
  // 3) 「元素精華」最後扣
  // =========================================================
  function getInvObj() {
    return (w && w.inventory && typeof w.inventory === "object") ? w.inventory : {};
  }

  function listEssenceItemsInOrder() {
    const inv = getInvObj();

    // 收集所有包含「精華」且數量>0 的項目
    const all = Object.keys(inv).filter(name => {
      if (!Object.prototype.hasOwnProperty.call(inv, name)) return false;
      if (!String(name).includes("精華")) return false;
      return (Number(inv[name]) || 0) > 0;
    });

    // 分組
    const exactEssence = [];   // "精華"
    const namedEssence = [];   // 冠名精華：火焰精華/冰霜精華...
    const elementEssence = []; // "元素精華"

    for (const name of all) {
      if (name === "精華") exactEssence.push(name);
      else if (name === "元素精華") elementEssence.push(name);
      else namedEssence.push(name);
    }

    // 冠名精華內部排序：照名稱（你要別的排序規則也可再換）
    namedEssence.sort((a, b) => a.localeCompare(b, "zh-Hant"));

    // ✅ 最終扣除順序：精華 -> 冠名精華 -> 元素精華
    return exactEssence.concat(namedEssence, elementEssence);
  }

  function getEssenceTotal() {
    const inv = getInvObj();
    let sum = 0;
    const names = Object.keys(inv);
    for (const name of names) {
      if (!Object.prototype.hasOwnProperty.call(inv, name)) continue;
      if (!String(name).includes("精華")) continue;
      sum += Math.floor(Number(inv[name]) || 0);
    }
    return sum;
  }

  function spendEssence(amount) {
    amount = Math.floor(Number(amount) || 0);
    if (amount <= 0) return true;

    if (getEssenceTotal() < amount) return false;

    const inv = getInvObj();
    const order = listEssenceItemsInOrder();
    let need = amount;

    for (const name of order) {
      if (need <= 0) break;
      const have = Math.floor(Number(inv[name]) || 0);
      if (have <= 0) continue;

      const take = Math.min(have, need);

      // ✅ 仍走你原本背包 removeItem
      if (typeof w.removeItem === "function") w.removeItem(name, take);

      need -= take;
    }

    return need <= 0;
  }
  // =========================================================

  var Mod = {
    getState: function () {
      var def = {
        resLv: 1, resUpStart: 0,
        enhLv: 1, enhUpStart: 0,
        campLv: 1, campUpStart: 0,
        offlineBonusLv: 0, lastUpdate: Utils.now(),
        _pendingG: 0, _pendingS: 0, _pendingE: 0, _pendingT: 0
      };
      var s = Object.assign(def, w.SaveHub ? w.SaveHub.get(NS, {}) : {});
      this.calculateOffline(s);
      return s;
    },
    save: function (s) {
      s.lastUpdate = Utils.now();
      if (w.SaveHub) w.SaveHub.set(NS, s);
    },
    calculateOffline: function (s) {
      const now = Utils.now();
      let offlineSec = now - s.lastUpdate;
      if (offlineSec <= 60) return;

      const maxSec = (CONFIG.OFFLINE_BASE_HR + (s.offlineBonusLv * 2)) * 3600;
      const actualSec = Math.min(offlineSec, maxSec);
      const rate = CONFIG.OFFLINE_BASE_RATE + (s.offlineBonusLv * 0.03);
      const dtMin = (actualSec / 60) * rate;

      s._pendingG += (s.resLv * CONFIG.BASE_GOLD) * dtMin;
      s._pendingS += (s.resLv * CONFIG.BASE_STONE) * dtMin;
      s._pendingT += (s.enhLv * CONFIG.BASE_ENHANCE) * dtMin;
      s._pendingE += (s.campLv * CONFIG.BASE_EXP) * dtMin;
      s.lastUpdate = now;

      if ((actualSec / 60) > 5) {
        setTimeout(() => this.showModal(actualSec, rate, s), 500);
      }
    },
    showModal: function (sec, rate, s) {
      const div = document.createElement('div');
      div.style = "position:fixed;inset:0;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;z-index:10000;font-family:sans-serif;padding:20px;";
      div.innerHTML = `
        <div style="background:#1e293b;padding:25px;border-radius:20px;max-width:320px;width:100%;border:1px solid #4ade80;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,0.5)">
          <div style="font-size:2.5rem;margin-bottom:10px">💤</div>
          <h3 style="color:#fff;margin:0 0 5px 0;letter-spacing:1px">離線收益</h3>
          <p style="color:#94a3b8;font-size:0.8rem;margin-bottom:20px">時長: ${(sec / 3600).toFixed(1)} 小時<br>效率: <span style="color:#4ade80;font-weight:bold">${(rate * 100).toFixed(0)}%</span></p>
          <div style="background:#0f172a;padding:15px;border-radius:12px;margin-bottom:20px;border:1px solid #334155">
             <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;text-align:left">
                <div style="color:#fbbf24">💰 金幣增長</div>
                <div style="color:#94a3b8">🪨 石頭增長</div>
                <div style="color:#8b5cf6">🎟️ 票券增長</div>
                <div style="color:#60a5fa">✨ 經驗增長</div>
             </div>
             <p style="font-size:0.7rem;color:#64748b;margin-top:10px;border-top:1px solid #334155;padding-top:10px">資源已存入領取池</p>
          </div>
          <button id="closeOffBtn" style="width:100%;padding:14px;background:linear-gradient(to right, #10b981, #059669);color:white;border:none;border-radius:12px;font-weight:bold;cursor:pointer;box-shadow:0 4px 12px rgba(16,185,129,0.3)">收下獎勵</button>
        </div>`;
      document.body.appendChild(div);
      div.querySelector('#closeOffBtn').onclick = () => { div.remove(); w.TownHub.requestRerender(); };
    }
  };

  function getHTML(s) {
    // ✅ 改這裡：可用精華 = 所有包含「精華」的道具總和
    const essence = getEssenceTotal();

    const renderCard = (title, id, lines, color) => {
      const lv = s[id + 'Lv'], upStart = s[id + 'UpStart'];
      const isUp = upStart > 0, isMax = lv >= CONFIG.MAX_LEVEL;
      const cost = Utils.getUpgradeCost(lv);
      let subText = isUp ? `⏳ 升級中...` : `💠 投資需 ${cost}`;
      let prog = 0;

      if (isUp) {
        const total = Utils.getTotalTime(lv + 1);
        const rem = Utils.getRemain(upStart, lv + 1);
        prog = ((total - rem) / total) * 100;
        const m = Math.floor(rem / 60);
        subText = `⏳ 剩餘 ${m} 分鐘`;
      }

      return `
        <div style="background:#1e293b;margin-bottom:12px;border-radius:14px;overflow:hidden;border:1px solid #334155;display:flex;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1)">
          <div style="width:6px;background:${color}"></div>
          <div style="padding:14px;flex:1">
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
              <div>
                <div style="font-weight:bold;font-size:1rem;color:#f8fafc">${title}</div>
                <div style="font-size:0.75rem;color:#94a3b8">LEVEL ${lv} ${isMax ? '<span style="color:#f59e0b">(MAX)</span>' : ''}</div>
              </div>
              <div style="text-align:right">
                ${lines.map(l => `<div style="color:${color};font-size:0.85rem;font-weight:bold">+${Utils.fmtRate(l.v)} ${l.u}/分</div>`).join('')}
              </div>
            </div>
            ${isUp ? `
              <div style="height:6px;background:#0f172a;border-radius:3px;margin:12px 0;overflow:hidden">
                <div style="width:${prog}%;height:100%;background:${color};box-shadow:0 0 10px ${color}"></div>
              </div>` : '<div style="margin:12px 0;border-bottom:1px solid #33415588"></div>'}
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span style="font-size:0.7rem;color:#64748b">${isMax ? '已強化至巔峰狀態' : subText}</span>
              ${!isMax ? `
                <button onclick="TownResMod.startUpgrade('${id}')" style="padding:6px 14px;background:${isUp ? '#475569' : '#3b82f6'};color:white;border:none;border-radius:8px;font-size:0.75rem;font-weight:bold;cursor:pointer;transition:0.2s">
                  ${isUp ? '加速' : '投資'}
                </button>` : ''}
            </div>
          </div>
        </div>`;
    };

    return `
      <div style="color:#f8fafc;padding:5px">
        <div style="background:linear-gradient(135deg, #10b981 0%, #059669 100%);padding:20px;border-radius:18px;margin-bottom:20px;box-shadow:0 12px 20px -8px rgba(16,185,129,0.5)">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:15px">
            <div>
              <div style="font-size:0.75rem;color:rgba(255,255,255,0.9);text-transform:uppercase;letter-spacing:1.5px;font-weight:bold">待領取資源庫</div>
              <div style="font-size:0.7rem;color:rgba(255,255,255,0.7)">可用精華: 💠 ${essence.toLocaleString()}</div>
            </div>
            <button onclick="TownResMod.collect()" style="padding:10px 18px;background:#ffffff;color:#059669;border:none;border-radius:12px;font-weight:900;cursor:pointer;font-size:0.9rem;box-shadow:0 4px 10px rgba(0,0,0,0.1)">全部領取</button>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;background:rgba(0,0,0,0.25);padding:15px;border-radius:14px;backdrop-filter:blur(5px)">
            <div style="font-size:1.1rem;display:flex;align-items:center">💰 <span style="margin-left:5px">${Utils.fmt(s._pendingG)}</span></div>
            <div style="font-size:1.1rem;display:flex;align-items:center">🪨 <span style="margin-left:5px">${Utils.fmt(s._pendingS)}</span></div>
            <div style="font-size:1.1rem;display:flex;align-items:center">🎟️ <span style="margin-left:5px">${Utils.fmt(s._pendingT)}</span></div>
            <div style="font-size:1.1rem;display:flex;align-items:center">✨ <span style="margin-left:5px">${Utils.fmt(s._pendingE)}</span></div>
          </div>
        </div>

        ${renderCard("物資採集中心", "res", [{ v: s.resLv * CONFIG.BASE_GOLD, u: "金" }, { v: s.resLv * CONFIG.BASE_STONE, u: "石" }], "#10b981")}
        ${renderCard("強化技術工坊", "enh", [{ v: s.enhLv * CONFIG.BASE_ENHANCE, u: "券" }], "#8b5cf6")}
        ${renderCard("英雄特訓營地", "camp", [{ v: s.campLv * CONFIG.BASE_EXP, u: "經" }], "#3b82f6")}

        <div style="background:rgba(15, 23, 42, 0.6);padding:18px;border-radius:18px;border:1px solid #4ade8044;margin-top:15px;backdrop-filter:blur(10px)">
          <div style="display:flex;justify-content:space-between;align-items:center">
             <div>
               <div style="font-weight:bold;font-size:0.9rem;color:#4ade80">💤 離線後援系統 Lv.${s.offlineBonusLv}</div>
               <div style="font-size:0.75rem;color:#94a3b8">儲存時限: <b style="color:#f8fafc">${CONFIG.OFFLINE_BASE_HR + (s.offlineBonusLv * 2)}hr</b></div>
               <div style="font-size:0.75rem;color:#94a3b8">工作效率: <b style="color:#f8fafc">${(CONFIG.OFFLINE_BASE_RATE + (s.offlineBonusLv * 0.05) * 100).toFixed(0)}%</b></div>
             </div>
             <div style="text-align:right">
               <div style="font-size:0.65rem;color:#64748b;margin-bottom:4px">升級消耗</div>
               <button onclick="TownResMod.upgradeOffline()" style="padding:8px 14px;background:linear-gradient(to bottom, #f59e0b, #d97706);color:white;border:none;border-radius:10px;font-size:0.8rem;font-weight:bold;cursor:pointer;box-shadow:0 4px 10px rgba(245,158,11,0.2)">
                 💠 ${Utils.getUpgradeCost(s.offlineBonusLv + 1)}
               </button>
             </div>
          </div>
        </div>
      </div>
    `;
  }

  // --- 邏輯介面 ---
  w.TownResMod = {
    startUpgrade: function (type) {
      const s = Mod.getState();
      if (s[type + 'UpStart'] > 0) return this.skip(type);
      if (s[type + 'Lv'] >= CONFIG.MAX_LEVEL) return;

      const cost = Utils.getUpgradeCost(s[type + 'Lv']);

      // ✅ 改這裡：用「精華總量」判斷 + 依規則扣除
      if (getEssenceTotal() < cost) return alert("精華不足");
      if (!spendEssence(cost)) return alert("精華不足");

      s[type + 'UpStart'] = Utils.now();
      Mod.save(s); w.TownHub.requestRerender();
    },
    upgradeOffline: function () {
      const s = Mod.getState();
      if (s.offlineBonusLv >= CONFIG.BONUS_MAX_LEVEL) return alert("已達技術巔峰");

      const cost = Utils.getUpgradeCost(s.offlineBonusLv + 1);

      // ✅ 改這裡：用「精華總量」判斷 + 依規則扣除
      if (getEssenceTotal() < cost) return alert("精華不足");
      if (!spendEssence(cost)) return alert("精華不足");

      s.offlineBonusLv++;
      Mod.save(s); w.TownHub.requestRerender();
    },
    skip: function (type) {
      const s = Mod.getState();
      const remSec = Utils.getRemain(s[type + 'UpStart'], s[type + 'Lv'] + 1);
      const cost = Math.ceil(remSec / 60) * CONFIG.SKIP_GEM_PER_MIN;
      if ((w.player.gem || 0) < cost) return alert("寶石不足");
      if (confirm(`是否花費 ${cost} 💎 立即完成研究？`)) {
        w.player.gem -= cost;
        s[type + 'Lv']++; s[type + 'UpStart'] = 0;
        Mod.save(s); w.TownHub.requestRerender();
      }
    },
    collect: function () {
      const s = Mod.getState();
      const g = Math.floor(s._pendingG), st = Math.floor(s._pendingS);
      const e = Math.floor(s._pendingE), t = Math.floor(s._pendingT);
      if (g < 1 && st < 1 && e < 1 && t < 1) return alert("資源不足 1 單位，請繼續累積");
      if (g >= 1) { w.player.gold = (w.player.gold || 0) + g; s._pendingG -= g; }
      if (st >= 1) { w.player.stone = (w.player.stone || 0) + st; s._pendingS -= st; }
      if (e >= 1) { if (typeof w.gainExp === "function") w.gainExp(e); else w.player.exp = (w.player.exp || 0) + e; s._pendingE -= e; }
      if (t >= 1 && w.addItem) { w.addItem("強化道具兌換券", t); s._pendingT -= t; }
      Mod.save(s); w.TownHub.requestRerender();
    }
  };

  w.TownHub.registerTab({
    id: 'resource_v3',
    title: '資源中心',
    render: (el) => el.innerHTML = getHTML(Mod.getState()),
    update: (el) => {
      el.innerHTML = getHTML(Mod.getState());
    },
    tick: (dt) => {
      const s = Mod.getState();
      let changed = false;

      ['res', 'camp', 'enh'].forEach(id => {
        if (s[id + 'UpStart'] > 0) {
          if (Utils.getRemain(s[id + 'UpStart'], s[id + 'Lv'] + 1) <= 0) {
            s[id + 'Lv']++;
            s[id + 'UpStart'] = 0;
            changed = true;
          }
        }
      });

      const dtMin = dt / 60;
      s._pendingG += (s.resLv * CONFIG.BASE_GOLD) * dtMin;
      s._pendingS += (s.resLv * CONFIG.BASE_STONE) * dtMin;
      s._pendingT += (s.enhLv * CONFIG.BASE_ENHANCE) * dtMin;
      s._pendingE += (s.campLv * CONFIG.BASE_EXP) * dtMin;

      Mod.save(s);
      if (changed) w.TownHub.requestRerender();
    }
  });

})(window);
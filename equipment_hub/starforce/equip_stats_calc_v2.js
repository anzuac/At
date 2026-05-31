/*!
 * equip_stats_calc_v2.js — 裝備能力彙總（對應 StarforceTableV1）
 * - 純計算，完全不碰存檔/背包
 * - 已整合星力帶來的 DEF / HP（非武器）
 */
(function(root){
  'use strict';

  function nz(n){ return (typeof n==='number' && isFinite(n)) ? n : 0; }
  function clone(o){ try{return JSON.parse(JSON.stringify(o||{}));}catch(_){return {}; } }

  /**
   * calcEquipFinal(node)
   * node: { type, locked, base:{...}, enhance:{...}, star }
   * 回傳：
   *   { str,dex,int,luk,atk,def,hp,mp, starAtkPctSum, atkFromStar, atkFlat, detail:{} }
   * - 星力計算透過 StarforceTableV1.calcStarBonus(type, star, basePlusScrollAtk)
   * - 非武器會取得 defFlat / hpFlat 並加進最終值
   */
  function calcEquipFinal(node){
    if (!node || node.locked) {
      return {
        str:0, dex:0, int:0, luk:0,
        atk:0, def:0, hp:0, mp:0,
        starAtkPctSum:0, atkFromStar:0, atkFlat:0,
        detail:{}
      };
    }

    const b = clone(node.base||{}),
        e = clone(node.enhance||{});
    const type = node.type||'',
        star = node.star|0;

    // 用「卷軸後的攻擊」當作武器星力%基礎
    const basePlusScrollAtk = nz(b.atk) + nz(e.atk);

    // 取得星力加成（新版提供 defFlat / hpFlat）
    const sf = (root.StarforceTableV1 && root.StarforceTableV1.calcStarBonus)
      ? root.StarforceTableV1.calcStarBonus(type, star, basePlusScrollAtk)
      : { allStat:0, atkPctSum:0, atkFromStar:0, atkFlat:0, defFlat:0, hpFlat:0, mpFlat:0 };

    const out = {
      // 全屬（星力 allStat 為平值，四圍都加）
      str: nz(b.str) + nz(e.str) + nz(sf.allStat),
      dex: nz(b.dex) + nz(e.dex) + nz(sf.allStat),
      int: nz(b.int) + nz(e.int) + nz(sf.allStat),
      luk: nz(b.luk) + nz(e.luk) + nz(sf.allStat),

      // ATK：卷/基礎 + 星力%換算 + 星力平值
      atk: nz(b.atk) + nz(e.atk) + nz(sf.atkFromStar) + nz(sf.atkFlat),

      // ✅ 新增星力 DEF / HP
      def: nz(b.def) + nz(e.def) + nz(sf.defFlat),
      hp : nz(b.hp)  + nz(e.hp)  + nz(sf.hpFlat),


      // MP：基礎 + 卷/強化 + 星力（若星力表未提供 mpFlat，預設跟 hpFlat 同量）
      mp : nz(b.mp)  + nz(e.mp)  + nz((sf.mpFlat!=null)? sf.mpFlat : sf.hpFlat),
      // 提供 UI 顯示使用（例如「星力%累積」「星力加攻」）
      starAtkPctSum: nz(sf.atkPctSum),
      atkFromStar  : nz(sf.atkFromStar),
      atkFlat      : nz(sf.atkFlat),

      // 明細（可用於除錯或 UI 小標籤）
      detail: {
        base: b,
        enhance: e,
        starAll: nz(sf.allStat),
        starDef: nz(sf.defFlat),
        starHp : nz(sf.hpFlat),
        starMp : nz((sf.mpFlat!=null)? sf.mpFlat : sf.hpFlat)}
    };

    return out;
  }

  /**
   * sumStats(list)
   * 將多件裝備的最終值相加
   */
  function sumStats(list){
    const sum = { str:0,dex:0,int:0,luk:0,atk:0,def:0,hp:0,mp:0 };
    for (let i=0; i<list.length; i++){
      const s = list[i] || {};
      sum.str += nz(s.str);
      sum.dex += nz(s.dex);
      sum.int += nz(s.int);
      sum.luk += nz(s.luk);
      sum.atk += nz(s.atk);
      sum.def += nz(s.def);
      sum.hp  += nz(s.hp);
      sum.mp  += nz(s.mp);
    }
    return sum;
  }

  // 導出
  root.EquipStatsV2 = {
    calcEquipFinal,
    sumStats
  };

})(this);
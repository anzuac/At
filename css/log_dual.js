(function(global){
  // 時間 [HH:MM:SS]
  function _nowStr(){
    var d=new Date(); 
    function p(n){return (n<10?'0':'')+n;}
    return "["+p(d.getHours())+":"+p(d.getMinutes())+":"+p(d.getSeconds())+"]";
  }

  // 文本分類 → normal / skill / reward
function _classify(text){
  if (/爆擊/.test(text)) return "critical";   // 新增：爆擊
  if (/擊敗|獲得|掉落|EXP|楓幣|強化石/i.test(text)) return "reward";
  if (/技能|施放|斬|爆|衝擊|咆哮|硬化|覺醒|CD|冷卻/i.test(text)) return "skill";
  return "normal";
}

  // 寫入某一欄：用 prepend（配合 CSS 的 flex-direction: column）
  function _push(boxId, text, type){
    var box=document.getElementById(boxId);
    if(!box) return;
    var div=document.createElement("div");
    var cls = type || _classify(text);         // 可傳入覆蓋類型
    div.className="log-entry " + cls;
    div.textContent=_nowStr()+" "+text;
    box.prepend(div);                           // ★ 最新插最上面
    box.scrollTop = 0;                          // 讓滾動停在頂部（可留可拿掉）
  }

  // 對外 API：第二參數可強制類型（"normal"|"skill"|"reward"）
  global.LogDual = {
    player:  function(txt, type){ _push("playerLog",  txt, type); },
    monster: function(txt, type){ _push("monsterLog", txt, type); }
  };
})(window);
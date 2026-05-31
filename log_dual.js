(function(global){
  function _nowStr(){
    const d=new Date();
    function p(n){return (n<10?'0':'')+n;}
    return "["+p(d.getHours())+":"+p(d.getMinutes())+":"+p(d.getSeconds())+"]";
  }

  function _push(boxId, text){
    const box=document.getElementById(boxId);
    if(!box) return;
    const div=document.createElement("div");
    div.className="log-entry";
    div.textContent=_nowStr()+" "+text;
    box.prepend(div);
  }

  global.LogDual = {
    player(txt){ _push("playerLog", txt); },
    monster(txt){ _push("monsterLog", txt); }
  };
})(window);
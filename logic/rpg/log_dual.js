(function(global){
  function _nowStr(){
    var d=new Date(); 
    function p(n){return (n<10?'0':'')+n;}
    return "["+p(d.getHours())+":"+p(d.getMinutes())+":"+p(d.getSeconds())+"]";
  }

  function _push(boxId, text){
    var box=document.getElementById(boxId);
    if(!box) return;
    var div=document.createElement("div");
    div.className="log-entry";
    div.textContent=_nowStr()+" "+text;
    box.prepend(div);
  }

  global.LogDual = {
    player: function(txt){ _push("playerLog", txt); },
    monster:function(txt){ _push("monsterLog", txt); }
  };
})(window);
// save_hub_es5.js — 統一存檔中樞（穩定版；讀取絕不寫檔）
(function(global){
  var SAVE_KEY = "51&+1241飯店11111114112分21請2221222333+"; // 全遊戲單一存檔包
  var WRITE_DELAY = 300;   // 批次寫入去抖（毫秒）
  var _timer = null;
  var _listeners = { change: [] };
  var _state = { _meta: { schema: 1 }, data: {} }; // { data: { namespace: {...} } }
  var _specs = {}; // { ns: { version, migrate(old)->new } }

  // I/O：localStorage
  function readRaw(){
    try{ var raw = localStorage.getItem(SAVE_KEY); return raw ? JSON.parse(raw) : null; }
    catch(_){ return null; }
  }
  function writeRaw(obj){
    try{ localStorage.setItem(SAVE_KEY, JSON.stringify(obj)); }catch(_){}
  }

  // 初始化（只讀，**不寫**）
  (function init(){
    var saved = readRaw();
    if (saved && saved.data) _state = saved;
    // 沒有存檔就留在記憶體；等真的有人 set/初始化時再寫
  })();

  // 工具
  function clone(obj){ return JSON.parse(JSON.stringify(obj)); }
  function extend(dst, src){ if(!src) return dst; for(var k in src) if(Object.prototype.hasOwnProperty.call(src,k)) dst[k]=src[k]; return dst; }
  function emit(evt, payload){
    var arr = _listeners[evt] || [];
    for (var i=0;i<arr.length;i++){ try{ arr[i](payload); }catch(_){ } }
  }
  function scheduleWrite(){
    if (_timer) return;
    _timer = setTimeout(function(){
      _timer = null;
      writeRaw(_state);
      emit('change', { type:'flush' });
    }, WRITE_DELAY);
  }

  var SaveHub = {
    registerNamespaces: function(specs){
      for (var ns in specs) if (Object.prototype.hasOwnProperty.call(specs, ns)) _specs[ns] = specs[ns];
    },

    // 只讀：沒有 defaultObj 就不會創建節點、不會寫檔
    get: function(ns, defaultObj){
      var node = _state.data.hasOwnProperty(ns) ? _state.data[ns] : undefined;
      if (node === undefined) {
        if (defaultObj === undefined) return undefined; // 純讀；不初始化、不寫檔
        // 需要初始化 → 交給 getOrInit
        return this.getOrInit(ns, defaultObj);
      }
      // 版本遷移：僅在**節點已存在**時才可能觸發寫檔
      var spec = _specs[ns];
      if (spec && typeof spec.version === 'number'){
        var ver = (node && node._ver) || 0;
        if (ver < spec.version && typeof spec.migrate === 'function'){
          var migrated = spec.migrate(clone(node)) || {};
          migrated._ver = spec.version;
          _state.data[ns] = migrated;
          scheduleWrite();
          node = migrated;
        }
      }
      return clone(node);
    },

    // 顯式初始化：只有你真的想要落地新節點時才用這個
    getOrInit: function(ns, defaultObj){
      if (!_state.data.hasOwnProperty(ns)){
        _state.data[ns] = clone(defaultObj || {});
        // 設定初始版本（若已註冊）
        var spec = _specs[ns];
        if (spec && typeof spec.version === 'number' && !_state.data[ns]._ver) {
          _state.data[ns]._ver = spec.version;
        }
        scheduleWrite();
      }
      return this.get(ns); // 走一次標準流程（含遷移檢查）
    },

    set: function(ns, partialObj, options){
      var cur = _state.data[ns] || {};
      var opt = options || {};
      var next = opt.replace ? clone(partialObj) : extend(clone(cur), partialObj);
      _state.data[ns] = next;
      scheduleWrite();
      emit('change', { type:'set', ns: ns });
    },

    on: function(evt, fn){
      _listeners[evt] = _listeners[evt] || [];
      _listeners[evt].push(fn);
      return function off(){
        var a = _listeners[evt]; if (!a) return;
        var i = a.indexOf(fn); if (i>=0) a.splice(i,1);
      };
    },

    flush: function(){
      if (_timer){ clearTimeout(_timer); _timer = null; }
      writeRaw(_state);
      emit('change', { type:'flush' });
    },

    _dump: function(){ return clone(_state); }
  };

  global.SaveHub = SaveHub;
})(this);
// save_hub_es2020.js — 統一存檔中樞（ES2020+；讀取絕不寫檔）
((globalThisRef) => {
  'use strict';

  const SAVE_KEY = '51&+1241飯店11111114112分21請2221222333+'; // 全遊戲單一存檔包
  const WRITE_DELAY = 300; // 批次寫入去抖（毫秒）
  const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

  let timer = null;
  const listeners = { change: [] };
  let state = { _meta: { schema: 1 }, data: {} }; // { data: { namespace: {...} } }
  const specs = {}; // { ns: { version, migrate(old)->new } }

  // I/O：localStorage
  const readRaw = () => {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  };

  const writeRaw = (obj) => {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(obj));
    } catch (_) {}
  };

  const clone = (obj) => JSON.parse(JSON.stringify(obj));

  const extend = (dst, src) => {
    if (!src) return dst;
    Object.entries(src).forEach(([key, value]) => {
      dst[key] = value;
    });
    return dst;
  };

  const emit = (evt, payload) => {
    (listeners[evt] ?? []).forEach((fn) => {
      try {
        fn(payload);
      } catch (_) {}
    });
  };

  const scheduleWrite = () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      writeRaw(state);
      emit('change', { type: 'flush' });
    }, WRITE_DELAY);
  };

  // 初始化（只讀，**不寫**）
  const saved = readRaw();
  if (saved?.data) state = saved;

  const SaveHub = {
    registerNamespaces(namespaceSpecs = {}) {
      Object.entries(namespaceSpecs).forEach(([ns, spec]) => {
        specs[ns] = spec;
      });
    },

    // 只讀：沒有 defaultObj 就不會創建節點、不會寫檔
    get(ns, defaultObj) {
      let node = hasOwn(state.data, ns) ? state.data[ns] : undefined;
      if (node === undefined) {
        if (defaultObj === undefined) return undefined; // 純讀；不初始化、不寫檔
        // 需要初始化 → 交給 getOrInit
        return this.getOrInit(ns, defaultObj);
      }

      // 版本遷移：僅在**節點已存在**時才可能觸發寫檔
      const spec = specs[ns];
      if (spec && typeof spec.version === 'number') {
        const ver = node?._ver ?? 0;
        if (ver < spec.version && typeof spec.migrate === 'function') {
          const migrated = spec.migrate(clone(node)) ?? {};
          migrated._ver = spec.version;
          state.data[ns] = migrated;
          scheduleWrite();
          node = migrated;
        }
      }
      return clone(node);
    },

    // 顯式初始化：只有你真的想要落地新節點時才用這個
    getOrInit(ns, defaultObj) {
      if (!hasOwn(state.data, ns)) {
        state.data[ns] = clone(defaultObj ?? {});
        // 設定初始版本（若已註冊）
        const spec = specs[ns];
        if (spec && typeof spec.version === 'number' && !state.data[ns]._ver) {
          state.data[ns]._ver = spec.version;
        }
        scheduleWrite();
      }
      return this.get(ns); // 走一次標準流程（含遷移檢查）
    },

    set(ns, partialObj, options = {}) {
      const cur = state.data[ns] ?? {};
      const next = options.replace ? clone(partialObj) : extend(clone(cur), partialObj);
      state.data[ns] = next;
      scheduleWrite();
      emit('change', { type: 'set', ns });
    },

    on(evt, fn) {
      listeners[evt] = listeners[evt] ?? [];
      listeners[evt].push(fn);
      return function off() {
        const bucket = listeners[evt];
        if (!bucket) return;
        const index = bucket.indexOf(fn);
        if (index >= 0) bucket.splice(index, 1);
      };
    },

    flush() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      writeRaw(state);
      emit('change', { type: 'flush' });
    },

    _dump() {
      return clone(state);
    },
  };

  globalThisRef.SaveHub = SaveHub;
})(globalThis);

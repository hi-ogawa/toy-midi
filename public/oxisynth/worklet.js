"use strict";

// TextEncoder/TextDecoder polyfill for AudioWorklet scope
(function (r) {
  function x() {}
  function y() {}
  var z = String.fromCharCode,
    v = {}.toString,
    A = r.SharedArrayBuffer ? v.call(r.SharedArrayBuffer) : "",
    B = v(),
    q = r.Uint8Array,
    t = q || Array,
    w = q ? ArrayBuffer : t,
    C =
      w.isView ||
      function (g) {
        return g && "length" in g;
      },
    D = v.call(w.prototype);
  w = y.prototype;
  var E = r.TextEncoder,
    a = new (q ? Uint16Array : t)(32);
  x.prototype.decode = function (g) {
    if (!C(g)) {
      var l = v.call(g);
      if (l !== D && l !== A && l !== B)
        throw TypeError(
          "Failed to execute 'decode' on 'TextDecoder': The provided value is not of type '(ArrayBuffer or ArrayBufferView)'",
        );
      g = q ? new t(g) : g || [];
    }
    for (
      var f = (l = ""),
        b = 0,
        c = g.length | 0,
        u = (c - 32) | 0,
        e,
        d,
        h = 0,
        p = 0,
        m,
        k = 0,
        n = -1;
      b < c;
    ) {
      for (
        e = b <= u ? 32 : (c - b) | 0;
        k < e;
        b = (b + 1) | 0, k = (k + 1) | 0
      ) {
        d = g[b] & 255;
        switch (d >> 4) {
          case 15:
            m = g[(b = (b + 1) | 0)] & 255;
            if (2 !== m >> 6 || 247 < d) {
              b = (b - 1) | 0;
              break;
            }
            h = ((d & 7) << 6) | (m & 63);
            p = 5;
            d = 256;
          case 14:
            ((m = g[(b = (b + 1) | 0)] & 255),
              (h <<= 6),
              (h |= ((d & 15) << 6) | (m & 63)),
              (p = 2 === m >> 6 ? (p + 4) | 0 : 24),
              (d = (d + 256) & 768));
          case 13:
          case 12:
            ((m = g[(b = (b + 1) | 0)] & 255),
              (h <<= 6),
              (h |= ((d & 31) << 6) | (m & 63)),
              (p = (p + 7) | 0),
              b < c && 2 === m >> 6 && h >> p && 1114112 > h
                ? ((d = h),
                  (h = (h - 65536) | 0),
                  0 <= h &&
                    ((n = ((h >> 10) + 55296) | 0),
                    (d = ((h & 1023) + 56320) | 0),
                    31 > k
                      ? ((a[k] = n), (k = (k + 1) | 0), (n = -1))
                      : ((m = n), (n = d), (d = m))))
                : ((d >>= 8), (b = (b - d - 1) | 0), (d = 65533)),
              (h = p = 0),
              (e = b <= u ? 32 : (c - b) | 0));
          default:
            a[k] = d;
            continue;
          case 11:
          case 10:
          case 9:
          case 8:
        }
        a[k] = 65533;
      }
      f += z(
        a[0],
        a[1],
        a[2],
        a[3],
        a[4],
        a[5],
        a[6],
        a[7],
        a[8],
        a[9],
        a[10],
        a[11],
        a[12],
        a[13],
        a[14],
        a[15],
        a[16],
        a[17],
        a[18],
        a[19],
        a[20],
        a[21],
        a[22],
        a[23],
        a[24],
        a[25],
        a[26],
        a[27],
        a[28],
        a[29],
        a[30],
        a[31],
      );
      32 > k && (f = f.slice(0, (k - 32) | 0));
      if (b < c) {
        if (((a[0] = n), (k = ~n >>> 31), (n = -1), f.length < l.length))
          continue;
      } else -1 !== n && (f += z(n));
      l += f;
      f = "";
    }
    return l;
  };
  w.encode = function (g) {
    g = void 0 === g ? "" : "" + g;
    var l = g.length | 0,
      f = new t(((l << 1) + 8) | 0),
      b,
      c = 0,
      u = !q;
    for (b = 0; b < l; b = (b + 1) | 0, c = (c + 1) | 0) {
      var e = g.charCodeAt(b) | 0;
      if (127 >= e) f[c] = e;
      else {
        if (2047 >= e) f[c] = 192 | (e >> 6);
        else {
          a: {
            if (55296 <= e)
              if (56319 >= e) {
                var d = g.charCodeAt((b = (b + 1) | 0)) | 0;
                if (56320 <= d && 57343 >= d) {
                  e = ((e << 10) + d - 56613888) | 0;
                  if (65535 < e) {
                    f[c] = 240 | (e >> 18);
                    f[(c = (c + 1) | 0)] = 128 | ((e >> 12) & 63);
                    f[(c = (c + 1) | 0)] = 128 | ((e >> 6) & 63);
                    f[(c = (c + 1) | 0)] = 128 | (e & 63);
                    continue;
                  }
                  break a;
                }
                e = 65533;
              } else 57343 >= e && (e = 65533);
            !u &&
              b << 1 < c &&
              b << 1 < ((c - 7) | 0) &&
              ((u = true), (d = new t(3 * l)), d.set(f), (f = d));
          }
          f[c] = 224 | (e >> 12);
          f[(c = (c + 1) | 0)] = 128 | ((e >> 6) & 63);
        }
        f[(c = (c + 1) | 0)] = 128 | (e & 63);
      }
    }
    return q ? f.subarray(0, c) : f.slice(0, c);
  };
  E || ((r.TextDecoder = x), (r.TextEncoder = y));
})(globalThis);

// wasm-bindgen glue code
let wasm;
const cachedTextDecoder = new TextDecoder("utf-8", {
  ignoreBOM: true,
  fatal: true,
});
cachedTextDecoder.decode();
let cachedUint8Memory0 = new Uint8Array();
function getUint8Memory0() {
  if (cachedUint8Memory0.byteLength === 0)
    cachedUint8Memory0 = new Uint8Array(wasm.memory.buffer);
  return cachedUint8Memory0;
}
function getStringFromWasm0(ptr, len) {
  return cachedTextDecoder.decode(getUint8Memory0().subarray(ptr, ptr + len));
}
const heap = new Array(32).fill(void 0);
heap.push(void 0, null, true, false);
let heap_next = heap.length;
function addHeapObject(obj) {
  if (heap_next === heap.length) heap.push(heap.length + 1);
  const idx = heap_next;
  heap_next = heap[idx];
  heap[idx] = obj;
  return idx;
}
let cachedInt32Memory0 = new Int32Array();
function getInt32Memory0() {
  if (cachedInt32Memory0.byteLength === 0)
    cachedInt32Memory0 = new Int32Array(wasm.memory.buffer);
  return cachedInt32Memory0;
}
function getObject(idx) {
  return heap[idx];
}
function dropObject(idx) {
  if (idx < 36) return;
  heap[idx] = heap_next;
  heap_next = idx;
}
function takeObject(idx) {
  const ret = getObject(idx);
  dropObject(idx);
  return ret;
}
let WASM_VECTOR_LEN = 0;
const cachedTextEncoder = new TextEncoder("utf-8");
const encodeString =
  typeof cachedTextEncoder.encodeInto === "function"
    ? (arg, view) => cachedTextEncoder.encodeInto(arg, view)
    : (arg, view) => {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return { read: arg.length, written: buf.length };
      };
function passStringToWasm0(arg, malloc, realloc) {
  if (realloc === void 0) {
    const buf = cachedTextEncoder.encode(arg);
    const ptr = malloc(buf.length);
    getUint8Memory0()
      .subarray(ptr, ptr + buf.length)
      .set(buf);
    WASM_VECTOR_LEN = buf.length;
    return ptr;
  }
  let len = arg.length,
    ptr = malloc(len);
  const mem = getUint8Memory0();
  let offset = 0;
  for (; offset < len; offset++) {
    const code = arg.charCodeAt(offset);
    if (code > 127) break;
    mem[ptr + offset] = code;
  }
  if (offset !== len) {
    if (offset !== 0) arg = arg.slice(offset);
    ptr = realloc(ptr, len, (len = offset + arg.length * 3));
    const view = getUint8Memory0().subarray(ptr + offset, ptr + len);
    const ret = encodeString(arg, view);
    offset += ret.written;
  }
  WASM_VECTOR_LEN = offset;
  return ptr;
}
function passArray8ToWasm0(arg, malloc) {
  const ptr = malloc(arg.length * 1);
  getUint8Memory0().set(arg, ptr / 1);
  WASM_VECTOR_LEN = arg.length;
  return ptr;
}
let cachedFloat32Memory0 = new Float32Array();
function getFloat32Memory0() {
  if (cachedFloat32Memory0.byteLength === 0)
    cachedFloat32Memory0 = new Float32Array(wasm.memory.buffer);
  return cachedFloat32Memory0;
}
function passArrayF32ToWasm0(arg, malloc) {
  const ptr = malloc(arg.length * 4);
  getFloat32Memory0().set(arg, ptr / 4);
  WASM_VECTOR_LEN = arg.length;
  return ptr;
}
function handleError(f, args) {
  try {
    return f.apply(this, args);
  } catch (e) {
    wasm.__wbindgen_exn_store(addHeapObject(e));
  }
}

class SoundfontPlayer {
  static __wrap(ptr) {
    const obj = Object.create(SoundfontPlayer.prototype);
    obj.ptr = ptr;
    return obj;
  }
  __destroy_into_raw() {
    const ptr = this.ptr;
    this.ptr = 0;
    return ptr;
  }
  free() {
    wasm.__wbg_soundfontplayer_free(this.__destroy_into_raw());
  }
  static new(sample_rate) {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.soundfontplayer_new(retptr, sample_rate);
      var r0 = getInt32Memory0()[retptr / 4 + 0];
      var r1 = getInt32Memory0()[retptr / 4 + 1];
      var r2 = getInt32Memory0()[retptr / 4 + 2];
      if (r2) throw takeObject(r1);
      return SoundfontPlayer.__wrap(r0);
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  add_soundfont(soundfont_id, soundfont_data) {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      const ptr0 = passStringToWasm0(
        soundfont_id,
        wasm.__wbindgen_malloc,
        wasm.__wbindgen_realloc,
      );
      const len0 = WASM_VECTOR_LEN;
      const ptr1 = passArray8ToWasm0(soundfont_data, wasm.__wbindgen_malloc);
      const len1 = WASM_VECTOR_LEN;
      wasm.soundfontplayer_add_soundfont(
        retptr,
        this.ptr,
        ptr0,
        len0,
        ptr1,
        len1,
      );
      var r0 = getInt32Memory0()[retptr / 4 + 0];
      var r1 = getInt32Memory0()[retptr / 4 + 1];
      if (r1) throw takeObject(r0);
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  add_soundfonts_from_file(file_name, file_data) {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      const ptr0 = passStringToWasm0(
        file_name,
        wasm.__wbindgen_malloc,
        wasm.__wbindgen_realloc,
      );
      const len0 = WASM_VECTOR_LEN;
      const ptr1 = passArray8ToWasm0(file_data, wasm.__wbindgen_malloc);
      const len1 = WASM_VECTOR_LEN;
      wasm.soundfontplayer_add_soundfonts_from_file(
        retptr,
        this.ptr,
        ptr0,
        len0,
        ptr1,
        len1,
      );
      var r0 = getInt32Memory0()[retptr / 4 + 0];
      var r1 = getInt32Memory0()[retptr / 4 + 1];
      if (r1) throw takeObject(r0);
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  set_preset(soundfont_id, preset_id) {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      const ptr0 = passStringToWasm0(
        soundfont_id,
        wasm.__wbindgen_malloc,
        wasm.__wbindgen_realloc,
      );
      const len0 = WASM_VECTOR_LEN;
      const ptr1 = passStringToWasm0(
        preset_id,
        wasm.__wbindgen_malloc,
        wasm.__wbindgen_realloc,
      );
      const len1 = WASM_VECTOR_LEN;
      wasm.soundfontplayer_set_preset(retptr, this.ptr, ptr0, len0, ptr1, len1);
      var r0 = getInt32Memory0()[retptr / 4 + 0];
      var r1 = getInt32Memory0()[retptr / 4 + 1];
      if (r1) throw takeObject(r0);
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  get_state() {
    try {
      const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
      wasm.soundfontplayer_get_state(retptr, this.ptr);
      var r0 = getInt32Memory0()[retptr / 4 + 0];
      var r1 = getInt32Memory0()[retptr / 4 + 1];
      var r2 = getInt32Memory0()[retptr / 4 + 2];
      if (r2) throw takeObject(r1);
      return takeObject(r0);
    } finally {
      wasm.__wbindgen_add_to_stack_pointer(16);
    }
  }
  note_on(key, vel) {
    wasm.soundfontplayer_note_on(this.ptr, key, vel);
  }
  note_off(key) {
    wasm.soundfontplayer_note_off(this.ptr, key);
  }
  set_gain(gain) {
    wasm.soundfontplayer_set_gain(this.ptr, gain);
  }
  process(out_samples_l, out_samples_r) {
    try {
      var ptr0 = passArrayF32ToWasm0(out_samples_l, wasm.__wbindgen_malloc);
      var len0 = WASM_VECTOR_LEN;
      var ptr1 = passArrayF32ToWasm0(out_samples_r, wasm.__wbindgen_malloc);
      var len1 = WASM_VECTOR_LEN;
      const ret = wasm.soundfontplayer_process(
        this.ptr,
        ptr0,
        len0,
        ptr1,
        len1,
      );
      return ret !== 0;
    } finally {
      out_samples_l.set(
        getFloat32Memory0().subarray(ptr0 / 4, ptr0 / 4 + len0),
      );
      wasm.__wbindgen_free(ptr0, len0 * 4);
      out_samples_r.set(
        getFloat32Memory0().subarray(ptr1 / 4, ptr1 / 4 + len1),
      );
      wasm.__wbindgen_free(ptr1, len1 * 4);
    }
  }
}

function initSync(module) {
  const imports = {
    wbg: {
      __wbindgen_error_new: (arg0, arg1) =>
        addHeapObject(new Error(getStringFromWasm0(arg0, arg1))),
      __wbg_parse_e23be3fecd886e2a: function () {
        return handleError(
          (arg0, arg1) =>
            addHeapObject(JSON.parse(getStringFromWasm0(arg0, arg1))),
          arguments,
        );
      },
      __wbindgen_throw: (arg0, arg1) => {
        throw new Error(getStringFromWasm0(arg0, arg1));
      },
    },
  };
  if (!(module instanceof WebAssembly.Module)) {
    module = new WebAssembly.Module(module);
  }
  const instance = new WebAssembly.Instance(module, imports);
  wasm = instance.exports;
  cachedFloat32Memory0 = new Float32Array();
  cachedInt32Memory0 = new Int32Array();
  cachedUint8Memory0 = new Uint8Array();
  return wasm;
}

// AudioWorklet Processor - simple postMessage interface (no comlink)
let soundfontPlayer = null;

class OxiSynthProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.port.onmessage = (e) => this.handleMessage(e.data);
  }

  handleMessage(msg) {
    switch (msg.type) {
      case "init":
        initSync(msg.wasmBytes);
        soundfontPlayer = SoundfontPlayer.new(sampleRate);
        soundfontPlayer.set_gain(0.5);
        this.port.postMessage({ type: "ready" });
        break;
      case "noteOn":
        soundfontPlayer?.note_on(msg.key, msg.velocity ?? 127);
        break;
      case "noteOff":
        soundfontPlayer?.note_off(msg.key);
        break;
      case "addSoundfont":
        soundfontPlayer?.add_soundfonts_from_file(
          msg.name,
          new Uint8Array(msg.data),
        );
        this.port.postMessage({ type: "soundfontAdded" });
        break;
      case "setPreset":
        soundfontPlayer?.set_preset(msg.soundfontId, msg.presetId);
        break;
      case "getState":
        this.port.postMessage({
          type: "state",
          state: soundfontPlayer?.get_state(),
        });
        break;
      case "setGain":
        soundfontPlayer?.set_gain(msg.gain);
        break;
    }
  }

  process(_inputs, outputs, _parameters) {
    const out_l = outputs[0]?.[0];
    const out_r = outputs[0]?.[1];
    if (!soundfontPlayer || !out_l || !out_r) return true;
    soundfontPlayer.process(out_l, out_r);
    return true;
  }
}

registerProcessor("oxisynth", OxiSynthProcessor);

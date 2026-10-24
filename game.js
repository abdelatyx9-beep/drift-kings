// ملوك التفحيط — drift & racing game (three.js)
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const $ = (id) => document.getElementById(id);
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const ar = (n) => Number(n).toLocaleString("ar-EG");
const IS_TOUCH = matchMedia("(pointer: coarse)").matches || "ontouchstart" in window;
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};
const SETTINGS = Object.assign({ quality: "auto", sound: true, cam: 0, ctl: "buttons", diff: "normal" }, store.get("dk.settings", {}));
function saveSettings() { store.set("dk.settings", SETTINGS); }
function mergeAll(gs) { if (gs.every((g) => !!g.index) || gs.every((g) => !g.index)) return mergeGeometries(gs); return mergeGeometries(gs.map((g) => (g.index ? g.toNonIndexed() : g))); }
function boxAt(w, h, d, x, y, z) { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; }
function fmtT(s) { if (!isFinite(s)) return "--:--"; const m = Math.floor(s / 60), r = s - m * 60; return ar(m) + ":" + (r < 10 ? "٠" : "") + r.toFixed(2).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[d]).replace(".", "٫"); }
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

// ---------------- renderer ----------------
const canvas = $("cv");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !IS_TOUCH, powerPreference: "high-performance" });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const QUALITY = { low: { pr: 0.75, shadow: 0, draw: 450, hq: false }, medium: { pr: 1, shadow: 1024, draw: 700, hq: false }, high: { pr: 1.75, shadow: 2048, draw: 1000, hq: true } };
let Q = QUALITY.medium, basePR = 1;
// adaptive resolution: if the frame rate drops, render fewer pixels (the HUD stays sharp)
const ADAPT = { t: 0, n: 0, scale: 1 };
function setRes() { renderer.setPixelRatio(basePR * ADAPT.scale); resize(); }
function adaptRes(dt) {
  if (window.__fast) return; ADAPT.t += dt; ADAPT.n++;
  if (ADAPT.t < 1.2) return; const fps = ADAPT.n / ADAPT.t; ADAPT.t = 0; ADAPT.n = 0;
  if (fps < 50 && ADAPT.scale > 0.55) { ADAPT.scale = Math.max(0.55, ADAPT.scale - 0.12); setRes(); }
  else if (fps > 58.5 && ADAPT.scale < 1) { ADAPT.scale = Math.min(1, ADAPT.scale + 0.05); setRes(); }
}
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 3000);
const hemi = new THREE.HemisphereLight(0xdfeefa, 0x5b5a3c, 0.8); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d6, 2.6); sun.castShadow = true;
const sc = sun.shadow.camera; sc.left = -40; sc.right = 40; sc.top = 40; sc.bottom = -40; sc.near = 1; sc.far = 260;
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04; scene.add(sun); scene.add(sun.target);
function resize() { const w = canvas.clientWidth, h = canvas.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
window.addEventListener("resize", resize);
function applyQuality() {
  const k = SETTINGS.quality === "auto" ? (IS_TOUCH ? "medium" : "high") : SETTINGS.quality; Q = QUALITY[k];
  basePR = Math.min(Q.pr, Math.max(1, window.devicePixelRatio || 1)) * (k === "low" ? 0.8 : 1); ADAPT.scale = 1; renderer.setPixelRatio(basePR); camera.far = Q.draw + 120;
  sun.castShadow = Q.shadow > 0; if (Q.shadow && sun.shadow.mapSize.x !== Q.shadow) { sun.shadow.mapSize.set(Q.shadow, Q.shadow); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  resize();
}
// reflections: a soft studio sky baked into an environment map (makes the paint shine)
const pmrem = new THREE.PMREMGenerator(renderer);
function makeEnv(day) {
  const s = new THREE.Scene();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide,
    uniforms: { top: { value: new THREE.Color(day ? 0x6fa8dc : 0x0b1530) }, mid: { value: new THREE.Color(day ? 0xe9f1f7 : 0x3a2d55) }, bot: { value: new THREE.Color(day ? 0x4b4a3a : 0x0a0a10) } },
    vertexShader: "varying vec3 p; void main(){ p = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }",
    fragmentShader: "uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 p; void main(){ float h = p.y; vec3 c = h > 0. ? mix(mid, top, pow(h, .6)) : mix(mid, bot, pow(-h, .4)); gl_FragColor = vec4(c, 1.); }" }));
  s.add(sky);
  const panel = (x, y, z, w, h, c) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); s.add(m); };
  if (day) { panel(0, 30, 10, 40, 10, 0xffffff); panel(30, 18, -10, 18, 8, 0xfff2d8); panel(-30, 14, -16, 18, 8, 0xdfe8ff); }
  else { panel(0, 25, 0, 30, 4, 0xffd9a0); panel(25, 8, 10, 6, 12, 0xff4fa0); panel(-25, 8, -10, 6, 12, 0x4fd2ff); panel(0, 10, -28, 20, 3, 0xffffff); }
  const rt = pmrem.fromScene(s, 0.04); return rt.texture;
}
const ENV = { day: null, night: null };
function canvasTex(w, h, draw, rep) {
  const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; } return t;
}
function noiseFill(g, w, h, col, n, a) { g.fillStyle = col; g.fillRect(0, 0, w, h); for (let i = 0; i < n; i++) { const v = Math.random() < 0.5 ? 0 : 255; g.fillStyle = `rgba(${v},${v},${v},${Math.random() * a})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); } }

// ---------------- audio ----------------
let ac = null, master = null;
function audio() {
  if (!SETTINGS.sound) return null;
  if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); master = ac.createGain(); master.gain.value = 0.8; master.connect(ac.destination); } catch (e) { return null; } }
  if (ac.state === "suspended") ac.resume(); return ac;
}
let noiseBuf = null;
function noise(vol, dur, f0, f1) {
  const a = audio(); if (!a) return;
  if (!noiseBuf) { noiseBuf = a.createBuffer(1, a.sampleRate, a.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(), t = a.currentTime;
  s.buffer = noiseBuf; f.type = "bandpass"; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur);
}
function tone(freq, dur, type = "square", vol = 0.05, slide = 0) {
  const a = audio(); if (!a) return; const t = a.currentTime, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(master); o.start(t); o.stop(t + dur);
}
function buzz(ms) { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} }
// engine: two detuned oscillators through a filter, plus a looping tyre squeal
const engine = { on: false };
function engineStart() {
  const a = audio(); if (!a || engine.on) return;
  const o1 = a.createOscillator(), o2 = a.createOscillator(), o3 = a.createOscillator(), f = a.createBiquadFilter(), g = a.createGain();
  o1.type = "sawtooth"; o2.type = "square"; o3.type = "sawtooth"; f.type = "lowpass"; f.frequency.value = 900; f.Q.value = 3; g.gain.value = 0;
  for (const o of [o1, o2, o3]) { o.connect(f); o.start(); } f.connect(g); g.connect(master);
  const sq = a.createBufferSource(); if (!noiseBuf) noise(0.0001, 0.01, 1000, 1000); sq.buffer = noiseBuf; sq.loop = true;
  const sf = a.createBiquadFilter(); sf.type = "bandpass"; sf.frequency.value = 2600; sf.Q.value = 6; const sg = a.createGain(); sg.gain.value = 0; sq.connect(sf); sf.connect(sg); sg.connect(master); sq.start();
  Object.assign(engine, { on: true, o1, o2, o3, f, g, sq, sg });
}
function engineStop() { if (!engine.on) return; try { const t = ac.currentTime; engine.g.gain.setTargetAtTime(0, t, 0.05); engine.sg.gain.setTargetAtTime(0, t, 0.05); for (const o of [engine.o1, engine.o2, engine.o3, engine.sq]) o.stop(t + 0.3); } catch (e) {} engine.on = false; }
function engineTick(rpm, thr, slip) {
  if (!engine.on || !ac) return; const t = ac.currentTime, f = 38 + rpm * 150;
  engine.o1.frequency.setTargetAtTime(f, t, 0.03); engine.o2.frequency.setTargetAtTime(f * 0.5, t, 0.03); engine.o3.frequency.setTargetAtTime(f * 1.505, t, 0.03);
  engine.f.frequency.setTargetAtTime(500 + rpm * 1800 + thr * 600, t, 0.05);
  engine.g.gain.setTargetAtTime(0.035 + thr * 0.04 + rpm * 0.01, t, 0.05);
  engine.sg.gain.setTargetAtTime(clamp((slip - 0.18) * 0.22, 0, 0.12), t, 0.06);
}

// ---------------- cars ----------------
// Each body is lofted from smooth side/plan curves (x forward, y up), so the paint flows like a real car:
// rounded shoulders, wheel arches cut into the body, a glass cabin with pillars and a painted roof.
// B: L/W size, r wheel radius, wx axle distance from centre, tw tyre width, sh shoulder height,
// top/bot: upper body line and lower body line (rear → front), cab: x3 rear-glass base, x2 roof end, x1 roof start, x0 windscreen base.
const CARS = [
  { id: "saqr", name: "صقر GT", desc: "كوبيه رياضية متوازنة وسهلة", max: 58, acc: 10.5, grip: 7.2, drift: 0.9, steer: 1.0, nitro: 1.0,
    look: { paint: "#c81e1e", rim: 0, rimC: "#c9ccd1", spoiler: "lip" },
    B: { L: 4.5, W: 1.9, r: 0.34, tw: 0.25, wx: 1.36, sh: 0.6, flare: [0.03, 0.06], rc: [0.5, 0.42], lights: "slim", tail: "bar",
      top: [[-2.25, 0.6], [-2.17, 0.78], [-1.95, 0.88], [-1.4, 0.92], [-0.6, 0.91], [0.6, 0.89], [1.2, 0.85], [1.8, 0.76], [2.12, 0.64], [2.25, 0.5]],
      bot: [[-2.25, 0.44], [-2.05, 0.3], [-1.7, 0.27], [1.8, 0.25], [2.15, 0.3], [2.25, 0.38]],
      cab: { x3: -1.6, x2: -0.55, x1: 0.15, x0: 0.95, roof: 1.3, tumble: 0.32, n: 3.4, b: -0.2, cp: [-1.6, -0.78] } } },
  { id: "theeb", name: "ذيب R", desc: "يابانية خفيفة، الخلفية تلف بسهولة", max: 60, acc: 11, grip: 6.6, drift: 1.35, steer: 1.12, nitro: 1.0,
    look: { paint: "#f4f4f4", rim: 2, rimC: "#1b1b1d", spoiler: "wing" },
    B: { L: 4.45, W: 1.82, r: 0.33, tw: 0.24, wx: 1.3, sh: 0.58, flare: [0.025, 0.04], rc: [0.45, 0.38], lights: "slim", tail: "split",
      top: [[-2.225, 0.62], [-2.15, 0.84], [-1.9, 0.93], [-1.3, 0.95], [-0.9, 0.92], [0.6, 0.86], [1.3, 0.82], [1.9, 0.72], [2.15, 0.62], [2.225, 0.48]],
      bot: [[-2.225, 0.42], [-2.0, 0.28], [1.8, 0.26], [2.12, 0.3], [2.225, 0.38]],
      cab: { x3: -1.2, x2: -0.6, x1: 0.1, x0: 0.75, roof: 1.27, tumble: 0.3, n: 3.6, b: -0.25, cp: [-1.2, -0.82] } } },
  { id: "asifa", name: "عاصفة V8", desc: "أمريكية عضلات، قوة وحشية", max: 66, acc: 12.5, grip: 6.4, drift: 1.2, steer: 0.9, nitro: 1.15,
    look: { paint: "#151517", rim: 3, rimC: "#d9d9dc", spoiler: "duck", decal: "stripes", c2: "#e8e8e8" },
    B: { L: 4.85, W: 2.0, r: 0.36, tw: 0.28, wx: 1.45, sh: 0.66, flare: [0.03, 0.05], rc: [0.32, 0.3], lights: "round", tail: "bar", scoop: true,
      top: [[-2.425, 0.66], [-2.35, 0.9], [-2.1, 0.98], [-1.6, 0.99], [-0.8, 0.98], [0.5, 0.98], [1.4, 0.97], [2.1, 0.92], [2.33, 0.82], [2.425, 0.62]],
      bot: [[-2.425, 0.46], [-2.2, 0.3], [2.1, 0.28], [2.35, 0.33], [2.425, 0.42]],
      cab: { x3: -1.75, x2: -0.75, x1: -0.05, x0: 0.6, roof: 1.36, tumble: 0.28, n: 3.2, b: -0.35, cp: [-1.75, -0.95] } } },
  { id: "barq", name: "برق X", desc: "سوبركار بمحرك وسطي، تلتصق بالأرض", max: 74, acc: 13.4, grip: 8.4, drift: 0.8, steer: 1.05, nitro: 1.25,
    look: { paint: "#ff6a00", rim: 4, rimC: "#26272b", spoiler: "gt", caliper: "#ffd400" },
    B: { L: 4.6, W: 2.05, r: 0.35, tw: 0.29, wx: 1.38, sh: 0.55, flare: [0.05, 0.08], rc: [0.55, 0.4], lights: "slim", tail: "bar", intake: true,
      top: [[-2.3, 0.62], [-2.2, 0.82], [-1.8, 0.88], [-1.0, 0.9], [0.3, 0.86], [0.9, 0.85], [1.5, 0.84], [1.95, 0.68], [2.2, 0.52], [2.3, 0.4]],
      bot: [[-2.3, 0.42], [-2.1, 0.26], [2.0, 0.22], [2.3, 0.3]],
      cab: { x3: -1.85, x2: -0.5, x1: 0.05, x0: 0.75, roof: 1.13, tumble: 0.36, n: 3.0, b: null, cp: [-1.85, -0.8] } } },
  { id: "nimr", name: "نمر S", desc: "سيدان كلاسيكية طويلة، ملكة التفحيط", max: 62, acc: 11.2, grip: 6.5, drift: 1.3, steer: 0.98, nitro: 1.05,
    look: { paint: "#e9e4d8", rim: 3, rimC: "#c9ccd1", spoiler: "none", roof: "c2", c2: "#5b1a1a" },
    B: { L: 5.0, W: 1.95, r: 0.35, tw: 0.25, wx: 1.5, sh: 0.66, flare: [0.01, 0.01], rc: [0.28, 0.28], lights: "rect", tail: "split",
      top: [[-2.5, 0.68], [-2.44, 0.92], [-2.2, 0.99], [-1.5, 1.0], [-1.1, 0.98], [0.7, 0.95], [1.5, 0.94], [2.3, 0.9], [2.45, 0.82], [2.5, 0.64]],
      bot: [[-2.5, 0.44], [-2.35, 0.3], [2.3, 0.28], [2.45, 0.32], [2.5, 0.42]],
      cab: { x3: -1.35, x2: -0.85, x1: 0.3, x0: 0.85, roof: 1.43, tumble: 0.24, n: 4, b: -0.25, cp: [-1.35, -0.92] } } },
  { id: "hamour", name: "هامور 4×4", desc: "جيب عالي وقوي، يفحّط ويطلع الطعوس", max: 56, acc: 10.2, grip: 6.1, drift: 1.25, steer: 0.92, nitro: 1.0,
    look: { paint: "#f2f2ee", rim: 1, rimC: "#9ea3a8", spoiler: "none" },
    B: { L: 4.95, W: 1.98, r: 0.42, tw: 0.3, wx: 1.42, sh: 0.88, flare: [0.04, 0.04], rc: [0.25, 0.22], lights: "rect", tail: "round", suv: true,
      top: [[-2.475, 0.98], [-2.42, 1.12], [-2.0, 1.15], [0.9, 1.14], [1.6, 1.12], [2.3, 1.06], [2.43, 0.96], [2.475, 0.8]],
      bot: [[-2.475, 0.6], [-2.3, 0.5], [2.25, 0.5], [2.475, 0.62]],
      cab: { x3: -2.38, x2: -2.1, x1: 0.5, x0: 1.05, roof: 1.88, tumble: 0.18, n: 5, b: -0.2, b2: -1.25, cp: [-2.38, -1.98] } } }
];
for (const c of CARS) { c.len = c.B.L; c.wid = c.B.W; }
const UPG = { engine: { name: "المحرك", cost: [600, 1200, 2200, 3600] }, tires: { name: "الكفرات", cost: [500, 1000, 1800, 3000] }, nitro: { name: "النيترو", cost: [500, 1000, 1800, 3000] }, susp: { name: "التوجيه", cost: [400, 800, 1500, 2600] } };
const PALETTE = ["#c81e1e", "#ff5a1f", "#f2c230", "#9bd13a", "#1aa36b", "#13b5c8", "#1f6fe0", "#27318a", "#7b2fd1", "#e0398c", "#f4f4f4", "#b8bcc2", "#5d6168", "#151517", "#6b4a2b", "#e9e4d8"];
const FINISH = { gloss: "لامع", metal: "ميتاليك", matte: "مطفي", pearl: "لؤلؤي", chrome: "كروم" };
const DECALS = { none: "بدون", stripes: "خطين", side: "خط جانبي", number: "رقم", race: "خطين ورقم", two: "لونين" };
const ROOFS = { same: "نفس اللون", c2: "اللون الثاني", black: "أسود" };
const SPOILERS = { none: "بدون", lip: "شفة", duck: "بطة", wing: "جناح", gt: "جناح كبير" };
const RIM_STYLES = ["رياضي", "شبكي", "صحن", "خماسي", "توربين"];
const TINTS = ["فاتح", "متوسط", "أسود"];
const SMOKES = ["#e6e6e6", "#2a2a2a", "#ff4d4d", "#4da6ff", "#9b59ff", "#ffd23f", "#3fd98a"];
const NEONS = ["", "#2fd0ff", "#ff2f8e", "#8a3bff", "#3fff7a", "#ffb02f", "#ffffff"];
function defaultLook(c) {
  return Object.assign({ paint: "#c81e1e", finish: "metal", c2: "#151517", decal: "none", num: 7, roof: "same", tint: 1, rim: 0, rimC: "#c9ccd1", caliper: "#d42020", spoiler: "none", height: 0, neon: "", smoke: "#e6e6e6" }, c.look);
}
function carStats(c, up) {
  up = up || {}; const e = up.engine || 0, t = up.tires || 0, n = up.nitro || 0, s = up.susp || 0;
  return { max: c.max * (1 + 0.045 * e), acc: c.acc * (1 + 0.08 * e), grip: c.grip * (1 + 0.06 * t), drift: c.drift, steer: c.steer * (1 + 0.05 * s), nitro: c.nitro * (1 + 0.15 * n), nitroCap: 4 + n * 0.8 };
}

// ---- smooth curve through key points (monotone cubic, no overshoot) ----
function mono(k) {
  const n = k.length, xs = k.map((p) => p[0]), ys = k.map((p) => p[1]), d = [], m = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) { if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; } const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b; if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; } }
  return (x) => {
    if (x <= xs[0]) return ys[0]; if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}
// cross-section: phi 0 = bottom centre, 0.25 = middle of the right side, 0.5 = top centre, 1 = bottom centre again (left side)
function ringYZ(yb, yt, w, phi, ym, nb, nt, tum) {
  const side = phi <= 0.5 ? 1 : -1, t = side > 0 ? -Math.PI / 2 + phi * TAU : Math.PI / 2 - (phi - 0.5) * TAU;
  const s = Math.sin(t), c = Math.max(0, Math.cos(t));
  if (s < 0) { const e = 2 / nb; return [ym - (ym - yb) * Math.pow(-s, e), side * w * Math.pow(c, e)]; }
  const e = 2 / nt; return [ym + (yt - ym) * Math.pow(s, e), side * w * Math.pow(c, e) * (1 - tum * s)];
}
function bodyFns(B) {
  const L2 = B.L / 2, top = mono(B.top), bot = mono(B.bot), C = B.cab;
  const fl = Math.max(B.flare[0], B.flare[1]), wb = B.W / 2 - 0.035 - fl;
  const yt = (x) => top(x);
  const yb = (x) => { let y = bot(x); for (const X of [B.wx, -B.wx]) { const d = Math.abs(x - X), ra = B.r + 0.075; if (d < ra) y = Math.max(y, B.r + Math.sqrt(ra * ra - d * d)); } return Math.min(y, yt(x) - 0.07); };
  const w = (x) => {
    let v = wb + B.flare[0] * Math.exp(-Math.pow((x - B.wx) / 0.62, 2)) + B.flare[1] * Math.exp(-Math.pow((x + B.wx) / 0.62, 2)) + fl * 0.35;
    v *= 1 - 0.035 * Math.pow(x / L2, 2);
    const rf = B.rc[0], rr = B.rc[1];
    if (x > L2 - rf) { const u = clamp((x - (L2 - rf)) / rf, 0, 1); v *= Math.pow(Math.max(0, 1 - Math.pow(u, 4)), 0.25); }
    if (x < -L2 + rr) { const u = clamp((-L2 + rr - x) / rr, 0, 1); v *= Math.pow(Math.max(0, 1 - Math.pow(u, 4)), 0.25); }
    return v;
  };
  const body = (x, phi) => { const a = yb(x), b = yt(x); return ringYZ(a, b, w(x), phi, clamp(B.sh, a + 0.02, b - 0.04), 6, 4.4, 0.1); };
  const belt = (x) => yt(x) - 0.012;
  const roofF = mono([[C.x3, belt(C.x3)], [C.x2, C.roof], [(C.x1 + C.x2) / 2, C.roof + 0.012], [C.x1, C.roof], [C.x0, belt(C.x0)]]);
  const wc = (x) => Math.min(w(x) - 0.07, B.W / 2 - 0.1);
  const cab = (x, phi) => { const a = belt(x); return ringYZ(a, Math.max(a + 0.001, roofF(x)), wc(x), phi, a, 2, C.n + 2.4, C.tumble + 0.06); };
  return { L2, yt, yb, w, body, cab, belt, roofF };
}
// surface patch along x between phi p0..p1 (mirrored to the other side when asked), pushed out by `inf`
function loftGeo(ring, xs, p0, p1, np, inf, L, mirror) {
  const build = (q0, q1) => {
    const pos = [], uv = [], idx = [], nx = xs.length;
    for (let i = 0; i < nx; i++) for (let j = 0; j <= np; j++) { const phi = q0 + (q1 - q0) * j / np, [y, z] = ring(xs[i], phi); pos.push(xs[i], y, z); uv.push((xs[i] + L / 2) / L, phi); }
    for (let i = 0; i < nx - 1; i++) for (let j = 0; j < np; j++) { const a = i * (np + 1) + j, b = a + np + 1, c = a + 1, d = b + 1; idx.push(a, b, c, b, d, c); }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    if (inf) { const p = g.attributes.position, n = g.attributes.normal; for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + n.getX(i) * inf, p.getY(i) + n.getY(i) * inf, p.getZ(i) + n.getZ(i) * inf); g.computeVertexNormals(); }
    return g;
  };
  const g1 = build(p0, p1); if (!mirror) return g1;
  return mergeGeometries([g1, build(1 - p1, 1 - p0)]);
}
function span(a, b, step) { const n = Math.max(2, Math.ceil(Math.abs(b - a) / step) + 1), out = []; for (let i = 0; i < n; i++) out.push(a + (b - a) * i / (n - 1)); return out; }
// where does the body surface sit at height y and sideways z? (searches from the tip inward)
function surfX(F, y, z, front) {
  const s = front ? -1 : 1; let x0 = front ? F.L2 : -F.L2;
  for (let k = 0; k < 160; k++) {
    const x = x0 + s * k * 0.006; let best = 0;
    for (let j = 0; j <= 60; j++) { const [yy, zz] = F.body(x, j / 120); if (Math.abs(yy - y) < 0.04) best = Math.max(best, zz); }
    if (best >= Math.abs(z)) return x;
  }
  return x0 + s * 0.6;
}
function ellip(rx, ry, rz, x, y, z, seg = 14) { const g = new THREE.SphereGeometry(1, seg, Math.max(6, seg >> 1)); g.scale(rx, ry, rz); g.translate(x, y, z); return g; }
function cyl(r0, r1, h, seg, open) { return new THREE.CylinderGeometry(r0, r1, h, seg, 1, !!open); }

const CAR_GEO = {};
function carGeos(c, lo) {
  const gk = c.id + (lo ? "_lo" : ""); if (CAR_GEO[gk]) return CAR_GEO[gk];
  const B = c.B, C = B.cab, F = bodyFns(B), L = B.L, L2 = F.L2;
  const out = { paint: [], roof: [], glass: [], trim: [], carbon: [], chrome: [], head: [], drl: [], tail: [], plate: [], grille: [] };
  // stations: fine near both ends so the nose and tail stay round
  const xs = [...new Set([...span(-L2, -L2 + 0.14, 0.012), ...span(-L2 + 0.14, L2 - 0.14, lo ? 0.07 : 0.04), ...span(L2 - 0.14, L2, 0.012)].map((v) => +v.toFixed(4)))].sort((a, b) => a - b);
  out.paint.push(loftGeo(F.body, xs, 0, 1, lo ? 30 : 44, 0, L, false));
  // glass cabin, painted roof, pillars
  const cx = span(C.x3, C.x0, lo ? 0.07 : 0.035);
  out.glass.push(loftGeo(F.cab, cx, 0, 1, lo ? 20 : 30, 0, L, false));
  out.roof.push(loftGeo(F.cab, span(C.x2 + 0.02, C.x1 - 0.02, 0.035), 0.355, 0.645, 16, 0.008, L, false));
  out.trim.push(loftGeo(F.cab, span(C.x1 - 0.04, C.x0 - 0.01, 0.03), 0.345, 0.37, 2, 0.007, L, true)); // A-pillars
  if (C.b != null) out.trim.push(loftGeo(F.cab, span(C.b - 0.04, C.b + 0.04, 0.02), 0.0, 0.36, 8, 0.007, L, true));
  if (C.b2 != null) out.trim.push(loftGeo(F.cab, span(C.b2 - 0.04, C.b2 + 0.04, 0.02), 0.0, 0.36, 8, 0.007, L, true));
  out.paint.push(loftGeo(F.cab, span(C.cp[0], C.cp[1], 0.03), 0.0, 0.36, 12, 0.006, L, true)); // rear quarter / C-pillar in body colour
  out.trim.push(loftGeo(F.cab, span(C.x3 + 0.02, C.x0 - 0.02, 0.04), 0.0, 0.03, 2, 0.006, L, true)); // window seal along the belt
  // lights follow the body surface
  const lightsF = { slim: [L2 - 0.3, L2 - 0.07, 0.345, 0.405], round: [L2 - 0.24, L2 - 0.06, 0.32, 0.41], rect: [L2 - 0.2, L2 - 0.04, 0.32, 0.4] }[B.lights];
  out.trim.push(loftGeo(F.body, span(lightsF[0] - 0.03, lightsF[1] + 0.02, 0.012), lightsF[2] - 0.012, lightsF[3] + 0.01, 8, 0.004, L, true));
  out.head.push(loftGeo(F.body, span(lightsF[0], lightsF[1], 0.012), lightsF[2], lightsF[3], 8, 0.007, L, true));
  out.drl.push(loftGeo(F.body, span(lightsF[0] + 0.02, lightsF[1], 0.012), lightsF[2] - 0.01, lightsF[2] - 0.003, 1, 0.009, L, true));
  const tailF = { bar: [-L2, -L2 + 0.16, 0.37, 0.415], split: [-L2 + 0.035, -L2 + 0.24, 0.34, 0.415], round: [-L2 + 0.05, -L2 + 0.22, 0.29, 0.43] }[B.tail];
  out.trim.push(loftGeo(F.body, span(tailF[0], tailF[1] + 0.02, 0.01), tailF[2] - 0.01, tailF[3] + 0.008, 6, 0.004, L, true));
  out.tail.push(loftGeo(F.body, span(tailF[0], tailF[1], 0.01), tailF[2], tailF[3], 6, 0.007, L, true));
  // grille, lower intake, rear diffuser, side skirts
  const gx = B.suv ? 0.03 : B.lights === "round" ? 0.022 : 0.012;
  out.grille.push(loftGeo(F.body, span(L2 - gx, L2, 0.002), B.suv ? 0.15 : 0.14, B.suv ? 0.34 : 0.29, 10, 0.006, L, true));
  out.chrome.push(loftGeo(F.body, span(L2 - gx - 0.004, L2 - gx + 0.002, 0.002), B.suv ? 0.15 : 0.14, B.suv ? 0.34 : 0.29, 10, 0.008, L, true));
  out.carbon.push(loftGeo(F.body, span(L2 - 0.05, L2, 0.006), 0.02, 0.1, 6, 0.008, L, true));
  out.carbon.push(loftGeo(F.body, span(-L2, -L2 + 0.18, 0.012), 0.015, 0.12, 6, 0.008, L, true));
  out.carbon.push(loftGeo(F.body, span(-B.wx + B.r + 0.12, B.wx - B.r - 0.12, 0.05), 0.02, 0.085, 3, 0.012, L, true));
  if (B.intake) out.grille.push(loftGeo(F.body, span(-0.9, -0.5, 0.03), 0.19, 0.27, 4, 0.006, L, true));
  if (B.suv) for (const s of [1, -1]) out.trim.push(boxAt(-C.x2 + C.x1 - 0.3, 0.04, 0.04, (C.x1 + C.x2) / 2, C.roof + 0.05, s * 0.6), boxAt(0.05, 0.05, 0.04, C.x1 - 0.2, C.roof + 0.02, s * 0.6), boxAt(0.05, 0.05, 0.04, C.x2 + 0.2, C.roof + 0.02, s * 0.6));
  // dark wheel-well liners inside the arches
  for (const X of [B.wx, -B.wx]) out.trim.push(new THREE.CylinderGeometry(B.r + 0.065, B.r + 0.065, B.W - 0.12, 24, 1, true, Math.PI - 1.3, 2.6).rotateX(Math.PI / 2).translate(X, B.r, 0));
  // dark tub underneath so the wheel arches look deep
  out.trim.push(boxAt(L - 0.7, (B.suv ? 0.38 : 0.36), B.W - 0.86, 0, (B.suv ? 0.42 : 0.2) + 0.18, 0));
  // number plates
  const pf = F.body(L2 - 0.01, 0.085), pr = F.body(-L2 + 0.01, 0.3);
  out.plate.push(boxAt(0.02, 0.11, 0.48, L2 + 0.004, pf[0], 0), boxAt(0.02, 0.12, 0.48, -L2 - 0.004, pr[0], 0));
  // mirrors
  for (const s of [1, -1]) {
    const mx = C.x0 - 0.22, my = F.belt(mx) + 0.1, mz = F.w(mx) + 0.01;
    out.paint.push(ellip(0.07, 0.055, 0.1, mx, my, s * mz));
    out.trim.push(boxAt(0.06, 0.03, 0.12, mx + 0.01, my - 0.05, s * (mz - 0.08)), ellip(0.01, 0.045, 0.085, mx - 0.066, my, s * mz, 8));
  }
  // exhaust tips
  const ex = B.suv ? [0.55] : B.lights === "round" ? [0.5, 0.38] : [0.42];
  for (const s of [1, -1]) for (const ez of ex) { const ey = B.suv ? 0.58 : 0.3, xx = surfX(F, ey, ez, false); out.chrome.push(cyl(0.052, 0.048, 0.22, 14, true).rotateZ(Math.PI / 2).translate(xx + 0.05, ey, s * ez)); out.trim.push(cyl(0.04, 0.04, 0.05, 10).rotateZ(Math.PI / 2).translate(xx - 0.045, ey, s * ez)); }
  if (B.scoop) out.carbon.push(boxAt(0.7, 0.09, 0.5, 1.1, F.yt(1.1) + 0.03, 0), boxAt(0.04, 0.06, 0.4, 1.46, F.yt(1.46) + 0.05, 0));
  const g = { F, B };
  for (const k in out) g[k] = out[k].length ? mergeAll(out[k]) : null;
  g.wr = B.r; g.wx = B.wx; g.wz = B.W / 2 - B.tw / 2 - 0.045; g.rr = B.r * (B.suv ? 0.62 : 0.72);
  g.tire = tireGeo(B.r, g.rr, B.tw, lo ? 18 : 30); g.disc = cyl(g.rr * 0.8, g.rr * 0.8, 0.028, 22).rotateX(Math.PI / 2).translate(0, 0, -0.01);
  const cal = mergeAll([boxAt(0.07, 0.2, 0.07, 0, 0, 0), boxAt(0.05, 0.12, 0.09, -0.015, 0, -0.005)]); cal.translate(0, 0, 0); cal.rotateZ(-0.6); cal.translate(-g.rr * 0.52, g.rr * 0.48, 0.01); g.caliper = cal;
  g.exhaust = ex.map((ez) => [surfX(F, B.suv ? 0.58 : 0.3, ez, false), B.suv ? 0.58 : 0.3, ez]);
  return (CAR_GEO[gk] = g);
}
function tireGeo(r, rr, tw, seg = 30) {
  const h = tw / 2, pts = [[rr + 0.012, -h * 0.9], [r - 0.05, -h], [r - 0.016, -h * 0.88], [r, -h * 0.55], [r, h * 0.55], [r - 0.016, h * 0.88], [r - 0.05, h], [rr + 0.012, h * 0.9]];
  return new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), seg).rotateX(Math.PI / 2);
}
// rim geometry: barrel, lip, hub and a style-specific face (face points to +z)
const RIM_GEO = {};
function rimGeo(style, rr, tw) {
  const key = style + ":" + rr.toFixed(3) + ":" + tw; if (RIM_GEO[key]) return RIM_GEO[key];
  const h = tw * 0.45, gs = [], deep = style === 2;
  gs.push(cyl(rr, rr, tw * 0.9, 28, true).rotateX(Math.PI / 2));
  gs.push(new THREE.TorusGeometry(rr - 0.004, deep ? 0.022 : 0.014, 6, 32).translate(0, 0, h));
  const fz = deep ? h - 0.09 : h - 0.03;
  if (deep) gs.push(new THREE.LatheGeometry([new THREE.Vector2(rr - 0.01, h), new THREE.Vector2(rr * 0.78, fz + 0.01), new THREE.Vector2(rr * 0.76, fz)], 28).rotateX(Math.PI / 2));
  gs.push(cyl(0.075, 0.085, 0.05, 16).rotateX(Math.PI / 2).translate(0, 0, fz), cyl(0.05, 0.05, 0.02, 12).rotateX(Math.PI / 2).translate(0, 0, fz + 0.03));
  const spoke = (ang, wd, th, r0, r1, z0, z1, tilt = 0) => { const len = r1 - r0, b = new THREE.BoxGeometry(wd, len, th); b.translate(0, r0 + len / 2, 0); if (tilt) b.rotateY(tilt); const p = b.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i), k = (y - r0) / len; p.setZ(i, p.getZ(i) + z0 + (z1 - z0) * k); } b.rotateZ(ang); gs.push(b); };
  const R1 = (deep ? rr * 0.77 : rr - 0.012);
  if (style === 0) for (let i = 0; i < 5; i++) for (const o of [-0.13, 0.13]) spoke(i / 5 * TAU + o, 0.028, 0.03, 0.07, R1, fz, h - 0.01);
  else if (style === 1) for (let i = 0; i < 14; i++) spoke(i / 14 * TAU, 0.016, 0.022, 0.07, R1, fz, h - 0.008, (i % 2 ? 0.25 : -0.25));
  else if (style === 2) for (let i = 0; i < 8; i++) spoke(i / 8 * TAU, 0.03, 0.03, 0.07, R1, fz, fz + 0.005);
  else if (style === 3) for (let i = 0; i < 5; i++) spoke(i / 5 * TAU, 0.075, 0.035, 0.07, R1, fz, h - 0.01);
  else { gs.push(new THREE.CircleGeometry(R1, 28).translate(0, 0, fz - 0.004)); for (let i = 0; i < 12; i++) spoke(i / 12 * TAU, 0.02, 0.03, 0.09, R1 - 0.01, fz + 0.012, fz + 0.016, 0.7); }
  return (RIM_GEO[key] = mergeAll(gs));
}
// wings, lips and ducktails, mounted on the boot (or the roof of the 4x4)
const KIT_GEO = {};
function kitGeo(c, sp) {
  const key = c.id + sp; if (key in KIT_GEO) return KIT_GEO[key];
  const B = c.B, F = carGeos(c).F, W = B.W, paint = [], carbon = [];
  if (B.suv) {
    const x = B.cab.x2 - 0.02, y = B.cab.roof;
    if (sp === "lip" || sp === "duck") paint.push(boxAt(0.3, 0.05, W - 0.35, x - 0.1, y + 0.01, 0));
    else if (sp === "wing" || sp === "gt") { carbon.push(boxAt(0.42, 0.05, W - 0.25, x - 0.12, y + 0.08, 0)); for (const s of [1, -1]) carbon.push(boxAt(0.12, 0.09, 0.05, x - 0.05, y + 0.04, s * 0.55)); }
  } else {
    const xe = -F.L2 + 0.3, ye = F.yt(xe);
    if (sp === "lip") { const g = boxAt(0.14, 0.03, F.w(xe) * 1.75, xe - 0.04, ye + 0.012, 0); g.rotateZ(0); paint.push(g); }
    else if (sp === "duck") { const g = new THREE.BoxGeometry(0.34, 0.05, F.w(xe) * 1.8); g.rotateZ(-0.28); g.translate(xe - 0.02, ye + 0.04, 0); paint.push(g); }
    else if (sp === "wing" || sp === "gt") {
      const big = sp === "gt", hgt = big ? 0.38 : 0.24, ch = big ? 0.42 : 0.3, xw = -F.L2 + (big ? 0.28 : 0.3), yw = F.yt(xw) + hgt, span2 = W - (big ? 0.12 : 0.28);
      const wing = new THREE.BoxGeometry(ch, 0.035, span2); const p = wing.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setY(i, p.getY(i) + (x / ch) * 0.06 + (x > 0 ? 0.008 : 0)); } wing.rotateZ(-0.08); wing.translate(xw, yw, 0); carbon.push(wing);
      for (const s of [1, -1]) {
        carbon.push(boxAt(ch + 0.06, big ? 0.2 : 0.13, 0.015, xw - 0.01, yw - 0.02, s * span2 / 2));
        const post = boxAt(0.12, hgt, 0.03, 0, hgt / 2, 0); post.rotateZ(big ? 0.25 : 0.1); post.translate(xw + 0.02, F.yt(xw) - 0.01, s * (big ? 0.42 : 0.5)); carbon.push(post);
      }
      if (big) carbon.push(boxAt(0.22, 0.02, span2, xw - 0.18, yw + 0.06, 0));
    }
  }
  return (KIT_GEO[key] = { paint: paint.length ? mergeAll(paint) : null, carbon: carbon.length ? mergeAll(carbon) : null });
}

// ---- materials ----
const CMAT = {};
function sharedMats() {
  if (CMAT.ready) return CMAT; CMAT.ready = true;
  CMAT.trim = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.45, metalness: 0.3, side: THREE.DoubleSide });
  CMAT.carbon = new THREE.MeshStandardMaterial({ map: carbonTex(), color: 0x9aa0a8, roughness: 0.32, metalness: 0.4 });
  CMAT.chrome = new THREE.MeshStandardMaterial({ color: 0xe6e6e6, roughness: 0.1, metalness: 1 });
  CMAT.tire = new THREE.MeshStandardMaterial({ color: 0x171717, roughness: 0.88, side: THREE.DoubleSide, map: tireTex() });
  CMAT.disc = new THREE.MeshStandardMaterial({ color: 0x8a8d92, roughness: 0.35, metalness: 0.85 });
  CMAT.plate = new THREE.MeshStandardMaterial({ map: plateTex(), roughness: 0.5 });
  CMAT.blob = new THREE.MeshBasicMaterial({ map: blobTex(), transparent: true, depthWrite: false, opacity: 0.7, color: 0x000000 });
  CMAT.grille = new THREE.MeshStandardMaterial({ map: grilleTex(), roughness: 0.5, metalness: 0.4 });
  CMAT.drl = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xeaf4ff, emissiveIntensity: 2.2 });
  return CMAT;
}
function carbonTex() { return canvasTex(64, 64, (g, w, h) => { for (let y = 0; y < h; y += 8) for (let x = 0; x < w; x += 8) { const k = ((x + y) / 8) % 2; const gr = g.createLinearGradient(x, y, x + 8, y + 8); gr.addColorStop(0, k ? "#2a2d32" : "#16181b"); gr.addColorStop(1, k ? "#16181b" : "#2a2d32"); g.fillStyle = gr; g.fillRect(x, y, 8, 8); } }, true); }
function grilleTex() { const t = canvasTex(128, 64, (g, w, h) => { g.fillStyle = "#050505"; g.fillRect(0, 0, w, h); g.strokeStyle = "#3a3c40"; g.lineWidth = 2; for (let y = 0; y < h + 8; y += 8) for (let x = (y / 8) % 2 ? 4 : 0; x < w + 8; x += 8) { g.beginPath(); g.moveTo(x - 4, y); g.lineTo(x, y - 4); g.lineTo(x + 4, y); g.lineTo(x, y + 4); g.closePath(); g.stroke(); } }, true); t.repeat.set(40, 6); return t; }
function tireTex() { const t = canvasTex(256, 16, (g, w, h) => { g.fillStyle = "#1a1a1a"; g.fillRect(0, 0, w, h); g.fillStyle = "#0d0d0d"; for (let x = 0; x < w; x += 8) g.fillRect(x, 0, 3, h); }, true); t.repeat.set(1, 1); return t; }
function plateTex() { return canvasTex(128, 32, (g, w, h) => { g.fillStyle = "#f4f4f0"; g.fillRect(0, 0, w, h); g.strokeStyle = "#111"; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, h - 2); g.fillStyle = "#111"; g.font = "bold 18px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("ملوك ٧٧٧", w / 2, h / 2 + 1); }); }
function blobTex() { return canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 4, 32, 32, 32); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }); }
const FIN = { gloss: { m: 0.05, r: 0.32, cc: 1, ccr: 0.04 }, metal: { m: 0.65, r: 0.3, cc: 1, ccr: 0.05 }, matte: { m: 0.15, r: 0.72, cc: 0, ccr: 0.6 }, pearl: { m: 0.35, r: 0.24, cc: 1, ccr: 0.04, ir: 1 }, chrome: { m: 1, r: 0.06, cc: 1, ccr: 0.02 } };
function paintMaterial(hq) {
  return hq ? new THREE.MeshPhysicalMaterial({ color: 0xffffff, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.2 }) : new THREE.MeshStandardMaterial({ color: 0xffffff, envMapIntensity: 1.2 });
}
function applyFinish(m, f) {
  const F = FIN[f] || FIN.metal; m.metalness = F.m; m.roughness = F.r;
  if (m.isMeshPhysicalMaterial) { m.clearcoat = F.cc; m.clearcoatRoughness = F.ccr; m.iridescence = F.ir ? 0.9 : 0; m.iridescenceIOR = 1.6; }
  m.needsUpdate = true;
}
// paint + decals drawn into one texture (u = along the car, v = around the body)
function drawPaint(cv, look, L, B) {
  const g = cv.getContext("2d"), W = cv.width, H = cv.height;
  g.fillStyle = look.paint; g.fillRect(0, 0, W, H);
  // subtle panel gaps: doors, bonnet and boot lid — they make the body read as a real car
  if (B) {
    const U = (x) => (x + L / 2) / L * W, Yp = (phi) => (1 - phi) * H, C = B.cab;
    g.strokeStyle = "rgba(0,0,0,0.5)"; g.lineWidth = 2;
    const vline = (x, p0, p1) => { for (const [a, b] of [[p0, p1], [1 - p1, 1 - p0]]) { g.beginPath(); g.moveTo(U(x), Yp(a)); g.lineTo(U(x), Yp(b)); g.stroke(); } };
    const hline = (x0, x1, p) => { for (const q of [p, 1 - p]) { g.beginPath(); g.moveTo(U(x0), Yp(q)); g.lineTo(U(x1), Yp(q)); g.stroke(); } };
    const dF = C.x0 - 0.12, dB = C.b != null ? C.b - 0.02 : C.x2 + 0.15;
    vline(dF, 0.1, 0.425); vline(dB, 0.1, 0.425); if (C.b2 != null) vline(C.b2 - 0.02, 0.1, 0.425);
    hline(dF, dB, 0.1);
    const hx = C.x0 + 0.1; g.beginPath(); g.moveTo(U(hx), Yp(0.38)); g.lineTo(U(hx), Yp(0.62)); g.stroke(); hline(hx, L / 2 - 0.12, 0.38);
    if (!B.suv) { const tx = C.x3 - 0.08; g.beginPath(); g.moveTo(U(tx), Yp(0.39)); g.lineTo(U(tx), Yp(0.61)); g.stroke(); hline(-L / 2 + 0.1, tx, 0.39); }
    g.fillStyle = "rgba(0,0,0,0.4)"; g.fillRect(U(-B.wx - 0.45) - 8, Yp(0.36) - 6, 16, 12); // fuel flap
  }
  const d = look.decal, c2 = look.c2, Y = (phi) => (1 - phi) * H;
  if (d === "two") { g.fillStyle = c2; g.fillRect(0, Y(0.17), W, H); g.fillRect(0, 0, W, Y(0.83)); }
  if (d === "stripes" || d === "race") { g.fillStyle = c2; for (const o of [-1, 1]) g.fillRect(0, Y(0.5 + o * 0.035) - H * 0.0175, W, H * 0.035); }
  if (d === "side") { g.fillStyle = c2; for (const p of [0.21, 0.79]) { g.beginPath(); g.moveTo(W * 0.06, Y(p) - H * 0.012); g.lineTo(W * 0.94, Y(p) - H * 0.02); g.lineTo(W * 0.94, Y(p) + H * 0.02); g.lineTo(W * 0.06, Y(p) + H * 0.012); g.fill(); } }
  if (d === "number" || d === "race") {
    const pxm = W / L, sy = 0.34; // pixels per metre along vs around (keeps the roundel round)
    for (const [p, flip] of [[0.255, false], [0.745, true]]) {
      g.save(); g.translate(W * 0.48, Y(p)); if (flip) g.rotate(Math.PI); g.scale(1, sy);
      g.fillStyle = "#f4f4f4"; g.beginPath(); g.arc(0, 0, pxm * 0.24, 0, TAU); g.fill(); g.lineWidth = pxm * 0.03; g.strokeStyle = c2; g.stroke();
      g.fillStyle = "#111"; g.font = `bold ${Math.round(pxm * 0.3)}px sans-serif`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(String(look.num || 0), 0, pxm * 0.02); g.restore();
    }
  }
}
function makeCarMesh(c, look, hq, lo) {
  look = Object.assign(defaultLook(c), look || {}); if (hq === undefined) hq = true;
  const G = carGeos(c, lo), M = sharedMats(), B = c.B;
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const paintCv = document.createElement("canvas"); paintCv.width = 1024; paintCv.height = 512;
  const paintTex = new THREE.CanvasTexture(paintCv); paintTex.colorSpace = THREE.SRGBColorSpace; paintTex.anisotropy = 4;
  const paintMat = paintMaterial(hq); paintMat.map = paintTex;
  const roofMat = paintMaterial(hq);
  const glassMat = new (hq ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial)({ color: 0x141b22, roughness: 0.03, metalness: 0.1, envMapIntensity: 1.8 }); if (hq) glassMat.clearcoat = 1;
  const rimMat = new THREE.MeshStandardMaterial({ color: look.rimC, metalness: 0.85, roughness: 0.25, side: THREE.DoubleSide });
  const calMat = new THREE.MeshStandardMaterial({ color: look.caliper, roughness: 0.4, metalness: 0.2 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0xb9c4cf, emissive: 0xfff3dd, emissiveIntensity: 0.18, roughness: 0.06, metalness: 1 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x5a0000, emissive: 0xff1414, emissiveIntensity: 0.8, roughness: 0.2 });
  const add = (geo, mat, cast = true) => { if (!geo) return null; const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; body.add(m); return m; };
  add(G.paint, paintMat); const roof = add(G.roof, roofMat, !lo); add(G.glass, glassMat); add(G.trim, M.trim, !lo); add(G.carbon, M.carbon, !lo); add(G.chrome, M.chrome, false);
  add(G.head, headMat, false); add(G.drl, M.drl, false); add(G.tail, tailMat, false); if (!lo) add(G.plate, M.plate, false); add(G.grille, M.grille, false);
  const kit = new THREE.Group(); body.add(kit);
  const wheels = [];
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const steer = new THREE.Group(); steer.position.set(sx * G.wx, G.wr, sz * G.wz); g.add(steer);
    const flip = new THREE.Group(); if (sz < 0) flip.rotation.y = Math.PI; steer.add(flip);
    const spin = new THREE.Group(); flip.add(spin);
    const t = new THREE.Mesh(G.tire, M.tire); t.castShadow = !lo; spin.add(t);
    const rim = new THREE.Mesh(rimGeo(look.rim, G.rr, B.tw), rimMat); spin.add(rim);
    if (!lo) { flip.add(new THREE.Mesh(G.disc, M.disc)); flip.add(new THREE.Mesh(G.caliper, calMat)); }
    wheels.push({ steer, spin, rim, front: sx > 0, sgn: sz < 0 ? 1 : -1 });
  }
  // contact shadow and underglow
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(B.L * 1.12, B.W * 1.3).rotateX(-Math.PI / 2), M.blob); blob.position.y = 0.025; blob.renderOrder = -1; g.add(blob);
  const neonMat = new THREE.MeshBasicMaterial({ map: M.blob.map, color: 0x2fd0ff, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
  const neon = new THREE.Mesh(new THREE.PlaneGeometry(B.L * 1.25, B.W * 1.7).rotateX(-Math.PI / 2), neonMat); neon.position.y = 0.035; g.add(neon);
  // nitro flames out of the exhausts
  const flameMat = new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const flames = new THREE.Group();
  for (const s of [1, -1]) for (const e of G.exhaust) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.7, 10).rotateZ(Math.PI / 2), flameMat); f.position.set(e[0] - 0.35, e[1], s * e[2]); flames.add(f); }
  flames.visible = false; body.add(flames);
  const U = { paintMat, roofMat, glassMat, rimMat, calMat, headMat, tailMat, tails: { material: tailMat }, wheels, body, flames, neon, kit, roof, G, look: null, hq, spoiler: null };
  U.setLook = (lk) => {
    lk = Object.assign(defaultLook(c), lk || {}); U.look = lk;
    drawPaint(paintCv, lk, B.L, c.B); paintTex.needsUpdate = true; applyFinish(paintMat, lk.finish);
    if (lk.roof === "same") { roofMat.map = paintTex; roofMat.color.set(0xffffff); applyFinish(roofMat, lk.finish); }
    else { roofMat.map = null; roofMat.color.set(lk.roof === "black" ? "#0c0c0d" : lk.c2); applyFinish(roofMat, lk.roof === "black" ? "gloss" : lk.finish); }
    glassMat.color.set([0x3a4a56, 0x141b22, 0x040506][lk.tint | 0] ?? 0x141b22);
    rimMat.color.set(lk.rimC); calMat.color.set(lk.caliper);
    for (const w of wheels) w.rim.geometry = rimGeo(lk.rim | 0, G.rr, B.tw);
    if (U.spoiler !== lk.spoiler) { U.spoiler = lk.spoiler; kit.clear(); const K = kitGeo(c, lk.spoiler); if (K.paint) { const m = new THREE.Mesh(K.paint, paintMat); m.castShadow = true; kit.add(m); } if (K.carbon) { const m = new THREE.Mesh(K.carbon, M.carbon); m.castShadow = true; kit.add(m); } }
    body.position.y = -clamp(lk.height || 0, 0, 1) * (B.suv ? 0.12 : 0.07);
    neon.visible = !!lk.neon; if (lk.neon) neonMat.color.set(lk.neon);
  };
  U.setNight = (n) => { headMat.emissiveIntensity = n ? 2.4 : 0.18; neonMat.opacity = n ? 0.95 : 0.45; };
  g.userData = U; U.setLook(look);
  return g;
}

// ---------------- tracks ----------------
const TRACKS = [
  { id: "falcon", name: "حلبة الصقر", desc: "حلبة نهارية سريعة فيها منعطفات طويلة", night: false, hw: 8, run: 4, laps: 3,
    pts: [[0, 0], [300, 0], [420, 60], [450, 190], [370, 270], [230, 250], [160, 330], [210, 440], [90, 500], [-60, 440], [-130, 310], [-60, 200], [-170, 120], [-150, 20]] },
  { id: "port", name: "ميناء الليل", desc: "شوارع مضاءة بالليل وزوايا حادة", night: true, hw: 7.5, run: 1.6, laps: 3,
    pts: [[0, 0], [250, 0], [295, 45], [295, 200], [250, 245], [130, 245], [85, 290], [85, 400], [40, 445], [-160, 445], [-205, 400], [-205, 45], [-160, 0]] },
  { id: "mount", name: "طريق الجبل", desc: "منعطفات متتالية، مثالية للتفحيط", night: false, dusk: true, hw: 10, run: 5, laps: 2,
    pts: [[0, 0], [150, -30], [265, 40], [245, 165], [120, 180], [55, 280], [165, 380], [40, 475], [-125, 425], [-165, 285], [-90, 165], [-175, 60]] }
];
let TR = null; // current built track
function buildTrack(def, world) {
  const curve = new THREE.CatmullRomCurve3(def.pts.map((p) => new THREE.Vector3(p[0], 0, p[1])), true, "centripetal");
  const len = curve.getLength(), N = Math.round(len / 2);
  const P = [], T = [], Nl = [], S = [], K = [];
  for (let i = 0; i < N; i++) {
    const u = i / N, p = curve.getPointAt(u), t = curve.getTangentAt(u).normalize();
    P.push(p); T.push(t); Nl.push(new THREE.Vector3(-t.z, 0, t.x)); S.push(u * len);
  }
  for (let i = 0; i < N; i++) { const a = Math.atan2(T[i].z, T[i].x), b = Math.atan2(T[(i + 1) % N].z, T[(i + 1) % N].x); let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); K.push(d / (len / N)); }
  // smooth curvature
  const Ks = K.map((_, i) => { let s = 0; for (let j = -6; j <= 6; j++) s += K[(i + j + N) % N]; return s / 13; });
  const hw = def.hw, wallOff = hw + def.run;
  TR = { def, curve, len, N, P, T, Nl, S, K: Ks, hw, wallOff };
  const G = {}, add = (k, g) => (G[k] || (G[k] = [])).push(g);
  // a strip along the track between two offsets
  const strip = (o0, o1, y0, y1, vScale, key, every = 1, filt = null) => {
    const pos = [], uv = [], idx = [];
    let n = 0;
    for (let i = 0; i <= N; i += every) {
      const k = i % N, p = P[k], nl = Nl[k];
      if (filt && !filt(k)) { if (n % 2 === 1) {} }
      pos.push(p.x + nl.x * o0, y0, p.z + nl.z * o0, p.x + nl.x * o1, y1, p.z + nl.z * o1);
      uv.push(0, S[k] / vScale + (i === N ? len / vScale - S[k] / vScale : 0), 1, S[k] / vScale + (i === N ? len / vScale - S[k] / vScale : 0));
      if (i > 0) { const a = n * 2 - 2, b = n * 2 - 1, c = n * 2, d = n * 2 + 1; idx.push(a, c, b, b, c, d); }
      n++;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    add(key, g);
  };
  strip(hw, -hw, 0.02, 0.02, 12, "road");
  // kerbs only where the track bends
  const kerbAt = (k) => Math.abs(Ks[k]) > 0.006;
  for (const side of [1, -1]) {
    let start = -1;
    for (let i = 0; i <= N; i++) {
      const on = i < N && kerbAt(i);
      if (on && start < 0) start = i;
      if (!on && start >= 0) { kerbSeg(start, i, side); start = -1; }
    }
  }
  function kerbSeg(a, b, side) {
    const pos = [], uv = [], idx = []; let n = 0;
    for (let i = Math.max(0, a - 3); i <= Math.min(N, b + 3); i++) {
      const k = i % N, p = P[k], nl = Nl[k], o0 = side * hw, o1 = side * (hw + 1.3);
      pos.push(p.x + nl.x * o0, 0.05, p.z + nl.z * o0, p.x + nl.x * o1, 0.09, p.z + nl.z * o1);
      uv.push(0, S[k] / 2, 1, S[k] / 2);
      if (n > 0) { const q = n * 2 - 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); } n++;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); add("kerb", g);
  }
  // shoulders and walls
  strip(hw, wallOff, 0.015, 0.015, 8, "shoulder"); strip(-wallOff, -hw, 0.015, 0.015, 8, "shoulder");
  for (const side of [1, -1]) { strip(side * wallOff, side * wallOff, 0, 1.15, 6, "wall"); strip(side * (wallOff + 0.5), side * (wallOff + 0.5), 1.15, 0, 6, "wall"); strip(side * wallOff, side * (wallOff + 0.5), 1.15, 1.15, 6, "wallTop"); }
  // start line and gantry
  const p0 = P[0], n0 = Nl[0], a0 = Math.atan2(T[0].z, T[0].x);
  const line = new THREE.Mesh(new THREE.PlaneGeometry(3, hw * 2), new THREE.MeshStandardMaterial({ map: TEX.checker, roughness: 0.8 }));
  line.rotation.x = -Math.PI / 2; line.rotation.z = -a0; line.position.set(p0.x, 0.03, p0.z); line.receiveShadow = true; world.add(line);
  for (const s of [1, -1]) add("pillar", boxAt(0.8, 7, 0.8, 0, 3.5, 0).rotateY(-a0).translate(p0.x + n0.x * s * (wallOff + 0.4), 0, p0.z + n0.z * s * (wallOff + 0.4)));
  const bMat = new THREE.MeshStandardMaterial({ map: TEX.banner, emissive: def.night ? 0xffffff : 0x000000, emissiveMap: def.night ? TEX.banner : null, emissiveIntensity: 0.7 });
  for (const dir of [-1, 1]) { const b = new THREE.Mesh(new THREE.PlaneGeometry(wallOff * 2 + 1.6, 1.6), bMat); b.position.set(p0.x + T[0].x * dir * 0.3, 6.6, p0.z + T[0].z * dir * 0.3); b.lookAt(p0.x + T[0].x * dir * 20, 6.6, p0.z + T[0].z * dir * 20); world.add(b); }
  const beam = new THREE.Mesh(boxAt(0.5, 1.7, wallOff * 2 + 1.6, 0, 0, 0), new THREE.MeshStandardMaterial({ color: 0x2a2d33 })); beam.position.set(p0.x, 6.6, p0.z); beam.rotation.y = -a0; beam.castShadow = true; world.add(beam);
  const MATS = {
    road: { map: def.night ? TEX.roadN : TEX.road, roughness: def.night ? 0.55 : 0.9, metalness: def.night ? 0.2 : 0 },
    kerb: { map: TEX.kerb, roughness: 0.7 }, shoulder: { map: def.night ? TEX.concrete : TEX.gravel, roughness: 1 },
    wall: { map: def.night ? TEX.wallN : TEX.wallD, roughness: 0.8, side: THREE.DoubleSide, emissive: def.night ? 0xffffff : 0, emissiveMap: def.night ? TEX.wallN : null, emissiveIntensity: def.night ? 0.25 : 0 },
    wallTop: { color: def.night ? 0x33ccff : 0xeeeeee, emissive: def.night ? 0x22aaff : 0, emissiveIntensity: 1 }, pillar: { color: 0x2a2d33, roughness: 0.5, metalness: 0.6 }
  };
  for (const k in G) { const m = new THREE.Mesh(mergeAll(G[k]), new THREE.MeshStandardMaterial(MATS[k])); m.receiveShadow = true; m.castShadow = k === "wall" || k === "pillar"; world.add(m); }
  scenery(def, world);
  return TR;
}
// trees, stands, buildings and lamps around the track
function scenery(def, world) {
  const R = rng(def.id.length * 977 + 13);
  const far = (x, z, m) => { const q = trackQuery(x, z, -1); return Math.abs(q.d) > TR.wallOff + m; };
  // bounding box
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const p of TR.P) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, size = Math.max(x1 - x0, z1 - z0) + 500;
  TR.box = { x0, x1, z0, z1 };
  TR.heightAt = () => 0;
  if (def.night) {
    const gt = TEX.asph.clone(); gt.needsUpdate = true; gt.repeat.set(size / 10, size / 10);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ map: gt, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(cx, 0, cz); ground.receiveShadow = true; world.add(ground);
  } else world.add(terrain(def, cx, cz, size, R));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sv = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  if (!def.night) {
    const pts = [];
    for (let i = 0; i < 1400 && pts.length < 340; i++) { const x = x0 - 120 + R() * (x1 - x0 + 240), z = z0 - 120 + R() * (z1 - z0 + 240); if (far(x, z, 6)) { const y = TR.heightAt(x, z); if (y < 28) pts.push([x, z, 0.8 + R() * 0.8, R() < 0.6, y]); } }
    const trunkG = new THREE.CylinderGeometry(0.25, 0.4, 4, 6); trunkG.translate(0, 2, 0);
    const pineG = mergeAll([new THREE.ConeGeometry(2.6, 5, 8).translate(0, 5, 0), new THREE.ConeGeometry(1.9, 4, 8).translate(0, 7.4, 0), new THREE.ConeGeometry(1.1, 3, 8).translate(0, 9.3, 0)]);
    const oakG = mergeAll([new THREE.IcosahedronGeometry(2.8, 1).translate(0, 5.2, 0), new THREE.IcosahedronGeometry(2.0, 1).translate(1.3, 6.2, 0.5)]);
    const trunk = new THREE.InstancedMesh(trunkG, new THREE.MeshStandardMaterial({ color: 0x5b4330, roughness: 1 }), pts.length);
    const pines = pts.filter((p) => p[3]), oaks = pts.filter((p) => !p[3]);
    const pim = new THREE.InstancedMesh(pineG, new THREE.MeshStandardMaterial({ color: def.dusk ? 0x3a5530 : 0x2f5a2a, roughness: 0.95 }), Math.max(1, pines.length));
    const oim = new THREE.InstancedMesh(oakG, new THREE.MeshStandardMaterial({ color: def.dusk ? 0x6b7a33 : 0x4f7a30, roughness: 0.95, flatShading: true }), Math.max(1, oaks.length));
    pts.forEach((p, i) => { m4.compose(v.set(p[0], p[4] - 0.3, p[1]), q.setFromAxisAngle(up, p[0] % TAU), sv.set(p[2], p[2], p[2])); trunk.setMatrixAt(i, m4); });
    pines.forEach((p, i) => { m4.compose(v.set(p[0], p[4] - 0.3, p[1]), q.setFromAxisAngle(up, p[1] % TAU), sv.set(p[2], p[2], p[2])); pim.setMatrixAt(i, m4); });
    oaks.forEach((p, i) => { m4.compose(v.set(p[0], p[4] - 0.3, p[1]), q.setFromAxisAngle(up, p[0] % TAU), sv.set(p[2], p[2], p[2])); oim.setMatrixAt(i, m4); });
    for (const im of [trunk, pim, oim]) { im.castShadow = Q.shadow >= 2048; world.add(im); }
    // grandstands with crowd next to the start straight
    const st = []; const crowd = [];
    for (let k = 0; k < 3; k++) {
      const i = (TR.N - 30 + k * 22) % TR.N, p = TR.P[i], n = TR.Nl[i], a = Math.atan2(TR.T[i].z, TR.T[i].x), o = TR.wallOff + 9;
      const g = new THREE.Group();
      for (let r = 0; r < 6; r++) { const b = new THREE.Mesh(new THREE.BoxGeometry(36, 0.6 + r * 0.9, 1.6), new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.9 })); b.position.set(0, (0.6 + r * 0.9) / 2, -r * 1.6); b.castShadow = true; b.receiveShadow = true; g.add(b); const c = new THREE.Mesh(new THREE.PlaneGeometry(35, 0.9), new THREE.MeshStandardMaterial({ map: TEX.crowd, roughness: 1 })); c.position.set(0, 0.6 + r * 0.9 + 0.4, -r * 1.6 + 0.3); g.add(c); }
      const roof = new THREE.Mesh(new THREE.BoxGeometry(38, 0.3, 11), new THREE.MeshStandardMaterial({ color: 0xd62828, roughness: 0.6 })); roof.position.set(0, 8.5, -4.5); roof.castShadow = true; g.add(roof);
      g.position.set(p.x + n.x * o, 0, p.z + n.z * o); g.lookAt(p.x, 0, p.z); world.add(g); void st; void crowd; void a;
    }
  } else {
    // night port: lit buildings, containers and street lamps
    const bg = [], cont = [], cols = [0x7a3b2a, 0x2d5a7a, 0x3f6b3f, 0x8a6a2a];
    for (let i = 0; i < 260 && bg.length < 70; i++) { const x = x0 - 90 + R() * (x1 - x0 + 180), z = z0 - 90 + R() * (z1 - z0 + 180), w = 14 + R() * 20, d = 14 + R() * 20, h = 10 + R() * 45; if (far(x, z, Math.max(w, d) * 0.75 + 4)) bg.push([x, z, w, d, h]); }
    const bm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ map: TEX.windows, emissive: 0xffffff, emissiveMap: TEX.windows, emissiveIntensity: 0.9, roughness: 0.7 }), bg.length);
    bg.forEach((b, i) => { m4.compose(v.set(b[0], 0, b[1]), q.setFromAxisAngle(up, 0), sv.set(b[2], b[4], b[3])); bm.setMatrixAt(i, m4); });
    world.add(bm);
    for (let i = 0; i < 300 && cont.length < 90; i++) { const x = x0 - 40 + R() * (x1 - x0 + 80), z = z0 - 40 + R() * (z1 - z0 + 80); if (far(x, z, 5)) cont.push([x, z, R() * TAU, Math.floor(R() * 2)]); }
    const cm = new THREE.InstancedMesh(new THREE.BoxGeometry(6, 2.6, 2.4).translate(0, 1.3, 0), new THREE.MeshStandardMaterial({ map: TEX.container, roughness: 0.6, metalness: 0.4 }), cont.length);
    const col = new THREE.Color();
    cont.forEach((c, i) => { m4.compose(v.set(c[0], c[3] * 2.6, c[1]), q.setFromAxisAngle(up, c[2]), sv.set(1, 1, 1)); cm.setMatrixAt(i, m4); cm.setColorAt(i, col.setHex(cols[i % 4])); });
    cm.castShadow = true; world.add(cm);
  }
  // street lamps along the road (glowing heads, light pools on the road at night)
  const lamps = [];
  for (let i = 0; i < TR.N; i += Math.round(36 / (TR.len / TR.N))) lamps.push(i);
  const pole = new THREE.InstancedMesh(mergeAll([boxAt(0.2, 9, 0.2, 0, 4.5, 0), boxAt(2.6, 0.15, 0.15, -1.3, 9, 0)]), new THREE.MeshStandardMaterial({ color: 0x3a3d42, metalness: 0.6, roughness: 0.4 }), lamps.length);
  const head = new THREE.InstancedMesh(boxAt(0.8, 0.15, 0.4, -2.4, 8.9, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: def.night ? 0xffd9a0 : 0x000000, emissiveIntensity: 2 }), lamps.length);
  const pools = []; const side = (k) => (k % 2 ? 1 : -1);
  lamps.forEach((i, k) => { const p = TR.P[i], n = TR.Nl[i], s = side(k), o = s * (TR.wallOff + 1.2); const a = Math.atan2(n.z * s, n.x * s); m4.compose(v.set(p.x + n.x * o, 0, p.z + n.z * o), q.setFromAxisAngle(up, -a + Math.PI), sv.set(1, 1, 1)); pole.setMatrixAt(k, m4); head.setMatrixAt(k, m4); pools.push([p.x + n.x * (o - s * 2.6), p.z + n.z * (o - s * 2.6)]); });
  pole.castShadow = true; world.add(pole); world.add(head);
  if (def.night) {
    const pm = new THREE.InstancedMesh(new THREE.CircleGeometry(7, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: TEX.glow, color: 0xffc070, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending }), pools.length);
    pools.forEach((p, k) => { m4.compose(v.set(p[0], 0.05, p[1]), q.identity(), sv.set(1, 1, 1)); pm.setMatrixAt(k, m4); }); world.add(pm);
  }
}
// rolling hills and mountains that rise only far away from the road, so nothing ever covers the track
function terrain(def, cx, cz, size, R) {
  const n = 150, step = size / n, x0 = cx - size / 2, z0 = cz - size / 2;
  const P = TR.P.filter((_, i) => i % 3 === 0), flat = TR.wallOff + 22, big = def.dusk ? 150 : 95;
  const o1 = R() * 100, o2 = R() * 100;
  const nz = (x, z) => { let v = 0, a = 1, f = 1 / 160; for (let k = 0; k < 4; k++) { v += a * (Math.sin(x * f + o1 + k * 1.7) * Math.cos(z * f * 1.13 + o2 - k) + Math.sin((x + z) * f * 0.7 + k * 2.3) * 0.5); a *= 0.5; f *= 2.03; } return v * 0.5 + 0.5; };
  const H = new Float32Array((n + 1) * (n + 1)), pos = [], col = [], uv = [], idx = [];
  const cG = new THREE.Color(def.dusk ? 0x8a7a45 : 0x5e7d3a), cR = new THREE.Color(def.dusk ? 0x8a6a52 : 0x7b7464), cS = new THREE.Color(def.dusk ? 0xd8c4a8 : 0xe9eef2), tc = new THREE.Color();
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    const x = x0 + i * step, z = z0 + j * step; let d = 1e9;
    for (const p of P) { const dx = p.x - x, dz = p.z - z, q = dx * dx + dz * dz; if (q < d) d = q; }
    d = Math.sqrt(d);
    const k = clamp((d - flat) / 170, 0, 1), s = k * k * (3 - 2 * k), m = nz(x, z);
    const h = s * big * (0.35 + 0.65 * m * m) + clamp((d - flat) / 25, 0, 1) * 2.2 * m;
    H[j * (n + 1) + i] = h;
    pos.push(x, h, z); uv.push(x / 10, z / 10);
    const rock = clamp((h - 18) / 30, 0, 1), snow = clamp((h - (def.dusk ? 120 : 85)) / 20, 0, 1);
    tc.copy(cG).lerp(cR, rock).lerp(cS, snow); col.push(tc.r, tc.g, tc.b);
  }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, e = c + 1; idx.push(a, c, b, b, c, e); }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  TR.heightAt = (x, z) => { const fi = clamp((x - x0) / step, 0, n - 0.001), fj = clamp((z - z0) / step, 0, n - 0.001), i = Math.floor(fi), j = Math.floor(fj), u = fi - i, v = fj - j, r = n + 1; return lerp(lerp(H[j * r + i], H[j * r + i + 1], u), lerp(H[(j + 1) * r + i], H[(j + 1) * r + i + 1], u), v); };
  const gt = TEX.ground;
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: gt, vertexColors: true, roughness: 1 }));
  m.receiveShadow = true; return m;
}
// where is a point relative to the track centre line? (index, signed side offset, distance along)
function trackQuery(x, z, hint) {
  const P = TR.P, N = TR.N; let best = 0, bd = 1e18;
  if (hint >= 0) { for (let j = -25; j <= 25; j++) { const i = (hint + j + N) % N, dx = P[i].x - x, dz = P[i].z - z, d = dx * dx + dz * dz; if (d < bd) { bd = d; best = i; } } if (bd > 900) hint = -1; }
  if (hint < 0) { bd = 1e18; for (let i = 0; i < N; i += 2) { const dx = P[i].x - x, dz = P[i].z - z, d = dx * dx + dz * dz; if (d < bd) { bd = d; best = i; } } }
  const p = P[best], n = TR.Nl[best];
  return { i: best, d: (x - p.x) * n.x + (z - p.z) * n.z, s: TR.S[best] };
}
function trackTextures() {
  if (TEX.road) return;
  TEX.road = canvasTex(256, 512, (g, w, h) => { noiseFill(g, w, h, "#3c3d40", 9000, 0.09); for (let i = 0; i < 40; i++) { g.fillStyle = "rgba(0,0,0,0.12)"; g.fillRect(Math.random() * w, Math.random() * h, 3 + Math.random() * 30, 1 + Math.random() * 2); } g.fillStyle = "#e8e8e8"; g.fillRect(6, 0, 7, h); g.fillRect(w - 13, 0, 7, h); g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(w * 0.3, 0, 14, h); g.fillRect(w * 0.65, 0, 14, h); }, true);
  TEX.roadN = canvasTex(256, 512, (g, w, h) => { noiseFill(g, w, h, "#25262b", 9000, 0.1); g.fillStyle = "#f0d060"; g.fillRect(w / 2 - 3, 0, 6, h / 2); g.fillStyle = "#e8e8e8"; g.fillRect(6, 0, 6, h); g.fillRect(w - 12, 0, 6, h); for (let i = 0; i < 30; i++) { g.fillStyle = "rgba(120,140,170,0.08)"; g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, 10 + Math.random() * 25, 4 + Math.random() * 8, 0, 0, TAU); g.fill(); } }, true);
  TEX.kerb = canvasTex(64, 128, (g, w, h) => { g.fillStyle = "#d62828"; g.fillRect(0, 0, w, h / 2); g.fillStyle = "#f4f4f4"; g.fillRect(0, h / 2, w, h / 2); }, true);
  TEX.gravel = canvasTex(256, 256, (g, w, h) => { noiseFill(g, w, h, "#b9a98a", 9000, 0.18); }, true);
  TEX.concrete = canvasTex(256, 256, (g, w, h) => { noiseFill(g, w, h, "#55575c", 6000, 0.1); g.fillStyle = "rgba(0,0,0,0.3)"; g.fillRect(0, 0, w, 2); }, true);
  TEX.grass = canvasTex(512, 512, (g, w, h) => { g.fillStyle = "#58773a"; g.fillRect(0, 0, w, h); for (let i = 0; i < 12000; i++) { g.fillStyle = `hsla(${78 + Math.random() * 30},${30 + Math.random() * 25}%,${22 + Math.random() * 22}%,0.55)`; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 2 + Math.random() * 4); } for (let x = 0; x < w; x += 64) { g.fillStyle = "rgba(255,255,255,0.035)"; g.fillRect(x, 0, 32, h); } }, true);
  TEX.ground = canvasTex(512, 512, (g, w, h) => { g.fillStyle = "#d4d4d4"; g.fillRect(0, 0, w, h); for (let i = 0; i < 14000; i++) { const v = 150 + Math.random() * 105; g.fillStyle = `rgba(${v},${v},${v * 0.95},0.5)`; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 2 + Math.random() * 4); } }, true);
  TEX.asph = canvasTex(256, 256, (g, w, h) => { noiseFill(g, w, h, "#1c1d21", 7000, 0.1); g.strokeStyle = "rgba(255,255,255,0.05)"; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(Math.random() * w, 0); g.lineTo(Math.random() * w, h); g.stroke(); } }, true);
  TEX.wallD = canvasTex(256, 64, (g, w, h) => { for (let x = 0; x < w; x += 64) { g.fillStyle = (x / 64) % 2 ? "#e9e9e9" : "#1f5fd0"; g.fillRect(x, 0, 64, h); } g.fillStyle = "#ffffff"; g.font = "bold 22px sans-serif"; g.textAlign = "center"; g.fillText("ملوك", 32, 40); g.fillText("التفحيط", 160, 40); }, true);
  TEX.wallN = canvasTex(256, 64, (g, w, h) => { g.fillStyle = "#2a2c31"; g.fillRect(0, 0, w, h); g.fillStyle = "#18c8ff"; g.fillRect(0, 6, w, 4); g.fillStyle = "#ff3fa0"; g.fillRect(0, h - 10, w, 4); for (let x = 0; x < w; x += 32) { g.fillStyle = "rgba(255,255,255,0.15)"; g.fillRect(x, 14, 2, h - 28); } }, true);
  TEX.checker = canvasTex(64, 256, (g, w, h) => { const s = 16; for (let y = 0; y < h; y += s) for (let x = 0; x < w; x += s) { g.fillStyle = ((x + y) / s) % 2 ? "#111" : "#f4f4f4"; g.fillRect(x, y, s, s); } });
  TEX.banner = canvasTex(512, 64, (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, "#d62828"); gr.addColorStop(1, "#f2a541"); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = "#fff"; g.font = "bold 38px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("ملوك التفحيط – خط البداية", w / 2, h / 2 + 2); });
  TEX.crowd = canvasTex(512, 32, (g, w, h) => { g.fillStyle = "#333"; g.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 6) { g.fillStyle = `hsl(${Math.random() * 360},60%,${40 + Math.random() * 30}%)`; g.fillRect(x, 8 + Math.random() * 6, 5, h); g.fillStyle = "#e0b090"; g.fillRect(x + 1, 3 + Math.random() * 5, 3, 5); } }, true);
  TEX.windows = canvasTex(128, 256, (g, w, h) => { g.fillStyle = "#111318"; g.fillRect(0, 0, w, h); for (let y = 6; y < h; y += 14) for (let x = 6; x < w; x += 14) { if (Math.random() < 0.45) { g.fillStyle = Math.random() < 0.5 ? "#ffd58a" : "#bfe0ff"; g.globalAlpha = 0.5 + Math.random() * 0.5; g.fillRect(x, y, 8, 8); g.globalAlpha = 1; } } }, true);
  TEX.container = canvasTex(128, 64, (g, w, h) => { g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 8) { g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(x, 0, 2, h); } });
  TEX.glow = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
  TEX.smoke = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, "rgba(255,255,255,0.8)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
}
const TEX = {};

// ---------------- driving physics ----------------
function newCar(def, st, look, isPlayer, hq) {
  const mesh = makeCarMesh(def, look, hq, !isPlayer);
  return { def, st, mesh, x: 0, z: 0, a: 0, px: 0, pz: 0, pa: 0, pspin: 0, vx: 0, vz: 0, w: 0, steer: 0, thr: 0, brk: 0, hb: false, nitro: st.nitroCap, nitroOn: false, rpm: 0, gear: 1, idx: -1, dist: 0, lap: 0, lapT: 0, best: Infinity, lastLap: 0, finished: false, finishT: 0, place: 1,
    player: !!isPlayer, ai: !isPlayer, aiOff: 0, skill: 1, pace: 1, lane: 0, wob: 0, plan: null, slip: 0, loose: 0, spin: 0, offroad: false, hitT: 0, stuck: 0, rev: 0, name: "" };
}
const WB = 2.6;
function carStep(c, dt) {
  const st = c.st, fx = Math.cos(c.a), fz = Math.sin(c.a);
  let vf = c.vx * fx + c.vz * fz, vl = -c.vx * fz + c.vz * fx;
  const sp = Math.hypot(vf, vl);
  const q = trackQuery(c.x, c.z, c.idx); c.idx = q.i; c.q = q;
  // the white line and the kerbs are part of the road; only real grass/gravel slows you, and gently
  const offK = clamp((Math.abs(q.d) - (TR.hw + 1.4)) / 2.5, 0, 1); c.offroad = offK > 0.5; c.offK = offK;
  const boost = c.nitroOn && c.nitro > 0;
  const maxS = st.max * (boost ? 1.16 : 1) * (1 - 0.12 * offK);
  // engine, brakes, reverse
  if (c.thr > 0) { const k = clamp(1 - Math.pow(Math.max(0, vf) / maxS, 2), 0, 1); vf += (st.acc * c.thr * (0.35 + 0.65 * k) + (boost ? 9 * st.nitro : 0)) * dt * (vf < -0.5 ? 2.2 : 1); }
  if (c.brk > 0) { if (vf > 0.8) vf -= 30 * c.brk * dt; else vf -= 7 * c.brk * dt * clamp(1 + vf / 13, 0, 1); }
  vf -= vf * Math.abs(vf) * 0.0009 * dt + vf * (0.05 + 0.14 * offK) * dt;
  if (!c.thr && !c.brk) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 1.4 * dt);
  if (vf > maxS) vf = lerp(vf, maxS, 1 - Math.exp(-dt * 1.5));
  if (c.hb) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 5.5 * dt);
  if (boost) { c.nitro = Math.max(0, c.nitro - dt); } else if (!c.nitroOn) c.nitro = Math.min(st.nitroCap, c.nitro + dt * 0.12);
  // how loose is the rear? handbrake, or full throttle while turning hard
  const slip = Math.atan2(vl, Math.max(3, Math.abs(vf)));
  let loose = 0;
  if (c.hb && sp > 6) loose = 1;
  else if (sp > 11 && c.thr > 0.7 && Math.abs(c.steer) > 0.45) loose = clamp((st.drift - 0.6) * 1.5 + Math.abs(slip) * 1.3, 0, 1) * clamp(c.thr, 0, 1);
  if (Math.abs(slip) > 0.35 && c.thr > 0.5) loose = Math.max(loose, clamp(Math.abs(slip) * 1.4 * st.drift - 0.2, 0, 0.95));
  // counter-steer (steering into the slide) gives grip back
  if (Math.sign(c.steer) === Math.sign(slip) && Math.abs(slip) > 0.15) loose *= 0.75;
  loose *= clamp(1.7 - Math.abs(slip) * 0.75, 0.35, 1); // very big angles calm down
  c.loose = lerp(c.loose, loose, 1 - Math.exp(-dt * 6));
  // steering → yaw
  const sa = c.steer * (0.6 - 0.38 * Math.min(1, sp / 45)) * st.steer;
  const targetW = vf * Math.tan(sa) / WB;
  c.w += (targetW - c.w) * (1 - Math.exp(-dt * lerp(9, 2.4, c.loose)));
  c.w += c.steer * c.loose * 2.2 * st.drift * Math.sign(vf || 1) * dt * clamp(sp / 18, 0, 1);
  c.w *= Math.exp(-dt * 0.6);
  // drift assist: past ~45° the car swings back toward where it is going, so slides stay playable
  const over = Math.abs(slip) - 0.72; if (over > 0) c.w += Math.sign(slip) * over * 8 * dt * clamp(sp / 10, 0, 1);
  const grip = st.grip * (1 - 0.25 * offK);
  vl *= Math.exp(-dt * lerp(grip, 0.75, c.loose));
  c.a += c.w * dt;
  // keep the old velocity direction for a moment after turning: that's the slide
  c.vx = vf * fx - vl * fz; c.vz = vf * fz + vl * fx;
  // on the throttle in a slide the spinning rear keeps the speed up
  if (c.loose > 0.4 && c.thr > 0 && sp > 6 && sp < st.max * 0.8) { const k = 1 + st.acc * 0.045 * c.thr * c.loose * dt; c.vx *= k; c.vz *= k; }
  c.x += c.vx * dt; c.z += c.vz * dt;
  c.slip = slip; c.fwd = vf; c.spin += vf * dt / 0.36;
  // walls
  const lim = TR.wallOff - c.def.wid / 2 - 0.15, q2 = trackQuery(c.x, c.z, c.idx);
  if (Math.abs(q2.d) > lim) {
    const n = TR.Nl[q2.i], s = Math.sign(q2.d), pen = Math.abs(q2.d) - lim;
    c.x -= n.x * s * pen; c.z -= n.z * s * pen;
    const vn = (c.vx * n.x + c.vz * n.z) * s;
    // slide along the wall: lose the push into it, keep most of the speed along it
    if (vn > 0) { c.vx -= 1.15 * vn * n.x * s; c.vz -= 1.15 * vn * n.z * s; const keep = 1 - Math.min(0.18, vn * 0.012); c.vx *= keep; c.vz *= keep; c.w *= 0.6;
      // turn the nose along the wall so you scrape and keep going instead of sticking to it
      const t = TR.T[q2.i], ta = Math.atan2(t.z, t.x); let d1 = ta - c.a; d1 = Math.atan2(Math.sin(d1), Math.cos(d1)); if (Math.abs(d1) > Math.PI / 2) d1 = Math.atan2(Math.sin(d1 + Math.PI), Math.cos(d1 + Math.PI));
      if (Math.abs(d1) < 1.1) c.a += d1 * 0.3;
      if (vn > 2.5) onHit(c, vn, n.x * s, n.z * s); }
  }
}
// cars bump into each other
function carsCollide(cars) {
  for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
    const A = cars[i], B = cars[j]; if (Math.abs(A.x - B.x) > 7 || Math.abs(A.z - B.z) > 7) continue;
    for (const oa of [1.3, -1.3]) for (const ob of [1.3, -1.3]) {
      const ax = A.x + Math.cos(A.a) * oa, az = A.z + Math.sin(A.a) * oa, bx = B.x + Math.cos(B.a) * ob, bz = B.z + Math.sin(B.a) * ob;
      const dx = ax - bx, dz = az - bz, d = Math.hypot(dx, dz), m = (A.def.wid + B.def.wid) / 2 - 0.05;
      if (d < m && d > 1e-4) {
        const nx = dx / d, nz = dz / d, pen = (m - d) / 2; A.x += nx * pen; A.z += nz * pen; B.x -= nx * pen; B.z -= nz * pen;
        const rel = (A.vx - B.vx) * nx + (A.vz - B.vz) * nz;
        if (rel < 0) { const k = -rel * 0.55; A.vx += nx * k; A.vz += nz * k; B.vx -= nx * k; B.vz -= nz * k; A.w += (Math.random() - 0.5) * 0.4; B.w += (Math.random() - 0.5) * 0.4; if (-rel > 3) onHit(A.player ? A : B, -rel, nx, nz); }
      }
    }
  }
}
// ---------------- AI drivers ----------------
// A smooth racing line (string-pulled between the walls), a speed plan for it per car, and drivers that
// follow it, brake on time, overtake on the side with room and use nitro on straights.
let RL = null, RLX = null, RLZ = null, RLK = null; const VPLAN = new Map();
const DIFF = { easy: { skill: 0.9, band: [-0.12, 0.04] }, normal: { skill: 0.96, band: [-0.07, 0.07] }, hard: { skill: 1.0, band: [-0.03, 0.08] } };
function buildRacingLine() {
  const N = TR.N, P = TR.P, Nl = TR.Nl, lim = TR.hw - 1.6; RL = new Float32Array(N); VPLAN.clear();
  for (const k of [16, 8, 4, 2]) for (let it = 0; it < 90; it++) for (let i = 0; i < N; i++) {
    const a = (i - k + N) % N, b = (i + k) % N;
    const mx = (P[a].x + Nl[a].x * RL[a] + P[b].x + Nl[b].x * RL[b]) / 2, mz = (P[a].z + Nl[a].z * RL[a] + P[b].z + Nl[b].z * RL[b]) / 2;
    const t = (mx - P[i].x) * Nl[i].x + (mz - P[i].z) * Nl[i].z; RL[i] += (clamp(t, -lim, lim) - RL[i]) * 0.6;
  }
  RLX = new Float32Array(N); RLZ = new Float32Array(N); RLK = new Float32Array(N);
  for (let i = 0; i < N; i++) { RLX[i] = P[i].x + Nl[i].x * RL[i]; RLZ[i] = P[i].z + Nl[i].z * RL[i]; }
  const raw = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = (i - 4 + N) % N, b = (i + 4) % N, ax = RLX[a] - RLX[i], az = RLZ[a] - RLZ[i], bx = RLX[b] - RLX[i], bz = RLZ[b] - RLZ[i];
    const cr = ax * bz - az * bx, la = Math.hypot(ax, az), lb = Math.hypot(bx, bz), lc = Math.hypot(bx - ax, bz - az);
    raw[i] = Math.abs(2 * cr / Math.max(1e-6, la * lb * lc));
  }
  for (let i = 0; i < N; i++) { let m = 0; for (let j = -3; j <= 3; j++) m = Math.max(m, raw[(i + j + N) % N]); RLK[i] = m; }
}
// how fast can this car take every point of the line (with braking before the bends)
function speedPlan(st, skill) {
  const key = st.max.toFixed(2) + ":" + st.grip.toFixed(2) + ":" + skill.toFixed(3); if (VPLAN.has(key)) return VPLAN.get(key);
  const N = TR.N, ds = TR.len / N, v = new Float32Array(N), aLat = st.grip * 1.5 * skill, aB = 13;
  for (let i = 0; i < N; i++) v[i] = Math.min(st.max * (0.97 + 0.03 * skill), Math.sqrt(aLat / Math.max(1e-4, RLK[i])));
  for (let lap = 0; lap < 2; lap++) for (let i = N - 1; i >= 0; i--) { const nx = v[(i + 1) % N]; v[i] = Math.min(v[i], Math.sqrt(nx * nx + 2 * aB * ds)); }
  VPLAN.set(key, v); return v;
}
function aiDrive(c, dt, leaderDist, playerDist) {
  const N = TR.N, ds = TR.len / N, sp = Math.hypot(c.vx, c.vz), D = DIFF[SETTINGS.diff] || DIFF.normal;
  if (c.idx < 0) c.idx = trackQuery(c.x, c.z, -1).i;
  const plan = c.plan || (c.plan = speedPlan(c.st, D.skill * c.skill));
  // traffic: find the car right in front of us and pick a side to pass
  let lane = 0, ahead = null, aheadGap = 1e9;
  const myD = c.q ? c.q.d : 0;
  for (const o of cars) {
    if (o === c) continue; const g = o.dist - c.dist;
    if (g > 0 && g < 14) { const od = o.q ? o.q.d : 0; if (Math.abs(od - (RL[c.idx] + c.lane)) < 2.4 && g < aheadGap) { ahead = o; aheadGap = g; } }
    else if (Math.abs(g) < 4.5) { const od = o.q ? o.q.d : 0; if (Math.abs(od - myD) < 2.6) lane += (myD > od ? 1 : -1) * 1.4; } // side by side: give room
  }
  if (ahead) { const od = ahead.q ? ahead.q.d : 0, lim = TR.hw - 1.3, left = od - 2.9, right = od + 2.9; const pick = Math.abs(left) <= lim && (Math.abs(right) > lim || Math.abs(left - RL[c.idx]) < Math.abs(right - RL[c.idx])) ? left : right; lane += pick - RL[c.idx]; }
  const laneT = clamp(lane + c.aiOff, -TR.hw * 1.6, TR.hw * 1.6);
  c.lane += clamp(laneT - c.lane, -2.2 * dt, 2.2 * dt);
  // steering: pure pursuit on the racing line
  const Ld = clamp(5 + sp * 0.42, 6, 30), ti = (c.idx + Math.round(Ld / ds)) % N;
  const off = clamp(RL[ti] + c.lane, -(TR.hw - 1.2), TR.hw - 1.2), tx = TR.P[ti].x + TR.Nl[ti].x * off, tz = TR.P[ti].z + TR.Nl[ti].z * off;
  let al = Math.atan2(tz - c.z, tx - c.x) - c.a; al = Math.atan2(Math.sin(al), Math.cos(al));
  const kap = 2 * Math.sin(al) / Ld, sa = Math.atan(kap * WB), gain = (0.6 - 0.38 * Math.min(1, sp / 45)) * c.st.steer;
  c.steer = clamp(sa / gain - (c.slip || 0) * 0.7 + c.wob * Math.sin(raceT * 0.7 + c.aiOff * 3), -1, 1);
  // speed: follow the plan, a little rubber band so the pack stays together
  const gap = playerDist - c.dist, band = clamp(gap * 0.0016, D.band[0], D.band[1]);
  let vt = plan[(c.idx + 3) % N] * (1 + band) * (c.pace || 1);
  if (ahead && aheadGap < 7) { const ov = Math.hypot(ahead.vx, ahead.vz); if (Math.abs((ahead.q ? ahead.q.d : 0) - (myD)) < 2) vt = Math.min(vt, ov + aheadGap * 0.6); }
  const err = vt - sp;
  if (err > 0.4) { c.thr = clamp(err * 0.45 + 0.35, 0, 1); c.brk = 0; } else if (err < -0.9) { c.thr = 0; c.brk = clamp(-err * 0.14, 0.12, 1); } else { c.thr = 0.35; c.brk = 0; }
  if (Math.abs(c.steer) > 0.45) c.thr = Math.min(c.thr, 0.62); // don't light up the rear mid-corner
  c.hb = false;
  // nitro on long straights
  let clear = Infinity; for (let j = 8; j < 70; j += 6) clear = Math.min(clear, plan[(c.idx + j) % N]);
  if (!c.nitroOn && c.nitro > 1.5 && clear > sp + 9 && Math.abs(c.steer) < 0.15 && Math.random() < dt * 1.2) c.nitroOn = true;
  if (c.nitroOn && (c.nitro <= 0.2 || clear < sp + 3 || Math.abs(c.steer) > 0.3)) c.nitroOn = false;
  // stuck against a wall: back up; lost or wrong way for long: put back on the road
  if (sp < 2 && c.thr > 0) c.stuck += dt; else c.stuck = Math.max(0, c.stuck - dt);
  if (c.stuck > 1.4) { c.rev = 1.1; c.stuck = 0; c.revs = (c.revs || 0) + 1; }
  if (c.rev > 0) { c.rev -= dt; c.thr = 0; c.brk = 1; c.steer = -c.steer; }
  const fwd = Math.cos(c.a) * TR.T[c.idx].x + Math.sin(c.a) * TR.T[c.idx].z;
  c.lost = (fwd < 0 || c.revs > 2) ? (c.lost || 0) + dt : 0;
  if (c.lost > 3.5) { const i = c.idx, p = TR.P[i]; c.x = p.x + TR.Nl[i].x * RL[i]; c.z = p.z + TR.Nl[i].z * RL[i]; c.a = Math.atan2(TR.T[i].z, TR.T[i].x); c.vx = TR.T[i].x * 12; c.vz = TR.T[i].z * 12; c.w = 0; c.loose = 0; c.lost = 0; c.revs = 0; c.rev = 0; c.prevS = TR.S[i]; }
}
// ---------------- drift scoring ----------------
const drift = { active: false, pts: 0, combo: 1, t: 0, calm: 0, total: 0, best: 0 };
function driftTick(c, dt) {
  const sp = Math.hypot(c.vx, c.vz), ang = Math.abs(c.slip);
  if (sp > 9 && ang > 0.28 && ang < 1.7 && !c.offroad) {
    if (!drift.active) { drift.active = true; drift.pts = 0; drift.combo = 1; drift.t = 0; }
    drift.calm = 0; drift.t += dt;
    drift.pts += ang * sp * 14 * dt;
    if (drift.t > drift.combo * 1.8 && drift.combo < 6) { drift.combo++; tone(500 + drift.combo * 120, 0.08, "triangle", 0.04); }
  } else if (drift.active) {
    drift.calm += dt;
    if (drift.calm > 0.75) bankDrift();
  }
}
function bankDrift() {
  if (!drift.active) return;
  const v = Math.round(drift.pts * drift.combo);
  drift.active = false;
  if (v > 50) { drift.total += v; drift.best = Math.max(drift.best, v); popup("+" + ar(v), v > 5000 ? "big" : ""); tone(880, 0.1, "triangle", 0.05); }
}
function breakDrift() { if (drift.active && drift.pts > 50) popup("اصطدمت! ضاعت النقاط", "bad"); drift.active = false; drift.pts = 0; }

// ---------------- profile ----------------
const PROF = Object.assign({ coins: 800, car: "saqr", look: {}, ups: {}, races: 0, wins: 0, bestDrift: 0, bestLap: {}, stars: {} }, store.get("dk.profile", {}));
if (!PROF.look) PROF.look = {};
function saveProf() { store.set("dk.profile", PROF); }
const carById = (id) => CARS.find((c) => c.id === id) || CARS[0];
function myCarDef() { return carById(PROF.car); }
function upsOf(id) { return PROF.ups[id] || (PROF.ups[id] = { engine: 0, tires: 0, nitro: 0, susp: 0 }); }
function lookOf(c) { return PROF.look[c.id] || (PROF.look[c.id] = defaultLook(c)); }
// opponents get their own random styling
function aiLook(c, R) {
  const pick = (a) => a[Math.floor(R() * a.length)], L = defaultLook(c);
  return Object.assign(L, { paint: pick(PALETTE), finish: pick(["gloss", "metal", "metal", "pearl", "matte"]), c2: pick(PALETTE), decal: pick(["none", "none", "stripes", "side", "number", "race", "two"]), num: 1 + Math.floor(R() * 98),
    rim: Math.floor(R() * RIM_STYLES.length), rimC: pick(["#c9ccd1", "#1b1b1d", "#d4af37", "#9ea3a8", "#26272b"]), caliper: pick(["#d42020", "#ffd400", "#1f6fe0", "#26272b"]), spoiler: R() < 0.5 ? L.spoiler : pick(Object.keys(SPOILERS)), roof: pick(["same", "same", "black", "c2"]) });
}

// ---------------- game state ----------------
let mode = "garage", gameMode = "race", trackIdx = 0, world = null, cars = [], me = null, raceT = 0, countdown = 0, ended = false, paused = false;
const AI_PACE = { barq: 0.92, saqr: 0.98, asifa: 1, theeb: 1, nimr: 1, hamour: 1 };
const AI_NAMES = ["فهد", "سلطان", "ريم", "ماجد", "نورة", "خالد", "عزوز", "بندر"];
const DRIFT_TIME = 120;
function clearWorld() { if (world) { scene.remove(world); world.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); } world = new THREE.Group(); scene.add(world); }
function startRace(kind, ti) {
  gameMode = kind; trackIdx = ti; const def = TRACKS[ti];
  clearWorld(); trackTextures();
  if (!ENV.day) { ENV.day = makeEnv(true); ENV.night = makeEnv(false); }
  scene.environment = def.night ? ENV.night : ENV.day;
  const skyC = def.night ? 0x0b1020 : def.dusk ? 0xe8b48a : 0xa9c7d8;
  scene.background = new THREE.Color(skyC); scene.fog = new THREE.Fog(skyC, def.night ? 60 : 120, Q.draw);
  sun.intensity = def.night ? 0.25 : def.dusk ? 2.0 : 2.7; sun.color.set(def.dusk ? 0xffc890 : 0xfff1d6); hemi.intensity = def.night ? 0.35 : 0.8; hemi.color.set(def.night ? 0x5a6a9a : 0xdfeefa);
  renderer.toneMappingExposure = def.night ? 1.25 : 1.0;
  buildTrack(def, world); buildRacingLine(); initFx();
  // sky dome
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 24, 12), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(def.night ? 0x050814 : def.dusk ? 0x5a6aa0 : 0x3f7fc0) }, bot: { value: new THREE.Color(skyC) } },
    vertexShader: "varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }",
    fragmentShader: "uniform vec3 top; uniform vec3 bot; varying float h; void main(){ gl_FragColor = vec4(mix(bot, top, clamp(h*1.8,0.,1.)),1.); }" }));
  sky.position.set((TR.box.x0 + TR.box.x1) / 2, 0, (TR.box.z0 + TR.box.z1) / 2); world.add(sky);
  // cars on the grid
  cars = [];
  const pdef = myCarDef(), myUps = upsOf(pdef.id);
  me = newCar(pdef, carStats(pdef, myUps), lookOf(pdef), true, Q.hq); me.name = ($("nick").value.trim() || "أنت").slice(0, 12);
  const nAI = kind === "race" ? 7 : 0, grid = [];
  for (let k = 0; k <= nAI; k++) grid.push(k);
  const meSlot = kind === "race" ? 4 : 0;
  const names = AI_NAMES.slice().sort(() => Math.random() - 0.5), R = rng((Math.random() * 1e9) | 0); for (let i = 0; i < 8; i++) R();
  // opponents are tuned to the same level as your car, so every race is a fight
  const lvl = Math.round((myUps.engine + myUps.tires + myUps.nitro + myUps.susp) / 4);
  for (const k of grid) {
    let c;
    if (k === meSlot) c = me;
    else {
      const d = CARS[Math.floor(R() * CARS.length)], l = clamp(lvl + Math.round(R() * 2 - 1), 0, 4);
      // every model is driven to the same pace, so no single car runs away with every race
      c = newCar(d, carStats(d, { engine: l, tires: l, nitro: l, susp: l }), aiLook(d, R), false, Q.hq);
      c.skill = 0.985 + R() * 0.03; c.pace = AI_PACE[d.id] || 1; c.aiOff = (R() - 0.5) * 1.2; c.wob = SETTINGS.diff === "easy" ? 0.05 : 0.015; c.name = names[k % names.length];
    }
    const row = Math.floor(k / 2), side = k % 2 ? -1 : 1, i = (TR.N - 6 - row * 5) % TR.N, p = TR.P[i], n = TR.Nl[i];
    c.x = p.x + n.x * side * 3.2; c.z = p.z + n.z * side * 3.2; c.a = Math.atan2(TR.T[i].z, TR.T[i].x); c.idx = i; c.dist = -(TR.len - TR.S[i]);
    c.px = c.x; c.pz = c.z; c.pa = c.a; c.mesh.userData.setNight(!!def.night);
    world.add(c.mesh); cars.push(c);
  }
  // headlight for your car at night
  headLight.intensity = def.night ? 60 : 0; world.add(headLight); world.add(headLight.target);
  raceT = 0; countdown = kind === "race" ? 3.6 : 1.5; ended = false; paused = false;
  Object.assign(drift, { active: false, pts: 0, combo: 1, t: 0, calm: 0, total: 0, best: 0 });
  camA = me.a; mode = "race"; showScreen(null); $("hud").hidden = false; document.body.classList.toggle("driftmode", kind === "drift");
  $("lapBox").hidden = kind !== "race"; $("driftBox").hidden = false; $("posBox").hidden = kind !== "race";
  miniTrack = null; engineStart(); resize();
  hint(kind === "race" ? "سباق " + ar(def.laps) + " لفات – خلك الأول!" : "تفحيط لمدة دقيقتين – كل ما طولت التفحيطة زاد المضاعف", 3500);
}
const headLight = new THREE.SpotLight(0xfff2d0, 0, 90, 0.5, 0.5, 1.2);
function finishCar(c) {
  c.finished = true; c.finishT = raceT;
  if (c === me) endRace();
}
function endRace() {
  if (ended) return; ended = true;
  setTimeout(() => {
    const def = TRACKS[trackIdx]; let coins = 0, title = "", sub = "", stars = 0;
    if (gameMode === "race") {
      const place = me.place; coins = [900, 650, 480, 360, 280, 220, 180, 150][place - 1] + Math.round(drift.total / 25);
      title = place === 1 ? "فزت بالسباق! 🏆" : "المركز " + ar(place); sub = "وقتك " + fmtT(me.finishT || raceT) + " – أحسن لفة " + fmtT(me.best);
      PROF.races++; if (place === 1) PROF.wins++;
      if (isFinite(me.best) && (!PROF.bestLap[def.id] || me.best < PROF.bestLap[def.id])) PROF.bestLap[def.id] = me.best;
      stars = place === 1 ? 3 : place <= 3 ? 2 : place <= 5 ? 1 : 0;
    } else {
      bankDrift(); const sc = drift.total; coins = Math.round(sc / 35) + 100; stars = sc >= 60000 ? 3 : sc >= 30000 ? 2 : sc >= 10000 ? 1 : 0;
      title = stars ? "★".repeat(stars) + " تفحيط ممتاز!" : "خلص الوقت"; sub = "نقاطك " + ar(sc) + " – أطول تفحيطة " + ar(drift.best);
      if (sc > PROF.bestDrift) { PROF.bestDrift = sc; sub += " – رقم قياسي جديد!"; }
    }
    PROF.stars[def.id + gameMode] = Math.max(PROF.stars[def.id + gameMode] || 0, stars);
    PROF.coins += coins; saveProf();
    $("resTitle").textContent = title; $("resSub").textContent = sub; $("resCoins").textContent = "+" + ar(coins);
    const tb = $("resTable"); tb.innerHTML = "";
    if (gameMode === "race") { const order = cars.slice().sort((a, b) => (a.finished && b.finished ? a.finishT - b.finishT : b.dist - a.dist)); order.forEach((c, i) => { const r = document.createElement("div"); if (c === me) r.className = "me"; const a = document.createElement("b"), n = document.createElement("span"), t = document.createElement("i"); a.textContent = ar(i + 1); n.textContent = c.name; t.textContent = c.finished ? fmtT(c.finishT) : "—"; r.append(a, n, t); tb.append(r); }); }
    engineStop(); showScreen("results"); $("hud").hidden = true; mode = "results";
    tone(523, 0.15, "triangle", 0.06); setTimeout(() => tone(784, 0.2, "triangle", 0.06), 160);
  }, 1200);
}
function onHit(c, vn, nx, nz) {
  c.hits = (c.hits || 0) + 1;
  if (c === me) { shake = Math.min(1, vn / 14); buzz(Math.min(120, vn * 8)); if (vn > 6) breakDrift(); noise(clamp(vn / 25, 0.05, 0.35), 0.25, 900, 120); }
  if (vn > 4) sparks(c.x - nx * c.def.wid * 0.5, c.z - nz * c.def.wid * 0.5, nx, nz, Math.min(18, vn * 1.5));
}

// ---------------- effects: smoke, skid marks, sparks ----------------
let smoke = [], smokeN = 0, smokePts = null, skid = null, skidN = 0, sparkPts = null, sparkV = [], sparkN = 0;
const SKID = 900, SPARK = 120, SMOKE = 220;
function initFx() {
  smoke = []; smokeN = 0;
  const smg = new THREE.BufferGeometry();
  smg.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(SMOKE * 3).fill(-999), 3));
  smg.setAttribute("aSize", new THREE.Float32BufferAttribute(new Float32Array(SMOKE), 1));
  smg.setAttribute("aAlpha", new THREE.Float32BufferAttribute(new Float32Array(SMOKE), 1));
  smg.setAttribute("aColor", new THREE.Float32BufferAttribute(new Float32Array(SMOKE * 3).fill(1), 3));
  smokePts = new THREE.Points(smg, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uScale: { value: 400 }, fogColor: { value: new THREE.Color() }, fogFar: { value: 600 } },
    vertexShader: "attribute float aSize; attribute float aAlpha; attribute vec3 aColor; uniform float uScale; varying float vA; varying vec3 vC; varying float vD; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vD = -mv.z; gl_PointSize = aSize*uScale/max(0.5,-mv.z); vA = aAlpha; vC = aColor; gl_Position = projectionMatrix*mv; }",
    fragmentShader: "varying float vA; varying vec3 vC; varying float vD; uniform vec3 fogColor; uniform float fogFar; void main(){ vec2 q = gl_PointCoord*2.-1.; float d = dot(q,q); if (d > 1.) discard; float a = (1.-d)*(1.-d)*vA*smoothstep(2.5, 9., vD); vec3 c = mix(vC, fogColor, clamp(vD/fogFar,0.,1.)); gl_FragColor = vec4(c, a); }" }));
  smokePts.frustumCulled = false; world.add(smokePts);
  for (let i = 0; i < SMOKE; i++) smoke.push({ x: 0, y: -999, z: 0, vx: 0, vy: 0, vz: 0, t: 0, max: 1, big: false, r: 1, g: 1, b: 1 });
  const g = new THREE.PlaneGeometry(0.22, 0.6); g.rotateX(-Math.PI / 2);
  skid = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0x0a0a0a, transparent: true, opacity: 0.45, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), SKID);
  const z = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < SKID; i++) skid.setMatrixAt(i, z); skid.frustumCulled = false; world.add(skid); skidN = 0;
  const sg = new THREE.BufferGeometry(); sg.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(SPARK * 3).fill(-999), 3));
  sparkPts = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffb040, size: 0.18, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); sparkPts.frustumCulled = false; world.add(sparkPts);
  sparkV = []; for (let i = 0; i < SPARK; i++) sparkV.push({ x: 0, y: -999, z: 0, vx: 0, vy: 0, vz: 0, t: 0 }); sparkN = 0;
}
const _col = new THREE.Color();
function puffAt(x, y, z, big, col) {
  const p = smoke[smokeN]; smokeN = (smokeN + 1) % SMOKE;
  p.t = p.max = big ? 0.8 : 0.5; p.x = x; p.y = y; p.z = z; p.big = big; _col.set(col || 0xe6e6e6); p.r = _col.r; p.g = _col.g; p.b = _col.b;
  p.vx = (Math.random() - 0.5) * 1.5; p.vy = 0.6 + Math.random() * 0.8; p.vz = (Math.random() - 0.5) * 1.5;
}
function sparks(x, z, nx, nz, n) { for (let i = 0; i < n; i++) { const s = sparkV[sparkN]; sparkN = (sparkN + 1) % SPARK; s.x = x; s.y = 0.4; s.z = z; s.vx = nx * 4 + (Math.random() - 0.5) * 6; s.vz = nz * 4 + (Math.random() - 0.5) * 6; s.vy = 2 + Math.random() * 3; s.t = 0.4 + Math.random() * 0.3; } }
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1), _up = new THREE.Vector3(0, 1, 0);
let skidAcc = 0;
function carFx(c, dt) {
  const sp = Math.hypot(c.vx, c.vz), ang = Math.abs(c.slip), burn = c.thr > 0.8 && sp < 8 && sp > 0.3 && c.player;
  const sliding = (ang > 0.22 && sp > 6) || (c.hb && sp > 5) || burn;
  if (sliding) {
    const G = c.mesh.userData.G, ca = Math.cos(c.a), sa = Math.sin(c.a);
    skidAcc += sp * dt;
    for (const s of [1, -1]) {
      const wx = c.x - ca * G.wx + -sa * s * G.wz, wz = c.z - sa * G.wx + ca * s * G.wz;
      if (skidAcc > 0.5) { _q.setFromAxisAngle(_up, -c.a + Math.PI / 2); _m4.compose(_v.set(wx, 0.04, wz), _q, _one); skid.setMatrixAt(skidN, _m4); skidN = (skidN + 1) % SKID; skid.instanceMatrix.needsUpdate = true; }
      if (Math.random() < (c.player ? 0.42 : 0.25) * dt * 60) puffAt(wx, 0.35, wz, ang > 0.5 || burn, c.offroad ? 0xc9b48a : (c.mesh.userData.look.smoke || 0xe6e6e6));
    }
    if (skidAcc > 0.5) skidAcc = 0;
  }
  if (c.nitroOn && c.nitro > 0) { const f = c.mesh.userData.flames; f.visible = true; f.scale.set(0.8 + Math.random() * 0.5, 1, 1); } else c.mesh.userData.flames.visible = false;
  c.mesh.userData.tailMat.emissiveIntensity = c.brk > 0 ? 3 : 0.8;
}
function fxTick(dt) {
  const sp = smokePts.geometry.attributes.position, ss = smokePts.geometry.attributes.aSize, sa = smokePts.geometry.attributes.aAlpha, sc2 = smokePts.geometry.attributes.aColor;
  for (let i = 0; i < SMOKE; i++) {
    const p = smoke[i];
    if (p.t > 0) { p.t -= dt; const k = 1 - p.t / p.max; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; ss.array[i] = (p.big ? 1.8 : 1.1) + k * (p.big ? 3.2 : 2.0); sa.array[i] = Math.pow(Math.max(0, 1 - k), 1.6) * (p.big ? 0.34 : 0.24); }
    else sa.array[i] = 0;
    sp.setXYZ(i, p.x, p.y, p.z); sc2.setXYZ(i, p.r, p.g, p.b);
  }
  sp.needsUpdate = ss.needsUpdate = sa.needsUpdate = sc2.needsUpdate = true;
  const U = smokePts.material.uniforms; U.uScale.value = renderer.domElement.height / (2 * Math.tan(camera.fov * Math.PI / 360)); if (scene.fog) { U.fogColor.value.copy(scene.fog.color); U.fogFar.value = scene.fog.far; }
  const pos = sparkPts.geometry.attributes.position;
  for (let i = 0; i < SPARK; i++) { const s = sparkV[i]; if (s.t > 0) { s.t -= dt; s.vy -= 12 * dt; s.x += s.vx * dt; s.y = Math.max(0.02, s.y + s.vy * dt); s.z += s.vz * dt; if (s.t <= 0) s.y = -999; } pos.setXYZ(i, s.x, s.y, s.z); }
  pos.needsUpdate = true;
}

// ---------------- update ----------------
let shake = 0;
function update(dt) {
  if (paused) return;
  if (countdown > 0) {
    const before = Math.ceil(countdown); countdown -= dt; const now = Math.ceil(countdown);
    if (now !== before && now > 0) { tone(440, 0.18, "square", 0.05); $("count").textContent = ar(now); $("count").hidden = false; }
    if (countdown <= 0) { tone(880, 0.35, "square", 0.06); $("count").textContent = "انطلق!"; setTimeout(() => ($("count").hidden = true), 700); }
    // revving at the start line
    input.read(me, dt);
    return;
  }
  raceT += dt;
  input.read(me, dt);
  const leader = Math.max(...cars.map((c) => c.dist));
  for (const c of cars) {
    if (c.ai || (c === me && window.__auto)) { if (c.finished) { c.thr = 0; c.brk = 0.4; c.steer = 0; } else aiDrive(c, dt, leader, me.dist); }
    else if (c.finished) { c.thr = 0; c.brk = 0.5; c.nitroOn = false; }
    carStep(c, dt);
    // lap progress
    const prev = c.prevS == null ? c.q.s : c.prevS; let ds = c.q.s - prev; if (ds < -TR.len / 2) ds += TR.len; if (ds > TR.len / 2) ds -= TR.len; c.prevS = c.q.s;
    c.dist += ds; c.lapT += dt;
    if (gameMode === "race" && !c.finished) {
      const lap = Math.floor(c.dist / TR.len);
      if (lap > c.lap) { c.lap = lap; if (lap >= 1) { c.lastLap = c.lapT; c.best = Math.min(c.best, c.lapT); if (c === me && lap < TR.def.laps) { popup("لفة " + ar(lap + 1) + " – " + fmtT(c.lapT), ""); tone(990, 0.12, "triangle", 0.05); } } c.lapT = 0; if (lap >= TR.def.laps) finishCar(c); }
    }
  }
  carsCollide(cars);
  if (gameMode === "race") { const order = cars.slice().sort((a, b) => (a.finished && b.finished ? a.finishT - b.finishT : a.finished ? -1 : b.finished ? 1 : b.dist - a.dist)); order.forEach((c, i) => (c.place = i + 1)); }
  driftTick(me, dt);
  if (gameMode === "drift" && raceT >= DRIFT_TIME && !ended) { bankDrift(); endRace(); }
  me.rpm = clamp((Math.abs(me.fwd) % 14) / 14 * 0.8 + Math.min(1, Math.abs(me.fwd) / me.st.max) * 0.2 + (me.loose > 0.5 && me.thr > 0 ? 0.25 : 0), 0, 1);
  me.gear = clamp(1 + Math.floor(Math.abs(me.fwd) / 14), 1, 6);
}
// once per drawn frame: sound, smoke, HUD
function frameTick(dt) {
  if (countdown > 0) { engineTick(me.thr * 0.8, me.thr, 0); drawMini(); return; }
  if (!paused) for (const c of cars) carFx(c, dt);
  engineTick(me.rpm, me.thr, Math.abs(me.slip) + (me.hb ? 0.3 : 0));
  fxTick(dt); hud(dt, Math.hypot(me.vx, me.vz));
}

// ---------------- camera ----------------
let camA = 0;
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
function updateCamera(dt) {
  const c = { x: me.rx, z: me.rz, a: me.ra, vx: me.vx, vz: me.vz, nitroOn: me.nitroOn, nitro: me.nitro }, sp = Math.hypot(c.vx, c.vz);
  // follow a mix of where the car points and where it is going, so drifts look wide
  const velA = sp > 4 ? Math.atan2(c.vz, c.vx) : c.a; let mix = c.a; let dd = velA - c.a; dd = Math.atan2(Math.sin(dd), Math.cos(dd)); mix = c.a + dd * 0.45;
  let da = mix - camA; da = Math.atan2(Math.sin(da), Math.cos(da)); camA += da * (1 - Math.exp(-dt * 5));
  const camMode = SETTINGS.cam % 3, dist = camMode === 1 ? 8.5 : 4.9, h = camMode === 1 ? 3.2 : 1.7;
  if (camMode === 2) { // bonnet camera
    camPos.set(c.x + Math.cos(c.a) * 0.4, 1.15, c.z + Math.sin(c.a) * 0.4); camLook.set(c.x + Math.cos(c.a) * 20, 1.0, c.z + Math.sin(c.a) * 20);
    camera.position.copy(camPos);
  } else {
    const back = dist + sp * 0.012;
    const tx = c.x - Math.cos(camA) * back, tz = c.z - Math.sin(camA) * back;
    camPos.set(tx, h + sp * 0.006, tz);
    camera.position.lerp(camPos, 1 - Math.exp(-dt * 28)); // stays tight behind the car, even at full speed
    camLook.set(c.x + Math.cos(camA) * 3.2, 1.0, c.z + Math.sin(camA) * 3.2);
  }
  shake = Math.max(0, shake - dt * 2.5);
  camera.position.x += (Math.random() - 0.5) * shake * 0.3; camera.position.y += (Math.random() - 0.5) * shake * 0.2;
  camera.lookAt(camLook);
  const boost = c.nitroOn && c.nitro > 0;
  camera.fov = lerp(camera.fov, 55 + Math.min(8, sp * 0.14) + (boost ? 6 : 0), 1 - Math.exp(-dt * 4)); camera.updateProjectionMatrix();
  sun.position.set(c.x + 40, 90, c.z + 30); sun.target.position.set(c.x, 0, c.z);
  headLight.position.set(c.x + Math.cos(c.a) * 1.5, 1.2, c.z + Math.sin(c.a) * 1.5); headLight.target.position.set(c.x + Math.cos(c.a) * 30, 0, c.z + Math.sin(c.a) * 30);
}
function syncMeshes(dt, al) {
  for (const c of cars) {
    let da = c.a - c.pa; da = Math.atan2(Math.sin(da), Math.cos(da));
    c.rx = lerp(c.px, c.x, al); c.rz = lerp(c.pz, c.z, al); c.ra = c.pa + da * al;
    const m = c.mesh, U = m.userData; m.position.set(c.rx, 0, c.rz); m.rotation.y = -c.ra;
    // body roll and pitch for weight
    const lat = c.w * Math.hypot(c.vx, c.vz);
    U.body.rotation.x = lerp(U.body.rotation.x, clamp(lat * 0.0028, -0.06, 0.06), 1 - Math.exp(-dt * 8));
    U.body.rotation.z = lerp(U.body.rotation.z, clamp((c.brk > 0 ? -0.025 : 0) + (c.thr > 0 ? 0.012 : 0), -0.04, 0.04), 1 - Math.exp(-dt * 6));
    const spin = lerp(c.pspin, c.spin, al);
    for (const w of U.wheels) { if (w.front) w.steer.rotation.y = -c.steer * 0.5; w.spin.rotation.z = w.sgn * spin; }
  }
}

// ---------------- HUD ----------------
let hudAcc = 0, miniTrack = null;
// put the car back in the middle of the road, facing the right way
function resetCar(c) {
  if (!c || countdown > 0) return;
  const i = c.idx >= 0 ? c.idx : trackQuery(c.x, c.z, -1).i, p = TR.P[i];
  c.x = p.x; c.z = p.z; c.a = Math.atan2(TR.T[i].z, TR.T[i].x); c.vx = c.vz = 0; c.w = 0; c.loose = 0; c.prevS = TR.S[i]; camA = c.a;
  breakDrift(); stuckT = 0; wrongT = 0; $("resetBtn").hidden = true; $("wrongWay").hidden = true; tone(600, 0.08, "triangle", 0.04);
}
let stuckT = 0, wrongT = 0;
function watchStuck(dt, sp) {
  // stuck against a wall or driving the wrong way: offer a reset
  const i = me.idx, fwd = Math.cos(me.a) * TR.T[i].x + Math.sin(me.a) * TR.T[i].z;
  if (sp < 3 && !ended && (Math.abs(me.q ? me.q.d : 0) > TR.hw - 1.2 || me.offroad)) stuckT += dt; else stuckT = Math.max(0, stuckT - dt * 2);
  if (fwd < -0.3 && sp > 4 && !ended) wrongT += dt; else wrongT = Math.max(0, wrongT - dt * 2);
  $("resetBtn").hidden = !(stuckT > 2.5 || wrongT > 2);
  $("wrongWay").hidden = !(wrongT > 1.2);
}
function hud(dt, sp) {
  watchStuck(dt, sp);
  hudAcc += dt;
  // drift meter every frame (it's the fun part)
  const dm = $("driftNow");
  if (drift.active) { dm.hidden = false; dm.querySelector("b").textContent = ar(Math.round(drift.pts)); dm.querySelector("i").textContent = "×" + ar(drift.combo); dm.style.setProperty("--k", Math.min(1, Math.abs(me.slip) / 1.1)); }
  else dm.hidden = true;
  if (hudAcc < 0.08) return; hudAcc = 0;
  $("spd").textContent = ar(Math.round(Math.abs(me.fwd || 0) * 3.6)); $("gear").textContent = ar(me.gear);
  $("rpm").style.setProperty("--r", me.rpm);
  $("nitroBar").style.width = (me.nitro / me.st.nitroCap * 100) + "%";
  $("driftTotal").textContent = ar(drift.total);
  if (gameMode === "race") {
    $("pos").textContent = ar(me.place); $("posN").textContent = "/" + ar(cars.length);
    $("lap").textContent = ar(Math.min(TR.def.laps, me.lap + 1)) + "/" + ar(TR.def.laps);
    $("time").textContent = fmtT(raceT); $("bestLap").textContent = isFinite(me.best) ? "أحسن لفة " + fmtT(me.best) : "";
  } else { $("time").textContent = fmtT(Math.max(0, DRIFT_TIME - raceT)); $("bestLap").textContent = "أحسن تفحيطة " + ar(drift.best); }
  drawMini();
  $("speedLines").style.opacity = clamp((sp - 30) / 30, 0, 0.6) + (me.nitroOn && me.nitro > 0 ? 0.3 : 0);
}
function drawMini() {
  const cv = $("mini"), g = cv.getContext("2d"), W = cv.width, H = cv.height, B = TR.box, s = Math.min(W / (B.x1 - B.x0 + 60), H / (B.z1 - B.z0 + 60));
  const X = (x) => (x - (B.x0 + B.x1) / 2) * s + W / 2, Y = (z) => (z - (B.z0 + B.z1) / 2) * s + H / 2;
  if (!miniTrack) { miniTrack = document.createElement("canvas"); miniTrack.width = W; miniTrack.height = H; const m = miniTrack.getContext("2d"); m.strokeStyle = "rgba(255,255,255,0.85)"; m.lineWidth = 5; m.lineJoin = "round"; m.beginPath(); TR.P.forEach((p, i) => (i ? m.lineTo(X(p.x), Y(p.z)) : m.moveTo(X(p.x), Y(p.z)))); m.closePath(); m.stroke(); m.fillStyle = "#f2a541"; m.fillRect(X(TR.P[0].x) - 4, Y(TR.P[0].z) - 4, 8, 8); }
  g.clearRect(0, 0, W, H); g.drawImage(miniTrack, 0, 0);
  for (const c of cars) { g.fillStyle = c === me ? "#ffd23f" : "#ff4d3a"; g.beginPath(); g.arc(X(c.x), Y(c.z), c === me ? 6 : 4.5, 0, TAU); g.fill(); }
}
let hintT = null;
function hint(t, ms = 2500) { const h = $("hint"); h.textContent = t; h.hidden = false; clearTimeout(hintT); hintT = setTimeout(() => (h.hidden = true), ms); }
function popup(t, cls) { const p = document.createElement("div"); p.className = "pop " + (cls || ""); p.textContent = t; $("pops").append(p); setTimeout(() => p.remove(), 1400); }

// ---------------- input ----------------
const input = (() => {
  const keys = {}, held = {};
  window.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT") return; const k = e.key.toLowerCase(); keys[k] = true;
    if (k === "c" && mode === "race") { SETTINGS.cam = (SETTINGS.cam + 1) % 3; saveSettings(); }
    if ((k === "escape" || k === "p") && mode === "race") togglePause();
    if (k === "r" && mode === "race") resetCar(me);
    if (k === " " || k.startsWith("arrow")) e.preventDefault();
  });
  window.addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });
  // touch buttons: every finger is tracked on its own, a finger can slide from one button to the next,
  // and the hit area is a little bigger than the drawn circle so quick taps never miss
  const ctlEls = [...document.querySelectorAll("[data-hold]")], ptrs = new Map();
  let rects = null; const measure = () => { rects = ctlEls.map((b) => [b.dataset.hold, b.getBoundingClientRect()]); };
  const hitKey = (x, y) => { let best = null, bd = 1e9; for (const [k, r] of rects) { if (!r.width) continue; const cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2, d = Math.hypot(x - cx, y - cy), rad = r.width / 2 + 18; if (d < rad && d < bd) { bd = d; best = k; } } return best; };
  const sync = () => { for (const k in held) held[k] = false; for (const k of ptrs.values()) held[k] = true; for (const b of ctlEls) b.classList.toggle("down", !!held[b.dataset.hold]); };
  window.addEventListener("pointerdown", (e) => { if (mode !== "race" || paused || e.pointerType === "mouse") return; measure(); const k = hitKey(e.clientX, e.clientY); if (!k) return; e.preventDefault(); ptrs.set(e.pointerId, k); sync(); audio(); }, { passive: false });
  window.addEventListener("pointermove", (e) => { if (!ptrs.has(e.pointerId)) return; const k = hitKey(e.clientX, e.clientY); if (k && k !== ptrs.get(e.pointerId)) { ptrs.set(e.pointerId, k); sync(); } });
  const lift = (e) => { if (ptrs.delete(e.pointerId)) sync(); };
  for (const t of ["pointerup", "pointercancel"]) window.addEventListener(t, lift);
  // mouse clicks on the buttons (desktop testing)
  for (const b of ctlEls) { b.addEventListener("mousedown", () => { ptrs.set("m", b.dataset.hold); sync(); }); }
  window.addEventListener("mouseup", () => { if (ptrs.delete("m")) sync(); });
  window.addEventListener("blur", () => { ptrs.clear(); sync(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) { ptrs.clear(); sync(); } });
  let tilt = 0; window.addEventListener("deviceorientation", (e) => { const land = Math.abs(window.orientation || (screen.orientation && screen.orientation.angle) || 0) === 90; const v = land ? (e.beta || 0) * Math.sign((screen.orientation && screen.orientation.angle) === 270 || window.orientation === -90 ? -1 : 1) : (e.gamma || 0); tilt = clamp(v / 22, -1, 1); });
  let steerV = 0;
  return {
    read(c, dt = 1 / 60) {
      const L = keys["arrowleft"] || keys["a"] || held.left, R = keys["arrowright"] || keys["d"] || held.right;
      let target = (R ? 1 : 0) - (L ? 1 : 0);
      if (SETTINGS.ctl === "tilt" && IS_TOUCH) target = Math.abs(tilt) < 0.06 ? 0 : tilt;
      // digital steering eases in so it feels like a wheel
      const touchK = IS_TOUCH ? 1.9 : 1; // fingers want a sharper response than a keyboard
      const rate = (target === 0 ? 8 : Math.sign(target) !== Math.sign(steerV) ? 11 : 5.5) * touchK;
      steerV += clamp(target - steerV, -rate * dt, rate * dt);
      if (Math.abs(target - steerV) < 0.02) steerV = target;
      c.steer = steerV;
      c.thr = keys["arrowup"] || keys["w"] || held.gas ? 1 : 0;
      c.brk = keys["arrowdown"] || keys["s"] || held.brake ? 1 : 0;
      c.hb = !!(keys[" "] || held.hb);
      c.nitroOn = !!(keys["shift"] || keys["n"] || held.nitro) && c.nitro > 0.05;
    }
  };
})();
function togglePause() { paused = !paused; $("pauseMenu").hidden = !paused; if (paused) engineStop(); else engineStart(); }

// ---------------- loop ----------------
let last = performance.now(), simAcc = 0;
const STEP = 1 / 120;
function frame(now) {
  let dt = (now - last) / 1000; last = now; if (dt > 0.1) dt = 0.1;
  if (mode === "race" && me) {
    simAcc += dt * (window.__fast || 1); let n = 0;
    while (simAcc >= STEP && n < 60) { for (const c of cars) { c.px = c.x; c.pz = c.z; c.pa = c.a; c.pspin = c.spin; } update(STEP); simAcc -= STEP; n++; }
    if (n >= 60) simAcc = 0;
    syncMeshes(dt, clamp(simAcc / STEP, 0, 1)); frameTick(dt); updateCamera(dt); renderer.render(scene, camera); adaptRes(dt);
  }
  else if (mode === "garage" || mode === "results" || mode === "tracks") renderGarage(dt);
  requestAnimationFrame(frame);
}

// ---------------- garage: 3D showroom ----------------
const gar = { scene: new THREE.Scene(), cam: new THREE.PerspectiveCamera(36, 1, 0.1, 200), car: null, carId: null, rot: 0.6, rotT: 0.6, drag: null, sel: 0, t: 0, built: false };
function buildGarage() {
  if (gar.built) return; gar.built = true;
  if (!ENV.night) { ENV.day = makeEnv(true); ENV.night = makeEnv(false); }
  const s = gar.scene; s.environment = ENV.night; s.background = new THREE.Color(0x0c0e13); s.fog = new THREE.Fog(0x0c0e13, 14, 40);
  s.add(new THREE.HemisphereLight(0x8899cc, 0x111111, 0.6));
  const key = new THREE.SpotLight(0xffffff, 260, 30, 0.6, 0.5, 1.4); key.position.set(3, 8, 4); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); s.add(key); s.add(key.target);
  const rim1 = new THREE.PointLight(0xff3f8a, 40, 14); rim1.position.set(-5, 2, -3); s.add(rim1);
  const rim2 = new THREE.PointLight(0x3fc8ff, 40, 14); rim2.position.set(5, 2, -3); s.add(rim2);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 64), new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.25, metalness: 0.6 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; s.add(floor);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.7, 0.12, 64), new THREE.MeshStandardMaterial({ color: 0x23262d, roughness: 0.3, metalness: 0.7 })); disc.position.y = 0.06; disc.receiveShadow = true; s.add(disc); gar.disc = disc;
  for (const [r, c] of [[3.7, 0xf2a541], [3.95, 0x3fc8ff]]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.025, 8, 96), new THREE.MeshBasicMaterial({ color: c })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.13; s.add(ring); }
  // light strips on the back wall
  for (let i = 0; i < 9; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.12, 4.5, 0.12), new THREE.MeshBasicMaterial({ color: i % 2 ? 0x3fc8ff : 0xf2a541 })); b.position.set(-8 + i * 2, 2.25, -9); s.add(b); }
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(40, 12), new THREE.MeshStandardMaterial({ color: 0x0f1116, roughness: 0.9 })); wall.position.set(0, 6, -9.2); s.add(wall);
}
function garageCar(id) {
  const c = carById(id);
  if (gar.car && gar.carId === id) { gar.car.userData.setLook(lookOf(c)); return; }
  if (gar.car) gar.scene.remove(gar.car);
  gar.car = makeCarMesh(c, lookOf(c), true); gar.car.userData.setNight(true); gar.car.position.y = 0.12; gar.scene.add(gar.car); gar.carId = id;
}
function renderGarage(dt) {
  if (!gar.built) return;
  const w = canvas.clientWidth, h = canvas.clientHeight, portrait = h > w;
  gar.cam.aspect = w / h; gar.cam.fov = portrait ? 50 : 34;
  if (portrait) gar.cam.setViewOffset(w, h, 0, h * 0.2, w, h); else gar.cam.clearViewOffset();
  gar.cam.updateProjectionMatrix();
  gar.t += dt; if (!gar.drag) gar.rotT += dt * 0.25; gar.rot += (gar.rotT - gar.rot) * (1 - Math.exp(-dt * 6));
  if (gar.car) gar.car.rotation.y = gar.rot; gar.disc.rotation.y = gar.rot;
  if (portrait) { gar.cam.position.set(0, 3.6, 10.5); gar.cam.lookAt(0, 0.1, 0); } else { gar.cam.position.set(Math.sin(gar.t * 0.15) * 0.4 + 2.2, 2.4, 10.5); gar.cam.lookAt(2.2, 0.5, 0); }
  renderer.render(gar.scene, gar.cam);
}
canvas.addEventListener("pointerdown", (e) => { if (mode !== "garage" && mode !== "tracks") return; gar.drag = { x: e.clientX }; });
window.addEventListener("pointermove", (e) => { if (!gar.drag) return; gar.rotT += (e.clientX - gar.drag.x) * 0.012; gar.drag.x = e.clientX; });
window.addEventListener("pointerup", () => (gar.drag = null));

// ---------------- garage UI ----------------
function showScreen(id) { for (const s of ["garage", "tracks", "results", "settings"]) $(s).hidden = s !== id; if (id === "garage" || id === "tracks") mode = id; document.body.classList.toggle("racing", !id); }
let gTab = "paint";
function garageUi() {
  const c = CARS[gar.sel], st = carStats(c, upsOf(c.id)), look = lookOf(c);
  garageCar(c.id);
  $("coins").textContent = ar(PROF.coins);
  $("carName").textContent = c.name; $("carDesc").textContent = c.desc;
  const bars = $("carBars"); bars.innerHTML = "";
  for (const [label, v] of [["السرعة", st.max / 85], ["التسارع", st.acc / 17], ["الثبات", st.grip / 10], ["التفحيط", st.drift / 1.5]]) {
    const r = document.createElement("div"), l = document.createElement("span"), b = document.createElement("b"), i = document.createElement("i");
    l.textContent = label; i.style.width = clamp(v, 0.05, 1) * 100 + "%"; b.append(i); r.append(l, b); bars.append(r);
  }
  const act = $("carAct"); act.textContent = PROF.car === c.id ? "سيارتك ✓" : "اختر هذي السيارة"; act.className = "btn" + (PROF.car === c.id ? " alt" : "");
  buildLookUi(c, look);
  // upgrades (earned with coins from races)
  const ul = $("ups"); ul.innerHTML = ""; const u = upsOf(c.id);
  for (const k of ["engine", "tires", "nitro", "susp"]) {
    const U = UPG[k], lv = u[k], r = document.createElement("div"), n = document.createElement("span"), dots = document.createElement("em"), b = document.createElement("button");
    n.textContent = U.name; for (let i = 0; i < 4; i++) { const d = document.createElement("i"); if (i < lv) d.className = "on"; dots.append(d); }
    b.type = "button"; b.className = "upb"; b.textContent = lv >= 4 ? "كامل" : ar(U.cost[lv]) + " 🪙"; b.disabled = lv >= 4;
    b.addEventListener("click", () => { if (PROF.coins < U.cost[lv]) { toast("ما عندك فلوس كفاية، العب وجمّع"); return; } PROF.coins -= U.cost[lv]; u[k]++; saveProf(); garageUi(); tone(660, 0.1, "triangle", 0.05); setTimeout(() => tone(990, 0.15, "triangle", 0.05), 100); });
    r.append(n, dots, b); ul.append(r);
  }
  $("garNote").textContent = "";
}
// customisation: everything is open, pick any colour or part
function buildLookUi(c, look) {
  // customising a car makes it the car you race with
  const pickMe = () => { if (PROF.car !== c.id) { PROF.car = c.id; const act = $("carAct"); act.textContent = "سيارتك ✓"; act.className = "btn alt"; } };
  const set = (k, v) => { look[k] = v; pickMe(); saveProf(); gar.car.userData.setLook(look); buildLookUi(c, look); tone(700, 0.04, "triangle", 0.03); };
  const title = (t) => { const p = document.createElement("p"); p.className = "swt"; p.textContent = t; return p; };
  const colors = (k, list) => {
    const row = document.createElement("div"); row.className = "swl";
    for (const col of list) { const b = document.createElement("button"); b.type = "button"; b.className = "sw" + (look[k] === col ? " on" : ""); b.style.background = col; b.setAttribute("aria-label", col); b.addEventListener("click", () => set(k, col)); row.append(b); }
    const lab = document.createElement("label"); lab.className = "cin" + (list.includes(look[k]) ? "" : " on"); lab.title = "لون مخصص"; lab.setAttribute("aria-label", "لون مخصص");
    const inp = document.createElement("input"); inp.type = "color"; inp.value = /^#[0-9a-f]{6}$/i.test(look[k]) ? look[k] : "#ffffff";
    inp.addEventListener("input", () => { look[k] = inp.value; pickMe(); saveProf(); gar.car.userData.setLook(look); }); inp.addEventListener("change", () => set(k, inp.value));
    lab.append(inp); row.append(lab); return row;
  };
  const chips = (k, opts) => {
    const row = document.createElement("div"); row.className = "chiprow";
    for (const [v, label] of Object.entries(opts)) { const b = document.createElement("button"); b.type = "button"; const val = typeof look[k] === "number" ? +v : v; b.className = "chip" + (look[k] === val ? " on" : ""); b.textContent = label; b.addEventListener("click", () => set(k, val)); row.append(b); }
    return row;
  };
  const P = $("gt-paint"); P.innerHTML = "";
  P.append(title("لون السيارة"), colors("paint", PALETTE), title("اللمعة"), chips("finish", FINISH), title("الرسمة"), chips("decal", DECALS));
  if (look.decal !== "none") P.append(title("لون الرسمة"), colors("c2", PALETTE));
  if (look.decal === "number" || look.decal === "race") { const n = document.createElement("input"); n.type = "number"; n.min = 0; n.max = 99; n.value = look.num; n.className = "numin"; n.setAttribute("aria-label", "رقم السيارة"); n.addEventListener("change", () => set("num", clamp(Math.round(+n.value || 0), 0, 99))); P.append(title("رقم السيارة"), n); }
  P.append(title("السقف"), chips("roof", ROOFS));
  if (look.roof === "c2" && look.decal === "none") P.append(title("لون السقف"), colors("c2", PALETTE));
  P.append(title("تظليل الزجاج"), chips("tint", Object.fromEntries(TINTS.map((t, i) => [i, t]))));
  const Rm = $("gt-rims"); Rm.innerHTML = "";
  Rm.append(title("شكل الجنوط"), chips("rim", Object.fromEntries(RIM_STYLES.map((t, i) => [i, t]))), title("لون الجنوط"), colors("rimC", ["#c9ccd1", "#e8e8e8", "#9ea3a8", "#26272b", "#1b1b1d", "#d4af37", "#b87333", "#c81e1e", "#1f6fe0", "#f2c230", "#ffffff"]), title("لون الكاليبر"), colors("caliper", ["#d42020", "#ffd400", "#1f6fe0", "#3fd98a", "#ff5a1f", "#26272b", "#e8e8e8"]));
  const K = $("gt-kit"); K.innerHTML = "";
  const h = document.createElement("input"); h.type = "range"; h.min = 0; h.max = 1; h.step = 0.1; h.value = look.height || 0; h.className = "rng"; h.setAttribute("aria-label", "تنزيل السيارة");
  h.addEventListener("input", () => { look.height = +h.value; pickMe(); saveProf(); gar.car.userData.setLook(look); });
  K.append(title("الجناح"), chips("spoiler", SPOILERS), title("تنزيل السيارة"), h, title("نيون تحت السيارة"), chips("neon", Object.fromEntries(NEONS.map((n) => [n, n ? "●" : "بدون"]))), title("لون دخان التفحيط"), colors("smoke", SMOKES));
  // colour the neon chips
  K.querySelectorAll(".chiprow")[1].querySelectorAll(".chip").forEach((b, i) => { if (NEONS[i]) b.style.color = NEONS[i]; });
}
let toastT = null;
function toast(t) { const n = $("garNote"); n.textContent = t; clearTimeout(toastT); toastT = setTimeout(() => (n.textContent = ""), 2500); }
$("prevCar").addEventListener("click", () => { gar.sel = (gar.sel + CARS.length - 1) % CARS.length; garageUi(); tone(500, 0.04, "triangle", 0.03); });
$("nextCar").addEventListener("click", () => { gar.sel = (gar.sel + 1) % CARS.length; garageUi(); tone(500, 0.04, "triangle", 0.03); });
$("carAct").addEventListener("click", () => { const c = CARS[gar.sel]; PROF.car = c.id; saveProf(); garageUi(); tone(523, 0.12, "triangle", 0.06); });
document.querySelectorAll(".gtabs button").forEach((b) => b.addEventListener("click", () => { gTab = b.dataset.t; document.querySelectorAll(".gtabs button").forEach((x) => x.classList.toggle("on", x === b)); for (const t of ["paint", "rims", "kit", "ups"]) $("gt-" + t).hidden = t !== gTab; }));
// track & mode select
let pickMode = "race", pickTrack = 0;
function tracksUi() {
  const el = $("trackList"); el.innerHTML = "";
  TRACKS.forEach((t, i) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "tcard" + (i === pickTrack ? " on" : "") + (t.night ? " night" : t.dusk ? " dusk" : "");
    const n = document.createElement("b"), d = document.createElement("span"), s = document.createElement("i");
    n.textContent = t.name; d.textContent = t.desc; const stars = PROF.stars[t.id + pickMode] || 0; s.textContent = "★".repeat(stars) + "☆".repeat(3 - stars);
    const best = PROF.bestLap[t.id]; if (best && pickMode === "race") { const bl = document.createElement("small"); bl.textContent = "أحسن لفة " + fmtT(best); b.append(n, d, s, bl); } else b.append(n, d, s);
    b.addEventListener("click", () => { pickTrack = i; tracksUi(); });
    el.append(b);
  });
  document.querySelectorAll(".mpick button").forEach((x) => x.classList.toggle("on", x.dataset.m === pickMode));
  $("modeDesc").textContent = pickMode === "race" ? "سباق ضد ٧ سواقين بنفس مستوى سيارتك – السباق متقارب لين النهاية" : "دقيقتين تفحيط – جمّع نقاط وكومبو";
  $("diffPick").hidden = pickMode !== "race";
  document.querySelectorAll("#diffPick button").forEach((x) => x.classList.toggle("on", x.dataset.d === SETTINGS.diff));
}
document.querySelectorAll(".mpick button").forEach((b) => b.addEventListener("click", () => { pickMode = b.dataset.m; if (pickMode === "drift" && pickTrack === 0) pickTrack = 2; tracksUi(); }));
document.querySelectorAll("#diffPick button").forEach((b) => b.addEventListener("click", () => { SETTINGS.diff = b.dataset.d; saveSettings(); tracksUi(); }));
$("playBtn").addEventListener("click", () => { PROF.car = CARS[gar.sel].id; saveProf(); audio(); showScreen("tracks"); tracksUi(); });
$("backGarage").addEventListener("click", () => { showScreen("garage"); garageUi(); });
$("goBtn").addEventListener("click", () => { audio(); goFullscreen(); startRace(pickMode, pickTrack); });
$("againBtn").addEventListener("click", () => startRace(gameMode, trackIdx));
$("toGarage").addEventListener("click", () => { showScreen("garage"); garageUi(); $("hud").hidden = true; });
$("pauseBtn").addEventListener("click", togglePause);
$("resumeBtn").addEventListener("click", togglePause);
$("restartBtn").addEventListener("click", () => { paused = false; $("pauseMenu").hidden = true; startRace(gameMode, trackIdx); });
$("quitBtn").addEventListener("click", () => { paused = false; $("pauseMenu").hidden = true; engineStop(); $("hud").hidden = true; showScreen("garage"); garageUi(); });
$("resetBtn").addEventListener("click", () => resetCar(me));
$("camBtn").addEventListener("click", () => { SETTINGS.cam = (SETTINGS.cam + 1) % 3; saveSettings(); });
// settings
function settingsUi() {
  document.querySelectorAll("[data-q]").forEach((b) => b.classList.toggle("on", b.dataset.q === SETTINGS.quality));
  document.querySelectorAll("[data-ctl]").forEach((b) => b.classList.toggle("on", b.dataset.ctl === SETTINGS.ctl));
  $("soundOn").checked = SETTINGS.sound;
}
$("setBtn").addEventListener("click", () => { settingsUi(); $("settings").hidden = false; });
$("setPause").addEventListener("click", () => { settingsUi(); $("settings").hidden = false; });
document.querySelectorAll("[data-q]").forEach((b) => b.addEventListener("click", () => { SETTINGS.quality = b.dataset.q; saveSettings(); applyQuality(); settingsUi(); }));
document.querySelectorAll("[data-ctl]").forEach((b) => b.addEventListener("click", () => { SETTINGS.ctl = b.dataset.ctl; saveSettings(); settingsUi(); document.body.classList.toggle("tilt", SETTINGS.ctl === "tilt"); if (SETTINGS.ctl === "tilt" && window.DeviceOrientationEvent && DeviceOrientationEvent.requestPermission) DeviceOrientationEvent.requestPermission().catch(() => {}); }));
$("soundOn").addEventListener("change", (e) => { SETTINGS.sound = e.target.checked; saveSettings(); if (!SETTINGS.sound) engineStop(); });
$("setDone").addEventListener("click", () => { $("settings").hidden = true; });
$("nick").value = store.get("dk.nick", ""); $("nick").addEventListener("change", () => store.set("dk.nick", $("nick").value.trim()));
async function goFullscreen() {
  if (!IS_TOUCH) return;
  try { if (!document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen({ navigationUI: "hide" }); } catch (e) {}
  try { await screen.orientation?.lock?.("landscape"); } catch (e) {}
}
// on phones: the first touch anywhere goes full screen and turns the game sideways straight away
if (IS_TOUCH) { const first = () => { goFullscreen(); }; window.addEventListener("pointerup", first, { once: true }); document.addEventListener("fullscreenchange", () => { if (document.fullscreenElement) { try { screen.orientation.lock("landscape").catch(() => {}); } catch (e) {} } }); }
document.body.classList.toggle("touch", IS_TOUCH); document.body.classList.toggle("tilt", SETTINGS.ctl === "tilt");
// ---------------- boot ----------------
applyQuality(); buildGarage(); gar.sel = Math.max(0, CARS.findIndex((c) => c.id === PROF.car)); showScreen("garage"); garageUi();
requestAnimationFrame(frame);
window.__dk = { get me() { return me; }, get cars() { return cars; }, get tr() { return TR; }, get drift() { return drift; }, start: startRace, get info() { return renderer.info.render; }, get adapt() { return ADAPT; }, sim(n) { for (let i = 0; i < n; i++) { for (const c of cars) { c.px = c.x; c.pz = c.z; c.pa = c.a; c.pspin = c.spin; } update(STEP); } }, set hits(v) {}, };

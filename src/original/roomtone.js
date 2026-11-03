// Adapted from madebysourasith-sudo/roomtone at cdcd63662c4aebb70857ba0d5e0552c73e38eb0f.
// Original models, UI and scene settings are retained. See THIRD_PARTY_NOTICES.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { N8AOPass } from 'n8ao';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { createGeometryCache, batchPrimitives, visibleAnimation } from '../lib/render-performance.js';
import { installOriginalSoftShadows } from '../lib/original-soft-shadows.js';

export async function startRoomtone({ signal, assetBase = '' }) {
const parentSignal = signal, lifecycle = new AbortController(); signal = lifecycle.signal;
const disposables = new Set(), timers = new Set(), rafs = new Set();
let stopped = false, loopId = 0, uiDirty = true, shadowDirty = true, animatedScene = true;
let renderedFrames = 0, shadowUpdates = 0, batchedMeshes = 0;
const geometryCache = createGeometryCache(); disposables.add(geometryCache);
disposables.add(installOriginalSoftShadows());
const addEventListener = (type, callback, options) => window.addEventListener(type, callback, typeof options === 'boolean' ? { capture: options, signal } : { ...options, signal });
const removeEventListener = (type, callback, options) => window.removeEventListener(type, callback, options);
const setTimeout = (callback, delay) => { const handle = window.setTimeout(() => { timers.delete(handle); if (!stopped) { callback(); invalidate(); } }, delay); timers.add(handle); return handle; };
const clearTimeout = handle => { window.clearTimeout(handle); timers.delete(handle); };
const requestAnimationFrame = callback => { const handle = window.requestAnimationFrame(now => { rafs.delete(handle); if (!stopped) callback(now); }); rafs.add(handle); return handle; };
function invalidate() { uiDirty = true; if (!stopped && !document.hidden && !loopId) loopId = requestAnimationFrame(loop); }
function stop() {
  if (stopped) return;
  stopped = true;
  lifecycle.abort(); parentSignal.removeEventListener('abort', stop);
  for (const handle of timers) window.clearTimeout(handle);
  for (const handle of rafs) window.cancelAnimationFrame(handle);
  timers.clear(); rafs.clear();
  for (const resource of disposables) resource.dispose();
  disposables.clear();
  delete window.__api; delete document.body.dataset.ready;
  document.body.classList.remove('night'); document.body.removeAttribute('aria-busy');
}
signal.addEventListener('abort', stop, { once: true });
parentSignal.addEventListener('abort', stop, { once: true });
if (parentSignal.aborted) { stop(); return stop; }
window.roomtoneLoadStarted = performance.now();
const $ = s => document.querySelector(s);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const ss = (a, b, x) => { x = clamp((x - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
const lerp = (a, b, t) => a + (b - a) * t;
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
try { await Promise.all([document.fonts.load('500 13px Geist'), document.fonts.load('400 26px "Instrument Serif"')]); } catch (e) { }
if (signal.aborted) return stop;

/* ───────────────────────── finishes ───────────────────────── */
const MATS = {
  honey: { n: 'Honey oak', c: 'wood', a: '#dcc198', b: '#c4a273', w: .85, l: .72 },
  whiteoak: { n: 'White oak', c: 'wood', a: '#eadab9', b: '#d6c29c', w: .55, l: .88 },
  walnut: { n: 'Walnut', c: 'wood', a: '#935531', b: '#6b3a1f', w: .9, l: .42 },
  smoked: { n: 'Smoked oak', c: 'wood', a: '#7b5b41', b: '#59402c', w: .55, l: .28 },
  blackash: { n: 'Black ash', c: 'wood', a: '#3b3835', b: '#252321', w: .2, l: .1 },
  travertine: { n: 'Travertine', c: 'stone', a: '#dccdb4', b: '#bfae93', w: .6, l: .78 },
  concrete: { n: 'Concrete', c: 'stone', a: '#b7b6b2', b: '#8f8f8c', w: .2, l: .62 },
  marble: { n: 'Carrara marble', c: 'stone', a: '#eeedea', b: '#9ea3ab', w: .15, l: .92 },
  terrazzo: { n: 'Terrazzo', c: 'stone', a: '#e6dfd2', b: '#b3765a', w: .45, l: .8 },
  slate: { n: 'Slate', c: 'stone', a: '#434a55', b: '#2c323b', w: .1, l: .25 },
  linen: { n: 'Linen', c: 'fabric', a: '#ebe5d9', b: '#d6cfc0', w: .5, l: .9 },
  boucle: { n: 'Bouclé', c: 'fabric', a: '#efece5', b: '#d4d0c7', w: .55, l: .92 },
  greywool: { n: 'Grey wool', c: 'fabric', a: '#c8ccd3', b: '#a9aeb8', w: .15, l: .75 },
  oatknit: { n: 'Oat knit', c: 'fabric', a: '#e7e0d0', b: '#c9c0ab', w: .6, l: .86 },
  navy: { n: 'Navy velvet', c: 'fabric', a: '#2c3f7d', b: '#1f2d5c', w: .05, l: .2 },
  ochre: { n: 'Ochre velvet', c: 'fabric', a: '#e9b445', b: '#cf9830', w: .9, l: .65 },
  rust: { n: 'Rust wool', c: 'fabric', a: '#e18b4f', b: '#c06c36', w: .95, l: .55 },
  cognac: { n: 'Cognac leather', c: 'fabric', a: '#e08632', b: '#c06a22', w: .95, l: .5 },
  moss: { n: 'Moss wool', c: 'fabric', a: '#7f8c63', b: '#66734c', w: .45, l: .5 },
  blush: { n: 'Blush linen', c: 'fabric', a: '#e4c3b5', b: '#d2ab9b', w: .8, l: .8 },
  teal: { n: 'Teal velvet', c: 'fabric', a: '#2f6d70', b: '#225356', w: .1, l: .32 },
  charcoal: { n: 'Charcoal felt', c: 'fabric', a: '#3b3e46', b: '#2b2e35', w: .1, l: .15 },
  sand: { n: 'Sand limewash', c: 'paint', a: '#ead2a4', b: '#d9bd8a', w: .85, l: .8 },
  chalk: { n: 'Chalk white', c: 'paint', a: '#f1eee8', b: '#e2ded6', w: .4, l: .95 },
  ink: { n: 'Ink blue', c: 'paint', a: '#4a5674', b: '#3b4662', w: .05, l: .22 },
  sage: { n: 'Sage', c: 'paint', a: '#aab69b', b: '#96a388', w: .35, l: .65 },
  clay: { n: 'Clay pink', c: 'paint', a: '#dcb6a2', b: '#c99f8a', w: .8, l: .75 },
  forest: { n: 'Forest green', c: 'paint', a: '#46594a', b: '#38493c', w: .25, l: .3 },
  terracotta: { n: 'Terracotta', c: 'paint', a: '#c8785a', b: '#b06346', w: .95, l: .5 },
};
const CATS = { wood: 'Timber', stone: 'Stone', fabric: 'Textile', paint: 'Paint' };

MATS.graphite = { n: 'Graphite', c: 'paint', a: '#2a2b2f', b: '#1f2023', w: .2, l: .12 };
MATS.silver = { n: 'Silver', c: 'paint', a: '#bfc2c6', b: '#aeb2b8', w: .3, l: .72 };
MATS.bone = { n: 'Bone', c: 'paint', a: '#e6dfd1', b: '#d8d0c0', w: .55, l: .88 };
/* wallpapers, tiles, brick and panelling: drawn here, the same way as the other finishes */
CATS.paper = 'Wallpaper'; CATS.tile = 'Tile';
Object.assign(MATS, {
  stripe: { n: 'Sage stripe', c: 'paper', a: '#e9e1cf', b: '#a9b593', w: .5, l: .8 }, botanic: { n: 'Botanical', c: 'paper', a: '#24402f', b: '#6c9a6b', w: .3, l: .25 },
  deco: { n: 'Deco arches', c: 'paper', a: '#efe6d3', b: '#c27f5c', w: .75, l: .82 }, linenp: { n: 'Grasscloth', c: 'paper', a: '#d8ccb4', b: '#bfae8f', w: .7, l: .72 },
  subway: { n: 'White subway', c: 'tile', a: '#f4f2ee', b: '#c9c6c0', w: .4, l: .92 }, zellige: { n: 'Green zellige', c: 'tile', a: '#2f6b55', b: '#d5dbd4', w: .3, l: .35 },
  checker: { n: 'Checkerboard', c: 'tile', a: '#ece9e2', b: '#2a2b2e', w: .4, l: .55 }, hex: { n: 'Terracotta hex', c: 'tile', a: '#c06a45', b: '#dccfc0', w: .9, l: .5 },
  brick: { n: 'Red brick', c: 'stone', a: '#9a4f37', b: '#cfc6b8', w: .85, l: .4 }, whitebrick: { n: 'Painted brick', c: 'stone', a: '#ece8e0', b: '#cbc5ba', w: .5, l: .9 },
  panel: { n: 'Oak panelling', c: 'wood', a: '#d9c19a', b: '#a9875c', w: .75, l: .7 },
});
const DRAW = {
  stripe: (g, S, m) => { g.fillStyle = m.a; g.fillRect(0, 0, S, S); for (let x = 0; x < S; x += 32) { g.fillStyle = m.b; g.fillRect(x + 5, 0, 11, S); g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(x + 18, 0, 2, S); } },
  botanic: (g, S, m) => { g.fillStyle = m.a; g.fillRect(0, 0, S, S); for (let i = 0; i < 70; i++) { const x = rnd() * S, y = rnd() * S, a = rnd() * 6.28, L = 14 + rnd() * 16; for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { g.save(); g.translate(x + ox, y + oy); g.rotate(a);
      g.fillStyle = `hsl(${118 + rnd() * 30},${28 + rnd() * 20}%,${30 + rnd() * 22}%)`; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(L * .5, -L * .38, L, 0); g.quadraticCurveTo(L * .5, L * .38, 0, 0); g.fill(); g.strokeStyle = 'rgba(20,40,28,.5)'; g.lineWidth = .8; g.beginPath(); g.moveTo(0, 0); g.lineTo(L, 0); g.stroke(); g.restore(); } } },
  deco: (g, S, m) => { g.fillStyle = m.a; g.fillRect(0, 0, S, S); g.strokeStyle = m.b; g.lineWidth = 2.2; for (let y = 0; y <= S; y += 32) for (let x = (y / 32 % 2) * 32 - 32; x <= S + 32; x += 64) for (const r of [28, 20, 12]) { g.beginPath(); g.arc(x + 32, y + 32, r, Math.PI, 0); g.stroke(); } },
  linenp: (g, S, m) => { g.fillStyle = m.a; g.fillRect(0, 0, S, S); for (let y = 0; y < S; y += 2) { g.fillStyle = `rgba(${rnd() < .5 ? '255,255,255' : '120,100,70'},${.06 + rnd() * .1})`; g.fillRect(0, y, S, 1); } for (let i = 0; i < 300; i++) { g.fillStyle = 'rgba(110,90,60,.12)'; g.fillRect(rnd() * S, rnd() * S, 1, 4 + rnd() * 18); } },
  subway: (g, S, m) => { g.fillStyle = m.b; g.fillRect(0, 0, S, S); for (let r = 0; r < S / 16; r++) for (let c = -1; c < S / 32 + 1; c++) { const x = c * 32 + (r % 2) * 16, y = r * 16, gr = g.createLinearGradient(x, y, x, y + 16); gr.addColorStop(0, '#fbfaf7'); gr.addColorStop(1, m.a); g.fillStyle = gr; g.fillRect(x + 1, y + 1, 30, 14); } },
  zellige: (g, S, m) => { g.fillStyle = m.b; g.fillRect(0, 0, S, S); for (let r = 0; r < S / 21.33; r++) for (let c = 0; c < S / 21.33; c++) { const k = .8 + rnd() * .45, cc = new THREE.Color(m.a).multiplyScalar(k); g.fillStyle = '#' + cc.getHexString(); g.fillRect(c * 21.33 + 1, r * 21.33 + 1, 19.3, 19.3); g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(c * 21.33 + 3, r * 21.33 + 3, 6, 3); } },
  checker: (g, S, m) => { for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { g.fillStyle = (r + c) % 2 ? m.b : m.a; g.fillRect(c * 64, r * 64, 64, 64); } g.strokeStyle = 'rgba(120,115,105,.35)'; g.lineWidth = 1; for (let i = 0; i <= S; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, S); g.moveTo(0, i); g.lineTo(S, i); g.stroke(); } },
  hex: (g, S, m) => { g.fillStyle = m.b; g.fillRect(0, 0, S, S); const R = 16, w = Math.sqrt(3) * R; for (let r = -1; r < S / (R * 1.5) + 1; r++) for (let c = -1; c < S / w + 1; c++) { const x = c * w + (r % 2 ? w / 2 : 0), y = r * R * 1.5, k = .82 + rnd() * .3, cc = new THREE.Color(m.a).multiplyScalar(k);
      g.fillStyle = '#' + cc.getHexString(); g.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; g.lineTo(x + Math.cos(a) * (R - 1.3), y + Math.sin(a) * (R - 1.3)); } g.fill(); } },
  brick: (g, S, m) => { g.fillStyle = m.b; g.fillRect(0, 0, S, S); const bw = 32, bh = 10.67; for (let r = 0; r < S / bh; r++) for (let c = -1; c < S / bw + 1; c++) { const x = c * bw + (r % 2) * bw / 2, y = r * bh, k = .78 + rnd() * .4, cc = new THREE.Color(m.a).multiplyScalar(k); g.fillStyle = '#' + cc.getHexString(); g.fillRect(x + 1.2, y + 1.2, bw - 2.4, bh - 2.4);
      for (let i = 0; i < 4; i++) { g.fillStyle = `rgba(${rnd() < .5 ? '255,255,255' : '0,0,0'},.08)`; g.fillRect(x + 2 + rnd() * (bw - 6), y + 2 + rnd() * (bh - 5), 2, 2); } } },
  whitebrick: (g, S, m) => DRAW.brick(g, S, { ...m, a: '#ede9e1' }),
  panel: (g, S, m) => { g.fillStyle = m.a; g.fillRect(0, 0, S, S); for (let x = 0; x < S; x += 32) { for (let i = 0; i < 14; i++) { g.strokeStyle = `rgba(150,110,70,${.08 + rnd() * .14})`; g.lineWidth = .6 + rnd(); const xx = x + 3 + rnd() * 26; g.beginPath(); g.moveTo(xx, 0); g.bezierCurveTo(xx + 3, S * .3, xx - 3, S * .6, xx + 1, S); g.stroke(); }
      g.fillStyle = 'rgba(70,48,28,.55)'; g.fillRect(x, 0, 2, S); g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(x + 2, 0, 1, S); } },
};

const T0 = 5.5, T1 = 23.5;
/* procedural textures ───────────────────────── */
const TEX = {}, THUMB = {};
function hexA(h, a) { const c = new THREE.Color(h); return `rgba(${c.r * 255 | 0},${c.g * 255 | 0},${c.b * 255 | 0},${a})`; }
function drawMat(id, S = 256) {
  const m = MATS[id], cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d');
  seed = 11 + id.length * 97 + id.charCodeAt(0) * 13;
  g.fillStyle = m.a; g.fillRect(0, 0, S, S);
  const blot = (n, r0, r1, col, al) => { for (let i = 0; i < n; i++) { const x = rnd() * S, y = rnd() * S, r = r0 + rnd() * (r1 - r0); for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r); gr.addColorStop(0, hexA(col, al)); gr.addColorStop(1, hexA(col, 0)); g.fillStyle = gr; g.fillRect(x + ox - r, y + oy - r, 2 * r, 2 * r); } } };
  if (DRAW[id]) DRAW[id](g, S, m);
  else if (m.c === 'wood') {
    for (let i = 0; i < 26; i++) { g.fillStyle = hexA(rnd() < .5 ? m.b : '#ffffff', .03 + rnd() * .06); const y = rnd() * S; g.fillRect(0, y, S, 3 + rnd() * 14); }
    for (let i = 0; i < 56; i++) { const y0 = rnd() * S, amp = 1 + rnd() * 2.5, ph = rnd() * 6.28, k = 1 + (rnd() * 2 | 0); g.strokeStyle = hexA(m.b, .12 + rnd() * .3); g.lineWidth = .6 + rnd() * 1.3; g.beginPath(); for (let x = 0; x <= S; x += 8) g.lineTo(x, y0 + Math.sin(x / S * 6.283 * k + ph) * amp); g.stroke(); }
  } else if (m.c === 'paint') {
    blot(40, 40, 90, '#ffffff', .05); blot(40, 40, 90, m.b, id === 'sand' ? .09 : .07);
    for (let i = 0; i < 500; i++) { g.fillStyle = hexA(rnd() < .5 ? '#fff' : m.b, .05); g.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 10, 1); }
  } else if (id === 'concrete') {
    blot(50, 20, 80, '#ffffff', .12); blot(60, 20, 80, m.b, .17);
    for (let i = 0; i < 260; i++) { g.fillStyle = hexA(rnd() < .4 ? '#fff' : '#55595e', .16); g.beginPath(); g.arc(rnd() * S, rnd() * S, .4 + rnd() * 1.3, 0, 7); g.fill(); }
  } else if (id === 'travertine') {
    for (let i = 0; i < 60; i++) { g.fillStyle = hexA(rnd() < .5 ? m.b : '#fff', .08 + rnd() * .14); g.fillRect(0, rnd() * S, S, 1 + rnd() * 7); }
    for (let i = 0; i < 120; i++) { g.fillStyle = hexA('#8f7c62', .3); g.fillRect(rnd() * S, rnd() * S, 2 + rnd() * 7, 1 + rnd()); }
  } else if (id === 'marble') {
    blot(20, 30, 90, m.b, .12);
    for (let i = 0; i < 9; i++) { let x = rnd() * S, y = rnd() * S; g.strokeStyle = hexA('#7d848f', .2 + rnd() * .3); g.lineWidth = .5 + rnd() * 1.6; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 16; k++) { x += 10 + rnd() * 14; y += (rnd() - .35) * 22; g.lineTo(x, y); } g.stroke(); }
  } else if (id === 'terrazzo') {
    const cs = ['#b3765a', '#7c8a94', '#d8b98a', '#4a4f58', '#f6f3ec', '#c59a84'];
    for (let i = 0; i < 230; i++) { g.fillStyle = cs[rnd() * cs.length | 0]; g.save(); g.translate(rnd() * S, rnd() * S); g.rotate(rnd() * 6); g.beginPath(); const r = 2 + rnd() * 6; g.moveTo(-r, -r * .5); g.lineTo(r * .7, -r * .8); g.lineTo(r, r * .4); g.lineTo(-r * .4, r * .8); g.fill(); g.restore(); }
  } else if (id === 'slate') {
    for (let i = 0; i < 80; i++) { g.fillStyle = hexA(rnd() < .5 ? '#6a7380' : '#1c2027', .1 + rnd() * .15); g.fillRect(rnd() * S - 40, rnd() * S, 40 + rnd() * 160, 1 + rnd() * 4); }
  } else if (id === 'linen' || id === 'blush') {
    for (let i = 0; i < S; i += 2) { g.fillStyle = hexA(rnd() < .5 ? m.b : '#fff', .1 + rnd() * .18); g.fillRect(0, i, S, 1); g.fillStyle = hexA(rnd() < .5 ? m.b : '#fff', .08 + rnd() * .14); g.fillRect(i, 0, 1, S); }
  } else if (id === 'boucle') {
    for (let i = 0; i < 2600; i++) { g.strokeStyle = hexA(rnd() < .55 ? '#ffffff' : m.b, .5); g.lineWidth = 1.2; g.beginPath(); g.arc(rnd() * S, rnd() * S, 1.5 + rnd() * 2.6, rnd() * 6, rnd() * 6 + 3.5); g.stroke(); }
  } else if (id === 'greywool') {
    blot(30, 20, 60, '#ffffff', .12);
    for (let i = 0; i < S; i += 16) { g.fillStyle = hexA('#8d93a0', .5); g.fillRect(0, i, S, 1); g.fillRect(i, 0, 1, S); }
    for (let i = 0; i < 900; i++) { g.fillStyle = hexA(rnd() < .5 ? '#fff' : '#8d93a0', .15); g.fillRect(rnd() * S, rnd() * S, 2, 1); }
  } else if (id === 'oatknit') {
    for (let r = 0; r < 9; r++) for (let c = -1; c < 5; c++) { const x = c * 64 + (r % 2) * 32, y = r * 32 - 6; g.strokeStyle = hexA(m.b, .3); g.lineWidth = 5; g.beginPath(); g.arc(x + 32, y + 4, 26, .25, Math.PI - .25); g.stroke(); g.strokeStyle = hexA('#ffffff', .5); g.lineWidth = 3; g.beginPath(); g.arc(x + 32, y, 26, .25, Math.PI - .25); g.stroke(); }
  } else if (id === 'navy' || id === 'ochre' || id === 'teal') {
    blot(26, 30, 90, '#ffffff', .07); blot(26, 30, 90, m.b, .35);
    for (let i = 0; i < 1500; i++) { g.fillStyle = hexA(rnd() < .5 ? '#fff' : '#000', .035); g.fillRect(rnd() * S, rnd() * S, 1, 2); }
  } else if (id === 'rust' || id === 'cognac' || id === 'moss') {
    for (let i = 0; i < 1500; i++) { g.fillStyle = hexA(rnd() < .5 ? m.b : '#ffd2a6', .28); g.beginPath(); g.ellipse(rnd() * S, rnd() * S, 1 + rnd() * 3.5, 1 + rnd() * 2, rnd() * 3, 0, 7); g.fill(); }
  } else {
    blot(30, 20, 70, '#ffffff', .05);
    for (let i = 0; i < 2500; i++) { g.fillStyle = hexA(rnd() < .5 ? '#fff' : '#000', .06); g.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 2, 1); }
  }
  return cv;
}
for (const id in MATS) {
  const cv = drawMat(id); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; TEX[id] = t;
  const th = document.createElement('canvas'); th.width = th.height = 132; const g = th.getContext('2d');
  if (id === 'walnut' || id === 'smoked') g.filter = 'brightness(1.16) saturate(1.1)'; g.drawImage(cv, 0, 0, 200, 200, 0, 0, 132, 132); g.filter = 'none';
  const gr = g.createLinearGradient(0, 0, 132, 132); gr.addColorStop(0, 'rgba(255,255,255,.16)'); gr.addColorStop(.5, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(0,0,0,.14)'); g.fillStyle = gr; g.fillRect(0, 0, 132, 132);
  THUMB[id] = `url(${th.toDataURL('image/jpeg', .9)})`;
}
const TS = 1 / 1.5;  // one texture tile per 1.5 m


const ROUGH = { wood: .6, stone: .45, fabric: .95, paint: .88, paper: .9, tile: .28 };

/* ───────────────────────── renderer / scene ───────────────────────── */
const canvas = $('#gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: false }); disposables.add(renderer);
// Basic depth storage plus the original PCFSoft filter preserves r170's shadow appearance.
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.BasicShadowMap; renderer.shadowMap.autoUpdate = false;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
const scene = new THREE.Scene(); scene.background = new THREE.Color('#e9e4db'); scene.fog = new THREE.Fog('#e9e4db', 60, 170);
const camera = new THREE.PerspectiveCamera(30, 16 / 9, 2, 400);
const A = new THREE.Group(); scene.add(A);           // the apartment: x 0..W, z 0..D, recentred per plan
const GY = -.6; let focusOn = false;
const ground = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshStandardMaterial({ color: '#d8d2c7', roughness: .95 })); ground.rotation.x = -Math.PI / 2; ground.position.y = GY; ground.receiveShadow = true; scene.add(ground);
const shadowFloor = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.ShadowMaterial({ color: '#2a1d12', opacity: .3 })); shadowFloor.rotation.x = -Math.PI / 2; shadowFloor.position.y = GY; shadowFloor.receiveShadow = true; shadowFloor.visible = false; scene.add(shadowFloor);   // focus view: a plain backdrop that still catches the room's shadow
{ // soft image-based light: a warm room-tone dome, so glossy finishes have something to reflect
  const pm = new THREE.PMREMGenerator(renderer), es = new THREE.Scene(), g = new THREE.SphereGeometry(10, 32, 16), p = g.attributes.position, col = [], top = new THREE.Color('#fff4e6'), mid = new THREE.Color('#e6ddd0'), low = new THREE.Color('#5a4c3f');
  for (let i = 0; i < p.count; i++) { const y = p.getY(i) / 10, c = y > 0 ? mid.clone().lerp(top, y) : mid.clone().lerp(low, -y); col.push(c.r, c.g, c.b); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); const dome = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide }); es.add(new THREE.Mesh(g, dome)); const env = pm.fromScene(es, .03); disposables.add(env); scene.environment = env.texture; scene.environmentIntensity = .38; pm.dispose(); g.dispose(); dome.dispose(); }

/* surface finish with a diagonal sweep between the old and the new texture */
const wipes = [];
function surfMat(id, kind) {
  const m = new THREE.MeshStandardMaterial({ map: TEX[id], roughness: ROUGH[MATS[id].c], metalness: 0 });
  const U = { uMap2: { value: TEX[id] }, uWC: { value: new THREE.Vector3() }, uWR: { value: 1e3 }, uSeamA: { value: 0 }, uSeamB: { value: 0 } };
  const seam = i => kind !== 'floor' || DRAW[i] ? 0 : MATS[i].c === 'wood' ? 1 : MATS[i].c === 'stone' ? 2 : 0;
  U.uSeamA.value = U.uSeamB.value = seam(id);
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP=(modelMatrix*vec4(transformed,1.)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vWP; uniform sampler2D uMap2; uniform vec3 uWC; uniform float uWR,uSeamA,uSeamB;
      float seamF(float mode){ if(mode<.5) return 1.;
        if(mode<1.5){ float px=vWP.x/.235; float id=floor(px); float fx=fract(px); float h=fract(sin(id*91.7)*43758.5);
          float pz=vWP.z/1.7+h*7.; float fz=fract(pz); float h2=fract(sin((id+floor(pz)*17.3)*12.9898)*43758.5);
          float s=smoothstep(0.,.035,min(fx,1.-fx))*smoothstep(0.,.006,min(fz,1.-fz)); return mix(.78,1.,s)*(.86+.26*h2); }
        vec2 q=fract(vWP.xz/.95+.37); float s=smoothstep(0.,.014,min(min(q.x,1.-q.x),min(q.y,1.-q.y))); return mix(.66,1.,s); }`)
      .replace('#include <map_fragment>', `vec3 tA=texture2D(map,vMapUv).rgb*seamF(uSeamA); vec3 tB=texture2D(uMap2,vMapUv).rgb*seamF(uSeamB);
      float dW=abs(dot(vWP-uWC,vec3(.8,.25,.55)))+fract(sin(floor(vWP.x*3.)+floor(vWP.z*3.)*7.)*43.7)*.5; float mW=smoothstep(uWR,uWR-.5,dW); diffuseColor.rgb*=mix(tB,tA,mW);`);
  };
  m.userData.set = (i, at, instant) => { U.uMap2.value = m.map; m.map = TEX[i]; m.roughness = ROUGH[MATS[i].c]; U.uSeamB.value = U.uSeamA.value; U.uSeamA.value = seam(i); if (instant || !at) { U.uWR.value = 1e3; return; } U.uWC.value.copy(at); U.uWR.value = 0; if (!wipes.includes(U)) wipes.push(U); };
  return m;
}
const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: .8, ...o });
const X = {
  shell: std('#d6d0c5', { roughness: .9 }), cap: std('#efeae2', { roughness: .9 }), base: std('#b9a78c', { roughness: .8 }),
  black: std('#16171a', { roughness: .45, metalness: .3 }), white: std('#ece9e3'), cream: std('#e6dfd0', { roughness: .95 }), ceramic: std('#ebe6dc', { roughness: .35 }), porcelain: std('#f4f3ef', { roughness: .18 }),
  vaseDark: std('#2b2d33', { roughness: .4 }), terra: std('#b65c3c'), leaf: std('#1f4a2c', { roughness: .6, side: THREE.DoubleSide }), leaf2: std('#2c5a35', { roughness: .6, side: THREE.DoubleSide }), stem: std('#3b3a26'), soil: std('#2a2018'),
  glass: new THREE.MeshStandardMaterial({ color: '#4a5873', roughness: .7, transparent: true, opacity: .86 }),
  clear: new THREE.MeshStandardMaterial({ color: '#cfe0e6', roughness: .1, transparent: true, opacity: .28, side: THREE.DoubleSide }),
  mirror: std('#c9d6dc', { roughness: .12, metalness: .55 }), chrome: std('#c9ccd2', { roughness: .25, metalness: .8 }), steel: std('#a9adb3', { roughness: .4, metalness: .6 }),
  shade: new THREE.MeshStandardMaterial({ color: '#efe6d2', emissive: '#ffb86a', emissiveIntensity: 0, roughness: .9 }),
  screen: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 1.8, 2.8) }), tv: std('#0c0d10', { roughness: .15 }), paper: std('#f1ede4'), water: std('#bcd6dc', { roughness: .08 }),
  frame: new THREE.MeshStandardMaterial({ map: TEX.graphite, roughness: .5 }),
};
const BOOKC = ['#2a2e3a', '#e9e2d3', '#b5543a', '#7b8998', '#c9a56a', '#1f2430', '#8e3b2c'].map(c => std(c));
function scaleUV(g, w, h, d) { const uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]; for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) * dims[f][0] * TS, uv.getY(k) * dims[f][1] * TS); } }
function put(m, p, x, y, z, o) { m.position.set(x, y, z); if (o.ry) m.rotation.y = o.ry; if (o.rx) m.rotation.x = o.rx; if (o.rz) m.rotation.z = o.rz; m.castShadow = !o.noCast; m.receiveShadow = true; p.add(m); return m; }
// box / rounded box / cylinder by centre x,z and base y
function B(w, h, d, mat, x, y, z, p, o = {}) { const g = geometryCache.get(`B:${w},${h},${d}`, () => { const g = new THREE.BoxGeometry(w, h, d); scaleUV(g, w, h, d); return g; }); return put(new THREE.Mesh(g, mat), p, x, y + h / 2, z, o); }
function RB(w, h, d, r, mat, x, y, z, p, o = {}) { const g = geometryCache.get(`RB:${w},${h},${d},${r}`, () => { const g = new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - .001, h / 2 - .001, d / 2 - .001)); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.max(w, d) * TS, uv.getY(i) * Math.max(h, Math.min(w, d)) * TS); return g; }); return put(new THREE.Mesh(g, mat), p, x, y + h / 2, z, o); }
function C(rt, rb, h, mat, x, y, z, p, o = {}) { return put(new THREE.Mesh(geometryCache.get(`C:${rt},${rb},${h},${o.seg || 20}`, () => new THREE.CylinderGeometry(rt, rb, h, o.seg || 20)), mat), p, x, y + h / 2, z, o); }
function legs(p, w, d, h, mat, t = .045, inset = .04) { for (const sx of [-1, 1]) for (const sz of [-1, 1]) B(t, h, t, mat, sx * (w / 2 - inset), 0, sz * (d / 2 - inset), p); }
function vase(p, x, y, z, s = 1, mat = X.ceramic) { const pts = [[.0, 0], [.07, 0], [.1, .08], [.09, .2], [.04, .3], [.05, .36]].map(a => new THREE.Vector2(a[0] * s, a[1] * s)); return put(new THREE.Mesh(new THREE.LatheGeometry(pts, 16), mat), p, x, y, z, {}); }
function books(p, x0, x1, y, z, depth = .16) { let x = x0; while (x < x1 - .05) { const w = .028 + rnd() * .035, h = .17 + rnd() * .1; if (rnd() < .82) B(w, h, depth, BOOKC[rnd() * BOOKC.length | 0], x + w / 2, y, z, p, { rz: rnd() < .08 ? .2 : 0 }); x += w + .004 + (rnd() < .12 ? .08 : 0); } }
function leafMesh(l, w) { const g = new THREE.SphereGeometry(1, 8, 6); g.scale(w, .012, l / 2); g.translate(0, 0, l / 2); return g; }
const LEAF_A = leafMesh(.34, .13), LEAF_B = leafMesh(.5, .12);
function plant(p, kind, x, y, z, s = 1, pot = X.ceramic) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(s); p.add(g);
  if (pot) { C(.17, .13, .3, pot, 0, 0, 0, g); C(.15, .15, .02, X.soil, 0, .29, 0, g); }
  const y0 = pot ? .3 : 0;
  if (kind === 'fiddle') { C(.018, .028, 1.25, X.stem, 0, y0, 0, g, { seg: 6 }); for (let i = 0; i < 20; i++) { const m = new THREE.Mesh(LEAF_A, i % 3 ? X.leaf : X.leaf2); const a = i * 2.4, h = y0 + .45 + i * .048; m.position.set(Math.cos(a) * .02, h, Math.sin(a) * .02); m.rotation.set(-.35 - rnd() * .5, a, 0, 'YXZ'); m.scale.setScalar(.75 + rnd() * .5); m.castShadow = true; g.add(m); } }
  else if (kind === 'snake') { for (let i = 0; i < 9; i++) { const hh = .45 + rnd() * .5, m = new THREE.Mesh(new THREE.ConeGeometry(.045, hh, 4), i % 2 ? X.leaf : X.leaf2); m.scale.z = .25; const a = rnd() * 6.28; m.position.set(Math.cos(a) * .05, y0 + hh / 2 - .02, Math.sin(a) * .05); m.rotation.set((rnd() - .5) * .35, a, (rnd() - .5) * .35); m.castShadow = true; g.add(m); } }
  else { for (let i = 0; i < 7; i++) { const a = i * .9 + rnd() * .4, tilt = .25 + rnd() * .55, len = .55 + rnd() * .5; const st = new THREE.Group(); st.position.y = y0; st.rotation.set(0, a, 0); g.add(st); const s2 = new THREE.Group(); s2.rotation.x = tilt; st.add(s2); C(.008, .012, len, X.stem, 0, 0, 0, s2, { seg: 5 }); const m = new THREE.Mesh(LEAF_B, i % 2 ? X.leaf : X.leaf2); m.position.y = len - .05; m.rotation.x = -Math.PI / 2 + .5; m.castShadow = true; s2.add(m); } }
  return g;
}
function lampBody(p, x, y, z, s = 1) { C(.07 * s, .09 * s, .03, X.black, x, y, z, p); const b = new THREE.Mesh(new THREE.SphereGeometry(.085 * s, 14, 10), X.ceramic); b.scale.y = 1.15; put(b, p, x, y + .11 * s, z, {}); C(.012, .012, .12 * s, X.black, x, y + .18 * s, z, p, { seg: 6 }); C(.1 * s, .16 * s, .2 * s, X.shade, x, y + .28 * s, z, p, { noCast: true }); }

/* ───────────────────────── light ───────────────────────── */
const sun = new THREE.DirectionalLight('#fff', 3); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -.0004; sun.shadow.normalBias = .035; sun.shadow.radius = 5; scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight('#fff', '#333', 1); scene.add(hemi);
const fill = new THREE.DirectionalLight('#fff', .5); fill.position.set(-14, 16, 18); scene.add(fill);
function sunInfo(t) { const day = ss(5.6, 6.6, t) * (1 - ss(19.4, 20.4, t)); const isDay = t >= 6 && t < 20; const fr = isDay ? (t - 6) / 14 : (((t - 20) + 24) % 24) / 10; const e = Math.sin(Math.PI * clamp((t - 6) / 14, 0, 1)) * day; return { day, n: 1 - day, fr, e, th: Math.PI * clamp(fr, .02, .98) }; }
const cA = new THREE.Color(), cB = new THREE.Color(), v3 = new THREE.Vector3();
let lampF = 0; const LAMPS = [], OUTL = [];
function applyTime(t) {
  shadowDirty = true;
  const s = sunInfo(t), bg = scene.background, sn = Math.sin(s.th), cs = Math.cos(s.th);
  const dir = new THREE.Vector3(-cs, sn * sn * 1.35 + .035, -.75 * sn + .45 * Math.pow(Math.max(0, -cs), 3)).normalize();
  sun.target.position.set(0, 0, 0); sun.position.copy(dir).multiplyScalar(40);
  const warm = ss(.18, .82, s.e);
  cA.set('#ffb25c').lerp(cB.set('#fff3e2'), warm); cA.lerp(cB.set('#9fb6f2'), s.n); sun.color.copy(cA);
  sun.intensity = s.day * lerp(5.2, 2.9, warm) * (.25 + .75 * ss(0, .22, s.e)) + s.n * .62;
  cA.set('#9aa0d6').lerp(cB.set('#dfe7ff'), ss(.15, .7, s.e)); cA.lerp(cB.set('#6f80a8'), s.n); hemi.color.copy(cA);
  cA.set('#3a3038').lerp(cB.set('#a9a096'), ss(.1, .8, s.e)); cA.lerp(cB.set('#141a2a'), s.n); hemi.groundColor.copy(cA);
  hemi.intensity = (lerp(1.2, 1.3, ss(.1, .9, s.e)) * s.day + s.n * .55) * .82;
  fill.color.copy(hemi.color).lerp(cB.set('#ffe0bd'), s.n); fill.intensity = s.day * lerp(.25, .4, s.e) + s.n * .32;
  lampF = clamp(1 - ss(.38, .7, s.e), 0, 1);
  lampLevels(s);
  X.glass.color.set('#4a5873').lerp(cB.set('#1a2136'), s.n * .8 + (1 - s.e) * .2); X.glass.emissive.set('#ffb36b'); X.glass.emissiveIntensity = lampF * lerp(.25, .85, s.n);
  bg.set('#d9b9a0').lerp(cB.set('#e9e4db'), ss(.12, .6, s.e)); bg.lerp(cB.set('#111a2c'), s.n); scene.fog.color.copy(bg);
  ground.material.color.set('#d8d2c7').lerp(cB.set('#26304a'), s.n); grade.fsq.material.uniforms.uN.value = s.n; document.body.classList.toggle('night', s.n > .5); scene.environmentIntensity = lerp(.38, .1, s.n);
  ground.visible = !focusOn; shadowFloor.visible = focusOn; if (focusOn) { bg.set('#8d7c69').lerp(cB.set('#4a4037'), s.n * .85); scene.fog.color.copy(bg); }
  renderer.toneMappingExposure = lerp(1.0, 1.06, s.e) * lerp(1, 1.18, s.n);
}

let nightK = 0;
function lampLevels(s) { // each lamp: on / off / follow daylight, a brightness and a colour; screens are lamps that face the room
  if (s) nightK = s.n;
  for (const L of LAMPS) { const st = L.it.lamp || { on: 'auto', br: 1 }, on = st.on === true ? 1 : st.on === false ? 0 : (L.tv ? 0 : lampF), br = st.br == null ? 1 : st.br, col = L.tv ? '#9db6ff' : st.col || '#ffc48c';
    if (L.l) { L.l.intensity = L.I * on * br * lerp(.7, 1.6, nightK); L.l.color.set(col); }
    if (L.shade) { L.shade.emissiveIntensity = on * (L.tv ? 1.5 * br : br * lerp(1.3, 2.1, nightK)); if (!L.tv) L.shade.emissive.set(col).lerp(cB.set('#ffffff'), .2); } }
  X.shade.emissiveIntensity = lampF * lerp(1.3, 2.0, nightK);
  for (const l of OUTL) l.intensity = l.userData.I * lampF * lerp(.7, 1.5, nightK); if (POOLM) POOLM.tile.emissiveIntensity = lampF * lerp(.4, 1.1, nightK); if (typeof SITE !== 'undefined' && SITE.glow) SITE.glow.emissiveIntensity = lampF * lerp(1.6, 2.6, nightK);
}
/* ───────────────────────── camera ───────────────────────── */
let CAM0 = { az: -.5, el: .64, dist: 31, tx: .25, ty: .3, tz: .5 };
const cam = { ...CAM0 }, camG = { ...CAM0 };
function placeCamera() { const ce = Math.cos(cam.el); camera.position.set(cam.tx + cam.dist * ce * Math.sin(cam.az), cam.ty + cam.dist * Math.sin(cam.el), cam.tz + cam.dist * ce * Math.cos(cam.az)); camera.lookAt(cam.tx, cam.ty, cam.tz); camera.updateMatrixWorld(); }

/* ───────────────────────── post: scene → soft focus → bloom → output ───────────────────────── */
class DofPass extends Pass {
  constructor() {
    super(); this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4, depthTexture: new THREE.DepthTexture(4, 4) });
    this.mat = new THREE.ShaderMaterial({
      uniforms: { tC: { value: this.rt.texture }, tD: { value: this.rt.depthTexture }, uNF: { value: new THREE.Vector2(2, 400) }, uFocus: { value: 28 }, uRes: { value: new THREE.Vector2() }, uMax: { value: 9 } },
      vertexShader: 'varying vec2 vUv; void main(){vUv=uv; gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader: `varying vec2 vUv; uniform sampler2D tC,tD; uniform vec2 uNF,uRes; uniform float uFocus,uMax;
        float vz(vec2 u){ float d=texture2D(tD,u).x; float z=d*2.-1.; return 2.*uNF.x*uNF.y/(uNF.y+uNF.x-z*(uNF.y-uNF.x)); }
        float coc(float z){ float d=z-uFocus; return d>0.? smoothstep(5.5,30.,d)*(1.+.7*smoothstep(28.,55.,d)) : smoothstep(5.,17.,-d)*.75; }
        void main(){ float c0=coc(vz(vUv)); vec3 acc=texture2D(tC,vUv).rgb; float wsum=1.; float rad=c0*uMax;
          if(rad>.35){ for(int i=1;i<36;i++){ float fi=float(i); float r=sqrt(fi/36.)*rad; float a=fi*2.39996; vec2 o=vec2(cos(a),sin(a))*r/uRes; vec2 u=vUv+o;
            float cs=coc(vz(u)); float w=mix(clamp(cs*uMax/max(r,.5),0.,1.),1.,step(c0,cs)); vec3 s=min(texture2D(tC,u).rgb,vec3(12.)); acc+=s*w; wsum+=w; } }
          vec3 col=acc/wsum; vec2 q=vUv-.5; col*=1.-dot(q,q)*.16; gl_FragColor=vec4(col,1.); }` });
    this.fsq = new FullScreenQuad(this.mat);
  }
  setSize(w, h) { this.rt.setSize(w, h); this.mat.uniforms.uRes.value.set(w, h); this.mat.uniforms.uMax.value = h / 720 * 2.5; }
  render(r, wb) { r.setRenderTarget(this.rt); r.clear(); r.render(scene, camera); this.mat.uniforms.uFocus.value = cam.dist; r.setRenderTarget(this.renderToScreen ? null : wb); this.fsq.render(r); }
}

const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType }));
disposables.add({ dispose() { for (const pass of composer.passes) { pass.dispose?.(); pass.fsq?.material.dispose(); pass.fsq?.dispose(); } composer.dispose(); } });
const ao = new N8AOPass(scene, camera, 4, 4); ao.setQualityMode('High');
Object.assign(ao.configuration, { aoRadius: 1.8, distanceFalloff: 1.2, intensity: 4.5, color: new THREE.Color('#2b2016'), halfRes: true, depthAwareUpsampling: true, gammaCorrection: false, transparencyAware: false });
// N8AO 1.9 exposes the legacy MRT texture array; r187 expects the first attachment.
Object.defineProperty(ao.depthDownsampleTarget, 'texture', { get() { return this.textures[0]; } });
composer.addPass(ao);
composer.addPass(new UnrealBloomPass(new THREE.Vector2(4, 4), .22, .55, 1.12));
class GradePass extends Pass { constructor() { super(); this.fsq = new FullScreenQuad(new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null }, uN: { value: 0 } }, vertexShader: 'varying vec2 vUv; void main(){vUv=uv; gl_Position=vec4(position.xy,0.,1.);}',
  fragmentShader: 'varying vec2 vUv; uniform sampler2D tDiffuse; uniform float uN; void main(){ vec3 c=texture2D(tDiffuse,vUv).rgb; vec2 q=vUv-.5; c*=1.-dot(q,q)*(.3+.25*uN); c*=vec3(1.02,1.,.96); float l=dot(c,vec3(.2126,.7152,.0722)); float k=uN*.55*(1.-smoothstep(.015,.16,l)); c=mix(c,l*vec3(.72,.88,1.25),k); gl_FragColor=vec4(c,1.);}' })); }
  render(r, wb, rb) { this.fsq.material.uniforms.tDiffuse.value = rb.texture; r.setRenderTarget(this.renderToScreen ? null : wb); this.fsq.render(r); } }
const grade = new GradePass(); composer.addPass(grade);
composer.addPass(new OutputPass());
let VW = 1, VH = 1, UIS = 1; const DOCK = 0, VIEWX = 170;
function resize() {
  shadowDirty = uiDirty = true;
  VW = Math.max(1, innerWidth); VH = Math.max(1, innerHeight); const dpr = Math.min(devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr); renderer.setSize(VW, VH, false); composer.setPixelRatio(dpr); composer.setSize(VW, VH);
  camera.aspect = VW / VH; const base = 30 * Math.PI / 180, a0 = 16 / 9;
  camera.fov = (camera.aspect >= a0 ? base : 2 * Math.atan(Math.tan(base / 2) * a0 / camera.aspect)) * 180 / Math.PI; camera.updateProjectionMatrix();
  { const k = clamp(Math.min(VW / 1280, VH / 720), .7, 1.3); camera.setViewOffset(VW, VH, VIEWX * k, DOCK * k / 2, VW, VH); }
  UIS = clamp(Math.min(VW / 1280, VH / 720), .7, 1.3); const ui = $('#ui'); ui.style.transform = `scale(${UIS})`; ui.style.width = VW / UIS + 'px'; ui.style.height = VH / UIS + 'px';
}
addEventListener('resize', resize);

let focus = null;   // id of the room shown on its own, or null for the whole home
function inRoomXZ(id, x, z) { const r = P.rooms.find(r => r.id === id); return !!r && r.def.r.some(q => x >= q[0] - .05 && x <= q[2] + .05 && z >= q[1] - .05 && z <= q[3] + .05); }
function inFocus(it) { if (!focus) return true; if ((it.f || 0) !== lv) return false; const d = CAT[it.k]; return d.mount != null ? !!(P.walls[it.wall] && P.walls[it.wall].rooms[it.side] === focus) : inRoomXZ(focus, it.x, it.z); }
const TVTEX = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 144; const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 144); gr.addColorStop(0, '#0a1030'); gr.addColorStop(.5, '#28306a'); gr.addColorStop(.7, '#e48a4c'); gr.addColorStop(.76, '#3a2418'); gr.addColorStop(1, '#0d0a08'); g.fillStyle = gr; g.fillRect(0, 0, 256, 144); g.fillStyle = 'rgba(255,224,176,.95)'; g.beginPath(); g.arc(152, 100, 8, 0, 7); g.fill(); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();

/* ───────────────────────── floor plans ───────────────────────── */
// rooms: r = [[x0,z0,x1,z1],…]   walls: [x0,z0,x1,z1,[[kind,start,width],…]]   kinds: d door, w window, W tall window, s sliding glass
const PLANS = {
  studio: { n: 'Studio', W: 7.6, D: 6, H: 2.8,
    rooms: [{ id: 'main', n: 'Studio', t: 'living', r: [[0, 0, 5.3, 6], [5.3, 2.5, 7.6, 6]] }, { id: 'bath', n: 'Bathroom', t: 'bath', r: [[5.3, 0, 7.6, 2.5]] }],
    walls: [[0, 0, 7.6, 0, [['w', 1.2, 2.4], ['w', 5.95, .9]]], [7.6, 0, 7.6, 6, [['w', 3.4, 1.8]]], [0, 6, 7.6, 6, [['d', 5.6, .95]]], [0, 0, 0, 6, [['s', 1.6, 2.6]]], [5.3, 0, 5.3, 2.5, []], [5.3, 2.5, 7.6, 2.5, [['d', .5, .8]]]] },
  onebed: { n: 'One-bedroom', tag: 'furnished', W: 12, D: 8, H: 2.9,
    rooms: [{ id: 'bed', n: 'Bedroom', t: 'bedroom', r: [[0, 0, 4, 5]] }, { id: 'study', n: 'Study', t: 'bedroom', r: [[0, 5, 4, 8]] }, { id: 'living', n: 'Living room', t: 'living', r: [[4, 0, 12, 8]] }],
    walls: [[0, 0, 12, 0, [['w', 1.0, 2.0], ['s', 5.1, 3.0]]], [12, 0, 12, 8, [['w', 5.5, 1.9]]], [0, 8, 12, 8, [['w', 1.0, 2.0], ['d', 5.75, 1.0]]], [0, 0, 0, 8, [['w', 1.5, 2.0]]], [4, 0, 4, 8, [['d', 3.2, .9], ['d', 5.6, .9]]], [0, 5, 4, 5, []]],
    furn: [['sectional', 9, 4.95, Math.PI], ['coffeeR', 8.9, 3.2, 0], ['armchair', 10.85, 2.6, -1.27], ['sideT', 7.0, 5.0, 0], ['lamp', 7.0, 5.0, 0], ['diningQ', 9, 6.95, 0], ['chair', 9.55, 7.62, Math.PI], ['chair', 8.5, 7.62, Math.PI], ['chair', 9.1, 6.28, 0], ['chair', 7.65, 6.95, 1.57], ['pouf', 6.9, 2.4, 0],
      ['sideboard', 9.65, .37, 0], ['vase', 9.0, .37, 0], ['ceramics', 10.2, .37, 0], ['floorlamp', 11.45, .62, 0], ['bookshelf', 4.24, 7.1, 1.5708], ['rugO', 8.95, 3.3, 0], ['fiddle', 4.6, .6, 0], ['snake', 11.5, 4.6, 0],
      ['bed', 2.05, 1.27, 0], ['nightstand', .72, .37, 0], ['nightstand', 3.38, .37, 0], ['lamp', .72, .37, 0], ['lamp', 3.38, .37, 0], ['bench', 2.05, 2.75, 0], ['wardrobe', .47, 4.05, 1.5708], ['rugQ', 2.05, 2.5, 1.5708],
      ['desk', 1.4, 5.48, 0], ['laptop', 1.3, 5.48, 0], ['deskchair', 1.4, 6.3, 3.3], ['armchair', 3.0, 7.2, -2.3], ['bird', .5, 7.45, 0]],
    wallf: [['artL', 1, 1, 2.95, 1.15], ['artP', 1, 1, 4.4, 1.3], ['artL', 0, 0, 2.05, 1.4], ['shelves', 0, 0, 9.7, 1.35], ['slat', 1, 1, .95, 0], ['curtain', 0, 0, 4.82, 0], ['curtain', 0, 0, 8.38, 0], ['curtain', 1, 1, 5.2, 0]] },
  twobed: { n: 'Two-bedroom', W: 12.5, D: 9, H: 2.8,
    rooms: [{ id: 'bed1', n: 'Bedroom 1', t: 'bedroom', r: [[0, 0, 4.2, 4]] }, { id: 'bath', n: 'Bathroom', t: 'bath', r: [[4.2, 0, 6.6, 2.6]] }, { id: 'hall', n: 'Hall', t: 'hall', r: [[4.2, 2.6, 6.6, 4]] }, { id: 'bed2', n: 'Bedroom 2', t: 'bedroom', r: [[6.6, 0, 12.5, 4]] }, { id: 'living', n: 'Living room', t: 'living', r: [[0, 4, 7.6, 9]] }, { id: 'kitchen', n: 'Kitchen', t: 'kitchen', r: [[7.6, 4, 12.5, 9]] }],
    walls: [[0, 0, 12.5, 0, [['w', 1.1, 2.0], ['w', 5.0, .8], ['w', 8.4, 2.4]]], [12.5, 0, 12.5, 9, [['w', 1.1, 1.8], ['w', 5.6, 1.8]]], [0, 9, 12.5, 9, [['s', 1.6, 3.0], ['d', 8.6, 1.0]]], [0, 0, 0, 9, [['w', 1.0, 1.8], ['w', 5.4, 2.2]]],
      [0, 4, 4.2, 4, [['d', 3.0, .85]]], [4.2, 0, 4.2, 4, []], [6.6, 0, 6.6, 4, [['d', 2.9, .85]]], [4.2, 2.6, 6.6, 2.6, [['d', .8, .8]]], [6.6, 4, 12.5, 4, []]] },
  threebed: { n: 'Three-bedroom', W: 16, D: 10, H: 2.8,
    rooms: [{ id: 'bed1', n: 'Bedroom 1', t: 'bedroom', r: [[0, 0, 4.6, 4.2]] }, { id: 'bath', n: 'Bathroom', t: 'bath', r: [[4.6, 0, 7.2, 2.7]] }, { id: 'hall', n: 'Hall', t: 'hall', r: [[4.6, 2.7, 7.2, 4.2]] }, { id: 'bed2', n: 'Bedroom 2', t: 'bedroom', r: [[7.2, 0, 11.4, 4.2]] }, { id: 'bed3', n: 'Bedroom 3', t: 'bedroom', r: [[11.4, 0, 16, 4.2]] },
      { id: 'living', n: 'Living room', t: 'living', r: [[0, 4.2, 10.4, 10]] }, { id: 'kitchen', n: 'Kitchen', t: 'kitchen', r: [[10.4, 4.2, 13.5, 10], [13.5, 6.6, 16, 10]] }, { id: 'bath2', n: 'Ensuite', t: 'bath', r: [[13.5, 4.2, 16, 6.6]] }],
    walls: [[0, 0, 16, 0, [['w', 1.2, 2.0], ['w', 5.5, .8], ['w', 8.2, 2.2], ['w', 12.6, 2.2]]], [16, 0, 16, 10, [['w', 1.2, 1.8], ['w', 5.0, .8], ['w', 7.4, 1.8]]], [0, 10, 16, 10, [['s', 2.0, 3.2], ['d', 7.4, 1.0], ['w', 11.5, 2.2]]], [0, 0, 0, 10, [['w', 1.1, 1.8], ['w', 5.6, 2.6]]],
      [0, 4.2, 4.6, 4.2, [['d', 3.4, .85]]], [4.6, 0, 4.6, 4.2, []], [7.2, 0, 7.2, 4.2, [['d', 3.1, .85]]], [4.6, 2.7, 7.2, 2.7, [['d', .9, .8]]], [7.2, 4.2, 16, 4.2, [['d', 5.2, .85], ['d', 7.3, .8]]], [11.4, 0, 11.4, 4.2, []], [13.5, 4.2, 13.5, 6.6, []], [13.5, 6.6, 16, 6.6, []]] },
  loft: { n: 'Open loft', W: 14, D: 8.5, H: 3.4,
    rooms: [{ id: 'main', n: 'Loft', t: 'living', r: [[0, 0, 11.2, 8.5], [11.2, 2.8, 14, 8.5]] }, { id: 'bath', n: 'Bathroom', t: 'bath', r: [[11.2, 0, 14, 2.8]] }],
    walls: [[0, 0, 14, 0, [['W', .8, 2.2], ['W', 3.6, 2.2], ['W', 6.4, 2.2], ['w', 12.2, .9]]], [14, 0, 14, 8.5, [['W', 3.6, 2.0], ['W', 6.0, 2.0]]], [0, 8.5, 14, 8.5, [['d', 10.5, 1.0]]], [0, 0, 0, 8.5, [['W', 1.0, 2.4], ['W', 4.6, 2.4]]], [11.2, 0, 11.2, 2.8, []], [11.2, 2.8, 14, 2.8, [['d', .6, .8]]]] },
};
const PLAN_ORDER = ['studio', 'onebed', 'twobed', 'threebed', 'loft'];
const FLOOR0 = { garage: 'concrete', living: 'whiteoak', bedroom: 'whiteoak', kitchen: 'travertine', bath: 'terrazzo', hall: 'whiteoak' };
const planArea = p => p.rooms.reduce((a, r) => a + r.r.reduce((b, q) => b + (q[2] - q[0]) * (q[3] - q[1]), 0), 0);

let P = null;                  // the storey being edited: walls, rooms, collision solids
const LV = []; let lv = 0;     // every storey of the home, ground first; P === LV[lv]
const SURF = {}, SPICK = [];   // surface id → {mat, kind, room, n}; pickable surface meshes of the active storey
const levelOf = it => LV[it.f || 0] || LV[0];
function roomAt(x, z, L = P) { if (!L) return null; for (const r of L.rooms) for (const q of r.def.r) if (x >= q[0] && x <= q[2] && z >= q[1] && z <= q[3]) return r; return null; }
function roomById(id) { for (const L of LV) { const r = L.rooms.find(q => q.id === id); if (r) return r; } return null; }
function disposeTree(o) { o.traverse(m => { if (m.geometry && !m.geometry.userData.roomtoneShared && m.geometry !== LEAF_A && m.geometry !== LEAF_B) m.geometry.dispose(); }); }

/* custom layouts: rooms are rectangles on a grid, walls follow the room edges, openings sit on walls by position.
   layout = { H, rooms: [{ id, n, t, r: [[x0,z0,x1,z1],…] }], ops: [[kind, hz, c, u, width],…] }   (u = centre along the wall) */
const RT = { living: 'Living room', bedroom: 'Bedroom', kitchen: 'Kitchen', bath: 'Bathroom', hall: 'Hall', garage: 'Garage' };
function rectMinus(q, h) {
  if (h[0] >= q[2] - 1e-6 || h[2] <= q[0] + 1e-6 || h[1] >= q[3] - 1e-6 || h[3] <= q[1] + 1e-6) return [q];
  const o = [], z0 = Math.max(q[1], h[1]), z1 = Math.min(q[3], h[3]);
  if (h[1] > q[1]) o.push([q[0], q[1], q[2], h[1]]); if (h[3] < q[3]) o.push([q[0], h[3], q[2], q[3]]);
  if (h[0] > q[0]) o.push([q[0], z0, h[0], z1]); if (h[2] < q[2]) o.push([h[2], z0, q[2], z1]);
  return o.filter(r => r[2] - r[0] > .01 && r[3] - r[1] > .01);
}
function bbox(rooms) { let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (const r of rooms) for (const q of r.r) { x0 = Math.min(x0, q[0]); z0 = Math.min(z0, q[1]); x1 = Math.max(x1, q[2]); z1 = Math.max(z1, q[3]); } return x0 > x1 ? { x0: 0, z0: 0, x1: 12, z1: 8, empty: true } : { x0, z0, x1, z1 }; }
function layoutSubs(rooms, ops) {
  const R = v => Math.round(v * 1000) / 1000, lines = new Map(), subs = []; subs.used = new Set();
  const add = (hz, c, a, b) => { const k = (hz ? 'h' : 'v') + R(c); if (!lines.has(k)) lines.set(k, { hz, c: R(c), iv: [] }); lines.get(k).iv.push([R(a), R(b)]); };
  for (const r of rooms) for (const q of r.r) { add(true, q[1], q[0], q[2]); add(true, q[3], q[0], q[2]); add(false, q[0], q[1], q[3]); add(false, q[2], q[1], q[3]); }
  const at = (x, z) => { for (const r of rooms) for (const q of r.r) if (x > q[0] && x < q[2] && z > q[1] && z < q[3]) return r; return null; };
  for (const L of lines.values()) {
    const iv = L.iv.sort((p, q) => p[0] - q[0]), pts = new Set(); for (const [a, b] of iv) { pts.add(a); pts.add(b); }
    const runs = []; for (const [a, b] of iv) { const l = runs[runs.length - 1]; if (l && a <= l[1] + 1e-6) l[1] = Math.max(l[1], b); else runs.push([a, b]); }
    for (const [ra, rb] of runs) {
      const cs = [...pts].filter(v => v >= ra - 1e-6 && v <= rb + 1e-6).sort((p, q) => p - q), pcs = [];
      for (let j = 0; j < cs.length - 1; j++) { const a0 = cs[j], a1 = cs[j + 1], m = (a0 + a1) / 2; if (a1 - a0 < .01) continue;
        const r0 = L.hz ? at(m, L.c + .05) : at(L.c + .05, m), r1 = L.hz ? at(m, L.c - .05) : at(L.c - .05, m);
        pcs.push(r0 && r0 === r1 ? null : { hz: L.hz, c: L.c, a0, a1, ext: !(r0 && r1), nOut: !r0 ? 1 : !r1 ? -1 : 0, pi: -1 }); }
      pcs.forEach((p, j) => { if (!p) return; p.e0 = !pcs[j - 1]; p.e1 = !pcs[j + 1]; subs.push(p); });
    }
  }
  for (const p of subs) { p.ops = []; const len = p.a1 - p.a0;
    for (const o of ops) { const [k, hz, c, u, w] = o; if (!!hz !== p.hz || Math.abs(c - p.c) > .01 || u <= p.a0 || u >= p.a1 || w > len - .2 || (k === 'G' && !p.ext)) continue;
      p.ops.push([k, clamp(u - w / 2 - p.a0, .1, len - w - .1), w]); subs.used.add(o); }
    p.ops.sort((x, y) => x[1] - y[1]); }
  return subs;
}
function presetSubs(def, house) { // the five ready-made plans: walls as drawn, split wherever the room beside them changes
  const subs = []; def.walls.forEach((wd, pi) => { const hz = wd[1] === wd[3], c = hz ? wd[1] : wd[0], b0 = hz ? wd[0] : wd[1], b1 = hz ? wd[2] : wd[3], cuts = new Set([b0, b1]);
    for (const r of house) for (const q of r.r) { const on = hz ? (q[1] === c || q[3] === c) : (q[0] === c || q[2] === c); if (on) for (const v of hz ? [q[0], q[2]] : [q[1], q[3]]) if (v > b0 + .01 && v < b1 - .01) cuts.add(v); }
    const cs = [...cuts].sort((x, y) => x - y), ext = hz ? (c === 0 || c === def.D) : (c === 0 || c === def.W);
    for (let j = 0; j < cs.length - 1; j++) subs.push({ hz, c, a0: cs[j], a1: cs[j + 1], pi, e0: j === 0, e1: j === cs.length - 2, ext, nOut: ext ? (c === 0 ? -1 : 1) : 0, ops: wd[4].filter(o => b0 + o[1] >= cs[j] - .01 && b0 + o[1] < cs[j + 1] - .01).map(o => [o[0], b0 + o[1] - cs[j], o[2]]).sort((x, y) => x[1] - y[1]) }); });
  def.gwalls.forEach((wd, j) => { const hz = wd[1] === wd[3]; subs.push({ hz, c: hz ? wd[1] : wd[0], a0: hz ? wd[0] : wd[1], a1: hz ? wd[2] : wd[3], pi: 100 + j, e0: true, e1: true, ext: true, nOut: wd[5], ops: wd[4].map(o => [o[0], o[1], o[2]]) }); });
  return subs;
}
function groundSpec() {
  if (!state.lay) { const def = withGarage(PLANS[state.plan]); return { id: state.plan, pre: true, def, W: def.W, D: def.D, H: def.H, x0: -GW, z0: 0, hx0: 0, rooms: def.rooms, subs: presetSubs(def, PLANS[state.plan].rooms) }; }
  const L = state.lay, b = bbox(L.rooms); return { id: 'custom', W: b.x1, D: b.z1, H: L.H || 2.8, x0: b.x0, z0: b.z0, hx0: b.x0, rooms: L.rooms, subs: layoutSubs(L.rooms, L.ops) };
}
// the stairwell: the staircase footprint, cut out of the floor above
function stairHole() { const st = state.items.find(it => CAT[it.k].stairs && !(it.f > 0)); if (!st) return null; const cs = corners(obb(st, st.x, st.z, st.r, -.03)), h = [Math.min(...cs.map(p => p[0])), Math.min(...cs.map(p => p[1])), Math.max(...cs.map(p => p[0])), Math.max(...cs.map(p => p[1]))]; h.st = st; h.key = h.join() + (st.m ? 'm' : '') + st.r.toFixed(2); return h; }
function buildWorld(surf = {}) {
  shadowDirty = uiDirty = true;
  for (const c of [...A.children]) { disposeTree(c); A.remove(c); }
  for (const k in SURF) delete SURF[k]; SURF.ext = { mat: X.shell, kind: 'ext', n: 'Outside walls', def: 'bone' }; LAMPS.length = 0; OUTL.length = 0; focus = null; focusOn = false; LV.length = 0;
  const g = groundSpec(); STAIR_H = g.H + .3; buildLevel(g, 0, 0, surf);
  if (state.up) buildLevel({ id: 'up', W: g.W, D: g.D, H: g.H, x0: g.x0, z0: g.z0, hx0: g.hx0, rooms: state.up.rooms, subs: layoutSubs(state.up.rooms, state.up.ops) }, 1, g.H + .3, surf);
  if (lv >= LV.length) lv = 0; P = LV[lv]; syncPick(); levelVis();
  if (!build) recentre(); buildRoofs();
}
function recentre() { const g = LV[0].S; A.position.set(-(g.hx0 + g.W) / 2, 0, -(g.z0 + g.D) / 2); CAM0 = { az: -.5, el: .64, dist: (16 + 1.62 * Math.max(g.W - g.x0, (g.D - g.z0) * 1.3) + (LV[1] ? 2 : 0)) * 1.16, tx: 1.0 - (g.hx0 - g.x0) / 2, ty: .3 + P.y, tz: 1.5 }; }
function levelVis() { for (const L of LV) L.grp.visible = outside || L.L === lv || (L.L < lv && !focus); }
function syncPick() { SPICK.length = 0; if (P) for (const m of P.spick) SPICK.push(m); }
function buildLevel(S, L, y, surf) {
  const { W, D, H } = S, grp = new THREE.Group(); grp.position.y = y; A.add(grp);
  P = { id: S.id, L, S, def: S.def, W, D, H, x0: S.x0, z0: S.z0, y, walls: [], rooms: [], solids: [], spick: [], fl: [], slab: [], grp }; LV[L] = P;
  const arch = new THREE.Group(); grp.add(arch); P.arch = arch; P.items = new THREE.Group(); grp.add(P.items);
  if (L === 0 && S.pre) P.slab = [B(W + 1.2, .3, D + 1.2, X.cap, W / 2, -.3, D / 2, arch), B(W + 2.0, .3, D + 2.0, X.base, W / 2, -.6, D / 2, arch), B(GW + .6, .295, S.def.gd + .6, X.cap, -GW / 2, -.3, D - S.def.gd / 2, arch)];
  else if (L === 0) for (const r of S.rooms) for (const q of r.r) P.slab.push(B(q[2] - q[0] + 1.2, .3, q[3] - q[1] + 1.2, X.cap, (q[0] + q[2]) / 2, -.3, (q[1] + q[3]) / 2, arch), B(q[2] - q[0] + 2, .3, q[3] - q[1] + 2, X.base, (q[0] + q[2]) / 2, -.6, (q[1] + q[3]) / 2, arch));
  for (const rd of S.rooms) { const sid = 'f:' + rd.id; SURF[sid] = { mat: surfMat(surf[sid] || FLOOR0[rd.t], 'floor'), kind: 'floor', room: rd.id, n: rd.n + ' floor', def: FLOOR0[rd.t], L }; P.rooms.push({ def: rd, id: rd.id }); }
  S.subs.forEach((sd, i) => {
    const { hz, c, a0, a1, ops, ext } = sd, t = ext ? .26 : .12;
    const w = { i, pi: sd.pi, hz, c, a0, a1, t, ext, ops, up: true, mats: [], rooms: [], nOut: ext ? sd.nOut : 0 };
    const mid = (a0 + a1) / 2;
    for (const s of [0, 1]) { const o = (s ? -1 : 1) * (t / 2 + .2), r = hz ? roomAt(mid, c + o) : roomAt(c + o, mid); // a long wall can border several rooms: sample along it
      let room = r; if (!room) for (let u = a0 + .3; u < a1 && !room; u += .6) room = hz ? roomAt(u, c + o) : roomAt(c + o, u);
      if (room) { const sid = (L ? 'w' + L + ':' : 'w:') + i + ':' + s, m = surfMat(surf[sid] || 'chalk', 'wall'); m.userData.surf = sid; SURF[sid] = { mat: m, kind: 'wall', room: room.id, n: room.def.n + ' wall', def: 'chalk', wall: i, L }; w.mats[s] = m; w.rooms[s] = room.id; } else w.mats[s] = X.shell; }
    const arr = hz ? [X.cap, X.cap, X.cap, X.cap, w.mats[0], w.mats[1]] : [w.mats[0], w.mats[1], X.cap, X.cap, X.cap, X.cap];
    const seg = (g, u0, u1, y0, h) => { if (u1 - u0 < .01 || h < .01) return; const m = hz ? B(u1 - u0, h, t, arr, (u0 + u1) / 2, y0, c, g) : B(t, h, u1 - u0, arr, c, y0, (u0 + u1) / 2, g); m.userData.wsurf = [w.mats[0].userData.surf, w.mats[1].userData.surf]; P.spick.push(m); return m; };
    const fr = (g, u, y, lu, h, d = .07, mat = X.frame) => hz ? B(lu, h, d, mat, u, y, c, g, { noCast: true }) : B(d, h, lu, mat, c, y, u, g, { noCast: true });
    const full = new THREE.Group(), stub = new THREE.Group(), e = ext ? t / 2 : 0, e0 = sd.e0 ? e : 0, e1 = sd.e1 ? e : 0, hs = ext ? .7 : 1.0; let u = a0 - e0, us = a0 - e0;
    for (const [k, p, ow] of ops) {
      const o0 = a0 + p, o1 = o0 + ow; seg(full, u, o0, 0, H); u = o1;
      if (k === 'd' || k === 's' || k === 'G') { seg(stub, us, o0, 0, hs); if (us < o0) P.solids.push(hz ? [us, c - t / 2, o0, c + t / 2] : [c - t / 2, us, c + t / 2, o0]); us = o1; }
      const top = k === 'd' ? 2.1 : k === 's' || k === 'G' ? 2.3 : k === 'W' ? H - .4 : 2.25, sill = k === 'w' ? .85 : k === 'W' ? .35 : 0;
      seg(full, o0, o1, top, H - top); seg(full, o0, o1, 0, sill);
      fr(full, o0 + .025, sill, .05, top - sill, t + .02); fr(full, o1 - .025, sill, .05, top - sill, t + .02); fr(full, (o0 + o1) / 2, top - .05, ow, .05, t + .02); if (sill) fr(full, (o0 + o1) / 2, sill, ow, .04, t + .06, X.cap);
      if (k === 'G') { const gm = siteMats().gdoor; if (hz) { B(ow - .08, top - .04, .05, gm, (o0 + o1) / 2, 0, c + .03 * (sd.nOut || 1), full); for (let y = .42; y < top - .1; y += .42) B(ow - .1, .014, .07, X.steel, (o0 + o1) / 2, y, c + .03 * (sd.nOut || 1), full, { noCast: true }); } else { B(.05, top - .04, ow - .08, gm, c + .03 * (sd.nOut || 1), 0, (o0 + o1) / 2, full); for (let y = .42; y < top - .1; y += .42) B(.07, .014, ow - .1, X.steel, c + .03 * (sd.nOut || 1), y, (o0 + o1) / 2, full, { noCast: true }); } }
      else if (k === 'd') { const leaf = new THREE.Group(), lw = ow - .1; if (hz) leaf.position.set(o0 + .05, 0, c); else leaf.position.set(c, 0, o0 + .05); leaf.rotation.y = (hz ? 0 : -Math.PI / 2) + (ext ? 0 : hz ? -1.35 : -1.35); B(lw, 2.04, .04, X.frame, lw / 2, 0, 0, leaf); B(.02, .12, .07, X.chrome, lw - .08, 1.0, 0, leaf); full.add(leaf); }
      else { const n = k === 's' ? Math.max(2, Math.round(ow / .78)) : k === 'W' ? 2 : 1, pw = ow / n; for (let j = 0; j < n; j++) { const cu = o0 + (j + .5) * pw; if (j) fr(full, o0 + j * pw, sill, .04, top - sill); const gl = new THREE.Mesh(new THREE.PlaneGeometry(pw - .04, top - sill - .05), X.glass); gl.material.side = THREE.DoubleSide; if (hz) gl.position.set(cu, (top + sill) / 2, c); else { gl.position.set(c, (top + sill) / 2, cu); gl.rotation.y = Math.PI / 2; } full.add(gl); }
        if (k !== 's') fr(full, (o0 + o1) / 2, sill + (top - sill) * (k === 'W' ? .62 : .48), ow, .035, .06); }
    }
    seg(full, u, a1 + e1, 0, H); seg(stub, us, a1 + e1, 0, hs); P.solids.push(hz ? [us, c - t / 2, a1 + e1, c + t / 2] : [c - t / 2, us, c + t / 2, a1 + e1]);
    if (ext) { if (hz) B(a1 - a0 + e0 + e1 + .03, .05, t + .06, X.shell, mid + (e1 - e0) / 2, H, c, full, { noCast: true }); else B(t + .06, .05, a1 - a0 + e0 + e1 + .03, X.shell, c, H, mid + (e1 - e0) / 2, full, { noCast: true }); }
    w.full = full; w.stub = stub; stub.visible = false; arch.add(full, stub); P.walls.push(w);
  });
  buildFloors(P);
  if (L === 0) buildSite(S);
}
// floors (and, on an upper storey, the slab with its stairwell and a glass balustrade round the opening)
function buildFloors(L) {
  for (const m of L.fl) { L.arch.remove(m); disposeTree(m); const i = L.spick.indexOf(m); if (i >= 0) L.spick.splice(i, 1); } L.fl = []; if (L.L) L.slab = [];
  L.solids = L.solids.filter(q => !q.hole); const hole = L.L ? stairHole() : null; L.hole = hole; if (hole) { const s = hole.slice(); s.hole = 1; L.solids.push(s); }
  const cut = q => hole ? rectMinus(q, hole) : [q];
  for (const rd of L.S.rooms) { const sid = 'f:' + rd.id, mat = SURF[sid].mat;
    for (const q0 of rd.r) { for (const q of cut(q0)) { const g = new THREE.PlaneGeometry(q[2] - q[0], q[3] - q[1]); g.rotateX(-Math.PI / 2); g.translate((q[0] + q[2]) / 2, .001, (q[1] + q[3]) / 2); const p = g.attributes.position, uv = g.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getZ(i) * TS, p.getX(i) * TS); const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.userData.surf = sid; L.arch.add(m); L.spick.push(m); L.fl.push(m); }
      if (L.L) for (const q of cut([q0[0] - .13, q0[1] - .13, q0[2] + .13, q0[3] + .13])) { const m = B(q[2] - q[0], .3, q[3] - q[1], X.cap, (q[0] + q[2]) / 2, -.3, (q[1] + q[3]) / 2, L.arch); L.fl.push(m); L.slab.push(m); } } }
  if (hole && roomAt((hole[0] + hole[2]) / 2, (hole[1] + hole[3]) / 2, L)) {
    const st = hole.st, c = Math.cos(st.r), s = Math.sin(st.r), kx = st.m ? -1 : 1, rail = new THREE.Group(), glass = new THREE.MeshStandardMaterial({ color: '#dfe9ec', roughness: .08, transparent: true, opacity: .22, side: THREE.DoubleSide, depthWrite: false });
    const side = (dx, dz) => Math.abs(dx) > Math.abs(dz) ? { hz: false, c: dx > 0 ? hole[2] : hole[0], a0: hole[1], a1: hole[3] } : { hz: true, c: dz > 0 ? hole[3] : hole[1], a0: hole[0], a1: hole[2] };
    const walled = e => L.walls.some(w => w.hz === e.hz && Math.abs(w.c - e.c) < .3 && w.a0 < e.a1 - .2 && w.a1 > e.a0 + .2);
    for (const e of [side(s, c), side(-kx * c, kx * s), side(-s, -c)]) { if (walled(e)) continue; const len = e.a1 - e.a0, m = (e.a0 + e.a1) / 2;
      if (e.hz) { B(len, .9, .02, glass, m, 0, e.c, rail, { noCast: true }); B(len + .04, .05, .06, X.black, m, .9, e.c, rail); } else { B(.02, .9, len, glass, e.c, 0, m, rail, { noCast: true }); B(.06, .05, len + .04, X.black, e.c, .9, m, rail); } }
    L.arch.add(rail); L.fl.push(rail); L.rail = rail;
  }
}
// cut-away: exterior walls between the camera and the rooms drop to a low stub; interior walls stay low unless "Walls up".
// Storeys below the one being edited keep every wall at full height.
let wallMode = 'auto', planView = false;
function updateWalls() {
  if (!P) return false; let changed = false; const fx = -Math.sin(cam.az), fz = -Math.cos(cam.az);   // the camera looks along -(sin az, cos az)
  for (const L of LV) for (const w of L.walls) {
    let up, vis = true;
    if (L.L < lv || outside) up = true;
    else {
      up = wallMode === 'up' ? true : wallMode === 'down' ? false : w.ext ? (w.hz ? fz : fx) * w.nOut > -.2 : false;
      if (planView && wallMode === 'auto') up = false;
      if (focus) { const s = w.rooms[0] === focus ? 0 : w.rooms[1] === focus ? 1 : -1; if (s < 0) vis = false; else if (wallMode === 'auto') up = !planView && (w.hz ? fz : fx) * (s ? 1 : -1) > 0; }
    }
    if (up !== w.up || vis !== w.vis) { w.up = up; w.vis = vis; w.full.visible = vis && up; w.stub.visible = vis && !up; changed = true; }
  }
  return changed;
}

/* ───────────────────────── catalog ───────────────────────── */
// roles: key → [label, accepted finish categories, default]     flags: wall = backs onto walls, top = surface height for small pieces,
// small = sits on tops, rug = flat, mount = hangs on a wall [w,h,default y], rs = resizable, lamp = [x,y,z,intensity]
const CAT = {}, CAT_ORDER = [];
function def(k, n, g, dim, roles, build, o = {}) { CAT[k] = { k, n, g, dim, roles, build, ...o }; CAT_ORDER.push(k); }
const sofa = n => (g, M) => { const w = n * .74 + .34; RB(w, .3, .94, .08, M.a, 0, .08, 0, g); RB(w, .5, .22, .1, M.a, 0, .3, -.36, g); for (const s of [-1, 1]) RB(.18, .42, .94, .08, M.a, s * (w / 2 - .09), .22, 0, g);
  for (let i = 0; i < n; i++) { const x = (i - (n - 1) / 2) * .74; RB(.72, .16, .68, .07, M.a, x, .37, .1, g); RB(.7, .4, .18, .08, M.a, x, .5, -.2, g, { rx: -.16 }); }
  RB(.4, .4, .13, .06, M.b, -(w / 2 - .42), .52, -.02, g, { rx: -.3, ry: .2 }); RB(.4, .4, .13, .06, M.b, w / 2 - .42, .52, -.02, g, { rx: -.3, ry: -.15 }); legs(g, w - .1, .84, .08, M.c, .05, .03); };
const armchair = (g, M) => { const w = M.c, u = M.a; for (const sx of [-1, 1]) { B(.05, .56, .05, w, sx * .36, 0, .32, g); B(.05, .78, .05, w, sx * .36, 0, -.34, g, { rx: -.08 }); B(.06, .04, .76, w, sx * .36, .54, 0, g); B(.04, .04, .7, w, sx * .36, .2, 0, g); } B(.72, .04, .04, w, 0, .2, .32, g); B(.72, .04, .04, w, 0, .72, -.37, g); RB(.66, .15, .66, .06, u, 0, .26, 0, g); RB(.66, .5, .15, .06, u, 0, .36, -.3, g, { rx: -.22 }); };
const bed = w => (g, M) => { B(w, .22, 2.16, M.c, 0, .1, 0, g); B(w + .14, 1.12, .07, M.c, 0, .1, -1.1, g); RB(w, .9, .1, .04, M.b, 0, .28, -1.03, g); RB(w - .1, .22, 2.06, .06, X.white, 0, .3, 0, g); RB(w - .04, .14, 1.4, .06, M.a, 0, .46, .36, g); RB(w - .02, .06, .3, .03, X.white, 0, .56, -.32, g);
  const n = w > 1.4 ? 2 : 1; for (let i = 0; i < n; i++) RB(.72, .15, .44, .07, X.white, n === 2 ? (i ? .43 : -.43) : 0, .5, -.74, g, { rx: -.25 }); RB(w, .05, .48, .02, M.b, 0, .585, .72, g); };
const chair = (g, M) => { const w = M.a; legs(g, .42, .42, .43, w, .035, .02); B(.42, .035, .42, w, 0, .43, 0, g); B(.035, .42, .035, w, -.19, .46, -.19, g); B(.035, .42, .035, w, .19, .46, -.19, g); B(.42, .12, .03, w, 0, .76, -.19, g); RB(.39, .05, .39, .02, M.b, 0, .465, 0, g); };
const cab = (w, extra) => (g, M) => { B(w, .84, .6, M.a, 0, .06, 0, g); B(w - .06, .06, .52, X.black, 0, 0, 0, g); B(w + .02, .04, .64, M.b, 0, .9, 0, g); const n = Math.max(1, Math.round(w / .6)); for (let i = 1; i < n; i++) B(.006, .78, .01, X.black, -w / 2 + i * w / n, .09, .302, g); for (let i = 0; i < n; i++) B(.12, .012, .02, X.chrome, -w / 2 + (i + .5) * w / n, .8, .31, g); extra && extra(g, M); };
const FAB = ['fabric'], WOOD = ['wood'], WP = ['wood', 'paint'], ST = ['stone', 'wood'];
// living
def('sofa2', 'Sofa, two-seat', 'living', [1.82, .94, .8], { a: ['Upholstery', FAB, 'boucle'], b: ['Cushions', FAB, 'rust'], c: ['Legs', WOOD, 'walnut'] }, sofa(2), { wall: 1 });
def('sofa3', 'Sofa, three-seat', 'living', [2.56, .94, .8], { a: ['Upholstery', FAB, 'linen'], b: ['Cushions', FAB, 'moss'], c: ['Legs', WOOD, 'whiteoak'] }, sofa(3), { wall: 1 });
def('sectional', 'Sectional sofa', 'living', [2.92, 1.9, .82], { a: ['Upholstery', FAB, 'oatknit'], b: ['Cushions', FAB, 'moss'] }, (g, M) => { const z = -.46, u = M.a; RB(2.7, .3, .98, .08, u, 0, .08, z, g); RB(.95, .3, .95, .08, u, .875, .08, z + .93, g); RB(2.7, .52, .24, .1, u, 0, .3, z - .39, g); RB(.2, .42, .98, .08, u, -1.36, .22, z, g); RB(.2, .42, 1.9, .08, u, 1.36, .22, z + .46, g);
  for (let i = 0; i < 3; i++) { RB(.8, .16, .7, .07, u, -.78 + i * .8, .37, z + .1, g); RB(.76, .4, .18, .08, u, -.78 + i * .8, .5, z - .22, g, { rx: -.16 }); } RB(.8, .16, .82, .07, u, .82, .37, z + .92, g);
  RB(.4, .4, .13, .06, M.b, -.85, .52, z - .02, g, { rx: -.3, ry: .2 }); RB(.4, .4, .13, .06, M.b, .1, .52, z - .04, g, { rx: -.3, ry: -.15 }); RB(.42, .42, .13, .06, M.b, .95, .52, z - .02, g, { rx: -.3, ry: .12 }); }, { wall: 1 });
def('armchair', 'Armchair', 'living', [.8, .82, .8], { a: ['Upholstery', FAB, 'oatknit'], c: ['Frame', WOOD, 'whiteoak'] }, armchair);
def('pouf', 'Pouf', 'living', [.56, .56, .36], { a: ['Cover', FAB, 'moss'] }, (g, M) => { C(.27, .27, .36, M.a, 0, 0, 0, g, { seg: 24 }); });
def('coffeeR', 'Coffee table, round', 'living', [1.12, 1.12, .39], { a: ['Top', ST, 'whiteoak'] }, (g, M) => { C(.56, .56, .05, M.a, 0, .34, 0, g, { seg: 40 }); for (let i = 0; i < 3; i++) C(.025, .02, .34, M.a, Math.cos(i * 2.09) * .36, 0, Math.sin(i * 2.09) * .36, g, { seg: 8 }); }, { top: .39, rs: 1 });
def('coffeeQ', 'Coffee table, long', 'living', [1.2, .6, .4], { a: ['Top', ST, 'walnut'] }, (g, M) => { B(1.2, .05, .6, M.a, 0, .35, 0, g); B(1.08, .02, .48, M.a, 0, .12, 0, g); legs(g, 1.16, .56, .35, X.black, .03, .02); }, { top: .4, rs: 1 });
def('sideT', 'Side table', 'living', [.56, .56, .54], { a: ['Top', ST, 'whiteoak'] }, (g, M) => { C(.27, .27, .04, M.a, 0, .5, 0, g, { seg: 28 }); C(.03, .03, .5, X.black, 0, 0, 0, g, { seg: 8 }); C(.18, .2, .02, X.black, 0, 0, 0, g); }, { top: .54 });
def('tvstand', 'TV stand', 'living', [1.8, .42, 1.34], { a: ['Cabinet', WP, 'whiteoak'] }, (g, M) => { B(1.8, .4, .42, M.a, 0, .1, 0, g); legs(g, 1.7, .36, .1, X.black, .035, .04); B(.006, .36, .01, X.black, 0, .12, .212, g); B(1.25, .72, .04, X.tv, 0, .62, -.05, g); B(.4, .12, .16, X.black, 0, .5, -.05, g); const sm = new THREE.MeshStandardMaterial({ color: '#06070b', roughness: .18, emissive: '#ffffff', emissiveMap: TVTEX, emissiveIntensity: 0 }), sc = new THREE.Mesh(new THREE.PlaneGeometry(1.19, .66), sm); sc.position.set(0, .98, -.027); g.add(sc); g.userData.screen = sm; }, { wall: 1, tv: 1, lamp: [0, 1.0, .55, 1.4] });
def('bookshelf', 'Bookshelf', 'living', [1.14, .34, 1.92], { a: ['Timber', WP, 'whiteoak'] }, (g, M) => { const w = M.a, Wd = 1.1, Hh = 1.92, Dp = .34; B(.04, Hh, Dp, w, -Wd / 2, 0, 0, g); B(.04, Hh, Dp, w, Wd / 2, 0, 0, g); B(Wd, Hh, .02, w, 0, 0, -Dp / 2, g); seed = 5; for (let i = 0; i < 6; i++) { const y = .04 + i * .372; B(Wd, .035, Dp, w, 0, y, 0, g); if (i < 5) { if (i === 2) { vase(g, -.3, y + .035, 0, .6); books(g, -.1, .5, y + .035, 0, .2); } else if (i === 4) { vase(g, .25, y + .035, 0, .55, X.vaseDark); books(g, -.5, .05, y + .035, 0, .2); } else books(g, -.5, .5, y + .035, 0, .2); } } }, { wall: 1 });
def('sideboard', 'Sideboard', 'living', [2.0, .46, .62], { a: ['Cabinet', WP, 'whiteoak'] }, (g, M) => { B(2.0, .48, .46, M.a, 0, .14, 0, g); legs(g, 1.9, .4, .14, X.black, .035, .04); for (const x of [-.5, 0, .5]) B(.006, .44, .01, X.black, x, .16, .232, g); }, { wall: 1, top: .62, rs: 1 });
def('floorlamp', 'Floor lamp', 'living', [.4, .4, 1.6], {}, (g) => { C(.16, .17, .03, X.black, 0, 0, 0, g); C(.014, .014, 1.55, X.black, 0, 0, 0, g, { seg: 8 }); const d = new THREE.Mesh(new THREE.SphereGeometry(.19, 20, 10, 0, 6.3, 0, 1.57), X.black); put(d, g, .08, 1.5, .08, {}); const b = new THREE.Mesh(new THREE.CircleGeometry(.17, 20), X.shade); b.rotation.x = Math.PI / 2; b.position.set(.08, 1.505, .08); g.add(b); }, { lamp: [.08, 1.36, .08, 3.2] });
// bedroom
def('bed', 'Double bed', 'bedroom', [2.04, 2.24, 1.22], { a: ['Bed linen', FAB, 'linen'], b: ['Headboard', FAB, 'oatknit'], c: ['Frame', WOOD, 'whiteoak'] }, bed(1.9), { wall: 1 });
def('bedS', 'Single bed', 'bedroom', [1.24, 2.24, 1.22], { a: ['Bed linen', FAB, 'blush'], b: ['Headboard', FAB, 'linen'], c: ['Frame', WOOD, 'whiteoak'] }, bed(1.1), { wall: 1 });
def('nightstand', 'Nightstand', 'bedroom', [.52, .44, .52], { a: ['Timber', WP, 'whiteoak'] }, (g, M) => { B(.52, .4, .44, M.a, 0, .12, 0, g); legs(g, .5, .42, .12, M.a, .035, .03); B(.44, .012, .01, X.black, 0, .34, .222, g); }, { wall: 1, top: .52 });
def('wardrobe', 'Wardrobe', 'bedroom', [1.62, .66, 2.16], { a: ['Doors', WP, 'whiteoak'], b: ['Carcass', WP, 'bone'] }, (g, M) => { B(1.62, 2.12, .64, M.b, 0, .04, 0, g); B(.79, 2.04, .025, M.a, -.4, .08, .33, g); B(.79, 2.04, .025, M.a, .4, .08, .33, g); B(.018, .5, .03, X.black, -.05, .9, .355, g); B(.018, .5, .03, X.black, .05, .9, .355, g); B(1.5, .04, .5, X.black, 0, 0, 0, g); }, { wall: 1 });
def('dresser', 'Dresser', 'bedroom', [1.3, .5, .85], { a: ['Timber', WP, 'whiteoak'] }, (g, M) => { B(1.3, .73, .5, M.a, 0, .12, 0, g); legs(g, 1.24, .44, .12, M.a, .04, .03); for (const y of [.36, .6]) B(1.26, .006, .01, X.black, 0, y, .252, g); for (const y of [.24, .48, .72]) for (const x of [-.32, .32]) B(.14, .012, .02, X.chrome, x, y, .258, g); }, { wall: 1, top: .85 });
def('mirrorF', 'Floor mirror', 'bedroom', [.64, .32, 1.7], { a: ['Frame', WP, 'whiteoak'] }, (g, M) => { const h = new THREE.Group(); h.rotation.x = -.12; h.position.z = -.02; g.add(h); B(.64, 1.72, .035, M.a, 0, 0, 0, h); const m = new THREE.Mesh(new THREE.PlaneGeometry(.56, 1.64), X.mirror); m.position.set(0, .86, .019); h.add(m); }, { wall: 1 });
def('desk', 'Desk', 'bedroom', [1.55, .68, .76], { a: ['Top', WP, 'bone'] }, (g, M) => { B(1.55, .04, .68, M.a, 0, .72, 0, g); for (const sx of [-1, 1]) { B(.03, .72, .03, X.black, sx * .72, 0, .28, g); B(.03, .72, .03, X.black, sx * .72, 0, -.28, g); B(.03, .03, .56, X.black, sx * .72, .02, 0, g); } }, { wall: 1, top: .76 });
def('deskchair', 'Desk chair', 'bedroom', [.6, .6, 1.05], { a: ['Seat', FAB, 'linen'] }, (g, M) => { for (let i = 0; i < 5; i++) { const a = i * 1.2566; B(.3, .03, .04, X.black, Math.cos(a) * .15, .04, Math.sin(a) * .15, g, { ry: -a }); C(.03, .03, .04, X.black, Math.cos(a) * .3, 0, Math.sin(a) * .3, g, { seg: 8 }); } C(.025, .025, .38, X.black, 0, .06, 0, g, { seg: 8 }); RB(.48, .08, .46, .035, M.a, 0, .43, 0, g); RB(.46, .5, .07, .03, M.a, 0, .58, -.22, g, { rx: -.12 }); B(.04, .2, .04, X.black, 0, .45, -.24, g); });
def('bench', 'Bench', 'bedroom', [1.45, .42, .47], { a: ['Seat', FAB, 'moss'] }, (g, M) => { RB(1.45, .13, .42, .05, M.a, 0, .34, 0, g); for (const sx of [-1, 1]) { B(.03, .34, .03, X.black, sx * .65, 0, .16, g); B(.03, .34, .03, X.black, sx * .65, 0, -.16, g); B(.03, .03, .35, X.black, sx * .65, .05, 0, g); } });
// kitchen & dining
def('diningQ', 'Dining table', 'kitchen', [2.05, .92, .76], { a: ['Top', ST, 'whiteoak'] }, (g, M) => { B(2.05, .05, .92, M.a, 0, .71, 0, g); legs(g, 2.05, .92, .71, M.a, .06, .08); }, { top: .76, rs: 1 });
def('diningR', 'Dining table, round', 'kitchen', [1.2, 1.2, .76], { a: ['Top', ST, 'marble'] }, (g, M) => { C(.6, .6, .04, M.a, 0, .72, 0, g, { seg: 44 }); C(.06, .08, .7, X.black, 0, .02, 0, g, { seg: 12 }); C(.3, .32, .03, X.black, 0, 0, 0, g, { seg: 28 }); }, { top: .76, rs: 1 });
def('chair', 'Dining chair', 'kitchen', [.44, .46, .88], { a: ['Frame', WOOD, 'whiteoak'], b: ['Seat pad', FAB, 'moss'] }, chair);
def('stool', 'Bar stool', 'kitchen', [.4, .4, .76], { a: ['Seat', WOOD, 'whiteoak'] }, (g, M) => { C(.17, .17, .05, M.a, 0, .71, 0, g, { seg: 24 }); for (let i = 0; i < 4; i++) { const a = i * 1.5708 + .785; C(.012, .012, .72, X.black, Math.cos(a) * .13, 0, Math.sin(a) * .13, g, { seg: 6 }); } const r = new THREE.Mesh(new THREE.TorusGeometry(.15, .008, 6, 24), X.black); r.rotation.x = Math.PI / 2; r.position.y = .28; g.add(r); });
def('island', 'Kitchen island', 'kitchen', [1.9, 1.0, .94], { a: ['Cabinets', WP, 'sage'], b: ['Worktop', ST, 'marble'] }, (g, M) => { B(1.8, .86, .9, M.a, 0, .04, 0, g); B(1.7, .04, .8, X.black, 0, 0, 0, g); B(1.9, .04, 1.0, M.b, 0, .9, 0, g); for (const x of [-.45, 0, .45]) B(.006, .8, .01, X.black, x, .07, .452, g); }, { top: .94, rs: 1 });
def('cabinet', 'Base cabinet', 'kitchen', [1.22, .64, .94], { a: ['Cabinets', WP, 'sage'], b: ['Worktop', ST, 'marble'] }, cab(1.2), { wall: 1, top: .94 });
def('sink', 'Sink cabinet', 'kitchen', [1.22, .64, 1.2], { a: ['Cabinets', WP, 'sage'], b: ['Worktop', ST, 'marble'] }, cab(1.2, g => { B(.52, .012, .36, X.steel, 0, .935, .02, g); B(.46, .006, .3, X.tv, 0, .944, .02, g); C(.012, .012, .26, X.chrome, 0, .94, -.22, g, { seg: 8 }); B(.02, .02, .16, X.chrome, 0, 1.19, -.15, g); }), { wall: 1 });
// counter runs: one continuous worktop over 60 cm cabinet modules; the run grows or shrinks a module at a time (inst.len)
const counterRun = kind => (g, M, it) => {
  const L = it && it.len || 1.8, n = Math.max(1, Math.round(L / .6)), mw = L / n, mid = Math.floor((n - 1) / 2);
  B(L - .02, .1, .52, X.black, 0, 0, -.05, g); B(L, .8, .58, M.a, 0, .1, -.03, g); B(L + .02, .04, .64, M.b, 0, .9, 0, g);
  for (let i = 0; i < n; i++) { const x = -L / 2 + (i + .5) * mw; if (kind === 'sink' && i === mid) { B(mw - .01, .76, .02, M.a, x, .12, .265, g); continue; }
    const two = mw > .45 && i % 3 === 2; if (two) { B(mw - .01, .24, .02, M.a, x, .66, .265, g); B(mw - .01, .5, .02, M.a, x, .12, .265, g); B(.16, .012, .02, X.chrome, x, .84, .285, g); B(.16, .012, .02, X.chrome, x, .58, .285, g); }
    else { B(mw - .01, .76, .02, M.a, x, .12, .265, g); B(.012, .16, .02, X.chrome, x + mw / 2 - .07, .7, .285, g); } }
  const x = -L / 2 + (mid + .5) * mw;
  if (kind === 'sink') { B(.5, .012, .38, X.steel, x, .935, .01, g); B(.44, .006, .32, X.tv, x, .943, .01, g); C(.012, .012, .26, X.chrome, x, .94, -.22, g, { seg: 8 }); B(.02, .02, .17, X.chrome, x, 1.19, -.14, g); }
  if (kind === 'hob') { B(.58, .008, .5, X.black, x, .94, .01, g); for (const [dx, dz, r] of [[-.14, -.11, .07], [.14, -.11, .055], [-.14, .12, .055], [.14, .12, .07]]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(r, .004, 4, 28), X.steel); ring.rotation.x = Math.PI / 2; ring.position.set(x + dx, .95, dz + .01); g.add(ring); }
    B(mw - .02, .6, .02, X.black, x, .17, .27, g); B(mw - .06, .3, .005, X.tv, x, .3, .282, g); }
};
def('counter', 'Counter run', 'kitchen', [1.8, .64, .94], { a: ['Cabinets', WP, 'chalk'], b: ['Worktop', ST, 'marble'] }, counterRun('plain'), { wall: 1, top: .94, len: 1, price: 1500 });
def('counterS', 'Counter run, sink', 'kitchen', [1.8, .64, .94], { a: ['Cabinets', WP, 'chalk'], b: ['Worktop', ST, 'marble'] }, counterRun('sink'), { wall: 1, top: .94, len: 1, price: 2100 });
def('counterH', 'Counter run, hob', 'kitchen', [1.8, .64, .94], { a: ['Cabinets', WP, 'chalk'], b: ['Worktop', ST, 'marble'] }, counterRun('hob'), { wall: 1, top: .94, len: 1, price: 2600 });
def('range', 'Range cooker', 'kitchen', [.62, .64, .95], { a: ['Body', ['paint'], 'graphite'] }, (g, M) => { B(.6, .88, .6, M.a, 0, .04, 0, g); B(.5, .46, .02, X.tv, 0, .18, .302, g); B(.44, .02, .03, X.chrome, 0, .7, .32, g); B(.58, .012, .56, X.tv, 0, .92, 0, g); for (const [x, z] of [[-.14, -.13], [.14, -.13], [-.14, .13], [.14, .13]]) C(.075, .075, .006, X.steel, x, .932, z, g, { seg: 20 }); for (let i = 0; i < 4; i++) C(.018, .018, .02, X.chrome, -.18 + i * .12, .8, .31, g, { seg: 10, rx: Math.PI / 2 }); }, { wall: 1 });
def('fridge', 'Refrigerator', 'kitchen', [.72, .7, 1.9], { a: ['Finish', ['paint'], 'bone'] }, (g, M) => { B(.7, 1.9, .66, M.a, 0, 0, 0, g); B(.68, .006, .01, X.black, 0, 1.25, .332, g); B(.02, .5, .03, X.chrome, -.27, 1.35, .35, g); B(.02, .5, .03, X.chrome, -.27, .55, .35, g); }, { wall: 1 });
def('wallcab', 'Wall cabinet', 'kitchen', [1.2, .7, .35], { a: ['Cabinets', WP, 'sage'] }, (g, M) => { B(1.2, .7, .35, M.a, 0, 0, .175, g); B(.006, .66, .01, X.black, 0, .02, .352, g); }, { mount: 1.45 });
// bathroom
def('bathtub', 'Bathtub', 'bath', [1.7, .78, .6], {}, (g) => { RB(1.7, .56, .76, .12, X.porcelain, 0, 0, 0, g); B(1.46, .02, .52, X.water, 0, .545, 0, g); C(.014, .014, .2, X.chrome, -.7, .56, -.2, g, { seg: 8 }); B(.14, .02, .02, X.chrome, -.64, .75, -.2, g); }, { wall: 1 });
def('shower', 'Shower', 'bath', [.96, .96, 2.05], {}, (g) => { B(.95, .06, .95, X.porcelain, 0, 0, 0, g); for (const [x, z, ry] of [[0, .46, 0], [.46, 0, Math.PI / 2]]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(.92, 1.95), X.clear); p.position.set(x, 1.03, z); p.rotation.y = ry; g.add(p); } B(.025, 2.0, .025, X.chrome, .46, .04, .46, g); B(.025, 2.0, .025, X.chrome, -.46, .04, .46, g); C(.012, .012, 2.0, X.chrome, -.3, .05, -.42, g, { seg: 8 }); B(.02, .02, .3, X.chrome, -.3, 2.03, -.28, g); C(.11, .11, .02, X.chrome, -.3, 2.0, -.14, g, { seg: 20 }); }, { wall: 1 });
def('toilet', 'Toilet', 'bath', [.42, .7, .78], {}, (g) => { B(.38, .38, .18, X.porcelain, 0, .4, -.25, g); const b = C(.19, .14, .4, X.porcelain, 0, 0, .06, g, { seg: 22 }); b.scale.z = 1.3; const s = C(.2, .2, .03, X.porcelain, 0, .4, .06, g, { seg: 22 }); s.scale.z = 1.3; B(.06, .02, .03, X.chrome, 0, .79, -.25, g); }, { wall: 1 });
def('vanity', 'Vanity', 'bath', [.92, .5, .93], { a: ['Cabinet', WP, 'whiteoak'], b: ['Top', ST, 'marble'] }, (g, M) => { B(.9, .5, .48, M.a, 0, .3, 0, g); legs(g, .84, .42, .3, X.black, .03, .03); B(.92, .03, .5, M.b, 0, .8, 0, g); C(.18, .14, .1, X.porcelain, 0, .83, .02, g, { seg: 24 }); C(.012, .012, .2, X.chrome, 0, .83, -.19, g, { seg: 8 }); B(.02, .02, .12, X.chrome, 0, 1.02, -.14, g); B(.006, .46, .01, X.black, 0, .32, .242, g); }, { wall: 1 });
def('bathstore', 'Tall storage', 'bath', [.46, .36, 1.74], { a: ['Cabinet', WP, 'whiteoak'] }, (g, M) => { B(.45, 1.7, .36, M.a, 0, .04, 0, g); B(.4, .04, .3, X.black, 0, 0, 0, g); B(.012, .3, .02, X.chrome, .15, .9, .19, g); }, { wall: 1 });
def('mirrorR', 'Round mirror', 'bath', [.8, .8, .04], { a: ['Rim', WP, 'graphite'] }, (g, M) => { C(.4, .4, .03, M.a, 0, 0, 0, g, { seg: 40, rx: Math.PI / 2 }).position.set(0, .4, .015); const m = new THREE.Mesh(new THREE.CircleGeometry(.37, 40), X.mirror); m.position.set(0, .4, .032); g.add(m); }, { mount: 1.15 });
def('rugM', 'Bath mat', 'bath', [.9, .55, .03], { a: ['Weave', FAB, 'greywool'] }, (g, M) => { RB(.9, .03, .55, .012, M.a, 0, .003, 0, g, { noCast: true }); }, { rug: 1 });
// decor
function artTex(kind, acc) { const cv = document.createElement('canvas'); cv.width = 192; cv.height = 256; const g = cv.getContext('2d'), w = 192, h = 256, dk = '#262b3c'; g.fillStyle = '#ece4d4'; g.fillRect(0, 0, w, h); const blob = (x, y, rx, ry, c, rot = 0) => { g.fillStyle = c; g.beginPath(); g.ellipse(x * w, y * h, rx * w, ry * h, rot, 0, 7); g.fill(); };
  if (kind === 0) { blob(.5, .3, .2, .13, acc, .3); blob(.36, .72, .34, .22, acc, -.2); blob(.7, .66, .2, .2, dk, .4); blob(.52, .56, .1, .16, '#d8c7ab', .2); } else if (kind === 1) { blob(.5, .62, .2, .22, dk); blob(.5, .34, .1, .09, dk); g.fillRect(.44 * w, .38 * h, .12 * w, .14 * h); } else { g.strokeStyle = dk; g.lineWidth = 3; g.beginPath(); g.moveTo(.5 * w, .9 * h); g.quadraticCurveTo(.3 * w, .5 * h, .55 * w, .2 * h); g.stroke(); blob(.6, .34, .1, .05, acc, -.6); blob(.4, .5, .1, .05, acc, .6); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; }
const picture = (g, M, kind, w, h, x) => { B(w + .06, h + .06, .03, X.black, x, 0, .015, g); const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: artTex(kind, MATS[M.a.userData.mat].a), roughness: .9 })); m.position.set(x, h / 2 + .03, .032); m.userData.art = kind; g.add(m); };
def('artL', 'Artwork, large', 'decor', [.9, 1.2, .04], { a: ['Colour', FAB, 'moss'] }, (g, M) => picture(g, M, 0, .84, 1.12, 0), { mount: 1.15, rs: 1 });
def('artP', 'Artwork, pair', 'decor', [.95, .6, .04], { a: ['Colour', FAB, 'moss'] }, (g, M) => { picture(g, M, 1, .4, .52, -.25); picture(g, M, 2, .4, .52, .25); }, { mount: 1.3 });
def('shelves', 'Wall shelves', 'decor', [1.55, 1.2, .24], { a: ['Timber', WP, 'whiteoak'] }, (g, M) => { seed = 23; for (let i = 0; i < 3; i++) B(1.55 - i * .12, .035, .22, M.a, i * .05, i * .46, .11, g); books(g, -.7, -.1, .035, .11); vase(g, .3, .035, .11, .7, X.vaseDark); vase(g, .6, .035, .11, .5); vase(g, -.55, .495, .11, .65, X.vaseDark); books(g, -.25, .2, .495, .11); vase(g, .5, .495, .11, .55, X.terra); books(g, -.4, .05, .955, .11); vase(g, .35, .955, .11, .75, X.terra); }, { mount: 1.35 });
def('slat', 'Slat panel', 'decor', [1.86, 2.6, .08], { a: ['Timber', WP, 'whiteoak'] }, (g, M) => { B(1.86, 2.6, .02, std('#3a2c22'), 0, 0, .01, g); for (let i = 0; i < 17; i++) B(.062, 2.58, .05, M.a, -.864 + i * .108, 0, .045, g); }, { mount: 0, floor: 1 });
def('curtain', 'Curtain', 'decor', [.5, 2.5, .14], { a: ['Fabric', FAB, 'linen'] }, (g, M) => { for (let i = 0; i < 5; i++) C(.055, .06, 2.46, M.a, (i - 2) * .095, .03, .08, g, { seg: 10 }); B(.56, .03, .03, X.black, 0, 2.5, .08, g); }, { mount: 0, floor: 1 });
def('fiddle', 'Fiddle-leaf fig', 'decor', [.5, .5, 1.9], {}, g => { seed = 31; plant(g, 'fiddle', 0, 0, 0, 1.1); });
def('snake', 'Snake plant', 'decor', [.4, .4, 1.1], {}, g => { seed = 41; plant(g, 'snake', 0, 0, 0, 1.1, X.terra); });
def('bird', 'Bird of paradise', 'decor', [.6, .6, 1.6], {}, g => { seed = 53; plant(g, 'bird', 0, 0, 0, 1.2, X.vaseDark); });
def('rugQ', 'Rug, rectangular', 'decor', [2.9, 2.0, .03], { a: ['Weave', FAB, 'greywool'] }, (g, M) => { RB(2.9, .03, 2.0, .012, M.a, 0, .003, 0, g, { noCast: true }); }, { rug: 1, rs: 1 });
def('rugO', 'Rug, round', 'decor', [2.6, 2.6, .03], { a: ['Weave', FAB, 'greywool'] }, (g, M) => { C(1.3, 1.3, .03, M.a, 0, .003, 0, g, { seg: 56, noCast: true }); }, { rug: 1, rs: 1 });
def('rugR', 'Runner', 'decor', [.8, 2.4, .03], { a: ['Weave', FAB, 'oatknit'] }, (g, M) => { RB(.8, .03, 2.4, .012, M.a, 0, .003, 0, g, { noCast: true }); }, { rug: 1, rs: 1 });
def('lamp', 'Table lamp', 'decor', [.34, .34, .5], {}, g => lampBody(g, 0, 0, 0, 1.1), { small: 1, lamp: [0, .5, 0, 2.4] });
def('vase', 'Vase', 'decor', [.22, .22, .36], {}, g => { vase(g, 0, 0, 0, 1.0, X.vaseDark); }, { small: 1 });
def('ceramics', 'Ceramics', 'decor', [.5, .24, .3], {}, g => { vase(g, -.15, 0, 0, .8); vase(g, .06, 0, .03, .55, X.terra); C(.07, .05, .05, X.vaseDark, .2, 0, -.02, g); }, { small: 1 });
def('booksS', 'Book stack', 'decor', [.3, .24, .12], {}, g => { B(.3, .035, .22, BOOKC[0], 0, 0, 0, g, { ry: .1 }); B(.27, .03, .2, BOOKC[2], 0, .035, 0, g, { ry: -.15 }); B(.24, .03, .18, BOOKC[1], 0, .065, 0, g, { ry: .3 }); }, { small: 1 });
def('plantS', 'Small plant', 'decor', [.2, .2, .34], {}, g => { seed = 61; plant(g, 'snake', 0, 0, 0, .32, X.ceramic); }, { small: 1 });
def('bowl', 'Fruit bowl', 'decor', [.3, .3, .14], {}, g => { C(.15, .08, .07, X.ceramic, 0, 0, 0, g, { seg: 24 }); for (const [x, z, c] of [[-.04, 0, '#d9772f'], [.05, .03, '#c9482f'], [.01, -.05, '#8a9a3f']]) { const s = new THREE.Mesh(new THREE.SphereGeometry(.045, 12, 10), std(c, { roughness: .5 })); put(s, g, x, .09, z, {}); } }, { small: 1 });
def('laptop', 'Laptop', 'decor', [.36, .26, .24], {}, g => { B(.36, .014, .25, X.steel, 0, 0, .04, g); B(.36, .24, .01, X.steel, 0, .005, -.107, g, { rx: -.22 }); const sc = new THREE.Mesh(new THREE.PlaneGeometry(.33, .21), X.screen); sc.position.set(0, .125, -.098); sc.rotation.x = -.22; g.add(sc); }, { small: 1 });
const GROUPS = { living: 'Living', bedroom: 'Bedroom', kitchen: 'Kitchen', bath: 'Bath' };

/* ───────────────────────── garage and lot: every plan sits on a full site ───────────────────────── */
// The garage is attached on the near-left side (x < 0) so the tall far walls keep their art; the lot wraps the whole
// building: driveway and front path, lawn, hedges, fenced back garden with a deck, trees, beds and garden lights.
const GW = 4.0;
function garageOf(def) { const gd = Math.min(def.D, 6.2); return { gd, gz0: def.D - gd }; }
function withGarage(def) {
  const { gd, gz0 } = garageOf(def), D = def.D, rooms = [...def.rooms, { id: 'garage', n: 'Garage', t: 'garage', r: [[-GW, gz0, 0, D]] }];
  // the house wall the garage leans on loses its windows there and gains a door into the garage
  const walls = def.walls.map(w => { if (!(w[0] === 0 && w[2] === 0)) return w; const ops = w[4].filter(o => o[1] + o[2] < gz0 + .05); ops.push(['d', D - 1.7, .9]); return [w[0], w[1], w[2], w[3], ops]; });
  const gwalls = [[-GW, gz0, 0, gz0, [], -1], [-GW, gz0, -GW, D, [['w', gd * .4, 1.2]], -1], [-GW, D, 0, D, [['G', .5, 2.9]], 1]];
  return { ...def, rooms, walls, gwalls, gd, gz0, x0: -GW };
}
const SITE = {};
function lawnMat(t) { const m = new THREE.MeshStandardMaterial({ map: t, roughness: 1 });
  m.onBeforeCompile = sh => { sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLW;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvLW = (modelMatrix * vec4(transformed, 1.)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vLW; float hn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); float a = fract(sin(dot(i, vec2(127.1,311.7)))*43758.5), b = fract(sin(dot(i+vec2(1,0), vec2(127.1,311.7)))*43758.5), c = fract(sin(dot(i+vec2(0,1), vec2(127.1,311.7)))*43758.5), d = fract(sin(dot(i+vec2(1,1), vec2(127.1,311.7)))*43758.5); return mix(mix(a,b,f.x), mix(c,d,f.x), f.y); }')
      .replace('#include <map_fragment>', '#include <map_fragment>\nfloat gn = hn(vLW.xz * .18) * .6 + hn(vLW.xz * .7) * .4; diffuseColor.rgb *= mix(.82, 1.14, gn) * mix(.95, 1.05, step(.5, fract(vLW.x / 1.7)));'); };
  return m; }
function siteMats() {
  if (SITE.grass) return SITE;
  const cv = document.createElement('canvas'); cv.width = cv.height = 512; const g = cv.getContext('2d'); seed = 91;
  g.fillStyle = '#5f7f3b'; g.fillRect(0, 0, 512, 512); for (let i = 0; i < 52000; i++) { g.fillStyle = `hsla(${76 + rnd() * 34},${32 + rnd() * 28}%,${18 + rnd() * 28}%,.55)`; const x = rnd() * 512, y = rnd() * 512; g.fillRect(x, y, 1, 2 + rnd() * 4); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  Object.assign(SITE, {
    grass: lawnMat(t), soil: std('#5a4837', { roughness: 1 }), concrete: std('#d7d2c9', { roughness: .92 }),
    paver: new THREE.MeshStandardMaterial({ map: TEX.travertine, roughness: .75 }), fence: new THREE.MeshStandardMaterial({ map: TEX.smoked, color: '#b39a83', roughness: .8 }), post: std('#3a2e26'),
    bark: std('#5a4636', { roughness: 1 }), mulch: std('#4a3426', { roughness: 1 }), leaf: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .85 }), stone: std('#9a948a', { roughness: .9 }),
    glow: new THREE.MeshStandardMaterial({ color: '#fff3dc', emissive: '#ffcf8a', emissiveIntensity: 0 }), metal: std('#2b2c30', { roughness: .5, metalness: .4 }), bin: std('#38443f', { roughness: .6 }), lid: std('#2a302d', { roughness: .6 }),
    wire: new THREE.LineBasicMaterial({ color: '#1d1a17' }), deck: surfMat('smoked', 'floor'), gdoor: std('#cfcac2', { roughness: .55 }), mail: std('#2d2f33', { roughness: .4, metalness: .3 }),
  });
  return SITE;
}
// foliage: smooth noisy blobs with baked colour, merged per tree so the whole garden is a handful of draw calls
function blob(r, cx, cy, cz, dark, light, squash = 1) {
  let g = new THREE.IcosahedronGeometry(r, 2); g.deleteAttribute('uv'); g.deleteAttribute('normal'); g = mergeVertices(g);
  const p = g.attributes.position, col = [], c = new THREE.Color(), v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const n = 1 + .13 * Math.sin(v.x * 7.1 + v.y * 4.3) * Math.cos(v.z * 6.7 - v.y * 3.1) + .06 * Math.sin(v.x * 17 + v.z * 13); v.multiplyScalar(n); v.y *= squash; p.setXYZ(i, v.x + cx, v.y + cy, v.z + cz);
    c.set(dark).lerp(cB.set(light), clamp(.5 + v.y / (r * 1.6) + .15 * Math.sin(v.x * 9 + v.z * 7), 0, 1)); col.push(c.r, c.g, c.b); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals(); return g;
}
function treeGeo(kind, s) {
  const parts = [];
  if (kind === 'pine') { for (let i = 0; i < 6; i++) { let g = new THREE.ConeGeometry((1.35 - i * .2) * s, 1.5 * s, 11, 1); g.deleteAttribute('uv'); g.deleteAttribute('normal'); g = mergeVertices(g); const p = g.attributes.position, col = [], c = new THREE.Color();
      for (let k = 0; k < p.count; k++) { const y = p.getY(k), a = Math.atan2(p.getZ(k), p.getX(k)); const n = 1 + .12 * Math.sin(a * 5 + i); p.setXYZ(k, p.getX(k) * n, y + (1.2 + i * .62) * s, p.getZ(k) * n); c.set('#1f3a26').lerp(cB.set('#3f6a3c'), clamp(.3 + y / (1.6 * s) + i * .06, 0, 1)); col.push(c.r, c.g, c.b); }
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals(); parts.push(g); } }
  else { parts.push(blob(1.15 * s, 0, 3.0 * s, 0, '#2e4f25', '#7da04a', .85)); seed += 13; for (let i = 0; i < 16; i++) { const a = rnd() * 6.283, el = rnd() * 1.3 - .35, rr = 1.05 * s; parts.push(blob((.42 + rnd() * .22) * s, Math.cos(a) * Math.cos(el) * rr, 3.0 * s + Math.sin(el) * rr * .85, Math.sin(a) * Math.cos(el) * rr, '#2e4f25', '#86a852')); } }
  return mergeGeometries(parts);
}
/* ───────────────────────── the garden: the lot around the house is the player's to build ─────────────────────────
   state.yard = { s: [[kind, x0, z0, x1, z1], …]  surfaces: pool, deck, paving, steps, bed, gravel
                  l: [[kind, x0, z0, x1, z1], …]  lines: fence, hedge, wall }   (house-local metres, ground level)
   Trees, planters and patio furniture are ordinary pieces with the `out` flag. The street side (sidewalk, driveway,
   front path, lamps, bins, mailbox) still follows the house. */
const GY0 = -.12;   // lawn level
const YS = { pool: 'Pool', deck: 'Deck', paving: 'Paving', steps: 'Stepping stones', bed: 'Flower bed', gravel: 'Gravel' }, YL = { fence: 'Fence', hedge: 'Hedge', wall: 'Low wall' };
const YH = { deck: .2, paving: .05, steps: .03, bed: .04, gravel: .035 };
const YPRICE = { pool: 900, deck: 180, paving: 120, steps: 60, bed: 40, gravel: 30, fence: 120, hedge: 90, wall: 160 };
// the lot and the street side, from the house alone
function lotOf(Sp) {
  const W = Sp.W, D = Sp.D, bx0 = Sp.x0, bz0 = Sp.z0, hx0 = Sp.hx0, x0 = bx0 - 3.6, x1 = W + 5.5, z0 = bz0 - 9.5, z1 = D + 6.5;
  const front = Sp.subs.filter(s => s.hz && s.ext && s.nOut === 1), mid = s => o => s.a0 + o[1] + o[2] / 2;
  let ex = (hx0 + W) / 2, ez = D, gx = null, gc = D;
  for (const k of ['s', 'd']) for (const s of front) for (const o of s.ops) if (o[0] === k) { ex = mid(s)(o); ez = s.c; }
  for (const s of front) for (const o of s.ops) if (o[0] === 'G') { gx = mid(s)(o); gc = s.c; }
  return { W, D, bx0, bz0, hx0, x0, x1, z0, z1, ex, ez, gx, gc, front, gz0: Math.max(bz0, D - 6.2), yard: [x0 + .25, z0 + .25, x1 - .25, z1 - 1.75],
    drive: gx != null ? [gx - 1.7, gc, gx + 1.7, z1] : null, path: [ex - .7, ez, ex + .7, z1] };
}
const spans = (a, b, gaps) => { let out = [[a, b]]; for (const [g0, g1] of gaps) out = out.flatMap(([p, q]) => g1 <= p || g0 >= q ? [[p, q]] : [[p, g0], [g1, q]]); return out.filter(([p, q]) => q - p > .5); };
// the garden every new home starts with: the one the site used to draw, now made of pieces the player can change
function defaultYard(S) {
  const L = lotOf(S), { W, D, bz0, hx0, x0, x1, z0, z1, ex, gx, gz0 } = L, s = [], l = [], it = [];
  const gaps = gx != null ? [[gx - 2.5, gx + 2.5]] : [];
  for (const [a, b] of spans(hx0 + .4, W - .4, [[ex - 1, ex + 1], ...gaps.map(([p, q]) => [p + .3, q - .3])])) s.push(['bed', a, D + .45, b, D + 1.25]);
  s.push(['bed', hx0 + .6, z0 + .9, Math.min(hx0 + (W - hx0) * .6, hx0 + 8), z0 + 1.9], ['bed', x1 - 1.8, bz0 - 6, x1 - .8, D - 1]);
  const dx0 = hx0 + .7, dx1 = Math.min(W - .7, hx0 + 7.6), dz0 = bz0 - 6.2, dz1 = bz0 - 2.4, cx = (dx0 + dx1) / 2;
  s.push(['deck', dx0, dz0, dx1, dz1], ['steps', cx - .45, dz1, cx + .45, bz0 - .35]);
  for (const [a, b] of spans(x0 + .5, x1 - .6, [[ex - .9, ex + .9], ...gaps])) l.push(['hedge', a, z1 - 2, b, z1 - 2]);
  l.push(['hedge', x0 + .5, gz0 - .3, x0 + .5, z1 - 2.2], ['fence', x0 + .2, z0 + .2, x1 - .2, z0 + .2], ['fence', x1 - .2, z0 + .2, x1 - .2, z1 - 2.6], ['fence', x0 + .2, z0 + .2, x0 + .2, gz0 - .6]);
  for (const [k, x, z] of [['treeL', hx0 + (W - hx0) * .22, z0 + 2.3], ['treeL', hx0 + (W - hx0) * .74, z0 + 2.0], ['treeM', x1 - 2.3, bz0 + (D - bz0) * .45], ['treeM', x1 - 2.4, z1 - 3.4]]) it.push([k, x, z, 0]);
  const tx = cx - .6, tz = (dz0 + dz1) / 2; it.push(['gtable', tx, tz, 0]); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + .4; it.push(['gchair', tx + Math.sin(a) * .85, tz + Math.cos(a) * .85, a + Math.PI]); }
  it.push(['lounger', dx1 - .55, (dz0 + dz1) / 2, 0], ['planter', dx0 + .35, dz0 + .35, 0], ['glantern', dx1 - .3, dz1 - .3, 0]);
  return { yard: { s, l }, items: it };
}
// keep the garden consistent with the house: nothing built inside rooms, nothing off the lot
function fitYard(S) {
  const L = lotOf(S), Y = state.yard, house = S.rooms.flatMap(r => r.r.map(q => [q[0] - .3, q[1] - .3, q[2] + .3, q[3] + .3])), lot = L.yard;
  Y.s = Y.s.flatMap(e => { let rs = [[Math.max(e[1], lot[0]), Math.max(e[2], lot[1]), Math.min(e[3], lot[2]), Math.min(e[4], lot[3])]]; for (const h of house) rs = rs.flatMap(q => rectMinus(q, h)); return rs.filter(q => q[2] - q[0] > .4 && q[3] - q[1] > .4).map(q => [e[0], ...q]); });
  Y.l = Y.l.flatMap(e => { const hz = e[2] === e[4], c = hz ? e[2] : e[1]; let segs = [[Math.min(hz ? e[1] : e[2], hz ? e[3] : e[4]), Math.max(hz ? e[1] : e[2], hz ? e[3] : e[4])]];
    const lo = hz ? lot[0] : lot[1], hi = hz ? lot[2] : lot[3]; if (c < (hz ? lot[1] : lot[0]) - .3 || c > (hz ? lot[3] : lot[2]) + .3) return [];
    segs = segs.map(([a, b]) => [Math.max(a, lo - .3), Math.min(b, hi + .3)]);
    for (const h of house) { const cross = hz ? c > h[1] && c < h[3] : c > h[0] && c < h[2]; if (cross) segs = segs.flatMap(([a, b]) => { const g0 = hz ? h[0] : h[1], g1 = hz ? h[2] : h[3]; return g1 <= a || g0 >= b ? [[a, b]] : [[a, g0], [g1, b]]; }); }
    return segs.filter(([a, b]) => b - a > .5).map(([a, b]) => hz ? [e[0], a, c, b, c] : [e[0], c, a, c, b]); });
  // garden pieces past a shrunken lot are brought back inside it; only those the house now stands on are removed
  for (const it of [...state.items]) { if (!CAT[it.k].out) continue; const m = Math.max(CAT[it.k].dim[0], CAT[it.k].dim[1]) / 2 + .1;
    it.x = clamp(it.x, lot[0] + m, lot[2] - m); it.z = clamp(it.z, lot[1] + m, lot[3] - m);
    if (house.some(h => it.x > h[0] - m && it.x < h[2] + m && it.z > h[1] - m && it.z < h[3] + m)) { if (OBJ[it.id]) dropObj(it); state.items.splice(state.items.indexOf(it), 1); } }
}
function ensureYard(S) { if (state.yard) return; const d = defaultYard(S); state.yard = d.yard; for (const [k, x, z, r] of d.items) state.items.push(newInst(k, { x, z, r, f: 0 })); }
const yardAt = (x, z) => state.yard ? state.yard.s.find(e => x > e[1] && x < e[3] && z > e[2] && z < e[4]) || null : null;
const groundY = (x, z) => { const e = yardAt(x, z); return GY0 + (e ? YH[e[0]] || 0 : 0); };
const baseY = it => CAT[it.k].out ? groundY(it.x, it.z) : (it.y || 0);
function yardCost() { if (!state.yard) return 0; let s = 0; for (const e of state.yard.s) s += (e[3] - e[1]) * (e[4] - e[2]) * YPRICE[e[0]]; for (const e of state.yard.l) s += Math.hypot(e[3] - e[1], e[4] - e[2]) * YPRICE[e[0]]; return s; }

/* drawing it: the lawn is cut round pools; each surface and line has its own look */
let POOLM = null;
function poolMats() {
  if (POOLM) return POOLM;
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const g = cv.getContext('2d'); g.fillStyle = '#b9e2e8'; g.fillRect(0, 0, 256, 256); seed = 515;
  for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(${rnd() < .5 ? '255,255,255' : '90,150,170'},.08)`; g.fillRect(rnd() * 256, rnd() * 256, 2 + rnd() * 6, 2 + rnd() * 6); }
  g.strokeStyle = 'rgba(70,120,135,.55)'; g.lineWidth = 2; for (let x = 0; x <= 256; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); g.beginPath(); g.moveTo(0, x); g.lineTo(256, x); g.stroke(); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  const tile = new THREE.MeshStandardMaterial({ map: t, roughness: .35, emissive: '#3fc6dc', emissiveIntensity: 0 });
  const water = new THREE.MeshStandardMaterial({ color: '#2f9fb3', roughness: .04, metalness: .05, transparent: true, opacity: .62, depthWrite: false });
  water.userData.roomtoneAnimated = true;
  water.onBeforeCompile = sh => { sh.uniforms.uT = natTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWq;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWq = (modelMatrix * vec4(transformed, 1.)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWq; uniform float uT;')
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        { vec2 p = vWq.xz; float t = uT;
          vec2 d = vec2(cos(p.x * 3.1 + t * 1.3) + .6 * cos(p.x * 7.3 - p.y * 4.1 + t * 2.1) + .3 * cos(p.y * 11. + t * 2.9),
                        cos(p.y * 2.7 - t * 1.1) + .6 * cos(p.y * 6.1 + p.x * 3.7 - t * 1.7) + .3 * cos(p.x * 12.3 - t * 3.1)) * .045;
          normal = normalize(normal + (viewMatrix * vec4(d.x, 0., d.y, 0.)).xyz); }`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(.02, .09, .11);'); };
  return POOLM = { tile, water, coping: new THREE.MeshStandardMaterial({ map: TEX.travertine, color: '#f1ebe0', roughness: .7 }) };
}
let GRAVEL = null;
function gravelMat() { if (GRAVEL) return GRAVEL; const cv = document.createElement('canvas'); cv.width = cv.height = 256; const g = cv.getContext('2d'); g.fillStyle = '#c9c2b5'; g.fillRect(0, 0, 256, 256); seed = 616;
  for (let i = 0; i < 2600; i++) { const v = 150 + rnd() * 90 | 0; g.fillStyle = `rgb(${v},${v - 6},${v - 14})`; g.beginPath(); g.ellipse(rnd() * 256, rnd() * 256, 1 + rnd() * 2.2, 1 + rnd() * 1.6, rnd() * 3, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return GRAVEL = new THREE.MeshStandardMaterial({ map: t, roughness: 1 }); }
function buildSite(Sp) {
  ensureYard(Sp); fitYard(Sp);
  const S = siteMats(), Lt = lotOf(Sp), { W, D, bz0, hx0, x0, x1, z0, z1, ex, ez, gx, gc } = Lt, gy = GY0, site = new THREE.Group(), lw = x1 - x0, ld = z1 - z0, Y = state.yard;
  P.site = site; P.arch.add(site); P.lot = { x0, x1, z0, z1 }; seed = 77; const box = (w, h, d, m, x, y, z, o) => B(w, h, d, m, x, y, z, site, o || {});
  // model base: soil sides; the lawn on top is a sheet with holes where pools go
  { const hide = new THREE.MeshBasicMaterial({ visible: false }); box(lw, gy - GY - .001, ld, [S.soil, S.soil, hide, S.soil, S.soil, S.soil], (x0 + x1) / 2, GY, (z0 + z1) / 2, { noCast: true });
    const sh = new THREE.Shape(); sh.moveTo(x0, -z0); sh.lineTo(x1, -z0); sh.lineTo(x1, -z1); sh.lineTo(x0, -z1); sh.closePath();
    for (const e of Y.s) if (e[0] === 'pool') { const h = new THREE.Path(); h.moveTo(e[1], -e[2]); h.lineTo(e[1], -e[4]); h.lineTo(e[3], -e[4]); h.lineTo(e[3], -e[2]); h.closePath(); sh.holes.push(h); }
    const g = new THREE.ShapeGeometry(sh); g.rotateX(-Math.PI / 2); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 1.07, uv.getY(i) * 1.07);
    const m = new THREE.Mesh(g, S.grass); m.position.y = gy; m.receiveShadow = true; site.add(m); }
  // street side: sidewalk and kerb, driveway to the garage door, stepping-stone path to the entry door
  box(lw, .05, 1.5, S.concrete, (x0 + x1) / 2, gy, z1 - .85); box(lw, .12, .14, S.stone, (x0 + x1) / 2, gy, z1 - .07);
  if (gx != null) { box(3.2, .04, z1 - 1.6 - gc, S.concrete, gx, gy, (gc + z1 - 1.6) / 2); for (let z = gc + 2; z < z1 - 1.7; z += 2) box(3.2, .045, .03, S.post, gx, gy, z, { noCast: true }); }
  for (let z = ez + .75; z < z1 - 1.8; z += .78) RB(1.0, .05, .52, .05, S.paver, ex + (rnd() - .5) * .08, gy, z, site);
  // the garden's surfaces
  const flowers = [], PM = poolMats(), pav = SITE.pav || (SITE.pav = surfMat('travertine', 'floor'));
  for (const e of Y.s) { const [k, a0, b0, a1, b1] = e, w = a1 - a0, d = b1 - b0, cx = (a0 + a1) / 2, cz = (b0 + b1) / 2;
    if (k === 'pool') { const dep = gy - GY - .04, cp = .32;
      for (const [bw, bd, x, z] of [[w + 2 * cp, cp, cx, b0 - cp / 2], [w + 2 * cp, cp, cx, b1 + cp / 2], [cp, d, a0 - cp / 2, cz], [cp, d, a1 + cp / 2, cz]]) box(bw, .06, bd, PM.coping, x, gy, z);
      for (const [bw, bd, x, z] of [[w, .04, cx, b0 + .02], [w, .04, cx, b1 - .02], [.04, d, a0 + .02, cz], [.04, d, a1 - .02, cz]]) box(bw, dep, bd, PM.tile, x, GY + .04, z, { noCast: true });
      box(w, .02, d, PM.tile, cx, GY + .02, cz, { noCast: true });
      const wt = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), PM.water); wt.position.set(cx, gy - .07, cz); wt.renderOrder = 2; site.add(wt); }
    else if (k === 'deck') { box(w, YH.deck, d, [S.post, S.post, S.deck, S.post, S.post, S.post], cx, gy, cz);
      if (w * d >= 9) { const posts = [[a0 + .1, b0 + .1], [a1 - .1, b0 + .1], [a1 - .1, b1 - .1], [a0 + .1, b1 - .1]], hT = 2.5, bulbs = [], dh = YH.deck;   // festoon lights over a big deck
        for (const [x, z] of posts) box(.07, hT, .07, S.post, x, gy + dh, z);
        const strand = (a, b) => { const pts = []; for (let i = 0; i <= 14; i++) { const t = i / 14, y = gy + dh + hT - .05 - .42 * 4 * t * (1 - t); pts.push(new THREE.Vector3(a[0] + (b[0] - a[0]) * t, y, a[1] + (b[1] - a[1]) * t)); if (i % 2 && i < 14) bulbs.push(pts[pts.length - 1].clone().setY(y - .07)); } site.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), S.wire)); };
        strand(posts[0], posts[2]); strand(posts[1], posts[3]); strand(posts[0], posts[1]); strand(posts[3], posts[2]);
        const im = new THREE.InstancedMesh(new THREE.SphereGeometry(.045, 8, 6), S.glow, bulbs.length), mt = new THREE.Matrix4(); bulbs.forEach((p, i) => { mt.makeTranslation(p.x, p.y, p.z); im.setMatrixAt(i, mt); }); site.add(im);
        const l = new THREE.PointLight('#ffc98f', 0, 7, 1.6); l.position.set(cx, gy + dh + 2.1, cz); l.userData.I = 2.2; site.add(l); OUTL.push(l); } }
    else if (k === 'paving') { const m = box(w, YH.paving, d, [S.stone, S.stone, pav, S.stone, S.stone, S.stone], cx, gy, cz); m.receiveShadow = true; }
    else if (k === 'gravel') box(w, YH.gravel, d, gravelMat(), cx, gy, cz, { noCast: true });
    else if (k === 'steps') { const along = w >= d, n = Math.max(1, Math.floor((along ? w : d) / .78)); for (let i = 0; i < n; i++) { const t = (i + .5) / n; RB(along ? .52 : Math.min(1.0, w), .05, along ? Math.min(1.0, d) : .52, .05, S.paver, along ? a0 + w * t : cx + (rnd() - .5) * .06, gy, along ? cz : b0 + d * t, site); } }
    else if (k === 'bed') { box(w, YH.bed, d, S.mulch, cx, gy, cz, { noCast: true }); const along = w >= d, len = along ? w : d, cross = along ? d : w;
      for (let u = .5; u < len - .3; u += .95 + rnd() * .3) addShrub(along ? a0 + u : cx + (rnd() - .5) * cross * .3, gy, along ? cz + (rnd() - .5) * cross * .3 : b0 + u, Math.min(.42 + rnd() * .2, cross * .45));
      for (let i = 0; i < w * d * 5; i++) flowers.push([a0 + rnd() * w, b0 + rnd() * d]); } }
  if (flowers.length) { const fg = new THREE.SphereGeometry(.05, 6, 4), cols = ['#f2e6d8', '#e9a6b8', '#f3c25c', '#c9a0e8', '#ffffff']; const im = new THREE.InstancedMesh(fg, std('#ffffff', { roughness: .7 }), flowers.length); const mt = new THREE.Matrix4(), c = new THREE.Color();
    flowers.forEach(([x, z], i) => { mt.makeTranslation(x, gy + .22 + rnd() * .14, z); im.setMatrixAt(i, mt); im.setColorAt(i, c.set(cols[i % cols.length])); }); site.add(im); }
  // the garden's lines: horizontal-board fences on posts, clipped hedges, low rendered walls
  for (const e of Y.l) { const [k, ax, az, bx, bz] = e, L = Math.hypot(bx - ax, bz - az), hz = az === bz, cx = (ax + bx) / 2, cz = (az + bz) / 2; if (L < .3) continue;
    if (k === 'hedge') addHedge(ax, az, bx, bz, gy);
    else if (k === 'fence') { for (let j = 0; j < 7; j++) { const y = gy + .12 + j * .24; if (hz) box(L, .17, .035, S.fence, cx, y, cz); else box(.035, .17, L, S.fence, cx, y, cz); }
      for (let t0 = 0; t0 <= L + .01; t0 += 2.4) { const t = Math.min(t0 / L, 1); box(.09, 1.82, .09, S.post, ax + (bx - ax) * t, gy, az + (bz - az) * t); } }
    else if (k === 'wall') { if (hz) { box(L + .3, .7, .3, X.shell, cx, gy, cz); box(L + .36, .05, .36, PM.coping, cx, gy + .7, cz); } else { box(.3, .7, L + .3, X.shell, cx, gy, cz); box(.36, .05, L + .36, PM.coping, cx, gy + .7, cz); } } }
  // garden lights along the path and the driveway, lanterns beside the doors, bins and a mailbox
  const onFront = (x, c) => Lt.front.some(s => Math.abs(s.c - c) < .01 && x > s.a0 + .1 && x < s.a1 - .1);
  const bollard = (x, z) => { C(.06, .07, .55, S.metal, x, gy, z, site, { seg: 10 }); C(.065, .065, .07, S.glow, x, gy + .5, z, site, { seg: 10, noCast: true }); };
  for (let z = ez + 1.6; z < z1 - 2.2; z += 1.9) { bollard(ex - .85, z); bollard(ex + .85, z); } if (gx != null) for (let z = gc + 1.2; z < z1 - 2; z += 2.2) bollard(gx - 2.25, z);
  const lantern = (x, z, I) => { if (!onFront(x, z - .2)) return; box(.16, .3, .12, S.metal, x, 1.85, z); box(.11, .2, .13, S.glow, x, 1.9, z, { noCast: true }); if (I) { const l = new THREE.PointLight('#ffc98f', 0, 5, 1.7); l.position.set(x, 2.0, z + .5); l.userData.I = I; site.add(l); OUTL.push(l); } };
  lantern(ex - .8, ez + .2, 1.4); lantern(ex + .8, ez + .2); if (gx != null) { lantern(gx - 1.75, gc + .2, 1.2); lantern(gx + 1.75, gc + .2); }
  for (let i = 0; i < 2; i++) { const bx = x0 + .7 + i * .7, bz = D - 1.4; if (yardAt(bx, bz)) continue; box(.58, .95, .62, S.bin, bx, gy, bz); box(.62, .05, .66, S.lid, bx, gy + .95, bz); }
  box(.07, 1.0, .07, S.post, ex + 1.5, gy, z1 - 1.85); RB(.24, .22, .46, .08, S.mail, ex + 1.5, gy + 1.0, z1 - 1.85, site);
  flushNature(site);
  const cx = (hx0 + W) / 2, cz = (bz0 + D) / 2, r = Math.max(Math.abs(x0 - cx), Math.abs(x1 - cx), Math.abs(z0 - cz), Math.abs(z1 - cz)) + .5; Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: 110 }); sun.shadow.camera.updateProjectionMatrix();
}

/* garden tools in build mode */
const YTOOLS = [['pool', 'Pool', 'pool'], ['deck', 'Deck', 'deckt'], ['paving', 'Paving', 'paving'], ['steps', 'Stepping stones', 'stepst'], ['bed', 'Flower bed', 'bedt'], ['gravel', 'Gravel', 'gravel'], ['fence', 'Fence', 'fencet'], ['hedge', 'Hedge', 'hedget'], ['wall', 'Low wall', 'wallt'], ['yerase', 'Erase', 'erase']];
const YHINT = { pool: 'Drag on the lawn to dig a pool.', deck: 'Drag to lay a timber deck. Big decks get festoon lights.', paving: 'Drag to lay stone paving.', steps: 'Drag a strip for a path of stepping stones.', bed: 'Drag to plant a flower bed.', gravel: 'Drag to spread gravel.', fence: 'Drag along the lawn to put up a fence.', hedge: 'Drag to plant a hedge.', wall: 'Drag to build a low garden wall.', yerase: 'Click a pool, a deck, a bed or a fence to take it out. Garden pieces go with Delete, like furniture.' };
const isLine = k => k === 'fence' || k === 'hedge' || k === 'wall';
function yardWhy(k, q) {
  const Lt = lotOf(LV[0].S), y = Lt.yard, house = LV[0].S.rooms.flatMap(r => r.r.map(p => [p[0] - .25, p[1] - .25, p[2] + .25, p[3] + .25]));
  if (isLine(k)) { const len = Math.hypot(q[2] - q[0], q[3] - q[1]); if (len < 1) return 'Drag at least a metre';
    if (Math.min(q[0], q[2]) < y[0] - .3 || Math.max(q[0], q[2]) > y[2] + .3 || Math.min(q[1], q[3]) < y[1] - .3 || Math.max(q[1], q[3]) > y[3] + .3) return 'That runs off the lot';
    for (let t = 0; t <= 1; t += .05) { const x = q[0] + (q[2] - q[0]) * t, z = q[1] + (q[3] - q[1]) * t; if (house.some(h => x > h[0] && x < h[2] && z > h[1] && z < h[3])) return 'It would run through the house'; } return null; }
  if (q[2] - q[0] < 1 || q[3] - q[1] < 1) return 'At least 1 m a side';
  if (k === 'pool' && (q[2] - q[0] < 2 || q[3] - q[1] < 1.5)) return 'A pool needs at least 2 × 1.5 m';
  if (q[0] < y[0] || q[1] < y[1] || q[2] > y[2] || q[3] > y[3]) return 'That runs off the lot';
  if (house.some(h => overlapR(q, h))) return 'That runs into the house';
  if (k !== 'paving' && k !== 'gravel' && k !== 'steps') { if (Lt.drive && overlapR(q, Lt.drive)) return 'That would block the driveway'; if (overlapR(q, Lt.path)) return 'That would block the front path'; }
  if (k === 'pool') for (const it of state.items) if (CAT[it.k].out && it.x > q[0] - .3 && it.x < q[2] + .3 && it.z > q[1] - .3 && it.z < q[3] + .3) return `The ${lc(CAT[it.k].n)} is in the way`;
  return null;
}
function yardEdit(fn, msg) { pushHist(); fn(state.yard); rebuildAll(); buildMarks(); commit(); toast(msg, 'Undo', undo); }
function addYard(k, q) { const area = (q[2] - q[0]) * (q[3] - q[1]);
  if (isLine(k)) yardEdit(Y => Y.l.push([k, ...q]), `${YL[k]} added, ${fm(Math.hypot(q[2] - q[0], q[3] - q[1]))} m`);
  // a pool takes over whatever it is dug into; anything else is laid round existing pools
  else yardEdit(Y => { let mine = [q]; if (k !== 'pool') for (const e of Y.s) if (e[0] === 'pool') mine = mine.flatMap(r => rectMinus(r, e.slice(1)));
    Y.s = Y.s.flatMap(e => k !== 'pool' && e[0] === 'pool' ? [e] : rectMinus(e.slice(1), q).map(r => [e[0], ...r])); for (const r of mine) if (r[2] - r[0] > .2 && r[3] - r[1] > .2) Y.s.push([k, ...r]); },
    `${YS[k]} added, ${fm(q[2] - q[0])} × ${fm(q[3] - q[1])} m · ${money(area * YPRICE[k])}`); }
function yardHit(q) { const Y = state.yard; for (const e of Y.l) { const hz = e[2] === e[4], d = hz ? Math.abs(q.z - e[2]) : Math.abs(q.x - e[1]), u = hz ? q.x : q.z, a = Math.min(hz ? e[1] : e[2], hz ? e[3] : e[4]), b = Math.max(hz ? e[1] : e[2], hz ? e[3] : e[4]); if (d < .45 && u > a - .2 && u < b + .2) return { line: e }; }
  const s = yardAt(q.x, q.z); return s ? { surf: s } : null; }
function yardLine(a, b) { const dx = b.x - a.x, dz = b.z - a.z; return Math.abs(dx) >= Math.abs(dz) ? [a.x, a.z, b.x, a.z] : [a.x, a.z, a.x, b.z]; }
const YMK = new THREE.LineBasicMaterial({ color: '#ffffff', depthTest: false, transparent: true, opacity: .9 });
function showLine(q, bad) { const e = q; bOp.material.color.set(bad ? '#d23a2a' : '#4f7a5a'); const hz = e[1] === e[3], L = Math.max(.1, Math.hypot(e[2] - e[0], e[3] - e[1])); if (hz) { bOp.scale.set(L, 1.2, .3); bOp.position.set((e[0] + e[2]) / 2, GY0 + .6, e[1]); } else { bOp.scale.set(.3, 1.2, L); bOp.position.set(e[0], GY0 + .6, (e[1] + e[3]) / 2); } bOp.visible = true; }
function yardHover(cx, cy, q) {
  const t = build.tool; canvas.style.cursor = 'crosshair';
  if (t === 'yerase') { const h = yardHit(q); if (!h) return showTip(cx, cy, 'Point at a garden surface or a fence');
    if (h.line) { showLine(h.line.slice(1), true); return showTip(cx, cy, YL[h.line[0]], 'Click to take it out'); } showRects([h.surf.slice(1)], false, 'ys' + h.surf.join()); return showTip(cx, cy, YS[h.surf[0]], 'Click to take it out'); }
  const x = Math.floor(q.x * 2) / 2, z = Math.floor(q.z * 2) / 2; showRect([x, z, x + .5, z + .5], 'cell'); showTip(cx, cy, isLine(t) ? `Drag to put up a ${lc(YL[t])}` : `Drag to lay ${t === 'pool' ? 'a pool' : t === 'bed' ? 'a flower bed' : lc(YS[t])}`, `${money(YPRICE[t])} per ${isLine(t) ? 'metre' : 'm²'}`);
}
function yardClick(q) { if (build.tool !== 'yerase') return toast('Drag to draw it'); const h = yardHit(q); if (!h) return;
  if (h.line) yardEdit(Y => { Y.l = Y.l.filter(e => e !== h.line); }, YL[h.line[0]] + ' removed'); else yardEdit(Y => { Y.s = Y.s.filter(e => e !== h.surf); }, YS[h.surf[0]] + ' removed'); }
function renderYardTools() {
  const tg = el('div', 'btools'); for (const [k, n, ic] of YTOOLS) { const b = el('button', 'bt' + (build.tool === k ? ' on' : ''), svg(ic, 20) + `<span>${n}</span>`); b.onclick = () => { build.tool = k; render(); }; tg.append(b); } G(null, '', tg);
  const Y = state.yard, st = el('p', 'note', `${Y.s.filter(e => e[0] === 'pool').length ? 'A pool, ' : ''}${Y.s.length} surface${Y.s.length === 1 ? '' : 's'}, ${Y.l.length} fence and hedge run${Y.l.length === 1 ? '' : 's'}, built for ${money(yardCost())}. Trees and patio pieces are in Furnish → Garden.`);
  const done = el('button', 'cta', 'Done'); done.onclick = () => exitBuild(); G(null, 'end w260', st, done);
}
function planSVGc(rooms) {   // a drawn layout, for the plan list
  const b = bbox(rooms), tw = b.x1 - b.x0, td = b.z1 - b.z0, s = 1 / Math.max(tw, td * 1.4) * 60, ox = (62 - tw * s) / 2 - b.x0 * s, oy = (44 - td * s) / 2 - b.z0 * s; let h = '';
  for (const r of rooms) for (const q of r.r) h += `<rect x="${ox + q[0] * s}" y="${oy + q[1] * s}" width="${(q[2] - q[0]) * s}" height="${(q[3] - q[1]) * s}" fill="${r.t === 'bath' ? '#d9e0dc' : r.t === 'kitchen' ? '#eadfcb' : r.t === 'bedroom' ? '#e7ddd2' : r.t === 'garage' ? '#d6d2cb' : '#f3eee4'}" stroke="#24211d" stroke-width=".8"/>`;
  return `<svg viewBox="0 0 62 44">${h}</svg>`;
}
function planSVG(p) {
  const q = withGarage(p), tw = p.W + GW, s = 1 / Math.max(tw, p.D * 1.4) * 60, ox = (62 - tw * s) / 2 + GW * s, oy = (44 - p.D * s) / 2; let h = '';
  for (const r of q.rooms) for (const b of r.r) h += `<rect x="${ox + b[0] * s}" y="${oy + b[1] * s}" width="${(b[2] - b[0]) * s}" height="${(b[3] - b[1]) * s}" fill="${r.t === 'bath' ? '#d9e0dc' : r.t === 'kitchen' ? '#eadfcb' : r.t === 'bedroom' ? '#e7ddd2' : r.t === 'garage' ? '#d6d2cb' : '#f3eee4'}"/>`;
  for (const w of [...q.walls, ...q.gwalls]) { const outer = w[5] || (w[0] === 0 && w[2] === 0) || (w[1] === 0 && w[3] === 0) || w[0] === p.W || w[1] === p.D; h += `<line x1="${ox + w[0] * s}" y1="${oy + w[1] * s}" x2="${ox + w[2] * s}" y2="${oy + w[3] * s}" stroke="#24211d" stroke-width="${outer ? 1.6 : .9}" stroke-linecap="square"/>`; }
  return `<svg viewBox="0 0 62 44">${h}</svg>`;
}

/* garage catalog: a car you can respray, storage and a charger */
GROUPS.garage = 'Garage';
def('car', 'Electric car', 'garage', [1.96, 4.72, 1.45], { a: ['Paint', ['paint'], 'silver'] }, (g, M) => {
  if (CARMODEL) { const c = CARMODEL.clone(true), id = M.a.userData.mat, paint = new THREE.MeshPhysicalMaterial({ color: MATS[id].a, metalness: .55, roughness: .3, clearcoat: 1, clearcoatRoughness: .05 }); paint.userData = { ...M.a.userData, paint: true }; M.a.dispose(); M.a = paint;
    c.traverse(m => { if (m.isMesh && /^Paint 1/.test(m.material.name || '')) m.material = paint; }); g.add(c); return; }
  M.a.userData.rough = .3; M.a.roughness = .3; M.a.metalness = .45;
  const ext = (pts, depth, bev, mat, xoff = 0) => { const sh = new THREE.Shape(); pts.forEach(([z, y], i) => i ? sh.lineTo(z, y) : sh.moveTo(z, y)); sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: bev * .85, bevelSegments: 4, steps: 1, curveSegments: 6 }); geo.translate(0, 0, -depth / 2); geo.rotateY(-Math.PI / 2);
    const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * TS, uv.getY(i) * TS); return put(new THREE.Mesh(geo, mat), g, xoff, 0, 0, {}); };
  ext([[-2.3, .3], [-2.34, .55], [-2.2, .74], [-1.25, .86], [1.75, .95], [2.26, .88], [2.32, .66], [2.3, .3]], 1.72, .1, M.a);
  ext([[-1.32, .84], [-.62, 1.3], [.7, 1.38], [1.8, .95], [1.62, .9]], 1.36, .16, std('#161a20', { roughness: .06, metalness: .6 }));
  for (const sx of [-1, 1]) for (const z of [1.46, -1.5]) { const a = new THREE.Mesh(new THREE.CylinderGeometry(.47, .47, .06, 28, 1, false, 0, Math.PI), std('#121214', { roughness: .9 })); a.rotation.set(0, Math.PI / 2, Math.PI / 2); a.position.set(sx * .955, .36, z); g.add(a); }
  for (const [x, z] of [[-.84, 1.46], [.84, 1.46], [-.84, -1.5], [.84, -1.5]]) { C(.37, .37, .27, std('#18181a', { roughness: .8 }), x, .37 - .135, z, g, { seg: 28, rz: Math.PI / 2 }).position.set(x, .37, z); C(.24, .24, .28, X.steel, x, .37, z, g, { seg: 20, rz: Math.PI / 2 }).position.set(x, .37, z); }
  B(1.62, .035, .04, new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.7, 1.9) }), 0, .78, 2.37, g, { noCast: true }); B(1.7, .05, .04, new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, .12, .1) }), 0, .82, -2.38, g, { noCast: true });
  for (const sx of [-1, 1]) B(.14, .06, .08, M.a, sx * 1.0, 1.0, .95, g); B(1.9, .2, 4.5, std('#1c1c1e', { roughness: .9 }), 0, .14, 0, g, { noCast: true });
}, { wall: 0 });
def('shelving', 'Garage shelving', 'garage', [1.22, .46, 1.9], {}, g => { const m = X.black; for (const [x, z] of [[-.58, -.2], [.58, -.2], [-.58, .2], [.58, .2]]) B(.04, 1.9, .04, m, x, 0, z, g); seed = 17;
  for (let i = 0; i < 4; i++) { const y = .12 + i * .55; B(1.2, .03, .44, std('#8c8478'), 0, y, 0, g); let x = -.52; while (x < .45) { const w = .26 + rnd() * .2, h = .2 + rnd() * .2; B(w, h, .34, rnd() < .5 ? std('#c2a27c', { roughness: .9 }) : std('#4d5a63', { roughness: .6 }), x + w / 2, y + .03, 0, g); x += w + .04; } } }, { wall: 1 });
def('workbench', 'Workbench', 'garage', [1.6, .66, .95], { a: ['Top', WP, 'honey'] }, (g, M) => { B(1.6, .05, .66, M.a, 0, .88, 0, g); legs(g, 1.56, .6, .88, X.black, .05, .04); B(1.5, .03, .55, X.black, 0, .25, 0, g); B(1.6, .8, .03, std('#d9cfc0'), 0, .93, -.31, g);
  for (let i = 0; i < 5; i++) B(.04, .2 + (i % 2) * .1, .03, X.steel, -.55 + i * .26, 1.3, -.28, g); B(.38, .2, .24, std('#b0402c', { roughness: .5 }), .5, .93, .1, g); }, { wall: 1, top: .93 });
def('charger', 'Car charger', 'garage', [.34, .46, .14], {}, g => { RB(.3, .42, .12, .04, X.white, 0, 0, .06, g); C(.03, .03, .02, new THREE.MeshBasicMaterial({ color: new THREE.Color(.3, 1.6, .7) }), 0, .3, .125, g, { rx: Math.PI / 2 }).position.set(0, .3, .125);
  const t = new THREE.Mesh(new THREE.TorusGeometry(.16, .018, 8, 24, 5.2), X.black); t.position.set(0, -.12, .1); t.rotation.set(0, 0, 1.6); g.add(t); }, { mount: 1.0 });

/* garden pieces: trees and shrubs grown with the same leaf cards as the site, patio furniture, lights */
GROUPS.garden = 'Garden';
def('treeL', 'Shade tree', 'garden', [1.1, 1.1, 6.4], {}, g => { seed = 701; addTree('round', 0, 0, 0, 1.15); flushNature(g); }, { out: 1, price: 650 });
def('treeM', 'Small tree', 'garden', [.9, .9, 4.6], {}, g => { seed = 733; addTree('round', 0, 0, 0, .82); flushNature(g); }, { out: 1, price: 380 });
def('shrub', 'Shrub', 'garden', [.9, .9, .8], {}, g => { seed = 757; addShrub(0, 0, 0, .5); flushNature(g); }, { out: 1, price: 85 });
def('planter', 'Planter', 'garden', [.7, .7, 1.6], { a: ['Pot', ['stone', 'paint'], 'concrete'] }, (g, M) => { RB(.66, .55, .66, .06, M.a, 0, 0, 0, g); C(.29, .29, .02, X.soil, 0, .53, 0, g, { seg: 16 }); seed = 53; plant(g, 'bird', 0, .5, 0, 1.0, null); }, { out: 1 });
def('gtable', 'Patio table', 'garden', [1.2, 1.2, .76], { a: ['Top', ST, 'whiteoak'] }, (g, M) => CAT.diningR.build(g, M), { out: 1 });
def('gchair', 'Patio chair', 'garden', [.44, .46, .88], { a: ['Frame', WOOD, 'whiteoak'], b: ['Seat pad', FAB, 'linen'] }, (g, M) => CAT.chair.build(g, M), { out: 1 });
def('lounger', 'Sun lounger', 'garden', [.72, 1.95, .7], { a: ['Frame', WOOD, 'smoked'], b: ['Cushion', FAB, 'linen'] }, (g, M) => {
  B(.68, .06, 1.9, M.a, 0, .26, 0, g); for (const sx of [-1, 1]) for (const sz of [-1, 1]) B(.05, .26, .05, M.a, sx * .3, 0, sz * .85, g);
  RB(.64, .08, 1.25, .035, M.b, 0, .32, .3, g); const back = new THREE.Group(); back.position.set(0, .33, -.32); back.rotation.x = .75; g.add(back); RB(.64, .07, .62, .03, M.b, 0, 0, -.31, back); B(.68, .04, .66, M.a, 0, -.05, -.31, back); }, { out: 1 });
def('parasol', 'Parasol', 'garden', [.5, .5, 2.5], { a: ['Canopy', FAB, 'linen'] }, (g, M) => { C(.24, .26, .08, X.black, 0, 0, 0, g, { seg: 20 }); C(.022, .022, 2.35, std('#d9cfc0'), 0, .08, 0, g, { seg: 8 });
  const cn = new THREE.Mesh(new THREE.ConeGeometry(1.35, .42, 16, 1, true), M.a); cn.material.side = THREE.DoubleSide; put(cn, g, 0, 2.28, 0, {}); }, { out: 1 });
def('firepit', 'Fire pit', 'garden', [1.0, 1.0, .5], {}, g => { seed = 88; for (let i = 0; i < 14; i++) { const a = i / 14 * 6.283; RB(.22, .3, .16, .05, std('#8d857a', { roughness: .95 }), Math.cos(a) * .4, 0, Math.sin(a) * .4, g, { ry: -a }); }
  C(.32, .32, .06, X.soil, 0, 0, 0, g, { seg: 18 }); for (let i = 0; i < 5; i++) B(.5, .07, .08, std('#4a3426'), 0, .07 + i * .02, 0, g, { ry: i * .7 }); const e = new THREE.Mesh(new THREE.SphereGeometry(.2, 12, 8), X.shade); e.scale.y = .45; put(e, g, 0, .12, 0, { noCast: true }); },
  { out: 1, lamp: [0, .6, 0, 3.0] });
def('bbq', 'Barbecue', 'garden', [.7, .6, 1.05], {}, g => { const k = std('#1d1e21', { roughness: .4, metalness: .4 }); for (const [x, z] of [[-.2, -.15], [.2, -.15], [0, .2]]) C(.02, .02, .62, X.steel, x, 0, z, g, { seg: 6 });
  const b = new THREE.Mesh(new THREE.SphereGeometry(.32, 20, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), k); put(b, g, 0, .9, 0, {}); const lid = new THREE.Mesh(new THREE.SphereGeometry(.32, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2.4), k); put(lid, g, 0, .9, 0, {}); C(.03, .03, .05, X.chrome, 0, 1.2, 0, g, { seg: 8 }); }, { out: 1 });
def('glantern', 'Garden lantern', 'garden', [.3, .3, 1.1], {}, g => { C(.05, .06, .85, X.black, 0, 0, 0, g, { seg: 10 }); B(.2, .26, .2, X.black, 0, .85, 0, g); B(.15, .2, .15, X.shade, 0, .88, 0, g, { noCast: true }); }, { out: 1, lamp: [0, 1.0, 0, 1.6] });


/* a staircase to the floor above: open oak treads on steel stringers, a handrail on the open side.
   It climbs along local +x and backs onto a wall with its local -z side; the stairwell above follows its footprint. */
let STAIR_H = 3.1;
def('stairs', 'Staircase', 'living', [3.4, 1.0, 3.1], { a: ['Treads', WOOD, 'whiteoak'], b: ['Frame', ['paint'], 'graphite'] }, (g, M) => {
  const H = STAIR_H, n = Math.max(8, Math.round(H / .185)), rise = H / n, td = 3.4 / (n - 1), ang = Math.atan2(H - rise, 3.4), Ls = Math.hypot(3.4, H - rise), my = (rise + H) / 2, sn = Math.sin(ang), cs = Math.cos(ang);
  M.b.roughness = .45; M.b.metalness = .35; M.b.userData.rough = .45;
  for (let i = 0; i < n - 1; i++) B(td + .015, .05, .94, M.a, -1.7 + (i + .5) * td, (i + 1) * rise - .05, 0, g);
  for (const z of [-.47, .47]) B(Ls, .24, .035, M.b, .13 * sn, my - .13 * cs - .12, z, g, { rz: ang });
  B(Ls, .045, .045, M.b, 0, my + .9 - .02, .45, g, { rz: ang });
  for (let i = 0; i < n - 1; i += 3) { const x = -1.7 + (i + .5) * td, y0 = (i + 1) * rise, y1 = rise + (x + 1.7) * (H - rise) / 3.4 + .9; B(.022, y1 - y0, .022, M.b, x, y0, .45, g); }
}, { wall: 1, hidden: 1, stairs: 1, price: 4800 });

/* ───────────────────────── realistic planting: branching trees, leaf clusters, hedges ───────────────────────── */
// Leaves are painted clusters on alpha-tested cards. Each card takes its normal from the crown's centre rather than its own
// face, so a canopy shades like one soft volume (the way game foliage is lit) and still breaks up into leaves at the edges.
const NAT = { leafP: [], leafN: [], leafUV: [], leafC: [], needP: [], needN: [], needUV: [], needC: [], bark: [], core: [] };
function paintAtlas(kind) {
  const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d'); seed = kind === 'needle' ? 303 : kind === 'small' ? 202 : 101;
  const twig = (x0, y0, x1, y1, w) => { g.strokeStyle = '#4b3a27'; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + x1) / 2 + (rnd() - .5) * 30, (y0 + y1) / 2, x1, y1); g.stroke(); };
  if (kind === 'needle') {
    twig(S / 2, S * .95, S / 2, S * .08, 7);
    for (let i = 0; i < 22; i++) { const y = S * .9 - i * S * .037, side = i % 2 ? 1 : -1, L = S * (.16 + .2 * Math.sin(Math.PI * (i + 2) / 25)); const ex = S / 2 + side * L, ey = y - L * .45; twig(S / 2, y, ex, ey, 3);
      for (let k = 0; k < 16; k++) { const t = k / 16, px = S / 2 + (ex - S / 2) * t, py = y + (ey - y) * t; for (const s2 of [-1, 1]) { const a = Math.atan2(ey - y, ex - S / 2) + s2 * (.9 + rnd() * .3), nl = 18 + rnd() * 10; g.strokeStyle = `hsl(${118 + rnd() * 18},${30 + rnd() * 15}%,${16 + rnd() * 16}%)`; g.lineWidth = 2.2; g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(a) * nl, py + Math.sin(a) * nl); g.stroke(); } } }
  } else {
    const n = kind === 'small' ? 150 : 72, sz = kind === 'small' ? .55 : 1;
    for (let i = 0; i < 9; i++) { const a = rnd() * 6.283; twig(S / 2, S / 2, S / 2 + Math.cos(a) * S * .36, S / 2 + Math.sin(a) * S * .36, 4); }
    for (let i = 0; i < n; i++) { const a = rnd() * 6.283, d = Math.sqrt(rnd()) * S * .4, x = S / 2 + Math.cos(a) * d, y = S / 2 + Math.sin(a) * d, L = (36 + rnd() * 34) * sz, W = L * (.42 + rnd() * .12), rot = a + (rnd() - .5) * 1.2;
      const h = 92 + rnd() * 26, s = 34 + rnd() * 22, l = 20 + rnd() * 22; g.save(); g.translate(x, y); g.rotate(rot);
      const gr = g.createLinearGradient(0, 0, L, 0); gr.addColorStop(0, `hsl(${h},${s}%,${l * .8}%)`); gr.addColorStop(1, `hsl(${h - 6},${s + 6}%,${l * 1.25}%)`); g.fillStyle = gr;
      g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(L * .45, -W, L, 0); g.quadraticCurveTo(L * .45, W, 0, 0); g.fill();
      g.strokeStyle = `hsla(${h},${s}%,${l * 1.5}%,.55)`; g.lineWidth = 1.2; g.beginPath(); g.moveTo(1, 0); g.lineTo(L * .9, 0); g.stroke(); g.restore(); }
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const natTime = { value: 0 };
function foliageMat(tex) {
  const m = new THREE.MeshStandardMaterial({ map: tex, alphaTest: .5, side: THREE.DoubleSide, vertexColors: true, roughness: .78 });
  m.userData.roomtoneAnimated = true;
  m.onBeforeCompile = sh => {
    sh.uniforms.uT = natTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uT;').replace('#include <begin_vertex>', '#include <begin_vertex>\nfloat sw = clamp(position.y / 5., 0., 1.); transformed.x += sin(uT * 1.1 + position.x * .45 + position.z * .3) * .035 * sw; transformed.z += cos(uT * .9 + position.z * .5) * .03 * sw;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);')   // keep the crown normal on both faces
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vec3(.05, .07, .02);');
  };
  return m;
}
const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _m4 = new THREE.Matrix4(), _vA = new THREE.Vector3(), _vB = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
// one leaf card: a pair of crossed quads at p, size s, normals pointing out of the crown from c
function leafCard(set, p, s, c, tint, flat = 0) {
  const P = NAT[set + 'P'], N = NAT[set + 'N'], U = NAT[set + 'UV'], C = NAT[set + 'C'];
  _e.set(rnd() * 6.283, rnd() * 6.283, rnd() * 6.283); if (flat) _e.set(-Math.PI / 2 + (rnd() - .5) * .9, rnd() * 6.283, 0); _q.setFromEuler(_e);
  const X1 = new THREE.Vector3(1, 0, 0).applyQuaternion(_q), Y1 = new THREE.Vector3(0, 1, 0).applyQuaternion(_q), Z1 = new THREE.Vector3(0, 0, 1).applyQuaternion(_q);
  for (let k = 0; k < (flat ? 1 : 2); k++) { const ax = k ? Z1 : X1, ay = Y1;
    const corners = [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]], v = corners.map(([a, b]) => p.clone().addScaledVector(ax, a * s / 2).addScaledVector(ay, b * s / 2));
    for (const i of [0, 1, 2, 0, 2, 3]) { const q = v[i]; P.push(q.x, q.y, q.z); _vA.copy(q).sub(c); _vA.y += .25 * _vA.length(); _vA.normalize(); N.push(_vA.x, _vA.y, _vA.z); U.push(corners[i][2], corners[i][3]); C.push(tint[0], tint[1], tint[2]); } }
}
function limb(a, b, r0, r1) { _vA.subVectors(b, a); const L = _vA.length(), g = new THREE.CylinderGeometry(r1, r0, L, 7, 1, true); g.translate(0, L / 2, 0); _q.setFromUnitVectors(_up, _vA.normalize()); g.applyQuaternion(_q); g.translate(a.x, a.y, a.z);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * L * 1.2); NAT.bark.push(g); }
const tint = () => { const k = .82 + rnd() * .3; return [k * (.95 + rnd() * .1), k, k * (.9 + rnd() * .15)]; };
function addTree(kind, x, y, z, s) {
  const base = new THREE.Vector3(x, y, z);
  if (kind === 'pine') {
    const H = 7.2 * s; limb(base, base.clone().add(new THREE.Vector3(0, H, 0)), .2 * s, .03 * s); const c = base.clone().add(new THREE.Vector3(0, H * .5, 0));
    for (let i = 0; i < 15; i++) { const h = (1.3 + i * .4) * s, R = (2.3 - i * .14) * s * (.9 + rnd() * .2), nb = 7; if (R < .25) break;
      for (let j = 0; j < nb; j++) { const a = j / nb * 6.283 + i * .7 + rnd() * .3, p0 = base.clone().add(new THREE.Vector3(0, h, 0)), p1 = p0.clone().add(new THREE.Vector3(Math.cos(a) * R, -R * .28, Math.sin(a) * R)); limb(p0, p1, .045 * s, .015 * s);
        for (let k = 1; k <= 6; k++) { const t = k / 6.4, p = p0.clone().lerp(p1, t); p.y += .1 * s; const cc = new THREE.Vector3(base.x, p.y + .4, base.z); leafCard('need', p, (1.45 - t * .4) * s, cc, tint(), 1); leafCard('need', p.clone().add(new THREE.Vector3(0, .18 * s, 0)), (1.1 - t * .3) * s, cc, tint(), 1); } } }
    { let g = new THREE.ConeGeometry(1.9 * s, 5.6 * s, 10, 1); g.deleteAttribute('uv'); g.deleteAttribute('normal'); g = mergeVertices(g); g.translate(base.x, base.y + 4.0 * s, base.z); const col = []; for (let i = 0; i < g.attributes.position.count; i++) col.push(.07, .13, .07); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals(); NAT.core.push(g); }
    leafCard('need', base.clone().add(new THREE.Vector3(0, H * .97, 0)), .9 * s, base.clone().add(new THREE.Vector3(0, H * .8, 0)), tint(), 0);
    return;
  }
  // broadleaf: a trunk that forks into a few limbs, then twigs, each twig ending in a spray of leaf clusters
  const top = base.clone().add(new THREE.Vector3((rnd() - .5) * .3, 2.2 * s, (rnd() - .5) * .3)); limb(base, top, .2 * s, .15 * s);
  const tips = [], grow = (p, dir, len, r, d) => { const q = p.clone().addScaledVector(dir, len); limb(p, q, r, r * .68); if (d >= 3) { tips.push(q); return; }
    const n = d === 0 ? 4 : 3; for (let i = 0; i < n; i++) { const nd = dir.clone(); _vB.set(rnd() - .5, rnd() * .6, rnd() - .5).normalize(); nd.lerp(_vB, .55 + rnd() * .2).normalize(); if (nd.y < .05) nd.y = .05; nd.normalize(); grow(q, nd, len * (.62 + rnd() * .14), r * .62, d + 1); } };
  for (let i = 0; i < 4; i++) { const a = i * 1.57 + rnd() * .8; grow(top, new THREE.Vector3(Math.cos(a) * .7, 1, Math.sin(a) * .7).normalize(), 1.55 * s, .11 * s, 0); }
  const c = tips.reduce((a, b) => a.add(b), new THREE.Vector3()).multiplyScalar(1 / tips.length); c.y -= .3 * s;
  NAT.core.push(blob(1.75 * s, c.x, c.y + .2 * s, c.z, '#1c3016', '#3d5a26', .82));
  for (const t of tips) { const n = 7; for (let i = 0; i < n; i++) { const p = t.clone().add(new THREE.Vector3((rnd() - .5) * 1.0 * s, (rnd() - .3) * .8 * s, (rnd() - .5) * 1.0 * s)); leafCard('leaf', p, (1.0 + rnd() * .4) * s, c, tint()); } }
  for (let i = 0; i < 90; i++) { const a = rnd() * 6.283, el = Math.acos(rnd() * 1.6 - .6), R = 2.05 * s; const p = c.clone().add(new THREE.Vector3(Math.sin(el) * Math.cos(a) * R, Math.cos(el) * R * .82, Math.sin(el) * Math.sin(a) * R)); leafCard('leaf', p, 1.1 * s, c, tint()); }
}
function addShrub(x, y, z, r) { const c = new THREE.Vector3(x, y + r * .55, z); NAT.core.push(blob(r * .78, x, y + r * .5, z, '#1e3318', '#3f5c28', .8)); for (let i = 0; i < 34; i++) { const a = rnd() * 6.283, el = Math.acos(rnd() * 1.4 - .4); const p = c.clone().add(new THREE.Vector3(Math.sin(el) * Math.cos(a) * r * .85, Math.cos(el) * r * .7, Math.sin(el) * Math.sin(a) * r * .85)); leafCard('leaf', p, r * .95, c.clone().setY(c.y - r * .4), tint()); } }
function addHedge(ax, az, bx, bz, y, h = .75, w = .62) {
  const L = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / L, dz = (bz - az) / L, n = Math.max(4, Math.round(L * 22));
  for (let i = 0; i < n; i++) { const t = (i + rnd()) / n, cx = ax + (bx - ax) * t, cz = az + (bz - az) * t, side = rnd(); let p, c;
    if (side < .3) { p = new THREE.Vector3(cx + (rnd() - .5) * w * .8 * -dz, y + h - .05, cz + (rnd() - .5) * w * .8 * dx); c = new THREE.Vector3(cx, y + h - .6, cz); }
    else { const sgn = side < .65 ? 1 : -1; p = new THREE.Vector3(cx - dz * sgn * w / 2, y + .08 + rnd() * (h - .14), cz + dx * sgn * w / 2); c = new THREE.Vector3(cx + dz * sgn * .3, p.y + .05, cz - dx * sgn * .3); }
    leafCard('leaf', p, .5, c, tint().map(v => v * .85)); }
  { let g = new RoundedBoxGeometry(L - .1, h - .3, w - .34, 3, .14); g.deleteAttribute('uv'); g.deleteAttribute('normal'); g = mergeVertices(g); g.rotateY(-Math.atan2(dz, dx)); g.translate((ax + bx) / 2, y + (h - .3) / 2 + .06, (az + bz) / 2); const col = []; for (let i = 0; i < g.attributes.position.count; i++) col.push(.05, .1, .05); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals(); NAT.core.push(g); }
}
function flushNature(site) {
  const mk = (P, N, U, C, tex) => { if (!P.length) return; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    const m = new THREE.Mesh(g, foliageMat(tex)); m.castShadow = m.receiveShadow = true; site.add(m); };
  NATEX.leaf = NATEX.leaf || paintAtlas('leaf'); NATEX.need = NATEX.need || paintAtlas('needle');
  mk(NAT.leafP, NAT.leafN, NAT.leafUV, NAT.leafC, NATEX.leaf); mk(NAT.needP, NAT.needN, NAT.needUV, NAT.needC, NATEX.need);
  if (NAT.core.length) { const m = new THREE.Mesh(mergeGeometries(NAT.core), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })); m.castShadow = m.receiveShadow = true; site.add(m); }
  if (NAT.bark.length) { const m = new THREE.Mesh(mergeGeometries(NAT.bark), NATEX.bark || (NATEX.bark = barkMat())); m.castShadow = m.receiveShadow = true; site.add(m); }
  for (const k in NAT) NAT[k].length = 0;
}
const NATEX = {};
function barkMat() { const cv = document.createElement('canvas'); cv.width = 128; cv.height = 256; const g = cv.getContext('2d'); g.fillStyle = '#5b4a3c'; g.fillRect(0, 0, 128, 256); seed = 404;
  for (let i = 0; i < 260; i++) { g.fillStyle = rnd() < .5 ? 'rgba(30,22,16,.45)' : 'rgba(150,135,118,.25)'; g.fillRect(rnd() * 128, rnd() * 256, 1 + rnd() * 3, 10 + rnd() * 40); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return new THREE.MeshStandardMaterial({ map: t, roughness: 1 }); }

/* ───────────────────────── the car: Khronos "Car Concept" (CC BY 4.0) loaded once, cloned per car ───────────────────────── */
// Model: "Car Concept" from the Khronos glTF Sample Assets, CC BY 4.0, built from a public-domain model by Unity Fan.
const CAR_URL = assetBase + '/models/car/CarConcept.gltf';
let CARMODEL = null;
function loadCar() {
  return new Promise((res, rej) => { const timer = setTimeout(() => rej(new Error('timeout')), 30000);
    const dl = new DRACOLoader().setDecoderPath(assetBase + '/decoders/draco/'), kl = new KTX2Loader().setTranscoderPath(assetBase + '/decoders/basis/').detectSupport(renderer); disposables.add(dl); disposables.add(kl);
    const cleanup = () => { dl.dispose(); kl.dispose(); disposables.delete(dl); disposables.delete(kl); };
    new GLTFLoader().setDRACOLoader(dl).setKTX2Loader(kl).load(CAR_URL, g => { clearTimeout(timer); cleanup(); res(g.scene); }, undefined, e => { clearTimeout(timer); cleanup(); rej(e); }); });
}
function prepCar(root) {
  const glass = new THREE.MeshPhysicalMaterial({ color: '#10151c', roughness: .04, metalness: .1, transparent: true, opacity: .62, clearcoat: 1 }), seat = std('#7a6150', { roughness: .7 });
  root.traverse(m => { if (!m.isMesh) return; m.castShadow = m.receiveShadow = true; const n = m.material.name || '';
    if (n === 'Glass') m.material = glass; else if (n.startsWith('Interior 3')) m.material = seat; if (n === 'License' || m.name === 'License Plate' || /Emblem/.test(m.name) || /License/.test(m.parent && m.parent.name || '')) m.visible = false; });
  const w = new THREE.Group(), inner = new THREE.Group(); inner.add(root); w.add(inner); w.updateMatrixWorld(true);
  let b = new THREE.Box3().setFromObject(inner), sz = b.getSize(new THREE.Vector3());
  if (sz.x > sz.z) inner.rotation.y = Math.PI / 2; w.updateMatrixWorld(true); const hl = root.getObjectByName('BodyHeadlights'); if (hl) { const hb = new THREE.Box3().setFromObject(hl), c = hb.getCenter(new THREE.Vector3()); b = new THREE.Box3().setFromObject(inner); if (c.z < b.getCenter(new THREE.Vector3()).z) inner.rotation.y += Math.PI; }
  w.updateMatrixWorld(true); b = new THREE.Box3().setFromObject(inner); sz = b.getSize(new THREE.Vector3()); const k = 4.6 / sz.z; inner.scale.setScalar(k); w.updateMatrixWorld(true);
  b = new THREE.Box3().setFromObject(inner); const c = b.getCenter(new THREE.Vector3()); inner.position.set(-c.x, -b.min.y, -c.z); return w;
}

/* ───────────────────────── design state ───────────────────────── */
const state = { plan: 'onebed', roof: 'pitched', yard: null, lay: null, up: null, surf: {}, items: [], t: 8.5, frames: 'graphite', started: false };
let uid = 1, grid = false, snapOn = true, tab = 'layout', preview = null, sel = null, selSurf = null, selRole = null, mode = null, drag = null;
const OBJ = {}, IPICK = [];
const lc = s => s.charAt(0).toLowerCase() + s.slice(1);
function makeMats(d, v) { const M = {}; for (const k in d.roles) { const id = v[k] || d.roles[k][2]; M[k] = new THREE.MeshStandardMaterial({ map: TEX[id], roughness: ROUGH[MATS[id].c] }); M[k].userData = { role: k, mat: id }; } return M; }
function newInst(k, o = {}) { const d = CAT[k], v = {}; for (const r in d.roles) v[r] = d.roles[r][2]; return { id: uid++, k, x: 0, z: 0, r: 0, s: 1, y: 0, v, f: lv, ...(d.len ? { len: d.dim[0] } : {}), ...o }; }
function placeObj(inst) {
  shadowDirty = uiDirty = true;
  const g = OBJ[inst.id], d = CAT[inst.k]; if (!g) return;
  if (d.mount != null) { const w = levelOf(inst).walls[inst.wall]; if (!w) { g.visible = false; return; } const n = inst.side ? -1 : 1, f = w.c + n * (w.t / 2 + .004); if (w.hz) { g.position.set(inst.u, inst.y, f); g.rotation.y = n > 0 ? 0 : Math.PI; } else { g.position.set(f, inst.y, inst.u); g.rotation.y = n > 0 ? Math.PI / 2 : -Math.PI / 2; } g.scale.set(inst.s, inst.s, 1); g.visible = w.up && w.vis !== false && !inst.hide; }
  else { g.position.set(inst.x, d.out ? groundY(inst.x, inst.z) : inst.y || 0, inst.z); g.rotation.y = inst.r; g.scale.set(inst.m ? -inst.s : inst.s, 1, inst.s); g.visible = !inst.hide && inFocus(inst); }
}
function buildObj(inst) {
  const d = CAT[inst.k], g = new THREE.Group(), M = makeMats(d, inst.v); g.userData.item = inst; g.userData.M = M; d.build(g, M, inst);
  if (d.lamp) { if (!inst.lamp) inst.lamp = { on: d.tv ? false : 'auto', br: d.tv ? .9 : 1, col: '#ffc48c' }; const sh = d.tv ? g.userData.screen : X.shade.clone(); if (!d.tv) g.traverse(m => { if (m.material === X.shade) m.material = sh; }); g.userData.shade = sh; }
  batchedMeshes += batchPrimitives(g);
  g.traverse(m => { if (m.isMesh) m.userData.it = inst; }); levelOf(inst).items.add(g); OBJ[inst.id] = g; placeObj(inst); return g;
}
function dropObj(inst) { shadowDirty = uiDirty = true; const g = OBJ[inst.id]; if (!g) return; disposeTree(g); for (const k in g.userData.M) g.userData.M[k].dispose(); if (g.userData.shade) g.userData.shade.dispose(); if (g.parent) g.parent.remove(g); delete OBJ[inst.id]; }
function repick() { IPICK.length = 0; P.items.traverse(m => { if (m.isMesh && m.userData.it) IPICK.push(m); }); }
function refreshLamps() {
  LAMPS.length = 0; let n = 0;
  for (const it of state.items) { const d = CAT[it.k], g = OBJ[it.id]; if (!d.lamp || !g) continue;
    if (n < 10 && g.visible && levelOf(it).grp.visible) { if (!g.userData.light) { const l = new THREE.PointLight('#ffc48c', 0, d.tv ? 4 : 6, 1.7); l.position.set(d.lamp[0], d.lamp[1], d.lamp[2]); g.add(l); g.userData.light = l; } n++; } else if (g.userData.light) { g.remove(g.userData.light); g.userData.light = null; }
    LAMPS.push({ l: g.userData.light, I: d.lamp[3], it, shade: g.userData.shade, tv: !!d.tv }); }
  applyTime(state.t);
}
function rebuildAll() {
  const pf = focus; buildWorld(state.surf); for (const k in OBJ) delete OBJ[k];
  const s = {}; for (const id in SURF) s[id] = state.surf[id] || SURF[id].def; state.surf = s;
  X.frame.map = TEX[state.frames]; setExt(state.surf.ext || 'bone'); for (const it of state.items) { uid = Math.max(uid, it.id + 1); buildObj(it); }
  settleSmall(); repick(); refreshLamps(); updateWalls(); refreshMounts(); afterRebuild(pf); if (build) buildMarks();
}
function refreshMounts() { for (const it of state.items) if (CAT[it.k].mount != null) placeObj(it); if (mode && mode.inst) placeObj(mode.inst); }
function planDefaults(id) {
  if (id === 'blank') { state.plan = 'custom'; state.yard = null; state.lay = { H: 2.8, rooms: [], ops: [] }; state.up = null; lv = 0; state.surf = {}; state.items = []; rebuildAll(); return; }   // an empty lot to draw on
  const p = PLANS[id]; state.plan = id; state.lay = null; state.up = null; state.yard = null; lv = 0; state.surf = {}; state.items = []; buildWorld({}); for (const k in OBJ) delete OBJ[k];
  for (const f of p.furn || []) state.items.push(newInst(f[0], { x: f[1], z: f[2], r: f[3] }));
  for (const f of p.wallf || []) { const w = P.walls.find(w => w.pi === f[1] && f[3] >= w.a0 && f[3] <= w.a1); if (w) state.items.push(newInst(f[0], { wall: w.i, side: f[2], u: f[3], y: f[4] })); }
  { const g = garageOf(p), z = p.D; state.items.push(newInst('car', { x: -GW / 2, z: z - 2.75, r: 0 }), newInst('shelving', { x: -GW + 1.0, z: g.gz0 + .37, r: 0 }), newInst('workbench', { x: -GW + .47, z: g.gz0 + 1.75, r: Math.PI / 2 }));
    const w = P.walls.find(w => w.pi === 100); if (w) state.items.push(newInst('charger', { wall: w.i, side: 0, u: -.8, y: 1.0 })); }
  rebuildAll();
}

/* ───────────────────────── placement rules ───────────────────────── */
const wOf = it => it.len || CAT[it.k].dim[0];
function obb(inst, x = inst.x, z = inst.z, r = inst.r, pad = .02) { const d = CAT[inst.k].dim, s = inst.s || 1; return { x, z, hw: wOf(inst) * s / 2 - pad, hd: d[1] * s / 2 - pad, c: Math.cos(r), s: Math.sin(r) }; }
const corners = o => [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([i, j]) => [o.x + o.c * o.hw * i + o.s * o.hd * j, o.z - o.s * o.hw * i + o.c * o.hd * j]);
function overlap(a, b) { const Ca = corners(a), Cb = corners(b); for (const o of [a, b]) for (const ax of [[o.c, -o.s], [o.s, o.c]]) { let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9; for (const p of Ca) { const d = p[0] * ax[0] + p[1] * ax[1]; a0 = Math.min(a0, d); a1 = Math.max(a1, d); } for (const p of Cb) { const d = p[0] * ax[0] + p[1] * ax[1]; b0 = Math.min(b0, d); b1 = Math.max(b1, d); } if (a1 <= b0 || b1 <= a0) return false; } return true; }
const inside = (o, x, z) => { const dx = x - o.x, dz = z - o.z, lx = dx * o.c - dz * o.s, lz = dx * o.s + dz * o.c; return Math.abs(lx) <= o.hw && Math.abs(lz) <= o.hd; };
const solid = d => !d.rug && !d.small && d.mount == null;
function blocked(inst, x = inst.x, z = inst.z, r = inst.r, noItems) {
  const d = CAT[inst.k], L = levelOf(inst), f = inst.f || 0; if (d.mount != null) return false;
  if (d.out) { if (L.L || !state.yard) return true; const o = obb(inst, x, z, r), y = lotOf(L.S).yard, rb = (q, p) => ({ x: (q[0] + q[2]) / 2, z: (q[1] + q[3]) / 2, hw: (q[2] - q[0]) / 2 + p, hd: (q[3] - q[1]) / 2 + p, c: 1, s: 0 });
    for (const p of corners(o)) if (p[0] < y[0] || p[1] < y[1] || p[0] > y[2] || p[1] > y[3]) return true;
    for (const rr of L.rooms) for (const q of rr.def.r) if (overlap(o, rb(q, .2))) return true;
    for (const e of state.yard.s) if (e[0] === 'pool' && overlap(o, rb(e.slice(1), .05))) return true;
    for (const e of state.yard.l) if (overlap(o, rb([Math.min(e[1], e[3]), Math.min(e[2], e[4]), Math.max(e[1], e[3]), Math.max(e[2], e[4])], .15))) return true;
    if (!noItems) for (const it of state.items) if (it !== inst && !(it.f > 0) && solid(CAT[it.k]) && overlap(o, obb(it))) return true;
    return false; }
  if (!roomAt(x, z, L)) return true; if (focus && L === P && !inRoomXZ(focus, x, z)) return true; if (!solid(d)) return false;
  const o = obb(inst, x, z, r); for (const p of corners(o)) if (p[0] < L.x0 - .01 || p[1] < L.z0 - .01 || p[0] > L.W + .01 || p[1] > L.D + .01) return true;
  for (const q of L.solids) if (overlap(o, { x: (q[0] + q[2]) / 2, z: (q[1] + q[3]) / 2, hw: (q[2] - q[0]) / 2, hd: (q[3] - q[1]) / 2, c: 1, s: 0 })) return true;
  if (!noItems) for (const it of state.items) if (it !== inst && (it.f || 0) === f && solid(CAT[it.k]) && overlap(o, obb(it))) return true;
  return false;
}
function supportY(inst, x = inst.x, z = inst.z) { let y = 0; for (const it of state.items) { const d = CAT[it.k]; if (it !== inst && (it.f || 0) === (inst.f || 0) && d.top && inside(obb(it, it.x, it.z, it.r, 0), x, z)) y = Math.max(y, d.top); } return y; }
function settleSmall() { for (const it of state.items) if (CAT[it.k].small) { it.y = supportY(it); placeObj(it); } }
function wallSnap(inst, x, z) {
  const d = CAT[inst.k].dim, hd = d[1] * (inst.s || 1) / 2; let best = null;
  for (const w of levelOf(inst).walls) for (const side of [0, 1]) { if (!w.rooms[side]) continue; const n = side ? -1 : 1, face = w.c + n * w.t / 2, dist = ((w.hz ? z : x) - face) * n, al = w.hz ? x : z; if (dist < 0 || dist > hd + .4 || al < w.a0 || al > w.a1) continue; if (!best || dist < best.dist) best = { dist, w, n, face }; }
  if (!best) return null; const w = best.w, p = best.face + best.n * (hd + .015), r = w.hz ? (best.n > 0 ? 0 : Math.PI) : (best.n > 0 ? Math.PI / 2 : -Math.PI / 2); return w.hz ? { x, z: p, r, w, n: best.n } : { x: p, z, r, w, n: best.n };
}
function target(inst, x, z) { let r = inst.r; snapInfo = null; if (grid) { x = Math.round(x / .25) * .25; z = Math.round(z / .25) * .25; } if (snapOn && CAT[inst.k].wall) { const s = wallSnap(inst, x, z); if (s) { ({ x, z, r } = s); snapInfo = s; } } return { x, z, r }; }
function tryMove(inst, x, z) {
  const d = CAT[inst.k], t = target(inst, x, z); if (d.small) { inst.x = t.x; inst.z = t.z; inst.y = supportY(inst, t.x, t.z); return true; }
  if (!blocked(inst, t.x, t.z, t.r)) { inst.x = t.x; inst.z = t.z; inst.r = t.r; return true; }
  if (!blocked(inst, t.x, inst.z, inst.r)) { inst.x = t.x; return true; } if (!blocked(inst, inst.x, t.z, inst.r)) { inst.z = t.z; return true; } return false;
}
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), FLOOR = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function aim(cx, cy) { ndc.set(cx / VW * 2 - 1, -(cy / VH) * 2 + 1); ray.setFromCamera(ndc, camera); }
function floorPt(y = 0) { const q = new THREE.Vector3(), ly = P ? P.y : 0; FLOOR.constant = -(y + ly); if (!ray.ray.intersectPlane(FLOOR, q)) return null; q.sub(A.position); q.y -= ly; return q; }
function wallHit(inst) {
  const d = CAT[inst.k], s = inst.s || 1, hw = d.dim[0] * s / 2, hh = d.dim[1] * s, o = ray.ray.origin.clone().sub(A.position).setY(ray.ray.origin.y - P.y), dir = ray.ray.direction; let best = null;
  for (const w of P.walls) { if (!w.up || w.vis === false) continue; for (const side of [0, 1]) { if (!w.rooms[side]) continue; const n = side ? -1 : 1, face = w.c + n * w.t / 2, oc = w.hz ? o.z : o.x, dc = w.hz ? dir.z : dir.x; if (dc * n >= 0) continue; const t = (face - oc) / dc; if (t <= 0) continue; const px = o.x + dir.x * t, py = o.y + dir.y * t, pz = o.z + dir.z * t, u = w.hz ? px : pz; if (u < w.a0 || u > w.a1 || py < 0 || py > P.H) continue; if (!best || t < best.t) best = { t, w, side, u, y: py }; } }
  if (!best) return null; let u = clamp(best.u, best.w.a0 + Math.min(hw, (best.w.a1 - best.w.a0) / 2), best.w.a1 - Math.min(hw, (best.w.a1 - best.w.a0) / 2)); if (grid) u = Math.round(u / .25) * .25;
  return { wall: best.w.i, side: best.side, u, y: d.floor ? 0 : clamp(grid ? Math.round((best.y - hh / 2) / .1) * .1 : best.y - hh / 2, 0, Math.max(0, P.H - hh)) };
}
function riders(inst) { const d = CAT[inst.k]; if (!d.top) return []; const o = obb(inst, inst.x, inst.z, inst.r, 0); return state.items.filter(it => CAT[it.k].small && (it.f || 0) === (inst.f || 0) && inside(o, it.x, it.z)).map(it => ({ it, dx: it.x - inst.x, dz: it.z - inst.z })); }
function carry(inst, rs, dr = 0) { const c = Math.cos(dr), s = Math.sin(dr); for (const q of rs) { q.it.x = inst.x + q.dx * c + q.dz * s; q.it.z = inst.z - q.dx * s + q.dz * c; q.it.r += dr; q.it.y = supportY(q.it); placeObj(q.it); } }

/* ───────────────────────── history / storage ───────────────────────── */
const hist = [], redo = [];
const snap = () => JSON.stringify({ plan: state.plan, roof: state.roof, yard: state.yard, lay: state.lay, up: state.up, surf: state.surf, items: state.items, t: state.t, frames: state.frames });
const take = s => Object.assign(state, { plan: s.plan, roof: s.roof || 'pitched', yard: s.yard || null, lay: s.lay || null, up: s.up || null, surf: s.surf, items: s.items, frames: s.frames || 'graphite' });
function pushHist() { hist.push(snap()); if (hist.length > 80) hist.shift(); redo.length = 0; histBtns(); }
function restore(js) { const s = JSON.parse(js); take(s); select(null); selSurf = null; rebuildAll(); state.t = s.t; applyTime(state.t); Object.assign(camG, { dist: CAM0.dist, ty: planView ? P.y : CAM0.ty }); commit(true); }
function histBtns() { $('#bUndo').disabled = !hist.length; $('#bRedo').disabled = !redo.length; }
function undo() { if (hist.length) { redo.push(snap()); restore(hist.pop()); histBtns(); } } function redoIt() { if (redo.length) { hist.push(snap()); restore(redo.pop()); histBtns(); } }
function commit(quiet) { cardFor = null; syncHole(); refreshLeft(); render(); if (state.started && !preview) try { localStorage.setItem('roomtone.auto', snap()); } catch (e) { } }
function toast(s, act, fn) { const t = $('#toast'); t.firstChild.textContent = s; const old = t.querySelector('button'); if (old) old.remove(); if (act) { const b = document.createElement('button'); b.textContent = act; b.onclick = () => { t.classList.remove('show'); fn(); }; t.append(b); } t.classList.add('show'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), act ? 5200 : 2300); }
// placement preview: the piece turns into a pale translucent model, red where it cannot go
const GHOST = { ok: new THREE.MeshStandardMaterial({ color: '#f6f2ea', transparent: true, opacity: .66, roughness: .9, depthWrite: false }), bad: new THREE.MeshStandardMaterial({ color: '#d8523a', transparent: true, opacity: .5, roughness: .9, depthWrite: false }) };
function ghost3(inst, on, bad) { const g = OBJ[inst.id]; if (!g) return; g.traverse(m => { if (!m.isMesh) return; if (on) { if (!m.userData.m0) { m.userData.m0 = m.material; m.userData.cs = m.castShadow; } m.material = bad ? GHOST.bad : GHOST.ok; m.castShadow = false; } else if (m.userData.m0) { m.material = m.userData.m0; m.castShadow = m.userData.cs; delete m.userData.m0; } }); }
let snapInfo = null;

/* ───────────────────────── selection, edits ───────────────────────── */
const outline = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints([[-.5, -.5], [.5, -.5], [.5, .5], [-.5, .5]].map(p => new THREE.Vector3(p[0], 0, p[1]))), new THREE.LineBasicMaterial({ color: '#b4553a', depthTest: false, transparent: true })); outline.renderOrder = 9; outline.visible = false; scene.add(outline);
function select(inst, keepTab) { sel = inst; selRole = inst ? Object.keys(CAT[inst.k].roles)[0] || null : null; if (inst) selSurf = null; if (!keepTab && tab === 'style') render(); }
function setItemMat(inst, role, id) { inst.v[role] = id; const g = OBJ[inst.id], m = g.userData.M[role]; if (m.userData.paint) m.color.set(MATS[id].a); else { m.map = TEX[id]; m.roughness = m.userData.rough ?? ROUGH[MATS[id].c]; } m.userData.mat = id; g.traverse(o => { if (o.userData.art != null) { o.material.map.dispose(); o.material.map = artTex(o.userData.art, MATS[id].a); } }); }
function setExt(id) { X.shell.map = TEX[id]; X.shell.color.set('#efe9df'); X.shell.roughness = ROUGH[MATS[id].c]; X.shell.needsUpdate = true; }
X.shell.userData.surf = 'ext';
function setSurf(id, mat, at, instant) { if (state.surf[id] === mat) return; if (id === 'ext') { state.surf.ext = mat; setExt(mat); return; } state.surf[id] = mat; SURF[id].mat.userData.set(mat, at, instant); }
let scope = 'one';
function applyFinish(mat, tgt, at) {   // tgt: {item, role} | {surf} | {frames}
  const c = MATS[mat].c;
  if (tgt.frames) { pushHist(); state.frames = mat; X.frame.map = TEX[mat]; return true; }
  if (tgt.item) { const d = CAT[tgt.item.k]; let role = tgt.role && d.roles[tgt.role] && d.roles[tgt.role][1].includes(c) ? tgt.role : Object.keys(d.roles).find(r => d.roles[r][1].includes(c)); if (!role) { toast(`${d.n} takes no ${lc(CATS[c])}`); return false; } pushHist(); setItemMat(tgt.item, role, mat); return true; }
  const S = SURF[tgt.surf]; if (!S) return false; if (S.kind === 'floor' && c !== 'wood' && c !== 'stone' && c !== 'tile') { toast('Floors take timber, stone or tile'); return false; } if (S.kind === 'wall' && c === 'fabric') { toast('Walls take paint, wallpaper, tile, stone or timber'); return false; }
  if (S.kind === 'ext') { if (!['paint', 'stone', 'wood'].includes(c)) { toast('Outside walls take paint, brick, stone or timber'); return false; } pushHist(); state.surf.ext = mat; setExt(mat); return true; }
  pushHist(); const ids = scope === 'room' && S.kind === 'wall' ? Object.keys(SURF).filter(k => SURF[k].kind === 'wall' && SURF[k].room === S.room) : [tgt.surf]; for (const k of ids) setSurf(k, mat, at || new THREE.Vector3()); return true;
}
function removeItem(inst) { if (CAT[inst.k].stairs) return toast('The staircase goes with the upstairs. Layout can remove both.'); const nm = CAT[inst.k].n; pushHist(); dropObj(inst); state.items.splice(state.items.indexOf(inst), 1); if (sel === inst) select(null); settleSmall(); repick(); refreshLamps(); commit(); toast(nm + ' removed', 'Undo', undo); }
function rotateItem(inst, dr) { const d = CAT[inst.k]; if (d.mount != null) return; if (blocked(inst, inst.x, inst.z, inst.r + dr)) { toast('No room to turn here'); return false; } const rs = riders(inst); inst.r += dr; placeObj(inst); carry(inst, rs, dr); return true; }
function resizeItem(inst, f) { const s = clamp(inst.s * f, .6, 1.6); if (s === inst.s) return; const old = inst.s; inst.s = s; if (blocked(inst)) { inst.s = old; toast('No room to grow here'); return; } placeObj(inst); settleSmall(); }
function duplicate(inst) { if (CAT[inst.k].stairs) return toast('One staircase per home'); const d = CAT[inst.k], c = newInst(inst.k, { r: inst.r, s: inst.s, v: { ...inst.v }, wall: inst.wall, side: inst.side, u: inst.u, y: inst.y, f: inst.f }); if (d.mount != null) { c.u = clamp(inst.u + d.dim[0] * inst.s + .1, P.walls[inst.wall].a0, P.walls[inst.wall].a1); pushHist(); state.items.push(c); buildObj(c); repick(); select(c); commit(); return; }
  const w = d.dim[0] * inst.s + .08, dp = d.dim[1] * inst.s + .08, cs = Math.cos(inst.r), sn = Math.sin(inst.r);
  for (const [i, j] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1]]) { const x = inst.x + cs * w * i + sn * dp * j, z = inst.z - sn * w * i + cs * dp * j; if (!blocked(c, x, z, c.r)) { c.x = x; c.z = z; pushHist(); state.items.push(c); buildObj(c); settleSmall(); repick(); refreshLamps(); select(c); commit(); return; } }
  startPlace(c, false); toast('No free spot beside it. Click where the copy should go.');
}

/* placing: a piece that follows the pointer until it is set down */
function startPlace(instOrKey, dragging, existing) {
  if (typeof instOrKey === 'string' && CAT[instOrKey].out && lv) setLevel(0);
  if (outside) setOutside(false); cancelPlace(); const inst = typeof instOrKey === 'string' ? newInst(instOrKey) : instOrKey; if (!existing) { buildObj(inst); inst.hide = true; placeObj(inst); }
  mode = { type: 'place', inst, dragging, existing, orig: existing ? JSON.stringify(inst) : null, rs: existing ? riders(inst) : [], bad: true }; select(existing ? inst : null, true); if (!existing) sel = inst; ghost3(inst, true, !existing); if (!existing) intro.on('picked'); markCatalog();
}
function movePlace(cx, cy) {
  if (!mode) return; const inst = mode.inst, d = CAT[inst.k]; aim(cx, cy); inst.hide = false;
  if (d.mount != null) { const h = wallHit(inst); if (!h) { inst.hide = true; mode.bad = true; } else { Object.assign(inst, h); mode.bad = false; } }
  else { const q = floorPt(d.out ? GY0 : 0); if (!q) return; const t = target(inst, q.x, q.z); inst.x = t.x; inst.z = t.z; inst.r = t.r; inst.y = d.small ? supportY(inst) : 0; mode.bad = blocked(inst); carry(inst, mode.rs); }
  placeObj(inst); ghost3(inst, true, mode.bad);
}
function commitPlace(again) {
  if (!mode) return; const { inst, existing } = mode; if (mode.bad) { toast(CAT[inst.k].mount != null ? 'Hang it on a standing wall' : 'No room here'); return; }
  if (existing) { const now = JSON.stringify(inst); Object.assign(inst, JSON.parse(mode.orig)); pushHist(); Object.assign(inst, JSON.parse(now)); } else { pushHist(); state.items.push(inst); }
  ghost3(inst, false); delete inst.hide; mode = null; snapInfo = null; placeObj(inst); settleSmall(); repick(); refreshLamps(); select(inst); commit(); markCatalog(); if (!existing) { toast(CAT[inst.k].n + ' placed'); intro.on('placed'); } if (again) startPlace(inst.k, false);
}
function cancelPlace() { if (!mode) return; const { inst, existing, orig } = mode; if (existing) { Object.assign(inst, JSON.parse(orig)); delete inst.hide; placeObj(inst); settleSmall(); } else { dropObj(inst); if (sel === inst) sel = null; } if (existing) ghost3(inst, false); mode = null; snapInfo = null; markCatalog(); }


/* ───────────────────────── icons, small helpers ───────────────────────── */
const IC = {
  layout: '<path d="M4 5h16v14H4zM4 12h7M11 5v14M11 15h9"/>', furnish: '<path d="M6 11V8.5A2.5 2.5 0 0 1 8.5 6h7A2.5 2.5 0 0 1 18 8.5V11M4 13a2 2 0 0 1 4 0v2h8v-2a2 2 0 0 1 4 0v5H4zM6.5 18v2M17.5 18v2"/>',
  style: '<path d="M4.5 4.5h6.5V11H4.5zM13 4.5h6.5V11H13zM4.5 13H11v6.5H4.5z"/><circle cx="16.25" cy="16.25" r="3.25"/>', decorate: '<path d="M12 21v-9M12 12.5C12 8.5 9.5 6.5 6 6.5c0 3.5 2 6 6 6ZM12 15c0-3 2-5 6-5 0 3-2 5-6 5ZM8.5 21h7"/>',
  lighting: '<circle cx="12" cy="12" r="3.8"/><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M6 18l1.4-1.4M16.6 7.4 18 6"/>',
  undo: '<path d="M9 14 4.5 9.5 9 5"/><path d="M4.5 9.5H14a5.5 5.5 0 0 1 0 11h-3"/>', redo: '<path d="m15 14 4.5-4.5L15 5"/><path d="M19.5 9.5H10a5.5 5.5 0 0 0 0 11h3"/>',
  centre: '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v4M12 16.5v4M3.5 12h4M16.5 12h4"/>', plan: '<path d="M4.5 4.5h15v15h-15zM4.5 11h7.5M12 4.5v15"/>', cube: '<path d="m12 3.5 7.5 4.2v8.6L12 20.5l-7.5-4.2V7.7zM4.5 7.7 12 12l7.5-4.3M12 12v8.5"/>',
  grid: '<path d="M4.5 4.5h15v15h-15zM4.5 9.5h15M4.5 14.5h15M9.5 4.5v15M14.5 4.5v15"/>', snap: '<path d="M6 4.5v8a6 6 0 0 0 12 0v-8h-4v8a2 2 0 0 1-4 0v-8zM6 8h4M14 8h4"/>',
  save: '<path d="M6 4.5h10l3 3V19.5H5V4.5zM8.5 4.5v5h6v-5M8.5 19.5v-6h7v6"/>', open: '<path d="M3.5 7V18.5h17V8.5h-8l-2-2.5h-7z"/>', png: '<path d="M4 7.5h3.5L9 5.5h6l1.5 2H20v11H4z"/><circle cx="12" cy="13" r="3.2"/>', help: '<circle cx="12" cy="12" r="8.5"/><path d="M9.7 9.6a2.4 2.4 0 0 1 4.7.7c0 1.7-2.4 2-2.4 3.6M12 16.9v.1"/>',
  move: '<path d="M12 3.5v17M3.5 12h17M9.5 6 12 3.5 14.5 6M9.5 18l2.5 2.5 2.5-2.5M6 9.5 3.5 12 6 14.5M18 9.5l2.5 2.5-2.5 2.5"/>', rotate: '<path d="M19.5 12a7.5 7.5 0 1 1-2.6-5.7"/><path d="M19.5 4v4.5H15"/>',
  drop: '<path d="M12 3.5c3 3.6 5.5 6.6 5.5 10a5.5 5.5 0 0 1-11 0c0-3.4 2.5-6.400 5.5-10Z"/>', copy: '<rect x="8.500" y="8.500" width="11" height="11" rx="2"/><path d="M15.500 5.500v-1h-11v11h1"/>', trash: '<path d="M4.500 7h15M9.500 7V4.500h5V7M6.500 7l1 12.500h9l1-12.500M10.500 10.500v5.500M13.500 10.500v5.500"/>',
  minus: '<path d="M6 12h12"/>', plus: '<path d="M6 12h12M12 6v12"/>',
  room: '<path d="M4.5 4.5h15v15h-15z" stroke-dasharray="2.2 2"/><path d="M12 9v6M9 12h6"/>', door: '<path d="M6.5 20.5V4h9.5v16.5M4 20.5h16"/><path d="M13.2 12.5h.1"/>', win: '<path d="M5 4.5h14v15H5zM12 4.5v15M5 12h14"/>',
  glass: '<path d="M3.5 5h17v14h-17zM12 5v14M6.5 10.5l2.5-2.5M14.5 11l3.5-3.5"/>', garage: '<path d="M3.5 10 12 4.5l8.5 5.5V20h-17z"/><path d="M7 20v-6.5h10V20M7 16h10M7 18.2h10"/>', erase: '<path d="m5 15.5 8.6-8.6a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L12.5 18H7.5z"/><path d="M9.5 11l5 5M7.5 20h12"/>',
  stairs: '<path d="M4 19.5h4v-4h4v-4h4v-4h4"/>', pool: '<path d="M4 7.5h16v9H4z"/><path d="M6 12c1.5-1.2 2.5-1.2 4 0s2.5 1.2 4 0 2.5-1.2 4 0"/>', deckt: '<path d="M3.5 8h17M3.5 12h17M3.5 16h17M6 8v8M12 12v4M17 8v4"/>',
  paving: '<path d="M4 4.5h16v15H4zM4 10h16M4 15h16M10 4.5V10M14 10v5M9 15v4.5"/>', stepst: '<rect x="5" y="15" width="5" height="3.5" rx="1"/><rect x="12" y="9.5" width="5" height="3.5" rx="1"/><rect x="7" y="4.5" width="5" height="3.5" rx="1"/>',
  bedt: '<path d="M3.5 19h17"/><circle cx="8" cy="12" r="2.2"/><circle cx="15.5" cy="10" r="2.2"/><path d="M8 14.2V19M15.5 12.2V19"/>', gravel: '<circle cx="7" cy="8" r="1.2"/><circle cx="12" cy="6.5" r="1"/><circle cx="17" cy="9" r="1.3"/><circle cx="9" cy="13" r="1.1"/><circle cx="15" cy="14" r="1.2"/><circle cx="6.5" cy="17.5" r="1"/><circle cx="12" cy="18" r="1.2"/><circle cx="18" cy="18" r="1"/>',
  fencet: '<path d="M6 20V6l1.5-2L9 6v14M15 20V6l1.5-2L18 6v14M4 10h16M4 16h16"/>', hedget: '<path d="M4 18v-6a3 3 0 0 1 4-2.8A3.5 3.5 0 0 1 14.5 8 3 3 0 0 1 20 11v7z"/><path d="M3.5 18.5h17"/>', wallt: '<path d="M3.5 9.5h17v9h-17zM3.5 14h17M9 9.5V14M15 9.5V14M6 14v4.5M12 14v4.5M18 14v4.5"/>', wallmv: '<path d="M10.5 4v16M13.5 4v16M7 9l-3 3 3 3M17 9l3 3-3 3"/>', house: '<path d="M3.5 11.5 12 4.5l8.5 7M6 9.8V19.5h12V9.8"/><path d="M10 19.5v-5h4v5"/>', flip: '<path d="M12 3.5v17M8.5 7 4 12l4.5 5M15.5 7l4.5 5-4.5 5"/>', floors: '<path d="m12 4 8 4-8 4-8-4z"/><path d="m4 12 8 4 8-4M4 16l8 4 8-4"/>',
  sunrise: '<path d="M4 18.5h16M7 18.5a5 5 0 0 1 10 0M12 4.5v6M9.5 7 12 4.5 14.5 7"/>', sunset: '<path d="M4 18.5h16M7 18.5a5 5 0 0 1 10 0M12 4.5v6M9.5 8 12 10.5 14.5 8"/>', dusk: '<path d="M4 14h16M6.5 17.5h11M9 21h6M7 14a5 5 0 0 1 10 0"/>',
  moon: '<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5Z"/>', bulb: '<path d="M9.5 18h5M10.5 21h3M12 3.5a5.5 5.5 0 0 0-3.2 10c.6.5.9 1.1.9 1.9v.6h4.6v-.6c0-.8.3-1.4.9-1.9A5.5 5.5 0 0 0 12 3.5Z"/>', tv: '<rect x="3.5" y="5" width="17" height="11" rx="1.5"/><path d="M9 20h6M12 16v4"/>',
};
const svg = (k, s = 18) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[k]}</svg>`;
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const tip = $('#tip'), ghost = $('#ghost'), card = $('#card'), rotH = $('#rot'), uiW = () => VW / UIS, uiH = () => VH / UIS;
function showTip(cx, cy, a, b) { if (!a) { tip.style.display = 'none'; return; } tip.style.display = 'block'; tip.firstChild.textContent = a; tip.lastChild.textContent = b || ''; tip.lastChild.style.display = b ? '' : 'none'; const w = tip.offsetWidth; tip.style.left = clamp(cx / UIS + 14, 8, uiW() - w - 8) + 'px'; tip.style.top = (cy / UIS + 16) + 'px'; }
// hover labels for icon buttons: any element with data-tip
addEventListener('pointerover', e => { const t = e.target.closest && e.target.closest('[data-tip]'); if (!t || drag || mode) return; const r = t.getBoundingClientRect(); tip.style.display = 'block'; tip.firstChild.textContent = t.dataset.tip; tip.lastChild.style.display = 'none'; const w = tip.offsetWidth, below = r.top < 120; tip.style.left = clamp((r.left + r.width / 2) / UIS - w / 2, 8, uiW() - w - 8) + 'px'; tip.style.top = (below ? r.bottom / UIS + 8 : r.top / UIS - 36) + 'px'; });
addEventListener('pointerout', e => { if (e.target.closest && e.target.closest('[data-tip]')) tip.style.display = 'none'; });

/* ───────────────────────── left panel ───────────────────────── */
function reading() { let w = 0, l = 0, n = 0; const ls = []; const add = (id, k) => { const m = MATS[id]; w += m.w * k; l += m.l * k; n += k; ls.push(m.l); }; for (const id in SURF) add(state.surf[id] || SURF[id].def, SURF[id].kind === 'floor' ? 3 : 1.2); for (const it of state.items) if (it.v.a) add(it.v.a, .8);
  const mean = ls.reduce((a, b) => a + b, 0) / ls.length, sd = Math.sqrt(ls.reduce((a, b) => a + (b - mean) ** 2, 0) / ls.length); return [Math.round(w / n * 100), Math.round((l / n * .6 + sunInfo(state.t).e * .4) * 100), Math.round(clamp(sd / .36, 0, 1) * 100)]; }
const verdict = ([w, l, c]) => `${w > 58 ? 'Warm' : w < 40 ? 'Cool' : 'Balanced'}, ${l > 62 ? 'airy' : l < 38 ? 'low-lit' : 'soft'}${c > 62 ? ', graphic' : c < 30 ? ', tonal' : ''}.`;
const fmt = t => { let h = Math.floor(t), mi = Math.round((t - h) * 60); if (mi === 60) { h++; mi = 0; } return String(h % 24).padStart(2, '0') + ':' + String(mi).padStart(2, '0'); };
const phase = t => t < 7 ? 'Dawn' : t < 11 ? 'Morning' : t < 15 ? 'Midday' : t < 18 ? 'Afternoon' : t < 20.2 ? 'Dusk' : 'Night';
['Warmth', 'Light', 'Contrast'].forEach(n => $('#read').append(el('div', 'rd', `<span>${n}</span><u><s></s></u>`)));
const HINT = { layout: 'Pick a plan or draw your own, then add a floor upstairs if you like.', furnish: 'Choose a piece, then click anywhere in the room to place it.', style: 'Click a floor, a wall or a piece, then pick a finish. You can also drag a finish straight onto it.', decorate: 'Art and shelves hang on walls. Small pieces sit on tables and counters.', lighting: 'Pick an atmosphere to set the time of day. Click a lamp in the home to dim it or change its colour.' };
function ctxText() { if (build) return (YHINT[build.tool] || BHINT[build.tool]) + (build.tool === 'room' || (build.yard && build.tool !== 'yerase') ? ' Right-drag turns the view.' : ''); if (outside) return 'The outside of your home, roof on. Press the house button again to go back in.'; if (mode) return CAT[mode.inst.k].mount != null ? 'Move over a standing wall and click to hang it. Esc cancels.' : 'Click in the room to set it down. Press R to turn it, Esc to cancel.'; if (sel) return `${CAT[sel.k].n} selected. Drag it to move${CAT[sel.k].mount == null ? ', pull the round handle to turn it' : ''}, or use the card beside it.`; if (focus && tab !== 'layout') return `${P.rooms.find(r => r.id === focus).def.n} on its own. Everything works as usual; Esc goes back to the whole home.`; return HINT[tab]; }
function refreshLeft() { const n = state.items.filter(it => !CAT[it.k].stairs).length, area = LV.reduce((a, L) => a + levelArea(L), 0); $('#plan b').textContent = state.lay ? (state.lay.rooms.length ? 'Your layout' : 'Empty lot') : PLANS[state.plan].n; $('#plan span').textContent = `${area} m² · ${LV.length > 1 ? '2 floors · ' : ''}${n} piece${n === 1 ? '' : 's'}`; $('#worth').innerHTML = LV.length && LV[0].rooms.length ? `Home value <b>${money(homeValue())}</b>` : '';
  const lb = $('#levels'); lb.innerHTML = ''; if (state.started && !preview && LV.length > 1) lb.append(seg({ 0: 'Ground floor', 1: 'Upstairs' }, String(lv), k => setLevel(+k))); const r = reading();[...$('#read').children].forEach((d, i) => d.querySelector('s').style.width = r[i] + '%'); $('#verdict').textContent = verdict(r); refreshRooms(); refreshClock(); }
function refreshClock() { const c = $('#clock'); if (c) c.textContent = fmt(state.t); const k = $('#knob'); if (k) k.style.left = clamp((state.t - T0) / (T1 - T0), 0, 1) * 100 + '%'; const c2 = $('#clock2'); if (c2) c2.textContent = `${phase(state.t)}, ${fmt(state.t)}`; refreshAmb(); }

/* ───────────────────────── tools (bottom left) and ambience bar (bottom centre) ───────────────────────── */
const toolsEl = $('#tools'), amb = $('#amb');
function ib(id, icon, label, fn) { const b = el('button', 'ib', svg(icon)); if (id) b.id = id; b.dataset.tip = label; b.setAttribute('aria-label', label); b.onclick = fn; return b; }
function setPlanView(on) { if (on && outside) setOutside(false); planView = on; const b = $('#bPlan'); b.classList.toggle('on', on); b.innerHTML = svg(on ? 'cube' : 'plan'); b.dataset.tip = on ? 'Back to 3D view' : 'Floor-plan view'; if (on) Object.assign(camG, { az: 0, el: 1.5, dist: (focus ? focusFrame().dist : CAM0.dist) * 1.05, tx: focus ? focusFrame().tx - .3 : 0, ty: P.y, tz: focus ? focusFrame().tz - .3 : 0 }); else Object.assign(camG, focus ? focusFrame() : CAM0); }
toolsEl.append(
  ib('bUndo', 'undo', 'Undo (⌘Z)', () => undo()), ib('bRedo', 'redo', 'Redo (⇧⌘Z)', () => redoIt()), ib('bCam', 'centre', 'Recentre the view', () => setPlanView(false)), ib('bPlan', 'plan', 'Floor-plan view', () => setPlanView(!planView)), ib('bGrid', 'grid', 'Snap to a 25 cm grid', () => { grid = !grid; $('#bGrid').classList.toggle('on', grid); toast(grid ? 'Grid snapping on' : 'Grid snapping off'); }),
  ib('bSnap', 'snap', 'Snap furniture onto walls', () => { snapOn = !snapOn; $('#bSnap').classList.toggle('on', snapOn); toast(snapOn ? 'Wall snapping on' : 'Wall snapping off'); }),
  ib('bSave', 'save', 'Save to My homes', () => saveHome(false)),
  ib('bOpen', 'open', 'My homes', () => homesEl.style.display === 'none' ? showHomes() : closeHomes()),
  ib('bPng', 'png', 'Export a picture', () => { const o = outline.visible; outline.visible = hoverLine.visible = ring.visible = false; composer.render(); const a = document.createElement('a'); a.download = 'roomtone.png'; a.href = canvas.toDataURL('image/png'); a.click(); outline.visible = o; toast('Picture saved to your downloads'); }),
  ib('bOut', 'house', 'See the outside, roof on', () => { ensureStarted(); setOutside(!outside); }),
  ib('bHelp', 'help', 'Show the intro again', () => intro.start(true)));
$('#bSnap').classList.add('on');
let tAnim = null; function animTime(to, dur = 1.5) { tAnim = { a: state.t, b: to, t0: performance.now(), dur: dur * 1000 }; }
// lighting scenes act on every lamp in the home; the time buttons move the sun
const SCENES = [{ k: 'reading', n: 'Reading', g: 'radial-gradient(circle at 35% 30%,#ffe7c4,#f0a55e 70%)', br: .95, col: '#ffb877', tv: false, tip: 'Warm, bright lamps' },
  { k: 'work', n: 'Work', g: 'radial-gradient(circle at 35% 30%,#ffffff,#d5dae4 75%)', br: 1, col: '#f2f4ff', tv: false, tip: 'Cool, full light' },
  { k: 'movie', n: 'Movie', g: 'conic-gradient(from 210deg,#2f43ff,#5a6bff 30%,#f39a5f 55%,#2f43ff 85%)', br: .15, col: '#ff9f5a', tv: true, tip: 'Lamps low, screen on' },
  { k: 'evening', n: 'Evening', g: 'radial-gradient(circle at 35% 30%,#ffc98f,#e2733a 75%)', br: .55, col: '#ff9f5a', tv: false, tip: 'A soft amber glow' }];
const TIMES = [['sunrise', 6.75, 'Sunrise'], ['lighting', 12.5, 'Midday'], ['sunset', 18.75, 'Sunset'], ['dusk', 20.25, 'Dusk'], ['moon', 22.5, 'Night']];
for (const sc of SCENES) { const b = el('button', 'sc', `<i style="background:${sc.g}"></i><span>${sc.n}</span>`); b.dataset.k = sc.k; b.dataset.tip = sc.tip; b.onclick = () => applyScene(sc); amb.append(b); }
amb.append(el('hr'));
for (const [ic, t, n] of TIMES) { const b = ib('', ic, `${n}, ${fmt(t)}`, () => { ensureStarted(); animTime(t, 1.4); }); b.classList.add('tm'); b.dataset.t = t; amb.append(b); }
{ const c = el('span'); c.id = 'clock'; amb.append(c); }
const lampItems = () => state.items.filter(it => CAT[it.k].lamp && it.lamp);
const lampOn = it => it.lamp.on === true || (it.lamp.on === 'auto' && !CAT[it.k].tv && lampF > .5);
function sceneOf() { const ls = lampItems().filter(it => !CAT[it.k].tv); if (!ls.length) return null; return SCENES.find(sc => ls.every(it => it.lamp.on === true && Math.abs(it.lamp.br - sc.br) < .02 && it.lamp.col === sc.col)) || null; }
function applyScene(sc) {
  ensureStarted(); const ls = lampItems(); if (!ls.length) return toast('Add a lamp first. Furnish has a floor lamp, Decorate a table lamp.'); pushHist(); const cur = sceneOf();
  for (const it of ls) { if (cur === sc) it.lamp.on = CAT[it.k].tv ? false : 'auto'; else if (CAT[it.k].tv) it.lamp.on = sc.tv; else Object.assign(it.lamp, { on: true, br: sc.br, col: sc.col }); }
  lampLevels(); cardFor = null; commit(); toast(cur === sc ? 'Lamps follow the daylight again' : `${sc.n} lighting`);
}
function refreshAmb() { const cur = sceneOf(); amb.querySelectorAll('.sc').forEach(b => b.classList.toggle('on', !!cur && b.dataset.k === cur.k)); let best = null, bd = .4; for (const b of amb.querySelectorAll('.tm')) { const d = Math.abs(+b.dataset.t - state.t); if (d < bd) { bd = d; best = b; } } amb.querySelectorAll('.tm').forEach(b => b.classList.toggle('on', b === best)); }
function bindScrub(scrub) { scrub.addEventListener('pointerdown', e => { tAnim = null; tip.style.display = 'none'; try { scrub.setPointerCapture(e.pointerId); } catch (_) { } const mv = ev => { const r = scrub.getBoundingClientRect(); state.t = lerp(T0, T1, clamp((ev.clientX - r.left) / r.width, 0, 1)); applyTime(state.t); refreshClock(); }; mv(e); const up = () => { scrub.removeEventListener('pointermove', mv); commit(); }; scrub.addEventListener('pointermove', mv); scrub.addEventListener('pointerup', up, { once: true }); }); }

/* focus: one room on its own, like a model lifted out of the building */
let focusCam = null; const fade = $('#fade');
function roomBox(id) { const r = P.rooms.find(q => q.id === id); let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (const q of r.def.r) { x0 = Math.min(x0, q[0]); z0 = Math.min(z0, q[1]); x1 = Math.max(x1, q[2]); z1 = Math.max(z1, q[3]); } return { r, x0, z0, x1, z1 }; }
function focusFrame() { const b = roomBox(focus), dist = 8 + 1.6 * Math.max(b.x1 - b.x0, (b.z1 - b.z0) * 1.25), k = dist / CAM0.dist; return { az: camG.az, el: .8, dist, tx: (b.x0 + b.x1) / 2 + A.position.x + CAM0.tx * k, ty: .45 + P.y, tz: (b.z0 + b.z1) / 2 + A.position.z + CAM0.tz * k }; }
function applyFocusVis() {
  if (!P) return; for (const L of LV) { for (const m of L.slab) m.visible = !focus; if (L.site) L.site.visible = !focus; if (L.rail) L.rail.visible = !focus; if (L.fb) { L.arch.remove(L.fb); disposeTree(L.fb); L.fb = null; }
    for (const c of L.arch.children) if (c.userData.surf) c.visible = !focus || c.userData.surf === 'f:' + focus; }
  if (focus) { const { r } = roomBox(focus); P.fb = new THREE.Group(); for (const q of r.def.r) B(q[2] - q[0] + .34, .3, q[3] - q[1] + .34, X.cap, (q[0] + q[2]) / 2, -.3, (q[1] + q[3]) / 2, P.fb); P.arch.add(P.fb); }
  levelVis(); shadowFloor.position.y = GY + (focus ? P.y : 0);
  focusOn = !!focus; for (const it of state.items) placeObj(it); updateWalls(); refreshMounts(); refreshLamps();
}
function afterRebuild(prev) { if (prev && P.rooms.some(r => r.id === prev)) { focus = prev; applyFocusVis(); } else focusCam = null; }
function setFocus(id) {
  if (!state.started || preview || id === focus || build || outside) return; cancelPlace(); select(null, true); selSurf = null; if (planView) setPlanView(false);
  fade.style.background = '#' + scene.background.getHexString(); fade.classList.add('on'); clearTimeout(setFocus.h);
  setFocus.h = setTimeout(() => {
    if (id && !focus) focusCam = { ...camG }; focus = id; applyFocusVis();
    if (id) Object.assign(camG, focusFrame()); else { Object.assign(camG, focusCam || CAM0); focusCam = null; }
    for (const p in cam) cam[p] = lerp(cam[p], camG[p], .86); applyTime(state.t); refreshLeft(); render();
    requestAnimationFrame(() => requestAnimationFrame(() => fade.classList.remove('on')));
  }, 180);
}
function refreshRooms() { const box = $('#rooms'); box.innerHTML = ''; if (!state.started || preview) return; const cur = focus && P.rooms.find(r => r.id === focus), b = el('button', 'rc pick' + (cur ? ' on' : ''), `<span>${cur ? cur.def.n : 'Whole home'}</span>`), m = el('div', 'card'); m.id = 'rmenu'; b.setAttribute('aria-label', 'Show one room on its own');
  const mk = (id, n) => { const x = el('button', focus === id ? 'on' : '', n); x.onclick = () => { m.classList.remove('show'); setFocus(id); }; m.append(x); }; mk(null, 'Whole home'); for (const r of P.rooms) mk(r.id, r.def.n);
  b.onclick = e => { e.stopPropagation(); m.classList.toggle('show'); }; box.append(m, b); }
addEventListener('pointerdown', e => { const m = $('#rmenu'); if (m && !e.target.closest('#rooms')) m.classList.remove('show'); }, true);

/* lamp badges: small glass pins over lamps and screens, as in a smart-home map */
const badgesEl = $('#badges'), BADGE = new Map();
function syncBadges() {
  const show = (focus || tab === 'lighting') && state.started && !preview && !mode && !planView && !build, seen = new Set();
  if (show) for (const it of state.items) { const d = CAT[it.k], g = OBJ[it.id]; if (!d.lamp || !it.lamp || !g || !g.visible || (it.f || 0) !== lv) continue; let b = BADGE.get(it.id);
    if (!b) { b = el('button', 'bdg', svg(d.tv ? 'tv' : 'bulb', 14)); b.dataset.tip = d.n; b.setAttribute('aria-label', d.n); b.onclick = () => { select(it, true); cardFor = null; if (tab === 'style') render(); }; badgesEl.append(b); BADGE.set(it.id, b); }
    seen.add(it.id); v3.set(0, d.tv ? 1.36 : d.dim[2] + .12, 0); g.localToWorld(v3); v3.project(camera); b.style.left = (v3.x * .5 + .5) * uiW() + 'px'; b.style.top = (-v3.y * .5 + .5) * uiH() + 'px'; b.classList.toggle('on', lampOn(it)); b.classList.toggle('sel', sel === it); }
  for (const [id, b] of BADGE) if (!seen.has(id)) { b.remove(); BADGE.delete(id); }
}

/* ───────────────────────── right panel ───────────────────────── */
const TABS = { layout: ['Layout', 'Plans, rooms and floors'], furnish: ['Furnish', 'Add and arrange furniture'], style: ['Style', 'Customize materials and colors'], decorate: ['Decorate', 'Add finishing touches'], lighting: ['Lighting', 'Set the atmosphere'] }, nav = $('#nav'), pane = $('#pane');
for (const k in TABS) { const b = el('button', '', svg(k, 20) + `<span>${TABS[k][0]}</span>`); b.dataset.k = k; b.onclick = () => setTab(k); nav.append(b); }
function ensureStarted() { if (!state.started) usePlan(state.plan, true); }
function setTab(k) { cancelPlace(); if (k !== 'layout' && build) exitBuild(); if (k !== 'layout') { if (!state.started) usePlan(preview || state.plan, true); else if (preview) endPreview(); } tab = k; pane.scrollTop = 0; render.sk = null; render(); intro.sync(); }
const SHOP = () => CAT_ORDER.filter(k => !CAT[k].hidden);

const THUMBS = {}; let fgroup = 'living', dgroup = 'all', query = '', lcat = 'wood', restyle = false, armed = false;
const ATMOS = [{ n: 'Linen morning', t: 8.5, f: 'whiteoak', w: 'chalk' }, { n: 'Clay noon', t: 13, f: 'travertine', w: 'clay' }, { n: 'Forest dusk', t: 18.75, f: 'walnut', w: 'sage' }, { n: 'Ink night', t: 22.5, f: 'smoked', w: 'ink' }];
const DGROUPS = { all: 'All', wall: 'Wall', plants: 'Plants', rugs: 'Rugs', table: 'Tabletop' }, PLANTS = ['fiddle', 'snake', 'bird', 'plantS'];
const inD = (d, g) => g === 'all' || (g === 'wall' && d.mount != null) || (g === 'plants' && PLANTS.includes(d.k)) || (g === 'rugs' && d.rug) || (g === 'table' && d.small);
function seg(opts, cur, on) { const s = el('div', 'seg' + (Object.keys(opts).length > 5 ? ' many' : '')); for (const k in opts) { const b = el('button', k === cur ? 'on' : '', opts[k]); b.onclick = () => on(k); s.append(b); } return s; }
function markCatalog() { const k = mode && !mode.existing ? mode.inst.k : null; pane.querySelectorAll('.it').forEach(c => c.classList.toggle('on', c.dataset.k === k)); }
function catalog(pool, keys) {
  const q = el('input'); q.id = 'q'; q.placeholder = 'Search'; q.value = query; q.setAttribute('aria-label', 'Search the catalog'); const g = el('div', 'grid');
  const fill = () => { g.innerHTML = ''; const list = query ? pool.filter(k => CAT[k].n.toLowerCase().includes(query.toLowerCase())) : keys;
    for (const k of list) { const d = CAT[k], c = el('div', 'it', `<img src="${THUMBS[k] || ''}" alt=""><i class="pr">${money(priceOf(k))}</i><b>${d.n}</b>${d.mount != null ? '<em>Hangs on a wall</em>' : d.small ? '<em>Sits on a surface</em>' : ''}`); c.dataset.k = k; c.dataset.tip = d.n + (d.mount != null ? ', hangs on a wall' : d.small ? ', sits on a surface' : ''); c.tabIndex = 0; c.setAttribute('role', 'button'); c.setAttribute('aria-label', d.n);
      c.addEventListener('pointerdown', e => { e.preventDefault(); ensureStarted(); startPlace(k, true); mode.x0 = e.clientX; mode.y0 = e.clientY; }); c.addEventListener('keydown', e => { if (e.key === 'Enter') { ensureStarted(); startPlace(k, false); } }); g.append(c); }
    if (!list.length) g.append(el('p', 'empty', `Nothing called “${query}” here.`)); markCatalog(); };
  q.oninput = () => { query = q.value; fill(); }; fill(); sub.append(q); G(null, 'cat', g);
}
// one dock: every tab lays out as columns ("groups") in a strip that scrolls sideways, like a Sims catalog
const sub = $('#sub'), held = $('#held');
function G(label, cls, ...kids) { const g = el('div', 'grp' + (cls ? ' ' + cls : '')); if (label) g.append(el('p', 'lbl', label)); g.append(...kids.filter(Boolean)); pane.append(g); return g; }
function render() {
  [...nav.children].forEach(b => { const on = b.dataset.k === tab; b.classList.toggle('on', on); b.setAttribute('aria-current', on ? 'page' : 'false'); });
  const key = tab + (build ? (build.yard ? ':y' : ':b') : '') + ':' + (tab === 'furnish' ? fgroup : tab === 'decorate' ? dgroup : tab === 'style' ? lcat : ''), sl = render.sk === key ? pane.scrollTop : 0; render.sk = key;
  held.append(amb, $('#read'), $('#verdict')); pane.innerHTML = ''; sub.innerHTML = '';
  if (tab === 'layout' && build) renderBuild();
  else if (tab === 'layout') {
    const rows = el('div', 'lays'), cur = preview || state.plan, mine = committed(), same = state.started && !preview;
    if (state.lay && state.lay.rooms.length && !preview) { const n = state.lay.rooms.length, b = el('button', 'lay on', `${planSVGc(state.lay.rooms)}<span><b>Your layout</b><em>${levelArea(LV[0])} m² · ${n} room${n === 1 ? '' : 's'}${state.up ? ' · 2 floors' : ''}</em></span>`); b.onclick = () => enterBuild(); rows.append(b); }
    { const b = el('button', 'lay' + (cur === 'blank' || (!preview && state.lay && !state.lay.rooms.length) ? ' on' : ''), `<svg viewBox="0 0 62 44"><rect x="9" y="6" width="44" height="32" rx="2" fill="none" stroke="#24211d" stroke-width=".9" stroke-dasharray="2.4 2"/><path d="M31 16v12M25 22h12" stroke="#24211d" stroke-width="1.1" stroke-linecap="round"/></svg><span><b>Empty lot</b><em>Draw your own</em></span>`); b.onclick = () => showPlan('blank'); rows.append(b); }
    for (const id of PLAN_ORDER) { const p = PLANS[id], n = p.rooms.length, b = el('button', 'lay' + (id === cur ? ' on' : ''), `${planSVG(p)}<span><b>${p.n}</b><em>${Math.round(planArea(p))} m² · ${n} room${n > 1 ? 's' : ''}${state.started && id === mine ? ' · yours' : p.tag ? ' · furnished' : ''}</em></span>`); b.onclick = () => showPlan(id); rows.append(b); }
    if (same) { const br = el('div', 'rows');
      const b1 = el('button', 'row', `<i class="ico">${svg('room', 18)}</i><b>Draw rooms, doors and windows</b>`); b1.onclick = () => enterBuild(); br.append(b1);
      if (!state.up) { const b2 = el('button', 'row', `<i class="ico">${svg('stairs', 18)}</i><b>Add a floor upstairs</b><em>with stairs</em>`); b2.onclick = () => addFloor(); br.append(b2); }
      else for (const [i, nm] of [[0, 'Ground floor'], [1, 'Upstairs']]) { const row = el('div', 'row' + (lv === i ? ' on' : ''), `<i class="ico">${svg(i ? 'stairs' : 'floors', 18)}</i><b>${nm}</b><em>${levelArea(LV[i])} m²</em>`); row.style.cursor = 'pointer'; row.onclick = e => { if (!e.target.closest('.link')) setLevel(i); }; if (i) { const x = el('button', 'link', 'Remove'); x.dataset.tip = 'Take the upstairs and the staircase away'; x.onclick = () => removeFloor(); row.append(x); } br.append(row); }
      { const row = el('div', 'row roofrow', `<i class="ico">${svg('house', 18)}</i><b>Roof</b>`); row.append(seg({ pitched: 'Pitched', flat: 'Flat', none: 'None' }, state.roof, k => { if (k === state.roof) return; pushHist(); state.roof = k; buildRoofs(); commit(); if (k !== 'none' && !outside) setOutside(true); else render(); })); br.append(row); }
      G('Build', 'w300', br);
      const rr = el('div', 'rows tight'); for (const r of P.rooms) { const row = el('div', 'row', `<b>${r.def.n}</b>`), x = el('button', 'link', 'Reset'); x.dataset.tip = 'Clear this room and its finishes'; x.onclick = () => resetRoom(r); row.append(x); rr.append(row); }
      G(lv ? 'Rooms upstairs' : 'Rooms', '', rr); }
    G(state.started && !preview ? 'Switch plan' : 'Floor plans', '', rows);
    const b = el('button', 'cta' + (armed ? ' warn' : ''), same ? 'Keep furnishing' : armed ? 'Replace your design?' : cur === 'blank' ? 'Start drawing' : state.started ? 'Switch to this plan' : 'Start with this plan');
    b.onclick = () => { if (same) return setTab('furnish'); if (state.started && (showPlan.keep ? JSON.parse(showPlan.keep).items.length : state.items.length) && !armed) { armed = true; return render(); } usePlan(cur); };
    G(null, 'end', armed ? el('p', 'note', 'Your current home will be replaced. Undo brings it back.') : null, b);
  } else if (tab === 'furnish') { sub.append(seg(GROUPS, fgroup, k => { fgroup = k; query = ''; render(); })); catalog(SHOP().filter(k => CAT[k].g !== 'decor'), SHOP().filter(k => CAT[k].g === fgroup)); if (fgroup === 'garage') G(null, 'credit', el('p', 'note', 'Car model: <a href="https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept" target="_blank" rel="noopener" style="color:inherit">Car Concept</a> by Khronos, CC BY 4.0.')); }
  else if (tab === 'decorate') { const pool = SHOP().filter(k => CAT[k].g === 'decor' || CAT[k].rug); sub.append(seg(DGROUPS, dgroup, k => { dgroup = k; query = ''; render(); })); catalog(pool, pool.filter(k => inD(CAT[k], dgroup))); }
  else if (tab === 'style') {
    const t = el('div'); t.id = 'target'; let takes = null, curMat = null, rr = null;
    if (sel && Object.keys(CAT[sel.k].roles).length) { const d = CAT[sel.k]; if (!d.roles[selRole]) selRole = Object.keys(d.roles)[0]; t.innerHTML = `<b>${d.n}</b><em>Pick a part, then a finish.</em>`; rr = el('div', 'rows tight'); for (const r in d.roles) { const b = el('button', 'row' + (r === selRole ? ' on' : ''), `<i class="sw1" style="background-image:${THUMB[sel.v[r]]}"></i><b>${d.roles[r][0]}</b><em>${MATS[sel.v[r]].n}</em>`); b.onclick = () => { selRole = r; render(); }; rr.append(b); } takes = d.roles[selRole][1]; curMat = sel.v[selRole]; }
    else if (sel) t.innerHTML = `<b>${CAT[sel.k].n}</b><em>This piece comes in one finish.</em>`;
    else if (selSurf === 'frames') { t.innerHTML = `<b>Doors and window frames</b><em>${MATS[state.frames].n}</em>`; takes = ['wood', 'paint']; curMat = state.frames; }
    else if (selSurf && SURF[selSurf]) { const S = SURF[selSurf]; t.innerHTML = `<b>${S.n}</b><em>${MATS[state.surf[selSurf]].n}</em>`; if (S.kind === 'wall') { const s = seg({ one: 'This wall', room: 'Whole room' }, scope, k => { scope = k; render(); }); s.style.marginTop = '8px'; t.append(s); } takes = S.kind === 'floor' ? ['wood', 'stone', 'tile'] : S.kind === 'ext' ? ['paint', 'stone', 'wood'] : ['paint', 'paper', 'tile', 'stone', 'wood']; curMat = state.surf[selSurf]; }
    else t.innerHTML = `<b>Nothing selected</b><em>Click a floor, a wall or a piece, or drag a finish onto it.</em>`;
    G('Selected', 'w240', t, rr);
    const ks = el('div', 'rows tight');
    if (!(selSurf === 'frames' && !sel)) { const fb = el('button', 'row', `<i class="sw1" style="background-image:${THUMB[state.frames]}"></i><b>Doors and frames</b><em>${MATS[state.frames].n}</em>`); fb.onclick = () => { select(null, true); selSurf = 'frames'; render(); }; ks.append(fb); }
    if (selSurf !== 'ext') { const xb = el('button', 'row', `<i class="sw1" style="background-image:${THUMB[state.surf.ext || 'bone']}"></i><b>Outside walls</b><em>${MATS[state.surf.ext || 'bone'].n}</em>`); xb.onclick = () => { select(null, true); selSurf = 'ext'; render(); }; ks.append(xb); }
    if (ks.children.length) G('Around the house', 'w240', ks);
    const k2 = sel ? 'i' + sel.id + selRole : String(selSurf); if (k2 !== render.key) { render.key = k2; if (takes && !takes.includes(lcat)) lcat = takes[0]; }
    sub.append(seg(CATS, lcat, k => { lcat = k; render(); })); const lib = el('div', 'lib'), off = takes && !takes.includes(lcat);
    for (const id in MATS) if (MATS[id].c === lcat) { const d = el('div', 'sw' + (id === curMat ? ' used' : '') + (off ? ' off' : ''), `<i style="background-image:${THUMB[id]}"></i><b>${MATS[id].n}</b>`); d.dataset.tip = MATS[id].n; d.addEventListener('pointerdown', e => { e.preventDefault(); ensureStarted(); drag = { type: 'sw', id, x0: e.clientX, y0: e.clientY, moved: false }; ghost.style.backgroundImage = THUMB[id]; }); lib.append(d); }
    G(off ? `${CATS[lcat]} does not fit this. Try ${takes.map(c => lc(CATS[c])).join(' or ')}.` : null, '', lib);
  } else {
    const rr = el('div', 'rows two'); for (const a of ATMOS) { const b = el('button', 'row' + (Math.abs(state.t - a.t) < .1 ? ' on' : ''), `<i class="dots">${[a.w, a.f].map(m => `<s style="background:${MATS[m].a}"></s>`).join('')}</i><b>${a.n}</b><em>${fmt(a.t)}</em>`); b.onclick = () => { ensureStarted(); pushHist(); animTime(a.t); if (restyle) for (const id in SURF) { const S = SURF[id]; if (!S.room) continue; const rt = roomById(S.room).def.t; if (S.kind === 'wall') setSurf(id, a.w, new THREE.Vector3()); else if (rt !== 'bath' && rt !== 'kitchen') setSurf(id, a.f, new THREE.Vector3()); } commit(); }; rr.append(b); }
    const c = el('label', 'chk', `<input type="checkbox" ${restyle ? 'checked' : ''}>Also repaint walls and floors`); c.querySelector('input').onchange = e => restyle = e.target.checked;
    G('Atmospheres', '', rr, c);
    const wn = el('p', 'note', 'Cut-away lowers the walls between you and the rooms. Lamps come on by themselves after dark.'); G('Walls', 'w240', seg({ auto: 'Cut-away', up: 'All up', down: 'All down' }, wallMode, k => { wallMode = k; render(); }), wn);
    G('Mood', 'w200', $('#read'), $('#verdict'));
  }
  pane.scrollTop = sl;
}
function moreHint() { pane.classList.toggle('over', pane.scrollWidth - pane.clientWidth - pane.scrollLeft > 6); }
pane.addEventListener('scroll', moreHint, { passive: true });
const committed = () => preview && showPlan.keep ? JSON.parse(showPlan.keep).plan : state.plan;
function showPlan(id) { armed = false; if (state.started && id === committed()) { endPreview(); return render(); } if (!preview && state.started) showPlan.keep = snap(); preview = id; select(null); selSurf = null; planDefaults(id); Object.assign(camG, CAM0); refreshLeft(); render(); }
function endPreview() { if (!preview) return; preview = null; if (showPlan.keep) { const k = showPlan.keep; showPlan.keep = null; take(JSON.parse(k)); rebuildAll(); Object.assign(camG, CAM0); refreshLeft(); } }
function usePlan(id, quiet) { armed = false; if (state.started && showPlan.keep) { hist.push(showPlan.keep); redo.length = 0; } if (state.plan !== id && id !== 'custom') planDefaults(id); histBtns(); preview = null; showPlan.keep = null; state.started = true; if (!quiet) { tab = 'furnish'; Object.assign(camG, CAM0); } commit(); if (!quiet && PLANS[id]) toast(PLANS[id].furn ? 'This one comes furnished. Everything can be moved.' : 'An empty apartment. Pick a piece to begin.'); intro.on('started');
  if (id === 'blank' && !quiet) { enterBuild(); build.rt = 'living'; render(); toast('Drag on the grass to draw your first room'); } }
function resetRoom(r) { pushHist(); const inR = (x, z) => r.def.r.some(q => x >= q[0] && x <= q[2] && z >= q[1] && z <= q[3]); for (const it of [...state.items]) { if ((it.f || 0) !== lv || CAT[it.k].stairs) continue; const d = CAT[it.k], hit = d.mount != null ? P.walls[it.wall] && P.walls[it.wall].rooms[it.side] === r.id : inR(it.x, it.z); if (hit) { dropObj(it); state.items.splice(state.items.indexOf(it), 1); } } for (const id in SURF) if (SURF[id].room === r.id) setSurf(id, SURF[id].def, new THREE.Vector3()); select(null); repick(); refreshLamps(); commit(); toast(r.def.n + ' reset', 'Undo', undo); }

/* catalog pictures, rendered once from the real models */
function makeThumbs(only) {
  const sc = new THREE.Scene(), cm = new THREE.PerspectiveCamera(22, 4 / 3, .1, 80), TW = 320, TH = 240, rt = new THREE.WebGLRenderTarget(TW, TH, { type: THREE.FloatType }), buf = new Float32Array(TW * TH * 4), cv = document.createElement('canvas'); cv.width = TW; cv.height = TH; const g2 = cv.getContext('2d');
  sc.add(new THREE.HemisphereLight('#ffffff', '#b9b2a6', 1.7)); const dl = new THREE.DirectionalLight('#fff', 2.4); dl.position.set(-3, 6, 5); sc.add(dl); const keep = X.shade.emissiveIntensity; X.shade.emissiveIntensity = .6; const ca = renderer.getClearAlpha(); renderer.setClearAlpha(0); const bx = new THREE.Box3(), c = new THREE.Vector3(), sz = new THREE.Vector3();
  for (const k of SHOP()) { if (only && k !== only) continue; const d = CAT[k], g = new THREE.Group(), M = makeMats(d, {}); d.build(g, M); sc.add(g); bx.setFromObject(g); bx.getCenter(c); bx.getSize(sz); const r = sz.length() / 2, dir = (d.mount != null ? new THREE.Vector3(-.4, .25, .9) : d.rug ? new THREE.Vector3(-.4, .9, .7) : new THREE.Vector3(-.6, .5, .85)).normalize();
    cm.position.copy(c).addScaledVector(dir, r / Math.sin(11 * Math.PI / 180) * 1.0); cm.lookAt(c); renderer.setRenderTarget(rt); renderer.clear(); renderer.render(sc, cm); renderer.readRenderTargetPixels(rt, 0, 0, TW, TH, buf);
    const im = g2.createImageData(TW, TH), px = im.data; for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) { const s = ((TH - 1 - y) * TW + x) * 4, o = (y * TW + x) * 4; for (let j = 0; j < 3; j++) { let v = buf[s + j] * .62; v = (v * (2.51 * v + .03)) / (v * (2.43 * v + .59) + .14); px[o + j] = Math.pow(clamp(v, 0, 1), 1 / 2.2) * 255; } px[o + 3] = clamp(buf[s + 3], 0, 1) * 255; }
    g2.putImageData(im, 0, 0); THUMBS[k] = cv.toDataURL('image/png'); sc.remove(g); disposeTree(g); for (const m in M) M[m].dispose(); }
  renderer.setRenderTarget(null); renderer.setClearAlpha(ca); X.shade.emissiveIntensity = keep; rt.dispose();
}

/* ───────────────────────── in-scene feedback: hover, rotation ring, snap line, grid ───────────────────────── */
const sq = () => new THREE.BufferGeometry().setFromPoints([[-.5, -.5], [.5, -.5], [.5, .5], [-.5, .5]].map(p => new THREE.Vector3(p[0], 0, p[1])));
const hoverLine = new THREE.LineLoop(sq(), new THREE.LineBasicMaterial({ color: '#23201c', depthTest: false, transparent: true, opacity: .45 })); hoverLine.renderOrder = 8; hoverLine.visible = false; scene.add(hoverLine);
const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 72 }, (_, i) => new THREE.Vector3(Math.sin(i / 72 * 6.2832), 0, Math.cos(i / 72 * 6.2832)))), new THREE.LineBasicMaterial({ color: '#b4553a', depthTest: false, transparent: true, opacity: .5 })); ring.renderOrder = 8; ring.visible = false; scene.add(ring);
const snapBar = new THREE.Mesh(new THREE.BoxGeometry(1, .012, .05), new THREE.MeshBasicMaterial({ color: '#b4553a', depthTest: false, transparent: true })); snapBar.renderOrder = 9; snapBar.visible = false; scene.add(snapBar);
const gridLines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#23201c', transparent: true, opacity: .24, depthTest: false })); gridLines.renderOrder = 7; gridLines.visible = false; scene.add(gridLines);
function syncGrid() { gridLines.visible = grid && state.started && !preview && !build; if (!gridLines.visible) return; const key = [P.x0, P.z0, P.W, P.D].join(); if (gridLines.userData.k !== key) { gridLines.userData.k = key; const p = []; for (let x = P.x0; x <= P.W + .001; x += .5) p.push(x, .02, P.z0, x, .02, P.D); for (let z = P.z0; z <= P.D + .001; z += .5) p.push(P.x0, .02, z, P.W, .02, z); gridLines.geometry.dispose(); gridLines.geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); } gridLines.position.copy(A.position).setY(P.y); }
let hov = null;
const frameOf = (o, it, pad = 0) => { const d = CAT[it.k].dim; o.position.set(it.x + A.position.x, baseY(it) + .03 + levelOf(it).y, it.z + A.position.z); o.rotation.y = it.r; o.scale.set(wOf(it) * it.s + pad, 1, d[1] * it.s + pad); };
const reach = it => { const d = CAT[it.k].dim; return Math.max(wOf(it), d[1]) * it.s / 2 + .42; };

/* ───────────────────────── floors: an upstairs over the house, reached by a staircase ───────────────────────── */
function setLevel(n) {
  if (!LV[n] || n === lv) return; cancelPlace(); select(null, true); selSurf = null; armed = false;
  if (focus) { focus = null; focusCam = null; }
  lv = n; P = LV[n]; applyFocusVis(); syncPick(); repick(); CAM0.ty = .3 + P.y; camG.ty = planView ? P.y : CAM0.ty;
  if (build) { build.arm = false; buildGrid(); buildMarks(); hideBuildFx(); }
  refreshLeft(); render();
}
// a first upstairs: the house's own rooms, retyped for sleeping, with its inside doors and windows above the ones below
function upperFrom() {
  const G = LV[0], rooms = [], ops = [], names = new Set(G.rooms.map(r => r.def.n)); let k = 0;
  const uniq = base => { if (!names.has(base) && !names.has(base + ' 1')) return names.add(base), base; let i = 2; while (names.has(`${base} ${i}`)) i++; names.add(`${base} ${i}`); return `${base} ${i}`; };
  for (const r of G.rooms) { const t0 = r.def.t; if (t0 === 'garage') continue; const t = t0 === 'kitchen' ? 'bedroom' : t0;
    rooms.push({ id: 'u' + (++k), n: uniq(t === 'living' ? 'Family room' : t === 'hall' ? 'Landing' : t === 'bath' ? 'Bathroom' : 'Bedroom'), t, r: r.def.r.map(q => q.slice()) }); }
  const subs = layoutSubs(rooms, []);
  for (const w of G.walls) for (const [kk, p, ow] of w.ops) { const u = w.a0 + p + ow / 2, s = subs.find(q => q.hz === w.hz && Math.abs(q.c - w.c) < .01 && u > q.a0 && u < q.a1); if (!s) continue;
    if (s.ext) { if (kk !== 'G') ops.push([kk === 'W' ? 'W' : 'w', w.hz ? 1 : 0, w.c, u, kk === 'W' ? ow : Math.min(ow, 2.0)]); } else if (kk === 'd') ops.push(['d', w.hz ? 1 : 0, w.c, u, ow]); }
  return { rooms, ops };
}
// the staircase runs along a wall (the hall first), never across a doorway, with room to step off at the top; it can climb
// either way along the wall (m = mirrored). Failing that it stands free in the largest room, clearing furniture if it must.
function stairSpot() {
  const G = LV[0], st = newInst('stairs', { f: 0 }), pref = { hall: 0, living: 1, kitchen: 2, bedroom: 3, bath: 4 };
  const rooms = G.rooms.filter(r => pref[r.def.t] != null).sort((a, b) => pref[a.def.t] - pref[b.def.t]);
  const done = (x, z, r, m, loose, room) => { Object.assign(st, { x, z, r, m }); const clear = loose ? state.items.filter(it => !(it.f > 0) && solid(CAT[it.k]) && overlap(obb(st), obb(it))) : [];
    for (const c of [...clear]) for (const q of riders(c)) if (!clear.includes(q.it)) clear.push(q.it); return { st, clear, room: room.def.n }; };
  for (const loose of [false, true]) { let best = null;   // fewest windows crossed, then fewest pieces moved out
    for (const r of rooms) for (const w of G.walls) for (const side of [0, 1]) {
      if (w.rooms[side] !== r.id) continue; const n = side ? -1 : 1, p = w.c + n * (w.t / 2 + .515), rot = w.hz ? (n > 0 ? 0 : Math.PI) : (n > 0 ? Math.PI / 2 : -Math.PI / 2), dir = Math.round(w.hz ? Math.cos(rot) : -Math.sin(rot));
      for (let u = w.a0 + 1.8; u <= w.a1 - 1.8 + 1e-6; u += .25) {
        const over = o => w.a0 + o[1] < u + 1.85 && w.a0 + o[1] + o[2] > u - 1.85; if (w.ops.some(o => o[0] !== 'w' && o[0] !== 'W' && over(o))) continue;
        const x = w.hz ? u : p, z = w.hz ? p : u; if (roomAt(x, z, G) !== r || blocked(st, x, z, rot, loose)) continue;
        for (const m of [false, true]) { const top = u + (m ? -dir : dir) * 2.3; if (top < w.a0 || top > w.a1) continue;
          Object.assign(st, { x, z, r: rot }); const score = w.ops.filter(over).length + (loose ? 10 * state.items.filter(it => !(it.f > 0) && solid(CAT[it.k]) && overlap(obb(st), obb(it))).length : 0);
          if (!best || score < best.score) best = { score, x, z, rot, m, r }; break; }
      }
    }
    if (best) return done(best.x, best.z, best.rot, best.m, loose, best.r); }
  const big = [...rooms].sort((a, b) => b.def.r.reduce((s, q) => s + (q[2] - q[0]) * (q[3] - q[1]), 0) - a.def.r.reduce((s, q) => s + (q[2] - q[0]) * (q[3] - q[1]), 0));
  for (const r of big) for (const q of r.def.r) for (const rot of [0, Math.PI / 2]) for (let x = q[0] + .9; x <= q[2] - .9; x += .25) for (let z = q[1] + .9; z <= q[3] - .9; z += .25) if (!blocked(st, x, z, rot, true)) return done(x, z, rot, false, true, r);
  return null;
}
function addFloor() {
  if (state.up) return setLevel(1); ensureStarted(); cancelPlace(); if (build) exitBuild(); STAIR_H = LV[0].H + .3;
  const spot = stairSpot(); if (!spot) return toast('No wall here is long enough for a staircase. Draw a hall or a larger room first.');
  pushHist(); for (const it of spot.clear) { dropObj(it); state.items.splice(state.items.indexOf(it), 1); }
  state.items.push(spot.st); state.up = upperFrom(); select(null, true); selSurf = null;
  lv = 1; rebuildAll(); camG.ty = CAM0.ty; Object.assign(camG, { dist: CAM0.dist }); commit();
  const gone = spot.clear.filter(it => solid(CAT[it.k])).map(it => lc(CAT[it.k].n));
  toast(`Upstairs added, stairs in the ${lc(spot.room)}${gone.length ? `. Made room by taking out the ${gone.join(', ')}` : ''}`, 'Undo', undo);
}
function removeFloor() {
  if (!state.up) return; cancelPlace(); pushHist(); for (const it of [...state.items]) if (it.f > 0 || CAT[it.k].stairs) { dropObj(it); state.items.splice(state.items.indexOf(it), 1); }
  state.up = null; lv = 0; select(null, true); selSurf = null; rebuildAll(); camG.ty = CAM0.ty; Object.assign(camG, { dist: CAM0.dist }); commit(); toast('Upstairs removed', 'Undo', undo);
}
// after the staircase moves, re-cut the stairwell in the floor above
function syncHole() { const L1 = LV[1]; if (!L1) return; const h = stairHole(), k = h ? h.key : '', k0 = L1.hole ? L1.hole.key : ''; if (k === k0) return; const keep = P; P = L1; buildFloors(L1); P = keep; syncPick(); }

/* ───────────────────────── build mode: draw rooms on a grid, then put doors and windows in their walls ───────────────────────── */
let build = null, AREA = [-12, -8, 24, 16];
const OPN = { d: 'Door', w: 'Window', W: 'Tall window', s: 'Glass door', G: 'Garage door' }, OPW = { d: .9, w: 1.4, s: 2.4, G: 2.6, W: 1.6 };
const BTOOLS = [['room', 'Room', 'room'], ['wall', 'Move wall', 'wallmv'], ['mroom', 'Move room', 'move'], ['d', 'Door', 'door'], ['w', 'Window', 'win'], ['s', 'Glass door', 'glass'], ['G', 'Garage door', 'garage'], ['erase', 'Erase', 'erase']];
const BHINT = { room: 'Drag on the ground to draw a room. Drawing over a room splits it. Click a room to change its type.', wall: 'Drag a wall to make the rooms beside it bigger or smaller.', mroom: 'Drag a room to move it, with everything in it, to open ground.', d: 'Click a wall to put a door in it.', w: 'Click a wall to put a window in it.', s: 'Click a wall for a sliding glass door.', G: 'Click an outside wall for a garage door.', erase: 'Click a door or a window to take it out, or a room to remove it.' };
const fxm = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthTest: false, depthWrite: false });
const BFX = new THREE.Group(); BFX.visible = false; scene.add(BFX);
const bPrev = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), fxm('#4f7a5a', .26)), bEdge = new THREE.LineLoop(sq(), new THREE.LineBasicMaterial({ color: '#4f7a5a', depthTest: false, transparent: true }));
const bOp = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), fxm('#4f7a5a', .5)), bHi = new THREE.Group(), bMarks = new THREE.Group();
const bGrid = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#23201c', transparent: true, opacity: .13, depthTest: false }));
bGrid.renderOrder = 7; bPrev.renderOrder = 9; bEdge.renderOrder = 10; bOp.renderOrder = 10; BFX.add(bGrid, bMarks, bHi, bPrev, bEdge, bOp);
const HIM = fxm('#d23a2a', .3), MK = { d: fxm('#b4553a', .9), s: fxm('#3f6f8f', .9), w: fxm('#6f9cc0', .9), W: fxm('#6f9cc0', .9), G: fxm('#6f6a62', .9) };
const g5 = v => Math.round(v * 2) / 2, fm = v => String(Math.round(v * 10) / 10);
const layOf = () => lv ? state.up : state.lay;
function hideBuildFx() { bPrev.visible = bEdge.visible = bOp.visible = bHi.visible = false; }
function showRect(q, kind) { const w = q[2] - q[0], d = q[3] - q[1], col = kind === 'bad' ? '#d23a2a' : kind === 'cell' ? '#23201c' : '#4f7a5a'; bPrev.material.color.set(col); bPrev.material.opacity = kind === 'cell' ? .1 : .26; bEdge.material.color.set(col); bEdge.material.opacity = kind === 'cell' ? .45 : 1;
  bPrev.scale.set(w, 1, d); bEdge.scale.set(w, 1, d); bPrev.position.set((q[0] + q[2]) / 2, .035, (q[1] + q[3]) / 2); bEdge.position.copy(bPrev.position); bPrev.visible = bEdge.visible = true; }
function showOp(w, u, ow, k, bad) { const H = P.H, [y0, y1] = k === 'w' ? [.85, 2.25] : k === 'W' ? [.35, H - .4] : k === 'd' ? [0, 2.1] : [0, 2.3], d = w.t + .34;
  if (w.hz) { bOp.scale.set(ow, y1 - y0, d); bOp.position.set(u, (y0 + y1) / 2, w.c); } else { bOp.scale.set(d, y1 - y0, ow); bOp.position.set(w.c, (y0 + y1) / 2, u); } bOp.material.color.set(bad ? '#d23a2a' : '#4f7a5a'); bOp.visible = true; }
function showRoomHi(r) { if (bHi.userData.k !== r.id) { bHi.userData.k = r.id; for (const c of [...bHi.children]) { c.geometry.dispose(); bHi.remove(c); }
    for (const q of r.def.r) { const m = new THREE.Mesh(new THREE.PlaneGeometry(q[2] - q[0], q[3] - q[1]).rotateX(-Math.PI / 2), HIM); m.position.set((q[0] + q[2]) / 2, .04, (q[1] + q[3]) / 2); m.renderOrder = 9; bHi.add(m); } } bHi.visible = true; }
function buildGrid() { let a = AREA, gy = .02; if (build && build.yard && !lv) { const y = lotOf(LV[0].S).yard; a = [Math.ceil(y[0] * 2) / 2, Math.ceil(y[1] * 2) / 2, Math.floor(y[2] * 2) / 2, Math.floor(y[3] * 2) / 2]; gy = GY0 + .02; } else if (lv) { const b = bbox(LV[0].S.rooms); a = [Math.floor(b.x0) - 1, Math.floor(b.z0) - 1, Math.ceil(b.x1) + 1, Math.ceil(b.z1) + 1]; }
  const p = []; for (let x = a[0]; x <= a[2] + 1e-6; x += .5) p.push(x, gy, a[1], x, gy, a[3]); for (let z = a[1]; z <= a[3] + 1e-6; z += .5) p.push(a[0], gy, z, a[2], gy, z);
  bGrid.geometry.dispose(); bGrid.geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); }
function buildMarks() { for (const c of [...bMarks.children]) { c.geometry.dispose(); bMarks.remove(c); } bHi.userData.k = null; if (!build) return;
  for (const w of P.walls) for (const [k, p, ow] of w.ops) { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), MK[k] || MK.w), u = w.a0 + p + ow / 2; if (w.hz) { m.scale.set(ow, .03, w.t + .16); m.position.set(u, .05, w.c); } else { m.scale.set(w.t + .16, .03, ow); m.position.set(w.c, .05, u); } m.renderOrder = 8; bMarks.add(m); } }
function wallNear(q) { let best = null; for (const w of P.walls) { const d = Math.abs((w.hz ? q.z : q.x) - w.c), u = w.hz ? q.x : q.z; if (d < .5 && u > w.a0 - .05 && u < w.a1 + .05 && (!best || d < best.d)) best = { w, d, u }; } return best; }
function opAt(w, u) { return w.ops.find(o => u >= w.a0 + o[1] - .15 && u <= w.a0 + o[1] + o[2] + .15) || null; }
function opPlan(k, q) {
  const h = wallNear(q); if (!h) return { why: 'Point at a wall' }; const w = h.w, ow = OPW[k], len = w.a1 - w.a0;
  if (k === 'G' && !w.ext) return { w, why: 'Garage doors go in outside walls' };
  if (ow > len - .2) return { w, why: 'This stretch of wall is too short' };
  const u = clamp(Math.round(h.u / .25) * .25, w.a0 + .1 + ow / 2, w.a1 - .1 - ow / 2);
  for (const o of w.ops) { const a = w.a0 + o[1]; if (u - ow / 2 < a + o[2] + .1 && u + ow / 2 > a - .1) return { w, u, ow, why: 'Too close to another opening' }; }
  return { w, u, ow };
}
const supported = q => { for (let x = q[0] + .25; x < q[2]; x += .5) for (let z = q[1] + .25; z < q[3]; z += .5) if (!roomAt(x, z, LV[0])) return false; return true; };
function roomWhy(q) { if (q[2] - q[0] < 1.5 || q[3] - q[1] < 1.5) return 'A room needs at least 1.5 m a side'; if (lv) return supported(q) ? null : 'Upstairs rooms need a room below them'; if (q[0] < AREA[0] || q[1] < AREA[1] || q[2] > AREA[2] || q[3] > AREA[3]) return 'That runs off the lot'; return null; }
function roomLabel(t, self) { const base = lv && t === 'hall' ? 'Landing' : RT[t], names = new Set(); for (const L of [state.lay, state.up]) if (L) for (const r of L.rooms) if (r !== self) names.add(r.n);
  if (!names.has(base) && !names.has(base + ' 1')) return base; let k = 2; while (names.has(`${base} ${k}`)) k++; return `${base} ${k}`; }
function newRoomId() { const ids = new Set(); for (const L of [state.lay, state.up]) if (L) for (const r of L.rooms) ids.add(r.id); const p = lv ? 'u' : 'r'; let k = 1; while (ids.has(p + k)) k++; return p + k; }
// a ready-made plan becomes a layout of its own the first time it is edited
function ensureCustom() {
  if (state.lay) return; const G = LV[0], S = G.S;
  state.lay = { H: S.H, rooms: S.rooms.map(r => ({ id: r.id, n: r.n, t: r.t, r: r.r.map(q => q.slice()) })), ops: [] };
  for (const w of G.walls) for (const [k, p, ow] of w.ops) state.lay.ops.push([k, w.hz ? 1 : 0, w.c, w.a0 + p + ow / 2, ow]);
  state.plan = 'custom';
}
// every layout edit: renumbered walls keep their finishes and the pieces hanging on them, matched by position
function relayout(fn, msg, remap) {
  pushHist(); if (!lv) ensureCustom(); const L = layOf();
  const anchors = []; for (const it of state.items) { if (CAT[it.k].mount == null) continue; const w = levelOf(it).walls[it.wall]; if (w) anchors.push({ it, L: it.f || 0, hz: w.hz, c: w.c, side: it.side, u: it.u, room: w.rooms[it.side] }); }
  const fin = []; for (const Lv of LV) for (const w of Lv.walls) for (const s of [0, 1]) { const id = w.mats[s] && w.mats[s].userData.surf; if (id && id !== 'ext' && state.surf[id]) fin.push({ L: Lv.L, hz: w.hz, c: w.c, a0: w.a0, a1: w.a1, s, mat: state.surf[id], room: w.rooms[s] }); }
  fn(L); if (remap) { anchors.forEach(remap); fin.forEach(remap); } for (const id of Object.keys(state.surf)) if (id[0] === 'w') delete state.surf[id];
  rebuildAll();
  for (const Lv of LV) for (const w of Lv.walls) for (const s of [0, 1]) { const id = w.mats[s] && w.mats[s].userData.surf; if (!id || id === 'ext') continue; const m = (w.a0 + w.a1) / 2, f = fin.find(e => e.L === Lv.L && e.hz === w.hz && Math.abs(e.c - w.c) < .01 && e.s === s && m > e.a0 && m < e.a1); if (f && f.mat !== state.surf[id]) { state.surf[id] = f.mat; SURF[id].mat.userData.set(f.mat, null, true); } }
  let lost = 0; for (const a of anchors) { const Lv = LV[a.L], i = Lv ? Lv.walls.findIndex(w => w.hz === a.hz && Math.abs(w.c - a.c) < .01 && a.u >= w.a0 && a.u <= w.a1 && w.rooms[a.side]) : -1; if (i < 0) { dropObj(a.it); state.items.splice(state.items.indexOf(a.it), 1); lost++; } else { a.it.wall = i; a.it.u = a.u; placeObj(a.it); } }
  for (const [Lv, lay] of [[LV[0], state.lay], [LV[1], state.up]]) if (Lv && lay) lay.ops = lay.ops.filter(o => Lv.S.subs.used.has(o));
  repick(); refreshLamps(); refreshMounts(); updateWalls(); buildMarks(); commit();
  if (msg) toast(msg + (lost ? `. ${lost} wall piece${lost > 1 ? 's' : ''} came down with it` : ''), 'Undo', undo);
}
function addRoom(q, t) { relayout(L => { for (const r of L.rooms) r.r = r.r.flatMap(p => rectMinus(p, q)); L.rooms = L.rooms.filter(r => r.r.length); L.rooms.push({ id: newRoomId(), n: roomLabel(t, null), t, r: [q] }); }, `${lv && t === 'hall' ? 'Landing' : RT[t]} added, ${fm(q[2] - q[0])} × ${fm(q[3] - q[1])} m`); }
function retype(r, t) { if (r.def.t === t) return; relayout(L => { const q = L.rooms.find(x => x.id === r.id); q.t = t; q.n = roomLabel(t, q); delete state.surf['f:' + r.id]; }, `Now a ${lc(lv && t === 'hall' ? 'Landing' : RT[t])}`); }
function eraseRoom(r) {
  if (!lv && LV[1] && LV[1].rooms.some(u => u.def.r.some(q => r.def.r.some(p => p[0] < q[2] && p[2] > q[0] && p[1] < q[3] && p[3] > q[1])))) return toast('There is a room above it. Remove that one first.');
  const st = state.items.find(it => CAT[it.k].stairs); if (st && !lv && r.def.r.some(q => st.x >= q[0] && st.x <= q[2] && st.z >= q[1] && st.z <= q[3])) return toast('The staircase is in this room. Move it out first.');
  const nm = r.def.n; relayout(L => { L.rooms = L.rooms.filter(q => q.id !== r.id); delete state.surf['f:' + r.id];
    for (const it of [...state.items]) if ((it.f || 0) === lv && CAT[it.k].mount == null && r.def.r.some(q => it.x >= q[0] && it.x <= q[2] && it.z >= q[1] && it.z <= q[3])) { dropObj(it); state.items.splice(state.items.indexOf(it), 1); } }, nm + ' removed');
}
function addOp(p, k) { relayout(L => L.ops.push([k, p.w.hz ? 1 : 0, p.w.c, p.u, p.ow]), OPN[k] + ' added'); }
function eraseOp(w, o) { const u = w.a0 + o[1] + o[2] / 2; relayout(L => { L.ops = L.ops.filter(p => !(!!p[1] === w.hz && Math.abs(p[2] - w.c) < .01 && Math.abs(p[3] - u) < .3)); }, OPN[o[0]] + ' removed'); }
function clearFloor() {
  if (!lv && state.up) return toast('Remove the upstairs first');
  relayout(L => { L.rooms = []; L.ops = []; for (const it of [...state.items]) if ((it.f || 0) === lv && !CAT[it.k].stairs) { dropObj(it); state.items.splice(state.items.indexOf(it), 1); } }, lv ? 'Upstairs cleared' : 'Every room cleared. Drag on the grid to start');
}
function enterBuild() {
  if (outside) setOutside(false); ensureStarted(); cancelPlace(); select(null, true); selSurf = null; armed = false; if (focus) { focus = null; focusCam = null; applyFocusVis(); }
  const b = bbox(LV[0].S.rooms); AREA = [Math.floor(b.x0) - 8, Math.floor(b.z0) - 6, Math.ceil(b.x1) + 8, Math.ceil(b.z1) + 6];
  build = { tool: 'room', rt: LV[0].rooms.length ? 'bedroom' : 'living', arm: false }; tab = 'layout'; buildGrid(); buildMarks(); render(); intro.end();
}
function exitBuild() {
  if (!build) return; build = null; hideBuildFx(); buildMarks(); showTip(); canvas.style.cursor = 'default';
  const ox = A.position.x, oz = A.position.z; recentre(); const dx = A.position.x - ox, dz = A.position.z - oz; cam.tx += dx; cam.tz += dz; camG.tx += dx; camG.tz += dz;
  Object.assign(camG, { tx: CAM0.tx, ty: planView ? P.y : CAM0.ty, tz: CAM0.tz, dist: Math.max(camG.dist, CAM0.dist * .9) }); refreshLeft(); render();
}
function buildHover(cx, cy) {
  hideBuildFx(); build.hov = null; if (!overCanvas(cx, cy)) { showTip(); return; } aim(cx, cy); const q = floorPt(0); if (!q) { showTip(); return; }
  const t = build.tool; canvas.style.cursor = 'crosshair'; if (build.yard) return yardHover(cx, cy, q);
  if (t === 'room') { const r = roomAt(q.x, q.z), x = Math.floor(q.x * 2) / 2, z = Math.floor(q.z * 2) / 2; showRect([x, z, x + .5, z + .5], 'cell'); build.hov = { room: r };
    return showTip(cx, cy, r ? r.def.n : `Drag to draw a ${lc(lv && build.rt === 'hall' ? 'landing' : RT[build.rt])}`, r ? (r.def.t === build.rt ? 'Drag to draw a room inside it' : `Click to make it a ${lc(RT[build.rt])}`) : '50 cm grid'); }
  if (t === 'wall') { const h = wallNear(q); if (!h) return showTip(cx, cy, 'Point at a wall'); showWall(h.w, h.w.c, false); build.hov = { w: h.w }; return showTip(cx, cy, 'Drag to move this wall', `${fm(h.w.a1 - h.w.a0)} m long`); }
  if (t === 'mroom') { const r = roomAt(q.x, q.z); if (!r) return showTip(cx, cy, 'Point at a room'); const why = roomMoveWhy(r, 0, 0); showRects(r.def.r, !why, r.id + 'h' + !why); return showTip(cx, cy, r.def.n, why || 'Drag to move it'); }
  if (t === 'erase') { const h = wallNear(q), o = h && opAt(h.w, h.u); if (o) { showOp(h.w, h.w.a0 + o[1] + o[2] / 2, o[2], o[0], true); build.hov = { op: o, w: h.w }; return showTip(cx, cy, OPN[o[0]], 'Click to take it out'); }
    const r = roomAt(q.x, q.z); if (r) { showRoomHi(r); build.hov = { room: r }; return showTip(cx, cy, r.def.n, 'Click to remove the room'); } return showTip(cx, cy, 'Point at a room, a door or a window'); }
  const p = opPlan(t, q); if (p.w && p.u != null) showOp(p.w, p.u, p.ow, t, !!p.why); build.hov = p.why ? null : p; showTip(cx, cy, p.why || OPN[t], p.why ? null : `${money(OPP[t])} · click to add`);
}
function buildClick(cx, cy) {
  aim(cx, cy); const q = floorPt(0); if (!q) return; const t = build.tool; if (build.yard) { yardClick(q); buildHover(cx, cy); return; }
  if (t === 'room') { const r = roomAt(q.x, q.z); if (r) retype(r, build.rt); else toast('Drag to draw a room'); }
  else if (t === 'erase') { const h = wallNear(q), o = h && opAt(h.w, h.u); if (o) eraseOp(h.w, o); else { const r = roomAt(q.x, q.z); if (r) eraseRoom(r); } }
  else { const p = opPlan(t, q); if (p.why) toast(p.why); else addOp(p, t); }
  buildHover(cx, cy);
}
/* moving walls and rooms. Both work on a copy of the layout first, so the preview can say whether the move fits. */
const SPAN = .01;
const cloneLay = L => ({ ...L, rooms: L.rooms.map(r => ({ ...r, r: r.r.map(q => q.slice()) })), ops: L.ops.map(o => o.slice()) });
function presetLay() { const G = LV[0], S = G.S, L = { H: S.H, rooms: S.rooms.map(r => ({ id: r.id, n: r.n, t: r.t, r: r.r.map(q => q.slice()) })), ops: [] };
  for (const w of G.walls) for (const [k, p, ow] of w.ops) L.ops.push([k, w.hz ? 1 : 0, w.c, w.a0 + p + ow / 2, ow]); return L; }
const curLay = () => lv ? state.up : state.lay || presetLay();
// one stretch of wall moves to a new line; rooms on both sides grow or shrink, and a room whose edge only partly
// runs along the stretch is split there, so the room turns into an L rather than dragging its whole side along
function wallMoved(L, w, c2) {
  const N = cloneLay(L), [i0, i1, e0, e1] = w.hz ? [0, 2, 1, 3] : [1, 3, 0, 2];
  for (const r of N.rooms) { const out = [];
    for (const q of r.r) {
      const on = (Math.abs(q[e0] - w.c) < SPAN || Math.abs(q[e1] - w.c) < SPAN) && q[i0] < w.a1 - SPAN && q[i1] > w.a0 + SPAN;
      if (!on) { out.push(q); continue; }
      const cuts = [q[i0], ...[w.a0, w.a1].filter(v => v > q[i0] + SPAN && v < q[i1] - SPAN), q[i1]];
      for (let j = 0; j < cuts.length - 1; j++) { const p = q.slice(); p[i0] = cuts[j]; p[i1] = cuts[j + 1]; const m = (cuts[j] + cuts[j + 1]) / 2;
        if (m > w.a0 && m < w.a1) { if (Math.abs(p[e0] - w.c) < SPAN) p[e0] = c2; if (Math.abs(p[e1] - w.c) < SPAN) p[e1] = c2; p.mv = 1; }
        out.push(p); } }
    r.r = out; }
  for (const o of N.ops) if (!!o[1] === w.hz && Math.abs(o[2] - w.c) < SPAN && o[3] > w.a0 && o[3] < w.a1) o[2] = c2;
  return N;
}
function roomMoved(L, id, dx, dz) {
  const N = cloneLay(L), R = N.rooms.find(q => q.id === id), old = R.r.map(q => q.slice());
  R.r = R.r.map(q => { const p = [q[0] + dx, q[1] + dz, q[2] + dx, q[3] + dz]; p.mv = 1; return p; });
  const onEdge = o => old.some(q => o[1] ? (Math.abs(o[2] - q[1]) < SPAN || Math.abs(o[2] - q[3]) < SPAN) && o[3] > q[0] && o[3] < q[2] : (Math.abs(o[2] - q[0]) < SPAN || Math.abs(o[2] - q[2]) < SPAN) && o[3] > q[1] && o[3] < q[3]);
  for (const o of N.ops) if (onEdge(o)) { if (o[1]) { o[2] += dz; o[3] += dx; } else { o[2] += dx; o[3] += dz; } }
  return N;
}
const overlapR = (a, b) => a[0] < b[2] - SPAN && a[2] > b[0] + SPAN && a[1] < b[3] - SPAN && a[3] > b[1] + SPAN;
const coveredBy = (rooms, q) => { for (let x = q[0] + .25; x < q[2]; x += .5) for (let z = q[1] + .25; z < q[3]; z += .5) if (!rooms.some(r => r.r.some(p => x >= p[0] && x <= p[2] && z >= p[1] && z <= p[3]))) return false; return true; };
// why a changed layout cannot be built, or null
function layoutWhy(N) {
  const rs = []; for (const r of N.rooms) for (const q of r.r) { if (q.mv && (q[2] - q[0] < .99 || q[3] - q[1] < .99)) return `The ${lc(r.n)} would get too narrow`; rs.push([r, q]); }
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) if ((rs[i][1].mv || rs[j][1].mv) && overlapR(rs[i][1], rs[j][1])) return rs[i][0] === rs[j][0] ? `The ${lc(rs[i][0].n)} would fold over itself` : `It would run into the ${lc((rs[i][1].mv ? rs[j][0] : rs[i][0]).n)}`;
  for (const [r, q] of rs) if (q.mv) { if (lv) { if (!supported(q)) return 'Upstairs rooms need a room below them'; } else if (q[0] < AREA[0] || q[1] < AREA[1] || q[2] > AREA[2] || q[3] > AREA[3]) return 'That runs off the lot'; }
  if (!lv && state.up) for (const u of state.up.rooms) for (const q of u.r) if (!coveredBy(N.rooms, q)) return `The ${lc(u.n)} upstairs would lose the room under it`;
  return null;
}
// how big the rooms on either side of a wall come out, for the tip while dragging
function sizesOf(N, ids) { return ids.filter(Boolean).map(id => { const r = N.rooms.find(q => q.id === id); if (!r) return ''; const b = bbox([r]), A2 = r.r.reduce((t, q) => t + (q[2] - q[0]) * (q[3] - q[1]), 0); return r.r.length > 1 ? `${r.n} ${fm(A2)} m²` : `${r.n} ${fm(b.x1 - b.x0)} × ${fm(b.z1 - b.z0)} m`; }).filter(Boolean).join(' · '); }
const inRects = (rs, x, z) => rs.some(q => x >= q[0] - .01 && x <= q[2] + .01 && z >= q[1] - .01 && z <= q[3] + .01);
function moveWall(w, c2, N) {
  const d = c2 - w.c, lo = Math.min(w.c, c2) - .3, hi = Math.max(w.c, c2) + .3, band = w.hz ? [w.a0, lo, w.a1, hi] : [lo, w.a0, hi, w.a1];
  const nm = sizesOf(N, w.rooms);
  relayout(L => { L.rooms = N.rooms.map(r => ({ ...r, r: r.r.map(q => q.slice(0, 4)) })); L.ops = N.ops;
    // furniture in the strip the wall sweeps across moves with it
    for (const it of state.items) { if ((it.f || 0) !== lv || CAT[it.k].mount != null || CAT[it.k].stairs) continue; const cs = corners(obb(it, it.x, it.z, it.r, 0)), b = [Math.min(...cs.map(p => p[0])), Math.min(...cs.map(p => p[1])), Math.max(...cs.map(p => p[0])), Math.max(...cs.map(p => p[1]))];
      if (overlapR(b, band)) { if (w.hz) it.z += d; else it.x += d; } } },
    `Wall moved ${fm(Math.abs(d))} m${nm ? '. ' + nm : ''}`,
    e => { if (e.L === lv && e.hz === w.hz && Math.abs(e.c - w.c) < SPAN) { const u = e.u != null ? e.u : (e.a0 + e.a1) / 2; if (u > w.a0 && u < w.a1) e.c = c2; } });
}
function moveRoom(r, dx, dz, N) {
  const old = r.def.r.map(q => q.slice());
  relayout(L => { L.rooms = N.rooms.map(q => ({ ...q, r: q.r.map(p => p.slice(0, 4)) })); L.ops = N.ops;
    for (const it of state.items) if ((it.f || 0) === lv && CAT[it.k].mount == null && inRects(old, it.x, it.z)) { it.x += dx; it.z += dz; } },
    `${r.def.n} moved`, e => { if (e.L === lv && e.room === r.id) { if (e.hz) { e.c += dz; if (e.u != null) e.u += dx; else { e.a0 += dx; e.a1 += dx; } } else { e.c += dx; if (e.u != null) e.u += dz; else { e.a0 += dz; e.a1 += dz; } } } });
}
function roomMoveWhy(r, dx, dz) {
  if (!lv && LV[1] && LV[1].rooms.some(u => u.def.r.some(q => r.def.r.some(p => overlapR(p, q))))) return 'There is a room above it';
  const st = state.items.find(it => CAT[it.k].stairs); if (st && !lv && inRects(r.def.r, st.x, st.z)) return 'The staircase would leave the upstairs behind';
  return null;
}
// a preview of rectangles somewhere else: the room being moved
function showRects(rs, ok, key) { if (bHi.userData.k !== key) { bHi.userData.k = key; for (const c of [...bHi.children]) { c.geometry.dispose(); bHi.remove(c); }
    for (const q of rs) { const m = new THREE.Mesh(new THREE.PlaneGeometry(q[2] - q[0], q[3] - q[1]).rotateX(-Math.PI / 2), ok ? OKM : HIM); m.position.set((q[0] + q[2]) / 2, .045, (q[1] + q[3]) / 2); m.renderOrder = 9; bHi.add(m);
      const e = new THREE.LineLoop(sq(), ok ? OKL : HIL); e.scale.set(q[2] - q[0], 1, q[3] - q[1]); e.position.copy(m.position); e.renderOrder = 10; bHi.add(e); } } bHi.visible = true; }
const OKM = fxm('#fbf6ec', .5), OKL = new THREE.LineBasicMaterial({ color: '#4f7a5a', depthTest: false, transparent: true }), HIL = new THREE.LineBasicMaterial({ color: '#d23a2a', depthTest: false, transparent: true });
function showWall(w, c, bad) { const len = w.a1 - w.a0, H = P.H, t = Math.max(w.t, .14) + .1; if (w.hz) { bOp.scale.set(len, H, t); bOp.position.set((w.a0 + w.a1) / 2, H / 2, c); } else { bOp.scale.set(t, H, len); bOp.position.set(c, H / 2, (w.a0 + w.a1) / 2); } bOp.material.color.set(bad ? '#d23a2a' : '#4f7a5a'); bOp.visible = true; }

/* room labels while building: name and size over each room */
const labelsEl = (() => { const d = document.createElement('div'); d.id = 'blabels'; $('#ui').append(d); return d; })(), LABELS = new Map();
function syncLabels() {
  const show = build && !build.yard && !(drag && (drag.type === 'mroom' || drag.type === 'wall') && drag.moved), seen = new Set();
  if (show) for (const r of P.rooms) { let big = r.def.r[0], A0 = 0; for (const q of r.def.r) { const a = (q[2] - q[0]) * (q[3] - q[1]); if (a > A0) { A0 = a; big = q; } }
    let e = LABELS.get(r.id); if (!e) { e = el('div', 'blab'); labelsEl.append(e); LABELS.set(r.id, e); }
    const b = bbox([r.def]), area = r.def.r.reduce((s, q) => s + (q[2] - q[0]) * (q[3] - q[1]), 0), txt = `${r.def.n}<em>${r.def.r.length > 1 ? fm(area) + ' m²' : `${fm(b.x1 - b.x0)} × ${fm(b.z1 - b.z0)} m`}</em>`;
    if (e.dataset.t !== txt) { e.innerHTML = txt; e.dataset.t = txt; }
    v3.set((big[0] + big[2]) / 2 + A.position.x, P.y + .05, (big[1] + big[3]) / 2 + A.position.z).project(camera); e.style.left = (v3.x * .5 + .5) * uiW() + 'px'; e.style.top = (-v3.y * .5 + .5) * uiH() + 'px'; seen.add(r.id); }
  for (const [id, e] of LABELS) if (!seen.has(id)) { e.remove(); LABELS.delete(id); }
}

/* roofs: over every part of a storey with nothing built above it. Shown in the outside view only, so the rooms stay open while you work */
let outside = false;
function coverRects(rs, overlap) {   // the union of rectangles, recut into a few big ones (overlapping for hip roofs)
  const xs = [...new Set(rs.flatMap(q => [q[0], q[2]]))].sort((a, b) => a - b), zs = [...new Set(rs.flatMap(q => [q[1], q[3]]))].sort((a, b) => a - b), nx = xs.length - 1, nz = zs.length - 1;
  const fill = [], used = []; for (let i = 0; i < nx; i++) { fill.push([]); used.push([]); for (let j = 0; j < nz; j++) { const x = (xs[i] + xs[i + 1]) / 2, z = (zs[j] + zs[j + 1]) / 2; fill[i].push(rs.some(q => x > q[0] && x < q[2] && z > q[1] && z < q[3])); used[i].push(false); } }
  const ok = (i, j) => fill[i][j] && (overlap || !used[i][j]), out = [];
  for (;;) { let s = null; let best = 0;
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) if (fill[i][j] && !used[i][j]) {
      // grow the biggest rectangle that starts here
      for (const dir of [0, 1]) { let i1 = i, j1 = j; if (dir) { while (j1 + 1 < nz && ok(i, j1 + 1)) j1++; let go = true; while (go && i1 + 1 < nx) { for (let jj = j; jj <= j1; jj++) if (!ok(i1 + 1, jj)) go = false; if (go) i1++; } }
        else { while (i1 + 1 < nx && ok(i1 + 1, j)) i1++; let go = true; while (go && j1 + 1 < nz) { for (let ii = i; ii <= i1; ii++) if (!ok(ii, j1 + 1)) go = false; if (go) j1++; } }
        let i0 = i, j0 = j; if (overlap) { let go = true; while (go && i0 > 0) { for (let jj = j0; jj <= j1; jj++) if (!fill[i0 - 1][jj]) go = false; if (go) i0--; } go = true; while (go && j0 > 0) { for (let ii = i0; ii <= i1; ii++) if (!fill[ii][j0 - 1]) go = false; if (go) j0--; } }
        const a = (xs[i1 + 1] - xs[i0]) * (zs[j1 + 1] - zs[j0]); if (a > best) { best = a; s = [i0, j0, i1, j1]; } } }
    if (!s) break; for (let i = s[0]; i <= s[2]; i++) for (let j = s[1]; j <= s[3]; j++) used[i][j] = true; out.push([xs[s[0]], zs[s[1]], xs[s[2] + 1], zs[s[3] + 1]]); }
  return out;
}
const ROOFM = {};
function roofMats() { if (ROOFM.tile) return ROOFM; const cv = document.createElement('canvas'); cv.width = cv.height = 256; const g = cv.getContext('2d'); seed = 404; g.fillStyle = '#56585c'; g.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 16) { g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(x, 0, 2, 256); g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(x + 2, 0, 2, 256); }
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${rnd() < .5 ? '255,255,255' : '0,0,0'},.05)`; g.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 3, 1 + rnd() * 6); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return Object.assign(ROOFM, { tile: new THREE.MeshStandardMaterial({ map: t, roughness: .55, metalness: .25, side: THREE.DoubleSide }), fascia: std('#2e3034', { roughness: .6 }), flat: std('#c9c4bb', { roughness: .97 }), edge: std('#e9e4db', { roughness: .85 }) }); }
function hipGeo(q, y, ov, k) {   // a hip roof over one rectangle: ridge along the long side, slope k (rise per run)
  const x0 = q[0] - ov, z0 = q[1] - ov, x1 = q[2] + ov, z1 = q[3] + ov, w = x1 - x0, d = z1 - z0, P3 = [], UV = [];
  const tri = (a, b, c) => { for (const p of [a, b, c]) { P3.push(p[0], p[1], p[2]); UV.push(p[0] * .7 * (w >= d ? 1 : 0) + p[2] * .7 * (w >= d ? 0 : 1), (p[1] - y) * 1.3 + (w >= d ? p[2] : p[0]) * 0); } };
  const quad = (a, b, c, d2) => { tri(a, b, c); tri(a, c, d2); };
  if (w >= d) { const h = d / 2 * k, xa = x0 + d / 2, xb = x1 - d / 2, zc = (z0 + z1) / 2, A1 = [x0, y, z0], B1 = [x1, y, z0], C1 = [x1, y, z1], D1 = [x0, y, z1], R0 = [xa, y + h, zc], R1 = [xb, y + h, zc];
    quad(D1, C1, R1, R0); quad(B1, A1, R0, R1); tri(A1, D1, R0); tri(C1, B1, R1); }
  else { const h = w / 2 * k, za = z0 + w / 2, zb = z1 - w / 2, xc = (x0 + x1) / 2, A1 = [x0, y, z0], B1 = [x1, y, z0], C1 = [x1, y, z1], D1 = [x0, y, z1], R0 = [xc, y + h, za], R1 = [xc, y + h, zb];
    quad(A1, D1, R1, R0); quad(C1, B1, R0, R1); tri(B1, A1, R0); tri(D1, C1, R1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P3, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2)); g.computeVertexNormals(); return g;
}
function buildRoofs() {
  for (const L of LV) { if (L.roof) { L.grp.remove(L.roof); disposeTree(L.roof); } const above = LV[L.L + 1]; let rs = []; for (const r of L.rooms) for (const q of r.def.r) rs.push(q.slice(0, 4));
    if (above) for (const u of above.rooms) for (const h of u.def.r) rs = rs.flatMap(q => rectMinus(q, h));
    const g = new THREE.Group(); L.roof = g; L.grp.add(g); g.visible = roofShown(); if (!rs.length) continue; const M = roofMats(), y = L.H;
    if (state.roof === 'flat') for (const q of coverRects(rs, false)) { const w = q[2] - q[0], d = q[3] - q[1]; B(w + .34, .24, d + .34, [M.edge, M.edge, M.flat, M.edge, M.edge, M.edge], (q[0] + q[2]) / 2, y, (q[1] + q[3]) / 2, g); }
    else for (const q of coverRects(rs, true)) { const m = new THREE.Mesh(hipGeo(q, y + .14, .42, .5), M.tile); m.castShadow = m.receiveShadow = true; g.add(m);
      const w = q[2] - q[0] + .84, d = q[3] - q[1] + .84, cx = (q[0] + q[2]) / 2, cz = (q[1] + q[3]) / 2; for (const [bw, bd, x, z] of [[w, .05, cx, q[1] - .42], [w, .05, cx, q[3] + .42], [.05, d, q[0] - .42, cz], [.05, d, q[2] + .42, cz]]) B(bw, .2, bd, M.fascia, x, y, z, g, { noCast: true });
      B(q[2] - q[0] + .3, .16, q[3] - q[1] + .3, M.edge, cx, y, cz, g, { noCast: true }); } }
}
const roofShown = () => outside && !build && !focus && !planView && state.roof !== 'none';
function setOutside(on) {
  if (on === outside) return; if (on) { if (build) exitBuild(); cancelPlace(); select(null, true); selSurf = null; if (focus) { focus = null; focusCam = null; applyFocusVis(); } if (planView) setPlanView(false); }
  outside = on; const b = $('#bOut'); if (b) { b.classList.toggle('on', on); b.dataset.tip = on ? 'Back inside' : 'See the outside, roof on'; }
  for (const L of LV) if (L.roof) L.roof.visible = roofShown(); levelVis(); updateWalls(); refreshMounts(); refreshLamps(); refreshLeft(); render();
  if (on) Object.assign(camG, { el: Math.min(camG.el, .5), ty: CAM0.ty + (LV[1] ? 1.2 : 0) });
}

/* prices: every piece, every room and every opening has a cost; the home's value is the sum */
const RATE = { living: 1100, bedroom: 1000, kitchen: 1600, bath: 1900, hall: 800, garage: 600 }, OPP = { d: 450, w: 650, W: 950, s: 2600, G: 2200 }, FINP = { wood: 70, stone: 95 };
const PRICE_G = { living: 1, bedroom: 1, kitchen: 1.3, bath: 1.2, decor: .6, garage: 1 };
function priceOf(k) { const d = CAT[k]; if (d.price) return d.price; const [w, dd, h] = d.dim; let p = 60 + 340 * w * dd + 140 * h; if (d.small) p = 25 + 110 * w * dd + 70 * h; else if (d.rug) p = 40 + 95 * w * dd; else if (d.mount != null) p = 70 + 150 * w * dd; return Math.max(15, Math.round(p * (PRICE_G[d.g] || 1) / 5) * 5); }
const money = n => '$' + Math.round(n).toLocaleString('en-US');
function buildCost(L) { let s = 0; for (const r of L.rooms) { const a = r.def.r.reduce((t, q) => t + (q[2] - q[0]) * (q[3] - q[1]), 0), f = state.surf['f:' + r.id], c = f && MATS[f] ? FINP[MATS[f].c] || 0 : 0; s += a * ((RATE[r.def.t] || 1000) * (L.L ? 1.08 : 1) + c); }
  for (const w of L.walls) { s += (w.a1 - w.a0) * (w.ext ? 260 : 140); for (const o of w.ops) s += OPP[o[0]] || 0; } return s; }
const furnCost = () => state.items.reduce((s, it) => s + priceOf(it.k) * (CAT[it.k].rs ? it.s * it.s : 1) * (it.len ? it.len / CAT[it.k].dim[0] : 1), 0);
const homeValue = () => LV.reduce((s, L) => s + buildCost(L), 0) + furnCost() + yardCost();

const levelArea = L => Math.round(L.rooms.filter(r => r.def.t !== 'garage').reduce((a, r) => a + r.def.r.reduce((b, q) => b + (q[2] - q[0]) * (q[3] - q[1]), 0), 0));
function renderBuild() {
  if (!lv) sub.append(seg({ house: 'House', garden: 'Garden' }, build.yard ? 'garden' : 'house', k => { build.yard = k === 'garden'; build.tool = build.yard ? 'pool' : 'room'; build.arm = false; buildGrid(); hideBuildFx(); render(); }));
  if (state.up) { const s = seg({ 0: 'Ground floor', 1: 'Upstairs' }, String(lv), k => setLevel(+k)); s.classList.add('fl'); sub.append(s); }
  if (build.yard) { renderYardTools(); return; }
  const tg = el('div', 'btools'); for (const [k, n, ic] of BTOOLS) { if (k === 'G' && lv) continue; const b = el('button', 'bt' + (build.tool === k ? ' on' : ''), svg(ic, 20) + `<span>${n}</span>`); b.onclick = () => { build.tool = k; build.arm = false; render(); }; tg.append(b); } G(null, '', tg);
  if (build.tool === 'room') { const rt = el('div', 'chips'); for (const t in RT) { if (t === 'garage' && lv) continue; const b = el('button', 'rc' + (build.rt === t ? ' on' : ''), lv && t === 'hall' ? 'Landing' : RT[t]); b.onclick = () => { build.rt = t; render(); }; rt.append(b); } G('Room type', 'w300', rt); }
  const n = P.rooms.length, st = el('p', 'note', n ? `${lv ? 'Upstairs' : 'Ground floor'}: ${n} room${n > 1 ? 's' : ''}, ${levelArea(P)} m², built for ${money(buildCost(P))}` : 'No rooms on this floor yet.');
  const done = el('button', 'cta' + (build.arm ? ' warn' : ''), build.arm ? (lv ? 'Clear the upstairs?' : 'Clear every room?') : 'Done');
  done.onclick = () => { if (build.arm) { build.arm = false; clearFloor(); render(); } else exitBuild(); };
  const cl = el('button', 'link sub', build.arm ? 'Keep them' : lv ? 'Clear the upstairs' : 'Start from an empty lot'); cl.onclick = () => { build.arm = !build.arm; render(); };
  G(null, 'end w220', st, done, cl);
}



/* see-through furniture: while you are zoomed in, tall pieces standing between the camera and the spot it looks at fade to glass */
const _fT = new THREE.Vector3(), _fP = new THREE.Vector3(), _fS = new THREE.Vector3(), _fC = new THREE.Vector3();
function setFade(g, on) { shadowDirty = true; g.userData.faded = on; g.traverse(m => { if (!m.isMesh || m.userData.m0) return;
  if (on) { if (!m.userData.mo) { m.userData.mo = m.material; const mk = x => { const c = x.clone(); c.transparent = true; c.opacity = .16; c.depthWrite = false; return c; }; m.userData.mf = Array.isArray(m.material) ? m.material.map(mk) : mk(m.material); } m.material = m.userData.mf; }
  else if (m.userData.mo) { m.material = m.userData.mo; } }); }
function syncFade() {   // a tall piece fades when it is nearer than the spot you look at and its silhouette covers the middle of the view
  const live = cam.dist < 24 && !outside && !planView, D0 = camera.position.distanceTo(_fT.set(cam.tx, cam.ty, cam.tz));
  for (const it of state.items) { const g = OBJ[it.id]; if (!g) continue; const d = CAT[it.k]; let want = false;
    if (live && !d.out && d.mount == null && (it.f || 0) === lv && it !== sel && !(mode && mode.inst === it) && d.dim[2] > 1.25 && g.visible) {
      _fP.set(it.x + A.position.x, P.y + d.dim[2] * .5, it.z + A.position.z);
      if (camera.position.distanceTo(_fP) < D0 - .6) { let x0 = 9, y0 = 9, x1 = -9, y1 = -9;
        for (const [cx, cz] of corners(obb(it, it.x, it.z, it.r, 0))) for (const y of [0, d.dim[2]]) { _fC.set(cx + A.position.x, P.y + y, cz + A.position.z).project(camera); x0 = Math.min(x0, _fC.x); x1 = Math.max(x1, _fC.x); y0 = Math.min(y0, _fC.y); y1 = Math.max(y1, _fC.y); }
        const ox = Math.max(0, Math.min(x1, .42) - Math.max(x0, -.42)), oy = Math.max(0, Math.min(y1, .5) - Math.max(y0, -.5));
        want = ox * oy > .06 || ox * oy > (x1 - x0) * (y1 - y0) * .35; } }
    if (want !== !!g.userData.faded) setFade(g, want); }
}

/* my homes: several saved designs, each with a picture of how it looked */
const HOMES_KEY = 'roomtone.homes'; let homeId = null, homesArm = null;
const homes = () => { try { return JSON.parse(localStorage.getItem(HOMES_KEY) || '[]'); } catch (e) { return []; } };
const putHomes = list => localStorage.setItem(HOMES_KEY, JSON.stringify(list));
const homesEl = (() => { const d = document.createElement('div'); d.id = 'homes'; d.className = 'card'; d.style.display = 'none'; $('#ui').append(d); return d; })();
function homeThumb() {
  const keep = [outline.visible, hoverLine.visible, ring.visible]; outline.visible = hoverLine.visible = ring.visible = false; composer.render(); [outline.visible, hoverLine.visible, ring.visible] = keep;
  const c = document.createElement('canvas'); c.width = 320; c.height = 200; const g = c.getContext('2d'), sw = canvas.width, sh = canvas.height, k = Math.min(sw / 320, sh / 200) * .62;
  g.drawImage(canvas, (sw - 320 * k) / 2, (sh - 200 * k) / 2, 320 * k, 200 * k, 0, 0, 320, 200); return c.toDataURL('image/jpeg', .8);
}
const homeBase = () => state.lay ? (state.lay.rooms.length ? 'My layout' : 'Empty lot') : PLANS[state.plan].n;
function saveHome(asNew) {
  ensureStarted(); const list = homes(); let h = !asNew && homeId ? list.find(x => x.id === homeId) : null;
  if (!h) { const base = homeBase(); let n = base, k = 2; while (list.some(x => x.name === n)) n = `${base} ${k++}`; h = { id: Date.now().toString(36), name: n }; list.unshift(h); }
  Object.assign(h, { t: Date.now(), thumb: homeThumb(), data: snap(), value: Math.round(homeValue()), floors: LV.length });
  try { putHomes(list); homeId = h.id; toast(`Saved to My homes as “${h.name}”`); } catch (e) { toast('This browser is out of room for saved homes. Delete one first.'); }
  if (homesEl.style.display !== 'none') renderHomes();
}
function openHome(id) { const h = homes().find(x => x.id === id); if (!h) return; if (build) exitBuild(); if (outside) setOutside(false); if (state.started) pushHist(); preview = null; showPlan.keep = null; state.started = true; restore(h.data); homeId = id; closeHomes(); toast(`“${h.name}” opened`); }
function closeHomes() { homesEl.style.display = 'none'; homesArm = null; }
function showHomes() { cancelPlace(); const old = (() => { try { return localStorage.getItem('roomtone.slot'); } catch (e) { return null; } })();
  if (old && !homes().length) { try { putHomes([{ id: 'saved', name: 'Saved design', t: Date.now(), thumb: '', data: old, value: 0, floors: 1 }]); } catch (e) { } }
  homesEl.style.display = 'block'; renderHomes(); }
function renderHomes() {
  const list = homes(), when = t => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ', ' + new Date(t).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  homesEl.innerHTML = `<header><div><h2>My homes</h2><p>${list.length ? `${list.length} saved on this device` : 'Nothing saved yet'}</p></div><button class="x" aria-label="Close" data-tip="Close (Esc)">${svg('plus', 18)}</button></header>`;
  const acts = el('div', 'acts'), b1 = el('button', 'cta', homeId ? 'Save changes' : 'Save this home'); b1.onclick = () => saveHome(false); acts.append(b1);
  if (homeId) { const b2 = el('button', 'link', 'Save as a new home'); b2.onclick = () => saveHome(true); acts.append(b2); } homesEl.append(acts);
  const grid = el('div', 'hgrid');
  for (const h of list) { const c = el('div', 'home' + (h.id === homeId ? ' on' : ''), `${h.thumb ? `<img src="${h.thumb}" alt="">` : `<i class="noimg">${svg('house', 28)}</i>`}<input aria-label="Home name" value="${h.name.replace(/"/g, '&quot;')}"><em>${when(h.t)}${h.value ? ' · ' + money(h.value) : ''}${h.floors > 1 ? ' · 2 floors' : ''}</em><footer><button class="open">Open</button><button class="del${homesArm === h.id ? ' armed' : ''}">${homesArm === h.id ? 'Delete it?' : 'Delete'}</button></footer>`);
    c.querySelector('.open').onclick = () => openHome(h.id); c.querySelector('img') && (c.querySelector('img').onclick = () => openHome(h.id));
    c.querySelector('.del').onclick = () => { if (homesArm !== h.id) { homesArm = h.id; return renderHomes(); } putHomes(homes().filter(x => x.id !== h.id)); if (homeId === h.id) homeId = null; homesArm = null; renderHomes(); toast(`“${h.name}” deleted`); };
    c.querySelector('input').onchange = e => { const l = homes(), x = l.find(q => q.id === h.id); if (x) { x.name = e.target.value.trim() || x.name; putHomes(l); } };
    grid.append(c); }
  homesEl.append(grid); homesEl.querySelector('.x').onclick = closeHomes;
}

/* ───────────────────────── object card: a glass panel beside the selected piece ───────────────────────── */
const LAMPCOLS = ['#ff9f5a', '#ffb877', '#ffcf9a', '#ffe9cc', '#f2f4ff', '#ff6a5a', '#ff5fb1', '#9b6bff', '#5aa0ff', '#4fd1a1'];
let cardFor = null;
function roomName(it) { const d = CAT[it.k], L = levelOf(it); let r = null; if (d.mount != null) { const w = L.walls[it.wall]; r = w && L.rooms.find(q => q.id === w.rooms[it.side]); } else r = roomAt(it.x, it.z, L); return r ? r.def.n + (LV.length > 1 ? (L.L ? ' · upstairs' : ' · ground floor') : '') : 'Garden'; }
function buildCard(it) {
  cardFor = it; const d = CAT[it.k], st = it.lamp, roles = Object.keys(d.roles); const pct = st ? Math.round(st.br * 100) : 0;
  let h = `<header><i class="tile${st ? ' warm' : ''}">${svg(st ? (d.tv ? 'tv' : 'bulb') : d.mount != null ? 'decorate' : 'furnish', 18)}</i><div><b>${d.n}</b><span>${roomName(it)} · ${money(priceOf(it.k) * (it.len ? it.len / d.dim[0] : 1))}${st && st.on === 'auto' ? ' · follows daylight' : ''}</span></div>${st ? `<button class="tog${lampOn(it) ? ' on' : ''}" data-a="tog" aria-label="${d.tv ? 'Screen' : 'Light'} on or off" data-tip="${lampOn(it) ? 'Switch off' : 'Switch on'}"><i></i></button>` : ''}</header>`;
  if (st) { h += `<div class="bright" data-tip="Drag to dim"><div class="fill" style="width:${pct}%"></div><span>${svg('lighting', 15)}${pct}%</span></div>`; if (!d.tv) h += `<div class="dots">${LAMPCOLS.map(c => `<button class="dot${st.col === c ? ' on' : ''}" data-col="${c}" style="background:${c}" aria-label="Light colour"></button>`).join('')}</div>`; if (st.on !== 'auto' && !d.tv) h += `<button class="link" data-a="auto">Follow the daylight again</button>`; }
  if (roles.length) { const r = roles[0], cat = d.roles[r][1][0], ids = Object.keys(MATS).filter(i => MATS[i].c === cat).slice(0, 5); if (!ids.includes(it.v[r])) ids[4] = it.v[r];
    h += `<p class="cap">${d.roles[r][0]}<span>${MATS[it.v[r]].n}</span></p><div class="dots fin">${ids.map(i => `<button class="dot${it.v[r] === i ? ' on' : ''}" data-mat="${i}" style="background-image:${THUMB[i]}" data-tip="${MATS[i].n}" aria-label="${MATS[i].n}"></button>`).join('')}<button class="more" data-a="cust" data-tip="More finishes${roles.length > 1 ? ' and parts' : ''}" aria-label="More finishes">${svg('drop', 15)}</button></div>`; }
  const acts = d.stairs ? [['move', 'move', 'Move', 'Pick it up and set it down elsewhere'], ['rot', 'rotate', 'Rotate', 'Turn a quarter'], ['flip', 'flip', 'Flip', 'Climb the other way']] : [['move', 'move', 'Move', 'Pick it up and set it down elsewhere'], ...(d.mount == null ? [['rot', 'rotate', 'Rotate', 'Turn 45°. R turns 90°']] : []), ['dup', 'copy', 'Copy', 'Duplicate (⌘D)'], ...(d.rs ? [['s-', 'minus', 'Smaller', 'Make it smaller'], ['s+', 'plus', 'Larger', 'Make it larger']] : []), ...(d.len ? [['l-', 'minus', 'Shorter', 'One cabinet shorter'], ['l+', 'plus', 'Longer', 'One cabinet longer']] : []), ['del', 'trash', 'Delete', 'Remove it (Delete)']];
  h += `<footer>${acts.map(([a, ic, l, t]) => `<button class="chip${a === 'del' ? ' del' : ''}" data-a="${a}" data-tip="${t}" aria-label="${t}">${svg(ic, 16)}<span>${l}</span></button>`).join('')}</footer>`;
  card.innerHTML = h;
}
card.addEventListener('click', e => { const b = e.target.closest('button'); if (!b || !sel) return; const it = sel, a = b.dataset.a; tip.style.display = 'none';
  if (b.dataset.col) { pushHist(); it.lamp.col = b.dataset.col; if (it.lamp.on !== true) it.lamp.on = true; lampLevels(); buildCard(it); commit(); return; }
  if (b.dataset.mat) { const r = Object.keys(CAT[it.k].roles)[0]; if (it.v[r] === b.dataset.mat) return; pushHist(); setItemMat(it, r, b.dataset.mat); buildCard(it); commit(); return; }
  if (a === 'tog') { pushHist(); it.lamp.on = !lampOn(it); lampLevels(); buildCard(it); commit(); }
  else if (a === 'auto') { pushHist(); it.lamp.on = 'auto'; lampLevels(); buildCard(it); commit(); }
  else if (a === 'flip') { pushHist(); it.m = !it.m; placeObj(it); commit(); }
  else if (a === 'rot') { pushHist(); if (rotateItem(it, CAT[it.k].stairs ? Math.PI / 2 : Math.PI / 4)) { settleSmall(); commit(); } else { hist.pop(); histBtns(); } }
  else if (a === 'move') { startPlace(it, false, true); toast('Click where it should go. Esc puts it back.'); }
  else if (a === 'l-' || a === 'l+') { const old = it.len, nl = Math.round(clamp(old + (a === 'l+' ? .6 : -.6), .6, 4.8) * 10) / 10; if (nl !== old) { it.len = nl; if (blocked(it)) { it.len = old; toast('No room to make it longer here'); } else { pushHist(); const h = hist.pop(); it.len = old; hist.push(snap()); it.len = nl; histBtns(); const keepSel = sel === it; dropObj(it); buildObj(it); settleSmall(); repick(); if (keepSel) { sel = it; cardFor = null; } commit(); toast(`${CAT[it.k].n}, ${fm(nl)} m`); } } }
  else if (a === 's-' || a === 's+') { pushHist(); resizeItem(it, a === 's+' ? 1.1 : 1 / 1.1); commit(); }
  else if (a === 'cust') { selRole = Object.keys(CAT[it.k].roles)[0]; tab = 'style'; render(); }
  else if (a === 'dup') duplicate(it); else if (a === 'del') removeItem(it);
  if (a) intro.on('edited'); });
card.addEventListener('pointerdown', e => { const br = e.target.closest('.bright'); if (!br || !sel || !sel.lamp) return; e.preventDefault(); tip.style.display = 'none'; pushHist(); const it = sel; if (!lampOn(it) || it.lamp.on === 'auto') it.lamp.on = true;
  const set = ev => { const r = br.getBoundingClientRect(); it.lamp.br = Math.round(clamp((ev.clientX - r.left) / r.width, .05, 1) * 100) / 100; br.firstChild.style.width = it.lamp.br * 100 + '%'; br.lastChild.innerHTML = svg('lighting', 15) + Math.round(it.lamp.br * 100) + '%'; lampLevels(); };
  set(e); const up = () => { removeEventListener('pointermove', set); removeEventListener('pointerup', up); buildCard(it); commit(); }; addEventListener('pointermove', set); addEventListener('pointerup', up); });

rotH.innerHTML = svg('rotate', 15); rotH.dataset.tip = 'Drag to turn';
rotH.addEventListener('pointerdown', e => { if (!sel) return; e.preventDefault(); tip.style.display = 'none'; pushHist(); drag = { type: 'rotH', it: sel, r0: sel.r, x0: e.clientX, y0: e.clientY, moved: false, rs: riders(sel).map(q => ({ ...q, r0: q.it.r })) }; });

/* ───────────────────────── pointer and keys ───────────────────────── */
function pick(cx, cy) {
  aim(cx, cy); const hits = ray.intersectObjects(IPICK.concat(SPICK), false);
  for (const h of hits) { let vis = true; for (let p = h.object; p; p = p.parent) if (!p.visible) vis = false; if (!vis) continue; const o = h.object, it = o.userData.it; if (it) { if (mode && mode.inst === it) continue; const m = o.userData.m0 || o.material; return { point: h.point, item: it, role: m.userData && m.userData.role }; }
    const sid = o.userData.surf || (Array.isArray(o.material) && h.face && o.material[h.face.materialIndex].userData.surf) || (o.userData.wsurf && (o.userData.wsurf[0] || o.userData.wsurf[1])); if (sid) return { point: h.point, surf: sid }; return { point: h.point }; }
  return null;
}
const overCanvas = (x, y) => document.elementFromPoint(x, y) === canvas;
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => {
  try { canvas.setPointerCapture(e.pointerId); } catch (_) { }
  if (mode) { if (e.button === 2) { cancelPlace(); showTip(); return; } movePlace(e.clientX, e.clientY); commitPlace(e.shiftKey); if (!mode) showTip(); return; }
  if (build && !e.shiftKey && e.button !== 1) {
    if (e.button === 0 && build.yard && build.tool !== 'yerase') { aim(e.clientX, e.clientY); const q = floorPt(GY0); if (q) { drag = { type: 'yard', k: build.tool, a: { x: g5(q.x), z: g5(q.z) }, x0: e.clientX, y0: e.clientY, moved: false }; return; } }
    if (e.button === 0 && build.tool === 'room') { aim(e.clientX, e.clientY); const q = floorPt(0); if (q) { drag = { type: 'room', a: { x: g5(q.x), z: g5(q.z) }, x0: e.clientX, y0: e.clientY, moved: false }; return; } }
    if (e.button === 0 && build.tool === 'wall') { aim(e.clientX, e.clientY); const q = floorPt(0), h = q && wallNear(q); if (h) { drag = { type: 'wall', w: h.w, c2: h.w.c, x0: e.clientX, y0: e.clientY, moved: false }; return; } }
    if (e.button === 0 && build.tool === 'mroom') { aim(e.clientX, e.clientY); const q = floorPt(0), r = q && roomAt(q.x, q.z); if (r) { drag = { type: 'mroom', r, a: q, dx: 0, dz: 0, why: roomMoveWhy(r, 0, 0), x0: e.clientX, y0: e.clientY, moved: false }; return; } }
    drag = { type: 'orbit', build: e.button === 0, x0: e.clientX, y0: e.clientY, az: camG.az, el: camG.el, moved: false }; return; }
  if (outside && !e.shiftKey && e.button !== 1 && e.button !== 2) { drag = { type: 'orbit', x0: e.clientX, y0: e.clientY, az: camG.az, el: camG.el, moved: false }; return; }
  if (e.button === 2 || e.button === 1 || e.shiftKey) { drag = { type: 'pan', x0: e.clientX, y0: e.clientY, tx: camG.tx, tz: camG.tz, moved: false }; return; }
  const h = state.started && !preview ? pick(e.clientX, e.clientY) : null;
  if (h && h.item) { const it = h.item, d = CAT[it.k]; select(it, true); selRole = h.role || selRole; aim(e.clientX, e.clientY); const q = floorPt(baseY(it)); drag = { type: 'item', it, ox: q ? it.x - q.x : 0, oz: q ? it.z - q.z : 0, x0: e.clientX, y0: e.clientY, moved: false, rs: riders(it), mount: d.mount != null }; if (tab === 'style') render(); }
  else drag = { type: 'orbit', surf: h && h.surf, x0: e.clientX, y0: e.clientY, az: camG.az, el: camG.el, moved: false };
});
addEventListener('pointermove', e => {
  const cx = e.clientX, cy = e.clientY;
  if (mode) { if (mode.dragging && Math.hypot(cx - mode.x0, cy - mode.y0) > 6) mode.moved = true; if (overCanvas(cx, cy)) { movePlace(cx, cy); showTip(cx, cy, mode.bad ? (CAT[mode.inst.k].mount != null ? 'Needs a standing wall' : 'No room here') : snapInfo ? 'Snapped to the wall. Click to place' : 'Click to place'); } else { if (!mode.existing) { mode.inst.hide = true; placeObj(mode.inst); mode.bad = true; } showTip(); } return; }
  if (!drag && build) { if (e.target === canvas) buildHover(cx, cy); else { hideBuildFx(); } return; }
  if (!drag && outside) { showTip(); return; }
  if (!drag) { if (e.target !== canvas) { hov = null; return; } if (!state.started || preview) { showTip(); return; } const h = pick(cx, cy); hov = h && h.item || null; if (hov) { showTip(cx, cy, CAT[hov.k].n, hov === sel ? 'Drag to move' : 'Click to select'); canvas.style.cursor = 'grab'; } else if (h && h.surf) { showTip(cx, cy, SURF[h.surf].n, MATS[state.surf[h.surf]].n + (SURF[h.surf].kind === 'floor' && !focus ? ' · double-click to focus' : '')); canvas.style.cursor = 'pointer'; } else { showTip(); canvas.style.cursor = 'default'; } return; }
  if (Math.hypot(cx - drag.x0, cy - drag.y0) > 6) drag.moved = true; if (!drag.moved) return; hov = null;
  if (drag.type === 'sw') { ghost.style.display = 'block'; ghost.style.left = cx + 'px'; ghost.style.top = cy + 'px'; const h = overCanvas(cx, cy) ? pick(cx, cy) : null; drag.hit = h; const nm = lc(MATS[drag.id].n); if (h && h.item) showTip(cx, cy, CAT[h.item.k].n, `Release to apply ${nm}`); else if (h && h.surf) showTip(cx, cy, SURF[h.surf].n, `Release to apply ${nm}`); else showTip(); }
  else if (drag.type === 'item') { const it = drag.it; if (!drag.started) { drag.started = true; pushHist(); } canvas.style.cursor = 'grabbing'; aim(cx, cy); snapInfo = null;
    if (drag.mount) { const h = wallHit(it); if (h) { Object.assign(it, h); placeObj(it); } showTip(); }
    else { const q = floorPt(baseY(it)); if (q) { drag.bad = !tryMove(it, q.x + drag.ox, q.z + drag.oz); placeObj(it); carry(it, drag.rs); } showTip(cx, cy, drag.bad ? 'Something is in the way' : snapInfo ? 'Snapped to the wall' : null); } }
  else if (drag.type === 'wall') { aim(cx, cy); const q = floorPt(0); if (q) { const w = drag.w, c2 = g5(w.hz ? q.z : q.x); if (c2 !== drag.c2 || !drag.N) { drag.c2 = c2; drag.N = c2 === w.c ? null : wallMoved(curLay(), w, c2); drag.why = drag.N ? layoutWhy(drag.N) : null; }
      hideBuildFx(); showWall(w, c2, !!drag.why); showTip(cx, cy, drag.why || (c2 === w.c ? 'Drag across to move it' : `Moved ${fm(Math.abs(c2 - w.c))} m`), drag.why || !drag.N ? null : sizesOf(drag.N, w.rooms)); } }
  else if (drag.type === 'mroom') { aim(cx, cy); const q = floorPt(0); if (q) { const dx = g5(q.x - drag.a.x), dz = g5(q.z - drag.a.z); if (dx !== drag.dx || dz !== drag.dz || !drag.N) { drag.dx = dx; drag.dz = dz; drag.N = dx || dz ? roomMoved(curLay(), drag.r.id, dx, dz) : null; drag.why = roomMoveWhy(drag.r, dx, dz) || (drag.N ? layoutWhy(drag.N) : null); }
      hideBuildFx(); showRects(drag.r.def.r.map(p => [p[0] + dx, p[1] + dz, p[2] + dx, p[3] + dz]), !drag.why, `${drag.r.id}:${dx}:${dz}:${!drag.why}`); showTip(cx, cy, drag.why || drag.r.def.n, drag.why ? null : dx || dz ? `Moved ${fm(Math.hypot(dx, dz))} m · release to set it down` : 'Drag to move it'); } }
  else if (drag.type === 'yard') { aim(cx, cy); const q = floorPt(GY0); if (q) { const b = { x: g5(q.x), z: g5(q.z) }, k = drag.k, r = isLine(k) ? yardLine(drag.a, b) : [Math.min(drag.a.x, b.x), Math.min(drag.a.z, b.z), Math.max(drag.a.x, b.x), Math.max(drag.a.z, b.z)], why = yardWhy(k, r); drag.r = r; drag.why = why; hideBuildFx();
      if (isLine(k)) showLine(r, !!why); else { showRect(r, why ? 'bad' : 'ok'); bPrev.position.y = bEdge.position.y = GY0 + .05; }
      const len = Math.hypot(r[2] - r[0], r[3] - r[1]), area = (r[2] - r[0]) * (r[3] - r[1]); showTip(cx, cy, why || (isLine(k) ? `${YL[k]}, ${fm(len)} m` : `${YS[k]}, ${fm(r[2] - r[0])} × ${fm(r[3] - r[1])} m`), why ? null : `${money(isLine(k) ? len * YPRICE[k] : area * YPRICE[k])} · release to build`); } }
  else if (drag.type === 'room') { aim(cx, cy); const q = floorPt(0); if (q) { const b = { x: g5(q.x), z: g5(q.z) }, r = [Math.min(drag.a.x, b.x), Math.min(drag.a.z, b.z), Math.max(drag.a.x, b.x), Math.max(drag.a.z, b.z)], why = roomWhy(r); drag.r = r; drag.why = why; hideBuildFx(); showRect(r, why ? 'bad' : 'ok');
      showTip(cx, cy, why || `${lv && build.rt === 'hall' ? 'Landing' : RT[build.rt]}, ${fm(r[2] - r[0])} × ${fm(r[3] - r[1])} m`, why ? null : `${fm((r[2] - r[0]) * (r[3] - r[1]))} m² · about ${money((r[2] - r[0]) * (r[3] - r[1]) * (RATE[build.rt] || 1000))} · release to build`); } }
  else if (drag.type === 'orbit') { camG.az = drag.az - (cx - drag.x0) * .005; camG.el = clamp(drag.el + (cy - drag.y0) * .004, .22, 1.5); if (planView) { planView = false; const b = $('#bPlan'); b.classList.remove('on'); b.innerHTML = svg('plan'); b.dataset.tip = 'Floor-plan view'; } }
  else if (drag.type === 'pan') { const k = cam.dist * .0011, dx = (cx - drag.x0) * k, dy = (cy - drag.y0) * k, c = Math.cos(cam.az), s = Math.sin(cam.az); camG.tx = clamp(drag.tx - dx * c - dy * s, -panLim(), panLim()); camG.tz = clamp(drag.tz + dx * s - dy * c, -panLim(), panLim()); }
  else if (drag.type === 'rotH') { const it = drag.it; aim(cx, cy); const q = floorPt(baseY(it)); if (!q) return; let r = Math.atan2(q.x - it.x, q.z - it.z); const qt = CAT[it.k].stairs, step = qt ? Math.PI / 2 : grid ? Math.PI / 12 : Math.PI / 4, near = Math.round(r / step) * step; if (qt || grid || Math.abs(r - near) < .09) r = near;
    const ok = !blocked(it, it.x, it.z, r); if (ok) { it.r = r; placeObj(it); const dr = r - drag.r0, c = Math.cos(dr), s = Math.sin(dr); for (const q2 of drag.rs) { q2.it.x = it.x + q2.dx * c + q2.dz * s; q2.it.z = it.z - q2.dx * s + q2.dz * c; q2.it.r = q2.r0 + dr; placeObj(q2.it); } }
    showTip(cx, cy, ok ? `${((Math.round(it.r * 180 / Math.PI) % 360) + 360) % 360}°` : 'No room to turn further'); }
});
addEventListener('pointerup', e => {
  if (mode && mode.dragging) { mode.dragging = false; if (mode.moved && overCanvas(e.clientX, e.clientY)) { movePlace(e.clientX, e.clientY); commitPlace(); } return; }
  if (!drag) return; const d = drag; drag = null; ghost.style.display = 'none'; showTip(); canvas.style.cursor = 'default'; snapInfo = null;
  if (d.type === 'sw') { let ok = false; if (d.moved) { const h = d.hit; if (h && h.item) ok = applyFinish(d.id, { item: h.item, role: h.role }); else if (h && h.surf) { ok = applyFinish(d.id, { surf: h.surf }, h.point); if (ok) { selSurf = h.surf; sel = null; } } } else { if (sel && selRole) ok = applyFinish(d.id, { item: sel, role: selRole }); else if (selSurf === 'frames') ok = applyFinish(d.id, { frames: 1 }); else if (selSurf) ok = applyFinish(d.id, { surf: selSurf }); else toast('Click a floor, a wall or a piece first. Or drag this finish onto one.'); } if (ok) commit(); }
  else if (d.type === 'item') { if (d.moved) { settleSmall(); commit(); intro.on('edited'); } }
  else if (d.type === 'rotH') { if (d.moved) { settleSmall(); commit(); intro.on('edited'); } else { hist.pop(); histBtns(); } }
  else if (d.type === 'wall') { if (d.moved && d.N && !d.why) moveWall(d.w, d.c2, d.N); else if (d.moved && d.why) toast(d.why); if (build) buildHover(e.clientX, e.clientY); }
  else if (d.type === 'mroom') { if (d.moved && d.N && !d.why) moveRoom(d.r, d.dx, d.dz, d.N); else if (d.moved && d.why) toast(d.why); if (build) buildHover(e.clientX, e.clientY); }
  else if (d.type === 'yard') { if (d.moved && d.r && !d.why) addYard(d.k, d.r); else if (d.moved && d.why) toast(d.why); else if (!d.moved) toast('Drag to draw it'); if (build) buildHover(e.clientX, e.clientY); }
  else if (d.type === 'room') { if (d.moved && d.r && !d.why) addRoom(d.r, build.rt); else if (d.moved && d.why) toast(d.why); else if (!d.moved) buildClick(e.clientX, e.clientY); if (build) buildHover(e.clientX, e.clientY); }
  else if (d.type === 'orbit' && !d.moved && build) { if (d.build) buildClick(e.clientX, e.clientY); }
  else if (d.type === 'orbit' && !d.moved && outside) { }
  else if (d.type === 'orbit' && !d.moved) { select(null, true); selSurf = state.started && !preview ? d.surf || null : null; render(); }
});
canvas.addEventListener('dblclick', e => { if (!state.started || preview || mode || build) return; const h = pick(e.clientX, e.clientY); if (h && h.surf && SURF[h.surf].kind === 'floor' && SURF[h.surf].room !== focus) setFocus(SURF[h.surf].room); else if (focus && !(h && h.item) && !(h && h.surf)) setFocus(null); });
// zoom keeps the spot under the pointer in place, so you can dive into a corner of a room; a trackpad pinch arrives as ctrl+wheel
const zcam = new THREE.PerspectiveCamera();
const panLim = () => Math.max(14, CAM0.dist * .55);
function zoomAt(cx, cy, f) {
  const d0 = camG.dist, d1 = clamp(d0 * f, 3.5, 70); if (Math.abs(d1 - d0) < 1e-4) return;
  const ce = Math.cos(camG.el); zcam.copy(camera); zcam.position.set(camG.tx + camG.dist * ce * Math.sin(camG.az), camG.ty + camG.dist * Math.sin(camG.el), camG.tz + camG.dist * ce * Math.cos(camG.az)); zcam.lookAt(camG.tx, camG.ty, camG.tz); zcam.updateMatrixWorld();
  ndc.set(cx / VW * 2 - 1, -(cy / VH) * 2 + 1); ray.setFromCamera(ndc, zcam); const q = floorPt(0); if (q) { const k = 1 - d1 / d0, wx = q.x + A.position.x, wz = q.z + A.position.z, L = panLim(); camG.tx = clamp(camG.tx + (wx - camG.tx) * k, -L, L); camG.tz = clamp(camG.tz + (wz - camG.tz) * k, -L, L); camG.ty = clamp(camG.ty + (P.y - camG.ty) * k, P.y, P.y + 1.5); }
  camG.dist = d1; if (planView && d1 !== d0) { } }
canvas.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(clamp(e.deltaY, -60, 60) * (e.ctrlKey ? .012 : .0018))); }, { passive: false });
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return; const k = e.key.toLowerCase(), cmd = e.metaKey || e.ctrlKey;
  if (k === 'escape' && homesEl.style.display !== 'none') closeHomes();
  else if (k === 'escape' && build) { if (drag && (drag.type === 'room' || drag.type === 'wall' || drag.type === 'mroom' || drag.type === 'yard')) { drag = null; hideBuildFx(); showTip(); } else exitBuild(); }
  else if ((k === '=' || k === '+' || k === '-' || k === '_') && !cmd) zoomAt(VW / 2, VH / 2, k === '-' || k === '_' ? 1.3 : 1 / 1.3);
  else if ((k === 'pageup' || k === 'pagedown') && LV.length > 1 && !mode) { e.preventDefault(); setLevel(k === 'pageup' ? 1 : 0); }
  else if (k === 'escape') { if (mode) { cancelPlace(); markCatalog(); } else if (sel || selSurf) { select(null, true); selSurf = null; render(); } else if (focus) setFocus(null); }
  else if (cmd && k === 'z') { e.preventDefault(); e.shiftKey ? redoIt() : undo(); } else if (cmd && k === 'y') { e.preventDefault(); redoIt(); }
  else if (cmd && k === 'd' && sel && !mode) { e.preventDefault(); duplicate(sel); }
  else if ((k === 'delete' || k === 'backspace') && sel && !mode) { e.preventDefault(); removeItem(sel); }
  else if ((k === 'r' || k === 'q' || k === 'e') && (sel || mode) && !cmd) { const it = mode ? mode.inst : sel, dr = k === 'r' ? Math.PI / 2 : k === 'q' ? Math.PI / 12 : -Math.PI / 12; if (CAT[it.k].mount != null || (CAT[it.k].stairs && k !== 'r')) return; if (mode) { it.r += dr; mode.bad = blocked(it); placeObj(it); ghost3(it, true, mode.bad); } else { pushHist(); if (rotateItem(it, dr)) commit(); else { hist.pop(); histBtns(); } } }
  else if (k === 'g' && !cmd) $('#bGrid').click();
});

/* ───────────────────────── first visit: four light coach marks ───────────────────────── */
const coach = $('#coach'), spot = $('#spot');
const intro = {
  i: -1, steps: [
    { t: 'Choose your home', b: 'Pick a floor plan to see it in 3D, or an empty lot to draw your own. When one feels right, press Start.', at: () => $('#pane'), side: 'left', done: 'started' },
    { t: 'Pick a piece of furniture', b: 'Open Furnish and choose anything you like. A sofa is a good start.', at: () => tab === 'furnish' ? $('#pane') : nav.querySelector('[data-k=furnish]'), side: 'left', done: 'picked' },
    { t: 'Place it', b: 'Move into the apartment and click to set it down. It turns red where it will not fit.', at: () => null, corner: 1, done: 'placed' },
    { t: 'Make it yours', b: 'Drag a piece to move it and pull the round handle to turn it. The card beside it changes its finish, copies it or removes it.', at: () => card.classList.contains('show') ? card : null, corner: 1, done: 'edited', go: 1 }],
  start(force) { if (!force) { try { if (localStorage.getItem('roomtone.intro')) return; } catch (e) { } } this.i = state.started && !preview ? 1 : 0; if (this.i === 0) { cancelPlace(); tab = 'layout'; render(); } this.sync(); },
  end() { this.i = -1; coach.style.display = spot.style.display = 'none'; try { localStorage.setItem('roomtone.intro', '1'); } catch (e) { } },
  on(ev) { if (this.i < 0) return; if (this.steps[this.i].done === ev) { this.i++; if (this.i >= this.steps.length) return this.end(); this.sync(); } else if (ev === 'picked' && this.i < 2) { this.i = 2; this.sync(); } else if (ev === 'placed' && this.i < 3) { this.i = 3; this.sync(); } },
  sync() { if (this.i < 0) return; const s = this.steps[this.i]; coach.style.display = 'block'; coach.querySelector('small').textContent = `${this.i + 1} of ${this.steps.length}`; coach.querySelector('h3').textContent = s.t; coach.querySelector('p').textContent = s.b; coach.querySelector('.go').style.display = s.go ? '' : 'none'; this.place(); },
  place() { if (this.i < 0) return; const s = this.steps[this.i], t = s.at(), cw = 272, ch = coach.offsetHeight; let x, y;
    if (t) { const r = t.getBoundingClientRect(), L = r.left / UIS, T = r.top / UIS, Wd = r.width / UIS, Ht = r.height / UIS; spot.style.display = 'block'; Object.assign(spot.style, { left: L - 4 + 'px', top: T + 4 + 'px', width: Wd + 8 + 'px', height: Math.min(Ht, uiH() - T - 12) - 2 + 'px' }); if (s.side === 'left') { x = L - cw - 22; y = clamp(T + 8, 16, uiH() - ch - 16); } else { x = clamp(L + Wd / 2 - cw / 2, 16, uiW() - 16 - cw); y = Math.min(T, $('#dock').getBoundingClientRect().top / UIS) - ch - 14; if (y < 16) y = T + Ht + 18; } }
    else { spot.style.display = 'none'; x = (uiW() - 404) / 2 - cw / 2; y = 76; }
    if (s.corner) { x = 16; y = uiH() - ch - 76; }
    coach.style.left = x + 'px'; coach.style.top = y + 'px'; },
};
coach.querySelector('.skip').onclick = () => intro.end(); coach.querySelector('.go').onclick = () => intro.end();

/* ───────────────────────── loop ───────────────────────── */
let last = performance.now(), ctxShown = '';
function cameraMoving() { return Object.keys(cam).some(key => Math.abs(camG[key] - cam[key]) > 1e-4); }
function renderScene() {
  if (shadowDirty) { renderer.shadowMap.needsUpdate = true; shadowUpdates++; shadowDirty = false; }
  renderer.info.autoReset = false; renderer.info.reset();
  composer.render();
  renderedFrames++;
  Object.assign(canvas.dataset, { frames: String(renderedFrames), drawCalls: String(renderer.info.render.calls), triangles: String(renderer.info.render.triangles), shadowUpdates: String(shadowUpdates), geometries: String(renderer.info.memory.geometries), dpr: String(renderer.getPixelRatio()), batchedMeshes: String(batchedMeshes), geometryCacheHits: String(geometryCache.hits) });
}
function frame(now = performance.now()) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  natTime.value = now / 1000;
  if (!uiDirty && !cameraMoving() && !tAnim && !wipes.length && state.started && !preview) { renderScene(); return; }
  uiDirty = false;
  if (tAnim) { const k = clamp((now - tAnim.t0) / tAnim.dur, 0, 1), e = k * k * (3 - 2 * k); state.t = lerp(tAnim.a, tAnim.b, e); if (k >= 1) { state.t = tAnim.b; tAnim = null; commit(); } applyTime(state.t); refreshClock(); }
  for (let i = wipes.length - 1; i >= 0; i--) { const U = wipes[i]; U.uWR.value += dt * 16; if (U.uWR.value > 26) { U.uWR.value = 1e3; wipes.splice(i, 1); } }
  if ((preview || !state.started) && !drag) camG.az += dt * .06;
  const k = 1 - Math.exp(-dt * 7); for (const p in cam) { const d = camG[p] - cam[p]; if (Math.abs(d) > 1e-4) cam[p] += d * k; }
  BFX.visible = !!build; if (build) BFX.position.set(A.position.x, P.y, A.position.z);
  placeCamera(); if (updateWalls()) { shadowDirty = true; refreshMounts(); } syncGrid();
  const c = ctxText(); if (c !== ctxShown) { ctxShown = c; $('#ctx').textContent = c; }
  const it = mode ? mode.inst : sel, g = it && OBJ[it.id], floorIt = g && g.visible && CAT[it.k].mount == null, bad = (mode && mode.bad) || (drag && drag.bad);
  outline.visible = !!floorIt; if (floorIt) { frameOf(outline, it); outline.material.color.set(bad ? '#d23a2a' : mode ? '#4f7a5a' : '#b4553a'); }
  hoverLine.visible = !!(hov && hov !== sel && !mode && CAT[hov.k].mount == null && OBJ[hov.id]); if (hoverLine.visible) frameOf(hoverLine, hov, .06);
  const act = (mode || (drag && drag.type === 'item' && drag.moved)) && snapInfo && floorIt; snapBar.visible = !!act;
  if (act) { const w = snapInfo.w, d = CAT[it.k].dim, f = w.c + snapInfo.n * (w.t / 2 + .03); snapBar.scale.x = d[0] * it.s + .3; snapBar.position.set((w.hz ? it.x : f) + A.position.x, .04 + P.y, (w.hz ? f : it.z) + A.position.z); snapBar.rotation.y = w.hz ? 0 : Math.PI / 2; }
  const steady = sel && g && g.visible && !mode && !(drag && drag.type === 'item' && drag.moved), turning = drag && drag.type === 'rotH';
  if (steady && !turning) { if (cardFor !== sel) buildCard(sel); const d = CAT[sel.k], mount = d.mount != null, pxu = VH / (2 * Math.tan(camera.fov * Math.PI / 360) * cam.dist) / UIS;
    v3.set(0, mount ? d.dim[1] * sel.s / 2 : d.dim[2] / 2, 0); g.localToWorld(v3); v3.project(camera); const sx = (v3.x * .5 + .5) * uiW(), sy = (-v3.y * .5 + .5) * uiH(), rpx = (mount ? d.dim[0] * sel.s / 2 : reach(sel)) * pxu * .8;
    card.classList.add('show'); const cw = 272, ch = card.offsetHeight || 240, L0 = 16, R0 = uiW() - 420; let x = sx + rpx + 24; if (x + cw > R0) x = sx - rpx - 24 - cw; x = clamp(x, L0, R0 - cw);
    card.style.left = x + 'px'; card.style.top = clamp(sy - ch * .45, 16, uiH() - ch - 76) + 'px';
  } else { card.classList.remove('show'); cardFor = null; }
  syncBadges(); syncLabels(); syncFade();
  const showRing = steady && CAT[sel.k].mount == null; ring.visible = !!showRing; rotH.classList.toggle('show', !!showRing);
  if (showRing) { const R0 = reach(sel); ring.position.set(sel.x + A.position.x, baseY(sel) + .03 + P.y, sel.z + A.position.z); ring.scale.setScalar(R0); v3.set(sel.x + Math.sin(sel.r) * R0, baseY(sel) + .03 + P.y, sel.z + Math.cos(sel.r) * R0).add(A.position).project(camera); rotH.style.left = (v3.x * .5 + .5) * uiW() + 'px'; rotH.style.top = (-v3.y * .5 + .5) * uiH() + 'px'; }
  if (intro.i >= 0) intro.place();
  animatedScene = visibleAnimation(scene);
  renderScene();
}
let firstFrame = true;
function loop(now) {
  loopId = 0;
  if (document.hidden || stopped) return;
  frame(now);
  if (firstFrame) {
    firstFrame = false;
    // Reveal only after a complete 3D frame has reached the screen.
    requestAnimationFrame(() => {
      const minimum = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1500;
      setTimeout(() => {
        const loading = $('#loading');
        $('#ui').removeAttribute('inert');
        document.body.setAttribute('aria-busy', 'false');
        loading.classList.add('leaving');
        setTimeout(() => loading.remove(), 500);
      }, Math.max(0, minimum - (performance.now() - window.roomtoneLoadStarted)));
    });
  }
  if (animatedScene || preview || !state.started || tAnim || wipes.length || cameraMoving() || uiDirty) loopId = requestAnimationFrame(loop);
}

/* ───────────────────────── boot ───────────────────────── */
resize(); const QS = new URLSearchParams(location.search); let saved = null; try { saved = localStorage.getItem('roomtone.auto'); } catch (e) { }
if (saved && !QS.has('fresh')) { try { const s = JSON.parse(saved); take(s); state.t = s.t; state.started = true; rebuildAll(); tab = 'furnish'; } catch (e) { console.warn('autosave unreadable', e); saved = null; state.started = false; state.lay = state.up = null; } }
if (!state.started) planDefaults('onebed');
Object.assign(cam, CAM0); Object.assign(camG, CAM0); placeCamera(); applyTime(state.t); makeThumbs(); histBtns(); refreshLeft(); render(); invalidate();
loadCar().then(r => { if (stopped) { disposeTree(r); return; } CARMODEL = prepCar(r); for (const it of state.items) if (it.k === 'car' && OBJ[it.id]) { dropObj(it); buildObj(it); if (sel === it) cardFor = null; } repick(); makeThumbs('car'); if (tab === 'furnish') render(); canvas.dataset.carReady = 'true'; invalidate(); })
  .catch(e => { if (!stopped) { canvas.dataset.carReady = 'failed'; console.warn('Car model unavailable, keeping the simple car:', e && e.message); } });
if (!QS.has('nointro') && !state.started) intro.start(QS.has('fresh'));
window.__api = { state, cam, camG, CAT, PLANS, OBJ, intro, ao, setFocus, lampLevels, focus: () => focus, P: () => P, LV: () => LV, lv: () => lv, A, saveHome, openHome, showHomes, homes, lotOf, yardWhy, addYard, yardAt, groundY, zoomAt, moveWall, moveRoom, wallMoved, roomMoved, layoutWhy, roomMoveWhy, curLay, setOutside, outside: () => outside, homeValue, setLevel, addFloor, removeFloor, enterBuild, exitBuild, build: () => build, addRoom, addOp, opPlan, eraseRoom, retype, undo, frame, blocked, usePlan, showPlan, setTab, select, startPlace, movePlace, commitPlace, applyFinish,
  add(k, x, z, r = 0) { const it = newInst(k, { x, z, r }); if (blocked(it)) return false; state.items.push(it); buildObj(it); settleSmall(); repick(); refreshLamps(); commit(); return it.id; },
  time(t) { tAnim = null; state.t = t; applyTime(t); refreshLeft(); }, walls(m) { wallMode = m; }, view(o) { Object.assign(camG, o); Object.assign(cam, camG); },
  setTool(t, rt) { if (build) { build.tool = t; if (rt) build.rt = t === 'room' ? rt : build.rt; render(); } },
  proj(x, y, z) { v3.set(x, y, z).add(A.position).project(camera); return [(v3.x * .5 + .5) * VW, (-v3.y * .5 + .5) * VH]; },
  screen(id) { const it = state.items.find(i => i.id === id), g = OBJ[id]; v3.set(0, CAT[it.k].dim[2] * .4, 0); g.localToWorld(v3); v3.project(camera); return [(v3.x * .5 + .5) * VW, (-v3.y * .5 + .5) * VH]; } };
document.body.dataset.ready = 'true';

CAT.car.price = 42000;
for (const name of ['setFocus', 'lampLevels', 'saveHome', 'openHome', 'showHomes', 'addYard', 'moveWall', 'moveRoom', 'wallMoved', 'roomMoved', 'setOutside', 'setLevel', 'addFloor', 'removeFloor', 'enterBuild', 'exitBuild', 'addRoom', 'addOp', 'eraseRoom', 'retype', 'undo', 'usePlan', 'showPlan', 'setTab', 'select', 'startPlace', 'movePlace', 'commitPlace', 'applyFinish', 'add', 'time', 'walls', 'view', 'setTool']) {
  const action = window.__api[name];
  window.__api[name] = (...args) => { const result = action(...args); invalidate(); return result; };
}
window.__api.performance = () => ({ frames: renderedFrames, shadowUpdates, drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, cacheSize: geometryCache.size, cacheHits: geometryCache.hits, batchedMeshes, animated: animatedScene, three: THREE.REVISION, preserveDrawingBuffer: renderer.getContext().getContextAttributes().preserveDrawingBuffer });
for (const type of ['pointerdown', 'pointermove', 'pointerup', 'wheel', 'keydown', 'click', 'input', 'change', 'resize']) addEventListener(type, invalidate, { capture: true, passive: true });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (loopId) { window.cancelAnimationFrame(loopId); rafs.delete(loopId); loopId = 0; } }
  else { last = performance.now(); invalidate(); }
}, { signal });
canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); stop(); const loading = $('#loading'); if (loading) loading.remove(); const message = document.createElement('div'); message.setAttribute('role', 'alert'); message.style.cssText = 'position:fixed;inset:0;z-index:10001;display:grid;place-content:center;background:#e9e4db;padding:32px'; message.textContent = 'The WebGL context was lost. Reload to restore Roomtone. Your saved homes are unchanged.'; document.body.append(message); }, { signal });
disposables.add({ dispose() {
  const materials = new Set(), textures = new Set(Object.values(TEX)), geometries = new Set();
  for (const root of [scene, CARMODEL]) root?.traverse(mesh => { if (mesh.geometry && !mesh.geometry.userData.roomtoneShared) geometries.add(mesh.geometry); for (const material of Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []) { materials.add(material); for (const value of Object.values(material)) if (value?.isTexture) textures.add(value); } });
  for (const resource of [...geometries, ...materials, ...textures]) resource.dispose();
} });
return stop;
}

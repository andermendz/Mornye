// Mereframe Components · m.js — built by tools/build.mjs from m/src; edit the sources there, not this file.
// The behaviours of the library, as one ES module with no dependencies: <script type="module" src="m/m.js"></script>.
// Custom elements upgrade by themselves; plain elements are enhanced by their attributes and classes, on load and whenever
// they are added to the page later. Everything works by keyboard; every motion has a calm version (prefers-reduced-motion).
// window.m (and this module's exports) is the API for scripts of your own.

// ── m/src/core.js
const doc = document, root = doc.documentElement;
root.classList.add('m-js');
const RM = matchMedia('(prefers-reduced-motion: reduce)');
const $$ = (sel, el = doc) => [...el.querySelectorAll(sel)];
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
let uidN = 0;
const uid = p => `${p}-${(++uidN).toString(36)}`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const ensureId = (el, p) => el.id || (el.id = uid(p));
function h(tag, attrs = {}, html) {
  const el = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) el.setAttribute(k, v === true ? '' : v);
  if (html != null) el.innerHTML = html;
  return el;
}
const ms = name => `<span class="ms" aria-hidden="true">${name}</span>`;
const emit = (el, type, detail) => el.dispatchEvent(new CustomEvent(type, { bubbles: true, detail }));
const fire = el => { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
const smooth = () => (RM.matches ? 'auto' : 'smooth');

/* ── popups: menus, listboxes and tooltips live in the top layer (no panel can clip them) and are placed by their
      button: below if there is room, else above; never past the window's edge; they open from the button (--ox, --oy) */
function place(pop, anchor, { side = 'bottom', align = 'start', gap = 8, match = false } = {}) {
  const r = anchor.getBoundingClientRect(), vw = innerWidth, vh = innerHeight, m = 12;
  pop.style.maxHeight = '';
  if (match) pop.style.minWidth = Math.round(r.width) + 'px';
  const pw = pop.offsetWidth, ph = pop.offsetHeight;
  const below0 = vh - r.bottom - gap - m, above0 = r.top - gap - m;
  let below = side !== 'top';
  if (below && ph > below0 && above0 > below0) below = false;
  if (!below && ph > above0 && below0 > above0) below = true;
  let left = align === 'end' ? r.right - pw : align === 'center' ? r.left + r.width / 2 - pw / 2 : r.left;
  left = clamp(left, m, Math.max(m, vw - pw - m));
  const room = Math.max(140, below ? below0 : above0);
  const top = below ? r.bottom + gap : Math.max(m, r.top - gap - Math.min(ph, room));
  Object.assign(pop.style, { left: Math.round(left) + 'px', top: Math.round(top) + 'px', maxHeight: room + 'px' });
  pop.style.setProperty('--ox', Math.round(r.left + r.width / 2 - left) + 'px');
  pop.style.setProperty('--oy', below ? '0px' : '100%');
}
const showPop = el => { el.popover !== undefined && el.hasAttribute('popover') ? (el.matches(':popover-open') || el.showPopover()) : el.classList.add('open'); el.hidden = false; };
const hidePop = el => { if (el.hasAttribute('popover')) { if (el.matches(':popover-open')) el.hidePopover(); } else el.classList.remove('open'); el.hidden = true; };

// one open popup at a time; a press outside, Esc, Tab or a resize closes it
let openPopup = null;
function opened(api) { if (openPopup && openPopup !== api) openPopup.close(false); openPopup = api; }
doc.addEventListener('pointerdown', e => { if (openPopup && !openPopup.contains(e.target)) openPopup.close(false); }, true);
addEventListener('resize', () => openPopup?.close(false));
addEventListener('scroll', e => { if (openPopup && !openPopup.contains(e.target)) openPopup.reposition?.(); }, { capture: true, passive: true });

// type-ahead: letters typed within 600 ms find the next option that starts with them
function typeahead() {
  let buf = '', t = 0;
  return (key, labels, from) => {
    if (key.length !== 1 || key === ' ' && !buf) return -1;
    clearTimeout(t); t = setTimeout(() => (buf = ''), 600);
    buf += key.toLowerCase();
    const n = labels.length;
    for (let k = 1; k <= n; k++) { const i = (from + (buf.length > 1 ? k - 1 : k)) % n; if (labels[i].toLowerCase().startsWith(buf)) return i; }
    return -1;
  };
}
function released(api) { if (openPopup === api) openPopup = null; }

// (each enhancer keeps its own record, so one element can take several: a nav with data-pill and data-spy)
const once = fn => { const seen = new WeakSet(); return el => { if (seen.has(el)) return; seen.add(el); fn(el); }; };
const ENHANCE = [];
let started = false;
/** run fn on every element matching sel, now and whenever one is added to the page */
function enhance(sel, fn) { ENHANCE.push([sel, fn]); if (started) { if (doc.documentElement.matches(sel)) fn(doc.documentElement); $$(sel).forEach(fn); } }
function upgrade(node = doc.body) {
  for (const [sel, fn] of ENHANCE) { if (node.matches?.(sel)) fn(node); node.querySelectorAll?.(sel).forEach(fn); }
}
/** the page's API for scripts that don't import modules: window.m. Modules add to it with expose(). */
const m = { place, upgrade, h, RM };
function expose(fns) { Object.assign(m, fns); }

// a region that scrolls with nothing to focus inside it can still be scrolled from the keyboard (only while it scrolls)
const FOCUSABLE = 'a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])';
const scrollRO = new ResizeObserver(es => es.forEach(({ target: el }) => {
  const over = el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
  // (a control that's inert or disabled can't take focus, so it doesn't count)
  const reachable = [...el.querySelectorAll(FOCUSABLE)].some(x => !x.disabled && !x.closest('[inert]'));
  if (over && !el.hasAttribute('tabindex') && !reachable) { el.tabIndex = 0; el.dataset.scrollFocus = ''; }
  else if (!over && el.hasAttribute('data-scroll-focus')) { el.removeAttribute('tabindex'); delete el.dataset.scrollFocus; }
}));
enhance('.strip, .table-wrap, .scroll-x, .codeblock pre, .term pre, pre.code', once(el => scrollRO.observe(el)));
enhance('.ms:not([aria-hidden])', el => el.setAttribute('aria-hidden', 'true'));

function start() {
  if (started) return; started = true;
  upgrade(doc.documentElement);
  new MutationObserver(ms => { for (const r of ms) for (const n of r.addedNodes) if (n.nodeType === 1) upgrade(n); }).observe(root, { childList: true, subtree: true });
  window.m = m;
  dispatchEvent(new Event('m-ready'));
}

// ── m/src/components/feedback/toast/toast.js
/* ════════ toast: one ink pill at the foot of the window. toast('Copied', { icon: 'check', action: 'Undo', onAction }).
      detail: a line under the words; progress: the time it stays, as a bar emptying along its foot; stack: the ones
      still showing stay, behind it (three at most) ════════ */
function toast(text, { icon, action, onAction, timeout = 3600, tone, detail, progress, stack } = {}) {
  // in the top layer, shown again for each toast so it stands above anything opened since; while a modal is open it lives
  // inside that modal, where it can still be pressed and heard (the rest of the page is inert)
  const modal = $$('dialog[open]').filter(d => d.matches(':modal')).at(-1), parent = modal || doc.body;
  let toasts = parent.querySelector(':scope > .toasts');
  if (!toasts) { toasts = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite', popover: 'manual' }); parent.append(toasts); }
  if (toasts.showPopover) { if (toasts.matches(':popover-open')) toasts.hidePopover(); toasts.showPopover(); }
  if (stack) toasts.dataset.variant = 'stack'; else delete toasts.dataset.variant;
  $$('.toasts[popover] > .toast:not(.out)').slice(0, stack ? -2 : undefined).forEach(dismiss);   // (the library's hosts only: a page's drawn toasts stay)
  const variant = [detail && 'detail', progress && timeout && 'progress'].filter(Boolean).join(' ');
  const t = h('div', { class: 'toast', 'data-tone': tone || null, 'data-variant': variant || null },
    (icon ? ms(icon) : '') + (detail ? `<span class="toast-text"><b>${esc(text)}</b><small>${esc(detail)}</small></span>` : `<span>${esc(text)}</span>`)
    + (progress && timeout ? `<i class="toast-time" aria-hidden="true" style="--t: ${+timeout}ms"></i>` : ''));
  if (action) { const b = h('button', { type: 'button', class: 'btn' }, esc(action)); b.addEventListener('click', () => { onAction?.(); dismiss(t); }); t.append(b); }
  toasts.append(t);
  if (timeout) setTimeout(() => dismiss(t), timeout);
  return t;
}
function dismiss(t) { if (t.classList.contains('out')) return; t.classList.add('out'); setTimeout(() => t.remove(), RM.matches ? 0 : 260); }
expose({ toast });

// ── m/src/copy.js
/* ════════ copy: [data-copy="text"] or [data-copy-from="#selector"] ════════ */
doc.addEventListener('click', async e => {
  const b = e.target.closest('[data-copy], [data-copy-from]'); if (!b) return;
  const text = b.dataset.copy ?? doc.querySelector(b.dataset.copyFrom)?.innerText ?? '';
  try { await navigator.clipboard.writeText(text); toast(b.dataset.copied || 'Copied', { icon: 'check' }); }
  catch { toast('The clipboard said no. Select the text and copy it instead.', { icon: 'error', tone: 'bad' }); }
});

// ── m/src/ground.js
/* ════════ grounds: a photograph's Material You seed, as the film's seedOf() and palette() take it (OKLCH; the hue with
      the most colourful area; under 2 % of colour is a neutral photograph). ground(el, url) wears it. ════════ */
const toLin = c => (c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4), toSrgb = c => (c <= .0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - .055);
function rgbToOklch(r, g, b) {
  r = toLin(r / 255); g = toLin(g / 255); b = toLin(b / 255);
  const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b), m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b), s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
  const A = 1.9779984951 * l - 2.428592205 * m + .4505937099 * s, B = .0259040371 * l + .7827717662 * m - .808675766 * s;
  return [.2104542553 * l + .793617785 * m - .0040720468 * s, Math.hypot(A, B), (Math.atan2(B, A) * 180 / Math.PI + 360) % 360];
}
function seedFromPixels(d) {
  const bins = new Float32Array(36), hues = Array.from({ length: 36 }, () => []);
  for (let i = 0; i < d.length; i += 4) {
    const [L, C, hh] = rgbToOklch(d[i], d[i + 1], d[i + 2]); if (C < .02 || L < .15) continue;
    const k = Math.floor(hh / 10) % 36; bins[k] += C * (1 - Math.abs(L - .62)); hues[k].push([hh, C]);
  }
  const around = k => bins[(k + 35) % 36] * .5 + bins[k] + bins[(k + 1) % 36] * .5;
  let best = 0; for (let k = 1; k < 36; k++) if (around(k) > around(best)) best = k;
  const list = [...hues[(best + 35) % 36], ...hues[best], ...hues[(best + 1) % 36]];
  if (list.length < (d.length / 4) * .02) return null;
  let x = 0, y = 0; for (const [hh, C] of list) { x += C * Math.cos(hh * Math.PI / 180); y += C * Math.sin(hh * Math.PI / 180); }
  const chroma = list.map(v => v[1]).sort((a, b) => a - b);
  return { h: Math.round((Math.atan2(y, x) * 180 / Math.PI + 360) % 360), c: +chroma[Math.floor(chroma.length * .8)].toFixed(3) };
}
const seeds = new Map();
function seedOf(src) {
  if (!seeds.has(src)) seeds.set(src, new Promise((ok, no) => {
    const img = new Image(); img.decoding = 'async';
    img.onload = () => { const c = h('canvas', { width: 64, height: 64 }), x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, 64, 64); ok(seedFromPixels(x.getImageData(0, 0, 64, 64).data)); };
    img.onerror = no; img.src = src;
  }).catch(() => (seeds.delete(src), null)));
  return seeds.get(src);
}
async function ground(el, src) {
  const s = src && typeof src === 'object' ? src : await seedOf(src);
  if (s) { el.style.setProperty('--h', s.h); el.style.setProperty('--c', s.c); el.classList.add('tone'); }
  else { el.style.removeProperty('--h'); el.style.removeProperty('--c'); el.classList.remove('tone'); }
  return s;
}
function oklchToLinear(L, C, hh) {
  const a = C * Math.cos(hh * Math.PI / 180), b = C * Math.sin(hh * Math.PI / 180);
  const l = (L + .3963377774 * a + .2158037573 * b) ** 3, m = (L - .1055613458 * a - .0638541728 * b) ** 3, s = (L - .0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + .2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - .3413193965 * s, -.0041960863 * l - .7034186147 * m + 1.707614701 * s];
}
function hex(L, C, hh) {
  let c = C, rgb = oklchToLinear(L, c, hh);
  for (let i = 0; i < 30 && rgb.some(v => v < -1e-4 || v > 1 + 1e-4); i++) { c *= .92; rgb = oklchToLinear(L, c, hh); }
  return '#' + rgb.map(v => Math.round(clamp(toSrgb(clamp(v))) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
}
/** the scheme a seed gives, as hex, Day and Night: the same formulas as .tone in m.css */
function tonesOf({ h: hh, c }) {
  const C = clamp(c, .04, .16), t = (L, k, cap) => hex(L, Math.min(C * k, cap), hh);
  return {
    day: { g: t(.915, .42, .055), g2: t(.86, .6, .075), tile: t(.955, .25, .03), ink: t(.27, .5, .07), ink2: t(.45, .4, .05), primary: t(.83, .55, .085), onp: t(.3, .5, .07) },
    night: { g: t(.2, .45, .05), g2: t(.3, .5, .05), tile: t(.25, .4, .04), ink: t(.95, .3, .035), ink2: t(.8, .3, .035), primary: t(.83, .55, .085), onp: t(.3, .5, .07) },
  };
}
enhance('[data-ground]', once(el => { const src = el.dataset.ground || el.querySelector('img')?.currentSrc || el.querySelector('img')?.src; if (src) ground(el, src); }));
expose({ ground, seedOf, seedFromPixels, tonesOf, hex });

// ── m/src/output.js
/* ════════ outputs: <output for="id"> reads its range or number input (data-labels, or data-format "{v} s") ════════ */
function fmtValue(inp, v = +inp.value) {
  const step = +inp.step || 1, dp = Math.max(0, (String(step).split('.')[1] || '').length), num = v.toFixed(dp).replace('-', '−');
  if (inp.dataset.labels) { const ls = inp.dataset.labels.split(','), i = Math.round((v - (+inp.min || 0)) / step); return ls[i] ?? num; }
  const signed = inp.hasAttribute('data-signed') && v > 0 ? '+' + num : num;
  return (inp.dataset.format || '{v}').replace('{v}', signed);
}
function outputs(inp) { if (inp.id) $$(`output[for~="${CSS.escape(inp.id)}"]`).forEach(o => (o.textContent = fmtValue(inp))); }
doc.addEventListener('input', e => { const t = e.target; if (t.matches?.('input[type=range], input[type=number]')) { outputs(t); t.closest('.slider-row')?.classList.toggle('changed', t.value !== t.defaultValue); } });

function slider(inp) {
  const f = () => { const a = +inp.min || 0, b = +(inp.max || 100), span = b - a || 1; inp.style.setProperty('--f', (+inp.value - a) / span); if (inp.dataset.zero != null) inp.style.setProperty('--z', (+inp.dataset.zero - a) / span); };
  f(); inp.addEventListener('input', f); outputs(inp);
}
enhance('input.slider', once(slider));
enhance('input[type=range][id], input[type=number][id]', once(outputs));
expose({ fmtValue });

// ── m/src/theme.js
/* ════════ theme: [data-theme-set="light|dark|system"]; the choice is kept, and opens as a circle from its button ════════ */
function setTheme(t, from) {
  const apply = () => { root.dataset.theme = t; try { localStorage.setItem('m.theme', t); } catch {} syncTheme(); emit(root, 'm-theme', { theme: t }); };
  if (from && doc.startViewTransition && !RM.matches) {
    const r = from.getBoundingClientRect();
    root.style.setProperty('--vx', r.left + r.width / 2 + 'px'); root.style.setProperty('--vy', r.top + r.height / 2 + 'px');
    root.dataset.themeFlip = '';
    const vt = doc.startViewTransition(apply);
    vt.ready.catch(() => {});
    vt.finished.finally(() => delete root.dataset.themeFlip);
  } else apply();
}
function syncTheme() { const t = root.dataset.theme || 'light'; $$('[data-theme-set]').forEach(b => b.setAttribute(b.getAttribute('role') === 'radio' ? 'aria-checked' : 'aria-pressed', String(b.dataset.themeSet === t))); }
doc.addEventListener('click', e => { const b = e.target.closest('[data-theme-set]'); if (b) setTheme(b.dataset.themeSet, b); });
// a page that can change theme (it carries data-theme) takes the one chosen last; the README's head snippet does this
// before the first paint, so nothing flashes
try { const t = localStorage.getItem('m.theme'); if (t && root.hasAttribute('data-theme') && !root.hasAttribute('data-theme-fixed')) root.dataset.theme = t; } catch {}
syncTheme();
expose({ setTheme });

// ── m/src/components/actions/toggle/toggle.js
// a .toggle with aria-pressed flips on a press and says so (change, detail.pressed); data-manual leaves it to the page
doc.addEventListener('click', e => {
  const t = e.target.closest?.('.toggle[aria-pressed]');
  if (!t || e.defaultPrevented || t.disabled || t.getAttribute('aria-disabled') === 'true' || t.hasAttribute('data-manual')) return;
  const on = t.getAttribute('aria-pressed') !== 'true';
  t.setAttribute('aria-pressed', String(on));
  emit(t, 'change', { pressed: on });
});

// ── m/src/components/actions/fab/fab.js
enhance('.fab-menu', once(menu => { const k = menu.children.length; [...menu.children].forEach((c, i) => c.style.setProperty('--n', k - 1 - i)); }));

// ── m/src/components/actions/group/group.js
const radiosOf = g => $$('[role=radio]:not(input)', g).filter(r => r.closest('[role=radiogroup]') === g);
function rove(g) {
  const rs = radiosOf(g), on = rs.find(r => r.getAttribute('aria-checked') === 'true') || rs.find(r => !r.disabled);
  rs.forEach(r => (r.tabIndex = r === on ? 0 : -1));
}
enhance('[role=radiogroup]', once(g => {
  if (!radiosOf(g).length) return;
  rove(g);
  new MutationObserver(() => rove(g)).observe(g, { subtree: true, attributes: true, attributeFilter: ['aria-checked', 'disabled'] });
}));
// a press chooses it, when the page's own script hasn't already (or said no with preventDefault)
doc.addEventListener('click', e => {
  const r = e.target.closest?.('[role=radio]:not(input)'), g = r?.closest('[role=radiogroup]');
  if (!g || e.defaultPrevented || r.disabled || r.getAttribute('aria-disabled') === 'true' || r.getAttribute('aria-checked') === 'true') return;
  radiosOf(g).forEach(x => x.setAttribute('aria-checked', String(x === r)));
  g.dispatchEvent(new CustomEvent('change', { bubbles: true, detail: { value: r.dataset.value ?? r.textContent.trim(), radio: r } }));
});
doc.addEventListener('keydown', e => {
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
  const r = e.target.closest?.('[role=radio]:not(input)'), g = r?.closest('[role=radiogroup]');
  if (!g) return;
  const rs = radiosOf(g).filter(x => !x.disabled && x.getAttribute('aria-disabled') !== 'true'), i = rs.indexOf(r), n = rs.length;
  const rtl = getComputedStyle(g).direction === 'rtl';
  const to = { ArrowRight: rtl ? i - 1 : i + 1, ArrowDown: i + 1, ArrowLeft: rtl ? i + 1 : i - 1, ArrowUp: i - 1, Home: 0, End: n - 1 }[e.key];
  if (to === undefined || i < 0) return;
  e.preventDefault();
  const next = rs[(to + n) % n];
  next.focus();
  if (next.getAttribute('aria-checked') !== 'true') next.click();
});

// ── m/src/components/inputs/menu/menu.js
/* ════════ m-menu: a button and its action menu (menuitem, menuitemradio, menuitemcheckbox) ════════ */
// an item's words, without its icons' ligature names or its key: "View", not "tuneView"
const menuText = el => { const c = el.cloneNode(true); c.querySelectorAll('.ms, kbd').forEach(x => x.remove()); return c.textContent.replace(/\s+/g, ' ').trim(); };
class MMenu extends HTMLElement {
  connectedCallback() {
    if (this.btn) return;
    this.btn = this.querySelector(':scope > button, :scope > .btn, :scope > [data-trigger]');
    this.menu = this.querySelector(':scope > .menu, :scope > [role=menu]');
    if (!this.btn || !this.menu) return;
    this.menu.setAttribute('role', 'menu'); this.menu.setAttribute('popover', 'manual'); this.menu.tabIndex = -1;
    ensureId(this.menu, 'menu');
    if (this.closest('.compact')) this.menu.classList.add('compact');
    this.btn.setAttribute('aria-haspopup', 'menu'); this.btn.setAttribute('aria-expanded', 'false'); this.btn.setAttribute('aria-controls', this.menu.id);
    this.find = typeahead();
    this.btn.addEventListener('click', () => (this.isOpen ? this.close() : this.open()));
    this.btn.addEventListener('keydown', e => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); this.open(e.key === 'ArrowUp' ? -1 : 0); } });
    this.menu.addEventListener('keydown', e => this.key(e));
    this.menu.addEventListener('click', e => {
      const it = e.target.closest('[role^=menuitem]');
      if (!it || it.getAttribute('aria-disabled') === 'true') return;
      const role = it.getAttribute('role');
      if (role === 'menuitemradio') { const g = it.dataset.group; $$('[role=menuitemradio]', this.menu).filter(x => x.dataset.group === g).forEach(x => x.setAttribute('aria-checked', String(x === it))); }
      if (role === 'menuitemcheckbox') it.setAttribute('aria-checked', String(it.getAttribute('aria-checked') !== 'true'));
      emit(this, 'select', { item: it, value: it.dataset.value ?? menuText(it) });
      if (role !== 'menuitemcheckbox') this.close();
    });
    this.menu.addEventListener('pointermove', e => { const it = e.target.closest('[role^=menuitem]'); if (it && it !== doc.activeElement) it.focus({ preventScroll: true }); });
  }
  items() { return $$('[role^=menuitem]', this.menu).filter(x => x.getAttribute('aria-disabled') !== 'true' && !x.disabled); }
  open(at = 0) {
    if (this.isOpen) return;
    opened(this); this.isOpen = true;
    showPop(this.menu);
    place(this.menu, this.btn, { align: this.getAttribute('align') || 'start', side: this.getAttribute('side') || 'bottom' });
    this.btn.setAttribute('aria-expanded', 'true');
    this.items().forEach(x => (x.tabIndex = -1));
    const its = this.items(); (its.at(at) || this.menu).focus({ preventScroll: true });
  }
  reposition() { if (this.isOpen) place(this.menu, this.btn, { align: this.getAttribute('align') || 'start', side: this.getAttribute('side') || 'bottom' }); }
  close(refocus = true) {
    if (!this.isOpen) return;
    this.isOpen = false; released(this);
    hidePop(this.menu); this.btn.setAttribute('aria-expanded', 'false');
    if (refocus) this.btn.focus({ preventScroll: true });
  }
  key(e) {
    const its = this.items(), i = its.indexOf(doc.activeElement), n = its.length;
    const go = { ArrowDown: (i + 1) % n, ArrowUp: (i - 1 + n) % n, Home: 0, End: n - 1 }[e.key];
    if (go !== undefined) { e.preventDefault(); its[go]?.focus(); return; }
    if (e.key === 'Escape') { e.preventDefault(); this.close(); return; }
    if (e.key === 'Tab') { this.close(false); return; }
    const k = this.find(e.key, its.map(menuText), Math.max(0, i));
    if (k >= 0) { e.preventDefault(); its[k].focus(); }
  }
}
customElements.define('m-menu', MMenu);

// ── m/src/components/actions/toolbar/toolbar.js
// the tools: what takes the focus in it, not inside its menus; a radio group counts once (its own keys move inside it)
const toolbarTools = tb => $$('button, a[href], input:not([type=hidden]), [tabindex]', tb).filter(el =>
  el.closest('[role=toolbar]') === tb && !el.closest('.menu, [hidden]') && !el.disabled && el.getAttribute('aria-hidden') !== 'true'
  && !(el.getAttribute('role') === 'radio' && el.tabIndex < 0) && !el.matches('.menu'));
function toolbarRove(tb, cur) {
  const ts = toolbarTools(tb); if (!ts.length) return;
  cur = ts.includes(cur) ? cur : ts.find(t => t.tabIndex === 0 && t.dataset.roved) || ts[0];
  for (const t of ts) if (t.getAttribute('role') !== 'radio') { t.tabIndex = t === cur ? 0 : -1; t.dataset.roved = ''; }
}
enhance('[role=toolbar]', once(tb => {
  toolbarRove(tb);
  tb.addEventListener('focusin', e => { if (!e.target.closest('.menu')) toolbarRove(tb, e.target); });
  if (tb.hasAttribute('data-overflow')) toolbarOverflow(tb);
}));
doc.addEventListener('keydown', e => {
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
  const tb = e.target.closest?.('[role=toolbar]');
  if (!tb || e.target.closest('.menu') || e.target.matches('input:not([type=checkbox], [type=radio], [type=button]), textarea, [contenteditable], m-dial *')) return;
  const v = tb.getAttribute('aria-orientation') === 'vertical', rtl = getComputedStyle(tb).direction === 'rtl';
  const fwd = v ? 'ArrowDown' : rtl ? 'ArrowLeft' : 'ArrowRight', back = v ? 'ArrowUp' : rtl ? 'ArrowRight' : 'ArrowLeft';
  const ts = toolbarTools(tb), i = ts.indexOf(e.target);
  const to = { [fwd]: i + 1, [back]: i - 1, Home: 0, End: ts.length - 1 }[e.key];
  if (to === undefined || i < 0) return;
  e.preventDefault();
  const t = ts[(to + ts.length) % ts.length]; toolbarRove(tb, t); t.focus();
});

// what doesn't fit goes under More, from the end; [data-keep] tools always stay
function toolbarOverflow(tb) {
  const v = tb.getAttribute('aria-orientation') === 'vertical';
  const more = h('m-menu', { class: 'toolbar-more', align: 'end', side: v ? 'bottom' : 'top', hidden: true },
    `<button class="ib" type="button" aria-label="More tools" data-tip="More">${ms(v ? 'more_horiz' : 'more_vert')}</button><div class="menu"></div>`);
  tb.append(more);
  const items = [...tb.children].filter(c => c !== more && !c.matches('[data-keep], hr, .toolbar-sep'));
  const over = () => (v ? tb.scrollHeight > tb.clientHeight + 1 : tb.scrollWidth > tb.clientWidth + 1);
  const nameOf = el => el.getAttribute('aria-label') || el.dataset.tip || menuText(el);
  const fit = () => {
    items.forEach(c => (c.hidden = false)); more.hidden = true;
    let k = items.length;
    while (k > 0 && over()) { more.hidden = false; items[--k].hidden = true; }
    // a separator with nothing left after it goes too
    $$(':scope > :is(hr, .toolbar-sep)', tb).forEach(s => { let n = s.nextElementSibling; while (n && n.hidden) n = n.nextElementSibling; s.hidden = !n || n === more; });
    const menu = more.querySelector('.menu');
    menu.replaceChildren(...items.filter(c => c.hidden).flatMap(c => (c.matches('button, a') ? [c] : $$('button, a[href]', c))).map(t => {
      const icon = t.querySelector('.ms')?.textContent.trim();
      const it = h('button', { type: 'button', role: 'menuitem', 'aria-disabled': t.disabled ? 'true' : null }, (icon ? ms(icon) : '') + `<span class="txt">${esc(nameOf(t))}</span>`);
      it.addEventListener('click', () => t.click());
      return it;
    }));
    toolbarRove(tb);
  };
  new ResizeObserver(fit).observe(tb.parentElement);
  fit();
}

// ── m/src/components/actions/chip/filter.js
/* ════════ m-filter: chips that filter a set of items by their data-tags. target="#grid"; multiple for several ════════ */
class MFilter extends HTMLElement {
  connectedCallback() {
    if (this.chips) return;
    this.chips = $$('[data-value]', this);
    this.target = doc.querySelector(this.getAttribute('target'));
    if (!this.target) return;
    this.chips.forEach(c => { c.type ||= 'button'; if (!c.hasAttribute('aria-pressed')) c.setAttribute('aria-pressed', 'false'); c.addEventListener('click', () => this.toggle(c)); });
    if (!this.chips.some(c => c.getAttribute('aria-pressed') === 'true')) this.chips[0]?.setAttribute('aria-pressed', 'true');
    this.apply(true);
    // items drawn later (by a script, from data) are filtered and counted too
    new MutationObserver(() => this.apply(true)).observe(this.target, { childList: true });
  }
  toggle(c) {
    const all = c.dataset.value === '*';
    if (!this.hasAttribute('multiple') || all) this.chips.forEach(x => x.setAttribute('aria-pressed', String(x === c)));
    else { c.setAttribute('aria-pressed', String(c.getAttribute('aria-pressed') !== 'true')); this.chips.find(x => x.dataset.value === '*')?.setAttribute('aria-pressed', 'false'); if (!this.chips.some(x => x.getAttribute('aria-pressed') === 'true')) this.chips.find(x => x.dataset.value === '*')?.setAttribute('aria-pressed', 'true'); }
    this.apply();
  }
  apply(first) {
    const on = this.chips.filter(c => c.getAttribute('aria-pressed') === 'true').map(c => c.dataset.value);
    const items = [...this.target.children].filter(x => x.dataset.tags !== undefined);
    const show = x => on.includes('*') || on.some(v => x.dataset.tags.split(/\s+/).includes(v));
    const run = () => {
      items.forEach(x => (x.hidden = !show(x)));
      const n = items.filter(x => !x.hidden).length;
      $$(`[data-count-for="${this.getAttribute('target')}"]`).forEach(el => (el.textContent = (el.dataset.countText || '{n} of {total}').replace('{n}', n).replace('{total}', items.length)));
      emit(this, 'change', { values: on, shown: n });
    };
    if (first || RM.matches || !doc.startViewTransition) { run(); return; }
    items.forEach((x, i) => (x.style.viewTransitionName = `mf-${i}`));
    const vt = doc.startViewTransition(run);
    vt.ready.catch(() => {});
    vt.finished.finally(() => items.forEach(x => (x.style.viewTransitionName = '')));
  }
}
customElements.define('m-filter', MFilter);

// ── m/src/components/inputs/form/form.js
/* ════════ form[data-validate]: the browser's checks (required, type, min, max, pattern, and what our own controls
      say: a strict combobox, a date that can't be had), said the library's way. A send that can't go lists each thing
      to fix at the head of the form (the list takes the focus, each line a link to its field) and says it again under
      the field; once each is put right, its words go. data-error="…" on a control says it in your words, or
      data-error-missing, -type, -short, -long, -low, -high, -pattern for each reason. Says invalid with { fields }. ════════ */
const FORM_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
function formMessage(c) {
  const v = c.validity, d = c.dataset, label = (c.labels?.[0]?.textContent || c.getAttribute('aria-label') || '').replace(/·.*$/, '').trim();
  if (d.error) return d.error;
  if (v.valueMissing) return d.errorMissing || (c.type === 'checkbox' ? 'Tick this to go on' : c.type === 'radio' || c.tagName === 'SELECT' ? 'Choose one' : c.type === 'file' ? 'Add a file' : label ? `${label}: this is needed` : 'This is needed');
  if (v.typeMismatch) return d.errorType || (c.type === 'email' ? 'Write it as name@example.com' : c.type === 'url' ? 'Write it as https://example.com' : 'Not in the form it needs');
  if (v.tooShort) return d.errorShort || `At least ${c.minLength} characters (now ${c.value.length})`;
  if (v.tooLong) return d.errorLong || `At most ${c.maxLength} characters`;
  if (v.rangeUnderflow) return d.errorLow || `${c.min} or more`;
  if (v.rangeOverflow) return d.errorHigh || `${c.max} or less`;
  if (v.stepMismatch) return d.errorStep || `In steps of ${c.step}`;
  if (v.badInput) return d.errorType || 'Write a number';
  if (v.patternMismatch) return d.errorPattern || 'Not in the form it needs';
  return c.validationMessage || 'Not right yet';
}
// the place a control's message goes: after its field (or its group), inside its row
const formSpot = c => c.closest('fieldset.fieldset') || c.closest('.field, m-select, m-combobox, m-tags, m-datefield, m-time, m-dropzone, m-colour, .choice, .switch-row') || c;
function formSay(c, msg) {
  const spot = formSpot(c), group = spot.matches?.('fieldset') ? spot : null;
  let err = (group || spot.parentElement).querySelector(':scope > .help.error[data-for="' + ensureId(c, 'f') + '"]');
  if (!msg) { err?.remove(); c.removeAttribute('aria-invalid'); group?.removeAttribute('aria-invalid'); if (err) c.setAttribute('aria-describedby', (c.getAttribute('aria-describedby') || '').split(' ').filter(x => x && x !== err.id).join(' ')); return; }
  if (!err) {
    err = h('span', { class: 'help error', id: uid('m-err'), 'data-for': c.id });
    if (group) group.append(err); else spot.after(err);
    c.setAttribute('aria-describedby', [...new Set([...(c.getAttribute('aria-describedby') || '').split(' ').filter(Boolean), err.id])].join(' '));
  }
  err.textContent = msg; c.setAttribute('aria-invalid', 'true'); group?.setAttribute('aria-invalid', 'true');
}
const formControls = f => [...f.elements].filter(c => c.willValidate && !c.disabled && c.type !== 'hidden' && !c.closest('[hidden]'));
function formCheck(f, focus) {
  const bad = [], seen = new Set();
  for (const c of formControls(f)) {
    if (c.type === 'radio') { if (seen.has(c.name)) continue; seen.add(c.name); }
    const ok = c.checkValidity();
    if (c.type === 'radio') $$(`input[type=radio][name="${CSS.escape(c.name)}"]`, f).forEach(r => (ok ? r.removeAttribute('aria-invalid') : r.setAttribute('aria-invalid', 'true')));
    formSay(c, ok ? '' : formMessage(c));
    if (!ok) bad.push(c);
  }
  let box = f.querySelector(':scope > .form-errors');
  if (!bad.length) { box?.remove(); return true; }
  if (!box) { box = h('div', { class: 'form-errors', tabindex: '-1', role: 'group' }); f.prepend(box); }
  const n = bad.length, words = FORM_WORDS[n] || String(n);
  box.setAttribute('aria-label', n === 1 ? 'One thing to fix' : `${words} things to fix`);
  box.innerHTML = `<p class="form-errors-h">${n === 1 ? 'One thing to fix' : `${words[0].toUpperCase() + words.slice(1)} things to fix`}</p><ul>${bad.map(c => `<li><a href="#${esc(c.id)}" data-to="${esc(c.id)}">${esc(formMessage(c))}</a></li>`).join('')}</ul>`;
  if (focus) { box.focus({ preventScroll: true }); box.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); emit(f, 'invalid', { fields: bad }); }
  return false;
}
enhance('form[data-validate]', once(f => {
  f.noValidate = true;
  f.addEventListener('submit', e => { f.dataset.tried = ''; if (!formCheck(f, true)) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  // once a send has been tried, each field is checked again as it changes
  const again = e => { if (f.hasAttribute('data-tried') && e.target.willValidate) formCheck(f, false); };
  f.addEventListener('input', again); f.addEventListener('change', again); f.addEventListener('focusout', again);
  // a line of the list goes to its field (to the select's button, where the select itself is out of sight)
  f.addEventListener('click', e => {
    const a = e.target.closest('.form-errors a[data-to]'); if (!a) return;
    e.preventDefault();
    const c = document.getElementById(a.dataset.to), to = c?.closest('m-select')?.querySelector('.select-btn') || c;
    to?.focus({ preventScroll: true }); to?.scrollIntoView({ block: 'center' });
  });
  f.addEventListener('reset', () => { delete f.dataset.tried; setTimeout(() => { f.querySelector(':scope > .form-errors')?.remove(); formControls(f).forEach(c => formSay(c, '')); }); });
}));

// ── m/src/components/inputs/select/select.js
/* ════════ m-select: a <select> with the site's listbox (arrows, Home/End, type-ahead, Enter, Esc) ════════ */
class MSelect extends HTMLElement {
  connectedCallback() {
    if (this.btn || !(this.sel = this.querySelector(':scope > select'))) return;
    const sel = this.sel;
    sel.tabIndex = -1; sel.setAttribute('aria-hidden', 'true');
    const valId = uid('m-val');
    const btn = this.btn = h('button', { type: 'button', class: 'select-btn', 'aria-haspopup': 'listbox', 'aria-expanded': 'false' },
      (this.dataset.label ? `<span class="pre" id="${valId}-p">${esc(this.dataset.label)}</span>` : '') + `<span class="val" id="${valId}"></span>` + ms('arrow_drop_down'));
    // the button is named by its label and its value, the words it shows
    const label = sel.id && doc.querySelector(`label[for="${sel.id}"]`);
    let names = this.dataset.label ? `${valId}-p ${valId}` : valId;
    if (label) { names = `${ensureId(label, 'lbl')} ${names}`; label.addEventListener('click', e => { e.preventDefault(); btn.focus(); }); }
    else if (sel.getAttribute('aria-label') && !this.dataset.label) { const n = h('span', { class: 'vh', id: valId + '-n' }, esc(sel.getAttribute('aria-label'))); this.append(n); names = `${n.id} ${valId}`; }
    btn.setAttribute('aria-labelledby', names);
    this.prepend(btn);
    this.menu = h('div', { class: 'menu', role: 'listbox', tabindex: '-1', id: uid('m-lb'), popover: 'manual', 'aria-labelledby': names });
    if (this.closest('.compact')) this.menu.classList.add('compact');
    this.append(this.menu);
    btn.setAttribute('aria-controls', this.menu.id);
    btn.disabled = sel.disabled;
    this.find = typeahead();
    btn.addEventListener('click', () => (this.isOpen ? this.close() : this.open()));
    btn.addEventListener('keydown', e => {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); this.open(); return; }
      // a letter opens it at the first option that starts so (the select-only combobox's type-ahead)
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); this.open(); const i = this.find(e.key, this.labels, this.act); if (i >= 0) this.mark(i); }
    });
    this.menu.addEventListener('click', e => { const o = e.target.closest('[role=option]'); if (o && o.getAttribute('aria-disabled') !== 'true') this.choose(+o.dataset.i); });
    this.menu.addEventListener('pointermove', e => { const o = e.target.closest('[role=option]'); if (o) this.mark(+o.dataset.i, false); });
    this.menu.addEventListener('keydown', e => this.key(e));
    sel.addEventListener('change', () => this.sync());
    // a form's reset puts the select back after the event; the button follows it
    sel.form?.addEventListener('reset', () => setTimeout(() => this.sync()));
    // options a script adds or changes, and a disabled set later, reach the button
    new MutationObserver(() => { btn.disabled = sel.disabled; this.sync(); if (this.isOpen) this.build(); }).observe(sel, { attributes: true, attributeFilter: ['disabled'], childList: true, subtree: true, characterData: true });
    this.sync();
  }
  get value() { return this.sel?.value; }
  set value(v) { if (this.sel) { this.sel.value = v; this.sync(); } }
  sync() {
    const o = this.sel.selectedOptions[0];
    this.btn.querySelector('.val').textContent = o ? o.textContent.trim() : '';
    const sw = this.btn.querySelector('.sw');
    if (o?.dataset.sw) { (sw || this.btn.insertBefore(h('i', { class: 'sw', 'aria-hidden': 'true' }), this.btn.querySelector('.val'))).style.background = o.dataset.sw; } else sw?.remove();
  }
  build() {
    const opts = [...this.sel.options];
    this.menu.replaceChildren();
    let group = null;
    opts.forEach((o, i) => {
      if (o.parentElement.tagName === 'OPTGROUP' && o.parentElement !== group) { group = o.parentElement; this.menu.append(h('div', { class: 'group', role: 'presentation' }, esc(group.label))); }
      const d = o.dataset;
      const el = h('div', { role: 'option', id: `${this.menu.id}-${i}`, 'data-i': i, 'aria-selected': String(o.selected), 'aria-disabled': o.disabled ? 'true' : null },
        ms('check').replace('class="ms"', 'class="ms chk"') + (d.sw ? `<i class="sw" style="background:${esc(d.sw)}"></i>` : '') + (d.icon ? ms(d.icon) : '') + (d.thumb ? `<img class="thumb" src="${esc(d.thumb)}" alt="">` : '') +
        `<span class="txt">${esc(o.textContent.trim())}${d.desc ? `<small>${esc(d.desc)}</small>` : ''}</span>` + (d.kbd ? `<kbd>${esc(d.kbd)}</kbd>` : ''));
      this.menu.append(el);
    });
    this.labels = opts.map(o => o.textContent.trim());
  }
  open() {
    if (this.isOpen || this.sel.disabled) return;
    this.build(); opened(this); this.isOpen = true;
    showPop(this.menu);
    place(this.menu, this.btn, { match: true });
    this.btn.setAttribute('aria-expanded', 'true');
    this.mark(Math.max(0, this.sel.selectedIndex));
    this.menu.focus({ preventScroll: true });
  }
  reposition() { if (this.isOpen) place(this.menu, this.btn, { match: true }); }
  close(refocus = true) {
    if (!this.isOpen) return;
    this.isOpen = false; released(this);
    hidePop(this.menu); this.btn.setAttribute('aria-expanded', 'false');
    if (refocus) this.btn.focus({ preventScroll: true });
  }
  mark(i, scroll = true) {
    const els = $$('[role=option]', this.menu);
    this.act = clamp(i, 0, els.length - 1);
    els.forEach((el, k) => el.classList.toggle('act', k === this.act));
    if (els[this.act]) { this.menu.setAttribute('aria-activedescendant', els[this.act].id); if (scroll) els[this.act].scrollIntoView({ block: 'nearest' }); }
  }
  choose(i) {
    const o = this.sel.options[i];
    if (!o || o.disabled) return;
    if (this.sel.selectedIndex !== i) { this.sel.selectedIndex = i; this.sync(); fire(this.sel); }
    this.close();
  }
  key(e) {
    const n = this.sel.options.length, step = d => { let i = this.act; for (let k = 0; k < n; k++) { i = (i + d + n) % n; if (!this.sel.options[i].disabled) return i; } return this.act; };
    const go = { ArrowDown: () => step(1), ArrowUp: () => step(-1), Home: () => 0, End: () => n - 1, PageDown: () => Math.min(n - 1, this.act + 8), PageUp: () => Math.max(0, this.act - 8) }[e.key];
    if (go) { e.preventDefault(); this.mark(go()); return; }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.choose(this.act); return; }
    if (e.key === 'Escape') { e.preventDefault(); this.close(); return; }
    if (e.key === 'Tab') { this.close(false); return; }
    const i = this.find(e.key, this.labels, this.act);
    if (i >= 0) { e.preventDefault(); this.mark(i); }
  }
}
customElements.define('m-select', MSelect);

// ── m/src/components/inputs/combobox/combobox.js
/* ════════ m-combobox: an input and a <datalist> (which is what works before the script, and after it the options).
      The list narrows as you type, the match marked; ↓ ↑ move through it, Enter takes one, Esc closes it (then clears).
      strict: only an option will do (the field says so to its form); recent="key": the last few picked, kept on this
      device, offered when the field is empty; empty="…": what to say when nothing matches; max: how many to show.
      A [data-open-list] button in the field opens the whole list. Says pick with { value, label, option }. ════════ */
const comboNorm = s => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
/** text, with the part that matches q marked */
function comboMark(text, q) {
  const i = q ? comboNorm(text).indexOf(comboNorm(q)) : -1;
  return i < 0 ? esc(text) : esc(text.slice(0, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length));
}
/** options that match q: those starting with it (or with a word that does) first, then those holding it */
function comboMatch(list, q, max = 50) {
  const nq = comboNorm(q.trim());
  if (!nq) return list.slice(0, max);
  const starts = [], holds = [];
  for (const o of list) {
    const ws = [o.label, o.value, o.keys].filter(Boolean).map(comboNorm);
    if (ws.some(w => w.startsWith(nq) || w.split(/[\s,·/-]+/).some(x => x.startsWith(nq)))) starts.push(o);
    else if (ws.some(w => w.includes(nq))) holds.push(o);
  }
  return [...starts, ...holds].slice(0, max);
}
const optionsOf = dl => [...(dl?.options || [])].map(o => ({ value: o.value, label: o.textContent.trim() || o.value, desc: o.dataset.desc, icon: o.dataset.icon, sw: o.dataset.sw, group: o.dataset.group, keys: o.dataset.keys, disabled: o.disabled }));

/** the listbox under a field: shown, moved through, chosen from (m-combobox, m-tags and the date field's cousins use it) */
class ComboPop {
  constructor(input, anchor, host) {
    this.input = input; this.anchor = anchor; this.host = host; this.list = []; this.act = -1; this.isOpen = false;
    this.menu = h('div', { class: 'menu combo-menu', role: 'listbox', id: uid('m-combo'), popover: 'manual', tabindex: '-1' });
    const lab = input.labels?.[0];
    if (lab) this.menu.setAttribute('aria-labelledby', ensureId(lab, 'lbl')); else if (input.getAttribute('aria-label')) this.menu.setAttribute('aria-label', input.getAttribute('aria-label'));
    if (host.closest('.compact')) this.menu.classList.add('compact');
    host.append(this.menu);
    for (const [k, v] of Object.entries({ role: 'combobox', 'aria-autocomplete': 'list', 'aria-expanded': 'false', 'aria-controls': this.menu.id, autocomplete: 'off' })) input.setAttribute(k, v);
    this.menu.addEventListener('pointerdown', e => e.preventDefault());   // the focus stays in the field
    this.menu.addEventListener('click', e => { const o = e.target.closest('[role=option]'); if (o && o.getAttribute('aria-disabled') !== 'true') this.choose(+o.dataset.i); });
    this.menu.addEventListener('pointermove', e => { const o = e.target.closest('[role=option]'); if (o && +o.dataset.i !== this.act) this.mark(+o.dataset.i, false); });
  }
  contains(t) { return this.anchor.contains(t) || this.menu.contains(t) || this.host.contains(t); }
  show(list, q = '', { empty } = {}) {
    this.list = list;
    if (!list.length && !empty) { this.close(); return; }
    let html = '', group = null;
    list.forEach((o, i) => {
      if (o.group && o.group !== group) { group = o.group; html += `<div class="group" role="presentation">${esc(group)}</div>`; }
      html += `<div role="option" id="${this.menu.id}-${i}" data-i="${i}" aria-selected="false"${o.disabled ? ' aria-disabled="true"' : ''}>${o.icon ? ms(o.icon) : ''}${o.sw ? `<i class="sw" style="background:${esc(o.sw)}"></i>` : ''}<span class="txt"><span>${comboMark(o.label, o.raw ? '' : q)}</span>${o.desc ? `<small>${esc(o.desc)}</small>` : ''}</span></div>`;
    });
    this.menu.innerHTML = list.length ? html : `<div class="combo-empty" role="presentation">${esc(empty)}</div>`;
    if (!this.isOpen) { opened(this); this.isOpen = true; showPop(this.menu); this.input.setAttribute('aria-expanded', 'true'); }
    this.act = -1; this.input.removeAttribute('aria-activedescendant');
    this.reposition();
  }
  reposition() { if (this.isOpen) place(this.menu, this.anchor, { match: true }); }
  close() {
    if (!this.isOpen) return;
    this.isOpen = false; released(this); hidePop(this.menu); this.act = -1;
    this.input.setAttribute('aria-expanded', 'false'); this.input.removeAttribute('aria-activedescendant');
  }
  mark(i, scroll = true) {
    const els = $$('[role=option]', this.menu); if (!els.length) return;
    this.act = (i + els.length) % els.length;
    els.forEach((el, k) => { el.classList.toggle('act', k === this.act); el.setAttribute('aria-selected', String(k === this.act)); });
    this.input.setAttribute('aria-activedescendant', els[this.act].id);
    if (scroll) els[this.act].scrollIntoView({ block: 'nearest' });
  }
  move(d) { if (this.list.length) this.mark(this.act < 0 ? (d > 0 ? 0 : this.list.length - 1) : this.act + d); }
  choose(i) { const o = this.list[i]; if (!o || o.disabled) return; this.close(); this.host.picked(o); }
}

class MCombobox extends HTMLElement {
  connectedCallback() {
    if (this.pop || !(this.input = this.querySelector('input'))) return;
    const inp = this.input;
    this.dl = inp.list || this.querySelector('datalist');
    inp.removeAttribute('list');   // our list, not the browser's
    this.pop = new ComboPop(inp, inp.closest('.field') || inp, this);
    this.max = +(this.getAttribute('max') || 50);
    inp.addEventListener('input', () => { if (this.quiet) return; this.filter(); if (this.hasAttribute('strict') && inp.validationMessage && this.valid()) inp.setCustomValidity(''); });
    inp.addEventListener('keydown', e => this.key(e));
    inp.addEventListener('focus', () => { if (!inp.value && (this.recent().length || this.hasAttribute('open-empty'))) this.filter(); });
    inp.addEventListener('blur', () => { this.pop.close(); this.check(); });
    inp.form?.addEventListener('submit', () => this.remember(inp.value));
    this.querySelector('[data-open-list]')?.addEventListener('click', () => { if (this.pop.isOpen) this.pop.close(); else this.filter(true); inp.focus(); });
    if (this.dl) new MutationObserver(() => { if (this.pop.isOpen) this.filter(); }).observe(this.dl, { childList: true, subtree: true, attributes: true, characterData: true });
    this.check();
  }
  get value() { return this.input?.value; }
  set value(v) { if (this.input) { this.input.value = v; this.check(); } }
  options() { return optionsOf(this.dl); }
  recent() { const k = this.getAttribute('recent'); if (!k) return []; try { return JSON.parse(localStorage.getItem('m.recent.' + k) || '[]'); } catch { return []; } }
  remember(v) {
    const k = this.getAttribute('recent'); v = (v || '').trim(); if (!k || !v) return;
    try { localStorage.setItem('m.recent.' + k, JSON.stringify([v, ...this.recent().filter(x => x !== v)].slice(0, 5))); } catch {}
  }
  filter(all = false) {
    const q = all ? '' : this.input.value;
    let list = comboMatch(this.options(), q, this.max);
    if (!q.trim() && !all) {
      const r = this.recent();
      if (r.length) list = [...r.map(v => ({ value: v, label: v, icon: 'history', group: 'Recent', raw: true })), { value: '', label: 'Forget these', icon: 'delete_sweep', group: 'Recent', raw: true, forget: true }];
      else if (!this.hasAttribute('open-empty')) { this.pop.close(); return; }
    }
    this.pop.show(list, q.trim(), { empty: this.getAttribute('empty') || 'Nothing by that name' });
  }
  picked(o) {
    if (o.forget) { try { localStorage.removeItem('m.recent.' + this.getAttribute('recent')); } catch {} this.input.focus(); return; }
    this.quiet = true; this.input.value = o.value; fire(this.input); this.quiet = false;
    this.remember(o.value); this.check();
    emit(this, 'pick', { value: o.value, label: o.label, option: o });
    this.input.focus();
  }
  key(e) {
    const p = this.pop;
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!p.isOpen) { this.filter(!this.input.value); if (!e.altKey) p.move(1); } else p.move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (e.altKey) p.close(); else { if (!p.isOpen) this.filter(!this.input.value); p.move(-1); } }
    else if (e.key === 'Enter') { if (p.isOpen && p.act >= 0) { e.preventDefault(); p.choose(p.act); } }
    else if (e.key === 'Escape') { if (p.isOpen) { e.preventDefault(); p.close(); } else if (this.input.value) { e.preventDefault(); this.input.value = ''; fire(this.input); this.check(); } }
    else if (e.key === 'Tab') p.close();
  }
  valid() { const v = comboNorm(this.input.value.trim()); return !v || this.options().some(o => comboNorm(o.value) === v || comboNorm(o.label) === v); }
  check() { if (this.hasAttribute('strict')) this.input.setCustomValidity(this.valid() ? '' : this.getAttribute('invalid') || 'Choose one from the list'); }
}
customElements.define('m-combobox', MCombobox);

// ── m/src/components/inputs/tags/tags.js
/* ════════ m-tags: an input of words with commas between (what a form sends without the script), drawn as chips you
      type among. Enter or a comma makes a chip, as does pasting a list; Backspace in the empty field goes to the last
      chip and again removes it; ← → walk the chips. A <datalist> suggests; strict: only those; max: how many.
      The words go to the form in a hidden input with the field's name, joined by ", ". Says change with { values }. ════════ */
class MTags extends HTMLElement {
  connectedCallback() {
    if (this.box || !(this.input = this.querySelector('input'))) return;
    const inp = this.input;
    this.dl = inp.list || this.querySelector('datalist'); inp.removeAttribute('list');
    this.box = inp.closest('.field') || inp.parentElement; this.box.classList.add('tags-field');
    const first = inp.value.split(',').map(s => s.trim()).filter(Boolean);
    this.out = h('input', { type: 'hidden', name: inp.getAttribute('name'), value: first.join(', ') });
    inp.removeAttribute('name'); inp.value = ''; inp.defaultValue = '';
    this.live = h('span', { class: 'vh', 'aria-live': 'polite' });
    this.append(this.out, this.live);
    this.values = [];
    first.forEach(v => this.add(v, true));
    this.pop = new ComboPop(inp, this.box, this);
    inp.addEventListener('input', () => { if (/[,\n]/.test(inp.value)) this.commit(); else this.suggest(); });
    inp.addEventListener('keydown', e => this.key(e));
    inp.addEventListener('blur', () => { this.pop.close(); if (inp.value.trim() && !this.hasAttribute('strict')) this.commit(); });
    inp.addEventListener('paste', e => { const t = e.clipboardData?.getData('text') || ''; if (/[,\n]/.test(t)) { e.preventDefault(); t.split(/[,\n]/).forEach(v => this.add(v)); this.changed(); } });
    this.box.addEventListener('click', e => {
      const x = e.target.closest('.tags-chip > .x');
      if (x) { this.remove(x.parentElement); inp.focus(); } else if (e.target === this.box) inp.focus();
    });
    this.box.addEventListener('keydown', e => { if (e.target.matches('.tags-chip > .x')) this.chipKey(e); });
    inp.form?.addEventListener('reset', () => setTimeout(() => this.redraw(this.out.value.split(','))));
  }
  get value() { return [...this.values]; }
  set value(vs) { this.redraw(Array.isArray(vs) ? vs : String(vs).split(',')); }
  redraw(vs) { $$('.tags-chip', this.box).forEach(c => c.remove()); this.values = []; vs.forEach(v => this.add(v, true)); this.out.value = this.values.join(', '); }
  options() { return [...(this.dl?.options || [])].map(o => ({ value: o.value, label: o.textContent.trim() || o.value, desc: o.dataset.desc, icon: o.dataset.icon, keys: o.dataset.keys })); }
  has(v) { return this.values.some(x => x.toLowerCase() === v.toLowerCase()); }
  say(t) { this.live.textContent = t; }
  add(v, quiet) {
    v = String(v).trim(); if (!v || this.has(v)) return false;
    const max = +this.getAttribute('max') || Infinity, o = this.options().find(x => x.value.toLowerCase() === v.toLowerCase());
    if (this.values.length >= max) { this.say(`${max} at most`); return false; }
    if (this.hasAttribute('strict') && !o) { this.say(`${v}: not one of the choices`); return false; }
    if (o) v = o.value;   // the option's own spelling
    this.values.push(v);
    this.input.before(h('span', { class: 'chip tags-chip', 'data-size': 'sm', 'data-v': v }, `<span>${esc(v)}</span><button type="button" class="x" aria-label="Remove ${esc(v)}">${ms('close')}</button>`));
    this.out.value = this.values.join(', ');
    if (!quiet) this.say(`${v} added`);
    return true;
  }
  remove(chip) {
    this.values = this.values.filter(x => x !== chip.dataset.v);
    chip.remove(); this.out.value = this.values.join(', ');
    this.say(`${chip.dataset.v} removed`); this.changed();
  }
  commit() { this.input.value.split(/[,\n]/).forEach(v => this.add(v)); this.input.value = ''; this.pop.close(); this.changed(); }
  changed() { emit(this, 'change', { values: [...this.values] }); }
  suggest(all = false) {
    if (!this.dl) return;
    const q = this.input.value;
    if (!q.trim() && !all) { this.pop.close(); return; }
    this.pop.show(comboMatch(this.options().filter(o => !this.has(o.value)), q, 8), q.trim(), this.hasAttribute('strict') ? { empty: 'None of the choices' } : {});
  }
  picked(o) { this.add(o.value); this.input.value = ''; this.changed(); this.input.focus(); }
  chips() { return $$('.tags-chip > .x', this.box); }
  key(e) {
    const p = this.pop, inp = this.input, atStart = inp.selectionStart === 0 && inp.selectionEnd === 0;
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!p.isOpen) this.suggest(true); p.move(1); }
    else if (e.key === 'ArrowUp' && p.isOpen) { e.preventDefault(); p.move(-1); }
    else if (e.key === 'Enter') { if (p.isOpen && p.act >= 0) { e.preventDefault(); p.choose(p.act); } else if (inp.value.trim()) { e.preventDefault(); this.commit(); } }
    else if (e.key === 'Escape' && p.isOpen) { e.preventDefault(); p.close(); }
    else if ((e.key === 'Backspace' || e.key === 'ArrowLeft') && atStart && this.values.length) { e.preventDefault(); p.close(); this.chips().at(-1).focus(); }
  }
  chipKey(e) {
    const xs = this.chips(), i = xs.indexOf(e.target);
    if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); this.remove(e.target.parentElement); const rest = this.chips(); (rest[e.key === 'Backspace' ? i - 1 : i] || this.input).focus(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); (xs[i - 1] || xs[0]).focus(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); (xs[i + 1] || this.input).focus(); }
    else if (e.key === 'End') { e.preventDefault(); this.input.focus(); }
  }
}
customElements.define('m-tags', MTags);

// ── m/src/components/inputs/search/search.js
// a [data-clear] button in a field shows once there are words, and takes them away
enhance('.field [data-clear]', once(b => {
  const inp = b.closest('.field').querySelector('input, textarea'); if (!inp) return;
  b.type = 'button';
  if (!b.hasAttribute('aria-label')) b.setAttribute('aria-label', 'Clear');
  const sync = () => (b.hidden = !inp.value);
  sync();
  inp.addEventListener('input', sync);
  inp.form?.addEventListener('reset', () => setTimeout(sync));
  b.addEventListener('click', () => { inp.value = ''; fire(inp); sync(); inp.focus(); });
}));
// / goes to the search (the first visible field with data-key="/"), unless you are typing somewhere already
doc.addEventListener('keydown', e => {
  if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
  if (e.target.closest?.('input, textarea, select, [contenteditable], [role=textbox], [role=combobox]')) return;
  // only a field that can take the focus (not one in an inert drawer), and the key is kept from the page only if it did
  const f = $$('[data-key="/"]').find(x => x.offsetParent !== null && !x.disabled && !x.closest('[inert]'));
  if (!f) return;
  f.focus();
  if (doc.activeElement === f) { e.preventDefault(); f.select?.(); }
});

// ── m/src/components/inputs/otp/otp.js
/* ════════ m-otp: around one <input> with its name, aria-label and maxlength (6 if not). The boxes are drawn from it;
      digits only (data-chars="any" for letters too); the caret stays at the end, so a code is typed, pasted or taken
      from the phone's suggestion (autocomplete="one-time-code") in one go. group="3": a dash after every third box.
      Says complete with { value } once every box is full; data-submit sends its form then. ════════ */
class MOtp extends HTMLElement {
  connectedCallback() {
    if (this.box || !(this.input = this.querySelector('input'))) return;
    const inp = this.input, n = this.n = inp.maxLength > 0 ? inp.maxLength : 6, g = +(this.getAttribute('group') || 0);
    inp.maxLength = n; inp.spellcheck = false; inp.autocapitalize = 'off';
    if (!inp.autocomplete) inp.autocomplete = 'one-time-code';
    if (this.dataset.chars !== 'any') { inp.inputMode = 'numeric'; if (!inp.pattern) inp.pattern = `\\d{${n}}`; }
    this.box = h('div', { class: 'otp' });
    this.cells = [];
    for (let i = 0; i < n; i++) { if (g && i && i % g === 0) this.box.append(h('i', { class: 'otp-gap', 'aria-hidden': 'true' })); const c = h('span', { class: 'otp-cell', 'aria-hidden': 'true' }); this.cells.push(c); this.box.append(c); }
    inp.replaceWith(this.box); this.box.append(inp);
    const end = () => { const l = inp.value.length; if (inp.selectionStart !== l || inp.selectionEnd !== l) inp.setSelectionRange(l, l); };
    inp.addEventListener('input', () => {
      const v = this.dataset.chars === 'any' ? inp.value.replace(/\s/g, '').toUpperCase() : inp.value.replace(/\D/g, '');
      if (v !== inp.value) inp.value = v.slice(0, n);
      this.draw();
      if (inp.value.length === n) { emit(this, 'complete', { value: inp.value }); if (this.hasAttribute('data-submit')) inp.form?.requestSubmit(); }
    });
    for (const ev of ['focus', 'click', 'keyup', 'select']) inp.addEventListener(ev, () => { requestAnimationFrame(end); this.draw(); });
    inp.addEventListener('blur', () => this.draw());
    inp.form?.addEventListener('reset', () => setTimeout(() => this.draw()));
    this.draw();
  }
  get value() { return this.input?.value || ''; }
  set value(v) { this.input.value = String(v).slice(0, this.n); this.draw(); }
  draw() { const v = this.input.value; this.cells.forEach((c, i) => { c.textContent = v[i] || ''; c.toggleAttribute('data-on', i === Math.min(v.length, this.n - 1)); }); }
}
customElements.define('m-otp', MOtp);

// ── m/src/components/inputs/password/password.js
/* ════════ .field.password around an <input type="password">: an eye to show it and hide it again; data-meter on the
      field adds four marks and a word for how guessable it is (passwordScore, 0 to 4, a rough guide, exported); and
      the line under it says when Caps Lock is on. data-variant="rules": the ul.password-rules the page writes after
      the field, each li[data-rule] ticked as it's met, as you type: length (the input's minlength, else 8), common
      (not one of the usual passwords), unlike:#field (not that field's words, an email's name), or /a pattern/. ════════ */
const PASSWORD_SAYS = ['Too short: 8 or more', 'Easy to guess', 'Fair', 'Good', 'Strong'];
const PASSWORD_USUAL = /(password|passw0rd|1234|qwerty|letmein|admin|abc123|iloveyou|welcome)/i;
/** how hard a password is to guess, 0 to 4: length most of all, then its kinds of character; the usual ones score low */
function passwordScore(s) {
  if (!s) return 0;
  let n = 0;
  if (s.length >= 8) n++; if (s.length >= 12) n++; if (s.length >= 16) n++;
  if ([/[a-z]/, /[A-Z]/, /\d/, /[^\w\s]/].filter(r => r.test(s)).length >= 3) n++;
  if (/^(.)\1+$/.test(s) || PASSWORD_USUAL.test(s)) n = Math.min(n, 1);
  return s.length < 8 ? 0 : Math.max(1, Math.min(4, n));
}
enhance('.field.password', once(field => {
  const inp = field.querySelector('input[type=password]'); if (!inp) return;
  const eye = h('button', { type: 'button', class: 'ib toggle quiet', 'aria-pressed': 'false', 'aria-label': 'Show the password', 'data-tip': 'Show it', 'data-manual': '', 'aria-controls': inp.id || null },
    ms('visibility').replace('class="ms"', 'class="ms off"') + ms('visibility_off').replace('class="ms"', 'class="ms on"'));
  field.append(eye);
  eye.addEventListener('click', () => {
    const on = inp.type === 'password';
    inp.type = on ? 'text' : 'password'; eye.setAttribute('aria-pressed', String(on)); eye.dataset.tip = on ? 'Hide it' : 'Show it';
    inp.focus({ preventScroll: true }); const l = inp.value.length; inp.setSelectionRange(l, l);
  });
  inp.form?.addEventListener('submit', () => { inp.type = 'password'; eye.setAttribute('aria-pressed', 'false'); });
  const say = h('div', { class: 'password-say' }, `<span class="password-word" aria-live="polite"></span><span class="password-caps" hidden>Caps Lock is on</span>`);
  let meter = null;
  if (field.hasAttribute('data-meter')) { meter = h('div', { class: 'password-meter', 'aria-hidden': 'true' }, '<i></i><i></i><i></i><i></i>'); field.after(meter); meter.after(say); }
  else field.after(say);
  const word = say.querySelector('.password-word'), caps = say.querySelector('.password-caps');
  if (!say.id) say.id = uid('m-password-say');
  inp.setAttribute('aria-describedby', [inp.getAttribute('aria-describedby'), say.id].filter(Boolean).join(' '));
  let t = 0;
  const rate = () => {
    if (!meter) return;
    const s = passwordScore(inp.value);
    meter.dataset.score = s; say.dataset.score = s;
    clearTimeout(t); t = setTimeout(() => { word.innerHTML = inp.value ? `<b>${PASSWORD_SAYS[s]}</b>` : ''; }, 300);   // said once you pause, not at every key
  };
  inp.addEventListener('input', rate);
  // the rules: each met or not yet, ticked as you type and said with the field's description
  const list = field.dataset.variant === 'rules' ? field.parentElement.querySelector(':scope > .password-rules') : null;
  const met = (rule, v) => rule === 'length' ? v.length >= (inp.minLength > 0 ? inp.minLength : 8)
    : rule === 'common' ? !!v && !/^(.)\1+$/.test(v) && !PASSWORD_USUAL.test(v)
    : rule.startsWith('unlike:') ? !!v && !(who => who.split('@')[0].toLowerCase().split(/[^\p{L}\p{N}]+/u).some(w => w.length > 2 && v.toLowerCase().includes(w)))(document.querySelector(rule.slice(7))?.value || '')
    : (m => !!m && new RegExp(m[1], m[2]).test(v))(rule.match(/^\/(.+)\/(\w*)$/));
  if (list) {
    list.id ||= uid('m-password-rules');
    inp.setAttribute('aria-describedby', [inp.getAttribute('aria-describedby'), list.id].filter(Boolean).join(' '));
    for (const li of list.querySelectorAll(':scope > li[data-rule]')) li.append(h('span', { class: 'vh' }));
  }
  let tr = 0;
  const check = () => {
    if (!list) return;
    let all = true;
    for (const li of list.querySelectorAll(':scope > li[data-rule]')) { const ok = met(li.dataset.rule, inp.value); li.toggleAttribute('data-met', ok); li.lastChild.textContent = ok ? ': met' : ': not yet'; all &&= ok; }
    if (!meter) { clearTimeout(tr); tr = setTimeout(() => { word.textContent = inp.value && all ? 'Every rule is met' : ''; }, 300); }
  };
  inp.addEventListener('input', check); inp.addEventListener('focus', check);
  const capsLock = e => { if (e.getModifierState) caps.hidden = !e.getModifierState('CapsLock'); };
  inp.addEventListener('keydown', capsLock); inp.addEventListener('keyup', capsLock);
  inp.addEventListener('blur', () => (caps.hidden = true));
  rate(); check();
}));

// ── m/src/components/inputs/textarea/textarea.js
// data-grow: as tall as the words (field-sizing in CSS; a line of script where the browser hasn't got it yet).
// maxlength: a count in the corner, and a polite word as the end comes near ("20 left", "None left").
const TEXTAREA_SIZES = CSS.supports?.('field-sizing', 'content');
enhance('.field.area > textarea', once(t => {
  if (t.hasAttribute('data-grow') && !TEXTAREA_SIZES) {
    const fit = () => { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight + 2, innerHeight * .6) + 'px'; };
    t.addEventListener('input', fit); requestAnimationFrame(fit);
  }
  const max = t.maxLength; if (!(max > 0)) return;
  const count = h('span', { class: 'textarea-count', 'aria-hidden': 'true' }), live = h('span', { class: 'vh', 'aria-live': 'polite' });
  t.after(count, live);
  let said = '';
  const sync = () => {
    const n = t.value.length, left = max - n, near = left <= Math.max(10, max * .1);
    count.textContent = `${n} / ${max}`;
    count.toggleAttribute('data-near', near && left > 0); count.toggleAttribute('data-full', left <= 0);
    const word = left <= 0 ? 'None left' : near ? `${left} left` : '';
    if (word !== said && (word === '' || left <= 0 || left % 10 === 0 || !said)) { said = word; live.textContent = word; }
  };
  t.addEventListener('input', sync); t.form?.addEventListener('reset', () => setTimeout(sync));
  sync();
}));

// ── m/src/components/inputs/switch/switch.js
// a checkbox drawn as a switch is announced as a switch (its checked state carries over)
enhance('input.switch', once(el => { if (!el.hasAttribute('role')) el.setAttribute('role', 'switch'); }));

// ── m/src/components/inputs/range/range.js
/* ════════ m-range: two range inputs (the lower first) that share one track. The handles never cross (data-gap: the
      least steps between them); a press on the track brings the nearer one there. data-hist="3 8 13 …": how many
      things lie under each stretch, drawn behind. A .range-out (inside, or in its .slider-row) reads "200 – 3200",
      each end as its input's data-format or data-labels say. Says the inputs' own input and change. ════════ */
class MRange extends HTMLElement {
  connectedCallback() {
    const [a, b] = this.querySelectorAll(':scope > input[type=range]');
    if (this.lo || !a || !b) return;
    this.lo = a; this.hi = b;
    this.min = +a.min || 0; this.max = +(a.max || 100); this.step = +a.step || 1;
    this.gap = (+this.dataset.gap || 0) * this.step;
    this.rail = h('div', { class: 'range-rail', 'aria-hidden': 'true' }, '<i class="range-fill"></i>');
    this.prepend(this.rail);
    if (this.dataset.hist) {
      const vs = this.dataset.hist.split(/[\s,]+/).map(Number), top = Math.max(...vs) || 1;
      this.hist = h('div', { class: 'range-hist', 'aria-hidden': 'true' }, vs.map(v => `<i style="--v:${(v / top).toFixed(3)}"></i>`).join(''));
      this.prepend(this.hist);
    }
    this.out = this.querySelector('.range-out') || this.closest('.slider-row')?.querySelector('.range-out');
    for (const inp of [a, b]) {
      inp.addEventListener('input', () => this.keep(inp));
      inp.addEventListener('pointerdown', () => this.raise(inp));
      inp.addEventListener('focus', () => this.raise(inp));
    }
    this.addEventListener('pointerdown', e => this.track(e));
    a.form?.addEventListener('reset', () => setTimeout(() => this.draw()));
    this.draw();
  }
  get value() { return [+this.lo.value, +this.hi.value]; }
  set value([x, y]) { this.lo.value = x; this.hi.value = y; this.draw(); }
  raise(inp) { this.lo.style.zIndex = inp === this.lo ? 2 : 1; this.hi.style.zIndex = inp === this.hi ? 2 : 1; }
  keep(inp) {
    if (inp === this.lo && +this.lo.value > +this.hi.value - this.gap) this.lo.value = +this.hi.value - this.gap;
    if (inp === this.hi && +this.hi.value < +this.lo.value + this.gap) this.hi.value = +this.lo.value + this.gap;
    this.draw();
  }
  draw() {
    const span = this.max - this.min || 1, f1 = (+this.lo.value - this.min) / span, f2 = (+this.hi.value - this.min) / span;
    this.style.setProperty('--f1', f1); this.style.setProperty('--f2', f2);
    for (const inp of [this.lo, this.hi]) inp.setAttribute('aria-valuetext', fmtValue(inp));
    if (this.hist) { const bars = [...this.hist.children], n = bars.length; bars.forEach((el, i) => el.classList.toggle('in', (i + 1) / n > f1 + 1e-9 && i / n < f2 - 1e-9)); }
    if (this.out) this.out.textContent = `${fmtValue(this.lo)} – ${fmtValue(this.hi)}`;
  }
  // a press on the track (not on a handle) brings the nearer handle there
  track(e) {
    if (e.button > 0 || e.target.matches('input') || this.lo.disabled) return;
    e.preventDefault();   // (keeps the focus where it goes below: the browser's own press would take it to the page)
    const r = this.lo.getBoundingClientRect(), tw = parseFloat(getComputedStyle(this).getPropertyValue('--tw')) || 5;
    const f = clamp((e.clientX - r.left - tw / 2) / (r.width - tw));
    const v = clamp(Math.round(f * (this.max - this.min) / this.step) * this.step + this.min, this.min, this.max);
    const dl = Math.abs(v - this.lo.value), dh = Math.abs(v - this.hi.value);
    const inp = dl < dh || (dl === dh && v < +this.lo.value) ? this.lo : this.hi;
    if (+inp.value !== v) { inp.value = v; this.keep(inp); fire(inp); }
    this.raise(inp); inp.focus();
  }
}
customElements.define('m-range', MRange);

// ── m/src/components/inputs/dial/dial.js
/* ════════ m-dial: the app's Dial. Wrap a range input: <m-dial><input type="range" …></m-dial>.
      data-tick: px per step (16); data-major: a major tick every N steps (5); data-labels: words for the majors,
      comma separated; data-format: "{v} s" for the rest; data-reset: where a double press returns it (0 when 0 is in
      range); data-mark: a dot over one value (level, at 0); data-label-every: a word on every Nth major only.
      A sideways swipe on a trackpad turns it too; an up-and-down one still scrolls the page. ════════ */
class MDial extends HTMLElement {
  connectedCallback() {
    if (this.inp || !(this.inp = this.querySelector('input[type=range]'))) return;
    const inp = this.inp;
    this.min = +inp.min || 0; this.max = +(inp.max || 100); this.step = +inp.step || 1;
    const steps = Math.round((this.max - this.min) / this.step);
    this.ppu = (+this.dataset.tick || (steps > 60 ? 8 : 16)) / this.step;
    const major = +this.dataset.major || (steps <= 12 ? 1 : 5);
    const labels = this.dataset.labels?.split(',');
    const W = (this.max - this.min) * this.ppu;
    const every = +this.dataset.labelEvery || 1;
    let svg = `<svg class="dial-ticks" width="${W + 40}" height="52" viewBox="-20 0 ${W + 40} 52" aria-hidden="true">`;
    if (this.dataset.mark != null) svg += `<circle class="dial-mark" cx="${((+this.dataset.mark - this.min) * this.ppu).toFixed(2)}" cy="3.5" r="2"/>`;
    for (let k = 0, m = 0; k <= steps; k++) {
      const x = (k * this.step * this.ppu).toFixed(2), isMajor = k % major === 0;
      if (isMajor) {
        svg += `<rect x="${x - 1}" y="8" width="2" height="16" rx="1"/>`;
        const v = +(this.min + k * this.step).toFixed(6), lab = labels ? labels[m] : m % every === 0 ? fmtValue(inp, v) : '';
        if (lab) svg += `<text x="${x}" y="40" text-anchor="middle">${esc(lab)}</text>`;
        m++;
      } else svg += `<rect x="${x - .75}" y="11.5" width="1.5" height="9" rx=".75" opacity=".75"/>`;
    }
    this.insertAdjacentHTML('afterbegin', `<div class="dial-scale">${svg}</svg></div><i class="dial-ind" aria-hidden="true"></i>`);
    this.scale = this.querySelector('svg');
    // no label is cut by the pill's ends: each fades out before it reaches them, as the app's Dial does
    this.words = [...this.scale.querySelectorAll('text')].map(t => [t, +t.getAttribute('x')]);
    this.W = this.clientWidth;
    new ResizeObserver(() => { this.W = this.clientWidth; this.place(+inp.value); }).observe(this);
    this.place(+inp.value);
    inp.addEventListener('input', () => { if (!this.drag) this.place(+inp.value); });
    this.addEventListener('pointerdown', e => this.down(e));
    this.addEventListener('pointermove', e => this.move(e));
    this.addEventListener('pointerup', e => this.up(e));
    this.addEventListener('pointercancel', e => this.up(e));
    this.addEventListener('dblclick', () => { const r = this.dataset.reset ?? (this.min <= 0 && this.max >= 0 ? 0 : null); if (r != null && !inp.disabled) { this.set(+r); this.place(+inp.value); } });
    let acc = 0, idle = 0;
    this.addEventListener('wheel', e => {
      if (inp.disabled || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
      e.preventDefault();
      acc += e.deltaX; clearTimeout(idle); idle = setTimeout(() => (acc = 0), 200);
      const steps = Math.trunc(acc / (this.step * this.ppu));
      if (steps) { acc -= steps * this.step * this.ppu; this.set(+inp.value + steps * this.step); this.place(+inp.value); }
    }, { passive: false });
  }
  place(v) {
    const off = (v - this.min) * this.ppu;
    this.scale.style.transform = `translateX(${(-20 - off).toFixed(2)}px)`;
    for (const [t, x0] of this.words) { const x = this.W / 2 + x0 - off; t.style.opacity = (clamp((x - 18) / 26) * clamp((this.W - 18 - x) / 26)).toFixed(2); }
  }
  snap(v) { return clamp(Math.round((v - this.min) / this.step) * this.step + this.min, this.min, this.max); }
  set(v) { v = +this.snap(v).toFixed(6); if (+this.inp.value !== v) { this.inp.value = v; fire(this.inp); } }
  down(e) {
    if (this.inp.disabled || e.button > 0) return;
    e.preventDefault();   // (keeps the focus on the range input: the browser's own mousedown would take it to the page)
    this.setPointerCapture(e.pointerId); this.dataset.turning = '';
    this.inp.focus({ preventScroll: true });
    this.drag = { x0: e.clientX, v0: +this.inp.value, moved: false };
  }
  move(e) {
    const d = this.drag; if (!d) return;
    const dx = e.clientX - d.x0; if (!d.moved && Math.abs(dx) <= 3) return;
    d.moved = true;
    const v = clamp(d.v0 - dx / this.ppu, this.min, this.max);   // under the finger between detents
    this.place(v); this.set(v);
  }
  up(e) {
    const d = this.drag; if (!d) return;
    delete this.dataset.turning; this.drag = null;
    if (!d.moved && e.type === 'pointerup') { const r = this.getBoundingClientRect(); this.set(d.v0 + (e.clientX - (r.left + r.width / 2)) / this.ppu); }
    this.place(+this.inp.value);
  }
}
customElements.define('m-dial', MDial);

// ── m/src/components/inputs/stepper/stepper.js
/* ════════ m-stepper: − and + around a number input. Hold either to keep going (after 400 ms, then faster);
      Page Up and Page Down in the field step by ten. ════════ */
class MStepper extends HTMLElement {
  connectedCallback() {
    if (this.inp || !(this.inp = this.querySelector('input'))) return;
    const inp = this.inp, name = inp.getAttribute('aria-label') || doc.querySelector(`label[for="${inp.id}"]`)?.textContent.trim() || '';
    inp.type = 'number'; inp.inputMode = 'numeric';
    this.dn = h('button', { type: 'button', 'aria-label': `Fewer${name ? ' ' + name.toLowerCase() : ''}` }, ms('remove'));
    this.up = h('button', { type: 'button', 'aria-label': `More${name ? ' ' + name.toLowerCase() : ''}` }, ms('add'));
    this.prepend(this.dn); this.append(this.up);
    const bump = d => { const s = +inp.step || 1, v = clamp((+inp.value || 0) + d * s, inp.min === '' ? -Infinity : +inp.min, inp.max === '' ? Infinity : +inp.max); if (v !== +inp.value) { inp.value = v; fire(inp); } this.sync(); return v; };
    let t = 0;
    const stop = () => clearTimeout(t);
    for (const [b, d] of [[this.dn, -1], [this.up, 1]]) {
      b.addEventListener('click', e => { if (e.detail === 0) bump(d); });   // the keyboard's press; a pointer's is below
      b.addEventListener('pointerdown', e => {
        if (e.button > 0 || b.disabled) return;
        bump(d);
        let wait = 400;
        const again = () => { if (b.disabled) return; bump(d); wait = Math.max(50, wait * .78); t = setTimeout(again, wait); };
        t = setTimeout(again, wait);
      });
      for (const ev of ['pointerup', 'pointerleave', 'pointercancel', 'blur']) b.addEventListener(ev, stop);
    }
    inp.addEventListener('keydown', e => { if (e.key === 'PageUp' || e.key === 'PageDown') { e.preventDefault(); bump(e.key === 'PageUp' ? 10 : -10); } });
    inp.addEventListener('input', () => this.sync());
    this.sync();
  }
  sync() { const v = +this.inp.value; this.dn.disabled = this.inp.min !== '' && v <= +this.inp.min; this.up.disabled = this.inp.max !== '' && v >= +this.inp.max; }
}
customElements.define('m-stepper', MStepper);

// ── m/src/components/inputs/calendar/calendar.js
/* ════════ m-calendar: mode="single|range", months="1|2", min="today|YYYY-MM-DD", max, value / start + end,
      closed="0 1" (weekdays that cannot be chosen; 0 is Sunday), name (hidden inputs for a form), locale,
      notes='{"2026-11-12": "£180"}' (a line under a day: a price, a note; or the notes property); today="2026-11-04"
      (the day it takes for today: its ring, min="today" and where it opens; for a page that pins its date).
      .value reads and sets the date (ISO), or { start, end } in range mode; focusDate() puts the keys on the grid ════════ */
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const day0 = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const parse = (s, today = day0(new Date())) => { if (!s) return null; if (s === 'today') return today; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
class MCalendar extends HTMLElement {
  static observedAttributes = ['disabled-dates', 'min', 'max', 'closed', 'notes', 'today'];
  attributeChangedCallback(name) {
    if (!this.built) return;
    const was = this.now; this.read();
    // a new today, with nothing chosen yet: the calendar goes to it
    if (name === 'today' && !this.start && +was !== +this.now) { const from = this.min && this.min > this.now ? this.min : this.now; this.view = new Date(from.getFullYear(), from.getMonth(), 1); this.focusDay = from; }
    this.render();
  }
  read() {
    this.now = parse(this.getAttribute('today')) || day0(new Date());
    this.min = parse(this.getAttribute('min'), this.now); this.max = parse(this.getAttribute('max'), this.now);
    this.closed = (this.getAttribute('closed') || '').split(/[\s,]+/).filter(Boolean).map(Number);
    // single days that cannot be chosen (booked, a holiday): disabled-dates="2026-11-12 2026-11-13"
    this.off = new Set((this.getAttribute('disabled-dates') || '').split(/[\s,]+/).filter(Boolean));
    if (this.hasAttribute('notes')) try { this._notes = JSON.parse(this.getAttribute('notes')); } catch { this._notes = {}; }
  }
  get notes() { return this._notes || {}; }
  set notes(v) { this._notes = v || {}; if (this.built) this.render(); }
  get value() { return this.mode === 'range' ? { start: this.start ? iso(this.start) : '', end: this.end ? iso(this.end) : '' } : (this.start ? iso(this.start) : ''); }
  set value(v) {
    const [a, b] = typeof v === 'object' && v ? [v.start, v.end] : String(v || '').split('/');
    if (!this.built) { if (a) this.setAttribute(this.getAttribute('mode') === 'range' ? 'start' : 'value', a); if (b) this.setAttribute('end', b); return; }
    this.start = parse(a) || null; this.end = this.mode === 'range' ? parse(b) || null : null;
    if (this.start) { this.focusDay = this.start; this.view = new Date(this.start.getFullYear(), this.start.getMonth(), 1); }
    this.render(); this.fill();
  }
  fill() { if (this.inA) this.inA.value = this.start ? iso(this.start) : ''; if (this.inB) this.inB.value = this.end ? iso(this.end) : ''; }
  /** put the keys on the grid, at the chosen day (or the first open one) */
  focusDate() {
    const lastM = new Date(this.view.getFullYear(), this.view.getMonth() + this.n, 0);
    if (this.focusDay < this.view || this.focusDay > lastM) this.view = new Date(this.focusDay.getFullYear(), this.focusDay.getMonth(), 1);
    this.render(true);
  }
  connectedCallback() {
    if (this.built) return; this.built = true;
    this.mode = this.getAttribute('mode') || 'single';
    this.n = +(this.getAttribute('months') || 1);
    this.loc = this.getAttribute('locale') || doc.documentElement.lang || 'en-GB';
    this.read();
    this.weekStart = +(this.getAttribute('week-start') ?? 1);
    this.start = parse(this.getAttribute('start') || this.getAttribute('value')); this.end = parse(this.getAttribute('end'));
    const from = this.start || (this.min && this.min > this.now ? this.min : this.now);
    this.view = new Date(from.getFullYear(), from.getMonth(), 1);
    this.focusDay = from;
    const name = this.getAttribute('name');
    if (name) { this.inA = h('input', { type: 'hidden', name: this.mode === 'range' ? name + '-start' : name }); this.append(this.inA); if (this.mode === 'range') { this.inB = h('input', { type: 'hidden', name: name + '-end' }); this.append(this.inB); } this.fill(); }
    this.box = h('div', { class: 'cal' }); this.append(this.box);
    this.render();
    this.box.addEventListener('click', e => { const b = e.target.closest('.cal-day'); if (b && !b.disabled) this.pick(parse(b.dataset.d)); });
    this.box.addEventListener('keydown', e => this.key(e));
    this.box.addEventListener('pointerover', e => { if (this.mode === 'range' && this.start && !this.end) { const b = e.target.closest('.cal-day'); if (b) this.paint(parse(b.dataset.d)); } });
    this.box.addEventListener('pointerleave', () => this.paint());
  }
  ok(d) { return !(this.min && d < this.min) && !(this.max && d > this.max) && !this.closed.includes(d.getDay()) && !this.off?.has(iso(d)); }
  render(focus = false) {
    const fmtM = new Intl.DateTimeFormat(this.loc, { month: 'long', year: 'numeric' });
    const fmtD = new Intl.DateTimeFormat(this.loc, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const dows = [...Array(7)].map((_, i) => new Intl.DateTimeFormat(this.loc, { weekday: 'short' }).format(new Date(2026, 0, 4 + ((i + this.weekStart) % 7))));
    const today = iso(this.now);
    const prevOk = !this.min || new Date(this.view.getFullYear(), this.view.getMonth(), 0) >= this.min;
    const lastView = new Date(this.view.getFullYear(), this.view.getMonth() + this.n, 1);
    const nextOk = !this.max || lastView <= this.max;
    let html = `<div class="cal-head"><span class="vh" aria-live="polite">${esc(fmtM.format(this.view))}</span><div class="cal-nav">
      <button type="button" class="ib" data-size="sm" data-nav="-1" aria-label="Previous month"${prevOk ? '' : ' disabled'}>${ms('chevron_left')}</button>
      <button type="button" class="ib" data-size="sm" data-nav="1" aria-label="Next month"${nextOk ? '' : ' disabled'}>${ms('chevron_right')}</button></div></div><div class="cal-months" style="--months:${this.n}">`;
    for (let m = 0; m < this.n; m++) {
      const first = new Date(this.view.getFullYear(), this.view.getMonth() + m, 1), dim = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
      const lead = (first.getDay() - this.weekStart + 7) % 7;
      html += `<div class="cal-month"><div class="cal-title">${esc(fmtM.format(first))}</div><div class="cal-dows" aria-hidden="true">${dows.map(d => `<span>${esc(d)}</span>`).join('')}</div><div class="cal-grid" role="group" aria-label="${esc(fmtM.format(first))}">`;
      for (let i = 0; i < lead; i++) html += '<button type="button" class="cal-day out" tabindex="-1" aria-hidden="true" disabled></button>';
      for (let d = 1; d <= dim; d++) {
        const dt = new Date(first.getFullYear(), first.getMonth(), d), k = iso(dt);
        const note = this.notes[k];
        html += `<button type="button" class="cal-day" data-d="${k}" tabindex="-1" aria-label="${esc(fmtD.format(dt) + (note ? ', ' + note : ''))}"${k === today ? ' aria-current="date"' : ''}${this.ok(dt) ? '' : ' disabled'}><span>${d}${note ? `<small aria-hidden="true">${esc(note)}</small>` : ''}</span></button>`;
      }
      html += '</div></div>';
    }
    this.box.innerHTML = html + '</div>';
    this.box.classList.toggle('noted', Object.keys(this.notes).length > 0);
    $$('[data-nav]', this.box).forEach(b => b.addEventListener('click', () => this.shift(+b.dataset.nav)));
    this.paint();
    const f = this.box.querySelector(`.cal-day[data-d="${iso(this.focusDay)}"]`) || this.box.querySelector('.cal-day:not(.out):not(:disabled)');
    if (f) { f.tabIndex = 0; if (focus) f.focus(); }
  }
  shift(k) { this.view = new Date(this.view.getFullYear(), this.view.getMonth() + k, 1); this.render(); }
  paint(hover) {
    const a = this.start, b = this.end || (hover && a && hover > a ? hover : null);
    $$('.cal-day[data-d]', this.box).forEach(el => {
      const d = parse(el.dataset.d), t = +d;
      const isA = a && t === +a, isB = b && t === +b;
      el.classList.toggle('start', !!(this.mode === 'range' && isA && b));
      el.classList.toggle('end', !!(this.mode === 'range' && isB));
      el.classList.toggle('in', !!(this.mode === 'range' && a && b && t > +a && t < +b));
      el.setAttribute('aria-pressed', String(!!(isA || (this.end && isB))));
    });
  }
  pick(d) {
    if (!d || !this.ok(d)) return;
    this.focusDay = d;
    if (this.mode === 'range') {
      if (!this.start || this.end || d <= this.start) { this.start = d; this.end = null; }
      else this.end = d;
    } else this.start = d;
    this.paint();
    this.fill();
    emit(this, 'change', { start: this.start, end: this.end, value: this.start && iso(this.start), nights: this.start && this.end ? Math.round((this.end - this.start) / 864e5) : 0 });
  }
  key(e) {
    const b = e.target.closest('.cal-day[data-d]'); if (!b) return;
    const d = parse(b.dataset.d), mv = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 7, ArrowUp: -7 }[e.key];
    let next = null;
    if (mv) next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + mv);
    else if (e.key === 'PageDown' || e.key === 'PageUp') next = new Date(d.getFullYear(), d.getMonth() + (e.key === 'PageDown' ? 1 : -1), d.getDate());
    else if (e.key === 'Home' || e.key === 'End') { const dow = (d.getDay() - this.weekStart + 7) % 7; next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + (e.key === 'Home' ? -dow : 6 - dow)); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.pick(d); return; }
    if (!next) return;
    e.preventDefault();
    // a closed day cannot take focus: keep going the same way to the next open one
    const dir = next < d ? -1 : 1;
    for (let k = 0; k < 62 && !this.ok(next); k++) next = new Date(next.getFullYear(), next.getMonth(), next.getDate() + dir);
    if (!this.ok(next)) return;
    this.focusDay = next;
    const lastM = new Date(this.view.getFullYear(), this.view.getMonth() + this.n, 0);
    if (next < this.view || next > lastM) { this.view = new Date(next.getFullYear(), next.getMonth() - (next > lastM ? this.n - 1 : 0), 1); this.render(true); }
    else { $$('.cal-day', this.box).forEach(x => (x.tabIndex = -1)); const f = this.box.querySelector(`.cal-day[data-d="${iso(next)}"]`); if (f) { f.tabIndex = 0; f.focus(); } }
  }
}
customElements.define('m-calendar', MCalendar);

// ── m/src/components/inputs/datefield/datefield.js
/* ════════ m-datefield: around a .field holding an <input type="date"> (the browser's own picker, before the script).
      After it, the field takes the date as people write it ("12/11/2026", "12 Nov", "Thu 12 Nov", "tomorrow"), shows it
      as "Thu 12 Nov 2026", and its button opens m-calendar in a popup. min, max, closed, disabled-dates, week-start,
      notes, locale and today are the calendar's, and hold for typed dates too. The form gets ISO (2026-11-12) under the
      input's name. .value reads and sets it; says change with { value, date }. ════════ */
const dfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dfIso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function dfMonths(loc) {
  const names = [];
  for (const l of [loc, 'en-GB']) for (const month of ['long', 'short']) for (let i = 0; i < 12; i++)
    names.push([new Intl.DateTimeFormat(l, { month }).format(new Date(2026, i, 1)).toLowerCase().replace(/\.$/, ''), i]);
  return names;
}
/** a date as people write it: ISO, 12/11/2026 (or 11/12 where months come first), 12 Nov 2026, Nov 12, today, tomorrow */
function dfParse(s, loc = 'en-GB', base = new Date()) {
  s = String(s).trim().toLowerCase().replace(/,/g, ' ').replace(/\s+/g, ' ');
  if (!s) return null;
  const today = dfDay(base), shift = n => new Date(today.getFullYear(), today.getMonth(), today.getDate() + n);
  if (s === 'today') return today; if (s === 'tomorrow') return shift(1); if (s === 'yesterday') return shift(-1);
  const mk = (y, m, d) => { y = y == null ? today.getFullYear() : +y < 100 ? 2000 + +y : +y; const t = new Date(y, m, +d); return t.getMonth() === m && t.getDate() === +d ? t : null; };
  const month = w => { if (!w || w.length < 3) return -1; const hit = dfMonths(loc).find(([n]) => n.startsWith(w)); return hit ? hit[1] : -1; };
  let r;
  if ((r = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) return mk(r[1], +r[2] - 1, r[3]);
  if ((r = s.match(/^(\d{1,2})[/.\- ](\d{1,2})(?:[/.\- ](\d{2}|\d{4}))?$/))) {
    const mdy = new Intl.DateTimeFormat(loc).formatToParts(new Date(2026, 10, 12)).find(p => p.type === 'month' || p.type === 'day')?.type === 'month';
    return mdy ? mk(r[3], +r[1] - 1, r[2]) : mk(r[3], +r[2] - 1, r[1]);
  }
  const t = s.split(' ').filter(w => !/^(mon|tue|wed|thu|fri|sat|sun)/.test(w) || /\d/.test(w));   // a weekday says nothing new
  const num = w => w && /^\d{1,2}(st|nd|rd|th)?$/.test(w) ? parseInt(w) : null;
  if (t.length >= 2 && num(t[0]) && month(t[1]) >= 0) return mk(t[2], month(t[1]), num(t[0]));
  if (t.length >= 2 && month(t[0]) >= 0 && num(t[1])) return mk(t[2], month(t[0]), num(t[1]));
  return null;
}

class MDatefield extends HTMLElement {
  connectedCallback() {
    if (this.cal || !(this.input = this.querySelector('input'))) return;
    const inp = this.input, field = this.field = inp.closest('.field') || inp.parentElement;
    this.loc = this.getAttribute('locale') || doc.documentElement.lang || 'en-GB';
    const first = inp.value;
    this.out = h('input', { type: 'hidden', name: inp.getAttribute('name'), value: first });
    inp.type = 'text'; inp.removeAttribute('name'); inp.autocomplete = 'off'; inp.defaultValue = '';
    if (!inp.placeholder) inp.placeholder = new Intl.DateTimeFormat(this.loc).formatToParts(new Date(2026, 10, 12)).map(p => ({ day: 'DD', month: 'MM', year: 'YYYY' })[p.type] || p.value).join('');
    this.btn = h('button', { type: 'button', class: 'ib', 'aria-label': 'Choose a date', 'data-tip': 'Choose a date', 'aria-haspopup': 'dialog', 'aria-expanded': 'false' }, ms('calendar_month'));
    field.append(this.btn);
    this.pop = h('div', { class: 'menu datefield-pop', popover: 'manual', role: 'dialog', 'aria-label': 'Choose a date', id: uid('m-datefield') });
    this.cal = h('m-calendar');
    for (const a of ['min', 'max', 'closed', 'disabled-dates', 'week-start', 'notes', 'locale', 'today']) if (this.hasAttribute(a)) this.cal.setAttribute(a, this.getAttribute(a));
    this.foot = h('div', { class: 'datefield-foot' }, `<button type="button" class="btn" data-variant="text" data-size="sm" data-today>Today</button><button type="button" class="btn" data-variant="text" data-size="sm" data-clear-date>Clear</button>`);
    this.pop.append(this.cal, this.foot);
    this.btn.setAttribute('aria-controls', this.pop.id);
    this.append(this.out, this.pop);
    this.date = dfParse(first, this.loc);
    this.show();
    this.btn.addEventListener('click', () => (this.isOpen ? this.close() : this.open()));
    inp.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' && e.altKey) { e.preventDefault(); this.open(); }
      else if (e.key === 'Enter') { if (this.read()) e.preventDefault(); }
    });
    inp.addEventListener('blur', () => this.read());
    inp.addEventListener('input', () => { if (inp.getAttribute('aria-invalid') === 'true' && this.check(dfParse(inp.value, this.loc, this.cal.now)) === '') { inp.removeAttribute('aria-invalid'); inp.setCustomValidity(''); } });
    this.pop.addEventListener('change', e => { if (e.target !== this.cal) return; e.stopPropagation(); this.set(dfParse(e.detail.value, 'en-GB')); this.close(); });
    this.pop.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(); } });
    // Tab out of the calendar closes it (a tick later: turning the month redraws the days under the focus)
    this.pop.addEventListener('focusout', () => setTimeout(() => { if (this.isOpen && !this.contains(doc.activeElement)) this.close(false); }));
    this.foot.addEventListener('click', e => {
      if (e.target.closest('[data-today]')) { const t = this.cal.now; if (this.cal.ok(t)) { this.set(t); this.close(); } }
      if (e.target.closest('[data-clear-date]')) { this.set(null); this.close(); }
    });
    inp.form?.addEventListener('reset', () => setTimeout(() => { this.date = dfParse(this.out.value, this.loc); this.show(); this.mark(''); }));
  }
  get value() { return this.out?.value || ''; }
  set value(v) { this.set(dfParse(v, 'en-GB'), true); }
  fmt(d) { return new Intl.DateTimeFormat(this.loc, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(d).replace(/,/g, ''); }
  show() { this.input.value = this.date ? this.fmt(this.date) : ''; this.out.value = this.date ? dfIso(this.date) : ''; }
  /** why a date can't be had, or '' */
  check(d) {
    if (d === null) return 'Write a date like ' + this.input.placeholder.replace('YYYY', '2026').replace('MM', '11').replace('DD', '12');
    return this.cal.ok?.(d) === false ? this.getAttribute('unavailable') || `${this.fmt(d)} can't be chosen` : '';
  }
  mark(msg) { this.input.setCustomValidity(msg); if (msg) this.input.setAttribute('aria-invalid', 'true'); else this.input.removeAttribute('aria-invalid'); }
  read() {
    const txt = this.input.value.trim();
    if (!txt) { if (this.date) this.set(null); this.mark(''); return false; }
    const d = dfParse(txt, this.loc, this.cal.now), msg = this.check(d);
    if (msg) { this.mark(msg); return false; }
    if (!this.date || +d !== +this.date) { this.set(d); return true; }
    this.show(); this.mark(''); return false;
  }
  set(d, quiet = false) {
    this.date = d; this.show(); this.mark('');
    if (!quiet) emit(this, 'change', { value: this.out.value, date: d });
  }
  open() {
    if (this.isOpen || this.input.disabled) return;
    opened(this); this.isOpen = true;
    if (this.date) this.cal.value = dfIso(this.date);
    showPop(this.pop); place(this.pop, this.field, { align: 'start' });
    this.btn.setAttribute('aria-expanded', 'true');
    this.foot.querySelector('[data-today]').disabled = !this.cal.ok(this.cal.now);
    this.cal.focusDate();
  }
  reposition() { if (this.isOpen) place(this.pop, this.field, { align: 'start' }); }
  close(refocus = true) {
    if (!this.isOpen) return;
    this.isOpen = false; released(this); hidePop(this.pop);
    this.btn.setAttribute('aria-expanded', 'false');
    if (refocus) this.input.focus({ preventScroll: true });
  }
}
customElements.define('m-datefield', MDatefield);

// ── m/src/components/inputs/time/time.js
/* ════════ m-time: around a .field holding an <input type="time"> (the browser's own, before the script). After it, the
      hours and minutes are two small inputs: type the numbers (it moves on by itself), or ↑ ↓ to step them (minutes by
      the input's step: step="900" is a quarter of an hour). Twelve-hour places get AM and PM (hours="12" or "24"
      to choose). min and max hold. The form gets "14:30" under the input's name. Says change with { value }. ════════ */
const two = n => String(n).padStart(2, '0');
class MTime extends HTMLElement {
  connectedCallback() {
    if (this.hs || !(this.input = this.querySelector('input'))) return;
    const inp = this.input, field = inp.closest('.field') || inp.parentElement;
    const loc = this.getAttribute('locale') || doc.documentElement.lang || 'en-GB';
    this.h12 = this.getAttribute('hours') ? this.getAttribute('hours') === '12' : /h1[12]/.test(new Intl.DateTimeFormat(loc, { hour: 'numeric' }).resolvedOptions().hourCycle || '');
    this.stepM = Math.max(1, Math.round((+inp.step || 60) / 60));
    this.min = this.toMin(inp.min); this.max = this.toMin(inp.max);
    const [h0, m0] = (inp.value || '').split(':').map(Number);
    this.out = h('input', { type: 'hidden', name: inp.getAttribute('name'), value: inp.value });
    const label = inp.labels?.[0];
    const seg = (part, name) => h('input', { class: 'time-seg', 'data-part': part, inputmode: 'numeric', maxlength: '2', autocomplete: 'off', role: 'spinbutton', 'aria-label': name, placeholder: '––', disabled: inp.disabled || null });
    this.hs = seg('h', 'Hours'); this.ms = seg('m', 'Minutes');
    if (inp.id) { this.hs.id = inp.id; }
    const group = label ? { role: 'group', 'aria-labelledby': label.id || (label.id = inp.id ? inp.id + '-l' : 'tm-' + Math.random().toString(36).slice(2, 7)) } : { role: 'group', 'aria-label': inp.getAttribute('aria-label') || 'Time' };
    Object.entries(group).forEach(([k, v]) => field.setAttribute(k, v));
    const parts = [this.hs, h('span', { class: 'time-sep', 'aria-hidden': 'true' }, ':'), this.ms];
    if (this.h12) { this.ap = h('button', { type: 'button', class: 'time-ap', 'aria-label': 'Morning or afternoon' }); parts.push(this.ap); this.ap.addEventListener('click', () => this.flip()); this.ap.addEventListener('keydown', e => { const k = e.key.toLowerCase(); if (k === 'a' || k === 'p' || e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); this.flip(k === 'a' ? 0 : k === 'p' ? 1 : undefined); } }); }
    inp.replaceWith(...parts); this.append(this.out);
    this.hv = Number.isFinite(h0) ? h0 : null; this.mv = Number.isFinite(m0) ? m0 : null;
    for (const s of [this.hs, this.ms]) {
      s.addEventListener('focus', () => requestAnimationFrame(() => s.select()));
      s.addEventListener('keydown', e => this.key(e, s));
      s.addEventListener('input', () => this.typed(s));
      s.addEventListener('blur', () => { this.typing = ''; this.show(); });
    }
    this.out.form?.addEventListener('reset', () => setTimeout(() => { const [a, b] = this.out.value.split(':').map(Number); this.hv = Number.isFinite(a) ? a : null; this.mv = Number.isFinite(b) ? b : null; this.show(); }));
    this.show();
  }
  toMin(s) { const [a, b] = (s || '').split(':').map(Number); return Number.isFinite(a) ? a * 60 + (b || 0) : null; }
  get value() { return this.out?.value || ''; }
  set value(v) { const [a, b] = String(v).split(':').map(Number); this.hv = Number.isFinite(a) ? a : null; this.mv = Number.isFinite(b) ? b : null; this.show(); this.commit(true); }
  show() {
    const hh = this.hv == null ? '' : this.h12 ? String(this.hv % 12 || 12) : two(this.hv);
    this.hs.value = hh; this.ms.value = this.mv == null ? '' : two(this.mv);
    this.hs.setAttribute('aria-valuemin', this.h12 ? 1 : 0); this.hs.setAttribute('aria-valuemax', this.h12 ? 12 : 23);
    this.ms.setAttribute('aria-valuemin', 0); this.ms.setAttribute('aria-valuemax', 59);
    for (const [s, v] of [[this.hs, this.hv == null ? null : this.h12 ? this.hv % 12 || 12 : this.hv], [this.ms, this.mv]]) { if (v == null) { s.removeAttribute('aria-valuenow'); s.setAttribute('aria-valuetext', 'blank'); } else { s.setAttribute('aria-valuenow', v); s.setAttribute('aria-valuetext', String(v)); } }
    if (this.ap) { const pm = (this.hv ?? 0) >= 12; this.ap.textContent = pm ? 'PM' : 'AM'; this.ap.setAttribute('aria-label', pm ? 'Afternoon (PM)' : 'Morning (AM)'); }
  }
  commit(quiet = false) {
    const v = this.hv == null || this.mv == null ? '' : `${two(this.hv)}:${two(this.mv)}`, t = this.hv * 60 + this.mv;
    let msg = '';
    if (v && this.min != null && t < this.min) msg = `From ${two(Math.floor(this.min / 60))}:${two(this.min % 60)}`;
    if (v && this.max != null && t > this.max) msg = `Until ${two(Math.floor(this.max / 60))}:${two(this.max % 60)}`;
    this.hs.setCustomValidity(msg); this.hs.toggleAttribute('aria-invalid', !!msg);
    if (v !== this.out.value) { this.out.value = v; if (!quiet) emit(this, 'change', { value: v }); }
  }
  flip(to) { if (this.hv == null) this.hv = 12; const pm = this.hv >= 12, want = to ?? (pm ? 0 : 1); if (want !== +pm) this.hv = (this.hv + 12) % 24; this.show(); this.commit(); }
  step(s, d) {
    if (s === this.hs) this.hv = this.hv == null ? (d > 0 ? (this.h12 ? 1 : 0) : 23) : (this.hv + d + 24) % 24;
    else this.mv = this.mv == null ? 0 : ((Math.round(this.mv / this.stepM) * this.stepM + d * this.stepM) % 60 + 60) % 60;
    this.show(); this.commit(); s.select();
  }
  key(e, s) {
    const go = { ArrowUp: 1, ArrowDown: -1 }[e.key];
    if (go) { e.preventDefault(); this.step(s, go); return; }
    if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); if (s === this.hs) this.hv = e.key === 'Home' ? (this.h12 ? (this.hv >= 12 ? 12 : 0) : 0) : (this.h12 ? (this.hv >= 12 ? 23 : 11) : 23); else this.mv = e.key === 'Home' ? 0 : 60 - this.stepM; this.show(); this.commit(); s.select(); return; }
    if (e.key === 'ArrowRight' || e.key === ':' || (e.key === '.' && s === this.hs)) { if (s === this.hs || e.key !== 'ArrowRight') { e.preventDefault(); (s === this.hs ? this.ms : this.ap || this.ms).focus(); } else if (this.ap) { e.preventDefault(); this.ap.focus(); } return; }
    if (e.key === 'ArrowLeft' && s === this.ms) { e.preventDefault(); this.hs.focus(); return; }
    if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); if (s === this.hs) this.hv = null; else this.mv = null; this.typing = ''; this.show(); this.commit(); return; }
    if (this.ap && /^[ap]$/i.test(e.key)) { e.preventDefault(); this.flip(e.key.toLowerCase() === 'a' ? 0 : 1); }
  }
  // what is typed: two digits, or one that can't begin two, and it moves on
  typed(s) {
    const d = s.value.replace(/\D/g, '').slice(-2);
    if (!d) { this.show(); return; }
    const n = +d, isH = s === this.hs, top = isH ? (this.h12 ? 12 : 23) : 59, lead = isH ? (this.h12 ? 1 : 2) : 5;
    const done = d.length === 2 || n > lead;
    if (d.length === 2 && n > top) { s.value = d.slice(-1); this.typed(s); return; }
    if (isH) this.hv = this.h12 ? (n % 12) + ((this.hv ?? 0) >= 12 ? 12 : 0) : n; else this.mv = n;
    if (done) { this.show(); this.commit(); if (isH) this.ms.focus(); else if (this.ap) this.ap.focus(); else s.select(); }
    else { s.value = d; this.commit(); }
  }
}
customElements.define('m-time', MTime);

// ── m/src/components/inputs/colour/colour.js
/* ════════ m-colour: around an <input type="color"> with its name and value (the browser's own picker, before the
      script). After it: a plane of OKLCH tones, lightness down and chroma across, for the hue on the strip below;
      ← → ↑ ↓ walk it. Beside it, the colour, how dark and light text read on it, its hex and its L, C and H.
      data-swatches="#C9A77C #7A8F6B …": colours to start from. Photographs inside it (<img alt="…">) become swatches
      that take the photograph's ground. target="#el": an element grounded by the colour (.tone, --h and --c).
      Says change with { hex, l, c, h }; the form gets the hex under the input's name. ════════ */
const COL_L = [.96, .9, .84, .77, .7, .62, .54, .46, .38, .3];
const COL_C = [0, .02, .04, .06, .08, .1, .12, .14, .16, .18, .2, .22, .24, .26];
function colLinear(L, C, H) {
  const a = C * Math.cos(H * Math.PI / 180), b = C * Math.sin(H * Math.PI / 180);
  const l = (L + .3963377774 * a + .2158037573 * b) ** 3, m = (L - .1055613458 * a - .0638541728 * b) ** 3, s = (L - .0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + .2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - .3413193965 * s, -.0041960863 * l - .7034186147 * m + 1.707614701 * s];
}
const colIn = (L, C, H) => colLinear(L, C, H).every(v => v >= -1e-4 && v <= 1 + 1e-4);
/** #RGB or #RRGGBB → { l, c, h } in OKLCH, and the linear channels */
function colFromHex(x) {
  const m = String(x).trim().match(/^#?([\da-f]{3}|[\da-f]{6})$/i); if (!m) return null;
  const s = m[1].length === 3 ? [...m[1]].map(c => c + c).join('') : m[1];
  const lin = [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16) / 255).map(c => (c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4));
  const [r, g, b] = lin;
  const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b), mm = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b), ss = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
  const L = .2104542553 * l + .793617785 * mm - .0040720468 * ss, A = 1.9779984951 * l - 2.428592205 * mm + .4505937099 * ss, B = .0259040371 * l + .7827717662 * mm - .808675766 * ss;
  return { l: L, c: Math.hypot(A, B), h: (Math.atan2(B, A) * 180 / Math.PI + 360) % 360, lin };
}
const colLum = hx => { const c = colFromHex(hx).lin; return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
/** the contrast of two colours, WCAG's way */
const colRatio = (a, b) => { const [x, y] = [colLum(a), colLum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };
const COL_NAMES = [[20, 'red'], [55, 'orange'], [92, 'yellow'], [135, 'green'], [190, 'teal'], [240, 'blue'], [290, 'violet'], [335, 'pink'], [380, 'red']];
const colHueName = H => COL_NAMES.reduce((a, b) => (Math.abs(b[0] - H) < Math.abs(a[0] - H) ? b : a))[1];
const COL_DARK = '#121211', COL_LIGHT = '#F6F4EF';

class MColour extends HTMLElement {
  connectedCallback() {
    if (this.box || !(this.input = this.querySelector('input'))) return;
    const inp = this.input, v0 = colFromHex(inp.value) || colFromHex('#D8C3A5');
    this.L = v0.l; this.C = v0.c; this.H = v0.c < .004 ? +(this.getAttribute('hue') || 60) : v0.h;
    const label = inp.labels?.[0], name = label?.textContent.trim() || inp.getAttribute('aria-label') || 'Colour', id = inp.id;
    inp.type = 'hidden'; inp.removeAttribute('id');
    const photos = $$(':scope > img', this);
    this.plane = h('div', { class: 'colour-plane', role: 'grid', 'aria-label': `${name}: lightness and chroma`, style: `--cols:${COL_C.length}` },
      COL_L.map((L, r) => `<div role="row">${COL_C.map((C, k) => `<span role="gridcell" tabindex="-1" data-r="${r}" data-k="${k}" aria-label="Lightness ${Math.round(L * 100)}, chroma ${C.toFixed(2)}"></span>`).join('')}</div>`).join(''));
    this.hueIn = h('input', { type: 'range', min: 0, max: 359, step: 1, 'aria-label': `${name}: hue` });
    const hue = h('div', { class: 'colour-hue' }, `<div class="colour-strip" aria-hidden="true">${[...Array(36)].map((_, i) => `<i style="background:${hex(.72, .13, i * 10 + 5)}"></i>`).join('')}</div>`);
    hue.append(this.hueIn);
    this.preview = h('div', { class: 'colour-preview', 'aria-hidden': 'true' }, 'Aa');
    this.reads = h('div', { class: 'colour-reads', 'aria-live': 'polite' });
    const fld = (k, label, attrs) => { const f = h('label', { class: 'field' + (k === 'hex' ? ' colour-hex' : '') }, `<span aria-hidden="true">${label}</span>`); const i = h('input', { autocomplete: 'off', spellcheck: 'false', ...attrs }); f.append(i); return [f, i]; };
    const [fHex, hexIn] = fld('hex', '#', { 'aria-label': `${name}, as hex`, maxlength: 7, id: id || null });
    const [fL, lIn] = fld('l', 'L', { type: 'number', min: 0, max: 100, step: 1, 'aria-label': 'Lightness, 0 to 100' });
    const [fC, cIn] = fld('c', 'C', { type: 'number', min: 0, max: .4, step: .005, 'aria-label': 'Chroma, 0 to 0.4' });
    const [fH, hIn] = fld('h', 'H', { type: 'number', min: 0, max: 360, step: 1, 'aria-label': 'Hue, in degrees' });
    Object.assign(this, { hexIn, lIn, cIn, hIn });
    const fields = h('div', { class: 'colour-fields' }); fields.append(fHex, fL, fC, fH);
    const side = h('div', { class: 'colour-side' }); side.append(this.preview, this.reads, fields);
    const main = h('div'); main.append(this.plane, h('div', { class: 'colour-axes', 'aria-hidden': 'true' }, '<span>Grey</span><span>Vivid</span>'), hue);
    this.box = h('div', { class: 'colour', role: 'group', 'aria-label': name }); this.box.append(main, side);
    const sw = (this.dataset.swatches || '').split(/[\s,]+/).filter(x => colFromHex(x));
    if (sw.length || photos.length) {
      const more = h('div', { class: 'colour-more' });
      if (sw.length) more.append(h('div', { class: 'swatches', role: 'group', 'aria-label': 'Colours to start from' }, sw.map(x => `<button type="button" class="swatch" data-hex="${esc(x)}" style="--col:${esc(x)}" aria-pressed="false" aria-label="${esc(x.toUpperCase())}" data-tip="${esc(x.toUpperCase())}"></button>`).join('')));
      if (photos.length) {
        const row = h('div', { class: 'swatches', role: 'group', 'aria-label': 'The ground of a photograph' });
        photos.forEach(img => { const b = h('button', { type: 'button', class: 'swatch colour-photo', 'data-src': img.currentSrc || img.src, 'aria-label': `The ground of ${img.alt || 'this photograph'}`, 'data-tip': img.alt || null }); img.alt = ''; b.append(img); row.append(b); });
        more.append(h('span', { class: 'label' }, 'From a photograph'), row);
      }
      this.box.append(more);
    }
    this.append(this.box);
    if (label && id) label.htmlFor = id;
    this.target = this.getAttribute('target') && document.querySelector(this.getAttribute('target'));
    // what moves it
    this.plane.addEventListener('click', e => { const c = e.target.closest('[role=gridcell]'); if (c && !c.hasAttribute('data-out')) this.pick(c); });
    this.plane.addEventListener('keydown', e => this.key(e));
    this.hueIn.addEventListener('input', () => { this.H = +this.hueIn.value; this.fit(); this.paint(); this.update(); });
    // six digits take as they are typed; three only once you leave the field (#ABC is on the way to #ABCDEF)
    hexIn.addEventListener('input', () => { if (/^#?[\da-f]{6}$/i.test(hexIn.value.trim())) this.set(hexIn.value, false, hexIn); });
    hexIn.addEventListener('blur', () => { if (/^#?[\da-f]{3}$/i.test(hexIn.value.trim())) this.set(hexIn.value); else this.update(null, true); });
    for (const [i, k, f] of [[lIn, 'L', v => v / 100], [cIn, 'C', v => v], [hIn, 'H', v => v % 360]]) i.addEventListener('input', () => { if (i.value === '' || !isFinite(+i.value)) return; this[k] = f(clamp(+i.value, +i.min, +i.max)); this.fit(); this.paint(); this.update(i); });
    this.box.addEventListener('click', e => {
      const s = e.target.closest('.swatch[data-hex]'); if (s) { const v = colFromHex(s.dataset.hex); this.L = v.l; this.C = v.c; if (v.c > .004) this.H = v.h; this.paint(); this.update(); }
      const p = e.target.closest('.colour-photo'); if (p) seedOf(p.dataset.src).then(sd => { if (!sd) return; this.H = sd.h; this.L = .915; this.C = Math.min(clamp(sd.c, .04, .16) * .42, .055); this.paint(); this.update(); });
    });
    inp.form?.addEventListener('reset', () => setTimeout(() => this.set(inp.value, true)));
    this.paint(); this.update(null, true);
  }
  get value() { return this.input?.value; }
  set value(v) { this.set(v, true); }
  set(hx, quiet, skip = null) { const v = colFromHex(hx); if (!v) return; this.L = v.l; this.C = v.c; if (v.c > .004) this.H = v.h; this.paint(); this.update(skip, quiet); }
  cells() { return $$('[role=gridcell]', this.plane); }
  // a colour the screen can't show keeps its lightness and gives up chroma until it can
  fit() { for (let i = 0; i < 60 && this.C > 0 && !colIn(this.L, this.C, this.H); i++) this.C = Math.max(0, this.C - .004); }
  paint() {
    for (const c of this.cells()) {
      const L = COL_L[c.dataset.r], C = COL_C[c.dataset.k], ok = colIn(L, C, this.H);
      c.toggleAttribute('data-out', !ok); c.setAttribute('aria-disabled', String(!ok));
      c.style.background = ok ? `oklch(${L} ${C} ${this.H.toFixed(1)})` : '';
    }
  }
  nearest() {
    let best = null, d0 = Infinity;
    for (const c of this.cells()) { if (c.hasAttribute('data-out')) continue; const d = ((COL_L[c.dataset.r] - this.L) / .07) ** 2 + ((COL_C[c.dataset.k] - this.C) / .02) ** 2; if (d < d0) { d0 = d; best = c; } }
    return best;
  }
  mark() {
    const on = this.nearest(), focusIn = this.plane.contains(document.activeElement);
    for (const c of this.cells()) { c.setAttribute('aria-selected', String(c === on)); c.tabIndex = c === on ? 0 : -1; }
    if (focusIn && on && document.activeElement !== on) on.focus();
  }
  pick(c) { this.L = COL_L[c.dataset.r]; this.C = COL_C[c.dataset.k]; this.update(); c.focus(); }
  key(e) {
    const c = e.target.closest('[role=gridcell]'); if (!c) return;
    let r = +c.dataset.r, k = +c.dataset.k;
    const d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key];
    const at = (rr, kk) => this.plane.querySelector(`[data-r="${rr}"][data-k="${kk}"]`);
    let next = null;
    if (d) { for (let i = 1; i < 15; i++) { const x = at(r + d[0] * i, k + d[1] * i); if (!x) break; if (!x.hasAttribute('data-out')) { next = x; break; } } }
    else if (e.key === 'Home' || e.key === 'End') { const row = $$(`[data-r="${r}"]:not([data-out])`, this.plane); next = e.key === 'Home' ? row[0] : row.at(-1); }
    else if (e.key === 'PageUp' || e.key === 'PageDown') { const col = $$(`[data-k="${k}"]:not([data-out])`, this.plane); next = e.key === 'PageUp' ? col[0] : col.at(-1); }
    else return;
    e.preventDefault();
    if (next) this.pick(next);
  }
  update(skip = null, quiet = false) {
    const hx = hex(this.L, this.C, this.H);
    this.input.value = hx.toLowerCase();
    this.preview.style.background = hx; this.style.setProperty('--colour-now', hx);
    const dk = colRatio(hx, COL_DARK), lt = colRatio(hx, COL_LIGHT);
    this.preview.style.color = dk >= lt ? COL_DARK : COL_LIGHT;
    this.reads.innerHTML = `<span>Dark words on it <b>${dk.toFixed(1)} : 1</b></span><span>Light words on it <b>${lt.toFixed(1)} : 1</b></span>`;
    if (skip !== this.hexIn) this.hexIn.value = hx;
    if (skip !== this.lIn) this.lIn.value = Math.round(this.L * 100);
    if (skip !== this.cIn) this.cIn.value = this.C.toFixed(3);
    if (skip !== this.hIn) this.hIn.value = Math.round(this.H);
    this.hueIn.value = Math.round(this.H); this.hueIn.setAttribute('aria-valuetext', `${Math.round(this.H)}°, ${colHueName(this.H)}`);
    $$('.swatch[data-hex]', this.box).forEach(s => s.setAttribute('aria-pressed', String(s.dataset.hex.toUpperCase() === hx)));
    this.mark();
    // the target takes it as a seed: .tone's ground holds .42 of a seed's chroma, so its ground is this colour's
    if (this.target) { this.target.style.setProperty('--h', Math.round(this.H)); this.target.style.setProperty('--c', clamp(this.C / .42, .04, .16).toFixed(3)); this.target.classList.add('tone'); }
    if (!quiet) emit(this, 'change', { hex: hx, l: this.L, c: this.C, h: this.H });
  }
}
customElements.define('m-colour', MColour);

// ── m/src/components/inputs/dropzone/dropzone.js
/* ════════ m-dropzone: around a label.dropzone holding an <input type="file"> (which, before the script, opens the
      chooser and takes a drop by itself). After it, files dropped or chosen gather in a list under it, a picture for
      each photograph; the input holds every one of them, so a form sends them all. accept and multiple are the
      input's; max-size="20 MB" and max="12" are the zone's. Files that can't go say why and stay out of the form.
      Says files with { added, refused } (start uploads there); drive each with zone.progress(file, 0.4),
      zone.done(file), zone.fail(file, 'Why'); zone.remove(file). .files is what it holds. ════════ */
const dzSize = n => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} kB` : `${(n / 1048576).toFixed(1)} MB`);
const dzBytes = s => { const m = String(s || '').match(/([\d.]+)\s*(kb|mb|gb|b)?/i); if (!m) return Infinity; return +m[1] * ({ b: 1, kb: 1024, mb: 1048576, gb: 1073741824 }[(m[2] || 'b').toLowerCase()]); };
const dzIcon = f => (/\.(dng|cr2|cr3|nef|arw|raf|orf|rw2)$/i.test(f.name) ? 'raw_on' : /^image\//.test(f.type) ? 'image' : /^video\//.test(f.type) ? 'movie' : /pdf$/.test(f.type) ? 'picture_as_pdf' : 'draft');

class MDropzone extends HTMLElement {
  connectedCallback() {
    if (this.list || !(this.input = this.querySelector('input[type=file]'))) return;
    this.items = [];
    this.list = h('ul', { class: 'dropzone-list', role: 'list', 'aria-label': 'Files' });
    this.live = h('span', { class: 'vh', 'aria-live': 'polite' });
    this.append(this.list, this.live);
    let depth = 0;
    this.addEventListener('dragenter', e => { if (!this.takes(e)) return; e.preventDefault(); depth++; this.dataset.over = ''; });
    this.addEventListener('dragover', e => { if (!this.takes(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    this.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; delete this.dataset.over; } });
    this.addEventListener('drop', e => { if (!this.takes(e)) return; e.preventDefault(); depth = 0; delete this.dataset.over; this.add([...e.dataTransfer.files]); });
    this.input.addEventListener('change', () => { const fresh = [...this.input.files].filter(f => !this.items.some(i => i.file === f)); this.add(fresh); });
    this.list.addEventListener('click', e => { const b = e.target.closest('[data-remove]'); if (b) { const it = this.items.find(i => i.id === b.dataset.remove); if (it) { this.remove(it.file); this.input.focus(); } } });
    this.input.form?.addEventListener('reset', () => { this.items.forEach(i => i.url && URL.revokeObjectURL(i.url)); this.items = []; this.list.replaceChildren(); });
  }
  get files() { return this.items.filter(i => i.state !== 'error').map(i => i.file); }
  takes(e) { return !this.input.disabled && [...(e.dataTransfer?.types || [])].includes('Files'); }
  refuse(f) {
    const acc = (this.input.accept || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    if (acc.length && !acc.some(a => (a.startsWith('.') ? f.name.toLowerCase().endsWith(a) : a.endsWith('/*') ? f.type.startsWith(a.slice(0, -1)) : f.type === a))) return 'Not a kind it takes';
    if (f.size > dzBytes(this.getAttribute('max-size'))) return `Too big: ${dzSize(f.size)} of ${this.getAttribute('max-size')}`;
    const max = +this.getAttribute('max') || (this.input.multiple ? Infinity : 1);
    if (this.files.length >= max) return `${max} at most`;
    return '';
  }
  add(files) {
    if (!this.input.multiple) { this.items.forEach(i => i.state !== 'error' && this.drop(i)); }
    const added = [], refused = [];
    for (const f of files) {
      if (this.items.some(i => i.file.name === f.name && i.file.size === f.size && i.state !== 'error')) continue;   // the same file twice
      const why = this.refuse(f), it = { file: f, id: 'f' + Math.random().toString(36).slice(2, 8), state: why ? 'error' : 'ready', why };
      if (!why && /^image\/(jpeg|png|webp|avif|gif)$/.test(f.type)) it.url = URL.createObjectURL(f);
      this.items.push(it); this.list.append(this.draw(it));
      (why ? refused : added).push(f);
    }
    this.sync();
    if (added.length || refused.length) {
      this.live.textContent = [added.length && `${added.length} added`, refused.length && `${refused.length} can't go: ${this.items.find(i => i.file === refused[0])?.why}`].filter(Boolean).join('; ');
      emit(this, 'files', { added, refused });
    }
  }
  draw(it) {
    const f = it.file, li = h('li', { class: 'dropzone-item', 'data-id': it.id, 'data-state': it.state });
    li.innerHTML = (it.url ? `<img src="${it.url}" alt="">` : ms(dzIcon(f))) + `<span class="dropzone-name">${esc(f.name)}</span>`
      + `<span class="dropzone-meta">${it.why ? esc(it.why) : `<span>${dzSize(f.size)}</span>`}</span>`
      + `<button type="button" class="ib" data-size="sm" data-remove="${it.id}" aria-label="Take ${esc(f.name)} out" data-tip="Take it out">${ms('close')}</button>`;
    return li;
  }
  sync() { try { const dt = new DataTransfer(); this.files.forEach(f => dt.items.add(f)); this.input.files = dt.files; } catch {} }
  find(file) { return this.items.find(i => i.file === file || i.id === file); }
  progress(file, v) {
    const it = this.find(file); if (!it || it.state === 'error') return;
    it.state = 'sending'; const li = this.list.querySelector(`[data-id="${it.id}"]`); li.dataset.state = 'sending';
    let bar = li.querySelector('.progress');
    if (!bar) { bar = h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': `Sending ${it.file.name}` }); li.querySelector('.dropzone-meta').append(bar); }
    bar.style.setProperty('--v', Math.min(1, v)); bar.setAttribute('aria-valuenow', Math.round(Math.min(1, v) * 100));
  }
  done(file) {
    const it = this.find(file); if (!it) return;
    it.state = 'done'; const li = this.list.querySelector(`[data-id="${it.id}"]`); li.dataset.state = 'done';
    li.querySelector('.dropzone-meta').innerHTML = `<span>${dzSize(it.file.size)} · sent</span>`;
  }
  fail(file, why = 'It didn’t go') {
    const it = this.find(file); if (!it) return;
    it.state = 'error'; it.why = why; const li = this.list.querySelector(`[data-id="${it.id}"]`); li.dataset.state = 'error';
    li.querySelector('.dropzone-meta').textContent = why; this.sync(); this.live.textContent = `${it.file.name}: ${why}`;
  }
  drop(it) { if (it.url) URL.revokeObjectURL(it.url); this.items = this.items.filter(x => x !== it); this.list.querySelector(`[data-id="${it.id}"]`)?.remove(); }
  remove(file) { const it = this.find(file); if (!it) return; this.drop(it); this.sync(); this.live.textContent = `${it.file.name} taken out`; emit(this, 'change', { files: this.files }); }
}
customElements.define('m-dropzone', MDropzone);

// ── m/src/components/inputs/curve/curve.js
/* ════════ m-curve: points on a square (in and out, 0 to 255) and the smooth line through them: monotone, so between two
      points it never overshoots and no tone ever reverses. Press the square to add a point there and drag it; drag one
      out of the square, or Delete, to take it away; a double press starts the channel again. A focused point answers
      the keys: ← → its input, ↑ ↓ its output (Shift for tens), + a new point halfway to the next. channels="rgb r g b"
      puts a connected group above it, a curve for each. data-hist="…": the histogram behind. An input inside (its
      name) carries the points to the form as JSON. .lut(channel) gives the 256 outputs; says input while a point
      moves, change when it is let go, each with { channel, points }. ════════ */
function curveFn(pts) {
  const p = [...pts].sort((a, b) => a[0] - b[0]), n = p.length;
  if (n < 2) return x => x;
  const dx = [], m = [], t = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = p[i + 1][0] - p[i][0]; m[i] = dx[i] ? (p[i + 1][1] - p[i][1]) / dx[i] : 0; }
  t[0] = m[0]; t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = t[i + 1] = 0; continue; }
    const a = t[i] / m[i], b = t[i + 1] / m[i], s = a * a + b * b;
    if (s > 9) { const k = 3 / Math.sqrt(s); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  return x => {
    if (x <= p[0][0]) return p[0][1];
    if (x >= p[n - 1][0]) return p[n - 1][1];
    let i = 0; while (x > p[i + 1][0]) i++;
    const hh = dx[i], u = (x - p[i][0]) / hh, u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * p[i][1] + (u3 - 2 * u2 + u) * hh * t[i] + (-2 * u3 + 3 * u2) * p[i + 1][1] + (u3 - u2) * hh * t[i + 1];
  };
}
const CURVE_NAMES = { rgb: 'All', l: 'Light', r: 'Red', g: 'Green', b: 'Blue' };
const curvePath = fn => { let d = ''; for (let x = 0; x <= 255; x += 1) d += `${x ? 'L' : 'M'}${x},${(255 - clamp(fn(x), 0, 255)).toFixed(1)}`; return d; };

class MCurve extends HTMLElement {
  connectedCallback() {
    if (this.box) return;
    this.chans = (this.getAttribute('channels') || 'rgb').split(/\s+/).filter(c => CURVE_NAMES[c]);
    this.ch = this.chans[0]; this.dataset.channel = this.ch;
    this.pts = Object.fromEntries(this.chans.map(c => [c, [[0, 0], [255, 255]]]));
    this.out = this.querySelector('input');
    if (this.out) { try { const v = JSON.parse(this.out.value || '{}'); for (const c of this.chans) if (Array.isArray(v[c]) && v[c].length > 1) this.pts[c] = v[c]; } catch {} this.out.type = 'hidden'; this.first = JSON.stringify(this.pts); }
    const name = this.getAttribute('aria-label') || 'Tone curve';
    if (this.chans.length > 1) {
      this.seg = h('div', { class: 'seg', 'data-size': 'sm', role: 'radiogroup', 'aria-label': `${name}: channel` }, this.chans.map(c => `<button type="button" role="radio" aria-checked="${c === this.ch}" data-ch="${c}">${CURVE_NAMES[c]}</button>`).join(''));
      this.seg.addEventListener('click', e => { const b = e.target.closest('[data-ch]'); if (b) { this.seg.querySelectorAll('[data-ch]').forEach(x => x.setAttribute('aria-checked', String(x === b))); this.channel(b.dataset.ch); } });
      this.append(this.seg);
    }
    const hist = (this.dataset.hist || '').split(/[\s,]+/).filter(Boolean).map(Number), top = Math.max(1, ...hist);
    const histPath = hist.length ? `<path class="curve-hist" d="M0,255 ${hist.map((v, i) => `L${(i / (hist.length - 1) * 255).toFixed(1)},${(255 - v / top * 200).toFixed(1)}`).join(' ')} L255,255 Z"/>` : '';
    this.box = h('div', { class: 'curve-box', role: 'group', 'aria-label': name },
      `<svg viewBox="0 0 255 255" preserveAspectRatio="none" aria-hidden="true">${histPath}<path class="curve-grid" d="M63.75,0V255M127.5,0V255M191.25,0V255M0,63.75H255M0,127.5H255M0,191.25H255"/><path class="curve-base" d="M0,255L255,0"/><g class="curve-others"></g><path class="curve-line"/></svg>`);
    this.read = h('div', { class: 'curve-read', 'aria-live': 'polite' });
    this.append(this.box, this.read);
    this.line = this.box.querySelector('.curve-line'); this.others = this.box.querySelector('.curve-others');
    this.box.addEventListener('pointerdown', e => this.down(e));
    this.box.addEventListener('pointermove', e => this.move(e));
    this.box.addEventListener('pointerup', e => this.up(e));
    this.box.addEventListener('pointercancel', e => this.up(e));
    this.box.addEventListener('dblclick', e => { if (!e.target.closest('.curve-pt')) this.reset(); });
    this.box.addEventListener('keydown', e => this.key(e));
    this.out?.form?.addEventListener('reset', () => setTimeout(() => { try { this.pts = JSON.parse(this.first); } catch {} this.draw(true); }));
    this.draw(true);
  }
  get value() { return JSON.parse(JSON.stringify(this.pts)); }
  set value(v) { for (const c of this.chans) if (Array.isArray(v?.[c])) this.pts[c] = v[c]; this.draw(true); }
  lut(c = this.ch) { const fn = curveFn(this.pts[c]); return Array.from({ length: 256 }, (_, x) => Math.round(clamp(fn(x), 0, 255))); }
  channel(c) { this.ch = c; this.dataset.channel = c; this.draw(true); }
  reset() { this.pts[this.ch] = [[0, 0], [255, 255]]; this.draw(true); this.say(); this.changed('change'); }
  at(e) { const r = this.box.getBoundingClientRect(); return [clamp((e.clientX - r.left - 10) / (r.width - 20)) * 255, clamp(1 - (e.clientY - r.top - 10) / (r.height - 20)) * 255, r]; }
  draw(full = false) {
    const p = this.pts[this.ch].sort((a, b) => a[0] - b[0]);
    this.line.setAttribute('d', curvePath(curveFn(p)));
    // the other channels, faint, once they have been bent
    const bent = c => JSON.stringify(this.pts[c].map(q => q.map(Math.round))) !== '[[0,0],[255,255]]';
    this.others.innerHTML = this.chans.filter(c => c !== this.ch && bent(c)).map(c => `<path class="curve-other" data-ch="${c}" d="${curvePath(curveFn(this.pts[c]))}" stroke="currentColor"/>`).join('');
    if (full || !this.els || this.els.length !== p.length) {
      const had = this.box.contains(document.activeElement) ? [...(this.els || [])].indexOf(document.activeElement) : -1;
      this.els?.forEach(el => el.remove());
      this.els = p.map((_, i) => { const b = h('button', { type: 'button', class: 'curve-pt', role: 'slider', 'aria-valuemin': 0, 'aria-valuemax': 255 }); b.dataset.i = i; this.box.append(b); return b; });
      if (had >= 0) this.els[Math.min(had, this.els.length - 1)]?.focus();
    }
    p.forEach(([x, y], i) => {
      const b = this.els[i];
      b.style.left = `calc(10px + (100% - 20px) * ${(x / 255).toFixed(4)})`; b.style.top = `calc(10px + (100% - 20px) * ${(1 - y / 255).toFixed(4)})`;
      b.setAttribute('aria-label', `${CURVE_NAMES[this.ch]}: point ${i + 1} of ${p.length}`);
      b.setAttribute('aria-valuenow', Math.round(y)); b.setAttribute('aria-valuetext', `In ${Math.round(x)}, out ${Math.round(y)}`);
    });
    if (this.out) this.out.value = JSON.stringify(this.pts, (k, v) => (typeof v === 'number' ? Math.round(v) : v));
  }
  say(i) {
    const p = this.pts[this.ch][i];
    this.read.innerHTML = p ? `<span>In <b>${Math.round(p[0])}</b> → out <b>${Math.round(p[1])}</b></span><span>${i === 0 ? 'Black point' : i === this.pts[this.ch].length - 1 ? 'White point' : `Point ${i + 1}`}</span>`
      : '<span>Press the square to add a point; drag one out to take it away</span>';
  }
  changed(type) { emit(this, type, { channel: this.ch, points: this.value[this.ch] }); }
  down(e) {
    if (e.button > 0) return;
    e.preventDefault();
    const p = this.pts[this.ch], pt = e.target.closest('.curve-pt');
    let i = pt ? +pt.dataset.i : -1;
    if (i < 0) {
      const [x, y] = this.at(e);
      if (p.some(q => Math.abs(q[0] - x) < 6)) return;
      p.push([x, y]); p.sort((a, b) => a[0] - b[0]); i = p.findIndex(q => q[0] === x);
      this.draw(true);
    }
    this.drag = { i, out: false };
    this.box.setPointerCapture(e.pointerId);
    this.els[i].dataset.held = ''; this.els[i].focus({ preventScroll: true });
    this.say(i);
  }
  move(e) {
    const d = this.drag; if (!d) return;
    const p = this.pts[this.ch], [x, y, r] = this.at(e), last = p.length - 1;
    const lo = d.i === 0 ? 0 : p[d.i - 1][0] + 1, hi = d.i === last ? 255 : p[d.i + 1][0] - 1;
    p[d.i] = [d.i === 0 ? Math.min(x, hi) : d.i === last ? Math.max(x, lo) : clamp(x, lo, hi), y];
    // out of the square (by a finger's width), a middle point is on its way out
    const away = e.clientX < r.left - 24 || e.clientX > r.right + 24 || e.clientY < r.top - 24 || e.clientY > r.bottom + 24;
    d.out = away && d.i > 0 && d.i < last;
    this.els[d.i].toggleAttribute('data-going', d.out);
    this.draw(); this.say(d.i); this.changed('input');
  }
  up() {
    const d = this.drag; if (!d) return;
    this.drag = null;
    this.els[d.i]?.removeAttribute('data-held');
    if (d.out) { this.pts[this.ch].splice(d.i, 1); this.draw(true); this.els[Math.max(0, d.i - 1)]?.focus({ preventScroll: true }); this.say(); }
    this.changed('change');
  }
  key(e) {
    const b = e.target.closest('.curve-pt'); if (!b) return;
    const p = this.pts[this.ch], i = +b.dataset.i, last = p.length - 1, s = e.shiftKey ? 10 : 1;
    const mv = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, s], ArrowDown: [0, -s] }[e.key];
    if (mv) {
      e.preventDefault();
      const lo = i === 0 ? 0 : p[i - 1][0] + 1, hi = i === last ? 255 : p[i + 1][0] - 1;
      p[i] = [clamp(p[i][0] + mv[0], lo, hi), clamp(p[i][1] + mv[1], 0, 255)];
      this.draw(); this.say(i); this.changed('change'); return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && i > 0 && i < last) { e.preventDefault(); p.splice(i, 1); this.draw(true); this.els[i - 1].focus(); this.say(i - 1); this.changed('change'); return; }
    if (e.key === '+' || e.key === 'Insert') {
      e.preventDefault();
      const j = i === last ? i - 1 : i, x = (p[j][0] + p[j + 1][0]) / 2;
      if (p[j + 1][0] - p[j][0] < 4) return;
      p.splice(j + 1, 0, [x, curveFn(p)(x)]); this.draw(true); this.els[j + 1].focus(); this.say(j + 1); this.changed('change'); return;
    }
    if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); this.els[e.key === 'Home' ? 0 : last].focus(); this.say(e.key === 'Home' ? 0 : last); }
  }
}
customElements.define('m-curve', MCurve);

// ── m/src/components/inputs/wheel/wheel.js
/* ════════ m-wheel: a neutral disc ringed by the hues; the puck's way from the middle is the hue it gives, its distance
      how much (0 to 1). Drag it, press anywhere on the disc, or move it by the keys; a double press brings it home.
      label="Shadows" names it. An input inside carries "hue amount" to the form ("40 0.25"); an input.slider inside
      sits under it for its luminance. Says input while it moves and change when it is let go: { hue, amount }. ════════ */
const WHEEL_FACE = 41;   // the face's radius, of the disc's 50
function wheelRing() {
  let d = '';
  for (let i = 0; i < 36; i++) {
    const a0 = (i * 10 - 4.4) * Math.PI / 180, a1 = (i * 10 + 4.4) * Math.PI / 180, R = 50, r = 44.5;
    const P = (rad, a) => `${(rad * Math.cos(a)).toFixed(2)},${(-rad * Math.sin(a)).toFixed(2)}`;
    d += `<path d="M${P(R, a0)}A${R},${R} 0 0 0 ${P(R, a1)}L${P(r, a1)}A${r},${r} 0 0 1 ${P(r, a0)}Z" fill="${hex(.74, .12, i * 10)}"/>`;
  }
  return d;
}
class MWheel extends HTMLElement {
  connectedCallback() {
    if (this.disc) return;
    this.out = this.querySelector('input:not([type=range])');
    const [h0, a0] = (this.out?.value || '0 0').split(/[\s,]+/).map(Number);
    this.hue = ((h0 || 0) % 360 + 360) % 360; this.amt = clamp(a0 || 0);
    if (this.out) { this.out.type = 'hidden'; this.first = this.out.value; }
    const name = this.getAttribute('label') || 'Colour wheel';
    this.disc = h('div', { class: 'wheel-disc' }, `<svg viewBox="-50 -50 100 100" aria-hidden="true">${wheelRing()}<circle class="wheel-face" r="${WHEEL_FACE}"/><path class="wheel-cross" d="M-${WHEEL_FACE},0H${WHEEL_FACE}M0,-${WHEEL_FACE}V${WHEEL_FACE}"/></svg>`);
    this.puck = h('button', { type: 'button', class: 'wheel-puck', role: 'slider', 'aria-label': name, 'aria-valuemin': 0, 'aria-valuemax': 100 });
    this.disc.append(this.puck);
    this.read = h('span', { class: 'wheel-read', 'aria-hidden': 'true' });
    this.prepend(this.disc);
    if (this.hasAttribute('label')) this.disc.before(h('span', { class: 'wheel-name', 'aria-hidden': 'true' }, name));
    this.disc.after(this.read);
    this.disc.addEventListener('pointerdown', e => this.down(e));
    this.disc.addEventListener('pointermove', e => { if (this.drag) this.at(e); });
    this.disc.addEventListener('pointerup', () => this.up());
    this.disc.addEventListener('pointercancel', () => this.up());
    this.disc.addEventListener('dblclick', () => this.set(0, 0, 'change'));
    this.puck.addEventListener('keydown', e => this.key(e));
    this.out?.form?.addEventListener('reset', () => setTimeout(() => { const [a, b] = this.first.split(/[\s,]+/).map(Number); this.set(a || 0, b || 0); }));
    this.draw();
  }
  get value() { return { hue: Math.round(this.hue), amount: +this.amt.toFixed(3) }; }
  set value(v) { this.set(v?.hue ?? 0, v?.amount ?? 0); }
  set(hue, amt, type) { this.hue = ((hue % 360) + 360) % 360; this.amt = clamp(amt); this.draw(); if (type) emit(this, type, this.value); }
  draw() {
    const a = this.hue * Math.PI / 180, r = WHEEL_FACE * this.amt;
    this.puck.style.setProperty('--fx', ((50 + r * Math.cos(a)) / 100).toFixed(4)); this.puck.style.setProperty('--fy', ((50 - r * Math.sin(a)) / 100).toFixed(4));
    this.puck.style.setProperty('--tint', hex(.72, .15 * this.amt, this.hue));
    const words = this.amt < .01 ? 'Neutral' : `${colHueName(this.hue)[0].toUpperCase() + colHueName(this.hue).slice(1)}, ${Math.round(this.hue)}° · ${Math.round(this.amt * 100)} %`;
    this.read.textContent = words;
    this.puck.setAttribute('aria-valuenow', Math.round(this.amt * 100)); this.puck.setAttribute('aria-valuetext', words);
    if (this.out) this.out.value = `${Math.round(this.hue)} ${this.amt.toFixed(2)}`;
  }
  at(e) {
    const r = this.disc.getBoundingClientRect(), R = r.width / 2 * WHEEL_FACE / 50;
    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    this.set((Math.atan2(-dy, dx) * 180 / Math.PI + 360) % 360, Math.hypot(dx, dy) / R, 'input');
  }
  down(e) {
    if (e.button > 0) return;
    e.preventDefault();
    this.drag = true; this.dataset.turning = ''; this.puck.dataset.held = '';
    this.disc.setPointerCapture(e.pointerId); this.puck.focus({ preventScroll: true });
    this.at(e);
  }
  up() { if (!this.drag) return; this.drag = false; delete this.dataset.turning; delete this.puck.dataset.held; emit(this, 'change', this.value); }
  key(e) {
    const s = e.shiftKey ? .12 : .04, d = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, s], ArrowDown: [0, -s] }[e.key];
    if (d) {
      e.preventDefault();
      const a = this.hue * Math.PI / 180, x = this.amt * Math.cos(a) + d[0], y = this.amt * Math.sin(a) + d[1];
      this.set(Math.atan2(y, x) * 180 / Math.PI, Math.hypot(x, y), 'change');
    } else if (e.key === 'Home') { e.preventDefault(); this.set(this.hue, 0, 'change'); }
    else if (e.key === 'PageUp' || e.key === 'PageDown') { e.preventDefault(); this.set(this.hue + (e.key === 'PageUp' ? 10 : -10), this.amt || .2, 'change'); }
  }
}
customElements.define('m-wheel', MWheel);

// ── m/src/components/inputs/ratio/ratio.js
// [data-ratio-turn="#group"] turns the group's shapes between portrait and landscape: each radio's value "4:5" ↔ "5:4"
doc.addEventListener('click', e => {
  const b = e.target.closest('[data-ratio-turn]'); if (!b) return;
  const g = doc.querySelector(b.dataset.ratioTurn); if (!g) return;
  const on = !g.hasAttribute('data-turned');
  g.toggleAttribute('data-turned', on); b.setAttribute('aria-pressed', String(on));
  for (const r of g.querySelectorAll('input[type=radio], [role=radio]')) {
    const isIn = r.tagName === 'INPUT', v = isIn ? r.value : r.dataset.value, m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(v || '');
    if (m && m[1] !== m[2]) { const w = `${m[2]}:${m[1]}`; if (isIn) r.value = w; else r.dataset.value = w; const t = r.closest('label')?.querySelector('.ratio-name'); if (t) t.textContent = w; }
  }
  emit(g, 'change', { turned: on, value: g.querySelector('input:checked')?.value });
});

// ── m/src/components/navigation/header/header.js
/* ════════ data-variant="mega": the nav's buttons are disclosures (the WAI-ARIA disclosure navigation pattern), each
      opening the panel that follows it, under the header, in the top layer. A press opens one (never a hover); Esc, a
      press outside or the focus leaving closes it, and Esc gives the focus back to its button. The arrows move along
      the row (Down, on an open button, into its panel) and within a panel; Home and End go to the first and the last.
      One open at a time, as every popup. ════════ */
function hdrMega(nav) {
  const hdr = nav.closest('.hdr');
  const row = () => [...nav.children].filter(x => x.matches('a[href], button'));
  const apis = new Map();
  for (const b of row()) {
    const p = b.matches('button[aria-controls]') && doc.getElementById(b.getAttribute('aria-controls'));
    if (!p) continue;
    p.setAttribute('popover', 'manual'); p.tabIndex = -1; p.hidden = false;
    const api = {
      get isOpen() { return b.getAttribute('aria-expanded') === 'true'; },
      contains: n => b.contains(n) || p.contains(n),
      // as wide as the header, less a gutter each side, just under it; it follows the header as the page scrolls
      reposition() {
        const r = hdr.getBoundingClientRect();
        Object.assign(p.style, { left: `calc(${r.left}px + var(--gut))`, width: `calc(${r.width}px - 2 * var(--gut))`, top: `${r.bottom + 4}px`, maxHeight: `calc(${innerHeight - r.bottom - 4}px - var(--gut))` });
      },
      open() { opened(api); api.reposition(); p.showPopover(); b.setAttribute('aria-expanded', 'true'); },
      close(refocus = true) {
        if (!api.isOpen) return;
        released(api); if (p.matches(':popover-open')) p.hidePopover(); b.setAttribute('aria-expanded', 'false');
        if (refocus) b.focus({ preventScroll: true });
      },
    };
    apis.set(b, api);
    b.addEventListener('click', () => (api.isOpen ? api.close(false) : api.open()));
    p.addEventListener('click', e => { if (e.target.closest('a[href]')) api.close(false); });
  }
  const shown = () => [...apis.values()].find(a => a.isOpen);
  nav.addEventListener('keydown', e => {
    const t = e.target, open = shown();
    if (e.key === 'Escape') { if (open) { e.preventDefault(); open.close(); } return; }
    const top = row(), i = top.indexOf(t), panel = i < 0 && t.closest('.hdr-panel');
    let to;
    if (e.key === 'ArrowDown' && apis.get(t)?.isOpen) to = $$('a[href], button', doc.getElementById(t.getAttribute('aria-controls')))[0];
    else if (i >= 0 || panel) {
      const list = i >= 0 ? top : $$('a[href], button', panel), k = list.indexOf(t);
      to = { ArrowRight: list[k + 1], ArrowDown: list[k + 1], ArrowLeft: list[k - 1], ArrowUp: list[k - 1], Home: list[0], End: list.at(-1) }[e.key];
    }
    if (to) { e.preventDefault(); to.focus(); }
  });
  // the focus leaving a button and its panel closes it (a press on the panel itself focuses the panel, so it stays)
  nav.addEventListener('focusout', e => { const open = shown(); if (open && !open.contains(e.relatedTarget)) open.close(false); });
}
enhance('.hdr[data-variant=mega] > .nav', once(hdrMega));

/* ════════ .over and data-variant="condensed": --hdr-p goes from 0 to 1 over the first --hdr-settle of the scroll (its
      band comes, a masthead settles). Scroll-driven CSS draws it where the browser can; this is the fallback, on the
      nearest box that scrolls, else the page. Calm, it steps. ════════ */
function hdrSettle(el) {
  if (CSS.supports('animation-timeline: scroll()')) return;
  let box = el.parentElement;
  while (box && box !== doc.body && !/auto|scroll/.test(getComputedStyle(box).overflowY)) box = box.parentElement;
  if (box === doc.body) box = null;
  let raf = 0;
  const read = () => {
    raf = 0;
    const d = parseFloat(getComputedStyle(el).getPropertyValue('--hdr-settle')) || 0, s = box ? box.scrollTop : scrollY;
    el.style.setProperty('--hdr-p', RM.matches || !d ? +(s >= d) : Math.min(1, s / d));
  };
  (box || window).addEventListener('scroll', () => (raf ||= requestAnimationFrame(read)), { passive: true });
  read();
}
enhance('.hdr.over, .hdr[data-variant=condensed]', once(hdrSettle));

// the palette's key as this keyboard has it: the page writes Ctrl K; a Mac reads ⌘K
if (/mac|iphone|ipad/i.test(navigator.userAgentData?.platform || navigator.platform || '')) enhance('.hdr-search kbd', once(k => (k.textContent = k.textContent.replace(/^Ctrl\s*/i, '⌘'))));

// ── m/src/components/navigation/nav/nav.js
/* ── the ink pill: one per row of tabs or links, on the current one; it glides to the next on a spring ── */
function pillOf(row) {
  let p = row.querySelector(':scope > .pill');
  if (!p) { p = h('i', { class: 'pill', 'aria-hidden': 'true' }); row.prepend(p); }
  return p;
}
function movePill(row, el, instant) {
  const p = pillOf(row);
  if (!el) { p.style.opacity = '0'; return; }
  const x = el.offsetLeft, w = el.offsetWidth, hgt = el.offsetHeight;
  if (instant || !p.dataset.placed || RM.matches) { p.style.transition = 'none'; requestAnimationFrame(() => requestAnimationFrame(() => (p.style.transition = ''))); }
  p.style.translate = `${x}px 0`; p.style.width = w + 'px'; p.style.height = hgt + 'px'; p.style.marginTop = -hgt / 2 + 'px'; p.style.opacity = '1';
  p.dataset.placed = '1';
  // a row that scrolls sideways keeps the current one in view
  if (row.scrollWidth > row.clientWidth + 2) row.scrollTo({ left: Math.max(0, x - (row.clientWidth - w) / 2), behavior: instant ? 'auto' : smooth() });
}
/** make el the current one of its row: aria-current moves to it, and the pill follows */
function setCurrent(el) {
  const row = el.parentElement;
  [...row.children].forEach(x => x !== el && x.hasAttribute('aria-current') && x.removeAttribute('aria-current'));
  el.setAttribute('aria-current', el.tagName === 'A' && !el.hash ? 'page' : 'true');
  if (pillRows.has(row)) movePill(row, el);
  emit(row, 'change', { current: el });
}
const pillRows = new Set();
const pillRO = new ResizeObserver(es => es.forEach(e => movePill(e.target, current(e.target), true)));
const current = row => row.querySelector(':scope > [aria-current]:not([aria-current=false]), :scope > [aria-selected=true]');
function pill(row) {
  if (pillRows.has(row)) return;
  pillRows.add(row); pillOf(row);
  movePill(row, current(row), true);
  pillRO.observe(row);
  doc.fonts?.ready.then(() => movePill(row, current(row), true));
  // a row of buttons (not links to other pages, not a spied row): a press makes that one current
  row.addEventListener('click', e => { const b = e.target.closest('button'); if (b?.parentElement === row && !row.hasAttribute('data-spy')) setCurrent(b); });
}

/* ── spy: links to sections in the page (a chapter row, a table of contents) follow the reading line, 40 % down the
      window; a click goes there, natively smooth. The pill follows when the row has one. ── */
function spy(row) {
  if (row.__spy) return; row.__spy = 1;
  const links = $$('a[href^="#"]', row).filter(a => a.hash.length > 1);
  const secs = links.map(a => doc.getElementById(decodeURIComponent(a.hash.slice(1)))).filter(Boolean);
  if (!secs.length) return;
  const set = sec => {
    links.forEach(a => (a.hash.slice(1) === sec?.id ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current')));
    if (row.querySelector(':scope > .pill') || row.matches('[data-pill]')) movePill(row, links.find(a => a.hash.slice(1) === sec?.id));
  };
  // where you are: the last target whose top has passed the reading line, 40 % down the window (the site's nav.js).
  // Read on scroll, in a frame, so a jump (an anchor, Page Down, the calm version) lands on the right one too
  let shown, raf = 0;
  const read = () => {
    raf = 0;
    const line = innerHeight * .4;
    let now = null;
    for (const s of secs) if (s.getBoundingClientRect().top <= line) now = s;
    if (now !== shown) { shown = now; set(now); }
  };
  addEventListener('scroll', () => (raf ||= requestAnimationFrame(read)), { passive: true });
  addEventListener('resize', () => (raf ||= requestAnimationFrame(read)));
  read();
}
enhance('[data-pill]', once(pill));
enhance('[data-spy]', once(spy));
expose({ movePill, setCurrent });

// ── m/src/components/navigation/tabs/tabs.js
/* ════════ m-tabs: a tablist and its panels; arrows move and choose, Home and End ════════ */
class MTabs extends HTMLElement {
  connectedCallback() {
    if (this.list) return;
    this.list = this.querySelector('[role=tablist]');
    if (!this.list) return;
    this.tabs = $$('[role=tab]', this.list);
    const own = $$(':scope > [role=tabpanel]', this);
    this.panels = this.tabs.map((t, i) => (t.getAttribute('aria-controls') && doc.getElementById(t.getAttribute('aria-controls'))) || own[i]);
    this.tabs.forEach((t, i) => {
      ensureId(t, 'tab'); t.type ||= 'button';
      const p = this.panels[i];
      if (p) { t.setAttribute('aria-controls', ensureId(p, 'panel')); p.setAttribute('aria-labelledby', t.id); if (!p.hasAttribute('tabindex')) p.tabIndex = 0; }
      t.addEventListener('click', () => this.select(i));
    });
    this.list.addEventListener('keydown', e => {
      const i = this.tabs.indexOf(doc.activeElement); if (i < 0) return;
      const n = this.tabs.length, v = this.list.getAttribute('aria-orientation') === 'vertical';
      const go = { [v ? 'ArrowDown' : 'ArrowRight']: (i + 1) % n, [v ? 'ArrowUp' : 'ArrowLeft']: (i - 1 + n) % n, Home: 0, End: n - 1 }[e.key];
      if (go === undefined) return;
      e.preventDefault(); this.select(go, true);
    });
    const start = Math.max(0, this.tabs.findIndex(t => t.getAttribute('aria-selected') === 'true'));
    if (!this.hasAttribute('nopill')) pill(this.list);
    this.select(start, false, true);
  }
  get index() { return this.i; }
  select(i, focus = false, first = false) {
    if (i === this.i && !first) return;
    const was = this.i; this.i = i;
    this.tabs.forEach((t, k) => { t.setAttribute('aria-selected', String(k === i)); t.tabIndex = k === i ? 0 : -1; });
    // steady: every panel keeps its room (stacked in one cell), so the tallest sets the height and nothing below moves
    const steady = this.hasAttribute('steady');
    this.panels.forEach((p, k) => {
      if (!p) return;
      if (steady) { p.hidden = false; p.toggleAttribute('data-off', k !== i); p.inert = k !== i; } else p.hidden = k !== i;
      if (k === i && !first && !RM.matches) { p.classList.remove('enter'); void p.offsetWidth; p.classList.add('enter'); }
    });
    if (focus) this.tabs[i].focus();
    if (!this.hasAttribute('nopill')) movePill(this.list, this.tabs[i], first);
    if (!first) emit(this, 'change', { index: i, from: was, tab: this.tabs[i], panel: this.panels[i] });
  }
}
customElements.define('m-tabs', MTabs);

// ── m/src/components/navigation/crumbs/crumbs.js
/* ════════ .crumbs[data-variant=collapse] › li.crumbs-more › button: shows the levels it stood for, and gives the focus
      to the first of them (the button itself goes, so the focus would otherwise be lost) ════════ */
function crumbsMore(b) {
  b.addEventListener('click', () => {
    const li = b.closest('li'), trail = b.closest('.crumbs');
    trail.dataset.open = '';
    li.nextElementSibling?.querySelector('a, [aria-current]')?.focus();
  });
}
enhance('.crumbs-more > button', once(crumbsMore));

// ── m/src/components/navigation/footer/footer.js
/* ════════ .foot[data-variant=sitemap]: under 600 px (the footer's own width) each group's heading takes a button that
      opens its list (the disclosure pattern: aria-expanded, aria-controls); wider, the headings are headings again.
      footer.css folds the lists at the same width before this comes, so nothing moves ════════ */
const FOOT_FOLD = 600;
function footFold(group, on) {
  const head = group.querySelector(':scope > h2'), list = head.nextElementSibling;
  const btn = head.querySelector(':scope > .foot-fold');
  if (on && !btn) {
    const b = h('button', { type: 'button', class: 'foot-fold', 'aria-expanded': 'false', 'aria-controls': ensureId(list, 'foot-l') });
    b.append(...head.childNodes);
    b.insertAdjacentHTML('beforeend', ms('expand_more'));
    head.append(b);
  } else if (!on && btn) {
    btn.lastElementChild.remove();
    head.append(...btn.childNodes);
    btn.remove();
  }
}
enhance('.foot[data-variant=sitemap]', once(foot => {
  foot.addEventListener('click', e => {
    const b = e.target.closest('.foot-fold');
    if (b) b.setAttribute('aria-expanded', String(b.getAttribute('aria-expanded') !== 'true'));
  });
  new ResizeObserver(([e]) => {
    const on = e.contentRect.width < FOOT_FOLD;
    for (const g of foot.querySelectorAll(':scope > .in > :has(> h2 + ul)')) footFold(g, on);
  }).observe(foot);
}));

// ── m/src/components/navigation/rail/rail.js
/* ════════ .rail with a [data-rail-toggle] button: data-expanded="true|false" on the rail, aria-expanded on the button,
      the icon and the name follow. data-remember="key" keeps the choice for the next visit. ════════ */
function rail(nav) {
  const btn = nav.querySelector('[data-rail-toggle]');
  if (!btn) return;
  const key = nav.dataset.remember && `m.rail.${nav.dataset.remember}`;
  const set = (open, quiet) => {
    nav.dataset.expanded = String(open);
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', open ? 'Show icons only' : 'Show names');
    const ic = btn.querySelector('.ms'); if (ic) ic.textContent = open ? 'menu_open' : 'menu';
    if (key) try { localStorage.setItem(key, open ? '1' : '0'); } catch {}
    if (!quiet) emit(nav, 'toggle', { expanded: open });
  };
  let stored = null;
  if (key) try { stored = localStorage.getItem(key); } catch {}
  set(stored != null ? stored === '1' : nav.dataset.expanded === 'true', true);
  btn.addEventListener('click', () => set(nav.dataset.expanded !== 'true'));
}
enhance('.rail', once(rail));

// ── m/src/components/navigation/navbar/navbar.js
/* ════════ .navbar[data-fixed][data-autohide]: scrolling down past the first screen hides it; any scroll up, a focus
      inside it, or the top of the page brings it back ════════ */
function navbarHide(bar) {
  let y0 = scrollY, raf = 0;
  addEventListener('scroll', () => raf ||= requestAnimationFrame(() => {
    raf = 0;
    const y = scrollY, d = y - y0;
    if (Math.abs(d) < 6) return;
    bar.toggleAttribute('data-off', d > 0 && y > innerHeight * .5 && !bar.contains(doc.activeElement));
    y0 = y;
  }), { passive: true });
  bar.addEventListener('focusin', () => bar.removeAttribute('data-off'));
}
enhance('.navbar[data-autohide]', once(navbarHide));

// ── m/src/components/overlays/dialog/dialog.js
/* ════════ dialogs and sheets: [data-open="id"] opens, [data-close] closes; a press on the backdrop or Esc closes,
      after its closing motion ════════ */
function openDialog(d, opener) {
  if (!d || d.open) return;
  d.__opener = opener || doc.activeElement;
  d.showModal();
  emit(d, 'm-open');
}
function closeDialog(d, value = '') {
  if (!d?.open || d.classList.contains('closing')) return;
  const done = () => { d.classList.remove('closing'); d.close(value); };
  if (RM.matches || !d.matches('.dialog, .sheet, .cmdk')) { done(); return; }
  d.classList.add('closing');
  const t = setTimeout(done, 400);
  d.addEventListener('animationend', function f(e) { if (e.target !== d) return; d.removeEventListener('animationend', f); clearTimeout(t); done(); });
}
doc.addEventListener('click', e => {
  const op = e.target.closest('[data-open]');
  if (op) { const d = doc.getElementById(op.dataset.open); if (d?.showModal) { e.preventDefault(); openDialog(d, op); return; } }
  const cl = e.target.closest('[data-close]');
  // (a link that closes its sheet still goes where it points)
  if (cl) { const d = cl.closest('dialog'); if (d) { if (!cl.matches('a[href]')) e.preventDefault(); closeDialog(d, cl.dataset.close); return; } }
  // the backdrop: a press on the dialog element itself, outside its box
  const d = e.target;
  if (d instanceof HTMLDialogElement && d.open && !d.classList.contains('lightbox')) {
    const r = d.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeDialog(d);
  }
});
doc.addEventListener('cancel', e => { if (e.target.matches?.('dialog.dialog, dialog.sheet, dialog.cmdk')) { e.preventDefault(); closeDialog(e.target); } }, true);
expose({ openDialog, closeDialog });

// ── m/src/components/navigation/drawer/drawer.js
/* ════════ .drawer[data-sheet][id]: on a window 900 px or narrower it is hidden where it stands, and any
      [data-drawer="its id"] opens it in a sheet (the same nodes, moved, so what's folded stays folded). A link inside
      closes the sheet; a window that widens puts the drawer back. ════════ */
const drawerNarrow = matchMedia('(max-width: 900px)');
function drawer(nav) {
  if (!nav.id) return;
  const home = doc.createComment(' drawer ');
  nav.before(home);
  let d = null;
  const open = from => {
    if (!drawerNarrow.matches) { nav.querySelector('a[href], button, summary')?.focus(); return; }
    if (!d) {
      const label = nav.getAttribute('aria-label') || 'Menu';
      d = h('dialog', { class: 'sheet drawer-sheet', 'data-side': 'left', 'aria-label': label },
        `<div class="sheet-head"><h2>${esc(label)}</h2><button type="button" class="ib" data-close aria-label="Close">${ms('close')}</button></div><div class="sheet-body"></div>`);
      doc.body.append(d);
      d.addEventListener('close', () => home.after(nav));
      d.addEventListener('click', e => { if (e.target.closest('a[href]')) closeDialog(d); });
    }
    d.querySelector('.sheet-body').append(nav);
    openDialog(d, from);
  };
  doc.addEventListener('click', e => { const b = e.target.closest(`[data-drawer="${CSS.escape(nav.id)}"]`); if (b) { e.preventDefault(); open(b); } });
  drawerNarrow.addEventListener('change', () => { if (!drawerNarrow.matches && d?.open) closeDialog(d); });
}
enhance('.drawer[data-sheet]', once(drawer));

// ── m/src/components/navigation/pagination/pagination.js
/* ════════ <m-pagination pages="12" page="3" label="Results" href="?page={n}">: the first and the last page, the ones
      round this one, gaps between. With href the pages are links; without, buttons, and a press sets page and emits
      change with { page }. Set page or pages from a script and it redraws. ════════ */
function pagesAround(n, p) {
  if (n <= 7) return Array.from({ length: n }, (_, i) => i + 1);
  if (p <= 4) return [1, 2, 3, 4, 5, '…', n];
  if (p >= n - 3) return [1, '…', n - 4, n - 3, n - 2, n - 1, n];
  return [1, '…', p - 1, p, p + 1, '…', n];
}
class MPagination extends HTMLElement {
  static observedAttributes = ['page', 'pages', 'href'];
  connectedCallback() {
    if (!this.wired) {
      this.wired = true;
      this.addEventListener('click', e => {
        const b = e.target.closest('button[data-page]');
        if (!b || b.disabled) return;
        const step = b.dataset.step;
        this.setAttribute('page', b.dataset.page);
        const again = this.querySelector(step ? `[data-step=${step}]:not(:disabled)` : `[data-page="${this.page}"]`) || this.querySelector('[aria-current=page]');
        again?.focus();
        emit(this, 'change', { page: this.page });
      });
    }
    this.render();
  }
  attributeChangedCallback() { if (this.wired) this.render(); }
  get pages() { return Math.max(1, Math.round(+this.getAttribute('pages') || 1)); }
  get page() { return clamp(Math.round(+this.getAttribute('page') || 1), 1, this.pages); }
  render() {
    const n = this.pages, p = this.page, href = this.getAttribute('href');
    const go = (k, cls, label, html, step) => {
      const off = k < 1 || k > n, cur = !step && k === p;
      const a = ` class="${cls}" aria-label="${esc(label)}"${cur ? ' aria-current="page"' : ''}${step ? ` data-step="${step}"` : ''}`;
      return href ? (off ? `<a${a} aria-disabled="true" role="link">${html}</a>` : `<a${a} href="${esc(href.replace('{n}', k))}">${html}</a>`)
        : `<button type="button"${a} data-page="${k}"${off ? ' disabled' : ''}>${html}</button>`;
    };
    const nums = pagesAround(n, p).map(k => k === '…' ? '<span class="pagination-gap" aria-hidden="true">…</span>' : go(k, '', `Page ${k}`, k));
    this.innerHTML = `<nav class="pagination"${this.dataset.size ? ` data-size="${esc(this.dataset.size)}"` : ''} aria-label="${esc(this.getAttribute('label') || 'Pages')}">`
      + go(p - 1, 'pagination-step', 'Previous page', ms('chevron_left'), 'prev') + nums.join('')
      + `<span class="pagination-of" aria-hidden="true">of ${n}</span>` + go(p + 1, 'pagination-step', 'Next page', ms('chevron_right'), 'next') + '</nav>';
  }
}
customElements.define('m-pagination', MPagination);

// ── m/src/components/navigation/tree/tree.js
/* ════════ <m-tree aria-label="…"><ul><li>Name<ul><li>…</li></ul></li></ul></m-tree>
      A nested list becomes a tree: data-open opens a folder, data-icon gives an item its icon, a link in an item makes it a
      place to go (Enter follows it; the one you're on carries aria-current), otherwise items are chosen (aria-selected;
      "multiple" lets several be). Keys: ↓ ↑ move, → opens or goes in, ← closes or goes out, Home, End, Enter, Space, *
      opens every sibling, letters jump. Emits select { item, value } and toggle { item, open }. ════════ */
class MTree extends HTMLElement {
  connectedCallback() {
    if (this.root) return;
    const root = this.querySelector(':scope > ul, :scope > ol');
    if (!root) return;
    this.root = root;
    root.setAttribute('role', 'tree');
    for (const a of ['aria-label', 'aria-labelledby']) if (this.hasAttribute(a)) { root.setAttribute(a, this.getAttribute(a)); this.removeAttribute(a); }
    this.multi = this.hasAttribute('multiple');
    if (this.multi) root.setAttribute('aria-multiselectable', 'true');
    this.links = !!root.querySelector('a[href]');
    const walk = (ul, lv) => {
      for (const li of [...ul.children].filter(x => x.tagName === 'LI')) {
        const sub = li.querySelector(':scope > ul, :scope > ol');
        const row = h('div', { class: 'tree-row' });
        row.append(...[...li.childNodes].filter(n => n !== sub));
        if (li.dataset.icon) row.prepend(h('span', { class: 'ms', 'aria-hidden': 'true' }, li.dataset.icon));
        row.prepend(h('span', { class: 'ms tree-twist', 'aria-hidden': 'true' }, 'expand_more'));
        li.prepend(row);
        li.setAttribute('role', 'treeitem'); li.style.setProperty('--lv', lv); li.tabIndex = -1;
        row.querySelectorAll('a, button, input').forEach(x => (x.tabIndex = -1));
        if (!this.links && !li.hasAttribute('aria-selected')) li.setAttribute('aria-selected', 'false');
        if (sub) { sub.setAttribute('role', 'group'); li.setAttribute('aria-expanded', String(li.hasAttribute('data-open'))); walk(sub, lv + 1); }
        else li.classList.add('tree-leaf');
      }
    };
    walk(root, 1);
    const on = root.querySelector('[role=treeitem]:is([aria-selected=true], [aria-current]:not([aria-current=false]))');
    for (let p = on?.parentElement.closest('[role=treeitem]'); p; p = p.parentElement.closest('[role=treeitem]')) p.setAttribute('aria-expanded', 'true');
    (on || this.shown()[0] || this.items()[0]).tabIndex = 0;
    this.find = typeahead();
    root.addEventListener('click', e => {
      const li = e.target.closest('[role=treeitem]');
      if (!li || !e.target.closest('.tree-row')) return;
      this.focusItem(li);
      const folder = li.hasAttribute('aria-expanded');
      if (e.target.closest('.tree-twist')) { this.toggle(li); return; }
      if (e.target.closest('a[href]')) return;                         // a link goes where it points
      if (this.links) { if (folder) this.toggle(li); return; }
      this.choose(li, e.metaKey || e.ctrlKey);
      if (folder && li.getAttribute('aria-expanded') === 'false') this.toggle(li, true);
    });
    root.addEventListener('keydown', e => this.key(e));
  }
  items() { return $$('[role=treeitem]', this.root); }
  // what the keys can reach: not inside a folded branch, and not hidden (a page filtering the tree hides what doesn't match)
  shown() { return this.items().filter(li => !li.closest('[hidden]') && !li.parentElement.closest('[role=treeitem][aria-expanded=false]')); }
  label(li) { return [...li.querySelector(':scope > .tree-row').childNodes].filter(n => !(n.nodeType === 1 && n.matches('.ms, .tree-n'))).map(n => n.textContent).join('').trim(); }
  focusItem(li) {
    for (const x of this.items()) x.tabIndex = x === li ? 0 : -1;
    li.focus({ preventScroll: true });
    li.querySelector(':scope > .tree-row').scrollIntoView({ block: 'nearest' });
  }
  toggle(li, open = li.getAttribute('aria-expanded') !== 'true') {
    if (!li.hasAttribute('aria-expanded')) return;
    li.setAttribute('aria-expanded', String(open));
    emit(this, 'toggle', { item: li, open });
  }
  choose(li, add) {
    if (this.links) return;
    if (!(this.multi && add)) for (const x of this.items()) if (x !== li) x.setAttribute('aria-selected', 'false');
    li.setAttribute('aria-selected', String(this.multi && add ? li.getAttribute('aria-selected') !== 'true' : true));
    emit(this, 'select', { item: li, value: li.dataset.value ?? this.label(li) });
  }
  key(e) {
    const li = e.target.closest('[role=treeitem]');
    if (!li || e.altKey) return;
    const shown = this.shown(), i = shown.indexOf(li), open = li.getAttribute('aria-expanded');
    const parent = li.parentElement.closest('[role=treeitem]');
    let to = null;
    switch (e.key) {
      case 'ArrowDown': to = shown[i + 1]; break;
      case 'ArrowUp': to = shown[i - 1]; break;
      case 'Home': to = shown[0]; break;
      case 'End': to = shown.at(-1); break;
      case 'ArrowRight': if (open === 'false') this.toggle(li, true); else if (open === 'true') to = li.querySelector('[role=group] > [role=treeitem]'); break;
      case 'ArrowLeft': if (open === 'true') this.toggle(li, false); else to = parent; break;
      case 'Enter': { const a = li.querySelector(':scope > .tree-row a[href]'); if (a) a.click(); else if (open) this.toggle(li); else this.choose(li); break; }
      case ' ': this.choose(li, this.multi); break;
      case '*': for (const s of li.parentElement.children) if (s.getAttribute('aria-expanded') === 'false') this.toggle(s, true); break;
      default: {
        const k = this.find(e.key, shown.map(x => this.label(x)), Math.max(0, i));
        if (k < 0) return;
        to = shown[k];
      }
    }
    e.preventDefault();
    if (to) this.focusItem(to);
  }
}
customElements.define('m-tree', MTree);

// ── m/src/components/surfaces/carousel/carousel.js
/* ════════ <m-carousel aria-label="…" kind="multi|hero"><div class="carousel-track"><a class="carousel-item">…</a>…</div>
      [data-prev] [data-next]</m-carousel>
      Keylines, as M3 has them: multi-browse holds large items, one medium and one small ([L][L][M][S] on a wide window,
      [L][M][S] on a phone); hero holds one large and a small one peeking. An item that leaves shrinks to small at the edge;
      the last stretch of the row blends into the mirror ([S][M][L]), so the last pictures come to the front too. Every
      item keeps a slot of the large size, so scrolling and snapping stay the browser's own. --carousel-large sets the
      large size it aims for. Keys on an item: ← → Home End. Emits change { index } when it comes to rest. ════════ */
const carLerp = (a, b, t) => a + (b - a) * t;
class MCarousel extends HTMLElement {
  connectedCallback() {
    if (this.track || !(this.track = this.querySelector('.carousel-track'))) return;
    this.setAttribute('role', 'region');
    this.setAttribute('aria-roledescription', 'carousel');
    this.items = [...this.track.children].filter(x => !x.classList.contains('carousel-end'));
    // each item's picture and caption go into a face: the face moves, the item keeps its slot (a moving box would move the snap points)
    this.faces = this.items.map(it => { let f = it.querySelector(':scope > .carousel-face'); if (!f) { f = document.createElement('span'); f.className = 'carousel-face'; f.append(...it.childNodes); it.append(f); } return f; });
    this.spacer = this.track.querySelector(':scope > .carousel-end');
    if (!this.spacer) { this.spacer = document.createElement('span'); this.spacer.className = 'carousel-end'; this.spacer.setAttribute('aria-hidden', 'true'); this.track.append(this.spacer); }
    this.s = 0;
    this.prev = this.querySelector('[data-prev]'); this.next = this.querySelector('[data-next]');
    this.prev?.addEventListener('click', () => this.go(Math.round(this.s) - 1));
    this.next?.addEventListener('click', () => this.go(Math.round(this.s) + 1));
    let raf = 0;
    this.track.addEventListener('scroll', () => (raf ||= requestAnimationFrame(() => { raf = 0; this.layout(); })), { passive: true });
    // where it came to rest; an engine without scrollend (Safari) hears it from a pause in the scrolling instead
    // (said once, when it has truly stopped: never in the middle of a drag, whose every step ends a little scroll of its own)
    const ends = 'onscrollend' in window;
    let rest = 0;
    const settled = () => { clearTimeout(rest); rest = setTimeout(() => { if (!drag) emit(this, 'change', { index: Math.round(this.s) }); }, ends ? 80 : 140); };
    this.track.addEventListener(ends ? 'scrollend' : 'scroll', settled, { passive: true });
    this.track.addEventListener('focusin', e => { const i = this.items.indexOf(e.target.closest('.carousel-item')); if (i >= 0) this.go(i); });
    this.track.addEventListener('keydown', e => {
      const i = this.items.indexOf(e.target.closest('.carousel-item'));
      const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: this.items.length - 1 }[e.key];
      if (i < 0 || to === undefined) return;
      e.preventDefault();
      this.items[clamp(to, 0, this.items.length - 1)].focus({ preventScroll: true });
    });
    // a mouse drags it as a finger would (touch and trackpads scroll it themselves); the click that ends a drag opens nothing
    let drag = null;
    this.track.addEventListener('dragstart', e => e.preventDefault());   // no ghost of the picture
    this.track.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse' && e.button === 0) drag = { x: e.clientX, left: this.track.scrollLeft, moved: false, id: e.pointerId }; });
    this.track.addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      if (!drag.moved) {
        if (Math.abs(dx) < 5) return;
        drag.moved = true; this.track.setPointerCapture(e.pointerId); this.track.dataset.dragging = '';
        Object.assign(this.track.style, { scrollSnapType: 'none', scrollBehavior: 'auto' });
      }
      this.track.scrollLeft = drag.left - dx;
    });
    const letGo = e => {
      if (!drag || e.pointerId !== drag.id) return;
      const moved = drag.moved; drag = null;
      if (!moved) return;
      delete this.track.dataset.dragging; Object.assign(this.track.style, { scrollSnapType: '', scrollBehavior: '' });
      this.go(Math.round(this.s));   // it comes to rest on the nearest, as a fling would
      const swallow = ev => { ev.preventDefault(); ev.stopPropagation(); };
      this.track.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => this.track.removeEventListener('click', swallow, { capture: true }), 0);
    };
    this.track.addEventListener('pointerup', letGo);
    this.track.addEventListener('pointercancel', letGo);
    new ResizeObserver(() => this.measure()).observe(this.track);
    this.measure();
  }
  measure() {
    const W = this.track.clientWidth, n = this.items.length;
    if (!W || !n) return;
    const keep = this.s;
    const gap = parseFloat(getComputedStyle(this.track).columnGap) || 8;
    const S = W < 600 ? 40 : 56;
    let nL = 1, L, M;
    if (this.getAttribute('kind') === 'hero') { L = W - S - gap; M = S; }
    else {
      const aim = parseFloat(getComputedStyle(this).getPropertyValue('--carousel-large')) || (W < 600 ? W * .62 : Math.min(540, W * .42));
      nL = clamp(Math.floor((W - S - 2 * gap - aim / 2) / (aim + gap)), 1, 6);
      L = (W - S - (nL + 1) * gap) / (nL + .5); M = L / 2;
    }
    nL = Math.min(nL, n);
    this.k = { W, gap, S, L, M, nL, smax: Math.max(0, n - nL) };
    this.track.style.setProperty('--carousel-slot', `${L}px`);
    this.spacer.style.setProperty('--carousel-end', `${Math.max(0, W - nL * (L + gap))}px`);
    this.track.scrollLeft = keep * (L + gap);
    this.layout();
  }
  /** where each item is, and how wide, when the first large keyline holds item s (mirror: counted from the right edge) */
  arrange(s, mirror) {
    const k = this.k, n = this.items.length;
    const w = d => d >= 0
      ? (d <= k.nL - 1 ? k.L : d <= k.nL ? carLerp(k.L, k.M, d - k.nL + 1) : d <= k.nL + 1 ? carLerp(k.M, k.S, d - k.nL) : k.S)
      : (d >= -1 ? carLerp(k.S, k.L, d + 1) : k.S);
    const ws = Array.from({ length: n }, (_, j) => w(j - s)), x = new Array(n);
    const a = Math.min(Math.floor(s), n - 1);
    x[a] = -(s - a) * (k.S + k.gap);
    for (let j = a + 1; j < n; j++) x[j] = x[j - 1] + ws[j - 1] + k.gap;
    for (let j = a - 1; j >= 0; j--) x[j] = x[j + 1] - ws[j] - k.gap;
    // never leave room past the last item while there are items off the near edge to fill it
    const room = Math.min(k.W - (x[n - 1] + ws[n - 1]), -x[0]);
    if (room > 0) for (let j = 0; j < n; j++) x[j] += room;
    const out = new Array(n);
    for (let j = 0; j < n; j++) out[mirror ? n - 1 - j : j] = { w: ws[j], x: mirror ? k.W - x[j] - ws[j] : x[j] };
    return out;
  }
  layout() {
    const k = this.k;
    if (!k) return;
    const sl = this.track.scrollLeft, s = clamp(sl / (k.L + k.gap), 0, k.smax);
    this.s = s;
    // the row's start arrangement, blended into the mirror over its last slot
    const A = this.arrange(s, false), t = k.smax >= 1 ? clamp(s - (k.smax - 1)) : 0, B = t > 0 ? this.arrange(k.smax - s, true) : null;
    this.faces.forEach((it, j) => {
      const w = B ? carLerp(A[j].w, B[j].w, t) : A[j].w, x = B ? carLerp(A[j].x, B[j].x, t) : A[j].x;
      const cut = (k.L - w) / 2;
      it.style.translate = `${(sl + x - j * (k.L + k.gap) - cut).toFixed(1)}px 0`;
      it.style.setProperty('--cut', `${cut.toFixed(1)}px`);
      it.style.setProperty('--cap', (k.L > k.M ? clamp((w - k.M) / (k.L - k.M)) ** 2 : 1).toFixed(3));
    });
    if (this.prev) this.prev.disabled = s <= .02;
    if (this.next) this.next.disabled = s >= k.smax - .02;
  }
  go(i) {
    const k = this.k;
    if (k) this.track.scrollTo({ left: clamp(i, 0, k.smax) * (k.L + k.gap), behavior: smooth() });
  }
}
customElements.define('m-carousel', MCarousel);

// ── m/src/components/surfaces/justified/justified.js
/* ════════ .justified > *: each item's --ar is its shape (width ÷ height). Written by hand, or read here from the
      picture's width and height attributes, or from the picture itself once it has loaded. ════════ */
function justifiedItem(it) {
  if (it.style.getPropertyValue('--ar')) return;
  const img = it.matches('img') ? it : it.querySelector('img');
  if (!img) return;
  const set = (w, h) => w && h && it.style.setProperty('--ar', (w / h).toFixed(4));
  set(+img.getAttribute('width'), +img.getAttribute('height'));
  if (!it.style.getPropertyValue('--ar')) { if (img.complete && img.naturalWidth) set(img.naturalWidth, img.naturalHeight); else img.addEventListener('load', () => set(img.naturalWidth, img.naturalHeight), { once: true }); }
}
enhance('.justified > *', once(justifiedItem));

// ── m/src/components/data/table/table.js
/* ════════ a <button> in a <th> sorts the body by its column; aria-sort says which way, a quiet line says it aloud.
      A cell's data-value is what it sorts by (else its text): a column of numbers sorts as numbers (£, signs, units and
      thousands allowed), dates and times as they read, words as words. Empty cells stay last. A row marked data-detail
      travels with the row above it (the data grid's rows that open). ════════ */
const tableCollate = new Intl.Collator('en-GB', { numeric: true, sensitivity: 'base' });
// a number, perhaps signed, in pounds, with thousands and a unit after it ("−0.3 EV", "£12.50", "1,204 frames"); "3 Nov, 07:41" is not
const tableNum = v => {
  const s = v.replace(/^\+/, '').replace(/^[−–]/, '-').replace(/^(-?)\s*[£$€]\s*/, '$1');
  const m = s.match(/^-?\d[\d,   ]*(?:\.\d+)?/);
  return !m || /\d/.test(s.slice(m[0].length)) ? NaN : +m[0].replace(/[,   ]/g, '');
};
const tableWhen = /^\d{4}-\d\d|^\d{1,2}:\d\d/;
const tableValue = cell => (cell?.dataset.value ?? cell?.textContent ?? '').trim();

function sortTable(table, col, dir) {
  const body = table.tBodies[0];
  if (!body) return;
  const groups = [];
  for (const row of body.rows) { if (row.hasAttribute('data-detail') && groups.length) groups.at(-1).push(row); else groups.push([row]); }
  const vals = groups.map(g => tableValue(g[0].cells[col]));
  const filled = vals.filter(Boolean);
  const kind = filled.length && filled.every(v => !tableWhen.test(v) && Number.isFinite(tableNum(v))) ? 'num' : filled.length && filled.every(v => tableWhen.test(v)) ? 'when' : 'text';
  const sign = dir === 'descending' ? -1 : 1;
  const order = groups.map((g, i) => i).sort((a, b) => {
    const x = vals[a], y = vals[b];
    if (!x || !y) return !x - !y;                                   // empty last, either way
    return sign * (kind === 'num' ? tableNum(x) - tableNum(y) : tableCollate.compare(x, y));
  });
  body.append(...order.flatMap(i => groups[i]));
  return kind;
}

function sortable(table) {
  const heads = [...(table.tHead?.rows[0]?.cells || [])].filter(th => th.querySelector(':scope > button:not([data-nosort])'));
  if (!heads.length) return;
  const say = h('span', { class: 'vh', 'aria-live': 'polite' });
  table.after(say);
  heads.forEach(th => th.querySelector(':scope > button').addEventListener('click', () => {
    const dir = th.getAttribute('aria-sort') === 'ascending' ? 'descending' : 'ascending';
    for (const o of heads) if (o !== th) o.removeAttribute('aria-sort');
    th.setAttribute('aria-sort', dir);
    const kind = sortTable(table, th.cellIndex, dir);
    const words = { num: ['smallest first', 'largest first'], when: ['earliest first', 'latest first'], text: ['A to Z', 'Z to A'] }[kind || 'text'];
    say.textContent = `Sorted by ${th.textContent.trim()}, ${words[dir === 'ascending' ? 0 : 1]}`;
    emit(table, 'sort', { column: th.cellIndex, direction: dir });
  }));
}
enhance('table.table', once(sortable));
expose({ sortTable });

// ── m/src/components/data/datagrid/datagrid.js
/* ════════ <m-datagrid> round a .datagrid-bar, a .datagrid-bulk and a table.table (sorting is the table's own).
      Rows are chosen by the checkbox in their .datagrid-pick cell (Shift chooses a run; the head's checks them all);
      the bulk bar shows while any are, its [data-bulk-count] saying how many, [data-bulk-clear] letting go.
      [data-density-set="comfortable|compact"] sets the density; a menu item or checkbox with data-col-toggle="key"
      shows or hides the column whose th has data-col="key"; [data-detail-toggle] opens the tr[data-detail] under its row.
      Keys: the arrows move cell to cell (one tab stop for the whole grid), Home and End, Ctrl+Home and Ctrl+End,
      Page Up and Down, Space chooses the row, Ctrl+A chooses every row, Esc lets them go.
      Edited in place: a th[data-edit="text|number"] makes its column's cells editable (or one td[data-edit]). Enter, F2,
      a double press or simply typing opens the cell; Enter or leaving it keeps the value, Esc puts the old one back; a
      number column refuses what isn't a number. The cell's data-value follows, so the table still sorts by it.
      Resized: on m-datagrid[resizable], every th[data-col] has an edge to drag (a double press gives the column its own
      width back), and Alt+← Alt+→ on a head cell make it 16 px narrower or wider.
      Emits select { rows }, column { key, shown }, density { density }, edit { row, key, value, was }, resize { key, width }. ════════ */
const DG_WIDGET = 'a[href], button, input, select, textarea';
class MDatagrid extends HTMLElement {
  connectedCallback() {
    if (this.table || !(this.table = this.querySelector('table'))) return;
    const t = this.table;
    t.setAttribute('role', 'grid');
    this.editing = null;
    if (this.hasAttribute('resizable')) this.resizable();
    t.addEventListener('dblclick', e => { const c = e.target.closest('td'); if (c && this.editable(c)) this.edit(c); });
    this.all = t.tHead?.querySelector('.datagrid-pick input[type=checkbox]');
    if (this.all) { t.setAttribute('aria-multiselectable', 'true'); for (const r of this.rows()) r.setAttribute('aria-selected', String(!!this.box(r)?.checked)); }
    this.bulk = this.querySelector('.datagrid-bulk');
    this.wrap = t.closest('.datagrid-wrap, .table-wrap');
    // every cell and the one widget in it leave the tab order: the grid is one stop, the arrows do the rest
    for (const c of this.cellsAll()) { const w = this.target(c); w.tabIndex = -1; if (w !== c) c.removeAttribute('tabindex'); }
    const first = this.navRows()[0] && this.cells(this.navRows()[0])[0];
    if (first) this.rove(this.target(first));
    // rows a page adds later leave the tab order as the first ones did; if the one stop went with a row, the first cell takes it
    new MutationObserver(() => {
      for (const c of this.cellsAll()) { const w = this.target(c); if (w !== this.cur && w.tabIndex !== -1) { w.tabIndex = -1; if (w !== c) c.removeAttribute('tabindex'); } }
      if (!this.cur?.isConnected) { const f = this.navRows()[0] && this.cells(this.navRows()[0])[0]; if (f) this.rove(this.target(f)); }
    }).observe(t, { childList: true, subtree: true });
    this.addEventListener('click', e => this.click(e));
    this.addEventListener('change', e => {
      if (e.target === this.all) { for (const r of this.rows()) { const b = this.box(r); if (b) b.checked = this.all.checked; } this.update(); }
      else if (e.target.closest('tbody .datagrid-pick')) this.update();
      else if (e.target.matches('input[data-col-toggle]')) this.column(e.target.dataset.colToggle, e.target.checked);
    });
    this.addEventListener('select', e => { const it = e.detail?.item; if (it?.dataset.colToggle) this.column(it.dataset.colToggle, it.getAttribute('aria-checked') === 'true'); });
    t.addEventListener('keydown', e => this.key(e));
    t.addEventListener('focusin', e => { const c = e.target.closest('td, th'); if (c && !c.closest('tr[data-detail]')) this.rove(this.target(c)); });
    this.wrap?.addEventListener('scroll', () => this.wrap.toggleAttribute('data-scrolled', this.wrap.scrollLeft > 2), { passive: true });
    new ResizeObserver(() => this.stick()).observe(t);
    this.update(true);
  }
  rows() { return [...(this.table.tBodies[0]?.rows || [])].filter(r => !r.hasAttribute('data-detail')); }
  navRows() { return [...this.table.rows].filter(r => !r.hidden && !r.hasAttribute('data-detail')); }
  cells(r) { return [...r.cells].filter(c => !c.hidden); }
  cellsAll() { return this.navRows().flatMap(r => this.cells(r)); }
  box(r) { return r.querySelector('.datagrid-pick input[type=checkbox]'); }
  target(c) { const w = c.querySelectorAll(DG_WIDGET); return w.length === 1 ? w[0] : c; }
  rove(el) { if (this.cur && this.cur !== el) this.cur.tabIndex = -1; el.tabIndex = 0; this.cur = el; }
  go(c) { const el = this.target(c); this.rove(el); el.focus({ preventScroll: true }); c.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }

  update(quiet) {
    const rows = this.rows(), on = rows.filter(r => this.box(r)?.checked);
    if (this.all) {
      rows.forEach(r => r.setAttribute('aria-selected', String(on.includes(r))));
      this.all.checked = on.length > 0 && on.length === rows.length;
      this.all.indeterminate = on.length > 0 && on.length < rows.length;
    }
    if (this.bulk) {
      this.bulk.hidden = !on.length;
      const n = this.bulk.querySelector('[data-bulk-count]');
      if (n) n.textContent = `${on.length} chosen`;
    }
    if (!quiet) emit(this, 'select', { rows: on });
  }
  choose(rows, v) { for (const r of rows) { const b = this.box(r); if (b) b.checked = v; } this.update(); }
  click(e) {
    const b = e.target.closest('tbody .datagrid-pick input[type=checkbox]');
    if (b) {
      const rows = this.rows(), i = rows.indexOf(b.closest('tr'));
      if (e.shiftKey && this.last != null) { const [a, z] = [Math.min(i, this.last), Math.max(i, this.last)]; for (const r of rows.slice(a, z + 1)) this.box(r).checked = b.checked; }
      this.last = i;
      return;
    }
    const d = e.target.closest('[data-detail-toggle]');
    if (d) {
      const row = d.closest('tr'), more = row.nextElementSibling;
      if (!more?.hasAttribute('data-detail')) return;
      more.hidden = !more.hidden;
      d.setAttribute('aria-expanded', String(!more.hidden));
      d.setAttribute('aria-controls', ensureId(more, 'dg-more'));
      return;
    }
    const s = e.target.closest('[data-density-set]');
    if (s) {
      this.dataset.density = s.dataset.densitySet;
      for (const o of this.querySelectorAll('[data-density-set]')) o.setAttribute(o.getAttribute('role') === 'radio' ? 'aria-checked' : 'aria-pressed', String(o === s));
      emit(this, 'density', { density: s.dataset.densitySet });
      requestAnimationFrame(() => this.stick());
      return;
    }
    if (e.target.closest('[data-bulk-clear]')) { this.choose(this.rows(), false); this.all?.focus(); }
  }
  column(key, shown) {
    const th = this.table.tHead?.querySelector(`[data-col="${CSS.escape(key)}"]`);
    if (!th) return;
    const i = th.cellIndex;
    for (const r of this.table.rows) if (!r.hasAttribute('data-detail') && r.cells[i]) r.cells[i].hidden = !shown;
    const n = this.cells(this.table.tHead.rows[0]).length;
    for (const r of this.table.querySelectorAll('tr[data-detail]')) if (r.cells[0]) r.cells[0].colSpan = n;
    for (const c of this.table.querySelectorAll('[data-col-toggle]')) if (c.dataset.colToggle === key && c.matches('input')) c.checked = shown;
    this.stick();
    emit(this, 'column', { key, shown });
  }
  /** the choice and the first column stay at the left: each sticky cell is told how far in it sits */
  stick() {
    const head = this.table.tHead?.rows[0];
    if (!head) return;
    const n = this.all ? 2 : 1, cols = this.cells(head).slice(0, n);
    let left = 0;
    const at = cols.map(c => { const l = left; left += c.getBoundingClientRect().width; return [c.cellIndex, l]; });
    for (const r of this.table.rows) {
      if (r.hasAttribute('data-detail')) continue;
      at.forEach(([i, l], k) => { const c = r.cells[i]; if (!c) return; c.dataset.sticky = ''; c.style.setProperty('--sticky-left', `${l}px`); c.toggleAttribute('data-sticky-edge', k === at.length - 1); });
    }
  }
  /** the kind of edit a cell takes (from its own data-edit or its column's), or '' */
  editable(c) {
    if (c.tagName !== 'TD' || c.closest('tr[data-detail]') || this.target(c) !== c) return '';
    const th = this.table.tHead?.rows[0]?.cells[c.cellIndex];
    return c.dataset.edit ?? th?.dataset.edit ?? '';
  }
  edit(c, typed) {
    if (this.editing) return;
    const kind = this.editable(c), was = c.textContent.trim();
    const th = this.table.tHead?.rows[0]?.cells[c.cellIndex], row = c.parentElement.querySelector('th[scope=row]')?.textContent.trim() || '';
    const inp = document.createElement('input');
    Object.assign(inp, { className: 'datagrid-input', type: 'text', value: typed ?? was });
    if (kind === 'number') inp.inputMode = 'decimal';
    inp.setAttribute('aria-label', `${th?.textContent.trim() || 'Value'}${row ? ', ' + row : ''}`);
    this.editing = { c, was, inp, kind };   // (while it's open the cell holds an input, so its kind is kept here)
    c.dataset.editing = '';
    c.replaceChildren(inp);
    inp.focus();
    if (typed == null) inp.select(); else inp.setSelectionRange(inp.value.length, inp.value.length);
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); if (this.commit()) { const rows = this.navRows(), r = rows.indexOf(c.parentElement); this.go(this.cells(rows[Math.min(r + 1, rows.length - 1)])[this.cells(c.parentElement).indexOf(c)] || c); } }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.cancel(); }
      e.stopPropagation();
    });
    inp.addEventListener('blur', () => this.editing?.inp === inp && this.commit(true));
  }
  /** keep what was typed; false (and the cell stays open, marked) if a number column was given something else */
  commit(leaving) {
    const ed = this.editing; if (!ed) return true;
    const { c, was, inp, kind } = ed;
    let v = inp.value.trim();
    if (kind === 'number' && v !== '' && !Number.isFinite(+v.replace(/,/g, ''))) {
      inp.setAttribute('aria-invalid', 'true');
      if (leaving) { this.cancel(); return false; }   // walking away from a wrong number keeps the old one
      inp.focus(); return false;
    }
    if (kind === 'number' && v !== '') v = String(+v.replace(/,/g, ''));
    this.editing = null; delete c.dataset.editing;
    c.textContent = v;
    if (kind === 'number') c.dataset.value = v; else delete c.dataset.value;
    const key = this.table.tHead?.rows[0]?.cells[c.cellIndex]?.dataset.col || String(c.cellIndex);
    if (v !== was) emit(this, 'edit', { row: c.parentElement, key, value: v, was });
    if (!leaving) this.go(c);
    return true;
  }
  cancel() {
    const ed = this.editing; if (!ed) return;
    this.editing = null; delete ed.c.dataset.editing;
    ed.c.textContent = ed.was;
    this.go(ed.c);
  }
  /** each th[data-col] gets an edge to drag; the widths live in one small stylesheet of the grid's own */
  resizable() {
    ensureId(this, 'm-dg');
    this.widths = new Map();
    this.sheet = document.createElement('style');
    this.prepend(this.sheet);
    for (const th of this.table.tHead?.rows[0]?.cells || []) {
      if (!th.dataset.col) continue;
      const edge = document.createElement('span');
      edge.className = 'datagrid-resize'; edge.setAttribute('aria-hidden', 'true');
      th.append(edge);
      edge.addEventListener('pointerdown', e => {
        e.preventDefault(); e.stopPropagation();
        edge.setPointerCapture(e.pointerId);
        const x0 = e.clientX, w0 = th.getBoundingClientRect().width;
        th.dataset.resizing = '';
        let moved = false;
        const move = ev => { if (!moved && Math.abs(ev.clientX - x0) < 2) return; moved = true; this.width(th, w0 + ev.clientX - x0, true); };
        const up = () => { edge.removeEventListener('pointermove', move); delete th.dataset.resizing; if (moved) emit(this, 'resize', { key: th.dataset.col, width: this.widths.get(th.cellIndex) }); };   // a press that didn't move resized nothing
        edge.addEventListener('pointermove', move);
        edge.addEventListener('pointerup', up, { once: true });
        edge.addEventListener('pointercancel', up, { once: true });
      });
      edge.addEventListener('dblclick', e => { e.stopPropagation(); this.widths.delete(th.cellIndex); this.paint(); this.stick(); emit(this, 'resize', { key: th.dataset.col, width: null }); });
      edge.addEventListener('click', e => e.stopPropagation());   // an edge press never sorts
    }
  }
  width(th, w, quiet) {
    w = Math.round(clamp(w, 56, 640));
    this.widths.set(th.cellIndex, w);
    this.paint(); this.stick();
    if (!quiet) emit(this, 'resize', { key: th.dataset.col, width: w });
  }
  paint() {
    this.sheet.textContent = [...this.widths].map(([i, w]) => `#${CSS.escape(this.id)} table tr:not([data-detail]) > :nth-child(${i + 1}) { width: ${w}px; min-width: ${w}px; max-width: ${w}px; overflow: hidden; text-overflow: ellipsis; }`).join('\n');
  }
  key(e) {
    const c = e.target.closest('td, th');
    if (!c || c.closest('tr[data-detail]')) return;
    // Alt+← Alt+→ on a head cell: its column narrower or wider
    if (e.altKey && this.sheet && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && c.closest('thead') && c.dataset.col) {
      e.preventDefault(); this.width(c, c.getBoundingClientRect().width + (e.key === 'ArrowRight' ? 16 : -16)); return;
    }
    if (e.altKey) return;
    if (e.target.matches('select, textarea, input:not([type=checkbox], [type=radio])')) return;
    // a cell that takes an edit opens on Enter or F2, or on the first letter typed into it
    if (this.editable(c) && e.target === c) {
      if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); this.edit(c); return; }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && e.key !== ' ') { e.preventDefault(); this.edit(c, e.key); return; }
    }
    const rows = this.navRows(), r = rows.indexOf(c.parentElement), cs = this.cells(rows[r]), i = cs.indexOf(c);
    const mod = e.ctrlKey || e.metaKey;
    let to = null;
    switch (e.key) {
      case 'ArrowRight': to = [r, i + 1]; break;
      case 'ArrowLeft': to = [r, i - 1]; break;
      case 'ArrowDown': to = [r + 1, i]; break;
      case 'ArrowUp': to = [r - 1, i]; break;
      case 'Home': to = mod ? [0, 0] : [r, 0]; break;
      case 'End': to = mod ? [rows.length - 1, 1e9] : [r, 1e9]; break;
      case 'PageDown': to = [r + 10, i]; break;
      case 'PageUp': to = [r - 10, i]; break;
      case 'a': case 'A': if (!mod || !this.all) return; this.choose(this.rows(), true); e.preventDefault(); return;
      case 'Escape': if (!this.all || !this.rows().some(x => this.box(x)?.checked)) return; this.choose(this.rows(), false); e.preventDefault(); return;
      case ' ': { const row = c.closest('tbody tr'); if (!row || e.target.matches('button, a, input')) return; const b = this.box(row); if (b) { b.checked = !b.checked; this.update(); } e.preventDefault(); return; }
      default: return;
    }
    e.preventDefault();
    const row = rows[clamp(to[0], 0, rows.length - 1)], rc = this.cells(row);
    this.go(rc[clamp(to[1], 0, rc.length - 1)]);
  }
}
customElements.define('m-datagrid', MDatagrid);

// ── m/src/components/data/sparkline/sparkline.js
/* ════════ <m-sparkline values="12,14,9,18" labels="Mon,Tue,Wed,Thu" unit="photographs" label="Photographs a day">
      The line in the quiet ink, the latest point in ink; area adds a wash under it. A slider through its points: the
      pointer or the arrow keys show each one's value and label, and a table (for screen readers) holds them all.
      data-variant="bars": a column for each value, from zero (counts: a day's photographs). Set values later and it
      redraws. ════════ */
class MSparkline extends HTMLElement {
  static observedAttributes = ['values', 'labels', 'data-variant'];
  connectedCallback() {
    if (this.wired) return;
    this.wired = true;
    this.tabIndex = 0;
    this.setAttribute('role', 'slider');
    this.addEventListener('pointermove', e => { const r = this.getBoundingClientRect(), f = (e.clientX - r.left) / r.width, n = this.v.length; this.show(this.bars ? Math.floor(f * n) : Math.round(f * (n - 1))); });
    this.addEventListener('pointerleave', () => { if (document.activeElement !== this) this.removeAttribute('data-on'); });
    this.addEventListener('focus', () => this.show(this.i ?? this.v.length - 1));
    this.addEventListener('blur', () => this.removeAttribute('data-on'));
    this.addEventListener('keydown', e => {
      const to = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
      const at = e.key === 'Home' ? 0 : e.key === 'End' ? this.v.length - 1 : to != null ? (this.i ?? this.v.length - 1) + to : null;
      if (at == null) return;
      e.preventDefault(); this.show(at);
    });
    this.render();
  }
  attributeChangedCallback() { if (this.wired) this.render(); }
  render() {
    this.v = (this.getAttribute('values') || '').split(',').map(Number).filter(Number.isFinite);
    this.l = (this.getAttribute('labels') || '').split(',').map(s => s.trim());
    const v = this.v, n = v.length;
    if (n < 2) { this.innerHTML = ''; return; }
    const lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1;
    // a little room above and below, so the line never touches the edges
    this.ys = v.map(x => 8 + (1 - (x - lo) / span) * 84);
    const pts = this.ys.map((y, i) => `${i ? 'L' : 'M'}${i} ${y.toFixed(2)}`).join('');
    const area = this.hasAttribute('area') ? `<path class="spark-area" d="${pts}L${n - 1} 100L0 100Z"/>` : '';
    const unit = this.getAttribute('unit') || '';
    // bars stand from zero: a count's columns, as tall as their share of the highest
    this.bars = this.dataset.variant === 'bars';
    const plot = this.bars
      ? `<span class="spark-bars" aria-hidden="true">${v.map(x => `<i style="--h: ${(Math.max(0, x) / (Math.max(hi, 0) || 1)).toFixed(3)}"></i>`).join('')}</span>`
      : `<svg viewBox="0 0 ${n - 1} 100" preserveAspectRatio="none" aria-hidden="true">${area}<path class="spark-line" d="${pts}"/></svg>`;
    this.innerHTML = plot
      + `<span class="spark-dot" aria-hidden="true" style="--x: 100%; --y: ${this.ys[n - 1]}%"></span><span class="spark-dot at" aria-hidden="true"></span><span class="spark-cross" aria-hidden="true"></span><span class="spark-tip" aria-hidden="true"></span>`
      // (hidden inside a div: a table won't shrink below its own width, so hidden itself it pushed a phone page sideways)
      + `<div class="vh"><table><caption>${esc(this.getAttribute('label') || 'Trend')}</caption><tbody>${v.map((x, i) => `<tr><th scope="row">${esc(this.l[i] || i + 1)}</th><td>${x.toLocaleString('en-GB')} ${esc(unit)}</td></tr>`).join('')}</tbody></table></div>`;
    const first = v[0], last = v[n - 1], ch = first ? Math.round((last - first) / Math.abs(first) * 100) : 0;
    this.setAttribute('aria-label', `${this.getAttribute('label') || 'Trend'}: ${last.toLocaleString('en-GB')} ${unit}, ${ch > 0 ? 'up' : ch < 0 ? 'down' : 'level'}${ch ? ` ${Math.abs(ch)} %` : ''} since ${this.l[0] || 'the start'}`.trim());
    this.setAttribute('aria-valuemin', '0'); this.setAttribute('aria-valuemax', String(n - 1));
    if (this.i != null) this.i = Math.min(this.i, n - 1);
    const at = this.i ?? n - 1;
    this.setAttribute('aria-valuenow', String(at));
    this.setAttribute('aria-valuetext', `${this.l[at] ? this.l[at] + ': ' : ''}${v[at].toLocaleString('en-GB')} ${unit}`.trim());
  }
  show(i) {
    const n = this.v.length;
    if (n < 2) return;
    i = this.i = clamp(i, 0, n - 1);
    const unit = this.getAttribute('unit') || '', bar = this.bars && this.querySelector('.spark-bars').children[i];
    const x = bar ? (bar.offsetLeft + bar.offsetWidth / 2) / (this.offsetWidth || 1) * 100 : i / (n - 1) * 100;
    this.style.setProperty('--x', `${x}%`);
    if (this.bars) this.querySelectorAll('.spark-bars > i').forEach((b, k) => b.toggleAttribute('data-at', k === i));
    const dot = this.querySelector('.spark-dot.at'); dot.style.setProperty('--x', `${x}%`); dot.style.setProperty('--y', `${this.ys[i]}%`);
    const tip = this.querySelector('.spark-tip');
    tip.innerHTML = `<b>${this.v[i].toLocaleString('en-GB')}${unit ? ' ' + esc(unit) : ''}</b>${this.l[i] ? `<span>${esc(this.l[i])}</span>` : ''}`;
    const w = this.getBoundingClientRect().width, half = tip.offsetWidth / 2, px = x / 100 * w;
    this.style.setProperty('--tx', `${clamp(px, Math.min(half, w / 2), Math.max(w - half, w / 2))}px`);
    this.dataset.on = '';
    this.setAttribute('aria-valuenow', String(i));
    this.setAttribute('aria-valuetext', `${this.l[i] ? this.l[i] + ': ' : ''}${this.v[i].toLocaleString('en-GB')} ${unit}`.trim());
  }
}
customElements.define('m-sparkline', MSparkline);

// ── m/src/components/data/bars/bars.js
/* ════════ .bars > li[data-value]: each bar's --v is its value over the largest (or the list's data-max), unless the
      page set --v itself. A value written later (data-value) is followed. ════════ */
function barsList(list) {
  const set = () => {
    const items = [...list.children].filter(li => li.dataset.value != null);
    if (!items.length) return;
    const max = +list.dataset.max || Math.max(...items.map(li => +li.dataset.value || 0)) || 1;
    for (const li of items) if (!li.style.getPropertyValue('--v') || li.dataset.auto != null) { li.dataset.auto = ''; li.style.setProperty('--v', String(Math.max(0, +li.dataset.value || 0) / max)); }
  };
  set();
  new MutationObserver(set).observe(list, { subtree: true, attributes: true, attributeFilter: ['data-value'], childList: true });
}
enhance('.bars', once(barsList));

// ── m/src/components/data/meter/meter.js
/* ════════ .meter with role="meter", aria-valuenow, aria-valuemin, aria-valuemax: --v follows the value; data-warn and
      data-danger (values, not fractions) set data-level, and with it the colour and any .meter-note[data-when].
      A value set later is followed. ════════ */
function meter(el) {
  const m = el.matches('[role=meter]') ? el : el.querySelector('[role=meter]');
  if (!m) return;
  const set = () => {
    const lo = +(m.getAttribute('aria-valuemin') ?? 0), hi = +(m.getAttribute('aria-valuemax') ?? 1), v = +(m.getAttribute('aria-valuenow') ?? 0);
    el.style.setProperty('--v', String(Math.min(1, Math.max(0, (v - lo) / ((hi - lo) || 1)))));
    const warn = el.dataset.warn, danger = el.dataset.danger;
    el.dataset.level = danger != null && v >= +danger ? 'danger' : warn != null && v >= +warn ? 'warn' : 'ok';
  };
  set();
  new MutationObserver(set).observe(m, { attributes: true, attributeFilter: ['aria-valuenow', 'aria-valuemax', 'aria-valuemin'] });
}
enhance('.meter:not(.parts)', once(meter));

// ── m/src/components/data/heatmap/heatmap.js
/* ════════ <m-heatmap start="2025-11-03" unit="photographs" label="Photographs a day"> with the values as a JSON array
      in a <script type="application/json"> inside (or values="0,3,1,…"): a square for each day from start, a week to a
      column, Monday first. Five steps by the year's own spread (an empty day apart from them). The grid is a slider
      through the days: the pointer or the keys (← → a week, ↑ ↓ a day, Home, End, Page Up and Down four weeks) show
      each day's number; Enter or a press emits select { date, value }. A table under it gives each month. ════════ */
const hmFull = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const hmMonth = new Intl.DateTimeFormat('en-GB', { month: 'short' });
const hmMonthYear = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' });
class MHeatmap extends HTMLElement {
  static observedAttributes = ['values', 'start'];
  connectedCallback() {
    if (this.wired) return;
    this.wired = true;
    const data = this.querySelector('script[type="application/json"]');
    if (data) { try { this.json = JSON.parse(data.textContent); } catch { this.json = []; } }
    this.render();
  }
  attributeChangedCallback() { if (this.wired) { this.json = null; this.render(); } }
  render() {
    const v = this.json || (this.getAttribute('values') || '').split(',').map(Number).filter(Number.isFinite);
    const [y, m, d] = (this.getAttribute('start') || '').split('-').map(Number);
    if (!v.length || !y) return;
    this.v = v;
    this.day = i => new Date(y, m - 1, d + i);
    const unit = this.getAttribute('unit') || '', label = this.getAttribute('label') || 'A year in days';
    // five steps by the spread of the days that have something: each a fifth of them
    const on = v.filter(x => x > 0).sort((a, b) => a - b), q = k => on[Math.min(on.length - 1, Math.floor(on.length * k))] ?? 1;
    const cuts = [q(.2), q(.4), q(.6), q(.8)];
    const lvl = x => (x <= 0 ? 0 : 1 + cuts.filter(c => x > c).length);
    const lead = (this.day(0).getDay() + 6) % 7;                       // Monday first
    const months = [];
    for (let i = 0; i < v.length; i++) { const t = this.day(i); if (t.getDate() === 1 || i === 0) { const col = Math.floor((i + lead) / 7); if (!months.length || col - months.at(-1).col >= 3) months.push({ col, name: hmMonth.format(t) }); } }
    const cells = v.map((x, i) => `<span class="heat-cell" data-l="${lvl(x)}"${i === 0 ? ` style="grid-row: ${lead + 1}"` : ''}></span>`).join('');
    // the month by month table, and the year in a sentence
    const byMonth = new Map();
    v.forEach((x, i) => { const t = this.day(i), k = `${t.getFullYear()}-${t.getMonth()}`; const e = byMonth.get(k) || { t, sum: 0, top: -1, topI: 0 }; e.sum += x; if (x > e.top) { e.top = x; e.topI = i; } byMonth.set(k, e); });
    const total = v.reduce((a, b) => a + b, 0), topI = v.indexOf(Math.max(...v));
    this.innerHTML = `<div class="heat-scroll"><div class="heat-body">
        <div class="heat-months" aria-hidden="true">${months.map(mo => `<span style="grid-column: ${mo.col + 1}">${mo.name}</span>`).join('')}</div>
        <div class="heat-days" aria-hidden="true"><span>Mon</span><span></span><span>Wed</span><span></span><span>Fri</span><span></span><span></span></div>
        <div class="heat-grid" tabindex="0" role="slider" aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="${v.length - 1}">${cells}</div>
        <span class="heat-tip" aria-hidden="true"></span>
      </div></div>
      <div class="heat-foot"><span class="heat-sum">${total.toLocaleString('en-GB')} ${esc(unit)} in all · the busiest day, ${hmFull.format(this.day(topI))}: ${v[topI].toLocaleString('en-GB')}</span>
        <span class="heat-key" aria-hidden="true"><span>Fewer</span>${[0, 1, 2, 3, 4, 5].map(l => `<i class="heat-cell" data-l="${l}"></i>`).join('')}<span>More</span></span></div>
      <details class="heat-table"><summary>As a table</summary><table class="table compact"><thead><tr><th scope="col">Month</th><th scope="col" class="num">${esc(unit || 'Total')}</th><th scope="col">The busiest day</th></tr></thead>
        <tbody>${[...byMonth.values()].map(e => `<tr><th scope="row">${hmMonthYear.format(e.t)}</th><td class="num">${e.sum.toLocaleString('en-GB')}</td><td>${hmFull.format(this.day(e.topI))} (${e.top.toLocaleString('en-GB')})</td></tr>`).join('')}</tbody></table></details>`;
    this.grid = this.querySelector('.heat-grid');
    this.grid.setAttribute('aria-description', this.querySelector('.heat-sum').textContent);
    this.cells = [...this.grid.children];
    this.grid.setAttribute('aria-valuenow', String(v.length - 1));
    this.grid.setAttribute('aria-valuetext', `${hmFull.format(this.day(v.length - 1))}: ${v[v.length - 1].toLocaleString('en-GB')} ${unit}`.trim());
    const at = e => this.cells.indexOf(e.target.closest('.heat-cell'));
    this.grid.addEventListener('pointermove', e => { const i = at(e); if (i >= 0) this.show(i); });
    this.grid.addEventListener('pointerleave', () => { if (document.activeElement !== this.grid) this.hide(); });
    this.grid.addEventListener('click', e => { const i = at(e); if (i >= 0) { this.show(i); this.pick(); } });
    this.grid.addEventListener('focus', () => this.show(this.i ?? v.length - 1));
    this.grid.addEventListener('blur', () => this.hide());
    this.grid.addEventListener('keydown', e => {
      const i = this.i ?? v.length - 1;
      const to = { ArrowRight: i + 7, ArrowLeft: i - 7, ArrowDown: i + 1, ArrowUp: i - 1, PageDown: i + 28, PageUp: i - 28, Home: 0, End: v.length - 1 }[e.key];
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.pick(); return; }
      if (to === undefined) return;
      e.preventDefault(); this.show(clamp(to, 0, v.length - 1));
    });
    // the latest days in view
    const sc = this.querySelector('.heat-scroll');
    requestAnimationFrame(() => (sc.scrollLeft = sc.scrollWidth));
  }
  show(i) {
    this.cells[this.i]?.removeAttribute('data-at');
    this.i = i;
    const c = this.cells[i], unit = this.getAttribute('unit') || '';
    c.setAttribute('data-at', '');
    const tip = this.querySelector('.heat-tip'), body = this.querySelector('.heat-body');
    tip.innerHTML = `<b>${this.v[i].toLocaleString('en-GB')} ${esc(unit)}</b><span>${hmFull.format(this.day(i))}</span>`;
    const br = body.getBoundingClientRect(), cr = c.getBoundingClientRect();
    tip.style.setProperty('--tx', `${cr.left - br.left + cr.width / 2}px`);
    tip.style.setProperty('--ty', `${cr.top - br.top}px`);
    c.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    this.dataset.on = '';
    this.grid.setAttribute('aria-valuenow', String(i));
    this.grid.setAttribute('aria-valuetext', `${hmFull.format(this.day(i))}: ${this.v[i].toLocaleString('en-GB')} ${unit}`.trim());
  }
  hide() { this.removeAttribute('data-on'); this.cells?.[this.i]?.removeAttribute('data-at'); }
  pick() { const t = this.day(this.i), iso = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; emit(this, 'select', { date: iso, value: this.v[this.i] }); }
}
customElements.define('m-heatmap', MHeatmap);

// ── m/src/components/feedback/island/island.js
/* ════════ m-island: says one thing, and takes the size of what it says. island.say(html, { icon, state, action }) ════════ */
class MIsland extends HTMLElement {
  connectedCallback() {
    if (this.inner) return;
    if (!this.hasAttribute('role')) { this.setAttribute('role', 'status'); this.setAttribute('aria-live', 'polite'); }
    this.inner = h('div', { class: 'in' });
    this.inner.append(...this.childNodes); this.append(this.inner);
    this.fit(true);
    doc.fonts?.ready.then(() => this.fit(true));
  }
  fit(instant) {
    const w = this.inner.offsetWidth;
    if (instant || RM.matches) { this.style.transition = 'none'; this.style.width = w + 'px'; void this.offsetWidth; this.style.transition = ''; }
    else this.style.width = w + 'px';
  }
  say(content = '', { icon, state = '', action, onAction } = {}) {
    if (!this.inner) this.connectedCallback();
    const old = this.inner, next = h('div', { class: 'in new' });
    next.innerHTML = (icon ? ms(icon) : '') + (typeof content === 'string' ? content : '');
    if (content instanceof Node) next.append(content);
    if (action) { const b = h('button', { type: 'button', class: 'act' }, esc(action)); b.addEventListener('click', e => onAction?.(e)); next.append(b); }
    old.classList.add('out'); old.setAttribute('aria-hidden', 'true');
    this.append(next); this.inner = next;
    this.dataset.state = state || (content ? '' : 'idle');
    this.fit();
    setTimeout(() => old.remove(), 220);
  }
}
customElements.define('m-island', MIsland);

// ── m/src/components/feedback/banner/banner.js
/* ════════ .banner[data-remember="key"] stays away once dismissed (on this browser); a [data-dismiss] inside it folds it
      up and moves the focus on to what follows. Emits dismiss on the banner. ════════ */
function banner(b) {
  const key = b.dataset.remember && `m.banner.${b.dataset.remember}`;
  if (key) try { if (localStorage.getItem(key)) { b.hidden = true; return; } } catch {}
  b.addEventListener('click', e => {
    if (!e.target.closest('[data-dismiss]')) return;
    if (key) try { localStorage.setItem(key, '1'); } catch {}
    const next = b.nextElementSibling;
    const done = () => { b.hidden = true; delete b.dataset.leaving; emit(b, 'dismiss'); };
    if (b.contains(document.activeElement) && next) { if (!next.matches('a[href], button, input, select, textarea, [tabindex]')) next.tabIndex = -1; next.focus({ preventScroll: true }); }
    if (RM.matches) { done(); return; }
    b.dataset.leaving = '';
    b.addEventListener('animationend', done, { once: true });
  });
}
enhance('.banner', once(banner));

// ── m/src/components/feedback/progress/loader.js
/* ════════ m-loader: kind="shape" (Material 3 Expressive's loading indicator: soft shapes that morph and turn),
      kind="wavy" (a wavy ring that turns), kind="ring" value="0–100" (determinate) ════════ */
const N = 64, TAU = Math.PI * 2;
const lobes = (n, a) => t => 1 + a * Math.cos(n * t);
const oval = (a, b) => t => (a * b) / Math.hypot(b * Math.cos(t), a * Math.sin(t));
const SHAPES = [lobes(12, .065), lobes(9, .08), lobes(5, .1), oval(1, .62), lobes(8, .06), lobes(4, .13), oval(1, .8)].map(f => {
  const r = [...Array(N)].map((_, i) => f((i / N) * TAU)), m = Math.max(...r);
  return r.map(x => x / m);
});
function smoothPath(rs, R, rot, c = 24) {
  const p = rs.map((r, i) => { const t = (i / N) * TAU + rot; return [c + Math.cos(t) * r * R, c + Math.sin(t) * r * R]; });
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], f = v => v.toFixed(2);
  let d = `M${mid(p[N - 1], p[0]).map(f).join(' ')}`;
  for (let i = 0; i < N; i++) { const m = mid(p[i], p[(i + 1) % N]); d += `Q${f(p[i][0])} ${f(p[i][1])} ${f(m[0])} ${f(m[1])}`; }
  return d + 'Z';
}
const springAt = (u, k = 380, z = .72) => { if (u <= 0) return 0; const w = Math.sqrt(k), wd = w * Math.sqrt(1 - z * z); return 1 - Math.exp(-z * w * u) * (Math.cos(wd * u) + (z * w / wd) * Math.sin(wd * u)); };
class MLoader extends HTMLElement {
  static observedAttributes = ['value'];
  connectedCallback() {
    if (this.svg) return;
    const kind = this.getAttribute('kind') || 'shape';
    if (kind === 'ring') {
      this.setAttribute('role', 'progressbar'); this.setAttribute('aria-valuemin', 0); this.setAttribute('aria-valuemax', 100);
      this.innerHTML = '<svg viewBox="0 0 48 48" aria-hidden="true"><circle class="t" cx="24" cy="24" r="19" stroke-width="4.5"/><circle class="v" cx="24" cy="24" r="19" stroke-width="4.5" pathLength="100" transform="rotate(-90 24 24)"/></svg>';
      this.svg = this.firstChild; this.attributeChangedCallback();
      return;
    }
    if (!this.hasAttribute('role')) { this.setAttribute('role', 'status'); if (!this.hasAttribute('aria-label')) this.setAttribute('aria-label', 'Loading'); }
    if (kind === 'wavy') {
      let d = ''; for (let i = 0; i <= 120; i++) { const t = (i / 120) * TAU, r = 18.4 + 1.5 * Math.sin(12 * t); d += `${i ? 'L' : 'M'}${(24 + Math.cos(t) * r).toFixed(2)} ${(24 + Math.sin(t) * r).toFixed(2)}`; }
      this.innerHTML = `<svg viewBox="0 0 48 48" aria-hidden="true"><path class="v" d="${d}Z" stroke-width="3.6" pathLength="100"/></svg>`;
      this.svg = this.firstChild; return;
    }
    this.innerHTML = `<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="currentColor" d="${smoothPath(SHAPES[0], 19, 0)}"/></svg>`;
    this.svg = this.firstChild; this.path = this.svg.firstChild;
    this.io = new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; if (this.visible) this.tick(); });
    this.io.observe(this);
  }
  disconnectedCallback() { this.io?.disconnect(); this.visible = false; }
  attributeChangedCallback() {
    if (this.getAttribute('kind') !== 'ring' || !this.svg) return;
    const v = clamp(+this.getAttribute('value') || 0, 0, 100);
    this.svg.querySelector('.v').style.strokeDasharray = `${v} 100`;
    this.setAttribute('aria-valuenow', Math.round(v));
  }
  tick() {
    if (this.raf) return;
    const t0 = performance.now(), STEP = 650;
    const frame = now => {
      this.raf = 0;
      if (!this.visible || doc.hidden) return;
      // (a frame's timestamp can be a hair earlier than the clock this started from)
      const t = Math.max(0, now - t0) / STEP, i = Math.floor(t), u = t - i, a = SHAPES[i % SHAPES.length], b = SHAPES[(i + 1) % SHAPES.length];
      const e = RM.matches ? 0 : springAt(Math.min(u * .7, .7));
      const rs = a.map((r, k) => r + (b[k] - r) * e);
      const rot = RM.matches ? (now - t0) / 2400 : (i + e) * 2.2 + (now - t0) / 1600;
      this.path.setAttribute('d', smoothPath(rs, 19, rot));
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }
}
customElements.define('m-loader', MLoader);

// ── m/src/components/feedback/develop/develop.js
let developAt = 0;   // when the last picture to develop in turn began
function develop(img) {
  // Only the first visible arrival fades; source and responsive-image changes must never blank a picture already shown.
  const ready = fresh => {
    fresh &&= !img.hasAttribute('data-ready') && !RM.matches;
    if (fresh) { const r = img.getBoundingClientRect(); fresh = r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; }
    if (fresh && img.dataset.variant === 'turn') { const now = performance.now(), at = Math.min(now + 480, Math.max(now, developAt + 120)); developAt = at; img.style.animationDelay = `${Math.round(at - now)}ms`; }
    else img.style.animationDelay = '';
    img.dataset.ready = fresh ? 'fresh' : 'instant';
  };
  if (img.complete && img.naturalWidth) ready(false);
  img.addEventListener('load', async () => {
    const src = img.currentSrc;
    try { await img.decode(); } catch {}
    if (img.currentSrc === src && img.complete && img.naturalWidth) ready(true);
  });
  img.addEventListener('error', () => ready(false));
}
enhance('img.develop', once(develop));

// ── m/src/components/overlays/sheet/sheet.js
/* ════════ a bottom sheet (data-side="bottom") gets a grip; drag the grip or the head down: past a third of its height,
      or flicked, it closes from where it is; short of that it springs back. Esc and the backdrop still close it. ════════ */
function sheetDrag(d) {
  const grip = h('div', { class: 'sheet-grip', 'aria-hidden': 'true' });
  d.prepend(grip);
  let id = null, y0 = 0, dy = 0, t0 = 0;
  d.addEventListener('pointerdown', e => {
    if (d.dataset.side !== 'bottom' || e.button !== 0 || id != null) return;
    if (!(e.target === grip || e.target.closest('.sheet-head')) || e.target.closest('button, a, input, select, textarea, label')) return;
    id = e.pointerId; y0 = e.clientY; dy = 0; t0 = performance.now();
    d.setPointerCapture(id);
    d.dataset.dragging = '';
  });
  d.addEventListener('pointermove', e => {
    if (e.pointerId !== id) return;
    dy = Math.max(0, e.clientY - y0) + Math.min(0, e.clientY - y0) * .15;   // up gives a little, then holds
    d.style.translate = `0 ${dy}px`;
  });
  const end = e => {
    if (e.pointerId !== id) return;
    id = null; delete d.dataset.dragging;
    const fast = dy / Math.max(1, performance.now() - t0) > .55;
    if (dy > d.offsetHeight / 3 || (fast && dy > 24)) { closeDialog(d); d.addEventListener('close', () => (d.style.translate = ''), { once: true }); return; }
    if (RM.matches) { d.style.translate = ''; return; }
    d.dataset.settling = '';
    d.style.translate = '';
    setTimeout(() => delete d.dataset.settling, 500);
  };
  d.addEventListener('pointerup', end);
  d.addEventListener('pointercancel', end);
}
enhance('dialog.sheet', once(sheetDrag));

// ── m/src/components/overlays/tooltip/tooltip.js
/* ════════ tooltips: data-tip="…" (and data-kbd); after a beat on hover or keyboard focus, never on touch. With
      data-tip-title it is the rich one: the title and its key over the line ════════ */
let tipEl = null, tipT = 0, tipFor = null, tipWarm = 0;
function showTip(el) {
  if (!el.isConnected || !el.dataset.tip) return;
  tipEl ||= (() => { const t = h('div', { class: 'tip', role: 'tooltip', popover: 'manual', 'aria-hidden': 'true' }); doc.body.append(t); return t; })();
  const key = el.dataset.kbd ? `<kbd>${esc(el.dataset.kbd)}</kbd>` : '', title = el.dataset.tipTitle;
  tipEl.innerHTML = title ? `<b class="tip-title">${esc(title)}${key}</b><span>${esc(el.dataset.tip)}</span>` : esc(el.dataset.tip) + key;
  if (title) tipEl.dataset.variant = 'rich'; else delete tipEl.dataset.variant;
  showPop(tipEl);
  const r = el.getBoundingClientRect(), w = tipEl.offsetWidth, hh = tipEl.offsetHeight, m = 12;
  const up = el.dataset.tipSide === 'top' || r.bottom + 8 + hh > innerHeight - m;
  tipEl.style.left = clamp(r.left + r.width / 2 - w / 2, m, innerWidth - w - m) + 'px';
  tipEl.style.top = (up ? r.top - 8 - hh : r.bottom + 8) + 'px';
  tipFor = el;
}
function hideTip() { clearTimeout(tipT); if (tipFor) tipWarm = performance.now(); tipFor = null; if (tipEl) hidePop(tipEl); }
doc.addEventListener('pointerover', e => {
  if (e.pointerType === 'touch') return;
  const el = e.target.closest?.('[data-tip]');
  if (el === tipFor) return;
  hideTip();
  if (el) tipT = setTimeout(() => showTip(el), performance.now() - tipWarm < 400 ? 0 : 350);
});
doc.addEventListener('pointerdown', hideTip, true);
doc.addEventListener('focusin', e => { const el = e.target.closest?.('[data-tip]'); hideTip(); if (el?.matches(':focus-visible')) tipT = setTimeout(() => showTip(el), 350); });
doc.addEventListener('focusout', hideTip);
doc.addEventListener('keydown', e => { if (e.key === 'Escape') hideTip(); });
addEventListener('scroll', hideTip, { passive: true, capture: true });

function tip(el) {
  const named = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || [...el.childNodes].some(n => (n.nodeType === 3 && n.textContent.trim()) || (n.nodeType === 1 && !n.classList.contains('ms') && n.textContent.trim()));
  // a rich tip's title names a control without words, and its line describes it
  const title = el.dataset.tipTitle;
  if (!named) el.setAttribute('aria-label', title || el.dataset.tip);
  if ((named || title) && !el.hasAttribute('aria-description') && el.getAttribute('aria-label') !== el.dataset.tip) el.setAttribute('aria-description', el.dataset.tip);
}
enhance('[data-tip]', once(tip));

// ── m/src/components/overlays/popover/popover.js
/* ════════ <button popovertarget="id"> and <div class="popover" id="id" popover>: the browser opens and closes it (a press
      outside or Esc closes it, Tab goes into it); the script places it by its button, below or above, never past the edge,
      and keeps it there as the page scrolls. data-side="top" and data-align="end|center" choose where. ════════ */
function popover(pop) {
  const at = () => {
    const a = doc.querySelector(`[popovertarget="${CSS.escape(pop.id)}"]`);
    if (a) place(pop, a, { side: pop.dataset.side || 'bottom', align: pop.dataset.align || 'start', gap: 10 });
  };
  pop.addEventListener('toggle', e => {
    if (e.newState === 'open') {
      at(); pop.dataset.placed = '';
      addEventListener('scroll', at, { capture: true, passive: true }); addEventListener('resize', at);
    } else {
      delete pop.dataset.placed;
      removeEventListener('scroll', at, { capture: true }); removeEventListener('resize', at);
    }
  });
}
enhance('.popover[popover][id]', once(popover));

// ── m/src/components/overlays/context-menu/context-menu.js
/* ════════ [data-context="menu-id"] on an area; the thing a menu is about is the [data-context-item] under the pointer
      (or the area itself). The menu is a .menu of menuitems. A right-click, a long press (half a second, held still),
      Shift+F10 or the Menu key open it where you are; ↓ ↑ Home End and letters move, Enter or Space chooses, Esc or a
      press outside closes it, and the focus goes back. The area emits select with { item, value, target }.
      A .context-menu-head in the menu is filled on each opening from the thing (its picture, its data-context-name or
      words, its data-context-meta) and names the menu; ← → move along a .context-menu-quick row. ════════ */
const ctxLong = 520;
// an item's words, without its icon's name or its keys (an item that is only an icon: its name)
const ctxLabel = x => [...x.childNodes].filter(n => !(n.nodeType === 1 && n.matches('.ms, kbd'))).map(n => n.textContent).join('').trim() || x.getAttribute('aria-label') || '';
function contextMenu(menu) {
  if (menu.ctx) return menu.ctx;
  menu.classList.add('context-menu');
  menu.setAttribute('role', 'menu'); menu.setAttribute('popover', 'manual'); menu.tabIndex = -1;
  const head = menu.querySelector('.context-menu-head');
  if (head) { head.id ||= uid('ctx-head'); menu.setAttribute('aria-labelledby', head.id); }
  const find = typeahead();
  const items = () => $$('[role^=menuitem]', menu).filter(x => x.getAttribute('aria-disabled') !== 'true' && !x.disabled);
  const api = {
    area: null, target: null, back: null, isOpen: false,
    contains: n => menu.contains(n),
    reposition: () => api.close(false),
    open(area, target, x, y) {
      opened(api); api.isOpen = true;
      api.area = area; api.target = target; api.back = doc.activeElement;
      api.was = target.getAttribute('aria-current'); target.setAttribute('aria-current', 'true');   // its own, given back on close
      if (head) {
        const img = target.querySelector('img'), name = target.dataset.contextName || target.textContent.trim(), meta = target.dataset.contextMeta;
        head.innerHTML = (img ? `<img src="${esc(img.currentSrc || img.src)}" alt="">` : '') + `<span><b>${esc(name)}</b>${meta ? `<small>${esc(meta)}</small>` : ''}</span>`;
      }
      showPop(menu);
      place(menu, { getBoundingClientRect: () => new DOMRect(x, y, 0, 0) }, { gap: 2 });
      items().forEach(i => (i.tabIndex = -1));
      (items()[0] || menu).focus({ preventScroll: true });
    },
    close(refocus = true) {
      if (!api.isOpen) return;
      api.isOpen = false; released(api); hidePop(menu);
      if (api.was == null) api.target?.removeAttribute('aria-current'); else api.target?.setAttribute('aria-current', api.was);
      if (refocus) (api.target?.matches('a[href], button, [tabindex]') ? api.target : api.back)?.focus?.({ preventScroll: true });
    },
  };
  menu.addEventListener('keydown', e => {
    const its = items(), i = its.indexOf(doc.activeElement), n = its.length;
    // the quick row: ← → along it; ↓ to the first item under it, ↑ round to the last; ↑ from under it back to its start
    const row = doc.activeElement?.closest('.context-menu-quick'), rs = row ? its.filter(x => row.contains(x)) : [];
    const rowAbove = e.key === 'ArrowUp' && !row && its[i - 1]?.closest('.context-menu-quick');
    if (rowAbove) { e.preventDefault(); its.find(x => rowAbove.contains(x)).focus(); return; }
    if (row && /^Arrow(Right|Left|Down|Up)$/.test(e.key)) {
      const r = rs.indexOf(doc.activeElement);
      e.preventDefault();
      ({ ArrowRight: rs[(r + 1) % rs.length], ArrowLeft: rs[(r - 1 + rs.length) % rs.length], ArrowDown: its[(its.indexOf(rs.at(-1)) + 1) % n], ArrowUp: its[(its.indexOf(rs[0]) - 1 + n) % n] })[e.key]?.focus();
      return;
    }
    const go = { ArrowDown: (i + 1) % n, ArrowUp: (i - 1 + n) % n, Home: 0, End: n - 1 }[e.key];
    if (go !== undefined) { e.preventDefault(); its[go]?.focus(); return; }
    if (e.key === 'Escape') { e.preventDefault(); api.close(); return; }
    if (e.key === 'Tab') { e.preventDefault(); api.close(); return; }
    const k = find(e.key, its.map(ctxLabel), Math.max(0, i));
    if (k >= 0) { e.preventDefault(); its[k].focus(); }
  });
  menu.addEventListener('click', e => {
    const it = e.target.closest('[role^=menuitem]');
    if (!it || it.getAttribute('aria-disabled') === 'true') return;
    const { area, target } = api;
    api.close();
    emit(area, 'select', { item: it, value: it.dataset.value ?? ctxLabel(it), label: ctxLabel(it), target });
  });
  menu.addEventListener('pointermove', e => { const it = e.target.closest('[role^=menuitem]'); if (it && it !== doc.activeElement) it.focus({ preventScroll: true }); });
  return (menu.ctx = api);
}
function contextArea(area) {
  const menu = doc.getElementById(area.dataset.context);
  if (!menu) return;
  const api = contextMenu(menu);
  const thing = n => n.closest('[data-context-item]') || area;
  const at = el => { const r = el.getBoundingClientRect(); return [r.left + Math.min(24, r.width / 2), r.top + Math.min(r.height, 40)]; };
  let keyed = 0, held = 0, x0 = 0, y0 = 0, longDone = false;
  area.addEventListener('contextmenu', e => {
    e.preventDefault(); clearTimeout(held);
    if (performance.now() - keyed < 400 || longDone) { longDone = false; return; }
    const t = thing(e.target);
    // a keyboard's menu arrives with no pointer: open it by the thing in focus
    const [x, y] = e.button === 2 && (e.clientX || e.clientY) ? [e.clientX, e.clientY] : at(t);
    api.open(area, t, x, y);
  });
  area.addEventListener('keydown', e => {
    if (!((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu')) return;
    e.preventDefault(); keyed = performance.now();
    const t = thing(e.target), [x, y] = at(t);
    api.open(area, t, x, y);
  });
  // a long press, for a touch screen that doesn't send contextmenu
  area.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch') return;
    clearTimeout(held); x0 = e.clientX; y0 = e.clientY;
    const t = thing(e.target);
    held = setTimeout(() => { longDone = true; api.open(area, t, x0, y0); }, ctxLong);
  });
  const cancel = e => { if (e.type !== 'pointermove' || Math.hypot(e.clientX - x0, e.clientY - y0) > 8) clearTimeout(held); };
  area.addEventListener('pointermove', cancel); area.addEventListener('pointerup', cancel); area.addEventListener('pointercancel', cancel);
  area.addEventListener('click', e => { if (longDone) { e.preventDefault(); e.stopPropagation(); longDone = false; } }, true);
}
enhance('[data-context]', once(contextArea));

// ── m/src/components/overlays/lightbox/lightbox.js
/* ════════ lightbox: <a href="big.avif" data-lightbox="group" data-caption="…" data-meta="…" data-h data-c>.
      data-lightbox-variant on the link opened: "strip" (the set along the foot, to jump to any) or "details" (its
      data-facts beside it: "Shutter: 1/60 s; ISO: 50") ════════ */
let lb = null;
function lightbox(group, start) {
  const items = $$(`[data-lightbox="${CSS.escape(group)}"]`);
  if (!lb) {
    lb = h('dialog', { class: 'lightbox tone', 'aria-label': 'Photograph' },
      `<div class="lb-top"><span class="lb-count" aria-live="polite"></span><button type="button" class="ib" data-variant="tonal" data-close aria-label="Close">${ms('close')}</button></div>
       <div class="lb-stage"><img alt=""><button type="button" class="ib lb-prev" data-variant="tonal" aria-label="Previous">${ms('arrow_back')}</button><button type="button" class="ib lb-next" data-variant="tonal" aria-label="Next">${ms('arrow_forward')}</button></div>
       <div class="lb-cap"><b></b><span></span></div><div class="lb-strip" role="group" aria-label="Every photograph in the set"></div><dl class="lb-side facts sm"></dl>`);
    doc.body.append(lb);
    lb.addEventListener('close', () => { lb.__load++; lb.removeAttribute('aria-busy'); });
    lb.querySelector('.lb-prev').addEventListener('click', () => lb.go(-1));
    lb.querySelector('.lb-next').addEventListener('click', () => lb.go(1));
    lb.querySelector('.lb-strip').addEventListener('click', e => { const b = e.target.closest('button'); if (b) lb.go(+b.dataset.i - lb.i); });
    lb.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft') lb.go(-1); else if (e.key === 'ArrowRight') lb.go(1);
      else if (e.key === 'Home') lb.go(-lb.i); else if (e.key === 'End') lb.go(lb.items.length - 1 - lb.i); else return;
      e.preventDefault();
    });
    // a swipe steps; the click that ends a swipe is not a press on the backdrop
    let x0 = null, swiped = false;
    lb.addEventListener('pointerdown', e => { x0 = e.clientX; swiped = false; });
    lb.addEventListener('pointerup', e => { if (x0 != null && Math.abs(e.clientX - x0) > 50) { swiped = true; lb.go(e.clientX < x0 ? 1 : -1); } x0 = null; });
    lb.addEventListener('click', e => { if (swiped) { swiped = false; return; } if (e.target === lb || e.target.classList.contains('lb-stage')) closeDialog(lb); });
  }
  lb.items = items; lb.i = Math.max(0, items.indexOf(start));
  lb.go = d => { lb.i = (lb.i + d + lb.items.length) % lb.items.length; show(); };
  const img = lb.querySelector('.lb-stage img'), v = start.dataset.lightboxVariant || '', strip = lb.querySelector('.lb-strip');
  if (v) lb.dataset.variant = v; else delete lb.dataset.variant;
  strip.innerHTML = v !== 'strip' ? '' : items.map((a, k) => { const t = a.querySelector('img');
    return `<button type="button" class="lb-thumb" data-i="${k}" aria-label="${esc(a.dataset.caption || t?.alt || `${k + 1}`)}"><img src="${esc(t?.currentSrc || t?.src || a.getAttribute('href'))}" alt=""></button>`; }).join('');
  const show = async () => {
    const a = lb.items[lb.i], src = a.getAttribute('href'), alt = a.querySelector('img')?.alt || a.dataset.caption || '';
    const request = lb.__load = (lb.__load || 0) + 1, next = new Image();
    lb.setAttribute('aria-busy', 'true');
    lb.querySelector('.lb-count').textContent = `${lb.i + 1} of ${lb.items.length}`;
    lb.querySelector('.lb-prev').hidden = lb.querySelector('.lb-next').hidden = lb.items.length < 2;
    if (!lb.open) {
      const thumb = a.querySelector('img');
      if (thumb?.currentSrc || thumb?.src) img.src = thumb.currentSrc || thumb.src; else img.removeAttribute('src');
      img.alt = alt;
    }
    next.decoding = 'async'; next.src = src;
    try { await next.decode(); }
    catch {
      if (request === lb.__load) { lb.removeAttribute('aria-busy'); lb.querySelector('.lb-cap span').textContent = 'This photograph could not be loaded.'; }
      return;
    }
    if (request !== lb.__load || !lb.open) return;
    // Keep the current photograph on screen until its replacement is decoded; a rapid next/previous press cancels older work.
    img.src = next.src; img.alt = alt;
    lb.removeAttribute('aria-busy');
    lb.querySelector('.lb-cap b').textContent = a.dataset.caption || alt;
    lb.querySelector('.lb-cap span').textContent = a.dataset.meta || '';
    if (a.dataset.h) { lb.style.setProperty('--h', a.dataset.h); lb.style.setProperty('--c', a.dataset.c || .08); } else ground(lb, a.querySelector('img')?.currentSrc || src);
    strip.querySelectorAll('.lb-thumb').forEach((b, k) => { if (k === lb.i) { b.setAttribute('aria-current', 'true'); b.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } else b.removeAttribute('aria-current'); });
    lb.querySelector('.lb-side').innerHTML = v !== 'details' ? '' : (a.dataset.facts || '').split(';').filter(f => f.includes(':'))
      .map(f => `<div><dt>${esc(f.slice(0, f.indexOf(':')).trim())}</dt><dd>${esc(f.slice(f.indexOf(':') + 1).trim())}</dd></div>`).join('');
    [1, -1].forEach(k => { const n = lb.items[(lb.i + k + lb.items.length) % lb.items.length]; if (n) new Image().src = n.getAttribute('href'); });
  };
  show();
  if (!lb.open) openDialog(lb, start);
}
doc.addEventListener('click', e => { const a = e.target.closest('a[data-lightbox]'); if (a && !e.metaKey && !e.ctrlKey) { e.preventDefault(); lightbox(a.dataset.lightbox, a); } });

// ── m/src/components/overlays/command/command.js
/* ════════ m-command: a palette of places and actions. Its children are the entries (links or buttons, with
      data-group, data-icon and data-hint; data-desc and data-img for the preview); Ctrl+K or ⌘K, or any [data-command]
      button, opens it. One with shortcut="none" is opened only by its own buttons, [data-command="its id"].
      data-variant="preview": the entry in hand shown beside the list ════════ */
class MCommand extends HTMLElement {
  connectedCallback() {
    if (this.dlg) return;
    this.style.display = 'none';
    this.entries = $$(':scope > a, :scope > button', this).map(el => ({ el, label: el.textContent.trim(), group: el.dataset.group || '', icon: el.dataset.icon || (el.tagName === 'A' ? 'arrow_forward' : 'bolt'), hint: el.dataset.hint || '', keys: (el.dataset.keys || '').toLowerCase(), desc: el.dataset.desc || '', img: el.dataset.img || '' }));
    const id = uid('cmd'), keyed = this.getAttribute('shortcut') !== 'none';
    this.dlg = h('dialog', { class: 'cmdk', 'aria-label': this.getAttribute('aria-label') || 'Search', 'data-variant': this.dataset.variant || null },
      `<div class="cmdk-search">${ms('search')}<input type="search" role="combobox" aria-expanded="true" aria-controls="${id}" aria-autocomplete="list" placeholder="${esc(this.getAttribute('placeholder') || 'Search')}" autocomplete="off" spellcheck="false"><kbd>Esc</kbd></div>
       <div class="cmdk-list" role="listbox" id="${id}"></div>${this.dataset.variant === 'preview' ? '<div class="cmdk-preview" aria-hidden="true"></div>' : ''}
       <div class="cmdk-foot"><span><kbd>↑</kbd><kbd>↓</kbd>to move</span><span><kbd>Enter</kbd>to open</span><span><kbd>Esc</kbd>to close</span></div>`);
    this.preview = this.dlg.querySelector('.cmdk-preview');
    doc.body.append(this.dlg);
    this.q = this.dlg.querySelector('input'); this.list = this.dlg.querySelector('.cmdk-list');
    this.q.addEventListener('input', () => this.render());
    this.q.addEventListener('keydown', e => {
      const n = this.shown.length;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); this.mark((this.act + (e.key === 'ArrowDown' ? 1 : -1) + n) % n); }
      else if (e.key === 'Enter') { e.preventDefault(); this.go(this.act); }
    });
    this.list.addEventListener('click', e => { const o = e.target.closest('[role=option]'); if (o) this.go(+o.dataset.i); });
    this.list.addEventListener('pointermove', e => { const o = e.target.closest('[role=option]'); if (o && +o.dataset.i !== this.act) this.mark(+o.dataset.i, false); });
    if (keyed) addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); this.dlg.open ? closeDialog(this.dlg) : this.open(); } });
    doc.addEventListener('click', e => {
      const b = e.target.closest('[data-command]');
      if (b && (b.dataset.command ? b.dataset.command === this.id : keyed)) { e.preventDefault(); this.open(); }
    });
  }
  open() { this.q.value = ''; this.render(); openDialog(this.dlg); this.q.focus(); }
  render() {
    const q = this.q.value.trim().toLowerCase();
    const score = x => { const l = x.label.toLowerCase(); if (!q) return 1; if (l.startsWith(q)) return 3; if (l.includes(q) || x.keys.includes(q)) return 2; let i = 0; for (const c of l) if (c === q[i]) i++; return i === q.length ? 1 : 0; };
    this.shown = this.entries.map(x => ({ x, s: score(x) })).filter(r => r.s).sort((a, b) => (q ? b.s - a.s : 0)).map(r => r.x);
    if (!this.shown.length) { this.list.innerHTML = `<p class="cmdk-empty">Nothing called “${esc(this.q.value)}”.</p>`; this.act = -1; if (this.preview) this.preview.innerHTML = ''; return; }
    let html = '', g = null;
    const mark = l => { const i = l.toLowerCase().indexOf(q); return q && i >= 0 ? esc(l.slice(0, i)) + '<mark>' + esc(l.slice(i, i + q.length)) + '</mark>' + esc(l.slice(i + q.length)) : esc(l); };
    this.shown.forEach((x, i) => {
      if (!q && x.group !== g) { g = x.group; if (g) html += `<div class="group" role="presentation">${esc(g)}</div>`; }
      html += `<div role="option" id="${this.list.id}-${i}" data-i="${i}" aria-selected="false"${x.desc ? ` aria-description="${esc(x.desc)}"` : ''}>${ms(x.icon)}<span>${mark(x.label)}</span>${x.hint ? `<small>${esc(x.hint)}</small>` : ''}</div>`;
    });
    this.list.innerHTML = html;
    this.mark(0);
  }
  mark(i, scroll = true) {
    this.act = i;
    $$('[role=option]', this.list).forEach(o => o.setAttribute('aria-selected', String(+o.dataset.i === i)));
    const o = this.list.querySelector(`[data-i="${i}"]`);
    if (o) { this.q.setAttribute('aria-activedescendant', o.id); if (scroll) o.scrollIntoView({ block: 'nearest' }); }
    // the preview: the entry in hand, its picture (or its icon), its name, its line (said already, as the option's description)
    const x = this.shown?.[i];
    if (this.preview && x) this.preview.innerHTML = (x.img ? `<img src="${esc(x.img)}" alt="">` : `<span class="cmdk-preview-i">${ms(x.icon)}</span>`)
      + `<b>${esc(x.label)}</b>${x.desc ? `<p>${esc(x.desc)}</p>` : ''}${x.group || x.hint ? `<small>${esc([x.group, x.hint].filter(Boolean).join(' · '))}</small>` : ''}`;
  }
  go(i) {
    const x = this.shown?.[i]; if (!x) return;
    const href = x.el.getAttribute('href');
    // act once the palette has closed and handed focus back, so nothing scrolls the page after we do
    this.dlg.addEventListener('close', () => {
      if (href?.startsWith('#')) {
        const t = doc.getElementById(href.slice(1));
        if (t) { t.scrollIntoView({ behavior: smooth(), block: 'start' }); if (!t.hasAttribute('tabindex')) t.tabIndex = -1; t.focus({ preventScroll: true }); }
        history.replaceState(null, '', href);
      } else x.el.click();
    }, { once: true });
    closeDialog(this.dlg);
  }
}
customElements.define('m-command', MCommand);

// ── m/src/components/overlays/tour/tour.js
/* ════════ <m-tour id="t" label="What's new" remember="key"><section data-for="#target" data-side="right"><h2>…</h2>
      <p>…</p></section>…</m-tour>, started by any [data-tour="t"] (or tour.start()). Each step lifts its target out of a
      dimmed page (the hole glides to it on a spring) and sets its card beside it. A modal dialog: the focus stays in the
      card, Esc ends it, Back and Next and the arrow keys move through it. With remember, a finished or skipped tour
      isn't offered again (tour.start(true) starts it anyway). Emits step { index } and end { finished }.
      data-variant="hint": one thing pointed at without stopping the page (no dimming, not modal); "media": a
      picture at the head of each card. done="…" names the last button (Done). ════════ */
class MTour extends HTMLElement {
  connectedCallback() {
    if (this.steps) return;
    this.steps = [...this.querySelectorAll(':scope > section[data-for]')];
  }
  get key() { return this.getAttribute('remember') && `m.tour.${this.getAttribute('remember')}`; }
  start(always = false, from) {
    if (!this.steps?.length) return;
    if (!always && this.key) try { if (localStorage.getItem(this.key)) return; } catch {}
    if (!this.d) {
      this.d = h('dialog', { class: 'tour', 'aria-label': this.getAttribute('label') || 'A tour', 'data-variant': this.dataset.variant || null },
        `<span class="tour-hole" aria-hidden="true"></span><div class="tour-card" role="document" tabindex="-1"><span class="tour-step"></span><div class="tour-body"></div><div class="tour-dots" aria-hidden="true">${this.steps.map(() => '<i></i>').join('')}</div>
          <div class="tour-acts"><button type="button" class="btn tour-skip" data-variant="text" data-size="sm">Skip</button><button type="button" class="btn tour-back" data-size="sm">Back</button><button type="button" class="btn tour-next" data-variant="ink" data-size="sm">Next</button></div></div>`);
      doc.body.append(this.d);
      this.d.querySelector('.tour-skip').addEventListener('click', () => this.end(false));
      this.d.querySelector('.tour-back').addEventListener('click', () => this.go(this.i - 1));
      this.d.querySelector('.tour-next').addEventListener('click', () => (this.i >= this.steps.length - 1 ? this.end(true) : this.go(this.i + 1)));
      this.d.addEventListener('cancel', e => { e.preventDefault(); this.end(false); });
      // (a hint isn't modal, so Esc is its own to hear)
      this.d.addEventListener('keydown', e => { if (e.key === 'Escape' && !this.d.matches(':modal')) { e.preventDefault(); this.end(false); return; } if (e.target.closest('button') && (e.key === 'Enter' || e.key === ' ')) return; if (e.key === 'ArrowRight') this.d.querySelector('.tour-next').click(); if (e.key === 'ArrowLeft' && this.i > 0) this.go(this.i - 1); });
      this.fit = () => this.d.open && this.frame(false);
      addEventListener('resize', this.fit);
    }
    this.from = from || doc.activeElement;
    if (this.dataset.variant === 'hint') this.d.show(); else this.d.showModal();
    this.go(0);
  }
  go(i) {
    this.i = Math.max(0, Math.min(this.steps.length - 1, i));
    const s = this.steps[this.i], card = this.d.querySelector('.tour-card'), one = this.steps.length < 2;
    const t = doc.querySelector(s.dataset.for);
    card.querySelector('.tour-step').textContent = `${this.i + 1} of ${this.steps.length}`;
    card.querySelector('.tour-body').innerHTML = s.innerHTML;
    card.querySelectorAll('.tour-dots i').forEach((d, k) => d.toggleAttribute('data-on', k === this.i));
    // one step alone has no count, no dots and nothing to skip
    for (const x of card.querySelectorAll('.tour-step, .tour-dots, .tour-skip')) x.hidden = one;
    card.querySelector('.tour-back').hidden = this.i === 0;
    card.querySelector('.tour-next').textContent = this.i === this.steps.length - 1 ? this.getAttribute('done') || 'Done' : 'Next';
    const head = card.querySelector('.tour-body h2, .tour-body h3');
    if (head) { head.id = head.id || `tour-h-${this.id || 't'}`; this.d.setAttribute('aria-labelledby', head.id); }
    this.target = t;
    t?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: RM.matches ? 'auto' : 'smooth' });
    // place it now, and again once the scroll has settled
    this.frame(true);
    clearTimeout(this.tm); this.tm = setTimeout(() => this.frame(false), RM.matches ? 0 : 420);
    (card.querySelector('.tour-next')).focus({ preventScroll: true });
    emit(this, 'step', { index: this.i });
  }
  frame(enter) {
    const t = this.target, hole = this.d.querySelector('.tour-hole'), card = this.d.querySelector('.tour-card');
    const r = t ? t.getBoundingClientRect() : new DOMRect(innerWidth / 2, innerHeight / 2, 0, 0), pad = 8;
    const rad = t ? parseFloat(getComputedStyle(t).borderTopLeftRadius) || 14 : 0;
    hole.style.setProperty('--hx', `${r.left - pad}px`); hole.style.setProperty('--hy', `${r.top - pad}px`);
    hole.style.setProperty('--hw', `${r.width + pad * 2}px`); hole.style.setProperty('--hh', `${r.height + pad * 2}px`);
    hole.style.setProperty('--hr', `${Math.min(rad + pad, (r.height + pad * 2) / 2)}px`);
    const side = this.steps[this.i].dataset.side || 'bottom';
    place(card, { getBoundingClientRect: () => new DOMRect(r.left - pad, r.top - pad, r.width + pad * 2, r.height + pad * 2) }, { side: side === 'top' ? 'top' : 'bottom', align: this.steps[this.i].dataset.align || 'start', gap: 16 });
    if (side === 'right' || side === 'left') {
      const cw = card.offsetWidth, x = side === 'right' ? r.right + pad + 16 : r.left - pad - 16 - cw;
      if (x >= 12 && x + cw <= innerWidth - 12) { card.style.left = `${x}px`; card.style.top = `${Math.max(12, Math.min(innerHeight - card.offsetHeight - 12, r.top))}px`; card.style.setProperty('--ox', side === 'right' ? '0px' : '100%'); }
    }
    card.style.maxHeight = '';
    if (enter) { card.removeAttribute('data-in'); void card.offsetWidth; card.setAttribute('data-in', ''); }
  }
  end(finished) {
    if (!this.d?.open) return;
    if (this.key) try { localStorage.setItem(this.key, finished ? 'done' : 'skipped'); } catch {}
    this.d.close();
    this.from?.focus?.({ preventScroll: true });
    emit(this, 'end', { finished });
  }
}
customElements.define('m-tour', MTour);
doc.addEventListener('click', e => { const b = e.target.closest('[data-tour]'); if (b) doc.getElementById(b.dataset.tour)?.start?.(true, b); });

// ── m/src/components/media/compare/compare.js
/* ════════ m-compare: two pictures, the line and its knob; drag anywhere, or the arrow keys ════════ */
class MCompare extends HTMLElement {
  connectedCallback() {
    if (this.inp) return;
    const [a, b] = this.querySelectorAll(':scope > img');
    if (!a || !b) return;
    this.insertAdjacentHTML('beforeend', `<i class="cmp-line" aria-hidden="true"></i><i class="cmp-knob" aria-hidden="true">${ms('unfold_more')}</i>` +
      (this.dataset.before ? `<b class="cmp-tag l" aria-hidden="true">${esc(this.dataset.before)}</b>` : '') + (this.dataset.after ? `<b class="cmp-tag r" aria-hidden="true">${esc(this.dataset.after)}</b>` : ''));
    this.inp = h('input', { type: 'range', min: 0, max: 100, step: 1, value: this.getAttribute('value') || 50, 'aria-label': this.getAttribute('aria-label') || `${this.dataset.before || 'Before'} and ${this.dataset.after || 'after'}`, 'aria-valuetext': '' });
    this.append(this.inp);
    const set = v => { v = clamp(v, 0, 100); this.style.setProperty('--cut', v + '%'); this.inp.value = v; this.inp.setAttribute('aria-valuetext', Math.round(v) + ' %'); };
    set(+this.inp.value);
    this.inp.addEventListener('input', () => set(+this.inp.value));
    const at = e => { const r = this.getBoundingClientRect(); set(((e.clientX - r.left) / r.width) * 100); };
    this.addEventListener('pointerdown', e => { if (e.button > 0) return; e.preventDefault(); this.setPointerCapture(e.pointerId); this.dataset.dragging = ''; at(e); this.inp.focus({ preventScroll: true }); });
    this.addEventListener('pointermove', e => { if (this.hasAttribute('data-dragging')) at(e); });
    const end = () => delete this.dataset.dragging;
    this.addEventListener('pointerup', end); this.addEventListener('pointercancel', end);
  }
}
customElements.define('m-compare', MCompare);

// ── m/src/components/media/strip/strip.js
/* ════════ m-strip: a sideways row; [data-prev] and [data-next] step one item, and rest at the ends. While the row
      overflows it takes the focus itself (so the arrow keys scroll it), named by the strip's heading unless it has a name. ════════ */
class MStrip extends HTMLElement {
  connectedCallback() {
    if (this.row || !(this.row = this.querySelector('.strip'))) return;
    this.prev = this.querySelector('[data-prev]'); this.next = this.querySelector('[data-next]');
    const r = this.row, own = r.hasAttribute('tabindex'), hd = this.querySelector('h1, h2, h3, h4, h5, h6');
    if (hd && !r.hasAttribute('aria-label') && !r.hasAttribute('aria-labelledby')) r.setAttribute('aria-labelledby', ensureId(hd, 'strip-h'));
    // a named group, not a region: the strip's heading often names the section around it too, and two landmarks of one
    // name are one too many (the overview's plates were); the group is still announced by name as the focus enters it
    if (!r.hasAttribute('role') && (r.hasAttribute('aria-label') || r.hasAttribute('aria-labelledby'))) r.setAttribute('role', 'group');
    const by = d => { const it = this.row.firstElementChild; const w = it ? it.getBoundingClientRect().width + parseFloat(getComputedStyle(this.row).columnGap || 0) : this.row.clientWidth * .8; this.row.scrollBy({ left: d * w, behavior: smooth() }); };
    this.prev?.addEventListener('click', () => by(-1)); this.next?.addEventListener('click', () => by(1));
    let raf = 0;
    const sync = () => { raf = 0; const max = this.row.scrollWidth - this.row.clientWidth - 2; if (this.prev) this.prev.disabled = this.row.scrollLeft <= 2; if (this.next) this.next.disabled = this.row.scrollLeft >= max;
      if (!own) { if (max > 0) r.tabIndex = 0; else r.removeAttribute('tabindex'); } };
    this.row.addEventListener('scroll', () => (raf ||= requestAnimationFrame(sync)), { passive: true });
    new ResizeObserver(sync).observe(this.row);
    sync();
  }
}
customElements.define('m-strip', MStrip);

// ── m/src/components/media/arrive/arrive.js
const arriveIO = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.dataset.in = ''; arriveIO.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
/** play a heading's words again (the docs' replay buttons use it) */
function rearrive(el) { delete el.dataset.in; void el.offsetWidth; requestAnimationFrame(() => (el.dataset.in = '')); }
function arrive(el) {
  let i = 0;
  const walk = node => [...node.childNodes].forEach(n => {
    if (n.nodeType === 3) {
      const frag = doc.createDocumentFragment();
      n.textContent.split(/(\s+)/).forEach(part => { if (!part) return; if (/^\s+$/.test(part)) frag.append(part); else { const w = h('span', { class: 'w', style: `--i:${i++}` }); w.textContent = part; frag.append(w); } });
      n.replaceWith(frag);
    } else if (n.nodeType === 1 && n.tagName !== 'BR') { if (n.children.length || n.matches('.ms, img, svg')) { n.classList.add('w'); n.style.setProperty('--i', i++); } else walk(n); }
  });
  walk(el);
  // data-variant="lines": the words of a line rise together, so each word's beat is its line's
  if (el.dataset.variant === 'lines') { let top = -1e9, line = -1; el.querySelectorAll('.w').forEach(w => { if (w.offsetTop > top + w.offsetHeight / 2) { top = w.offsetTop; line++; } w.style.setProperty('--i', line); }); }
  el.classList.add('arrive'); el.dataset.split = '';
  if (RM.matches) el.dataset.in = ''; else arriveIO.observe(el);
}
enhance('[data-arrive], .arrive', once(arrive));
expose({ rearrive });

// ── m/src/components/media/video/video.js
/* ════════ <m-video [data-silent]><video src poster preload="metadata" controls><track kind="chapters" src="…vtt">
      </video></m-video>. The script takes the native controls away and puts its own under the picture: play (K or Space),
      the time, the scrubber split into the chapters of a chapters track (← → five seconds, J L ten, Home End, 0–9 a tenth
      of the way), the chapter you're in, sound (M; none when data-silent says the film has none) and the whole screen (F).
      A press on the picture plays or pauses it. Nothing plays by itself while motion is turned down. ════════ */
const vidClock = s => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
class MVideo extends HTMLElement {
  connectedCallback() {
    if (this.bar || !(this.video = this.querySelector('video'))) return;
    const v = this.video;
    v.controls = false; v.playsInline = true; v.tabIndex = -1;
    if (RM.matches && v.autoplay) { v.autoplay = false; v.pause(); }
    const name = this.getAttribute('aria-label') || v.getAttribute('aria-label') || 'the film';
    this.bar = h('div', { class: 'video-bar', role: 'group', 'aria-label': `Controls for ${name}` });
    this.play = h('button', { class: 'ib video-play', type: 'button', 'aria-label': 'Play', 'data-tip': 'Play', 'data-kbd': 'K' }, ms('play_arrow'));
    this.time = h('span', { class: 'video-time', 'aria-hidden': 'true' }, '0:00 / 0:00');
    this.scrub = h('div', { class: 'video-scrub' });
    this.range = h('input', { class: 'video-range', type: 'range', min: '0', max: '0', step: 'any', value: '0', 'aria-label': 'Where in the film' });
    this.head = h('span', { class: 'video-head', 'aria-hidden': 'true' });
    this.chapter = h('span', { class: 'video-chapter', 'aria-live': 'polite' });
    this.sound = this.hasAttribute('data-silent') ? null : h('button', { class: 'ib', type: 'button', 'aria-label': 'Sound off', 'data-tip': 'Sound off', 'data-kbd': 'M' }, ms('volume_up'));
    this.full = h('button', { class: 'ib', type: 'button', 'aria-label': 'The whole screen', 'data-tip': 'The whole screen', 'data-kbd': 'F' }, ms('fullscreen'));
    this.scrub.append(this.range, this.head);
    this.bar.append(...[this.play, this.time, this.scrub, this.chapter, this.sound, this.full].filter(Boolean));
    v.after(this.bar);
    this.parts = [];

    const toggle = () => (v.paused || v.ended ? v.play().catch(() => {}) : v.pause());
    this.play.addEventListener('click', toggle);
    v.addEventListener('click', toggle);
    this.sound?.addEventListener('click', () => { v.muted = !v.muted; });
    this.full.addEventListener('click', () => { const r = doc.fullscreenElement === this ? doc.exitFullscreen() : this.requestFullscreen?.(); r?.catch?.(() => {}); });
    doc.addEventListener('fullscreenchange', () => { const on = doc.fullscreenElement === this; this.full.innerHTML = ms(on ? 'fullscreen_exit' : 'fullscreen'); this.say(this.full, on ? 'Leave the whole screen' : 'The whole screen'); });
    for (const t of ['play', 'pause', 'ended', 'waiting', 'playing', 'canplay']) v.addEventListener(t, () => this.state());
    v.addEventListener('volumechange', () => { if (!this.sound) return; this.sound.innerHTML = ms(v.muted ? 'volume_off' : 'volume_up'); this.say(this.sound, v.muted ? 'Sound on' : 'Sound off'); });
    v.addEventListener('timeupdate', () => this.show());
    v.addEventListener('loadedmetadata', () => this.build());
    v.addEventListener('durationchange', () => this.build());
    v.addEventListener('error', () => { this.bar.replaceChildren(h('span', { class: 'video-said', role: 'status' }, 'This film can’t be played here.')); });
    // the chapters, from a chapters track (its cues load once the track is in use)
    const tr = v.querySelector('track[kind=chapters]');
    if (tr) { tr.track.mode = 'hidden'; tr.addEventListener('load', () => this.build()); }
    // the scrubber by pointer: the time under the pointer, measured along the segments (the gaps belong to no time)
    const seek = e => { const t = this.timeAt(e.clientX); if (t != null) { v.currentTime = t; this.show(t); } };
    this.scrub.addEventListener('pointerdown', e => { if (e.button) return; this.scrub.setPointerCapture(e.pointerId); this.dragging = true; seek(e); this.range.focus({ preventScroll: true }); });
    this.scrub.addEventListener('pointermove', e => this.dragging && seek(e));
    this.scrub.addEventListener('pointerup', () => (this.dragging = false));
    this.scrub.addEventListener('pointercancel', () => (this.dragging = false));
    this.range.addEventListener('input', () => { v.currentTime = +this.range.value; this.show(+this.range.value); });
    this.addEventListener('keydown', e => this.key(e));
    this.dataset.ready = '';
    this.build(); this.state();
  }
  say(btn, words) { btn.setAttribute('aria-label', words); btn.dataset.tip = words; }   // its name and its tooltip, together
  build() {
    const v = this.video, d = v.duration;
    if (!Number.isFinite(d) || d <= 0) return;
    const cues = [...(v.querySelector('track[kind=chapters]')?.track?.cues || [])];
    this.parts = cues.length ? cues.map(c => ({ start: c.startTime, end: Math.min(d, c.endTime), name: c.text })) : [{ start: 0, end: d, name: '' }];
    for (const s of this.scrub.querySelectorAll('.video-seg')) s.remove();
    this.segs = this.parts.map(p => { const s = h('span', { class: 'video-seg', 'aria-hidden': 'true' }, '<i></i>'); s.style.setProperty('--len', Math.max(.001, p.end - p.start)); return s; });
    this.range.before(...this.segs);
    this.range.max = String(d);
    this.show();
  }
  /** where a pointer at x is, in seconds: along the segment under it, or the nearest end of a gap */
  timeAt(x) {
    if (!this.segs?.length) return null;
    for (let i = 0; i < this.segs.length; i++) {
      const r = this.segs[i].getBoundingClientRect(), p = this.parts[i], next = this.segs[i + 1]?.getBoundingClientRect();
      if (x <= r.right || !next) return p.start + clamp((x - r.left) / r.width) * (p.end - p.start);
      if (x < next.left) return x - r.right < next.left - x ? p.end : this.parts[i + 1].start;
    }
    return null;
  }
  show(t = this.video.currentTime) {
    const v = this.video, d = Number.isFinite(v.duration) ? v.duration : 0;
    this.time.textContent = `${vidClock(t)} / ${vidClock(d)}`;
    if (!this.segs?.length) return;
    let at = 0;
    this.parts.forEach((p, i) => {
      const f = clamp((t - p.start) / Math.max(.001, p.end - p.start));
      this.segs[i].style.setProperty('--f', f);
      if (t >= p.start && (t < p.end || i === this.parts.length - 1)) at = i;
    });
    const seg = this.segs[at], box = this.scrub.getBoundingClientRect(), r = seg.getBoundingClientRect(), p = this.parts[at];
    this.head.style.setProperty('--x', `${r.left - box.left + clamp((t - p.start) / Math.max(.001, p.end - p.start)) * r.width}px`);
    if (!this.dragging) this.range.value = String(t);
    const name = p.name;
    if (this.chapter.textContent !== name) this.chapter.textContent = name;
    this.range.setAttribute('aria-valuetext', `${vidClock(t)} of ${vidClock(d)}${name ? `, ${name}` : ''}`);
    if (this.at !== at) { this.at = at; emit(this, 'change', { chapter: at, name }); }
  }
  state() {
    const v = this.video, s = v.ended ? 'ended' : v.paused ? 'paused' : 'playing';
    this.dataset.state = s;
    this.setAttribute('aria-busy', String(!v.paused && v.readyState < 3));
    this.play.innerHTML = ms(s === 'playing' ? 'pause' : s === 'ended' ? 'replay' : 'play_arrow');
    this.say(this.play, s === 'playing' ? 'Pause' : s === 'ended' ? 'Play again' : 'Play');
  }
  key(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const v = this.video, d = Number.isFinite(v.duration) ? v.duration : 0, onRange = e.target === this.range, k = e.key;
    const go = t => { v.currentTime = clamp(t, 0, d); this.show(v.currentTime); };
    if (k === 'k' || k === 'K' || (k === ' ' && (onRange || e.target === this))) { e.preventDefault(); v.paused || v.ended ? v.play().catch(() => {}) : v.pause(); }
    else if (k === 'j' || k === 'J') { e.preventDefault(); go(v.currentTime - 10); }
    else if (k === 'l' || k === 'L') { e.preventDefault(); go(v.currentTime + 10); }
    else if (onRange && (k === 'ArrowLeft' || k === 'ArrowDown')) { e.preventDefault(); go(v.currentTime - 5); }
    else if (onRange && (k === 'ArrowRight' || k === 'ArrowUp')) { e.preventDefault(); go(v.currentTime + 5); }
    else if (onRange && k === 'Home') { e.preventDefault(); go(0); }
    else if (onRange && k === 'End') { e.preventDefault(); go(d); }
    else if (/^[0-9]$/.test(k)) { e.preventDefault(); go(d * +k / 10); }
    else if ((k === 'm' || k === 'M') && this.sound) { e.preventDefault(); v.muted = !v.muted; }
    else if (k === 'f' || k === 'F') { e.preventDefault(); this.full.click(); }
  }
}
customElements.define('m-video', MVideo);

// ── m/src/components/media/histogram/histogram.js
/* ════════ <m-histogram for="img-id"> (or src="photo.avif"), mode="luma|rgb", clip="0.5" (the share, in %, at pure black
      or white that counts as clipped). It reads the picture at 320 px, again whenever it loads a new one; draws brightness,
      or red, green and blue on rows of their own; marks what's clipped in words; and its plot is a slider you can move
      through the levels (pointer or keys), with the share of the picture at each. A table under it gives eight bands.
      Emits change { clipped: { shadows, highlights }, zone } after each read. ════════ */
const HIST_W = 320;
const HIST_CH = { l: 'Brightness', r: 'Red', g: 'Green', b: 'Blue' };
const histZone = l => (l < 32 ? 'deep shadows' : l < 96 ? 'shadows' : l < 160 ? 'midtones' : l < 224 ? 'highlights' : 'bright highlights');
const histPct = v => (v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toFixed(2)) + ' %';
class MHistogram extends HTMLElement {
  static observedAttributes = ['src', 'for', 'mode', 'clip'];
  connectedCallback() {
    if (this.plot) return;
    this.innerHTML = `<div class="histogram-plot" tabindex="0" role="slider" aria-label="${esc(this.getAttribute('label') || 'Histogram')}" aria-valuemin="0" aria-valuemax="255" aria-valuenow="128">
        <span class="histogram-cross" aria-hidden="true"></span><span class="histogram-tip" aria-hidden="true"></span></div>
      <div class="histogram-foot" aria-hidden="true"><span>Shadows</span><span>Midtones</span><span>Highlights</span></div>
      <p class="histogram-clip" aria-live="polite"></p>
      <details class="histogram-table"><summary>As a table</summary><table class="table compact"><thead></thead><tbody></tbody></table></details>`;
    this.plot = this.querySelector('.histogram-plot');
    this.level = 128;
    const at = e => { const r = this.plot.getBoundingClientRect(), x0 = this.mode() === 'rgb' ? this.plot.querySelector('svg')?.getBoundingClientRect().left ?? r.left : r.left;
      const w = r.right - x0; return clamp(Math.round((e.clientX - x0) / w * 255), 0, 255); };
    this.plot.addEventListener('pointermove', e => this.show(at(e)));
    this.plot.addEventListener('pointerdown', e => { this.show(at(e)); });
    this.plot.addEventListener('pointerleave', () => { if (doc.activeElement !== this.plot) this.plot.removeAttribute('data-on'); });
    this.plot.addEventListener('focus', () => this.show(this.level));
    this.plot.addEventListener('blur', () => this.plot.removeAttribute('data-on'));
    this.plot.addEventListener('keydown', e => {
      const step = e.shiftKey ? 16 : 1;
      const to = { ArrowRight: this.level + step, ArrowUp: this.level + step, ArrowLeft: this.level - step, ArrowDown: this.level - step, PageUp: this.level + 32, PageDown: this.level - 32, Home: 0, End: 255 }[e.key];
      if (to === undefined) return;
      e.preventDefault(); this.show(clamp(to, 0, 255));
    });
    this.load();
  }
  attributeChangedCallback(name) { if (!this.plot) return; if (name === 'mode' || name === 'clip') this.draw(); else { this.watched = null; this.load(); } }
  mode() { return this.getAttribute('mode') === 'rgb' ? 'rgb' : 'luma'; }
  load() {
    const id = this.getAttribute('for'), src = this.getAttribute('src');
    if (id) {
      const img = doc.getElementById(id);
      if (!img || this.watched === img) return;
      this.watched = img;
      img.addEventListener('load', () => this.read(img));
      if (img.complete && img.naturalWidth) this.read(img);
    } else if (src) { const img = new Image(); img.decoding = 'async'; img.onload = () => this.read(img); img.src = src; }
  }
  /** read a picture (an img, a canvas, a video frame) and draw what it holds */
  read(img) {
    const iw = img.naturalWidth || img.videoWidth || img.width, ih = img.naturalHeight || img.videoHeight || img.height;
    if (!iw || !ih) return;
    const w = Math.min(HIST_W, iw), hh = Math.max(1, Math.round(w * ih / iw));
    const cv = Object.assign(doc.createElement('canvas'), { width: w, height: hh }), cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(img, 0, 0, w, hh);
    let d;
    try { d = cx.getImageData(0, 0, w, hh).data; } catch { this.querySelector('.histogram-clip').textContent = 'This picture can’t be read from here.'; return; }
    const B = { l: new Float64Array(256), r: new Float64Array(256), g: new Float64Array(256), b: new Float64Array(256) };
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 8) continue;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      B.r[r]++; B.g[g]++; B.b[b]++; B.l[Math.round(.2126 * r + .7152 * g + .0722 * b)]++; n++;
    }
    this.bins = B; this.n = n || 1;
    this.draw();
  }
  draw() {
    if (!this.bins) return;
    const chs = this.mode() === 'rgb' ? ['r', 'g', 'b'] : ['l'];
    const path = ch => {
      // a light smoothing for the eye, scaled to the busiest level short of the spikes at the very ends
      const raw = this.bins[ch], v = Array.from(raw, (x, i) => (raw[Math.max(0, i - 1)] + 2 * x + raw[Math.min(255, i + 1)]) / 4);
      const inner = [...v.slice(1, 255)].sort((a, b) => a - b), top = (inner[Math.floor(inner.length * .995)] || 1) * 1.12;
      const ys = v.map(x => 100 - clamp(x / top) * 96);
      const line = ys.map((y, i) => `${i ? 'L' : 'M'}${i} ${y.toFixed(1)}`).join('');
      return `<path class="histogram-area" d="${line}L255 100L0 100Z"/><path class="histogram-line" d="${line}"/>`;
    };
    const grid = '<path class="histogram-grid" d="M64 0V100M128 0V100M192 0V100M0 100H255"/>';
    this.plot.querySelectorAll('.histogram-row').forEach(r => r.remove());
    const rows = chs.map(ch => `<div class="histogram-row" data-ch="${ch}"><b>${HIST_CH[ch]}</b><svg viewBox="0 0 255 100" preserveAspectRatio="none" aria-hidden="true">${grid}${path(ch)}</svg></div>`).join('');
    this.plot.insertAdjacentHTML('afterbegin', rows);
    // clipping: the share of the picture at pure black and pure white, said in words
    const lim = +(this.getAttribute('clip') ?? .5), L = this.bins.l, sh = L[0] / this.n * 100, hi = L[255] / this.n * 100;
    const parts = [];
    if (sh >= lim) parts.push(`<span><i class="dot warn"></i>${histPct(sh)} of the shadows are pure black</span>`);
    if (hi >= lim) parts.push(`<span><i class="dot warn"></i>${histPct(hi)} of the highlights are pure white</span>`);
    this.querySelector('.histogram-clip').innerHTML = parts.join('') || '<span>Nothing clipped</span>';
    // where most of it sits, in eight bands: the table, and the plot's description
    const bands = Array.from({ length: 8 }, (_, k) => chs.map(ch => { let s = 0; for (let i = k * 32; i < k * 32 + 32; i++) s += this.bins[ch][i]; return s / this.n * 100; }));
    const zones = { 'deep shadows': 0, shadows: 0, midtones: 0, highlights: 0, 'bright highlights': 0 };
    for (let i = 0; i < 256; i++) zones[histZone(i)] += L[i];
    const zone = Object.entries(zones).sort((a, b) => b[1] - a[1])[0];
    this.plot.setAttribute('aria-description', `Most of the picture is in the ${zone[0]}, ${histPct(zone[1] / this.n * 100)}. ${this.querySelector('.histogram-clip').textContent}.`);
    this.querySelector('thead').innerHTML = `<tr><th scope="col">Levels</th>${chs.map(ch => `<th scope="col" class="num">${HIST_CH[ch]}</th>`).join('')}</tr>`;
    this.querySelector('tbody').innerHTML = bands.map((b, k) => `<tr><th scope="row">${k * 32}–${k * 32 + 31}</th>${b.map(x => `<td class="num">${histPct(x)}</td>`).join('')}</tr>`).join('');
    if (this.plot.hasAttribute('data-on')) this.show(this.level);
    emit(this, 'change', { clipped: { shadows: sh, highlights: hi }, zone: zone[0] });
  }
  show(level) {
    this.level = level;
    const chs = this.mode() === 'rgb' ? ['r', 'g', 'b'] : ['l'];
    const svg = this.plot.querySelector('svg'), pr = this.plot.getBoundingClientRect(), sr = svg?.getBoundingClientRect() || pr;
    const x = sr.left - pr.left + level / 255 * sr.width;
    this.plot.style.setProperty('--x', `${x}px`);
    const tip = this.plot.querySelector('.histogram-tip');
    const at = ch => (this.bins ? this.bins[ch][level] / this.n * 100 : 0);
    tip.innerHTML = this.bins ? chs.map(ch => `<span style="--hc: var(--hist-${ch === 'l' ? 'x' : ch}, currentColor)"><b>${histPct(at(ch))}</b> ${chs.length > 1 ? `<i></i>${HIST_CH[ch]}` : 'of the picture'}</span>`).join('') + `<span>Level ${level}, ${histZone(level)}</span>` : `Level ${level}`;
    const half = tip.offsetWidth / 2;
    this.plot.style.setProperty('--tx', `${clamp(x, half, pr.width - half)}px`);
    this.plot.dataset.on = '';
    this.plot.setAttribute('aria-valuenow', level);
    this.plot.setAttribute('aria-valuetext', `Level ${level}, ${histZone(level)}: ` + chs.map(ch => `${chs.length > 1 ? HIST_CH[ch].toLowerCase() + ' ' : ''}${histPct(at(ch))}`).join(', '));
  }
}
customElements.define('m-histogram', MHistogram);

// ── m/src/components/media/loupe/loupe.js
/* ════════ <m-loupe zoom="1"><img src="photo-720.avif" data-full="photo.avif" alt="…"></m-loupe>
      A lens shows the picture at its full size (zoom="1": one picture pixel to one screen pixel; 2 is twice that), from
      data-full once it's wanted (the shown picture until then). The pointer holds it over a spot; on a touch screen a
      press shows it above the finger; focused, the arrows move it (Shift for larger steps), + and − change the zoom,
      Esc puts it away. Emits change { x, y, zoom } (x and y as fractions of the picture). ════════ */
class MLoupe extends HTMLElement {
  connectedCallback() {
    if (this.img || !(this.img = this.querySelector('img'))) return;
    this.lens = h('span', { class: 'loupe-lens', 'aria-hidden': 'true' });
    this.scaleTag = h('span', { class: 'loupe-scale', 'aria-hidden': 'true' });
    this.append(this.lens, this.scaleTag);
    this.tabIndex = 0;
    this.setAttribute('role', 'group');
    this.setAttribute('aria-roledescription', 'loupe');
    if (!this.hasAttribute('aria-label')) this.setAttribute('aria-label', `Loupe over: ${this.img.alt || 'the photograph'}`);
    this.setAttribute('aria-description', 'Arrow keys move the lens; plus and minus change its zoom; Escape puts it away.');
    this.x = .5; this.y = .5;
    this.zoom = +(this.getAttribute('zoom') || 1);
    const at = e => { const r = this.img.getBoundingClientRect(); return [clamp((e.clientX - r.left) / r.width), clamp((e.clientY - r.top) / r.height)]; };
    this.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') { this.full(); this.show(...at(e)); } });
    this.addEventListener('pointermove', e => { if (e.pointerType === 'mouse' || this.dataset.touch != null) this.show(...at(e)); });
    this.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && document.activeElement !== this) this.hide(); });
    this.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse') return;
      this.full(); this.dataset.touch = ''; this.setPointerCapture(e.pointerId); this.show(...at(e));
    });
    const up = e => { if (e.pointerType !== 'mouse') { delete this.dataset.touch; this.hide(); } };
    this.addEventListener('pointerup', up); this.addEventListener('pointercancel', up);
    this.addEventListener('focus', () => { this.full(); this.show(this.x, this.y); });
    this.addEventListener('blur', () => this.hide());
    this.addEventListener('keydown', e => {
      const s = e.shiftKey ? .1 : .02;
      const mv = { ArrowRight: [s, 0], ArrowLeft: [-s, 0], ArrowDown: [0, s], ArrowUp: [0, -s] }[e.key];
      if (mv) { e.preventDefault(); this.show(clamp(this.x + mv[0]), clamp(this.y + mv[1])); return; }
      if (e.key === '+' || e.key === '=') { e.preventDefault(); this.zoom = Math.min(4, this.zoom * 2); this.show(this.x, this.y); return; }
      if (e.key === '-' || e.key === '_') { e.preventDefault(); this.zoom = Math.max(.5, this.zoom / 2); this.show(this.x, this.y); return; }
      if (e.key === 'Escape') { this.hide(); }
    });
    // beside: the lens has its own place and is always there, so it shows the middle from the start
    if (this.dataset.variant === 'beside') {
      const first = () => { this.full(); this.show(this.x, this.y, true); };
      if (this.img.complete && this.img.naturalWidth) first(); else this.img.addEventListener('load', first, { once: true });
    }
  }
  /** the full-size picture, fetched the first time the lens is wanted */
  full() {
    if (this.big) return;
    const src = this.img.dataset.full || this.img.currentSrc || this.img.src;
    this.big = new Image();
    this.big.onload = () => this.show(this.x, this.y, true);
    this.big.src = src;
    this.lens.style.backgroundImage = `url("${src.replace(/"/g, '%22')}")`;
  }
  show(x, y, quiet) {
    this.x = x; this.y = y;
    const r = this.img.getBoundingClientRect(), nw = this.big?.naturalWidth || this.img.naturalWidth || r.width, nh = this.big?.naturalHeight || this.img.naturalHeight || r.height;
    const d = this.lens.offsetWidth || 180, bw = nw * this.zoom, bh = nh * this.zoom;
    this.style.setProperty('--lx', `${x * r.width}px`);
    this.style.setProperty('--ly', `${y * r.height}px`);
    this.lens.style.backgroundSize = `${bw}px ${bh}px`;
    this.lens.style.backgroundPosition = `${d / 2 - x * bw}px ${d / 2 - y * bh}px`;
    this.scaleTag.textContent = `${Math.round(this.zoom * 100)} %`;
    this.dataset.on = '';
    if (!quiet) emit(this, 'change', { x, y, zoom: this.zoom });
  }
  hide() { this.removeAttribute('data-on'); }
}
customElements.define('m-loupe', MLoupe);

// ── m/src/components/media/crop/crop.js
/* ════════ <m-crop ratio="free|1|4/5|3/2|16/9" name="crop"><img src="…" alt="…"></m-crop>
      Drag inside the frame to move it, a corner or a side to size it; with a ratio the frame keeps that shape (corners
      only). Keys: on the frame the arrows move it, on its corner (the next Tab) they size it; Shift for larger steps.
      Set ratio later and the frame takes the new shape round the same middle. With name, four hidden inputs carry it in a
      form (name-x, -y, -w, -h, fractions of the picture). Emits change { x, y, w, h } as each move ends. ════════ */
const CROP_HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const cropPct = v => `${Math.round(v * 100)} %`;
class MCrop extends HTMLElement {
  static observedAttributes = ['ratio'];
  connectedCallback() {
    if (this.box || !(this.img = this.querySelector('img'))) return;
    this.box = h('div', { class: 'crop-box', tabindex: '0', role: 'group', 'aria-roledescription': 'crop frame' });
    for (const k of CROP_HANDLES) this.box.append(h('button', k === 'se' ? { type: 'button', class: 'crop-h', 'data-h': k, 'aria-label': 'Size the crop' } : { type: 'button', class: 'crop-h', 'data-h': k, tabindex: '-1', 'aria-hidden': 'true' }));
    this.append(h('div', { class: 'crop-clip', 'aria-hidden': 'true' }, '<div class="crop-shade"></div>'), this.box);
    const name = this.getAttribute('name');
    this.inputs = name ? ['x', 'y', 'w', 'h'].map(k => this.appendChild(h('input', { type: 'hidden', name: `${name}-${k}` }))) : [];
    this.r = { x: .08, y: .08, w: .84, h: .84 };
    if (this.img.complete && this.img.naturalWidth) this.shape(); else this.img.addEventListener('load', () => this.shape(), { once: true });
    this.draw();
    this.box.addEventListener('pointerdown', e => this.grab(e));
    this.box.addEventListener('keydown', e => this.key(e));
  }
  attributeChangedCallback() { if (this.box) { this.shape(); emit(this, 'change', { ...this.r }); } }
  /** the frame's shape as width ÷ height in fractions of the picture (null when free) */
  k() {
    const a = this.getAttribute('ratio');
    if (!a || a === 'free') return null;
    const [p, q] = a.split(/[/:]/).map(Number), r = q ? p / q : p;
    return r / ((this.img.naturalWidth / this.img.naturalHeight) || 1.5);
  }
  shape() {
    const k = this.k(), r = this.r;
    if (!k) { this.draw(); return; }
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    let w = Math.sqrt(r.w * r.h * k), hh = w / k;
    const s = Math.min(1, .96 / w, .96 / hh); w *= s; hh *= s;
    this.r = { w, h: hh, x: clamp(cx - w / 2, 0, 1 - w), y: clamp(cy - hh / 2, 0, 1 - hh) };
    this.draw();
  }
  draw() {
    const r = this.r;
    for (const [k, v] of Object.entries({ '--x': r.x, '--y': r.y, '--w': r.w, '--h': r.h })) this.style.setProperty(k, v);
    this.box.setAttribute('aria-label', `Crop frame: ${cropPct(r.w)} of the width by ${cropPct(r.h)} of the height, from ${cropPct(r.x)} in and ${cropPct(r.y)} down`);
    this.inputs.forEach((inp, i) => (inp.value = [r.x, r.y, r.w, r.h][i].toFixed(4)));
  }
  /** size from a handle by dx, dy (fractions), keeping the opposite side or corner where it is */
  size(hd, dx, dy, from) {
    const k = this.k(), min = .06;
    let { x, y, w, h: hh } = from;
    if (hd.includes('e')) w = clamp(from.w + dx, min, 1 - from.x);
    if (hd.includes('w')) { const nx = clamp(from.x + dx, 0, from.x + from.w - min); w = from.w + from.x - nx; x = nx; }
    if (hd.includes('s')) hh = clamp(from.h + dy, min, 1 - from.y);
    if (hd.includes('n')) { const ny = clamp(from.y + dy, 0, from.y + from.h - min); hh = from.h + from.y - ny; y = ny; }
    if (k) {
      // the shape holds: the width leads, the height follows, and both stay inside the picture
      hh = w / k;
      const roomH = hd.includes('n') ? from.y + from.h : 1 - from.y;
      if (hh > roomH) { hh = roomH; w = hh * k; }
      if (hd.includes('w')) x = from.x + from.w - w;
      y = hd.includes('n') ? from.y + from.h - hh : from.y;
    }
    this.r = { x, y, w, h: hh };
  }
  grab(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    const hd = e.target.closest('.crop-h')?.dataset.h, rect = this.img.getBoundingClientRect(), from = { ...this.r }, x0 = e.clientX, y0 = e.clientY;
    (hd ? e.target.closest('.crop-h') : this.box).focus({ preventScroll: true });
    this.dataset.moving = '';
    if (hd) e.target.closest('.crop-h').dataset.active = '';
    const move = ev => {
      const dx = (ev.clientX - x0) / rect.width, dy = (ev.clientY - y0) / rect.height;
      if (hd) this.size(hd, dx, dy, from);
      else this.r = { ...from, x: clamp(from.x + dx, 0, 1 - from.w), y: clamp(from.y + dy, 0, 1 - from.h) };
      this.draw();
    };
    const up = () => {
      removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
      delete this.dataset.moving; this.box.querySelector('[data-active]')?.removeAttribute('data-active');
      emit(this, 'change', { ...this.r });
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  }
  key(e) {
    const s = e.shiftKey ? .1 : .01;
    const d = { ArrowRight: [s, 0], ArrowLeft: [-s, 0], ArrowDown: [0, s], ArrowUp: [0, -s] }[e.key];
    if (!d) return;
    e.preventDefault();
    const r = { ...this.r };
    // on the corner: a held shape grows with → or ↓ and shrinks with ← or ↑; a free one takes width and height apart
    if (e.target.closest('.crop-h')) this.size('se', this.k() ? d[0] + d[1] : d[0], this.k() ? 0 : d[1], r);
    else this.r = { ...r, x: clamp(r.x + d[0], 0, 1 - r.w), y: clamp(r.y + d[1], 0, 1 - r.h) };
    this.draw();
    emit(this, 'change', { ...this.r });
  }
}
customElements.define('m-crop', MCrop);

// ── m/src/components/media/contact-sheet/contact-sheet.js
/* ════════ .contact-sheet: a frame that is a button with aria-pressed is a pick; a press rings it or lets it go.
      The sheet emits change with { picked: [frames] }. ════════ */
function contactSheet(sheet) {
  sheet.addEventListener('click', e => {
    const f = e.target.closest('button.contact-frame[aria-pressed]');
    if (!f) return;
    f.setAttribute('aria-pressed', String(f.getAttribute('aria-pressed') !== 'true'));
    emit(sheet, 'change', { picked: [...sheet.querySelectorAll('.contact-frame[aria-pressed=true]')] });
  });
}
enhance('.contact-sheet', once(contactSheet));

// ── m/src/components/sections/signup/signup.js
/* ════════ .signup: around a form and its .signup-done. A send with an address it can't read says why under the field
      and goes back to it. A send that can go says send first, on the .signup, with { data } (its FormData),
      cancelable: unless a script calls preventDefault() and sends it itself, it goes to the form's action as any form
      does. One that does sets data-state="sending" and later "sent" or "error" (data-why says what went wrong). Sent:
      the form gives way to .signup-done, which takes the focus; its [data-echo="email"] says what was written in that
      field, and its [data-again] brings the form back. A page can arrive with data-state="sent". ════════ */
const signupWords = c => c.dataset.error || (c.validity.valueMissing
  ? (c.type === 'email' ? 'Write your email address first' : c.dataset.errorMissing || 'This is needed')
  : c.validity.typeMismatch && c.type === 'email' ? 'Write it as name@example.com' : c.validationMessage || 'Not right yet');

function signupSay(form, c, msg, role) {
  // under the row the field shares with its button, else under the field, else under the button
  const at = (c && (c.closest('.signup-row') || c.closest('.field') || c)) || form.lastElementChild;
  let el = form.querySelector('.help.error[data-signup]');
  if (!msg) { if (el) { c?.removeAttribute('aria-invalid'); c?.setAttribute('aria-describedby', (c.getAttribute('aria-describedby') || '').split(' ').filter(x => x && x !== el.id).join(' ')); el.remove(); } return; }
  if (!el) el = h('span', { class: 'help error', id: uid('m-signup'), 'data-signup': '' });
  if (role) el.setAttribute('role', role); else el.removeAttribute('role');
  at.after(el);
  el.textContent = msg;
  if (c && !role) {
    c.setAttribute('aria-invalid', 'true');
    c.setAttribute('aria-describedby', [...new Set([...(c.getAttribute('aria-describedby') || '').split(' ').filter(Boolean), el.id])].join(' '));
  }
}

enhance('.signup', once(box => {
  const form = box.querySelector('form'), done = box.querySelector('.signup-done');
  if (!form) return;
  form.noValidate = true;
  const button = () => form.querySelector('[type=submit], button:not([type])');
  form.addEventListener('submit', e => {
    if (box.dataset.state === 'sending') { e.preventDefault(); return; }
    const bad = [...form.elements].find(c => c.willValidate && !c.checkValidity());
    if (bad) { e.preventDefault(); signupSay(form, bad, signupWords(bad)); bad.focus(); return; }
    const go = new CustomEvent('send', { bubbles: true, cancelable: true, detail: { data: new FormData(form), form } });
    if (!box.dispatchEvent(go)) { e.preventDefault(); box.dataset.state = 'sending'; }
  });
  // once put right, the message goes
  form.addEventListener('input', e => { const c = e.target; if (c.getAttribute?.('aria-invalid') === 'true' && c.checkValidity()) signupSay(form, c, ''); });
  box.addEventListener('click', e => {
    if (!e.target.closest('[data-again]')) return;
    delete box.dataset.state;
    const c = form.querySelector('input[type=email]') || form.querySelector('input');
    c?.focus(); c?.select?.();
  });
  // what the state says: busy while it goes; the message in place of the form once it has; why, if it didn't
  const show = () => {
    const s = box.dataset.state, b = button();
    if (s === 'sending') b?.setAttribute('aria-busy', 'true'); else b?.removeAttribute('aria-busy');
    if (s === 'error') signupSay(form, b, box.dataset.why || 'That didn’t go: try again in a minute.', 'alert');
    else if (form.querySelector('.help.error[role=alert][data-signup]')) signupSay(form, null, '');
    if (s === 'sent' && done) {
      for (const el of done.querySelectorAll('[data-echo]')) { const v = form.elements[el.dataset.echo]?.value; if (v) el.textContent = v; }
      ensureId(done, 'm-signup-done');
      if (!done.hasAttribute('tabindex')) done.tabIndex = -1;
      done.focus({ preventScroll: true });
    }
  };
  new MutationObserver(show).observe(box, { attributes: true, attributeFilter: ['data-state', 'data-why'] });
}));

start();
export { m, place, upgrade, h, RM, toast, ground, seedOf, seedFromPixels, tonesOf, hex, fmtValue, setTheme, movePill, setCurrent, openDialog, closeDialog, sortTable, rearrive };

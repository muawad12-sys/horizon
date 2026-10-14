// Shared helpers for the store and the admin panel.

export const GOVS = [
  ['baghdad', 'بغداد'], ['basra', 'البصرة'], ['nineveh', 'نينوى'], ['erbil', 'أربيل'],
  ['sulaymaniyah', 'السليمانية'], ['duhok', 'دهوك'], ['kirkuk', 'كركوك'], ['diyala', 'ديالى'],
  ['anbar', 'الأنبار'], ['saladin', 'صلاح الدين'], ['babil', 'بابل'], ['karbala', 'كربلاء'],
  ['najaf', 'النجف'], ['wasit', 'واسط'], ['qadisiyah', 'القادسية'], ['muthanna', 'المثنى'],
  ['dhiqar', 'ذي قار'], ['maysan', 'ميسان'],
];
export const govName = (k) => (GOVS.find((g) => g[0] === k) || [k, k])[1];

export const GENDER = { men: 'رجالي', women: 'نسائي' };

export const STATUS = {
  new: 'جديد', confirmed: 'مؤكد', shipping: 'قيد التوصيل', delivered: 'تم التسليم', cancelled: 'ملغي',
};

export const MAX_LINES = 5; // must match firestore.rules
export const MAX_QTY = 10; // per product, must match firestore.rules

const nf = new Intl.NumberFormat('en-US');
export const num = (n) => nf.format(n || 0);
export const money = (n) => `<span class="num">${num(n)}</span> د.ع`;

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Arabic-Indic / Persian digits → ASCII.
export const toLatinDigits = (s) => String(s ?? '')
  .replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 0x660)
  .replace(/[۰-۹]/g, (d) => d.charCodeAt(0) - 0x6f0);

// Accepts 07XXXXXXXXX, 7XXXXXXXXX, 9647XXXXXXXXX, +9647…, 009647… → "+9647XXXXXXXXX" or null.
export function normalizePhone(input) {
  let d = toLatinDigits(input).replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('964')) d = '0' + d.slice(3);
  if (d.startsWith('7') && d.length === 10) d = '0' + d;
  return /^07\d{9}$/.test(d) ? '+964' + d.slice(1) : null;
}
// "+9647701234567" → "0770 123 4567"
export const prettyPhone = (p) => (p ? ('0' + p.slice(4)).replace(/^(\d{4})(\d{3})(\d{4})$/, '$1 $2 $3') : '');
export const waLink = (phone, text = '') =>
  `https://wa.me/${String(phone).replace(/\D/g, '')}${text ? '?text=' + encodeURIComponent(text) : ''}`;

export const productTitle = (p) => `${p.code} — ${GENDER[p.gender] || ''}`;

// ── Brand logo: two interlocking triple-line rings under a bar (from the real packaging) ──
let uid = 0;
const LOGO_FONT = "'Helvetica Neue', Arial, sans-serif";
// Inner SVG content of the logo in a 120×114 box. `color` fills strokes/text.
function logoInner(color, withText) {
  const id = `npl${++uid}`;
  const L = [45.5, 62];
  const R = [74.5, 62];
  const ring = (c) => [[28.6, 3.2], [23.4, 2.4], [18.6, 2.4]]
    .map(([r, w]) => `<circle cx="${c[0]}" cy="${c[1]}" r="${r}" stroke-width="${w}"/>`).join('');
  // Knock-out of the other ring's band, top half (sweep 1) or bottom half (sweep 0): makes the rings interlock.
  const half = (c, top) => `<path d="M${c[0] - 23.6} ${c[1]}A23.6 23.6 0 0 ${top ? 1 : 0} ${c[0] + 23.6} ${c[1]}" stroke="#000" stroke-width="15" fill="none"/>`;
  return `<defs>
      <mask id="${id}a" maskUnits="userSpaceOnUse" x="0" y="0" width="120" height="114"><rect width="120" height="114" fill="#fff"/>${half(R, true)}</mask>
      <mask id="${id}b" maskUnits="userSpaceOnUse" x="0" y="0" width="120" height="114"><rect width="120" height="114" fill="#fff"/>${half(L, false)}</mask>
    </defs>
    <g fill="none" stroke="${color}">
      <g mask="url(#${id}a)">${ring(L)}</g>
      <g mask="url(#${id}b)">${ring(R)}</g>
    </g>
    <rect x="47" y="27.4" width="26" height="4.4" fill="${color}"/>
    ${withText ? `<g fill="${color}" font-family="${LOGO_FONT}" font-weight="700" text-anchor="middle">
      <text x="60" y="23" font-size="11.5" letter-spacing=".2">NICHE</text>
      <text x="60" y="106" font-size="9" letter-spacing=".3">PERFUMES</text>
    </g>` : ''}`;
}
// Full stacked logo (NICHE / rings / PERFUMES).
export const logoSVG = (color = 'currentColor', attrs = '') =>
  `<svg viewBox="0 0 120 114" xmlns="http://www.w3.org/2000/svg" ${attrs}>${logoInner(color, true)}</svg>`;
// Rings + bar only (for small sizes).
export const logoMarkSVG = (color = 'currentColor', attrs = '') =>
  `<svg viewBox="14 23 92 71" xmlns="http://www.w3.org/2000/svg" ${attrs}>${logoInner(color, false)}</svg>`;

// Deodorant carton drawn in SVG, modelled on the real box: black = men, white = women.
export function boxSVG(code = '', gender = 'men', { label = true } = {}) {
  const men = gender !== 'women';
  const c = men
    ? { front: '#121212', side: '#050505', top: '#262626', ink: '#ececec', soft: '#9a9a9a', edge: '#000' }
    : { front: '#f8f8f6', side: '#e2e2de', top: '#ffffff', ink: '#1a1a1a', soft: '#8a8a8a', edge: '#d4d4cf' };
  const t = esc(code || '');
  // little "text" bars standing in for the French notes printed on the box
  const notes = [[30, 36], [42, 22], [52, 32], [62, 20], [72, 34], [82, 26]]
    .map(([y, w], i) => `<rect x="${99 - w / 2}" y="${148 + y * 0.62 + (i % 2 ? 0 : 3)}" width="${w}" height="1.5" fill="${c.soft}" opacity=".7"/>`).join('');
  return `<svg class="box-svg" viewBox="0 0 220 320" role="img" aria-label="علبة ${t} ${men ? 'رجالي' : 'نسائي'}" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="112" cy="300" rx="78" ry="7" fill="#000" opacity=".12"/>
  <polygon points="48,40 72,26 174,26 150,40" fill="${c.top}" stroke="${c.edge}" stroke-width=".8"/>
  <polygon points="150,40 174,26 174,278 150,292" fill="${c.side}" stroke="${c.edge}" stroke-width=".8"/>
  <rect x="48" y="40" width="102" height="252" fill="${c.front}" stroke="${c.edge}" stroke-width=".8"/>
  <rect x="55.5" y="49" width="87" height="234" fill="none" stroke="${c.ink}" stroke-width=".9"/>
  <svg x="78" y="58" width="42" height="40" viewBox="0 0 120 114">${logoInner(c.ink, true)}</svg>
  <g fill="${c.ink}" font-family="${LOGO_FONT}" text-anchor="middle" direction="ltr">
    <text x="99" y="${t.length > 4 ? 139 : 141}" font-size="${t.length > 4 ? 11 : 15}" font-weight="700">${t}</text>
    <rect x="80" y="146" width="38" height="1.1"/>
    ${label ? `${notes}
    <text x="99" y="264" font-size="8.6" font-weight="700">DÉODORANT</text>
    <text x="99" y="270.5" font-size="4.6" font-weight="700">VAPORISATEUR SPRAY</text>
    <text x="64" y="277" font-size="4.2" text-anchor="start">150 ml</text>
    <text x="134" y="277" font-size="4.2" text-anchor="end">5.10 FL.OZ.</text>` : ''}
  </g>
</svg>`;
}

export const LOGO = `<span class="logo" translate="no">
  ${logoMarkSVG('currentColor', 'class="logo-mark" aria-hidden="true"')}
  <span class="logo-text"><b>NICHE</b><small>PERFUMES</small></span>
</span>`;

// Icons (decorative; buttons carry aria-labels).
export const ICON = {
  bag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 8h12l-1 13H7L6 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>',
  moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  minus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13"/></svg>',
  wa: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l1.2-4A8 8 0 1 1 8 19Z"/><path d="M9 9.5c.3 2 2.2 4.2 4.5 5l1.3-1.3 2 1-.4 1.5c-3.8.4-8.3-3.8-8-7.6L9.8 7.7l1 2Z"/></svg>',
  phone: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1Z"/></svg>',
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="1"/><path d="M16 8V4H4v12h4"/></svg>',
  insta: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4.5"/><circle cx="12" cy="12" r="3.6"/><circle cx="16.8" cy="7.2" r=".6"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
};

// Theme: follows the OS until the visitor picks one; the choice is remembered.
export function toggleTheme() {
  const root = document.documentElement;
  const dark = root.dataset.theme
    ? root.dataset.theme === 'dark'
    : matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = dark ? 'light' : 'dark';
  try { localStorage.setItem('np_theme', root.dataset.theme); } catch {}
  syncThemeColor();
}
export function syncThemeColor() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
}

export function store(key, value) {
  try {
    if (value === undefined) return JSON.parse(localStorage.getItem(key));
    localStorage.setItem(key, JSON.stringify(value));
  } catch { return null; }
}

let toastTimer;
export function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

export const fmtDate = (d) => (d ? new Intl.DateTimeFormat('ar-IQ-u-nu-latn', {
  dateStyle: 'medium', timeStyle: 'short',
}).format(d) : '');

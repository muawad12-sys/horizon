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

// Deodorant carton drawn in SVG: black = men, white = women.
export function boxSVG(code = '', gender = 'men', { label = true } = {}) {
  const men = gender !== 'women';
  const c = men
    ? { front: '#151515', side: '#050505', top: '#2b2b2b', ink: '#f3f0ea', soft: '#8d887f', edge: '#000' }
    : { front: '#fbfaf6', side: '#e4e0d7', top: '#ffffff', ink: '#151515', soft: '#8d887f', edge: '#d6d1c6' };
  const t = esc(code || '—');
  return `<svg class="box-svg" viewBox="0 0 220 320" role="img" aria-label="علبة ${t} ${men ? 'رجالي' : 'نسائي'}" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="112" cy="300" rx="78" ry="7" fill="#000" opacity=".12"/>
  <polygon points="48,40 74,24 176,24 150,40" fill="${c.top}" stroke="${c.edge}" stroke-width=".8"/>
  <polygon points="150,40 176,24 176,276 150,292" fill="${c.side}" stroke="${c.edge}" stroke-width=".8"/>
  <rect x="48" y="40" width="102" height="252" fill="${c.front}" stroke="${c.edge}" stroke-width=".8"/>
  <g fill="${c.ink}" font-family="Jost, sans-serif" text-anchor="middle" direction="ltr">
    <text x="99" y="76" font-size="13" letter-spacing="4.5" font-weight="500">NICHE</text>
    <text x="99" y="89" font-size="6" letter-spacing="3.2" fill="${c.soft}">PERFUMES</text>
    <line x1="84" y1="104" x2="114" y2="104" stroke="${c.ink}" stroke-width=".7" opacity=".6"/>
    <text x="99" y="178" font-size="${t.length > 4 ? 26 : 36}" font-weight="300" letter-spacing="1.5">${t}</text>
    <text x="99" y="200" font-size="6.5" letter-spacing="3" fill="${c.soft}">DEODORANT</text>
    ${label ? `<text x="99" y="272" font-size="6" letter-spacing="2.6">${men ? 'POUR HOMME' : 'POUR FEMME'}</text>` : ''}
  </g>
  <polygon points="150,40 176,24 176,276 150,292" fill="url(#np-shine)" opacity=".35"/>
  <defs><linearGradient id="np-shine" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".25"/></linearGradient></defs>
</svg>`;
}

export const LOGO = `<span class="logo" translate="no">
  <svg class="logo-mark" viewBox="0 0 28 28" aria-hidden="true"><rect x="3" y="3" width="10" height="22" fill="currentColor"/><rect x="15.5" y="3.5" width="9" height="21" fill="none" stroke="currentColor"/></svg>
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

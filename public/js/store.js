import {
  db, collection, doc, getDocs, getDoc, query, where, runTransaction, serverTimestamp,
} from './firebase.js';
import {
  GOVS, GENDER, MAX_LINES, MAX_QTY, ICON, LOGO, logoSVG, boxSVG, esc, money, num, normalizePhone,
  prettyPhone, toLatinDigits, waLink, store, toast, toggleTheme, syncThemeColor,
} from './shared.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const main = $('#main');

const state = { products: [], byId: new Map(), settings: { shipping: {} }, banners: [], loaded: false, failed: false };
let cart = Array.isArray(store('np_cart')) ? store('np_cart') : [];
let sliderTimer = null;
let focusSearchOnRender = false;

const ms = (t) => (t?.toMillis ? t.toMillis() : 0);
const hasPrice = (p) => Number.isInteger(p?.price) && p.price > 0;
const inStock = (p) => (p?.stock | 0) > 0;
const onSale = (p) => hasPrice(p) && Number.isInteger(p.compareAt) && p.compareAt > p.price;
const salePct = (p) => Math.round((1 - p.price / p.compareAt) * 100);
const norm = (s) => toLatinDigits(s).toLowerCase()
  .replace(/[ً-ْ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
const safeLink = (u) => (/^(https?:\/\/|#|\/)/.test(u || '') ? u : '#collection');

/* ───────────────────────── Chrome ───────────────────────── */
$('#logo').innerHTML = LOGO;
$('#footLogo').innerHTML = logoSVG('currentColor', 'class="foot-logo" role="img" aria-label="NICHE PERFUMES"');
$('#year').textContent = new Date().getFullYear();
$('#searchBtn').innerHTML = ICON.search;
$('#themeBtn').innerHTML = ICON.moon;
$('#cartBtn').insertAdjacentHTML('afterbegin', ICON.bag);
$('#cartClose').innerHTML = ICON.close;
syncThemeColor();
$('#themeBtn').addEventListener('click', toggleTheme);
$('#searchBtn').addEventListener('click', () => {
  if (current.name === 'home') return focusSearch();
  focusSearchOnRender = true;
  location.hash = '#/';
});

function focusSearch() {
  const q = $('#q');
  if (!q) return;
  $('#collection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  q.focus({ preventScroll: true });
}

function applySettings() {
  const s = state.settings;
  if (s.topbar) $('#topbar').textContent = s.topbar;
  const links = [];
  if (s.whatsapp) links.push(`<a href="${waLink(s.whatsapp)}" target="_blank" rel="noopener"><span class="ico">${ICON.wa}</span>واتساب</a>`);
  if (s.instagram) {
    const ig = /^https?:/.test(s.instagram) ? s.instagram : `https://instagram.com/${s.instagram.replace(/^@/, '')}`;
    links.push(`<a href="${esc(ig)}" target="_blank" rel="noopener"><span class="ico">${ICON.insta}</span>انستغرام</a>`);
  }
  $('#footLinks').innerHTML = links.join('');
}

/* ───────────────────────── Data ───────────────────────── */
async function loadData() {
  try {
    const [ps, st, bs] = await Promise.all([
      getDocs(query(collection(db, 'products'), where('visible', '==', true))),
      getDoc(doc(db, 'settings', 'store')),
      getDocs(query(collection(db, 'banners'), where('active', '==', true))),
    ]);
    state.products = ps.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
    state.byId = new Map(state.products.map((p) => [p.id, p]));
    state.settings = { shipping: {}, ...(st.data() || {}) };
    state.banners = bs.docs.map((d) => ({ id: d.id, ...d.data() })).filter((b) => b.image?.url)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    state.loaded = true;
    state.failed = false;
    cleanCart();
    applySettings();
  } catch (e) {
    console.error(e);
    state.failed = true;
  }
}

/* ───────────────────────── Cart ───────────────────────── */
function saveCart() {
  store('np_cart', cart);
  const n = cart.reduce((s, l) => s + l.qty, 0);
  const badge = $('#cartCount');
  badge.textContent = n;
  badge.hidden = !n;
  $('#cartBtn').setAttribute('aria-label', n ? `السلة، ${n} قطعة` : 'السلة');
  if (!$('#cart').hidden) renderCart();
}

// Drop products that disappeared / lost their price, clamp to stock.
function cleanCart() {
  cart = cart.filter((l) => {
    const p = state.byId.get(l.id);
    if (!p || !hasPrice(p) || !inStock(p)) return false;
    l.qty = Math.max(1, Math.min(l.qty | 0, p.stock, MAX_QTY));
    return true;
  });
  saveCart();
}

const cartLines = () => cart.map((l) => ({ ...l, p: state.byId.get(l.id) })).filter((l) => l.p);
const cartSubtotal = () => cartLines().reduce((s, l) => s + l.p.price * l.qty, 0);

function addToCart(id, qty = 1, open = false) {
  const p = state.byId.get(id);
  if (!p || !hasPrice(p) || !inStock(p)) return;
  const line = cart.find((l) => l.id === id);
  if (!line && cart.length >= MAX_LINES) return toast(`الحد الأقصى ${MAX_LINES} عطور مختلفة بالطلب الواحد`);
  const max = Math.min(MAX_QTY, p.stock);
  if (line && line.qty >= max) return toast('وصلت للحد الأقصى المتوفر من هذا المنتج');
  if (line) line.qty = Math.min(max, line.qty + qty);
  else cart.push({ id, qty: Math.min(max, qty) });
  saveCart();
  if (open) openCart();
  else toast(`أُضيف ${p.code} إلى السلة`);
}

function setQty(id, qty) {
  const p = state.byId.get(id);
  const line = cart.find((l) => l.id === id);
  if (!line || !p) return;
  if (qty < 1) cart = cart.filter((l) => l.id !== id);
  else line.qty = Math.min(qty, p.stock, MAX_QTY);
  saveCart();
  if (current.name === 'checkout') render();
}

function thumb(p) {
  const img = p.images?.[0]?.url;
  return img ? `<img src="${esc(img)}" alt="" width="64" height="80" loading="lazy">` : boxSVG(p.code, p.gender, { label: false });
}

function stepper(l, sm = true) {
  const max = Math.min(l.p.stock, MAX_QTY);
  return `<div class="qty ${sm ? 'sm' : ''}">
    <button type="button" data-qty="${l.id}" data-to="${l.qty + 1}" aria-label="زيادة الكمية" ${l.qty >= max ? 'disabled' : ''}>${ICON.plus}</button>
    <output aria-live="polite">${l.qty}</output>
    <button type="button" data-qty="${l.id}" data-to="${l.qty - 1}" aria-label="تقليل الكمية" ${l.qty <= 1 ? 'disabled' : ''}>${ICON.minus}</button>
  </div>`;
}

function renderCart() {
  const lines = cartLines();
  if (!lines.length) {
    $('#cartBody').innerHTML = `<div class="empty"><p>سلتك فارغة.</p><a class="link" href="#collection" data-close>تصفّح المجموعة</a></div>`;
    $('#cartFoot').innerHTML = '';
    return;
  }
  $('#cartBody').innerHTML = `<ul class="lines">${lines.map((l) => `
    <li class="line">
      <a class="line-thumb ${l.p.gender}" href="#/p/${l.id}" data-close>${thumb(l.p)}</a>
      <div class="line-info">
        <div class="line-top"><a href="#/p/${l.id}" data-close class="code line-code">${esc(l.p.code)}</a><span class="line-price">${money(l.p.price * l.qty)}</span></div>
        <p class="eyebrow">${GENDER[l.p.gender] || ''}${l.p.alt ? ` · بديل عن ${esc(l.p.alt)}` : ''}</p>
        <div class="line-actions">${stepper(l)}
          <button type="button" class="icon-btn ico sm" data-remove="${l.id}" aria-label="حذف ${esc(l.p.code)} من السلة">${ICON.trash}</button>
        </div>
      </div>
    </li>`).join('')}</ul>`;
  $('#cartFoot').innerHTML = `
    <div class="sum-row"><span>المجموع</span><strong>${money(cartSubtotal())}</strong></div>
    <p class="hint">أجور التوصيل تُحسب حسب المحافظة. الدفع عند الاستلام.</p>
    <a class="btn btn-bronze btn-block" href="#/checkout" data-close>إتمام الطلب</a>`;
}

let lastFocus = null;
function openCart() {
  renderCart();
  lastFocus = document.activeElement;
  const d = $('#cart');
  $('#overlay').hidden = false;
  d.hidden = false;
  document.body.classList.add('locked');
  requestAnimationFrame(() => { d.classList.add('open'); $('#overlay').classList.add('open'); });
  $('#cartClose').focus();
}
function closeCart() {
  const d = $('#cart');
  if (d.hidden) return;
  d.classList.remove('open');
  $('#overlay').classList.remove('open');
  document.body.classList.remove('locked');
  setTimeout(() => { d.hidden = true; $('#overlay').hidden = true; }, 250);
  lastFocus?.focus?.({ preventScroll: true });
}
$('#cartBtn').addEventListener('click', openCart);
$('#cartClose').addEventListener('click', closeCart);
$('#overlay').addEventListener('click', closeCart);
document.addEventListener('keydown', (e) => {
  if ($('#cart').hidden) return;
  if (e.key === 'Escape') closeCart();
  if (e.key === 'Tab') { // keep focus inside the drawer
    const f = $$('a[href], button:not([disabled]), input, select', $('#cart'));
    if (!f.length) return;
    const [first, last] = [f[0], f[f.length - 1]];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});

// One delegated click handler for the whole page.
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-add],[data-qty],[data-remove],[data-close],[data-thumb],[data-g],[data-dot],#heroPause');
  if (!t) return;
  if (t.dataset.add) {
    e.preventDefault();
    const qty = +($('#pdQty')?.value || 1);
    addToCart(t.dataset.add, t.dataset.pd ? qty : 1, !!t.dataset.pd);
  } else if (t.dataset.qty) setQty(t.dataset.qty, +t.dataset.to);
  else if (t.dataset.remove) {
    const p = state.byId.get(t.dataset.remove);
    setQty(t.dataset.remove, 0);
    toast(`حُذف ${p?.code || ''} من السلة`);
    $('#cartClose')?.focus();
  } else if (t.dataset.close !== undefined) closeCart();
  else if (t.dataset.thumb !== undefined) showImage(+t.dataset.thumb);
  else if (t.dataset.g !== undefined) setParam('g', t.dataset.g);
  else if (t.dataset.dot !== undefined) slider?.go(+t.dataset.dot, true);
  else if (t.id === 'heroPause') slider?.toggle();
});

/* ───────────────────────── Router ───────────────────────── */
function route() {
  const h = location.hash;
  if (!h.startsWith('#/')) return { name: 'home', params: new URLSearchParams() };
  const [path, qs] = h.slice(1).split('?');
  const params = new URLSearchParams(qs || '');
  let m;
  if (path === '/' || path === '') return { name: 'home', params };
  if ((m = path.match(/^\/p\/([\w-]+)$/))) return { name: 'product', id: m[1] };
  if (path === '/checkout') return { name: 'checkout' };
  if ((m = path.match(/^\/order\/(NP-\d+)$/))) return { name: 'order', id: m[1] };
  return { name: '404' };
}

let lastRoute = '';
let current = { name: 'home' };
function render(navigated = false) {
  clearInterval(sliderTimer);
  slider = null;
  const r = route();
  current = r;
  const key = r.name + (r.id || '');
  const changed = key !== lastRoute;
  lastRoute = key;

  if (state.failed) {
    main.innerHTML = `<section class="wrap state"><h1>تعذّر تحميل المتجر</h1><p class="muted">تحقق من اتصالك بالإنترنت وحاول مرة ثانية.</p><button class="btn" type="button" onclick="location.reload()">إعادة المحاولة</button></section>`;
    return;
  }
  if (r.name === 'home') viewHome(r.params);
  else if (r.name === 'product') viewProduct(r.id);
  else if (r.name === 'checkout') viewCheckout();
  else if (r.name === 'order') viewOrder(r.id);
  else viewNotFound();

  if (changed || navigated) {
    const filteredView = r.name === 'home' && (r.params.get('g') || r.params.get('q'));
    if (filteredView || location.hash === '#collection') $('#collection')?.scrollIntoView();
    else if (changed) window.scrollTo(0, 0);
  }
  if (focusSearchOnRender) { focusSearchOnRender = false; focusSearch(); }
}
window.addEventListener('hashchange', () => {
  // Plain in-page anchors (#main, #collection) are not routes.
  if (!location.hash.startsWith('#/') && location.hash) {
    if (location.hash !== '#collection') return;
    if (current.name === 'home' && $('#collection')) return $('#collection').scrollIntoView({ behavior: 'smooth' });
  }
  render(true);
});

/* ───────────────────────── Home ───────────────────────── */
function heroHTML() {
  const b = state.banners;
  if (!b.length) {
    const men = state.products.find((p) => p.gender === 'men')?.code || 'E02';
    const women = state.products.find((p) => p.gender === 'women')?.code || 'T15';
    return `<div class="hero-default">
      <div class="wrap hero-grid">
        <div class="hero-copy">
          <p class="eyebrow">NICHE PERFUMES · ديودرنت</p>
          <h1>عطرك النيش المفضّل، بصيغة ديودرنت</h1>
          <p>روائح مستوحاة من أشهر العطور العالمية، بثبات يرافقك طول اليوم.</p>
          <a class="btn btn-bronze" href="#collection">تسوق الآن</a>
        </div>
        <div class="hero-art" aria-hidden="true">
          <div class="hero-box b1">${boxSVG(men, 'men')}</div>
          <div class="hero-box b2">${boxSVG(women, 'women')}</div>
        </div>
      </div>
    </div>`;
  }
  const n = b.length;
  return `<div class="slides-frame"><div class="slides" id="slides" aria-live="off">${b.map((s, i) => `
      <div class="slide" role="group" aria-roledescription="شريحة" aria-label="${i + 1} من ${n}" ${i ? 'aria-hidden="true"' : ''}>
        <img src="${esc(s.image.url)}" alt="" width="1920" height="1080" ${i ? 'loading="lazy"' : 'fetchpriority="high"'}>
        <div class="slide-copy wrap">
          ${s.title ? (i ? `<h2>${esc(s.title)}</h2>` : `<h1>${esc(s.title)}</h1>`) : ''}
          ${s.subtitle ? `<p>${esc(s.subtitle)}</p>` : ''}
          <a class="btn btn-bronze" href="${esc(safeLink(s.link))}" ${i ? 'tabindex="-1"' : ''}>${esc(s.cta || 'تسوق الآن')}</a>
        </div>
      </div>`).join('')}</div>
    ${n > 1 ? `<div class="hero-ctrl wrap">
      <div class="dots">${b.map((_, i) => `<button type="button" data-dot="${i}" aria-label="الشريحة ${i + 1}" ${i ? '' : 'aria-current="true"'}></button>`).join('')}</div>
      <button type="button" id="heroPause" class="hero-pause" aria-label="إيقاف التمرير التلقائي">❚❚</button>
    </div>` : ''}</div>`;
}

let slider = null;
function startSlider() {
  const track = $('#slides');
  if (!track || track.children.length < 2) return;
  const n = track.children.length;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let i = 0;
  let paused = reduce;
  const go = (k, user) => {
    i = (k + n) % n;
    track.style.transform = `translateX(${i * 100}%)`; // RTL: next slide sits to the left
    [...track.children].forEach((s, j) => {
      s.setAttribute('aria-hidden', j !== i);
      s.querySelector('a').tabIndex = j === i ? 0 : -1;
    });
    $$('.dots button').forEach((d, j) => (j === i ? d.setAttribute('aria-current', 'true') : d.removeAttribute('aria-current')));
    if (user) restart();
  };
  const restart = () => {
    clearInterval(sliderTimer);
    if (!paused) sliderTimer = setInterval(() => !document.hidden && go(i + 1), 6000);
  };
  const toggle = () => {
    paused = !paused;
    const b = $('#heroPause');
    b.textContent = paused ? '▶' : '❚❚';
    b.setAttribute('aria-label', paused ? 'تشغيل التمرير التلقائي' : 'إيقاف التمرير التلقائي');
    restart();
  };
  let x0 = null;
  track.addEventListener('pointerdown', (e) => { x0 = e.clientX; });
  track.addEventListener('pointerup', (e) => {
    if (x0 === null) return;
    const dx = e.clientX - x0;
    x0 = null;
    if (Math.abs(dx) > 40) go(i + (dx > 0 ? 1 : -1), true);
  });
  if (reduce) { $('#heroPause').textContent = '▶'; $('#heroPause').setAttribute('aria-label', 'تشغيل التمرير التلقائي'); }
  slider = { go, toggle };
  restart();
}

function card(p) {
  const img = p.images?.[0]?.url;
  const badges = [
    !inStock(p) && hasPrice(p) ? '<span class="badge">نفد</span>' : '',
    onSale(p) && inStock(p) ? `<span class="badge badge-sale">خصم <span class="num">${salePct(p)}%</span></span>` : '',
  ].join('');
  const canAdd = hasPrice(p) && inStock(p);
  return `<article class="card">
    <a href="#/p/${p.id}" class="card-media ${p.gender}" tabindex="-1" aria-hidden="true">
      ${img ? `<img src="${esc(img)}" alt="" width="800" height="1000" loading="lazy">` : boxSVG(p.code, p.gender)}
      ${badges ? `<div class="badges">${badges}</div>` : ''}
    </a>
    ${canAdd ? `<button type="button" class="quick-add" data-add="${p.id}" aria-label="أضف ${esc(p.code)} إلى السلة"><span class="ico">${ICON.plus}</span></button>` : ''}
    <a href="#/p/${p.id}" class="card-info">
      <div class="card-top"><h3 class="code">${esc(p.code)}</h3><span class="eyebrow">${GENDER[p.gender] || ''}</span></div>
      ${p.alt ? `<p class="card-alt">بديل عن ${esc(p.alt)}</p>` : ''}
      <p class="card-price">${hasPrice(p)
        ? `${money(p.price)}${onSale(p) ? ` <s class="was">${money(p.compareAt)}</s>` : ''}`
        : '<span class="soon">السعر قريباً</span>'}</p>
    </a>
  </article>`;
}

function filtered(params) {
  const g = params.get('g') || '';
  const q = norm(params.get('q') || '').trim();
  const s = params.get('s') || 'new';
  let list = state.products.filter((p) => !g || p.gender === g);
  if (q) {
    list = list.filter((p) => norm([p.code, p.alt, p.family, p.description,
      ...(p.notes?.top || []), ...(p.notes?.heart || []), ...(p.notes?.base || [])].join(' ')).includes(q));
  }
  if (s !== 'new') {
    const dir = s === 'price-asc' ? 1 : -1;
    list = [...list].sort((a, b) => (hasPrice(b) - hasPrice(a)) || dir * ((a.price || 0) - (b.price || 0)));
  }
  return list;
}

function homeParams() { return route().params || new URLSearchParams(); } // read live: replaceState doesn't re-render
function setParam(k, v) {
  const p = homeParams();
  if (v) p.set(k, v); else p.delete(k);
  const qs = p.toString();
  history.replaceState(null, '', qs ? `#/?${qs}` : '#/');
  renderGrid();
}

function renderGrid() {
  const params = homeParams();
  const g = params.get('g') || '';
  $$('[data-g]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.g === g));
  const grid = $('#grid');
  if (!state.loaded) {
    grid.innerHTML = Array.from({ length: 4 }, () => '<div class="card"><div class="card-media skel"></div></div>').join('');
    return;
  }
  const list = filtered(params);
  $('#count').textContent = `${list.length} منتج`;
  grid.innerHTML = list.length ? list.map(card).join('')
    : `<div class="empty grid-empty"><p>ما لقينا نتائج${params.get('q') ? ` لـ “${esc(params.get('q'))}”` : ''}.</p><a class="link" href="#/">عرض كل المنتجات</a></div>`;
}

function viewHome(params) {
  document.title = 'NICHE PERFUMES — ديودرنت بروح العطور النيش';
  const g = params.get('g') || '';
  const tile = (gender, title, sub) => {
    const code = state.products.find((p) => p.gender === gender)?.code || '';
    return `<a class="split-tile ${gender}" href="#/?g=${gender}">
      <div class="split-art" aria-hidden="true">${boxSVG(code, gender)}</div>
      <div class="split-copy"><p class="eyebrow" translate="no">${sub}</p><h2>${title}</h2><span class="split-cta">تسوّق ${title}</span></div>
    </a>`;
  };
  main.innerHTML = `
    <section class="hero" aria-label="العروض">${heroHTML()}</section>
    <section class="split wrap" aria-label="الأقسام">
      ${tile('men', 'رجالي', 'POUR HOMME')}
      ${tile('women', 'نسائي', 'POUR FEMME')}
    </section>
    <section class="collection wrap" id="collection" aria-labelledby="collTitle">
      <div class="coll-head">
        <h2 id="collTitle">المجموعة</h2>
        <p class="muted" id="count" aria-live="polite"></p>
      </div>
      <div class="toolbar">
        <div class="seg" role="group" aria-label="القسم">
          <button type="button" data-g="" aria-pressed="${!g}">الكل</button>
          <button type="button" data-g="men" aria-pressed="${g === 'men'}">رجالي</button>
          <button type="button" data-g="women" aria-pressed="${g === 'women'}">نسائي</button>
        </div>
        <div class="toolbar-row">
          <label class="search-field"><span class="sr-only">ابحث في المجموعة</span>
            <span class="ico">${ICON.search}</span>
            <input type="search" id="q" class="input" name="q" placeholder="ابحث بالكود أو اسم العطر…" autocomplete="off" spellcheck="false" value="${esc(params.get('q') || '')}">
          </label>
          <label class="sort"><span class="sr-only">ترتيب</span>
            <select id="sort" class="select" name="sort">
              <option value="new">الأحدث</option>
              <option value="price-asc">السعر: من الأقل</option>
              <option value="price-desc">السعر: من الأعلى</option>
            </select>
          </label>
        </div>
      </div>
      <div class="grid" id="grid"></div>
    </section>`;
  $('#sort').value = params.get('s') || 'new';
  $('#sort').addEventListener('change', (e) => setParam('s', e.target.value === 'new' ? '' : e.target.value));
  let t;
  $('#q').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => setParam('q', e.target.value.trim()), 150); });
  renderGrid();
  startSlider();
}

/* ───────────────────────── Product ───────────────────────── */
function showImage(i) {
  const p = state.byId.get(current.id);
  const img = p?.images?.[i];
  if (!img) return;
  $('#pdMain').innerHTML = `<img src="${esc(img.url)}" alt="${esc(p.code)} — صورة ${i + 1}" width="1200" height="1500">`;
  $$('[data-thumb]').forEach((b, j) => b.setAttribute('aria-current', j === i));
}

function viewProduct(id) {
  if (!state.loaded) { main.innerHTML = '<div class="wrap pd"><div class="pd-main skel"></div></div>'; return; }
  const p = state.byId.get(id);
  if (!p) return viewNotFound();
  document.title = `${p.code}${p.alt ? ` — بديل عن ${p.alt}` : ''} | NICHE PERFUMES`;
  const imgs = p.images || [];
  const notes = [['مقدمة', 'top'], ['قلب', 'heart'], ['قاعدة', 'base']]
    .filter(([, k]) => p.notes?.[k]?.length)
    .map(([label, k]) => `<div class="pyr-row"><span class="pyr-label">${label}</span><div class="chips">${p.notes[k].map((n) => `<span class="chip">${esc(n)}</span>`).join('')}</div></div>`)
    .join('');
  const stockMsg = !hasPrice(p) ? '' : !inStock(p) ? '<p class="stock out">نفد من المخزن</p>'
    : p.stock <= 3 ? `<p class="stock low">باقي <span class="num">${p.stock}</span> فقط</p>` : '<p class="stock">متوفر</p>';
  const max = Math.min(p.stock | 0, MAX_QTY);
  const similar = [...state.products.filter((x) => x.id !== p.id && x.gender === p.gender),
    ...state.products.filter((x) => x.id !== p.id && x.gender !== p.gender)].slice(0, 4);

  main.innerHTML = `
    <div class="wrap">
      <nav class="crumbs" aria-label="مسار التصفح"><a href="#/">الرئيسية</a><span aria-hidden="true">/</span><a href="#/?g=${p.gender}">${GENDER[p.gender] || ''}</a><span aria-hidden="true">/</span><span class="code" aria-current="page">${esc(p.code)}</span></nav>
      <article class="pd">
        <div class="pd-gallery">
          <div class="pd-main ${p.gender}" id="pdMain">
            ${imgs.length ? `<img src="${esc(imgs[0].url)}" alt="${esc(p.code)}" width="1200" height="1500" fetchpriority="high">` : boxSVG(p.code, p.gender)}
            ${onSale(p) && inStock(p) ? `<div class="badges"><span class="badge badge-sale">خصم <span class="num">${salePct(p)}%</span></span></div>` : ''}
          </div>
          ${imgs.length > 1 ? `<div class="pd-thumbs">${imgs.map((im, i) => `<button type="button" data-thumb="${i}" aria-label="عرض الصورة ${i + 1}" aria-current="${i === 0}"><img src="${esc(im.url)}" alt="" width="120" height="150" loading="lazy"></button>`).join('')}</div>` : ''}
        </div>
        <div class="pd-info">
          <p class="eyebrow">${GENDER[p.gender] || ''}${p.family ? ` · ${esc(p.family)}` : ''}</p>
          <h1 class="pd-code code">${esc(p.code)}</h1>
          ${p.alt ? `<p class="pd-alt">بديل عن <strong>${esc(p.alt)}</strong></p>` : ''}
          <div class="pd-price">${hasPrice(p)
            ? `<span class="price">${money(p.price)}</span>${onSale(p) ? `<s class="was">${money(p.compareAt)}</s>` : ''}`
            : '<span class="soon">السعر قريباً</span>'}</div>
          ${stockMsg}
          ${hasPrice(p) && inStock(p) ? `
          <div class="pd-buy">
            <div class="qty" id="pdQtyBox">
              <button type="button" id="pdInc" aria-label="زيادة الكمية">${ICON.plus}</button>
              <output id="pdQty" value="1" aria-live="polite">1</output>
              <button type="button" id="pdDec" aria-label="تقليل الكمية" disabled>${ICON.minus}</button>
            </div>
            <button type="button" class="btn btn-bronze pd-add" data-add="${p.id}" data-pd="1">أضف إلى السلة</button>
          </div>` : `<button type="button" class="btn btn-block" disabled>${hasPrice(p) ? 'نفد من المخزن' : 'السعر قريباً'}</button>`}
          <ul class="pd-perks">
            <li>توصيل لكل المحافظات</li><li>الدفع عند الاستلام</li>
          </ul>
          ${p.description ? `<div class="pd-desc"><h2>الوصف</h2><p>${esc(p.description).replace(/\n/g, '<br>')}</p></div>` : ''}
          ${notes ? `<div class="pyr"><h2>هرم النفحات</h2>${notes}</div>` : ''}
        </div>
      </article>
      ${similar.length ? `<section class="similar" aria-labelledby="simTitle"><h2 id="simTitle">قد يعجبك أيضاً</h2><div class="grid">${similar.map(card).join('')}</div></section>` : ''}
    </div>`;

  const out = $('#pdQty');
  if (out) {
    const set = (v) => {
      const q = Math.max(1, Math.min(max, v));
      out.value = q; out.textContent = q;
      $('#pdDec').disabled = q <= 1;
      $('#pdInc').disabled = q >= max;
    };
    set(1);
    $('#pdInc').addEventListener('click', () => set(+out.value + 1));
    $('#pdDec').addEventListener('click', () => set(+out.value - 1));
  }
}

/* ───────────────────────── Checkout ───────────────────────── */
const FIELDS = {
  name: (v) => (v.trim().length >= 3 ? '' : 'اكتب اسمك الكامل'),
  phone: (v) => (normalizePhone(v) ? '' : 'اكتب رقم عراقي صحيح يبدأ بـ 07 (11 رقم)'),
  phone2: (v) => (!v.trim() || normalizePhone(v) ? '' : 'الرقم البديل غير صحيح، أو اتركه فارغ'),
  gov: (v) => (!v ? 'اختر المحافظة' : Number.isInteger(state.settings.shipping?.[v]) ? '' : 'التوصيل لهذه المحافظة غير متاح حالياً، تواصل معنا'),
  area: (v) => (v.trim().length >= 2 ? '' : 'اكتب المنطقة أو الحي'),
  landmark: (v) => (v.trim().length >= 2 ? '' : 'اكتب أقرب نقطة دالة حتى يوصلك المندوب بسهولة'),
};

function viewCheckout(notice = '') {
  document.title = 'إتمام الطلب | NICHE PERFUMES';
  if (!state.loaded) { main.innerHTML = '<div class="wrap state"><p class="muted">جارٍ التحميل…</p></div>'; return; }
  const lines = cartLines();
  if (!lines.length) {
    main.innerHTML = `<section class="wrap state">${notice ? `<p class="form-alert" role="alert">${esc(notice)}</p>` : ''}<h1>سلتك فارغة</h1><p class="muted">أضف عطرك المفضل وارجع هنا لإتمام الطلب.</p><a class="btn" href="#collection">تصفّح المجموعة</a></section>`;
    return;
  }
  const c = store('np_customer') || {};
  const f = (name, label, attrs = '', opt = false) => `
    <div class="field">
      <label for="f-${name}">${label}${opt ? ' <span class="opt">(اختياري)</span>' : ''}</label>
      <input class="input" id="f-${name}" name="${name}" value="${esc(c[name] || '')}" aria-describedby="e-${name}" ${attrs}>
      <p class="err" id="e-${name}"></p>
    </div>`;
  main.innerHTML = `
    <div class="wrap checkout">
      <h1>إتمام الطلب</h1>
      <form id="orderForm" class="co-grid" novalidate>
        <div class="co-form">
          <div class="form-alert" id="formAlert" role="alert">${esc(notice)}</div>
          <fieldset><legend>معلومات التواصل</legend>
            ${f('name', 'الاسم الكامل', 'autocomplete="name" placeholder="مثال: علي حسن…" required')}
            ${f('phone', 'رقم الهاتف', 'type="tel" inputmode="tel" dir="ltr" autocomplete="tel" placeholder="07XX XXX XXXX" required')}
            ${f('phone2', 'رقم بديل', 'type="tel" inputmode="tel" dir="ltr" autocomplete="off" placeholder="07XX XXX XXXX"', true)}
          </fieldset>
          <fieldset><legend>عنوان التوصيل</legend>
            <div class="field">
              <label for="f-gov">المحافظة</label>
              <select class="select" id="f-gov" name="gov" autocomplete="address-level1" aria-describedby="e-gov" required>
                <option value="">اختر المحافظة</option>
                ${GOVS.map(([k, n]) => `<option value="${k}" ${c.gov === k ? 'selected' : ''}>${n}</option>`).join('')}
              </select>
              <p class="err" id="e-gov"></p>
            </div>
            ${f('area', 'المنطقة / الحي', 'autocomplete="address-level2" placeholder="مثال: الكرادة، شارع 62…" required')}
            ${f('landmark', 'أقرب نقطة دالة', 'autocomplete="address-line2" placeholder="مثال: قرب جامع…" required')}
            <div class="field">
              <label for="f-notes">ملاحظات <span class="opt">(اختياري)</span></label>
              <textarea class="textarea" id="f-notes" name="notes" maxlength="500" autocomplete="off" placeholder="أي تفاصيل تساعد المندوب…">${esc(c.notes || '')}</textarea>
            </div>
          </fieldset>
        </div>
        <aside class="co-sum" aria-labelledby="sumTitle">
          <h2 id="sumTitle">ملخص الطلب</h2>
          <ul class="sum-lines">${lines.map((l) => `
            <li><span class="sum-thumb ${l.p.gender}">${thumb(l.p)}<span class="sum-q num">${l.qty}</span></span>
              <span class="sum-name"><span class="code">${esc(l.p.code)}</span><span class="eyebrow">${GENDER[l.p.gender] || ''}</span></span>
              <span>${money(l.p.price * l.qty)}</span></li>`).join('')}</ul>
          <div class="sum-row"><span>المجموع</span><span>${money(cartSubtotal())}</span></div>
          <div class="sum-row"><span>التوصيل</span><span id="delFee" class="muted">اختر المحافظة</span></div>
          <div class="sum-row total"><span>الإجمالي</span><strong id="grand">${money(cartSubtotal())}</strong></div>
          <p class="pay-note">الدفع نقداً عند الاستلام</p>
          <button type="submit" class="btn btn-bronze btn-block" id="placeBtn">تأكيد الطلب</button>
          <a href="#/" class="link back-link">متابعة التسوق</a>
        </aside>
      </form>
    </div>`;

  const form = $('#orderForm');
  const els = form.elements;
  const updateTotals = () => {
    const fee = state.settings.shipping?.[els.gov.value];
    const ok = Number.isInteger(fee);
    $('#delFee').innerHTML = !els.gov.value ? 'اختر المحافظة' : ok ? (fee ? money(fee) : 'مجاني') : 'غير متاح';
    $('#delFee').classList.toggle('muted', !ok);
    $('#grand').innerHTML = money(cartSubtotal() + (ok ? fee : 0));
  };
  els.gov.addEventListener('change', () => { updateTotals(); validateField(els.gov); });
  updateTotals();
  $$('input, select', form).forEach((el) => {
    el.addEventListener('blur', () => el.value && validateField(el));
    el.addEventListener('input', () => el.getAttribute('aria-invalid') === 'true' && validateField(el));
  });
  $$('[type=tel]', form).forEach((el) => el.addEventListener('blur', () => {
    const n = normalizePhone(el.value);
    if (n) el.value = prettyPhone(n);
  }));
  form.addEventListener('submit', (e) => { e.preventDefault(); placeOrder(form); });
  if (notice) $('#formAlert').scrollIntoView({ block: 'center' });
}

function validateField(el) {
  const rule = FIELDS[el.name];
  if (!rule) return '';
  const msg = rule(el.value);
  el.setAttribute('aria-invalid', !!msg);
  $(`#e-${el.name}`).textContent = msg;
  return msg;
}

class OrderError extends Error {}

async function placeOrder(form) {
  const els = form.elements; // not form[k]: form.name is the form's own name
  const bad = Object.keys(FIELDS).filter((k) => validateField(els[k]));
  if (bad.length) { els[bad[0]].focus(); return; }
  const lines = cartLines();
  const v = (k) => els[k].value.trim();
  const customer = {
    name: v('name').replace(/\s+/g, ' ').slice(0, 80),
    phone: normalizePhone(v('phone')),
    phone2: normalizePhone(v('phone2')) || '',
    gov: v('gov'),
    area: v('area').slice(0, 120),
    landmark: v('landmark').slice(0, 160),
    notes: v('notes').slice(0, 500),
  };
  store('np_customer', { ...customer, phone: prettyPhone(customer.phone), phone2: prettyPhone(customer.phone2) });
  const fee = state.settings.shipping[customer.gov];
  const btn = $('#placeBtn');
  btn.disabled = true;
  btn.textContent = 'جارٍ تأكيد الطلب…';
  $('#formAlert').textContent = '';

  try {
    const order = await runTransaction(db, async (tx) => {
      const counterRef = doc(db, 'counters', 'orders');
      const cSnap = await tx.get(counterRef);
      const snaps = await Promise.all(lines.map((l) => tx.get(doc(db, 'products', l.id))));
      if (!cSnap.exists()) throw new OrderError('المتجر قيد التجهيز، حاول لاحقاً.');
      const problems = [];
      const items = snaps.map((s, i) => {
        const d = s.data();
        const { qty, p } = lines[i];
        if (!s.exists() || !d.visible || !hasPrice(d)) problems.push(`${p.code} لم يعد متوفراً`);
        else if ((d.stock | 0) < qty) problems.push(d.stock > 0 ? `${d.code}: المتوفر ${d.stock} فقط` : `${d.code} نفد من المخزن`);
        else if (d.price !== p.price) problems.push(`تغيّر سعر ${d.code}`);
        return { id: s.id, code: d?.code, price: d?.price, qty, stock: d?.stock | 0 };
      });
      if (problems.length) throw new OrderError(problems.join(' · '));

      const subtotal = items.reduce((s, it) => s + it.price * it.qty, 0);
      const seq = cSnap.data().seq + 1;
      const id = `NP-${seq}`;
      tx.update(counterRef, { seq });
      items.forEach((it) => tx.update(doc(db, 'products', it.id), { stock: it.stock - it.qty, lastOrder: id }));
      tx.set(doc(db, 'orders', id), {
        customer,
        items: items.map(({ id: pid, code, price, qty }) => ({ id: pid, code, price, qty })),
        qty: Object.fromEntries(items.map((it) => [it.id, it.qty])),
        subtotal, delivery: fee, total: subtotal + fee,
        status: 'new',
        createdAt: serverTimestamp(),
      });
      return { id, subtotal, delivery: fee, total: subtotal + fee, name: customer.name, items: items.map(({ code, qty }) => ({ code, qty })) };
    });

    try { sessionStorage.setItem('np_last', JSON.stringify(order)); } catch {}
    cart = [];
    saveCart();
    location.hash = `#/order/${order.id}`;
  } catch (e) {
    if (!(e instanceof OrderError)) console.error(e);
    // Refresh prices / stock / fees, then re-render the form with an explanation.
    await loadData();
    const msg = e instanceof OrderError ? `${e.message}. حدّثنا السلة، راجع الملخص وأكّد مرة ثانية.`
      : e.code === 'permission-denied' ? 'تحدّثت الأسعار أو أجور التوصيل. راجع الملخص وأكّد مرة ثانية.'
        : 'تعذّر إرسال الطلب. تحقق من الإنترنت وحاول مرة ثانية.';
    viewCheckout(msg);
  }
}

/* ───────────────────────── Order success ───────────────────────── */
function viewOrder(id) {
  document.title = `تم استلام طلبك ${id} | NICHE PERFUMES`;
  let o = null;
  try { o = JSON.parse(sessionStorage.getItem('np_last')); } catch {}
  if (o?.id !== id) o = null;
  const wa = state.settings.whatsapp;
  const text = `مرحباً NICHE PERFUMES، أكدت طلب رقم ${id}${o ? `\nالاسم: ${o.name}\nالإجمالي: ${num(o.total)} د.ع` : ''}`;
  main.innerHTML = `
    <section class="wrap success">
      <div class="success-mark ico">${ICON.check}</div>
      <p class="eyebrow">تم استلام طلبك</p>
      <h1>شكراً لك${o ? `، ${esc(o.name.split(' ')[0])}` : ''}</h1>
      <p class="order-no">رقم الطلب <strong class="code">${esc(id)}</strong></p>
      <p class="muted">راح نتواصل وياك قريباً لتأكيد الطلب. الدفع عند الاستلام.</p>
      ${o ? `<div class="success-sum">
        ${o.items.map((it) => `<div class="sum-row"><span><span class="code">${esc(it.code)}</span> × <span class="num">${it.qty}</span></span></div>`).join('')}
        <div class="sum-row"><span>التوصيل</span><span>${money(o.delivery)}</span></div>
        <div class="sum-row total"><span>الإجمالي</span><strong>${money(o.total)}</strong></div>
      </div>` : ''}
      <div class="success-actions">
        ${wa ? `<a class="btn btn-bronze" href="${waLink(wa, text)}" target="_blank" rel="noopener"><span class="ico">${ICON.wa}</span>راسلنا على واتساب</a>` : ''}
        <a class="btn btn-ghost" href="#/">العودة للمتجر</a>
      </div>
    </section>`;
}

function viewNotFound() {
  document.title = 'الصفحة غير موجودة | NICHE PERFUMES';
  main.innerHTML = `<section class="wrap state"><h1>الصفحة غير موجودة</h1><p class="muted">يمكن انحذف المنتج أو الرابط غلط.</p><a class="btn" href="#/">العودة للمتجر</a></section>`;
}

/* ───────────────────────── Boot ───────────────────────── */
saveCart();
render();
loadData().then(render);

import {
  app, db, useEmulators, collection, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot,
  query, orderBy, limit, serverTimestamp, runTransaction, writeBatch,
} from './firebase.js';
import {
  getAuth, connectAuthEmulator, onAuthStateChanged, signInWithEmailAndPassword, signOut,
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {
  getStorage, connectStorageEmulator, ref, uploadBytes, getDownloadURL, deleteObject,
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-storage.js';
import {
  GOVS, govName, GENDER, STATUS, ICON, LOGO, logoSVG, boxSVG, esc, money, num, normalizePhone, prettyPhone,
  waLink, toast, toggleTheme, syncThemeColor, fmtDate,
} from './shared.js';

const auth = getAuth(app);
const storage = getStorage(app);
if (useEmulators) {
  connectAuthEmulator(auth, `http://${location.hostname}:9099`, { disableWarnings: true });
  connectStorageEmulator(storage, location.hostname, 9199);
}

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const S = { orders: [], products: [], banners: [], settings: { shipping: {} }, filter: 'all', search: '' };
let unsubs = [];

$$('[data-logo]').forEach((el) => { el.innerHTML = LOGO; });
$$('[data-logo-full]').forEach((el) => { el.innerHTML = logoSVG('currentColor', 'role="img" aria-label="NICHE PERFUMES"'); });
$('#themeBtn').innerHTML = ICON.moon;
$('#themeBtn').addEventListener('click', toggleTheme);
syncThemeColor();
$$('[data-logout]').forEach((b) => b.addEventListener('click', () => signOut(auth)));

/* ───────────────────────── Auth ───────────────────────── */
function show(id) { ['login', 'denied', 'app'].forEach((x) => { $('#' + x).hidden = x !== id; }); }

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target.elements;
  const btn = $('#loginBtn');
  $('#loginErr').textContent = '';
  btn.disabled = true;
  btn.textContent = 'جارٍ الدخول…';
  unlockAudio();
  try {
    await signInWithEmailAndPassword(auth, f.email.value.trim(), f.password.value);
  } catch (err) {
    $('#loginErr').textContent = ['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-email'].includes(err.code)
      ? 'البريد أو كلمة المرور غلط. تأكد منها وحاول مرة ثانية.'
      : err.code === 'auth/too-many-requests' ? 'محاولات كثيرة. انتظر شوية وحاول مرة ثانية.' : 'تعذّر الدخول. تحقق من الإنترنت.';
  } finally {
    btn.disabled = false;
    btn.textContent = 'دخول';
  }
});

onAuthStateChanged(auth, async (user) => {
  unsubs.forEach((u) => u());
  unsubs = [];
  if (!user) { show('login'); return; }
  let isAdmin = false;
  try { isAdmin = (await getDoc(doc(db, 'admins', user.uid))).exists(); } catch (e) { console.error(e); }
  if (!isAdmin) { $('#uid').textContent = user.uid; show('denied'); return; }
  show('app');
  await ensureSetup();
  start();
});

// First login: make sure the counter and settings docs exist so orders can work.
async function ensureSetup() {
  const counter = doc(db, 'counters', 'orders');
  const settings = doc(db, 'settings', 'store');
  const [c, s] = await Promise.all([getDoc(counter), getDoc(settings)]);
  if (!c.exists()) await setDoc(counter, { seq: 1041 }); // first order → NP-1042
  if (!s.exists()) {
    await setDoc(settings, {
      topbar: 'توصيل لكل المحافظات · الدفع عند الاستلام',
      whatsapp: '', instagram: '',
      shipping: Object.fromEntries(GOVS.map(([k]) => [k, k === 'baghdad' ? 5000 : 7000])),
    });
  }
}

function start() {
  unsubs.push(onSnapshot(query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(500)), (snap) => {
    const initial = !S.ordersLoaded;
    S.ordersLoaded = true;
    if (!initial) {
      snap.docChanges().filter((c) => c.type === 'added').forEach((c) => notifyNew(c.doc.id));
    }
    S.orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderStats();
    renderOrders();
  }, (e) => { console.error(e); toast('تعذّر تحميل الطلبات'); }));
  unsubs.push(onSnapshot(collection(db, 'products'), (snap) => {
    S.products = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    renderProducts();
  }));
  unsubs.push(onSnapshot(collection(db, 'banners'), (snap) => {
    S.banners = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    renderBanners();
  }));
  unsubs.push(onSnapshot(doc(db, 'settings', 'store'), (snap) => {
    S.settings = { shipping: {}, ...(snap.data() || {}) };
    renderShipping();
    renderSettings();
  }));
}

/* ───────────────────────── Tabs ───────────────────────── */
$$('[data-tab]').forEach((tab) => tab.addEventListener('click', () => selectTab(tab.dataset.tab)));
function selectTab(name) {
  $$('[data-tab]').forEach((t) => t.setAttribute('aria-selected', t.dataset.tab === name));
  $$('.panel').forEach((p) => { p.hidden = p.id !== 'tab-' + name; });
  history.replaceState(null, '', '#' + name);
}
if (location.hash.length > 1 && $(`[data-tab="${location.hash.slice(1)}"]`)) selectTab(location.hash.slice(1));

/* ───────────────────────── New-order alert ───────────────────────── */
let audio;
function unlockAudio() { try { audio ||= new AudioContext(); audio.resume(); } catch {} }
document.addEventListener('pointerdown', unlockAudio, { once: true });
function beep() {
  if (!audio) return;
  [[880, 0], [1320, 0.18]].forEach(([f, t]) => {
    const o = audio.createOscillator();
    const g = audio.createGain();
    const at = audio.currentTime + t;
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.4);
    o.connect(g).connect(audio.destination);
    o.start(at);
    o.stop(at + 0.45);
  });
}
function notifyNew(id) {
  beep();
  toast(`طلب جديد ${id}`);
  S.flash = id;
}

/* ───────────────────────── Stats ───────────────────────── */
function renderStats() {
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const t = (o) => o.createdAt?.toMillis?.() || 0;
  const fresh = S.orders.filter((o) => o.status === 'new').length;
  $('#sNew').textContent = fresh;
  $('#sToday').textContent = S.orders.filter((o) => t(o) >= dayStart).length;
  $('#sMonth').innerHTML = money(S.orders.filter((o) => t(o) >= monthStart && o.status !== 'cancelled')
    .reduce((s, o) => s + (o.total || 0), 0));
  $('#newBadge').hidden = !fresh;
  $('#newBadge').textContent = fresh;
  document.title = `${fresh ? `(${fresh}) ` : ''}لوحة التحكم — NICHE PERFUMES`;
}

/* ───────────────────────── Orders ───────────────────────── */
const panelOrders = $('#tab-orders');
panelOrders.innerHTML = `
  <div class="p-head">
    <div class="seg" role="group" aria-label="فلتر الحالة" id="statusFilter"></div>
    <label class="a-search"><span class="sr-only">بحث بالطلبات</span>
      <input class="input" type="search" id="orderSearch" placeholder="بحث برقم الطلب أو الاسم أو الهاتف…" autocomplete="off" spellcheck="false">
    </label>
  </div>
  <div class="orders" id="ordersList"><p class="muted">جارٍ التحميل…</p></div>`;
$('#orderSearch').addEventListener('input', (e) => { S.search = e.target.value.trim(); renderOrders(); });
$('#statusFilter').addEventListener('click', (e) => {
  const b = e.target.closest('[data-status]');
  if (b) { S.filter = b.dataset.status; renderOrders(); }
});

function renderOrders() {
  const counts = S.orders.reduce((m, o) => ((m[o.status] = (m[o.status] || 0) + 1), m), {});
  $('#statusFilter').innerHTML = [['all', 'الكل', S.orders.length], ...Object.entries(STATUS).map(([k, v]) => [k, v, counts[k] || 0])]
    .map(([k, label, n]) => `<button type="button" data-status="${k}" aria-pressed="${S.filter === k}">${label} <span class="num">${n}</span></button>`).join('');
  const q = S.search.replace(/\s/g, '').toLowerCase();
  const list = S.orders.filter((o) => (S.filter === 'all' || o.status === S.filter)
    && (!q || [o.id, o.customer?.name, o.customer?.phone, prettyPhone(o.customer?.phone)].join(' ').replace(/\s/g, '').toLowerCase().includes(q)));
  $('#ordersList').innerHTML = list.length ? list.map(orderCard).join('')
    : `<p class="empty-note">${S.orders.length ? 'ما كو طلبات بهذا الفلتر.' : 'ما كو طلبات بعد. أول ما يوصل طلب راح يظهر هنا مع تنبيه صوتي.'}</p>`;
  if (S.flash) { $(`[data-order="${S.flash}"]`)?.classList.add('flash'); S.flash = null; }
}

function addressText(c) {
  return `${govName(c.gov)} - ${c.area} - ${c.landmark}`;
}

function orderCard(o) {
  const c = o.customer || {};
  const greet = `مرحباً ${c.name}، معك NICHE PERFUMES بخصوص طلبك ${o.id}`;
  return `<article class="order s-${o.status}" data-order="${o.id}">
    <header class="o-head">
      <strong class="code o-id">${esc(o.id)}</strong>
      <span class="pill s-${o.status}">${STATUS[o.status] || o.status}</span>
      <time class="muted">${fmtDate(o.createdAt?.toDate?.())}</time>
    </header>
    <div class="o-body">
      <div class="o-cust">
        <p class="o-name">${esc(c.name)}</p>
        <p><a class="num" dir="ltr" href="tel:${esc(c.phone)}">${prettyPhone(c.phone)}</a>${c.phone2 ? ` · بديل <a class="num" dir="ltr" href="tel:${esc(c.phone2)}">${prettyPhone(c.phone2)}</a>` : ''}</p>
        <p>${esc(addressText(c))}</p>
        ${c.notes ? `<p class="o-notes">ملاحظة: ${esc(c.notes)}</p>` : ''}
      </div>
      <div class="o-items">
        ${(o.items || []).map((it) => `<div class="o-line"><span><span class="code">${esc(it.code)}</span> × <span class="num">${it.qty}</span></span><span>${money(it.price * it.qty)}</span></div>`).join('')}
        <div class="o-line muted"><span>التوصيل</span><span>${money(o.delivery)}</span></div>
        <div class="o-line o-total"><span>الإجمالي</span><strong>${money(o.total)}</strong></div>
      </div>
    </div>
    <footer class="o-actions">
      <label class="o-status"><span class="sr-only">حالة الطلب ${esc(o.id)}</span>
        <select class="select" data-set-status="${o.id}">
          ${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${o.status === k ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
      </label>
      <a class="btn btn-ghost btn-sm" href="tel:${esc(c.phone)}"><span class="ico">${ICON.phone}</span>اتصال</a>
      <a class="btn btn-ghost btn-sm" href="${waLink(c.phone, greet)}" target="_blank" rel="noopener"><span class="ico">${ICON.wa}</span>واتساب</a>
      <button class="btn btn-ghost btn-sm" type="button" data-copy="${o.id}"><span class="ico">${ICON.copy}</span>نسخ العنوان</button>
    </footer>
  </article>`;
}

$('#ordersList').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-copy]');
  if (!b) return;
  const o = S.orders.find((x) => x.id === b.dataset.copy);
  const c = o.customer;
  const text = `${c.name}\n${prettyPhone(c.phone)}${c.phone2 ? ` / ${prettyPhone(c.phone2)}` : ''}\n${addressText(c)}${c.notes ? `\nملاحظة: ${c.notes}` : ''}\nالطلب ${o.id} — المبلغ ${num(o.total)} د.ع`;
  try { await navigator.clipboard.writeText(text); toast('تم نسخ العنوان'); } catch { toast('تعذّر النسخ'); }
});

$('#ordersList').addEventListener('change', async (e) => {
  const sel = e.target.closest('[data-set-status]');
  if (!sel) return;
  const o = S.orders.find((x) => x.id === sel.dataset.setStatus);
  const to = sel.value;
  // Cancelling returns the pieces to stock; un-cancelling takes them again.
  const restock = to === 'cancelled' && !o.restocked;
  const retake = to !== 'cancelled' && o.restocked;
  if (restock && !confirm(`إلغاء الطلب ${o.id} وإرجاع الكميات للمخزن؟`)) { sel.value = o.status; return; }
  sel.disabled = true;
  try {
    await runTransaction(db, async (tx) => {
      const refs = (o.items || []).map((it) => doc(db, 'products', it.id));
      const snaps = restock || retake ? await Promise.all(refs.map((r) => tx.get(r))) : [];
      snaps.forEach((s, i) => {
        if (!s.exists()) return;
        const delta = o.items[i].qty * (restock ? 1 : -1);
        tx.update(refs[i], { stock: Math.max(0, (s.data().stock | 0) + delta) });
      });
      tx.update(doc(db, 'orders', o.id), { status: to, ...(restock ? { restocked: true } : retake ? { restocked: false } : {}) });
    });
    toast(`${o.id}: ${STATUS[to]}`);
  } catch (err) {
    console.error(err);
    sel.value = o.status;
    toast('تعذّر تحديث الحالة');
  } finally { sel.disabled = false; }
});

/* ───────────────────────── Images ───────────────────────── */
// Resize in the browser before upload (keeps Storage small and pages fast).
async function resizeImage(file, max) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * s);
  canvas.height = Math.round(bmp.height * s);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close?.();
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/webp', 0.85));
  if (blob?.type === 'image/webp') return blob;
  return new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85)); // Safari without WebP encoding
}
async function upload(folder, id, file, max) {
  const blob = await resizeImage(file, max);
  const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${folder}/${id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const r = ref(storage, path);
  await uploadBytes(r, blob, { contentType: blob.type, cacheControl: 'public, max-age=31536000, immutable' });
  return { url: await getDownloadURL(r), path };
}
const removeFile = (path) => path && deleteObject(ref(storage, path)).catch(() => {});

/* ───────────────────────── Products ───────────────────────── */
const panelProducts = $('#tab-products');
panelProducts.innerHTML = `
  <div class="p-head">
    <h2>المنتجات <span class="muted num" id="pCount"></span></h2>
    <div class="p-head-actions">
      <button class="btn btn-ghost btn-sm" type="button" id="seedBtn" hidden>إضافة البيانات الأولية</button>
      <button class="btn btn-bronze btn-sm" type="button" id="addProduct"><span class="ico">${ICON.plus}</span>إضافة منتج</button>
    </div>
  </div>
  <div class="plist" id="productsList"></div>`;
$('#addProduct').addEventListener('click', () => openProduct());
$('#seedBtn').addEventListener('click', seed);

function renderProducts() {
  $('#pCount').textContent = S.products.length;
  $('#seedBtn').hidden = S.products.length > 0;
  $('#productsList').innerHTML = S.products.length ? S.products.map((p) => `
    <article class="prow ${p.visible ? '' : 'is-hidden'}">
      <div class="prow-thumb ${p.gender}">${p.images?.[0]?.url ? `<img src="${esc(p.images[0].url)}" alt="" width="60" height="75" loading="lazy">` : boxSVG(p.code, p.gender, { label: false })}</div>
      <div class="prow-info">
        <p><strong class="code">${esc(p.code)}</strong> <span class="muted">${GENDER[p.gender] || ''}</span>${p.visible ? '' : ' <span class="pill">مخفي</span>'}</p>
        <p class="muted prow-alt">${p.alt ? `بديل عن ${esc(p.alt)}` : 'بدون "بديل عن"'}</p>
        <p class="prow-meta">${Number.isInteger(p.price) && p.price > 0 ? money(p.price) : '<span class="warn">بدون سعر</span>'}
          · المخزن <span class="num ${(p.stock | 0) <= 0 ? 'warn' : ''}">${p.stock | 0}</span></p>
      </div>
      <div class="prow-actions">
        <label class="switch" title="إظهار في المتجر"><input type="checkbox" data-visible="${p.id}" ${p.visible ? 'checked' : ''}><span class="sr-only">إظهار ${esc(p.code)} في المتجر</span><span class="switch-ui" aria-hidden="true"></span></label>
        <button class="btn btn-ghost btn-sm" type="button" data-edit="${p.id}">تعديل</button>
        <button class="icon-btn ico sm" type="button" data-del="${p.id}" aria-label="حذف ${esc(p.code)}">${ICON.trash}</button>
      </div>
    </article>`).join('')
    : '<p class="empty-note">ما كو منتجات. اضغط “إضافة البيانات الأولية” لإضافة E02 و T15، أو أضف منتج جديد.</p>';
}

$('#productsList').addEventListener('click', async (e) => {
  const edit = e.target.closest('[data-edit]');
  const del = e.target.closest('[data-del]');
  if (edit) openProduct(S.products.find((p) => p.id === edit.dataset.edit));
  if (del) {
    const p = S.products.find((x) => x.id === del.dataset.del);
    if (!confirm(`حذف ${p.code} نهائياً؟ هذا الإجراء ما يتراجع.`)) return;
    await deleteDoc(doc(db, 'products', p.id));
    (p.images || []).forEach((im) => removeFile(im.path));
    toast(`حُذف ${p.code}`);
  }
});
$('#productsList').addEventListener('change', async (e) => {
  const v = e.target.closest('[data-visible]');
  if (!v) return;
  await updateDoc(doc(db, 'products', v.dataset.visible), { visible: v.checked });
  toast(v.checked ? 'صار ظاهر بالمتجر' : 'انخفى من المتجر');
});

const splitNotes = (s) => s.split(/[,،\n]/).map((x) => x.trim()).filter(Boolean);
const intOrNull = (v) => { const n = parseInt(String(v).replace(/[^\d]/g, ''), 10); return Number.isFinite(n) && n > 0 ? n : null; };

let editing = null; // { id, isNew, images: [{url,path}|{file,preview}], removed: [] }
function openProduct(p) {
  const isNew = !p;
  p ||= { code: '', gender: 'men', alt: '', family: '', notes: {}, description: '', price: null, compareAt: null, stock: 0, visible: true, images: [] };
  editing = { id: isNew ? doc(collection(db, 'products')).id : p.id, isNew, images: [...(p.images || [])], removed: [] };
  const dlg = $('#productDlg');
  const notes = (k) => esc((p.notes?.[k] || []).join('، '));
  dlg.innerHTML = `
    <form class="sheet-form" id="productForm" novalidate>
      <header class="sheet-head">
        <h2 id="productDlgTitle">${isNew ? 'منتج جديد' : `تعديل ${esc(p.code)}`}</h2>
        <button class="icon-btn ico" type="button" data-dismiss aria-label="إغلاق">${ICON.close}</button>
      </header>
      <div class="sheet-body pe">
        <div class="pe-preview" aria-hidden="true">
          <div class="pe-box" id="peBox"></div>
          <p class="hint">معاينة حية للعلبة</p>
        </div>
        <div class="pe-fields">
          <div class="row2">
            <div class="field"><label for="pCode">الكود</label><input class="input" id="pCode" name="code" value="${esc(p.code)}" dir="ltr" autocomplete="off" spellcheck="false" placeholder="E02" required><p class="err" id="eCode"></p></div>
            <fieldset class="field"><legend class="label">القسم</legend>
              <div class="seg">
                <label class="seg-opt"><input type="radio" name="gender" value="men" ${p.gender !== 'women' ? 'checked' : ''}><span>رجالي</span></label>
                <label class="seg-opt"><input type="radio" name="gender" value="women" ${p.gender === 'women' ? 'checked' : ''}><span>نسائي</span></label>
              </div>
            </fieldset>
          </div>
          <div class="row2">
            <div class="field"><label for="pAlt">بديل عن</label><input class="input" id="pAlt" name="alt" value="${esc(p.alt)}" autocomplete="off" placeholder="اسم العطر الأصلي…"></div>
            <div class="field"><label for="pFamily">العائلة العطرية</label><input class="input" id="pFamily" name="family" value="${esc(p.family)}" autocomplete="off" placeholder="مثال: زهري ناعم…"></div>
          </div>
          <div class="field"><label for="pTop">نفحات المقدمة</label><input class="input" id="pTop" name="top" value="${notes('top')}" autocomplete="off" placeholder="افصل بينها بفاصلة: برغموت، ليمون…"></div>
          <div class="field"><label for="pHeart">نفحات القلب</label><input class="input" id="pHeart" name="heart" value="${notes('heart')}" autocomplete="off" placeholder="مثال: سوسن، مريمية…"></div>
          <div class="field"><label for="pBase">نفحات القاعدة</label><input class="input" id="pBase" name="base" value="${notes('base')}" autocomplete="off" placeholder="مثال: مسك، فيتيفر…"></div>
          <div class="field"><label for="pDesc">الوصف</label><textarea class="textarea" id="pDesc" name="description" autocomplete="off" placeholder="وصف قصير للرائحة…">${esc(p.description)}</textarea></div>
          <div class="row3">
            <div class="field"><label for="pPrice">السعر (د.ع)</label><input class="input" id="pPrice" name="price" inputmode="numeric" dir="ltr" value="${p.price ?? ''}" autocomplete="off" placeholder="فارغ = السعر قريباً"></div>
            <div class="field"><label for="pCompare">السعر قبل الخصم <span class="opt">(اختياري)</span></label><input class="input" id="pCompare" name="compareAt" inputmode="numeric" dir="ltr" value="${p.compareAt ?? ''}" autocomplete="off"></div>
            <div class="field"><label for="pStock">الكمية بالمخزن</label><input class="input" id="pStock" name="stock" inputmode="numeric" dir="ltr" value="${p.stock | 0}" autocomplete="off"></div>
          </div>
          <label class="check"><input type="checkbox" name="visible" ${p.visible ? 'checked' : ''}> إظهار المنتج في المتجر</label>
          <div class="field">
            <span class="label">الصور</span>
            <div class="pe-images" id="peImages"></div>
            <label class="btn btn-ghost btn-sm file-btn"><input type="file" accept="image/*" multiple id="peFiles" class="sr-only">إضافة صور</label>
            <p class="hint">تتصغّر تلقائياً (1200px WebP). أول صورة هي الرئيسية. بدون صور تظهر رسمة العلبة.</p>
          </div>
        </div>
      </div>
      <footer class="sheet-foot">
        <p class="err" id="pErr" role="alert"></p>
        <button class="btn btn-ghost" type="button" data-dismiss>إلغاء</button>
        <button class="btn btn-bronze" type="submit" id="pSave">حفظ</button>
      </footer>
    </form>`;
  const form = $('#productForm');
  const preview = () => { $('#peBox').innerHTML = boxSVG(form.elements.code.value.trim().toUpperCase(), form.elements.gender.value); };
  form.addEventListener('input', preview);
  preview();
  renderImages();
  $('#peFiles').addEventListener('change', (e) => {
    [...e.target.files].forEach((file) => editing.images.push({ file, preview: URL.createObjectURL(file) }));
    e.target.value = '';
    renderImages();
  });
  $('#peImages').addEventListener('click', (e) => {
    const b = e.target.closest('[data-img]');
    if (!b) return;
    const i = +b.dataset.i;
    if (b.dataset.img === 'cover') editing.images.unshift(...editing.images.splice(i, 1));
    else {
      const [gone] = editing.images.splice(i, 1);
      if (gone.path) editing.removed.push(gone.path);
    }
    renderImages();
  });
  form.addEventListener('submit', (e) => { e.preventDefault(); saveProduct(form); });
  dlg.querySelectorAll('[data-dismiss]').forEach((b) => b.addEventListener('click', () => dlg.close()));
  dlg.showModal();
}

function renderImages() {
  $('#peImages').innerHTML = editing.images.map((im, i) => `
    <div class="pe-img">
      <img src="${esc(im.url || im.preview)}" alt="" width="90" height="112">
      ${i === 0 ? '<span class="pe-cover">رئيسية</span>' : `<button type="button" class="pe-mini" data-img="cover" data-i="${i}">اجعلها رئيسية</button>`}
      <button type="button" class="pe-x" data-img="del" data-i="${i}" aria-label="حذف الصورة ${i + 1}">${ICON.close}</button>
    </div>`).join('');
}

async function saveProduct(form) {
  const f = form.elements;
  const code = f.code.value.trim().toUpperCase();
  $('#eCode').textContent = '';
  $('#pErr').textContent = '';
  if (!code) { $('#eCode').textContent = 'اكتب كود المنتج'; f.code.focus(); return; }
  if (S.products.some((p) => p.id !== editing.id && p.code.toUpperCase() === code)) {
    $('#eCode').textContent = 'هذا الكود مستخدم لمنتج ثاني';
    f.code.focus();
    return;
  }
  const price = intOrNull(f.price.value);
  const compareAt = intOrNull(f.compareAt.value);
  if (compareAt && price && compareAt <= price) {
    $('#pErr').textContent = 'السعر قبل الخصم لازم يكون أعلى من السعر الحالي، أو اتركه فارغ.';
    f.compareAt.focus();
    return;
  }
  const btn = $('#pSave');
  btn.disabled = true;
  btn.textContent = 'جارٍ الحفظ…';
  try {
    const images = [];
    for (const im of editing.images) {
      if (im.file) {
        btn.textContent = `جارٍ رفع الصور ${images.length + 1}/${editing.images.length}…`;
        images.push(await upload('products', editing.id, im.file, 1200));
      } else images.push({ url: im.url, path: im.path });
    }
    const data = {
      code,
      gender: f.gender.value,
      alt: f.alt.value.trim(),
      family: f.family.value.trim(),
      notes: { top: splitNotes(f.top.value), heart: splitNotes(f.heart.value), base: splitNotes(f.base.value) },
      description: f.description.value.trim(),
      price,
      compareAt,
      stock: Math.max(0, parseInt(String(f.stock.value).replace(/[^\d]/g, ''), 10) || 0),
      visible: f.visible.checked,
      images,
      updatedAt: serverTimestamp(),
    };
    const r = doc(db, 'products', editing.id);
    if (editing.isNew) await setDoc(r, { ...data, createdAt: serverTimestamp() });
    else await updateDoc(r, data);
    editing.removed.forEach(removeFile);
    $('#productDlg').close();
    toast(`تم حفظ ${code}`);
  } catch (err) {
    console.error(err);
    $('#pErr').textContent = 'تعذّر الحفظ. تحقق من الإنترنت وحاول مرة ثانية.';
  } finally {
    btn.disabled = false;
    btn.textContent = 'حفظ';
  }
}

async function seed() {
  const b = writeBatch(db);
  const base = { description: '', price: null, compareAt: null, stock: 0, visible: true, images: [], alt: '', createdAt: serverTimestamp() };
  b.set(doc(collection(db, 'products')), {
    ...base, code: 'E02', gender: 'men', family: 'حمضي عطري خشبي',
    notes: {
      top: ['برغموت', 'يوسفي', 'ليمون أخضر', 'عرعر', 'ألمدودلر'],
      heart: ['هيديون', 'جذر السوسن', 'مريمية', 'زنجبيل', 'فلفل وردي', 'فريزيا'],
      base: ['أمبروكسان', 'مسك', 'فول التونكا', 'فيتيفر'],
    },
  });
  b.set(doc(collection(db, 'products')), {
    ...base, code: 'T15', gender: 'women', family: 'زهري ناعم',
    notes: { top: ['فاوانيا'], heart: ['زنبق الوادي'], base: ['ستيفانوتيس'] },
  });
  await b.commit();
  toast('أُضيف E02 و T15 — حدد الأسعار والكميات');
}

/* ───────────────────────── Banners ───────────────────────── */
const panelBanners = $('#tab-banners');
panelBanners.innerHTML = `
  <div class="p-head">
    <h2>البنرات</h2>
    <button class="btn btn-bronze btn-sm" type="button" id="addBanner"><span class="ico">${ICON.plus}</span>إضافة بنر</button>
  </div>
  <p class="hint">إذا ما كو بنر مفعّل، المتجر يعرض البنر الافتراضي بالأسود والأبيض. المقاس المثالي 1920×1080.</p>
  <div class="blist" id="bannersList"></div>`;
$('#addBanner').addEventListener('click', () => openBanner());

function renderBanners() {
  $('#bannersList').innerHTML = S.banners.length ? S.banners.map((b) => `
    <article class="brow ${b.active ? '' : 'is-hidden'}">
      <img src="${esc(b.image?.url)}" alt="" width="240" height="135" loading="lazy">
      <div class="brow-info">
        <p><strong>${esc(b.title || 'بدون عنوان')}</strong></p>
        <p class="muted">الزر: ${esc(b.cta || 'تسوق الآن')} · الترتيب <span class="num">${b.order ?? 0}</span>${b.active ? '' : ' · <span class="pill">متوقف</span>'}</p>
      </div>
      <div class="prow-actions">
        <label class="switch"><input type="checkbox" data-bactive="${b.id}" ${b.active ? 'checked' : ''}><span class="sr-only">تفعيل البنر</span><span class="switch-ui" aria-hidden="true"></span></label>
        <button class="btn btn-ghost btn-sm" type="button" data-bedit="${b.id}">تعديل</button>
        <button class="icon-btn ico sm" type="button" data-bdel="${b.id}" aria-label="حذف البنر">${ICON.trash}</button>
      </div>
    </article>`).join('') : '<p class="empty-note">ما كو بنرات.</p>';
}

$('#bannersList').addEventListener('click', async (e) => {
  const ed = e.target.closest('[data-bedit]');
  const del = e.target.closest('[data-bdel]');
  if (ed) openBanner(S.banners.find((b) => b.id === ed.dataset.bedit));
  if (del) {
    const b = S.banners.find((x) => x.id === del.dataset.bdel);
    if (!confirm('حذف هذا البنر؟')) return;
    await deleteDoc(doc(db, 'banners', b.id));
    removeFile(b.image?.path);
    toast('حُذف البنر');
  }
});
$('#bannersList').addEventListener('change', (e) => {
  const a = e.target.closest('[data-bactive]');
  if (a) updateDoc(doc(db, 'banners', a.dataset.bactive), { active: a.checked });
});

function openBanner(b) {
  const isNew = !b;
  b ||= { title: '', subtitle: '', cta: 'تسوق الآن', link: '#collection', order: S.banners.length, active: true };
  const id = isNew ? doc(collection(db, 'banners')).id : b.id;
  let file = null;
  const dlg = $('#bannerDlg');
  dlg.innerHTML = `
    <form class="sheet-form" id="bannerForm" novalidate>
      <header class="sheet-head">
        <h2 id="bannerDlgTitle">${isNew ? 'بنر جديد' : 'تعديل البنر'}</h2>
        <button class="icon-btn ico" type="button" data-dismiss aria-label="إغلاق">${ICON.close}</button>
      </header>
      <div class="sheet-body">
        <div class="b-preview" id="bPreview">${b.image?.url ? `<img src="${esc(b.image.url)}" alt="" width="640" height="360">` : '<span class="muted">ما كو صورة بعد</span>'}</div>
        <label class="btn btn-ghost btn-sm file-btn"><input type="file" accept="image/*" id="bFile" class="sr-only">${b.image ? 'تغيير الصورة' : 'اختيار صورة'}</label>
        <div class="field"><label for="bTitle">العنوان</label><input class="input" id="bTitle" name="title" value="${esc(b.title)}" autocomplete="off" placeholder="مثال: مجموعة الشتاء…"></div>
        <div class="field"><label for="bSub">نص صغير <span class="opt">(اختياري)</span></label><input class="input" id="bSub" name="subtitle" value="${esc(b.subtitle || '')}" autocomplete="off"></div>
        <div class="row2">
          <div class="field"><label for="bCta">نص الزر</label><input class="input" id="bCta" name="cta" value="${esc(b.cta)}" autocomplete="off"></div>
          <div class="field"><label for="bLink">الرابط</label><input class="input" id="bLink" name="link" value="${esc(b.link)}" dir="ltr" autocomplete="off" spellcheck="false" placeholder="#/?g=men"></div>
        </div>
        <p class="hint">أمثلة للرابط: <code dir="ltr">#collection</code> المجموعة · <code dir="ltr">#/?g=men</code> رجالي · <code dir="ltr">#/?g=women</code> نسائي</p>
        <div class="row2">
          <div class="field"><label for="bOrder">الترتيب</label><input class="input" id="bOrder" name="order" inputmode="numeric" dir="ltr" value="${b.order ?? 0}" autocomplete="off"></div>
          <label class="check"><input type="checkbox" name="active" ${b.active ? 'checked' : ''}> مفعّل</label>
        </div>
      </div>
      <footer class="sheet-foot">
        <p class="err" id="bErr" role="alert"></p>
        <button class="btn btn-ghost" type="button" data-dismiss>إلغاء</button>
        <button class="btn btn-bronze" type="submit" id="bSave">حفظ</button>
      </footer>
    </form>`;
  $('#bFile').addEventListener('change', (e) => {
    file = e.target.files[0] || null;
    if (file) $('#bPreview').innerHTML = `<img src="${URL.createObjectURL(file)}" alt="" width="640" height="360">`;
  });
  dlg.querySelectorAll('[data-dismiss]').forEach((x) => x.addEventListener('click', () => dlg.close()));
  $('#bannerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target.elements;
    if (!file && !b.image) { $('#bErr').textContent = 'اختر صورة للبنر'; return; }
    const btn = $('#bSave');
    btn.disabled = true;
    btn.textContent = 'جارٍ الحفظ…';
    try {
      const image = file ? await upload('banners', id, file, 1920) : b.image;
      await setDoc(doc(db, 'banners', id), {
        image, title: f.title.value.trim(), subtitle: f.subtitle.value.trim(), cta: f.cta.value.trim() || 'تسوق الآن',
        link: f.link.value.trim() || '#collection', order: parseInt(f.order.value, 10) || 0, active: f.active.checked,
      });
      if (file && b.image?.path) removeFile(b.image.path);
      dlg.close();
      toast('تم حفظ البنر');
    } catch (err) {
      console.error(err);
      $('#bErr').textContent = 'تعذّر الحفظ. حاول مرة ثانية.';
    } finally { btn.disabled = false; btn.textContent = 'حفظ'; }
  });
  dlg.showModal();
}

/* ───────────────────────── Shipping ───────────────────────── */
const panelShipping = $('#tab-shipping');
function renderShipping() {
  if (panelShipping.contains(document.activeElement)) return; // don't clobber while typing
  const sh = S.settings.shipping || {};
  panelShipping.innerHTML = `
    <div class="p-head"><h2>أجور التوصيل</h2></div>
    <p class="hint">بالدينار العراقي. اترك الحقل فارغ إذا ما توصلون لهذه المحافظة، واكتب 0 للتوصيل المجاني.</p>
    <form id="shipForm" class="ship-grid">
      ${GOVS.map(([k, n]) => `<div class="field ship-row"><label for="sh-${k}">${n}</label>
        <input class="input" id="sh-${k}" name="${k}" inputmode="numeric" dir="ltr" autocomplete="off" value="${Number.isInteger(sh[k]) ? sh[k] : ''}"></div>`).join('')}
      <div class="ship-save"><button class="btn btn-bronze" type="submit">حفظ الأجور</button></div>
    </form>`;
  $('#shipForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const shipping = {};
    GOVS.forEach(([k]) => {
      const v = String(e.target.elements[k].value).replace(/[^\d]/g, '');
      if (v !== '') shipping[k] = parseInt(v, 10);
    });
    await updateDoc(doc(db, 'settings', 'store'), { shipping });
    document.activeElement?.blur();
    toast('تم حفظ أجور التوصيل');
  });
}

/* ───────────────────────── Settings ───────────────────────── */
const panelSettings = $('#tab-settings');
function renderSettings() {
  if (panelSettings.contains(document.activeElement)) return;
  const s = S.settings;
  panelSettings.innerHTML = `
    <div class="p-head"><h2>الإعدادات</h2></div>
    <form id="setForm" class="set-form">
      <div class="field"><label for="sWa">رقم واتساب المتجر</label>
        <input class="input" id="sWa" name="whatsapp" type="tel" inputmode="tel" dir="ltr" autocomplete="off" value="${esc(prettyPhone(s.whatsapp))}" placeholder="07XX XXX XXXX" aria-describedby="eWa">
        <p class="err" id="eWa"></p></div>
      <div class="field"><label for="sIg">انستغرام</label>
        <input class="input" id="sIg" name="instagram" dir="ltr" autocomplete="off" spellcheck="false" value="${esc(s.instagram || '')}" placeholder="@nicheperfumes"></div>
      <div class="field"><label for="sTop">نص الشريط العلوي</label>
        <input class="input" id="sTop" name="topbar" autocomplete="off" value="${esc(s.topbar || '')}" maxlength="120"></div>
      <button class="btn btn-bronze" type="submit">حفظ الإعدادات</button>
    </form>`;
  $('#setForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target.elements;
    const wa = f.whatsapp.value.trim();
    const phone = wa ? normalizePhone(wa) : '';
    $('#eWa').textContent = phone === null ? 'اكتب رقم عراقي صحيح يبدأ بـ 07' : '';
    if (phone === null) return f.whatsapp.focus();
    await updateDoc(doc(db, 'settings', 'store'), {
      whatsapp: phone, instagram: f.instagram.value.trim(), topbar: f.topbar.value.trim(),
    });
    document.activeElement?.blur();
    toast('تم حفظ الإعدادات');
  });
}


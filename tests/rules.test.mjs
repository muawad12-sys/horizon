// Firestore rules tests. Run from this folder: npm install && npm test
import { test, before, beforeEach, after } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';

const ts = () => firebase.firestore.FieldValue.serverTimestamp();
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-niche',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
  });
});
after(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc('admins/boss').set({ email: 'a@b.c' });
    await db.doc('counters/orders').set({ seq: 1041 });
    await db.doc('settings/store').set({ shipping: { baghdad: 5000, basra: 7000 } });
    await db.doc('products/e02').set({ code: 'E02', price: 15000, stock: 5, visible: true });
    await db.doc('products/t15').set({ code: 'T15', price: 12000, stock: 1, visible: true });
    await db.doc('products/nop').set({ code: 'X01', price: null, stock: 9, visible: true });
  });
});

const guest = () => env.unauthenticatedContext().firestore();
const admin = () => env.authenticatedContext('boss').firestore();

const customer = (o = {}) => ({
  name: 'علي حسن', phone: '+9647701234567', phone2: '', gov: 'baghdad',
  area: 'الكرادة', landmark: 'قرب جامع', notes: '', ...o,
});

// Builds the exact batch the store sends. `o` overrides pieces to simulate tampering.
function orderBatch(db, o = {}) {
  const seq = o.seq ?? 1042;
  const id = 'NP-' + seq;
  const items = o.items ?? [
    { id: 'e02', code: 'E02', price: 15000, qty: 2 },
    { id: 't15', code: 'T15', price: 12000, qty: 1 },
  ];
  const subtotal = o.subtotal ?? items.reduce((s, i) => s + i.price * i.qty, 0);
  const delivery = o.delivery ?? 5000;
  const stocks = o.stocks ?? { e02: 3, t15: 0 };
  const b = db.batch();
  if (!o.skipCounter) b.update(db.doc('counters/orders'), { seq });
  for (const it of items) {
    if (o.skipStock) continue;
    b.update(db.doc('products/' + it.id), { stock: stocks[it.id], lastOrder: id });
  }
  b.set(db.doc('orders/' + id), {
    customer: customer(o.customer), items,
    qty: Object.fromEntries(items.map((i) => [i.id, i.qty])),
    subtotal, delivery, total: o.total ?? subtotal + delivery,
    status: o.status ?? 'new', createdAt: ts(),
  });
  return b.commit();
}

test('guest can place a valid order', () => assertSucceeds(orderBatch(guest())));
test('guest cannot read orders', () => assertFails(guest().doc('orders/NP-1042').get()));
test('guest cannot list orders', () => assertFails(guest().collection('orders').get()));
test('admin can read orders', () => assertSucceeds(admin().collection('orders').get()));

test('rejects tampered price', () => assertFails(orderBatch(guest(), {
  items: [{ id: 'e02', code: 'E02', price: 1000, qty: 2 }], stocks: { e02: 3 },
})));
test('rejects wrong subtotal', () => assertFails(orderBatch(guest(), { subtotal: 100 })));
test('rejects wrong total', () => assertFails(orderBatch(guest(), { total: 100 })));
test('rejects wrong delivery fee', () => assertFails(orderBatch(guest(), { delivery: 0 })));
test('rejects province without fee', () => assertFails(orderBatch(guest(), { customer: { gov: 'erbil' } })));
test('rejects bad phone', () => assertFails(orderBatch(guest(), { customer: { phone: '07701234567' } })));
test('rejects bad alt phone', () => assertFails(orderBatch(guest(), { customer: { phone2: '123' } })));
test('rejects unknown province', () => assertFails(orderBatch(guest(), { customer: { gov: 'mars' } })));
test('rejects empty name', () => assertFails(orderBatch(guest(), { customer: { name: '' } })));
test('rejects status other than new', () => assertFails(orderBatch(guest(), { status: 'delivered' })));
test('rejects stock going negative', () => assertFails(orderBatch(guest(), {
  items: [{ id: 't15', code: 'T15', price: 12000, qty: 2 }], stocks: { t15: -1 },
})));
test('rejects stock decrement not matching qty', () => assertFails(orderBatch(guest(), { stocks: { e02: 4, t15: 0 } })));
test('rejects order without stock update', () => assertFails(orderBatch(guest(), { skipStock: true })));
test('rejects order without counter bump', () => assertFails(orderBatch(guest(), { skipCounter: true })));
test('rejects skipping order numbers', () => assertFails(orderBatch(guest(), { seq: 1050 })));
test('rejects product without price', () => assertFails(orderBatch(guest(), {
  items: [{ id: 'nop', code: 'X01', price: 0, qty: 1 }], stocks: { nop: 8 },
})));
test('rejects duplicate lines', async () => {
  const items = Array.from({ length: 2 }, (_, i) => ({ id: 'e02', code: 'E02', price: 15000, qty: 1 }));
  await assertFails(orderBatch(guest(), { items }));
});

test('guest cannot edit product price', () => assertFails(guest().doc('products/e02').update({ price: 1 })));
test('guest cannot lower stock without an order', () => assertFails(guest().doc('products/e02').update({ stock: 0, lastOrder: 'NP-9' })));
test('guest cannot bump counter alone', () => assertFails(guest().doc('counters/orders').update({ seq: 1042 })));
test('guest cannot write settings', () => assertFails(guest().doc('settings/store').set({ topbar: 'x' })));
test('guest cannot write banners', () => assertFails(guest().doc('banners/a').set({ title: 'x' })));
test('guest can read products', () => assertSucceeds(guest().collection('products').get()));
test('admin can edit products', () => assertSucceeds(admin().doc('products/e02').update({ price: 20000 })));
test('admin can update order status', async () => {
  await assertSucceeds(orderBatch(guest()));
  await assertSucceeds(admin().doc('orders/NP-1042').update({ status: 'confirmed' }));
});
test('guest cannot update order', async () => {
  await assertSucceeds(orderBatch(guest()));
  await assertFails(guest().doc('orders/NP-1042').update({ status: 'cancelled' }));
});
test('non-admin user cannot read orders', () =>
  assertFails(env.authenticatedContext('rando').firestore().collection('orders').get()));
test('user cannot make themselves admin', () =>
  assertFails(env.authenticatedContext('rando').firestore().doc('admins/rando').set({})));

test('guest can place a max-size order (5 products, all fields filled)', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    for (let i = 0; i < 8; i++) {
      await ctx.firestore().doc('products/p' + i).set({ code: 'P' + i, price: 1000 + i, stock: 10, visible: true });
    }
  });
  const items = Array.from({ length: 5 }, (_, i) => ({ id: 'p' + i, code: 'P' + i, price: 1000 + i, qty: 10 }));
  const stocks = Object.fromEntries(items.map((i) => [i.id, 0]));
  await assertSucceeds(orderBatch(guest(), {
    items, stocks, customer: { phone2: '+9647812345678', notes: 'اتصل قبل الوصول'.repeat(20) },
  }));
});
test('rejects 6 different products', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    for (let i = 0; i < 6; i++) await ctx.firestore().doc('products/p' + i).set({ code: 'P' + i, price: 1000, stock: 10, visible: true });
  });
  const items = Array.from({ length: 6 }, (_, i) => ({ id: 'p' + i, code: 'P' + i, price: 1000, qty: 1 }));
  await assertFails(orderBatch(guest(), { items, stocks: Object.fromEntries(items.map((i) => [i.id, 9])) }));
});
test('guest can place a single-item order', () => assertSucceeds(orderBatch(guest(), {
  items: [{ id: 'e02', code: 'E02', price: 15000, qty: 5 }], stocks: { e02: 0 },
})));
test('second order gets next number', async () => {
  await assertSucceeds(orderBatch(guest(), { items: [{ id: 'e02', code: 'E02', price: 15000, qty: 1 }], stocks: { e02: 4 } }));
  await assertSucceeds(orderBatch(guest(), { seq: 1043, items: [{ id: 'e02', code: 'E02', price: 15000, qty: 1 }], stocks: { e02: 3 } }));
});

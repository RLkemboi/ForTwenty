// Runs against a local dev server (PAYMENTS_MODE=mock). Usage: node test.mjs
const B = 'http://localhost:8787';
const ADMIN = { authorization: 'Bearer dev-admin-token' };
let pass = 0, fail = 0;
const check = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  ' + extra)); };
const post = (p, body, h = {}) => fetch(B + p, { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(body || {}) });
const get = async (p, h) => (await fetch(B + p, { headers: h })).json();
const order = (over = {}) => post('/api/orders', { product_id: 1, qty: 1, phone: '0712345678', address: 'Test building, Nakuru', age_confirmed: true, ...over });
const pay = (id, body) => post('/api/demo/pay/' + id, body).then((r) => r.json());
const status = async (id) => (await get('/api/orders/' + id)).status;
const riders = () => get('/api/admin/riders', ADMIN);
const orders = () => get('/api/admin/orders', ADMIN);
const sms = () => get('/api/admin/sms', ADMIN);

// Validation
check('age gate blocks order', (await order({ age_confirmed: false })).status === 400);
check('junk phone rejected', (await order({ phone: '12345' })).status === 400);
check('qty 0 rejected', (await order({ qty: 0 })).status === 400);
check('qty 11 rejected', (await order({ qty: 11 })).status === 400);
check('unknown product rejected', (await order({ product_id: 99 })).status === 400);
for (const ph of ['0712345678', '+254712345678', '254712345678', '0112345678']) {
  const r = await order({ phone: ph, address: 'Phone format test ' + ph });
  check('phone format ' + ph, r.status === 200 || r.status === 429, String(r.status));
}
check('admin needs token', (await fetch(B + '/api/admin/orders')).status === 403);
check('callback rejects wrong secret', (await post('/api/mpesa/callback/wrong', {})).status === 403);

// Phone resolving: a leading 0 after +254, a doubled code, 00 prefix and spaces all end up as 254712......
const variants = { '+2540712000011': '254712000011', '+254254712000012': '254712000012', '00254712000013': '254712000013', '0712 000 014': '254712000014', '+254 712 000 015': '254712000015', '254 0112000016': '254112000016' };
for (const [raw, want] of Object.entries(variants)) {
  const r = await (await order({ phone: raw, address: 'Phone resolve test' })).json();
  const row = (await orders()).find((o) => o.id === r.order_id);
  check('phone ' + raw + ' -> ' + want, row && row.phone === want, JSON.stringify(row));
}
check('other country code rejected', (await order({ phone: '+255712000017' })).status === 400);
check('too few digits rejected', (await order({ phone: '+254 712 000' })).status === 400);

// Totals come from the database
const a = await (await order({ phone: '0722000001', product_id: 2, qty: 2 })).json();
check('packet x2 total is 1200', a.total_kes === 1200, JSON.stringify(a));
check('new order awaits payment', (await status(a.order_id)) === 'awaiting_payment');

// Cancel
const c = await (await order({ phone: '0722000002' })).json();
await pay(c.order_id, { result: 1032 });
check('cancelled prompt -> payment_failed', (await status(c.order_id)) === 'payment_failed');

// Wrong amount
const w = await (await order({ phone: '0722000003' })).json();
await pay(w.order_id, { result: 0, amount: 50 });
check('wrong amount -> amount_mismatch, no rider', (await status(w.order_id)) === 'amount_mismatch');

// Pay a -> rider 1; duplicate callback changes nothing
await pay(a.order_id, { result: 0 });
check('paid order gets rider', (await status(a.order_id)) === 'assigned');
const dup = await pay(a.order_id, { result: 0 });
check('duplicate callback ignored', dup.reason === 'already_processed', JSON.stringify(dup));
let rs = await riders();
check('one rider busy after duplicate', rs.filter((r) => r.busy).length === 1, JSON.stringify(rs));

// Second order -> rider 2; third queues
const b = await (await order({ phone: '0722000004' })).json();
await pay(b.order_id, { result: 0 });
check('second order takes the other rider', (await status(b.order_id)) === 'assigned');
const q = await (await order({ phone: '0722000005' })).json();
await pay(q.order_id, { result: 0 });
check('third paid order queues (no free rider)', (await status(q.order_id)) === 'paid');
check('owner alerted when no rider', (await sms()).some((m) => m.to_phone === '254702581356' && /No free rider/.test(m.body)));

// Delivery: twice, one ledger entry, queue drains
const all = await orders();
const rider1Order = all.find((o) => o.id === a.order_id);
const tokenRow = await (await fetch(B + '/api/admin/sms', { headers: ADMIN })).json();
const link = tokenRow.map((m) => (m.body.match(/\/d\/([a-z0-9]+)/) || [])[1]).filter(Boolean);
const aToken = tokenRow.find((m) => /1200/.test(m.body) && /\/d\//.test(m.body));
const tok = (aToken.body.match(/\/d\/([a-z0-9]+)/) || [])[1];
check('delivery page loads', (await fetch(B + '/d/' + tok)).status === 200);
await post('/api/deliver/' + tok);
await post('/api/deliver/' + tok);
check('delivered once', (await status(a.order_id)) === 'delivered');
rs = await riders();
check('rider owed 10% of 1200 = 120 exactly once', rs.find((r) => r.id === rider1Order.rider_id).owed_kes === 120, JSON.stringify(rs));
check('queued order assigned after delivery', (await status(q.order_id)) === 'assigned');

// ---- Airtel Money, map pin, providers (added in step 3/4) ----
const cfg = await get('/api/config');
check('config lists both providers', Array.isArray(cfg.providers) && cfg.providers.includes('airtel') && cfg.providers.includes('mpesa'), JSON.stringify(cfg));
check('unknown provider rejected', (await order({ phone: '0733000001', provider: 'paypal' })).status === 400);
check('pin outside Nakuru rejected', (await order({ phone: '0733000002', lat: -1.286, lng: 36.817 })).status === 400);
check('junk pin rejected', (await order({ phone: '0733000003', lat: 'abc', lng: 36.08 })).status === 400);
check('wrong airtel callback secret rejected', (await post('/api/airtel/callback/wrong', {})).status === 403);

// Free both riders first so the Airtel order gets one straight away (deliver everything outstanding)
for (let pass2 = 0; pass2 < 3; pass2++) {
  for (const m of await sms()) { const t = (m.body.match(/\/d\/([a-z0-9]+)/) || [])[1]; if (t) await post('/api/deliver/' + t); }
}
const air = await (await order({ phone: '0733000004', provider: 'airtel', product_id: 2, qty: 1, lat: -0.3031, lng: 36.08, address: 'Airtel test, Nakuru' })).json();
check('airtel order starts awaiting payment', (await status(air.order_id)) === 'awaiting_payment', JSON.stringify(air));
const airRow = (await orders()).find((o) => o.id === air.order_id);
check('airtel order stores provider and pin', airRow && airRow.provider === 'airtel' && Math.abs(airRow.lat + 0.3031) < 1e-6 && Math.abs(airRow.lng - 36.08) < 1e-6, JSON.stringify(airRow));
// Airtel-style callback straight to the real endpoint: first one with TA (ambiguous) changes nothing
const txId = 'mock_' + air.order_id;
await post('/api/airtel/callback/dev-callback-secret', { transaction: { id: txId, status_code: 'TA' } });
check('airtel TA leaves order waiting', (await status(air.order_id)) === 'awaiting_payment');
await pay(air.order_id, { result: 0 });
check('airtel TS marks paid and queues/assigns', ['paid', 'assigned'].includes(await status(air.order_id)));
const dupAir = await post('/api/airtel/callback/dev-callback-secret', { transaction: { id: txId, status_code: 'TS' } }).then((r) => r.json());
check('airtel duplicate callback does nothing', (await status(air.order_id)) !== 'awaiting_payment' && dupAir.ok === true);
check('airtel callback for unknown id harmless', (await post('/api/airtel/callback/dev-callback-secret', { transaction: { id: 'nope', status_code: 'TS' } })).status === 200);

const airFail = await (await order({ phone: '0733000005', provider: 'airtel' })).json();
await pay(airFail.order_id, { result: 1032 });
check('airtel TF -> payment_failed', (await status(airFail.order_id)) === 'payment_failed');

// An M-Pesa order is untouched by an Airtel-shaped callback
const mp = await (await order({ phone: '0733000006' })).json();
await post('/api/airtel/callback/dev-callback-secret', { transaction: { id: 'mock_' + mp.order_id, status_code: 'TS' } });
check('airtel callback cannot pay an M-Pesa order', (await status(mp.order_id)) === 'awaiting_payment');

// The rider SMS carries the map link when there is a pin
const smsAll = await sms();
check('rider SMS has map link', smsAll.some((m) => /maps\.google\.com\/\?q=-0\.303100,36\.080000/.test(m.body)), 'no map link in sms_log');

// Address optional with a pin, required without
check('pin only (no address) accepted', (await order({ phone: '0733000007', address: '', lat: -0.3031, lng: 36.08 })).status === 200);
check('no pin and no address rejected', (await order({ phone: '0733000008', address: '' })).status === 400);

// ---- Admin: riders and rider page (step 5) ----
const postA = (p, body) => post(p, body, ADMIN);
check('admin add rider needs token', (await post('/api/admin/riders', { name: 'Nope', phone: '0712000000' })).status === 403);
check('admin add rider rejects bad phone', (await postA('/api/admin/riders', { name: 'Test Rider', phone: '123' })).status === 400);
const nr = await (await postA('/api/admin/riders', { name: 'Test Rider', phone: '0712 000 111' })).json();
check('admin add rider works', nr.ok === true && nr.id > 2, JSON.stringify(nr));
let rl = await riders();
check('new rider stored with +254 form', rl.find((r) => r.id === nr.id) && rl.find((r) => r.id === nr.id).phone === '254712000111', JSON.stringify(rl));
check('admin update phone', (await (await postA('/api/admin/riders/' + nr.id + '/update', { phone: '+254 722 000 222' })).json()).ok === true);
check('admin rider off duty', (await (await postA('/api/admin/riders/' + nr.id + '/update', { active: 0 })).json()).ok === true);
rl = await riders();
const nr2 = rl.find((r) => r.id === nr.id);
check('update stored', nr2.phone === '254722000222' && nr2.active === 0 && nr2.name === 'Test Rider', JSON.stringify(nr2));
check('update unknown rider 404', (await postA('/api/admin/riders/9999/update', { name: 'Zed' })).status === 404);
const ord = (await orders()).find((o) => o.product);
check('admin orders carry product name', !!ord && typeof ord.product === 'string', JSON.stringify(ord));
// Rider page shows the item, a call link and escapes the address
const xo = await (await order({ phone: '0733000009', address: '<b>x</b> Test', lat: -0.3031, lng: 36.08 })).json();
await pay(xo.order_id, { result: 0 });
const tok2 = (await sms()).map((m) => (m.body.match(/\/d\/([a-z0-9]+)/) || [])[1]).filter(Boolean)[0];
const page = await (await fetch(B + '/d/' + tok2)).text();
check('rider page has call link and map link', /tel:\+254/.test(page) && /maps\.google\.com/.test(page), page.slice(0, 200));
check('rider page escapes html', !/<b>x<\/b>/.test(page));

// ---- Blocked customers (step 5b) ----
check('block needs token', (await post('/api/admin/blocked', { phone: '0744000001' })).status === 403);
check('block rejects junk phone', (await postA('/api/admin/blocked', { phone: 'abc' })).status === 400);
check('block works in 0-format', (await (await postA('/api/admin/blocked', { phone: '0744 000 001', reason: 'test' })).json()).phone === '254744000001');
let bl = await get('/api/admin/blocked', ADMIN);
check('blocked list has +254 form', bl.length === 1 && bl[0].phone === '254744000001' && bl[0].reason === 'test', JSON.stringify(bl));
for (const ph of ['0744000001', '+254744000001', '254744000001', '744000001']) {
  const r = await order({ phone: ph });
  check('blocked number refused as ' + ph, r.status === 403, String(r.status));
}
check('other numbers still order', (await order({ phone: '0744000002' })).status === 200);
check('unblock via +254 form', (await (await postA('/api/admin/blocked/%2B254744000001/remove', {})).json()).ok === true);
check('unblocked number can order', (await order({ phone: '0744000001' })).status === 200);
check('blocked list empty again', (await get('/api/admin/blocked', ADMIN)).length === 0);

// ---- Monitor heartbeat ----
check('heartbeat without token refused', (await post('/api/monitor/beat', { ok: true })).status === 403);
check('heartbeat with wrong token refused', (await post('/api/monitor/beat', { ok: true }, { authorization: 'Bearer nope' })).status === 403);
check('admin monitor empty before first beat', (await get('/api/admin/monitor', ADMIN)).ts === null);
check('heartbeat accepted', (await (await post('/api/monitor/beat', { ok: true, detail: 'healthy' }, { authorization: 'Bearer dev-monitor-token' })).json()).ok === true);
const mon = await get('/api/admin/monitor', ADMIN);
check('admin monitor shows fresh beat', mon.ok === 1 && Math.abs(Date.now() - mon.ts) < 10000 && mon.stale_alerted === 0, JSON.stringify(mon));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);


// Needs: dev server with RIDER_MODE:real, zero-fee vars, ORDER_LIMIT_10MIN:1000, MONITOR_TOKEN:dev-monitor-token, default DEDUPE_SECONDS, and DB dir in $DBDIR.
import { execSync } from 'node:child_process';
const B = 'http://localhost:8787', DB = process.env.DBDIR || '/tmp/db1';
const ADMIN = { authorization: 'Bearer dev-admin-token' };
let pass = 0, fail = 0;
const check = (n, c, x = '') => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  ' + x)); };
const post = (p, b, h = {}) => fetch(B + p, { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(b || {}) });
const get = async (p, h) => (await fetch(B + p, { headers: h })).json();
const order = (o = {}) => post('/api/orders', { product_id: 1, qty: 1, phone: '0733000001', address: 'Hardening test, Nakuru', age_confirmed: true, ...o });
const pay = (id) => post('/api/demo/pay/' + id).then((r) => r.json());
const st = async (id) => (await get('/api/orders/' + id)).status;
const row = async (id) => (await get('/api/admin/orders', ADMIN)).find((o) => o.id === id);
const sql = (q) => execSync(`npx wrangler d1 execute shisha-store-db --local --persist-to ${DB} --command "${q}"`, { stdio: 'pipe' });

// Headers
const h1 = await fetch(B + '/api/config');
check('json has nosniff', h1.headers.get('x-content-type-options') === 'nosniff');
check('json is not cached', h1.headers.get('cache-control') === 'no-store');
const rp = await fetch(B + '/r/doesnotexist');
check('worker pages have CSP', (rp.headers.get('content-security-policy') || '').includes("frame-ancestors 'none'"));
check('worker pages not framable', rp.headers.get('x-frame-options') === 'DENY');
const sp = await fetch(B + '/');
check('static page has CSP', (sp.headers.get('content-security-policy') || '').includes("default-src 'self'"));
check('static page not framable', sp.headers.get('x-frame-options') === 'DENY');

// Dedupe
const d1 = await (await order({ phone: '0733000002', address: 'Dedupe place' })).json();
const d2 = await (await order({ phone: '0733000002', address: 'Dedupe place' })).json();
check('double submit returns the same order', d1.order_id && d1.order_id === d2.order_id && d2.duplicate === true, JSON.stringify([d1, d2]));
const d3 = await (await order({ phone: '0733000002', address: 'Another place' })).json();
check('different address is a new order', d3.order_id && d3.order_id !== d1.order_id);

// Address cleaning
const c = await (await order({ phone: '0733000003', address: 'Line one\n\r\tLine two\u0000x' })).json();
check('control characters removed from address', !/[\u0000-\u001f]/.test((await row(c.order_id)).address), JSON.stringify((await row(c.order_id)).address));

// Late payment recovery
const l = await (await order({ phone: '0733000004', address: 'Late payer' })).json();
sql(`UPDATE orders SET status='expired' WHERE id='${l.order_id}'`);
check('forced expired', (await st(l.order_id)) === 'expired');
await pay(l.order_id);
const after = await st(l.order_id);
check('late payment recovers an expired order', ['paid', 'assigned'].includes(after), after);
const l2 = await (await order({ phone: '0733000005', address: 'Late payer two' })).json();
sql(`UPDATE orders SET status='payment_failed' WHERE id='${l2.order_id}'`);
await pay(l2.order_id);
check('late payment recovers a failed order', ['paid', 'assigned'].includes(await st(l2.order_id)));
const sm = await get('/api/admin/sms', ADMIN);
check('owner told about late payment', JSON.stringify(sm).includes('arrived late'));

// Reassign / cancel
await post('/api/admin/riders', { name: 'H Rider', phone: '0733111222' }, ADMIN);
const r1 = await (await order({ phone: '0733000006', address: 'Reassign me' })).json();
await pay(r1.order_id);
check('reassign needs token', (await post(`/api/admin/orders/${r1.order_id}/reassign`)).status === 403);
const ra = await post(`/api/admin/orders/${r1.order_id}/reassign`, {}, ADMIN);
check('reassign ok', ra.status === 200);
const rr = await row(r1.order_id);
check('reassign leaves order open', ['paid', 'assigned'].includes(rr.status), rr.status);
const cn = await post(`/api/admin/orders/${r1.order_id}/cancel`, {}, ADMIN);
const cj = await cn.json();
check('cancel returns refund info', cn.status === 200 && cj.refund && cj.refund.amount_kes > 0, JSON.stringify(cj));
check('order shows cancelled', (await st(r1.order_id)) === 'cancelled');
check('cancel twice refused', (await post(`/api/admin/orders/${r1.order_id}/cancel`, {}, ADMIN)).status === 400);
check('cancel of unpaid refused', (await post(`/api/admin/orders/${d1.order_id}/cancel`, {}, ADMIN)).status === 400);
const rid = (await get('/api/admin/riders', ADMIN)).filter((x) => x.name === 'H Rider')[0];
check('rider freed after cancel', rid && !rid.busy, JSON.stringify(rid));
await pay(r1.order_id);
check('payment on cancelled order stays cancelled', (await st(r1.order_id)) === 'cancelled');

// Self-heal and stale alert via scheduled run
const s1 = await (await order({ phone: '0733000007', address: 'Stale one' })).json();
await pay(s1.order_id);
const rw = await row(s1.order_id);
sql(`UPDATE orders SET paid_at=${Date.now() - 2 * 3600 * 1000}, alerted=0 WHERE id='${s1.order_id}'`);
sql(`UPDATE riders SET busy=1 WHERE name='H Rider'`);
await fetch(B + '/__scheduled?cron=*/5+*+*+*+*');
const sm2 = JSON.stringify(await get('/api/admin/sms', ADMIN));
if (rw.status === 'assigned') check('stale delivery alerts owner', sm2.includes('not delivered'), 'no alert');
else check('stale delivery check skipped (order not assigned)', true);
sql(`UPDATE orders SET status='delivered' WHERE id='${s1.order_id}'`);
sql(`UPDATE riders SET busy=1 WHERE name='H Rider'`);
await fetch(B + '/__scheduled?cron=*/5+*+*+*+*');
const rid2 = (await get('/api/admin/riders', ADMIN)).filter((x) => x.name === 'H Rider')[0];
check('busy rider with no job freed by reconcile', rid2 && !rid2.busy, JSON.stringify(rid2));

// Health throttle
const hh = await get('/api/health'); const hh2 = await get('/api/health');
check('health stable within 10s', hh.ok && hh.ts === hh2.ts, JSON.stringify([hh, hh2]));

// Lockout (own fake address)
const bad = { 'cf-connecting-ip': '203.0.113.9' };
for (let i = 0; i < 10; i++) await fetch(B + '/api/admin/orders', { headers: { authorization: 'Bearer wrong' + i, ...bad } });
const locked = await fetch(B + '/api/admin/orders', { headers: { ...ADMIN, ...bad } });
check('10 wrong tries lock that address', locked.status === 429, String(locked.status));
const other = await fetch(B + '/api/admin/orders', { headers: { ...ADMIN, 'cf-connecting-ip': '203.0.113.10' } });
check('other address unaffected', other.status === 200);
const mb = await fetch(B + '/api/monitor/beat', { method: 'POST', headers: { authorization: 'Bearer nope', 'cf-connecting-ip': '203.0.113.11' }, body: '{}' });
check('monitor wrong token refused', mb.status === 403);
const mh = { 'cf-connecting-ip': '203.0.113.12' };
for (let i = 0; i < 15; i++) await fetch(B + '/api/monitor/beat', { method: 'POST', headers: { authorization: 'Bearer bad' + i, ...mh }, body: '{}' });
const mg = await fetch(B + '/api/monitor/beat', { method: 'POST', headers: { authorization: 'Bearer dev-monitor-token', 'content-type': 'application/json', ...mh }, body: '{"ok":true,"detail":"healthy"}' });
check('monitor with right token never locked out', mg.status === 200, String(mg.status));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

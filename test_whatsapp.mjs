// Gear + WhatsApp. Needs a fresh DB (schema.sql) and: --var RIDER_MODE:real ORDER_LIMIT_10MIN:1000 OPEN_HOUR:0 CLOSE_HOUR:24 WHATSAPP_NUMBER:254700000099
// and .dev.vars with WA_VERIFY_TOKEN=verify-me WA_APP_SECRET=app-secret ADMIN_TOKEN=dev-admin-token
import { createHmac } from 'node:crypto';
const B = 'http://localhost:8787';
const ADMIN = { authorization: 'Bearer dev-admin-token' };
let pass = 0, fail = 0;
const check = (n, c, x = '') => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  ' + x)); };
const getJ = async (p, h) => (await fetch(B + p, { headers: h })).json();
const sign = (raw) => 'sha256=' + createHmac('sha256', 'app-secret').update(raw).digest('hex');
let mid = 0;
const hook = (from, text, { badSig = false, id } = {}) => {
  const raw = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ from, id: id || 'wamid.T' + Date.now() + '_' + mid++, type: 'text', text: { body: text } }] } }] }] });
  return fetch(B + '/api/whatsapp/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': badSig ? 'sha256=00' : sign(raw) }, body: raw });
};
const wa = () => getJ('/api/admin/whatsapp', ADMIN);

// ---- gear on the menu ----
const fl = await getJ('/api/flavors');
const gear = fl.filter((f) => f.sizes.some((s) => s.size === 'gear'));
check('gear items are on the shop menu', gear.length >= 4 && gear.some((f) => f.name === 'Hookah'), JSON.stringify(gear.map((g) => g.name)));
check('flavours still have samples and packets', fl.filter((f) => f.sizes.some((s) => s.size === 'packet')).length >= 4);
const hookah = gear.find((f) => f.name === 'Hookah');
const o = await (await fetch(B + '/api/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ product_id: hookah.sizes[0].product_id, qty: 1, phone: '0715000001', address: 'Gear test, Kabarak', age_confirmed: true }) })).json();
check('a hookah can be ordered at the database price', o.order_id && o.total_kes >= 3500, JSON.stringify(o));

// ---- config ----
const cfg = await getJ('/api/config');
check('config exposes the WhatsApp number for the icon', cfg.whatsapp === '254700000099', JSON.stringify(cfg.whatsapp));

// ---- webhook verification ----
check('verify: right token echoes the challenge', await (await fetch(B + '/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=12345')).text() === '12345');
check('verify: wrong token refused', (await fetch(B + '/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=1')).status === 403);
check('post: bad signature refused', (await hook('254715000002', 'menu', { badSig: true })).status === 403);
check('post: missing signature refused', (await fetch(B + '/api/whatsapp/webhook', { method: 'POST', body: '{}' })).status === 403);

// ---- bot ----
const last = async () => (await wa())[0];
check('post: valid signature accepted', (await hook('254715000002', 'menu')).status === 200);
let r = await last();
check('MENU replies with flavours, gear and prices', r && r.to_phone === '254715000002' && /Double Apple/.test(r.body) && /Hookah KSh 3,500/.test(r.body) && /Packets/.test(r.body), r && r.body);
await hook('254715000002', 'How much is delivery?'); r = await last();
check('delivery question answered', /km of Kabarak/.test(r.body), r.body);
await hook('254715000002', 'what time do you open'); r = await last();
check('hours answered', /We take orders from .* to midnight/.test(r.body), r.body);
await hook('254715000002', 'can i pay by mpesa'); r = await last();
check('payment answered and never asks for a PIN', /never ask for your PIN/.test(r.body), r.body);
await hook('254715000002', 'asdfgh'); r = await last();
check('unknown text gets the help line', /Sorry, I did not get that/.test(r.body), r.body);
await hook('254715000002', 'status'); r = await last();
check('STATUS with no orders says so', /no orders for this number/.test(r.body), r.body);
await hook('254715000001', 'my order status'); r = await last();
check('STATUS shows the sender\'s own order only', /Hookah/.test(r.body) && r.to_phone === '254715000001', r.body);

// ---- idempotency ----
const n0 = (await wa()).length;
await hook('254715000003', 'menu', { id: 'wamid.SAME' }); await hook('254715000003', 'menu', { id: 'wamid.SAME' });
check('a retried message id is answered once', (await wa()).length === n0 + 1);

// ---- blocked numbers get no reply ----
await fetch(B + '/api/admin/blocked', { method: 'POST', headers: { 'content-type': 'application/json', ...ADMIN }, body: JSON.stringify({ phone: '0715000009' }) });
const n1 = (await wa()).length;
await hook('254715000009', 'menu');
check('blocked number gets no WhatsApp reply', (await wa()).length === n1);

// ---- admin ----
check('whatsapp log needs the admin token', (await fetch(B + '/api/admin/whatsapp')).status === 403);
const pc = await getJ('/api/admin/payments/check', ADMIN);
check('payments check lists what is missing in mock/daraja setup', Array.isArray(pc.missing) && pc.missing.includes('DARAJA_KEY') && pc.ready === false, JSON.stringify(pc));
check('payments check needs the admin token', (await fetch(B + '/api/admin/payments/check')).status === 403);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

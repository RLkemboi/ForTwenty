// Hookah rentals. Needs a fresh DB (schema.sql) and a dev server started with:
//   npx wrangler dev --local --port 8787 --var RIDER_MODE:real ORDER_LIMIT_10MIN:1000 DEDUPE_SECONDS:0 DELIVERY_FALLBACK_KES:0 OPEN_HOUR:0 CLOSE_HOUR:24
// and .dev.vars with WA_VERIFY_TOKEN=verify-me WA_APP_SECRET=app-secret ADMIN_TOKEN=dev-admin-token
import { createHmac } from 'node:crypto';
const B = 'http://localhost:8787';
const ADMIN = { authorization: 'Bearer dev-admin-token' };
let pass = 0, fail = 0;
const check = (n, c, x = '') => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  ' + x)); };
const getJ = async (p, h) => (await fetch(B + p, { headers: h })).json();
const sign = (raw) => 'sha256=' + createHmac('sha256', 'app-secret').update(raw).digest('hex');
const hook = (from, text) => {
  const raw = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ from, id: 'wamid.R' + Date.now(), type: 'text', text: { body: text } }] } }] }] });
  return fetch(B + '/api/whatsapp/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(raw) }, body: raw });
};

// ---- on the menu ----
const fl = await getJ('/api/flavors');
const want = [['Small hookah', 800, '#c2410c'], ['Medium hookah', 1200, '#1b7f5a'], ['Large hookah', 1800, '#5b3a9a']];
for (const [name, price, color] of want) {
  const f = fl.find((x) => x.name === name);
  check(`${name} is on the menu with one 'night' size at KSh ${price}`, f && f.sizes.length === 1 && f.sizes[0].size === 'night' && f.sizes[0].price_kes === price && f.color === color, JSON.stringify(f));
}
const idx = (n) => fl.findIndex((x) => x.name === n);
check('rentals sort after flavours and before gear', idx('Large hookah') > idx('Double Apple') && idx('Large hookah') < idx('Hookah'), JSON.stringify(fl.map((f) => f.name)));

// ---- ordering: quantity is nights ----
const med = fl.find((f) => f.name === 'Medium hookah');
const o = await (await fetch(B + '/api/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ product_id: med.sizes[0].product_id, qty: 3, phone: '0716000001', address: 'Rental test, Kabarak', age_confirmed: true }) })).json();
check('3 nights of Medium hookah charges 3 x 1200 (zero delivery fee)', o.order_id && o.total_kes === 3600, JSON.stringify(o));

// ---- WhatsApp menu ----
check('post: menu accepted', (await hook('254716000002', 'menu')).status === 200);
const r = (await getJ('/api/admin/whatsapp', ADMIN))[0];
check('MENU has the rental section with prices', r && /Hookah rental \(per night\)/.test(r.body) && /Small hookah KSh 800/.test(r.body) && /Medium hookah KSh 1,200/.test(r.body) && /Large hookah KSh 1,800/.test(r.body), r && r.body);
check('MENU still has Samples, Packets and gear', r && /Samples/.test(r.body) && /Packets/.test(r.body) && /Hookah gear/.test(r.body) && /Hookah KSh 3,500/.test(r.body), r && r.body);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// Needs: dev server with RIDER_MODE:real, zero-fee vars, ORDER_LIMIT_10MIN:1000, DEDUPE_SECONDS:0
const B = 'http://localhost:8787';
const ADMIN = { authorization: 'Bearer dev-admin-token' };
let pass = 0, fail = 0;
const check = (n, c, x = '') => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  ' + x)); };
const post = (p, b, h = ADMIN) => fetch(B + p, { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(b || {}) });
const getJ = async (p, h) => (await fetch(B + p, { headers: h })).json();
let n = 0;
const order = (o = {}) => post('/api/orders', { product_id: 1, qty: 1, phone: '07140000' + String(10 + n++), address: 'Menu test, Kabarak', age_confirmed: true, ...o }, {});
const pay = (id) => post('/api/demo/pay/' + id, {}, {});

check('menu needs token', (await fetch(B + '/api/admin/menu')).status === 403);
check('menu write needs token', (await post('/api/admin/menu/flavor', { name: 'X' }, {})).status === 403);
check('export needs token', (await fetch(B + '/api/admin/export?from=2026-01-01&to=2026-01-02')).status === 403);

const menu0 = await getJ('/api/admin/menu', ADMIN);
check('menu lists the seeded flavors with sizes', menu0.length >= 4 && menu0[0].products.length === 2, JSON.stringify(menu0[0]));

// Create
check('empty name refused', (await post('/api/admin/menu/flavor', { name: ' ', sizes: [{ size: 'a', price_kes: 100 }] })).status === 400);
check('no sizes refused', (await post('/api/admin/menu/flavor', { name: 'Peach', sizes: [] })).status === 400);
check('price 5 refused', (await post('/api/admin/menu/flavor', { name: 'Peach', sizes: [{ size: 'a', price_kes: 5 }] })).status === 400);
check('price 1.5 refused', (await post('/api/admin/menu/flavor', { name: 'Peach', sizes: [{ size: 'a', price_kes: 99.5 }] })).status === 400);
check('price huge refused', (await post('/api/admin/menu/flavor', { name: 'Peach', sizes: [{ size: 'a', price_kes: 999999 }] })).status === 400);
const cr = await (await post('/api/admin/menu/flavor', { name: 'Peach <b>Ice</b>', blurb: 'Soft\nand sweet', color: '#ff8800', sizes: [{ size: 'sample', price_kes: 120 }, { size: 'packet', price_kes: 700 }] })).json();
check('flavor created', cr.ok && cr.id > 0, JSON.stringify(cr));
check('duplicate name refused (any case)', (await post('/api/admin/menu/flavor', { name: 'peach b ice /b', sizes: [{ size: 'a', price_kes: 100 }] })).status === 400);
const menu1 = await getJ('/api/admin/menu', ADMIN);
const peach = menu1.find((f) => f.id === cr.id);
check('angle brackets and newlines cleaned', peach && !/[<>\n]/.test(peach.name + peach.blurb), JSON.stringify(peach));
check('two products made with the right names', peach.products.length === 2 && peach.products.every((p) => p.name.startsWith(peach.name + ', ')), JSON.stringify(peach.products));
const shop1 = await getJ('/api/flavors');
check('new flavor shows in the shop', shop1.some((f) => f.id === cr.id && f.sizes.length === 2));

// Price change applies to new orders only
const sample = peach.products.find((p) => p.size === 'sample'), packet = peach.products.find((p) => p.size === 'packet');
const o1 = await (await order({ product_id: sample.id, qty: 2 })).json();
check('order uses the current price', o1.total_kes === 240, JSON.stringify(o1));
check('bad price refused', (await post('/api/admin/menu/product/' + sample.id, { price_kes: 0 })).status === 400);
check('text price refused', (await post('/api/admin/menu/product/' + sample.id, { price_kes: 'abc' })).status === 400);
check('price updated', (await post('/api/admin/menu/product/' + sample.id, { price_kes: 150 })).status === 200);
const o2 = await (await order({ product_id: sample.id, qty: 2 })).json();
check('new order uses the new price', o2.total_kes === 300, JSON.stringify(o2));
const old = await getJ('/api/orders/' + o1.order_id);
check('earlier order keeps its price', old.total_kes === 240, JSON.stringify(old));

// Hide a size, then a whole flavor
await post('/api/admin/menu/product/' + packet.id, { active: 0 });
check('hidden size gone from shop', !(await getJ('/api/flavors')).find((f) => f.id === cr.id).sizes.some((z) => z.product_id === packet.id));
check('hidden size cannot be ordered', (await order({ product_id: packet.id })).status === 400);
await post('/api/admin/menu/product/' + packet.id, { active: 1 });
await post('/api/admin/menu/flavor/' + cr.id, { active: 0 });
check('hidden flavor gone from shop', !(await getJ('/api/flavors')).some((f) => f.id === cr.id));
check('hidden flavor cannot be ordered', (await order({ product_id: sample.id })).status === 400);
check('hidden flavor still in admin', (await getJ('/api/admin/menu', ADMIN)).some((f) => f.id === cr.id && f.active === 0));
await post('/api/admin/menu/flavor/' + cr.id, { active: 1 });
check('shown again, orderable', (await order({ product_id: sample.id })).status === 200);

// Rename and add size
const rn = await post('/api/admin/menu/flavor/' + cr.id, { name: 'Peach Ice' });
check('rename ok', rn.status === 200);
check('rename updates product names', (await getJ('/api/admin/menu', ADMIN)).find((f) => f.id === cr.id).products.every((p) => p.name.startsWith('Peach Ice, ')));
check('bad colour refused', (await post('/api/admin/menu/flavor/' + cr.id, { color: 'red' })).status === 400);
check('rename to an existing name refused', (await post('/api/admin/menu/flavor/' + cr.id, { name: 'mint' })).status === 400);
check('add size ok', (await post('/api/admin/menu/flavor/' + cr.id + '/size', { size: 'jumbo', price_kes: 1500 })).status === 200);
check('duplicate size refused', (await post('/api/admin/menu/flavor/' + cr.id + '/size', { size: 'JUMBO', price_kes: 1500 })).status === 400);
check('unknown flavor 404', (await post('/api/admin/menu/flavor/99999', { name: 'x' })).status === 404);
check('unknown product 404', (await post('/api/admin/menu/product/99999', { price_kes: 100 })).status === 404);

// Export: needs a delivered order
await post('/api/admin/riders', { name: 'Export Rider', phone: '0714999111' });
const eo = await (await order({ product_id: sample.id, address: '=HYPERLINK("http://x","y"), Kabarak', phone: '0714999222' })).json();
await pay(eo.order_id);
const sms = await getJ('/api/admin/sms', ADMIN);
const tok = sms.map((m) => (m.body.match(/\/d\/([a-z0-9]+)/) || [])[1]).filter(Boolean).pop();
if (tok) await fetch(B + '/api/deliver/' + tok, { method: 'POST' });
const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
const ex = await fetch(B + `/api/admin/export?type=orders&from=${today}&to=${today}`, { headers: ADMIN });
const csv = await ex.text();
check('export is a csv download', ex.status === 200 && /text\/csv/.test(ex.headers.get('content-type')) && /attachment/.test(ex.headers.get('content-disposition')), ex.headers.get('content-type'));
check('export has header and rows', csv.includes('Order,Placed,Paid,Delivered') && csv.split('\r\n').length > 5);
check('formula in address is neutralised', csv.includes(`"'=HYPERLINK`) && !/,=HYPERLINK/.test(csv), csv.slice(0, 400));
check('export includes the order id', csv.includes(eo.order_id));
const pr = await (await fetch(B + `/api/admin/export?type=payouts&from=${today}&to=${today}`, { headers: ADMIN })).text();
check('payouts header', pr.includes('Date,Rider,Deliveries,Owed (KSh)'));
check('payouts has a rider row when delivered', !tok || /Export Rider|Demo rider|Test Rider/.test(pr) || pr.split('\r\n').length > 2, pr);
check('bad dates refused', (await fetch(B + '/api/admin/export?from=abc&to=2026-01-01', { headers: ADMIN })).status === 400);
check('end before start refused', (await fetch(B + '/api/admin/export?from=2026-02-01&to=2026-01-01', { headers: ADMIN })).status === 400);
check('range over a year refused', (await fetch(B + '/api/admin/export?from=2024-01-01&to=2026-01-01', { headers: ADMIN })).status === 400);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

// Delivery pricing. Needs a fresh DB and: --var SMS_MODE:mock RIDER_MODE:offers ORDER_LIMIT_10MIN:1000 OPEN_HOUR:0 CLOSE_HOUR:24  (default pricing values)
const B = 'http://localhost:8787';
const ADMIN = { authorization: 'Bearer dev-admin-token' };
let pass = 0, fail = 0;
const check = (n, c, x = '') => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  ' + x)); };
const post = (p, b, h = {}) => fetch(B + p, { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(b || {}) });
const getJ = async (p, h) => (await fetch(B + p, { headers: h })).json();
let n = 0;
const order = (over) => post('/api/orders', { product_id: 1, qty: 1, phone: '07130000' + String(10 + n++), address: 'Pricing test street', age_confirmed: true, ...over });

const SHOP = [-0.1671, 35.966];
const q = (lat, lng) => getJ('/api/quote' + (lat === undefined ? '' : `?lat=${lat}&lng=${lng}`));

let r = await q();
check('no pin = flat fallback fee 150', r.fee_kes === 150 && r.pinned === false, JSON.stringify(r));
r = await q(...SHOP);
check('pin at the shop = minimum fee 100', r.fee_kes === 100 && r.km === 0 && r.ok === true, JSON.stringify(r));
r = await q(SHOP[0] + 0.0225, SHOP[1]);   // about 2.5 km straight north = 3.2 road km
check('about 2.5 km straight = 3.2 road km = KSh 140', r.ok && r.km >= 3.1 && r.km <= 3.3 && r.fee_kes === 140, JSON.stringify(r));
r = await q(SHOP[0] + 0.0265, SHOP[1]);   // about 2.9 km straight, just inside
check('just inside 3 km straight is served', r.ok && r.fee_kes > 140 && r.fee_kes % 10 === 0, JSON.stringify(r));
r = await q(SHOP[0] + 0.0335, SHOP[1]);   // about 3.7 km straight
check('beyond 3 km straight is out of range', r.ok === false && r.straight_km > 3, JSON.stringify(r));
check('quote outside the delivery area is refused', (await fetch(B + '/api/quote?lat=10&lng=10')).status === 400);
check('quote with junk is refused', (await fetch(B + '/api/quote?lat=abc&lng=1')).status === 400);

// An order's total includes the server-side fee, whatever the browser claims
const price = (await getJ('/api/products'))[0].price_kes;
const near = await (await order({ lat: SHOP[0] + 0.0225, lng: SHOP[1], qty: 2, delivery_fee_kes: 1, total_kes: 1 })).json();
check('order total = items + fee (browser cannot set it)', near.total_kes === price * 2 + 140, JSON.stringify(near));
const nopin = await (await order({})).json();
check('order without a pin pays the flat fee', nopin.total_kes === price + 150, JSON.stringify(nopin));
const far = await order({ lat: SHOP[0] + 0.0335, lng: SHOP[1] });
const farBody = await far.json();
check('order beyond range is refused', far.status === 400 && /km/.test(farBody.error), JSON.stringify(farBody));

// The rider is paid the fee
await post('/api/demo/pay/' + near.order_id, {});
const rs = await getJ('/api/admin/riders', ADMIN);
const rider = rs[0];
let st = await getJ('/api/rider/' + rider.token + '/state');
check('offer shows the rider earns the fee (KSh 140)', st.offer && st.offer.cut_kes === 140, JSON.stringify(st.offer));
await post('/api/rider/' + rider.token + '/accept', { order_id: near.order_id });
await post('/api/rider/' + rider.token + '/deliver', { order_id: near.order_id });
st = await getJ('/api/rider/' + rider.token + '/state');
check('owed to rider = the delivery fee', st.owed_kes === 140 && st.today.earned_kes === 140, JSON.stringify(st));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

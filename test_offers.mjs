// Driver page + offers. Needs a fresh DB and: --var SMS_MODE:mock RIDER_MODE:offers OFFER_SECONDS:3 ROUND_PAUSE_SECONDS:3 ORDER_LIMIT_10MIN:1000
const B = 'http://localhost:8787';
const ADMIN = { authorization: 'Bearer dev-admin-token' };
let pass = 0, fail = 0;
const check = (n, c, x = '') => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  ' + x)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const post = (p, b, h = {}) => fetch(B + p, { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(b || {}) });
const getJ = async (p, h) => (await fetch(B + p, { headers: h })).json();
const state = (t) => getJ('/api/rider/' + t + '/state');
const act = async (t, a, b) => { const r = await post('/api/rider/' + t + '/' + a, b); return { status: r.status, j: await r.json() }; };
const st = async (id) => (await getJ('/api/orders/' + id)).status;
const sms = () => getJ('/api/admin/sms', ADMIN);
let phoneN = 0;
async function paidOrder() {
  const r = await (await post('/api/orders', { product_id: 1, qty: 1, phone: '07120001' + String(10 + phoneN++).padStart(2, '0'), address: 'Offer test building', age_confirmed: true })).json();
  await post('/api/demo/pay/' + r.order_id, {});
  return r;
}

const rs = await getJ('/api/admin/riders', ADMIN);
const [r1, r2] = rs;
check('riders have private links', r1.link.includes('/r/' + r1.token) && r1.token && r1.token !== r2.token, JSON.stringify(rs));
check('rider page loads', (await fetch(B + '/r/' + r1.token)).status === 200 && /Hi Demo rider 1/.test(await (await fetch(B + '/r/' + r1.token)).text()));
check('unknown rider page 404', (await fetch(B + '/r/nope')).status === 404);
check('unknown rider state 404', (await fetch(B + '/api/rider/nope/state')).status === 404);

// Order A is offered to rider 1 only
const A = await paidOrder();
check('paid order is not assigned yet', (await st(A.order_id)) === 'paid');
let s1 = await state(r1.token), s2 = await state(r2.token);
check('rider 1 holds the offer', s1.offer && s1.offer.id === A.order_id, JSON.stringify(s1));
check('offer shows the rider cut (10%)', s1.offer && s1.offer.cut_kes === Math.round(A.total_kes * 0.1), JSON.stringify(s1.offer));
check('rider 2 sees no offer', s2.offer === null);
check('offer SMS sent to rider 1', (await sms()).some((m) => m.to_phone === r1.phone && /New delivery offer/.test(m.body) && m.body.includes('/r/' + r1.token)));
check('rider 2 cannot accept it', (await act(r2.token, 'accept', { order_id: A.order_id })).status === 409);

// Decline -> next rider
check('rider 1 declines', (await act(r1.token, 'decline', { order_id: A.order_id })).status === 200);
s2 = await state(r2.token);
check('offer passes to rider 2', s2.offer && s2.offer.id === A.order_id, JSON.stringify(s2));
check('rider 1 no longer holds it', (await state(r1.token)).offer === null);

// Nobody answers -> offer lapses, everyone has had a turn, pause, then goes round again
await sleep(3500);
s1 = await state(r1.token); s2 = await state(r2.token);
check('lapsed offer leaves no one holding it', s1.offer === null && s2.offer === null, JSON.stringify([s1.offer, s2.offer]));
check('order stays paid, not given up', (await st(A.order_id)) === 'paid');
await sleep(3500);
s1 = await state(r1.token);
check('after the pause it is offered again (second round)', s1.offer && s1.offer.id === A.order_id, JSON.stringify(s1));

// Accept
check('rider 1 accepts', (await act(r1.token, 'accept', { order_id: A.order_id })).status === 200);
check('order assigned to rider 1', (await st(A.order_id)) === 'assigned');
s1 = await state(r1.token);
check('active delivery shown with customer phone and map flag', s1.active && s1.active.id === A.order_id && /^254/.test(s1.active.phone) && s1.busy === true, JSON.stringify(s1));
check('details SMS sent on accept', (await sms()).some((m) => m.to_phone === r1.phone && /Call customer/.test(m.body)));
check('second accept of same order refused', (await act(r1.token, 'accept', { order_id: A.order_id })).status === 409);

// Order B: busy rider 1 is skipped; going off duty drops the offer
const Bo = await paidOrder();
s2 = await state(r2.token);
check('busy rider skipped; B offered to rider 2', s2.offer && s2.offer.id === Bo.order_id && (await state(r1.token)).offer === null, JSON.stringify(s2));
await act(r2.token, 'duty', { on: false });
check('off duty drops the held offer', (await state(r2.token)).offer === null && (await st(Bo.order_id)) === 'paid');
check('off duty shown', (await state(r2.token)).on_duty === false);
await act(r2.token, 'duty', { on: true });
await sleep(3500);
s2 = await state(r2.token);
check('on duty again -> offered after the pause', s2.offer && s2.offer.id === Bo.order_id, JSON.stringify(s2));

// Deliver A from the page
check('deliver needs the right rider', (await act(r2.token, 'deliver', { order_id: A.order_id })).status === 404);
check('rider 1 marks A delivered', (await act(r1.token, 'deliver', { order_id: A.order_id })).status === 200);
s1 = await state(r1.token);
check('A delivered, rider 1 free, day totals updated', (await st(A.order_id)) === 'delivered' && s1.busy === false && s1.today.deliveries === 1 && s1.today.earned_kes === Math.round(A.total_kes * 0.1) && s1.owed_kes === Math.round(A.total_kes * 0.1), JSON.stringify(s1));
check('customer told it was delivered', (await sms()).some((m) => /delivered/.test(m.body) && m.to_phone === '254712000110'));
check('rider 2 accepts B', (await act(r2.token, 'accept', { order_id: Bo.order_id })).status === 200 && (await st(Bo.order_id)) === 'assigned');
// the old per-order link still works
check('rider 2 busy list in admin', (await getJ('/api/admin/riders', ADMIN)).find((r) => r.id === r2.id).busy === 1);

// Admin: reset link
const rl = await (await post('/api/admin/riders/' + r1.id + '/reset-link', {}, ADMIN)).json();
check('reset link gives a new link', rl.ok && rl.link.includes('/r/') && !rl.link.endsWith(r1.token), JSON.stringify(rl));
check('old link stops working', (await fetch(B + '/api/rider/' + r1.token + '/state')).status === 404);
check('new link works', (await fetch(rl.link.replace(/^https?:\/\/[^/]+/, B).replace('/r/', '/api/rider/') + '/state')).status === 200);
check('reset needs admin token', (await post('/api/admin/riders/' + r1.id + '/reset-link', {})).status === 403);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

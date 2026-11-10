import { stkPush, queryStatus, checkPayments } from './payments.js';
import { sendSms, retryFailed } from './sms.js';
import { riderPage } from './riderPage.js';
import { normalizePhone, phoneList } from './phone.js';
import { verifySignature, processWebhook, notifyCustomer } from './whatsapp.js';

// Every response from the worker carries these. (Static pages get theirs from public/_headers.)
const SEC = { 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer', 'cache-control': 'no-store' };
const PAGE_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...SEC } });
const html = (body, status = 200) => new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': PAGE_CSP, ...SEC } });
// Compare secrets without stopping at the first wrong character (so response time reveals nothing).
const enc = new TextEncoder();
const safeEq = (a, b) => {
  const x = enc.encode(String(a)), y = enc.encode(String(b));
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] || 0) ^ (y[i] || 0);
  return d === 0;
};
const bearerOk = (req, secret) => !!secret && safeEq(req.headers.get('authorization') || '', 'Bearer ' + secret);
const clientIp = (req) => req.headers.get('cf-connecting-ip') || 'unknown';
// 10 wrong attempts from one address in 15 minutes locks that address out for the rest of the window.
async function isLocked(env, ip) {
  const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM auth_fail WHERE ip = ? AND ts > ?').bind(ip, Date.now() - 15 * 60 * 1000).first();
  return r.n >= 10;
}
const noteFail = (env, ip) => env.DB.prepare('INSERT INTO auth_fail (ip, ts) VALUES (?, ?)').bind(ip, Date.now()).run();
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const rid = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => ALPHABET[b % ALPHABET.length]).join('');

export { normalizePhone };

const mapLink = (lat, lng) => `https://maps.google.com/?q=${Number(lat).toFixed(6)},${Number(lng).toFixed(6)}`;

// Providers the store accepts right now. Airtel stays off in production until its account is approved.
const providersOn = (env) => String(env.ENABLED_PROVIDERS || 'mpesa').split(',').map((x) => x.trim()).filter(Boolean);

// Outer box around Kabarak (about 11 km each way). The real limit is DELIVERY_MAX_KM from the shop.
const AREA = { latMin: -0.27, latMax: -0.07, lngMin: 35.87, lngMax: 36.06 };

const alertOwners = (env, msg) => Promise.all(phoneList(env.ALERT_PHONES).map((n) => sendSms(env, n, msg, { force: true })));


// ---------- Driver offers (RIDER_MODE=offers) ----------
// A paid order is OFFERED to one free, on-duty rider at a time for 2 minutes. Accept = it is theirs.
// Decline or no answer = next rider. When every free rider has had a turn, pause a minute and go round again (never gives up).
const offerMs = (env) => Number(env.OFFER_SECONDS || 120) * 1000;        // how long one rider has to answer
const roundPauseMs = (env) => Number(env.ROUND_PAUSE_SECONDS || 60) * 1000; // wait before going round the riders again
const ALERT_AFTER_MS = 30 * 60 * 1000;
const idList = (x) => String(x || '').split(',').filter(Boolean).map(Number);
// The rider is paid the delivery fee. Old orders (fee 0) fall back to the percentage setting.
const riderCut = (env, o) => (Number(o.delivery_fee_kes) > 0 ? Number(o.delivery_fee_kes) : Math.round((Number(o.total_kes) * Number(env.RIDER_CUT_PCT || 0)) / 100));
const riderLink = (env, r) => env.PUBLIC_URL + '/r/' + r.token;
const detailsSms = (env, o) => `Delivery: ${o.address}.${o.lat != null ? ' Map: ' + mapLink(o.lat, o.lng) + '.' : ''} Call customer: +${o.phone}. Paid KSh ${o.total_kes}. Mark delivered: ${env.PUBLIC_URL}/d/${o.delivery_token}`;

async function offerOrder(env, orderId) {
  const now = Date.now();
  const o = await env.DB.prepare("SELECT id, address, total_kes, delivery_fee_kes, declined_by, retry_at FROM orders WHERE id = ? AND status = 'paid' AND rider_id IS NULL AND (offered_to IS NULL OR offer_expires <= ?)").bind(orderId, now).first();
  if (!o || (o.retry_at && o.retry_at > now)) return false;
  // Free = admin-enabled, on duty, not on a delivery, and not already holding another live offer.
  const free = (await env.DB.prepare("SELECT id, phone, token FROM riders r WHERE active = 1 AND on_duty = 1 AND busy = 0 AND NOT EXISTS (SELECT 1 FROM orders x WHERE x.offered_to = r.id AND x.status = 'paid' AND x.rider_id IS NULL AND x.offer_expires > ?) ORDER BY id").bind(now).all()).results;
  if (!free.length) return false;
  const declined = idList(o.declined_by);
  const pick = free.find((r) => !declined.includes(r.id));
  if (!pick) {
    await env.DB.prepare("UPDATE orders SET declined_by = '', offer_round = offer_round + 1, retry_at = ? WHERE id = ?").bind(now + roundPauseMs(env), o.id).run();
    return false;
  }
  const set = await env.DB.prepare("UPDATE orders SET offered_to = ?, offer_expires = ?, retry_at = NULL WHERE id = ? AND status = 'paid' AND rider_id IS NULL AND (offered_to IS NULL OR offer_expires <= ?)").bind(pick.id, now + offerMs(env), o.id, now).run();
  if (set.meta.changes !== 1) return false;
  await sendSms(env, pick.phone, `New delivery offer: ${o.address}. You earn KSh ${riderCut(env, o)}. Open within ${Math.round(offerMs(env) / 60000) || 1} min to accept: ${riderLink(env, pick)}`);
  return true;
}

// Called by the 5-minute job, by rider page refreshes, and after every delivery / duty change.
async function advanceQueue(env) {
  const now = Date.now();
  const lapsed = (await env.DB.prepare("SELECT id, offered_to, declined_by FROM orders WHERE status = 'paid' AND rider_id IS NULL AND offered_to IS NOT NULL AND offer_expires <= ?").bind(now).all()).results;
  for (const l of lapsed) {
    await env.DB.prepare("UPDATE orders SET declined_by = ?, offered_to = NULL, offer_expires = NULL WHERE id = ? AND offered_to = ?").bind([...idList(l.declined_by), l.offered_to].join(','), l.id, l.offered_to).run();
  }
  const waiting = (await env.DB.prepare("SELECT id, paid_at, alerted FROM orders WHERE status = 'paid' AND rider_id IS NULL AND offered_to IS NULL ORDER BY paid_at").all()).results;
  for (const q of waiting) {
    await offerOrder(env, q.id);
    if (!q.alerted && now - q.paid_at > ALERT_AFTER_MS) {
      const a = await env.DB.prepare('UPDATE orders SET alerted = 1 WHERE id = ? AND alerted = 0').bind(q.id).run();
      if (a.meta.changes === 1) await alertOwners(env, 'Paid order ' + q.id + ' has no rider after 30 minutes. Riders are still being offered it; check /admin.');
    }
  }
}

async function acceptOffer(env, rider, orderId) {
  const claim = await env.DB.prepare('UPDATE riders SET busy = 1 WHERE id = ? AND busy = 0').bind(rider.id).run();
  if (claim.meta.changes !== 1) return { error: 'Finish your current delivery first.', code: 409 };
  const set = await env.DB.prepare("UPDATE orders SET rider_id = ?, status = 'assigned', offered_to = NULL, offer_expires = NULL WHERE id = ? AND status = 'paid' AND rider_id IS NULL AND offered_to = ? AND offer_expires > ?").bind(rider.id, orderId, rider.id, Date.now()).run();
  if (set.meta.changes !== 1) {
    await env.DB.prepare('UPDATE riders SET busy = 0 WHERE id = ?').bind(rider.id).run();
    return { error: 'That offer expired or was taken.', code: 409 };
  }
  const o = await env.DB.prepare('SELECT address, phone, delivery_token, total_kes, lat, lng FROM orders WHERE id = ?').bind(orderId).first();
  await sendSms(env, rider.phone, detailsSms(env, o));
  return { ok: true };
}

async function declineOffer(env, rider, orderId) {
  const o = await env.DB.prepare("SELECT declined_by FROM orders WHERE id = ? AND status = 'paid' AND rider_id IS NULL AND offered_to = ?").bind(orderId, rider.id).first();
  if (!o) return false;
  await env.DB.prepare('UPDATE orders SET declined_by = ?, offered_to = NULL, offer_expires = NULL WHERE id = ?').bind([...idList(o.declined_by), rider.id].join(','), orderId).run();
  await offerOrder(env, orderId);
  return true;
}

// Shared by the old per-order link and the rider page.
async function completeDelivery(env, o) {
  const done = await env.DB.prepare("UPDATE orders SET status = 'delivered', delivered_at = ? WHERE id = ? AND status = 'assigned'").bind(Date.now(), o.id).run();
  if (done.meta.changes !== 1) return;
  await env.DB.prepare('INSERT OR IGNORE INTO ledger (order_id, rider_id, amount_kes, created_at) VALUES (?, ?, ?, ?)').bind(o.id, o.rider_id, riderCut(env, o), Date.now()).run();
  await env.DB.prepare('UPDATE riders SET busy = 0 WHERE id = ?').bind(o.rider_id).run();
  await notifyCustomer(env, o.phone, `Order ${o.id} delivered. Thank you.`, sendSms);
  await dispatchQueue(env);
}

// Gives waiting paid orders to riders, the way the current RIDER_MODE does it.
async function dispatchQueue(env) {
  if (env.RIDER_MODE === 'offers') return advanceQueue(env);
  const next = await env.DB.prepare("SELECT id FROM orders WHERE status = 'paid' AND rider_id IS NULL ORDER BY paid_at LIMIT 1").first();
  if (next) await assignRider(env, next.id);
}

const nairobiDayStart = () => { const t = Date.now() + 3 * 3600e3; return t - (t % 86400e3) - 3 * 3600e3; };

async function riderState(env, rider) {
  if (env.RIDER_MODE === 'offers') await advanceQueue(env);
  const now = Date.now();
  const fresh = await env.DB.prepare('SELECT id, name, on_duty, busy FROM riders WHERE id = ?').bind(rider.id).first();
  const offer = await env.DB.prepare("SELECT o.id, o.address, o.total_kes, o.delivery_fee_kes, o.lat, o.lng, o.offer_expires, p.name AS product, o.qty FROM orders o JOIN products p ON p.id = o.product_id WHERE o.offered_to = ? AND o.status = 'paid' AND o.rider_id IS NULL AND o.offer_expires > ? LIMIT 1").bind(rider.id, now).first();
  const active = await env.DB.prepare("SELECT o.id, o.address, o.phone, o.total_kes, o.delivery_fee_kes, o.lat, o.lng, o.qty, p.name AS product FROM orders o JOIN products p ON p.id = o.product_id WHERE o.rider_id = ? AND o.status = 'assigned' ORDER BY o.paid_at LIMIT 1").bind(rider.id).first();
  const start = nairobiDayStart();
  const day = await env.DB.prepare('SELECT COUNT(*) AS n FROM orders WHERE rider_id = ? AND status = \'delivered\' AND delivered_at >= ?').bind(rider.id, start).first();
  const earn = await env.DB.prepare('SELECT COALESCE(SUM(amount_kes), 0) AS k FROM ledger WHERE rider_id = ? AND created_at >= ?').bind(rider.id, start).first();
  const owed = await env.DB.prepare('SELECT COALESCE(SUM(amount_kes), 0) AS k FROM ledger WHERE rider_id = ? AND paid_out = 0').bind(rider.id).first();
  return {
    name: fresh.name, on_duty: !!fresh.on_duty, busy: !!fresh.busy, mode: env.RIDER_MODE,
    offer: offer ? { ...offer, cut_kes: riderCut(env, offer), seconds_left: Math.max(0, Math.round((offer.offer_expires - now) / 1000)), map: offer.lat != null ? mapLink(offer.lat, offer.lng) : null } : null,
    active: active ? { ...active, cut_kes: riderCut(env, active), map: active.lat != null ? mapLink(active.lat, active.lng) : null } : null,
    today: { deliveries: day.n, earned_kes: earn.k }, owed_kes: owed.k,
  };
}

async function assignRider(env, orderId) {
  if (env.RIDER_MODE === 'offers') return offerOrder(env, orderId);
  if (env.RIDER_MODE === 'demo') {
    // DEMO: finding a rider always succeeds. The first active rider takes every order and is never marked busy.
    const rider = await env.DB.prepare('SELECT id, phone FROM riders WHERE active = 1 ORDER BY id LIMIT 1').first();
    if (!rider) return false;
    const set = await env.DB.prepare("UPDATE orders SET rider_id = ?, status = 'assigned' WHERE id = ? AND status = 'paid' AND rider_id IS NULL").bind(rider.id, orderId).run();
    if (set.meta.changes !== 1) return false;
    const o = await env.DB.prepare('SELECT address, phone, delivery_token, total_kes, lat, lng FROM orders WHERE id = ?').bind(orderId).first();
    await sendSms(env, rider.phone, `Delivery: ${o.address}.${o.lat != null ? ' Map: ' + mapLink(o.lat, o.lng) + '.' : ''} Call customer: +${o.phone}. Paid KSh ${o.total_kes}. Mark delivered: ${env.PUBLIC_URL}/d/${o.delivery_token}`);
    return true;
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const rider = await env.DB.prepare('SELECT id, name, phone FROM riders WHERE active = 1 AND busy = 0 ORDER BY id LIMIT 1').first();
    if (!rider) {
      await alertOwners(env, 'No free rider for paid order ' + orderId + '. It is queued.');
      return false;
    }
    // Claim the rider atomically so two orders can never take the same rider.
    const claim = await env.DB.prepare('UPDATE riders SET busy = 1 WHERE id = ? AND busy = 0').bind(rider.id).run();
    if (claim.meta.changes !== 1) continue;
    const set = await env.DB.prepare("UPDATE orders SET rider_id = ?, status = 'assigned' WHERE id = ? AND status = 'paid' AND rider_id IS NULL").bind(rider.id, orderId).run();
    if (set.meta.changes !== 1) {
      await env.DB.prepare('UPDATE riders SET busy = 0 WHERE id = ?').bind(rider.id).run();
      return false;
    }
    const o = await env.DB.prepare('SELECT address, phone, delivery_token, total_kes, lat, lng FROM orders WHERE id = ?').bind(orderId).first();
    await sendSms(env, rider.phone, `Delivery: ${o.address}.${o.lat != null ? ' Map: ' + mapLink(o.lat, o.lng) + '.' : ''} Call customer: +${o.phone}. Paid KSh ${o.total_kes}. Mark delivered: ${env.PUBLIC_URL}/d/${o.delivery_token}`);
    return true;
  }
  return false;
}

async function markPaid(env, order, receipt) {
  // Only one caller can move an unpaid order to paid, so duplicate callbacks do nothing.
  // Money in is the truth: an order we had already marked failed or expired is still paid if the money really arrived late.
  const res = await env.DB.prepare("UPDATE orders SET status = 'paid', paid_at = ?, mpesa_receipt = ? WHERE id = ? AND status IN ('awaiting_payment', 'payment_failed', 'expired')").bind(Date.now(), receipt, order.id).run();
  if (res.meta.changes !== 1) return;
  if (order.status !== 'awaiting_payment') await alertOwners(env, `Order ${order.id}: payment arrived late (it was marked ${order.status}). It has been recovered and is being delivered.`);
  await notifyCustomer(env, order.phone, `Payment of KSh ${order.total_kes} received. Order ${order.id} is confirmed and is being assigned to a rider.`, sendSms);
  await assignRider(env, order.id);
}

// Handles a Safaricom callback body (real or simulated). Idempotent.
export async function processCallback(env, body) {
  const cb = body && body.Body && body.Body.stkCallback;
  if (!cb || !cb.CheckoutRequestID) return { ok: false, reason: 'bad_body' };
  const order = await env.DB.prepare('SELECT * FROM orders WHERE checkout_request_id = ?').bind(cb.CheckoutRequestID).first();
  if (!order) return { ok: false, reason: 'unknown_order' };
  const succeeded = Number(cb.ResultCode) === 0;
  if (succeeded && order.status === 'cancelled') { await alertOwners(env, `Order ${order.id} was cancelled but a payment of KSh ${order.total_kes} arrived. Refund it.`); return { ok: true, reason: 'paid_cancelled' }; }
  if (order.status !== 'awaiting_payment' && !(succeeded && ['payment_failed', 'expired'].includes(order.status))) return { ok: true, reason: 'already_processed' };
  if (!succeeded) {
    await env.DB.prepare("UPDATE orders SET status = 'payment_failed' WHERE id = ? AND status = 'awaiting_payment'").bind(order.id).run();
    return { ok: true, reason: 'payment_failed' };
  }
  const items = Object.fromEntries(((cb.CallbackMetadata && cb.CallbackMetadata.Item) || []).map((i) => [i.Name, i.Value]));
  if (Number(items.Amount) !== order.total_kes) {
    await env.DB.prepare("UPDATE orders SET status = 'amount_mismatch', mpesa_receipt = ? WHERE id = ? AND status IN ('awaiting_payment', 'payment_failed', 'expired')").bind(items.MpesaReceiptNumber || null, order.id).run();
    await alertOwners(env, `Order ${order.id}: paid ${items.Amount} but total is ${order.total_kes}. Check and refund or fix.`);
    return { ok: true, reason: 'amount_mismatch' };
  }
  await markPaid(env, order, items.MpesaReceiptNumber || null);
  return { ok: true, reason: 'paid' };
}

// Handles an Airtel Money callback. Idempotent. Airtel's body carries the transaction id and a status code:
// TS success, TF failed, TA ambiguous. We never trust the callback alone: success is re-checked with Airtel first.
export async function processAirtelCallback(env, body) {
  const t = body && body.transaction;
  if (!t || !t.id) return { ok: false, reason: 'bad_body' };
  const order = await env.DB.prepare("SELECT * FROM orders WHERE checkout_request_id = ? AND provider = 'airtel'").bind(String(t.id)).first();
  if (!order) return { ok: false, reason: 'unknown_order' };
  const aSuccess = t.status_code === 'TS';
  if (aSuccess && order.status === 'cancelled') { await alertOwners(env, `Order ${order.id} was cancelled but a payment of KSh ${order.total_kes} arrived. Refund it.`); return { ok: true, reason: 'paid_cancelled' }; }
  if (order.status !== 'awaiting_payment' && !(aSuccess && ['payment_failed', 'expired'].includes(order.status))) return { ok: true, reason: 'already_processed' };
  if (t.status_code === 'TF') {
    await env.DB.prepare("UPDATE orders SET status = 'payment_failed' WHERE id = ? AND status = 'awaiting_payment'").bind(order.id).run();
    return { ok: true, reason: 'payment_failed' };
  }
  if (t.status_code !== 'TS') return { ok: true, reason: 'pending' }; // the 5-minute job asks Airtel again
  let receipt = t.airtel_money_id || null;
  if (env.PAYMENTS_MODE !== 'mock') {
    const v = await queryStatus(env, order);
    if (!v || v.resultCode !== 0) return { ok: true, reason: 'unverified' };
    receipt = receipt || v.receipt;
  }
  await markPaid(env, order, receipt);
  return { ok: true, reason: 'paid' };
}

// ---------- Delivery price ----------
// Fee = base + per-km rate x road distance (straight line x ROAD_FACTOR) from the shop to the pin, rounded UP to DELIVERY_ROUND_KES,
// never below DELIVERY_MIN_KES. No pin = a flat fallback fee. The server works this out; the browser only displays it.
const num = (v, d) => (v === undefined || v === '' || !Number.isFinite(Number(v)) ? d : Number(v));
function haversineKm(lat1, lng1, lat2, lng2) {
  const r = (x) => (x * Math.PI) / 180, dLat = r(lat2 - lat1), dLng = r(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}
function deliveryQuote(env, lat, lng) {
  const round = Math.max(1, num(env.DELIVERY_ROUND_KES, 10));
  if (lat == null || lng == null) return { ok: true, km: null, fee_kes: Math.max(0, num(env.DELIVERY_FALLBACK_KES, 150)), pinned: false };
  const straight = haversineKm(num(env.SHOP_LAT, -0.1671), num(env.SHOP_LNG, 35.966), lat, lng);
  const km = straight * num(env.ROAD_FACTOR, 1.3); // road estimate, used for the fee
  const maxKm = num(env.DELIVERY_MAX_KM, 3);       // the delivery radius is measured in a straight line from the shop
  const raw = num(env.DELIVERY_BASE_KES, 50) + num(env.DELIVERY_PER_KM_KES, 25) * km;
  const fee = Math.max(num(env.DELIVERY_MIN_KES, 100), Math.ceil(raw / round) * round);
  return { ok: straight <= maxKm, km: Math.round(km * 10) / 10, straight_km: Math.round(straight * 10) / 10, fee_kes: fee, pinned: true, max_km: maxKm };
}

// ---------- Opening hours ----------
// Orders are taken from OPEN_HOUR to CLOSE_HOUR, Nairobi time (24 = midnight). The owner can also close the shop by hand from /admin.
const hourLabel = (h) => (h % 24 === 0 ? 'midnight' : (h % 12 || 12) + ':00 ' + (h < 12 ? 'am' : 'pm'));
async function shopStatus(env) {
  const open = Number(env.OPEN_HOUR ?? 8), close = Number(env.CLOSE_HOUR ?? 24);
  const hour = new Date(Date.now() + 3 * 3600e3).getUTCHours();
  const manual = await env.DB.prepare("SELECT value FROM settings WHERE key = 'closed'").first();
  if (manual && manual.value === '1') return { open: false, reason: 'manual', message: 'We are not taking orders right now. Please try again a little later.' };
  if (hour < open || hour >= close) return { open: false, reason: 'hours', message: `We are closed. We take orders from ${hourLabel(open)} to ${hourLabel(close)}. Please come back then.` };
  return { open: true, reason: null, message: '' };
}

async function createOrder(env, req) {
  let b;
  try { b = await req.json(); } catch { return json({ error: 'Invalid request' }, 400); }
  const shop = await shopStatus(env);
  if (!shop.open) return json({ error: shop.message, closed: true }, 403);
  if (b.age_confirmed !== true) return json({ error: 'You must confirm you are 18 or older.' }, 400);
  const phone = normalizePhone(b.phone);
  if (!phone) return json({ error: 'Enter a valid Kenyan phone number, like 0712345678.' }, 400);
  const isBlocked = await env.DB.prepare('SELECT 1 AS x FROM blocked_phones WHERE phone = ?').bind(phone).first();
  if (isBlocked) return json({ error: 'We are not able to take orders from this number.' }, 403);
  const provider = String(b.provider || 'mpesa');
  if (!providersOn(env).includes(provider)) return json({ error: 'That payment method is not available right now.' }, 400);
  let lat = null, lng = null;
  if (b.lat != null || b.lng != null) {
    lat = Number(b.lat); lng = Number(b.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return json({ error: 'The map pin is not valid. Please pin again.' }, 400);
    if (lat < AREA.latMin || lat > AREA.latMax || lng < AREA.lngMin || lng > AREA.lngMax) return json({ error: 'The map pin is outside our delivery area.' }, 400);
  }
  // With a map pin the landmark is optional; without one we need a written delivery spot.
  let address = String(b.address || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  if (!address && lat !== null) address = 'Map pin only (no landmark)';
  if (address.length < 5 || address.length > 200) return json({ error: 'Enter a delivery spot (5 to 200 characters), or pin your location on the map.' }, 400);
  const qty = Number(b.qty);
  if (!Number.isInteger(qty) || qty < 1 || qty > 10) return json({ error: 'Quantity must be 1 to 10.' }, 400);
  const product = await env.DB.prepare('SELECT id, price_kes FROM products WHERE id = ? AND active = 1 AND (flavor_id IS NULL OR flavor_id IN (SELECT id FROM flavors WHERE active = 1))').bind(Number(b.product_id)).first();
  if (!product) return json({ error: 'That item is not available.' }, 400);
  const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM orders WHERE phone = ? AND status = 'awaiting_payment' AND created_at > ?").bind(phone, Date.now() - 10 * 60 * 1000).first();
  if (recent.n >= 3) return json({ error: 'Too many unpaid orders. Please wait a few minutes.' }, 429);
  // Per-visitor limit: at most 5 orders of any kind from one IP, and 5 per phone, in 10 minutes (stops text spam).
  const ip = req.headers.get('cf-connecting-ip') || 'unknown';
  const since = Date.now() - 10 * 60 * 1000;
  const byIp = await env.DB.prepare('SELECT COUNT(*) AS n FROM orders WHERE ip = ? AND created_at > ?').bind(ip, since).first();
  const byPhone = await env.DB.prepare('SELECT COUNT(*) AS n FROM orders WHERE phone = ? AND created_at > ?').bind(phone, since).first();
  const cap = Number(env.ORDER_LIMIT_10MIN || 5);
  if (byIp.n >= cap || byPhone.n >= cap) return json({ error: 'Too many orders in a short time. Please wait a few minutes and try again.' }, 429);

  // Price comes from the database, never from the browser. The delivery fee is worked out here from the pin.
  const dq = deliveryQuote(env, lat, lng);
  if (!dq.ok) return json({ error: `That spot is about ${dq.straight_km} km away. We deliver within ${dq.max_km} km of Kabarak.` }, 400);
  const total = product.price_kes * qty + dq.fee_kes;
  // A double tap or a retried request must not send two payment prompts: an identical unpaid order from the last few seconds is returned instead.
  const dupMs = num(env.DEDUPE_SECONDS, 20) * 1000;
  if (dupMs > 0) {
    const dup = await env.DB.prepare("SELECT id, total_kes FROM orders WHERE phone = ? AND product_id = ? AND qty = ? AND total_kes = ? AND provider = ? AND address = ? AND status = 'awaiting_payment' AND created_at > ? ORDER BY created_at DESC LIMIT 1").bind(phone, product.id, qty, total, provider, address, Date.now() - dupMs).first();
    if (dup) return json({ order_id: dup.id, total_kes: dup.total_kes, duplicate: true });
  }
  const id = rid(10);
  await env.DB.prepare("INSERT INTO orders (id, product_id, qty, total_kes, phone, address, status, delivery_token, created_at, provider, lat, lng, ip, delivery_fee_kes, distance_km) VALUES (?, ?, ?, ?, ?, ?, 'awaiting_payment', ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, product.id, qty, total, phone, address, rid(24), Date.now(), provider, lat, lng, ip, dq.fee_kes, dq.km).run();
  try {
    const { checkoutRequestId } = await stkPush(env, { orderId: id, phone, amount: total, provider });
    await env.DB.prepare('UPDATE orders SET checkout_request_id = ? WHERE id = ?').bind(checkoutRequestId, id).run();
  } catch (e) {
    console.error('stkPush failed', provider, String(e && e.message).slice(0, 300)); // reason for the owner; never shown to the customer, never contains a secret
    await env.DB.prepare("UPDATE orders SET status = 'payment_failed' WHERE id = ?").bind(id).run();
    // Sandbox testing only: show the reason in the response so it can be read in the browser. Never in production.
    const detail = env.DARAJA_ENV !== 'production' && env.PAYMENTS_MODE === 'daraja' ? String(e && e.message).slice(0, 300) : undefined;
    return json({ error: 'Could not start the payment prompt. Nothing was charged. Please try again.', detail }, 502);
  }
  return json({ order_id: id, total_kes: total });
}

// The outside monitor reports in every ~5 minutes. If it goes quiet for 25 minutes we text once (GitHub paused it, or the site itself was down).
const MONITOR_STALE_MS = 25 * 60 * 1000;
async function watchMonitor(env) {
  const b = await env.DB.prepare('SELECT ts, stale_alerted FROM monitor_beat WHERE id = 1').first();
  if (!b || b.stale_alerted || Date.now() - b.ts < MONITOR_STALE_MS) return;
  await env.DB.prepare('UPDATE monitor_beat SET stale_alerted = 1 WHERE id = 1 AND stale_alerted = 0').run();
  await alertOwners(env, 'WARNING: the outside site monitor has not reported for ' + Math.round((Date.now() - b.ts) / 60000) + ' min. GitHub may have paused it. Check the Actions tab. Site down alerts are not being watched.');
}

async function reconcile(env) {
  await watchMonitor(env);
  const now = Date.now();
  const stale = await env.DB.prepare("SELECT * FROM orders WHERE status = 'awaiting_payment' AND created_at < ?").bind(now - 2 * 60 * 1000).all();
  for (const o of stale.results) {
    if (o.created_at < now - 30 * 60 * 1000) {
      await env.DB.prepare("UPDATE orders SET status = 'expired' WHERE id = ? AND status = 'awaiting_payment'").bind(o.id).run();
      continue;
    }
    if (!o.checkout_request_id) continue; // the payment prompt was never sent; it expires after 30 minutes
    try {
      const r = await queryStatus(env, o);
      if (!r) continue;
      if (r.resultCode === 0) await markPaid(env, o, r.receipt);
      else await env.DB.prepare("UPDATE orders SET status = 'payment_failed' WHERE id = ? AND status = 'awaiting_payment'").bind(o.id).run();
    } catch { /* try again next run */ }
  }
  await retryFailed(env);
  // Housekeeping: free a rider marked busy with no active delivery (a crash between two writes), and forget old failed-login records.
  await env.DB.prepare("UPDATE riders SET busy = 0 WHERE busy = 1 AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.rider_id = riders.id AND o.status = 'assigned')").run();
  await env.DB.prepare('DELETE FROM auth_fail WHERE ts < ?').bind(now - 24 * 3600 * 1000).run();
  // A delivery still open an hour after payment: tell the owner once.
  const slow = (await env.DB.prepare("SELECT id FROM orders WHERE status = 'assigned' AND paid_at < ? AND alerted < 2").bind(now - 60 * 60 * 1000).all()).results;
  for (const o of slow) {
    const a = await env.DB.prepare('UPDATE orders SET alerted = 2 WHERE id = ? AND alerted < 2').bind(o.id).run();
    if (a.meta.changes === 1) await alertOwners(env, `Order ${o.id} was paid over an hour ago and is not delivered. Check /admin and reassign or cancel it.`);
  }
  // Paid orders still waiting for a rider.
  if (env.RIDER_MODE === 'offers') await advanceQueue(env);
  else {
    const queued = await env.DB.prepare("SELECT id FROM orders WHERE status = 'paid' AND rider_id IS NULL ORDER BY paid_at").all();
    for (const q of queued.results) if (!(await assignRider(env, q.id))) break;
  }
}

const adminOk = (req, env) => bearerOk(req, env.ADMIN_TOKEN);

const esc = (x) => String(x == null ? '' : x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const deliveryPage = (o, token) => `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Delivery</title>
<link rel="stylesheet" href="/theme.css"><style>*{box-sizing:border-box}body{font-family:var(--body);max-width:440px;margin:0 auto;padding:20px 18px 40px;color:#fff;background:var(--bg)}h1{font:400 46px/1 var(--script);margin:6px 0 18px}.c{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:14px 16px;margin:10px 0}.c small{display:block;color:var(--dim);font:500 10px/1.3 var(--wide);letter-spacing:.12em;text-transform:uppercase;margin-bottom:6px}.c b{font:700 16px/1.4 var(--wide)}a.btn,button{display:block;width:100%;text-align:center;text-decoration:none;font:700 13px/1.2 var(--wide);letter-spacing:.02em;padding:17px;border-radius:999px;border:0;margin-top:12px;cursor:pointer}a.map{background:transparent;color:#fff;border:1px solid var(--line)}a.call{background:transparent;color:#fff;border:1px solid var(--line)}button{background:#fff;color:#000}button:disabled{opacity:.45}#m{font-size:15px;margin-top:14px;text-align:center;color:#e6e6e6}</style>
<body><h1>Delivery</h1>
<div class="c"><small>Order</small><b>${esc(o.product)} x ${esc(o.qty)}</b></div>
<div class="c"><small>Deliver to</small><b>${esc(o.address)}</b></div>
<div class="c"><small>Already paid</small><b>KSh ${esc(o.total_kes)}</b><br><small style="margin:6px 0 0">Do not collect cash.</small></div>
${o.lat != null ? `<a class="btn map" href="${mapLink(o.lat, o.lng)}">Open the pin in Maps</a>` : ''}
<a class="btn call" href="tel:+${esc(o.phone)}">Call customer +${esc(o.phone)}</a>
<button id="b">Mark delivered</button><p id="m" role="status"></p>
<script>b.onclick=async()=>{if(!confirm('Mark this order as delivered?'))return;b.disabled=true;const r=await fetch('/api/deliver/${token}',{method:'POST'});m.textContent=r.ok?'Done. Thank you.':'Could not save. Try again.';if(!r.ok)b.disabled=false};</script></html>`;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;
    try {
      // Public API only: Safaricom and Airtel callbacks, the health ping and the monitor are never limited, so they cannot be shut out.
      if (env.RL_API && env.RATE_LIMIT_OFF !== '1' && path.startsWith('/api/') && !/^\/api\/(health|monitor\/|mpesa\/callback|pay\/cb\/|airtel\/callback|whatsapp\/webhook)/.test(path)) {
        const { success } = await env.RL_API.limit({ key: clientIp(req) });
        if (!success) return new Response(JSON.stringify({ error: 'Too many requests. Please slow down.' }), { status: 429, headers: { 'content-type': 'application/json', 'retry-after': '30', ...SEC } });
      }
      if (path === '/api/health') {
        // Prove the database is writable, but at most once every 10 seconds so this public URL cannot be used to burn write quota.
        let r = await env.DB.prepare('SELECT ts FROM health WHERE id = 1').first();
        if (!r || Date.now() - r.ts > 10000) {
          await env.DB.prepare('INSERT OR REPLACE INTO health (id, ts) VALUES (1, ?)').bind(Date.now()).run();
          r = await env.DB.prepare('SELECT ts FROM health WHERE id = 1').first();
        }
        return json({ ok: !!r, ts: r && r.ts });
      }
      if (path === '/api/monitor/beat' && method === 'POST') {
        // No lockout here on purpose: a lockout could block the real monitor and look like an outage. The token is long and random.
        if (!bearerOk(req, env.MONITOR_TOKEN)) {
          // Say what arrived (never the real token) so a wrong setup in the outside monitor can be fixed in one try.
          const ah = req.headers.get('authorization') || '';
          return json({ error: 'Forbidden', server_has_token: !!env.MONITOR_TOKEN, header_received: !!ah, starts_with_bearer: /^Bearer /.test(ah), token_length_received: ah.replace(/^Bearer /, '').length, has_angle_brackets: /[<>]/.test(ah), has_outer_space_or_quote: /^Bearer .*[\s"']$|^Bearer ["']/.test(ah) }, 403);
        }
        const b = await req.json().catch(() => ({}));
        const prev = await env.DB.prepare('SELECT stale_alerted FROM monitor_beat WHERE id = 1').first();
        await env.DB.prepare('INSERT INTO monitor_beat (id, ts, ok, detail, stale_alerted) VALUES (1, ?, ?, ?, 0) ON CONFLICT(id) DO UPDATE SET ts = excluded.ts, ok = excluded.ok, detail = excluded.detail, stale_alerted = 0').bind(Date.now(), b.ok ? 1 : 0, String(b.detail || '').slice(0, 200)).run();
        if (prev && prev.stale_alerted) await alertOwners(env, 'The outside site monitor is reporting again.');
        return json({ ok: true });
      }
      // WhatsApp webhook. GET = Meta's one-time verification; POST = incoming messages, accepted only with a valid signature.
      if (path === '/api/whatsapp/webhook') {
        if (method === 'GET') {
          const ok = url.searchParams.get('hub.mode') === 'subscribe' && env.WA_VERIFY_TOKEN && safeEq(url.searchParams.get('hub.verify_token') || '', env.WA_VERIFY_TOKEN);
          return ok ? new Response(url.searchParams.get('hub.challenge') || '', { status: 200, headers: { 'content-type': 'text/plain', ...SEC } }) : json({ error: 'Forbidden' }, 403);
        }
        if (method === 'POST') {
          const raw = await req.text();
          if (!(await verifySignature(env, raw, req.headers.get('x-hub-signature-256')))) return json({ error: 'Forbidden' }, 403);
          let body = null; try { body = JSON.parse(raw); } catch { /* not JSON */ }
          await processWebhook(env, body);
          return json({ ok: true });
        }
      }

      if (path === '/api/config') return json({ shop: await shopStatus(env), center: { lat: num(env.SHOP_LAT, -0.1671), lng: num(env.SHOP_LNG, 35.966) }, payments_mode: env.PAYMENTS_MODE, whatsapp: String(env.WHATSAPP_NUMBER || '').replace(/\D/g, '') || null, pricing: { fallback_kes: Math.max(0, num(env.DELIVERY_FALLBACK_KES, 150)), max_km: num(env.DELIVERY_MAX_KM, 12) }, providers: providersOn(env), area: AREA });
      if (path === '/api/quote' && method === 'GET') {
        const la = url.searchParams.get('lat'), ln = url.searchParams.get('lng');
        if (la === null || ln === null) return json(deliveryQuote(env, null, null));
        const lat = Number(la), lng = Number(ln);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < AREA.latMin || lat > AREA.latMax || lng < AREA.lngMin || lng > AREA.lngMax) return json({ error: 'Pin is outside our delivery area.' }, 400);
        return json(deliveryQuote(env, lat, lng));
      }
      if (path === '/api/flavors' && method === 'GET') {
        const fl = (await env.DB.prepare('SELECT id, name, blurb, color FROM flavors WHERE active = 1 ORDER BY sort, id').all()).results;
        const pr = (await env.DB.prepare('SELECT id, flavor_id, size, price_kes FROM products WHERE active = 1 AND flavor_id IS NOT NULL ORDER BY price_kes').all()).results;
        return json(fl.map((f) => ({ ...f, sizes: pr.filter((p) => p.flavor_id === f.id).map((p) => ({ product_id: p.id, size: p.size, price_kes: p.price_kes })) })).filter((f) => f.sizes.length));
      }
      if (path === '/api/products' && method === 'GET') {
        const r = await env.DB.prepare('SELECT id, name, price_kes FROM products WHERE active = 1 AND (flavor_id IS NULL OR flavor_id IN (SELECT id FROM flavors WHERE active = 1)) ORDER BY id').all();
        return json(r.results);
      }
      if (path === '/api/orders' && method === 'POST') return await createOrder(env, req);

      let m = path.match(/^\/api\/orders\/([a-z0-9]+)$/);
      if (m && method === 'GET') {
        const o = await env.DB.prepare('SELECT id, status, total_kes, qty FROM orders WHERE id = ?').bind(m[1]).first();
        return o ? json(o) : json({ error: 'Not found' }, 404);
      }

      // Safaricom rejects callback URLs that contain the word "mpesa", so the URL we register is /api/pay/cb/<secret>. The old path stays working.
      m = path.match(/^\/api\/(?:mpesa\/callback|pay\/cb)\/(.+)$/);
      if (m && method === 'POST') {
        if (!env.CALLBACK_SECRET || !safeEq(m[1], env.CALLBACK_SECRET)) return json({ error: 'Forbidden' }, 403);
        await processCallback(env, await req.json().catch(() => null));
        return json({ ResultCode: 0, ResultDesc: 'Accepted' });
      }

      m = path.match(/^\/api\/airtel\/callback\/(.+)$/);
      if (m && method === 'POST') {
        if (!env.CALLBACK_SECRET || !safeEq(m[1], env.CALLBACK_SECRET)) return json({ error: 'Forbidden' }, 403);
        await processAirtelCallback(env, await req.json().catch(() => null));
        return json({ ok: true });
      }

      // Demo only: simulate the customer's phone while PAYMENTS_MODE is mock.
      m = path.match(/^\/api\/demo\/pay\/([a-z0-9]+)$/);
      if (m && method === 'POST' && env.PAYMENTS_MODE === 'mock') {
        const o = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(m[1]).first();
        if (!o) return json({ error: 'Not found' }, 404);
        const b = await req.json().catch(() => ({}));
        const result = Number(b.result || 0);
        if (o.provider === 'airtel') return json(await processAirtelCallback(env, { transaction: { id: o.checkout_request_id, status_code: result === 0 ? 'TS' : 'TF', message: 'mock' } }));
        const body = { Body: { stkCallback: { CheckoutRequestID: o.checkout_request_id, ResultCode: result, CallbackMetadata: result === 0 ? { Item: [{ Name: 'Amount', Value: b.amount !== undefined ? Number(b.amount) : o.total_kes }, { Name: 'MpesaReceiptNumber', Value: 'MOCK' + rid(7).toUpperCase() }] } : undefined } } };
        return json(await processCallback(env, body));
      }

      m = path.match(/^\/d\/([a-z0-9]+)$/);
      if (m && method === 'GET') {
        const o = await env.DB.prepare('SELECT o.address, o.phone, o.total_kes, o.status, o.lat, o.lng, o.qty, p.name AS product FROM orders o JOIN products p ON p.id = o.product_id WHERE o.delivery_token = ?').bind(m[1]).first();
        if (!o) return html('<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/theme.css"><body style="background:#050505;color:#ddd;margin:0"><p style="font:400 16px/1.6 var(--body);padding:28vh 24px 0;text-align:center">Link not found. Ask the shop for a new one.</p></body>', 404);
        return html(o.status === 'delivered' ? '<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/theme.css"><body style="background:#050505;color:#fff;margin:0"><p style="font:400 44px/1.1 var(--script);padding:28vh 24px 0;text-align:center">Already marked delivered. Thank you.</p></body>' : deliveryPage(o, m[1]));
      }

      m = path.match(/^\/api\/deliver\/([a-z0-9]+)$/);
      if (m && method === 'POST') {
        const o = await env.DB.prepare('SELECT * FROM orders WHERE delivery_token = ?').bind(m[1]).first();
        if (!o) return json({ error: 'Not found' }, 404);
        await completeDelivery(env, o);
        return json({ ok: true });
      }

      m = path.match(/^\/r\/([a-z0-9]+)$/);
      if (m && method === 'GET') {
        const r = await env.DB.prepare('SELECT name FROM riders WHERE token = ? AND active = 1').bind(m[1]).first();
        return r ? html(riderPage(m[1], r.name)) : html('<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/theme.css"><body style="background:#050505;color:#ddd;margin:0"><p style="font:400 16px/1.6 var(--body);padding:28vh 24px 0;text-align:center">Link not found. Ask the shop for a new one.</p></body>', 404);
      }
      m = path.match(/^\/api\/rider\/([a-z0-9]+)\/(state|duty|accept|decline|deliver)$/);
      if (m) {
        const rider = await env.DB.prepare('SELECT id, name, phone, token FROM riders WHERE token = ? AND active = 1').bind(m[1]).first();
        if (!rider) return json({ error: 'Link not found' }, 404);
        if (m[2] === 'state' && method === 'GET') return json(await riderState(env, rider));
        if (method !== 'POST') return json({ error: 'Not found' }, 404);
        const b = await req.json().catch(() => ({}));
        if (m[2] === 'duty') {
          const on = b.on ? 1 : 0;
          await env.DB.prepare('UPDATE riders SET on_duty = ? WHERE id = ?').bind(on, rider.id).run();
          if (!on) {
            const held = await env.DB.prepare("SELECT id FROM orders WHERE offered_to = ? AND status = 'paid' AND rider_id IS NULL").bind(rider.id).first();
            if (held) await declineOffer(env, rider, held.id);
          } else if (env.RIDER_MODE === 'offers') await advanceQueue(env);
          return json({ ok: true });
        }
        const orderId = String(b.order_id || '');
        if (m[2] === 'accept') {
          const r = await acceptOffer(env, rider, orderId);
          return r.ok ? json({ ok: true }) : json({ error: r.error }, r.code);
        }
        if (m[2] === 'decline') { await declineOffer(env, rider, orderId); return json({ ok: true }); }
        if (m[2] === 'deliver') {
          const o = await env.DB.prepare("SELECT * FROM orders WHERE id = ? AND rider_id = ? AND status = 'assigned'").bind(orderId, rider.id).first();
          if (!o) return json({ error: 'That delivery is not active.' }, 404);
          await completeDelivery(env, o);
          return json({ ok: true });
        }
      }

      if (path.startsWith('/api/admin/')) {
        const ip = clientIp(req);
        if (await isLocked(env, ip)) return json({ error: 'Too many wrong attempts. Try again in 15 minutes.' }, 429);
        if (!adminOk(req, env)) { await noteFail(env, ip); return json({ error: 'Forbidden' }, 403); }
        if (path === '/api/admin/orders') return json((await env.DB.prepare('SELECT o.id, o.status, o.total_kes, o.qty, o.phone, o.address, o.rider_id, o.mpesa_receipt, o.created_at, o.paid_at, o.delivered_at, o.offered_to, o.offer_round, o.provider, o.lat, o.lng, p.name AS product, r.name AS rider_name FROM orders o JOIN products p ON p.id = o.product_id LEFT JOIN riders r ON r.id = o.rider_id ORDER BY o.created_at DESC LIMIT 100').all()).results);
        if (path === '/api/admin/riders' && method === 'GET') return json((await env.DB.prepare('SELECT r.id, r.name, r.phone, r.active, r.busy, r.on_duty, r.token, COALESCE(SUM(CASE WHEN l.paid_out = 0 THEN l.amount_kes END), 0) AS owed_kes FROM riders r LEFT JOIN ledger l ON l.rider_id = r.id GROUP BY r.id').all()).results.map((r) => ({ ...r, link: riderLink(env, r) })));
        m = path.match(/^\/api\/admin\/riders\/(\d+)\/settle$/);
        if (m && method === 'POST') {
          await env.DB.prepare('UPDATE ledger SET paid_out = 1 WHERE rider_id = ? AND paid_out = 0').bind(Number(m[1])).run();
          return json({ ok: true });
        }
        if (path === '/api/admin/riders' && method === 'POST') {
          const b = await req.json().catch(() => ({}));
          const name = String(b.name || '').trim(), phone = normalizePhone(b.phone);
          if (name.length < 2 || name.length > 40) return json({ error: 'Name must be 2 to 40 characters.' }, 400);
          if (!phone) return json({ error: 'Enter a valid Kenyan phone number.' }, 400);
          const r = await env.DB.prepare('INSERT INTO riders (name, phone, token) VALUES (?, ?, ?)').bind(name, phone, rid(16)).run();
          return json({ ok: true, id: r.meta.last_row_id });
        }
        m = path.match(/^\/api\/admin\/riders\/(\d+)\/reset-link$/);
        if (m && method === 'POST') {
          const t = rid(16);
          const r = await env.DB.prepare('UPDATE riders SET token = ? WHERE id = ?').bind(t, Number(m[1])).run();
          return r.meta.changes === 1 ? json({ ok: true, link: env.PUBLIC_URL + '/r/' + t }) : json({ error: 'Not found' }, 404);
        }
        m = path.match(/^\/api\/admin\/riders\/(\d+)\/update$/);
        if (m && method === 'POST') {
          const b = await req.json().catch(() => ({}));
          const cur = await env.DB.prepare('SELECT * FROM riders WHERE id = ?').bind(Number(m[1])).first();
          if (!cur) return json({ error: 'Not found' }, 404);
          const name = b.name === undefined ? cur.name : String(b.name).trim();
          const phone = b.phone === undefined ? cur.phone : normalizePhone(b.phone);
          const active = b.active === undefined ? cur.active : (b.active ? 1 : 0);
          if (name.length < 2 || name.length > 40) return json({ error: 'Name must be 2 to 40 characters.' }, 400);
          if (!phone) return json({ error: 'Enter a valid Kenyan phone number.' }, 400);
          await env.DB.prepare('UPDATE riders SET name = ?, phone = ?, active = ? WHERE id = ?').bind(name, phone, active, cur.id).run();
          return json({ ok: true });
        }
        m = path.match(/^\/api\/admin\/orders\/([a-z0-9]+)\/(reassign|cancel)$/);
        if (m && method === 'POST') {
          const o = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(m[1]).first();
          if (!o) return json({ error: 'Not found' }, 404);
          if (o.status !== 'paid' && o.status !== 'assigned') return json({ error: 'Only paid orders that are not yet delivered can be changed.' }, 400);
          const prev = o.rider_id, was = o.status;
          if (m[2] === 'reassign') {
            const skip = [...idList(o.declined_by), ...(prev ? [prev] : [])].join(',');
            await env.DB.prepare("UPDATE orders SET status = 'paid', rider_id = NULL, offered_to = NULL, offer_expires = NULL, declined_by = ?, offer_round = 0, retry_at = NULL, alerted = 0 WHERE id = ? AND status IN ('paid', 'assigned')").bind(skip, o.id).run();
            if (prev) await env.DB.prepare('UPDATE riders SET busy = 0 WHERE id = ?').bind(prev).run();
            await dispatchQueue(env);
            return json({ ok: true });
          }
          await env.DB.prepare("UPDATE orders SET status = 'cancelled', offered_to = NULL, offer_expires = NULL WHERE id = ? AND status IN ('paid', 'assigned')").bind(o.id).run();
          if (prev) await env.DB.prepare('UPDATE riders SET busy = 0 WHERE id = ?').bind(prev).run();
          await notifyCustomer(env, o.phone, `Order ${o.id} was cancelled. If you were charged, we will refund you.`, sendSms);
          await dispatchQueue(env);
          return json({ ok: true, refund: { order: o.id, phone: o.phone, amount_kes: o.total_kes, receipt: o.mpesa_receipt, was } });
        }
        // ----- Menu: the owner edits flavors, sizes, prices and availability here -----
        const cleanName = (x, max) => String(x == null ? '' : x).replace(/[\u0000-\u001f\u007f<>]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, max);
        const okPrice = (x) => Number.isInteger(x) && x >= 10 && x <= 50000;
        const menuOut = async () => {
          const fl = (await env.DB.prepare('SELECT id, name, blurb, color, sort, active FROM flavors ORDER BY sort, id').all()).results;
          const pr = (await env.DB.prepare('SELECT id, name, flavor_id, size, price_kes, active FROM products WHERE flavor_id IS NOT NULL ORDER BY price_kes, id').all()).results;
          return fl.map((f) => ({ ...f, products: pr.filter((p) => p.flavor_id === f.id) }));
        };
        if (path === '/api/admin/menu' && method === 'GET') return json(await menuOut());
        if (path === '/api/admin/menu/flavor' && method === 'POST') {
          const b = await req.json().catch(() => ({}));
          const name = cleanName(b.name, 40), blurb = cleanName(b.blurb, 120), color = /^#[0-9a-fA-F]{6}$/.test(String(b.color || '')) ? b.color : '#444444';
          const sizes = Array.isArray(b.sizes) ? b.sizes.slice(0, 6).map((z) => ({ size: cleanName(z && z.size, 20), price: Number(z && z.price_kes) })) : [];
          if (!name) return json({ error: 'Give the flavor a name.' }, 400);
          if (!sizes.length || sizes.some((z) => !z.size || !okPrice(z.price))) return json({ error: 'Add at least one size, each with a name and a price of KSh 10 to 50,000.' }, 400);
          const n = (await env.DB.prepare('SELECT COUNT(*) AS n FROM flavors').first()).n;
          if (n >= 40) return json({ error: 'The menu is full (40 flavors). Hide old ones instead.' }, 400);
          if (await env.DB.prepare('SELECT id FROM flavors WHERE lower(name) = lower(?)').bind(name).first()) return json({ error: 'A flavor with that name already exists.' }, 400);
          const mx = (await env.DB.prepare('SELECT COALESCE(MAX(sort), 0) AS m FROM flavors').first()).m;
          const fr = await env.DB.prepare('INSERT INTO flavors (name, blurb, color, sort, active) VALUES (?, ?, ?, ?, 1)').bind(name, blurb, color, mx + 1).run();
          const fid = fr.meta.last_row_id;
          for (const z of sizes) await env.DB.prepare('INSERT INTO products (name, price_kes, flavor_id, size, active) VALUES (?, ?, ?, ?, 1)').bind(`${name}, ${z.size}`, z.price, fid, z.size).run();
          return json({ ok: true, id: fid });
        }
        m = path.match(/^\/api\/admin\/menu\/flavor\/(\d+)$/);
        if (m && method === 'POST') {
          const f = await env.DB.prepare('SELECT * FROM flavors WHERE id = ?').bind(m[1]).first();
          if (!f) return json({ error: 'Not found' }, 404);
          const b = await req.json().catch(() => ({}));
          const name = b.name !== undefined ? cleanName(b.name, 40) : f.name;
          const blurb = b.blurb !== undefined ? cleanName(b.blurb, 120) : f.blurb;
          const color = b.color !== undefined ? (/^#[0-9a-fA-F]{6}$/.test(String(b.color)) ? b.color : null) : f.color;
          const active = b.active !== undefined ? (Number(b.active) ? 1 : 0) : f.active;
          if (!name) return json({ error: 'The name cannot be empty.' }, 400);
          if (!color) return json({ error: 'Pick a colour like #b3261e.' }, 400);
          if (name.toLowerCase() !== f.name.toLowerCase() && await env.DB.prepare('SELECT id FROM flavors WHERE lower(name) = lower(?) AND id != ?').bind(name, f.id).first()) return json({ error: 'A flavor with that name already exists.' }, 400);
          await env.DB.prepare('UPDATE flavors SET name = ?, blurb = ?, color = ?, active = ? WHERE id = ?').bind(name, blurb, color, active, f.id).run();
          if (name !== f.name) await env.DB.prepare("UPDATE products SET name = ? || ', ' || COALESCE(size, '') WHERE flavor_id = ?").bind(name, f.id).run();
          return json({ ok: true });
        }
        m = path.match(/^\/api\/admin\/menu\/flavor\/(\d+)\/size$/);
        if (m && method === 'POST') {
          const f = await env.DB.prepare('SELECT * FROM flavors WHERE id = ?').bind(m[1]).first();
          if (!f) return json({ error: 'Not found' }, 404);
          const b = await req.json().catch(() => ({}));
          const size = cleanName(b.size, 20), price = Number(b.price_kes);
          if (!size || !okPrice(price)) return json({ error: 'Give the size a name and a price of KSh 10 to 50,000.' }, 400);
          const n = (await env.DB.prepare('SELECT COUNT(*) AS n FROM products WHERE flavor_id = ?').bind(f.id).first()).n;
          if (n >= 8) return json({ error: 'That flavor already has 8 sizes.' }, 400);
          if (await env.DB.prepare('SELECT id FROM products WHERE flavor_id = ? AND lower(size) = lower(?)').bind(f.id, size).first()) return json({ error: 'That flavor already has a size with that name.' }, 400);
          await env.DB.prepare('INSERT INTO products (name, price_kes, flavor_id, size, active) VALUES (?, ?, ?, ?, 1)').bind(`${f.name}, ${size}`, price, f.id, size).run();
          return json({ ok: true });
        }
        m = path.match(/^\/api\/admin\/menu\/product\/(\d+)$/);
        if (m && method === 'POST') {
          const p0 = await env.DB.prepare('SELECT * FROM products WHERE id = ? AND flavor_id IS NOT NULL').bind(m[1]).first();
          if (!p0) return json({ error: 'Not found' }, 404);
          const b = await req.json().catch(() => ({}));
          const price = b.price_kes !== undefined ? Number(b.price_kes) : p0.price_kes;
          const active = b.active !== undefined ? (Number(b.active) ? 1 : 0) : p0.active;
          if (!okPrice(price)) return json({ error: 'The price must be a whole number from KSh 10 to 50,000.' }, 400);
          await env.DB.prepare('UPDATE products SET price_kes = ?, active = ? WHERE id = ?').bind(price, active, p0.id).run();
          return json({ ok: true });
        }

        // ----- Export: a spreadsheet file of orders, or of what each rider is owed -----
        if (path === '/api/admin/export' && method === 'GET') {
          const q = new URL(req.url).searchParams;
          const day = (x, endOfDay) => { const mm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(x || ''); if (!mm) return null; const t = Date.UTC(+mm[1], +mm[2] - 1, +mm[3]) - 3 * 3600e3; return Number.isNaN(t) ? null : endOfDay ? t + 86400e3 : t; };
          const from = day(q.get('from'), false), to = day(q.get('to'), true);
          if (from == null || to == null || to <= from) return json({ error: 'Pick a start and end date.' }, 400);
          if (to - from > 366 * 86400e3) return json({ error: 'Pick a range of one year or less.' }, 400);
          const cell = (v) => { let t = v == null ? '' : String(v); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
          const nai = (t) => (t ? new Date(t + 3 * 3600e3).toISOString().replace('T', ' ').slice(0, 16) : '');
          const rows = (await env.DB.prepare("SELECT o.id, o.status, o.qty, o.total_kes, o.delivery_fee_kes, o.distance_km, o.provider, o.mpesa_receipt, o.phone, o.address, o.created_at, o.paid_at, o.delivered_at, p.name AS product, r.name AS rider FROM orders o JOIN products p ON p.id = o.product_id LEFT JOIN riders r ON r.id = o.rider_id WHERE o.created_at >= ? AND o.created_at < ? ORDER BY o.created_at LIMIT 10000").bind(from, to).all()).results;
          let out;
          if (q.get('type') === 'payouts') {
            const agg = new Map();
            for (const o of rows.filter((x) => x.status === 'delivered' && x.rider)) {
              const d = nai(o.delivered_at).slice(0, 10), k = d + '|' + o.rider, a = agg.get(k) || { d, rider: o.rider, n: 0, fee: 0 };
              a.n++; a.fee += riderCut(env, o); agg.set(k, a);
            }
            out = ['Date,Rider,Deliveries,Owed (KSh)', ...[...agg.values()].sort((a, b) => (a.d + a.rider).localeCompare(b.d + b.rider)).map((a) => [a.d, a.rider, a.n, a.fee].map(cell).join(','))];
          } else {
            out = ['Order,Placed,Paid,Delivered,Status,Item,Qty,Total (KSh),Delivery fee (KSh),Distance (km),Paid with,M-Pesa receipt,Customer phone,Address,Rider',
              ...rows.map((o) => [o.id, nai(o.created_at), nai(o.paid_at), nai(o.delivered_at), o.status, o.product, o.qty, o.total_kes, o.delivery_fee_kes || '', o.distance_km == null ? '' : o.distance_km, o.provider, o.mpesa_receipt || '', '+' + o.phone, o.address, o.rider || ''].map(cell).join(','))];
          }
          const name = (q.get('type') === 'payouts' ? 'rider-payouts-' : 'orders-') + q.get('from') + '_to_' + q.get('to') + '.csv';
          return new Response('﻿' + out.join('\r\n') + '\r\n', { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${name}"`, ...SEC } });
        }

        if (path === '/api/admin/shop' && method === 'GET') return json(await shopStatus(env));
        if (path === '/api/admin/shop' && method === 'POST') {
          const b = await req.json().catch(() => ({}));
          await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('closed', ?)").bind(b.closed ? '1' : '0').run();
          return json({ ok: true, ...(await shopStatus(env)) });
        }
        if (path === '/api/admin/blocked' && method === 'GET') return json((await env.DB.prepare('SELECT phone, reason, created_at FROM blocked_phones ORDER BY created_at DESC').all()).results);
        if (path === '/api/admin/blocked' && method === 'POST') {
          const b = await req.json().catch(() => ({}));
          const phone = normalizePhone(b.phone);
          if (!phone) return json({ error: 'Enter a valid Kenyan phone number.' }, 400);
          await env.DB.prepare('INSERT OR REPLACE INTO blocked_phones (phone, reason, created_at) VALUES (?, ?, ?)').bind(phone, String(b.reason || '').trim().slice(0, 120), Date.now()).run();
          return json({ ok: true, phone });
        }
        m = path.match(/^\/api\/admin\/blocked\/([^/]+)\/remove$/);
        if (m && method === 'POST') {
          const phone = normalizePhone(decodeURIComponent(m[1]));
          if (!phone) return json({ error: 'Enter a valid Kenyan phone number.' }, 400);
          await env.DB.prepare('DELETE FROM blocked_phones WHERE phone = ?').bind(phone).run();
          return json({ ok: true });
        }
        if (path === '/api/admin/monitor') return json((await env.DB.prepare('SELECT ts, ok, detail, stale_alerted FROM monitor_beat WHERE id = 1').first()) || { ts: null });
        if (path === '/api/admin/payments/check') return json(await checkPayments(env));
        if (path === '/api/admin/whatsapp') return json((await env.DB.prepare('SELECT * FROM wa_log ORDER BY id DESC LIMIT 100').all()).results);
        if (path === '/api/admin/sms') return json((await env.DB.prepare('SELECT * FROM sms_log ORDER BY id DESC LIMIT 100').all()).results);
      }
      return json({ error: 'Not found' }, 404);
    } catch (e) {
      return json({ error: 'Something went wrong. Please try again.' }, 500);
    }
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(reconcile(env));
  },
};

import { stkPush, queryStatus } from './payments.js';
import { sendSms, retryFailed } from './sms.js';
import { normalizePhone, phoneList } from './phone.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
const html = (body, status = 200) => new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const rid = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => ALPHABET[b % ALPHABET.length]).join('');

export { normalizePhone };

const mapLink = (lat, lng) => `https://maps.google.com/?q=${Number(lat).toFixed(6)},${Number(lng).toFixed(6)}`;

// Providers the store accepts right now. Airtel stays off in production until its account is approved.
const providersOn = (env) => String(env.ENABLED_PROVIDERS || 'mpesa').split(',').map((x) => x.trim()).filter(Boolean);

// Placeholder service area around Nakuru town (roughly 25 km each way). Real delivery rules come later.
const AREA = { latMin: -0.55, latMax: -0.05, lngMin: 35.85, lngMax: 36.3 };

const alertOwners = (env, msg) => Promise.all(phoneList(env.ALERT_PHONES).map((n) => sendSms(env, n, msg)));

async function assignRider(env, orderId) {
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
  // Only one caller can move awaiting_payment -> paid, so duplicate callbacks do nothing.
  const res = await env.DB.prepare("UPDATE orders SET status = 'paid', paid_at = ?, mpesa_receipt = ? WHERE id = ? AND status = 'awaiting_payment'").bind(Date.now(), receipt, order.id).run();
  if (res.meta.changes !== 1) return;
  await sendSms(env, order.phone, `Payment of KSh ${order.total_kes} received. Order ${order.id} is being assigned to a rider.`);
  await assignRider(env, order.id);
}

// Handles a Safaricom callback body (real or simulated). Idempotent.
export async function processCallback(env, body) {
  const cb = body && body.Body && body.Body.stkCallback;
  if (!cb || !cb.CheckoutRequestID) return { ok: false, reason: 'bad_body' };
  const order = await env.DB.prepare('SELECT * FROM orders WHERE checkout_request_id = ?').bind(cb.CheckoutRequestID).first();
  if (!order) return { ok: false, reason: 'unknown_order' };
  if (order.status !== 'awaiting_payment') return { ok: true, reason: 'already_processed' };
  if (Number(cb.ResultCode) !== 0) {
    await env.DB.prepare("UPDATE orders SET status = 'payment_failed' WHERE id = ? AND status = 'awaiting_payment'").bind(order.id).run();
    return { ok: true, reason: 'payment_failed' };
  }
  const items = Object.fromEntries(((cb.CallbackMetadata && cb.CallbackMetadata.Item) || []).map((i) => [i.Name, i.Value]));
  if (Number(items.Amount) !== order.total_kes) {
    await env.DB.prepare("UPDATE orders SET status = 'amount_mismatch', mpesa_receipt = ? WHERE id = ? AND status = 'awaiting_payment'").bind(items.MpesaReceiptNumber || null, order.id).run();
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
  if (order.status !== 'awaiting_payment') return { ok: true, reason: 'already_processed' };
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

async function createOrder(env, req) {
  let b;
  try { b = await req.json(); } catch { return json({ error: 'Invalid request' }, 400); }
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
    if (lat < AREA.latMin || lat > AREA.latMax || lng < AREA.lngMin || lng > AREA.lngMax) return json({ error: 'The map pin is outside our Nakuru delivery area.' }, 400);
  }
  // With a map pin the landmark is optional; without one we need a written delivery spot.
  let address = String(b.address || '').trim();
  if (!address && lat !== null) address = 'Map pin only (no landmark)';
  if (address.length < 5 || address.length > 200) return json({ error: 'Enter a delivery spot (5 to 200 characters), or pin your location on the map.' }, 400);
  const qty = Number(b.qty);
  if (!Number.isInteger(qty) || qty < 1 || qty > 10) return json({ error: 'Quantity must be 1 to 10.' }, 400);
  const product = await env.DB.prepare('SELECT id, price_kes FROM products WHERE id = ? AND active = 1').bind(Number(b.product_id)).first();
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

  // Price comes from the database, never from the browser.
  const total = product.price_kes * qty + Number(env.DELIVERY_FEE_KES || 0);
  const id = rid(10);
  await env.DB.prepare("INSERT INTO orders (id, product_id, qty, total_kes, phone, address, status, delivery_token, created_at, provider, lat, lng, ip) VALUES (?, ?, ?, ?, ?, ?, 'awaiting_payment', ?, ?, ?, ?, ?, ?)").bind(id, product.id, qty, total, phone, address, rid(24), Date.now(), provider, lat, lng, ip).run();
  try {
    const { checkoutRequestId } = await stkPush(env, { orderId: id, phone, amount: total, provider });
    await env.DB.prepare('UPDATE orders SET checkout_request_id = ? WHERE id = ?').bind(checkoutRequestId, id).run();
  } catch (e) {
    await env.DB.prepare("UPDATE orders SET status = 'payment_failed' WHERE id = ?").bind(id).run();
    return json({ error: 'Could not start the payment prompt. Nothing was charged. Please try again.' }, 502);
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
  const stale = await env.DB.prepare("SELECT * FROM orders WHERE status = 'awaiting_payment' AND checkout_request_id IS NOT NULL AND created_at < ?").bind(now - 2 * 60 * 1000).all();
  for (const o of stale.results) {
    if (o.created_at < now - 30 * 60 * 1000) {
      await env.DB.prepare("UPDATE orders SET status = 'expired' WHERE id = ? AND status = 'awaiting_payment'").bind(o.id).run();
      continue;
    }
    try {
      const r = await queryStatus(env, o);
      if (!r) continue;
      if (r.resultCode === 0) await markPaid(env, o, r.receipt);
      else await env.DB.prepare("UPDATE orders SET status = 'payment_failed' WHERE id = ? AND status = 'awaiting_payment'").bind(o.id).run();
    } catch { /* try again next run */ }
  }
  await retryFailed(env);
  // Paid orders still waiting for a rider.
  const queued = await env.DB.prepare("SELECT id FROM orders WHERE status = 'paid' AND rider_id IS NULL ORDER BY paid_at").all();
  for (const q of queued.results) if (!(await assignRider(env, q.id))) break;
}

const adminOk = (req, env) => env.ADMIN_TOKEN && req.headers.get('authorization') === 'Bearer ' + env.ADMIN_TOKEN;

const esc = (x) => String(x == null ? '' : x).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const deliveryPage = (o, token) => `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Delivery</title>
<style>body{font-family:system-ui,sans-serif;max-width:440px;margin:0 auto;padding:16px;color:#1a1a1a;background:#fafaf8}h1{font-size:22px;margin:4px 0 14px}.c{background:#fff;border:1px solid #ddd;border-radius:14px;padding:14px 16px;margin:10px 0}.c small{display:block;color:#666;font-size:13px;margin-bottom:2px}.c b{font-size:18px}a.btn,button{display:block;width:100%;box-sizing:border-box;text-align:center;text-decoration:none;font-size:18px;padding:16px;border-radius:12px;border:0;margin-top:10px;cursor:pointer}a.map{background:#1a73e8;color:#fff}a.call{background:#fff;color:#1a1a1a;border:2px solid #1a1a1a}button{background:#1b7f5a;color:#fff}button:disabled{opacity:.5}#m{font-size:17px;margin-top:12px;text-align:center}</style>
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
      if (path === '/api/health') {
        await env.DB.prepare('INSERT OR REPLACE INTO health (id, ts) VALUES (1, ?)').bind(Date.now()).run();
        const r = await env.DB.prepare('SELECT ts FROM health WHERE id = 1').first();
        return json({ ok: !!r, ts: r && r.ts });
      }
      if (path === '/api/monitor/beat' && method === 'POST') {
        if (!env.MONITOR_TOKEN || req.headers.get('authorization') !== 'Bearer ' + env.MONITOR_TOKEN) return json({ error: 'Forbidden' }, 403);
        const b = await req.json().catch(() => ({}));
        const prev = await env.DB.prepare('SELECT stale_alerted FROM monitor_beat WHERE id = 1').first();
        await env.DB.prepare('INSERT INTO monitor_beat (id, ts, ok, detail, stale_alerted) VALUES (1, ?, ?, ?, 0) ON CONFLICT(id) DO UPDATE SET ts = excluded.ts, ok = excluded.ok, detail = excluded.detail, stale_alerted = 0').bind(Date.now(), b.ok ? 1 : 0, String(b.detail || '').slice(0, 200)).run();
        if (prev && prev.stale_alerted) await alertOwners(env, 'The outside site monitor is reporting again.');
        return json({ ok: true });
      }
      if (path === '/api/config') return json({ payments_mode: env.PAYMENTS_MODE, delivery_fee_kes: Number(env.DELIVERY_FEE_KES || 0), providers: providersOn(env), area: AREA });
      if (path === '/api/flavors' && method === 'GET') {
        const fl = (await env.DB.prepare('SELECT id, name, blurb, color FROM flavors WHERE active = 1 ORDER BY sort, id').all()).results;
        const pr = (await env.DB.prepare('SELECT id, flavor_id, size, price_kes FROM products WHERE active = 1 AND flavor_id IS NOT NULL ORDER BY price_kes').all()).results;
        return json(fl.map((f) => ({ ...f, sizes: pr.filter((p) => p.flavor_id === f.id).map((p) => ({ product_id: p.id, size: p.size, price_kes: p.price_kes })) })).filter((f) => f.sizes.length));
      }
      if (path === '/api/products' && method === 'GET') {
        const r = await env.DB.prepare('SELECT id, name, price_kes FROM products WHERE active = 1 ORDER BY id').all();
        return json(r.results);
      }
      if (path === '/api/orders' && method === 'POST') return await createOrder(env, req);

      let m = path.match(/^\/api\/orders\/([a-z0-9]+)$/);
      if (m && method === 'GET') {
        const o = await env.DB.prepare('SELECT id, status, total_kes, qty FROM orders WHERE id = ?').bind(m[1]).first();
        return o ? json(o) : json({ error: 'Not found' }, 404);
      }

      m = path.match(/^\/api\/mpesa\/callback\/(.+)$/);
      if (m && method === 'POST') {
        if (!env.CALLBACK_SECRET || m[1] !== env.CALLBACK_SECRET) return json({ error: 'Forbidden' }, 403);
        await processCallback(env, await req.json().catch(() => null));
        return json({ ResultCode: 0, ResultDesc: 'Accepted' });
      }

      m = path.match(/^\/api\/airtel\/callback\/(.+)$/);
      if (m && method === 'POST') {
        if (!env.CALLBACK_SECRET || m[1] !== env.CALLBACK_SECRET) return json({ error: 'Forbidden' }, 403);
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
        if (!o) return html('<p>Link not found.</p>', 404);
        return html(o.status === 'delivered' ? '<meta name="viewport" content="width=device-width,initial-scale=1"><p style="font-family:system-ui;font-size:20px;padding:24px">Already marked delivered. Thank you.</p>' : deliveryPage(o, m[1]));
      }

      m = path.match(/^\/api\/deliver\/([a-z0-9]+)$/);
      if (m && method === 'POST') {
        const o = await env.DB.prepare('SELECT * FROM orders WHERE delivery_token = ?').bind(m[1]).first();
        if (!o) return json({ error: 'Not found' }, 404);
        const done = await env.DB.prepare("UPDATE orders SET status = 'delivered', delivered_at = ? WHERE id = ? AND status = 'assigned'").bind(Date.now(), o.id).run();
        if (done.meta.changes === 1) {
          const cut = Math.round((o.total_kes * Number(env.RIDER_CUT_PCT || 0)) / 100);
          await env.DB.prepare('INSERT OR IGNORE INTO ledger (order_id, rider_id, amount_kes, created_at) VALUES (?, ?, ?, ?)').bind(o.id, o.rider_id, cut, Date.now()).run();
          await env.DB.prepare('UPDATE riders SET busy = 0 WHERE id = ?').bind(o.rider_id).run();
          await sendSms(env, o.phone, `Order ${o.id} delivered. Thank you.`);
          const next = await env.DB.prepare("SELECT id FROM orders WHERE status = 'paid' AND rider_id IS NULL ORDER BY paid_at LIMIT 1").first();
          if (next) await assignRider(env, next.id);
        }
        return json({ ok: true });
      }

      if (path.startsWith('/api/admin/')) {
        if (!adminOk(req, env)) return json({ error: 'Forbidden' }, 403);
        if (path === '/api/admin/orders') return json((await env.DB.prepare('SELECT o.id, o.status, o.total_kes, o.qty, o.phone, o.address, o.rider_id, o.mpesa_receipt, o.created_at, o.provider, o.lat, o.lng, p.name AS product FROM orders o JOIN products p ON p.id = o.product_id ORDER BY o.created_at DESC LIMIT 100').all()).results);
        if (path === '/api/admin/riders' && method === 'GET') return json((await env.DB.prepare('SELECT r.id, r.name, r.phone, r.active, r.busy, COALESCE(SUM(CASE WHEN l.paid_out = 0 THEN l.amount_kes END), 0) AS owed_kes FROM riders r LEFT JOIN ledger l ON l.rider_id = r.id GROUP BY r.id').all()).results);
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
          const r = await env.DB.prepare('INSERT INTO riders (name, phone) VALUES (?, ?)').bind(name, phone).run();
          return json({ ok: true, id: r.meta.last_row_id });
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

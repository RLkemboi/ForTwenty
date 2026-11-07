// WhatsApp adapter (Meta WhatsApp Business Cloud API).
//   WHATSAPP_MODE=mock  (default) messages are only recorded in wa_log, nothing leaves the worker
//   WHATSAPP_MODE=cloud messages go out through graph.facebook.com
// Secrets (wrangler secret put): WA_TOKEN, WA_VERIFY_TOKEN, WA_APP_SECRET. Settings in wrangler.toml: WA_PHONE_NUMBER_ID, WA_TEMPLATE, WA_TEMPLATE_LANG, WHATSAPP_NUMBER.
// The Cloud API paths are written but NOT yet tested against Meta: they need a verified business account and an approved template.
import { normalizePhone, phoneList } from './phone.js';

const API = 'https://graph.facebook.com/v21.0';
const WINDOW_MS = 24 * 3600 * 1000; // free-form messages are only allowed for 24 hours after the customer last wrote to us

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

// Meta signs every webhook body with the app secret: X-Hub-Signature-256: sha256=<hmac of the raw body>.
export async function verifySignature(env, rawBody, header) {
  if (!env.WA_APP_SECRET || !header) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.WA_APP_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const want = 'sha256=' + hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody)));
  if (want.length !== header.length) return false;
  let d = 0;
  for (let i = 0; i < want.length; i++) d |= want.charCodeAt(i) ^ header.charCodeAt(i);
  return d === 0;
}

async function post(env, payload) {
  const res = await fetch(`${API}/${env.WA_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env.WA_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: payload.to, ...payload.body }),
  });
  if (res.ok) return 'sent';
  const txt = await res.text().catch(() => '');
  return `failed:${res.status} ${txt.replace(/\s+/g, ' ').slice(0, 120)}`;
}

// Sends one message and records it. Never throws. Returns 'sent' | 'mock' | 'blocked:...' | 'failed:...'.
export async function sendWhatsApp(env, rawTo, text) {
  const to = normalizePhone(rawTo) || String(rawTo || '').replace(/\D/g, '');
  let status;
  if (env.WHATSAPP_MODE !== 'cloud') status = 'mock';
  else if (!env.WA_TOKEN || !env.WA_PHONE_NUMBER_ID) status = 'failed:not_configured';
  else if (String(env.WA_ALLOWLIST || '').trim() !== '' && !phoneList(env.WA_ALLOWLIST).includes(to)) status = 'blocked:not_on_allowlist';
  else {
    try {
      const c = await env.DB.prepare('SELECT last_inbound FROM wa_contacts WHERE phone = ?').bind(to).first();
      if (c && Date.now() - c.last_inbound < WINDOW_MS) {
        status = await post(env, { to, body: { type: 'text', text: { preview_url: false, body: text.slice(0, 4000) } } });
      } else {
        // Outside the 24-hour window only a pre-approved template is allowed. The template has one variable, {{1}}, holding the message.
        status = await post(env, { to, body: { type: 'template', template: { name: env.WA_TEMPLATE || 'order_update', language: { code: env.WA_TEMPLATE_LANG || 'en' }, components: [{ type: 'body', parameters: [{ type: 'text', text: text.replace(/[\n\t]+/g, ' ').slice(0, 1000) }] }] } } });
      }
    } catch {
      status = 'failed:network';
    }
  }
  await env.DB.prepare('INSERT INTO wa_log (to_phone, body, status, created_at) VALUES (?, ?, ?, ?)').bind(to, text, status, Date.now()).run();
  return status;
}

// ---------- The auto-reply bot ----------
const KES = (n) => 'KSh ' + Number(n).toLocaleString('en-KE');
// Whole-word match; words of 5+ letters also match longer forms (deliver -> delivery, flavour -> flavours). Phrases match as written.
const has = (t, ...words) => words.some((w) => (w.length >= 5 || w.includes(' ') ? ` ${t}`.includes(` ${w}`) : ` ${t} `.includes(` ${w} `)));

async function catalogue(env) {
  const fl = (await env.DB.prepare('SELECT id, name FROM flavors WHERE active = 1 ORDER BY sort, id').all()).results;
  const pr = (await env.DB.prepare('SELECT flavor_id, size, price_kes FROM products WHERE active = 1 AND flavor_id IS NOT NULL ORDER BY price_kes').all()).results;
  const lines = { sample: [], packet: [], gear: [] };
  for (const f of fl) for (const p of pr.filter((x) => x.flavor_id === f.id)) (lines[p.size] || (lines[p.size] = [])).push(`${f.name} ${KES(p.price_kes)}`);
  const sec = (title, arr) => (arr && arr.length ? `*${title}*\n${arr.map((x) => '- ' + x).join('\n')}` : '');
  return [sec('Samples', lines.sample), sec('Packets', lines.packet), sec('Hookah gear', lines.gear)].filter(Boolean).join('\n\n');
}

// Looks up the customer's own latest orders by the number they are writing from. Nothing about other customers is ever shown.
async function orderStatus(env, phone) {
  const rows = (await env.DB.prepare('SELECT o.id, o.status, o.qty, o.total_kes, p.name AS product FROM orders o JOIN products p ON p.id = o.product_id WHERE o.phone = ? ORDER BY o.created_at DESC LIMIT 3').bind(phone).all()).results;
  if (!rows.length) return 'We have no orders for this number yet. Reply MENU to see what we sell.';
  const label = { awaiting_payment: 'waiting for payment', paid: 'paid, finding a rider', assigned: 'on the way', delivered: 'delivered', payment_failed: 'payment failed', expired: 'expired', cancelled: 'cancelled', amount_mismatch: 'being checked by us' };
  return 'Your latest orders:\n' + rows.map((o) => `- ${o.id}: ${o.qty} x ${o.product}, ${KES(o.total_kes)} - ${label[o.status] || o.status}`).join('\n');
}

// Returns the reply text for one incoming message.
export async function botReply(env, phone, rawText) {
  const t = String(rawText || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const site = env.PUBLIC_URL;
  const open = Number(env.OPEN_HOUR ?? 8), close = Number(env.CLOSE_HOUR ?? 24);
  const hr = (h) => (h % 24 === 0 ? 'midnight' : (h % 12 || 12) + (h < 12 ? ' am' : ' pm'));
  if (has(t, 'menu', 'catalogue', 'catalog', 'price', 'prices', 'flavor', 'flavour', 'what do you sell', 'gear', 'hookah')) {
    return `Here is our menu:\n\n${await catalogue(env)}\n\nDelivery to Kabarak is extra. To order, open ${site} and tap the item you want.`;
  }
  if (has(t, 'status', 'my order', 'where is', 'track', 'confirm')) return orderStatus(env, phone);
  if (has(t, 'deliver', 'fee', 'how far', 'area', 'location', 'kabarak')) {
    return `We deliver within ${env.DELIVERY_MAX_KM || 3} km of Kabarak University. The fee depends on distance: from ${KES(env.DELIVERY_MIN_KES || 100)}, shown before you pay when you pin your location at ${site}.`;
  }
  if (has(t, 'hour', 'open', 'close', 'time')) return `We take orders from ${hr(open)} to ${hr(close)}, every day.`;
  if (has(t, 'pay', 'mpesa', 'm pesa', 'till', 'airtel')) return 'You pay on your phone: after you place the order you get an M-Pesa prompt. Enter your PIN to approve. We never ask for your PIN or card details on WhatsApp.';
  if (has(t, 'age', '18', 'adult', 'underage')) return 'You must be 18 or older to order. We confirm this when you order.';
  if (has(t, 'order', 'buy', 'checkout')) return `To order, open ${site}, pick your item, pin your location and pay with M-Pesa. Once paid, we confirm the order here.`;
  if (has(t, 'human', 'agent', 'person', 'call', 'help me', 'complain', 'refund')) return 'Thanks. A team member will reply here as soon as possible during opening hours.';
  if (has(t, 'hi', 'hello', 'hey', 'start', 'help', 'habari', 'mambo', 'sasa')) {
    return 'Hi, welcome to Kabarak Delivery. Reply with:\nMENU - see items and prices\nORDER - how to order\nDELIVERY - areas and fees\nHOURS - when we are open\nPAY - how payment works\nSTATUS - check your latest order';
  }
  return 'Sorry, I did not get that. Reply MENU, ORDER, DELIVERY, HOURS, PAY or STATUS, or HUMAN to talk to us.';
}

// Handles one verified webhook body from Meta. Idempotent: a message id is processed once.
export async function processWebhook(env, body) {
  let handled = 0;
  for (const entry of (body && body.entry) || []) {
    for (const ch of entry.changes || []) {
      for (const msg of (ch.value && ch.value.messages) || []) {
        const phone = normalizePhone(msg.from) || String(msg.from || '').replace(/\D/g, '');
        if (!msg.id || !phone) continue;
        const text = msg.type === 'text' ? (msg.text && msg.text.body) || '' : (msg.interactive && ((msg.interactive.button_reply && msg.interactive.button_reply.title) || (msg.interactive.list_reply && msg.interactive.list_reply.title))) || '';
        const ins = await env.DB.prepare('INSERT OR IGNORE INTO wa_inbound (id, phone, body, created_at) VALUES (?, ?, ?, ?)').bind(String(msg.id), phone, String(text).slice(0, 500), Date.now()).run();
        if (ins.meta.changes !== 1) continue; // Meta retried a message we already handled
        await env.DB.prepare('INSERT INTO wa_contacts (phone, last_inbound) VALUES (?, ?) ON CONFLICT(phone) DO UPDATE SET last_inbound = excluded.last_inbound').bind(phone, Date.now()).run();
        const blocked = await env.DB.prepare('SELECT 1 AS x FROM blocked_phones WHERE phone = ?').bind(phone).first();
        if (blocked) continue;
        const reply = text ? await botReply(env, phone, text) : 'Hi, I can only read text messages. Reply MENU to see what we sell.';
        await sendWhatsApp(env, phone, reply);
        handled++;
      }
    }
  }
  return handled;
}

// Sends a customer an order update. WhatsApp first when it is switched on, SMS as the fallback.
export async function notifyCustomer(env, phone, text, sendSms) {
  if (env.WHATSAPP_MODE === 'cloud') {
    const s = await sendWhatsApp(env, phone, text);
    if (s === 'sent') return s;
  }
  return sendSms(env, phone, text);
}

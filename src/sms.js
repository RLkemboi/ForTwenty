// SMS adapter. SMS_MODE=mock records messages in sms_log; SMS_MODE=at sends through Africa's Talking.
// AT_ENV=sandbox uses AT's test servers (nothing reaches a real phone); a login named "sandbox" always does.
import { normalizePhone, phoneList } from './phone.js';

export const MAX_ATTEMPTS = 4;          // first try + 3 retries
export const RETRY_WINDOW_MS = 30 * 60 * 1000; // a "rider is on the way" text is useless after 30 minutes

// Only temporary problems are retried: network trouble, AT server errors, rate limits, an empty wallet (retry works after top-up).
// Permanent ones (UserInBlacklist, InvalidPhoneNumber, 401, not on the allowlist) are never retried.
export const isRetryable = (status) => /^failed:(network|5\d\d|429|InsufficientBalance|SendFailed|Failed)/i.test(String(status));

// Talks to Africa's Talking once. Returns a status string; never throws.
export async function deliver(env, to, body) {
  if (env.SMS_MODE !== 'at') return 'mock';
  // While payments are still a demo, anyone can trigger an SMS from the public site. If SMS_ALLOWLIST is set,
  // only those numbers get a real message; everything else is logged as blocked and costs nothing.
  if (String(env.SMS_ALLOWLIST || '').trim() !== '' && !phoneList(env.SMS_ALLOWLIST).includes(to)) return 'blocked:not_on_allowlist';
  try {
    const host = env.AT_ENV === 'sandbox' || env.AT_USERNAME === 'sandbox' ? 'api.sandbox.africastalking.com' : 'api.africastalking.com';
    const form = { username: env.AT_USERNAME, to: '+' + to, message: body };
    if (env.AT_SENDER_ID) form.from = env.AT_SENDER_ID; // only after the sender ID is registered and approved
    const res = await fetch('https://' + host + '/version1/messaging', {
      method: 'POST',
      headers: { apiKey: env.AT_API_KEY, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form),
    });
    // AT answers 201 even when a single recipient is rejected, so read the per-recipient status.
    // 100 Processed, 101 Sent, 102 Queued are fine; anything else is a failure.
    const txt = await res.text().catch(() => '');
    let data = null; try { data = JSON.parse(txt); } catch { /* not JSON */ }
    const r = data && data.SMSMessageData && data.SMSMessageData.Recipients && data.SMSMessageData.Recipients[0];
    if (!res.ok) {
      // Diagnostics for setup problems: AT's own error text, the username used, and the key LENGTH (never the key).
      return `failed:${res.status} ${txt.replace(/\s+/g, ' ').slice(0, 90)} [host=${host} user=${env.AT_USERNAME || 'MISSING'} keylen=${(env.AT_API_KEY || '').length}]`;
    }
    if (r && [100, 101, 102].includes(Number(r.statusCode))) return 'sent';
    return 'failed:' + ((r && r.status) || 'no_recipient');
  } catch (e) {
    return 'failed:network';
  }
}

export async function sendSms(env, rawTo, body) {
  const to = normalizePhone(rawTo) || String(rawTo || '').replace(/\D/g, '');
  const status = await deliver(env, to, body);
  await env.DB.prepare('INSERT INTO sms_log (to_phone, body, status, created_at, attempts) VALUES (?, ?, ?, ?, 1)').bind(to, body, status, Date.now()).run();
  return status;
}

// Called by the 5-minute job. Re-sends texts that failed for a temporary reason, a few times, while they are still fresh.
export async function retryFailed(env) {
  if (env.SMS_MODE !== 'at') return 0;
  const rows = (await env.DB.prepare('SELECT id, to_phone, body, status, attempts FROM sms_log WHERE attempts < ? AND created_at > ? AND status LIKE ? ORDER BY id LIMIT 20').bind(MAX_ATTEMPTS, Date.now() - RETRY_WINDOW_MS, 'failed:%').all()).results;
  let n = 0;
  for (const r of rows) {
    if (!isRetryable(r.status)) continue;
    const status = await deliver(env, r.to_phone, r.body);
    await env.DB.prepare('UPDATE sms_log SET status = ?, attempts = attempts + 1 WHERE id = ?').bind(status, r.id).run();
    n++;
  }
  return n;
}

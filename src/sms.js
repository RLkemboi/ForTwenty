// SMS adapter. SMS_MODE=mock records messages in sms_log; SMS_MODE=at sends through Africa's Talking.
// AT_ENV=sandbox uses AT's test servers (nothing reaches a real phone); anything else is live.
// The "at" path is written but NOT yet tested against the real service: it needs credentials.
export async function sendSms(env, to, body) {
  const now = Date.now();
  let status = 'mock';
  if (env.SMS_MODE === 'at') {
    try {
      // A sandbox login (username "sandbox") only works on AT's sandbox servers, whatever AT_ENV says.
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
        status = `failed:${res.status} ${txt.replace(/\s+/g, ' ').slice(0, 90)} [host=${host} user=${env.AT_USERNAME || 'MISSING'} keylen=${(env.AT_API_KEY || '').length}]`;
      }
      else if (res.ok && r && [100, 101, 102].includes(Number(r.statusCode))) status = 'sent';
      else status = 'failed:' + ((r && r.status) || 'no_recipient');
    } catch (e) {
      status = 'failed:network';
    }
  }
  await env.DB.prepare('INSERT INTO sms_log (to_phone, body, status, created_at) VALUES (?, ?, ?, ?)').bind(to, body, status, now).run();
  return status;
}

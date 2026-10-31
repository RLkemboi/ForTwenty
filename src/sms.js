// SMS adapter. SMS_MODE=mock records messages in sms_log; SMS_MODE=at sends through Africa's Talking.
// The "at" path is written but NOT yet tested: it needs real credentials.
export async function sendSms(env, to, body) {
  const now = Date.now();
  let status = 'mock';
  if (env.SMS_MODE === 'at') {
    try {
      const res = await fetch('https://api.africastalking.com/version1/messaging', {
        method: 'POST',
        headers: { apiKey: env.AT_API_KEY, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ username: env.AT_USERNAME, to: '+' + to, message: body }),
      });
      status = res.ok ? 'sent' : 'failed:' + res.status;
    } catch (e) {
      status = 'failed:network';
    }
  }
  await env.DB.prepare('INSERT INTO sms_log (to_phone, body, status, created_at) VALUES (?, ?, ?, ?)').bind(to, body, status, now).run();
  return status;
}

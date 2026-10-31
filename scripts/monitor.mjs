// Outside monitor. Runs on GitHub, not Cloudflare, so it still works when Cloudflare is the thing that broke.
// Each run: check the site (twice, a minute apart, so one blip never alerts). State between runs lives in a GitHub issue
// labelled "outage": open issue = we already told you it is down. Recovery closes it and sends the "back up" text.
// Env: SITE_URL, ALERT_PHONES, AT_USERNAME, AT_API_KEY (+ GITHUB_TOKEN, GITHUB_REPOSITORY in Actions).
// Test switches: MONITOR_DRY_RUN=1 prints instead of sending; MONITOR_FAKE_ISSUE=open|none fakes the state; WAIT_MS shortens the wait.
const base = (process.env.SITE_URL || 'https://fortwenty.kipp-ralph.workers.dev').replace(/\/$/, '');
const dry = process.env.MONITOR_DRY_RUN === '1';
const WAIT_MS = Number(process.env.WAIT_MS ?? 60000);
const repo = process.env.GITHUB_REPOSITORY, gh = process.env.GITHUB_TOKEN;
const nairobi = (t = Date.now()) => new Date(t).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

// Same rules as the site (src/phone.js), copied so this script stands alone.
function normalizePhone(raw) {
  let p = String(raw || '').replace(/[\s()-]/g, '');
  if (p.startsWith('+')) p = p.slice(1);
  if (p.startsWith('00')) p = p.slice(2);
  if (/^0[17]\d{8}$/.test(p)) p = '254' + p.slice(1);
  if (/^[17]\d{8}$/.test(p)) p = '254' + p;
  p = p.replace(/^254(?:0|254)(?=[17]\d{8}$)/, '254');
  return /^254[17]\d{8}$/.test(p) ? p : null;
}

// Returns null when the site is healthy, otherwise a short reason.
async function checkOnce() {
  const get = (p) => fetch(base + p, { signal: AbortSignal.timeout(10000), headers: { 'cache-control': 'no-cache' } });
  try {
    const h = await get('/api/health'); const hj = await h.json().catch(() => ({}));
    if (!h.ok || !hj.ok) return `health check failed (HTTP ${h.status})`;
    const f = await get('/api/flavors'); const fj = await f.json().catch(() => null);
    if (!f.ok || !Array.isArray(fj) || !fj.length) return `menu is empty or broken (HTTP ${f.status})`;
    const home = await get('/');
    if (!home.ok) return `home page returned HTTP ${home.status}`;
    return null;
  } catch (e) { return e.name === 'TimeoutError' ? 'the site took more than 10 seconds to answer' : 'the site did not answer at all'; }
}

async function sendSms(text) {
  const phones = String(process.env.ALERT_PHONES || '').split(',').map(normalizePhone).filter(Boolean);
  if (!phones.length) throw new Error('ALERT_PHONES has no valid numbers');
  if (dry) { for (const p of phones) console.log(`[dry run] SMS to +${p}: ${text}`); return; }
  const host = process.env.AT_USERNAME === 'sandbox' ? 'api.sandbox.africastalking.com' : 'api.africastalking.com';
  let failed = 0;
  for (const p of phones) {
    const res = await fetch(`https://${host}/version1/messaging`, {
      method: 'POST',
      headers: { apiKey: process.env.AT_API_KEY, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: process.env.AT_USERNAME, to: '+' + p, message: text }),
    });
    const j = await res.json().catch(() => null);
    const r = j && j.SMSMessageData && j.SMSMessageData.Recipients && j.SMSMessageData.Recipients[0];
    const ok = res.ok && r && [100, 101, 102].includes(Number(r.statusCode));
    console.log(`SMS to +${p}: ${ok ? 'sent' : 'FAILED ' + res.status + ' ' + ((r && r.status) || '')}`);
    if (!ok) failed++;
  }
  if (failed) throw new Error(`${failed} alert text(s) failed`);
}

async function api(path, method = 'GET', body) {
  const res = await fetch('https://api.github.com/repos/' + repo + path, { method, headers: { authorization: 'Bearer ' + gh, accept: 'application/vnd.github+json', 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(`GitHub API ${method} ${path}: ${res.status}`);
  return res.status === 204 ? null : res.json();
}
async function openIssue() {
  if (process.env.MONITOR_FAKE_ISSUE) return process.env.MONITOR_FAKE_ISSUE === 'open' ? { number: 0, created_at: new Date(Date.now() - 17 * 60000).toISOString() } : null;
  if (!repo || !gh) throw new Error('GITHUB_TOKEN / GITHUB_REPOSITORY missing');
  return (await api('/issues?state=open&labels=outage&per_page=1'))[0] || null;
}

const first = await checkOnce();
let reason = first;
if (first) { console.log('First check failed: ' + first + '. Checking again in ' + WAIT_MS / 1000 + 's.'); await new Promise((r) => setTimeout(r, WAIT_MS)); reason = await checkOnce(); }
const issue = await openIssue();
let problem = null;

try {
  if (reason && !issue) {
    console.log('DOWN: ' + reason);
    if (!dry) await api('/issues', 'POST', { title: 'Site is down (' + nairobi() + ')', body: `The outside monitor could not use ${base}.\n\nReason: ${reason}\n\nThis issue closes by itself when the site recovers.`, labels: ['outage'] });
    else console.log('[dry run] would open an outage issue');
    await sendSms(`ALERT: the shisha store site is DOWN since ${nairobi()}. Reason: ${reason}. Customers see an error page. We will text again when it is back.`);
  } else if (reason && issue) {
    console.log('Still down (already alerted): ' + reason);
  } else if (!reason && issue) {
    const mins = Math.max(1, Math.round((Date.now() - new Date(issue.created_at).getTime()) / 60000));
    console.log('RECOVERED after about ' + mins + ' min');
    if (!dry) { await api('/issues/' + issue.number + '/comments', 'POST', { body: 'Back up at ' + nairobi() + ' (down about ' + mins + ' min).' }); await api('/issues/' + issue.number, 'PATCH', { state: 'closed' }); }
    else console.log('[dry run] would close the outage issue');
    await sendSms(`RECOVERED: the shisha store site is back up (${nairobi()}). It was down about ${mins} min.`);
  } else console.log('OK: site healthy');
} catch (e) { problem = e; }
if (problem) { console.error('MONITOR PROBLEM: ' + problem.message); process.exit(1); }

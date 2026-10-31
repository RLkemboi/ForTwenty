// Needs: dev server WITHOUT RATE_LIMIT_OFF (limit 120 per 60 s per visitor address).
const B = 'http://localhost:8787';
let pass = 0, fail = 0;
const check = (n, c, x = '') => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '  ' + x)); };
const hit = (path, ip, init = {}) => fetch(B + path, { ...init, headers: { 'cf-connecting-ip': ip, ...(init.headers || {}) } });

const codes = [];
for (let i = 0; i < 135; i++) codes.push((await hit('/api/config', '198.51.100.7')).status);
const ok = codes.filter((c) => c === 200).length, blocked = codes.filter((c) => c === 429).length;
check('first requests pass', ok >= 100 && codes.slice(0, 50).every((c) => c === 200), JSON.stringify({ ok, blocked }));
check('requests past the limit get 429', blocked >= 5, JSON.stringify({ ok, blocked }));
const r = await hit('/api/config', '198.51.100.7');
check('429 explains itself and says when to retry', r.status === 429 && r.headers.get('retry-after') === '30' && /slow down/i.test((await r.json()).error));
check('another visitor is not affected', (await hit('/api/config', '198.51.100.8')).status === 200);
check('health ping is never limited', (await hit('/api/health', '198.51.100.7')).status === 200);
check('payment callbacks are never limited', (await hit('/api/mpesa/callback/wrong', '198.51.100.7', { method: 'POST', body: '{}' })).status === 403);
check('airtel callbacks are never limited', (await hit('/api/airtel/callback/wrong', '198.51.100.7', { method: 'POST', body: '{}' })).status === 403);
check('monitor heartbeat is never limited', (await hit('/api/monitor/beat', '198.51.100.7', { method: 'POST', body: '{}' })).status === 403);
check('shop page itself is not limited', (await hit('/', '198.51.100.7')).status === 200);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

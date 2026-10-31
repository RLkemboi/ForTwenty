const { chromium } = require('playwright');
(async () => { const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 800 } });
await p.goto('http://localhost:8787/');
await p.waitForSelector('#p option', { state: 'attached' });
await p.selectOption('#p', '2'); await p.fill('#q', '2');
await p.fill('#ph', '0733000009'); await p.fill('#ad', 'Test estate, Nakuru');
console.log('total shown:', await p.textContent('#total'));
await p.check('#age'); await p.click('#go');
await p.waitForSelector('#demo', { state: 'visible' });
console.log('after submit:', await p.textContent('#msg'));
await p.click('#dpay');
await p.waitForFunction(() => /rider/.test(document.getElementById('msg').textContent));
console.log('after pay:', await p.textContent('#msg'));
await p.screenshot({ path: 'shot-ok.png' });
// real-shaped callback with the right secret
const o = await (await fetch('http://localhost:8787/api/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ product_id: 1, qty: 1, phone: '0744000001', address: 'Callback test spot', age_confirmed: true }) })).json();
const adm = await (await fetch('http://localhost:8787/api/admin/orders', { headers: { authorization: 'Bearer dev-admin-token' } })).json();
console.log('orders listed:', adm.length);
// error screen: block the API
const p2 = await b.newPage({ viewport: { width: 390, height: 600 } });
await p2.route('**/api/health', (r) => r.abort());
await p2.goto('http://localhost:8787/');
await p2.waitForSelector('#down', { state: 'visible' });
console.log('error screen:', (await p2.textContent('#down')).trim().slice(0, 40));
await p2.screenshot({ path: 'shot-down.png' });
await b.close();
})();

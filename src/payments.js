// Payment adapter. PAYMENTS_MODE=mock needs no provider account; otherwise the order's provider decides:
//   mpesa -> Safaricom Daraja STK push to a Till (Buy Goods)
//   airtel -> Airtel Money Open API collection (USSD push)
// The Daraja and Airtel paths are written but NOT yet tested: they need real credentials and approval.

// ---------- M-Pesa (Daraja) ----------
const darajaBase = (env) => (env.DARAJA_ENV === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke');
const timestamp = () => new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);

const DARAJA_REQUIRED = ['DARAJA_KEY', 'DARAJA_SECRET', 'DARAJA_SHORTCODE', 'DARAJA_TILL', 'DARAJA_PASSKEY', 'CALLBACK_SECRET', 'PUBLIC_URL'];
const TIMEOUT_MS = 15000; // never let a slow provider hang an order request
let darajaCache = { token: null, exp: 0 };

async function darajaToken(env) {
  if (darajaCache.token && Date.now() < darajaCache.exp) return darajaCache.token;
  const res = await fetch(darajaBase(env) + '/oauth/v1/generate?grant_type=client_credentials', {
    headers: { Authorization: 'Basic ' + btoa(env.DARAJA_KEY + ':' + env.DARAJA_SECRET) },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error('daraja oauth ' + res.status);
  const d = await res.json();
  darajaCache = { token: d.access_token, exp: Date.now() + Math.max(60, Number(d.expires_in || 3599) - 120) * 1000 };
  return darajaCache.token;
}

// Go-live check for the owner: lists missing settings and proves the Daraja key and secret work. Never returns a secret.
export async function checkPayments(env) {
  const missing = DARAJA_REQUIRED.filter((k) => !String(env[k] || '').trim());
  const out = { mode: env.PAYMENTS_MODE, daraja_env: env.DARAJA_ENV || 'sandbox', missing, oauth: null, callback_url: env.PUBLIC_URL ? env.PUBLIC_URL + '/api/mpesa/callback/<CALLBACK_SECRET>' : null, ready: false };
  if (!missing.includes('DARAJA_KEY') && !missing.includes('DARAJA_SECRET')) {
    try { darajaCache = { token: null, exp: 0 }; await darajaToken(env); out.oauth = 'ok'; } catch (e) { out.oauth = 'failed: ' + String(e.message).slice(0, 80); }
  }
  out.ready = env.PAYMENTS_MODE === 'daraja' && !missing.length && out.oauth === 'ok';
  return out;
}

async function mpesaPush(env, { orderId, phone, amount }) {
  const missing = DARAJA_REQUIRED.filter((k) => !String(env[k] || '').trim());
  if (missing.length) throw new Error('daraja not configured: ' + missing.join(', '));
  const ts = timestamp();
  // For a Till (Buy Goods): BusinessShortCode = the store number, PartyB = the till number.
  const res = await fetch(darajaBase(env) + '/mpesa/stkpush/v1/processrequest', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + (await darajaToken(env)), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      BusinessShortCode: env.DARAJA_SHORTCODE,
      Password: btoa(env.DARAJA_SHORTCODE + env.DARAJA_PASSKEY + ts),
      Timestamp: ts,
      // The Daraja sandbox shortcode (174379) is a paybill, so the sandbox needs the paybill type; a real Till uses Buy Goods.
      TransactionType: env.DARAJA_ENV === 'production' ? 'CustomerBuyGoodsOnline' : 'CustomerPayBillOnline',
      Amount: Math.round(amount),
      PartyA: phone,
      PartyB: env.DARAJA_TILL,
      PhoneNumber: phone,
      CallBackURL: env.PUBLIC_URL + '/api/mpesa/callback/' + env.CALLBACK_SECRET,
      AccountReference: orderId.slice(0, 12),
      TransactionDesc: 'Order',
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data = await res.json().catch(() => ({}));
  if (data.ResponseCode !== '0') throw new Error('stk rejected: ' + JSON.stringify(data));
  return { checkoutRequestId: data.CheckoutRequestID };
}

async function mpesaQuery(env, checkoutRequestId) {
  const ts = timestamp();
  const res = await fetch(darajaBase(env) + '/mpesa/stkpushquery/v1/query', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + (await darajaToken(env)), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      BusinessShortCode: env.DARAJA_SHORTCODE,
      Password: btoa(env.DARAJA_SHORTCODE + env.DARAJA_PASSKEY + ts),
      Timestamp: ts,
      CheckoutRequestID: checkoutRequestId,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data = await res.json().catch(() => ({}));
  // While the customer is still deciding Safaricom answers with an errorCode (e.g. 500.001.1001) and no ResultCode: ask again next run.
  if (data.ResultCode === undefined || data.ResultCode === '') return null;
  return { resultCode: Number(data.ResultCode), receipt: null, amount: null };
}

// ---------- Airtel Money (Open API) ----------
const airtelBase = (env) => (env.AIRTEL_ENV === 'production' ? 'https://openapi.airtel.africa' : 'https://openapiuat.airtel.africa');
let airtelCache = { token: null, exp: 0 };

async function airtelToken(env) {
  if (airtelCache.token && Date.now() < airtelCache.exp) return airtelCache.token;
  const res = await fetch(airtelBase(env) + '/auth/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: '*/*' },
    body: JSON.stringify({ client_id: env.AIRTEL_CLIENT_ID, client_secret: env.AIRTEL_CLIENT_SECRET, grant_type: 'client_credentials' }),
  });
  if (!res.ok) throw new Error('airtel oauth ' + res.status);
  const d = await res.json();
  airtelCache = { token: d.access_token, exp: Date.now() + Math.max(60, Number(d.expires_in || 3600) - 120) * 1000 };
  return airtelCache.token;
}

const airtelHeaders = async (env) => ({
  'Content-Type': 'application/json', Accept: '*/*', 'X-Country': 'KE', 'X-Currency': 'KES', Authorization: 'Bearer ' + (await airtelToken(env)),
});

async function airtelPush(env, { orderId, phone, amount }) {
  const res = await fetch(airtelBase(env) + '/merchant/v2/payments/', {
    method: 'POST',
    headers: await airtelHeaders(env),
    body: JSON.stringify({
      reference: 'Order ' + orderId,
      subscriber: { country: 'KE', currency: 'KES', msisdn: phone.replace(/^254/, '') },
      transaction: { amount, country: 'KE', currency: 'KES', id: orderId },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.status || data.status.success !== true) throw new Error('airtel rejected: ' + JSON.stringify(data));
  return { checkoutRequestId: (data.data && data.data.transaction && data.data.transaction.id) || orderId };
}

async function airtelQuery(env, id) {
  const res = await fetch(airtelBase(env) + '/standard/v1/payments/' + encodeURIComponent(id), { headers: await airtelHeaders(env) });
  if (!res.ok) return null;
  const d = await res.json().catch(() => null);
  const t = d && d.data && d.data.transaction;
  if (!t) return null;
  if (t.status === 'TS') return { resultCode: 0, receipt: t.airtel_money_id || null, amount: null };
  if (t.status === 'TF') return { resultCode: 1, receipt: null, amount: null };
  return null; // TA / in progress: ask again next run
}

// ---------- Public API ----------
export async function stkPush(env, { orderId, phone, amount, provider = 'mpesa' }) {
  if (env.PAYMENTS_MODE === 'mock') return { checkoutRequestId: 'mock_' + orderId };
  return provider === 'airtel' ? airtelPush(env, { orderId, phone, amount }) : mpesaPush(env, { orderId, phone, amount });
}

// Used by the reconciliation job when a callback never arrived, and to double-check Airtel callbacks.
// Returns null when the outcome is unknown yet.
export async function queryStatus(env, order) {
  if (env.PAYMENTS_MODE === 'mock') return null;
  return order.provider === 'airtel' ? airtelQuery(env, order.checkout_request_id) : mpesaQuery(env, order.checkout_request_id);
}

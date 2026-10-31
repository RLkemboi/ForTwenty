// Payment adapter. PAYMENTS_MODE=mock needs no provider account; otherwise the order's provider decides:
//   mpesa -> Safaricom Daraja STK push to a Till (Buy Goods)
//   airtel -> Airtel Money Open API collection (USSD push)
// The Daraja and Airtel paths are written but NOT yet tested: they need real credentials and approval.

// ---------- M-Pesa (Daraja) ----------
const darajaBase = (env) => (env.DARAJA_ENV === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke');
const timestamp = () => new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);

async function darajaToken(env) {
  const res = await fetch(darajaBase(env) + '/oauth/v1/generate?grant_type=client_credentials', {
    headers: { Authorization: 'Basic ' + btoa(env.DARAJA_KEY + ':' + env.DARAJA_SECRET) },
  });
  if (!res.ok) throw new Error('daraja oauth ' + res.status);
  return (await res.json()).access_token;
}

async function mpesaPush(env, { orderId, phone, amount }) {
  const ts = timestamp();
  // For a Till (Buy Goods): BusinessShortCode = the store number, PartyB = the till number.
  const res = await fetch(darajaBase(env) + '/mpesa/stkpush/v1/processrequest', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + (await darajaToken(env)), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      BusinessShortCode: env.DARAJA_SHORTCODE,
      Password: btoa(env.DARAJA_SHORTCODE + env.DARAJA_PASSKEY + ts),
      Timestamp: ts,
      TransactionType: 'CustomerBuyGoodsOnline',
      Amount: amount,
      PartyA: phone,
      PartyB: env.DARAJA_TILL,
      PhoneNumber: phone,
      CallBackURL: env.PUBLIC_URL + '/api/mpesa/callback/' + env.CALLBACK_SECRET,
      AccountReference: orderId.slice(0, 12),
      TransactionDesc: 'Order',
    }),
  });
  const data = await res.json();
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
  });
  const data = await res.json();
  if (data.ResultCode === undefined) return null;
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

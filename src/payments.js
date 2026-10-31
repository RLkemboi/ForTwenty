// Payment adapter. PAYMENTS_MODE=mock needs no Safaricom account; "daraja" calls the real API.
// The daraja path is written but NOT yet tested: it needs Safaricom credentials and, for production, approval.
const base = (env) => (env.DARAJA_ENV === 'production' ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke');

const timestamp = () => new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);

async function token(env) {
  const res = await fetch(base(env) + '/oauth/v1/generate?grant_type=client_credentials', {
    headers: { Authorization: 'Basic ' + btoa(env.DARAJA_KEY + ':' + env.DARAJA_SECRET) },
  });
  if (!res.ok) throw new Error('daraja oauth ' + res.status);
  return (await res.json()).access_token;
}

export async function stkPush(env, { orderId, phone, amount }) {
  if (env.PAYMENTS_MODE === 'mock') return { checkoutRequestId: 'mock_' + orderId };
  const ts = timestamp();
  // For a Till (Buy Goods): BusinessShortCode = the store number, PartyB = the till number.
  const res = await fetch(base(env) + '/mpesa/stkpush/v1/processrequest', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + (await token(env)), 'Content-Type': 'application/json' },
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

// Used by the reconciliation job when a callback never arrived. Returns null when unknown.
export async function queryStatus(env, checkoutRequestId) {
  if (env.PAYMENTS_MODE === 'mock') return null;
  const ts = timestamp();
  const res = await fetch(base(env) + '/mpesa/stkpushquery/v1/query', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + (await token(env)), 'Content-Type': 'application/json' },
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

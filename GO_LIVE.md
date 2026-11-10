# Going live: M-Pesa and WhatsApp

Both are built and tested in demo/mock mode. Neither has been tested against the real provider yet; that needs the accounts below.
Apply database changes first: `npx wrangler d1 execute DB --remote --file=migrations/0012_gear.sql` then `0013_whatsapp.sql`.

## M-Pesa (Safaricom Daraja, Till / Buy Goods)
1. Get a Till and a Daraja production app approved by Safaricom (Go Live on developer.safaricom.co.ke). You receive: consumer key, consumer secret, store number (shortcode), till number, passkey.
2. Secrets: `npx wrangler secret put DARAJA_KEY`, `DARAJA_SECRET`, `DARAJA_PASSKEY`, `DARAJA_SHORTCODE`, `DARAJA_TILL`, `CALLBACK_SECRET` (a long random string; it is the last part of the callback URL).
3. In `wrangler.toml` set `PAYMENTS_MODE = "daraja"` and `DARAJA_ENV = "production"` (use `sandbox` first with Safaricom's test shortcode).
4. Register the callback with Safaricom: `https://<PUBLIC_URL>/api/pay/cb/<CALLBACK_SECRET>` (the URL must not contain "mpesa" or "safaricom").
5. Deploy, then call `GET /api/admin/payments/check` with the admin token. It must show `missing: []`, `oauth: "ok"`, `ready: true`.
6. Place one real KSh 10-100 order to yourself and confirm: callback marks it paid, rider offer goes out, receipt number shows in /admin.
The 5-minute job also asks Safaricom about unpaid orders whose callback never arrived. That query does not return the M-Pesa receipt, so such orders show no receipt; check the M-Pesa statement.

## WhatsApp (Meta Cloud API)
1. In Meta Business: create a WhatsApp Business account, add the shop number, create an app. Note the Phone number ID, a permanent system-user token, and the App secret.
2. Create a Utility template named `order_update` (language `en`) whose body is exactly `{{1}}`; wait for approval. It is used for order updates outside WhatsApp's 24-hour reply window.
3. Secrets: `wrangler secret put WA_TOKEN`, `WA_VERIFY_TOKEN` (any random string you choose), `WA_APP_SECRET`.
4. `wrangler.toml`: set `WA_PHONE_NUMBER_ID`, `WHATSAPP_NUMBER` (digits only; this also shows the WhatsApp icon on the shop) and `WHATSAPP_MODE = "cloud"`. While testing set `WA_ALLOWLIST` to your own numbers.
5. Webhook in Meta: callback URL `https://<PUBLIC_URL>/api/whatsapp/webhook`, verify token = `WA_VERIFY_TOKEN`, subscribe to `messages`.
Customers get order confirmed / delivered / cancelled messages on WhatsApp, falling back to SMS if WhatsApp fails. Riders and owner alerts stay on SMS.
The bot answers MENU (items, gear, prices), ORDER, DELIVERY, HOURS, PAY, STATUS (the sender's own orders) and hands off on HUMAN. Every message in and out is logged (`GET /api/admin/whatsapp`).

## Not built yet
Checkout inside WhatsApp (pick items and pay in the chat). The bot currently sends the customer to the website to order.

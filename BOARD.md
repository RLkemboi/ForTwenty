# ForTwenty: to-do board

Paused on 2026-11-11. Read this first when you return, then ask what to pick up.

Client checklist (short, tick-boxes, share this one): https://claude.ai/artifact/JhKxDXfVUk2oR46QRVA4vq
Longer written version (older, same content): https://claude.ai/artifact/57TSt8WwEFEsEyK4yiQAX1

## Where we stopped

- **Stage 3 of 7: moving payments from sandbox to production.** Sandbox payments work (an order went through).
- Safaricom Go Live form is started and stuck at step 1: the username field had a name in it instead of the M-PESA Org Portal login username. Store number entered on the form: 8064328 (client to confirm). Till number not yet known.
- Live site is on `main`. Settings in `wrangler.toml`: `PAYMENTS_MODE = "daraja"`, `DARAJA_ENV = "sandbox"`, `WHATSAPP_MODE = "mock"`, `SMS_MODE = "mock"`.
- Green WhatsApp bubble is live and opens a chat with 0794297971 (`WHATSAPP_NUMBER = "254794297971"`).
- Inside/outside delivery location is live. Apartment names are placeholders ("Apartment block A" to "D") in `src/apartments.js`.

## Testing leftovers that must be undone before real customers

- [ ] Four items are at **KSh 1** in the live database (D1 `products`): id 1 Double Apple sample (normal 100), id 2 Double Apple packet (600), id 49 Small hookah night (800), id 55 Foil gear (100).
- [ ] **Delivery fees are all 0** in `wrangler.toml` (normal values are in the comments: base 50, per km 25, min 100, fallback 150).
- [ ] `DARAJA_ENV` must go to `"production"` only after Safaricom approves and the production secrets are in Cloudflare.

## Waiting on the client

Same items as the client checklist above; the longer written version has more detail.

- [ ] Till number, store number confirmation, Org Portal username, OTP, business details (section 1)
- [ ] Safaricom Go Live approval and production passkey, Consumer Key and Secret (section 1)
- [ ] WhatsApp number plan and Meta Business account (section 2)
- [ ] Africa's Talking account, sender name, credit (section 3)
- [ ] Final products, prices, photos, hours (section 4)
- [ ] Real apartment list, access notes, delivery fee rules, inside fee (section 5)
- [ ] Real riders and payout rules (section 6)
- [ ] Licences, age rules, product names, data-protection registration, refund policy (section 7)
- [ ] Account ownership, domain, admin holder, Airtel yes/no (section 8)
- [ ] Support contact, refund handler, dashboard watcher (section 9)

## Needs your decision

- [ ] **WhatsApp number plan:** keep 0794297971 for chatting by hand and use a second number for the bot, or move 0794297971 to the Cloud API. A number on the Cloud API normally cannot also be used in the WhatsApp Business app.
- [ ] **Flavour names:** many are well-known cannabis strain names (OG Kush, Blue Dream, Gelato, Runtz and others). Keep or rename. `DESIGN.md` says cannabis wording stays out of copy.
- [ ] **Age check:** the 18+ tick box is the only check. Decide whether it needs to be stronger.
- [ ] **Inside delivery fee:** flat amount or free.
- [ ] **Custom domain** or stay on `workers.dev`.
- [ ] **Automatic graph hook:** rebuild the knowledge graph on every commit (the install was blocked once; needs your OK).

## Ready to do when you come back (no client needed)

- [ ] Find out why 13 checks fail in `test.mjs`. Two were the rate limiter. The rest (Airtel off, heartbeat, rider SMS map link) were not confirmed as harmless. Run with `RATE_LIMIT_OFF=1`, `ENABLED_PROVIDERS=mpesa,airtel`, a monitor token.
- [ ] Draft the WhatsApp messages (greeting, away, order updates, FAQ answers) for client approval.
- [ ] Set up WhatsApp Business app greeting, away message and quick replies on the shop phone (shop staff).
- [ ] Draft the launch checklist and soft-launch plan.
- [ ] Add a refund and reconciliation note for whoever runs the shop.
- [ ] Look at why Cloudflare "Workers Builds" shows red on non-`main` branch builds (`main` builds fine).

## After the client delivers (my work)

- [ ] Put the real apartment names in `src/apartments.js`.
- [ ] Production payments: secrets in Cloudflare, switch `DARAJA_ENV`, run `/api/admin/payments/check`, one real KSh 10 to 100 test.
- [ ] Restore test prices and delivery fees.
- [ ] Real menu, prices and photos in the database; hide out-of-stock items.
- [ ] Real riders in; remove the demo riders.
- [ ] WhatsApp Cloud API and bot (needs the number decision first), then test with `WA_ALLOWLIST`.
- [ ] Live SMS (`SMS_MODE` to `"at"`, with `SMS_ALLOWLIST` while testing).
- [ ] Soft launch to known customers, then open to the public.

## Done

- [x] Shop, admin dashboard, rider page, hookah rentals and gear
- [x] Inside (apartment, floor, house number) or outside (map pin) delivery
- [x] Safaricom sandbox payments working end to end
- [x] Daraja callback URL fix (`/api/pay/cb/...`) and payment failure logging
- [x] Floating WhatsApp bubble with the shop number
- [x] Knowledge graph in `graphify-out/` and a `CLAUDE.md` that uses it first

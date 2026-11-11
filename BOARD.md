# ForTwenty: to-do board

Visual board (tick-boxes, view this first): https://claude.ai/artifact/KzkVxEN7spns3DqckKoNeo
Paused on 2026-11-11. Read this first when you return, then ask what to pick up.

Client checklist (short, tick-boxes, share this one): https://claude.ai/artifact/JhKxDXfVUk2oR46QRVA4vq
Longer written version (older, same content): https://claude.ai/artifact/57TSt8WwEFEsEyK4yiQAX1

## Where we stopped

- **Stage 3 of 7: moving payments from sandbox to production.** Sandbox payments work (an order went through).
- Safaricom Go Live form is started and stuck at step 1: the username field had a name in it instead of the M-PESA Org Portal login username. Store number entered on the form: 8064328 (client to confirm). Till number not yet known.
- Live site is on `main`. `wrangler.toml`: `PAYMENTS_MODE = "daraja"`, `DARAJA_ENV = "sandbox"`, `WHATSAPP_MODE = "mock"`, `SMS_MODE = "mock"`.
- Green WhatsApp bubble is live and opens a chat with 0794297971 (`WHATSAPP_NUMBER = "254794297971"`).
- Inside/outside delivery location is live. Apartment names are placeholders ("Apartment block A" to "D") in `src/apartments.js`.
- **New requirement: the client wants the shop to be invite only.** Not designed or built yet. The shop is currently public at `fortwenty.kipp-ralph.workers.dev`.

## Priority matrix (urgent / important)

### Do first (urgent and important)
- [ ] Org Portal username and one-time code, to finish Safaricom Go Live (client)
- [ ] Till number and store number (client; store entered: 8064328)
- [ ] Close the shop in `/admin` ("Close the shop now"), or put the KSh 1 items back. The live shop is public with 4 test prices: ids 1, 2, 49, 55 (normal 100, 600, 800, 100).

### Schedule (important, not urgent)
- [ ] **Invite-only shop: choose how, then build it.** Options: (a) an invite code entered before ordering, (b) a list of approved phone numbers managed in `/admin` (the app already has a blocked-phones list to build on), (c) approve each person on request over WhatsApp. Leaning (b): payments are phone based and it needs no code to share. Also decide how invites are sent and whether the public pages stay visible. Confirm with the client what "invite only" means to them.
- [ ] WhatsApp number plan and Meta account. Chat by hand on 0794297971 plus a second number for the bot, or move 0794297971 to the Cloud API.
- [ ] Live SMS: Africa's Talking account and sender name; set `SMS_MODE` to `"at"`, with `SMS_ALLOWLIST` while testing.
- [ ] Final menu, prices and photos (client)
- [ ] Real apartments, access notes and delivery fee rules (client). Fees are 0 for testing; normal: base 50, per km 25, min 100, flat 150.
- [ ] Real riders and payout rules (client); remove the demo riders
- [ ] Licences, age check, flavour names (many match cannabis strain names), data-protection registration, refund policy
- [ ] Production payments after Safaricom approves: secrets in Cloudflare, `DARAJA_ENV = "production"`, `/api/admin/payments/check`, one real KSh 10 to 100 test
- [ ] Put back prices and delivery fees before real customers
- [ ] Find why 13 checks fail in `test.mjs` (2 were the rate limiter; run with `RATE_LIMIT_OFF=1`, `ENABLED_PROVIDERS=mpesa,airtel`, a monitor token)
- [ ] Soft-launch plan, then open
- [ ] Who owns the accounts, who handles support and refunds (client)

### Quick or hand off (urgent, not important)
- [ ] Send the client the Launch Checklist (share it from the page)
- [ ] WhatsApp Business greeting, away message and quick replies on the shop phone (shop staff)
- [ ] Draft the WhatsApp and SMS wording for client approval (me)
- [ ] Write a refund and receipt-check note (me)

### Later (not urgent, not important)
- [ ] Own web address instead of `workers.dev`
- [ ] Airtel Money (built, hidden)
- [ ] Auto-rebuild the knowledge graph on every commit (needs your OK to install the hook)
- [ ] Red Cloudflare "Workers Builds" checks on non-`main` branches (`main` builds fine)

## Done

- [x] Shop, admin dashboard, rider page, hookah rentals and gear
- [x] Inside (apartment, floor, house number) or outside (map pin) delivery
- [x] Safaricom sandbox payments working end to end
- [x] Daraja callback URL fix (`/api/pay/cb/...`) and payment failure logging
- [x] Floating WhatsApp bubble with the shop number
- [x] Knowledge graph in `graphify-out/` and a `CLAUDE.md` that uses it first
- [x] Client checklist and this board

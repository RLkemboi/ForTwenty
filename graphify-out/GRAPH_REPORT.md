# Graph Report - ForTwenty  (2026-11-10)

## Corpus Check
- Corpus is ~38,994 words - fits in a single context window. You may not need a graph.

## Summary
- 372 nodes · 558 edges · 34 communities (21 shown, 13 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 17 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Worker Core (index.js)
- Main Order Tests
- Uptime Monitor Workflow
- Rider Offers and Auth Schema
- Hardening Tests
- Rentals Tests
- Phone and SMS Delivery
- Admin API Endpoints
- M-Pesa and Airtel Payments
- Menu Tests
- Package and Dependencies
- Offer Tests
- WhatsApp and Go-Live
- Design Lock and Flavours API
- Checkout and Payment Flow
- Pricing Tests
- Monitor Script
- Shop Rail and Quote UI
- Admin and Privacy Pages
- WhatsApp Tables
- Rate-limit Tests
- End-to-end Browser Test
- Auth-fail Migration
- Third Parties and Map
- CSV Export
- Flavors Migration
- Blocked Phones Migration
- Monitor Beat Migration
- Settings Migration

## God Nodes (most connected - your core abstractions)
1. `fetch()` - 35 edges
2. `alertOwners()` - 11 edges
3. `sendSms()` - 11 edges
4. `offerOrder()` - 10 edges
5. `createOrder()` - 10 edges
6. `normalizePhone()` - 10 edges
7. `reconcile()` - 9 edges
8. `load()` - 9 edges
9. `advanceQueue()` - 8 edges
10. `assignRider()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `Demo mode payment simulator` --conceptually_related_to--> `GO_LIVE.md (M-Pesa and WhatsApp go-live)`  [INFERRED]
  public/index.html → GO_LIVE.md
- `Payment providers (M-Pesa, Airtel Money)` --conceptually_related_to--> `M-Pesa Daraja go-live steps`  [INFERRED]
  public/index.html → GO_LIVE.md
- `GET /api/admin/payments/check` --conceptually_related_to--> `admin.html (owner admin page)`  [INFERRED]
  GO_LIVE.md → public/admin.html
- `idx_orders_ip_created` --indexes--> `orders`  [EXTRACTED]
  migrations/0007_order_ip.sql → schema.sql
- `riders_token` --indexes--> `riders`  [EXTRACTED]
  migrations/0008_rider_offers.sql → schema.sql

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Customer checkout flow** — public_index_openorder, public_index_cart, public_index_resolvephone, public_index_mappin, public_index_checkout, public_index_renderprog [EXTRACTED 1.00]
- **Product art rendering pipeline** — design_productart, public_index_packart, public_index_hookahart, public_index_shade [EXTRACTED 1.00]
- **Admin operations dashboard** — public_admin_load, public_admin_render, public_admin_stage, public_admin_rendermenu, public_admin_riders, public_admin_export [EXTRACTED 1.00]

## Communities (34 total, 13 thin omitted)

### Community 0 - "Worker Core (index.js)"
Cohesion: 0.11
Nodes (49): acceptOffer(), adminOk(), advanceQueue(), alertOwners(), AREA, assignRider(), bearerOk(), clientIp() (+41 more)

### Community 1 - "Main Order Tests"
Cohesion: 0.07
Nodes (31): a, ADMIN, air, airFail, airRow, aToken, b, c (+23 more)

### Community 2 - "Uptime Monitor Workflow"
Cohesion: 0.07
Nodes (26): runs-on, steps, timeout-minutes, concurrency, cancel-in-progress, group, ALERT_PHONES, AT_API_KEY (+18 more)

### Community 3 - "Rider Offers and Auth Schema"
Cohesion: 0.13
Nodes (19): idx_orders_ip_created, riders_token, auth_fail, auth_fail_ip, blocked_phones, flavors, health, ledger (+11 more)

### Community 4 - "Hardening Tests"
Cohesion: 0.11
Nodes (18): ADMIN, bad, c, d1, d2, d3, get(), l (+10 more)

### Community 5 - "Rentals Tests"
Cohesion: 0.11
Nodes (15): ADMIN, hook(), med, o, sign(), want, ADMIN, gear (+7 more)

### Community 6 - "Phone and SMS Delivery"
Cohesion: 0.21
Nodes (17): normalizePhone(), phoneList(), deliver(), isRetryable(), MAX_ATTEMPTS, RETRY_WINDOW_MS, retryFailed(), botReply() (+9 more)

### Community 7 - "Admin API Endpoints"
Cohesion: 0.15
Nodes (17): /api/admin/blocked, /api/admin/menu (flavor, product, size), /api/admin/monitor, /api/admin/orders, /api/admin/orders/:id/cancel|reassign, /api/admin/riders (+ update, reset-link, settle), /api/admin/shop, /api/admin/sms (+9 more)

### Community 8 - "M-Pesa and Airtel Payments"
Cohesion: 0.25
Nodes (16): airtelBase(), airtelCache, airtelHeaders(), airtelPush(), airtelQuery(), airtelToken(), checkPayments(), DARAJA_REQUIRED (+8 more)

### Community 9 - "Menu Tests"
Cohesion: 0.13
Nodes (14): ADMIN, cr, eo, o1, o2, order(), packet, pay() (+6 more)

### Community 10 - "Package and Dependencies"
Cohesion: 0.17
Nodes (12): author, description, devDependencies, wrangler@^4.156.0, keywords, license, main, name (+4 more)

### Community 11 - "Offer Tests"
Cohesion: 0.24
Nodes (9): act(), ADMIN, getJ(), paidOrder(), post(), rl, sms(), st() (+1 more)

### Community 12 - "WhatsApp and Go-Live"
Cohesion: 0.20
Nodes (11): /api/config, /api/demo/pay/:id, GO_LIVE.md (M-Pesa and WhatsApp go-live), GET /api/admin/whatsapp (message log), D1 migrations 0012_gear.sql, 0013_whatsapp.sql, Not built: checkout inside WhatsApp, WhatsApp bot commands (MENU, ORDER, DELIVERY, HOURS, PAY, STATUS, HUMAN), /api/whatsapp/webhook (+3 more)

### Community 13 - "Design Lock and Flavours API"
Cohesion: 0.24
Nodes (9): /api/flavors, DESIGN.md (design lock), Fonts: Unbounded, Inter, Great Vibes, Comic product art language, Honour prefers-reduced-motion, Strict CSP on server pages, index.html (shop front end), hookahArt() (+1 more)

### Community 14 - "Checkout and Payment Flow"
Cohesion: 0.20
Nodes (9): /api/orders (POST) and /api/orders/:id (poll), M-Pesa Daraja go-live steps, /api/mpesa/callback/<CALLBACK_SECRET>, 5-minute unpaid-order reconciliation job, stage() and progress() order tracker, Checkout flow (confirm number, POST order, poll), Payment providers (M-Pesa, Airtel Money), renderProg() progress steps (+1 more)

### Community 15 - "Pricing Tests"
Cohesion: 0.24
Nodes (8): ADMIN, getJ(), near, nopin, order(), post(), q(), SHOP

### Community 16 - "Monitor Script"
Cohesion: 0.28
Nodes (6): api(), base, normalizePhone(), openIssue(), sendSms(), WAIT_MS

### Community 17 - "Shop Rail and Quote UI"
Cohesion: 0.29
Nodes (8): /api/quote, Record rail shop home, buildRows() and SIZE_ROWS, Order total and quote (items + delivery fee), openDetail / closeDetail / swapDetail, makeRail(), openOrder(), switchBg() background colour wipe

### Community 18 - "Admin and Privacy Pages"
Cohesion: 0.32
Nodes (8): Whole-site dark system (tokens, fonts), GET /api/admin/payments/check, admin.html (owner admin page), call() fetch helper, privacy.html (privacy notice), Data subject rights (DPA 2019), Unfilled placeholders (business name, retention, contact, date), theme.css shared tokens

### Community 19 - "WhatsApp Tables"
Cohesion: 0.50
Nodes (3): wa_contacts, wa_inbound, wa_log

### Community 23 - "Third Parties and Map"
Cohesion: 0.67
Nodes (3): SMS log (Africa's Talking), Map pin (Leaflet, geolocation), Third parties: Safaricom, Airtel, Africa's Talking, Cloudflare, OpenStreetMap

## Knowledge Gaps
- **20 isolated node(s):** `Strict CSP on server pages`, `D1 migrations 0012_gear.sql, 0013_whatsapp.sql`, `/api/mpesa/callback/<CALLBACK_SECRET>`, `5-minute unpaid-order reconciliation job`, `/api/whatsapp/webhook` (+15 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 163 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **13 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `render()` connect `Admin API Endpoints` to `Checkout and Payment Flow`, `Third Parties and Map`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `sendSms()` (e.g. with `completeDelivery()` and `fetch()`) actually correct?**
  _`sendSms()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Strict CSP on server pages`, `D1 migrations 0012_gear.sql, 0013_whatsapp.sql`, `/api/mpesa/callback/<CALLBACK_SECRET>` to the rest of the system?**
  _20 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Worker Core (index.js)` be split into smaller, more focused modules?**
  _Cohesion score 0.10901960784313726 - nodes in this community are weakly interconnected._
- **Why does `M-Pesa Daraja go-live steps` connect `Checkout and Payment Flow` to `Admin and Privacy Pages`, `WhatsApp and Go-Live`?**
  _High betweenness centrality (0.010) - this node is a cross-community bridge._
- **Should `Main Order Tests` be split into smaller, more focused modules?**
  _Cohesion score 0.07386363636363637 - nodes in this community are weakly interconnected._
- **Why does `stage() and progress() order tracker` connect `Checkout and Payment Flow` to `Admin API Endpoints`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
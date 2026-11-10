# Graph Report - ForTwenty  (2026-11-10)

## Corpus Check
- 36 files · ~39,956 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 10 file(s) not represented in the graph (top: .woff2 5, (none) 2, .css 2)

## Summary
- 468 nodes · 729 edges · 39 communities (26 shown, 13 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 28 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `1db756da`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- index.js
- load() refresh all admin data
- test.mjs
- WhatsApp Meta Cloud API integration
- env
- leaflet.js
- schema.sql
- test_hardening.mjs
- test_whatsapp.mjs
- payments.js
- test_menu.mjs
- package.json
- test_offers.mjs
- makeRail() flavour slider rail
- F
- e
- test_pricing.mjs
- p
- monitor.mjs
- Jt
- d
- i
- 0013_whatsapp.sql
- bi
- oi
- test_ratelimit.mjs
- e2e.cjs
- 0011_auth_fail.sql
- /api/admin/export
- 0002_flavors.sql
- 0004_blocked.sql
- 0006_monitor_beat.sql
- 0009_settings.sql
- whatsapp.js

## God Nodes (most connected - your core abstractions)
1. `fetch()` - 35 edges
2. `alertOwners()` - 11 edges
3. `createOrder()` - 11 edges
4. `sendSms()` - 11 edges
5. `load() refresh all admin data` - 11 edges
6. `offerOrder()` - 10 edges
7. `normalizePhone()` - 10 edges
8. `e()` - 9 edges
9. `p()` - 9 edges
10. `m()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `Third-party processors (Safaricom, Airtel, Africa's Talking, Cloudflare, OpenStreetMap)` --semantically_similar_to--> `M-Pesa Safaricom Daraja integration`  [INFERRED] [semantically similar]
  public/privacy.html → GO_LIVE.md
- `Data collected (phone, delivery spot, order, IP)` --shares_data_with--> `WhatsApp Meta Cloud API integration`  [INFERRED]
  public/privacy.html → GO_LIVE.md
- `idx_orders_ip_created` --indexes--> `orders`  [EXTRACTED]
  migrations/0007_order_ip.sql → schema.sql
- `riders_token` --indexes--> `riders`  [EXTRACTED]
  migrations/0008_rider_offers.sql → schema.sql
- `stage()/progress() order progress tracker` --semantically_similar_to--> `poll()/renderProg() order status progress`  [INFERRED] [semantically similar]
  public/admin.html → public/index.html

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Admin dashboard data load** — public_admin_load, api_admin_orders, api_admin_riders, api_admin_sms, api_admin_blocked, api_admin_monitor, api_admin_shop, api_admin_menu [EXTRACTED 1.00]
- **Customer ordering and payment flow** — public_index_openorder, public_index_setpin, public_index_refreshquote, public_index_submit, public_index_poll, api_orders [EXTRACTED 1.00]
- **M-Pesa payment go-live flow** — go_live_daraja, go_live_payment_callback, go_live_payments_check, go_live_reconcile_job, go_live_wrangler_config [EXTRACTED 1.00]
- **Product art family** — design_samples, design_packets, design_hookah_rentals, design_product_art [EXTRACTED 1.00]
- **Shop startup bootstrap** — public_index_startup, api_health, api_flavors, api_config [EXTRACTED 1.00]
- **WhatsApp messaging setup** — go_live_whatsapp, go_live_order_update_template, go_live_whatsapp_webhook, go_live_whatsapp_bot, go_live_sms_fallback [EXTRACTED 1.00]

## Communities (39 total, 13 thin omitted)

### Community 0 - "index.js"
Cohesion: 0.10
Nodes (53): APARTMENTS, clean(), insideAddress(), acceptOffer(), adminOk(), advanceQueue(), alertOwners(), AREA (+45 more)

### Community 1 - "load() refresh all admin data"
Cohesion: 0.07
Nodes (34): /api/admin/blocked (+ remove), /api/admin/menu (+ flavor, product, size), /api/admin/monitor, /api/admin/orders (+ cancel, reassign), /api/admin/riders (+ update, reset-link, settle), /api/admin/shop, /api/admin/sms, /api/config (+26 more)

### Community 2 - "test.mjs"
Cohesion: 0.07
Nodes (35): a, ADMIN, air, airFail, airRow, aToken, b, c (+27 more)

### Community 3 - "WhatsApp Meta Cloud API integration"
Cohesion: 0.09
Nodes (27): Dark design system (tokens, fonts, pill, chevrons), Design lock (Kabarak Delivery shop), Self-hosted fonts (Unbounded, Inter, Great Vibes), Hookah rentals (per night), Packets (KSh 600 pouch), Comic-style product art, Shop home record rail, Samples (KSh 100 cone) (+19 more)

### Community 4 - "env"
Cohesion: 0.07
Nodes (26): runs-on, steps, timeout-minutes, concurrency, cancel-in-progress, group, ALERT_PHONES, AT_API_KEY (+18 more)

### Community 5 - "leaflet.js"
Cohesion: 0.09
Nodes (4): a(), Ci(), l(), x()

### Community 6 - "schema.sql"
Cohesion: 0.13
Nodes (19): idx_orders_ip_created, riders_token, auth_fail, auth_fail_ip, blocked_phones, flavors, health, ledger (+11 more)

### Community 7 - "test_hardening.mjs"
Cohesion: 0.11
Nodes (18): ADMIN, bad, c, d1, d2, d3, get(), l (+10 more)

### Community 8 - "test_whatsapp.mjs"
Cohesion: 0.11
Nodes (15): ADMIN, hook(), med, o, sign(), want, ADMIN, gear (+7 more)

### Community 9 - "payments.js"
Cohesion: 0.27
Nodes (15): airtelBase(), airtelCache, airtelHeaders(), airtelPush(), airtelQuery(), airtelToken(), DARAJA_REQUIRED, darajaBase() (+7 more)

### Community 10 - "test_menu.mjs"
Cohesion: 0.13
Nodes (14): ADMIN, cr, eo, o1, o2, order(), packet, pay() (+6 more)

### Community 11 - "package.json"
Cohesion: 0.17
Nodes (12): author, description, devDependencies, wrangler@^4.156.0, keywords, license, main, name (+4 more)

### Community 12 - "test_offers.mjs"
Cohesion: 0.24
Nodes (9): act(), ADMIN, getJ(), paidOrder(), post(), rl, sms(), st() (+1 more)

### Community 13 - "makeRail() flavour slider rail"
Cohesion: 0.18
Nodes (11): /api/quote, Delivery area limited to max_km around Kabarak, openDetail()/closeDetail()/swapDetail() product detail view, Leaflet map library (vendor), makeRail() flavour slider rail, openOrder() order popup dialog, Ordering flow: pick flavor, enter phone and pin, approve prompt, rider delivers, packArt() / hookahArt() generated product SVG art (+3 more)

### Community 14 - "F"
Cohesion: 0.24
Nodes (11): F(), G(), h(), j(), k(), ke(), me(), Oe() (+3 more)

### Community 15 - "e"
Cohesion: 0.27
Nodes (10): c(), e(), hi(), m(), q(), Qe(), ve(), xe() (+2 more)

### Community 16 - "test_pricing.mjs"
Cohesion: 0.24
Nodes (8): ADMIN, getJ(), near, nopin, order(), post(), q(), SHOP

### Community 17 - "p"
Cohesion: 0.22
Nodes (9): Ae(), be(), De(), ei(), Ie(), ii(), p(), pe() (+1 more)

### Community 18 - "monitor.mjs"
Cohesion: 0.28
Nodes (6): api(), base, normalizePhone(), openIssue(), sendSms(), WAIT_MS

### Community 19 - "Jt"
Cohesion: 0.29
Nodes (7): Jt(), Le(), O(), Qt(), Re(), $t(), te()

### Community 20 - "d"
Cohesion: 0.33
Nodes (6): at(), d(), ht(), Li(), v(), W()

### Community 21 - "i"
Cohesion: 0.50
Nodes (5): i(), Mi(), ne(), e(), zi()

### Community 22 - "0013_whatsapp.sql"
Cohesion: 0.50
Nodes (3): wa_contacts, wa_inbound, wa_log

### Community 23 - "bi"
Cohesion: 0.50
Nodes (4): bi(), Pi(), Ti(), u()

### Community 24 - "oi"
Cohesion: 0.67
Nodes (4): Je(), ni(), oi(), si()

### Community 38 - "whatsapp.js"
Cohesion: 0.21
Nodes (17): normalizePhone(), phoneList(), deliver(), isRetryable(), MAX_ATTEMPTS, RETRY_WINDOW_MS, retryFailed(), botReply() (+9 more)

## Knowledge Gaps
- **29 isolated node(s):** `/api/admin/monitor`, `/api/admin/sms`, `/api/demo/pay/:id`, `/api/flavors`, `/api/health` (+24 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 195 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **13 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `buildRows() product rows (samples, packets, hookah rental, gear)` connect `load() refresh all admin data` to `makeRail() flavour slider rail`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `sendSms()` (e.g. with `completeDelivery()` and `fetch()`) actually correct?**
  _`sendSms()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `/api/admin/monitor`, `/api/admin/sms`, `/api/demo/pay/:id` to the rest of the system?**
  _29 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `index.js` be split into smaller, more focused modules?**
  _Cohesion score 0.09675324675324676 - nodes in this community are weakly interconnected._
- **Should `load() refresh all admin data` be split into smaller, more focused modules?**
  _Cohesion score 0.07394957983193277 - nodes in this community are weakly interconnected._
- **Should `test.mjs` be split into smaller, more focused modules?**
  _Cohesion score 0.06606606606606606 - nodes in this community are weakly interconnected._
- **Should `WhatsApp Meta Cloud API integration` be split into smaller, more focused modules?**
  _Cohesion score 0.08620689655172414 - nodes in this community are weakly interconnected._
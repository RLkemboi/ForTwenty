# ForTwenty message wording: DRAFT for approval

Status: draft for the owner and the client. Nothing here is live. No code was changed.
Placeholders in [square brackets] are listed in section 5. Fees are never stated; write [fee] until the fee is decided.
"Current" text is quoted from the code as of this draft. Line numbers are in `src/whatsapp.js` and `src/index.js`.
Order numbers below (ORD-1234) are examples only, so SMS lengths are approximate.

---

## 1. WhatsApp Business app (set by hand on the shop phone, number 0794297971)

### 1.1 Greeting message
```
Hi, welcome to ForTwenty. We take orders from 8:00 am to midnight. Order on our website: https://fortwenty.kipp-ralph.workers.dev or tell us what you need here.
```

### 1.2 Away message (outside 8:00 am to midnight)
```
Hi, thanks for writing to ForTwenty. We are closed now. We take orders from 8:00 am to midnight. We will reply when we open. You can also order any time on https://fortwenty.kipp-ralph.workers.dev
```
Note: the website itself may refuse orders when closed; see question Q6.

### 1.3 Quick replies

Quick reply: hours
```
We take orders from 8:00 am to midnight, every day.
```

Quick reply: delivery area
```
We deliver within 3 km of Kabarak University. The delivery fee is [fee] and is shown on the website before you pay: https://fortwenty.kipp-ralph.workers.dev
```

Quick reply: how to pay
```
You pay with M-Pesa. After you place your order on the website, a payment prompt comes to your phone. Enter your M-Pesa PIN to approve. We will never ask for your PIN here on WhatsApp.
```

Quick reply: payment failed
```
Sorry the payment did not go through. Please check that your phone is on and has network, then place the order again on https://fortwenty.kipp-ralph.workers.dev and approve the M-Pesa prompt. If money was taken from your M-Pesa, send us the M-Pesa message here and we will check it for you.
```

Quick reply: talk to a person
```
Sure. A team member will reply here during [support hours]. Please share your order number if you have one.
```

---

## 2. Bot replies (src/whatsapp.js, function `botReply`)

How keywords are matched (line 62): whole words only for words under 5 letters, so "hour" matches but "hours" does not. Words of 5+ letters also match longer forms. Matching runs top to bottom and the first match wins. See bug B1.

Site address in all replies is `env.PUBLIC_URL`, which is https://fortwenty.kipp-ralph.workers.dev.

### 2.1 MENU (also: price, catalogue, flavor, gear, hookah)
Current (line 88):
```
Here is our menu:

<catalogue from the database: Samples / Packets / Hookah rental (per night) / Hookah gear, each line "Name KSh price">

Delivery to Kabarak is extra. To order, open https://fortwenty.kipp-ralph.workers.dev and tap the item you want.
```
Verdict: mostly fine. "Delivery to Kabarak is extra" is slightly vague. Section titles come from code (lines 69-70). Suggested ending only:
```
Delivery is charged separately. To order, open https://fortwenty.kipp-ralph.workers.dev and tap the item you want.
```

### 2.2 STATUS (also: my order, where is, track, confirm)
Current, no orders (line 76):
```
We have no orders for this number yet. Reply MENU to see what we sell.
```
Current, with orders (line 78), one line per order, latest 3:
```
Your latest orders:
- ORD-1234: 2 x <product>, KSh 1,500 - <label>
```
Labels (line 77): awaiting_payment = "waiting for payment", paid = "paid, finding a rider", assigned = "on the way", delivered = "delivered", payment_failed = "payment failed", expired = "expired", cancelled = "cancelled", amount_mismatch = "being checked by us".
Verdict: fine, with two wording issues. "on the way" is shown as soon as a rider accepts, before they have left; it can read like a time promise. "expired" is unclear to a customer. Suggested labels:
- assigned: "a rider has been assigned"
- expired: "not paid in time, please order again"
- payment_failed: "payment did not go through"
- amount_mismatch: "being checked by us, we will contact you"
Suggested no-orders text:
```
We cannot see any orders for this number yet. Reply MENU to see what we sell.
```

### 2.3 DELIVERY (also: deliver, fee, how far, area, location, kabarak)
Current (line 92):
```
We deliver within 3 km of Kabarak University. The fee depends on distance: from KSh 100, shown before you pay when you pin your location at https://fortwenty.kipp-ralph.workers.dev.
```
The number comes from `DELIVERY_MIN_KES || 100`. In the current test config DELIVERY_MIN_KES = "0" (a non-empty string, so the `||` does not fall back), so the bot would say "from KSh 0". See bug B2.
Suggested (no amount stated):
```
We deliver within 3 km of Kabarak University. The delivery fee is [fee] and is shown on the website before you pay: https://fortwenty.kipp-ralph.workers.dev
```
(Do not use the fee wording until the fee is decided. Code change needed: the bot must not print a number.)

### 2.4 HOURS (also: hour, open, close, time)
Current (line 94):
```
We take orders from 8 am to midnight, every day.
```
Verdict: fine. Suggested small polish: "We take orders from 8:00 am to midnight, every day." The reply works for "hour" or "open" but NOT for the word "hours" (bug B1).

### 2.5 PAY (also: pay, mpesa, m pesa, till, airtel)
Current (line 95):
```
You pay on your phone: after you place the order you get an M-Pesa prompt. Enter your PIN to approve. We never ask for your PIN or card details on WhatsApp.
```
Verdict: fine and clear. Optional: say "M-Pesa PIN". The reply works for "pay" but not "payment" (bug B1).

### 2.6 Age check (also: age, 18, adult, underage)
Current (line 96):
```
You must be 18 or older to order. We confirm this when you order.
```
Verdict: fine. Not listed in the greeting menu; that is acceptable.

### 2.7 ORDER (also: order, orders, buy, checkout)
Current (line 97):
```
To order, open https://fortwenty.kipp-ralph.workers.dev, pick your item, pin your location and pay with M-Pesa. Once paid, we confirm the order here.
```
Verdict: unclear in one place. Customers can also choose an apartment, so "pin your location" is not the only way (see CLAUDE.md: inside = apartment, floor, house number; outside = map pin). Suggested:
```
To order, open https://fortwenty.kipp-ralph.workers.dev, pick your item, tell us where to deliver and pay with M-Pesa. Once you have paid, we confirm your order here.
```

### 2.8 HUMAN (also: human, agent, person, call, help me, complain, refund)
Current (line 98):
```
Thanks. A team member will reply here as soon as possible during opening hours.
```
Verdict: fine, and it does not promise a refund. Note the word "refund" also triggers this reply, which is good. Suggested wording uses support hours once the client confirms them:
```
Thanks. A team member will reply here during [support hours].
```

### 2.9 Greeting (also: hi, hello, hey, start, help, habari, mambo, sasa)
Current (line 100):
```
Hi, welcome to Kabarak Delivery. Reply with:
MENU - see items and prices
ORDER - how to order
DELIVERY - areas and fees
HOURS - when we are open
PAY - how payment works
STATUS - check your latest order
```
Problems: the shop name is "Kabarak Delivery", not ForTwenty (bug B3); HOURS does not work (bug B1); HUMAN is not listed here. Suggested:
```
Hi, welcome to ForTwenty. Reply with:
MENU - items and prices
ORDER - how to order
DELIVERY - area and fee
HOURS - when we are open
PAY - how payment works
STATUS - check your latest order
HUMAN - talk to a person
```

### 2.10 Fallback (nothing matched)
Current (line 102):
```
Sorry, I did not get that. Reply MENU, ORDER, DELIVERY, HOURS, PAY or STATUS, or HUMAN to talk to us.
```
Verdict: fine, but it invites HOURS, which fails today (bug B1), so the customer loops. Keep the text once the matching is fixed.

### 2.11 Non-text message (photo, voice note, etc.)
Current (line 119):
```
Hi, I can only read text messages. Reply MENU to see what we sell.
```
Verdict: fine. Suggested: "Hi, I can only read text messages. Please type MENU, ORDER or HUMAN."

---

## 3. Order update messages (WhatsApp template and SMS fallback)

Reminder: the WhatsApp template is named `order_update` (language `en`), category Utility, and its body must be exactly `{{1}}` (one variable, nothing else; GO_LIVE.md step 2 of the WhatsApp section). Meta must approve it before use. Whatever text the code passes becomes {{1}}. Outside WhatsApp's 24-hour window only the template works (whatsapp.js line 49); inside it, the same text goes as a plain message (line 46). Newlines and tabs are replaced by spaces in the template and the text is cut at 1000 characters (line 49), so keep these messages short and on one line. If WhatsApp fails, the same text goes by SMS (whatsapp.js lines 129-135).
Note that Meta may reject a template whose body is only a variable. If it does, the client must decide on fixed wording around {{1}} and the code stays the same.

### 3.1 Order confirmed (payment received)
Code (index.js line 190):
```js
await notifyCustomer(env, order.phone, `Payment of KSh ${order.total_kes} received. Order ${order.id} is confirmed and is being assigned to a rider.`, sendSms);
```
Sent text example: `Payment of KSh 1500 received. Order ORD-1234 is confirmed and is being assigned to a rider.` (91 characters.)
Verdict: clear. It does not promise a time. "being assigned to a rider" is fine. Suggested (shorter, names the shop):
```
ForTwenty: we have received your payment of KSh 1500. Order ORD-1234 is confirmed and we are finding a rider.
```
(About 107 characters. As an SMS it is under 160.)

### 3.2 Order delivered
Code (index.js line 120):
```js
await notifyCustomer(env, o.phone, `Order ${o.id} delivered. Thank you.`, sendSms);
```
Sent text example: `Order ORD-1234 delivered. Thank you.` (36 characters.)
Verdict: fine but bare. Suggested:
```
ForTwenty: order ORD-1234 has been delivered. Thank you for ordering. If anything is wrong, reply here or WhatsApp 0794297971.
```
(About 125 characters.)

### 3.3 Order cancelled
Code (index.js line 605):
```js
await notifyCustomer(env, o.phone, `Order ${o.id} was cancelled. If you were charged, we will refund you.`, sendSms);
```
Sent text example: `Order ORD-1234 was cancelled. If you were charged, we will refund you.` (70 characters.)
Verdict: this promises a refund. Refunds are done by hand, so the wording should not say we will refund automatically. Suggested:
```
ForTwenty: order ORD-1234 was cancelled. If money was taken from your M-Pesa, WhatsApp us on 0794297971 with your M-Pesa message and we will check it.
```
(About 150 characters.)
Question Q4: does the client want to say "we will check and return it" or keep it neutral as above?

---

## 4. SMS (src/index.js, sent through `sendSms` in src/sms.js)

Customer texts (3.1 to 3.3 above) are also sent by SMS when WhatsApp is off or fails. They are not repeated here. SMS lengths are for example values; real lengths depend on the address, order id and link.
SMS text limit is 160 characters for one message; longer texts are billed as several.

### 4.1 Rider: new delivery offer (index.js line 72)
Current:
```js
`New delivery offer: ${o.address}. You earn KSh ${riderCut(env, o)}. Open within ${Math.round(offerMs(env) / 60000) || 1} min to accept: ${riderLink(env, pick)}`
```
Example: `New delivery offer: Apartment A, Floor 2, House 5. You earn KSh 100. Open within 2 min to accept: https://fortwenty.kipp-ralph.workers.dev/r/<token>` (about 161 characters with a 20-character token and a short address; usually just over 160).
Verdict: clear. Long addresses push it to two SMS. Suggested:
```
ForTwenty offer: Apartment A, Floor 2, House 5. You earn KSh 100. Accept within 2 min: https://fortwenty.kipp-ralph.workers.dev/r/<token>
```
(About 140 characters.)

### 4.2 Rider: delivery details after accepting (index.js line 102 via `detailsSms`, defined at line 55)
Current:
```js
`Delivery: ${o.address}.${o.lat != null ? ' Map: ' + mapLink(o.lat, o.lng) + '.' : ''} Call customer: +${o.phone}. Paid KSh ${o.total_kes}. Mark delivered: ${env.PUBLIC_URL}/d/${o.delivery_token}`
```
Example: `Delivery: Apartment A, Floor 2, House 5. Map: https://maps.google.com/?q=-0.168000,35.965000. Call customer: +254712345678. Paid KSh 1500. Mark delivered: https://fortwenty.kipp-ralph.workers.dev/d/<token>` (about 218 characters, two SMS).
Verdict: clear for a rider, but long. "Paid KSh" is the order total, which may confuse a rider who earns only the fee; see question Q7. Suggested:
```
Delivery: Apartment A, Floor 2, House 5. Map: <link>. Customer: +254712345678. Order paid, total KSh 1500. When done tap: https://fortwenty.kipp-ralph.workers.dev/d/<token>
```
(Still about 200; two SMS is unavoidable with a map link. Acceptable.)

### 4.3 Rider: delivery details, demo mode (index.js line 160) and legacy mode (index.js line 178)
Current text is identical to 4.2, written out again in each place:
```js
`Delivery: ${o.address}.${o.lat != null ? ' Map: ' + mapLink(o.lat, o.lng) + '.' : ''} Call customer: +${o.phone}. Paid KSh ${o.total_kes}. Mark delivered: ${env.PUBLIC_URL}/d/${o.delivery_token}`
```
Same suggested wording as 4.2. (Counted as one message type with 4.2 in the totals; the three code locations send the same text.)

### 4.4 Owner: late payment recovered (index.js line 189)
Current:
```js
`Order ${order.id}: payment arrived late (it was marked ${order.status}). It has been recovered and is being delivered.`
```
Example length about 107. Verdict: clear, but "marked expired" shows a code word. Suggested:
```
ForTwenty: order ORD-1234 was paid late (it had been marked expired). It is back as paid and is being sent to a rider.
```

### 4.5 Owner: paid order, no rider after 30 minutes (index.js line 88)
Current:
```js
'Paid order ' + q.id + ' has no rider after 30 minutes. Riders are still being offered it; check /admin.'
```
Example length about 99. Verdict: clear. Suggested adds the shop name: `ForTwenty: paid order ORD-1234 has had no rider for 30 minutes. It is still being offered. Check /admin.` (about 103)

### 4.6 Owner: no free rider (old mode only) (index.js line 166)
Current:
```js
'No free rider for paid order ' + orderId + '. It is queued.'
```
Example length about 52. Verdict: fine as is. Only used when RIDER_MODE is neither `offers` nor `demo`.

### 4.7 Owner: payment came for a cancelled order (index.js lines 201 and 225, same text)
Current:
```js
`Order ${order.id} was cancelled but a payment of KSh ${order.total_kes} arrived. Refund it.`
```
Example length about 74. Verdict: clear. Suggested: `ForTwenty: order ORD-1234 was cancelled but a payment of KSh 1500 arrived. Please refund it by hand and tell the customer.` (about 121)

### 4.8 Owner: wrong amount paid (index.js line 210)
Current:
```js
`Order ${order.id}: paid ${items.Amount} but total is ${order.total_kes}. Check and refund or fix.`
```
Example length about 69. Verdict: needs "KSh". Suggested: `ForTwenty: order ORD-1234 was paid KSh 1400 but the total is KSh 1500. Please check it and refund or fix by hand.` (about 112)

### 4.9 Owner: monitor silent (index.js line 349)
Current:
```js
'WARNING: the outside site monitor has not reported for ' + Math.round((Date.now() - b.ts) / 60000) + ' min. GitHub may have paused it. Check the Actions tab. Site down alerts are not being watched.'
```
Example length about 152. Verdict: clear and under 160. Technical on purpose (owner/tech person). No change needed.

### 4.10 Owner: paid more than an hour, not delivered (index.js line 377)
Current:
```js
`Order ${o.id} was paid over an hour ago and is not delivered. Check /admin and reassign or cancel it.`
```
Example length about 102. Verdict: clear. No change needed.

### 4.11 Owner: monitor reporting again (index.js line 432)
Current:
```js
'The outside site monitor is reporting again.'
```
Length 44. Verdict: fine.

---

## 5. Questions for the client

1. [support hours]: when does a person answer WhatsApp messages? (Used in 1.3 and 2.8.) The code today says "during opening hours" (8:00 am to midnight); is that right?
2. [fee]: what is the delivery fee, and may the bot and quick replies quote it? Until decided the messages say it is shown on the website. The bot text (2.3) currently prints a number.
3. Shop name: confirm "ForTwenty" is the name customers should see. The bot currently says "Kabarak Delivery".
4. Cancelled orders (3.3): what should we tell customers about money taken? Suggested wording says we will check it; agree whether to say how long it takes.
5. Template: confirm the template `order_update` (body exactly `{{1}}`) is submitted to Meta. If Meta rejects a body with only a variable, decide on fixed wording around it.
6. Closed hours (1.2): when the shop is closed, does the website refuse orders, or can customers order and wait? The away message assumes they can still open the site.
7. Rider texts (4.1, 4.2): the offer text shows "You earn KSh X" (the delivery fee) and the details text shows "Paid KSh" (the order total). Confirm riders should see both.
8. SMS sender name: should customer SMS carry a sender name such as "ForTwenty" (needs registering with Africa's Talking)? Today texts show no shop name unless the suggested wording is used.
9. Should the 1.2 away message and 1.1 greeting mention the age rule (18 and over)?

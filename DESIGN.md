# Design lock (Kabarak Delivery shop)

Status: LOCKED 2026-11-01. Change only on the owner's explicit request.

## System
- Whole site dark: bg `#050505`, white ink, dim `#a6a6a6`, hairline `rgba(255,255,255,.16)`. Shared tokens and fonts for non-shop pages live in `public/theme.css`.
- Fonts (self-hosted in `public/vendor/fonts`): Unbounded 700/900 (wide, labels, buttons), Inter 400/500 (body), Great Vibes (script, flavour names and page titles).
- Flavour colour is used only for the background wipe and the product art. Prices always read "KSh 100". One filled white pill per screen (Order). Arrows are bare chevrons.

## Shop home: record rail
- Swipe flips records (one per swipe); the background colour switches on swipe; arrows sit centred at the sides.
- Two rows: Samples (KSh 100) above, Packets (KSh 600) below; vertical scroll moves between rows.
- Tapping the front record opens detail: the pack grows to about half the screen, with a colour reveal.

## Product art (placeholder until real photos; `f.image` overrides it)
- Same comic language for both: thick `#0b0b0b` ink outlines, flat cel shading with hard shadow shapes, halftone dots in shadow, white highlight streaks, a darker offset layer behind for thickness, flat comic ground shadow.
- Samples (KSh 100): slim tilted cone with fibre texture in the flavour colour, rolled cream paper filter end with a small flavour band and a dark hollow tip.
- Packets (KSh 600): stand-up zip pouch, chamfered shoulders, ribbed seal with tear notches, double zip line, pastel holographic window, flavour name in white with ink stroke.
- Only the front record floats (`.sleeve.on`). Depth dimming uses the `--sd` overlay, not CSS filters. No SVG noise filters (they caused lag). Do not use `--dim`: it is already a colour token.
- Honour `prefers-reduced-motion`.

## Rules
- Cannabis-leaf logos and cannabis wording stay out of the art and copy.
- Server pages (delivery, rider) use a strict CSP; they may load `/theme.css` and self-hosted fonts only.

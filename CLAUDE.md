# ForTwenty: working notes for Claude

## Use the knowledge graph first

This project has a knowledge graph in `graphify-out/`:

- `graphify-out/GRAPH_REPORT.md`: the plain-language map (main groups, most connected code, suggested questions)
- `graphify-out/graph.json`: the full graph (nodes, links, communities), queryable
- `graphify-out/graph.html`: interactive view (open in a browser)

Before answering a question about how the project fits together, where something lives, or what a change will touch:

1. Read `graphify-out/GRAPH_REPORT.md` first.
2. Query the graph when you need more: `graphify query "<question>"`, `graphify explain "<name>"`, `graphify path "<A>" "<B>"`.
3. Use it to show the project to the user: when asked to visualize or explain the project, draw it from the graph (an image in chat, not only an HTML file), and say what it is based on.
4. Only then read the source files the graph points to.

After you change code, refresh the graph so it stays true: run `graphify update .` (code only, no model calls). If docs or pages changed, run `/graphify --update`. Commit the refreshed `graphify-out/` files with the change.

## To-do board

When the user returns or asks what is next, read `BOARD.md` first: it has where we stopped, what is waiting on the client, what needs a decision, and what is ready to do. Keep it current as items are done.

## Project basics

- Cloudflare Worker (`src/index.js`, plain JavaScript) with a D1 database; static pages in `public/`.
- Deploys from the `main` branch through Cloudflare Workers Builds.
- Prices and menu live in the D1 `products` and `flavors` tables (edited in `/admin`), not in the code.
- Secrets live in Cloudflare (Settings, Variables and Secrets). Never put them in the repo or in chat.
- Payments: Safaricom Daraja STK push to a Till. `DARAJA_ENV` must stay `sandbox` until Safaricom has approved Go Live.
- Delivery fees are currently set to 0 in `wrangler.toml` for testing; the original values are in the comments.
- Customers choose where to be delivered: inside (apartment from the list in `src/apartments.js`, plus floor and house number) or outside (map pin).

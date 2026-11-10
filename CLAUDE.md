# ForTwenty

Cloudflare Worker (`src/`) plus D1 (`migrations/`, `schema.sql`) and a static shop front end (`public/`). Design rules are locked in `DESIGN.md`. Go-live steps are in `GO_LIVE.md`.

## graphify

A knowledge graph of this repo is saved in `graphify-out/`:
- `graphify-out/GRAPH_REPORT.md`: read this first. Communities, most connected functions, surprising links, suggested questions. About 2.5k tokens, instead of reading ~39k words of source.
- `graphify-out/graph.json`: the queryable graph. Use `graphify query "<question>"`, `graphify path "A" "B"`, `graphify explain "X"` (install with `uv tool install graphifyy`).
- `graphify-out/graph.html`: interactive view.

Rules for Claude:
- For questions about architecture or "where is X / what calls Y", read `GRAPH_REPORT.md` and query the graph before opening source files. Open source only for the parts the graph points to.
- After code changes, refresh with `graphify update .` (code only, no LLM cost). After doc or HTML changes, run `/graphify . --update`.
- The graph is a map, not the truth: `source_location` on a node tells you where to verify.
- Leaflet (`public/vendor/`) is deliberately left out of the graph.

# PlantUML Editor — React + CodeMirror6

The React frontend for the PlantUML + Mermaid editor. CodeMirror6 gives syntax
highlighting, autocompletion, bracket matching, and history; PlantUML renders via
a render service while Mermaid renders client-side; and **Fix ✦ / Generate ✦ /
Convert** drive a local **matrix-safe** model through the diagram-agent bridge.

## Views

- **Editor** — text + live preview (PlantUML or Mermaid, auto-detected).
- **Fix / Convert** — markdown/JSON/YAML → diagram, format conversion, AI fixes.
- **Graph** — interactive node/edge editor with auto-layout.
- **Code** — language + diagram-type selectors, AI code→diagram.
- **Designer** — shape palette + canvas with grouping/containers, undo/redo, and
  Apply-to-editor as PlantUML/Mermaid.

## Architecture

```
React (CodeMirror6)  ──/api/*──▶  diagram_agent bridge (:8770)  ──▶  matrix-safe (:8765)
        │                                                            (Fix / Generate / Convert)
        └── encode + <img> ──▶  PlantUML renderer (server container / in-bridge jar)
```

- `src/lib/encoder.js` — UTF-8 → raw DEFLATE → PlantUML base64 (mirrors
  `diagram_agent/plantuml.py`, so client and server agree on encoding).
- `src/renderers/` — pluggable preview renderer registry (`server` today).
- `src/lib/agentClient.js` — JSON client for the bridge endpoints below.
- `src/lib/plantumlLang.js` — CodeMirror6 language mode + dark highlight + completion.
- `src/hooks/useAgent.js` — drives Fix/Generate/Convert and the health badge.

### Bridge endpoints (non-streaming JSON)

`POST /api/fix`, `POST /api/generate`, `POST /api/convert`, `GET /api/health`
— served by `diagram_agent/server.py` (default `:8770`), which fronts matrix-safe.

## Run

1. **Start matrix-safe** (separate project, `:8765`) for Fix/Generate — the editor
   loads and previews without it; AI actions return a loud `502`.
2. **Start the bridge** from the repo root:
   ```bash
   python -m diagram_agent.server     # PORT=8770, MATRIX_SAFE_URL=http://127.0.0.1:8765
   ```
   Env knobs: `MATRIX_SAFE_URL`, `PLANTUML_SERVER`, `PLANTUML_RENDERER`,
   `DIAGRAM_AGENT`, `MAX_ITERS` (see `diagram_agent/corrector.py`).
3. **Start this frontend:**
   ```bash
   cd web-react && npm install && npm run dev      # http://localhost:5173
   ```
   Vite proxies `/api` → `http://127.0.0.1:8770` (override with `AGENT_URL`).

> For the full stack (and air-gapped containers) use `scripts/start.sh` or Docker —
> see the repo root **[DEPLOY.md](../DEPLOY.md)** and **[scripts/README.md](../scripts/README.md)**.

The toolbar shows a health badge (agent online/offline). **Build** for static
hosting with `npm run build`; the default PlantUML server is same-origin `/plantuml`
(override at build time with `VITE_PLANTUML_SERVER`).

## Tests (Playwright)

```bash
npm run smoke         # broad UI walk (non-blocking in CI; selectors being refreshed)
npm run test:convert  # markdown→diagram + generate-from-text
npm run test:designer # palette, drag, undo/redo, group/ungroup
```

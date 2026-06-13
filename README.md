# PlantUML + Mermaid Editor

A browser-based diagram editor for **PlantUML** and **Mermaid**, with a live
preview, AI-assisted Fix / Generate / Convert (via a local **matrix-safe** LLM),
and a visual **Designer** canvas — packaged to run **fully air-gapped** with Docker.

## Features

- **Editor + live preview** — CodeMirror6 with PlantUML (server-rendered) and
  Mermaid (client-side) preview.
- **AI ✦** — Fix broken diagrams, Generate from a description, and Convert pasted
  JSON/YAML/Markdown, driven by a local model through the diagram-agent bridge.
- **Designer** — drag shapes onto a canvas, connect/style them, group nodes into
  containers, undo/redo, then Apply to the editor as PlantUML or Mermaid.
- **Graph** and **Code** views — interactive graph editing and code→diagram.
- **Air-gapped Docker** — selectable PlantUML renderer (`server` or `bridge`),
  optional self-contained LLM; no runtime internet required.

## Architecture

```
web-react (React/Vite)  ──/api/*──▶  diagram_agent bridge (:8770)  ──▶  matrix-safe LLM (:8765)
        │                                                                (Fix / Generate / Convert)
        └── encode + render ──▶  PlantUML renderer (server container or in-bridge jar)
```

Mermaid renders entirely in the browser (no server). PlantUML preview is rendered
by the selected renderer module; the bridge also uses it to validate AI output.

## Quick start

**Containers (recommended):**
```bash
scripts/docker-up.sh bridge          # build + run, open http://localhost:8088/
scripts/docker-up.sh server --llm    # external render image + LLM
```
See **[DEPLOY.md](DEPLOY.md)** for air-gapped install, renderer modes, and the LLM.

**Local dev (host processes):**
```bash
scripts/start.sh                     # bridge + Vite dev server; see scripts/README.md
```

## Testing

| Command | What |
|---|---|
| `scripts/test-renderers.sh [server\|bridge\|both]` | renderer conformance matrix |
| `python -m unittest discover -s diagram_agent -p 'test_*.py'` | backend unit tests |
| `cd web-react && npm run smoke` / `test:convert` / `test:designer` | Playwright UI tests |

CI runs the renderer matrix + backend units (`.github/workflows/renderers.yml`) and
the frontend build + UI tests (`.github/workflows/frontend.yml`).

## Layout

- `web-react/` — React frontend ([README](web-react/README.md)).
- `diagram_agent/` — stdlib Python HTTP bridge + validators + LLM client.
- `docker/`, `docker-compose*.yml` — air-gapped container stack ([DEPLOY.md](DEPLOY.md)).
- `scripts/` — start/stop + Docker wrappers + tests ([README](scripts/README.md)).

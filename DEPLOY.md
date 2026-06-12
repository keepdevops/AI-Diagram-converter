# Air-Gapped Deployment

The PlantUML + Mermaid editor runs fully offline as a small Docker Compose stack.
Mermaid renders client-side; PlantUML renders via a **selectable renderer module**.

```
frontend (nginx, :8088) ── /api/ ──▶ bridge (diagram-agent)
        │                                   │  Fix / Generate
        └── /plantuml/ ──▶ render engine     └──▶ matrix-safe (optional LLM)
```

## Renderer modules

| Mode | Topology | External image? | Use when |
|---|---|---|---|
| **server** | external `plantuml-server` (or Kroki) container | yes (pull once) | you want the upstream image / many diagram formats (Kroki) |
| **bridge** | committed `plantuml.jar` runs *inside* the bridge (`-picoweb` + Graphviz) | **no** | strongest air-gap: reproducible from this repo, reference-fidelity, no extra service |

Both speak the same `/svg/{encoded}` + `X-PlantUML-Diagram-Error` contract, so the
frontend and the AI Fix-loop validator are identical across modes. (An in-browser
`client` module was evaluated and descoped — `plantuml.js` is PNG-only + heavy WASM.)

## Quick start (on a connected build machine)

```bash
cp .env.example .env        # adjust WEB_PORT, engine, etc.

# server mode
docker compose --profile render-server build
docker compose --profile render-server pull        # the render image
docker compose --profile render-server up -d

# bridge mode (no external render image)
docker compose -f docker-compose.yml -f docker-compose.bridge.yml up -d --build
```

Open http://localhost:8088. Add `--profile llm` to either to enable Fix/Generate.

## Going offline

On a machine **with** network, build/pull, then bundle images to a tarball:

```bash
# server mode bundle (include the LLM image too if you use it):
MODE=server RENDER_IMAGE=plantuml/plantuml-server:jetty \
  MATRIX_SAFE_IMAGE=matrix-safe:local docker/save-images.sh

# bridge mode bundle:
MODE=bridge docker/save-images.sh
```

Copy `plantuml-editor-images.tar` + the repo to the air-gapped host:

```bash
docker load -i plantuml-editor-images.tar
docker compose --profile render-server up -d          # or the bridge override
```

> Many hosts? Seed a local `registry:2` once from the tags above and
> `docker compose pull` on each host instead of `docker load`.

## LLM (optional) — `--profile llm`

`matrix-safe` is built by its own project; weights are **mounted, never baked in**:

```bash
MATRIX_SAFE_IMAGE=matrix-safe:local MODEL_DIR=/data/models \
  docker compose --profile render-server --profile llm up -d
```

Transfer the weights directory (`MODEL_DIR`, mounted read-only at `/models`)
separately — it is not part of any image. Without this profile the editor still
loads and previews; Fix/Generate return a loud `502` (never silently fail).

## Configuration (`.env`)

| Var | Default | Notes |
|---|---|---|
| `WEB_PORT` | `8088` | host port for the editor |
| `RENDER_IMAGE` | `plantuml/plantuml-server:jetty` | server mode; or `yuzutech/kroki` |
| `RENDER_PROXY_PASS` | `http://render:8080/` | nginx → render (kroki: `http://render:8000`) |
| `PLANTUML_SERVER` | `http://render:8080` | bridge validator target (kroki: `…:8000/plantuml`) |
| `MATRIX_SAFE_URL` | `http://matrix-safe:8765` | LLM backend |
| `VITE_MERMAID_SECURITY` | `strict` | frontend build arg; `loose` allows HTML labels/clicks |

## Verify

```bash
scripts/test-renderers.sh both     # builds each mode, asserts the render+validate contract
```

CI runs the same matrix (`.github/workflows/renderers.yml`) so no path silently rots.

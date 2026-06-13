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

### Egress lockdown (provable air-gap)

`docker-compose.airgap.yml` is an overlay that puts the content-handling services
(bridge, render, the LLM) on an `internal: true` Docker network — they **physically
cannot reach the internet** at runtime, not just by configuration. The frontend
sits on a second `bridge` network so its `WEB_PORT` still publishes (a single
internal network can't publish a host port on Docker Desktop — verified), but it is
a static nginx whose only upstreams are the internal services.

```bash
# bridge mode + lockdown (strongest: jar in-container, no external image):
docker compose -f docker-compose.yml -f docker-compose.bridge.yml \
               -f docker-compose.airgap.yml up -d

# server mode + lockdown:
docker compose -f docker-compose.yml -f docker-compose.airgap.yml \
               --profile render-server up -d
```

On an internal network the default **host** LLM (`host.docker.internal`) is
unreachable, so add the in-container LLM for AI features:
`-f docker-compose.container-llm.yml --profile llm`.

### One-command bundle

`scripts/airgap-bundle.sh` packs everything — images + compose files (with the
lockdown overlay) + `.env` + a generated `run.sh`/`stop.sh` — into a single
`dist/*.tar.gz`. The offline host needs nothing but Docker; no repo, no manual
`docker load`/`up`.

```bash
# on the connected build host:
scripts/airgap-bundle.sh bridge --build          # build, then bundle (bridge mode)
scripts/airgap-bundle.sh server                  # server mode (images already built)
MATRIX_SAFE_IMAGE=matrix-safe:local \
  scripts/airgap-bundle.sh bridge --llm          # include the in-container LLM image

# on the air-gapped host:
tar xzf plantuml-editor-airgap-bridge-*.tar.gz
plantuml-editor-airgap-bridge-*/run.sh           # docker load + compose up; prints the URL
```

LLM weights are never baked into an image — transfer the gguf dir separately and
set `MODEL_DIR` before `run.sh` (see the bundle's own README).

## LLM for Fix / Generate

Without an LLM the editor still loads and previews; **Fix/Generate return a loud
`502`** (never silently fail). There are two ways to provide the LLM.

### Default — host Metal (fast, macOS)

The compose default points the bridge at a `matrix-safe` running **natively on the
host** (`MATRIX_SAFE_URL=http://host.docker.internal:8765`, `DIAGRAM_AGENT=local-coder-14b.json`).
macOS Docker has **no Metal GPU passthrough**, so this host process is the only way
to get GPU-accelerated inference; Docker Desktop proxies `host.docker.internal` to
the host even when matrix-safe binds `127.0.0.1`. Just run the normal quick start —
no `--profile llm`:

```bash
# matrix-safe must be running on the host at :8765 (its own project / dev stack)
docker compose --profile render-server up -d
```

Measured: 14B Generate **≈ 7 s** (host Metal) vs ≈ 70 s (in-container CPU).

### Self-contained in-container LLM (CPU — Linux / air-gapped)

For a host with no native matrix-safe, run the in-container backend
(`llama_cpp_python`, CPU). `matrix-safe` is built by its own project; weights are
**mounted, never baked in**:

```bash
MATRIX_SAFE_IMAGE=matrix-safe:local MODEL_DIR=/data/models \
  docker compose -f docker-compose.yml -f docker-compose.container-llm.yml \
    --profile render-server --profile llm up -d
```

Transfer the weights directory (`MODEL_DIR`, mounted read-only at `/models`)
separately — it is not part of any image. The override's default agent is
`docker-coder-14b.json` (`docker-gemma2b.json` for a small/fast option); rebuild
`matrix-safe:local` after editing its `config/agents/*` (the image bakes them in).

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

"""Connection to the matrix-safe inference server.

matrix-safe (/Users/caribou/matrix-safe) runs a FastAPI control plane that
hot-swaps local LLM backends and streams OpenAI-shaped output. Default base URL
is http://127.0.0.1:8765 (override with MATRIX_SAFE_URL). Endpoints:

  GET  /api/health     -> {"status": "ok"}
  GET  /api/backends   -> {"backends": [...]}
  GET  /api/agents     -> {"agents": [{file, agent_id, name, backend_target, model_path}]}
  POST /api/generate   {agent, prompt, temperature?, max_tokens?, backend_override?}
       -> SSE: event ready{backend} | token{content} | done{finish_reason} | error{error}

This client assembles streamed tokens into text and fails loudly (raising
MatrixSafeError) on transport problems or server-sent error events, so callers
never mistake an outage for an empty result.

Quick test:
  python3 matrix_client.py --health
  python3 matrix_client.py --agents
  python3 matrix_client.py --agent developer.json --generate "Say hello in one line." --max-tokens 32
"""
from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.request
from collections.abc import Iterator
from dataclasses import dataclass

logger = logging.getLogger("matrix_client")

DEFAULT_URL = os.getenv("MATRIX_SAFE_URL", "http://127.0.0.1:8765").rstrip("/")


class MatrixSafeError(RuntimeError):
    """Raised when matrix-safe is unreachable or returns an error/error-event."""


@dataclass
class MatrixSafeClient:
    base_url: str = DEFAULT_URL
    timeout: float = 300.0          # generation can load a model on first call

    # -- discovery -----------------------------------------------------------

    def health(self) -> dict:
        return self._get("/api/health")

    def list_backends(self) -> list[str]:
        return self._get("/api/backends").get("backends", [])

    def list_agents(self) -> list[dict]:
        return self._get("/api/agents").get("agents", [])

    # -- generation ----------------------------------------------------------

    def generate(self, agent: str, prompt: str, **opts) -> str:
        """Run one generation and return the full assembled text."""
        return "".join(self.generate_stream(agent, prompt, **opts))

    def generate_stream(
        self,
        agent: str,
        prompt: str,
        *,
        temperature: float | None = None,
        max_tokens: int | None = None,
        backend_override: str | None = None,
    ) -> Iterator[str]:
        """Yield token strings as they stream from matrix-safe."""
        if not agent:
            raise ValueError("agent config filename is required (e.g. 'developer.json')")
        body: dict[str, object] = {"agent": agent, "prompt": prompt}
        if temperature is not None:
            body["temperature"] = temperature
        if max_tokens is not None:
            body["max_tokens"] = max_tokens
        if backend_override:
            body["backend_override"] = backend_override

        req = urllib.request.Request(
            f"{self.base_url}/api/generate",
            data=json.dumps(body).encode("utf-8"),
            method="POST",
            headers={"Content-Type": "application/json", "Accept": "text/event-stream"},
        )
        try:
            resp = urllib.request.urlopen(req, timeout=self.timeout)
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")[:300] if exc.fp else exc.reason
            logger.error("generate HTTP %d: %s", exc.code, detail)
            raise MatrixSafeError(f"matrix-safe /api/generate HTTP {exc.code}: {detail}") from exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            logger.error("matrix-safe unreachable at %s: %s", self.base_url, exc)
            raise MatrixSafeError(
                f"matrix-safe unreachable at {self.base_url} — is the server running on :8765?"
            ) from exc

        with resp:
            for event, data in _iter_sse(resp):
                if event == "token":
                    text = data.get("content", "")
                    if text:
                        yield text
                elif event == "error":
                    raise MatrixSafeError(f"matrix-safe error: {data.get('error', 'unknown')}")
                elif event == "done":
                    return

    # -- internals -----------------------------------------------------------

    def _get(self, path: str) -> dict:
        req = urllib.request.Request(f"{self.base_url}{path}", method="GET")
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, OSError) as exc:
            logger.error("matrix-safe %s failed: %s", path, exc)
            raise MatrixSafeError(f"matrix-safe {path} failed: {exc}") from exc
        except json.JSONDecodeError as exc:
            logger.error("matrix-safe %s returned non-JSON", path)
            raise MatrixSafeError(f"matrix-safe {path} returned malformed JSON") from exc


def _iter_sse(resp) -> Iterator[tuple[str, dict]]:
    """Parse an SSE byte stream into (event_name, data_dict) pairs."""
    event = "message"
    data_lines: list[str] = []
    for raw in resp:
        line = raw.decode("utf-8", "replace").rstrip("\r\n")
        if line == "":
            if data_lines:
                joined = "\n".join(data_lines)
                try:
                    payload = json.loads(joined)
                except json.JSONDecodeError:
                    logger.error("skipping non-JSON SSE data: %.120s", joined)
                    payload = {}
                yield event, payload if isinstance(payload, dict) else {}
            event, data_lines = "message", []
            continue
        if line.startswith(":"):
            continue  # comment / heartbeat
        if line.startswith("event:"):
            event = line[len("event:"):].strip()
        elif line.startswith("data:"):
            data_lines.append(line[len("data:"):].lstrip())


if __name__ == "__main__":
    import argparse
    import sys

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    ap = argparse.ArgumentParser(description="Test the connection to matrix-safe.")
    ap.add_argument("--url", default=DEFAULT_URL, help="matrix-safe base URL")
    ap.add_argument("--health", action="store_true", help="probe /api/health")
    ap.add_argument("--backends", action="store_true", help="list registered backends")
    ap.add_argument("--agents", action="store_true", help="list agent configs")
    ap.add_argument("--agent", default="developer.json", help="agent config for --generate")
    ap.add_argument("--generate", metavar="PROMPT", help="stream a generation")
    ap.add_argument("--max-tokens", type=int, default=64)
    args = ap.parse_args()

    client = MatrixSafeClient(base_url=args.url.rstrip("/"))
    try:
        if args.health:
            print("health:", client.health())
        if args.backends:
            print("backends:", client.list_backends())
        if args.agents:
            for a in client.list_agents():
                print(f"  {a['file']:16} {str(a.get('backend_target')):16} {a.get('name')}")
        if args.generate:
            for tok in client.generate_stream(args.agent, args.generate, max_tokens=args.max_tokens):
                sys.stdout.write(tok)
                sys.stdout.flush()
            print()
        if not any([args.health, args.backends, args.agents, args.generate]):
            print("health:", client.health())
            print("backends:", client.list_backends())
    except MatrixSafeError as exc:
        raise SystemExit(f"connection failed: {exc}")

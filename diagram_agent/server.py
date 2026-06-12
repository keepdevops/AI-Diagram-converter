"""Local HTTP bridge between the web editor and the matrix-safe-backed agent.

Stdlib only. Exposes:
  POST /api/fix       {text}               -> {ok, diagram, note, error, attempts}
  POST /api/generate  {description, type?} -> same shape
  GET  /api/health                         -> {ok, agent, matrix_url}

CORS is open so the static editor (served from another port) can call it.

Run:  python -m diagram_agent.server   (PORT env, default 8770)
"""
from __future__ import annotations

import json
import logging
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from diagram_agent.corrector import Corrector, MatrixSafeError, Settings, Transcript

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("diagram_agent.server")

_MAX_BODY = 256 * 1024


def _payload(t: Transcript) -> dict:
    return {
        "ok": t.ok, "diagram": t.diagram, "note": t.note, "error": t.last_error,
        "attempts": [
            {"iteration": a.iteration, "ok": a.result.ok,
             "error": a.result.error, "error_line": a.result.error_line}
            for a in t.attempts
        ],
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "DiagramAgent/1.0"
    settings: Settings

    def do_OPTIONS(self) -> None:  # noqa: N802
        self._send(204, None)

    def do_GET(self) -> None:  # noqa: N802
        if self.path.rstrip("/") == "/api/health":
            self._send(200, {"ok": True, "agent": self.settings.agent,
                             "matrix_url": self.settings.matrix_url})
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        route = self.path.rstrip("/")
        if route not in ("/api/fix", "/api/generate", "/api/convert"):
            self._send(404, {"error": "not found"})
            return
        body = self._read_json()
        if body is None:
            return
        try:
            corrector = Corrector(self.settings)
            target = "plantuml"
            if route == "/api/fix":
                text = body.get("text", "")
                if not isinstance(text, str) or not text.strip():
                    self._send(400, {"error": "missing 'text'"})
                    return
                transcript = corrector.fix(text)
            elif route == "/api/convert":
                text = body.get("text", "")
                if not isinstance(text, str) or not text.strip():
                    self._send(400, {"error": "missing 'text'"})
                    return
                target = body.get("target") if body.get("target") in ("plantuml", "mermaid") else "plantuml"
                transcript = corrector.convert(text, target=target, fmt=body.get("format") or None)
            else:
                desc = body.get("description", "")
                dtype = body.get("type") or None
                if not isinstance(desc, str) or not desc.strip():
                    self._send(400, {"error": "missing 'description'"})
                    return
                transcript = corrector.generate(desc, dtype if isinstance(dtype, str) else None)
            payload = _payload(transcript)
            payload["target"] = target
            self._send(200, payload)
        except MatrixSafeError as exc:
            logger.error("matrix-safe failure on %s: %s", route, exc)
            self._send(502, {"error": str(exc)})
        except ValueError as exc:
            self._send(400, {"error": str(exc)})
        except Exception as exc:  # last-resort guard: log loudly, keep serving
            logger.exception("Unhandled error on %s", route)
            self._send(500, {"error": f"internal error: {exc}"})

    # -- helpers -------------------------------------------------------------

    def _read_json(self) -> dict | None:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self._send(400, {"error": "invalid Content-Length"})
            return None
        if length <= 0 or length > _MAX_BODY:
            self._send(400, {"error": "empty or oversized body"})
            return None
        try:
            parsed = json.loads(self.rfile.read(length).decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            logger.error("Bad JSON body on %s: %s", self.path, exc)
            self._send(400, {"error": "malformed JSON body"})
            return None
        if not isinstance(parsed, dict):
            self._send(400, {"error": "JSON body must be an object"})
            return None
        return parsed

    def _send(self, status: int, payload: dict | None) -> None:
        data = b"" if payload is None else json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        if payload is not None:
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        if data:
            self.wfile.write(data)

    def log_message(self, fmt: str, *args) -> None:
        logger.info("%s - %s", self.address_string(), fmt % args)


def main() -> None:
    Handler.settings = Settings()
    host = os.getenv("HOST", "127.0.0.1")  # 0.0.0.0 inside a container
    port = int(os.getenv("PORT", "8770"))
    httpd = ThreadingHTTPServer((host, port), Handler)
    logger.info("Diagram agent on http://%s:%d (agent=%s, matrix=%s)",
                host, port, Handler.settings.agent, Handler.settings.matrix_url)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        logger.info("Shutting down")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()

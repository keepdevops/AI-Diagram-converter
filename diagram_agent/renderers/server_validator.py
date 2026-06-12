"""`server` renderer backend: validate against an external render service.

Two engines, one normalized contract:
  plantuml-server  GET  {server}/svg/{encoded}   -> X-PlantUML-Diagram-Error[-Line]
  kroki            POST {server}/svg  (raw text)  -> 400 with error in the body

Both collapse to `ValidationResult{ok, error, error_line, ...}`. The
plantuml-server path reuses the verified encoder/oracle in
`diagram_agent.plantuml`; the kroki path is added here (Sprint 2) because Kroki
reports errors in the response body, not in PlantUML's custom headers.
"""
from __future__ import annotations

import logging
import urllib.error
import urllib.request

from diagram_agent.plantuml import ValidationResult, validate

logger = logging.getLogger("diagram_agent.renderers.server")

_USER_AGENT = "Mozilla/5.0 (compatible; plantuml-diagram-agent/1.0)"
_VALID_ENGINES = ("plantuml-server", "kroki")


class ServerValidator:
    def __init__(self, *, server: str, engine: str = "plantuml-server",
                 timeout: float = 20.0):
        if engine not in _VALID_ENGINES:
            raise ValueError(
                f"unknown RENDER_ENGINE={engine!r}; supported: "
                f"{', '.join(_VALID_ENGINES)}"
            )
        self.server = server.rstrip("/")
        self.engine = engine
        self.timeout = timeout

    def validate(self, text: str) -> ValidationResult:
        if self.engine == "kroki":
            return self._validate_kroki(text)
        return validate(text, self.server, timeout=self.timeout)

    # -- kroki ---------------------------------------------------------------

    def _validate_kroki(self, text: str) -> ValidationResult:
        if not text or not text.strip():
            return ValidationResult(ok=False, error="empty diagram")
        url = f"{self.server}/svg"
        req = urllib.request.Request(
            url, data=text.encode("utf-8"), method="POST",
            headers={"User-Agent": _USER_AGENT, "Content-Type": "text/plain"},
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                return ValidationResult(ok=resp.status == 200, status=resp.status)
        except urllib.error.HTTPError as exc:
            body = self._read_body(exc)
            if exc.code != 400:
                logger.error("Unexpected HTTP %d from Kroki: %s", exc.code, exc.reason)
            return ValidationResult(
                ok=False, error=body or f"HTTP {exc.code}", status=exc.code
            )
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            logger.error("Kroki unreachable at %s: %s", self.server, exc)
            raise RuntimeError(f"Kroki unreachable at {self.server}: {exc}") from exc

    @staticmethod
    def _read_body(exc: urllib.error.HTTPError) -> str:
        try:
            return exc.read().decode("utf-8", "replace").strip()
        except OSError as read_exc:  # log loudly; still surface the HTTP code
            logger.error("Could not read Kroki error body: %s", read_exc)
            return ""

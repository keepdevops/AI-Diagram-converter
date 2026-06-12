"""PlantUML encoding + server-based validation oracle (no Java required).

A broken diagram makes the PlantUML server return HTTP 400 with headers
`X-PlantUML-Diagram-Error`, `X-PlantUML-Diagram-Error-Line`, and an assumed
diagram type in the error string. We read those to drive the correction loop.

The encoder mirrors web/js/encoder.js: UTF-8 -> raw DEFLATE -> PlantUML's base64
variant (verified to match the canonical PlantUML encoding).
"""
from __future__ import annotations

import logging
import re
import urllib.error
import urllib.request
import zlib
from dataclasses import dataclass

logger = logging.getLogger("diagram_agent.plantuml")

_SIX_BIT = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_"
_ASSUMED_TYPE_RE = re.compile(r"assumed diagram type:\s*([A-Za-z0-9_-]+)", re.IGNORECASE)
# Some PlantUML servers reject the default urllib UA with 403.
_USER_AGENT = "Mozilla/5.0 (compatible; plantuml-diagram-agent/1.0)"


def _append3(b1: int, b2: int, b3: int) -> str:
    c1 = b1 >> 2
    c2 = ((b1 & 0x3) << 4) | (b2 >> 4)
    c3 = ((b2 & 0xF) << 2) | (b3 >> 6)
    c4 = b3 & 0x3F
    return _SIX_BIT[c1 & 0x3F] + _SIX_BIT[c2 & 0x3F] + _SIX_BIT[c3 & 0x3F] + _SIX_BIT[c4 & 0x3F]


def encode_plantuml(text: str) -> str:
    """Encode diagram text into a PlantUML server URL path segment."""
    compressor = zlib.compressobj(9, zlib.DEFLATED, -15)  # raw DEFLATE (wbits=-15)
    deflated = compressor.compress(text.encode("utf-8")) + compressor.flush()
    out = []
    for i in range(0, len(deflated), 3):
        b1 = deflated[i]
        b2 = deflated[i + 1] if i + 1 < len(deflated) else 0
        b3 = deflated[i + 2] if i + 2 < len(deflated) else 0
        out.append(_append3(b1, b2, b3))
    return "".join(out)


@dataclass(frozen=True)
class ValidationResult:
    ok: bool
    error: str | None = None
    error_line: int | None = None
    assumed_type: str | None = None
    status: int | None = None


def validate(text: str, server: str, *, timeout: float = 20.0) -> ValidationResult:
    """Validate a diagram against a PlantUML server. A syntax error is a normal
    ok=False result; transport failures raise RuntimeError (fail loudly)."""
    if not text or not text.strip():
        return ValidationResult(ok=False, error="empty diagram")

    url = f"{server.rstrip('/')}/svg/{encode_plantuml(text)}"
    req = urllib.request.Request(url, method="GET", headers={"User-Agent": _USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return ValidationResult(ok=resp.status == 200, status=resp.status)
    except urllib.error.HTTPError as exc:
        err = exc.headers.get("X-PlantUML-Diagram-Error")
        line_raw = exc.headers.get("X-PlantUML-Diagram-Error-Line")
        if err is None and exc.code != 400:
            logger.error("Unexpected HTTP %d from PlantUML server: %s", exc.code, exc.reason)
        line = None
        if line_raw is not None:
            try:
                line = int(line_raw)
            except ValueError:
                logger.error("Non-integer error line header: %r", line_raw)
        assumed = None
        if err:
            m = _ASSUMED_TYPE_RE.search(err)
            assumed = m.group(1).lower() if m else None
        return ValidationResult(
            ok=False, error=err or f"HTTP {exc.code}", error_line=line,
            assumed_type=assumed, status=exc.code,
        )
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        logger.error("PlantUML server unreachable at %s: %s", server, exc)
        raise RuntimeError(f"PlantUML server unreachable at {server}: {exc}") from exc

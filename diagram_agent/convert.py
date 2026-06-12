"""Detect a pasted file format and convert it to PlantUML.

Deterministic, offline conversions where PlantUML has native or obvious support:
  - JSON     -> @startjson ... @endjson   (PlantUML renders JSON natively)
  - YAML     -> @startyaml ... @endyaml
  - Markdown -> @startmindmap (headings + bullets become a mind-map tree)
Anything else returns fmt='text' with no native form, so the caller falls back
to the LLM. Every result is still validated downstream, so a misdetection is
caught and repaired rather than shown broken.
"""
from __future__ import annotations

import json
import re

_HEADING = re.compile(r"\s{0,3}(#{1,6})\s+(.*)")
_BULLET = re.compile(r"(\s*)[-*+]\s+(.*)")
_YAML_MAP = re.compile(r"(?m)^[A-Za-z0-9_.\-]+:\s")


def detect_format(text: str) -> str:
    """Return one of: empty | plantuml | json | yaml | markdown | text."""
    s = text.strip()
    if not s:
        return "empty"
    if re.match(r"@start\w+", s, re.IGNORECASE):
        return "plantuml"
    if s[0] in "{[":
        try:
            json.loads(s)
            return "json"
        except ValueError:
            pass
    if _HEADING.search(s):
        return "markdown"
    if s.startswith("---") or _YAML_MAP.search(s):
        return "yaml"
    if _BULLET.search(s):
        return "markdown"
    return "text"


def to_plantuml(text: str, fmt: str) -> str | None:
    """Deterministic conversion for json/yaml/markdown; None for anything else."""
    s = text.strip()
    if fmt == "json":
        return f"@startjson\n{s}\n@endjson"
    if fmt == "yaml":
        return f"@startyaml\n{s}\n@endyaml"
    if fmt == "markdown":
        return _markdown_to_mindmap(s)
    return None


def _san(text: str) -> str:
    """Clean a node label for mind-map syntax."""
    return text.replace("`", "").replace("\t", " ").strip()


def _markdown_to_mindmap(s: str) -> str | None:
    """Headings (by '#' depth) and bullets (by indent) -> a mind-map tree under a
    single synthetic root, so the output is always a valid single-root mindmap."""
    items: list[tuple[int, str]] = []
    heading_depth = 0
    for line in s.splitlines():
        mh = _HEADING.match(line)
        if mh:
            heading_depth = len(mh.group(1))
            items.append((heading_depth, _san(mh.group(2))))
            continue
        mb = _BULLET.match(line)
        if mb:
            depth = heading_depth + 1 + len(mb.group(1)) // 2
            items.append((depth, _san(mb.group(2))))
    items = [(d, t) for d, t in items if t]
    if not items:
        return None  # no structure to map — let the caller use the LLM

    min_d = min(d for d, _ in items)
    out = ["@startmindmap", "* Document"]  # synthetic root keeps it single-rooted
    for d, t in items:
        out.append("*" * ((d - min_d) + 2) + " " + t)
    out.append("@endmindmap")
    return "\n".join(out)

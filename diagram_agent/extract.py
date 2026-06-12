"""Pull a renderable PlantUML diagram out of model output.

The model wraps diagrams in prose / markdown fences (and, with ChatML priming,
may emit a trailing <|im_end|>). We want the first complete @startX..@endX block.
"""
from __future__ import annotations

import logging
import re

logger = logging.getLogger("diagram_agent.extract")

_BLOCK_RE = re.compile(r"@start(\w+)\b.*?@end\1\b", re.IGNORECASE | re.DOTALL)
_FENCE_RE = re.compile(r"```(?:plantuml|puml|uml)?\s*\n(.*?)```", re.IGNORECASE | re.DOTALL)
_MARKERS = ("->", "-->", "participant ", "class ", "state ", "actor ",
            "component ", "node ", "rectangle ", "package ", "[*]", "[", ":")

# Common local-model syntax artifacts that are fatal but the model rarely fixes
# on its own — repaired deterministically before validation.
_DBL_QUOTE_RE = re.compile(r'""([^"]+)""')                      # ""x"" -> "x"
_ENDNOTE_RE = re.compile(r'@end\s*note\b', re.IGNORECASE)       # @endnote -> end note
_MULTI_COMPONENT_RE = re.compile(r'^(\s*)((?:\[[^\]]+\]\s*){2,})$')  # [a] [b] [c]
_COMPONENT_TOKEN_RE = re.compile(r'\[[^\]]+\]')

# A declaration whose bare name has a '-' or '.' — PlantUML reads those as
# operators (`component llama-server`, `node mlx_lm.server`), so quote the name.
_DECL_KEYWORDS = (
    "component|node|rectangle|package|cloud|folder|frame|database|queue|artifact|"
    "card|agent|interface|control|boundary|entity|collections|usecase|actor|"
    "participant|state|object|enum|storage|stack|file|person"
)
_DECL_NAME_RE = re.compile(
    rf'^(\s*(?:{_DECL_KEYWORDS})\s+)([A-Za-z_][\w.\-]*)(\s|$|\{{)', re.IGNORECASE)
_IS_DECL_LINE = re.compile(rf'^\s*(?:(?:{_DECL_KEYWORDS})\b|\[)', re.IGNORECASE)
_AS_ALIAS_RE = re.compile(r'\bas\s+([A-Za-z_]\w*)')


def _quote_decl_name(line: str) -> str | None:
    """If a declaration line names a bare identifier containing '-' or '.', return
    (rewritten_line, name); else None. Underscores are fine and left alone."""
    m = _DECL_NAME_RE.match(line)
    if not m:
        return None
    name = m.group(2)
    if "-" in name or "." in name:
        return f'{m.group(1)}"{name}"{m.group(3)}{line[m.end():]}', name
    return None


def _dedupe_aliases(lines: list[str]) -> list[str]:
    """Rename duplicate ``as <alias>`` aliases on declaration lines (a re-used
    alias is a fatal 'name already used' error). The first use keeps the alias;
    later ones get a ``_N`` suffix, so existing references still resolve."""
    seen: set[str] = set()
    out: list[str] = []
    for line in lines:
        m = _AS_ALIAS_RE.search(line) if _IS_DECL_LINE.match(line) else None
        if m:
            alias = m.group(1)
            if alias in seen:
                n = 2
                while f"{alias}_{n}" in seen:
                    n += 1
                alias = f"{alias}_{n}"
                line = line[:m.start(1)] + alias + line[m.end(1):]
            seen.add(alias)
        out.append(line)
    return out


def _quote_refs(line: str, bad_names: set[str]) -> str:
    """Quote later references to a declared bad name (e.g. in relationships:
    ``a --> llama-server``). Only the operand part before a ``:`` label is
    touched, and only exact, not-already-quoted occurrences."""
    head, sep, tail = line.partition(":")
    for name in bad_names:
        head = re.sub(
            r'(?<![\w"\[.\-])' + re.escape(name) + r'(?![\w"\]])',
            f'"{name}"', head)
    return head + sep + tail


def normalize_plantuml(text: str) -> str:
    """Repair recurring model artifacts before the diagram hits validation:

      * doubled quotes:  ``package ""Foo""``         -> ``package "Foo"``
      * packed component lines:  ``[a] [b] [c]``      -> one ``[token]`` per line
      * unquoted names with '-'/'.':  ``node x-y``    -> ``node "x-y"`` (decl AND
        every later reference, e.g. ``a --> x-y``)

    All are frequent, fatal, and ones the model burns whole fix-loop iterations
    failing to spot. Conservative (declarations / whole-line bracket runs / exact
    name refs only) and idempotent, so it is safe to apply on every extraction."""
    if not text:
        return text
    lines: list[str] = []
    bad_names: set[str] = set()
    for line in text.split("\n"):
        line = _DBL_QUOTE_RE.sub(r'"\1"', line)
        line = _ENDNOTE_RE.sub("end note", line)
        quoted = _quote_decl_name(line)
        if quoted is not None:
            line, name = quoted
            bad_names.add(name)
        m = _MULTI_COMPONENT_RE.match(line)
        if m:
            indent = m.group(1)
            lines.extend(f"{indent}{tok}" for tok in _COMPONENT_TOKEN_RE.findall(m.group(2)))
        else:
            lines.append(line)
    # Second pass: quote references to the names we just quoted in declarations.
    if bad_names:
        lines = [_quote_refs(ln, bad_names) for ln in lines]
    lines = _dedupe_aliases(lines)
    return "\n".join(lines)


def extract_diagram(text: str) -> str | None:
    """Return the first complete PlantUML diagram in `text`, or None."""
    if not text:
        return None
    text = text.split("<|im_end|>")[0]  # strip any ChatML turn terminator

    result: str | None = None
    m = _BLOCK_RE.search(text)
    if m:
        result = m.group(0).strip()
    if result is None:
        for fence in _FENCE_RE.findall(text):
            inner = _BLOCK_RE.search(fence)
            if inner:
                result = inner.group(0).strip()
                break
    if result is None:
        for fence in _FENCE_RE.findall(text):
            body = fence.strip()
            if any(tok in body for tok in _MARKERS):
                result = _wrap(body)
                break
    if result is None:
        logger.debug("No complete PlantUML block in text (%d chars)", len(text))
        return None
    return normalize_plantuml(result)


def _wrap(body: str) -> str:
    lowered = body.lower()
    if "@start" in lowered and "@end" in lowered:
        return body
    return f"@startuml\n{body}\n@enduml"


_MERMAID_FENCE = re.compile(r"```mermaid\s*\n(.*?)```", re.IGNORECASE | re.DOTALL)
_MERMAID_HEADERS = (
    "flowchart", "graph", "sequencediagram", "classdiagram", "statediagram",
    "erdiagram", "mindmap", "gantt", "journey", "pie", "gitgraph", "timeline",
    "quadrantchart", "requirementdiagram", "c4context",
)


def extract_mermaid(completion: str) -> str | None:
    """Extract a Mermaid diagram body from a (primed) model completion."""
    if not completion:
        return None
    m = _MERMAID_FENCE.search(completion)
    body = m.group(1) if m else completion
    for stop in ("```", "<|im_end|>", "<|im_start|>"):
        body = body.split(stop)[0]
    body = body.strip()
    return body or None


def mermaid_looks_valid(text: str) -> bool:
    """Cheap sanity check: starts with a recognized Mermaid header."""
    first = next((ln.strip() for ln in text.splitlines() if ln.strip()), "")
    return any(first.lower().startswith(h) for h in _MERMAID_HEADERS)


def diagram_from_primed(completion: str, opener: str = "@startuml") -> str | None:
    """Build a diagram from a completion produced after priming the assistant turn
    with `opener` + '\\n' (e.g. '@startuml' or '@startmindmap'). Tolerates models
    that omit the closing @end... or trail junk (fences, ChatML terminators)."""
    if not completion:
        return None
    body = completion
    for stop in ("```", "<|im_end|>", "<|im_start|>"):
        body = body.split(stop)[0]
    body = body.strip()
    if not body:
        return None

    full = extract_diagram(body)  # model may have emitted a complete @startX..@endX
    if full is not None:
        return full  # already normalized by extract_diagram

    if body.lower().startswith("@start"):  # drop a restated opener; we re-add it
        body = re.sub(r"^@start\w+\b[^\n]*\n?", "", body, count=1, flags=re.IGNORECASE).strip()
    closer = "@end" + opener[len("@start"):]  # @startmindmap -> @endmindmap
    diagram = f"{opener}\n{body}"
    if "@end" not in diagram.lower():
        diagram += f"\n{closer}"
    return normalize_plantuml(diagram)

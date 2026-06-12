"""Prompt construction for matrix-safe.

matrix-safe's llama_cpp backend posts the RAW prompt to llama-server's
`/completion` endpoint (no chat template applied). So we apply ChatML ourselves
— the format Qwen2.5-Coder was trained on — and prime the assistant turn with a
```plantuml fence so the model starts emitting the diagram immediately.
"""
from __future__ import annotations

import re

from diagram_agent.plantuml import ValidationResult

# Niche diagram types whose opener is NOT @startuml. Generating these requires
# priming the assistant with the correct @start... token (the model cannot emit
# @startmindmap if the turn is primed with @startuml).
_NICHE_OPENERS = {
    "mindmap": "@startmindmap",
    "wbs": "@startwbs",
    "gantt": "@startgantt",
    "json": "@startjson",
    "yaml": "@startyaml",
}

# Per-type syntax reminders for forms the model gets wrong without an example.
_TYPE_HINTS = {
    "mindmap": "Mindmap syntax: write the root as '* Title', then each deeper level "
               "adds ONE asterisk ('** Branch', '*** Leaf'). Nesting is by asterisk "
               "count only — never use arrows, brackets, 'component' or 'node'. "
               "End with @endmindmap.",
    "wbs": "WBS syntax: '* Root', '** Child', '*** Leaf' by asterisk count; no "
           "arrows or brackets. End with @endwbs.",
}


def opener_for(diagram_type: str | None) -> str:
    """The @start... token to prime for a requested diagram type."""
    return _NICHE_OPENERS.get((diagram_type or "").strip().lower(), "@startuml")


def opener_of_text(text: str) -> str:
    """The @start... opener already present in a diagram (for fix priming)."""
    m = re.match(r"\s*(@start\w+)", text or "")
    return m.group(1) if m else "@startuml"

_SYSTEM = (
    "You are a PlantUML expert. Output exactly one valid PlantUML diagram inside a "
    "```plantuml code fence, starting with @startuml (or the type-specific "
    "@start...) and ending with the matching @end.... Follow these rules strictly:\n"
    "- No prose outside the diagram, no extra fences, no ellipses or TODOs.\n"
    "- Never use !define, !function, !procedure, or any macro — plain PlantUML only.\n"
    "- A container body (component/node/package/rectangle/folder/cloud { ... }) "
    "contains ONLY nested element declarations — never sentences, bullet points, or "
    "'- ' lines. Put any description in a separate `note` block, not inside a container.\n"
    "- Quote every name containing a space, '-' or '.', e.g. component \"llama-server\". "
    "Prefer `component \"Readable Name\" as alias` with a short alphanumeric alias.\n"
    "- Every `as <alias>` must be unique. One element declaration per line.\n"
    "- Declare each element exactly once. Prefer a flat structure; use nesting only "
    "for genuine containment, and never re-declare the same element inside another.\n"
    "- Never put a `[...]` annotation after a node/component name (e.g. NOT "
    "`node \"X\" as x [:3000]`). Put a port or address inside the quoted label, like "
    "`node \"React UI\\n:3000\" as ui`, or in a `note`."
)


def _chatml_open(user: str, opener: str = "@startuml") -> str:
    """Wrap a user instruction in ChatML and prime the fence with `opener`."""
    return (
        f"<|im_start|>system\n{_SYSTEM}<|im_end|>\n"
        f"<|im_start|>user\n{user}<|im_end|>\n"
        f"<|im_start|>assistant\n```plantuml\n{opener}\n"
    )


def _chatml(user: str) -> str:  # back-compat: standard @startuml priming
    return _chatml_open(user, "@startuml")


def generate_prompt(description: str, diagram_type: str | None = None) -> str:
    dt = (diagram_type or "").strip().lower()
    type_line = (
        f"Use a PlantUML {diagram_type} diagram.\n"
        if dt and dt not in ("generic", "unknown")
        else "Choose the most appropriate PlantUML diagram type.\n"
    )
    hint = _TYPE_HINTS.get(dt)
    if hint:
        type_line += hint + "\n"
    return _chatml_open(
        f"Create a PlantUML diagram for this request.\n{type_line}\n"
        f"Request:\n{description.strip()}",
        opener_for(dt),
    )


def fix_prompt(diagram: str, result: ValidationResult) -> str:
    err = result.error or "Unknown syntax error"
    line = f" (at line {result.error_line})" if result.error_line else ""
    type_hint = (
        f"The renderer parsed it as a '{result.assumed_type}' diagram. "
        if result.assumed_type else ""
    )
    return _chatml_open(
        "This PlantUML diagram fails to render. Rewrite it so it renders "
        "correctly, preserving the author's intent and all elements; fix only "
        f"what is necessary.\n{type_hint}Validation error: {err}{line}\n\n"
        f"Broken diagram:\n```plantuml\n{diagram.strip()}\n```",
        opener_of_text(diagram),
    )


def convert_prompt(text: str, fmt: str | None = None) -> str:
    return _chatml(
        f"Convert the following {fmt or 'text'} into the most appropriate PlantUML "
        "diagram (class, sequence, mindmap, component, ER, state, activity, etc.). "
        "Capture its structure and relationships faithfully.\n\n"
        f"Input:\n{text.strip()}"
    )


# Mermaid output uses its own ChatML (no PlantUML fence priming).
_MERMAID_SYSTEM = (
    "You are a Mermaid diagram expert. You output exactly one valid Mermaid diagram "
    "inside a ```mermaid code fence — starting with a Mermaid header such as "
    "flowchart, sequenceDiagram, classDiagram, stateDiagram-v2, erDiagram, or "
    "mindmap. No prose, no extra fences, no ellipses."
)


def mermaid_prompt(text: str, fmt: str | None = None) -> str:
    src = fmt or "text"
    return (
        f"<|im_start|>system\n{_MERMAID_SYSTEM}<|im_end|>\n"
        f"<|im_start|>user\nConvert the following {src} into the most appropriate "
        "Mermaid diagram, capturing its structure and relationships.\n\n"
        f"Input:\n{text.strip()}<|im_end|>\n"
        f"<|im_start|>assistant\n```mermaid\n"
    )


# The assistant turn is primed with "@startuml\n" — prepend it back to the
# model's completion before extracting, so the fence is complete.
PRIMED_PREFIX = "```plantuml\n@startuml\n"
MERMAID_PRIMED_PREFIX = "```mermaid\n"

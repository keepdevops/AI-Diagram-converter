"""Build and correct PlantUML diagrams via matrix-safe + a validation loop.

`fix(text)`:   validate -> if broken, ask the model to repair using the exact
               server error/line/type -> extract -> re-validate, up to MAX_ITERS.
`generate(d)`: produce a diagram from a description, then run the same loop.

Backed by a single local model through matrix-safe (matrix_client), so there is
no swarm/synthesis fragility. Fails loudly if matrix-safe is unreachable.
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field

from diagram_agent import prompts
from diagram_agent.convert import detect_format, to_plantuml
from diagram_agent.extract import (
    diagram_from_primed, extract_mermaid, mermaid_looks_valid, normalize_plantuml,
)
from diagram_agent.plantuml import ValidationResult
from diagram_agent.renderers.base import get_validator
from matrix_client import MatrixSafeClient, MatrixSafeError

logger = logging.getLogger("diagram_agent.corrector")


@dataclass(frozen=True)
class Settings:
    agent: str = os.getenv("DIAGRAM_AGENT", "local-coder-14b.json")
    plantuml_server: str = os.getenv(
        "PLANTUML_SERVER", "https://www.plantuml.com/plantuml"
    ).rstrip("/")
    matrix_url: str = os.getenv("MATRIX_SAFE_URL", "http://127.0.0.1:8765").rstrip("/")
    # Pluggable validator backend (see diagram_agent/renderers): 'server' today;
    # 'bridge'/'client' land in later sprints. render_engine distinguishes
    # plantuml-server vs kroki for the 'server' backend.
    renderer: str = os.getenv("PLANTUML_RENDERER", "server")
    render_engine: str = os.getenv("RENDER_ENGINE", "plantuml-server")
    max_iters: int = int(os.getenv("MAX_ITERS", "4"))
    max_tokens: int = int(os.getenv("GEN_MAX_TOKENS", "1024"))
    temperature: float = float(os.getenv("GEN_TEMPERATURE", "0.2"))
    render_timeout: float = float(os.getenv("RENDER_TIMEOUT", "20"))


@dataclass
class Attempt:
    iteration: int
    diagram: str
    result: ValidationResult


@dataclass
class Transcript:
    ok: bool
    diagram: str
    attempts: list[Attempt] = field(default_factory=list)
    note: str | None = None

    @property
    def last_error(self) -> str | None:
        for a in reversed(self.attempts):
            if not a.result.ok:
                return a.result.error
        return None


class Corrector:
    def __init__(self, settings: Settings | None = None):
        self.s = settings or Settings()
        self.client = MatrixSafeClient(base_url=self.s.matrix_url)
        self.validator = get_validator(self.s)

    # -- public API ----------------------------------------------------------

    def fix(self, text: str) -> Transcript:
        if not text or not text.strip():
            raise ValueError("fix() requires non-empty diagram text")
        # Deterministic pre-pass: repair common artifacts (doubled quotes, packed
        # component lines) before touching the model. Trivially-broken diagrams
        # validate here in ~1ms with zero (slow) model calls.
        normalized = normalize_plantuml(text)
        result = self._validate(normalized)
        if result.ok:
            note = ("Already valid; no fix needed." if normalized == text
                    else "Repaired by normalization; no model needed.")
            return Transcript(True, normalized, [Attempt(0, normalized, result)], note)
        return self._loop(seed=normalized, initial=result)

    def generate(self, description: str, diagram_type: str | None = None) -> Transcript:
        if not description or not description.strip():
            raise ValueError("generate() requires a non-empty description")
        diagram = self._ask(prompts.generate_prompt(description, diagram_type),
                            prompts.opener_for(diagram_type))
        if diagram is None:
            return Transcript(False, "", note="Model did not return a parseable diagram.")
        result = self._validate(diagram)
        attempts = [Attempt(1, diagram, result)]
        if result.ok:
            return Transcript(True, diagram, attempts, "Generated successfully.")
        t = self._loop(seed=diagram, initial=result, start_iter=2)
        t.attempts = attempts + t.attempts
        return t

    def convert(self, text: str, target: str = "plantuml", fmt: str | None = None) -> Transcript:
        """Convert pasted content (markdown/json/yaml/…) into a diagram.

        target='plantuml' uses native wrapping (json/yaml) or a mind-map (markdown)
        when possible, else the model — then the validate/fix loop.
        target='mermaid' asks the model for Mermaid code (validated client-side)."""
        if not text or not text.strip():
            raise ValueError("convert() requires non-empty text")
        fmt = fmt or detect_format(text)

        if target == "mermaid":
            return self._convert_mermaid(text, fmt)

        if fmt == "plantuml":
            diagram = diagram_from_primed(text) or text
            return Transcript(True, diagram, [Attempt(0, diagram, self._validate(diagram))],
                              "Already PlantUML.")
        native = to_plantuml(text, fmt)
        if native is None:  # no deterministic form — let the model convert
            diagram = self._ask(prompts.convert_prompt(text, fmt))
            if diagram is None:
                return Transcript(False, "", note=f"Could not convert {fmt} to a diagram.")
            native = diagram
        result = self._validate(native)
        attempts = [Attempt(1, native, result)]
        if result.ok:
            return Transcript(True, native, attempts, f"Converted {fmt} → PlantUML.")
        t = self._loop(seed=native, initial=result, start_iter=2)
        t.attempts = attempts + t.attempts
        return t

    def _convert_mermaid(self, text: str, fmt: str) -> Transcript:
        completion = self.client.generate(
            self.s.agent, prompts.mermaid_prompt(text, fmt),
            temperature=self.s.temperature, max_tokens=self.s.max_tokens,
        )
        diagram = extract_mermaid(completion)
        if diagram is None:
            return Transcript(False, "", note=f"Could not convert {fmt} to Mermaid.")
        ok = mermaid_looks_valid(diagram)
        result = ValidationResult(ok, None if ok else "no recognizable Mermaid header")
        note = f"Converted {fmt} → Mermaid." if ok else "Produced Mermaid (unverified header)."
        return Transcript(ok, diagram, [Attempt(1, diagram, result)], note)

    # -- internals -----------------------------------------------------------

    def _loop(self, *, seed: str, initial: ValidationResult, start_iter: int = 1) -> Transcript:
        current, result, best = seed, initial, seed
        attempts: list[Attempt] = []
        for i in range(start_iter, start_iter + self.s.max_iters):
            diagram = self._ask(prompts.fix_prompt(current, result),
                                prompts.opener_of_text(current))
            if diagram is None:
                attempts.append(Attempt(i, current, result))
                continue
            result, current, best = self._validate(diagram), diagram, diagram
            attempts.append(Attempt(i, diagram, result))
            if result.ok:
                return Transcript(True, diagram, attempts, f"Fixed after {i} attempt(s).")
        return Transcript(False, best, attempts,
                          f"Still invalid after {self.s.max_iters} attempt(s); "
                          "returning closest candidate.")

    def _ask(self, prompt: str, opener: str = "@startuml") -> str | None:
        """One model call. Reassembles the diagram using the primed `opener`.
        Propagates MatrixSafeError so outages surface (never silently empty)."""
        completion = self.client.generate(
            self.s.agent, prompt,
            temperature=self.s.temperature, max_tokens=self.s.max_tokens,
        )
        return diagram_from_primed(completion, opener)

    def _validate(self, text: str) -> ValidationResult:
        return self.validator.validate(text)


__all__ = ["Corrector", "Settings", "Transcript", "Attempt", "MatrixSafeError"]

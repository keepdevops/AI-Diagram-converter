"""Renderer/validator strategy: one contract, selectable backends.

A `Validator` turns diagram text into a normalized `ValidationResult`
(ok + error message + error line). The active backend is chosen by
`settings.renderer` (env `PLANTUML_RENDERER`). Sprint 1/2 ship `server`;
`bridge` (jar) and `client` (plantuml.js under Node) plug in here later.

`ValidationResult` is the shared normalized shape every backend must emit —
see `diagram_agent.plantuml`.
"""
from __future__ import annotations

from typing import Protocol, runtime_checkable

from diagram_agent.plantuml import ValidationResult

__all__ = ["Validator", "ValidationResult", "get_validator", "SUPPORTED"]

SUPPORTED = ("server",)


@runtime_checkable
class Validator(Protocol):
    def validate(self, text: str) -> ValidationResult:
        """Validate diagram text. A syntax error is a normal ok=False result;
        transport/engine failures raise (fail loudly), never silently pass."""
        ...


def get_validator(settings) -> Validator:
    """Build the validator named by `settings.renderer`. Unknown names fail
    loudly rather than silently degrading."""
    name = getattr(settings, "renderer", "server")
    if name == "server":
        from diagram_agent.renderers.server_validator import ServerValidator

        return ServerValidator(
            server=settings.plantuml_server,
            engine=getattr(settings, "render_engine", "plantuml-server"),
            timeout=settings.render_timeout,
        )
    raise ValueError(
        f"unknown PLANTUML_RENDERER={name!r}; supported: {', '.join(SUPPORTED)}"
    )

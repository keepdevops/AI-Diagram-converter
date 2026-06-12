"""Pluggable PlantUML validators (the renderer "module" backends).

One contract — `Validator.validate(text) -> ValidationResult` — with backends
selected by the `PLANTUML_RENDERER` setting, so the correction loop in
`corrector.py` never knows which engine validated a diagram.

    from diagram_agent.renderers.base import Validator, get_validator
"""

__all__ = ["base", "server_validator"]

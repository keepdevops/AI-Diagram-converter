"""Conformance spec every renderer backend must satisfy.

The correction loop is renderer-agnostic only if all validators emit the same
normalized `ValidationResult` shape. `assert_validator_contract` is that shared
spec; each backend (server now, bridge/client later) plugs into it.

Run:  python -m unittest diagram_agent.renderers.test_contract -v

The ServerValidator integration test is skipped unless a live render service is
given via RENDER_CONTRACT_SERVER, e.g.:
  RENDER_CONTRACT_SERVER=http://localhost:8088/plantuml \
    python -m unittest diagram_agent.renderers.test_contract -v
"""
from __future__ import annotations

import os
import unittest
import urllib.error
import urllib.request

from diagram_agent.plantuml import ValidationResult

VALID = "@startuml\nAlice -> Bob : hello\n@enduml"
# A line PlantUML cannot parse as any diagram (it is lenient about many things,
# so use clearly invalid tokens rather than a near-miss).
BROKEN = "@startuml\nthis is not valid plantuml @@@\n@enduml"


def assert_validator_contract(test: unittest.TestCase, validator) -> None:
    """Assert a validator honors the normalized contract."""
    good = validator.validate(VALID)
    test.assertIsInstance(good, ValidationResult)
    test.assertTrue(good.ok, f"valid diagram should pass, got error={good.error!r}")

    bad = validator.validate(BROKEN)
    test.assertIsInstance(bad, ValidationResult)
    test.assertFalse(bad.ok, "broken diagram should fail")
    test.assertIsInstance(bad.error, str)
    test.assertTrue(bad.error, "failure must carry a non-empty message")
    if bad.error_line is not None:
        test.assertIsInstance(bad.error_line, int)

    empty = validator.validate("   ")
    test.assertFalse(empty.ok, "empty diagram should fail")


class _FakeValidator:
    """Reference implementation: proves the spec is satisfiable offline and that
    the harness itself catches contract violations."""

    def validate(self, text: str) -> ValidationResult:
        if not text or not text.strip():
            return ValidationResult(ok=False, error="empty diagram")
        if "@@@" in text:
            return ValidationResult(ok=False, error="syntax error", error_line=2)
        return ValidationResult(ok=True, status=200)


class FakeValidatorContractTest(unittest.TestCase):
    def test_contract(self) -> None:
        assert_validator_contract(self, _FakeValidator())


def _reachable(server: str) -> bool:
    try:
        urllib.request.urlopen(server.rstrip("/") + "/svg/SyfFKj2rKt3CoKnELR1Io4ZDoSa70000",
                               timeout=4)
        return True
    except urllib.error.HTTPError:
        return True  # reachable; a 4xx still means the service answered
    except OSError:
        return False


@unittest.skipUnless(
    os.getenv("RENDER_CONTRACT_SERVER") and _reachable(os.environ["RENDER_CONTRACT_SERVER"]),
    "set RENDER_CONTRACT_SERVER to a reachable render service to run this",
)
class ServerValidatorContractTest(unittest.TestCase):
    def test_contract(self) -> None:
        from diagram_agent.renderers.server_validator import ServerValidator

        engine = os.getenv("RENDER_CONTRACT_ENGINE", "plantuml-server")
        validator = ServerValidator(
            server=os.environ["RENDER_CONTRACT_SERVER"], engine=engine, timeout=20.0
        )
        assert_validator_contract(self, validator)


if __name__ == "__main__":
    unittest.main()

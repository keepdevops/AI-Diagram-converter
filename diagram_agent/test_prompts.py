"""Unit tests for prompt construction (prompts.py).

Run:  python -m unittest diagram_agent.test_prompts -v
"""
from __future__ import annotations

import unittest

from diagram_agent import prompts
from diagram_agent.plantuml import ValidationResult


class OpenerTest(unittest.TestCase):
    def test_niche_openers(self) -> None:
        self.assertEqual(prompts.opener_for("mindmap"), "@startmindmap")
        self.assertEqual(prompts.opener_for("wbs"), "@startwbs")
        self.assertEqual(prompts.opener_for("GANTT"), "@startgantt")  # case-insensitive

    def test_default_opener(self) -> None:
        self.assertEqual(prompts.opener_for(None), "@startuml")
        self.assertEqual(prompts.opener_for("sequence"), "@startuml")

    def test_opener_of_text(self) -> None:
        self.assertEqual(prompts.opener_of_text("@startmindmap\n* a"), "@startmindmap")
        self.assertEqual(prompts.opener_of_text("  @startwbs\n* a"), "@startwbs")
        self.assertEqual(prompts.opener_of_text("A -> B"), "@startuml")


class GeneratePromptTest(unittest.TestCase):
    def test_primes_niche_opener_and_hint(self) -> None:
        p = prompts.generate_prompt("a tree of topics", "mindmap")
        # Assistant turn primed with the correct @start token + fence.
        self.assertIn("```plantuml\n@startmindmap\n", p)
        self.assertIn("Mindmap syntax", p)             # type hint included
        self.assertIn("a tree of topics", p)

    def test_generic_defaults_to_startuml(self) -> None:
        p = prompts.generate_prompt("some system", "generic")
        self.assertIn("```plantuml\n@startuml\n", p)
        self.assertIn("most appropriate PlantUML diagram type", p)


class FixPromptTest(unittest.TestCase):
    def test_includes_error_line_and_type(self) -> None:
        r = ValidationResult(ok=False, error="boom", error_line=3, assumed_type="sequence")
        p = prompts.fix_prompt("@startuml\nA -> B\n@enduml", r)
        self.assertIn("boom", p)
        self.assertIn("line 3", p)
        self.assertIn("sequence", p)
        self.assertIn("```plantuml\n@startuml\n", p)   # primed with the diagram's opener

    def test_handles_missing_line_and_type(self) -> None:
        r = ValidationResult(ok=False, error="bad")
        p = prompts.fix_prompt("@startmindmap\n* x", r)
        self.assertIn("bad", p)
        self.assertNotIn("at line", p)
        self.assertIn("@startmindmap", p)              # opener taken from the text


class MermaidPromptTest(unittest.TestCase):
    def test_primes_mermaid_fence(self) -> None:
        p = prompts.mermaid_prompt("some prose", "text")
        self.assertIn("Mermaid diagram expert", p)
        self.assertIn("some prose", p)
        self.assertTrue(p.rstrip().endswith("```mermaid"))


if __name__ == "__main__":
    unittest.main()

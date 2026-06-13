"""Unit tests for diagram extraction + artifact repair (extract.py).

Run:  python -m unittest diagram_agent.test_extract -v
"""
from __future__ import annotations

import unittest

from diagram_agent.extract import (
    diagram_from_primed, extract_diagram, extract_mermaid, mermaid_looks_valid,
    normalize_plantuml,
)


class NormalizePlantumlTest(unittest.TestCase):
    def test_doubled_quotes(self) -> None:
        self.assertEqual(normalize_plantuml('package ""Foo""'), 'package "Foo"')

    def test_endnote_keyword(self) -> None:
        self.assertIn("end note", normalize_plantuml("note left\nhi\n@endnote"))

    def test_packed_components_split(self) -> None:
        out = normalize_plantuml("[a] [b] [c]")
        self.assertEqual(out.splitlines(), ["[a]", "[b]", "[c]"])

    def test_quote_dashed_decl_and_refs(self) -> None:
        out = normalize_plantuml("node llama-server\na --> llama-server")
        self.assertIn('node "llama-server"', out)
        self.assertIn('a --> "llama-server"', out)

    def test_dotted_name_quoted(self) -> None:
        self.assertIn('node "mlx.server"', normalize_plantuml("node mlx.server"))

    def test_underscore_name_left_alone(self) -> None:
        self.assertEqual(normalize_plantuml("node my_server"), "node my_server")

    def test_dedupe_aliases(self) -> None:
        out = normalize_plantuml('rectangle "X" as a\nrectangle "Y" as a')
        self.assertIn("as a\n", out + "\n")
        self.assertIn("as a_2", out)        # second reuse renamed

    def test_idempotent(self) -> None:
        once = normalize_plantuml("node llama-server\na --> llama-server")
        self.assertEqual(normalize_plantuml(once), once)

    def test_empty(self) -> None:
        self.assertEqual(normalize_plantuml(""), "")


class ExtractDiagramTest(unittest.TestCase):
    def test_block_from_prose(self) -> None:
        out = extract_diagram("here:\n@startuml\nA -> B\n@enduml\nthanks")
        self.assertEqual(out, "@startuml\nA -> B\n@enduml")

    def test_block_inside_fence(self) -> None:
        text = "```plantuml\n@startuml\nA -> B\n@enduml\n```"
        self.assertEqual(extract_diagram(text), "@startuml\nA -> B\n@enduml")

    def test_strips_chatml_terminator(self) -> None:
        out = extract_diagram("@startuml\nA -> B\n@enduml<|im_end|>junk")
        self.assertEqual(out, "@startuml\nA -> B\n@enduml")

    def test_none_when_no_diagram(self) -> None:
        self.assertIsNone(extract_diagram("no diagram here at all"))
        self.assertIsNone(extract_diagram(""))


class MermaidTest(unittest.TestCase):
    def test_extract_from_fence(self) -> None:
        out = extract_mermaid("sure:\n```mermaid\nflowchart TD\nA-->B\n```")
        self.assertEqual(out, "flowchart TD\nA-->B")

    def test_looks_valid(self) -> None:
        self.assertTrue(mermaid_looks_valid("flowchart TD\nA-->B"))
        self.assertTrue(mermaid_looks_valid("sequenceDiagram\nA->>B: hi"))

    def test_looks_invalid(self) -> None:
        self.assertFalse(mermaid_looks_valid("not a diagram"))
        self.assertFalse(mermaid_looks_valid(""))


class DiagramFromPrimedTest(unittest.TestCase):
    def test_wraps_bare_body_with_default_opener(self) -> None:
        self.assertEqual(diagram_from_primed("A -> B : hi"), "@startuml\nA -> B : hi\n@enduml")

    def test_custom_opener_and_closer(self) -> None:
        out = diagram_from_primed("* Root\n** Child", "@startmindmap")
        self.assertTrue(out.startswith("@startmindmap"))
        self.assertTrue(out.rstrip().endswith("@endmindmap"))
        self.assertIn("* Root", out)

    def test_complete_block_passthrough(self) -> None:
        out = diagram_from_primed("@startuml\nA -> B\n@enduml")
        self.assertEqual(out, "@startuml\nA -> B\n@enduml")

    def test_empty_is_none(self) -> None:
        self.assertIsNone(diagram_from_primed(""))


if __name__ == "__main__":
    unittest.main()

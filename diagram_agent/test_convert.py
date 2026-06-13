"""Unit tests for the deterministic format detection / conversion (convert.py).

Run:  python -m unittest diagram_agent.test_convert -v
"""
from __future__ import annotations

import unittest

from diagram_agent.convert import detect_format, to_plantuml


class DetectFormatTest(unittest.TestCase):
    def test_empty(self) -> None:
        self.assertEqual(detect_format(""), "empty")
        self.assertEqual(detect_format("   \n  "), "empty")

    def test_plantuml(self) -> None:
        self.assertEqual(detect_format("@startuml\nA -> B\n@enduml"), "plantuml")
        self.assertEqual(detect_format("  @startMindmap\n* x"), "plantuml")

    def test_json(self) -> None:
        self.assertEqual(detect_format('{"a": 1}'), "json")
        self.assertEqual(detect_format("[1, 2, 3]"), "json")

    def test_invalid_json_is_not_json(self) -> None:
        # Leading '[' but not parseable -> falls through to text.
        self.assertEqual(detect_format("[not json"), "text")

    def test_markdown(self) -> None:
        self.assertEqual(detect_format("# Heading\n\nbody"), "markdown")
        self.assertEqual(detect_format("- a\n- b"), "markdown")  # bullets, no heading

    def test_yaml(self) -> None:
        self.assertEqual(detect_format("key: value\nother: 2"), "yaml")
        self.assertEqual(detect_format("---\nfoo: bar"), "yaml")

    def test_plain_text(self) -> None:
        self.assertEqual(detect_format("just some prose here"), "text")


class ToPlantumlTest(unittest.TestCase):
    def test_json_wraps(self) -> None:
        self.assertEqual(to_plantuml('{"a":1}', "json"), '@startjson\n{"a":1}\n@endjson')

    def test_yaml_wraps(self) -> None:
        self.assertEqual(to_plantuml("a: b", "yaml"), "@startyaml\na: b\n@endyaml")

    def test_markdown_mindmap(self) -> None:
        out = to_plantuml("# Title\n- item one\n- item two", "markdown")
        self.assertIsNotNone(out)
        self.assertTrue(out.startswith("@startmindmap"))
        self.assertIn("* Document", out)        # synthetic single root
        self.assertIn("Title", out)
        self.assertIn("item one", out)
        self.assertTrue(out.rstrip().endswith("@endmindmap"))

    def test_markdown_without_structure_is_none(self) -> None:
        # No headings or bullets -> nothing to map.
        self.assertIsNone(to_plantuml("plain paragraph, no structure", "markdown"))

    def test_unconvertible_format_is_none(self) -> None:
        self.assertIsNone(to_plantuml("anything", "text"))


if __name__ == "__main__":
    unittest.main()

#!/usr/bin/env python3
import re
import subprocess
import sys
from pathlib import Path
class PlantUMLEditor:
    def __init__(self, plantuml_jar="plantuml.jar"):
        self.jar = plantuml_jar
        self.diagram_types = {
            "component": ["component", "package", "interface", "[]"],
            "deployment": ["node", "cloud", "artifact"],
            "sequence": ["->", "participant"],
            "activity": ["->", ":action;"],
        }
    def detect_type(self, content):
        content_lower = content.lower()
        if re.search(r'\[.*\]', content) or "component" in content_lower:
            return "component"
        if "node" in content_lower or "cloud" in content_lower:
            return "deployment"
        if "->" in content and "participant" in content_lower:
            return "sequence"
        if "@startuml" in content_lower:
            return "unknown"
        return "generic"
    def auto_correct(self, content, target_type=None):
        detected = self.detect_type(content)
        target = target_type or detected
        content = re.sub(r'frame\s+(".*?"|\S+)', r'rectangle \1', content)
        content = re.sub(r'\\n', '\n', content)
        content = re.sub(r'(?<!\\)n(?=\s)', '\n', content)
        if target == "component":
            content = re.sub(r'(\w+)\s+as\s+(\w+)', r'[\1] as \2', content)
            content = re.sub(r'rectangle\s+"([^"]+)"', r'[\1]', content)
        if "@startuml" in content and "skinparam" not in content:
            header = "@startuml\ntitle **Diagram**\nskinparam monochrome true\nskinparam shadowing false\n\n"
            if "@startuml" in content:
                content = header + content.split("@startuml", 1)[1]
            else:
                content = header + content
        return content.strip()
    def convert_to(self, content, target_type):
        current = self.detect_type(content)
        corrected = self.auto_correct(content, current)
        if current == "component" and target_type == "deployment":
            corrected = corrected.replace("component", "node")
            corrected = corrected.replace("[", "").replace("]", "")
            corrected = re.sub(r'package "(.*?)"', r'cloud "\1"', corrected)
            print(f"Converted {current} → {target_type}")
        elif current == "sequence" and target_type == "activity":
            corrected = re.sub(r'->', r':', corrected)
            corrected = re.sub(r'participant (\w+)', r':\1;', corrected)
            print(f"Converted {current} → {target_type}")
        return corrected
    def validate(self, content):
        try:
            with open("temp.puml", "w") as f:
                f.write(content)
            result = subprocess.run(["java", "-jar", self.jar, "-check-syntax", "temp.puml"], capture_output=True, text=True, timeout=10)
            return "No syntax error" in (result.stdout or result.stderr) or result.returncode == 0
        except Exception:
            return False
        finally:
            Path("temp.puml").unlink(missing_ok=True)
    def process(self, input_file, output_file=None, convert_to=None):
        with open(input_file) as f:
            content = f.read()
        corrected = self.auto_correct(content)
        if convert_to:
            corrected = self.convert_to(corrected, convert_to)
        if self.validate(corrected):
            print("✅ Diagram is valid!")
        else:
            print("⚠️  Syntax issues remain — manual review recommended.")
        out = output_file or input_file
        with open(out, "w") as f:
            f.write(corrected)
        print(f"Saved to {out}")
def _print_attempts(transcript):
    for a in transcript.attempts:
        status = "✅ valid" if a.result.ok else f"❌ {a.result.error}"
        print(f"  attempt {a.iteration}: {status}")
    print(transcript.note or "")


def _ai_fix(editor, input_file, output):
    """Repair a diagram via matrix-safe; fall back to regex if it's unreachable."""
    from diagram_agent.corrector import Corrector, MatrixSafeError
    with open(input_file) as f:
        content = f.read()
    try:
        transcript = Corrector().fix(content)
    except MatrixSafeError as exc:
        print(f"⚠️  matrix-safe unavailable ({exc}). Falling back to regex auto_correct.")
        out = output or input_file
        with open(out, "w") as f:
            f.write(editor.auto_correct(content))
        print(f"Saved regex-corrected diagram to {out}")
        return
    _print_attempts(transcript)
    out = output or input_file
    with open(out, "w") as f:
        f.write(transcript.diagram)
    print(("✅ Fixed. " if transcript.ok else "⚠️  Best effort. ") + f"Saved to {out}")


def _ai_generate(editor, description, output):
    """Build a diagram from a natural-language description via matrix-safe."""
    from diagram_agent.corrector import Corrector, MatrixSafeError
    try:
        transcript = Corrector().generate(description, editor.detect_type(description))
    except MatrixSafeError as exc:
        raise SystemExit(f"⚠️  matrix-safe unavailable ({exc}). Start it on :8765 first.")
    _print_attempts(transcript)
    if not output:
        print(transcript.diagram)
    else:
        with open(output, "w") as f:
            f.write(transcript.diagram)
        print(("✅ Generated. " if transcript.ok else "⚠️  Best effort. ") + f"Saved to {output}")


if __name__ == "__main__":
    import click

    @click.command()
    @click.argument("input_file", required=False)
    @click.option("--convert-to", help="Target diagram type (component, deployment, sequence, etc.)")
    @click.option("--output", "-o", help="Output file")
    @click.option("--ai-fix", is_flag=True, help="Repair INPUT_FILE using matrix-safe.")
    @click.option("--generate", "generate_desc", help="Build a diagram from a description (matrix-safe).")
    def cli(input_file, convert_to, output, ai_fix, generate_desc):
        editor = PlantUMLEditor()
        if generate_desc:
            _ai_generate(editor, generate_desc, output)
        elif ai_fix:
            if not input_file:
                raise SystemExit("--ai-fix requires INPUT_FILE")
            _ai_fix(editor, input_file, output)
        else:
            if not input_file:
                raise SystemExit("INPUT_FILE is required (or use --generate)")
            editor.process(input_file, output, convert_to)

    cli()

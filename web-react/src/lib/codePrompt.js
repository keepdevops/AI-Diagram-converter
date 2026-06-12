// Diagram-type switcher config for "code → diagram", and the prompt builder that
// turns pasted code + a chosen type into a `description` for agentClient.generate.
// No backend change: the description carries the code and the instruction, and the
// existing generate + validate/guard loop produces a validated PlantUML diagram.

import { LANGS } from './codeLang.js';

const labelOf = Object.fromEntries(LANGS.map((l) => [l.id, l.label]));

// key -> { label, plantumlType (hint for generate), instruction }
export const CODE_DIAGRAMS = [
  {
    key: 'class',
    label: 'Class / struct',
    plantumlType: 'class',
    instruction:
      'a UML class diagram of the types/classes/structs: their fields, methods, '
      + 'and inheritance/composition relationships.',
  },
  {
    key: 'callgraph',
    label: 'Call graph',
    plantumlType: 'component',
    instruction:
      'a call graph: one node per function/method, and an arrow A --> B whenever '
      + 'function A calls function B.',
  },
  {
    key: 'controlflow',
    label: 'Control flow',
    plantumlType: 'activity',
    instruction:
      'an activity (control-flow) diagram of the primary function: start, the '
      + 'conditionals and loops (if/else, for/while) and their branches, then stop.',
  },
  {
    key: 'modules',
    label: 'Module structure',
    plantumlType: 'component',
    instruction:
      'a component diagram of the modules/files/packages and their import or '
      + 'dependency relationships.',
  },
];

export const diagramFor = (key) => CODE_DIAGRAMS.find((d) => d.key === key) || CODE_DIAGRAMS[0];

// Build the generate() description from code + language + diagram key.
export function buildCodePrompt(code, lang, key) {
  const d = diagramFor(key);
  const language = labelOf[lang] || lang || 'source';
  return (
    `From the following ${language} code, create ${d.instruction}\n`
    + 'Use the actual identifiers from the code. Output only the diagram.\n\n'
    + `\`\`\`${lang}\n${code.trim()}\n\`\`\``
  );
}

// Help popover body: a quick reference for the views, the per-view actions,
// and the keyboard shortcuts. Pairs with the Settings popover in the top bar.
// Static content only — no props — so it stays cheap to render.

const VIEWS = [
  ['Editor', 'Write PlantUML (or Mermaid) with live preview. Paste code, pick an Example, or Clear to start over.'],
  ['Fix / Convert', 'Load/paste a .md or diagram and convert PlantUML ↔ Mermaid, change diagram type, or generate diagrams from prose. Auto ✦ converts a whole doc.'],
  ['Graph', 'Edit the diagram as a node/edge graph and apply changes back to the editor.'],
  ['Designer', 'Visual canvas: drop shapes, group into containers, and apply the design to the editor.'],
  ['Code', 'Generate diagrams from source code, then open the result in the Editor or Graph.'],
];

const ACTIONS = [
  ['Fix ✦', 'Repair the current diagram via the matrix-safe agent.'],
  ['Generate ✦', 'Generate a diagram from a text description.'],
  ['Clear', 'Empty the editor (confirms first) or the Convert source.'],
  ['Convert', 'Deterministic format/type conversion — no model needed.'],
  ['View ↗', 'Open the rendered image in a new browser tab.'],
];

const SHORTCUTS = [
  ['⌘/Ctrl + S', 'Save'],
  ['⌘/Ctrl + ⇧ + S', 'Save As'],
  ['⌘/Ctrl + O', 'Open'],
];

export default function HelpPanel() {
  return (
    <div className="help">
      <section className="help-section">
        <h3 className="help-h">Views</h3>
        <dl className="help-list">
          {VIEWS.map(([name, desc]) => (
            <div className="help-item" key={name}>
              <dt>{name}</dt>
              <dd>{desc}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="help-section">
        <h3 className="help-h">Actions</h3>
        <dl className="help-list">
          {ACTIONS.map(([name, desc]) => (
            <div className="help-item" key={name}>
              <dt>{name}</dt>
              <dd>{desc}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="help-section">
        <h3 className="help-h">Keyboard</h3>
        <dl className="help-list">
          {SHORTCUTS.map(([keys, desc]) => (
            <div className="help-item" key={keys}>
              <dt><span className="kbd">{keys}</span></dt>
              <dd>{desc}</dd>
            </div>
          ))}
        </dl>
      </section>

      <p className="settings-hint">
        Fix / Generate need the matrix-safe agent (status badge top-right).
        Live preview always works — it renders via the PlantUML server.
        Configure both endpoints under ⚙ Settings.
      </p>
    </div>
  );
}

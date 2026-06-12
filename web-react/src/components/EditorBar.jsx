// Editor-view action bar: insert example, Fix / Generate via the swarm, and the
// render Format + View-in-new-tab. Shown only in the Editor view (Convert / Graph
// / Code have their own bars), matching the per-view action-bar pattern.

import { EXAMPLES } from '../lib/examples.js';

export default function EditorBar({
  onExample, onFix, onGenerate, running, format, onFormat, onViewRender,
}) {
  return (
    <div className="convert-bar editor-bar">
      <label>
        Example
        <select defaultValue="" onChange={(e) => { onExample(e.target.value); e.target.value = ''; }}>
          <option value="">— insert —</option>
          {Object.keys(EXAMPLES).map((name) => (
            <option key={name} value={name}>{name[0].toUpperCase() + name.slice(1)}</option>
          ))}
        </select>
      </label>

      <button type="button" className="auto-btn" onClick={onFix} disabled={running}
        title="Repair the current diagram via the swarm">Fix ✦</button>
      <button type="button" onClick={onGenerate} disabled={running}
        title="Generate a diagram from a description">Generate ✦</button>

      <span className="spacer" />

      <label>
        Format
        <select value={format} onChange={(e) => onFormat(e.target.value)}>
          <option value="svg">SVG</option>
          <option value="png">PNG</option>
          <option value="txt">ASCII</option>
        </select>
      </label>
      <button type="button" onClick={onViewRender} title="Open the rendered image in a new tab">View ↗</button>
    </div>
  );
}

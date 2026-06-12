// Inspector: style the selected node (label/shape/color) or edge (label/line/
// arrowhead). Edits call onNode/onEdge to patch the model; onDelete removes it.

import { SHAPES, COLORS } from './Palette.jsx';

export default function Inspector({ selected, onNode, onEdge, onDelete }) {
  if (!selected) {
    return <div className="inspector"><div className="inspector-empty">Select a node or edge to style it. Drag shapes from the palette.</div></div>;
  }

  if (selected.kind === 'node') {
    const n = selected.node;
    return (
      <div className="inspector">
        <div className="inspector-title">Node</div>
        <label className="inspector-field">Label
          <input value={n.label} onChange={(e) => onNode(n.id, { label: e.target.value })} />
        </label>
        <label className="inspector-field">Shape
          <select value={n.kind || 'box'} onChange={(e) => onNode(n.id, { kind: e.target.value })}>
            {SHAPES.map((s) => <option key={s.kind} value={s.kind}>{s.label}</option>)}
          </select>
        </label>
        <div className="inspector-field">Color
          <div className="swatches">
            {COLORS.map((c, i) => (
              <button
                key={i}
                type="button"
                className={`swatch${(n.color || null) === c ? ' on' : ''}`}
                style={{ background: c || 'transparent' }}
                title={c || 'none'}
                onClick={() => onNode(n.id, { color: c })}
              >{c ? '' : '∅'}</button>
            ))}
          </div>
        </div>
        <button type="button" className="inspector-del" onClick={onDelete}>Delete node</button>
      </div>
    );
  }

  const e = selected.edge;
  const line = e.line || (e.dashed ? 'dashed' : 'solid');
  return (
    <div className="inspector">
      <div className="inspector-title">Edge</div>
      <label className="inspector-field">Label
        <input value={e.label || ''} onChange={(ev) => onEdge(e.id, { label: ev.target.value })} />
      </label>
      <label className="inspector-field">Line
        <select value={line} onChange={(ev) => onEdge(e.id, { line: ev.target.value, dashed: ev.target.value !== 'solid' })}>
          <option value="solid">solid</option>
          <option value="dashed">dashed</option>
          <option value="dotted">dotted</option>
        </select>
      </label>
      <label className="inspector-chk">
        <input type="checkbox" checked={e.arrow !== false} onChange={(ev) => onEdge(e.id, { arrow: ev.target.checked })} /> arrowhead
      </label>
      <button type="button" className="inspector-del" onClick={onDelete}>Delete edge</button>
    </div>
  );
}

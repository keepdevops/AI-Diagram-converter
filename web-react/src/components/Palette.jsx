// Shape palette: draggable typed shapes. Dragging one onto the canvas adds a node
// of that kind (DesignerCanvas reads the dataTransfer kind on drop).

export const SHAPES = [
  { kind: 'box', label: 'Box' },
  { kind: 'rounded', label: 'Rounded' },
  { kind: 'actor', label: 'Actor' },
  { kind: 'database', label: 'Database' },
  { kind: 'decision', label: 'Decision' },
  { kind: 'package', label: 'Package' },
  { kind: 'note', label: 'Note' },
];

export const COLORS = ['#7aa2f7', '#9ece6a', '#e0af68', '#f7768e', '#bb9af7', '#7dcfff', null];

export const DRAG_TYPE = 'application/diagram-shape';

export default function Palette() {
  return (
    <div className="palette">
      <div className="palette-title">Shapes</div>
      {SHAPES.map((s) => (
        <div
          key={s.kind}
          className={`palette-item shape shape-${s.kind}`}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData(DRAG_TYPE, s.kind);
            e.dataTransfer.effectAllowed = 'move';
          }}
          title={`Drag a ${s.label} onto the canvas`}
        >
          <span className="shape-label">{s.label}</span>
        </div>
      ))}
      <div className="palette-hint">drag onto canvas</div>
    </div>
  );
}

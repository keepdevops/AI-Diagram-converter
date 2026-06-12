// Custom React Flow edge with an inline-editable label rendered via
// EdgeLabelRenderer. Double-click the label area to edit; commit on Enter/blur
// through data.onLabel(id, label). Shows a "+label" affordance when empty.

import { useState } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath } from '@xyflow/react';

export default function EditableEdge({ id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition, label, markerEnd, style, data }) {
  const [path, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition,
  });
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(label || '');

  const commit = () => { setEditing(false); data?.onLabel?.(id, value.trim()); };

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <div
          className="gedge-label"
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}
        >
          {editing ? (
            <input
              className="gedge-input"
              value={value}
              autoFocus
              onChange={(e) => setValue(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit();
                else if (e.key === 'Escape') setEditing(false);
                e.stopPropagation();
              }}
            />
          ) : (
            <span className={label ? '' : 'muted'}>{label || '+label'}</span>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

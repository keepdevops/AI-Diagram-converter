// Custom React Flow node: source/target handles (so connect-by-drag works) plus
// an inline-editable label (double-click → input, commit on Enter/blur). Commits
// flow up via data.onRename(id, label). Styling reads data.kind (actor/mindmap/box).

import { useEffect, useRef, useState } from 'react';
import { Handle, Position } from '@xyflow/react';

export default function EditableNode({ id, data, selected }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(data.label);
  const inputRef = useRef(null);

  useEffect(() => { setValue(data.label); }, [data.label]);
  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  const commit = () => {
    setEditing(false);
    const next = value.trim();
    if (next && next !== data.label) data.onRename?.(id, next);
    else setValue(data.label);
  };

  return (
    <div className={`gnode gnode-${data.kind || 'box'}${selected ? ' selected' : ''}`}
         onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}>
      <Handle type="target" position={Position.Top} />
      {editing ? (
        <input
          ref={inputRef}
          className="gnode-input"
          value={value}
          autoFocus
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            else if (e.key === 'Escape') { setValue(data.label); setEditing(false); }
            e.stopPropagation();
          }}
        />
      ) : (
        <span className="gnode-label">{data.label}</span>
      )}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

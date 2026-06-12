// React Flow node that renders a typed shape (box/rounded/actor/database/
// decision/package/note) with an optional color, source/target handles, and an
// inline-editable label. Shape visuals come from CSS (.shape-<kind>).

import { useEffect, useRef, useState } from 'react';
import { Handle, Position } from '@xyflow/react';

export default function ShapeNode({ id, data, selected }) {
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

  const style = data.color
    ? { borderColor: data.color, boxShadow: `inset 0 100px 0 ${data.color}22` }
    : undefined;

  return (
    <div className={`shape shape-${data.kind || 'box'}${selected ? ' selected' : ''}`} style={style}
         onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}>
      <Handle type="target" position={Position.Top} />
      {editing ? (
        <input
          ref={inputRef} className="gnode-input" value={value} autoFocus
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            else if (e.key === 'Escape') { setValue(data.label); setEditing(false); }
            e.stopPropagation();
          }}
        />
      ) : (
        <span className="shape-label">{data.label}</span>
      )}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

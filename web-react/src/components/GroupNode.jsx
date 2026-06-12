// React Flow container/group node: a bordered box (sized by style) with an
// inline-editable header label. Children render on top and move with it.

import { useEffect, useRef, useState } from 'react';

export default function GroupNode({ id, data, selected }) {
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
    <div className={`group-node${selected ? ' selected' : ''}`} style={data.color ? { borderColor: data.color } : undefined}>
      <div className="group-header" onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}>
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
          <span>{data.label}</span>
        )}
      </div>
    </div>
  );
}

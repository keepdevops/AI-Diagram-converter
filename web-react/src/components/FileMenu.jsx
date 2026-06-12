// File operations as a compact "File ▾" dropdown (New, Open, Save, Save As ▸ with
// a format choice, Close) plus the current filename + unsaved-changes dot shown
// next to the trigger. Behavior is unchanged from the old flat button row.

import Popover from './Popover.jsx';

const FORMATS = [
  { value: 'source', label: 'Source (.puml/.mmd)' },
  { value: 'md', label: 'Markdown (.md)' },
  { value: 'json', label: 'JSON (.json)' },
  { value: 'svg', label: 'SVG (.svg)' },
  { value: 'png', label: 'PNG (.png)' },
  { value: 'jpg', label: 'JPG (.jpg)' },
];

export default function FileMenu({
  name, dirty, format, busy, onFormat, onNew, onOpen, onSave, onSaveAs, onClose,
}) {
  return (
    <div className="filemenu">
      <Popover label="File ▾" title="File operations" className="filemenu-pop">
        {(close) => (
          <div className="menu">
            <button type="button" className="menu-item" onClick={() => { onNew(); close(); }}>New</button>
            <button type="button" className="menu-item" disabled={busy} onClick={() => { onOpen(); close(); }}>Open…<span className="kbd">⌘O</span></button>
            <button type="button" className="menu-item" disabled={busy} onClick={() => { onSave(); close(); }}>Save<span className="kbd">⌘S</span></button>
            <div className="menu-sep" />
            <div className="menu-label">Save As</div>
            <div className="menu-saveas">
              <select value={format} onChange={(e) => onFormat(e.target.value)} disabled={busy}>
                {FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
              <button type="button" disabled={busy} onClick={() => { onSaveAs(format); close(); }}>Save As</button>
            </div>
            <div className="menu-sep" />
            <button type="button" className="menu-item" onClick={() => { onClose(); close(); }}>Close</button>
          </div>
        )}
      </Popover>
      <span className="filename" title={name}>{dirty ? '● ' : ''}{name}</span>
    </div>
  );
}

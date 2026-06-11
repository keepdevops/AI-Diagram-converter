// File operations cluster for the toolbar: New, Open, Save, Save As (with a
// format selector), Close, plus the current filename and an unsaved-changes dot.
// Pure presentation — all behavior is passed in from App.

const FORMATS = [
  { value: 'source', label: 'source (.puml/.mmd)' },
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
      <button type="button" onClick={onNew} title="New / clear">New</button>
      <button type="button" onClick={onOpen} title="Open file (⌘O)" disabled={busy}>Open</button>
      <button type="button" onClick={onSave} title="Save (⌘S)" disabled={busy}>Save</button>
      <select
        value={format}
        onChange={(e) => onFormat(e.target.value)}
        title="Save As format"
        disabled={busy}
      >
        {FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
      </select>
      <button type="button" onClick={() => onSaveAs(format)} title="Save As (⌘⇧S)" disabled={busy}>
        Save As
      </button>
      <button type="button" onClick={onClose} title="Close file">Close</button>
      <span className="filename" title={name}>
        {dirty ? '● ' : ''}{name}
      </span>
    </div>
  );
}

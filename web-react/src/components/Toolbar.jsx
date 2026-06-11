// Top toolbar: example insert, PlantUML server, output format, swarm endpoint +
// health badge, and the swarm actions. Stateless beyond its inputs; all changes
// bubble up to App.

import { EXAMPLES } from '../lib/examples.js';
import FileMenu from './FileMenu.jsx';

export default function Toolbar({
  server,
  onServer,
  format,
  onFormat,
  onExample,
  agentBaseValue,
  onAgentBase,
  swarmInfo,
  running,
  onFix,
  onGenerate,
  onViewRender,
  view,
  onView,
  file,
}) {
  const agentName = swarmInfo?.agent?.replace(/\.json$/, '');
  const badge = swarmInfo === undefined
    ? { cls: 'pending', text: 'checking…' }
    : swarmInfo
      ? { cls: 'ok', text: `agent: ${agentName}` }
      : { cls: 'err', text: 'agent offline' };

  return (
    <header className="toolbar">
      <h1>PlantUML ✦</h1>

      <div className="seg">
        <button type="button" className={view === 'editor' ? 'on' : ''} onClick={() => onView('editor')}>Editor</button>
        <button type="button" className={view === 'convert' ? 'on' : ''} onClick={() => onView('convert')}>Fix / Convert</button>
      </div>

      <FileMenu {...file} />

      <label>
        Example
        <select defaultValue="" onChange={(e) => { onExample(e.target.value); e.target.value = ''; }}>
          <option value="">— insert —</option>
          {Object.keys(EXAMPLES).map((name) => (
            <option key={name} value={name}>
              {name[0].toUpperCase() + name.slice(1)}
            </option>
          ))}
        </select>
      </label>

      <span className="spacer" />

      <label className="agent-field">
        Agent
        <input
          type="text"
          spellCheck={false}
          value={agentBaseValue}
          placeholder="(proxied /api)"
          onChange={(e) => onAgentBase(e.target.value)}
          title="Agent bridge base URL; blank uses the dev proxy"
        />
      </label>

      <span className={`badge ${badge.cls}`} title={swarmInfo?.matrix_url || ''}>
        {badge.text}
      </span>

      <label>
        Server
        <input
          type="text"
          spellCheck={false}
          value={server}
          placeholder="https://www.plantuml.com/plantuml"
          onChange={(e) => onServer(e.target.value)}
        />
      </label>

      <label>
        Format
        <select value={format} onChange={(e) => onFormat(e.target.value)}>
          <option value="svg">SVG</option>
          <option value="png">PNG</option>
          <option value="txt">ASCII</option>
        </select>
      </label>

      <button type="button" onClick={onFix} disabled={running} title="Repair the current diagram via the swarm">
        Fix ✦
      </button>
      <button type="button" onClick={onGenerate} disabled={running} title="Generate a diagram from a description">
        Generate ✦
      </button>
      <button type="button" onClick={onViewRender} title="Open the rendered image in a new tab">View ↗</button>
    </header>
  );
}

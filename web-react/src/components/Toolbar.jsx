// Slim top app bar (chrome only): logo, the primary tab nav, agent status, the
// File dropdown, and a Settings popover. View-specific actions live in each
// view's own bar (EditorBar / convert-bar / GraphView / CodeView).

import Popover from './Popover.jsx';
import FileMenu from './FileMenu.jsx';
import SettingsPanel from './SettingsPanel.jsx';
import HelpPanel from './HelpPanel.jsx';

const TABS = [
  ['editor', 'Editor'],
  ['convert', 'Fix / Convert'],
  ['graph', 'Graph'],
  ['designer', 'Designer'],
  ['code', 'Code'],
];

export default function Toolbar({ view, onView, file, swarmInfo, settings }) {
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
        {TABS.map(([id, label]) => (
          <button key={id} type="button" className={view === id ? 'on' : ''} onClick={() => onView(id)}>{label}</button>
        ))}
      </div>

      <span className="spacer" />

      <span className={`badge ${badge.cls}`} title={swarmInfo?.matrix_url || ''}>{badge.text}</span>

      <FileMenu {...file} />

      <Popover label="?" title="Help" align="right" className="help-pop">
        <HelpPanel />
      </Popover>

      <Popover label="⚙" title="Settings" align="right" className="settings-pop">
        <SettingsPanel {...settings} badge={badge} swarmInfo={swarmInfo} />
      </Popover>
    </header>
  );
}

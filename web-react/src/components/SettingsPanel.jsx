// Settings popover body: the rarely-changed endpoints (matrix-safe agent bridge
// and PlantUML render server), plus the live agent status. Moves these two
// always-visible inputs out of the top-bar chrome.

export default function SettingsPanel({ agentBaseValue, onAgentBase, server, onServer, badge, swarmInfo }) {
  return (
    <div className="settings">
      <div className="settings-row">
        <span className={`badge ${badge.cls}`} title={swarmInfo?.matrix_url || ''}>{badge.text}</span>
      </div>
      <label className="settings-field">
        Agent bridge URL
        <input
          type="text"
          spellCheck={false}
          value={agentBaseValue}
          placeholder="(blank = dev proxy /api)"
          onChange={(e) => onAgentBase(e.target.value)}
        />
      </label>
      <label className="settings-field">
        PlantUML server URL
        <input
          type="text"
          spellCheck={false}
          value={server}
          placeholder="/plantuml"
          onChange={(e) => onServer(e.target.value)}
        />
      </label>
      <p className="settings-hint">Fix / Generate use the agent bridge. Preview renders via the PlantUML server.</p>
    </div>
  );
}

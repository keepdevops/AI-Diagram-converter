// UI smoke test: launches the running dev server in headless Chrome, stubs the
// agent backend / dialogs / file pickers, then clicks every button and fails on
// any uncaught page error or console error. Run with: npm run smoke
// (Start the dev server first: npm run dev. Override URL with SMOKE_URL.)

import { chromium } from 'playwright';

const URL = process.env.SMOKE_URL || 'http://localhost:5180/';
const errors = [];
const log = (...a) => console.log(...a);

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await (await browser.newContext()).newPage();

page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
// Ignore environmental render failures: in a sandboxed headless browser the
// external PlantUML server / Mermaid render can't always be reached.
const IGNORE = /preview image failed|Mermaid error|Failed to load resource|ERR_|net::/i;
page.on('console', (m) => {
  if (m.type() === 'error' && !IGNORE.test(m.text())) errors.push(`console.error: ${m.text()}`);
});

// Stub dialogs, window.open, file pickers, clipboard so buttons run without OS UI.
await page.addInitScript(() => {
  window.confirm = () => true;
  window.prompt = () => 'a sample box with two slots';
  window.open = () => null;
  const abort = async () => { const e = new Error('cancelled'); e.name = 'AbortError'; throw e; };
  window.showSaveFilePicker = abort;
  window.showOpenFilePicker = abort;
  try { Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => {} }, configurable: true }); } catch (_) {}
});

// Fulfill backend so Fix/Generate/health don't hit the real model.
const okTranscript = { ok: true, diagram: '@startuml\nA -> B: hi\n@enduml', note: 'stubbed ok', attempts: [{ iteration: 0, ok: true }] };
await page.route('**/api/health', (r) => r.fulfill({ json: { ok: true, agent: 'test.json', matrix_url: 'x' } }));
await page.route('**/api/fix', (r) => r.fulfill({ json: okTranscript }));
await page.route('**/api/generate', (r) => r.fulfill({ json: okTranscript }));

try {
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForSelector('.toolbar', { timeout: 8000 });
} catch (e) {
  log(`❌ Could not load ${URL} — is the dev server running? (npm run dev)`);
  await browser.close();
  process.exit(1);
}

async function click(label, selector, opts = {}) {
  try {
    await page.locator(selector).first().click({ timeout: 4000, ...opts });
    await page.waitForTimeout(150);
    log(`  ✓ clicked: ${label}`);
  } catch (e) {
    errors.push(`click failed [${label}]: ${e.message.split('\n')[0]}`);
    log(`  ✗ FAILED:  ${label}`);
  }
}
async function select(label, selector, value) {
  try {
    await page.locator(selector).first().selectOption(value, { timeout: 4000 });
    await page.waitForTimeout(150);
    log(`  ✓ select:  ${label} = ${value}`);
  } catch (e) {
    errors.push(`select failed [${label}]: ${e.message.split('\n')[0]}`);
    log(`  ✗ FAILED:  ${label}`);
  }
}

log('--- Toolbar / view toggle ---');
await click('Fix / Convert tab', '.seg button:has-text("Fix / Convert")');
await click('Auto ✦ (md → diagrams)', '.convert-bar .auto-btn');
await page.waitForTimeout(500); // stubbed /api/generate resolves immediately
await click('Convert button', '.convert-bar button:text-is("Convert")');
await select('Convert: mode = generate', '.convert-bar label:has-text("Mode") select', 'generate');
await click('Generate from text', '.convert-bar button:has-text("Generate diagrams")');
await page.waitForTimeout(600); // stubbed /api/generate resolves immediately
await select('Convert: mode = format', '.convert-bar label:has-text("Mode") select', 'format');

log('--- Graph editor (drag/edit) ---');
await click('Graph tab', '.seg button:has-text("Graph")');
try {
  await page.waitForSelector('.react-flow__node', { timeout: 25000 }); // cold-compiles the graph lazy chunk
  const n = await page.locator('.react-flow__node').count();
  log(`  ✓ graph rendered: ${n} node(s)`);
  if (n === 0) errors.push('graph rendered 0 nodes');
  // drag the first node
  const box = await page.locator('.react-flow__node').first().boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 80, { steps: 6 });
  await page.mouse.up();
  log('  ✓ dragged a node');
  // inline rename: double-click a node, type, Enter (best-effort; non-fatal)
  try {
    await page.locator('.gnode').first().dblclick({ timeout: 4000 });
    await page.waitForTimeout(150);
    if (await page.locator('.gnode-input').count()) {
      await page.keyboard.type(' X'); await page.keyboard.press('Enter');
      log('  ✓ inline-renamed a node');
    } else log('  · rename input did not open');
  } catch (e) { log('  · inline rename skipped (dblclick)'); }
} catch (e) {
  errors.push(`graph editor: ${e.message.split('\n')[0]}`);
  log('  ✗ graph editor failed');
}
await click('Graph: Auto-layout', '.graphview button:has-text("Auto-layout")');
await click('Graph: + Node', '.graphview button:has-text("+ Node")');
await click('Graph: Export PNG', '.graphview button:has-text("Export PNG")');
await click('Graph: Export SVG', '.graphview button:has-text("Export SVG")');
await click('Graph: Open .json', '.graphview button:has-text("Open .json")');
await click('Graph: Save .json', '.graphview button:has-text("Save .json")');
await click('Graph: Apply to editor', '.graphview button:has-text("Apply to editor")');
await click('Editor tab', '.seg button:has-text("Editor")');

log('--- Code → diagram ---');
await click('Code tab', '.seg button:has-text("Code")');
try {
  await page.waitForSelector('.convert-bar label:has-text("Diagram") select', { timeout: 25000 });
  log('  ✓ code view loaded');
} catch (e) { errors.push(`code view: ${e.message.split('\n')[0]}`); log('  ✗ code view failed'); }
await select('Code: language = python', '.convert-bar label:has-text("Language") select', 'python');
await select('Code: diagram = callgraph', '.convert-bar label:has-text("Diagram") select', 'callgraph');
await select('Code: as mermaid', '.convert-bar select:has(option[value="mermaid"])', 'mermaid');
await select('Code: as plantuml', '.convert-bar select:has(option[value="mermaid"])', 'plantuml');
await click('Code: Generate ✦', '.convert-bar button:has-text("Generate")');
await page.waitForTimeout(500); // stubbed /api/generate
await click('Code: Open in graph', '.convert-col button:has-text("Open in graph")');
try {
  await page.waitForSelector('.react-flow__node', { timeout: 25000 });
  log(`  ✓ code → graph rendered ${await page.locator('.react-flow__node').count()} node(s)`);
} catch (e) { errors.push(`code→graph: ${e.message.split('\n')[0]}`); log('  ✗ code → graph failed'); }
await click('Editor tab (post-code)', '.seg button:has-text("Editor")');

log('--- Designer (palette / shapes / inspector) ---');
await click('Designer tab', '.seg button:has-text("Designer")');
try {
  await page.waitForSelector('.designer-canvas .react-flow__node, .palette', { timeout: 25000 });
  log(`  ✓ designer loaded (${await page.locator('.designer-canvas .react-flow__node').count()} node(s), ${await page.locator('.palette-item').count()} palette shapes)`);
  // drag a Database shape onto the canvas
  await page.locator('.palette-item:has-text("Database")').dragTo(page.locator('.designer-stage'), { timeout: 5000 });
  await page.waitForTimeout(200);
  log('  ✓ dragged a shape onto the canvas');
  // select a node → inspector → restyle
  await page.locator('.designer-canvas .react-flow__node').first().click();
  await page.waitForTimeout(150);
  if (await page.locator('.inspector-field select').count()) {
    await page.selectOption('.inspector-field:has-text("Shape") select', 'actor').catch(() => {});
    await page.locator('.swatch').nth(1).click().catch(() => {});
    log('  ✓ restyled a node via the inspector');
  } else log('  · inspector did not open');
} catch (e) { errors.push(`designer: ${e.message.split('\n')[0]}`); log('  ✗ designer failed'); }
await click('Designer: Apply to editor', '.designer button:has-text("Apply to editor")');
await click('Editor tab (post-designer)', '.seg button:has-text("Editor")');

log('--- Example (EditorBar) + File menu (dropdown) ---');
await select('Example', '.editor-bar label:has-text("Example") select', 'class');
// File ▾ dropdown: open it before each item (items close the menu on click).
const fileMenu = async (label, itemSel) => {
  await click('Open File ▾', '.filemenu .popover-trigger');
  await page.waitForTimeout(120);
  await click(label, itemSel);
};
await fileMenu('File: New', '.menu-item:has-text("New")');
await select('Example again', '.editor-bar label:has-text("Example") select', 'sequence');
await click('Open File ▾ (saveas)', '.filemenu .popover-trigger');
await select('File: format = png', '.menu-saveas select', 'png');
await select('File: format = source', '.menu-saveas select', 'source');
await click('File: Save As', '.menu-saveas button:has-text("Save As")');
await fileMenu('File: Save', '.menu-item:has-text("Save")');
await fileMenu('File: Open', '.menu-item:has-text("Open")');
await fileMenu('File: Close', '.menu-item:has-text("Close")');

log('--- Swarm actions / Settings (backend stubbed) ---');
await select('Example for fix', '.editor-bar label:has-text("Example") select', 'class');
await click('Fix ✦', '.editor-bar button:has-text("Fix ✦")');
await click('Generate ✦', '.editor-bar button:has-text("Generate ✦")');
await click('View ↗', '.editor-bar button:has-text("View ↗")');
await select('Format select', '.editor-bar label:has-text("Format") select', 'png');
await click('Settings ⚙', '.settings-pop .popover-trigger');
await page.waitForTimeout(120);
if (await page.locator('.settings input').count()) log('  ✓ settings popover open'); else errors.push('settings popover did not open');
await page.keyboard.press('Escape');

log('--- Zoom controls (if preview present) ---');
for (const [lbl, sel] of [['Zoom +', '.zoom-controls button:has-text("+")'],
                          ['Zoom −', '.zoom-controls button:has-text("−")'],
                          ['Fit', '.zoom-controls button:has-text("Fit")'],
                          ['Reset', '.zoom-controls button[title^="Reset"]']]) {
  if (await page.locator(sel).count()) await click(lbl, sel);
  else log(`  · skipped (no preview yet): ${lbl}`);
}

log('--- Split gutter drag ---');
try {
  const box = await page.locator('.split-gutter').first().boundingBox();
  await page.mouse.move(box.x + 3, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x - 120, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();
  log('  ✓ dragged split gutter');
} catch (e) { errors.push(`split drag: ${e.message.split('\n')[0]}`); log('  ✗ split drag'); }

await browser.close();

log('\n================ RESULT ================');
if (errors.length === 0) {
  log('✅ ALL CLICKS SUCCEEDED — no uncaught errors');
} else {
  log(`❌ ${errors.length} issue(s):`);
  for (const e of errors) log('   - ' + e);
  process.exit(1);
}

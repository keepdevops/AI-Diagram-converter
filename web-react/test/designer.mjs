// Focused check for the Designer tab: palette + canvas load, drag a shape on,
// select → inspector restyle, Apply to editor. Run: node test/designer.mjs
import { chromium } from 'playwright';

const URL = process.env.SMOKE_URL || 'http://localhost:5180/';
const errors = [];
const channel = process.env.PW_CHANNEL ?? 'chrome'; // empty in CI → bundled chromium
const browser = await chromium.launch({ ...(channel ? { channel } : {}), headless: true });
const page = await (await browser.newContext()).newPage();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !/preview image failed|Mermaid error|Failed to load|ERR_|net::/i.test(m.text())) errors.push(`console.error: ${m.text()}`); });

// No agent backend in CI — stub health so the offline probe doesn't log an error.
await page.route('**/api/health', (r) => r.fulfill({ json: { ok: true, agent: 'test.json', matrix_url: 'x' } }));

await page.goto(URL, { waitUntil: 'networkidle' });
// give the editor a box-and-arrow diagram to import
await page.click('.seg button:has-text("Editor")');
await page.selectOption('.editor-bar label:has-text("Example") select', 'component').catch(() => {});

await page.click('.seg button:has-text("Designer")');
await page.waitForSelector('.palette', { timeout: 20000 });
console.log('palette shapes:', await page.locator('.palette-item').count());
await page.waitForSelector('.designer-canvas .react-flow__node', { timeout: 20000 });
const before = await page.locator('.designer-canvas .react-flow__node').count();
console.log('imported nodes:', before);

// the component example has two `package { }` blocks → parser reconstructs them
// as Designer containers on import.
const importedGroups = await page.locator('.designer-canvas .group-node').count();
console.log('containers reconstructed from packages:', importedGroups, importedGroups >= 1 ? '✓' : '(none)');
if (importedGroups < 1) errors.push('import did not reconstruct package containers');

// drag a Database shape onto the canvas
await page.locator('.palette-item:has-text("Database")').dragTo(page.locator('.designer-stage'));
await page.waitForTimeout(300);
const after = await page.locator('.designer-canvas .react-flow__node').count();
console.log('after drag:', after, after > before ? '(node added) ✓' : '(no node added)');

// undo → back to `before`, redo → back to `after`
await page.click('.designer button[title^="Undo"]');
await page.waitForTimeout(200);
const undone = await page.locator('.designer-canvas .react-flow__node').count();
await page.click('.designer button[title^="Redo"]');
await page.waitForTimeout(200);
const redone = await page.locator('.designer-canvas .react-flow__node').count();
console.log('undo/redo:', undone, '→', redone, (undone === before && redone === after) ? '✓' : '(unexpected)');
if (!(undone === before && redone === after)) errors.push('undo/redo node count mismatch');

// add a second free shape, then marquee-select everything: `groupable` filters to
// just the two free shapes (existing nodes are already containers/children).
await page.locator('.palette-item:has-text("Actor")').dragTo(page.locator('.designer-stage'), { targetPosition: { x: 320, y: 160 } });
await page.waitForTimeout(300);
const box = await page.locator('.designer-canvas').boundingBox();
await page.keyboard.down('Shift');
await page.mouse.move(box.x + 5, box.y + 5);
await page.mouse.down();
await page.mouse.move(box.x + box.width - 5, box.y + box.height - 5, { steps: 15 });
await page.mouse.up();
await page.keyboard.up('Shift');
await page.waitForTimeout(200);

const groupBtn = page.locator('.designer button:has-text("Group")').first();
if (await groupBtn.isEnabled()) {
  await groupBtn.click();
  await page.waitForTimeout(250);
  const groups = await page.locator('.designer-canvas .group-node').count();
  console.log('group nodes after Group:', groups, groups === importedGroups + 1 ? '✓' : `(expected ${importedGroups + 1})`);
  if (groups !== importedGroups + 1) errors.push('Group did not add a container node');
  // grouping auto-selects the new container → Ungroup is immediately enabled
  const ungroupBtn = page.locator('.designer button:has-text("Ungroup")').first();
  if (await ungroupBtn.isEnabled()) {
    await ungroupBtn.click();
    await page.waitForTimeout(250);
    const gone = await page.locator('.designer-canvas .group-node').count();
    console.log('group nodes after Ungroup:', gone, gone === importedGroups ? '✓' : `(expected ${importedGroups})`);
    if (gone !== importedGroups) errors.push('Ungroup did not dissolve the container');
  } else { console.log('ungroup button disabled after Group'); errors.push('Ungroup button stayed disabled after Group'); }
} else { console.log('group button disabled'); errors.push('Group button stayed disabled with 2 free nodes selected'); }

// select first node -> inspector -> change shape + color
await page.locator('.designer-canvas .react-flow__node').first().click({ force: true });
await page.waitForTimeout(150);
const insp = await page.locator('.inspector-field select').count();
console.log('inspector open:', insp > 0 ? 'yes ✓' : 'no');
if (insp) {
  await page.selectOption('.inspector-field:has-text("Shape") select', 'actor').catch(() => {});
  await page.locator('.swatch').nth(0).click().catch(() => {});
}
await page.click('.designer button:has-text("Apply to editor")');
await page.waitForTimeout(200);

await browser.close();
console.log('\n' + (errors.length === 0 ? '✅ Designer OK — no uncaught errors' : `❌ ${errors.length} issue(s):\n  ${errors.join('\n  ')}`));
process.exit(errors.length ? 1 : 0);

// Focused check: in the Fix/Convert panel, converting the default Markdown
// sample (a ```mermaid block) to PlantUML populates the Output pane with a valid
// @startuml..@enduml. Run: SMOKE_URL=http://localhost:5180/ node test/convert.mjs
import { chromium } from 'playwright';

const URL = process.env.SMOKE_URL || 'http://localhost:5180/';
const channel = process.env.PW_CHANNEL ?? 'chrome'; // empty in CI → bundled chromium
const browser = await chromium.launch({ ...(channel ? { channel } : {}), headless: true });
const page = await (await browser.newContext()).newPage();
const fail = (m) => { console.log('❌ ' + m); process.exitCode = 1; };

// Stub generate so the whole-text path is fast + deterministic.
await page.route('**/api/generate', (r) => r.fulfill({
  json: { ok: true, diagram: '@startuml\nactor User\nUser -> App: login\nApp -> DB: check\n@enduml', note: 'stubbed' },
}));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.click('.seg button:has-text("Fix / Convert")');
await page.waitForSelector('.convert-bar');

// Default sample contains a ```mermaid block; Format mode → To PlantUML.
// NOTE: scope to .convert-bar — a bare button:has-text("Convert") also matches
// the toolbar's "Fix / Convert" tab.
await page.selectOption('.convert-bar label:has-text("Mode") select', 'format');
await page.selectOption('.convert-bar label:has-text("To") select', 'plantuml');
await page.click('.convert-bar button:text-is("Convert")');
await page.waitForTimeout(400);

const status1 = await page.locator('.convert .statusbar').innerText();
console.log('status after convert:', status1.trim());
const out = await page.locator('.convert-col:has(.convert-col-head:has-text("Output")) .cm-content').innerText();
console.log('--- output pane (mermaid → plantuml) ---');
console.log(out.trim().slice(0, 200));

if (out.includes('@startuml') && out.includes('@enduml')) console.log('✅ Output is a PlantUML diagram');
else fail('Output pane did not contain @startuml..@enduml');

// --- whole (unmarked) text → diagram ---
console.log('\n--- plain text → diagram (Generate from text) ---');
await page.selectOption('.convert-bar label:has-text("Mode") select', 'generate');
// Clear the source editor and type plain prose (no ```diagram markers).
const srcEditor = page.locator('.convert-col:has(.convert-col-head:has-text("Source")) .cm-content');
await srcEditor.click();
await page.keyboard.press('ControlOrMeta+A'); // cross-platform select-all (Linux CI vs macOS)
await page.keyboard.press('Backspace');
await page.keyboard.insertText('Users log in via the app, which checks the database and returns a session token.');
await page.waitForTimeout(200);
const btn = await page.locator('.convert-bar button:has-text("Generate")').innerText();
console.log('button label with no markers:', JSON.stringify(btn.trim()));
if (!/Generate from text/.test(btn)) fail('button did not switch to "Generate from text"');
await page.click('.convert-bar button:has-text("Generate from text")');
await page.waitForTimeout(500);
const genOut = await page.locator('.convert-col:has(.convert-col-head:has-text("Output")) .cm-content').innerText();
console.log('output after text→diagram:', genOut.trim().slice(0, 60).replace(/\n/g, ' '));
if (genOut.includes('@startuml')) console.log('✅ Generated a diagram from plain text');
else fail('whole-text generate did not populate output');

await browser.close();
if (!process.exitCode) console.log('\n✅ markdown→convert AND plain-text→diagram verified in the UI');

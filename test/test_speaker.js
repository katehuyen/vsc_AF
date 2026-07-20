// Speaker labels: the AI participant's name derived from a message's model id
// (data-derived, never a hardcoded engine name) + the 'agent' fallback. Also
// guards that media/charts.js still mirrors src/core/speaker.ts.
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (got === want) { pass++; } else { fail++; console.log(`  FAIL ${n}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); } };
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const S = require(path.join(__dirname, '..', 'out', 'core', 'speaker.js'));

// ---------- aiName: vendor derived from the model id ----------
eq('claude new id', S.aiName('claude-opus-4-8'), 'claude');
eq('claude old dated id', S.aiName('claude-3-5-sonnet-20241022'), 'claude');
eq('claude haiku', S.aiName('claude-haiku-4-5'), 'claude');
eq('gemini', S.aiName('gemini-2.5-pro'), 'gemini');
eq('openai gpt → codex', S.aiName('gpt-5-codex'), 'codex');
eq('openai gpt-4o → codex', S.aiName('gpt-4o'), 'codex');
eq('openai o3 → codex', S.aiName('o3-mini'), 'codex');
eq('codex in name → codex', S.aiName('some-codex-model'), 'codex');
eq('case-insensitive', S.aiName('CLAUDE-OPUS-4-8'), 'claude');
eq('unknown vendor → empty', S.aiName('llama-3-70b'), '');
eq('synthetic → empty', S.aiName('<synthetic>'), '');
eq('empty → empty', S.aiName(''), '');
eq('null → empty', S.aiName(null), '');
eq('undefined → empty', S.aiName(undefined), '');

// ---------- aiLabel: what the pages print (upper where role labels are) ----------
eq('label claude lower', S.aiLabel('claude-opus-4-8', false), 'claude');
eq('label claude upper', S.aiLabel('claude-opus-4-8', true), 'CLAUDE');
eq('label gemini upper', S.aiLabel('gemini-2.5-pro', true), 'GEMINI');
eq('label default upper falls back to AGENT', S.aiLabel('<synthetic>', true), 'AGENT');
eq('label default lower falls back to agent', S.aiLabel('', false), 'agent');
eq('label default when omitted upper flag', S.aiLabel(undefined), 'agent');

// ---------- the webview mirror must exist (kept in sync with this module) ----------
const charts = fs.readFileSync(path.join(__dirname, '..', 'media', 'charts.js'), 'utf8');
ok('charts.js defines aiName', /function aiName\(/.test(charts));
ok('charts.js defines aiLabel', /function aiLabel\(/.test(charts));
ok('charts.js exports aiName/aiLabel', /aiName,\s*aiLabel/.test(charts));

console.log(`${pass} passed, ${fail} failed`);
if (fail) { process.exit(1); }

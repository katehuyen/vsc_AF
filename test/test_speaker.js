// Speaker labels: the AI participant's name derived from a message's model id
// (data-derived, never hardcoded) + the user-composable template / case /
// fallback. Also guards that media/charts.js still mirrors src/core/speaker.js.
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const eq = (n, got, want) => { if (got === want) { pass++; } else { fail++; console.log(`  FAIL ${n}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); } };
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const S = require(path.join(__dirname, '..', 'out', 'core', 'speaker.js'));

// ---------- aiName: engine derived from the model id ----------
eq('claude new id', S.aiName('claude-opus-4-8'), 'claude');
eq('claude old dated id', S.aiName('claude-3-5-sonnet-20241022'), 'claude');
eq('gemini', S.aiName('gemini-2.5-pro'), 'gemini');
eq('openai gpt → codex', S.aiName('gpt-5-codex'), 'codex');
eq('openai o3 → codex', S.aiName('o3-mini'), 'codex');
eq('case-insensitive', S.aiName('CLAUDE-OPUS-4-8'), 'claude');
eq('unknown → empty', S.aiName('llama-3-70b'), '');
eq('synthetic → empty', S.aiName('<synthetic>'), '');
eq('empty/null → empty', S.aiName('') + S.aiName(null) + S.aiName(undefined), '');

// ---------- parseModel: ai / family / version / raw ----------
const p1 = S.parseModel('claude-opus-4-8');
eq('parse ai', p1.ai, 'claude'); eq('parse family', p1.model, 'opus'); eq('parse version', p1.version, '4.8'); eq('parse raw strips vendor', p1.raw, 'opus-4-8');
eq('old dated → 3.5', S.parseModel('claude-3-5-sonnet-20241022').version, '3.5');
eq('date not mistaken for version', S.parseModel('claude-opus-4-20250514').version, '4');
eq('haiku family', S.parseModel('claude-haiku-4-5').model, 'haiku');
eq('gemini dotted version', S.parseModel('gemini-2.5-pro').version, '2.5');
eq('gemini family pro', S.parseModel('gemini-2.5-pro').model, 'pro');
eq('gpt family', S.parseModel('gpt-4o').model, 'gpt');
eq('unknown parses empty', S.parseModel('llama-3-70b').ai, '');
eq('synthetic parses empty raw', S.parseModel('<synthetic>').raw, '');

// ---------- renderSpeaker: default (template {ai}, page casing) ----------
const DEF = S.DEFAULT_SPEAKER_CONFIG;
eq('default upper (Sessions)', S.renderSpeaker('claude-opus-4-8', true, DEF), 'CLAUDE');
eq('default lower (Turns)', S.renderSpeaker('claude-opus-4-8', false, DEF), 'claude');
eq('default gemini upper', S.renderSpeaker('gemini-2.5-pro', true, DEF), 'GEMINI');
eq('default codex upper', S.renderSpeaker('gpt-5-codex', true, DEF), 'CODEX');
eq('default fallback upper', S.renderSpeaker('<synthetic>', true, DEF), 'AGENT');
eq('default fallback lower', S.renderSpeaker('', false, DEF), 'agent');

// ---------- renderSpeaker: composed templates ----------
const cfg = (o) => S.normalizeSpeakerConfig(o);
eq('model + version', S.renderSpeaker('claude-opus-4-8', true, cfg({ template: '{model} {version}' })), 'OPUS 4.8');
eq('ai model (version)', S.renderSpeaker('claude-opus-4-8', false, cfg({ template: '{ai} {model} ({version})', casing: 'asis' })), 'claude opus (4.8)');
eq('empty parens dropped when no version', S.renderSpeaker('claude-opus-x', false, cfg({ template: '{model} ({version})', casing: 'asis' })), 'opus');
eq('dangling separator trimmed', S.renderSpeaker('claude-opus-x', false, cfg({ template: '{model} - {version}', casing: 'asis' })), 'opus');
eq('raw token', S.renderSpeaker('claude-opus-4-8', false, cfg({ template: '{raw}', casing: 'asis' })), 'opus-4-8');

// ---------- renderSpeaker: fixed text + casing ----------
eq('fixed text asis kept verbatim', S.renderSpeaker('claude-opus-4-8', true, cfg({ template: 'MyBot', casing: 'asis' })), 'MyBot');
eq('fixed text page uppers on Sessions', S.renderSpeaker('claude-opus-4-8', true, cfg({ template: 'MyBot', casing: 'page' })), 'MYBOT');
eq('force upper', S.renderSpeaker('claude-opus-4-8', false, cfg({ template: '{ai}', casing: 'upper' })), 'CLAUDE');
eq('force lower', S.renderSpeaker('claude-opus-4-8', true, cfg({ template: '{ai}', casing: 'lower' })), 'claude');

// ---------- normalizeSpeakerConfig: coerce junk to a valid config ----------
eq('bad casing → page', cfg({ casing: 'sideways' }).casing, 'page');
eq('empty template → default', cfg({ template: '   ' }).template, '{ai}');
eq('empty fallback → agent', cfg({ fallback: '' }).fallback, 'agent');
eq('non-object → defaults', cfg(null).template, '{ai}');

// ---------- the webview mirror must exist (kept in sync with this module) ----------
const charts = fs.readFileSync(path.join(__dirname, '..', 'media', 'charts.js'), 'utf8');
ok('charts.js defines parseModel', /function parseModel\(/.test(charts));
ok('charts.js defines renderSpeaker', /function renderSpeaker\(/.test(charts));
ok('charts.js exports parseModel/renderSpeaker/aiLabel', /parseModel,\s*renderSpeaker,\s*aiLabel/.test(charts));

console.log(`${pass} passed, ${fail} failed`);
if (fail) { process.exit(1); }

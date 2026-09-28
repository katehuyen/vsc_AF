// U-155 — Kapıcı on the pages: the chip a row keeps of a verdict, the chip and
// its panel, Farm Settings' Kapıcı section head, the Toolbox's rule list, and
// the wiring that carries a trigger's and a dispatch's verdict to their rows.
'use strict';
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const Module = require('module');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, a, b) => ok(n + ` (got ${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b));

const ROOT = path.join(__dirname, '..');
class FakeEmitter { constructor() { this.event = () => ({ dispose() { } }); } fire() { } dispose() { } }
const fakeVscode = { EventEmitter: FakeEmitter, window: { showInformationMessage: () => Promise.resolve(), showWarningMessage: () => Promise.resolve() } };
const origLoad = Module._load;
Module._load = function (request, parent, isMain) { return request === 'vscode' ? fakeVscode : origLoad.call(this, request, parent, isMain); };
const { chipOf } = require(path.join(ROOT, 'out/core/kapiciChip.js'));
const { dispatchText } = require(path.join(ROOT, 'out/core/dispatch.js'));
const { TriggerManager } = require(path.join(ROOT, 'out/core/triggers.js'));
const A = require(path.join(ROOT, 'out/core/automation.js'));
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const verdict = o => Object.assign({ passed: true, decision: 'pass', confidence: 0.94, reason: 'work p=0.94', provider: 'jev', latencyMs: 180,
    ruleId: 'trigger.has-work', ruleVersion: 1, layer: 'builtin', answers: { work: { type: 'noul', p: 0.94, confidence: 0.94 } } }, o);

(async () => {
    console.log('\n== what a row keeps of a verdict ==');
    {
        const c = chipOf(verdict({}), 'trigger', 'fired', 1000);
        eq('the figures, and each answer in a few characters', [c.consumer, c.rule, c.decision, c.confidence, c.provider, c.latencyMs, c.answers, c.outcome, c.at],
            ['trigger', 'trigger.has-work', 'pass', 0.94, 'jev', 180, { work: 'p 0.94' }, 'fired', 1000]);
        const d = chipOf(verdict({ decision: 'developer', answers: { agent: { type: 'choice', choice: 'developer', confidence: 0.881 } } }), 'dispatch');
        eq('a choice answer', d.answers, { agent: 'developer 0.88' });
        const f = chipOf(verdict({ passed: true, decision: 'open', fallback: 'open', confidence: 0, answers: {} }), 'trigger');
        ok('a verdict that was not the provider\'s own says so, and keeps no empty answers', f.fallback === 'open' && f.answers === undefined);
    }

    console.log('\n== the chip, the section head, the rule list ==');
    {
        const box = { window: {}, document: { getElementById: () => null } };
        box.window.AFTip = {
            wrap: (t, h, b) => t + '<tip head="' + h + '">' + b + '</tip>',
            lines: ps => ps.filter(p => p !== '' && p !== undefined && p !== null).join('\n')
        };
        vm.runInNewContext(read('media/afKapici.js'), box);
        const K = box.window.AFKapici;
        const C = { esc: s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;') };
        const fired = K.chip(chipOf(verdict({}), 'trigger', 'fired'), C);
        ok('fired: the word and how sure, on the chip', /🛡 fired 94%<\/span>/.test(fired));
        ok('its panel: who answered and how fast, each answer, what for, why', /Answered by: jev · 180 ms/.test(fired) && /Question work: p 0\.94/.test(fired)
            && /For: a trigger precondition/.test(fired) && /Why: work p=0\.94/.test(fired) && /head="Kapıcı — trigger\.has-work"/.test(fired));
        const skipped = K.chip(chipOf(verdict({ passed: false, decision: 'reject' }), 'trigger', 'skipped'), C);
        ok('skipped reads as a stop, in red', /🛡 skipped 94%/.test(skipped) && /charts-red/.test(skipped));
        const open = K.chip(chipOf(verdict({ decision: 'open', fallback: 'open', confidence: 0, answers: {} }), 'trigger', 'fired'), C);
        ok('a rule path shows no percentage it does not have', /🛡 fired<\/span>/.test(open) && /Confidence: none — the rule's open path/.test(open));
        eq('no verdict, no chip', K.chip(undefined, C), '');

        const S = { key: { name: 'TYPESAFE_API_KEY', present: false, route: 'typesafe', url: 'https://api.typesafe.ai/v1/systemone', model: 'jev-1.13.0' },
            candidates: [{ name: 'TYPESAFE_API_KEY', present: false }, { name: 'AI_GATEWAY_API_KEY', present: false }],
            rules: 3, problems: [{ layer: 'system', file: 'D:/x/_KAPICI/bad.json', error: 'needs a description' }], rulesDirs: ['D:/x/_KAPICI'],
            agreement: { trigger: { compared: 20, agreed: 18, rate: 0.9, confidence: { min: 0.6, median: 0.8, max: 0.97 }, disagreements: [] } } };
        const head = K.section(S, C);
        ok('the key: missing, and what that means', /🔑 TYPESAFE_API_KEY — missing/.test(head) && /goes down its rule's failure path/.test(head) && /Looked for: AI_GATEWAY_API_KEY — missing/.test(head));
        ok('the rules and the broken file', /3 rule\(s\)/.test(head) && /1 broken/.test(head) && /Broken: D:\/x\/_KAPICI\/bad\.json — needs a description/.test(head));
        ok('the shadow agreement per consumer', /agreed: triggers 90%/.test(head) && /triggers: 18 of 20 \(90%\)/.test(head) && /routing: nothing compared/.test(head));
        ok('the vault button', /id="kpc-secrets"/.test(head));
        ok('present reads present', /— present<\/span>/.test(K.section(Object.assign({}, S, { key: Object.assign({}, S.key, { present: true }) }), C)));
        const M = o => Object.assign({ staged: true, path: '${APPDATA}/af/mcp/kapici/index.js', registered: false, upToDate: false, configFile: 'C:/h/.claude.json' }, o);
        const notGiven = K.section(Object.assign({}, S, { mcp: M({}) }), C);
        ok('the MCP, not given: the button gives it, the hover names the tools', /MCP: not given/.test(notGiven)
            && /id="kpc-mcp" class="secondary" data-on="1">Give agents the MCP</.test(notGiven) && /Tools: kapici_eval · kapici_ask · kapici_rules/.test(notGiven));
        const given = K.section(Object.assign({}, S, { mcp: M({ registered: true, upToDate: true }) }), C);
        ok('given: the button takes it back', /MCP: given to agents/.test(given) && /data-on="0">Take the MCP back</.test(given));
        ok('registered at another copy says so, and the button repoints it', /MCP: points elsewhere/.test(K.section(Object.assign({}, S, { mcp: M({ registered: true }) }), C)));
        ok('no MCP state, no MCP chip', !/kpc-mcp/.test(head));
        const list = K.rules([{ id: 'trigger.has-work', version: 1, description: 'Real work?', layer: 'builtin', providers: ['jev', 'llm'], questions: { work: 'noul' }, minConfidence: 0.6, onLowConfidence: 'mechanical', onFailure: 'open', golden: 5 }], C);
        ok('a rule: its id, layer, questions, golden count, and its paths on hover', /<code>trigger\.has-work<\/code>/.test(list) && /noul · 5 golden/.test(list)
            && /Min confidence: 0\.6 · unsure: mechanical · failure: open/.test(list) && /File: shipped with Agent Farm/.test(list));
        ok('no rules says so', /No Kapıcı rules found/.test(K.rules([], C)));
    }

    console.log('\n== a trigger\'s verdict reaches its row ==');
    {
        const trig = { id: 't1', title: 'gelen', type: 'webhook', token: 'tok', enabled: true, debounceSec: 1, cooldownSec: 0, maxPerHour: 0,
            recentFirings: [], fireIf: { kind: 'kapici' }, action: { kind: 'task', agentId: 'a', title: 'x', prompt: 'p', mode: 'headless' } };
        const mgr = { triggers: [trig], workflows: [], outputsDir: 'D:/nowhere-af', onDidChange: () => ({ dispose() { } }), automationGate: () => undefined,
            checkPrecondition: p => A.evaluatePrecondition(p), markTriggerSkipped: () => { }, markTriggerFired: () => { } };
        let answer = verdict({});
        const tm = new TriggerManager(mgr, () => [], undefined, undefined, () => ({ mode: 'on', evaluate: async () => answer }));
        tm.fire = () => true;
        const settle = () => new Promise(r => setTimeout(r, 20));
        tm.tryFire(trig, 'webhook'); await settle();
        ok('fired: the trigger keeps the verdict, marked fired', trig.lastKapici && trig.lastKapici.outcome === 'fired' && trig.lastKapici.rule === 'trigger.has-work');
        answer = verdict({ passed: false, decision: 'reject' });
        tm.tryFire(trig, 'webhook'); await settle();
        ok('skipped: marked skipped', trig.lastKapici.outcome === 'skipped');
        tm.dispose();
        const panel = read('src/panels/tasksPanel.ts');
        ok('the plan row carries it', /\.\.\.\(t\.lastKapici \? \{ kapici: t\.lastKapici \} : \{\}\)/.test(panel));
        ok('the run row carries a task\'s', /\.\.\.\(t\.kapici \? \{ kapici: t\.kapici \} : \{\}\)/.test(panel));
        const page = read('media/tasksPage.js');
        ok('the guard cell and the run row draw it', /guardcell">\$\{guard\}\$\{p\.kapici && window\.AFKapici/.test(page) && /setupLines\(r\.setup\)\)\)\}\$\{[^\n]*\}\$\{r\.kapici && window\.AFKapici \? '<div>' \+ window\.AFKapici\.chip\(r\.kapici, C\)/.test(page));
        ok('…never inside the title\'s own panel (one subject per panel)', !/roundBadge\(r\)\}\$\{r\.kapici/.test(page));
    }

    console.log('\n== a dispatch Kapıcı decided carries its verdict ==');
    {
        const cands = [{ name: 'developer', hint: 'code' }, { name: 'muhasebe', hint: 'money' }];
        const r = await dispatchText('.', '', 'kaydet butonu bozuk', [], cands, false,
            { mode: 'on', evaluate: async () => verdict({ decision: 'developer', ruleId: 'dispatch.route', answers: { agent: { type: 'choice', choice: 'developer', confidence: 0.9 } } }) });
        ok('the result keeps the chip for the task it makes', r.method === 'kapici' && r.kapici && r.kapici.consumer === 'dispatch' && r.kapici.outcome === 'developer');
        ok('a dispatch trigger puts it on the task', /if \(result\.kapici\) \{ task\.kapici = result\.kapici; \}/.test(read('src/core/triggers.ts')));
    }

    console.log('\n== Farm Settings has a Kapıcı section; the Toolbox a Kapıcı tab ==');
    {
        const ops = read('src/core/settingsops.ts');
        ok('every kapici setting is filed under it', !/'kapici\.[A-Za-z]+': 'tasks'/.test(ops) && (ops.match(/'kapici\.[A-Za-z]+': 'kapici'/g) || []).length === 9);
        ok('…and it has a name', /\['kapici', 'Kapıcı — the decision gate'\]/.test(ops));
        ok('the page heads it with the status, then its settings', /c\.id === 'kapici' && window\.AFKapici \? window\.AFKapici\.section\(DATA\.kapici, C\) \+ c\.items\.map\(itemHtml\)/.test(read('media/settings.js')));
        ok('the MCP button reaches the same function the op does', /case 'kapiciMcp':/.test(read('src/panels/settingsPanel.ts'))
            && /kapiciMcp: \(on: boolean\) => \{\s*try \{ setKapiciMcp\(context\.globalStorageUri\.fsPath, on\); \}/.test(read('src/extension.ts'))
            && /mcp: kapiciMcpState\(context\.globalStorageUri\.fsPath\)/.test(read('src/extension.ts')));
        ok('the vault button goes to the Secret vault', /case 'openSecrets':/.test(read('src/panels/settingsPanel.ts')) && /openSecrets: \(\) => \{ void vscode\.commands\.executeCommand\('agentfarm\.openSecrets'\); \}/.test(read('src/extension.ts')));
        const tb = read('media/toolbox.js');
        ok('the Toolbox tab, counted as nothing', /\{ id: 'kapici', label: 'Kapıcı' \}/.test(tb) && /t\.id !== 'kapici'/.test(tb) && /state\.tab === 'kapici' \? kapiciTab\(\)/.test(tb));
        ok('fed by the same list kapici.rules answers', /kapici: deps\.kapiciRules \? deps\.kapiciRules\(\) : null/.test(read('src/panels/toolboxPanel.ts')) && /return host\.ruleList\(project\(args\)\);/.test(read('src/core/kapiciBridge.ts')));
    }

    console.log('\n== the trigger form offers Kapıcı as a guard, and only a trigger ==');
    {
        const page = read('media/tasksPage.js');
        ok('offered on a trigger only', /c\.kind === 'trigger' \? GUARDS\.concat\(\[KAPICI_GUARD\]\) : GUARDS/.test(page));
        ok('its rule and what it reads, only under it', /kp \? pickSel\('guardRule'/.test(page) && /pickSel\('guardInput'/.test(page));
        ok('a schedule carrying it is refused where it was picked', /c\.guardKind === 'kapici' && c\.kind !== 'trigger'/.test(page));
        const panel = read('src/panels/tasksPanel.ts');
        ok('the host reads it through the one parser, allowed for a trigger only',
            /if \(gk === 'kapici'\) \{ return parsePrecondition\(\{ kind: gk, rule: str\('guardRule'\), input: str\('guardInput'\) \}, \{ kapici: kind === 'trigger' \}\); \}/.test(panel));
        ok('an edit seeds both back', /guardRule: p\?\.rule \?\? ''/.test(panel) && /guardInput: p\?\.input \?\? ''/.test(panel));
        eq('empty boxes: the default rule, the default input', A.parsePrecondition({ kind: 'kapici', rule: '', input: '' }, { kapici: true }), { kind: 'kapici' });
        eq('a diff and a rule of the user\'s own', A.parsePrecondition({ kind: 'kapici', rule: 'metin.tek-satir', input: 'diff' }, { kapici: true }),
            { kind: 'kapici', rule: 'metin.tek-satir', input: 'diff' });
        eq('never on a schedule', A.parsePrecondition({ kind: 'kapici', rule: '', input: '' }, { kapici: false }), undefined);
    }

    console.log(`\n${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

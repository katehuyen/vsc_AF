// X-305 step 4 — THE ACCOUNT POLICIES SECTION OF THE ENGINES PAGE, driven
// through the real media/engines.js, and the panel half behind it.
//
// Steps 1–3 made a rule choosable everywhere an account is taken and gave it a
// bridge (`policies.list/save/delete`). What was missing was the one surface a
// HAND can write a rule on: until this, a named rule existed only for somebody
// editing `agentFarm.accountPolicies` in a JSON file or calling the op. This
// pins the shape of that surface, not its prettiness:
//   * the section is drawn in the page's own shell, between Accounts (what a
//     rule chooses among) and Providers;
//   * the built-in four are a TABLE — one row per rule, one chip per engine that
//     holds a slot — read-only, because they are not stored anywhere to edit;
//   * empty · one · many are three layouts, and the smallest is the default;
//   * a chip is the FACT (a slot, or that none can be chosen) and its hover
//     carries the figure that decided it; "cannot choose right now" is NOT red;
//   * the form is the AFForm card, opened by + New rule and by a card's Edit,
//     and its step list acts on the DRAFT: reorder and remove post nothing;
//   * Save posts a FORM (`policySave`), Delete posts a NAME (`policyDelete`) —
//     the host judges both through the very functions the bridge ops call;
//   * a refusal lands in the form, an empty `pol-msg` closes it.
'use strict';
const path = require('path');
const Module = require('module');
const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const fixture = require(path.join(__dirname, 'fixtures', 'enginespanel.js'));
const scene = (id) => fixture.variants().find(v => v.id === id);
const ZERO = fixture.data();
const ONE = scene('enginesonerule').data;
const MANY = scene('enginesrules').data;
const secOf = (h) => {
    const from = h.indexOf('>Account policies<');
    if (from < 0) { return ''; }
    const next = h.indexOf('class="posec"', from);
    return h.slice(from, next < 0 ? h.length : next);
};

// ---- the fixture asks the product, it does not type the answer -------------
{
    ok('the fixture resolves the built-in four through resolvePolicy (four rows)',
        ZERO.policies.builtIn.length === 4 && ZERO.policies.builtIn.every(b => Array.isArray(b.now)));
    ok('…on every engine that holds a slot (claude and codex)',
        ZERO.policies.engines.join(',') === 'claude,codex'
        && ZERO.policies.builtIn[0].now.map(n => n.engine).join(',') === 'claude,codex');
    ok('@pool refuses on both — no campaign pool is running in a fixture',
        ZERO.policies.builtIn.find(b => b.id === '@pool').now.every(n => n.refusal && !n.picks));
    ok('@emptiest picks a slot on both — a measured account beats an unread one',
        ZERO.policies.builtIn.find(b => b.id === '@emptiest').now.every(n => n.picks && !n.refusal));
    ok('a rule pinned to claude is asked about claude only',
        MANY.policies.rules.find(r => r.name === 'Agir_Isler').now.map(n => n.engine).join() === 'claude');
    ok('…and it is walled RIGHT NOW: its one step is work@studio at 91% against a wall of 40',
        !!MANY.policies.rules.find(r => r.name === 'Agir_Isler').now[0].refusal);
}

// ---- zero rules: the smallest arity is the default scene -------------------
{
    const r = runPage('engines.js', ZERO);
    const h = r.html();
    const s = secOf(h);
    ok('the Account policies section is drawn', /class="potitle">Account policies</.test(h));
    ok('…between Accounts and Providers',
        h.indexOf('>Accounts<') < h.indexOf('>Account policies<')
        && h.indexOf('>Account policies<') < h.indexOf('>Providers<'));
    ok('…in the page\'s own section shell', /<div class="posec">\s*<div class="posech">\s*<h3 class="potitle">Account policies</.test(h));
    ok('the built-in four are a table, one row each',
        /<table class="potab poltab">/.test(s) && (s.match(/<tr>\s*<td class="poeng af-tipw"/g) || []).length === 4);
    ok('…with a column per engine that holds a slot',
        /<th><span class="af-tipw">Claude Code</.test(s) && /<th><span class="af-tipw">Codex</.test(s));
    ok('a table chip does NOT repeat the engine its column already names',
        !/class="engacct polnow[^"]*">Claude Code /.test(s) && /class="engacct polnow a-on">→ /.test(s));
    ok('"cannot choose right now" is the yellow a-no chip, and it says so',
        /class="engacct polnow a-no">nothing right now</.test(s));
    ok('…never a red one', !/polnow[^"]*b-bad|polnow[^"]*k-no|polnow[^"]*bad"/.test(s));
    ok('a chip carries the figure that decided it (the rule\'s note), MIRROR first',
        /af-tipw[^>]*>\s*<span class="engacct polnow a-on">[^<]*<\/span><span class="af-tip[^"]*"[^>]*>/.test(s)
        && /the claude sign-in with the most room right now|the machine sign-in for claude|first in the list/.test(s));
    ok('no rule of the user\'s own → no card, and the sentence says the built-in four already work',
        !/class="pocard polcard"/.test(s) && /No rule of your own yet/.test(s));
    ok('+ New rule is offered', /data-polnew="1"/.test(s));
    ok('no form is open on load', !/id="polform"/.test(s));
    ok('no message box carries text', /<div class="pomsg" id="pol-msg"><\/div>/.test(s));
}

// ---- one rule, then many ---------------------------------------------------
{
    const one = secOf(runPage('engines.js', ONE).html());
    ok('one rule → one card', (one.match(/class="pocard polcard"/g) || []).length === 1);
    ok('…named @Gece_Nobeti', /class="poname">@Gece_Nobeti</.test(one));
    ok('…its chips NAME the engine (nothing beside them does, and the rule is unpinned)',
        /polnow a-on">Claude Code → /.test(one) && /polnow a-on">Codex → /.test(one));
    ok('…the engine pill says "any engine" and the wall pill its own 60%',
        /class="poid">any engine</.test(one) && /class="poid">≤ 60%</.test(one));
    ok('…the chain reads as numbered steps, slot ids turned into labels',
        /1\. spare@gmail/.test(one) && /2\. @emptiest/.test(one) && /3\. work@studio \(haiku, sonnet\)/.test(one));
    ok('…Edit and Delete on the card, by name',
        /data-poledit="Gece_Nobeti"/.test(one) && /data-poldel="Gece_Nobeti"/.test(one));
    ok('…and Delete\'s hover says what happens to whatever still names the rule',
        /REFUSED at launch rather than falling back to the main sign-in/.test(one));

    const many = secOf(runPage('engines.js', MANY).html());
    ok('three rules → three cards, in the stored order',
        (many.match(/class="pocard polcard"/g) || []).length === 3
        && many.indexOf('@Gece_Nobeti<') < many.indexOf('@Agir_Isler<')
        && many.indexOf('@Agir_Isler<') < many.indexOf('@Varsayilan<'));
    const walled = many.slice(many.indexOf('data-polname="Agir_Isler"'), many.indexOf('data-polname="Varsayilan"'));
    ok('a pinned rule draws ONE chip, bare — its engine pill already says Claude Code',
        (walled.match(/class="engacct polnow/g) || []).length === 1
        && /polnow a-no">nothing right now</.test(walled) && /class="poid">Claude Code</.test(walled));
    ok('…and a step\'s own wall is drawn on the step', /1\. work@studio \(≤ 40%\)/.test(walled));
    ok('a rule with no ceiling shows the default wall and says so on hover',
        /class="poid">≤ 95%<\/span><span class="af-tip"><span class="af-tiph">Wall: 95% \(the default\)/.test(many));
    ok('a rule stepping through another names it as a step',
        /1\. @Gece_Nobeti<\/span> → <span class="polstep">2\. @round-robin/.test(many));
}

// ‼️ THE SHIM DOES NOT SCOPE A DESCENDANT SELECTOR, so the header's
// `.af-head [data-afact]` binding lands on the form's buttons too and each
// press also posts a `headerAction` that the real page never sends. The
// page's own messages are what is under test, so those are filtered out.
const own = (r) => r.posted.filter(m => m.type !== 'headerAction');
const lastOwn = (r) => own(r)[own(r).length - 1];
/** Just the open form. The built-in table above it and the cards below it
 *  carry the same rule names, so an order assertion has to be scoped. */
const formOf = (s) => {
    const a = s.indexOf('id="polform"');
    if (a < 0) { return ''; }
    const b = s.indexOf('data-afact="submit"', a);
    return s.slice(a, b < 0 ? s.length : b);
};

// ---- the form: opened by + New rule ----------------------------------------
{
    const r = runPage('engines.js', ZERO);
    r.query('[data-polnew]')[0].click();
    let s = secOf(r.html());
    ok('+ New rule opens the AFForm card', /id="polform"/.test(s) && /New rule</.test(s));
    ok('…and the + button goes while it is open', !/data-polnew/.test(s));
    ok('the name box is a text field, mono, required', /data-af="name"[^>]*class="mono"/.test(s) && /Name <em>required<\/em>/.test(s));
    ok('the engine picker opens on "any engine" and lists the capturable engines only',
        /<option value="" selected[^>]*>any engine</.test(s) && /<option value="claude"/.test(s)
        && /<option value="codex"/.test(s) && !/<option value="gemini"/.test(s));
    ok('…and it is a REDRAW field, because it changes which accounts a step can name',
        /data-af="engine" data-aft="s" data-afr="1"/.test(s));
    ok('the wall box says what empty means', /Empty = 95%/.test(s));
    ok('an empty chain is said out loud, as the refusal it would earn',
        /No steps yet\. A rule with no steps could never choose, and is refused\./.test(s));
    ok('+ Add a step is offered and no step editor is open', /data-afact="step-new"/.test(s) && !/polstepbox/.test(s));
    ok('the submit button says what the press does', /data-afact="submit">Add the rule</.test(s));

    // open a step: the kind picker and the two halves
    r.query('[data-afact="step-new"]')[0].click();
    s = secOf(r.html());
    ok('a new step opens on "a rule" → @emptiest',
        /polstepbox/.test(s) && /<option value="policy" selected/.test(s) && /<option value="@emptiest" selected/.test(s));
    ok('…the rule half lists the built-in four and no rule of the user\'s (there is none)',
        /<option value="@pool"/.test(s) && /<option value="@round-robin"/.test(s) && !/<option value="@Gece/.test(s));
    ok('…the kind is a redraw field: changing it redraws the box beside it', /data-af="s_kind" data-aft="s" data-afr="1"/.test(s));
    ok('…Add step / Discard step, and nothing was posted yet', /data-afact="step-keep">Add step</.test(s) && own(r).length === 0);

    // switch the kind to a fixed account: the value box is redrawn from the slots
    const kind = r.query('[data-af="s_kind"]')[0];
    kind.value = 'account'; kind.fire('change');
    s = secOf(r.html());
    ok('kind → account redraws the value box from the captured slots, labelled by engine (two engines)',
        /<option value="work-1"[^>]*>Claude Code · work@studio</.test(s) && /<option value="codex-work"[^>]*>Codex · work@studio</.test(s));
    ok('…and the first slot is selected, not a stale rule id', /<option value="work-1" selected/.test(s));

    // pin the rule to claude → the slot list narrows and drops the engine prefix
    const eng = r.query('[data-af="engine"]')[0];
    eng.value = 'claude'; eng.fire('change');
    s = secOf(r.html());
    ok('engine → claude narrows the slots to that engine and drops the prefix',
        /<option value="work-1"[^>]*>work@studio</.test(s) && !/<option value="codex-work"/.test(s));

    // fill the step and keep it
    const val = r.query('[data-af="s_value"]')[0]; val.value = 'spare'; val.fire('change');
    const ceil = r.query('[data-af="s_ceiling"]')[0]; ceil.value = '70'; ceil.fire('input');
    const models = r.query('[data-af="s_models"]')[0]; models.value = 'opus, sonnet'; models.fire('input');
    r.query('[data-afact="step-keep"]')[0].click();
    s = secOf(r.html());
    ok('Add step puts the step in the list and closes the editor',
        /class="affrow/.test(s) && !/polstepbox/.test(s) && /spare@gmail \(≤ 70% · opus, sonnet\)/.test(s));
    ok('…the list row wears the fixed-account glyph, and no rule-step caption', /class="affri"[^>]*>•</.test(s));
    ok('…still nothing posted: the list is the DRAFT', own(r).length === 0);

    // a second step, then reorder and remove — all on the draft
    r.query('[data-afact="step-new"]')[0].click();
    r.query('[data-afact="step-keep"]')[0].click();
    s = secOf(r.html());
    ok('two steps, in order', /1\.[\s\S]*spare@gmail[\s\S]*2\.[\s\S]*@emptiest/.test(s.replace(/<[^>]+>/g, ' ')) || (s.match(/class="affrow/g) || []).length === 2);
    r.query('[data-afl="up"]')[1].click();
    s = secOf(r.html());
    const rows = [...s.matchAll(/<li class="affrow[^"]*">[\s\S]*?<b>([^<]*)<\/b>/g)].map(m => m[1]);
    ok('↑ on the second row swaps them (draft only)', rows[0] === '@emptiest' && /spare@gmail/.test(rows[1]) && own(r).length === 0);
    r.query('[data-afl="del"]')[0].click();
    s = secOf(r.html());
    ok('✕ removes a row (draft only)', (s.match(/class="affrow/g) || []).length === 1 && own(r).length === 0);

    // name, note, wall, then Save — a FORM goes to the host
    const name = r.query('[data-af="name"]')[0]; name.value = 'Gece_Nobeti'; name.fire('input');
    const note = r.query('[data-af="note"]')[0]; note.value = 'the overnight sentry'; note.fire('input');
    const wall = r.query('[data-af="ceiling"]')[0]; wall.value = '60'; wall.fire('input');
    r.query('[data-afact="submit"]')[0].click();
    const m = lastOwn(r);
    ok('Save posts policySave with the whole draft', m && m.type === 'policySave' && m.policy && m.policy.name === 'Gece_Nobeti');
    ok('…engine, wall and note travel', m.policy.engine === 'claude' && String(m.policy.ceiling) === '60' && m.policy.note === 'the overnight sentry');
    ok('…and the chain is the draft\'s one remaining step, as {account, ceiling, models}',
        m.policy.chain.length === 1 && m.policy.chain[0].account === 'spare' && m.policy.chain[0].ceiling === 70
        && m.policy.chain[0].models.join(',') === 'opus,sonnet' && m.policy.chain[0].policy === undefined);

    // the host refuses → the refusal is IN the form; the host accepts → the form closes
    r.send({ type: 'pol-msg', text: 'Step 1 of "Gece_Nobeti": no policy "@nope" exists.' });
    s = secOf(r.html());
    ok('a refusal lands in the form, not a toast', /id="polform"/.test(s) && /class="affmsg warn">Step 1 of/.test(s));
    ok('…and the draft survives it (the name is still typed)', /value="Gece_Nobeti"/.test(s));
    // the refusal ends that write; the next Save is a new one, and THAT is
    // what an empty pol-msg answers
    r.query('[data-afact="submit"]')[0].click();
    r.send({ type: 'pol-msg', text: '' });
    s = secOf(r.html());
    ok('an empty pol-msg is "written": the form closes and + New rule is back', !/id="polform"/.test(s) && /data-polnew/.test(s));
}

// ---- the form: opened by Edit, and Delete ----------------------------------
{
    const r = runPage('engines.js', MANY);
    r.query('[data-poledit="Gece_Nobeti"]')[0].click();
    let s = secOf(r.html());
    ok('Edit opens the form on that rule', /Edit @Gece_Nobeti</.test(s));
    ok('…the name is a STAT, not a box — a rename is a new rule', /class="affstat">@Gece_Nobeti</.test(s) && !/data-af="name"/.test(s));
    const fm = formOf(s);
    ok('…the three stored steps are in the list, in order',
        (fm.match(/class="affrow/g) || []).length === 3
        && fm.indexOf('spare@gmail') < fm.indexOf('@emptiest') && fm.indexOf('@emptiest') < fm.indexOf('work@studio (haiku, sonnet)'));
    ok('…a rule step says it is re-decided at launch', /re-decided at launch/.test(s));
    ok('…the wall box carries 60 and the note its text', /data-af="ceiling"[^>]*value="60"/.test(s) && /value="the overnight sentry — spare first, never below 60%"/.test(s));
    ok('…the submit says Save changes', /data-afact="submit">Save changes</.test(s));

    // edit step 3: its own values come back into the editor
    r.query('[data-afl="edit"]')[2].click();
    s = secOf(r.html());
    ok('edit on a step opens the editor on ITS values',
        /Step 3</.test(s) && /<option value="account" selected/.test(s) && /<option value="work-1" selected/.test(s)
        && /data-af="s_models"[^>]*value="haiku, sonnet"/.test(s) && /data-afact="step-keep">Update step</.test(s));
    ok('the rule half of a step offers the OTHER named rules and not this one',
        (() => { const k = r.query('[data-af="s_kind"]')[0]; k.value = 'policy'; k.fire('change'); const t = secOf(r.html());
            return /<option value="@Agir_Isler"/.test(t) && /<option value="@Varsayilan"/.test(t) && !/<option value="@Gece_Nobeti"/.test(t); })());
    r.query('[data-afact="step-cancel"]')[0].click();
    s = secOf(r.html());
    ok('Discard step closes the editor and the list is untouched', !/polstepbox/.test(s) && (s.match(/class="affrow/g) || []).length === 3);

    // Save with a step still open KEEPS it rather than losing what was typed
    r.query('[data-afact="step-new"]')[0].click();
    r.query('[data-afact="submit"]')[0].click();
    const m = lastOwn(r);
    ok('Save with an open step keeps it: four steps travel', m.type === 'policySave' && m.policy.chain.length === 4 && m.policy.chain[3].policy === '@emptiest');
    ok('…the edit keeps the name and posts no engine (unpinned)', m.policy.name === 'Gece_Nobeti' && m.policy.engine === '');

    // a Delete pressed on ANOTHER card while the draft is open: the empty
    // pol-msg it earns must not close the form under the user's hands
    r.query('[data-poldel="Agir_Isler"]')[0].click();
    r.send({ type: 'pol-msg', text: '' });
    s = secOf(r.html());
    ok('a delete that went through beside an open draft leaves the form open',
        lastOwn(r).type === 'policyDelete' && /id="polform"/.test(s) && /Edit @Gece_Nobeti</.test(s));

    // Cancel closes without posting
    const before = own(r).length;
    r.query('[data-afact="cancel"]')[1].click();
    s = secOf(r.html());
    ok('Cancel closes the form and posts nothing', !/id="polform"/.test(s) && own(r).length === before);

    // Delete posts the NAME and nothing else
    r.query('[data-poldel="Varsayilan"]')[0].click();
    const d = lastOwn(r);
    ok('Delete posts policyDelete with the name', d.type === 'policyDelete' && d.name === 'Varsayilan' && Object.keys(d).length === 2);
    r.send({ type: 'pol-msg', text: '@Gece_Nobeti is a step of @Varsayilan — removing it would leave that rule pointing at nothing.' });
    s = secOf(r.html());
    ok('a delete refusal lands in the section\'s message box when no form is open', /<div class="pomsg" id="pol-msg">@Gece_Nobeti is a step of/.test(s));
}

// ---- the panel half: the form goes through an allow-list, then the shared fns
{
    const origLoad = Module._load;
    Module._load = function (request) {
        if (request === 'vscode') {
            return {
                Uri: { joinPath: (base, ...rest) => ({ path: [base.path, ...rest].join('/') }) },
                ViewColumn: { One: 1 }, ConfigurationTarget: { Global: 1 },
                env: { openExternal: () => Promise.resolve(true) },
                EventEmitter: class { constructor() { this.event = () => ({ dispose() { } }); } fire() { } },
                window: { createWebviewPanel: () => { throw new Error('not opened here'); } },
                commands: { executeCommand: () => Promise.resolve(undefined) },
                workspace: { getConfiguration: () => ({ get: (_k, d) => d, update: async () => { } }), workspaceFolders: [] }
            };
        }
        return origLoad.apply(this, arguments);
    };
    const { policyFromForm } = require(path.resolve(__dirname, '../out/panels/enginesPanel.js'));
    Module._load = origLoad;

    const p = policyFromForm({
        name: ' Gece_Nobeti ', engine: 'Claude', ceiling: '60', note: ' night ', extra: 'dropped',
        chain: [
            { account: 'spare', ceiling: '70', models: 'opus, sonnet', evil: 1 },
            { policy: '@emptiest', ceiling: 0, models: [] },
            { account: 'work-1', models: ['haiku', ' sonnet '] }
        ]
    });
    ok('policyFromForm trims and lower-cases the engine, keeps name/note/ceiling',
        p.name === 'Gece_Nobeti' && p.engine === 'claude' && p.ceiling === 60 && p.note === 'night');
    ok('…drops a field the page invented', !('extra' in p) && !('evil' in p.chain[0]));
    ok('…a step\'s models come as a string or an array and leave as a trimmed array',
        p.chain[0].models.join(',') === 'opus,sonnet' && p.chain[2].models.join(',') === 'haiku,sonnet');
    ok('…a zero or empty ceiling is ABSENT, not 0 (0 would be refused as out of 1-100)',
        p.chain[0].ceiling === 70 && !('ceiling' in p.chain[1]) && !('models' in p.chain[1]));
    ok('…an empty engine is absent, so the rule is unpinned', !('engine' in policyFromForm({ name: 'x', engine: '', chain: [] })));
    ok('…garbage in → an empty rule the core will refuse, never a throw',
        policyFromForm(null).name === '' && policyFromForm('str').chain.length === 0 && policyFromForm({ chain: 'no' }).chain.length === 0);

    // the panel source: the two cases call the deps the bridge calls, and the
    // refusal goes back as pol-msg
    const src = require('fs').readFileSync(path.join(__dirname, '..', 'src', 'panels', 'enginesPanel.ts'), 'utf8');
    const save = src.slice(src.indexOf("case 'policySave'"), src.indexOf("case 'policyDelete'"));
    const del = src.slice(src.indexOf("case 'policyDelete'"), src.indexOf("case 'engineDocs'"));
    ok('policySave hands the FORM through policyFromForm to deps.savePolicy', /deps\.savePolicy\(policyFromForm\(msg\.policy\)\)/.test(save));
    ok('policyDelete hands the NAME to deps.deletePolicy', /deps\.deletePolicy\(String\(msg\.name/.test(del));
    ok('both answer through wrotePolicy → pol-msg, redrawing only when written',
        /wrotePolicy\(/.test(save) && /wrotePolicy\(/.test(del)
        && /type: 'pol-msg', text: refusal/.test(src) && /if \(!refusal\) \{ this\.refresh\(\); \}/.test(src));
    ok('the data the page is handed carries policies from deps.policies()', /policies: deps\.policies\(\)/.test(src));
}

// ---- the scene that draws the form really draws it ---------------------------
{
    const v = scene('enginesruleform');
    const r = runPage('engines.js', v.data);
    v.act(r);
    const s = secOf(r.html());
    ok('the form scene opens Edit on @Gece_Nobeti with step 3 in the editor',
        /Edit @Gece_Nobeti</.test(s) && /Step 3</.test(s) && /polstepbox/.test(s));
}

console.log(`test_engines_policies: ${pass} passed, ${fail} failed`);
if (fail) { process.exit(1); }

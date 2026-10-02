// S-102 — A SETUP CHOSEN ON A LIVE CARD IS THE AGENT'S LAST SETUP.
//
// What this pins: a model/effort/permission mode somebody asks for on a live
// Console card, once the engine ACCEPTS it, is written into the agent's
// remembered row for that engine, so the agent's next session opens on it.
// A refusal writes nothing; the other engines' rows and the flat engine are
// untouched; an account RULE is remembered, a sign-in never. Driven against the real
// ConsoleHost with a fake child for the confirmation half.
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { EventEmitter } = require('events');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const eq = (n, got, want) => ok(n + ` (got ${JSON.stringify(got)})`,
    JSON.stringify(got) === JSON.stringify(want));

const children = [];
cp.spawn = () => {
    const child = new EventEmitter();
    const pipe = () => { const s = new EventEmitter(); s.setEncoding = () => { }; s.destroy = () => { }; return s; };
    child.stdout = pipe();
    child.stderr = pipe();
    child.written = [];
    child.stdin = { write: (l) => { child.written.push(String(l)); return true; }, end: () => { } };
    child.pid = 8100 + children.length;
    child.kill = () => { };
    children.push(child);
    return child;
};
cp.exec = (_c, cb) => { if (typeof cb === 'function') { cb(null, '', ''); } };
cp.execSync = () => '';
cp.execFile = (_c, _a, _o, cb) => {
    const done = typeof _o === 'function' ? _o : cb;
    if (typeof done === 'function') { done(null, '', ''); }
    return new EventEmitter();
};

const L = require(path.join(ROOT, 'out', 'core', 'liveChoice.js'));
const Launch = require(path.join(ROOT, 'out', 'core', 'launch.js'));
const { ConsoleHost } = require(path.join(ROOT, 'out', 'core', 'consolehost.js'));

// ---------- what counts as a confirmed choice ----------
{
    eq('an effort switch that resolved to what was asked is a choice',
        L.confirmedChoice({ effort: 'medium', pendingEffort: { effort: 'xhigh' } }, { effort: 'xhigh' }),
        { effort: 'xhigh' });
    eq('a refused effort switch is nothing',
        L.confirmedChoice({ effort: 'medium', pendingEffort: { effort: 'xhigh' } }, { effort: 'medium' }), null);
    eq('a switch still pending is nothing',
        L.confirmedChoice({ pendingEffort: { effort: 'xhigh' } }, { pendingEffort: { effort: 'xhigh' } }), null);
    eq('a model the engine took is a choice',
        L.confirmedChoice({ model: 'opus', pendingModel: { model: 'sonnet' } }, { model: 'sonnet' }),
        { model: 'sonnet' });
    eq('‼️ the engine re-spelling a model with nothing pending is NOT a choice',
        L.confirmedChoice({ model: 'opus' }, { model: 'claude-opus-5-5' }), null);
    eq('a mode is recorded as ASKED even when the CLI spells it back differently',
        L.confirmedChoice({ permissionMode: 'bypassPermissions', pendingPermissionMode: { mode: 'manual' } },
            { permissionMode: 'default' }),
        { permissionMode: 'manual' });
    eq('a refused mode is nothing',
        L.confirmedChoice({ permissionMode: 'default', pendingPermissionMode: { mode: 'bypassPermissions' } },
            { permissionMode: 'default' }), null);
}

// ---------- how a choice lands in the record ----------
{
    const last = {
        engine: 'claude', model: 'opus', effort: 'medium', permissionMode: 'bypassPermissions',
        superpowers: false, surface: 'console',
        byEngine: {
            claude: { model: 'opus', effort: 'medium', permissionMode: 'bypassPermissions', providerId: '', tier: '', variant: '' },
            codex: { model: 'gpt-5.4-mini', effort: 'low', permissionMode: 'plan', providerId: '', tier: '', variant: '' }
        }
    };
    const next = L.withLiveChoice(last, 'claude', { effort: 'xhigh' });
    eq('the engine row takes the choice', next.byEngine.claude.effort, 'xhigh');
    eq('…and keeps the fields nobody chose', next.byEngine.claude.model, 'opus');
    eq('…the flat fields follow when they describe this engine', next.effort, 'xhigh');
    eq('another engine\'s row is untouched', next.byEngine.codex, last.byEngine.codex);
    eq('superpowers and surface survive', [next.superpowers, next.surface], [false, 'console']);
    eq('a choice that names no account leaves the row\'s account blank', next.byEngine.claude.account, '');
    // S-102 (the user's option A): a RULE picked on the card is remembered, a sign-in never
    const ruled = L.withLiveChoice(last, 'claude', { account: '@emptiest' });
    eq('‼️ a rule picked on the card is written into the engine row', ruled.byEngine.claude.account, '@emptiest');
    eq('…and seeds the next session', Launch.withLastLaunch({}, ruled).account, '@emptiest');
    const slotted = L.withLiveChoice(ruled, 'claude', { account: 'claude-2' });
    eq('‼️ a sign-in picked on the card is NEVER written — it clears the rule', slotted.byEngine.claude.account, '');
    eq('…the machine\'s own sign-in is a sign-in, not a rule',
        L.withLiveChoice(ruled, 'claude', { account: '@machine' }).byEngine.claude.account, '');
    eq('…and a later model choice keeps the rule', L.withLiveChoice(ruled, 'claude', { model: 'sonnet' }).byEngine.claude.account, '@emptiest');
    const forged = { ...last, byEngine: { ...last.byEngine, claude: { ...last.byEngine.claude, account: 'claude-2' } } };
    eq('‼️ a sign-in found in a record is never read back into a launch', Launch.withLastLaunch({}, forged).account, '');
    eq('…nor carried by the next card choice', L.withLiveChoice(forged, 'claude', { effort: 'low' }).byEngine.claude.account, '');

    const other = L.withLiveChoice({ ...last, engine: 'agy' }, 'claude', { effort: 'high' });
    eq('a card on a different engine than the flat record leaves the flat engine alone',
        [other.engine, other.effort], ['agy', 'medium']);
    eq('…while its own row still takes the choice', other.byEngine.claude.effort, 'high');

    const old = L.withLiveChoice({ engine: 'claude', model: 'opus', effort: 'low', permissionMode: 'plan' },
        'claude', { effort: 'xhigh' });
    eq('a record with no engine rows keeps its flat answers in the new row',
        old.byEngine.claude, { account: '', providerId: '', tier: '', variant: '', model: 'opus', effort: 'xhigh', permissionMode: 'plan' });

    const fresh = L.withLiveChoice(undefined, 'claude', { model: 'sonnet' });
    eq('an agent with no record gets one on this engine', [fresh.engine, fresh.byEngine.claude.model], ['claude', 'sonnet']);

    // the round trip the user asked for: the NEXT session seeds from it
    const seeded = Launch.withLastLaunch({}, next);
    eq('‼️ the next session opens on the effort chosen on the card', [seeded.engine, seeded.effort, seeded.model],
        ['claude', 'xhigh', 'opus']);
}

// ---------- the host announces it, only when the engine took it ----------
const tick = () => new Promise(r => setImmediate(r));
async function main() {
    const host = new ConsoleHost(() => 'claude', () => undefined,
        () => undefined, () => undefined, () => undefined, undefined, undefined, () => undefined);
    const heard = [];
    host.onChosen((id, choice) => heard.push({ id, choice }));
    const id = host.start({
        agentId: 'dev', agentName: 'developer', cwd: process.cwd(),
        engine: 'claude', permissionMode: 'default', effort: 'medium'
    });
    await tick();
    const child = children[children.length - 1];
    ok('a claude card was spawned', !!child);
    const say = (o) => child.stdout.emit('data', Buffer.from(JSON.stringify(o) + '\n'));
    say({ type: 'system', subtype: 'init', session_id: 'sess-live-1', model: 'claude-opus-5-5', permissionMode: 'default' });
    await tick();

    ok('asking for an effort is accepted', host.setEffort(id, 'xhigh') === true);
    eq('…and nothing is remembered while the CLI has not answered', heard.length, 0);
    const reqOf = (kind) => {
        const line = child.written.map(l => { try { return JSON.parse(l); } catch { return {}; } })
            .filter(o => o.type === 'control_request' && String(o.request_id || '').startsWith(kind)).pop();
        return line && line.request_id;
    };
    const effortReq = reqOf('effort-');
    ok('an effort control request went to the CLI', !!effortReq);
    say({ type: 'control_response', response: { subtype: 'success', request_id: effortReq } });
    await tick();
    eq('‼️ the CLI\'s yes is announced as the agent\'s choice', heard.map(h => h.choice), [{ effort: 'xhigh' }]);
    eq('…for the card it was made on', heard[0] && heard[0].id, id);

    ok('asking for a model is accepted', host.setModel(id, 'sonnet') === true);
    const modelReq = reqOf('model-');
    say({ type: 'control_response', response: { subtype: 'error', request_id: modelReq, error: 'no such model' } });
    await tick();
    eq('a refusal announces nothing', heard.length, 1);

    // S-102 — the card's account box: a rule is announced as the rule, a sign-in as a cleared account
    ok('moving the card to a sign-in is accepted', host.setAccount(id, 'claude-2').ok === true);
    eq('‼️ …and announced as a cleared account — a sign-in is never remembered',
        heard.slice(1).map(h => h.choice), [{ account: '' }]);
    host.setAccount(id, 'claude-2');
    eq('…while picking the sign-in it is already moving to announces nothing', heard.length, 2);
    ok('a rule this window cannot resolve is refused', host.setAccount(id, '@emptiest').ok === false);
    eq('…and announces nothing', heard.length, 2);
    host.accountPick = () => ({ id: 'claude-3', note: 'the emptiest' });
    ok('a rule it can resolve is accepted', host.setAccount(id, '@emptiest').ok === true);
    eq('‼️ …and the RULE is announced, not the slot it picked', heard[2] && heard[2].choice, { account: '@emptiest' });

    host.dispose && host.dispose();
}

main().then(() => {
    // the wiring the extension owns, read off the source
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('the extension listens for choices on the card host',
        /consoleHost\.onChosen\(\(id, choice\) =>[\s\S]{0,200}rememberChoice\(s\.agentId, s\.engine \|\| 'claude', choice\)/.test(ext));
    ok('…and writes them through the one merge',
        /\[agentId\]: withLiveChoice\(lastLaunchOf\(agentId\), engine, choice\)/.test(ext));
    const hostTs = fs.readFileSync(path.join(ROOT, 'src', 'core', 'consolehost.ts'), 'utf8');
    eq('every engine path announces its accepted choice (claude confirm, opencode model, three direct setters, opencode mode, account move)',
        (hostTs.match(/this\.chose\(id, /g) || []).length, 7);
    console.log(`test_live_choice: ${pass} passed, ${fail} failed`);
    if (fail) { process.exit(1); }
    process.exit(0);
}).catch(e => { console.log('  FAIL threw: ' + (e && e.stack || e)); process.exit(1); });

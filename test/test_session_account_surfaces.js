// X-251 (2/n) — A RECORDED SESSION SAYS WHOSE PLAN IT RAN ON, on its own page
// and on the timeline.
//
// ‼️ WHY THE FILE CANNOT ANSWER THIS, MEASURED (X-251, 2026-09-07).
//
// Every account slot's `projects` folder is a JUNCTION onto one shared root
// (`…/accounts/<slot>/projects -> C:\Users\<u>\.claude\projects`), so five
// accounts write their transcripts into the same directory and the FILE cannot
// name its owner. The account is knowable at exactly one moment — the launch —
// and X-251's first half wrote it there: onto the LaunchManifest, which the
// session reaches by its `launchId`. The manifest is therefore the only witness
// there will ever be, which is why every surface here ASKS rather than derives.
//
// ‼️ AND WHY THIS HALF MATTERS MORE THAN A LABEL. The session viewer resumes the
// user's OWN conversation to capture `/context`
// (`claude --resume <id> -p "/context"`). It took an `account` argument and
// NOBODY PASSED ONE, so the capture ran as whatever sign-in the VS Code window
// happened to hold. Because the transcript is found either way, the failure is
// silent by construction: the capture succeeds and the wrong plan pays for it.
//
// ‼️ ABSENT STAYS ABSENT. A session with no manifest, or one whose launch
// injected no sign-in, answers NOTHING — never "this machine", never a guess at
// the standing choice. A gap is visible; a wrong attribution is not.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

// ---------- the page, built for real ----------
{
    const Module = require('module');
    const origLoad = Module._load;
    Module._load = function (request) {
        if (request === 'vscode') {
            return {
                Uri: {}, window: {},
                workspace: { getConfiguration: () => ({ get: (_k, d) => d }) },
                ViewColumn: {}, ConfigurationTarget: {}, env: {}
            };
        }
        return origLoad.apply(this, arguments);
    };
    const viewer = require(path.join(ROOT, 'out', 'panels', 'sessionViewer.js'));
    Module._load = origLoad;

    const T = s => `2026-09-07T09:0${s}:00.000Z`;
    const file = path.join(os.tmpdir(), `af-acct-${Date.now()}.jsonl`);
    fs.writeFileSync(file, [
        { type: 'user', timestamp: T(1), cwd: 'D:/x', message: { content: 'merhaba' } },
        {
            type: 'assistant', timestamp: T(1),
            message: {
                id: 'a1', model: 'claude-opus-5', content: [{ type: 'text', text: 'selam' }],
                usage: { input_tokens: 10, output_tokens: 4 }
            }
        }
    ].map(l => JSON.stringify(l)).join('\n'));

    const base = {
        extensionUri: {}, getPricing: () => ({ costFor: () => 0 }),
        maxMessages: () => 50, contextLimitFor: () => 0
    };
    const build = extra => viewer.buildData(file, Object.assign({}, base, extra));

    const named = build({ accountFor: () => ({ id: 'slot-2', label: 'wmmuratvural@gmail.com' }) });
    ok('the page is told which sign-in the run was recorded on',
        named.account === 'wmmuratvural@gmail.com');
    // ‼️ THE ID TRAVELS TOO, AND IT IS NOT THE LABEL. `/context` resumes on a
    // SLOT, and a label is a thing to read, not a directory to point at.
    ok('‼️ …and the slot id travels beside it, because the capture spawns on it',
        named.accountId === 'slot-2');

    const none = build({});
    ok('‼️ a session with no recorded sign-in says NOTHING, rather than "this machine"',
        none.account === '' && none.accountId === '');
    const unknown = build({ accountFor: () => undefined });
    ok('…and an unindexed session is the same silence, not a fallback',
        unknown.account === '' && unknown.accountId === '');

    fs.unlinkSync(file);
}

// ---------- the wiring: asked for, never derived ----------
{
    const viewerTs = read('src', 'panels', 'sessionViewer.ts');
    const extTs = read('src', 'extension.ts');
    const timelineTs = read('src', 'panels', 'timeline.ts');

    ok('the viewer asks for ONE answer carrying both the id and the label',
        /accountFor\?\(sessionId: string\): \{ id: string; label: string \} \| undefined;/
            .test(viewerTs));
    ok('‼️ …and the /context capture is given it, which is the whole point of the id',
        /runContextCapture\([\s\S]{0,900}deps\.accountFor/.test(viewerTs));

    // ‼️ ONE READER FOR TWO SURFACES. Two resolvers would disagree the first
    // time one of them learned about a slot the other had not.
    ok('‼️ the host answers it in ONE place, off the manifest',
        /const sessionAccountOf = /.test(extTs)
        && /manifestOf\(launchManifests\(\)[\s\S]{0,120}account/.test(extTs));
    ok('…and the viewer is wired to that one place',
        /accountFor: sessionAccountOf/.test(extTs));
    ok('…and so is the timeline, rather than growing its own',
        (extTs.match(/accountFor: sessionAccountOf/g) || []).length >= 2);
    ok('the timeline declares the same shape it is handed',
        /accountFor\?/.test(timelineTs));
    ok('‼️ …and puts it on the card, where the ENGINE is the subject (ONE SUBJECT)',
        /account/.test(timelineTs));
}

// ---------- the pages draw it where the sign-in already belongs ----------
{
    const viewerJs = read('media', 'sessionViewer.js');
    const timelineJs = read('media', 'timeline.js');
    // The engine badge's own panel is where "what ran this" already lives, so a
    // second panel for the sign-in would be the ONE SUBJECT rule broken.
    const badge = viewerJs.slice(viewerJs.indexOf('AFEngine.badge(DATA.engine'));
    ok('the viewer names the sign-in in the engine panel, not a panel of its own',
        badge.slice(0, 1200).indexOf('Account') > 0);
    ok('‼️ …and an empty one draws no line at all',
        /AFTip\.lines\(/.test(badge.slice(0, 1200)));
    const tbadge = timelineJs.slice(timelineJs.indexOf('AFEngine.badge(eng'));
    ok('the timeline card says it in the same panel, for the same reason',
        tbadge.slice(0, 700).indexOf('Account') > 0);
}

// ---------- the sessions table says it in WORDS, like the other two ----------
//
// ‼ X-251 (3/n) — THE ROW BADGE WAS ASKED FOR AND REFUSED, and this is what
// the clause actually needed. The user's answer (2026-09-07): no per-row chip,
// because in a fleet where every row carries the same sign-in a chip repeated
// down the column is noise, and the fact already lives one hover away.
//
// ‼ BUT THE HOVER WAS PRINTING AN INTERNAL ID. The viewer and the timeline
// both resolve through `statedAccountLabel` (`sessionAccountOf`), so they say
// "aicozums@gmail.com" while the table said "claude-aicozums" — the same fact
// in two spellings, one of which is a directory name the reader never chose.
// The resolver is HANDED IN rather than imported, for the reason every other
// optional here is: a table can be asked for rows before the account store
// exists, and a missing resolver must degrade to the raw id rather than to a
// blank — an id nobody can read still names the right account.
{
    const Module = require('module');
    const origLoad = Module._load;
    Module._load = function (request) {
        if (request === 'vscode') {
            return {
                Uri: {}, window: {}, ViewColumn: {}, ConfigurationTarget: {}, env: {},
                workspace: { getConfiguration: () => ({ get: (_k, d) => d }) }
            };
        }
        return origLoad.apply(this, arguments);
    };
    const { sessionRowPool } = require(path.join(ROOT, 'out', 'panels', 'dashboard.js'));
    Module._load = origLoad;

    const session = {
        file: 'f1', agentName: 'developer', sessionId: 'sid1', title: 't1',
        firstTs: 1000, lastTs: 2000, mtime: 900, launchId: 'L1',
        usage: { input: 1, output: 0, cacheWrite: 0, cacheRead: 0 },
        cost: 1, isSidechain: false, toolCalls: 1, errors: 0,
        lastCtxTokens: 0, userTurns: 1, turns: []
    };
    const manifest = {
        launchId: 'L1', engine: 'claude', surface: 'console', at: 1000,
        account: 'claude-aicozums',
        identity: { origin: 'inherited' },
        requested: { model: 'opus' }
    };
    const labelled = sessionRowPool([session], undefined, 12, undefined, undefined,
        [manifest], id => (id === 'claude-aicozums' ? 'aicozums@gmail.com' : id));
    ok('‼ the table names the sign-in the way the viewer and the timeline do',
        labelled[0].launch.account === 'aicozums@gmail.com');

    const bare = sessionRowPool([session], undefined, 12, undefined, undefined, [manifest]);
    ok('…and with no resolver it degrades to the raw id, never to a blank',
        bare[0].launch.account === 'claude-aicozums');

    const noAccount = sessionRowPool([{ ...session, launchId: 'L2' }], undefined, 12,
        undefined, undefined,
        [{ ...manifest, launchId: 'L2', account: undefined }], () => 'never asked');
    ok('‼ a run that injected no sign-in stays EMPTY — the resolver is not asked',
        noAccount[0].launch.account === '');
}

// ---------- and no row grows a chip of its own (the user's answer) ----------
{
    const tableJs = read('media', 'sessionsTable.js');
    // The Engine cell is where a sign-in chip would have gone, next to the
    // engine badge (ONE SUBJECT). It must carry the engine badge and nothing
    // about the account: the fact belongs to the launch panel's hover.
    const cell = tableJs.slice(tableJs.indexOf('AFEngine.badge(r.engine)'));
    ok('‼ the Engine cell draws no per-row account chip — asked for and refused',
        cell.slice(0, 400).indexOf('account') < 0);
}

console.log((fail ? 'FAIL' : 'ok') + ' — test_session_account_surfaces.js: '
    + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

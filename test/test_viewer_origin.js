// S-37 — the Session page and the Sessions row must not disagree about who ran
// a session.
//
// `6ce44b54-…` was a conversation the user held in the Console. The Sessions
// table had it right (🧑 yours); opening it drew 🤖🌙 "automation run". Both
// surfaces call the same two functions — `sessionOrigin` and `sessionHeadless`
// — but on different evidence: the table passes the indexed `SessionInfo`,
// which carries `consoleHosted`, while the page passed an object built out of
// the transcript it had just parsed. A transcript writes `entrypoint:
// "sdk-cli"` for a person typing in the Console AND for a headless `claude -p`,
// so the page could only ever guess, and it guessed automation every time.
//
// The rule these tests hold: the page ASKS for the verdict and only decides for
// itself when nothing has indexed the file.
const fs = require('fs');
const path = require('path');
const os = require('os');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

// ---------- the page, run for real ----------
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
    const viewer = require(path.join(__dirname, '..', 'out', 'panels', 'sessionViewer.js'));
    Module._load = origLoad;

    // A Console conversation on disk looks exactly like a headless run on disk.
    // That is the whole problem, so the fixture says `sdk-cli` and nothing else.
    const T = s => `2026-08-16T09:0${s}:00.000Z`;
    const file = path.join(os.tmpdir(), `af-origin-${Date.now()}.jsonl`);
    fs.writeFileSync(file, [
        { type: 'user', timestamp: T(1), entrypoint: 'sdk-cli', cwd: 'D:\\x', message: { content: 'merhaba' } },
        {
            type: 'assistant', timestamp: T(1), entrypoint: 'sdk-cli',
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

    // 1. Nothing indexed it → the page still has to answer, and answers from the
    //    transcript. This is the pre-existing behaviour and it stays.
    const alone = build({});
    ok('with no record to ask, the page still reads the transcript',
        alone.origin === 'auto' && alone.headless === true);

    // 2. The record says a person held this in the Console. The transcript says
    //    `sdk-cli` and is IGNORED — that is the fix.
    const hosted = build({ originFor: () => ({ origin: 'user', headless: false }) });
    ok('‼️ the indexed verdict wins over the transcript — 🧑, not 🤖',
        hosted.origin === 'user');
    ok('‼️ …and the 🌙 goes with it, not one without the other',
        hosted.headless === false);

    // 3. It works the other way round too: the page must not "helpfully" keep a
    //    user verdict when the record names the launcher that started the run.
    const auto = build({ originFor: () => ({ origin: 'auto', headless: true }) });
    ok('an automated run stays automated when the record says so',
        auto.origin === 'auto' && auto.headless === true);

    // 4. An id the index does not know falls back rather than claiming nothing.
    const unknown = build({ originFor: () => undefined });
    ok('an unindexed session falls back instead of coming back blank',
        unknown.origin === 'auto' && unknown.headless === true);

    fs.unlinkSync(file);
}

// ---------- the wiring, and that the page no longer decides alone ----------
{
    const viewerTs = read('src', 'panels', 'sessionViewer.ts');
    const extTs = read('src', 'extension.ts');

    ok('the page asks for ONE verdict covering both halves',
        /originFor\?\(sessionId: string\): \{ origin: SessionOrigin; headless: boolean \} \| undefined;/
            .test(viewerTs));
    ok('…and both halves read it, so neither can be wired without the other',
        /origin: verdict\?\.origin/.test(viewerTs) && /headless: verdict\?\.headless/.test(viewerTs));
    ok('…on the foreign-CLI path as well as the Claude one',
        (viewerTs.match(/deps\.originFor\?\.\(/g) || []).length === 2);

    ok('‼️ the host answers from the INDEX, with the functions the table uses',
        /originFor: \(sessionId: string\) => \{\s*\n\s*const s = index\.byId\(sessionId\);\s*\n\s*return s \? \{ origin: sessionOrigin\(s\), headless: sessionHeadless\(s\) \} : undefined;/
            .test(extTs));

    // The second defect of the same family: every setter that changes a mark
    // re-applies it to BOTH halves of the index — this one did not, so a
    // foreign-engine session the Console had just taken over stayed filed as
    // automation until an unrelated rescan happened to fix it.
    const sessTs = read('src', 'core', 'sessions.ts');
    const setter = sessTs.slice(sessTs.indexOf('setConsoleSessions(ids: string[]): void {'));
    const body = setter.slice(0, setter.indexOf('\n    }'));
    ok('‼️ the Console id list re-marks the external sessions too',
        /for \(const s of this\.externalList\) \{ this\.applyMark\(s\); \}/.test(body));
    ok('…as every other mark setter already did',
        (sessTs.match(/for \(const s of this\.externalList\) \{ this\.applyMark\(s\); \}/g) || []).length >= 2);
}

// ---------- the rule itself, unchanged ----------
{
    const { sessionOrigin, sessionHeadless } = require(path.join(__dirname, '..', 'out', 'core', 'sessions.js'));
    const consoleRun = { entrypoint: 'sdk-cli', consoleHosted: true };
    ok('a Console-hosted sdk-cli session is a person, and is not headless',
        sessionOrigin(consoleRun) === 'user' && sessionHeadless(consoleRun) === false);
    ok('…and a launcher still outranks the Console list',
        sessionOrigin({ entrypoint: 'sdk-cli', consoleHosted: true, launchedBy: { kind: 'schedule', label: 'gece' } }) === 'auto');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

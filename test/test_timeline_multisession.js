// DOM-stub test: timeline.js with the SAME agent open in two concurrent
// sessions — per-session swim-lane tracks, and the YOUR TURN controls that
// belong to each of those sessions rather than to the agent (U-66).
const fs = require('fs');
const vm = require('vm');

const code = require(require('path').join(__dirname, 'lib_shared_media.js')).sharedMedia()
    + fs.readFileSync(require('path').resolve(__dirname, '../media/timeline.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

let posted = [];
let lastHtml = '';
let chipEls = [];

/** The `<g>` groups a class drew, with their data attributes. */
function svgGroups(cls) {
    const out = [];
    const re = new RegExp('<g class="' + cls + '"([^>]*)>', 'g');
    let m;
    while ((m = re.exec(lastHtml))) {
        const attrs = m[1];
        const pick = k => { const g = new RegExp(k + '="([^"]*)"').exec(attrs); return g ? g[1] : undefined; };
        out.push({
            dataset: {
                session: pick('data-session'), action: pick('data-action'),
                disabled: pick('data-disabled'), agent: pick('data-agent')
            },
            checked: pick('aria-checked') === 'true'
        });
    }
    return out;
}

function elemsForSelector(sel) {
    if (sel !== '.af-toggle' && sel !== '.af-alerttest') { return []; }
    const els = svgGroups(sel.slice(1)).map(g => {
        const el = { dataset: g.dataset, checked: g.checked };
        el.addEventListener = (_e, fn) => { el._click = fn; };
        return el;
    });
    if (sel === '.af-toggle') { chipEls = els; }
    return els;
}

const appEl = { set innerHTML(v) { lastHtml = v; }, get innerHTML() { return lastHtml; } };
const stubEl = { addEventListener() { }, set innerHTML(v) { } };

const NOW = Date.now();
const MIN = 60000;
const sandbox = {
    acquireVsCodeApi: () => ({ postMessage: (m) => posted.push(m), getState() { }, setState() { } }),
    window: {
        AFCharts: {
            esc: (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
            fmtUSD: (v) => '$' + Number(v).toFixed(2),
            fmtTok: (n) => n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n),
            fmtTokW(n, w) { return this.fmtTok(n || 0) + (w > 0 ? ' [w' + this.fmtTok(Math.round(w)) + ']' : ''); },
            fmtTokWText(n, w) { return this.fmtTok(n || 0) + (w > 0 ? ' (w' + this.fmtTok(Math.round(w)) + ')' : ''); },
            WEIGHTED_TIP: 'weighted',
        },
        __DATA__: {
            listener: { state: 'listening', port: 1 },
            ownersKnown: true,
            stuckMs: 240000,
            sessions: [
                // the SAME agent, two concurrent sessions
                { sessionId: 'S1', agentName: 'dev', resolved: true, label: 'dev #1', status: 'tool', currentTool: 'Read', prompts: 1, toolCalls: 1, compactions: 0, subagentStops: 0, startedAt: NOW - 40 * MIN, lastEventTs: NOW - 5 * MIN, cost: 0.5, tokens: 48200, ctxTokens: 24100, turns: 3, model: 'claude-opus-5', owner: { pid: 4242, entrypoint: 'cli' }, cwd: 'D:/a/dev', transcriptPath: 'D:/t/S1.jsonl', title: 'the S1 job', firstPrompt: 'fix the memory issue in auth module' },
                { sessionId: 'S2', agentName: 'dev', resolved: true, label: 'dev #2', status: 'waiting-input', prompts: 1, toolCalls: 1, compactions: 0, subagentStops: 0, startedAt: NOW - 20 * MIN, lastEventTs: NOW - 14 * MIN, owner: { pid: 77, entrypoint: 'cli' } },
                // another agent with one live session — its tool call never got
                // an end event, and the session has since moved on
                { sessionId: 'S3', agentName: 'ops', resolved: true, label: 'ops', status: 'idle', prompts: 0, toolCalls: 1, compactions: 0, subagentStops: 0, startedAt: NOW - 10 * MIN, lastEventTs: NOW - 8 * MIN, owner: { pid: 9, entrypoint: 'cli' } },
                // a session whose folder is not an agent folder: no name, only an id
                { sessionId: 'abcdef1234567890', agentName: 'abcdef12', resolved: false, label: 'abcdef12', status: 'waiting-input', prompts: 2, toolCalls: 0, compactions: 0, subagentStops: 0, startedAt: NOW - 30 * MIN, lastEventTs: NOW - 25 * MIN, owner: null }
            ],
            events: [
                { sessionId: 'S1', agentName: 'dev', ts: NOW - 30 * MIN, kind: 'prompt', detail: 'p1' },
                // still running: the session says it is inside this tool
                { sessionId: 'S1', agentName: 'dev', ts: NOW - 5 * MIN, kind: 'toolStart', tool: 'Read' },
                // ‼️ U-67 — a whole turn on one row: what was asked, what ran,
                // what it answered, and the turn closing. Every one of those is
                // a point somebody hovers to find out what happened there.
                { sessionId: 'S2', agentName: 'dev', ts: NOW - 16 * MIN, kind: 'prompt', detail: 'list the temp folder for me' },
                { sessionId: 'S2', agentName: 'dev', ts: NOW - 15 * MIN, kind: 'toolStart', tool: 'Bash', detail: 'ls -la /tmp' },
                { sessionId: 'S2', agentName: 'dev', ts: NOW - 14 * MIN, kind: 'toolEnd', tool: 'Bash', detail: 'total 12 drwxr-xr-x 3 root' },
                { sessionId: 'S2', agentName: 'dev', ts: NOW - 14 * MIN + 2000, kind: 'stop' },
                // an EARLIER, ended ops session — sequential, so it must SHARE the ops row
                { sessionId: 'SOLD', agentName: 'ops', ts: NOW - 50 * MIN, kind: 'prompt', detail: 'old' },
                { sessionId: 'SOLD', agentName: 'ops', ts: NOW - 45 * MIN, kind: 'end' },
                // tool call with no end, on a session that is idle again
                { sessionId: 'S3', agentName: 'ops', ts: NOW - 9 * MIN, kind: 'toolStart', tool: 'Bash' },
                { sessionId: 'abcdef1234567890', ts: NOW - 25 * MIN, kind: 'prompt', detail: 'anon' }
            ],
            workflowRuns: [],
            // ‼️ Keyed by SESSION: S1 alerts, S2 does not, and they are the same
            // agent. That is the whole shape the old agent-keyed map could not
            // express.
            sessionAlerts: { S1: ['sound'] },
            alertActions: ['sound', 'focus', 'modal', 'toast']
        },
        addEventListener() { }
    },
    document: {
        getElementById: (id) => id === 'app' ? appEl : (id === 'install' ? null : stubEl),
        querySelectorAll: elemsForSelector
    },
    setInterval: () => 1, clearInterval: () => { }, console
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(code, sandbox); // runs render() once

// ---- swim lanes: one row per CONCURRENT session ----
ok('lane row dev #1 exists', lastHtml.indexOf('>dev #1</text>') !== -1);
ok('lane row dev #2 exists', lastHtml.indexOf('>dev #2</text>') !== -1);
ok('sequential ops sessions share one plain row', lastHtml.indexOf('>ops</text>') !== -1 && lastHtml.indexOf('>ops #1</text>') === -1);
ok('four lane rows total (svg height)', lastHtml.indexOf('viewBox="0 0 900 232"') !== -1);
// U-53 made the gutter three lines: rowH 46 -> 50. S1's prompt mark sits in
// row 0 (cy = 22+25), S2's tool segment in row 1 (y = 22+50+25-7).
ok('S1 mark drawn in first dev row', /<circle cx="[\d.]+" cy="47" r="4\.2"/.test(lastHtml));
ok('S2 segment drawn in second dev row', /<rect x="[\d.]+" y="90" width="[\d.]+" height="14"/.test(lastHtml));

// ---- U-53: the row says WHICH SESSION, under the name ----
//
// "dev #1 / dev #2" says which of an agent's rows you are on and not which
// conversation, so the id had to be fished out of a hover — on the one page
// whose whole job is watching several sessions at once.
ok('‼️ the row carries its session id, under the agent name',
    /<text class="lane-sid" x="16" y="46" font-size="9\.5"[^>]*>\(S1\)<\/text>/.test(lastHtml));
ok('…each row its own', /<text class="lane-sid"[^>]*>\(S2\)<\/text>/.test(lastHtml));
ok('…and it is part of the label group, so it is drawn with the name',
    /<g class="lanelabel">[\s\S]{0,2500}?class="lane-sid"[\s\S]{0,120}?\(S1\)/.test(lastHtml));
ok('…set in monospace, because ids are read against each other',
    /\.lane-sid \{ font-family:var\(--vscode-editor-font-family/.test(lastHtml));
// A packed row holds several sessions in sequence: naming one of them without
// saying so would imply the row IS that session.
ok('‼️ a packed row says how many more it is drawing',
    /<text class="lane-sid"[^>]*>\(S3\) \+1<\/text>/.test(lastHtml));

// ---- a session nobody could name is labelled by what it IS ----
ok('unresolved session row is labelled by its id', lastHtml.indexOf('>#abcdef12</text>') !== -1);
ok('…and says why', lastHtml.indexOf('not one of your agent folders') !== -1);
ok('‼️ …and gets NO second line repeating it — a repeated fact is not information',
    !/<text class="lane-sid"[^>]*>\(abcdef12\)/.test(lastHtml));

// ---- the row label is a handle: rich panel + click ----
//
// ‼️ U-67 — THE HANDLE IS HTML LAID OVER THE DRAWING, and it has to be: what
// this hover carries is TEXT (the conversation's name, the prompt it is on,
// where it runs), an `AFTip` is HTML, and an `<svg>` cannot hold HTML. The box
// is the same element for all three gestures — hover, click, right-click — so
// they cannot disagree about which session the row means.
ok('lane labels are clickable', lastHtml.indexOf('class="lane-hot mark"') !== -1);
ok('…carrying the session\'s own transcript', lastHtml.indexOf('class="lane-hot mark" data-file="D:/t/S1.jsonl"') !== -1);
ok('‼️ …in an AFTip and not a native title, because it is text',
    /class="af-tipw tip-free lane-hotw"/.test(lastHtml)
    && !/class="mark lanelabel"/.test(lastHtml));
ok('‼️ …whose head is the CONVERSATION\'s name, which is what the row is about',
    /<span class="af-tiph">the S1 job<\/span>/.test(lastHtml));
ok('…and the conversation\'s own name leads its block, never the folder it ran in',
    /Conversation: the S1 job/.test(lastHtml) && /Agent: dev/.test(lastHtml));
ok('…and the lane panel shows the opening prompt purpose',
    /Opening prompt \(purpose\):[\s\S]*?fix the memory issue in auth module/.test(lastHtml));
ok('…and its figures are in there', /Session: #S1 · TOOL/.test(lastHtml)
    && /Inside a tool: Read/.test(lastHtml)
    && lastHtml.indexOf('$0.50 · 48.2k tok') !== -1);

// ---- a row is a session: right-click it for that session's commands ----
{
    const ctxOf = (s) => {
        const m = /sessionId&quot;:&quot;([^&]*)&quot;/.exec(s);
        return m ? m[1] : '';
    };
    const label = /<span class="lane-hot mark" data-file="D:\/t\/S1.jsonl" data-ts="0" data-vscode-context="([^"]*)"/.exec(lastHtml);
    ok('the row label carries the right-click contract', !!label);
    // ‼️ The label is BOTH a session and an agent — its name is what is written
    // there. The section it publishes is in both families in
    // src/core/ctxmenu.ts, so one right-click gives the session's actions and
    // everything the agent can be asked to do.
    ok('…the same one the cards use, plus the agent\'s',
        !!label && label[1].indexOf('afTimelineAgent') !== -1);
    ok('…for that row\'s own session', !!label && ctxOf(label[1]) === 'S1');
    ok('…and it names the agent, which is all a lane knows',
        !!label && /agentName&quot;:&quot;dev&quot;/.test(label[1]));
    {
        const pkg = JSON.parse(fs.readFileSync(
            require('path').resolve(__dirname, '../package.json'), 'utf8'));
        const web = pkg.contributes.menus['webview/context'];
        const draws = (when, section) => {
            const m = /^webviewSection =~ \/(.+)\/$/.exec(String(when || ''));
            return m ? new RegExp(m[1]).test(section) : when === `webviewSection == '${section}'`;
        };
        ok('‼️ the catalogue really draws BOTH menus on a lane label',
            web.some(e => e.command === 'agentfarm.endSession' && draws(e.when, 'afTimelineAgent'))
            && web.some(e => e.command === 'agentfarm.openAgentDetail' && draws(e.when, 'afTimelineAgent')));
    }
    ok('…and the lane tooltip carries session info', lastHtml.indexOf('Conversation: the S1 job') !== -1);

    // Transparent hit areas: the whole row answers for its live session, and a
    // packed row's earlier session answers for itself.
    const rects = [];
    const re = /<rect x="([\d.]+)" y="(\d+)" width="([\d.]+)" height="46" fill="transparent" data-vscode-context="([^"]*)"\/>/g;
    let m;
    while ((m = re.exec(lastHtml))) {
        rects.push({ x: Number(m[1]), y: Number(m[2]), w: Number(m[3]), sid: ctxOf(m[4]) });
    }
    ok('every row has a full-width right-click area', rects.filter(r => r.w === 792).length === 4);
    ok('…the dev rows target their own sessions',
        rects.some(r => r.y === 24 && r.w === 792 && r.sid === 'S1') &&
        rects.some(r => r.y === 74 && r.w === 792 && r.sid === 'S2'));
    ok('…a packed row targets the session that is live', rects.some(r => r.y === 124 && r.w === 792 && r.sid === 'S3'));
    ok('…and the earlier session on that row answers over its own span',
        rects.some(r => r.y === 124 && r.sid === 'SOLD' && r.w < 792));
    ok('…a row nobody could name is still a session', rects.some(r => r.y === 174 && r.sid === 'abcdef1234567890'));
    ok('the hit areas are laid down before the bars, so left-click still opens',
        lastHtml.indexOf('fill="transparent"') < lastHtml.indexOf('rx="3" fill="var(--vscode-charts-green'));
}

// ---- an unfinished tool call must not run to "now" forever ----
{
    // row 2 (ops): toolStart at -9m, no toolEnd, session idle again since -8m
    const ghost = /<rect x="([\d.]+)" y="140" width="([\d.]+)" height="14" rx="3" ([^>]*)>/.exec(lastHtml);
    ok('the unfinished tool is drawn', !!ghost);
    ok('…hollow and dashed, not as work in progress',
        !!ghost && ghost[3].indexOf('fill="none"') !== -1 && ghost[3].indexOf('stroke-dasharray') !== -1);
    ok('…and stops where the session did (≈1 minute, not 9)', !!ghost && Number(ghost[2]) < 60);
    ok('…and says so on hover', lastHtml.indexOf('no end event ever arrived') !== -1);
    // row 0 (dev #1): the session says it IS inside this tool — that one grows
    const live = /<rect x="([\d.]+)" y="40" width="([\d.]+)" height="14" rx="3" fill="var\(--vscode-charts-green/.exec(lastHtml);
    ok('a tool the session is still on keeps growing', !!live && Number(live[1]) + Number(live[2]) > 880);
}

// ---- gutter controls: four per ROW, each keyed by that row's session ----
// Every row gets its own set (an empty gutter reads as a broken row), and no
// two rows point at the same key — which is what makes "turn this one on"
// possible at all on an agent that is running twice.
{
    const g = svgGroups('af-toggle');
    ok('four controls per row, on all four rows', g.length === 16);
    const bySession = {};
    for (const x of g) { bySession[x.dataset.session] = (bySession[x.dataset.session] || 0) + 1; }
    ok('dev\'s two rows have two DIFFERENT keys',
        bySession.S1 === 4 && bySession.S2 === 4);
    ok('the ops row has its own', bySession.S3 === 4);
    ok('so does the unnamed one', bySession.abcdef1234567890 === 4);
    ok('and every row carries a test control', svgGroups('af-alerttest').length === 4);
    ok('the page explains the controls are per session, not per agent',
        /Every row is one session and carries its own choices/.test(lastHtml));
}
ok('ops tooltip claims no shared rows', !/data-agent="ops"[\s\S]{0,600}has \d+ rows here/.test(lastHtml));

// ---- session cards: disambiguated titles + per-session chips ----
ok('card titled dev #1', lastHtml.indexOf('>dev #1</span> <span class="sid"') !== -1);
ok('card titled dev #2', lastHtml.indexOf('>dev #2</span> <span class="sid"') !== -1);
ok('cards carry the session id, as the Console rows do', lastHtml.indexOf('(#S2)</span>') !== -1);
ok('cards show start time', /started \d{2}:\d{2}/.test(lastHtml));

// ---- the card is a place to act, not only to read ----
{
    ok('the title opens the session', lastHtml.indexOf('class="slink" data-open="D:/t/S1.jsonl"') !== -1);
    ok('…and so does the session\'s own name', lastHtml.indexOf('the S1 job') !== -1);
    ok('cards carry the right-click contract', lastHtml.indexOf('afTimelineSession') !== -1);
    ok('a session with a process can be ended', lastHtml.indexOf('data-endsess="S1"') !== -1);
    ok('…and any session can be cleared', lastHtml.indexOf('data-dropsess="S1"') !== -1);
    ok('the money line is on the card', lastHtml.indexOf('$0.50 · 48.2k tok · ctx 24.1k · 3 turns · opus-5') !== -1);
    ok('the work line is on the card', lastHtml.indexOf('1 prompts · 1 tools') !== -1);
    ok('where it runs is on the card', lastHtml.indexOf('pid 4242 · terminal') !== -1);
    ok('the folder can be revealed', lastHtml.indexOf('data-cwd="D:/a/dev"') !== -1);
}

// ---- a session whose process is gone says so, and can be swept ----
{
    ok('the finished session is marked', lastHtml.indexOf('No live process owns this session') !== -1);
    ok('…it is not offered an Interrupt', lastHtml.indexOf('data-stopsess="abcdef1234567890"') === -1);
    ok('…and the header offers to clear it', lastHtml.indexOf('id="clear-gone"') !== -1 &&
        lastHtml.indexOf('Clear 1 finished session<') !== -1);
    ok('a session with a live process is NOT called finished',
        (lastHtml.match(/No live process owns this session/g) || []).length === 1);
}
// ---- ‼️ THE ALERTS BELONG TO THE ROW'S SESSION (U-66) ----
//
// S1 and S2 are the same agent running twice. The controls used to be one
// setting drawn on both rows; now each row carries its own, and the second
// surface that used to sit under the card is gone (ONE SUBJECT).
{
    const gutter = svgGroups('af-toggle');
    ok('every control names a session, none names an agent',
        gutter.length > 0 && gutter.every(g => g.dataset.session && !g.dataset.agent));
    const state = (sid, act) => {
        const g = gutter.find(x => x.dataset.session === sid && x.dataset.action === act);
        return g && g.checked;
    };
    ok('S1 shows sound on', state('S1', 'sound') === true);
    ok('‼️ S2 — the same agent — does NOT inherit it', state('S2', 'sound') === false);
    ok('the card carries no second copy of the controls',
        lastHtml.indexOf('alert on your turn:') === -1
        && lastHtml.indexOf('(agent default)') === -1
        && lastHtml.indexOf('af-reset') === -1);
}

// ---- clicking S2's sound asks the host for S2 alone ----
posted = [];
chipEls.find(e => e.dataset.session === 'S2' && e.dataset.action === 'sound')._click();
ok('one click, one message', posted.length === 1 && posted[0].type === 'setTurnAlert');
ok('it names S2 and asks to turn it ON',
    posted[0].sessionId === 'S2' && posted[0].action === 'sound' && posted[0].enabled === true);
ok('the whole map is never sent back', posted[0].map === undefined);

// ---- and S1's own control still asks for S1 ----
posted = [];
chipEls.find(e => e.dataset.session === 'S1' && e.dataset.action === 'sound')._click();
ok('S1 asks to turn its own sound OFF',
    posted[0].sessionId === 'S1' && posted[0].enabled === false);

// ---- range buttons: no gaps a user has to jump over ----
{
    const wins = (lastHtml.match(/data-win="(\d+)"/g) || []).map(s => Number(/\d+/.exec(s)[0]));
    ok('the range strip runs 15m → 30d',
        JSON.stringify(wins) === JSON.stringify([15, 30, 60, 120, 180, 240, 480, 960, 1440, 4320, 10080, 43200]));
    ok('the in-between ranges are labelled 30m / 2h / 3h',
        lastHtml.includes('data-win="30" class="">30m<') && lastHtml.includes('>2h<') && lastHtml.includes('>3h<'));
    ok('1h is still the one selected on open', /data-win="60" class="sel"/.test(lastHtml));
}

// ---- ‼️ X-41: clicking the LINE opens the transcript, on every engine ----
//
// Only Claude's hooks put a transcript path on each EVENT. A Console
// conversation on any other engine is mirrored into the monitor from a thread
// id and a cwd, so its marks and tool bars arrived with an empty `data-file`
// and clicking them did nothing — beside a Claude lane that opened the
// transcript at the exact line. S1 is that shape here: the session knows its
// file, its events do not. The path does not change inside a session, so the
// lane's own is not a guess.
{
    // The drawing carries no data now: a dot is a dot and the box laid over it
    // is what is hovered, clicked and right-clicked (U-67). So the path is read
    // off the box, which is where it has to be right.
    const boxes = re => (lastHtml.match(re) || []).map(s => /data-file="([^"]*)" data-ts="(\d+)"/.exec(s))
        .filter(Boolean).map(m => ({ file: m[1], ts: Number(m[2]) }));
    const dots = boxes(/lane-hotw lane-dot" style="[^"]*"><span class="lane-hot mark" data-file="[^"]*" data-ts="\d+"/g);
    // A bar and the row's own label are the same wrapper; the row's box is the
    // one that names no moment (`data-ts="0"`), which is exactly what it means.
    const bars = boxes(/lane-hotw" style="[^"]*"><span class="lane-hot mark" data-file="[^"]*" data-ts="\d+"/g)
        .filter(b => b.ts > 0);
    ok('‼️ X-41 — a mark whose EVENT carried no path takes its lane\'s',
        dots.length > 0 && dots.some(d => d.file === 'D:/t/S1.jsonl'));
    ok('…and so does a tool bar',
        bars.length > 0 && bars.some(b => b.file === 'D:/t/S1.jsonl'));
    ok('‼️ …and a lane with no file anywhere still draws no link rather than a dead one',
        /class="lane-hot mark" data-file=""[\s\S]{0,900}?aria-label="dev #2 — what this row is"/.test(lastHtml));

    // The host half: where the lane's file comes from when the hook could not
    // carry one. The record has known where a foreign conversation lives since
    // the external pool existed — this join was one field short of reading it.
    const host = fs.readFileSync(require('path').resolve(__dirname, '../src/panels/timeline.ts'), 'utf8');
    ok('…the host falls back to the session RECORD, which covers every engine',
        /transcriptPath: s\.transcriptPath \|\| row\?\.file \|\| undefined/.test(host));
    ok('…reading the wide pool, the same one the title and the cost come from',
        /const rows = new Map\(deps\.index\.allWithExternal\(\)/.test(host));
}

// ---- ‼️ U-67: every point on a lane says what happened THERE ----------------
//
// The page's whole subject is which conversation is doing what, and until this
// it could only be asked about the ROW. A dot was a native `<title>` reading
// "prompt — p1 (14:23)": the kind, ninety characters, and a clock. What a
// person hovers a dot for is the moment itself — which conversation, what was
// said, where in the talk it fell — and that is TEXT, so it is an AFTip.
//
// One shape for every point, so the eye learns it once: who, what was said,
// where in the talk, what pressing it does.
{
    const panels = lastHtml.match(/<span class="af-tiph">[\s\S]*?<\/span><span class="af-tipb">[\s\S]*?<\/span>/g) || [];
    const withHead = h => panels.filter(p => p.indexOf('<span class="af-tiph">' + h) === 0);
    const prompt = withHead('You wrote · ').find(p => p.indexOf('temp folder') !== -1) || '';
    const turnEnd = withHead('The agent finished its turn · ')[0] || '';
    const bar = panels.filter(p => /^<span class="af-tiph">Bash · /.test(p))[0] || '';

    ok('‼️ a prompt dot opens with what it IS and when', !!prompt);
    ok('‼️ …and carries what was actually sent, whole and quoted',
        prompt.indexOf('“list the temp folder for me”') !== -1);
    ok('…and leaves out duplicate session identity boilerplate (ONE SUBJECT)',
        prompt.indexOf('Conversation: ') === -1 && prompt.indexOf('Agent: dev') === -1);
    ok('‼️ …and placed in the talk: the turn it opened, and the gap back',
        /At \d\d:\d\d(:\d\d)? · turn 1/.test(prompt));
    ok('…and leaves out repetitive gesture boilerplate',
        prompt.indexOf('Right-click for this session\'s actions.') === -1);

    ok('‼️ a tool bar says what tool ran and its concise target', !!bar
        && bar.indexOf('ls -la /tmp') !== -1);
    ok('…and how long it took, in the head, where a bar is read from',
        /^<span class="af-tiph">Bash · 1m/.test(bar));

    ok('‼️ the point that closes a turn says what the turn cost', !!turnEnd
        && /That turn ran .* and made 1 tool call\./.test(turnEnd));

    ok('‼️ nothing is left on a native title — the drawing carries no hover at all',
        !/<circle[^>]*><title>/.test(lastHtml) && !/height="14"[^>]*><title>/.test(lastHtml));
    ok('…and a point is its own click target, at its own moment',
        /lane-hotw lane-dot" style="[^"]*"><span class="lane-hot mark" data-file="[^"]*" data-ts="[1-9]/.test(lastHtml));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

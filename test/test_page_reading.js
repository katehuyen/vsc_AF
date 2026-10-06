// U-207 — A PAGE'S OWN TEXTS READ ALOUD (src/panels/pageReading.ts + media/afReadAloud.js):
// a notice, its report, a question, an article go through the one reading channel. The page
// names its text by a key; a pick only its panel can answer (a notice's report) is resolved on
// the host from the panel's own record, never from a path the page names; every change of the
// reading reaches each page that draws such a button, and only while it lives.
//
//   node test/test_page_reading.js   (after tsc)
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const P = require(path.join(ROOT, 'out', 'panels', 'pageReading.js'));
const { ReadingNow } = require(path.join(ROOT, 'out', 'core', 'soundCard.js'));
const { EN_PHRASES } = require(path.join(ROOT, 'out', 'core', 'speechPhrases.js'));

const spoke = [], acts = [];
const at = { paragraph: 0, paragraphs: 1, paused: false, live: true };
const readingNow = new ReadingNow();
const reader = {
    conversation: () => ({ error: 'no conversation here' }),
    voiceOf: () => '',
    fleet: () => ({ on: false, voice: '', rate: 0, volume: 100, events: [], template: '' }),
    reading: () => ({ voice: '', rate: 0, length: 'first', code: 'size' }),
    speechFor: async w => ({ voice: w, words: EN_PHRASES }),
    dialogue: {
        speaking: true, get state() { return at; },
        act: a => { acts.push(a); return true; }, setRate: () => true,
        speak: paras => { spoke.push([].concat(paras).join(' ')); return new Promise(() => undefined); }
    },
    readingNow,
    stop: () => { readingNow.stop(); return true; }
};

(async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-pageread-'));
    try {
        const posts = [];
        const page = { postMessage: m => { posts.push(m); return Promise.resolve(true); } };
        const ask = { surface: 'notices', resolve: pick => (pick.report === 'n1' ? 'The report says the build is green.' : pick.report ? { error: 'this notice has no report' } : undefined) };

        // --- before the reader is given, nothing is read and nothing breaks
        ok('a reading message is taken even before the reader exists', P.pageReads({ type: 'readAloud', pick: { text: 'x' } }, page, ask) === true);
        ok('…and any other message is the panel\'s own', P.pageReads({ type: 'markRead' }, page, ask) === false);
        P.setPageReader(reader);

        // --- a page's own text, by its key
        await P.handlePageReading({ type: 'readAloud', pick: { text: 'The build is ready.', key: 'notice:n2' } }, page, ask);
        ok('a page\'s text is read through the one channel', spoke.pop() === 'The build is ready.');
        const v = P.pageReadingNow();
        ok('the reading answers with the page\'s key and no session', v && v.key === 'notice:n2' && v.sessionId === '');

        // --- a pick the panel answers on the host
        await P.handlePageReading({ type: 'readAloud', pick: { report: 'n1', key: 'report:n1' } }, page, ask);
        ok('a report is read from what the panel resolves, never a path', spoke.pop() === 'The report says the build is green.');
        ok('…under the report\'s own key', P.pageReadingNow().key === 'report:n1');
        await P.handlePageReading({ type: 'readAloud', pick: { report: 'n9', key: 'report:n9' } }, page, ask);
        const no = posts.pop();
        ok('a pick the panel refuses is its own toast, and nothing is read', no.type === 'readRefused' && no.error === 'this notice has no report' && spoke.length === 0);
        await P.handlePageReading({ type: 'readAloud', pick: { file: 'C:/x.md', key: 'k' } }, page, { surface: 'wiki' });
        const r = posts.pop();
        ok('a pick nobody answers is refused by name, never read as a path', r.type === 'readRefused' && /text/.test(r.error) && spoke.length === 0);

        // --- control
        await P.handlePageReading({ type: 'readControl', action: 'toggle' }, page, ask);
        ok('■ / ▶ steer the reading now', acts.pop() === 'toggle');
        await P.handlePageReading({ type: 'readControl', action: 'fly' }, page, ask);
        ok('an unknown control is a toast', /not known/.test(posts.pop().error));

        // --- the broadcast reaches attached pages only, until they go
        const heard = [];
        const other = { postMessage: m => { heard.push(m); return Promise.resolve(true); } };
        const sub = P.attachPageReading(other);
        P.pushPageReading();
        ok('an attached page hears the reading', heard.length === 1 && heard[0].type === 'reading' && heard[0].reading.key === 'report:n1');
        sub.dispose();
        P.pushPageReading();
        ok('…and stops hearing it once it is gone', heard.length === 1);
        const dead = { postMessage: () => Promise.resolve(false) };
        P.attachPageReading(dead);
        P.pushPageReading();
        await new Promise(res => setTimeout(res, 10));
        let deadHeard = 0;
        dead.postMessage = () => { deadHeard++; return Promise.resolve(false); };
        P.pushPageReading();
        ok('a page that no longer takes messages is dropped', deadHeard === 0);

        // --- a report file as it is read
        const f = path.join(tmp, 'report.md');
        fs.writeFileSync(f, '---\naf-role: report\ndate: 2026-10-06\n---\n# Result\n\nAll green.\n', 'utf8');
        const txt = P.fileForReading(f);
        ok('a report is read without its frontmatter', typeof txt === 'string' && !/af-role/.test(txt) && /All green/.test(txt));
        ok('a missing report is refused by name', typeof P.fileForReading(path.join(tmp, 'gone.md')) === 'object');
        fs.writeFileSync(f, '---\na: 1\n---\n', 'utf8');
        ok('a report with nothing but metadata is refused', typeof P.fileForReading(f) === 'object');
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }

    // --- the page side: the component's own press for a text button
    let capture = null;
    const posted = [];
    const sandbox = {
        window: { addEventListener: () => undefined },
        document: { addEventListener: (type, fn, cap) => { if (type === 'click' && cap === true) { capture = fn; } } }
    };
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'media', 'afReadAloud.js'), 'utf8'), sandbox);
    const R = sandbox.window.AFRead;
    R.init(m => posted.push(m), null);
    ok('a text button says what it does, not "this step"', /title="Read it aloud"/.test(R.textBtn('notice:n1')) && /Read this step aloud/.test(R.btn('S', 'a1')));
    R.texts(key => (key.startsWith('report:') ? { report: key.slice(7) } : 'Hello there.'));
    const mk = (sid, key) => {
        const b = { dataset: { readSid: sid, read: key } };
        b.closest = sel => (sel === 'button[data-read]' ? b : null);
        return b;
    };
    let stopped = 0, prevented = 0;
    const ev = target => ({ target, stopPropagation: () => { stopped++; }, preventDefault: () => { prevented++; } });
    ok('the component listens for its buttons itself, before the row does', typeof capture === 'function');
    capture(ev(mk('', 'report:n1')));
    ok('a report button asks the host for the notice\'s report, by name', JSON.stringify(posted.pop()) === '{"type":"readAloud","pick":{"report":"n1","key":"report:n1"}}');
    ok('…and the row under it never sees the click', stopped === 1 && prevented === 1);
    capture(ev(mk('', 'notice:n1')));
    ok('a text button reads the text the page holds', posted.pop().pick.text === 'Hello there.');
    capture(ev(mk('S', 'a1')));
    ok('a step button is left to its page', posted.length === 0 && stopped === 2);

    // --- the Notices page wires it
    const nj = fs.readFileSync(path.join(ROOT, 'media', 'notices.js'), 'utf8');
    ok('a notice card carries the one text button', /AFRead\.textBtn\('notice:' \+ n\.id\)/.test(nj));
    ok('…and its report strip one for the report', /AFRead\.textBtn\('report:' \+ n\.id\)/.test(nj));
    ok('the page paints from the host\'s reading and hears its changes', /AFRead\.init\(m => vscode\.postMessage\(m\), DATA\.reading\)/.test(nj) && /AFRead\.receive\(ev\.data\)/.test(nj));
    const np = fs.readFileSync(path.join(ROOT, 'src', 'panels', 'noticesPanel.ts'), 'utf8');
    ok('the report is found from the notice\'s own record', /resolve:[\s\S]{0,200}store\.list\(\{ limit: 0 \}\)\.find\(x => x\.id === pick\.report\)/.test(np));
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('every change of the reading reaches these pages', /const readingRepaint = [^\n]*pushPageReading\(\)/.test(ext) && /setPageReader\(readerDeps\)/.test(ext));

    // --- Now: a running row's 🔊 reads that session's last answer, and is that session's reading
    ok('a session\'s last-answer button says so', /data-read="@last" data-read-sid="S"/.test(R.lastBtn('S')) && /title="Read its last answer aloud"/.test(R.lastBtn('S')));
    capture(ev(mk('S', '@last')));
    ok('pressed, it asks for that session\'s last answer', JSON.stringify(posted.pop()) === '{"type":"readAloud","sessionId":"S","pick":{"last":true}}');
    R.set({ sessionId: 'S', key: 'u-77', paused: false });
    ok('while any step of that session is read it is ■', R.stateOf('S', '@last') === 'reading' && /■<\/button>$/.test(R.lastBtn('S')));
    ok('…another session\'s is quiet', R.stateOf('T', '@last') === '');
    capture(ev(mk('S', '@last')));
    ok('…and a press stops it', posted.pop().action === 'stop');
    R.set({ sessionId: 'S', key: 'u-77', paused: true });
    capture(ev(mk('S', '@last')));
    ok('paused, a press resumes it', posted.pop().action === 'resume');
    R.set(null);
    const { buildNow } = require(path.join(ROOT, 'out', 'core', 'nowPage.js'));
    const nd0 = buildNow({ needs: [], sessions: [{ id: 'c1', sessionId: 'eng-1', agentName: 'dev', status: 'idle', startedAt: 1, lastTs: 1, costUSD: 0, messages: [] },
        { id: 'c2', agentName: 'dev', status: 'idle', startedAt: 1, lastTs: 1, costUSD: 0, messages: [] }], todayCost: 0, quotas: [], notices: [], now: 2 });
    ok('a running row carries the engine\'s session id, \'\' until known', nd0.running.map(r => r.sessionId).join('|') === 'eng-1|');
    const nwj = fs.readFileSync(path.join(ROOT, 'media', 'now.js'), 'utf8');
    ok('the Now row draws it only when the session is known', /\$\{s\.sessionId \? window\.AFRead\.lastBtn\(s\.sessionId\) : ''\}/.test(nwj)
        && /AFRead\.receive\(m\)/.test(nwj) && /AFRead\.init\(m => vscode\.postMessage\(m\), DATA\.reading\)/.test(nwj));
    const nwp = fs.readFileSync(path.join(ROOT, 'src', 'panels', 'nowPanel.ts'), 'utf8');
    ok('the Now host takes reading messages first and sends the reading with its data', /pageReads\(msg, host\.webview/.test(nwp) && /attachPageReading\(host\.webview\)/.test(nwp)
        && /reading: pageReadingNow\(\)/.test(nwp) && !/data: this\.deps\.build\(\)/.test(nwp));

    // --- Needs You: a question row reads the question whole, then its options — which the row must carry
    const { consoleNeedAsks, consoleNeedItems } = require(path.join(ROOT, 'out', 'core', 'consoleNeeds.js'));
    const { buildNeedsQueue } = require(path.join(ROOT, 'out', 'core', 'needs.js'));
    const asks = consoleNeedAsks([{ id: 'c1', agentName: 'developer', pendingAsk: { requestId: 'r1', ts: 1, questions: [
        { question: 'Which colour?', options: [{ label: 'Red' }, { label: 'Blue' }] }, { question: 'Ship now?', options: [{ label: 'Yes' }] }] } }],
    () => ({ state: 'off', reason: 'no-timer', why: 'waiting for you — no timer is set' }));
    const ci = consoleNeedItems(asks, 1)[0];
    ok('a Console question row carries every option, in order', ci && JSON.stringify(ci.options) === '["Red","Blue","Yes"]');
    const wq = buildNeedsQueue({ liveSessions: [], approvals: [], insights: [], workflowQuestions: [{ id: 'q1', workflowTitle: 'W', question: 'Go on?', options: ['Go on', 'Stop here'], askedAt: 2 }] })
        .find(x => x.kind === 'question');
    ok('a workflow question row carries its options whole', wq && JSON.stringify(wq.options) === '["Go on","Stop here"]');
    const nd = fs.readFileSync(path.join(ROOT, 'media', 'needs.js'), 'utf8');
    ok('a question row draws the one text button; other rows do not', /READS\.has\(item\.kind\) \? window\.AFRead\.textBtn\('need:' \+ item\.key\)/.test(nd)
        && /new Set\(\['question', 'console-question'\]\)/.test(nd));
    ok('…which reads the title, the whole text, then the numbered options', /\[said\(it\), it\.body \|\| saidD\(it\), \.\.\.\(it\.options \|\| \[\]\)\.map\(\(o, i\) => `\$\{i \+ 1\}\. \$\{o\}`\)\]/.test(nd)
        && /AFRead\.receive\(ev\.data\)/.test(nd) && /AFRead\.init\(m => vscode\.postMessage\(m\), DATA\.reading\)/.test(nd));
    const npn = fs.readFileSync(path.join(ROOT, 'src', 'panels', 'needsPanel.ts'), 'utf8');
    ok('the Needs You host takes reading messages first and hears the reading', /pageReads\(msg, host\.webview/.test(npn) && /attachPageReading\(host\.webview\)/.test(npn) && /reading: pageReadingNow\(\)/.test(npn));

    console.log(`test_page_reading: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();

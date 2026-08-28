// U-118 — WHAT THE AGENT ACTUALLY SAID, on the page whose whole job is to say it.
//
// The queue drew `lastPrompt`, which the live monitor cuts to NINETY characters
// for a card, and then cut it again with an ellipsis. So "Needs You" — the one
// page a person opens to find out what the farm is stuck on — could not show
// the question it was stuck on. The answer existed four thousand characters
// deep in `lastPromptFull` and was thrown away one field before it was drawn.
//
// Two rules are defended here, and the second is the one that keeps the first
// honest:
//   1. a row is a LINE and an opened row is the TEXT;
//   2. a caret is drawn ONLY when there is more behind it — a triangle that
//      opens onto the sentence already on the row teaches a reader in two
//      clicks that opening rows tells them nothing.
'use strict';
const path = require('path');
const { buildNeedsQueue, needKey, isClearable } = require(path.join(__dirname, '..', 'out/core/needs.js'));
const { runPage } = require(path.join(__dirname, 'lib_page_dom.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const base = { liveSessions: [], approvals: [], insights: [] };
const LONG = 'ayarları bildir ve çözünürlük zincirini gerçekten çalıştır.\n\nSonra sayfaya bak: koyu ve açık.';
const CUT = 'ayarları bildir ve çözünürlük zincirini gerçekten çalıştır. Sonra sayfaya…';

// ---------------------------------------------------------------- the builder
{
    const [perm] = buildNeedsQueue({
        ...base,
        liveSessions: [{
            sessionId: 's1', agentName: 'dev', status: 'waiting-permission',
            lastPrompt: CUT, lastPromptFull: LONG, lastEventTs: 10, transcriptPath: ''
        }]
    });
    ok('the row still draws the line it always drew', perm.detail === CUT);
    ok('‼️ …and the WHOLE prompt is carried beside it, not thrown away',
        perm.body === LONG);

    // ‼️ NO BODY WHEN THE LINE IS THE WHOLE THING.
    const [same] = buildNeedsQueue({
        ...base,
        liveSessions: [{
            sessionId: 's1', agentName: 'dev', status: 'waiting-permission',
            lastPrompt: 'do the thing', lastPromptFull: 'do the thing', lastEventTs: 10
        }]
    });
    ok('a prompt that fits its row opens onto nothing', same.body === undefined);
    const [none] = buildNeedsQueue({
        ...base,
        liveSessions: [{
            sessionId: 's1', agentName: 'dev', status: 'waiting-permission',
            lastPrompt: 'do the thing', lastEventTs: 10
        }]
    });
    ok('…and a session with no full prompt at all is not given an empty one',
        none.body === undefined);

    // ‼️ A STALLED ROW SPENDS ITS LINE ON THE TOOL, so the prompt is exactly
    // what the reader cannot see — the body carries it whether or not it was cut.
    const [stalled] = buildNeedsQueue({
        ...base,
        liveSessions: [{
            sessionId: 's2', agentName: 'dev', status: 'stalled', currentTool: 'Bash',
            lastPrompt: 'short one', lastPromptFull: 'short one', lastEventTs: 10
        }]
    });
    ok('a stalled row says the tool on its line', stalled.detail === 'last tool: Bash');
    ok('…and still lets you read the prompt behind it', stalled.body === 'short one');

    // Every kind goes through one reading standard — the user's own instruction
    // was that one surface must not differ from another.
    const [mission] = buildNeedsQueue({
        ...base,
        missionWaits: [{
            runId: 'r1', missionTitle: 'ZEN', flavor: 'question',
            detail: 'Hangi başlık?\n\n1. uzun olan\n2. kısa olan', ts: 5
        }]
    });
    ok('a multi-line question is flattened for the row', !/[\r\n]/.test(mission.detail));
    ok('…and kept whole, line breaks and all, for the body',
        mission.body === 'Hangi başlık?\n\n1. uzun olan\n2. kısa olan');

    const long = 'x'.repeat(400);
    const [conflict] = buildNeedsQueue({
        ...base,
        insights: [{ severity: 'warning', agentName: 'dev', category: 'antigravity', message: long }]
    });
    ok('a long detail is cut to a row', conflict.detail.length < 200 && conflict.detail.endsWith('…'));
    ok('…and the body is the whole of it', conflict.body === long);

    const [approval] = buildNeedsQueue({
        ...base,
        approvals: [{ id: 'a1', title: 't', url: 'https://x.test', goal: 'read it', createdAt: 1, kind: 'browser' }]
    });
    ok('a detail that already fits gets no body at all', approval.body === undefined);
}

// ------------------------------------------------------------------- the page
{
    const items = buildNeedsQueue({
        ...base,
        liveSessions: [{
            sessionId: 's1', agentName: 'dev', status: 'waiting-permission',
            lastPrompt: CUT, lastPromptFull: LONG, lastEventTs: 10, transcriptPath: 'D:\\t\\s1.jsonl'
        }],
        approvals: [{ id: 'a1', title: 't', url: 'https://x.test', goal: 'read it', createdAt: 1, kind: 'browser' }]
    }).map(i => ({ ...i, key: needKey(i), clearable: isClearable(i) }));

    const r = runPage('needs.js', { items, hidden: 0, generatedAt: 1 });
    const html = () => r.html();

    // The opened block is the one thing only an OPEN row draws. (The class name
    // alone is in the stylesheet on every render, so the tag is what is asked
    // about — a test that matched the class would pass on a page that opens
    // nothing at all.)
    const openBlock = () => /<pre class="nd-full">/.test(html());

    ok('the row with more behind it gets a caret', /data-open=/.test(html()));
    ok('‼️ …and the one whose line is already whole does NOT',
        (html().match(/data-open=/g) || []).length === 1);
    ok('nothing is open to begin with', !openBlock());

    // ‼️ THE HOVER ANSWERS WITHOUT A CLICK. A row that makes you press something
    // to find out what it is about is unfinished (docs/CONVENTIONS.md → AFTip),
    // so the whole text is on the panel while the row is still shut.
    ok('the whole text is on the hover panel before anything is pressed',
        /<span class="af-tipb">[^<]*Sonra sayfaya bak/.test(html()));

    r.query('[data-open]')[0].click();
    ok('opening a row shows the whole text', openBlock()
        && html().includes('Sonra sayfaya bak: koyu ve açık.'));
    ok('…and says how much there is to read', /characters · select to copy/.test(html()));
    ok('the caret turns over', /<span class="nd-caret"[^>]*>▾</.test(html()));

    // ‼️ NOTHING IS POSTED. A blocker is not a message: reading it must not mark
    // it, clear it, or tell the host anything — the row goes when it is answered.
    ok('opening a row tells the host nothing at all',
        !r.posted.some(m => m.type === 'clear' || m.type === 'action'));

    r.query('[data-open]')[0].click();
    ok('and it closes again', !openBlock());

    // Expand all / collapse all, offered only when a row can open.
    ok('Expand all is offered, and counts only the rows that can open',
        /▾ Expand all \(1\)/.test(html()));
    r.query('[data-bulk]').find(e => e.dataset.bulk === 'expand').click();
    ok('…and it opens them', openBlock());
    r.query('[data-bulk]').find(e => e.dataset.bulk === 'collapse').click();
    ok('…and Collapse all closes them', !openBlock());
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

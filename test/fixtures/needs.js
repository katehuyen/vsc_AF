/**
 * U-118 — the "Needs You" queue, built from the REAL queue builder.
 *
 * ‼️ THE ROWS COME OUT OF `buildNeedsQueue`, not out of a hand-written list.
 * The whole claim of this change is that the page can finally show what the
 * agent said, and the thing that was throwing it away was the BUILDER (it read
 * `lastPrompt`, ninety characters cut for a card, and never `lastPromptFull`).
 * A fixture that invented its own rows would photograph the page passing a test
 * the product still fails.
 *
 * One row of each thing the reading standard has to get right:
 *   · a permission wait whose prompt is far longer than a row — the reported
 *     case, and the one that produced the incident this item names;
 *   · a stalled session, where the row says the TOOL and the prompt behind it
 *     is what the reader is missing;
 *   · a mission question with real line breaks, so the body is not merely
 *     "longer" but shaped;
 *   · a browser approval and an interrupted run, whose details already fit a
 *     line — they must get NO caret, because a triangle that opens onto the
 *     sentence already on the row is what teaches people to stop opening rows.
 */
const path = require('path');
const N = require(path.join(__dirname, '..', '..', 'out', 'core', 'needs.js'));

const T = Date.parse('2026-08-28T07:20:00Z');

/** The prompt that started the incident — long, and the row can hold 90 of it. */
const LONG_PROMPT = [
    'A-20 adım 3: ayarları bildir, çözünürlük zincirini gerçekten çalıştır ve',
    'varsayılanı kapalı tut. agentFarm.alerts.on beş olayın hepsinde kapalı',
    'gelecek; ama bu bir KAPI olamaz, çünkü aylardır turn-ready sesi çalan her',
    'kurulum yükseltmede susardı. İki yetkili var ve toplanıyorlar.',
    '',
    'Sonra sayfaya bak: koyu ve açık, ikisine de.'
].join('\n');

const input = () => ({
    liveSessions: [
        {
            sessionId: 'c54e5147-553d-4e5e-b1c3-5994591c9bca',
            agentName: 'developer',
            status: 'waiting-permission',
            lastPrompt: LONG_PROMPT.replace(/\s*\n+\s*/g, ' ').slice(0, 89) + '…',
            lastPromptFull: LONG_PROMPT,
            lastEventTs: T,
            transcriptPath: 'D:\\t\\c54e5147.jsonl'
        },
        {
            sessionId: '9f2a1b77-0000-4d21-9a30-71b8c4e0aa12',
            agentName: 'asistan',
            status: 'stalled',
            lastPrompt: 'gelen kutusunu boşalt ve bugünün günlüğüne bir satır yaz, sonra bana kısa…',
            lastPromptFull: 'gelen kutusunu boşalt ve bugünün günlüğüne bir satır yaz, sonra bana kısaca'
                + ' ne bulduğunu söyle — uzun bir rapor istemiyorum, üç cümle yeter.',
            currentTool: 'Bash',
            lastEventTs: T - 14 * 60000,
            transcriptPath: 'D:\\t\\9f2a1b77.jsonl'
        }
    ],
    approvals: [{
        id: 'ap-1',
        title: 'chrome web store listing',
        url: 'https://chrome.google.com/webstore/devconsole',
        goal: 'read the review status',
        createdAt: T - 3 * 60000,
        kind: 'browser'
    }],
    insights: [],
    interruptedRuns: [{
        runId: 'run-9',
        workflowTitle: 'nightly wiki compile',
        stepIndex: 2,
        stepTitle: 'tag the harvest'
    }],
    missionWaits: [{
        runId: 'mr-4',
        missionTitle: 'ZEN 2.4 çıkışı',
        flavor: 'question',
        detail: [
            'Sürüm notunda hangi başlık altında duyuralım?',
            '',
            '1. "Dikte artık arka planda çalışıyor"',
            '2. "Arka plan dikte" (kısa)',
            '',
            'İkisi de doğru; birincisi mağaza aramasında daha iyi, ikincisi kutuya sığıyor.'
        ].join('\n'),
        ts: T - 40 * 60000
    }]
});

const data = () => {
    const items = N.buildNeedsQueue(input()).map(item => ({
        ...item, key: N.needKey(item), clearable: N.isClearable(item)
    }));
    return { items, hidden: 0, generatedAt: T };
};

/** Open every row that has something behind its caret — using the page's OWN
 *  handler, so the picture is of the accordion and not of a class somebody
 *  guessed the name of. */
const expandAll = (r) => {
    const btn = r.query('[data-bulk]').find(e => e.dataset.bulk === 'expand');
    if (!btn) { throw new Error('no Expand all button — no row has a body'); }
    btn.click();
};

module.exports = {
    script: 'needs.js',
    data,
    variants: () => [
        { id: 'needs', label: 'Needs You — a row is a line, and the whole text is one click away (U-118)', data: data() },
        {
            // ‼️ The accordion IS the change, and a shut one photographs nothing.
            id: 'needs-open',
            label: 'Needs You — the rows opened: the whole text, selectable',
            data: data(),
            act: expandAll
        }
    ]
};

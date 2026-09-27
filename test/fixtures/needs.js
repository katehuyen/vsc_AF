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

/** M-46 — one supervisor question alone: the arity the user really gets. */
const QUESTION = {
    id: 'wq-1', runId: 'run-12', workflowTitle: 'ZEN release train', askedAt: T - 2 * 60000,
    question: 'The store review came back with one warning about host permissions.\nShip now with the warning, or hold the release for a fix?',
    options: ['Ship now', 'Hold for a fix', 'Ship, and open an issue for the warning']
};
const FREE_QUESTION = {
    id: 'wq-2', runId: 'run-13', workflowTitle: 'nightly wiki compile', askedAt: T - 60000,
    question: 'Which folder should the harvest go to tonight?', options: []
};

/** K-45 — one Console question with one listed word: the clock will not answer it, and the row says why. */
const consoleAsks = () => {
    const A = require('../../out/core/autoAnswer.js');
    const CN = require('../../out/core/consoleNeeds.js');
    const ask = {
        requestId: 'ask-7', interactive: true, ts: T - 7 * 60000, detail: '',
        questions: [{
            question: 'Eski release dalını silelim mi?', header: 'Dal',
            options: [{ label: 'Evet, sil (Recommended)' }, { label: 'Hayır, kalsın' }]
        }]
    };
    const s = A.autoAnswerSettings({ timeoutSeconds: 300 });
    return CN.consoleNeedAsks([{ id: 'cs2', agentName: 'developer', pendingAsk: ask }], () => A.autoAnswerView(ask, s));
};

const data = (inp = input()) => {
    const items = N.buildNeedsQueue(inp).map(item => ({
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
        },
        {
            id: 'needs-question',
            label: 'Needs You — a workflow supervisor asks, one question with its options (M-46)',
            data: data({ liveSessions: [], approvals: [], insights: [], workflowQuestions: [QUESTION] })
        },
        {
            id: 'needs-question-free',
            label: 'Needs You — a supervisor question with no options: a free answer (M-46)',
            data: data({ liveSessions: [], approvals: [], insights: [], workflowQuestions: [FREE_QUESTION] })
        },
        {
            id: 'needs-console-question',
            label: 'Needs You — a Console question no timer will answer, and the word and filter that stopped it (K-45)',
            data: data({ liveSessions: [], approvals: [], insights: [], consoleAsks: consoleAsks() }),
            act: expandAll
        },
        {
            id: 'needs-publish-overdue',
            label: 'Needs You — two overdue publishes: one with the workflow step that sends it, one that no step names (M-61)',
            data: data({
                liveSessions: [], approvals: [], insights: [], overduePublishes: [
                    { entry: { file: 'C:\\vault\\CONTENT\\2026-09-25 youtube - Kahve 3 hata.md', name: '2026-09-25 youtube - Kahve 3 hata', title: 'Kahve: 3 hata', date: '2026-09-25', startTime: '18:00', platform: 'youtube', status: 'ready' },
                        lateMs: 2 * 86_400_000, step: { workflowId: 'w14', workflowTitle: 'Haftalık yayın', stepIndex: 3 } },
                    { entry: { file: 'C:\\vault\\CONTENT\\2026-09-27 instagram - Latte sanati.md', name: '2026-09-27 instagram - Latte sanati', title: 'Latte sanatı', date: '2026-09-27', startTime: '09:30', platform: 'instagram', status: 'planned' },
                        lateMs: 5 * 3_600_000 }
                ]
            })
        }
    ]
};

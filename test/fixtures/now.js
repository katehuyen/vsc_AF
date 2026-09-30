/**
 * U-177 — the "Now" page, built from the REAL snapshot builder (`buildNow`)
 * over the REAL Needs queue, with the arity an evening at the farm has: two
 * things waiting, three sessions of which one is held by a question, two
 * accounts' five-hour windows (one nearly full) and a run of Turkish notices.
 */
const path = require('path');
const N = require(path.join(__dirname, '..', '..', 'out', 'core', 'needs.js'));
const P = require(path.join(__dirname, '..', '..', 'out', 'core', 'nowPage.js'));

// The page says times relative to the clock it runs under, so the fixture is anchored to it too.
const T = Date.now();

const input = () => ({
    needs: N.buildNeedsQueue({
        liveSessions: [{
            sessionId: 'c54e5147-553d-4e5e-b1c3-5994591c9bca', agentName: 'developer', status: 'waiting-permission',
            lastPrompt: 'Bash: node test/run-all.js — tam paket, yaklaşık yirmi dakika', lastEventTs: T - 2 * 60000
        }],
        approvals: [{
            id: 'ap-1', title: 'chrome web store listing', url: 'https://chrome.google.com/webstore/devconsole',
            goal: 'inceleme durumunu oku', createdAt: T - 9 * 60000, kind: 'browser'
        }],
        insights: []
    }),
    sessions: [
        { id: 'con_1', agentName: 'developer', engine: 'claude', status: 'working', startedAt: T - 95 * 60000, turnStartedAt: T - 4 * 60000,
            lastTs: T, costUSD: 3.41, messages: [{ role: 'agent', text: 'Şimdi sayfasının fixture\'ını yazıyorum; ardından masaüstü ve 360×800 çekimleri.' }] },
        { id: 'con_2', agentName: 'psikolog', engine: 'claude', status: 'idle', startedAt: T - 40 * 60000, lastTs: T - 60000,
            costUSD: 0.62, pendingAsk: { requestId: 'a1' }, messages: [{ role: 'agent', text: 'Bugünkü günlüğe hangi başlıkla ekleyelim?' }] },
        { id: 'con_3', agentName: 'asistan', engine: 'codex', status: 'idle', startedAt: T - 180 * 60000, lastTs: T - 30 * 60000,
            costUSD: 0, messages: [{ role: 'tool', tool: { name: 'Read', detail: '01_INBOX/10_TODO/__TODO__.md' } }] }
    ],
    todayCost: 18.73,
    quotas: [
        { account: 'aicozums', engine: 'claude', percent: 91, resetsAt: T + 50 * 60000 },
        { account: 'rotam', engine: 'claude', percent: 34, resetsAt: T + 3 * 3600000 }
    ],
    notices: [
        { id: 'n1', ts: T - 5 * 60000, agentName: 'developer', type: 'update', level: 2, title: 'Gece kararı: X-445 — başka yerde cevaplanan soru her telefondan kalkar' },
        { id: 'n2', ts: T - 50 * 60000, agentName: 'developer', type: 'update', level: 2, title: 'Gece kararı: X-443 — sayfa bağlantıları kabukta açılır', read: true },
        { id: 'n3', ts: T - 3 * 3600000, agentName: 'asistan', type: 'result', level: 1, title: 'Günlük özet hazır', read: true }
    ],
    now: T
});

const data = (o = {}) => P.buildNow({ ...input(), ...o });

module.exports = {
    script: 'now.js',
    data,
    variants: () => [
        { id: 'now', label: 'Now — what waits, what runs, today, notices, and the box (U-177)', data: data() },
        { id: 'now-empty', label: 'Now — a quiet farm: nothing waits, nothing runs', data: data({ needs: [], sessions: [], notices: [], quotas: [], todayCost: 0 }) }
    ]
};

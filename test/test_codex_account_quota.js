// X-215 — CODEX'S OWN QUOTA, ON ITS OWN ACCOUNT CARDS.
//
// The user found this by comparing two surfaces of one product: the status bar
// and the Dashboard have drawn "week 72%" for Codex since U-27, and the account
// cards on the Engines page were blank. The card was not missing a feature — it
// was being told, in a stamped sentence, that there was nothing to read:
//
//   quotaSource: () => ({ kind: 'none', reason: 'Codex keeps no readable quota
//                         figure on disk' })
//
// That sentence was false. `engineUsage.readCodexLimits` has been reading
// `rate_limits.primary` out of the tail of the newest rollout the whole time.
//
// ‼️ THE ONE RULE THIS FILE EXISTS TO PIN. A figure read off THIS MACHINE'S OWN
// DISK must not be metered by the budget that exists to be polite to Anthropic's
// endpoint. The shared floor, the round robin and the 429 backoff in
// `AccountUsageService` are there because asking how much quota is left must not
// become the thing that spends it — none of which is true of a file read. A
// Codex card held behind that budget would be a number nobody is waiting on,
// waiting on a queue it does not belong in.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const {
    AccountUsageService, slotSessionDir, unreadUsage, usageFromEngine, slotIsUsable
} = require(path.join(ROOT, 'out/core/accountUsage.js'));
const { adapterFor } = require(path.join(ROOT, 'out/core/engineAccounts.js'));
const { readCodexUsage, windowTitle } = require(path.join(ROOT, 'out/core/engineUsage.js'));

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const NOW = Date.UTC(2026, 8, 6, 12, 0, 0);
const WEEK = 60 * 24 * 7;

/** One rollout line, exactly the shape Codex writes it. */
const rollout = (used, windowMinutes, resetsAtSec, plan) => JSON.stringify({
    type: 'event_msg',
    payload: {
        type: 'token_count',
        rate_limits: {
            plan_type: plan,
            primary: { used_percent: used, window_minutes: windowMinutes, resets_at: resetsAtSec }
        }
    }
});

// ===========================================================================
// 1) THE ADAPTER NO LONGER SAYS "NOTHING TO READ"
// ===========================================================================
{
    const src = adapterFor('codex').quotaSource();
    ok('‼️ X-215 — Codex publishes a quota source, and it is its own transcripts',
        src.kind === 'session-tail');
    ok('…named as a directory INSIDE the slot, because that is what makes it '
        + 'per-account rather than per-machine',
        typeof src.dir === 'string' && src.dir === 'sessions');
    ok('Claude is untouched — it still reads an OAuth credentials file',
        adapterFor('claude').quotaSource().kind === 'oauth-credentials');
    ok('an engine that genuinely publishes nothing still says so, with its reason',
        adapterFor('gemini').quotaSource().kind === 'none'
        && typeof adapterFor('gemini').quotaSource().reason === 'string');

    const slot = { id: 'cx1', engine: 'codex', dir: 'D:\\accounts\\codex-work' };
    ok('‼️ the directory read is the SLOT\'S OWN, never the machine\'s ~/.codex',
        slotSessionDir(slot) === path.join(slot.dir, 'sessions'));
    ok('…and an engine with no such source has no directory to read',
        slotSessionDir({ id: 'c1', engine: 'claude', dir: 'D:\\a' }) === '');

    const u = unreadUsage(slot);
    ok('‼️ a Codex slot is no longer reported as "this engine publishes nothing"',
        u.state !== 'no-source');
    ok('…it is simply not read yet, which is a different silence', u.percent === -1);
}

// ===========================================================================
// 2) THE READER TAKES A DIRECTORY — one parser, two roots
// ===========================================================================
{
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-cxq-'));
    const dir = path.join(tmp, 'sessions', '2026', '09', '06');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'rollout-abc.jsonl');
    fs.writeFileSync(file, rollout(72, WEEK, Math.floor(NOW / 1000) + 3600, 'plus') + '\n', 'utf8');

    const probe = {
        newestFiles: (relDir) => (relDir === path.join(tmp, 'sessions') ? [file] : []),
        readTail: (abs) => fs.readFileSync(abs, 'utf8')
    };
    const eu = readCodexUsage(probe, () => NOW - 60_000, path.join(tmp, 'sessions'));
    ok('‼️ X-215 — the same parser reads a SLOT\'S sessions folder, given the folder',
        eu.state === 'ok' && eu.bars.length === 1 && eu.bars[0].percent === 72);
    ok('…and the window is named from the minutes, not invented',
        eu.bars[0].title === windowTitle(WEEK) && eu.bars[0].title === 'Current week');
    ok('…with the plan it read', eu.plan === 'plus');
    ok('‼️ …and the figure is stamped with the TURN that produced it, not with now',
        eu.fetchedAt === NOW - 60_000);
    ok('the default root is still the machine\'s own, so nothing that called it '
        + 'before this changes',
        readCodexUsage({ newestFiles: (d) => (d === '.codex/sessions' ? [file] : []), readTail: () => fs.readFileSync(file, 'utf8') },
            () => NOW).state === 'ok');

    // ---- the conversion the card reads ----
    const slot = { id: 'cx1', engine: 'codex' };
    const su = usageFromEngine(slot, eu);
    ok('‼️ the card gets the engine\'s PRIMARY window as its figure — for Codex '
        + 'that is the week, and a card that said "five-hour" would be lying',
        su.percent === 72 && su.window === 'Current week');
    ok('…the reset travels with it', su.resetsAt === eu.bars[0].resetsAt);
    ok('…and so does the honest note about how old it is',
        su.state === 'ok' && /transcript/.test(su.note || ''));
    ok('an engine reading that failed is an ERROR, not a zero — the two are what '
        + 'this whole distinction exists for',
        usageFromEngine(slot, { id: 'codex', label: 'Codex', state: 'unknown', bars: [], plan: '', fetchedAt: 0, note: 'nothing yet' })
            .percent === -1);
    ok('…and a read that really said 0% is a measured zero',
        usageFromEngine(slot, { ...eu, bars: [{ ...eu.bars[0], percent: 0 }] }).percent === 0);
    ok('a measured zero is usable and an unread slot is usable — but only the '
        + 'first is a fact (mostRoom leans on exactly this)',
        slotIsUsable(usageFromEngine(slot, { ...eu, bars: [{ ...eu.bars[0], percent: 0 }] })));

    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temp */ }
}

// ===========================================================================
// 3) THE CARD SAYS WHICH WINDOW IT DREW
//
// The block is titled "five-hour window" in the markup. That is right for every
// Claude row and wrong for the row this item exists for: Codex's own window is
// the week, and a card printing 72% under those words is a lie with a real
// number in it.
// ===========================================================================
{
    const page = fs.readFileSync(path.join(ROOT, 'media', 'engines.js'), 'utf8');
    ok('‼️ X-215 — the card names the window the figure belongs to',
        /const winName = a\.window/.test(page));
    ok('…and it appears in exactly ONE place — the fallback for a row whose '
        + 'engine named no window, which is every row written before this',
        (page.match(/five-hour window/g) || []).length === 1);
    ok('…the panel heading is that same name rather than a second constant',
        /winName\.charAt\(0\)/.test(page));
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('…and the host sends it, or the page has nothing to name it with',
        /window: u\?\.window/.test(ext));
    const panel = fs.readFileSync(path.join(ROOT, 'src', 'panels', 'enginesPanel.ts'), 'utf8');
    ok('…and the contract between them says so', /window: string/.test(panel));

    /*
     * ‼️ AND THE ⟳ BUTTON STOPS PROMISING A REQUEST IT WILL NOT MAKE. Its
     * panel says "one request, for this account alone — accounts are read one at
     * a time and never less than five seconds apart". On a card whose figure is
     * a file on this disk that is three false claims in one sentence, and it is
     * the same kind of wrong sentence that kept these cards blank for months.
     */
    ok('‼️ X-215 — the card knows WHERE its figure comes from',
        /quotaSource: string/.test(panel) && /quotaSource: slotQuotaSource/.test(ext));
    ok('…and the refresh button says the truth about what pressing it does',
        /a\.quotaSource === 'session-tail'/.test(page));
    ok('…while an engine that publishes nothing still has no button at all',
        /a\.quotaSource === 'none'/.test(page));

    /*
     * ‼️ AND "⟳ ALL" DOES NOT PUT A FILE READ IN A LINE. The queue exists to
     * space out REQUESTS — one every five seconds, so asking how much is left
     * never becomes what spends it. A disk-backed card waiting its turn behind
     * two Claude accounts would be a card waiting for nothing, wearing a number
     * that says it is number three in a line it is not in.
     */
    ok('‼️ X-215 — a disk-backed account is read at once and never queued',
        /slotSessionDir/.test(ext) && /onDisk/.test(ext));
    ok('…and the group button stops promising N requests for a group that '
        + 'makes none',
        /readable\[0\]\.quotaSource === 'session-tail'/.test(page));
}

// ===========================================================================
// 4) ‼️ THE DISK IS NOT THE ENDPOINT — the budget rule
// ===========================================================================
{
    const codex = { id: 'cx1', engine: 'codex', dir: 'D:\\acc\\cx1' };
    const claude = { id: 'c1', engine: 'claude', dir: 'D:\\acc\\c1' };
    let fetches = 0;
    let tails = 0;
    let now = NOW;
    const eu = {
        id: 'codex', label: 'Codex', state: 'ok', plan: 'plus', fetchedAt: NOW - 60_000,
        bars: [{ id: 'codex_primary', title: 'Current week', percent: 41, resetsAt: NOW + 86_400_000 }],
        note: 'Read from Codex\'s own transcript.'
    };
    const svc = new AccountUsageService({
        slots: () => [codex, claude],
        ttlMs: () => 60_000,
        now: () => now,
        readCreds: () => undefined,
        fetchImpl: () => { fetches++; return Promise.resolve({ status: 200, body: '{}' }); },
        readSessionTail: (slot, dir) => {
            tails++;
            return slot.id === 'cx1' && dir === path.join(codex.dir, 'sessions') ? eu : undefined;
        }
    });

    return svc.beat().then(() => {
        const cx = svc.current().find(u => u.slotId === 'cx1');
        ok('‼️ X-215 — the Codex card has its figure after one beat', !!cx && cx.percent === 41);
        ok('…read off the disk', tails === 1);
        ok('‼️ …and it did not cost a request to the endpoint that has nothing to '
            + 'do with it', fetches === 0);

        // The shared floor is five seconds. A second beat inside it must not stop
        // a disk read — the floor protects an endpoint this read never touches.
        now = NOW + 1000;
        eu.bars[0].percent = 44;
        eu.fetchedAt = now;
        return svc.beat();
    }).then(() => {
        const cx = svc.current().find(u => u.slotId === 'cx1');
        ok('‼️ …and the shared five-second floor does not hold a file read back — '
            + 'a number nobody is waiting on must not wait in a queue it is not in',
            !!cx && cx.percent === 44);

        // A Codex slot must not take a turn in the ROUND ROBIN either: the robin
        // hands out the one request per interval, and a slot that needs no
        // request taking a turn would starve the ones that do.
        now = NOW + 60_000;
        const before = tails;
        return svc.refreshSlot('cx1').then(() => {
            ok('‼️ …and pressing ⟳ on a Codex card reads its file rather than the '
                + 'endpoint — no request, and no place in the line',
                fetches === 0 && tails > before);
        });
    }).then(() => {
        console.log(`${pass} passed, ${fail} failed`);
        process.exit(fail ? 1 : 0);
    });
}

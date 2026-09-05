// X-175 — `sentry.*` ON THE BRIDGE, dispatched rather than described.
//
// The handlers in extension.ts need vscode to reach the setting and fs to read
// the file, so what is measured here is the CONTRACT they are built out of: the
// same registry, the same arg helpers, the same pure cores, and the promises an
// agent calling these ops is entitled to —
//
//   · ‼️ A FACT THE CALLER DID NOT SEND IS UNMEASURED, never measured-and-empty.
//     That distinction is the whole of X-174: an op that turns "you told me
//     nothing" into "the folder was empty" manufactures a verdict out of its own
//     defaults, and the next session is started on it.
//   · ‼️ NOTHING IS CALLED AND NOTHING IS WRITTEN. These ops reason over facts
//     they are handed. They report whether a cheap turn is WORTH making; the
//     turn itself belongs to the runner (X-176), so asking twice costs nothing
//     and answers the same.
//   · the built-ins work with nothing configured — no file, no vault, no folder
//     of anybody's anywhere — and a file REPLACES only the verdicts it answers.
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const OUT = path.join(__dirname, '..', 'out', 'core');
const { BridgeRegistry, argStr, optNum, optStr } = require(path.join(OUT, 'bridge.js'));
const { diagnoseSession } = require(path.join(OUT, 'sessionDiagnosis.js'));
const { resolveSentryTemplates, buildNextPrompt, SENTRY_VERDICTS } = require(path.join(OUT, 'sentryPrompt.js'));
const {
    DEFAULT_HANDOVER_THRESHOLD, HANDOVER_SOURCES, discoverHandover
} = require(path.join(OUT, 'handoverDiscovery.js'));
const {
    DEFAULT_LEADER_CAPS, leaderAllowed, buildLeaderBrief
} = require(path.join(OUT, 'sentryLeader.js'));
const {
    newSentry, refuseSentry, stopSentry, pauseSentry, resumeSentry, sentryRunning
} = require(path.join(OUT, 'sentryCampaign.js'));

const NOW = Date.UTC(2026, 8, 4, 12, 0, 0);

const SID = '878ae65b-f73a-485b-ae05-df47cbbe6d1d';
const FILE = 'D:/anywhere/nobet-sablonlari.md';
const FILE_BODY = [
    '## item-done', '', '```benimki', 'BITTI: {closed}. Sirada {nextCode} var.', '```', '',
    '## kofte', '', '```x', 'never fires', '```'
].join('\n');

/** The ops, wired to an in-memory disk — the same shapes extension.ts uses. */
function registry(disk) {
    const reg = new BridgeRegistry();
    const files = disk || {};
    const setting = files.__setting || '';
    const exists = (p) => Object.prototype.hasOwnProperty.call(files, p);
    const read = (p) => String(files[p] || '');
    /** ‼️ undefined means NOBODY MEASURED IT. '' and [] are measurements. */
    const listed = (v) => (Array.isArray(v) ? v : undefined);
    const said = (v) => (typeof v === 'string' ? v : undefined);
    const counted = (v) => {
        if (v === undefined || v === null || v === '') { return undefined; }
        const n = Number(v);
        return Number.isFinite(n) ? n : undefined;
    };
    const set = (a) => resolveSentryTemplates(optStr(a, 'file') || setting, exists, read);

    reg.register([
        {
            op: 'sentry.templates',
            describe: 'Which words the next session would be started with, and where they come '
                + 'from. args: file? (read this one instead of the configured one)',
            handler: (a) => {
                const s = set(a);
                return {
                    file: s.file, source: s.source, missing: s.missing,
                    refusals: s.refusals, covers: s.covers, verdicts: SENTRY_VERDICTS,
                    templates: s.templates.map(t => ({ when: t.when, id: t.id, source: t.source, text: t.text }))
                };
            }
        },
        {
            op: 'sentry.leader',
            describe: 'What the sentry LEADER would be asked, and whether it may be woken at all. '
                + 'Read-only and FREE: it renders the brief and reads the ledger, and it never runs a '
                + 'turn. args: campaign?, session?',
            handler: (a) => {
                const rec = files.__campaign;
                if (!rec) { throw new Error('there is no campaign to report on'); }
                const caps = Object.assign({}, DEFAULT_LEADER_CAPS, files.__caps || {});
                const allow = leaderAllowed(rec.leader, caps, '2026-09-04');
                return {
                    allowed: allow.allowed, why: allow.why, remainingUsd: allow.remainingUsd,
                    spentUsd: (rec.leader && rec.leader.spentUsd) || 0,
                    turns: (rec.leader && rec.leader.turns) || 0,
                    failStreak: (rec.leader && rec.leader.failStreak) || 0,
                    caps,
                    log: (rec.leader && rec.leader.log) || [],
                    brief: files.__brief ? buildLeaderBrief(files.__brief) : ''
                };
            }
        },
        {
            op: 'sentry.handover',
            describe: 'Where a session handover note is, and how it was decided. Looks in every '
                + 'source in order and scores every candidate. args: session, project?, threshold?',
            handler: (a) => {
                const sid = argStr(a, 'session');
                const listings = listed(files.__listings) || [];
                const d = discoverHandover(listings, {
                    sessionId: sid, today: '2026-09-04', now: NOW,
                    threshold: optNum(a, 'threshold', DEFAULT_HANDOVER_THRESHOLD)
                });
                return {
                    session: sid, measured: d.measured, why: d.why,
                    found: d.hit || null,
                    considered: d.considered.map(c => ({
                        file: c.file, source: c.source, score: c.score, parts: c.parts,
                        ...(c.path ? { path: c.path } : {})
                    })),
                    unknown: d.unknown, evidence: d.evidence,
                    looked: listings.map(l => ({
                        source: l.source, ...(l.dir ? { dir: l.dir } : {}),
                        ...(l.files ? { files: l.files.length } : { skipped: l.skipped || 'not listed' })
                    })),
                    order: HANDOVER_SOURCES
                };
            }
        },
        {
            op: 'sentry.prompt',
            describe: 'The sentence the next session opens on, from facts you measured. '
                + 'args: session, answerFiles?, repos?, codes?, progress?, output?, quotaPercent?, '
                + 'policy?, next?, handoverPath?, project?, assist?, file?',
            handler: (a) => {
                const sessionId = argStr(a, 'session');
                const repos = listed(a.repos);
                const diagnosis = diagnoseSession({
                    sessionId,
                    answerFiles: listed(a.answerFiles),
                    repos,
                    codes: listed(a.codes),
                    progress: a.progress || undefined,
                    output: said(a.output),
                    quotaPercent: counted(a.quotaPercent)
                }, a.policy || undefined);
                const s = set(a);
                const built = buildNextPrompt({
                    diagnosis,
                    next: a.next || undefined,
                    handoverPath: optStr(a, 'handoverPath'),
                    project: optStr(a, 'project'),
                    repos: (repos || []).map(r => String((r && r.path) || '')),
                    assist: a.assist || undefined
                }, s.templates);
                return Object.assign({ diagnosis }, built, {
                    templates: { file: s.file, source: s.source, missing: s.missing, refusals: s.refusals }
                });
            }
        }
    ]);
    return reg;
}

(async () => {
    // ---------- the catalog, which is how an agent finds these at all ----------
    {
        const cat = registry().catalog();
        const ops = cat.map(c => c.op);
        ok('both sentry ops are in farm.ops',
            ['sentry.templates', 'sentry.prompt'].every(o => ops.includes(o)));
        ok('...and each says what it does and what it takes',
            cat.filter(c => c.op.indexOf('sentry.') === 0)
                .every(c => c.describe.length > 20 && /args:/.test(c.describe)));
    }

    // ---------- it answers with NOTHING configured ----------
    {
        const r = await registry().dispatch('sentry.templates', {});
        ok('with no file named the built-ins are what is in force',
            r.ok && r.result.source === 'none' && r.result.file === '' && r.result.missing === '');
        ok('...and every verdict has words',
            SENTRY_VERDICTS.filter(v => v !== '*')
                .every(v => r.result.templates.some(t => t.when === v)));
        ok('...none of which is a path to anybody folders',
            r.result.templates.every(t => !/[A-Za-z]:[\\/]|obsidian|Users/i.test(t.text)));
    }

    // ---------- a session id is REQUIRED, and refused by name ----------
    {
        const r = await registry().dispatch('sentry.prompt', {});
        ok('a prompt with no session is refused, by the name of what is missing',
            !r.ok && /session/i.test(r.error));
    }

    // ---------- ‼️ what nobody measured is not a measurement ----------
    {
        const bare = await registry().dispatch('sentry.prompt', { session: SID });
        ok('a caller who sent only a session leaves the facts UNKNOWN',
            bare.ok && bare.result.diagnosis.unknown.length > 0);
        ok('...so the op says a cheap turn is worth making, and names what to ask',
            bare.result.assist.needed === true
            && bare.result.assist.questions.length === bare.result.diagnosis.unknown.length);
        ok('...and it still produces a prompt rather than refusing',
            typeof bare.result.prompt === 'string' && bare.result.prompt.length > 40);

        const told = await registry().dispatch('sentry.prompt', {
            session: SID, answerFiles: [], repos: [{ path: 'D:/repo', dirty: 0 }],
            codes: [{ code: 'X-175', closed: true }], output: '',
            progress: { assistantSteps: 40, toolCalls: 120 }
        });
        ok('a caller who measured everything gets a verdict with nothing left to ask',
            told.ok && told.result.diagnosis.unknown.length === 0
            && told.result.assist.needed === false);
        ok('...and an empty folder REALLY is evidence, not a shrug',
            told.result.diagnosis.evidence.length > 0);
    }

    // ---------- the words match the verdict, and the facts reach them ----------
    {
        const r = await registry().dispatch('sentry.prompt', {
            session: SID, answerFiles: [], output: '',
            repos: [{ path: 'D:/zone/dev/git/miropharm/vsc_AgentFarm', dirty: 0 }],
            codes: [{ code: 'X-175', closed: true }],
            progress: { assistantSteps: 40, toolCalls: 120 },
            next: { code: 'X-176', text: 'KAMPANYA KOSUCUSU', effort: 'L' },
            project: 'PRS.MuratVural_DEV_VSC.AgentFarm'
        });
        ok('the template picked is the one for the verdict reached',
            r.result.when === r.result.diagnosis.outcome || r.result.when === '*');
        ok('the next item reaches the words the session opens on',
            /X-176/.test(r.result.prompt) && /KAMPANYA KOSUCUSU/.test(r.result.prompt));
        ok('nothing is left as a placeholder', r.result.unfilled.length === 0);
        ok('‼️ the repositories are ONE argument, counted for the verdict and named in the words',
            r.result.vars.repos === 'D:/zone/dev/git/miropharm/vsc_AgentFarm');
    }

    // ---------- asking twice costs nothing and answers the same ----------
    {
        const args = { session: SID, answerFiles: [], repos: [], codes: [], output: '' };
        const a = await registry().dispatch('sentry.prompt', args);
        const b = await registry().dispatch('sentry.prompt', args);
        ok('the op is pure — the same facts answer the same, twice',
            a.result.prompt === b.result.prompt && a.result.templateId === b.result.templateId);
    }

    // ---------- a file replaces the words, and says what it could not ----------
    {
        const disk = { __setting: FILE };
        disk[FILE] = FILE_BODY;
        const t = await registry(disk).dispatch('sentry.templates', {});
        ok('a named file that is on disk is what is in force',
            t.result.source === 'setting' && t.result.file === FILE);
        ok('...and it is named as answering exactly the verdict it answered',
            t.result.covers.join() === 'item-done');
        ok('...while a heading naming no verdict is refused BY NAME',
            t.result.refusals.some(x => /kofte/.test(x)));

        const r = await registry(disk).dispatch('sentry.prompt', {
            session: SID, answerFiles: [], output: '',
            repos: [{ path: 'D:/repo', dirty: 0 }],
            codes: [{ code: 'X-175', closed: true }],
            progress: { assistantSteps: 40, toolCalls: 120 },
            next: { code: 'X-176', text: 'KOSUCU', effort: 'L' }
        });
        ok('the own words of the user are the ones the next session opens on',
            r.result.source === 'file' && /^BITTI:/.test(r.result.prompt));

        const missing = { __setting: FILE };
        const m = await registry(missing).dispatch('sentry.templates', {});
        ok('a named file that has gone is reported and the built-ins carry on',
            m.result.missing === FILE && m.result.source === 'none'
            && m.result.templates.every(x => x.source === 'built-in'));
    }

    // ---------- what the cheap turn cost travels with the prompt ----------
    {
        const r = await registry().dispatch('sentry.prompt', {
            session: SID,
            assist: { model: 'claude-haiku-4-5-20251001', ms: 2400, costUsd: 0.0031, at: 1, ok: true }
        });
        ok('the record of the call reaches the words, price and all',
            /claude-haiku-4-5-20251001 · 2\.4s · \$0\.0031/.test(r.result.prompt));
        ok('...and with no call it says so plainly rather than as a zero',
            /no model was called/.test(
                (await registry().dispatch('sentry.prompt', { session: SID })).result.prompt));
    }

    // ================= X-176 - THE CAMPAIGN'S OWN THREE OPS =================
    //
    // `sentry.start` / `.stop` / `.status` need the store and the fleet, so what
    // is measured here is the CONTRACT they are built out of: the same pure
    // cores (`refuseSentry`, `newSentry`, `stopSentry`, `sentryRunning`), the
    // same refusals by name, and the promises an agent calling them is entitled
    // to -
    //
    //   . ‼️ ONE CAMPAIGN AT A TIME, refused by name and naming the project the
    //     live one is on, because the runner is sequential.
    //   . ‼️ "IS A ROUND RUNNING" IS DERIVED FROM THE ROWS on every ask. A
    //     stored flag is how a campaign comes to believe it is still running a
    //     round that died with the window, and then never opens another.
    //   . ‼️ NO ENGINE MEANS NO ACCOUNT ROTATION, and the op SAYS SO. Choosing
    //     an account would mean assuming an engine, which this item forbids by
    //     name - so the answer carries `rotatesAccounts` rather than leaving the
    //     user to wonder why nothing rotates.
    {
        const campaignOps = () => {
            const reg = new BridgeRegistry();
            const store = { sentry: undefined, tasks: [] };
            reg.register([
                {
                    op: 'sentry.start',
                    describe: 'Switch a sentry campaign on. args: project, agent, prompt, engine?, '
                        + 'model?, permissionMode?, failLimit?',
                    handler: (a) => {
                        const ask = {
                            project: optStr(a, 'project'), agent: optStr(a, 'agent'),
                            opening: optStr(a, 'prompt'),
                            ...(optStr(a, 'engine') ? { engine: optStr(a, 'engine') } : {}),
                            failLimit: a.failLimit
                        };
                        const refusal = refuseSentry(store.sentry, ask);
                        if (refusal) { throw new Error(refusal); }
                        store.sentry = newSentry(ask, NOW);
                        return {
                            campaign: store.sentry,
                            running: sentryRunning(store.tasks, store.sentry.id),
                            rotatesAccounts: !!store.sentry.engine
                        };
                    }
                },
                {
                    op: 'sentry.stop',
                    describe: 'Switch the sentry campaign off. args: why?',
                    handler: (a) => {
                        if (!store.sentry) { throw new Error('no sentry campaign has ever been started here'); }
                        if (store.sentry.status !== 'stopped') {
                            stopSentry(store.sentry, NOW + 1000);
                            if (optStr(a, 'why')) { store.sentry.stoppedWhy = optStr(a, 'why'); }
                        }
                        return {
                            campaign: store.sentry,
                            roundStillRunning: sentryRunning(store.tasks, store.sentry.id)
                        };
                    }
                },
                {
                    op: 'sentry.pause',
                    describe: 'Hold the campaign: it opens no more rounds until you resume it. args: none',
                    handler: () => {
                        if (!store.sentry) { throw new Error('no sentry campaign has ever been started here'); }
                        if (store.sentry.status !== 'running') {
                            throw new Error(`the campaign is ${store.sentry.status}, so there is nothing to pause`);
                        }
                        pauseSentry(store.sentry, NOW + 1000);
                        return {
                            campaign: store.sentry,
                            roundStillRunning: sentryRunning(store.tasks, store.sentry.id)
                        };
                    }
                },
                {
                    op: 'sentry.resume',
                    describe: 'Let a paused campaign go again, looking at once. args: none',
                    handler: () => {
                        if (!store.sentry) { throw new Error('no sentry campaign has ever been started here'); }
                        if (store.sentry.status !== 'paused') {
                            throw new Error(`the campaign is ${store.sentry.status}, so there is nothing to resume`);
                        }
                        resumeSentry(store.sentry, NOW + 2000);
                        return {
                            campaign: store.sentry,
                            running: sentryRunning(store.tasks, store.sentry.id)
                        };
                    }
                },
                {
                    op: 'sentry.status',
                    describe: 'What the campaign is doing and why it is not doing anything else. args: none',
                    handler: () => (store.sentry
                        ? {
                            campaign: store.sentry,
                            running: sentryRunning(store.tasks, store.sentry.id),
                            rotatesAccounts: !!store.sentry.engine,
                            failStreak: store.sentry.failStreak ?? 0
                        }
                        : { campaign: undefined, running: false })
                }
            ]);
            return { reg, store };
        };

        const cat = campaignOps().reg.catalog().map(c => c.op);
        ok('every campaign op is in farm.ops',
            ['sentry.start', 'sentry.stop', 'sentry.pause', 'sentry.resume', 'sentry.status']
                .every(x => cat.includes(x)));

        {
            const { reg } = campaignOps();
            const bad = await reg.dispatch('sentry.start', { agent: 'developer', prompt: 'go' });
            ok('a campaign with no project is refused, by the name of what is missing',
                !bad.ok && /project/i.test(bad.error));
            const bad2 = await reg.dispatch('sentry.start', { project: 'p', prompt: 'go' });
            ok('...and one with no agent likewise', !bad2.ok && /agent/i.test(bad2.error));
        }

        {
            const { reg } = campaignOps();
            const first = await reg.dispatch('sentry.start',
                { project: 'prj_9ujsbtzr', agent: 'developer', prompt: 'Take the next item.' });
            ok('a campaign starts running, on the project and agent it was given',
                first.ok && first.result.campaign.status === 'running'
                && first.result.campaign.project === 'prj_9ujsbtzr');
            ok('‼️ the words the FIRST round opens on are kept on the record, not in a closure',
                first.result.campaign.opening === 'Take the next item.');
            ok('‼️ with no engine named the op SAYS no account is rotated',
                first.result.rotatesAccounts === false);

            const second = await reg.dispatch('sentry.start',
                { project: 'other', agent: 'basit', prompt: 'go' });
            ok('‼️ a second campaign is refused - the runner is sequential',
                !second.ok && second.error.length > 10);
            ok('...and the refusal names the project the live one is on',
                second.error.indexOf('prj_9ujsbtzr') >= 0);
        }

        {
            const { reg } = campaignOps();
            const r = await reg.dispatch('sentry.start',
                { project: 'p', agent: 'a', prompt: 'go', engine: 'claude' });
            ok('naming an engine is what turns account rotation on', r.result.rotatesAccounts === true);
        }

        // ---- ‼️ X-177 — the HOLD, which is not the farm's master switch -----
        {
            const { reg, store } = campaignOps();
            const nothing = await reg.dispatch('sentry.pause', {});
            ok('pausing when no campaign was ever started is refused in words, not a silent no-op',
                !nothing.ok && /ever been started/i.test(nothing.error));

            await reg.dispatch('sentry.start', { project: 'p', agent: 'a', prompt: 'the opening words' });
            store.sentry.carry = { prompt: 'the words the last round earned', code: 'X-177', at: NOW };
            const held = await reg.dispatch('sentry.pause', {});
            ok('a running campaign can be held, and says so', held.ok && held.result.campaign.status === 'paused');
            ok('‼️ ...and the words it had already built for the next round are untouched',
                held.result.campaign.carry.prompt === 'the words the last round earned');

            const again = await reg.dispatch('sentry.pause', {});
            ok('pausing a paused campaign is refused by naming the state it is in',
                !again.ok && /paused/i.test(again.error));

            const second = await reg.dispatch('sentry.start', { project: 'other', agent: 'b', prompt: 'go' });
            ok('‼️ a paused campaign still holds the one slot — a second is refused under it',
                !second.ok && /paus/i.test(second.error));

            const back = await reg.dispatch('sentry.resume', {});
            ok('resuming puts it back to running', back.ok && back.result.campaign.status === 'running');
            ok('...and it still has the words, which is the whole difference from stop-then-start',
                back.result.campaign.carry.prompt === 'the words the last round earned');
            const backAgain = await reg.dispatch('sentry.resume', {});
            ok('resuming a running campaign is refused by naming the state it is in',
                !backAgain.ok && /running/i.test(backAgain.error));

            await reg.dispatch('sentry.pause', {});
            const off = await reg.dispatch('sentry.stop', { why: 'enough for tonight' });
            ok('‼️ a PAUSED campaign can be stopped — a hold is not a trap you have to resume out of',
                off.ok && off.result.campaign.status === 'stopped');
        }

        {
            const { reg, store } = campaignOps();
            const empty = await reg.dispatch('sentry.status', {});
            ok('a machine that never started one answers plainly rather than refusing',
                empty.ok && empty.result.campaign === undefined && empty.result.running === false);

            await reg.dispatch('sentry.start', { project: 'p', agent: 'a', prompt: 'go' });
            const id = store.sentry.id;
            const idle = await reg.dispatch('sentry.status', {});
            ok('a campaign with no rows is not running', idle.result.running === false);

            store.tasks.push({ id: 't1', sentryOf: id, status: 'running' });
            ok('‼️ a round on the BOARD is what "running" means - it is derived on every ask',
                (await reg.dispatch('sentry.status', {})).result.running === true);

            store.tasks[0].status = 'done';
            ok('...and the moment that row ends, so does "running"',
                (await reg.dispatch('sentry.status', {})).result.running === false);
        }

        {
            const { reg, store } = campaignOps();
            const none = await reg.dispatch('sentry.stop', {});
            ok('stopping what was never started is refused in words, not silently',
                !none.ok && /no sentry campaign/i.test(none.error));

            await reg.dispatch('sentry.start', { project: 'p', agent: 'a', prompt: 'go' });
            store.tasks.push({ id: 't1', sentryOf: store.sentry.id, status: 'running' });
            const off = await reg.dispatch('sentry.stop', { why: 'enough for tonight' });
            ok('the campaign is switched off and the reason is kept',
                off.result.campaign.status === 'stopped' && off.result.campaign.stoppedWhy === 'enough for tonight');
            ok('‼️ the round already on the board is LEFT ALONE, and the op says so',
                off.result.roundStillRunning === true);
            ok('...and the record survives being stopped - it is the account of the night',
                off.result.campaign.startedAt === NOW && off.result.campaign.stoppedAt === NOW + 1000);

            const again = await reg.dispatch('sentry.start', { project: 'p2', agent: 'a', prompt: 'go' });
            ok('a stopped campaign stands in nobody way', again.ok);
        }
    }

    // ---------- X-189: where the note is, and why that one ----------
    //
    // The op earns its place by answering a question the campaign used to answer
    // WRONGLY and silently: a note written outside the one folder, or under a name
    // the one pattern refused, produced `hit-the-wall` about a session that had
    // handed over perfectly well.
    {
        const CANON = '2026-09-04_devir_03_878ae65b_x176-kapandi.md';
        const OTHERS = '2026-09-04_devir_01_dc980395_baskasinin-notu.md';

        ok('the op is in the catalogue like every other',
            registry().catalog().some(c => c.op === 'sentry.handover'));

        const none = await registry().dispatch('sentry.handover', {});
        ok('a search with no session is refused by the name of what is missing',
            !none.ok && /session/i.test(none.error));

        const r = await registry({ __listings: [
            { source: 'transcript', dir: 'D:/notes', files: ['scratch.md'], authored: ['scratch.md'] },
            { source: 'fallback', dir: 'D:/vault/01_CEVAPLAR', files: [CANON, OTHERS] }
        ] }).dispatch('sentry.handover', { session: SID });
        ok('the note is found across sources and says which one it came from',
            r.ok && r.result.found && r.result.found.file === CANON
            && r.result.found.source === 'fallback');
        ok('...with its full path, so the next prompt can point at it',
            r.result.found.path === 'D:/vault/01_CEVAPLAR/' + CANON);
        ok('...and its score, which is the field a condition reads',
            typeof r.result.found.score === 'number' && r.result.found.score >= DEFAULT_HANDOVER_THRESHOLD);
        ok('...and every folder it looked in, listed or not',
            r.result.looked.length === 2 && r.result.looked.every(l => typeof l.files === 'number'));

        const off = await registry({ __listings: [
            { source: 'transcript', dir: 'D:/anywhere', files: ['gece-notu.md'], authored: ['gece-notu.md'] }
        ] }).dispatch('sentry.handover', { session: SID });
        ok('‼️ THE DEFECT: a note under a name the old pattern refused is now found',
            off.ok && off.result.found && off.result.found.file === 'gece-notu.md');

        const theirs = await registry({ __listings: [
            { source: 'fallback', dir: 'D:/vault', files: [OTHERS] }
        ] }).dispatch('sentry.handover', { session: SID });
        ok('‼️ AND ANOTHER SESSION\'S NOTE IS STILL NEVER ADOPTED',
            theirs.ok && theirs.result.found === null && theirs.result.measured === true);
        ok('...and the rejection is on the record, by the session it does name',
            theirs.result.evidence.some(e => /dc980395/.test(e)));

        const blind = await registry({ __listings: [
            { source: 'configured', skipped: '${vault} has nothing behind it on this machine.' }
        ] }).dispatch('sentry.handover', { session: SID });
        ok('‼️ A FOLDER NOBODY COULD READ IS UNKNOWN, NOT EMPTY',
            blind.ok && blind.result.measured === false && blind.result.found === null
            && blind.result.unknown.length === 1);
    }

    // ---------- X-191: the leader, reported without being run ----------
    //
    // The op exists so a person (or an agent) can ask what the campaign would
    // spend BEFORE the night, and read afterwards what it did spend. ‼️ Asking
    // must be free: an op that runs a model in order to answer a question about
    // running a model is the automation.ts bill with an extra step.
    {
        const CAMPAIGN = { project: 'p', agent: 'a', status: 'running',
            leader: { day: '2026-09-04', spentUsd: 0.62, turns: 4, failStreak: 0,
                log: [{ model: 'haiku', ms: 900, costUsd: 0.02, at: NOW, ok: true }] } };

        ok('the op is in the catalogue and says what it takes',
            registry().catalog().some(c => c.op === 'sentry.leader' && /args:/.test(c.describe)));

        const none = await registry().dispatch('sentry.leader', {});
        ok('with no campaign it refuses by the name of what is missing',
            !none.ok && /campaign/i.test(none.error));

        const r = await registry({ __campaign: CAMPAIGN }).dispatch('sentry.leader', {});
        ok('it reports what has been spent today and what is left',
            r.ok && r.result.spentUsd === 0.62
            && Math.abs(r.result.remainingUsd - (DEFAULT_LEADER_CAPS.dailyUsd - 0.62)) < 1e-9);
        ok('...and the caps actually in force, not the defaults by assumption',
            r.result.caps.model === DEFAULT_LEADER_CAPS.model && r.result.caps.dailyUsd > 0);
        ok('...and the turns it has already taken, so a bill has lines',
            r.result.log.length === 1 && r.result.log[0].costUsd === 0.02);
        ok('...and that it may still be woken', r.result.allowed === true);

        const spent = { ...CAMPAIGN, leader: { day: '2026-09-04', spentUsd: DEFAULT_LEADER_CAPS.dailyUsd } };
        const s2 = await registry({ __campaign: spent }).dispatch('sentry.leader', {});
        ok('‼️ a campaign out of budget says so, and says the work carries on',
            s2.result.allowed === false && /budget/i.test(s2.result.why)
            && /mechanical/i.test(s2.result.why));

        const b = await registry({ __campaign: CAMPAIGN, __brief: {
            diagnosis: { session: 'abcd1234', outcome: 'hit-the-wall', rule: 'wall',
                why: 'no note was written', evidence: [], unknown: [] },
            verdict: { verdict: 'leader', fired: ['no-handover'], why: 'x', problems: [] }
        } }).dispatch('sentry.leader', {});
        ok('‼️ the brief can be READ before a night, which is the point of the op',
            b.result.brief.includes('no-handover') && b.result.brief.includes('"prompt"'));
    }

    console.log(`test_sentry_bridge: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();

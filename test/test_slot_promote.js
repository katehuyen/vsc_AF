// X-291 — the RETURN LEG on real files: a permission approved inside a slot
// session reaches the fleet at the next gate, a permission the user revoked in
// the main directory does not come back, and running the gate twice writes
// nothing the second time. Fixtures live in os.tmpdir() with an af- prefix and
// never touch the real ~/.claude.json.
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('  FAIL ' + name); } };

const sp = require(path.join(ROOT, 'out/core/slotPromote.js'));
const sc = require(path.join(ROOT, 'out/core/slotCompleteness.js'));
const { adapterFor } = require(path.join(ROOT, 'out/core/engineAccounts.js'));
const claude = adapterFor('claude');

const P = 'D:\\zone\\repo';
const entry = (tools) => ({
    allowedTools: tools, hasTrustDialogAccepted: true, mcpServers: {}, enabledMcpjsonServers: [],
    disabledMcpjsonServers: [], mcpContextUris: [], hasClaudeMdExternalIncludesApproved: false,
    lastCost: 1, lastSessionId: 'x'
});

// ---------- 1. the base store ----------
{
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-keybase-'));
    try {
        const file = path.join(tmp, 'deep', 'slot-keybase.json');
        const store = new sp.KeyBaseStore(file, fs);
        ok('‼️ no base is an EMPTY base, never the fleet\'s value — see KeyBaseStore.get',
            JSON.stringify(store.get('claude-a', '.claude.json')) === '{}');
        store.set('claude-a', '.claude.json', { projects: { [P]: { allowedTools: ['A'] } } });
        ok('the store makes its own folder', fs.existsSync(file));
        ok('a second reader on the same file sees it',
            new sp.KeyBaseStore(file, fs).get('claude-a', '.claude.json').projects[P].allowedTools[0] === 'A');
        const before = fs.statSync(file).mtimeMs;
        store.set('claude-a', '.claude.json', { projects: { [P]: { allowedTools: ['A'] } } });
        ok('writing the same value again costs no write', fs.statSync(file).mtimeMs === before);
        store.set('claude-b', '.claude.json', { projects: {} });
        store.forget('claude-a');
        const back = new sp.KeyBaseStore(file, fs);
        ok('a forgotten slot takes its base with it', JSON.stringify(back.get('claude-a', '.claude.json')) === '{}');
        ok('…and leaves the others alone', JSON.stringify(back.get('claude-b', '.claude.json')) === '{"projects":{}}');
        fs.writeFileSync(file, 'not json at all', 'utf8');
        ok('an unreadable base reads as empty rather than throwing at a gate',
            JSON.stringify(new sp.KeyBaseStore(file, fs).get('claude-b', '.claude.json')) === '{}');
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// ---------- 2. the return leg on real files ----------
const world = () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-promote-'));
    const home = path.join(tmp, 'home');
    const live = path.join(home, '.claude');
    fs.mkdirSync(live, { recursive: true });
    const dir = path.join(tmp, 'accounts', 'claude-t');
    fs.mkdirSync(dir, { recursive: true });
    const fleetFile = path.join(home, '.claude.json');
    const slotFile = path.join(dir, '.claude.json');
    const base = new sp.KeyBaseStore(path.join(tmp, 'slot-keybase.json'), fs);
    return {
        tmp, home, dir, fleetFile, slotFile, base,
        ctx: { fs, home, dir, slotId: 'claude-t', adapter: claude, base },
        fleet: (o) => fs.writeFileSync(fleetFile, JSON.stringify(o, null, 2), 'utf8'),
        slot: (o) => fs.writeFileSync(slotFile, JSON.stringify(o, null, 2), 'utf8'),
        readFleet: () => JSON.parse(fs.readFileSync(fleetFile, 'utf8')),
        readSlot: () => JSON.parse(fs.readFileSync(slotFile, 'utf8'))
    };
};

{
    const w = world();
    try {
        w.fleet({ oauthAccount: { accountUuid: 'fleet' }, mcpServers: { a: 1 }, projects: { [P]: entry([]) } });
        w.slot({ oauthAccount: { accountUuid: 'slot' }, mcpServers: { a: 1 }, projects: { [P]: entry(['Bash(git push)']) } });

        const dry = sp.promoteFromSlot(w.ctx, true);
        const dryRow = dry.find(r => r.file === '.claude.json');
        ok('a dry run names what would go', dryRow.promotions.length === 1 && dryRow.promotions[0].added[0] === 'Bash(git push)');
        ok('…and writes nothing', w.readFleet().projects[P].allowedTools.length === 0);
        ok('…and records no base', JSON.stringify(w.base.get('claude-t', '.claude.json')) === '{}');

        const rows = sp.promoteFromSlot(w.ctx, false);
        ok('the fleet gains the slot\'s approval', w.readFleet().projects[P].allowedTools[0] === 'Bash(git push)');
        ok('‼️ the fleet\'s OWN sign-in is untouched — a return leg carries permissions, not identities',
            w.readFleet().oauthAccount.accountUuid === 'fleet');
        ok('the slot file is not written by the return leg at all', w.readSlot().oauthAccount.accountUuid === 'slot');
        ok('the pass reports the write', rows.find(r => r.file === '.claude.json').wrote === true);
        ok('the base now holds what both sides agreed',
            w.base.get('claude-t', '.claude.json').projects[P].allowedTools[0] === 'Bash(git push)');

        const again = sp.promoteFromSlot(w.ctx, false);
        ok('‼️ a second gate promotes nothing and writes nothing — a gate runs at every start',
            again.every(r => !r.promotions.length && !r.wrote));

        // ‼️ THE REVOCATION. The user takes the approval out in the main directory.
        // The base says both sides once agreed on it, so it is a revocation and the
        // return leg must NOT put it back.
        const f = w.readFleet();
        f.projects[P].allowedTools = [];
        w.fleet(f);
        const after = sp.promoteFromSlot(w.ctx, false);
        ok('‼️ a revoked permission is not promoted back', after.every(r => !r.promotions.length));
        ok('‼️ …and the fleet stays as the user left it', w.readFleet().projects[P].allowedTools.length === 0);
    } finally { fs.rmSync(w.tmp, { recursive: true, force: true }); }
}

{
    // What it refuses. Neither side is guessed at: a fleet file that is not a JSON
    // object is one a rewrite would destroy, and a slot with no file has answered
    // nothing at all.
    const w = world();
    try {
        w.slot({ projects: { [P]: entry(['Bash(x)']) } });
        fs.writeFileSync(w.fleetFile, 'corrupted, not JSON', 'utf8');
        const rows = sp.promoteFromSlot(w.ctx, false);
        ok('‼️ an unreadable fleet file is REFUSED, never overwritten',
            /not a JSON object/.test(rows.find(r => r.file === '.claude.json').error)
            && fs.readFileSync(w.fleetFile, 'utf8') === 'corrupted, not JSON');
        ok('…and the refusal is an event a person can read',
            sp.promotionEvents(rows, { slotId: 'claude-t', engine: 'claude', gate: 'start', at: 1 })
                .some(e => e.error && e.path === ''));
        fs.rmSync(w.slotFile);
        ok('a slot with no file promotes nothing and errors about nothing',
            sp.promoteFromSlot(w.ctx, false).every(r => !r.promotions.length && !r.error));
    } finally { fs.rmSync(w.tmp, { recursive: true, force: true }); }
}

{
    // ‼️ THE REAL GATE ORDER: the contract projects first (old base), the return leg
    // runs after (records the new base). Promoting first would overwrite the base and
    // every revocation the user had just made would come straight back — which is the
    // one thing this ordering exists to prevent, so it is measured rather than said.
    const w = world();
    try {
        for (const n of claude.sharedPaths) { fs.mkdirSync(path.join(w.home, '.claude', n), { recursive: true }); }
        fs.writeFileSync(path.join(w.dir, '.credentials.json'), '{}', 'utf8');
        w.fleet({ oauthAccount: { accountUuid: 'fleet' }, projects: { [P]: entry(['Bash(shared)']) } });
        w.slot({ oauthAccount: { accountUuid: 'slot' }, projects: { [P]: entry(['Bash(shared)', 'Bash(mine)']) } });
        const cctx = { ...w.ctx, engine: 'claude', keyBase: (file) => w.base.get('claude-t', file) };

        sc.completeSlot(cctx, false);
        sp.promoteFromSlot(w.ctx, false);
        ok('‼️ one gate and both sides say the same thing',
            JSON.stringify(w.readSlot().projects[P].allowedTools) === JSON.stringify(w.readFleet().projects[P].allowedTools)
            && w.readFleet().projects[P].allowedTools.length === 2);
        ok('the sign-ins stayed their own sides\'',
            w.readSlot().oauthAccount.accountUuid === 'slot' && w.readFleet().oauthAccount.accountUuid === 'fleet');

        const slotBefore = fs.readFileSync(w.slotFile, 'utf8');
        const fleetBefore = fs.readFileSync(w.fleetFile, 'utf8');
        sc.completeSlot(cctx, false);
        sp.promoteFromSlot(w.ctx, false);
        ok('‼️ the second gate rewrites neither file', fs.readFileSync(w.slotFile, 'utf8') === slotBefore
            && fs.readFileSync(w.fleetFile, 'utf8') === fleetBefore);

        // the user revokes BOTH in the main directory
        const f = w.readFleet();
        f.projects[P].allowedTools = [];
        w.fleet(f);
        sc.completeSlot(cctx, false);
        sp.promoteFromSlot(w.ctx, false);
        ok('‼️ a revocation reaches the slot and is not undone by the return leg',
            w.readSlot().projects[P].allowedTools.length === 0 && w.readFleet().projects[P].allowedTools.length === 0);
    } finally { fs.rmSync(w.tmp, { recursive: true, force: true }); }
}

// ---------- 3. the journal ----------
{
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-promjournal-'));
    try {
        const j = new sp.PromotionJournal(path.join(tmp, 'slot-promotions.json'), fs);
        ok('nothing to say costs no write', (j.record([]), !fs.existsSync(path.join(tmp, 'slot-promotions.json'))));
        const rows = [{ file: '.claude.json', promotions: [{ path: `projects[${P}].allowedTools`, added: ['A', 'B'] }], wrote: true }];
        j.record(sp.promotionEvents(rows, { slotId: 'claude-a', engine: 'claude', gate: 'launch', at: 10 }));
        j.record(sp.promotionEvents(rows, { slotId: 'claude-b', engine: 'claude', gate: 'start', at: 20 }));
        ok('two passes, two rows', j.all().length === 2);
        const pat = sp.promotionPattern(j.all());
        ok('the pattern counts items, not passes, and names every slot they came from',
            pat.length === 1 && pat[0].added === 4 && pat[0].slots.length === 2 && pat[0].last === 20);
        ok('a row that failed is not counted as something the fleet gained',
            sp.promotionPattern([{ at: 1, slotId: 's', engine: 'claude', gate: 'ask', file: 'f', path: 'p', added: ['A'], error: 'no' }]).length === 0);
        ok('it survives a reopen', new sp.PromotionJournal(path.join(tmp, 'slot-promotions.json'), fs).all().length === 2);
        fs.writeFileSync(path.join(tmp, 'slot-promotions.json'), 'nope', 'utf8');
        const broken = new sp.PromotionJournal(path.join(tmp, 'slot-promotions.json'), fs);
        ok('an unreadable journal is set aside and measurement restarts',
            broken.all().length === 0 && /unreadable/.test(broken.degraded)
            && fs.readdirSync(tmp).some(f => /corrupt-/.test(f)));
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

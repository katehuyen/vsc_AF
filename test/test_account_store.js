// X-171 — THE SLOTS AS A LIST, AND WHAT CAPTURING ONE ACTUALLY DOES.
//
// ‼️ A capture is planned here and executed by the host, for the reason every
// pure core in this codebase exists: the interesting half is which files, from
// where, to where, and whether it should happen at all. Testing it the other way
// round would mean copying a real user's credentials somewhere — a test nobody
// runs twice.
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const {
    normalizeSlots, normalizeActive, findSlot, slotsFor, addSlot, forgetSlot,
    forgetActive, resolveAccount, accountRefusal, planCapture, slotLabel
} = require(path.join(__dirname, '..', 'out', 'core', 'accountStore.js'));

const NOW = Date.parse('2026-09-04T12:00:00Z');
const HOME = 'C:/Users/murat';
const ROOT = 'C:/store/accounts';
const ready = (email, plan = 'pro') => ({
    email, subscriptionType: plan, expiresAt: NOW + 3600_000,
    refreshExpiresAt: NOW + 30 * 86400_000, health: 'ready'
});

// ---------- the setting is user-editable, so nothing in it may be assumed ----------
{
    const list = normalizeSlots([
        { id: 'claude-a', engine: 'claude', dir: 'C:/s/a', email: 'a@x.com' },
        { id: '', dir: 'C:/s/b' },                     // half-typed
        { id: 'claude-c' },                            // no directory
        { id: 'claude-a', engine: 'claude', dir: 'C:/s/dup' },  // same id twice
        'not an object',
        { id: 'plain', dir: 'C:/s/p' }                 // engine unstated
    ]);
    ok('a half-typed entry is dropped rather than shown as an account', list.length === 2);
    ok('‼️ …because a row with no directory would start a session as nobody',
        !list.some(s => !s.dir));
    ok('the same id twice is one account, not two', list.filter(s => s.id === 'claude-a').length === 1);
    ok('an entry that does not say which engine means claude — what every caller meant before engines',
        list.find(s => s.id === 'plain').engine === 'claude');
    ok('nothing at all is an empty list, not a throw',
        normalizeSlots(undefined).length === 0 && normalizeSlots('x').length === 0);
    ok('the active map takes only real ids',
        JSON.stringify(normalizeActive({ claude: 'claude-a', codex: '', gemini: 7 }))
            === JSON.stringify({ claude: 'claude-a' }));
}

// ---------- the list operations ----------
{
    const a = { id: 'claude-a', engine: 'claude', dir: 'C:/s/a' };
    const b = { id: 'codex-b', engine: 'codex', dir: 'C:/s/b' };
    const list = addSlot(addSlot([], a), b);
    ok('an account is found by its id', findSlot(list, 'codex-b').dir === 'C:/s/b');
    ok('an id nobody stored is undefined, not a guess', findSlot(list, 'nope') === undefined);
    // ‼️ AN ACCOUNT BELONGS TO ONE ENGINE. A picker that offered all of them
    // would offer a Claude directory to Codex, which sets a variable Codex does
    // not read: the session starts on the main account and every surface says
    // otherwise.
    ok('‼️ a picker sees only its own engine\'s accounts',
        slotsFor(list, 'claude').length === 1 && slotsFor(list, 'codex')[0].id === 'codex-b');
    ok('an unstated engine means claude here too', slotsFor(list, undefined).length === 1);
    ok('capturing the same account again updates it instead of doubling it',
        addSlot(list, { ...a, email: 'new@x.com' }).length === 2
        && findSlot(addSlot(list, { ...a, email: 'new@x.com' }), 'claude-a').email === 'new@x.com');
    ok('forgetting removes exactly one', forgetSlot(list, 'claude-a').length === 1);
    // ‼️ …and it must also stop being the ACTIVE one, or the next session names
    // an account that is not there — and the honest failure of that looks
    // exactly like the dishonest one.
    ok('‼️ forgetting an account also forgets it as the active one',
        JSON.stringify(forgetActive({ claude: 'claude-a', codex: 'codex-b' }, 'claude-a'))
            === JSON.stringify({ codex: 'codex-b' }));
    ok('the label is what a person called it, then the address, and only then the folder name',
        slotLabel({ id: 'claude-a', engine: 'claude', dir: '', label: 'Work' }) === 'Work'
        && slotLabel({ id: 'claude-a', engine: 'claude', dir: '', email: 'a@x.com' }) === 'a@x.com'
        && slotLabel({ id: 'claude-a', engine: 'claude', dir: '' }) === 'claude-a');
}

// ---------- which account a launch ends up on ----------
{
    const active = { claude: 'claude-a', codex: 'codex-b' };
    ok('what the launch states wins', resolveAccount('claude-z', 'claude', active) === 'claude-z');
    ok('otherwise the engine\'s active account — the "use this next" gesture',
        resolveAccount('', 'claude', active) === 'claude-a');
    ok('…and it is per engine, so a Claude choice never reaches a Codex launch',
        resolveAccount('', 'codex', active) === 'codex-b');
    // ‼️ NOTHING AT ALL IS THE MAIN ACCOUNT, and today's behaviour to the
    // character: no variable is set, so the session inherits exactly what every
    // session started before this item inherited.
    ok('‼️ an engine with no active account resolves to nothing, not to a guess',
        resolveAccount('', 'gemini', active) === '');

    const list = [{ id: 'claude-a', engine: 'claude', dir: 'C:/s/a' },
        { id: 'codex-b', engine: 'codex', dir: 'C:/s/b' }];
    ok('an empty account is fine — it means the main sign-in',
        accountRefusal('', list, 'claude') === '');
    // ‼️ AN ID THAT NAMES NOTHING IS REFUSED, NOT IGNORED. Falling back to the
    // main account would start the session on whichever identity happens to be
    // signed in — the exact accident this family exists to end.
    ok('‼️ an account that was forgotten is refused rather than silently replaced',
        /No account "gone"/.test(accountRefusal('gone', list, 'claude')));
    ok('‼️ …and so is one belonging to a different engine',
        /belongs to one engine/.test(accountRefusal('claude-a', list, 'codex')));
    ok('a real account on its own engine is not refused',
        accountRefusal('claude-a', list, 'claude') === '');
}

// ---------- what capturing actually does ----------
{
    const plan = planCapture({
        engine: 'claude', home: HOME, root: ROOT,
        identity: ready('murat@example.com', 'max'), taken: [], now: NOW
    });
    ok('the plan seals an account named after the address it read',
        plan.refusal === '' && plan.slot.id === 'claude-murat');
    ok('…and records the tier and the moment, so a card has something to show',
        plan.slot.subscriptionType === 'max' && plan.slot.capturedAt === NOW);
    ok('the slot directory sits under the root the host gave it',
        plan.slot.dir === path.join(ROOT, 'claude-murat'));

    // ‼️ THE TRAP THIS ASSERTION EXISTS FOR. Claude's credentials are in
    // ~/.claude/.credentials.json but its IDENTITY — the address, the tier, every
    // folder-trust record — is ~/.claude.json, at the HOME ROOT. Reading both off
    // one directory name copies one file, finds no address, seals the slot
    // anyway, and starts sessions on an account that is not signed in. Nothing
    // errors.
    const from = plan.copies.map(c => c.from.replace(/\\/g, '/'));
    ok('‼️ the credentials come from ~/.claude/.credentials.json',
        from.includes(HOME + '/.claude/.credentials.json'));
    ok('‼️ …and the identity from ~/.claude.json, at the home root, NOT under .claude',
        from.includes(HOME + '/.claude.json'));
    ok('both land inside the slot, flat, the way the CLI expects to find them',
        plan.copies.every(c => path.dirname(c.to) === path.join(ROOT, 'claude-murat')));
    // Copying rather than moving: the account being sealed is the one the user
    // is signed in as right now, possibly in a session running as we do this.
    ok('‼️ nothing is taken away from the live directory — a capture is a copy',
        plan.copies.every(c => c.from !== c.to));

    // ‼️ AND THE TRANSCRIPTS STAY SHARED. CLAUDE_CONFIG_DIR moves them too, and
    // Agent Farm indexes ONE root: without these links a session started under a
    // slot is invisible in the panel — no history, no resume, no cost.
    const links = plan.links.map(l => l.to.replace(/\\/g, '/'));
    ok('‼️ `projects` is linked back at the live directory, not isolated',
        links.includes(ROOT + '/claude-murat/projects'));
    ok('…and the link points at the ONE root every session is read from',
        plan.links.find(l => /projects$/.test(l.to)).from.replace(/\\/g, '/')
            === HOME + '/.claude/projects');

    ok('a second account on the same address counts up rather than overwriting',
        planCapture({
            engine: 'claude', home: HOME, root: ROOT, identity: ready('murat@example.com'),
            taken: ['claude-murat'], now: NOW
        }).slot.id === 'claude-murat-2');
    ok('a label the user typed is kept and is what the row will say',
        slotLabel(planCapture({
            engine: 'claude', home: HOME, root: ROOT, identity: ready('a@x.com'),
            taken: [], label: 'İş hesabı', now: NOW
        }).slot) === 'İş hesabı');
}

// ---------- the refusals, which are the point ----------
{
    const of = (o) => planCapture({
        engine: 'claude', home: HOME, root: ROOT, taken: [], now: NOW, ...o
    });
    ok('‼️ an engine that cannot isolate refuses, in its adapter\'s own words',
        /Antigravity/.test(of({ engine: 'agy', identity: ready('a@x.com') }).refusal));
    ok('…and produces no slot at all, so nothing half-made is stored',
        of({ engine: 'agy', identity: ready('a@x.com') }).slot === undefined);
    ok('‼️ a directory nobody is signed into refuses — this seals what is there, it does not open a browser',
        /Sign in normally first/.test(
            of({ identity: { ...ready(''), health: 'needs-signin' } }).refusal));
    ok('‼️ …and a file that will not parse says so instead of claiming a sign-out',
        /locked or half-written/.test(
            of({ identity: { ...ready(''), health: 'unreadable' } }).refusal));
    ok('an unknown engine refuses rather than throwing',
        of({ engine: 'engine-from-2027', identity: ready('a@x.com') }).refusal.length > 20);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

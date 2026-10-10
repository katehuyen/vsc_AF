// X-530 / X-531 — AN ACCOUNT'S LIFE: asleep, awake, signed out, deleted.
//
// Asleep is not gone: the row, the folder and the sign-in stay, and everything
// that USES the account stops — the quota beat (test_account_usage.js), the
// reading line (test_account_queue.js), every picker and pool, every placement,
// and a launch that names it outright, which is refused by name. A standing
// choice that names it is stepped over, and the resolution says so. Sign out
// removes only the grant. Each door is one action behind a button and an op.
const path = require('path');
const fs = require('fs');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const OUT = path.join(__dirname, '..', 'out', 'core');
const ROOT = path.join(__dirname, '..');
const { usableSlots, asleepIn, asleepRefusal, setAsleep, planSignOut } = require(path.join(OUT, 'accountLife.js'));
const { normalizeSlots, accountRefusal, accountResolution, resolveAccount, headlessAccountPlan, portableSlots } = require(path.join(OUT, 'accountStore.js'));
const { accountLifeActions, registerAccountLifeOps } = require(path.join(OUT, 'accountLifeOps.js'));
const { BridgeRegistry } = require(path.join(OUT, 'bridge.js'));
const { stayOnAccount } = require(path.join(OUT, 'stayAccount.js'));

const rows = () => normalizeSlots([
    { id: 'claude-a', engine: 'claude', dir: 'C:/s/a', email: 'a@x.com' },
    { id: 'claude-b', engine: 'claude', dir: 'C:/s/b', email: 'b@x.com', disabled: true, disabledAt: 5 },
    { id: 'codex-c', engine: 'codex', dir: 'C:/s/c' }
]);

// ---------- the record ----------
{
    const list = rows();
    ok('the stored row carries the sleep and when it began', list[1].disabled === true && list[1].disabledAt === 5);
    ok('…and an awake row carries no flag at all (nothing is written for the ordinary case)',
        !('disabled' in list[0]) && !('disabledAt' in list[0]));
    ok('only a real true puts a row to sleep — a typed "false" or a 1 does not',
        !('disabled' in normalizeSlots([{ id: 'x', dir: 'd', disabled: 'false' }, { id: 'y', dir: 'e', disabled: 1 }])[0]));
    ok('‼️ a save keeps the asleep row — the portable list is the whole list', portableSlots(list, []).length === 3
        && portableSlots(list, [])[1].disabled === true);
    ok('the usable view is the awake ones', usableSlots(list).map(s => s.id).join() === 'claude-a,codex-c');
    const asleep = asleepIn(list);
    ok('asleepIn answers by id, trimmed, and only for a stored asleep row',
        asleep('claude-b') && asleep(' claude-b ') && !asleep('claude-a') && !asleep('nobody') && !asleep(''));
    const slept = setAsleep(list, 'claude-a', true, 99);
    ok('setAsleep puts one row to sleep with its moment, the others untouched',
        slept[0].disabled === true && slept[0].disabledAt === 99 && slept[2] === list[2]);
    ok('…sleeping an asleep row again keeps when it began', setAsleep(list, 'claude-b', true, 99)[1].disabledAt === 5);
    const woke = setAsleep(list, 'claude-b', false, 99);
    ok('waking removes both fields, so the row is exactly an awake one again', !('disabled' in woke[1]) && !('disabledAt' in woke[1]));
    ok('an unknown id changes nothing', JSON.stringify(setAsleep(list, 'nope', true, 1)) === JSON.stringify(list));
}

// ---------- the launch doors ----------
{
    const list = rows();
    const no = accountRefusal('claude-b', list, 'claude');
    ok('‼️ a launch that NAMES an asleep account is refused by name — never quietly moved', /is disabled/.test(no) && /b@x\.com/.test(no));
    ok('…and the refusal says how to wake it', /accounts\.enable/.test(no));
    ok('an awake account is not refused', accountRefusal('claude-a', list, 'claude') === '');
    ok('the engine refusal still comes first for an asleep row of another engine',
        /is a claude sign-in/.test(accountRefusal('claude-b', list, 'codex')));
    const asleep = asleepIn(list);
    const agent = accountResolution('', 'claude', { claude: 'claude-a' }, 'claude-b', undefined, asleep);
    ok('‼️ an agent standing on an asleep account steps over it to the machine-wide choice', agent.id === 'claude-a' && agent.origin === 'machine');
    ok('…and the note says it was stepped over, so it is never silent', /claude-b is disabled, so it was stepped over/.test(agent.note));
    const machine = accountResolution('', 'claude', { claude: 'claude-b' }, '', undefined, asleep);
    ok('a machine-wide choice left on an asleep account falls to the main sign-in, and says why',
        machine.id === '' && machine.origin === 'main' && /stepped over/.test(machine.note));
    const both = accountResolution('', 'claude', { claude: 'claude-b' }, 'claude-b', undefined, asleep);
    ok('…one sentence when both layers name the same asleep account', (both.note.match(/stepped over/g) || []).length === 1);
    const stated = accountResolution('claude-b', 'claude', {}, '', undefined, asleep);
    ok('a STATED asleep account is still resolved to itself — the refusal, not the resolution, answers it', stated.id === 'claude-b');
    ok('without the predicate nothing changes (every caller that has not asked)',
        accountResolution('', 'claude', { claude: 'claude-b' }, '').id === 'claude-b');
    ok('resolveAccount passes the predicate through', resolveAccount('', 'claude', { claude: 'claude-b' }, '', asleep) === '');
}

// ---------- the night: the headless service reads the same rules ----------
{
    const cfg = {
        accounts: [
            { id: 'claude-a', engine: 'claude', dir: 'C:/s/a' },
            { id: 'claude-b', engine: 'claude', dir: 'C:/s/b', disabled: true }
        ],
        activeAccounts: { claude: 'claude-b' },
        agentAccounts: { 'c:/agents/dev': { claude: 'claude-b' } }
    };
    const named = headlessAccountPlan({ engine: 'claude', account: 'claude-b' }, cfg);
    ok('‼️ at 3 a.m. a run that names an asleep account is skipped with the reason', /is disabled/.test(named.refusal) && !named.account);
    const standing = headlessAccountPlan({ engine: 'claude', agentDir: 'C:/agents/dev' }, cfg);
    ok('…and a run that only stands on one falls through to the main sign-in rather than being refused',
        standing.refusal === '' && standing.account === '');
}

// ---------- relays and stays ----------
{
    const base = { stayPct: 80, slotId: 'claude-b', percent: 10, quotaHandover: false, wall: { value: 100, why: 'w' }, now: 1 };
    ok('a successor never stays on an asleep account', stayOnAccount({ ...base, asleep: true }).stay === false
        && /claude-b is disabled/.test(stayOnAccount({ ...base, asleep: true }).why));
    ok('…while an awake one under the line still keeps it', stayOnAccount(base).stay === true);
    const place = fs.readFileSync(path.join(ROOT, 'src', 'launch', 'accountPlacement.ts'), 'utf8');
    ok('‼️ a campaign pool drops its asleep accounts before a rule walks it',
        /\? \(rec\.pool \?\? \[\]\)\.filter\(id => !asleep\(id\)\)/.test(place));
    ok('…a rule\'s own stored list does too', /stored: d\.stored\(\)\.filter\(s => s\.engine === eng && !s\.disabled\)/.test(place));
    ok('…a chain set on an asleep account opens its next leg through @emptiest, and logs it',
        /const wanted = asleep\(b\.want\.account\) \? '@emptiest' : b\.want\.account;/.test(place) && /is disabled — the next leg is placed by @emptiest/.test(place));
    ok('…and the standing choice is resolved with the predicate on both placement paths',
        (place.match(/, asleep\)/g) || []).length >= 2 && /asleep: asleep\(slotId\),/.test(place));
}

// ---------- a task pinned to an asleep account waits for Enable ----------
{
    const tasks = fs.readFileSync(path.join(ROOT, 'src', 'core', 'tasks.ts'), 'utf8');
    ok('a task naming an asleep account parks under its own code, not "missing"',
        /if \(named && this\.opts\.accountAsleep\?\.\(named\)\) \{ return \{ code: `account:asleep:\$\{named\}`, reason: accountNo \}; \}/.test(tasks));
    const waits = fs.readFileSync(path.join(ROOT, 'src', 'core', 'waits.ts'), 'utf8');
    ok('…and that wait names the door that clears it', /prefix: 'account:asleep:', kind: 'task-account', clearedBy: 'human', op: 'accounts\.enable'/.test(waits));
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('…wired to the same predicate the rest of the window reads', /accountAsleep: id => asleepNow\(id\),/.test(ext));
}

// ---------- sign out: the grant goes, the slot stays ----------
{
    const claude = planSignOut({ id: 'claude-a', engine: 'claude', dir: 'C:/s/a' });
    ok('a Claude slot signs out by removing .credentials.json alone',
        claude.refusal === '' && claude.files.length === 1 && /[\\/]\.credentials\.json$/.test(claude.files[0]));
    ok('…never its identity file or settings', !claude.files.some(f => /\.claude\.json$|settings\.json$/.test(f)));
    const codex = planSignOut({ id: 'codex-c', engine: 'codex', dir: 'C:/s/c' });
    ok('a Codex slot removes auth.json', codex.files.length === 1 && /auth\.json$/.test(codex.files[0]));
    ok('an engine with no isolated sign-in is refused with a reason', !!planSignOut({ id: 'g', engine: 'agy', dir: 'C:/s/g' }).refusal);
    ok('nothing stored is refused', !!planSignOut(undefined).refusal);
}

// ---------- the actions behind the buttons and the ops ----------
async function actions() {
    let store = rows();
    let active = { claude: 'claude-a' };
    const removed = [];
    const read = [];
    let busy = new Set();
    let health = 'ready';
    let painted = 0;
    const life = accountLifeActions({
        stored: () => store, write: async l => { store = l; },
        active: () => active, writeActive: async m => { active = m; },
        busy: id => busy.has(id),
        standingAgents: s => (s.id === 'claude-a' ? ['developer'] : []),
        health: () => health, readFigure: id => read.push(id), followed: () => {},
        removeFile: f => { removed.push(f); return !/missing/.test(f); },
        repaint: () => { painted++; }, now: () => 42
    });
    busy.add('claude-a');
    const d = await life.disable('claude-a');
    ok('Disable puts the row to sleep and keeps it', store.length === 3 && store[0].disabled === true && store[0].disabledAt === 42);
    ok('‼️ …clears it as the machine-wide "use this next", and says so', !active.claude && /use this next/.test(d.note));
    ok('…names the agents that stand on it and what they do now', /developer stand on it by name/.test(d.note));
    ok('…and says a run already on it keeps going, rather than refusing', d.refusal === '' && /keeps going/.test(d.note));
    ok('…and the surfaces repaint', painted > 0);
    ok('disabling twice is a calm answer, not an error', (await life.disable('claude-a')).refusal === '' && /already disabled/.test((await life.disable('claude-a')).note));
    health = 'needs-signin';
    const e1 = await life.enable('claude-a');
    ok('Enable wakes it', !store[0].disabled && e1.refusal === '');
    ok('‼️ …and a dead sign-in is sent to the 🔑 instead of a figure being read', /accounts\.reauth/.test(e1.note) && read.length === 0);
    await life.disable('claude-a');
    health = 'ready';
    const e2 = await life.enable('claude-a');
    ok('…while a working one has its figure queued at once', e2.health === 'ready' && read.join() === 'claude-a');
    const s1 = await life.signOut('claude-a');
    ok('‼️ Sign out is refused while a session or task runs on it', /running a session or a task/.test(s1.refusal) && removed.length === 0);
    busy = new Set();
    active = { claude: 'claude-a' };
    const s2 = await life.signOut('claude-a');
    ok('…otherwise it removes the grant file and keeps the row', s2.refusal === '' && removed.length === 1 && store.length === 3);
    ok('…warns when it is still the machine-wide choice', /still the machine-wide/.test(s2.note));
    ok('…and says local removal is not revocation', /not.*revocation|honours them until/.test(s2.note));
    ok('an unknown id is refused by every door', !!(await life.disable('x')).refusal && !!(await life.enable('x')).refusal && !!(await life.signOut('x')).refusal);

    // the bridge
    const reg = new BridgeRegistry();
    const deleted = [];
    registerAccountLifeOps(reg, life, async id => {
        if (id === 'claude-z') { return { refusal: 'No account "claude-z" is stored on this machine.' }; }
        deleted.push(id); return { refusal: '', result: { deleted: id } };
    });
    const ops = reg.catalog().map(c => c.op);
    ok('the four doors are on the bridge', ['accounts.disable', 'accounts.enable', 'accounts.signout', 'accounts.delete'].every(o => ops.includes(o)));
    ok('…each saying what it does and what it takes', reg.catalog().filter(c => /^accounts\.(disable|enable|signout|delete)$/.test(c.op))
        .every(c => c.describe.length > 80 && /args: id/.test(c.describe)));
    const rd = await reg.dispatch('accounts.disable', { id: 'codex-c' });
    ok('accounts.disable answers the row and the note', rd.ok && rd.result.id === 'codex-c' && rd.result.disabled === true && !!rd.result.note);
    const re = await reg.dispatch('accounts.enable', { id: 'codex-c' });
    ok('accounts.enable answers the health it read', re.ok && re.result.disabled === false && re.result.health === 'ready');
    const rs = await reg.dispatch('accounts.signout', { id: 'codex-c' });
    ok('‼️ accounts.signout names the files it removed — never their contents or a path', rs.ok && rs.result.removed.join() === 'auth.json');
    const rx = await reg.dispatch('accounts.delete', { id: 'claude-b' });
    ok('accounts.delete calls the one delete', rx.ok && deleted.join() === 'claude-b');
    ok('…and a refusal comes back as one', !(await reg.dispatch('accounts.delete', { id: 'claude-z' })).ok
        && !(await reg.dispatch('accounts.disable', { id: 'nobody' })).ok);
}

// ---------- the window: who reads the usable view, who keeps the whole list ----------
{
    const ext = fs.readFileSync(path.join(ROOT, 'src', 'extension.ts'), 'utf8');
    ok('the usable view is the store filtered once, beside it', /const usableAccounts = \(\): EngineAccountSlot\[\] => usableSlots\(storedAccounts\(\)\);/.test(ext));
    ok('‼️ every save writes the WHOLE list — no save is handed the usable view',
        !/writeAccounts\(usableAccounts\(\)/.test(ext) && !/writeAccounts\(usableSlots\(/.test(ext));
    ok('pickers, pools and the quota service read the usable view',
        /const slots = slotsFor\(usableAccounts\(\), engine\);/.test(ext)
        && /accountPool: usableAccounts\(\)\.map/.test(ext)
        && /const mine = slotsFor\(usableAccounts\(\), engine\)\.map\(s => s\.id\);/.test(ext));
    ok('"use this next" refuses an asleep account by name', /if \(slot\.disabled\) \{ return \{ refusal: asleepRefusal\(slotLabel\(slot\)\), engine: '', active: null, note: '' \}; \}/.test(ext));
    ok('a capture of an asleep account wakes it, and the answer says so', /const woke = !!findSlot\(list, slot\.id\)\?\.disabled;/.test(ext) && /woke: !!done\.woke,/.test(ext));
    ok('the card carries the flag', /disabled: !!slot\.disabled, disabledAt: slot\.disabledAt \|\| 0,/.test(ext));
    ok('‼️ the page\'s Delete offers ONE way — keep-it-for-later is Disable, named in the dialog',
        /ask\.warn\(lines\.join\('\\n'\), \{ modal: true \}, 'Delete account and folder'\);/.test(ext)
        && !/'Forget, keep folder'/.test(ext) && /To keep it for later instead, Disable it/.test(ext));
    const msgs = fs.readFileSync(path.join(ROOT, 'src', 'panels', 'accountsMessages.ts'), 'utf8');
    ok('the card\'s three new presses reach the same actions the ops call',
        /case 'accountDisable':\s*\n\s*await wrote\(await deps\.disableAccount/.test(msgs)
        && /case 'accountEnable':\s*\n\s*await wrote\(await deps\.enableAccount/.test(msgs)
        && /case 'accountSignOut':\s*\n\s*await wrote\(await deps\.signOutAccount/.test(msgs)
        && /disableAccount: async \(id: string\): Promise<string> => \(await accountLife\.disable\(id\)\)\.refusal,/.test(ext));
}

// ---------- the card ----------
{
    global.window = { AFTip: { wrap: (h, a, b) => h + '<!--' + a + '|' + b + '-->' } };
    const life = require(path.join(ROOT, 'media', 'afAccountLife.js'));
    const awake = life.actions({ id: 'w', label: 'Work', health: 'ready' });
    ok('an awake, signed-in card offers Disable, Sign out and Delete',
        /data-aclife="disable"/.test(awake) && /data-aclife="signout"/.test(awake) && /data-aclife="delete"/.test(awake) && !/data-aclife="enable"/.test(awake));
    ok('…a signed-out card offers no Sign out', !/signout/.test(life.actions({ id: 'w', health: 'needs-signin' })));
    const asleep = life.actions({ id: 'w', label: 'Work', health: 'ready', disabled: true });
    ok('an asleep card offers Enable and Delete only', /data-aclife="enable"/.test(asleep) && !/disable"|signout/.test(asleep));
    ok('the asleep badge is drawn only for an asleep card', /acbad asleep/.test(life.badge({ disabled: true })) && life.badge({}) === '');
    ok('each press posts the message the shared handler answers',
        life.TYPES.enable === 'accountEnable' && life.TYPES.disable === 'accountDisable'
        && life.TYPES.signout === 'accountSignOut' && life.TYPES.delete === 'accountForget');
    ok('awake accounts come first within a group, each in its own order',
        life.order([{ id: 1, disabled: true }, { id: 2 }, { id: 3, disabled: true }, { id: 4 }]).map(a => a.id).join() === '2,4,1,3');
    const page = fs.readFileSync(path.join(ROOT, 'media', 'afAccounts.js'), 'utf8');
    ok('an asleep card draws no figure, no ⟳ and no "use this next"',
        /\+ \(a\.disabled \? '' : refresh\)/.test(page) && /\+ \(a\.disabled \? '' : stand\)/.test(page) && /\+ \(a\.disabled \? '' : window5\)/.test(page));
    ok('…and a group\'s count of readable accounts leaves the asleep ones out',
        /const readable = rows\.filter\(a => a\.usageState !== 'no-source' && !a\.disabled\);/.test(page));
    ok('…as does the all-engines refresh line and the ids its press posts',
        /const readable = list\.filter\(a => a\.usageState !== 'no-source' && !a\.disabled\);/.test(page)
        && /&& a\.usageState !== 'no-source' && !a\.disabled\)\s*\.map\(a => a\.id\)/.test(page));
    // U-246 — Delete and the key are DRAWN. The shared button has no border, so the border-color both
    // carried painted nothing: a rule for either is a fill, an ink or an inset line.
    const rules = (life.CSS + page).split('}').map(r => r.trim()).filter(r => /\.(acdel|acreauth)\b[^{]*\{/.test(r));
    const rule = (sel) => (rules.find(r => r.slice(0, r.indexOf('{')).trim() === sel) || '').replace(/^[^{]*\{/, '');
    ok('‼️ U-246: no rule for Delete or the key colours a border the button does not have',
        rules.length >= 5 && rules.every(r => !/border-color/.test(r)));
    ok('‼️ …Delete is red at rest (ink and line) and filled under the hand',
        /(^|;)\s*color:[^;]*charts-red/.test(rule('button.secondary.acdel')) && /box-shadow:inset[^;]*charts-red/.test(rule('button.secondary.acdel'))
        && /background:[^;]*charts-red/.test(rule('button.secondary.acdel:hover')));
    ok('…and the key has a drawing for each verdict class a keyed card can carry',
        ['ok', 'warn', 'bad'].every(t => /box-shadow:inset/.test(rule('button.secondary.acreauth.' + t)))
        && ['warn', 'bad'].every(t => /background:/.test(rule('button.secondary.acreauth.' + t))));
    const base = fs.readFileSync(path.join(ROOT, 'src', 'panels', 'base.ts'), 'utf8');
    ok('the module ships on every page, before the view that asks it',
        base.indexOf('src="${accountLife}"') > 0 && base.indexOf('src="${accountLife}"') < base.indexOf('src="${accounts}"'));
}

(async () => {
    await actions();
    console.log(`test_account_life: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('  FAIL threw: ' + (e && e.stack || e)); process.exit(1); });

// X-171 — `accounts.*` ON THE BRIDGE, dispatched rather than described.
//
// The handlers in extension.ts need vscode to reach a setting, so what is
// measured here is the CONTRACT they are built out of: the same registry, the
// same arg helpers, the same pure cores, and the four promises an agent calling
// these ops is entitled to —
//
//   · a picker never sees another engine's accounts;
//   · an id that names nothing is REFUSED, never silently replaced by the main
//     sign-in (which would start the session on whichever identity happens to
//     be signed in — the accident this whole family exists to end);
//   · forgetting an account also stops it being the active one;
//   · ‼️ NO TOKEN VALUE EVER CROSSES THE BRIDGE. Same boundary as the secrets
//     vault, same reason.
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const OUT = path.join(__dirname, '..', 'out', 'core');
const { BridgeRegistry, need, argStr, optStr, optBool, optNum } = require(path.join(OUT, 'bridge.js'));
const {
    addSlot, findSlot, forgetActive, forgetSlot, planCapture, slotLabel, slotsFor,
    normalizeActive, normalizeSlots, accountRefusal, resolveAccount
} = require(path.join(OUT, 'accountStore.js'));
const { ENGINE_AUTH_ADAPTERS, describeSlotLayout, adapterFor } = require(path.join(OUT, 'engineAccounts.js'));
const { mostRoom, nextResetAt } = require(path.join(OUT, 'accountUsage.js'));

// ---------- the arg helpers these ops lean on ----------
{
    // ‼️ THE STRING FORMS ARE THE POINT. `af.js accounts.forget id=x deleteFiles=true`
    // hands over the WORD "true" whenever the coercion misses, and an op reading
    // `args.x === true` then quietly does the opposite of what was typed —
    // nothing errors, the destructive half just does not happen.
    ok('‼️ a flag typed as a word still reads as a flag',
        optBool({ f: 'true' }, 'f') === true && optBool({ f: 'TRUE' }, 'f') === true
        && optBool({ f: 'yes' }, 'f') === true && optBool({ f: '1' }, 'f') === true);
    ok('…and its negatives too, rather than falling through to the default',
        optBool({ f: 'false' }, 'f', true) === false && optBool({ f: '0' }, 'f', true) === false);
    ok('an absent flag is the default, stated by the caller',
        optBool({}, 'f') === false && optBool({}, 'f', true) === true);
    ok('a number typed as a word is a number', optNum({ n: '95' }, 'n', 5) === 95);
    ok('…and nonsense falls back rather than becoming NaN',
        optNum({ n: 'abc' }, 'n', 5) === 5 && optNum({}, 'n', 5) === 5);
}

/** The ops, wired to an in-memory store — the same shapes extension.ts uses. */
function registry(state) {
    const reg = new BridgeRegistry();
    const usageOf = (id) => state.usage.find(u => u.slotId === id);
    const publicAccount = (s) => ({
        id: s.id, engine: s.engine, label: slotLabel(s), dir: s.dir,
        email: s.email || '', plan: s.subscriptionType || '',
        active: state.active[s.engine] === s.id,
        percent: usageOf(s.id) ? usageOf(s.id).percent : -1
    });
    reg.register([
        {
            op: 'accounts.list',
            describe: 'the sign-ins captured on this machine. args: engine?',
            handler: (a) => {
                const engine = optStr(a, 'engine');
                const list = engine ? slotsFor(state.slots, engine) : state.slots;
                return {
                    accounts: list.map(publicAccount), active: state.active,
                    engines: ENGINE_AUTH_ADAPTERS.map(x => ({
                        engine: x.engine, support: x.support, variable: x.configEnv || null,
                        canCapture: x.support !== 'unmapped', why: x.evidence
                    }))
                };
            }
        },
        {
            op: 'accounts.capture',
            describe: 'seal the sign-in that is on this disk. args: engine?, label?, activate?',
            handler: (a) => {
                const engine = optStr(a, 'engine') || 'claude';
                const plan = planCapture({
                    engine, home: 'C:/Users/murat', root: 'C:/store/accounts',
                    identity: state.identity, stored: state.slots,
                    label: optStr(a, 'label'), now: 1
                });
                need(!plan.refusal, plan.refusal);
                state.slots = addSlot(state.slots, plan.slot);
                if (optBool(a, 'activate')) { state.active = { ...state.active, [engine]: plan.slot.id }; }
                return {
                    captured: publicAccount(plan.slot), reseated: plan.reseats ?? null,
                    layout: describeSlotLayout(engine)
                };
            }
        },
        {
            op: 'accounts.activate',
            describe: 'which account the next session opens with. args: id, engine?',
            handler: (a) => {
                const id = optStr(a, 'id');
                if (!id) {
                    const engine = optStr(a, 'engine') || 'claude';
                    const next = { ...state.active };
                    delete next[engine];
                    state.active = next;
                    return { engine, active: null };
                }
                const slot = findSlot(state.slots, id);
                need(!!slot, `No account "${id}" is stored on this machine — accounts.list shows what is.`);
                state.active = { ...state.active, [slot.engine]: slot.id };
                return { engine: slot.engine, active: slot.id };
            }
        },
        {
            op: 'accounts.status',
            describe: 'can a session start right now, and on which account. args: engine?, ceiling?',
            handler: (a) => {
                const engine = optStr(a, 'engine') || 'claude';
                const ceiling = optNum(a, 'ceiling', 95);
                const mine = slotsFor(state.slots, engine).map(s => s.id);
                const usage = state.usage.filter(u => mine.includes(u.slotId));
                const best = mostRoom(usage, ceiling);
                return {
                    engine, ceiling, best: best ? best.slotId : null,
                    nextResetAt: nextResetAt(usage, ceiling, 0) || null,
                    needsSignin: usage.filter(u => u.state === 'expired').map(u => u.slotId)
                };
            }
        },
        {
            op: 'accounts.forget',
            describe: 'drop an account from the list. args: id, deleteFiles?',
            handler: (a) => {
                const id = argStr(a, 'id');
                const slot = findSlot(state.slots, id);
                need(!!slot, `No account "${id}" is stored on this machine.`);
                state.slots = forgetSlot(state.slots, id);
                state.active = forgetActive(state.active, id);
                return { forgotten: id, filesRemoved: optBool(a, 'deleteFiles') };
            }
        }
    ]);
    return reg;
}

function freshState() {
    return {
        slots: normalizeSlots([
            { id: 'claude-a', engine: 'claude', dir: 'C:/s/a', email: 'a@x.com', subscriptionType: 'pro' },
            { id: 'claude-b', engine: 'claude', dir: 'C:/s/b', email: 'b@x.com', subscriptionType: 'max' },
            { id: 'codex-c', engine: 'codex', dir: 'C:/s/c' }
        ]),
        active: normalizeActive({ claude: 'claude-a' }),
        usage: [
            { slotId: 'claude-a', engine: 'claude', state: 'ok', percent: 88, resetsAt: 5000, plan: 'pro', fetchedAt: 1 },
            { slotId: 'claude-b', engine: 'claude', state: 'ok', percent: 12, resetsAt: 9000, plan: 'max', fetchedAt: 1 },
            { slotId: 'codex-c', engine: 'codex', state: 'no-source', percent: -1, resetsAt: 0, plan: '', fetchedAt: 1 }
        ],
        identity: {
            email: 'yeni@example.com', subscriptionType: 'pro',
            expiresAt: 9e12, refreshExpiresAt: 9e12, health: 'ready'
        }
    };
}

(async () => {
    // ---------- the catalog, which is how an agent finds these at all ----------
    {
        const cat = registry(freshState()).catalog();
        const ops = cat.map(c => c.op);
        ok('every accounts op is in farm.ops',
            ['accounts.list', 'accounts.capture', 'accounts.activate', 'accounts.status', 'accounts.forget']
                .every(o => ops.includes(o)));
        ok('…and each says what it does and what it takes',
            cat.filter(c => c.op.startsWith('accounts.'))
                .every(c => c.describe.length > 20 && /args:/.test(c.describe)));
    }

    // ---------- list ----------
    {
        const state = freshState();
        const reg = registry(state);
        const all = await reg.dispatch('accounts.list', {});
        ok('list returns every account', all.ok && all.result.accounts.length === 3);
        // ‼️ AN ACCOUNT BELONGS TO ONE ENGINE. Offering a Claude directory to
        // Codex sets a variable Codex does not read: the session starts on the
        // main account while every surface claims otherwise.
        const one = await reg.dispatch('accounts.list', { engine: 'codex' });
        ok('‼️ …and an engine sees only its own', one.result.accounts.length === 1);
        ok('the active one is marked, so a reader knows what happens next',
            all.result.accounts.find(a => a.id === 'claude-a').active === true);
        // ‼️ NO TOKEN VALUE CROSSES THE BRIDGE. The only public facts are that a
        // sign-in exists, whose it is, and how much of its plan is left.
        const text = JSON.stringify(all.result);
        ok('‼️ nothing token-shaped is anywhere in the answer',
            !/sk-ant-|accessToken|refreshToken|"token"|Bearer /.test(text));
        // An engine that cannot isolate says so IN THE LIST, rather than being
        // absent — a missing row reads as "not supported yet" only to somebody
        // who already knows the answer.
        const agy = all.result.engines.find(e => e.engine === 'agy');
        ok('an engine that cannot hold a second account says so, with its reason',
            agy.canCapture === false && agy.why.length > 40 && agy.variable === null);
        ok('…and the one that can names the variable it would set',
            all.result.engines.find(e => e.engine === 'claude').variable === 'CLAUDE_CONFIG_DIR');
    }

    // ---------- capture ----------
    {
        const state = freshState();
        const reg = registry(state);
        const r = await reg.dispatch('accounts.capture', { label: 'Üçüncü', activate: 'true' });
        ok('capture seals the sign-in that is on the disk', r.ok && r.result.captured.id === 'claude-yeni');
        ok('…names it what the user typed', r.result.captured.label === 'Üçüncü');
        ok('‼️ activate:"true" as a WORD still activates — the af.js shorthand', r.result.captured.active === true);
        ok('the answer explains the arrangement rather than leaving it to a document',
            /junction|link/i.test(r.result.layout) && /transcript|session records/i.test(r.result.layout));

        // ‼️ X-220 — AN ACCOUNT IS AN ENGINE AND AN ADDRESS. Pressing Capture
        // again after signing in — the ordinary way to fix a dead credential
        // before there was a key on the card — used to mint `claude-yeni-2`:
        // two rows, ONE account, one of them stale, and every picker offering
        // both.
        const before = state.slots.length;
        const again = await reg.dispatch('accounts.capture', {});
        ok('‼️ X-220: capturing an address already stored REFRESHES its row',
            again.ok && again.result.reseated === 'claude-yeni'
            && again.result.captured.id === 'claude-yeni');
        ok('…so the list does not grow, and no second row of one account is offered anywhere',
            state.slots.length === before
            && state.slots.filter(s => s.id === 'claude-yeni').length === 1);
        ok('‼️ …and the answer says WHICH of the two things it did, rather than "captured" either way',
            r.result.reseated === null && again.result.reseated === 'claude-yeni');
        ok('…the name the user gave it survives a refresh they did not rename',
            again.result.captured.label === 'Üçüncü');

        const blocked = await reg.dispatch('accounts.capture', { engine: 'agy' });
        ok('‼️ an engine with no verified isolation is refused, not captured',
            !blocked.ok && /Antigravity/.test(blocked.error));
        state.identity = { ...state.identity, health: 'needs-signin' };
        const nobody = await reg.dispatch('accounts.capture', {});
        ok('‼️ …and so is a machine nobody is signed in on: this seals what is there',
            !nobody.ok && /Sign in normally first/.test(nobody.error));
    }

    // ---------- activate ----------
    {
        const state = freshState();
        const reg = registry(state);
        const r = await reg.dispatch('accounts.activate', { id: 'claude-b' });
        ok('activating points the next session at that account',
            r.ok && state.active.claude === 'claude-b');
        const gone = await reg.dispatch('accounts.activate', { id: 'ghost' });
        ok('‼️ an id that names nothing is refused, never silently the main sign-in',
            !gone.ok && /No account "ghost"/.test(gone.error));
        const cleared = await reg.dispatch('accounts.activate', { id: '', engine: 'claude' });
        ok('an empty id goes back to the main sign-in, which sets no variable at all',
            cleared.ok && cleared.result.active === null && state.active.claude === undefined);
        ok('…and it is per engine, so clearing Claude leaves Codex alone',
            (await registry(freshState()).dispatch('accounts.activate', { id: 'codex-c' })).result.engine === 'codex');
    }

    // ---------- status: the one question an unattended runner asks ----------
    {
        const state = freshState();
        const reg = registry(state);
        const r = await reg.dispatch('accounts.status', {});
        ok('status names the account with the most room', r.ok && r.result.best === 'claude-b');
        // ‼️ A ceiling is a parameter because the runner and a person mean
        // different things by "full": at 95 an account at 88% is still work.
        ok('…under a ceiling the caller sets',
            (await reg.dispatch('accounts.status', { ceiling: '80' })).result.best === 'claude-b');
        state.usage[0].percent = 96;
        state.usage[1].percent = 99;
        const full = await reg.dispatch('accounts.status', { ceiling: 95 });
        ok('‼️ every account full is a WAIT with an exact end, not a failure',
            full.result.best === null && full.result.nextResetAt === 5000);
        ok('an engine with no readable figure still offers its account',
            (await reg.dispatch('accounts.status', { engine: 'codex' })).result.best === 'codex-c');
    }

    // ---------- forget ----------
    {
        const state = freshState();
        const reg = registry(state);
        const r = await reg.dispatch('accounts.forget', { id: 'claude-a' });
        ok('forgetting drops it from the list', r.ok && state.slots.length === 2);
        // ‼️ …AND FROM THE ACTIVE MAP. A next session pointed at an id that names
        // nothing would fall back to whichever identity happens to be signed in,
        // and that failure looks exactly like the honest one.
        ok('‼️ …and it stops being the active account in the same act',
            state.active.claude === undefined);
        ok('the files are kept unless asked for — a tidy-up is not a deletion',
            r.result.filesRemoved === false);
        ok('…and asked for as a word, it is honoured',
            (await registry(freshState()).dispatch('accounts.forget', { id: 'claude-a', deleteFiles: 'true' }))
                .result.filesRemoved === true);
        const gone = await reg.dispatch('accounts.forget', { id: 'claude-a' });
        ok('forgetting the same one twice refuses rather than pretending', !gone.ok);
        const missing = await reg.dispatch('accounts.forget', {});
        ok('a required id is required', !missing.ok && /id/.test(missing.error));
    }

    // ---------- the launch side of the same store ----------
    {
        const state = freshState();
        ok('a launch that names no account gets the engine\'s active one',
            resolveAccount('', 'claude', state.active) === 'claude-a');
        ok('…and what the launch itself states always wins',
            resolveAccount('claude-b', 'claude', state.active) === 'claude-b');
        ok('‼️ an account from another engine is refused at the launch too',
            /belongs to one engine/.test(accountRefusal('claude-a', state.slots, 'codex')));
        ok('the adapter is what names the variable, everywhere',
            adapterFor('claude').configEnv === 'CLAUDE_CONFIG_DIR');
    }

    // ---------- X-211 / X-214: the machine's own sign-in, on every surface ----------
    //
    // ‼️ Every one of these was the SAME silent failure wearing a different
    // coat: a surface that named an account and a process that ran as another.
    {
        const store = require(path.join(OUT, 'accountStore.js'));
        const { spawnEnvironment, terminalEnvOverlay } =
            require(path.join(OUT, 'providerRuntime.js'));
        const state = freshState();

        ok('‼️ stating the machine’s own sign-in CLEARS the variable, it does not merely omit it',
            store.accountEnvFor('claude', store.MACHINE_ACCOUNT, state.slots).CLAUDE_CONFIG_DIR === null);
        ok('…a slot still injects its own directory',
            typeof store.accountEnvFor('claude', 'claude-a', state.slots).CLAUDE_CONFIG_DIR === 'string');
        ok('…and nothing stated touches nothing at all, exactly as before',
            Object.keys(store.accountEnvFor('claude', '', state.slots)).length === 0);
        ok('an engine with no config variable has no layer to give',
            Object.keys(store.accountEnvFor('gemini', store.MACHINE_ACCOUNT, state.slots)).length === 0);

        // ‼️ THE POINT OF THE null: a WINDOW that already carries the variable.
        // Not clearing it is how "Machine Global" came to sit over a process
        // running as somebody's slot.
        const inherited = { CLAUDE_CONFIG_DIR: 'D:/slots/whoever', PATH: 'p' };
        const cleared = spawnEnvironment(inherited,
            [store.accountEnvFor('claude', store.MACHINE_ACCOUNT, state.slots)], undefined);
        ok('‼️ a window that already carries a config dir has it REMOVED for the machine’s own sign-in',
            cleared.CLAUDE_CONFIG_DIR === undefined && cleared.PATH === 'p');
        const kept = spawnEnvironment(inherited,
            [store.accountEnvFor('claude', 'claude-a', state.slots)], undefined);
        ok('…and replaced, not merged, when a slot is named',
            kept.CLAUDE_CONFIG_DIR === state.slots.find(x => x.id === 'claude-a').dir);
        ok('a terminal overlay carries the removal through as null, which is its own word for it',
            terminalEnvOverlay(
                [store.accountEnvFor('claude', store.MACHINE_ACCOUNT, state.slots)], undefined
            ).CLAUDE_CONFIG_DIR === null);
    }

    console.log(`${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
})();

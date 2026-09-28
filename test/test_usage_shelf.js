// U-160 — ONE READING PER TOKEN, KNOWN TO EVERY READER THE MOMENT IT LANDS.
//
// The user's report: the Console's account box said 54% for an account while
// the toolbar said 37% for the same account, for a long time. Both services ask
// one endpoint about one credentials file; X-240 made them share the FLOOR, so
// after the accounts service read the token the indicator was told "just read"
// and served its own older figure. Pinned here with the real services.
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const { UsageGate } = require(path.join(__dirname, '..', 'out', 'core', 'usageGate.js'));
const { UsageShelf, newerReading } = require(path.join(__dirname, '..', 'out', 'core', 'usageShelf.js'));
const { PlanUsageService } = require(path.join(__dirname, '..', 'out', 'core', 'planusage.js'));
const { AccountUsageService, slotCredentialsFile } = require(path.join(__dirname, '..', 'out', 'core', 'accountUsage.js'));

const snap = (pct, at) => ({ state: 'ok', bars: [{ key: 'five_hour', label: '5h', percent: pct, resetsAt: 9e12 }], plan: 'max', fetchedAt: at });

// ---------- the shelf itself ----------
{
    const shelf = new UsageShelf();
    const heard = [];
    const off = shelf.onReading((file, s, from) => heard.push([file, s.fetchedAt, from]));
    ok('a reading that answered is shelved and announced with who took it',
        shelf.put('/a/.credentials.json', snap(37, 100), 'plan') && heard.length === 1 && heard[0][2] === 'plan');
    ok('…and read back under another spelling of the same file',
        shelf.latest('/a/./.credentials.json')?.fetchedAt === 100);
    ok('an OLDER reading never replaces a newer one, and is not announced',
        !shelf.put('/a/.credentials.json', snap(20, 50), 'accounts') && shelf.latest('/a/.credentials.json').fetchedAt === 100 && heard.length === 1);
    ok('a refusal is about the request, not the account: never shelved',
        !shelf.put('/a/.credentials.json', { state: 'error', bars: [], plan: '', fetchedAt: 200 }, 'plan'));
    ok('no file, nothing shelved', !shelf.put('', snap(1, 300)) && shelf.latest('') === undefined);
    off();
    shelf.put('/a/.credentials.json', snap(40, 400), 'plan');
    ok('an unsubscribed surface hears nothing more', heard.length === 1);
    ok('newerReading picks by fetchedAt and tolerates either side missing',
        newerReading({ fetchedAt: 1 }, { fetchedAt: 2 }).fetchedAt === 2
        && newerReading(undefined, { fetchedAt: 2 }).fetchedAt === 2
        && newerReading({ fetchedAt: 3 }, undefined).fetchedAt === 3);
}

// ---------- the two services, one token ----------
async function crossReaders() {
    let t = 1_000_000;
    const now = () => t;
    const gate = new UsageGate();
    const shelf = new UsageShelf();
    const slot = { id: 's1', engine: 'claude', dir: path.join(require('os').tmpdir(), 'af-u160-slot'), label: 'one' };
    const file = slotCredentialsFile(slot);
    let pct = 37;
    let fetches = 0;
    const fetchImpl = async () => {
        fetches++;
        return { status: 200, body: JSON.stringify({ five_hour: { utilization: pct, resets_at: new Date(9e12).toISOString() } }) };
    };
    const readCreds = () => ({ token: 't', plan: 'max', expiresAt: t + 3_600_000 });
    const plan = new PlanUsageService({
        ttlMs: () => 300_000, minIntervalMs: () => 10_000, gate, shelf,
        credentialsFile: () => file, readCreds, fetchImpl, now
    });
    let announced = 0;
    const acct = new AccountUsageService({
        slots: () => [slot], ttlMs: () => 300_000, minIntervalMs: () => 10_000, gate, shelf,
        readCreds, fetchImpl, now, onRead: () => { announced++; }
    });
    const pctOf = s => (s && s.bars && s.bars[0] ? Math.round(s.bars[0].percent) : null);

    await plan.get();
    ok('the indicator reads the standing account first (37%)', pctOf(plan.current()) === 37 && fetches === 1);

    t += 20_000; pct = 54;
    await acct.refreshSlot('s1', 'user');
    ok('the accounts service reads the same token later (54%)', fetches === 2
        && acct.current()[0].percent === 54);
    ok('‼️ the indicator now draws 54%, not its own 37%', pctOf(plan.current()) === 54);
    const beat = await plan.get();
    ok('‼️ …and its next beat serves 54% without spending the token again', pctOf(beat) === 54 && fetches === 2);

    t += 400_000; pct = 61;
    const before = announced;
    await plan.get();
    ok('the other way round: the indicator reads 61%', fetches === 3 && pctOf(plan.current()) === 61);
    ok('‼️ …and the account box has it at once', acct.current()[0].percent === 61);
    acct.announce();
    ok('announce() tells the account surfaces what is known now', announced === before + 1);
}

// ---------- the extension hands ONE shelf to both and listens to it ----------
{
    const ext = require('fs').readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');
    ok('one shelf, handed to both services', /const usageShelf = new UsageShelf\(\);/.test(ext)
        && (ext.match(/gate: usageGate, shelf: usageShelf, minIntervalMs: usageMinIntervalMs/g) || []).length === 2);
    ok('a shelved reading repaints the toolbar and tells the account surfaces when the indicator took it',
        /usageShelf\.onReading\(\(file, _snap, from\) => \{\s*planUsageBar\.paint\(\);\s*if \(from !== 'accounts'\) \{ accountUsage\.announce\(\); \}/.test(ext));
}

crossReaders().then(() => {
    console.log(`test_usage_shelf: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
}).catch(e => { console.log('  FAIL crashed: ' + (e && e.stack || e)); process.exit(1); });

// Automation gate (compiled core/automation.js, pure): the CONTENT brake that
// answers "is there actually work?" for free, plus the farm-wide gate (master
// switch / pause-until / quiet hours) and the fired-vs-skipped evidence log.
// The measured problem this closes: one watch trigger woke opus 23 times over
// five nights, found nothing every time, and cost $70.90.
const path = require('path');
const fs = require('fs');
const os = require('os');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };

const {
    evaluatePrecondition, describePrecondition, parsePrecondition, expandDateTokens,
    gateBlock, inQuietHours, pauseExpired,
    appendAutomationEvent, rollupAutomationLog, AUTOMATION_LOG_MAX
} = require(path.join(__dirname, '..', 'out', 'core', 'automation.js'));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'af-automation-'));

// ---------- folderHasFiles: the real 02_MEDIALASTIR case ----------
{
    const dir = path.join(tmp, 'medialastir');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, '_LOG_.md'), '# log');

    const pre = { kind: 'folderHasFiles', path: dir, except: ['_LOG_.md'] };
    const empty = evaluatePrecondition(pre);
    ok('folder holding only its own _LOG_ has NO work', empty.ok === false);
    ok('skip reason says why', /no files waiting/.test(empty.detail));

    fs.writeFileSync(path.join(dir, 'photo.jpg'), 'x');
    const withWork = evaluatePrecondition(pre);
    ok('a real file makes it fire', withWork.ok === true);
    ok('fire detail counts the work', /1 file/.test(withWork.detail));

    // the except list is case-insensitive (Windows vaults)
    ok('except matching ignores case',
        evaluatePrecondition({ kind: 'folderHasFiles', path: dir, except: ['_log_.md', 'photo.jpg'] }).ok === false);

    // minCount: batch only when enough has piled up
    fs.writeFileSync(path.join(dir, 'photo2.jpg'), 'x');
    ok('minCount not yet reached',
        evaluatePrecondition({ kind: 'folderHasFiles', path: dir, except: ['_LOG_.md'], minCount: 3 }).ok === false);
    ok('minCount reached',
        evaluatePrecondition({ kind: 'folderHasFiles', path: dir, except: ['_LOG_.md'], minCount: 2 }).ok === true);

    // sub-folders count by default (the media skeleton holds nested files)
    const sub = path.join(dir, 'media_stem', 'raw');
    fs.mkdirSync(sub, { recursive: true });
    fs.writeFileSync(path.join(sub, 'clip.mp4'), 'x');
    ok('recursive by default', evaluatePrecondition(pre).detail.startsWith('3 file'));
    ok('recursive:false stays shallow',
        evaluatePrecondition({ ...pre, recursive: false }).detail.startsWith('2 file'));

    // an empty skeleton of sub-folders is still "no work"
    const skel = path.join(tmp, 'skeleton');
    fs.mkdirSync(path.join(skel, 'media_x', 'raw'), { recursive: true });
    ok('folders alone are not work', evaluatePrecondition({ kind: 'folderHasFiles', path: skel }).ok === false);

    ok('missing folder does not fire (and says so)', (() => {
        const v = evaluatePrecondition({ kind: 'folderHasFiles', path: path.join(tmp, 'nope') });
        return v.ok === false && /missing/.test(v.detail);
    })());
    ok('no path configured never fires',
        evaluatePrecondition({ kind: 'folderHasFiles' }).ok === false);
}

// ---------- fileMissing: the LifeOS day-file nudge ----------
{
    const cal = path.join(tmp, 'REPORT_DAY');
    fs.mkdirSync(cal);
    const pre = { kind: 'fileMissing', path: path.join(cal, '{today} Gun.md') };
    const v1 = evaluatePrecondition(pre);
    ok('missing day file fires the nudge', v1.ok === true);

    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    fs.writeFileSync(path.join(cal, `${stamp} Gun.md`), '# today');
    const v2 = evaluatePrecondition(pre);
    ok('once the day file exists the nudge is silent', v2.ok === false);
    ok('silence is explained', /already exists/.test(v2.detail));

    ok('{today} expands to a local YYYY-MM-DD', expandDateTokens('x/{today}.md') === `x/${stamp}.md`);
    ok('{yesterday} expands too', (() => {
        const y = new Date(); y.setDate(y.getDate() - 1);
        const ys = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
        return expandDateTokens('{yesterday}') === ys;
    })());
}

// ---------- pathChangedWithin / queueHasWork ----------
{
    const f = path.join(tmp, 'touched.md');
    fs.writeFileSync(f, 'x');
    ok('freshly touched path is within the window',
        evaluatePrecondition({ kind: 'pathChangedWithin', path: f, hours: 24 }).ok === true);
    const old = Date.now() - 40 * 3600_000;
    fs.utimesSync(f, new Date(old), new Date(old));
    const stale = evaluatePrecondition({ kind: 'pathChangedWithin', path: f, hours: 24 });
    ok('a stale path does not fire', stale.ok === false);
    ok('staleness is quantified', /unchanged for 4\d\.\dh/.test(stale.detail));

    ok('queueHasWork reads the injected count',
        evaluatePrecondition({ kind: 'queueHasWork', minCount: 3 }, { queueWorkCount: () => 4 }).ok === true);
    ok('queueHasWork below threshold holds off',
        evaluatePrecondition({ kind: 'queueHasWork', minCount: 3 }, { queueWorkCount: () => 2 }).ok === false);
    ok('queueHasWork with no injection is empty',
        evaluatePrecondition({ kind: 'queueHasWork' }).ok === false);
}

// ---------- opt-in: nothing existing changes behavior ----------
{
    ok('no precondition always passes', evaluatePrecondition(undefined).ok === true);
    ok('empty object passes', evaluatePrecondition({}).ok === true);
    ok('unknown kind fails OPEN (never silently suppresses work)',
        evaluatePrecondition({ kind: 'whatever' }).ok === true);
}

// ---------- parse / describe ----------
{
    ok('parse rejects an unknown kind', parsePrecondition({ kind: 'nope' }) === undefined);
    ok('parse rejects non-objects', parsePrecondition('folderHasFiles') === undefined);
    const p = parsePrecondition({ kind: 'folderHasFiles', path: ' /x ', except: ['_LOG_.md', ''], minCount: 2.9, hours: -1 });
    ok('parse trims the path', p.path === '/x');
    ok('parse drops empty except entries', p.except.length === 1);
    ok('parse floors minCount', p.minCount === 2);
    ok('parse drops a non-positive hours', p.hours === undefined);
    ok('describe is human-readable', /skip _LOG_\.md/.test(describePrecondition(p)));
    ok('describe of nothing is empty', describePrecondition(undefined) === '');
}

// ---------- the gate: master switch, pause-until, quiet hours ----------
{
    const at = (h, m) => { const d = new Date(2026, 6, 25, h, m, 0, 0); return d; };

    ok('open farm blocks nothing', gateBlock({}, at(10, 0)) === undefined);
    ok('undefined state blocks nothing', gateBlock(undefined, at(10, 0)) === undefined);

    const paused = gateBlock({ paused: true, pauseReason: 'reviewing cost' }, at(10, 0));
    ok('master switch blocks', paused && paused.kind === 'paused');
    ok('pause reason is carried to the user', /reviewing cost/.test(paused.reason));
    ok('master switch beats a manual run too',
        gateBlock({ paused: true }, at(10, 0), { manual: true }) !== undefined);

    const until = at(12, 0).getTime();
    ok('pause-until blocks while live',
        gateBlock({ pausedUntil: until }, at(11, 0)).kind === 'pausedUntil');
    ok('pause-until lapses on its own',
        gateBlock({ pausedUntil: until }, at(13, 0)) === undefined);
    ok('pauseExpired flags a lapsed pause', pauseExpired({ pausedUntil: until }, at(13, 0).getTime()) === true);
    ok('pauseExpired is false while live', pauseExpired({ pausedUntil: until }, at(11, 0).getTime()) === false);

    // the real setting: 23:00 -> 07:00 wraps past midnight
    const quiet = { quietFrom: '23:00', quietTo: '07:00' };
    ok('inside quiet before midnight', inQuietHours(quiet, at(23, 30)) === true);
    ok('inside quiet after midnight', inQuietHours(quiet, at(3, 0)) === true);
    ok('outside quiet in the morning', inQuietHours(quiet, at(9, 0)) === false);
    ok('quiet boundary start is inclusive', inQuietHours(quiet, at(23, 0)) === true);
    ok('quiet boundary end is exclusive', inQuietHours(quiet, at(7, 0)) === false);
    // a non-wrapping window still works
    ok('non-wrapping quiet window', inQuietHours({ quietFrom: '09:00', quietTo: '17:00' }, at(12, 0)) === true);
    ok('equal from/to means quiet hours off', inQuietHours({ quietFrom: '09:00', quietTo: '09:00' }, at(9, 30)) === false);
    ok('malformed times mean quiet hours off', inQuietHours({ quietFrom: 'nope', quietTo: '07:00' }, at(3, 0)) === false);

    const q = gateBlock(quiet, at(2, 0));
    ok('quiet hours block an unattended firing', q && q.kind === 'quiet');
    ok('quiet block reports when it lifts', new Date(q.until).getHours() === 7);
    ok('quiet hours never block a manual run',
        gateBlock(quiet, at(2, 0), { manual: true }) === undefined);
}

// ---------- the evidence log ----------
{
    let log = [];
    log = appendAutomationEvent(log, { ts: 1000, kind: 'trigger', id: 't1', title: 'media', outcome: 'skipped', reason: 'no files waiting' });
    log = appendAutomationEvent(log, { ts: 2000, kind: 'trigger', id: 't1', title: 'media', outcome: 'skipped', reason: 'no files waiting' });
    log = appendAutomationEvent(log, { ts: 3000, kind: 'trigger', id: 't1', title: 'media', outcome: 'fired', reason: '2 files waiting' });
    log = appendAutomationEvent(log, { ts: 3500, kind: 'schedule', id: 's1', title: 'batch', outcome: 'fired', reason: 'ok' });

    const roll = rollupAutomationLog(log, { now: 4000, windowMs: 10_000 });
    const t1 = roll.get('t1');
    ok('rollup counts firings', t1.fired === 1);
    ok('rollup counts skips', t1.skipped === 2);
    ok('rollup computes the skip rate', Math.round(t1.skipRate * 100) === 67);
    ok('rollup tracks the last firing', t1.lastFiredAt === 3000);
    ok('rollup tracks the last skip', t1.lastSkippedAt === 2000);
    ok('rollup separates automations', roll.get('s1').fired === 1 && roll.get('s1').skipped === 0);

    const windowed = rollupAutomationLog(log, { now: 4000, windowMs: 1200 });
    ok('rollup respects its window', windowed.get('t1').skipped === 0 && windowed.get('t1').fired === 1);

    let big = [];
    for (let i = 0; i < AUTOMATION_LOG_MAX + 50; i++) {
        big = appendAutomationEvent(big, { ts: i, kind: 'trigger', id: 'x', title: 'x', outcome: 'fired', reason: 'r' });
    }
    ok('log is capped', big.length === AUTOMATION_LOG_MAX);
    ok('cap keeps the NEWEST events', big[big.length - 1].ts === AUTOMATION_LOG_MAX + 49);
}

// ---------- the measured regression: 23 no-op wake-ups ----------
{
    // Replay the real shape: a folder holding only _LOG_.md, poked repeatedly by
    // filesystem noise. Every one of those firings used to cost an opus run.
    const dir = path.join(tmp, 'replay');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, '_LOG_.md'), '# log');
    const pre = { kind: 'folderHasFiles', path: dir, except: ['_LOG_.md'] };
    let woken = 0;
    for (let i = 0; i < 23; i++) {
        fs.utimesSync(dir, new Date(), new Date());       // the noise
        if (evaluatePrecondition(pre).ok) { woken++; }     // would we pay?
    }
    ok('23 noise events wake nobody', woken === 0);
    fs.writeFileSync(path.join(dir, 'real.png'), 'x');
    ok('the 24th, with real work, does wake', evaluatePrecondition(pre).ok === true);
}

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temp */ }

console.log(`test_automation: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

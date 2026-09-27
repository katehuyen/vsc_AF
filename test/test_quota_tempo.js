// S-107 — the quota whisper skipped a 95% line to 99%: the running session's own slot was read on
// the IDLE beat (slotActive placed a session only by its launch manifest, so a resumed Console run
// counted for the machine's standing sign-in), and the guard took a 5-minute-old figure as "under the
// line". The slot is now resolved the way the guard resolves it (card first, then the manifest), a
// Console card mid-turn makes its slot active, and a stale guard reading asks for a fresh one.
'use strict';
const fs = require('fs');
const path = require('path');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; } else { fail++; console.log('  FAIL ' + n); } };
const ext = fs.readFileSync(path.join(__dirname, '..', 'src', 'extension.ts'), 'utf8');

const slotOf = ext.slice(ext.indexOf('const sessionSlotOf = '), ext.indexOf('const QUOTA_STALE_MS'));
ok('one resolver for a session\'s slot: its Console card first, then its sealed launch manifest',
    /card\?\.account/.test(slotOf) && /launchManifests\(\)\.find\(m => m\.launchId === launchId\)\?\.account/.test(slotOf)
    && slotOf.indexOf('card?.account') < slotOf.indexOf('launchManifests()'));
ok('the quota guard reads through it', /const slotId = sessionSlotOf\(sessionId\);/.test(ext));

const active = ext.slice(ext.indexOf('const slotActive = '), ext.indexOf('const slotBeatMs = '));
ok('‼️ a Console card mid-turn makes its slot active (the working beat) whatever the monitor holds',
    /consoleHost\.list\(\)\.some\(c => c\.account === slotId && c\.status === 'working'\)/.test(active));
ok('‼️ the beat places a live session by the SAME resolver before the manifest-only lookup',
    /const own = sessionSlotOf\(s\.sessionId\) \|\| sessionAccountOf\(s\.sessionId\)\?\.id;/.test(active));

const sample = ext.slice(ext.indexOf('const sessionQuotaSample = '), ext.indexOf('const five = fiveHourOf(u);'));
ok('‼️ a guard reading older than two minutes asks for a fresh one of that slot', /const QUOTA_STALE_MS = 120_000;/.test(ext)
    && /now - \(Number\(u\.fetchedAt\) \|\| 0\) > QUOTA_STALE_MS/.test(sample) && /accountUsage\.refreshSlot\(slotId, 'auto'\)/.test(sample));
ok('…at most once a minute per slot, through the automatic door (holds and floors respected), and only with auto refresh on',
    /now - \(staleAsked\.get\(slotId\) \?\? 0\) > 60_000/.test(sample) && /accountsAutoRefresh\(\)/.test(sample) && /'auto'/.test(sample));
ok('…and never blocks the reading it was asked for', /void accountUsage\.refreshSlot/.test(sample));

console.log(`\ntest_quota_tempo: ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;

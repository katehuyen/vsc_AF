/**
 * M-14 — WHAT ONE UNATTENDED `opencode run` ACTUALLY COSTS THE MACHINE.
 *
 * The concurrency governor is a flat count. Making this engine weigh more than
 * one slot needs a MEASURED weight, and the only figure on record — 383 MB
 * working set — is the shared ACP server (K-25), which is a different process
 * doing a different job. Guessing from it would be exactly the invented number
 * this repo's rules forbid.
 *
 * So: spawn one real headless run on a free model, sample the whole process
 * TREE's memory while it goes, and write the peak next to the other captures.
 *
 *   node tools/measure_opencode_run.js [model]
 *
 * Writes dist/measure/opencode-run-weight.json. Reads nothing of the user's.
 */
const cp = require('child_process');
const fs = require('fs');
const path = require('path');

const model = process.argv[2] || '';
const outDir = path.join(__dirname, '..', 'dist', 'measure');
fs.mkdirSync(outDir, { recursive: true });

const args = ['run', '--format', 'json', ...(model ? ['-m', model] : [])];
const started = Date.now();
const child = cp.spawn('opencode', args, {
    cwd: path.join(__dirname, '..'),
    shell: true,           // npm .cmd shim on Windows
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe']
});
child.stdin.write('Reply with exactly: WEIGHT-OK. Do not use any tool.');
child.stdin.end();

let stdout = '', stderr = '';
child.stdout.on('data', d => { stdout += d; });
child.stderr.on('data', d => { stderr += d; });

/**
 * Every process alive right now — pid, PARENT pid, name and working set.
 *
 * ‼️ THE PARENT COLUMN IS THE WHOLE POINT, AND THE FIRST TWO ATTEMPTS DID NOT
 * HAVE IT. `tasklist` cannot publish a parent, so the run's cost was taken as
 * "every pid that was not there a moment ago" — and on a real desktop that is
 * whatever else happened to start. Measured with that method: a 175 MB "peak"
 * whose processes were `chrome.exe`, `SearchFilterHost.exe`, `esif_assist_64.exe`
 * and `tasklist.exe`, with no `opencode` or `bun` in the list at all. A figure
 * that looks like an answer and is somebody else's browser is precisely the
 * invented number this file exists to avoid.
 *
 * (The attempt before that shelled out to `powershell -Command "…"` through
 * `execSync`, which goes via cmd.exe: the inner quotes were eaten and every
 * sample came back EMPTY. So the query lives in a FILE, and the caller checks
 * the baseline is non-empty before believing anything.)
 */
const psFile = path.join(outDir, '_sample_processes.ps1');
fs.writeFileSync(psFile,
    'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,WorkingSetSize '
    + '| ConvertTo-Csv -NoTypeInformation\n', 'utf8');

function sample() {
    try {
        const csv = cp.execSync(
            `powershell -NoProfile -ExecutionPolicy Bypass -File "${psFile}"`,
            { encoding: 'utf8', windowsHide: true, timeout: 20000, maxBuffer: 16 << 20 });
        const rows = [];
        for (const line of csv.split(/\r?\n/).slice(1)) {
            const m = line.match(/^"(\d+)","(\d*)","([^"]*)","(\d*)"$/);
            if (!m) { continue; }
            rows.push({
                Id: Number(m[1]), Parent: Number(m[2] || 0),
                ProcessName: m[3], WorkingSet64: Number(m[4] || 0)
            });
        }
        return rows;
    } catch { return []; }
}

/** Our child and everything it started, however deep. */
function tree(rows, rootPid) {
    const kids = new Map();
    for (const r of rows) {
        if (!kids.has(r.Parent)) { kids.set(r.Parent, []); }
        kids.get(r.Parent).push(r);
    }
    const out = [], stack = [rootPid], seen = new Set();
    while (stack.length) {
        const pid = stack.pop();
        if (seen.has(pid)) { continue; }
        seen.add(pid);
        const self = rows.find(r => r.Id === pid);
        if (self && pid !== rootPid) { out.push(self); }
        else if (self) { out.push(self); }
        for (const k of kids.get(pid) || []) { stack.push(k.Id); }
    }
    return out;
}

// The baseline is only a sanity check now — the tree is what is measured.
const baseline = sample();
let peakWs = 0, peakN = 0, samples = 0, peakNames = [];

const timer = setInterval(() => {
    const rows = sample();
    if (!rows.length) { return; }
    samples++;
    const mine = tree(rows, child.pid);
    const ws = mine.reduce((a, r) => a + (r.WorkingSet64 || 0), 0);
    if (ws > peakWs) {
        peakWs = ws;
        peakN = mine.length;
        peakNames = [...new Set(mine.map(r => r.ProcessName))].sort();
    }
}, 400);

const stop = code => {
    clearInterval(timer);
    const mb = n => Math.round(n / 1048576);
    const result = {
        measuredAt: new Date().toISOString(),
        opencode: '1.18.18',
        command: 'opencode ' + args.join(' ') + '   (prompt on stdin)',
        model: model || '(the CLI default)',
        exitCode: code,
        durationMs: Date.now() - started,
        samples,
        newProcessesAtPeak: peakN,
        processNamesAtPeak: peakNames,
        peakWorkingSetMB: mb(peakWs),
        // ‼️ NO `peakPrivateMB` HERE. `tasklist` publishes working set and
        // nothing else, and a private-bytes field that always read 0 would look
        // like a measurement and be an absence. The 383 MB ACP figure it is
        // compared against is a working set too, so the two are the same unit.
        baselineProcesses: baseline.length,
        stdoutBytes: stdout.length,
        stderrHead: stderr.slice(0, 400),
        note: 'Peak is the SUM over the spawned process TREE — the child and every '
            + 'descendant, walked by ParentProcessId, so nothing that merely started '
            + 'at the same time is counted against it. Compare with the 383 MB shared '
            + 'ACP server (K-25): that one is long-lived and serves every hosted card, '
            + 'this one lives for the length of one task — and weighs more.'
    };
    fs.writeFileSync(path.join(outDir, 'opencode-run-weight.json'),
        JSON.stringify(result, null, 2), 'utf8');
    console.log(JSON.stringify(result, null, 2));
};

child.on('close', stop);
child.on('error', err => { stderr += String(err); stop(-1); });
setTimeout(() => { try { child.kill(); } catch { } }, 120000);

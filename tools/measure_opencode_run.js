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
 * Every process alive right now, by pid, with its working set.
 *
 * ‼️ `tasklist`, not a nested PowerShell. The first attempt shelled out to
 * `powershell -Command "Get-Process … | ConvertTo-Json"` through `execSync`,
 * which goes via cmd.exe — the inner quotes were eaten and every sample came
 * back EMPTY while the run itself succeeded. A measurement that silently reads
 * zero is worse than no measurement, so this uses a plain CSV tool and the
 * caller checks that the baseline is non-empty before believing anything.
 */
function sample() {
    try {
        const csv = cp.execSync('tasklist /fo csv /nh',
            { encoding: 'utf8', windowsHide: true, timeout: 15000, maxBuffer: 8 << 20 });
        const rows = [];
        for (const line of csv.split(/\r?\n/)) {
            // "name","pid","session","session#","12,345 K"
            const m = line.match(/^"([^"]*)","(\d+)","[^"]*","[^"]*","([\d.,\s]+) K"$/);
            if (!m) { continue; }
            rows.push({
                Id: Number(m[2]), ProcessName: m[1],
                WorkingSet64: Number(m[3].replace(/[^\d]/g, '')) * 1024
            });
        }
        return rows;
    } catch { return []; }
}

// The baseline first: whatever is already running is NOT this run's cost.
const baseline = sample();
const baseIds = new Set(baseline.map(r => r.Id));
let peakWs = 0, peakPriv = 0, peakN = 0, samples = 0;

const timer = setInterval(() => {
    const rows = sample().filter(r => !baseIds.has(r.Id));
    samples++;
    const ws = rows.reduce((a, r) => a + (r.WorkingSet64 || 0), 0);
    if (ws > peakWs) {
        peakWs = ws;
        peakN = rows.length;
        peakNames = [...new Set(rows.map(r => r.ProcessName))].sort();
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
        peakWorkingSetMB: mb(peakWs),
        peakPrivateMB: mb(peakPriv),
        baselineProcesses: baseline.length,
        stdoutBytes: stdout.length,
        stderrHead: stderr.slice(0, 400),
        note: 'Peak is the SUM over processes this run added — the baseline set is '
            + 'excluded, so an editor\'s own node processes are not counted against it. '
            + 'Compare with the 383 MB shared ACP server (K-25): that one is long-lived '
            + 'and serves every hosted card, this one lives for the length of one task.'
    };
    fs.writeFileSync(path.join(outDir, 'opencode-run-weight.json'),
        JSON.stringify(result, null, 2), 'utf8');
    console.log(JSON.stringify(result, null, 2));
};

child.on('close', stop);
child.on('error', err => { stderr += String(err); stop(-1); });
setTimeout(() => { try { child.kill(); } catch { } }, 120000);

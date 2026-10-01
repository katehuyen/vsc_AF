/**
 * Windows Firewall for the phone host: read the facts firewallVerdict decides
 * from, and add the one rule that lets phones in — the rule an installer would
 * have added, behind Windows' own admin prompt (UAC), because a VS Code
 * extension has no installer. Nothing else on the machine is changed: no
 * network profile, no other rule except a BLOCK rule on this very program.
 */
import * as cp from 'child_process';
import { firewallVerdict, readFacts, type FirewallVerdict } from './firewallVerdict';

/** The rule's stable Name (its key in Windows); the DisplayName is what a person sees in wf.msc. */
export const RULE_NAME = 'AgentFarmPhoneLink';
export const RULE_DISPLAY = 'Agent Farm - phone app';
/** Tailscale's address range: the phone host's tailscale mode listens there. */
const TAILNET = '100.64.0.0/10';
/** ERROR_CANCELLED: the person said No to the admin prompt. */
const CANCELLED = 1223;

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;

/** The PowerShell lines that pick this program's enabled inbound rules out of the ActiveStore. */
const programRules = (exe: string) =>
    `$want = [Environment]::ExpandEnvironmentVariables(${q(exe)})\n`
    + '$prog = @(Get-NetFirewallApplicationFilter -PolicyStore ActiveStore | Where-Object { $_.Program -and '
    + '([Environment]::ExpandEnvironmentVariables($_.Program) -ieq $want) } | Get-NetFirewallRule | '
    + 'Where-Object { $_.Enabled -eq \'True\' -and $_.Direction -eq \'Inbound\' })\n';

export function factsScript(exe: string): string {
    return '$ErrorActionPreference = \'Stop\'\n'
        + '$cat = @{ \'Public\' = \'Public\'; \'Private\' = \'Private\'; \'DomainAuthenticated\' = \'Domain\' }\n'
        + '$active = @(Get-NetConnectionProfile | ForEach-Object { $cat[$_.NetworkCategory.ToString()] } | Where-Object { $_ } | Sort-Object -Unique)\n'
        + '$profiles = @(Get-NetFirewallProfile -PolicyStore ActiveStore)\n'
        + '$enabled = @($profiles | Where-Object { $_.Enabled -eq \'True\' } | ForEach-Object { $_.Name })\n'
        + '$shields = @($profiles | Where-Object { $_.AllowInboundRules -eq \'False\' } | ForEach-Object { $_.Name })\n'
        + programRules(exe)
        + '$allow = @($prog | Where-Object { $_.Action -eq \'Allow\' } | ForEach-Object { $_.Profile.ToString() })\n'
        + '$block = @($prog | Where-Object { $_.Action -eq \'Block\' } | ForEach-Object { $_.Profile.ToString() })\n'
        + `$ours = @(Get-NetFirewallRule -PolicyStore ActiveStore -Name ${q(RULE_NAME)} -ErrorAction SilentlyContinue | Where-Object { $_.Enabled -eq 'True' })\n`
        + '$ourPorts = @($ours | ForEach-Object { [string](($_ | Get-NetFirewallPortFilter).LocalPort -join \',\') })\n'
        + '$ourProfiles = @($ours | ForEach-Object { $_.Profile.ToString() })\n'
        + '[pscustomobject]@{ active = $active; enabled = $enabled; shields = $shields; allow = $allow; block = $block; '
        + 'ourPorts = $ourPorts; ourProfiles = $ourProfiles } | ConvertTo-Json -Compress\n';
}

/** Runs ELEVATED: one rule for this program and port, from the local subnet and the tailnet only. */
export function allowScript(exe: string, port: number): string {
    if (!Number.isInteger(port) || port < 1 || port > 65535) { throw new Error('bad port ' + port); }
    return '$ErrorActionPreference = \'Stop\'\ntry {\n'
        + `Remove-NetFirewallRule -Name ${q(RULE_NAME)} -ErrorAction SilentlyContinue\n`
        + `New-NetFirewallRule -Name ${q(RULE_NAME)} -DisplayName ${q(RULE_DISPLAY)} `
        + `-Description ${q('Lets the Agent Farm phone app reach the farm on this computer: this port, this program, local network and Tailscale only.')} `
        + `-Direction Inbound -Action Allow -Protocol TCP -LocalPort ${port} -Program ${q(exe)} `
        + `-RemoteAddress 'LocalSubnet','${TAILNET}' -Profile Any | Out-Null\n`
        + programRules(exe).replace(/-PolicyStore ActiveStore /, '')
        + '$prog | Where-Object { $_.Action -eq \'Block\' } | Disable-NetFirewallRule\n'
        + 'exit 0\n} catch { [Console]::Error.WriteLine($_.Exception.Message); exit 2 }\n';
}

/** Asks Windows for the admin prompt and runs the script behind it; the exit code comes back out. */
export function elevateScript(inner: string): string {
    return '$ErrorActionPreference = \'Stop\'\ntry {\n'
        + '$p = Start-Process -FilePath powershell.exe -Verb RunAs -WindowStyle Hidden -Wait -PassThru '
        + `-ArgumentList '-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand','${encode(inner)}'\n`
        + 'exit $p.ExitCode\n} catch {\n'
        + `$e = $_.Exception; while ($e) { if ($e.NativeErrorCode -eq ${CANCELLED}) { exit ${CANCELLED} }; $e = $e.InnerException }\n`
        + '[Console]::Error.WriteLine($_.Exception.Message); exit 1\n}\n';
}

/** -EncodedCommand: base64 of UTF-16LE, so no quoting survives to be wrong. */
export const encode = (script: string) => Buffer.from(script, 'utf16le').toString('base64');

export type RunPs = (script: string, timeoutMs: number) => Promise<{ code: number | null; stdout: string; stderr: string }>;

export const runPs: RunPs = (script, timeoutMs) => new Promise(resolve => {
    cp.execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encode(script)],
        { windowsHide: true, timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024, encoding: 'utf8' },
        (err, stdout, stderr) => resolve({
            code: err ? (typeof (err as { code?: unknown }).code === 'number' ? (err as { code: number }).code : null) : 0,
            stdout: String(stdout ?? ''), stderr: String(stderr ?? '')
        }));
});

export interface FirewallGuardOptions {
    /** the program that listens: the extension host's own executable */
    exe: string;
    port(): number;
    platform?: string;
    run?: RunPs;
}

export interface AllowResult { ok: boolean; cancelled?: boolean; error?: string; verdict: FirewallVerdict }

/** Remembers the last verdict so a card can draw it synchronously; check() and allow() refresh it. */
export function firewallGuard(o: FirewallGuardOptions) {
    const run = o.run ?? runPs;
    const windows = (o.platform ?? process.platform) === 'win32';
    let last: FirewallVerdict | undefined;
    const check = async (): Promise<FirewallVerdict | undefined> => {
        if (!windows) { last = undefined; return undefined; }
        const r = await run(factsScript(o.exe), 30_000);
        let raw: unknown;
        try { raw = r.code === 0 ? JSON.parse(r.stdout.trim()) : undefined; } catch { raw = undefined; }
        last = firewallVerdict(readFacts(raw), o.port());
        return last;
    };
    const allow = async (): Promise<AllowResult> => {
        if (!windows) { return { ok: false, error: 'Only Windows has this firewall.', verdict: firewallVerdict(undefined, o.port()) }; }
        const r = await run(elevateScript(allowScript(o.exe, o.port())), 5 * 60_000);
        const verdict = (await check()) ?? firewallVerdict(undefined, o.port());
        if (r.code === CANCELLED) { return { ok: false, cancelled: true, error: 'Windows asked for permission and the answer was No.', verdict }; }
        if (r.code !== 0) { return { ok: false, error: (r.stderr.trim() || 'the rule could not be added') + ` (exit ${r.code})`, verdict }; }
        return verdict.state === 'closed'
            ? { ok: false, error: 'The rule was added, but Windows Firewall still stops a phone: ' + verdict.text, verdict }
            : { ok: true, verdict };
    };
    return { check, allow, verdict: () => last };
}

export type FirewallGuard = ReturnType<typeof firewallGuard>;

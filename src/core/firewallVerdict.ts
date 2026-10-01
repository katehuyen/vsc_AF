/**
 * Will Windows Firewall let a phone reach the phone host? Decided from the
 * facts src/remote/firewall.ts reads off Windows, for every network the
 * computer is on right now. Loopback bypasses the firewall, so this machine
 * cannot try it from inside — the rules are the only witness.
 */

export type FwProfile = 'Domain' | 'Private' | 'Public';

/** What Windows says, as read by the facts script (every list in the ActiveStore). */
export interface FirewallFacts {
    /** firewall profiles of the networks connected now */
    active: string[];
    /** profiles whose firewall is on */
    enabled: string[];
    /** profiles set to "block all incoming connections, including allowed apps" */
    shields: string[];
    /** Profile of each enabled inbound ALLOW rule for the listening program ("Any", "Private, Public") */
    allow: string[];
    /** Profile of each enabled inbound BLOCK rule for the listening program */
    block: string[];
    /** LocalPort of each enabled Agent Farm phone rule */
    ourPorts: string[];
    /** Profile of each enabled Agent Farm phone rule */
    ourProfiles: string[];
}

export type FirewallState = 'open' | 'closed' | 'unknown';
export type FirewallCause = 'no-rule' | 'blocked-by-rule' | 'shields';

export interface FirewallVerdict {
    state: FirewallState;
    /** the connected networks a phone cannot get in through */
    closed: FwProfile[];
    cause?: FirewallCause;
    /** one click (and Windows' own admin prompt) would open it */
    canFix: boolean;
    text: string;
}

const PROFILES: FwProfile[] = ['Domain', 'Private', 'Public'];
const asList = (v: unknown): string[] => Array.isArray(v) ? v.map(String) : v === undefined || v === null ? [] : [String(v)];

/** A rule's Profile covers a network profile: "Any", or the profile named in its comma list. */
export function coversProfile(ruleProfile: string, p: FwProfile): boolean {
    const parts = ruleProfile.split(',').map(s => s.trim());
    return parts.includes('Any') || parts.includes(p);
}

/** The facts JSON as PowerShell writes it: a single item may arrive as a bare string. */
export function readFacts(raw: unknown): FirewallFacts | undefined {
    if (!raw || typeof raw !== 'object') { return undefined; }
    const o = raw as Record<string, unknown>;
    return {
        active: asList(o.active), enabled: asList(o.enabled), shields: asList(o.shields),
        allow: asList(o.allow), block: asList(o.block), ourPorts: asList(o.ourPorts), ourProfiles: asList(o.ourProfiles)
    };
}

const NET: Record<FwProfile, string> = { Domain: 'work-domain', Private: 'private', Public: 'public' };
const nets = (ps: FwProfile[]) => ps.map(p => NET[p]).join(' and ') + (ps.length > 1 ? ' networks' : ' network');

export function firewallVerdict(f: FirewallFacts | undefined, port: number): FirewallVerdict {
    if (!f) {
        return { state: 'unknown', closed: [], canFix: false,
            text: 'Could not read Windows Firewall, so whether a phone gets in is not known.' };
    }
    const active = PROFILES.filter(p => f.active.includes(p));
    if (!active.length) {
        return { state: 'unknown', closed: [], canFix: false, text: 'This computer is on no network right now.' };
    }
    const portOk = (lp: string) => lp === 'Any' || lp.split(',').map(s => s.trim()).includes(String(port));
    const ourCovers = (p: FwProfile) => f.ourProfiles.some((prof, i) => portOk(f.ourPorts[i] ?? '') && coversProfile(prof, p));
    const causes = new Map<FwProfile, FirewallCause>();
    for (const p of active) {
        if (!f.enabled.includes(p)) { continue; }
        if (f.shields.includes(p)) { causes.set(p, 'shields'); continue; }
        if (f.block.some(r => coversProfile(r, p))) { causes.set(p, 'blocked-by-rule'); continue; }
        if (ourCovers(p) || f.allow.some(r => coversProfile(r, p))) { continue; }
        causes.set(p, 'no-rule');
    }
    if (!causes.size) {
        return { state: 'open', closed: [], canFix: false, text: 'Windows Firewall lets a phone in on this network.' };
    }
    const closed = [...causes.keys()];
    const all = [...causes.values()];
    if (all.includes('shields')) {
        return { state: 'closed', closed, cause: 'shields', canFix: false,
            text: `Windows Firewall blocks every incoming connection on the ${nets(closed)} this computer is on `
                + '("Block all incoming connections" is ticked), so no phone gets in and no rule can change that. '
                + 'Untick it in Windows Security > Firewall & network protection.' };
    }
    const cause: FirewallCause = all.includes('blocked-by-rule') ? 'blocked-by-rule' : 'no-rule';
    return { state: 'closed', closed, cause, canFix: true,
        text: (cause === 'blocked-by-rule'
            ? `A Windows Firewall rule blocks VS Code on the ${nets(closed)} this computer is on, so a phone cannot get in.`
            : `Windows Firewall does not let a phone in on the ${nets(closed)} this computer is on.`)
            + ' "Allow phones in" fixes it with one click: Windows asks once for permission, and Agent Farm adds one rule '
            + `that lets only its own port (${port}) in, only from your local network and your Tailscale network. `
            + 'No network setting changes.' };
}

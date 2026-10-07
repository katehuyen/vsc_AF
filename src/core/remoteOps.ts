/**
 * The phone host on the bridge: remote.status / listen / pair / firewall / devices / revoke / scope / audit.
 * The handlers only check arguments and call what the extension hands in — the
 * same calls the Devices card makes — so they are dispatched in tests as they are.
 */
import { argStr, need, optBool, optNum, optStr, type BridgeOpSpec } from './bridge';
import { isListenMode, type ListenMode } from './remoteListen';

export interface RemoteAuditQuery { device?: string; what?: string[]; since?: number; limit?: number }

export interface RemoteOpsDeps {
    mode(): ListenMode;
    status(): object;
    setRemoteListen(mode: ListenMode, port?: number): Promise<object>;
    pairingLink(): { link: string; addresses: string[] } | { error: string };
    devices(): object[];
    revoke(id?: string): number;
    setScope(id: string, scope: string): { ok: true; device: object; from: string } | { ok: false; error: string };
    /** Throws on a kind it does not know. */
    audit(q: RemoteAuditQuery): object[];
    firewall(): Promise<object>;
    allowFirewall(): Promise<object>;
    /** the farm's name, as a phone sees it */
    farmName(): string;
}

export function remoteOps(d: RemoteOpsDeps): BridgeOpSpec[] {
    return [
        {
            op: 'remote.status',
            describe: 'The phone host: listening?, mode (agentFarm.remote.listen: off|local|lan|tailscale), host, port, '
                + 'the addresses a pairing QR names, the certificate fingerprint, open sockets, farm id/name, and why it is '
                + 'not listening. args: none',
            handler: () => ({ ...d.status(), mode: d.mode() })
        },
        {
            op: 'remote.listen',
            describe: 'Choose where the phone host listens — writes agentFarm.remote.listen (and .port) and applies it. '
                + 'Only the task-runner window listens. args: mode (off|local|lan|tailscale), port? (1024-65535)',
            handler: async (args) => {
                const mode = argStr(args, 'mode');
                need(isListenMode(mode), 'mode must be one of off, local, lan, tailscale');
                const raw = optStr(args, 'port');
                const port = raw === '' ? undefined : Number(raw);
                need(port === undefined || (Number.isInteger(port) && port >= 1024 && port <= 65535), 'port must be 1024-65535');
                return d.setRemoteListen(mode as ListenMode, port);
            }
        },
        {
            op: 'remote.pair',
            describe: 'A pairing link for a new phone (agentfarm://pair?…, shown as a QR): a one-time code valid 10 minutes, '
                + 'the farm id, the certificate fingerprint and the listening addresses. Refused while not listening. args: none',
            handler: () => {
                const p = d.pairingLink();
                if ('error' in p) { need(false, p.error); }
                return p;
            }
        },
        {
            op: 'remote.firewall',
            describe: 'Will Windows Firewall let a phone in? Reads the rules afresh for every network this computer is on: '
                + 'state (open|closed|unknown; absent off Windows), the closed network profiles, cause (no-rule|blocked-by-rule|shields), '
                + 'canFix, and the sentence the Agent Farm app card shows. Changes nothing. args: none',
            handler: () => d.firewall()
        },
        {
            op: 'remote.firewall.allow',
            describe: 'Let phones in through Windows Firewall — the card\'s "allow phones in": Windows shows its admin prompt '
                + 'ON THIS COMPUTER\'S SCREEN and a person must answer Yes; then one rule is added (VS Code, the phone port, TCP, '
                + 'local subnet + Tailscale only) and inbound block rules on VS Code are switched off. Returns ok, cancelled?, error?, '
                + 'and the fresh verdict. args: none',
            handler: () => d.allowFirewall()
        },
        {
            op: 'remote.devices',
            describe: 'The paired phones: id, name, scope (read|answer|manage|admin), user, pairedAt, lastSeen?, lastAddress?, revoked. '
                + 'Works while not listening. args: none',
            handler: () => ({ devices: d.devices() })
        },
        {
            op: 'remote.scope',
            describe: 'Grant a paired phone another scope — read (sees the farm) | answer (+ questions, permissions) | manage '
                + '(+ starts and stops work; the pairing default) | admin (+ settings, accounts, agent files, this host). Its open '
                + 'connection holds the new scope at once; the change is written to the audit log. Returns device and from. '
                + 'args: device (an id from remote.devices), scope',
            handler: (args) => {
                const r = d.setScope(argStr(args, 'device'), argStr(args, 'scope'));
                if (!r.ok) { need(false, r.error); }
                return r;
            }
        },
        {
            op: 'remote.audit',
            describe: 'What paired phones did, newest first: pair, pair-refused (a wrong code), connect, refused (a handshake turned '
                + 'away, with the reason), call (a bridge op that changes something, or any the scope refused), action (a press on a '
                + 'page), revoke, scope. Each entry: ts, what, device, name, user, ok, op?, page?, detail?, address?. Looks are not '
                + 'written. Works while not listening. args: device?, what? (comma list of the kinds), since? (ms), limit? (default 100)',
            handler: (args) => {
                const what = (Array.isArray(args.what) ? args.what.map(String) : optStr(args, 'what').split(','))
                    .map(s => s.trim()).filter(Boolean);
                const since = optNum(args, 'since', NaN);
                const limit = optNum(args, 'limit', NaN);
                return {
                    entries: d.audit({
                        ...(optStr(args, 'device') ? { device: optStr(args, 'device') } : {}),
                        ...(what.length ? { what } : {}),
                        ...(isFinite(since) ? { since } : {}),
                        ...(isFinite(limit) ? { limit } : {})
                    })
                };
            }
        },
        {
            op: 'remote.revoke',
            describe: 'Revoke a paired phone — its open sockets end at once and it must pair again. '
                + 'args: device (an id from remote.devices) | all (true = every phone)',
            handler: (args) => {
                const all = optBool(args, 'all');
                const device = optStr(args, 'device');
                need(device || all, 'Pass device (an id from remote.devices) or all:true.');
                return { revoked: d.revoke(all ? undefined : device) };
            }
        },
        // X-449 — the two ops a phone asks of a farm whose VS Code may be closed (src/service/serviceRemote.ts answers them then)
        {
            op: 'farm.away',
            describe: 'Is Agent Farm away? Here it is running, so away:false. While VS Code is closed the headless service answers the '
                + 'phone instead: away:true, since when, and the last snapshot with its age. args: none',
            handler: () => ({ away: false, farm: d.farmName() })
        },
        {
            op: 'farm.open',
            describe: 'Start Agent Farm from a phone. Here it is already running, so nothing starts; while VS Code is closed the '
                + 'headless service starts it. args: none',
            handler: () => ({ opening: false, already: true, farm: d.farmName() })
        }
    ];
}

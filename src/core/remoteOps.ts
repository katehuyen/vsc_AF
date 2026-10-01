/**
 * The phone host on the bridge: remote.status / listen / pair / firewall / devices / revoke.
 * The handlers only check arguments and call what the extension hands in — the
 * same calls the Devices card makes — so they are dispatched in tests as they are.
 */
import { argStr, need, optBool, optStr, type BridgeOpSpec } from './bridge';
import { isListenMode, type ListenMode } from './remoteListen';

export interface RemoteOpsDeps {
    mode(): ListenMode;
    status(): object;
    setRemoteListen(mode: ListenMode, port?: number): Promise<object>;
    pairingLink(): { link: string; addresses: string[] } | { error: string };
    devices(): object[];
    revoke(id?: string): number;
    firewall(): Promise<object>;
    allowFirewall(): Promise<object>;
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
            describe: 'The paired phones: id, name, scope (read|answer|manage|admin), pairedAt, revoked. Works while not listening. args: none',
            handler: () => ({ devices: d.devices() })
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
        }
    ];
}

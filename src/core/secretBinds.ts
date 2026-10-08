/**
 * B-31 — A FARM SECRET BOUND BY ITS NAME, FROM THE BRIDGE.
 *
 * An agent that adds a provider route (the free-model radar), points Gatekeeper at a key or wires an
 * MCP server could not finish the job: naming which Farm Secret signs it in was a press in the Engines
 * page only, so every such run stopped at the one step a person had to take. Here the NAME travels and
 * nothing else: no op reads a value, takes one, or makes one; a name the vault does not hold is refused.
 *
 * What still guards the key (X-488 / X-492): a route is bound to the endpoint it has NOW, so a route
 * moved afterwards has no key until a person confirms it in the Engines page; every bind made here is
 * announced on Notices with who made it and for which endpoint, so a person sees what a press used to show.
 *
 * Pure apart from the MCP config files it reads and writes (core/mcp.ts); the vault, the routes, the
 * settings and the board come in as deps.
 */
import type { AgentInfo } from './agents';
import { argStr, BridgeCaller, BridgeOpSpec, need, optStr } from './bridge';
import { readAgentMcpServers, readServerRawDef, updateMcpServer } from './mcp';
import type { SecretInfo } from './secrets';

export interface SecretBindDeps {
    /** the vault's rows — names and metadata, never a value */
    secrets(): SecretInfo[];
    routes(): { id: string; label: string; baseUrl?: string }[];
    /** the routes signing in with this secret by name */
    routesUsing(name: string): string[];
    /** Agent Farm's own readers of this name (Gatekeeper, media, the phone bridge…) */
    readers(name: string): string[];
    /** agentFarm.kapici.keyName as set ('' = Gatekeeper tries its candidates) */
    kapiciKeyName(): string;
    workflows(): { id: string; title: string; text: string }[];
    getAgents(): AgentInfo[];
    /** the Engines page's own "Use a Farm Secret": bound to the route's endpoint now, its own key collected */
    bindRoute(id: string, name: string): Promise<void>;
    setKapiciKey(name: string): Promise<void>;
    announce(title: string, body: string): void;
}

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const secretMissing = (name: string): string =>
    `Secret '${name}' not found in Farm Secrets vault — secrets.list names every secret it holds.`;

/** What an MCP server's env carries for a Farm Secret: Claude Code fills `${NAME}` from the session's environment. */
export const envRef = (name: string): string => '${' + name + '}';

const who = (from?: BridgeCaller): string => (from?.sessionId ? `session ${from.sessionId.slice(0, 8)}` : 'an agent');

/** Every MCP server (agent/server) whose env or headers name this secret. */
export function mcpUsing(agents: AgentInfo[], name: string): string[] {
    const ref = envRef(name);
    const out: string[] = [];
    for (const a of agents) {
        for (const s of readAgentMcpServers(a)) {
            const def = readServerRawDef(s) ?? {};
            if (JSON.stringify([def.env ?? {}, def.headers ?? {}]).includes(ref)) { out.push(`${a.name}/${s.name}`); }
        }
    }
    return out;
}

function secretOf(d: SecretBindDeps, name: string): SecretInfo {
    need(name, 'Pass `secretName` — one of the names secrets.list returns.');
    const s = d.secrets().find(x => x.name === name);
    need(s, secretMissing(name));
    return s as SecretInfo;
}

/** providers.bindSecret, and providers.add / providers.set with `secretRef`. */
export async function bindRouteSecret(d: SecretBindDeps, id: string, name: string, from?: BridgeCaller): Promise<Record<string, unknown>> {
    const route = d.routes().find(r => r.id === id);
    need(route, `no provider profile with the id "${id}" — providers.list shows them`);
    secretOf(d, name);
    await d.bindRoute(id, name);
    const at = route!.baseUrl || 'its first-party endpoint';
    d.announce(`Farm Secret ${name} now signs in the route ${route!.label}`,
        `Bound over the bridge by ${who(from)}, for ${at}. Sessions started on this route receive it. If the route is moved to another address, the key stays behind until you confirm it in the Engines page.`);
    return { id, secretName: name, endpoint: route!.baseUrl ?? '', note: `${id} signs in with ${name} at ${at}; its own key, if it had one, was collected.` };
}

export function secretBindOps(d: SecretBindDeps): BridgeOpSpec[] {
    return [
        {
            op: 'secrets.list',
            describe: 'B-31 — the Farm Secrets vault by NAME: each secret\'s name, description, agent scope, whether it is Farm-only, when it was made and changed, and where it is bound — `boundTo.routes` (provider routes signing in with it), `boundTo.kapici` (Gatekeeper\'s key), `boundTo.mcpServers` (agent/server whose env names it), `boundTo.workflows` (workflows writing {secret:NAME}) — plus `readers`, Agent Farm\'s own readers of that name. ‼️ NO VALUE IS EVER RETURNED, and no op takes or makes one: storing a value stays in the Secrets page. args: name? (one secret)',
            handler: (args) => {
                const one = optStr(args, 'name').trim();
                const kap = d.kapiciKeyName();
                const flows = d.workflows();
                const rows = d.secrets().filter(s => !one || s.name === one).map(s => ({
                    name: s.name, description: s.description, agents: s.agents, farmOnly: s.farmOnly,
                    createdAt: s.createdAt, updatedAt: s.updatedAt,
                    boundTo: {
                        routes: d.routesUsing(s.name), kapici: kap === s.name,
                        mcpServers: mcpUsing(d.getAgents(), s.name),
                        workflows: flows.filter(w => w.text.includes(`{secret:${s.name}}`)).map(w => w.id)
                    },
                    readers: d.readers(s.name)
                }));
                need(!one || rows.length, secretMissing(one));
                return { names: rows.map(r => r.name), secrets: rows, count: rows.length };
            }
        },
        {
            op: 'providers.bindSecret',
            describe: 'B-31 — sign a provider route in with a Farm Secret, by name: what the Engines page\'s "Use a Farm Secret" does. The secret is bound to the endpoint the route has NOW (X-492: moved later, the route has no key until a person confirms it in the Engines page); the route\'s own key, if it had one, is collected; its revision counts up; the bind is announced on Notices. A name the vault does not hold is refused. No value is read or taken. args: id, secretName',
            handler: (args, from) => bindRouteSecret(d, argStr(args, 'id').trim().toLowerCase(), argStr(args, 'secretName').trim(), from)
        },
        {
            op: 'kapici.bindSecret',
            describe: 'B-31 — make a Farm Secret Gatekeeper\'s key, by name (agentFarm.kapici.keyName); Gatekeeper takes it at its next decision. A name the vault does not hold is refused; the bind is announced on Notices. args: secretName',
            handler: async (args, from) => {
                const name = argStr(args, 'secretName').trim();
                secretOf(d, name);
                await d.setKapiciKey(name);
                d.announce(`Farm Secret ${name} is now Gatekeeper's key`, `Bound over the bridge by ${who(from)} (agentFarm.kapici.keyName).`);
                return { secretName: name, setting: 'agentFarm.kapici.keyName', note: `Gatekeeper reads ${name} from its next decision on.` };
            }
        },
        {
            op: 'mcp.servers.bindSecret',
            describe: 'B-31 — give an agent\'s MCP server a Farm Secret as an environment variable, by name: writes `envVar: "${NAME}"` into the server\'s env in its config file (a one-time .afbak backup beside it). Claude Code fills it at launch from the session\'s environment, where Agent Farm puts the secret — so it reaches sessions Agent Farm starts. Refused: a name the vault does not hold, a Farm-only secret (no session ever receives one), a secret scoped to other agents, and a name or envVar that is not letters, digits and _. args: agent (id or name), server, envVar, secretName',
            handler: async (args, from) => {
                const ref = argStr(args, 'agent').trim();
                const agent = d.getAgents().find(a => a.id === ref || a.name.toLowerCase() === ref.toLowerCase());
                need(agent, `Agent "${ref}" not found — agents.list shows the current farm.`);
                const envVar = argStr(args, 'envVar').trim();
                need(ENV_NAME.test(envVar), `"${envVar}" is not an environment variable name — letters, digits and _, not starting with a digit.`);
                const name = argStr(args, 'secretName').trim();
                const s = secretOf(d, name);
                need(!s.farmOnly, `${name} is Farm-only: Agent Farm reads it itself and no session's environment receives it, so an MCP server could never be given it.`);
                need(!s.agents.length || s.agents.includes(agent!.id), `${name} is given only to ${s.agents.join(', ')} — ${agent!.name}'s sessions would not receive it.`);
                need(ENV_NAME.test(name), `${name} cannot be written as ${envRef(name)} in an MCP config — rename it in the Secrets page to letters, digits and _ (routes follow a rename).`);
                const servers = readAgentMcpServers(agent!);
                const srv = servers.find(x => x.name === argStr(args, 'server').trim());
                need(srv, `${agent!.name} has no MCP server "${optStr(args, 'server')}" — it has: ${servers.map(x => x.name).join(', ') || 'none'}.`);
                const def = readServerRawDef(srv!);
                need(def, `${srv!.source} could not be read as JSON.`);
                const env = { ...((def!.env as Record<string, string>) ?? {}), [envVar]: envRef(name) };
                need(updateMcpServer(srv!, { ...def, env }), `${srv!.source} could not be written.`);
                d.announce(`Farm Secret ${name} is now ${envVar} for ${agent!.name}'s MCP server ${srv!.name}`,
                    `Bound over the bridge by ${who(from)}, in ${srv!.source}.`);
                return { agent: agent!.name, server: srv!.name, envVar, secretName: name, file: srv!.source, note: 'Takes effect when a session starts.' };
            }
        }
    ];
}

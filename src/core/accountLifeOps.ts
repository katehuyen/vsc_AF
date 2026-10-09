import { argStr, BridgeRegistry, need } from './bridge';
import { planSignOut, setAsleep, SIGN_OUT_NOTE } from './accountLife';
import { findSlot, forgetActive, slotLabel } from './accountStore';
import { EngineAccountSlot, SlotHealth } from './engineAccounts';

/** What the account life needs from its host — the store, the disk and the surfaces. */
export interface AccountLifeDeps {
    /** every stored row, asleep ones included */
    stored(): EngineAccountSlot[];
    write(list: EngineAccountSlot[]): Promise<void>;
    active(): Record<string, string>;
    writeActive(map: Record<string, string>): Promise<void>;
    /** a session or a task is running as this account right now */
    busy(id: string): boolean;
    /** the agents whose own standing sign-in on this engine is this slot */
    standingAgents(slot: EngineAccountSlot): string[];
    /** read off the disk now, never a cached verdict */
    health(slot: EngineAccountSlot): SlotHealth;
    /** queue one figure read */
    readFigure(id: string): void;
    /** the usage indicator follows a change of the machine-wide choice */
    followed(engine: string): void;
    /** remove one file; true when it was there */
    removeFile(file: string): boolean;
    repaint(): void;
    now(): number;
}

export interface LifeAnswer { refusal: string; slot?: EngineAccountSlot; note: string }
export interface SignOutAnswer extends LifeAnswer { removed: string[] }

export function accountLifeActions(d: AccountLifeDeps) {
    const find = (id: string): { clean: string; slot?: EngineAccountSlot } => {
        const clean = String(id || '').trim();
        return { clean, slot: findSlot(d.stored(), clean) };
    };
    const missing = (clean: string): string => `No account "${clean}" is stored on this machine — accounts.list shows what is.`;

    /** X-530 — put to sleep: kept whole, never read, never offered, never placed on. */
    const disable = async (id: string): Promise<LifeAnswer> => {
        const { clean, slot } = find(id);
        if (!slot) { return { refusal: missing(clean), note: '' }; }
        if (slot.disabled) { return { refusal: '', slot, note: `${slotLabel(slot)} is already disabled.` }; }
        await d.write(setAsleep(d.stored(), slot.id, true, d.now()));
        const said = [`${slotLabel(slot)} is disabled — its folder and sign-in are kept; nothing reads its quota or starts on it until it is enabled.`];
        const active = d.active();
        if (active[slot.engine] === slot.id) {
            await d.writeActive(forgetActive(active, slot.id));
            d.followed(slot.engine);
            said.push(`It was the machine-wide "use this next" for ${slot.engine}; new sessions there open on the main sign-in.`);
        }
        const agents = d.standingAgents(slot);
        if (agents.length) {
            said.push(`${agents.join(', ')} stand on it by name; their launches step over it to the next choice and say so.`);
        }
        if (d.busy(slot.id)) { said.push('A session or task already running on it keeps going; nothing new starts on it.'); }
        d.repaint();
        return { refusal: '', slot, note: said.join(' ') };
    };

    /** X-530 — woken: its sign-in is read off the disk at once, and a dead one is sent to 🔑. */
    const enable = async (id: string): Promise<LifeAnswer & { health?: SlotHealth }> => {
        const { clean, slot } = find(id);
        if (!slot) { return { refusal: missing(clean), note: '' }; }
        if (!slot.disabled) { return { refusal: '', slot, health: d.health(slot), note: `${slotLabel(slot)} is already enabled.` }; }
        await d.write(setAsleep(d.stored(), slot.id, false, d.now()));
        const health = d.health(slot);
        if (health === 'ready') { d.readFigure(slot.id); }
        d.repaint();
        return {
            refusal: '', slot, health,
            note: health === 'ready'
                ? `${slotLabel(slot)} is enabled and its sign-in works; its figure is being read.`
                : `${slotLabel(slot)} is enabled, but its sign-in ${health === 'unreadable' ? 'could not be read' : 'needs renewing'} — `
                + 'sign in again with the 🔑 on its card (accounts.reauth).'
        };
    };

    /** X-531 — the grant goes, the slot stays: label, settings, history and the row are kept. */
    const signOut = async (id: string): Promise<SignOutAnswer> => {
        const { clean, slot } = find(id);
        if (!slot) { return { refusal: missing(clean), note: '', removed: [] }; }
        if (d.busy(slot.id)) {
            return {
                refusal: `"${slotLabel(slot)}" is running a session or a task right now — signing out would pull its sign-in `
                    + 'from under it. Finish or cancel it, then try again.', slot, note: '', removed: []
            };
        }
        const plan = planSignOut(slot);
        if (plan.refusal) { return { refusal: plan.refusal, slot, note: '', removed: [] }; }
        const removed = plan.files.filter(f => d.removeFile(f));
        d.repaint();
        const said = [removed.length
            ? `${slotLabel(slot)} is signed out — the account stays; the 🔑 on its card signs it in again.`
            : `${slotLabel(slot)} had no sign-in stored — nothing to remove.`];
        if (d.active()[slot.engine] === slot.id) {
            said.push(`It is still the machine-wide "use this next" for ${slot.engine}: a session there would open signed out until it is signed in again or another is chosen.`);
        }
        if (removed.length) { said.push(SIGN_OUT_NOTE); }
        return { refusal: '', slot, note: said.join(' '), removed };
    };

    return { disable, enable, signOut };
}

export type AccountLife = ReturnType<typeof accountLifeActions>;

/** The bridge doors — each calls the action the card's button calls. `del` is the existing forget-and-delete. */
export function registerAccountLifeOps(
    bridge: BridgeRegistry, life: AccountLife,
    del: (id: string) => Promise<{ refusal: string; result?: Record<string, unknown> }>
): void {
    const answer = (r: LifeAnswer, disabled: boolean, extra: Record<string, unknown> = {}) => {
        need(!r.refusal, r.refusal);
        return { id: r.slot?.id, engine: r.slot?.engine, disabled, ...extra, note: r.note };
    };
    bridge.register([
        {
            op: 'accounts.disable',
            describe: 'X-530 — PUT AN ACCOUNT TO SLEEP without deleting anything: its folder, sign-in, settings and history stay, '
                + 'and Enable brings it back at once. While asleep nothing reads its quota (zero requests), no picker, pool, policy or '
                + 'relay offers or places a run on it, and a launch, task or chain that names it outright is refused by name. '
                + 'If it was the machine-wide "use this next" that choice is cleared (the main sign-in answers); an agent standing on it '
                + 'by name steps over it to the next choice. A run already on it keeps going. args: id',
            handler: async (args) => {
                return answer(await life.disable(argStr(args, 'id')), true);
            }
        },
        {
            op: 'accounts.enable',
            describe: 'X-530 — WAKE AN ASLEEP ACCOUNT. Its sign-in is read off the disk at once: `health` "ready" and its figure is '
                + 'queued for a read; anything else means it needs signing in again (accounts.reauth / the 🔑 on its card). args: id',
            handler: async (args) => {
                const r = await life.enable(argStr(args, 'id'));
                return answer(r, false, { health: r.health ?? null });
            }
        },
        {
            op: 'accounts.signout',
            describe: 'X-531 — SIGN AN ACCOUNT OUT WITHOUT DROPPING IT: only the files holding its grant are removed (Claude: '
                + '.credentials.json); the row, label, settings, identity file and history stay, the card reads "needs signing in" at '
                + 'once, and accounts.reauth signs it in again into the same slot. Refused while a session or task runs on it. Local '
                + 'removal is not revocation — the provider honours the tokens until they expire or are revoked there. Answers '
                + '`removed` (file names, never contents). args: id',
            handler: async (args) => {
                const r = await life.signOut(argStr(args, 'id'));
                need(!r.refusal, r.refusal);
                return { id: r.slot?.id, engine: r.slot?.engine, removed: r.removed.map(f => f.replace(/^.*[\\/]/, '')), note: r.note };
            }
        },
        {
            op: 'accounts.delete',
            describe: 'X-530 — DELETE AN ACCOUNT FOR GOOD: its session records are moved to the pool first, then the row, its folder '
                + '(sign-in tokens included) and its merge base go; the standing choice is cleared. Refused while a session or task runs on '
                + 'it, or when a record cannot be moved. Irreversible — to keep it for later, accounts.disable instead. The same act as '
                + 'accounts.forget with deleteFiles true. args: id',
            handler: async (args) => {
                const r = await del(argStr(args, 'id'));
                need(!r.refusal, r.refusal);
                return r.result ?? {};
            }
        }
    ]);
}

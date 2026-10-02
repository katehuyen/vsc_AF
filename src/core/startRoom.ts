/**
 * X-469 — ONE ANSWER TO "MAY A SESSION START ON THIS ACCOUNT NOW?"
 *
 * Every unattended start asks it here: a policy's pick, a relay successor
 * staying on its account, a sentry round, a task carried to another account,
 * `accounts.status`, the spawn seam. Measured 2026-10-02 (chn_muqifjzc001n2b):
 * five doors answered it with five lines — the policies 70, the stay 90, the
 * sentry, the carry and `accounts.status` a constant 95, a named slot nothing at
 * all — so each fix closed one door and left the others open, and a relay leg
 * was opened on an account at 89% and handed over at once.
 *
 * The wall is the user's Account ceiling (`defaultAccountCeiling`), or a wall a
 * rule, campaign, task or caller names for itself — and NEVER above the quota
 * handover line, because a session started past that line is told to hand
 * over on its first reading. Pure: settings and figures in, verdict out.
 * `test/test_start_wall.js` fails the build on a door that states a wall of
 * its own as a number.
 */
import { effectiveCeiling } from './accountPolicy';
import { SlotUsage, slotIsUsable } from './accountUsage';
import { percentNow } from './usageFloor';

export interface StartWall {
    /** the five-hour share at or past which no session starts */
    value: number;
    /** where the figure comes from, in the user's words */
    why: string;
}

export interface StartWallInput {
    /** agentFarm.defaultAccountCeiling as resolved (the Account ceiling box) */
    setting: unknown;
    /** agentFarm.quotaHandoverPct — 0 = off */
    handoverPct: unknown;
    /** a wall the rule, campaign, task or caller names for itself; absent = the Account ceiling */
    own?: unknown;
    /** what names `own`, for the sentence ("the campaign's wall") */
    ownWhy?: string;
}

const pctOf = (v: unknown): number | undefined => {
    if (v === undefined || v === null || v === '') { return undefined; }
    const n = Number(v);
    return Number.isFinite(n) && n > 0 && n <= 100 ? n : undefined;
};

export function startWall(i: StartWallInput): StartWall {
    const own = pctOf(i.own);
    if (own === undefined) { return effectiveCeiling(i.setting, i.handoverPct); }
    const name = String(i.ownWhy ?? '').trim() || 'its own wall';
    const q = Number(i.handoverPct);
    if (Number.isFinite(q) && q > 0 && q < own) {
        return { value: q, why: `${q}% — the quota handover line (quotaHandoverPct), below ${name} ${own}%: a session started past it would hand over at once` };
    }
    return { value: own, why: `${own}% — ${name}` };
}

export interface StartRoom {
    ok: boolean;
    /** the figure the verdict stood on (a floor counts); -1 = not known */
    pct: number;
    why: string;
}

/**
 * The verdict for one account. An account whose plan publishes no figure is
 * room, as everywhere (slotIsUsable's doctrine) — the verdict says so rather
 * than inventing a number.
 */
export function startRoom(u: SlotUsage | undefined, wall: StartWall, now = Date.now()): StartRoom {
    if (!u) { return { ok: true, pct: -1, why: 'no figure is known for it — room, by the doctrine' }; }
    const pct = percentNow(u, now);
    if (slotIsUsable(u, wall.value, now)) {
        return {
            ok: true, pct,
            why: pct < 0 ? 'no figure is known for it — room, by the doctrine' : `${Math.round(pct)}% of its window, under the ${wall.value}% wall (${wall.why})`
        };
    }
    if (u.state === 'expired' || u.state === 'no-auth') { return { ok: false, pct, why: 'its sign-in is rejected' }; }
    return { ok: false, pct, why: `${Math.round(pct)}% of its window, at or past the ${wall.value}% wall (${wall.why})` };
}

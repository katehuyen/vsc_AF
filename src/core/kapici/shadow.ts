/**
 * X-413 — one road for every consumer's agentFarm.kapici.<consumer> setting.
 * off: Kapici is never called; today's path runs exactly as before.
 * shadow: today's path runs and its result is returned untouched; Kapici is
 * asked AFTER it, in the background, with today's decision as `actual`, so the
 * audit line says whether the two agreed. Nothing waits for it and nothing it
 * does (an error, a timeout) reaches the flow.
 * on: Kapici first; a confident verdict it can turn into a result wins, and
 * anything else — low confidence, a failure, a verdict the consumer cannot use
 * — falls to today's path.
 */
import { KapiciVerdict } from './types';

export type ConsumerSetting = 'off' | 'shadow' | 'on';
export const CONSUMER_SETTINGS: readonly ConsumerSetting[] = ['off', 'shadow', 'on'];

export function consumerMode(v: unknown): ConsumerSetting {
    return v === 'shadow' || v === 'on' ? v : 'off';
}

export interface Gate<T> {
    mode: ConsumerSetting;
    /** The conventional path — what runs when Kapici is off, and the fallback when it cannot decide. */
    today(): Promise<T>;
    /** Kapici's evaluate for this consumer; `actual` is today's decision in shadow mode. */
    ask(mode: 'on' | 'shadow', actual?: string): Promise<KapiciVerdict>;
    /** Today's result as a decision string, for the shadow comparison. */
    decisionOf(t: T): string | undefined;
    /** A confident verdict as this consumer's result; undefined = not usable, today's path decides. */
    fromVerdict(v: KapiciVerdict): T | undefined;
    /** Where a background shadow failure is told (never thrown). */
    log?(line: string): void;
}

export interface Gated<T> { value: T; by: 'today' | 'kapici'; verdict?: KapiciVerdict; shadow?: Promise<KapiciVerdict | undefined> }

export async function gate<T>(g: Gate<T>): Promise<Gated<T>> {
    if (g.mode === 'on') {
        let v: KapiciVerdict | undefined;
        try { v = await g.ask('on'); } catch (e) { g.log?.(`kapici: ${(e as Error)?.message ?? e} — today's path decides`); }
        if (v && v.fallback === undefined) {
            let t: T | undefined;
            try { t = g.fromVerdict(v); } catch { t = undefined; }
            if (t !== undefined) { return { value: t, by: 'kapici', verdict: v }; }
        }
        return { value: await g.today(), by: 'today', ...(v ? { verdict: v } : {}) };
    }
    const value = await g.today();
    if (g.mode !== 'shadow') { return { value, by: 'today' }; }
    let actual: string | undefined;
    try { actual = g.decisionOf(value); } catch { actual = undefined; }
    const shadow = Promise.resolve()
        .then(() => g.ask('shadow', actual))
        .catch(e => { g.log?.(`kapici shadow: ${(e as Error)?.message ?? e}`); return undefined; });
    return { value, by: 'today', shadow };
}

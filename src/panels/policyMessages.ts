import { AccountPolicy, PolicyStep } from '../core/accountPolicy';

/**
 * X-305 — THE POLICIES SECTION'S PRESSES, ANSWERED IN ONE PLACE.
 *
 * `media/afPolicies.js` draws the same rules on the Engines page and on the
 * Accounts page, and a save or a delete posts the same message from both. Two
 * switches answering it is how one page comes to store a rule the other
 * refuses, so the arms live here and each panel hands in the two things that
 * differ: how to put the refusal into ITS section, and how to redraw ITSELF.
 *
 * ‼️ BOTH ARMS CALL THE FUNCTION THE BRIDGE OP CALLS. The page hands over a
 * form; whether the rule could ever choose, whether another rule steps through
 * the one being removed, and the write itself are decided in `savePolicy` /
 * `deletePolicy`, so `policies.save` and a button cannot come to mean two
 * different things.
 */

/** What a rule comes to on one engine at this moment. */
export interface PolicyNow { engine: string; picks: string; note: string; refusal: string }

/** The rules as a page draws them: every engine that holds a slot, the built-in
 *  four and the named ones — each with what it comes to NOW per engine, because
 *  a rule is asked about an engine and the page draws the engines side by side. */
export interface PolicyMatrix {
    engines: string[];
    builtIn: { id: string; label: string; detail: string; now: PolicyNow[] }[];
    rules: (AccountPolicy & { now: PolicyNow[] })[];
    ceiling: number;
}

/** The writers the section needs — each answers with the refusal to show, or
 *  '' when it went through. */
export interface PolicyMessageDeps {
    policies(): PolicyMatrix;
    savePolicy(rule: AccountPolicy): Promise<string>;
    deletePolicy(name: string): Promise<string>;
}

/** What differs per page. */
export interface PolicySurface {
    /** put a line into the section (`pol-msg`); empty means "written" and closes the form */
    say(text: string): Promise<void>;
    /** redraw the page from its data */
    refresh(): void;
}

/**
 * ‼️ THE PAGE HANDS OVER A FORM, NOT A RECORD. Everything the webview posts as
 * a rule goes through this allow-list, so a field the page invented — or one a
 * compromised page appended — is dropped rather than stored. The SHAPE (name,
 * chain, ceilings) is then judged by the core, not here.
 */
export function policyFromForm(input: unknown): AccountPolicy {
    const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
    const str = (v: unknown): string => String(v ?? '').trim();
    const pct = (v: unknown): number | undefined => {
        const n = typeof v === 'number' ? v : Number(str(v));
        return Number.isFinite(n) && n > 0 ? n : undefined;
    };
    const chain: PolicyStep[] = (Array.isArray(o.chain) ? o.chain : []).map((raw): PolicyStep => {
        const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
        const models = Array.isArray(s.models) ? s.models.map(str).filter(Boolean)
            : str(s.models).split(',').map(x => x.trim()).filter(Boolean);
        const ceiling = pct(s.ceiling);
        return {
            ...(str(s.account) ? { account: str(s.account) } : {}),
            ...(str(s.policy) ? { policy: str(s.policy) } : {}),
            ...(ceiling !== undefined ? { ceiling } : {}),
            ...(models.length ? { models } : {})
        };
    });
    const ceiling = pct(o.ceiling);
    return {
        name: str(o.name),
        chain,
        ...(str(o.note) ? { note: str(o.note) } : {}),
        ...(str(o.engine) ? { engine: str(o.engine).toLowerCase() } : {}),
        ...(ceiling !== undefined ? { ceiling } : {}),
        // X-324 — passed as typed; whether it is a strategy at all is the core's verdict
        ...(str(o.strategy) ? { strategy: str(o.strategy).toLowerCase() as AccountPolicy['strategy'] } : {})
    };
}

/**
 * Answer one message from the policies section. Returns true when the message
 * was the section's, so the panel's own switch sees only what is left.
 *
 * A refusal is shown WHERE IT HAPPENED — in the form that was submitted — not
 * as a toast that outlives it. An empty one closes the form and redraws: the
 * page reads `pol-msg` with no text as "written".
 */
export async function handlePolicyMessage(
    msg: { type: string;[k: string]: unknown },
    deps: PolicyMessageDeps,
    surface: PolicySurface
): Promise<boolean> {
    const wrote = async (refusal: string): Promise<void> => {
        await surface.say(refusal);
        if (!refusal) { surface.refresh(); }
    };
    switch (msg.type) {
        case 'policySave':
            await wrote(await deps.savePolicy(policyFromForm(msg.policy)));
            return true;
        case 'policyDelete':
            await wrote(await deps.deletePolicy(String(msg.name ?? '')));
            return true;
    }
    return false;
}

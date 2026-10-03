/**
 * The interface language on the extension-host side — LOADED, not reimplemented (U-189).
 *
 * Same arrangement as `src/core/aftime.ts`: `media/afI18n.js` is the one
 * implementation, pages load it in the webview and this loads it in Node, and
 * every catalog it lists (`media/afI18n.<id>.js`) is added here once. `media/`
 * sits two levels above `out/core` in development and in the VSIX alike.
 */
import * as path from 'path';

export interface UiLanguage {
    /** The language the interface is drawn in — one with a catalog, else `en`. */
    lang: string;
    /** What dates and numbers are formatted with; '' is the system's own formats. */
    locale: string;
}

interface I18nModule {
    LANGS: { id: string; name: string }[];
    files(id: string): string[];
    resolve(tag: unknown): string;
    setLanguage(tag: string, locale?: string): void;
    add(id: string, table: Record<string, string>): void;
    t(text: unknown, vars?: Record<string, unknown>): string;
    label(text: unknown): string;
    lang(): string;
    locale(): string;
}

const MEDIA = path.join(__dirname, '..', '..', 'media');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const impl: I18nModule = require(path.join(MEDIA, 'afI18n.js'));
for (const l of impl.LANGS) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    for (const f of impl.files(l.id)) { impl.add(l.id, require(path.join(MEDIA, f))); }
}

/** Every language the interface can be set to. */
export const LANGUAGES: ReadonlyArray<{ id: string; name: string }> = impl.LANGS;
/** The media files a language's catalog is made of, in load order (none for English). */
export const catalogFiles = (id: string): string[] => impl.files(id);

/**
 * What `agentFarm.language` resolves to. `auto` draws the interface in VS
 * Code's display language when there is a catalog for it (else English) and
 * leaves dates and numbers in the system's own formats, as they always were.
 * A chosen language sets both.
 */
export function resolveUiLanguage(setting: unknown, displayLanguage: string): UiLanguage {
    const s = typeof setting === 'string' && setting.trim() ? setting.trim() : 'auto';
    if (s === 'auto') { return { lang: impl.resolve(displayLanguage), locale: '' }; }
    const lang = impl.resolve(s);
    return { lang, locale: lang };
}

/** Make `ui` the language the extension host draws in. */
export function applyUiLanguage(ui: UiLanguage): void { impl.setLanguage(ui.lang, ui.locale); }

export const t = (text: string, vars?: Record<string, unknown>): string => impl.t(text, vars);
export const tLabel = (text: string): string => impl.label(text);
export const uiLang = (): string => impl.lang();
export const uiLocale = (): string => impl.locale();

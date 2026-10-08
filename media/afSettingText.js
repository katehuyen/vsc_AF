// Agent Farm — Farm Settings: a setting's description as a person reads it (U-227).
// A package.json description may carry **bold**, `code` and #agentFarm.key# (another setting, by key);
// drawn as typed they read as noise. plain() takes the marks out and names the other setting the way
// the page does; the row, the search hits and the description panel all draw that one text.
(function (factory) {
    'use strict'; // i18n-exempt
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
    if (typeof window !== 'undefined') { window.AFSettingText = api; }
})(function () {
    'use strict'; // i18n-exempt
    const REF = /#(agentFarm\.[\w.]+)#/g;

    /** `text` without markdown marks; nameOf(key) → the name a person knows that setting by. */
    function plain(text, nameOf) {
        return String(text == null ? '' : text)
            .replace(REF, (m, key) => '"' + (nameOf ? nameOf(key) : key) + '"')
            .replace(/\*\*([^*\n]+)\*\*/g, '$1')
            // a code span is one backtick each side; a ``` fence the text tells the reader to type is left whole
            .replace(/(^|[^`])`([^`\n]+)`(?!`)/g, '$1$2');
    }

    /** The first sentence of a plain text — what a row says when the catalog has no summary for it yet. */
    function firstSentence(text) {
        const s = String(text || '').trim();
        const m = s.match(/^[\s\S]*?[.!?](?=\s|$)/);
        return (m ? m[0] : s).trim();
    }

    return { plain, firstSentence };
});

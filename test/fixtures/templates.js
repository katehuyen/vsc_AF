/**
 * The create form, with and without saved templates.
 *
 * ‼️ BOTH STATES ARE THE POINT, and the empty one more than the other. The
 * template list ships EMPTY — nothing is guessed at — so the very first thing
 * every installation sees is the "no templates yet" state, and if that renders
 * as a disabled dropdown the feature reads as broken on the one screen where
 * it has to read as a door. It is a sentence saying where templates come from.
 *
 * Shares its projects with `parts.js`; the two are split so a full-page shot of
 * either fits inside one picture.
 */
const parts = require('./parts.js');

module.exports = {
    script: 'projects.js',
    data: parts.data,
    variants: () => [
        {
            id: 'new', label: 'New project → template picker',
            data: parts.data({ newForm: {} })
        },
        {
            // the same form with one CHOSEN: the line under the control has to
            // describe what that template carries, not what templates are
            id: 'new-chosen', label: 'New project → a template chosen',
            data: parts.data({ newForm: { template: 'Ürün projesi' } })
        },
        {
            id: 'new-empty', label: 'New project → no templates saved yet',
            data: parts.data({ newForm: {}, templates: [] })
        }
    ]
};

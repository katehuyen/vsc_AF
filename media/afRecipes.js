// Agent Farm — THE TOOL STEP'S RECIPES, AS DATA. (M-49)
//
// The ten ffmpeg recipes and their presets, declared once: `src/core/mediaRecipes.ts`
// builds their argument lists from this, `media/afTool.js` draws the step form
// from it, and `media/afFlex.js` makes every parameter a step-level flex point
// `tool.<recipe>.<param>` out of it. Lives in `media/` because the page needs it
// too — the arrangement `media/afFlex.js` proved. Loaded BEFORE afFlex.js.
(function (factory) {
    'use strict';
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
    if (typeof window !== 'undefined') { window.AFRecipes = api; }
})(function () {
    'use strict';

    const OVERWRITES = ['never', 'always', 'suffix'];

    const n = (name, dflt, min, max, describe) => ({ name: name, type: 'number', default: dflt, min: min, max: max, describe: describe });
    const e = (name, dflt, options, describe) => ({ name: name, type: 'enum', default: dflt, options: options, describe: describe });

    const RECIPES = [
        { id: 'split', label: 'Split into parts', input: true, describe: 'Cut the input into parts of a fixed length, optionally overlapping; each part is re-encoded so it starts on its own frame.',
            params: [n('segmentSec', 10, 1, 3600, 'Seconds per part.'), n('overlapSec', 0, 0, 60, 'Seconds each part repeats of the one before.')] },
        { id: 'concat', label: 'Join parts', input: false, describe: 'Join files end to end, in the order given (stream copy: they must share codecs and size).',
            params: [{ name: 'files', type: 'files', required: true, describe: 'The files to join, in order.' }, { name: 'name', type: 'text', default: 'joined.mp4', describe: 'The output file name.' }] },
        { id: 'extractAudio', label: 'Extract the audio', input: true, describe: 'Write the input\'s sound track on its own.',
            params: [e('format', 'm4a', ['m4a', 'wav', 'mp3'], 'The audio file type.')] },
        { id: 'muxAudio', label: 'Put audio back', input: true, describe: 'Lay an audio file under the input\'s picture (the original sound, say), shifted by an offset for sync.',
            params: [{ name: 'audio', type: 'file', required: true, describe: 'The audio file to lay under the picture.' }, n('offsetSec', 0, -60, 60, 'Seconds the audio is shifted: positive = later.')] },
        { id: 'reframe', label: 'Reframe', input: true, describe: 'Change the aspect: crop to it from the centre, or fit inside it with bars.',
            params: [e('aspect', '9:16', ['16:9', '9:16', '1:1'], 'The target aspect.'), e('mode', 'crop', ['crop', 'pad'], 'crop = fill the frame, losing the sides · pad = keep all, add bars.'), n('height', 1920, 240, 4320, 'The output height in pixels (pad).')] },
        { id: 'burnSubtitles', label: 'Burn in subtitles', input: true, describe: 'Draw a subtitle file (.srt, .ass) onto the picture.',
            params: [{ name: 'subtitles', type: 'file', required: true, describe: 'The subtitle file.' }] },
        { id: 'short', label: 'Cut a short', input: true, describe: 'Cut one moment out of the input, reframe it and draw its subtitles, in a single re-encode (three recipes chained would re-encode three times).',
            params: [n('start', 0, 0, 86400, 'Where the moment starts, seconds into the input.'), { name: 'end', type: 'number', min: 0, max: 86400, required: true, describe: 'Where the moment ends, seconds into the input.' },
                e('aspect', '9:16', ['9:16', '1:1', '16:9'], 'The target aspect.'), e('mode', 'crop', ['crop', 'pad'], 'crop = fill the frame, losing the sides · pad = keep all, add bars.'), n('height', 1920, 240, 4320, 'The output height in pixels (pad).'),
                { name: 'srt', type: 'text', describe: 'The subtitles as SRT text, timed from the start of the moment (00:00:00,000 = its first frame); blank = no subtitles.' }] },
        { id: 'keyframes', label: 'Key frames', input: true, describe: 'Save stills: N evenly spaced, or one at each scene change.',
            params: [e('mode', 'count', ['count', 'scene'], 'count = N evenly spaced · scene = at each cut.'), n('count', 8, 1, 200, 'How many (count).'), n('threshold', 0.3, 0.05, 0.9, 'How big a change is a cut (scene).')] },
        { id: 'loudnorm', label: 'Normalise loudness', input: true, describe: 'Bring the sound to a broadcast loudness (EBU R128); the picture is copied untouched.',
            params: [n('lufs', -16, -36, -5, 'Target integrated loudness (LUFS): -16 for the web, -23 for broadcast.'), n('truePeak', -1.5, -9, 0, 'Ceiling for peaks (dBTP).')] },
        { id: 'transcode', label: 'Transcode', input: true, describe: 'Re-encode to a codec and quality.',
            params: [e('codec', 'h264', ['h264', 'h265', 'vp9'], 'The video codec.'), n('crf', 23, 0, 51, 'Quality: lower is better and bigger.'), e('preset', 'medium', ['ultrafast', 'fast', 'medium', 'slow'], 'Speed against size.'), n('audioKbps', 160, 32, 512, 'Audio bitrate.')] }
    ];

    /** Named parameter sets — the one a production reaches for, not a copy of a recipe. */
    const PRESETS = [
        { name: 'Omni Flash parts', recipe: 'split', params: { segmentSec: 10, overlapSec: 0 } },
        { name: 'Vertical short (9:16)', recipe: 'reframe', params: { aspect: '9:16', mode: 'crop' } },
        { name: 'Web loudness', recipe: 'loudnorm', params: { lufs: -16, truePeak: -1.5 } }
    ];

    const recipe = id => RECIPES.find(r => r.id === id);
    const preset = name => (name ? PRESETS.find(p => p.name.toLowerCase() === String(name).toLowerCase()) : undefined);
    /** A parameter's flex point id. */
    const paramPoint = (recipeId, name) => 'tool.' + recipeId + '.' + name;

    /** A parameter's value when the step leaves it blank: the preset's, else the recipe's own. */
    function inherited(recipeId, presetName, name) {
        const p = preset(presetName);
        if (p && p.recipe === recipeId && Object.prototype.hasOwnProperty.call(p.params, name)) {
            return { value: p.params[name], from: 'preset', preset: p.name };
        }
        const r = recipe(recipeId);
        const q = r && r.params.find(x => x.name === name);
        return { value: q ? q.default : undefined, from: 'builtin' };
    }

    return { OVERWRITES: OVERWRITES, RECIPES: RECIPES, PRESETS: PRESETS, recipe: recipe, preset: preset, paramPoint: paramPoint, inherited: inherited };
});

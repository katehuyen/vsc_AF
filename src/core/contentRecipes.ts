/**
 * M-53 — THE RECIPE BOOK: whole workflows installed in one pick. A recipe is the
 * `workflows.add` argument object, so it is saved through the very validator a
 * hand-written chain meets. Content recipes name ROLES, never agents — the roles
 * box or the showrunner fills them where the workflow is used — and pin no judge
 * or supervisor model, so the cost preset in force (Economy · Balanced ·
 * Quality) decides them. The quick recipes ask for one agent and use it.
 * Titles, prompts, goals and input descriptions are the user's Turkish content.
 */
export interface RecipeArgs {
    title: string;
    steps: Record<string, unknown>[];
    inputs?: { name: string; type?: string; default?: string; required?: boolean; description?: string; choices?: string[] }[];
    wake?: unknown;
    goal?: string;
    criteria?: string[];
}

export interface ContentRecipe {
    id: string;
    label: string;
    describe: string;
    kind: 'content' | 'quick';
    /** quick recipes put one chosen agent on their agent steps */
    needsAgent: boolean;
    build(o: { agent?: string }): RecipeArgs;
}

const OMNI_EDIT = 'google/gemini-omni-flash/v1.1/edit';
const TEXT_TO_VIDEO = 'fal-ai/kling-video/v2/master/text-to-video';
const WAKE_FAILS = [
    { id: 'judge-fail', field: 'verify.verdict', operator: 'eq', value: 'fail' },
    { id: 'step-failed', field: 'step.status', operator: 'eq', value: 'failed' }
];

const videoParts: ContentRecipe = {
    id: 'video-parts', kind: 'content', needsAgent: false,
    label: 'Video parça düzenleme',
    describe: 'split a video into parts, edit each with Gemini Omni Flash from one brief, judge them, join them over the original sound',
    build: () => ({
        title: 'Video parça düzenleme',
        inputs: [
            { name: 'video', type: 'file', required: true, description: 'Düzenlenecek video' },
            { name: 'brief', type: 'text', required: true, description: 'Her parçada ne değişecek — düz Türkçe yazılabilir, prompt mühendisi modele çevirir' },
            { name: 'partSec', type: 'number', default: '10', description: 'Parça süresi, sn (Omni Flash en çok 10 sn)' },
            { name: 'resolution', type: 'choice', default: '720p', choices: ['360p', '720p', '1080p'], description: 'Omni çıktı çözünürlüğü' }
        ],
        steps: [
            {
                id: 'prompt', role: 'prompt-muhendisi', title: 'Düzenleme komutu',
                prompt: 'Aşağıdaki isteği Gemini Omni Flash video düzenleme modeline verilecek tek paragraflık, açık, İngilizce bir düzenleme komutuna çevir. Kişilerin, kameranın ve zamanlamanın korunmasını iste; yalnızca değişecek şeyi tarif et. Yalnızca komutu yaz, başka hiçbir şey yazma.\n\nİstek: {input.brief}'
            },
            { id: 'split', title: 'Parçalara böl', tool: { recipe: 'split', input: '{input.video}', params: { segmentSec: '{input.partSec}' } } },
            { id: 'audio', title: 'Sesi ayır', tool: { recipe: 'extractAudio', input: '{input.video}' } },
            {
                id: 'edit', title: 'Parçaları düzenle', onFail: 'continue',
                forEach: { list: '{steps.split.json.outputs}', concurrency: 2, retries: 0, budgetUSD: 1.5 },
                media: { model: OMNI_EDIT, input: '{"prompt":"{steps.prompt.text}","video_url":"{item}","resolution":"{input.resolution}"}' },
                verify: { criteria: 'The clip shows the change asked for: {input.brief}. The picture is not broken, frozen or cut short.', engine: 'agy', retries: 0 }
            },
            {
                id: 'check', title: 'Parçaları değerlendir',
                checkpoint: { message: 'Look at every edited part: its judge verdict and the run cost. Retry a failed part once with a sharper prompt, or proceed, or ask the user.', allowed: 'proceed,retry,ask_user,stop', maxRetries: 1 }
            },
            { id: 'join', title: 'Birleştir', tool: { recipe: 'concat', params: { files: '{steps.edit.json.items}', name: 'edited.mp4' } } },
            { id: 'mux', title: 'Orijinal sesi geri koy', tool: { recipe: 'muxAudio', input: '{steps.join.json.outputs.0}', params: { audio: '{steps.audio.json.outputs.0}' } } },
            { id: 'final', title: 'Son kontrol', checkpoint: { message: 'The joined video with its original sound is ready. Stop if it meets the criteria, otherwise ask the user.', allowed: 'proceed,ask_user,stop' } }
        ],
        wake: [...WAKE_FAILS, { id: 'over-soft', field: 'cost.run', operator: 'gt', value: 1.5 }],
        goal: 'Girdi videoyu parçalara böl, her parçayı brief\'e göre Gemini Omni Flash ile düzenle, düzenlenmiş parçaları sırasıyla birleştir ve orijinal sesi geri koy. Kullanıcı hiçbir adımda kopyala-yapıştır yapmaz.',
        criteria: ['Her parça brief\'te istenen değişikliği taşıyor', 'Birleşik video girdiyle aynı uzunlukta ve orijinal sesle senkron', 'Koşunun maliyeti yumuşak tavanı aşarsa gözetmen karar verir']
    })
};

const longToShorts: ContentRecipe = {
    id: 'long-to-shorts', kind: 'content', needsAgent: false,
    label: 'Uzundan kısalar',
    describe: 'transcribe a long video, let the editor pick its best moments, cut each into a subtitled vertical short in one local pass',
    build: () => ({
        title: 'Uzundan kısalar',
        inputs: [
            { name: 'video', type: 'file', required: true, description: 'Uzun video (konuşma, röportaj, ders…)' },
            { name: 'count', type: 'number', default: '3', description: 'Kaç kısa çıkarılsın' },
            { name: 'maxSec', type: 'number', default: '45', description: 'Bir kısanın en uzun süresi, sn' },
            { name: 'language', type: 'text', default: 'tr', description: 'Konuşmanın dili (Whisper), ör. tr, en' },
            { name: 'aspect', type: 'choice', default: '9:16', choices: ['9:16', '1:1', '16:9'], description: 'Kısaların en-boy oranı' }
        ],
        steps: [
            { id: 'audio', title: 'Sesi ayır', tool: { recipe: 'extractAudio', input: '{input.video}' } },
            {
                id: 'transcript', title: 'Transkript',
                media: { model: 'fal-ai/whisper', input: '{"audio_url":"{steps.audio.json.outputs.0}","task":"transcribe","language":"{input.language}","chunk_level":"segment"}' }
            },
            {
                id: 'pick', role: 'kurgu', title: 'Anları seç', outputContract: 'json',
                prompt: 'Aşağıda bir videonun zaman damgalı transkripti var (timestamp = [başlangıç, bitiş] saniye). Kendi başına anlaşılan, ilk saniyesinde güçlü bir kancası olan en iyi {input.count} anı seç. Her biri en çok {input.maxSec} saniye olsun; cümle ortasında başlamasın, cümle ortasında bitmesin. Her an için altyazıyı SRT olarak yaz: zamanlar anın başından sayılır (anın ilk karesi 00:00:00,000), satır başına en çok 42 karakter.\n\nYalnızca şu biçimde JSON döndür, başka hiçbir şey yazma:\n{"clips": [{"title": "kısa başlık", "start": 12.5, "end": 48.0, "why": "neden bu an", "srt": "1\\n00:00:00,000 --> 00:00:02,400\\nİlk cümle\\n"}]}\n\nTranskript:\n{steps.transcript.json.chunks}',
                verify: { criteria: 'The JSON has a clips list of at most {input.count} items; each has start < end, end - start at most {input.maxSec}, and a non-empty srt whose times start near 00:00:00.', retries: 1 }
            },
            {
                id: 'cut', title: 'Kısaları kes', onFail: 'continue',
                forEach: { list: '{steps.pick.json.clips}', concurrency: 1, retries: 0 },
                tool: { recipe: 'short', input: '{input.video}', params: { start: '{item.start}', end: '{item.end}', srt: '{item.srt}', aspect: '{input.aspect}' } }
            },
            { id: 'final', title: 'Son kontrol', checkpoint: { message: 'The shorts are cut. Stop if every picked moment became a clip, otherwise ask the user.', allowed: 'proceed,ask_user,stop' } }
        ],
        wake: WAKE_FAILS,
        goal: 'Uzun bir videodan, transkriptine bakarak kendi başına anlaşılan en iyi anları seç ve her birini altyazılı, dikey bir kısa videoya çevir.',
        criteria: ['Her kısa kancayla başlıyor ve cümle ortasında kesilmiyor', 'Altyazılar konuşmayla senkron', 'Kısalar istenen en-boy oranında']
    })
};

const weeklyRhythm: ContentRecipe = {
    id: 'weekly-rhythm', kind: 'content', needsAgent: false,
    label: 'Haftalık kanal ritmi',
    describe: 'the week\'s idea from the calendar, a script, the shots rendered and joined, your approval, then the publishing package',
    build: () => ({
        title: 'Haftalık kanal ritmi',
        inputs: [
            { name: 'channel', type: 'text', required: true, description: 'Kanalın konusu ve kitlesi, bir iki cümle' },
            { name: 'calendar', type: 'file', description: 'İçerik takvimi (vault notu); boşsa fikir kanaldan türetilir' },
            { name: 'shots', type: 'number', default: '3', description: 'Kaç sahne (her biri 5 sn)' }
        ],
        steps: [
            {
                id: 'idea', role: 'fikir', title: 'Haftanın fikri', outputContract: 'json',
                prompt: 'Bu haftanın videosu için tek bir fikir seç. Kanal: {input.channel}\nTakvim dosyası: {input.calendar}\nTakvim verildiyse önce ondan bu haftaya düşen ve henüz üretilmemiş satırı al; verilmediyse kanala uygun bir fikir öner.\n\n{performance}\n\nYalnızca şu biçimde JSON döndür:\n{"title": "videonun başlığı", "hook": "ilk üç saniyenin kancası", "angle": "ne anlatıyor, kime", "calendarRow": "takvimdeki satır ya da boş"}'
            },
            {
                id: 'script', role: 'senarist', title: 'Senaryo', outputContract: 'json',
                prompt: 'Şu fikir için {input.shots} sahnelik kısa bir video senaryosu yaz; her sahne 5 saniye.\nBaşlık: {steps.idea.json.title}\nKanca: {steps.idea.json.hook}\nAçı: {steps.idea.json.angle}\n\n{performance}\n\nYalnızca şu biçimde JSON döndür:\n{"title": "başlık", "shots": [{"prompt": "İngilizce, sinematik, tek paragraf, somut bir görüntü üretim komutu", "caption": "sahnenin ekran yazısı"}]}',
                verify: { criteria: 'The JSON has a shots list of exactly {input.shots} items, each with a concrete English visual prompt.', retries: 1 }
            },
            {
                id: 'produce', title: 'Sahneleri üret', onFail: 'continue',
                forEach: { list: '{steps.script.json.shots}', concurrency: 2, retries: 0, budgetUSD: 1 },
                media: { model: TEXT_TO_VIDEO, input: '{"prompt":"{item.prompt}","duration":"5"}', timeoutMin: 20 }
            },
            { id: 'join', title: 'Birleştir', tool: { recipe: 'concat', params: { files: '{steps.produce.json.items}', name: 'haftalik.mp4' } } },
            { id: 'approve', title: 'Onay', approval: { message: 'Haftanın videosu hazır: {steps.script.json.title}. Yayın paketine geçilsin mi?' } },
            {
                id: 'publish', role: 'yayinci', title: 'Yayın paketi', outputContract: 'json',
                prompt: 'Onaylanan video için yayın paketini hazırla. Videoyu hiçbir platforma yükleme; yalnızca paketi hazırla, yükleme ayrı bir adımdır.\nVideo dosyası: {steps.join.json.outputs.0}\nSenaryo: {steps.script.text}\n\nYalnızca şu biçimde JSON döndür:\n{"youtube": {"title": "en çok 70 karakter", "description": "açıklama", "tags": ["10 etiket"]}, "shorts": {"title": "kısa başlık"}, "calendarRow": "{steps.idea.json.calendarRow}"}'
            }
        ],
        wake: WAKE_FAILS,
        goal: 'Her hafta takvimden (yoksa kanaldan) bir fikir alıp senaryo, üretim ve onaydan geçirerek yayına hazır bir video ve yayın paketi çıkar.',
        criteria: ['Fikir kanalın konusuna uyuyor', 'Sahneler senaryoyla aynı sırada birleşti', 'Yayın paketi onaydan sonra hazırlandı']
    })
};

/* The quick recipes — one agent, placeholders to edit after install. */
const quick = (id: string, label: string, describe: string, steps: (agent: string) => Record<string, unknown>[]): ContentRecipe =>
    ({ id, label, describe, kind: 'quick', needsAgent: true, build: o => ({ title: label, steps: steps(o.agent ?? '') }) });

const QUICK: ContentRecipe[] = [
    quick('text-image', 'Text → Image', 'the agent writes the image prompt, Flux renders it', a => [
        { agent: a, title: 'image prompt', prompt: 'Şu konu için tek paragraflık, İngilizce, ayrıntılı bir görsel üretim promptu yaz (sadece promptu yaz): KONUYU BURAYA YAZ' },
        { title: 'render image', media: { model: 'fal-ai/flux/schnell', input: '{"prompt": "{prev_text}"}' } }
    ]),
    quick('text-image-video', 'Text → Image → Video', 'content factory: prompt → image → short video', a => [
        { agent: a, title: 'scene prompt', prompt: 'Şu konu için İngilizce, sinematik tek paragraf görsel/video promptu yaz (sadece promptu): KONUYU BURAYA YAZ' },
        { title: 'cover image', media: { model: 'fal-ai/flux/schnell', input: '{"prompt": "{prev_text}"}' } },
        { title: 'short video', media: { model: TEXT_TO_VIDEO, input: '{"prompt": "{prev_text}", "duration": "5"}', timeoutMin: 20 } }
    ]),
    quick('audio-text', 'Audio → Text (Whisper)', 'transcribe the audio file, the agent summarizes it', a => [
        { title: 'transcript', media: { model: 'fal-ai/whisper', input: '{"audio_url": "SES DOSYASI URL BURAYA"}' } },
        { agent: a, title: 'summarize', prompt: 'Şu transkripti Türkçe maddelerle özetle: {prev_text}' }
    ])
];

export const CONTENT_RECIPES: readonly ContentRecipe[] = [videoParts, longToShorts, weeklyRhythm, ...QUICK];

/** Case and Turkish letters folded, so uzundan kisalar finds Uzundan kısalar. */
const fold = (s: string): string => s.trim().toLocaleLowerCase('tr').normalize('NFD').replace(/[\u0300-\u036f]/g, '').split('\u0131').join('i');

export const contentRecipe = (id: string): ContentRecipe | undefined =>
    CONTENT_RECIPES.find(r => r.id === id || fold(r.label) === fold(String(id)));

/** The roles a recipe's steps name, in step order. */
export const recipeRoles = (r: ContentRecipe): string[] =>
    [...new Set(r.build({ agent: '' }).steps.map(s => String(s.role ?? '')).filter(Boolean))];

/** A title no existing workflow has: the recipe's own, else "<title> (2)", "(3)"… */
export function freeTitle(title: string, taken: readonly string[]): string {
    if (!taken.includes(title)) { return title; }
    let i = 2;
    while (taken.includes(`${title} (${i})`)) { i++; }
    return `${title} (${i})`;
}

/** What workflows.recipes lists for one recipe. */
export function recipeSummary(r: ContentRecipe): Record<string, unknown> {
    const a = r.build({ agent: '<agent>' });
    return {
        id: r.id, label: r.label, kind: r.kind, describe: r.describe, needsAgent: r.needsAgent,
        roles: recipeRoles(r), steps: a.steps.map(s => String(s.title)),
        inputs: (a.inputs ?? []).map(i => `${i.name}${i.required ? '*' : ''}`)
    };
}

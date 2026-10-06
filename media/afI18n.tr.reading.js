// Türkçe — reading aloud: the transcript's replay (media/afReplayRead.js) and a phone's 🔊. A part of the catalog (media/afI18n.js LANGS).
(function (table) {
    'use strict';
    if (typeof module !== 'undefined' && module.exports) { module.exports = table; }
    if (typeof window !== 'undefined' && window.AFI18n) { window.AFI18n.add('tr', table); }
})({
    'Read answers': 'Cevapları oku',
    'Read each agent answer aloud as the replay reaches it — the replay waits until it has been read.':
        'Replay bir ajan cevabına geldiğinde onu sesli okur — replay okuma bitene kadar bekler.',
    'Answers are read aloud as the replay reaches them, and it waits for each. Press to replay in silence.':
        'Replay geldiği her cevabı sesli okuyor ve her birini bekliyor. Sessiz oynatmak için bas.',
    'Steps come {n} times faster than the conversation really ran — a long pause is cut short first':
        'Adımlar konuşmanın gerçek hızının {n} katıyla gelir — uzun bir bekleme önce kısaltılır',
    'Sound: Speak Daily Briefing is read here too while agentFarm.digestTtsModel is empty; with a fal.ai model there it is saved as an audio file instead.':
        'Sound: Speak Daily Briefing de agentFarm.digestTtsModel boşken buradan okunur; orada bir fal.ai modeli varsa ses dosyası olarak kaydedilir.',
    'This phone app cannot read aloud — update Agent Farm on the phone.':
        'Bu telefon uygulaması sesli okuyamıyor — telefondaki Agent Farm\'ı güncelle.'
});

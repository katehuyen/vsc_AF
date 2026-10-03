// Türkçe — the interface strings translated so far (U-189). The key is the English
// text exactly as the page writes it; a string missing here is shown in English.
(function (table) {
    'use strict';
    if (typeof module !== 'undefined' && module.exports) { module.exports = table; }
    if (typeof window !== 'undefined' && window.AFI18n) { window.AFI18n.add('tr', table); }
})({
    // the page header (media/pageHeader.js)
    'Dashboard': 'Pano',
    'Projects': 'Projeler',
    'Console': 'Konsol',
    'Now': 'Şimdi',
    'Living': 'Canlılık',
    'Notices': 'Bildirimler',
    'Queue': 'Kuyruk',
    'Live Timeline': 'Canlı Zaman Çizelgesi',
    'Agents': 'Ajanlar',
    'Tasks': 'Görevler',
    'Missions': 'Misyonlar',
    'Studio': 'Stüdyo',
    'Wiki': 'Wiki',
    'Toolbox': 'Araç Kutusu',
    'Evals': 'Değerlendirmeler',
    'Sound': 'Ses',
    'Search': 'Ara',
    'Engines': 'Motorlar',
    'Settings': 'Ayarlar',
    'Refresh': 'Yenile',
    'Guide': 'Rehber',
    'A2A Notes': 'A2A Notları',
    'A2A Tasks': 'A2A Görevleri',
    'Open {page}': '{page} sayfasını aç',
    'A menu: “{claim}”, or {page} itself.': 'Bir menü: “{claim}” ya da doğrudan {page}.',
    'Agent Farm {version} — the build running in this window': 'Agent Farm {version} — bu pencerede çalışan sürüm',
    'The board you start from: every engine\'s sessions in one table, with the day\'s spend, what is running and what needs you. The cost, token and model figures are read from Claude transcripts only.':
        'İşe başladığın pano: her motorun oturumları tek tabloda; günün harcaması, neyin çalıştığı ve neyin seni beklediğiyle birlikte. Maliyet, token ve model rakamları yalnızca Claude dökümlerinden okunur.',
    'Every project you run — its charter, plan, backlog, worklog and documents, and the sessions, tasks and missions filed to it.':
        'Yürüttüğün her proje: tüzüğü, planı, iş listesi, çalışma günlüğü ve belgeleri; ona bağlanan oturumlar, görevler ve misyonlar.',
    'Talk to any engine in a panel inside VS Code — a hosted conversation rather than a terminal, so its turns, cost and transcript are recorded like every other session.':
        'Herhangi bir motorla VS Code içindeki bir panelde konuş: terminal değil, barındırılan bir konuşma; turları, maliyeti ve dökümü diğer her oturum gibi kaydedilir.',
    'One screen of what waits for you, what is running, today\'s spend and quotas and the latest notices, with a box that speaks into a running session. The phone opens it first.':
        'Tek ekranda seni bekleyenler, çalışanlar, bugünün harcaması ve kotalar, son bildirimler; çalışan bir oturuma yazabileceğin bir kutuyla. Telefon ilk bunu açar.',
    'Is the system alive? Your own loops — a file that should exist, a folder that should be empty, a queue that should be short — each one a row that passes or fails.':
        'Sistem canlı mı? Kendi döngülerin: var olması gereken bir dosya, boş olması gereken bir klasör, kısa kalması gereken bir kuyruk; her biri geçen ya da kalan bir satır.',
    'What the agents want to tell you: questions waiting on an answer, results and reports. The number beside the name is how many are still unread.':
        'Ajanların sana söylemek istedikleri: yanıt bekleyen sorular, sonuçlar ve raporlar. Adın yanındaki sayı, hâlâ okunmamış olanların sayısıdır.',
    'The shared work queue — what is waiting, what has been taken, and what is blocked until somebody answers it. The number is how many need you.':
        'Ortak iş kuyruğu: bekleyenler, alınanlar ve biri yanıtlayana kadar takılı kalanlar. Sayı, seni bekleyenlerin sayısıdır.',
    'Every turn of every session on one clock: fed by Claude Code\'s hooks and by every conversation the Console hosts, on any engine.':
        'Her oturumun her turu tek bir saatte: Claude Code kancalarından ve Konsol\'un barındırdığı her konuşmadan, hangi motorda olursa olsun.',
    'The fleet, agent by agent — what each one costs, when it last worked, whether it has gone dormant, and which project it belongs to.':
        'Filo, ajan ajan: her birinin maliyeti, en son ne zaman çalıştığı, uykuya geçip geçmediği ve hangi projeye ait olduğu.',
    'Plan what runs and see what ran: schedules, triggers and one-off runs, with their output, their cost and why a run did not happen.':
        'Neyin çalışacağını planla, neyin çalıştığını gör: zamanlamalar, tetikleyiciler ve tek seferlik çalıştırmalar; çıktıları, maliyetleri ve bir çalıştırmanın neden olmadığıyla birlikte.',
    'Dynamic orchestration — a lead agent plans round by round, delegates to the team under a budget, and finishes with an honest verdict.':
        'Dinamik orkestrasyon: bir lider ajan tur tur planlar, bir bütçe içinde ekibe iş dağıtır ve dürüst bir kararla bitirir.',
    'Media production: productions and their scenes, the prompts and renders behind each one, the providers used and what the month has cost.':
        'Medya üretimi: yapımlar ve sahneleri, her birinin arkasındaki istemler ve çıktılar, kullanılan sağlayıcılar ve ayın maliyeti.',
    'The turns marked as worth keeping, and what the compiles made of them — the candidate pool on one side, the vault\'s own pages on the other.':
        'Saklamaya değer diye işaretlenen turlar ve derlemelerin onlardan çıkardıkları: bir yanda aday havuzu, öbür yanda kasanın kendi sayfaları.',
    'Everything that extends Claude Code — skills, subagents, slash commands, hooks, plugins and MCP servers, in user and agent scope. This is Claude Code\'s own extension model; the other engines do not read it.':
        'Claude Code\'u genişleten her şey: beceriler, alt ajanlar, eğik çizgi komutları, kancalar, eklentiler ve MCP sunucuları; kullanıcı ve ajan kapsamında. Bu Claude Code\'un kendi genişletme modelidir; diğer motorlar bunu okumaz.',
    'Scored runs against an agent\'s own cases — what still passes after a change to a prompt, a model or an engine, and what it cost to find out.':
        'Bir ajanın kendi vakalarına karşı puanlanan çalıştırmalar: bir istem, model ya da motor değişikliğinden sonra neyin hâlâ geçtiği ve bunu öğrenmenin maliyeti.',
    'What rings on which event, whether the agent\'s name is said, quiet hours and your own sounds.':
        'Hangi olayda ne çalar, ajanın adı söylenir mi, sessiz saatler ve kendi seslerin.',
    'Search across the whole farm — sessions, tasks, agents, notices, documents and the transcripts themselves, in one query.':
        'Bütün çiftlikte ara: oturumlar, görevler, ajanlar, bildirimler, belgeler ve dökümlerin kendisi, tek bir sorguda.',
    'Which agent CLI this machine can actually run and how each one is paid for — sign-ins, keys and captured accounts, with a real call that proves a turn gets through.':
        'Bu makinenin gerçekten hangi ajan CLI\'larını çalıştırabildiği ve her birinin nasıl ödendiği: girişler, anahtarlar ve yakalanmış hesaplar; bir turun geçtiğini kanıtlayan gerçek bir çağrıyla.',
    'All agentFarm settings in one page, with saveable setting sets.': 'Bütün agentFarm ayarları tek sayfada; kaydedilebilir ayar setleriyle.',
    'Read this page\'s data again from where it lives. It re-reads what is already recorded — nothing is started, nothing is spent.':
        'Bu sayfanın verisini bulunduğu yerden yeniden oku. Yalnızca zaten kayıtlı olanı yeniden okur; hiçbir şey başlatılmaz, hiçbir şey harcanmaz.',
    'The built-in guide, opened at this page\'s own section.': 'Yerleşik rehber, bu sayfanın kendi bölümünde açılır.',
    // the phone layer (media/afMobile.js)
    'Sessions': 'Oturumlar',
    'Menu': 'Menü',
    'Menu: every page': 'Menü: bütün sayfalar',
    'Every page': 'Bütün sayfalar',
    'Close': 'Kapat',
    // the clock (media/afTime.js): ago() and the hover every clock carries
    'just now': 'az önce',
    '{n}m ago': '{n} dk önce',
    '{n}h ago': '{n} sa önce',
    '{n}d ago': '{n} gün önce',
    '{offset} on this machine': 'bu makinede {offset}',
    'Raised': 'Açıldı',
    'Started': 'Başladı',
    'Turn started': 'Tur başladı',
    'Posted': 'Gönderildi',
    // the header's Chains destination (S-123)
    'Every baton relay in one table — where each chain stands, its legs, what it cost and what the next leg opens on, with the controls to continue, brake or end it.':
        'Her bayrak yarışı tek tabloda — her zincirin nerede durduğu, halkaları, maliyeti ve sıradaki halkanın neyle açılacağı; sürdürme, frenleme ve bitirme düğmeleriyle.',
    // the shared list hands (media/afBulk.js, media/afCtx.js, media/afFilters.js)
    'Filter': 'Süzgeç',
    'none': 'hiçbiri',
    'Select all': 'Tümünü seç',
    'Select all {n} shown': 'Gösterilen {n} öğenin tümünü seç',
    'Clear': 'Temizle',
    'find…': 'bul…',
    'Filter this list of {n}': '{n} seçenekli bu listeyi süz',
    'Toggle {name}': 'Aç/kapa: {name}',
    'Show only {name}': 'Yalnızca şunu göster: {name}',
    'nothing to filter by': 'süzülecek bir şey yok',
    'nothing matches that': 'bununla eşleşen bir şey yok',
    'Tick any combination. Click a NAME to show only that one; the checkbox itself still toggles. Select all / Clear are above the list.':
        'İstediğin birleşimi işaretle. Yalnızca onu göstermek için bir ADA tıkla; onay kutusu yine aç/kapa yapar. Tümünü seç / Temizle listenin üstündedir.',
    'RIGHT-CLICK flips between everything and {preset} without opening this list. From any other selection, the first press lands on {preset}.':
        'SAĞ TIK, bu listeyi açmadan hepsi ile {preset} arasında geçiş yapar. Başka bir seçimdeyken ilk basış seni {preset} seçimine getirir.',
    'Select for the bulk actions under the filters': 'Süzgeçlerin altındaki toplu işlemler için seç',
    'Select / deselect every row shown': 'Gösterilen tüm satırları seç / seçimi kaldır',
    'Delete': 'Sil',
    'Yesterday': 'Dün',
    'right-click for more': 'daha fazlası için sağ tıkla',
    // the Now page (media/now.js)
    '{waiting} waiting · {running} running · {cost} today': '{waiting} bekliyor · {running} çalışıyor · bugün {cost}',
    'Waiting for you': 'Seni bekleyenler',
    '+{n} more in Needs You': 'Seni Bekleyenler\'de {n} tane daha',
    'Nothing is waiting for you.': 'Seni bekleyen bir şey yok.',
    'Running': 'Çalışanlar',
    'No session is running.': 'Çalışan oturum yok.',
    'waits for you': 'seni bekliyor',
    'working': 'çalışıyor',
    'idle': 'boşta',
    'starting': 'başlıyor',
    'error': 'hata',
    'Status: {state}': 'Durum: {state}',
    'Cost: {cost}': 'Maliyet: {cost}',
    'Nothing said yet.': 'Henüz bir şey söylenmedi.',
    'Click: the box below speaks to this session': 'Tıkla: aşağıdaki kutu bu oturuma konuşur',
    'Today': 'Bugün',
    'spent today': 'bugün harcandı',
    'Account: {account}': 'Hesap: {account}',
    'Engine: {engine}': 'Motor: {engine}',
    'Five-hour window: {pct}%': 'Beş saatlik pencere: %{pct}',
    'Resets: {time}': 'Sıfırlanma: {time}',
    '{pct}% 5h': '%{pct} 5 sa',
    'No notices yet.': 'Henüz bildirim yok.',
    'Agent: {agent}': 'Ajan: {agent}',
    'Session: {agent}': 'Oturum: {agent}',
    'Say something to this session…': 'Bu oturuma bir şey söyle…',
    'No running session — start one': 'Çalışan oturum yok — bir tane başlat',
    'Send': 'Gönder',
    'New': 'Yeni',
    'Open the Console to start a session': 'Bir oturum başlatmak için Konsol\'u aç',
    'Sent.': 'Gönderildi.',
    'Not sent.': 'Gönderilmedi.'
});

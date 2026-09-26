# Agent Farm — Kılavuz ve Blueprint

> Bu belge eklentiyle birlikte sürekli geliştirilir. Arayüzdeki her **?** düğmesi seni bu kılavuzun ilgili bölümüne getirir. Komut paletinden `Agent Farm: Open Guide` ile de her an açabilirsin.

## Agent Farm Nedir

Agent Farm, bilgisayarında yaşayan **Claude Code ajanlarının komuta merkezi**dir. Ajanlarını tek panelden görüntüler, yönetir, maliyetlerini hesaplar ve sağlıklarını denetler.

Tamamen yereldir: hiçbir veri makinenden çıkmaz, hiçbir sunucuya bağlanmaz. İki veri kaynağını okur:

1. **Ajan klasörlerin** (`agentFarm.agentRoots` ayarındaki kökler) — içinde `CLAUDE.md`, `.claude` ya da `memory/` olan alt klasörler ajanlardır; kimlik, hafıza, araç ve izin dosyaları oradan okunur. Alt klasörleri ajan olan bir kök **yuvadır** — kökün kendi `CLAUDE.md`'si tüm ajanlarının yüklediği ortak talimat sayılır (Claude Code'un üst `CLAUDE.md` dosyalarını ele alışıyla birebir aynı), ajan sayılmaz. Ajan-görünümlü alt klasörü olmayan kök ise tek başına bir ajandır. Kökler ve klasör dışlamaları Farm Settings'teki **Agent folders** bölümünden yönetilir (2.61.0).
2. **Claude Code oturum kayıtların** (`~/.claude/projects/*/*.jsonl`) — her oturumun modeli, token kullanımı, araç çağrıları ve zaman damgaları buradan okunur. Oturumlar, çalışma dizinlerine bakılarak ajanlarla eşleştirilir.

## Hızlı Başlangıç

Hiç bilmiyorsan buradan başla. Bu bölüme her an komut paletinden (`Ctrl+Shift+P`) **Agent Farm: Quick Start** yazarak dönebilirsin.

> Bu kılavuzun yanında bir de **Örnek Kullanımlar** belgesi var: gerçek çalıştırmalarla test edilmiş 11 adım-adım operasyon senaryosu (inbox nöbeti, devirli zincir, bağlam diyeti, vault karnesi…). Komut paleti → **Agent Farm: Open Examples**. Medya/video üretim iş akışları (storyboard → görsel → video → kurgu) için durum ve gelişim yol haritası ayrı bir canlı belgede: [ROADMAP.media.tr.md](ROADMAP.media.tr.md).

### İlk 3 Dakika: Paneli Tanı

1. Sol kenardaki Activity Bar'da **dört düğümlü ağ ikonuna** tıkla — Agent Farm paneli açılır. Altı bölüm görürsün:
   - **Agents** — ajanların; yeşil nokta = şu anda çalışıyor. Ajanı genişlet: kimliği, nöbet görevleri, hafızası, izinleri, oturumları.
   - **Tasks** — ajanlara sıraya koyduğun işler, zamanlanmış görevler, şablonlar ve iş akışları.
   - **Missions** — çok-ajanlı misyonlar: her koşu tur ve delegasyonlarıyla ağaçta; onay/soru bekleyenler satırdan yanıtlanır. ([detay](#missions))
   - **Recent Sessions** — filodaki son oturumlar; tıkla → okunur transkript.
   - **Insights** — sağlık bulguları: ne şişmiş, ne kopmuş, ne bayatlamış.
   - **Live Feed** — filodaki son olaylar.

   > **Bölümlerden biri görünmüyor mu?** VS Code, bir görünüm bir kez gizlenmiş ya da başka panele sürüklenmişse bunu kalıcı hatırlar. Agent Farm panelinde herhangi bir bölüm başlığına **sağ tıkla** → listede eksik bölümü (ör. **Tasks**) işaretle; geri gelir. Bölüm başka panele sürüklenmişse aynı listeden bulup Agent Farm'a geri sürükleyebilirsin.
2. Alt durum çubuğuna bak: `🤖 1 active • $2.4 today`. Tıkla → **Dashboard** açılır: bugünkü maliyet, grafikler, ajan kartları, en pahalı oturumlar.
3. Dashboard'da bir ajan kartına tıkla → o ajanın **detay sayfası**: maliyet trendi, hafıza tablosu, sağlık bulguları, oturum listesi.

Arayüzde gördüğün her **?** düğmesi seni bu kılavuzun ilgili bölümüne getirir — kaybolman imkânsız.

### İlk 10 Dakika: Üç Temel Alışkanlık

1. **Canlı gözlemi kur (bir kere):** Komut paleti → `Agent Farm: Install Live Hooks` → User settings → onayla → açık claude oturumlarını yeniden başlat. Artık ajanlar canlı izlenir, izin bekleyince bildirim gelir. ([detay](#canli-gozlem))
2. **İlk nöbet görevini ekle:** Agents ağacında bir ajanın **Duties** satırına sağ tıkla → **Add Standing Duty**. Ajanla "şuraya her tur bak" anlaşmalarını buraya taşı. ([detay](#nobet-gorevleri))
3. **Bütçe koy:** Ayarlar → `agentFarm.budgets` → `{"psikolog": 20, "*": 50}` gibi. Aşınca haber gelir. ([detay](#butce-uyarilari))

### Ne Yapmak İstiyorsun? (Tarif Listesi)

| İstediğin | Nereden |
| --- | --- |
| Bugün ne harcadım? | Durum çubuğu, veya Dashboard → Cost today |
| Bu ajan neye para yakıyor? | Ajan kartı → Detail → Cost by model + Top sessions |
| Ajan şu an ne yapıyor? | Agents ağacı (WORKING/TOOL rozetleri) veya `Open Live Timeline` |
| Geçmiş bir konuşmayı oku | Recent Sessions → tıkla; içinde arama kutusu var |
| Ajanı başlat / devam ettir | Ajana sağ tık → Start / Continue Latest Session |
| Yeni ajan kur | Agents başlığındaki **+** → şablon iskelet hazır gelir |
| Ajana iş sırala | Tasks → **+** Add Task (Interactive/Headless) |
| Her sabah 08:30 otomatik iş | Tasks → takvim ikonu → Daily 08:30 ([VS Code kapalıyken de olsun mu?](#vs-code-disinda-zamanlama-windows)) |
| Ajanları zincirle çalıştır | Tasks → `New Multi-Agent Workflow…` — `{prev_output}` ile devir ([koşullar](#kosullu-dallanma)) |
| Hedef ver, lead ajan tur tur yönetsin | Sol paneldeki **Missions** bölümü → **+**, ya da her sayfanın üstündeki **Missions** düğmesi ([detay](#missions)) |
| "Şuraya her tur bak" anlaşması | Duties → Add Standing Duty ([detay](#nobet-gorevleri)) |
| Ajanlardaki kopya hafızaları eşitle | Komut paleti → `Sync Shared Memory…` |
| Haftalık karne / vault raporu | `Export Fleet Report` veya otomatik: `autoReport` ayarı |
| Gece işleri ne üretti? | `Export Task Outputs Digest` |
| Bir şey bozuk mu? | Insights görünümü — tıkla, ilgili dosya açılır |
| Bunu hangi ajanla konuşmuştum? | Recent Sessions başlığındaki 🔍 → `Search Transcripts…` ([detay](#transcript-arama)) |
| Ajanlar kaliteli mi çalışıyor? | `Sample Output Quality Now` → Dashboard'da Quality kolonu ([detay](#kalite-karnesi)) |
| Ajan hep aynı hatayı yapıyor | `Scan for Instruction Suggestions…` → Insights'taki 💡 önerisini uygula ([detay](#talimat-onerileri)) |
| "Cümleyle söyleyeyim, o kursun" | Tasks başlığındaki 🚀 → `Natural Language Command…` ([detay](#dogal-dil-komuta)) |
| Anlamıyla ara ("neydi o konu?") | Arama panelinde **semantic** kutusu ([detay](#transcript-arama)) |
| Ajan siteye girip veri toplasın | Zincire Browser step ([detay](#tarayici-adimlari)) |
| Gelen iş doğru ajana kendisi gitsin | Tetik eylemi: Dispatch ([detay](#dispatcher-is-dagitici)) |
| Laptop'taki filoyu da buradan izle | Senkron klasör + `extraClaudeDirs` ([detay](#coklu-makine)) |
| Günlük karne Telegram'a düşsün | `agentFarm.dailyDigest` = "21:30" ([detay](#gunluk-ozet-karti-cebe)) |
| Ajanı başka makineye taşı / paylaş | Ajana sağ tık → `Export Agent Pack…` ([detay](#ajan-paketleri)) |
| Ajan Antigravity'de de çalışsın | Ajana sağ tık → `Sync Agent with the Other Engines…` ([detay](#antigravity-uyumlulugu)) |
| Konuşmayı/turu wiki aday havuzuna ekle | Transkript/Konsol satırında 🔖, ya da sağ tık → `Add to Wiki Candidates…` ([detay](#wiki)) |
| Wiki adaylarını derle (sentezle) | Komut paleti → `Agent Farm: Compile Wiki Candidates…` ([detay](#wiki)) |
| Bekleyen wiki işaretlerini gör, süz ve derle | Her sayfanın araç çubuğundaki `📚 Wiki` düğmesi, ya da komut paleti → `Agent Farm: Open Wiki` ([detay](#wiki-kokpiti)) |
| Ortak anayasayı diğer motorlara yansıt | Toolbox başlığı → `⚖ Sync Constitution` (alt satır), ya da palet → `Agent Farm: Sync Constitution` |
| Kapatınca yeni ID ile geri gelen oturumu durdur | Oturum kartı → `☠ Force kill`, ya da sağ tık → `Force Kill Session Tree` ([detay](#spare-oturumlar)) |
| Günlük bütçeleri rakamları kaybetmeden tamamen kaldır | Ayarlar → Cost & Budgets → `budgetsUnlimited`, ya da `budgets` içinde `0` |
| Tüm motorların turlarını incele | Sessions yanındaki `⤢ Open Turns page` ([detay](#turlar-sayfasi)) |
| Zaman çizelgesinden tam metni kopyala | Çizelgedeki noktaya sağ tık → `Copy Corpus` ([detay](#canli-gozlem)) |

### Kavramlar (30 Saniyede)

- **Ajan** = içinde `CLAUDE.md` olan klasör. Agent Farm hiçbir şeyi değiştirmez, sadece okur (senin onayınla yazdığı üç istisna: yeni ajan iskeleti, hook kurulumu, nöbet görevi dosyası).
- **Maliyet** = token kullanımının API karşılığı değeri; abonelikte fatura değil, verim ölçüsüdür.
- **Nöbet görevi** = ajanla süreklilik anlaşması ("şuraya bak, değişince şunu yap") — `DUTIES.md`'de yaşar.
- **Görev/Workflow** = senin başlattığın işler; nöbet görevinden farkı, ajanın oturum içinde kendi kendine değil, kuyruktan tetiklenmesidir.

### Filtreler — her yerde aynı kontrol {#filtreler}

Eklentideki her filtre tek bir sözleşmeyi izler; bir sayfada öğrendiğin, diğerinde de geçerlidir.

- **"Hepsi ya da bir tanesi" değil, istediğin kombinasyon.** Filtre açılır kutusu bir **onay kutusu listesidir**: iki ajanı, üç seviyeyi, dört durumu — hangi alt kümeyi istersen. Listenin üstünde **Select all** / **Clear** durur; liste uzunsa *Clear'a bas, ilgilendiğin ikisini işaretle* en hızlı yoldur. Düğme seçimi söyler — `Agents: all`, `Agents: dev`, `Agents: 2/7`, `Agents: none`.
- **Hepsi işaretliyse filtre yok demektir.** Böylece sonradan ortaya çıkan bir değer — yeni bir ajan, yeni bir model — sen kutuyu açmadan kendiliğinden dahil olur. **Hiçbiri işaretli değilse** dürüstçe hiçbir şey eşleşmez ve düğme bunu yazar.
- **İşaretlerken menü açık kalır.** Arkadaki liste her tıkta yeniden filtrelenir; menü elinin altında kapanmaz.
- **Metin ve sayı kutuları yazdıkça filtreler.** Bir min/max sınırı, bir "başlık şunu içeriyor", bir tarih — yazmayı bıraktıktan bir an sonra uygulanır. Enter yok, başka yere tıklamak yok; imleç de yerini korur.
- Sıralama kutuları, gruplama ve ayarlar tek seçimli kalır; düzenleyiciler (ayarlar, fiyatlandırma, formlar) her tuş vuruşunda değil, işlem bitince kaydeder — orada her tuş bir yazma olurdu.

Sayfanın tamamını kapsayan filtreler (Sessions tablolarındaki 🧑/🤖 kaynağı, Media Gallery'deki prodüksiyon) tek seçimli kalır: onlar bir alt küme değil, bir derinleşmedir.

### ‼️ Form da her yerde aynı kontrol — `AFForm` (3.91.0) {#form}

Bir nesneyi **listeleyen** sayfanın onu **kuramaması**, bu eklentinin en uzun süren yapısal çelişkisiydi: sekiz yüzey listelediği şeyi yapamıyordu ve iş, arka arkaya açılan VS Code kutularına düşüyordu. Ölçüm, bunun neden iradeyle çözülmediğini söylüyor: sayfa başına bir form yazmak bir günlük işti, dolayısıyla kimse yazmadı ve platformun kendi kutuları varsayılan olarak kazandı.

Bu yüzden kart bir **bileşendir** — `media/afForm.js`, CSS'i `common.css`'te, ikisi de `htmlShell`'den **her sayfaya** gönderilir. Katılmak için "opt-in" gereken bir bileşen, bir sonraki yüzeyin atlayacağı bileşendir; sekiz yüzeyin nasıl geride kaldığı tam olarak budur.

- **Alan yazdığı anahtarı ve yazdığı türü kendisi bildirir**, dolayısıyla `read()` türlenmiş bir taslak döndürür ve hiçbir yer alan kimliklerini iki kez listelemez.
- **`{redraw:true}`**, *neyin var olduğunu* değiştiren alanları işaretler — taşıma türünü değiştirmek kartın yarısını yeniden çizer, baştan başlatmaz.
- **İşletim sisteminin dosya seçicisi kalır**, doldurduğu kutunun yanında tek düğme olarak: bir klasör seçici, bir webview'ın gerçekten çizemeyeceği tek şeydir ve `D:\zone\know\note\…` yolunu elle yazmak, diyalog zincirlerinin savunduğu şeydi.
- **Cancel gerçekten iptal eder.** Zincir bir kutuda Esc'e basmak yapılanın yarısını dosyaya yazılmış bırakıyordu; kart taslağı kendinde tutar ve yalnızca Save yazar.
- **Ret formun içinde görünür** — kartı kapatıp bir bildirim kutusunda değil.

Bugün bu kartı kullanan yüzeyler: görevler · zamanlamalar · tetikleyiciler · şablonlar · iş akışları · nöbetler · alet çantası (skill/subagent/command/MCP) · hafıza · yaşam çekleri · sır kasası · stüdyo · ajanın kendisi · evals. Yeni bir yüzey eklerken kural tektir: **liste hangi nesneyi gösteriyorsa, onu kuran kart aynı sayfadadır.**

## Sağ Tık Her Yerde {#sag-tik}

Eklentideki her satır bir **nesne**: bir backlog maddesi, bir oturum, bir görev
koşusu, bir bildirim, bir beceri, bir varlık, bir ayar, bir ajan. O nesneyle
yapılabilecek her şey, **o nesnenin sağ tık menüsündedir**. Satır düğmeleri
menünün yerini tutmaz: düğme "en sık yapılan"dır, menü "yapılabilecek olan".

Üç kural:

1. **Aynı nesne nerede görünürse görünsün aynı menüyü taşır.** Bir ajan
   Dashboard'da, Portfolio'da, Timeline kulvarında, kendi sayfasında ve bellek
   grafiğinde aynı on altı maddeyi verir.
2. **Menü, düğmenin yaptığının aynısını yapar** — aynı mesajı, karakterine
   kadar. Testler bunu doğruluyor; ayrışamazlar.
3. **Bir satır aynı anda iki nesne olabilir.** Turns satırı hem *tur* hem
   *oturum*; arama sonucu hem *eşleşme* hem *oturum*; Timeline kulvar etiketi
   hem *oturum* hem *ajan*; İhtiyaçlar satırı hem *engel* hem — transkript
   biliyorsa — *oturum*. Tek sağ tık ikisini birden verir.

**Nasıl bulunur:** menüsü olan her satırın ipucunda `— right-click for more`
kuyruğu vardır. Menüsü olduğunu söylemeyen satır yoktur (denetleyen bir test
var: `test/test_ctxmenu_reach.js`).

**Ajan tarafı:** `ui.ctxmenu` op'u kataloğun kendisini okur —
`{"op":"ui.ctxmenu"}` satır türlerini, `{"op":"ui.ctxmenu","section":"afBacklogRow"}`
o türe ne yapılabileceğini söyler.

**Kasa istisnası:** bir sırrın menüsünde **değerini kopyalayan madde yoktur ve
olmayacak**. Kopyalanabilen ad ve `{secret:NAME}` referansıdır.

Tasarımın tamamı ve hangi fazın neyi getirdiği: `docs/SAG-TIK-MENULERI.tr.md`.

## Modüller

### Agents Ağacı

Yan paneldeki ana ağaç. Her ajan şu alt bölümlerle açılır:

| Bölüm | İçerik |
| --- | --- |
| Identity | `CLAUDE.md` — tıklayınca açılır, yanında tahmini token boyutu |
| Duties | Nöbet görevleri (`DUTIES.md`) — bkz. [Nöbet Görevleri](#nobet-gorevleri) |
| Memory | `memory/` altındaki dosyalar; token, son değişiklik + **30 günlük recall sayısı ve orphan işareti** — bkz. [Hafıza Yönetimi](#hafiza-yonetimi) (2.14.0) |
| Tools | `tools/` klasöründeki scriptler |
| MCP | Ajanın MCP sunucuları + 30 günlük gerçek kullanım — bkz. [MCP Yönetimi](#mcp-yonetimi) |
| Skills | Agent Skills (`.claude/skills` + `~/.claude/skills`) + 30 günlük gerçek kullanım — bkz. [Skill Yönetimi](#skill-yonetimi) (2.12.0) |
| Permissions | `.claude/settings.local.json` izin özeti |
| Sessions | Son 15 oturum; tıklayınca Oturum Görüntüleyici açılır |

Ajan üzerinde sağ tık menüsü: **Start Claude Session**, **Start Session…** (model · efor · izin modu · ad · ilk cümle — bkz. [Oturum Başlatma ve Denetim](#oturum-denetim)), **Continue Latest Session**, **Open Agent Detail**, **Open in New Window**, **Reveal in File Explorer**.

Oturum satırında sağ tık menüsü (2.7.0):

- **Resume Session in Terminal** — Claude için o oturumun klasöründe terminal açıp `claude --resume <oturum-id>` çalıştırır: **herhangi bir geçmiş oturuma** kaldığın yerden devam edersin (Continue Latest yalnızca en son oturumu sürdürür). Dış motor transkriptindeki **⏵ Resume** ise o motorun ölçülmüş Console-resume yolunu kullanır; dış motorun thread kimliği hiçbir zaman Claude'a verilmez.
- **Focus Session Terminal (2.58.0)** — üzerine gelince çıkan ⌨/terminal ikonu (ve sağ tık menüsü) doğrudan o oturumun terminal penceresine atlar. Aynı ⌨, oturumun göründüğü **her** yüzeyde var: Dashboard ve Ajan Detay tablo satırları, Timeline canlı kartları, Oturum Görüntüleyicinin üst çubuğu ve Needs You maddeleri.
- **Rename Session…** — oturuma kendi adını ver (hatırlamak için); boş bırakırsan otomatik başlık geri gelir. Adlar kalıcıdır, transcript dosyasına dokunulmaz.
- **Pin / Unpin Session (3.24.0)** — oturumu rafa koyar: pinli oturumlar listenin başında durur ve satır sınırından muaftır. Satır üstündeki 📌 düğmesi de aynısını yapar. **Label Session…** virgülle ayrılmış etiketler ekler, **Interrupt Session** çalışan turu Esc ile durdurur — bkz. [Oturum Başlatma ve Denetim](#oturum-denetim).

Oturum başlıkları 2.7.0'dan itibaren konuşmadan türetilir: `/compact` gibi komutlar, `<...>` harness blokları ve `!` kabuk satırları artık başlık olmaz — ilk gerçek kullanıcı cümlesi başlıktır.

### Dashboard

Filonun genel panosu. `Agent Farm: Open Dashboard` komutuyla veya durum çubuğuna tıklayarak açılır.

> **Açık sayfa indeksi takip eder (3.31.1).** Yeni bir oturum, yeni bir tur, değişen maliyet — indeks bunu biliyordu, **ağaçlara** söyleniyordu, **sayfalara** söylenmiyordu; yani açık bıraktığın Dashboard, ajan sayfası, Agents (Portfolio), Turns ve Living, sen Refresh'e basana kadar açtığın andaki filoyu gösteriyordu. Artık indeks güncellendiğinde bu sayfalar kendiliğinden yenilenir; **1 saniyelik debounce** ile, çünkü akan bir oturum indeksi saniyede birkaç kez günceller ve her satırda tam sayfa çizmek "takip eden" değil "titreyen" bir sayfa olurdu.

**Her sayfada tek başlık (2.59.0):** her panelin üst çubuğu tek bir ortak bileşenden çizilir; hizalama, boşluk ve sıralama her yerde birebir aynıdır — başlık ve alt yazı solda, sağa yaslı tek araç çubuğu. Araç çubuğu ince bir ayraçla iki yarıya bölünür: **sol yarı sayfanın kendi** kapsam kontrolleri ve eylemleri (aralık/pencere seçicileri, Start/Resume/⌨/Export…); **sağ yarı ise küresel küme — her sayfada aynı düğmeler, aynı sırada:** **Dashboard · Live Timeline · (ilgili panel) · ⌕ Search · ⚙ Settings · Refresh · ? Guide** — yalnızca zaten üzerinde olduğun sayfa listeden düşer. ⌕ Search anlamlı olduğu yerde ön-kapsamlıdır (bu ajan / bu oturum). Sayfalar sol yarılarında farklılaşır; sağ yarı kas hafızasıdır.

- **KPI kartları**: aktif ajan sayısı, bugünkü maliyet, seçili aralık maliyeti, oturum sayısı, 5 saatlik pencere, toplam bulgu sayısı.
- **Farm Status kartı (2.39.0):** KPI'ların hemen altında, alt sistem başına dürüst bir aktivasyon satırı — **yeşil nokta = canlı kullanımda, mavi = kurulu ama boşta, gri = hiç kullanılmamış.** Dokuz satır: canlı izleme, görevler/zamanlama, tetikleyiciler, iş akışları, medya hattı, harici CLI'lar, varlık alımı (ingest), zeki gözetim, sır kasası. Uyuyan her satırın yanında **tek tık uyandırma** düğmesi vardır (örnek kurulum, anahtar ekleme, ilgili ayar/kılavuz). Bir şey uyuyorsa kart açık gelir; her şey canlıysa tek satır özete katlanır. Harici CLI satırı adaptörlerin fail-soft doğasını da hatırlatır: profil var ama hiç oturum görünmüyorsa bu bir format kayması işareti olabilir.
- **Plan usage kartı (3.23.0):** **Farm status kutusunun sağında, aynı hizada** — iki kutu birbirini tamamlayan iki soruyu cevaplar: "çiftlik ne yapabilir" ve "bunu yapacak abonelik payı ne kadar kaldı". Sayfadaki tek **yerel transkriptten türetilmemiş** rakam budur: **Anthropic'in kendi bildirdiği gerçek kota durumu**, Claude Code içindeki `/usage`'ın bastığı sayıların aynısı — **Current session (5s)** ve **Current week (all models)**, planında varsa model bazlı haftalık çubuklar; her biri yüzdesi, çubuğu (%75'te sarı, %90'da kırmızı) ve sıfırlanma zamanıyla — hem saat hem geri sayım olarak ("Resets 21:40 · in 2h 20m"). Kart **kendini tazeler** — ortak iki pencereli nabızla (aşağıya bak: ajan tur ortasındayken saniyeler, filo boştayken `agentFarm.planUsageRefreshMinutes`; 0 = yalnız elle), hangi pencerede olduğunu çubukların altında yazar — ve **köşesindeki ⟳** istediğin an yeniden okur. Kart, Claude Code'un bu makinede zaten sakladığı OAuth oturumunu **okur, asla yazmaz**: süresi dolmuş token sessizce yenilenmez — CLI'ın kendi kimlik dosyasıyla yarışmak yerine dürüstçe "bir Claude Code oturumu başlat" der. Bu tür bir giriş yoksa (API anahtarı, gateway, macOS Keychain), ağ yoksa ya da uç nokta kotalıysa yanlış bir sayı yerine tek satırlık gerekçesini basar. Köprü: **`usage.plan`**. Aynı iki rakam artık **durum çubuğunda da sürekli duruyor** — aşağıya bak.
- **‼️ İki yüzde, hiçbir şey açmadan (3.42.0):** yukarıdaki kart *"bir sonraki uzun turu kaldırabilir miyim?"* sorusunu cevaplıyor — bu soruyu harcamadan **ÖNCE** sorarsın — ama açman gereken bir sayfanın arkasındaydı, yani pratikte hep sonradan okunuyordu. Artık aynı rakamlar, sen çalışırken her pencerede, bir **durum çubuğu göstergesi**:

  **`$(dashboard) 3h 49m - 86% / wk 41%`**

  Durum çubuğu, VS Code'da bir şey açmadan görünen tek yüzeydir; "her an gözümün önünde" ancak bu demek olabilir — ikinci bir panel, bir ağaç satırı ya da bir webview tanımı gereği bu şartı sağlamaz. **İlk alan, oturum penceresinde KALAN süredir (3.43.0), bir etiket değil.** Eskiden `5h` yazıyordu: yüzdenin hangi pencereye ait olduğunu söyleyen bir sabit — yani sıfır bilgi — ama tıpatıp bir süre gibi okunuyordu; böylece çubuğun zaman hakkında verir göründüğü tek sayı, tam da söyleyemediği şeydi. `3h 49m - 86%` gerçek sorunun iki yarısını birden cevaplıyor: ne kadarı gitti, ve ne zaman geri geliyor. Hafta etiketini koruyor (yan yana iki çıplak süre okunmaz olurdu); onun sıfırlanması, her limite yer olan ipucunda duruyor. Uç nokta oturum penceresinin sıfırlanma zamanını vermediyse alan `session` kelimesine düşer — asla uydurulmuş bir süreye. `agentFarm.planUsageWarnPercent`'te (80) **sarıya**, `agentFarm.planUsageDangerPercent`'te (95) **kırmızıya** döner; rengi planındaki **en kötü** limit belirler — satıra sığmayanlar dâhil. **Üzerine gel**: her limit, geri sayımıyla; plan kademesi; en son ne zaman bakıldığı; **hangi nabızla çalıştığı**; ve bir **Check now** bağlantısı. **Tıkla**: Dashboard kartı. `agentFarm.planUsageStatusBar` ile kapatılır.

  Üç dürüstlük kuralı: abonelik girişi **olmayan** makinede (API anahtarı / Bedrock / Vertex) yüzde diye bir şey yok ve hiç olmayacak, o yüzden gösterge **hiç görünmez** — sonsuza kadar "bilinmiyor" diyen bir gösterge bilgi değil gürültüdür; **geri gelebilecek** bir giriş (süresi dolmuş, geçici bir uç nokta hatası) `usage ?` olarak görünür kalır, çünkü kaybolması "hiç harcamamışsın" diye okunur; ve kartın `PlanUsageService` **önbelleğini** paylaşır — gösterge, açık bir Dashboard ve bir ajanın `usage.plan`'ı birlikte hâlâ **nabız başına tek istek** yapar.

- **‼️ Tek nabız, iki pencere (3.43.0).** Bu rakamlar yalnızca bir tur **fiilen çalışırken** hareket eder — açık ama senin bir sonraki komutunu bekleyen oturum hiçbir şey harcamaz — dolayısıyla tek sabit bir aralık iki yönde birden yanlıştır: izlediğin turu takip edemeyecek kadar yavaş, boş duran bir çiftlik için gereksiz kadar hızlı. Nabız artık filoyu izliyor ve bütün yüzeyler aynı kararı okuyor (`core/planusage.ts` → `refreshMs`, kaynağı `LiveMonitor.activeTurns()`):
  - **Boş pencere** — çalışan tur yok: `agentFarm.planUsageRefreshMinutes` (varsayılan 5 dk; `0` = yalnız elle, ve bu cevap **her iki** pencerede geçerlidir — yoksa ayar yalan söylerdi).
  - **Aktif pencere** — en az bir ajan tur ortasında: `agentFarm.planUsageActiveRefreshSeconds` (**varsayılan 60 sn, taban 30 sn — 3.45.0**). Soru "oturum açık mı" değil; `working` ya da araç çalıştırıyor mu.
  - **‼️ Biten tur, sıradaki okumayı öne çeker — fazladan bir okuma satın almaz (3.45.1).** Turun **bitmesi**, rakamların maliyete oturduğu andır; aynı zamanda nabzın yavaş (boş) pencereye geçtiği andır, yani bu olmasa oturmuş rakam boş pencere aralığı boyunca (varsayılan 5 dk) okunmadan bekleyebilir. Turun **başlaması** hiçbir şey hak etmez: turun başladığı anda henüz hiçbir şey harcanmamıştır, yani cevap zorunlu olarak son okumanın verdiği cevaptır. Ve sınırın tabanı kullanıcının **kendi aktif aralığıdır**, nabızla tek bir `lastFetchAt` üzerinden paylaşılır — yani iki otomatik okuma asla kullanıcının ayarladığı sayıdan daha yakın olamaz. Gerçek iş yükünde ölçüldü (10 sn arayla 12 hızlı tur): **12 istek, 10 sn arayla → 2 istek, asla 60 sn'den yakın değil.**
  - **Nabzın sahibi gösterge, kart ona biner:** çubuğun az önce okuduğu ne ise aynı adımda açık karta itilir, kart da kendi zamanlayıcısını ona göre yeniden kurar. İki yüzey, tek rakam, tek istek. İkisi de hangi pencerede olduğunu söyler — kart alt satırında (`live · every 60 s while an agent works`), gösterge ipucunda — çünkü göremediğin bir tazeleme hızına güvenemezsin. `usage.plan` aynı `beat`'i ajanlara da döner; böylece önbellekten gelen cevabın ne kadar bayat olabileceği bilinir.
- **‼️ 429'ları doğuran şey aralık değildi — eksik `User-Agent`'tı (3.45.0).** 15 saniyelik aktif nabız, rate limit yüzünden işe yaramaz hâle gelmişti; ve akla ilk gelen çözüm (daha seyrek sorgula) yanlış olandır: `/api/oauth/usage` **belgelenmemiş** bir uçtur, ne bir limit ne bir `Retry-After` ne de amaçlanan bir sorgu sıklığı yayınlar — belgelenmesi istekleri *yapılmayacak* diye kapatıldı — ama **iki kovası** vardır ve seni hangisine koyacağına başlık karar verir. **Hiç `User-Agent` göndermeyen** bir istek — Node'un `https` modülünün varsayılanı, yani Agent Farm'ın eskiden gönderdiği — sert kısıtlanan kovaya düşer ve **aralık ne olursa olsun kalıcı 429** alır. Önem sırasıyla üç değişiklik:
  - **İstek artık tam CLI'ın kendi isteğinin kılığında gidiyor.** Tahminle değil, kurulu binary'den okunarak: `claude-cli/<sürüm> (external, cli)` ve `x-app: cli`, aynı OAuth beta kapısı üzerinden. Buradaki hiçbir şey bize uygulanması amaçlanan bir limiti aşmaya çalışmıyor — kullanılan şey kullanıcının kendi token'ı, kendi hesabı ve CLI'da `/usage`'ın ona zaten yazdığı rakamlar. **Sürüm için süreç doğurulmuyor:** her Claude Code transkript satırı onu yazan sürümü taşır, yani en yeni oturum satırı sürümü zaten bilir (`SessionInfo.version`); hiç transkripti olmayan makine, boş göndermek yerine bilinen-iyi bir sürüme düşer.
  - **Aktif pencere 60 sn, kodda zorlanan 30 sn tabanla.** Birkaç saniyelik bir ayar, ucun kabul edeceği bir tercih değildir; bu yüzden hızlı pencerenin kendi tabanı var (`MIN_ACTIVE_BEAT_MS`) — topluluk araçlarının güvenli bildirdiği 180 sn'nin belirgin biçimde altında, ama cezalı kovayı hak eden davranıştan da uzakta.
  - **429'un cevabı yeniden sormak değil, geri çekilmektir.** `Retry-After` olmaması tek güvenli okuma bırakır: dur, ve her tekrarında beklemeyi ikiye katla — 3 → 6 → 12 → 15 dk tavan, tek bir başarı hepsini siler. **Geri çekilmeyi yalnızca bir İNSAN aşabilir** — ⟳ düğmesi, çünkü ona basan kişi o isteği harcamaya karar vermiştir ve çeyrek saat sessizce reddeden bir kontrol, sana bozuk olduğunu öğretmiş olur. Otomatik hiçbir şey bu ayrıcalığı almaz; `usage.plan`'ı `force` ile çağıran **ajan** da almaz (sınır yolundan gider: önbelleği atlar, geri çekilmeyi asla). Durum ipucunda ve kartın notunda **açıkça söylenir** (`backing off, next automatic read in 6 min`) — bilerek bayatlayan bir kart, salt donmuş görünmemelidir.
  - **‼️ Bir okumanın üç sebebi artık adlandırılmış, çünkü üçü farklı şeyleri atlamaya yetkili (3.45.1).** `beat` (zamanlayıcı) hiçbir şeyi atlamaz. `edge` (tur az önce bitti) yalnızca TTL'i atlar ve tabanı aktif aralıktır. `user` (düğme) TTL'i ve geri çekilmeyi atlar, tabanı yalnızca 5 sn. **User-Agent düzeltmesinden SONRA 429'ların hâlâ geldiği yer burasıydı:** sınır, düğmenin `get(true)`'sunu çağırıyordu — yani sistemin en yoğun olaylarından biriyle tetiklenen otomatik bir okuyucu, *insanın* ayrıcalıklarını taşıyordu; hem TTL'i hem de onu kurtarması gereken geri çekilmeyi altında yalnızca 5 sn tabanla yürüyerek aşıyordu. Nabzı kibarca ayarlamak bu yüzden alakasızdı. Hiçbir tavana uymayan otomatik okuma bir optimizasyon değil, hatanın kendisidir.
- **‼️ Durum çubuğundaki iki göstergenin ikisine de basmak Dashboard'un EN TEPESİNE düşürür (3.45.0).** Sayfa gizlenirken bellekte tutulur, yani *ortaya çıkarmak* ile *açmak* aynı şey değildir: sayfa okuyucunun bıraktığı yerden geri gelir, ki bu genelde oturum tablosunun derinliğidir — tıklamanın **hakkında olduğu** KPI satırının ve plan kullanım kartının birkaç ekran altı. Kümedeki iki gösterge tek sözleşmeyi paylaşır (`OPEN_DASHBOARD_AT_TOP`), çünkü aynı jeste farklı cevap veren iki komşu zaten hatanın kendisidir; komut paleti, global nav ve bütün bildirimler sayfayı yine kaydırmadan açar. Kaydırma yumuşak değil anlıktır: burada olan şey sayfanın açılmasıdır, varışta animasyon ise arıza gibi okunur.
- **Daily cost by agent**: ajan bazında yığılmış maliyet grafiği. Aralık seçici (2.13.0 ile genişledi, **3.38.0 ile sorulabilir hâle geldi**): ilk hafta **gün gün — 1d 2d 3d 4d 5d 6d 7d** — sonra **14d / 30d / 90d / 180d / 365d**, sonra iki tarih için **⇤⇥**. (**3.40.0:** ilk hafta çıplak rakamlarla çiziliyordu, yani aynı çubuğun yarısında birim vardı yarısında yoktu; "14d"nin yanındaki tek başına bir "5", beş gün dışında her şey diye okunur.) Adımlar 7'den başlıyordu, yani *"dün ve bugün"* bu sayfaya sorulamayan bir soruydu, *"temmuzdaki o hafta"* da öyle; özel aralık zaten baktığın açıklıkla açılıyor, ters aralığı reddediyor ve kartta kendi adını söylüyor (`Cost · 2026-07-10 → 2026-07-16`). Bütün yollar aynı gün-anahtarı listesinde bitiyor; KPI kartları, grafik ve ajan başına sütunlar topladıkları günlük kovalar kadar doğru kalıyor. 120 günü aşan aralıklarda çubuklar okunur kalsın diye günlükler otomatik **haftalık gruplanır** (başlıkta "weekly buckets" notu). Tüm günlük veri zaten oturum kayıtlarından geldiği için 1 yıllık görünüm ek yük getirmez.
- **Cost by model**: hangi modele ne kadar harcandığını gösteren halka grafik.
- **Token types**: input / output / cache write / cache read dağılımı. Cache read oranın yüksekse prompt cache verimli çalışıyor demektir — bu iyidir.
- **Activity heatmap**: haftanın günü × saat bazında mesaj yoğunluğu. Çalışma ritmini gösterir.
- **Agent kartları**: durum, bugün/aralık maliyeti, mini trend çizgisi, bulgu rozetleri. Karta tıkla → detay sayfası.
- **Sessions tablosu (2.50.0 — eski Top/Recent tabloları birleşti; 2.57.0'dan beri Ajan Detay sayfasıyla ortak)**: tek tablo, **Sort by** seçicisiyle — Recent (varsayılan) · Cost · Tokens · **Ctx now** (2.57.0) · Duration · Turns; hangi kriteri seçersen seç çiftliğin gerçek zirvesi gösterilir, seçim hatırlanır. Kolonlarda araç/hata sayıları ve **Ctx now** var — oturumun son cevabından sonra model penceresindeki yaklaşık bağlam, "hangi oturum compact zamanına yaklaştı?" sorusunun anlık cevabı (— ise transkript kaydetmemiş demektir). Yeşil **●** o an aktif oturumları işaretler; **her satırda ⌨ düğmesi var** (2.58.0) — oturum boşta beklerken de terminal penceresi açık olabilir; ⌨ o oturumun terminaline atlar, pencere bulunamazsa dürüstçe söyler. Satır başındaki **▸** o oturumun **tur listesini** açar — her turun başlığı, tur başına token ve maliyetiyle; transkriptten istek anında hesaplanır. Oturum satırları tonlu ve vurgu kenarlıdır, böylece açılan satırın turları iç içe içerik olarak okunur. Tur kontrolleri görüntüleyicideki akordeonla aynı: **Expand all / Collapse all / Single-open** — ve 3.20.0'dan beri **Single-open burada da varsayılan** (aynı anda tek oturumun turları açık; böylece tablo, kaydırılan bir sayfaya dönüşmeden taranan bir liste kalır); açıkça "kapalı" dediğin hatırlanır. Satırın kendisine tıklamak transkripti açar; **tur satırına tıklamak transkripti tam o turdan açar** (2.51.0) — görüntüleyici zaten açıksa ikincisi açılmaz, o sekme öne getirilip tura kaydırılır.
- **Çoklu seçim (3.58.0):** her satırda bir kutu, aralık için **shift-tık** (baktığın sıraya göre) ve başlıkta **listelenen** her şeyi alan bir kutu (filtrenin sakladıklarını değil). Bir çubuk kaçını seçtiğini, ne tuttuğunu ve kaçının çalıştığını söyler. **Kendine ait bir eylem çubuğu bilerek yok**: seçim satırın `data-vscode-context`'ine binip gidiyor, böylece zaten bütün oturum eylem kümesi olan sağ tık menüsü *toplu* menüye dönüşüyor — sabitle, etiketle, projeye dosyala, id'leri kopyala, böl, sonlandır, listeden çıkar — yeni bir komut olmadan ve tabloyu gömen sayfanın cevaplayacağı hiçbir şey olmadan. Seçim **dışındaki** bir satır seçim taşımaz; menü her zaman işaret ettiğin şeye uygulanır. Bir kümeyi sonlandırmak bir kez sorar ve sayıyı söyler; listeden çıkarmak sormaz, çünkü hiçbir şeyi yok etmez. Seçim saklanmaz (geri yüklenen bir seçim, yarım kalmış bir eylemdir) ve havuzdan düşen satır seçimden de düşer.
- Üst satırda **Live Timeline** düğmesi (2.22.0): Refresh ile Guide arasında — panodan kulvar görünümüne tek tık.
- **Sessions tablosu filtreleri (2.72.0):** sort kutusunun yanındaki **Filters** chip'i (ortak bileşen — Ajan Detay sayfası da kazanır) satırın kendi rakamları üzerinde panel açar: **başlık-içerir metin**, **ajan dropdown'ı** (dashboard varyantı), **Active now / Has errors / Main only** bayrakları, token, maliyet, ctx, dakika, tur, araç ve hata için **min–max aralıkları** ve **tarih aralığı**. Serbestçe birleşir, canlı `N/M sessions` sayacı, dürüst "No sessions match" satırı, tek tık Clear — hepsi sayfa başına hatırlanır.
- **Senin diyalogların mı, çiftliğin kendi koşuları mı (3.20.0):** nöbetler, zamanlı görevler ve tetikleyiciler çalışırken gerçekten *konuştuğun* oturumlar tabloda azınlıkta kalır. Artık dar bir **By** kolonu her satırın kaynağını işaretler — **🧑 sen başlattın** (etkileşimli oturum) ya da **🤖 otomasyon başlattı** (zamanlı görev / tetikleyici / task / mission ya da herhangi bir `claude -p` koşusu) — ve tablo **🧑 kapsamında, yani senin oturumlarınla açılır**. Filters'ın hemen önündeki **🧑 chip'i** paneli hiç açmadan **tek tıkla User ↔ All** arasında geçer; filtre panelindeki **Started by: All / 🧑 User / 🤖 Auto** satırı üçüncü kapsamı ekler ve kapsam sayfa başına hatırlanır. Kapsam satır gizlediğinde chip satırı bunu söyler (`12/47 sessions`). Kaynak bilgisi **transkriptin kendi `entrypoint` alanından** okunur; zamanlamadan ya da komutun şeklinden tahmin edilmez — bilinmeyen entrypoint "senin" sayılır, yani filtre gerçek bir konuşmayı asla gömemez. Host'un gönderdiği satır havuzu **kaynak başına ayrı** kurulur; ham listeye otomasyon ne kadar hâkim olursa olsun User kapsamı yine kendi gerçek ilk N'ini görür. **‼️ 3.140.0'a kadar 🤖 iki ayrı şeyi birden örtüyordu.** Bir robot satırı ya **headless** bir koşudur — terminali olmayan, başında kimsenin bulunamayacağı bir `claude -p` — ya da *interactive* modda başlatılmış, insanın içine yazabileceği gerçek bir terminal açan bir task. Birincisini **robotun üzerine binen küçük bir 🌙** (🤖🌙) işaretler: bütün oturum tablolarında ve Session Viewer'ın kendi satırında, hover'da da kelimelerle. Filtre panelindeki **Started by:** satırına üç kapsamın yanına bir **🌙 Headless** chip'i eklendi — varsayılan olarak açık (istemeden hiçbir şey gizlenmez); basınca hangi kapsam görünüyorsa headless koşuları oradan düşürür ve Filters (n) rozetinde kendini sayar, böylece kapalı bir panel bu gerçeği saklayamaz. Karar host tarafında, kaynağın okunduğu aynı iki kayıtlı olgudan verilir (`core/sessions.ts` → `sessionHeadless`) ve ajanlara `sessions.recent` / `sessions.find` satırlarındaki `headless` alanı ile bir `headless?` filtre argümanı olarak ulaşır. **‼️ Ve 3.210.0'a kadar (S-41) bu iki eksen VERİDE tek eksendi.** İnteraktif bir görev hiç launch binding üretmiyordu — yayıncı modu headless olmayan her şeyi atlıyordu — dolayısıyla koşunun `launchedBy` kaydı olmuyor, köken kuralı "bir ajanın klasörü ve bize ait hiçbir kayıt yok" son maddesine düşüp zamanlanmış bir koşuyu 🧑 **You** damgalıyordu. Artık çiftliğin başlattığı her görev, neyin içinde koşarsa koşsun bağlanıyor ve `sessionHeadless` artık işe `sessionOrigin` sormakla başlamıyor: iki soru da kendi kanıtından yanıtlanıyor, böylece 🤖 **Auto** + gerçek bir terminal tablonun gerçekten gösterebildiği bir durum oluyor.
- **Herhangi bir pencerede Agent comparison (2.72.0):** karşılaştırma tablosunun sabit "all time"ı **dönem seçicisi** oldu — 1/2/6/12/16 saat, 1–5 gün, 1–4 hafta, 1/2/3/6/9 ay, 1/2/3 yıl, **All time** (varsayılan) ve **Custom range** (iki tarih, uçlar dahil). Son 24 saat içinde başlayan pencereler **saat hassasiyetinde kesindir** (48 saatlik mesaj-bazlı kayıttan toplanır); daha uzun pencereler günlük bucket'ları gün hassasiyetinde toplar — dipnot hangisinin geçerli olduğunu söyler. Pencere modunda ajan başına Sessions · Cost · Tokens · Msgs görünür; **sort kutusu + yön çevirme** her iki modda tabloyu istediğin kolona göre sıralar.
- **Kaç satır göstereceğine sen karar verirsin (2.73.0, varsayılanlar 2.74.0):** Sessions tablolarında (Dashboard + Ajan Detay) sort kutusunun yanında **Show** kutusu — Dashboard varsayılanı **20**, Ajan Detay varsayılanı **50**; sayı yaz, tablo o kadar satır listeler; **All** chip'i (ya da kutuyu boş bırakmak) hepsini gösterir. Sayı değişince satır havuzu host tarafında yeniden kurulur — hangi kriteri seçersen seç gösterilen, o kriterin *gerçek* ilk N'idir, eski havuzun yeniden dilimlenmişi değil. **Agent comparison** tablosu aynı kontrolü kazandı: varsayılan 12 ajan, Show kutusu + All; liste kesilmişse dipnot dürüstçe `Showing N of M agents` der.
- **Başlıkta Toolbox ve Turns (2.81.0):** Dashboard'un global kümesinde Missions ile ⌕ Search arasında iki kısayol daha — **Toolbox** (eklenti konsolu) ve **Turns** (çiftlik çapında tur tablosu, aşağıda).
- **⚖ Sync constitution (3.40.0):** Turns'ün yanında, hedeflerin bulunduğu **alt satırda** — bir hedef değil, sayfanın sahiplendiği tek çiftlik-çapında **eylem**. Ortak anayasayı (nest kökünün kendi `CLAUDE.md`'si) diğer motorların okuduğu `AGENTS.md` dosyalarına aynalar. **Hiçbir düğmesi yoktu:** komut paleti ve `constitution.sync` köprü op'u dışında ulaşılamıyordu — yani **aynı anda BÜTÜN ajanlara dokunan tek işlem**, tıklanamayan tek işlemdi; herhangi bir tek ajanla değil filonun tamamıyla ilgili olduğu için de yeri burası. Düğme komut paletinin çağırdığı komutun aynısını çağırır: sapma denetimi, elle düzenlenmiş `AGENTS.md` için modal uyarı ve `.afbak` yedeği o komutun, ve o komuttan bir tane var. `CLAUDE.md` yalnızca **okunur**.

Dashboard, oturum kayıtları değiştikçe kendini otomatik günceller.

### Ajan Detay Sayfası

Tek bir ajanın komuta ekranı:

- Üst düğme satırında **Dashboard** ve **Live Timeline** (2.43.0) — üç ana yüzey arasında tek tık geçiş.
- Toplam maliyet, oturum başına ortalama, araç çağrısı ve hata sayıları.
- Son 30 günün maliyet grafiği ve model dağılımı.
- **Fixed context load**: her oturumda otomatik yüklenen sabit bağlam (`CLAUDE.md` + `MEMORY.md` + `AGENTS.md`) bütçe çubuğu. Detay için aşağıdaki Sağlık bölümüne bak.
- **Top tools**: ajanın en çok kullandığı araçlar — ajanın gerçekte ne iş yaptığının röntgeni.
- **Health & optimization**: bu ajana özel bulgular; satıra tıklayınca ilgili dosya açılır.
- **Task health** kartı: bu ajana delege edilen işlerin 30 günlük karnesi — detay için [Görev Sağlığı](#gorev-sagligi).
- **Memory files**: boyut, token ve tazelik bilgisiyle hafıza tablosu.
- **Sessions (2.57.0'dan beri Dashboard'un gelişmiş tablosu)**: bu ajanın oturumları, Dashboard'daki Sessions tablosuyla **birebir aynı bileşende** — Sort by (Recent · Cost · Tokens · **Ctx now** · Duration · Turns, sayfa başına hatırlanır), tur başına token/maliyet gösteren ve tıklayınca transkripti tam o turdan açan **▸ tur akordeonu**, **Expand all / Collapse all / Single-open**, aktif satırlarda yeşil ● + **her satırda ⌨ terminale atla** (2.58.0), süre/tur/araç/hata/token/**Ctx now**/maliyet kolonları. Varsayılan **50** satır (Dashboard'un 20'sine karşılık ajanın kendi günlüğü daha derindir); sort kutusunun yanındaki **Show** kutusu / **All** chip'i (2.73.0) kaç oturumun listeleneceğini seçer. **By** kaynak kolonu ve 🧑 User ↔ All anahtarı burada da vardır (3.20.0) — nöbet yükü ağır bir ajanda kendi konuşmanı bulmakla kırk gecelik süpürmenin arasında kaybolmak arasındaki fark budur.

### Oturum Görüntüleyici

> **Metin kesilmez (3.30.1).** Sayfanın varlık sebebi transkripti **okumak** olduğu için **kullanıcı ve ajan metni asla kırpılmaz** — uzunsa uzun. Yalnızca **araç yükleri** (büyük bir dosyanın `Read`'i, dev bir JSON sonucu) bir tavana takılır: 200.000 karakter, ve tavana değdiğinde bunu açıkça söyleyip "Open raw JSONL"a yönlendirir. Üstteki satırda ayrıca **✎ Rename** (oturuma ad ver) ve **💬 Console** düğmesi (menüsünde *Resume this session here*) vardır.
>
> **Sekme başlığı (3.30.3):** `Session #3f2a91b8 · Kalan eks…` — **en fazla 30 karakter**. Önde **kimlik** (hep tam), arkada **ad** (sığdığı kadar). Bir webview sekmesinin VS Code'da yalnızca **tek bir metni** vardır (`WebviewPanel.title`); ayrı bir tooltip API'si yoktur, üzerine gelince görünen şey aynı başlıktır. Sekmeler etiketlerine göre genişlediği için tavan gerçek bir sınırdır: uzun bir ad, bir sekmeyi üç sekme genişliğine çıkarıyordu — kesilen ad olur, sekme değil.

Bir oturumun ham JSONL kaydını okunur konuşmaya çevirir:

- Mesajlar renk kodludur: mavi = kullanıcı, yeşil = asistan, sarı = araç çağrısı, mor = araç sonucu. Hatalı araç sonuçları kırmızı kenarlıkla ve açık halde gelir.
- Her asistan mesajında model, token ve maliyet görünür. Yalnızca araç çağrısı yapan (metinsiz) asistan adımlarının token'ı da kaybolmaz — ilk araç çağrısı satırında görünür (2.6.0).
- **Tur bantları (2.6.0, 2.8.0'da belirginleştirildi):** her kullanıcı komutu yeni bir tur açar. Tur başlangıcı artık ince bir çizgi değil, **tam genişlikte renkli bir bant**: vurgu renkli sol kenar, kalın `Turn 3/12`, komutun ilk cümlesi ve o turun token/maliyeti. Bant **yapışkandır** — hızlı kaydırırken içinde olduğun turun bandı üstte sabit kalır, tur geçişleri kaçmaz. Banttaki **onay kutusu** o turun MD dışa aktarımına dahil olup olmayacağını seçer; **↑ ↓ okları** (2.9.0) kaydırmadan bir önceki/sonraki tura zıplatır — bant yapışkan olduğu için oklar hep elinin altındadır (↑ okunun hiç kaydırmama hatası 2.11.0'da giderildi).
- **Tur akordeonu (2.48.0; 3.20.0'dan beri katlı + tek-tur açılır):** tur bantları aynı zamanda katlama başlığıdır — **banda tek tık** o turu bandına kadar katlar (▸/▾ ok işareti durumu gösterir; katlı bant mesaj sayısını da yazar), ikinci tık geri açar. **Transkript artık tamamen katlı ve Single-open modunda açılır:** ilk gördüğün şey metin duvarı değil, oturumun *tur listesi* — tıklanabilir vurgulu bantlardan oluşan bir harita; bir turu açınca önceki katlanır. Mesaj listesinin üstündeki `Turns:` satırındaki **Expand all / Collapse all** bunu her an geçersiz kılar, **Single-open** ise modu açıp kapatır (seçim hatırlanır — açıkça "kapalı" dediğin de kalıcıdır). Canlı bir oturumda sen okurken gelen yeni turlar da katlı gelir; ama elle açtığın bir tur arkandan asla katlanmaz. Bir tura atlayan her şey — breakdown tablosu, ↑ ↓ okları, timeline/arama/feed tıkları — hedefini otomatik açar, yani hiçbir şey erişilmez kalmaz. Katlama yalnız görünümdür; ama istersen Export MD onu da dikkate alır (aşağıya bak).
- **Dış motor transkriptleri gerçek transkriptlerdir (3.112.0), Claude biçimine sokulmuş tahminler değil.** Codex rollout'u kendi `session_meta` / `turn_context` / response olaylarından okunur: sayfa `rollout-…` dosya adını değil gerçek thread UUID'sini kullanır, enjekte edilen proje zarflarını diyalogdan çıkarır, cevabın iki kopyasını tekilleştirir ve araçlarını, kullanımını, modelini, eforunu gösterir. Antigravity'nin eski SQLite yükü, CLI'ın şema veya dışa-aktarma komutu sunmadığı protobuf'dur; dolayısıyla bu sürümden önce yapılmış konuşmalar geriye dönük kurulamaz. Agent Farm bundan sonra host ettiği her Antigravity konuşmasının normalize diyalog/araç/toplamlarını global storage altında sürümlü, düz JSON transkriptine yazar; bu dosya yalnız metadata taşıyan satırın yerini alır ve aynı görüntüleyicide açılır. `/context` yakalama Claude'a özgüdür; dış motor sayfası yanlış kimlikle `claude --resume` koşturmak yerine bunu açıkça söyler.
- **Turun başlama tarihi, üstüne gelince (3.52.1):** bir tur bandının — ya da Turn breakdown tablosundaki bir satırın — üzerine gelince `Turn started · 12 May 2026, 18:32 (3 days ago)` görünür. Görüntüleyicideki diğer bütün saatler **günün saatidir** (`14:32`); dolayısıyla aylar sonra açılan bir transkript, işin *hangi gün* yapıldığını söyleyemiyordu. Tarihin yeri banttır, çünkü bu sayfanın gezinme birimi turdur. Tarih ve saat kendi yerel biçiminde yazılır (ayrı ayrı biçimlenir; yoksa yerel ayar hafta gününü sayıların ortasına sokabiliyor), geçen süre ise kelimeyle — dakika, saat, gün, ay, yıl. Bu, bandın eski "Click to expand this turn" tooltip'inin **yerini aldı**: ▸/▾ ok işareti, katlanma durumu ve `Turns:` denetim satırı bandın tıklanabilir olduğunu zaten söylüyor; turun sahip olduğu tek tooltip, sayfada başka hiçbir yerde görünmeyen bilgiye harcanır.
- **⬇ Export MD (2.8.0; 2.81.1'den beri ne aktaracağını sorar):** tıklayınca artık **önce sorar** — **Current view** (varsayılan: Show chip'leri, metin filtresi, replay konumu, tur kutuları VE katlama akordeonu hepsi uygulanır — ne görüyorsan onu aktarır) ya da **Everything** (tam transkript, ekrandaki durumu yok sayar). *Current view* seçtiğinde ve katlı turlar varsa, ikinci bir soru katlı turların **tamamen çıkarılmasını** (varsayılan) mı yoksa **yalnız başlık olarak** (gövdesiz `## Turn N` başlığı) mı kalacağını belirler. Dosya başında oturum kimliği, süre, toplamlar ve hangi mod/filtrelerin kullanıldığı yazılır. Kaydetme penceresi **en son kaydettiğin klasörde** açılır (2.9.0; ilk kullanımda oturumun kendi klasörü); önerilen dosya adı **tarih + saat damgası** taşır (`session-abcd1234-2026-07-10_143522.md`, 2.11.0). Kayıttan sonra dosya editörde açılır.
- **Export seçimi (2.9.0):** tur seçimi iki yerden, **senkron** yapılır — turun bandındaki kutu ve Turn breakdown tablosundaki `md` kolonu aynı seçimi gösterir, birinden değiştirince öbürü anında güncellenir. Tablodaki **All / None / Invert** düğmeleri toplu seçim yapar; satırdaki **only** düğmesi tek hamlede "yalnız bu turu" seçer. Başlık satırı ve Export MD düğmesi seçim varken `12/37 in export` sayacını gösterir.
- **Turn breakdown tablosu (2.7.0):** KPI kartlarının hemen altındaki açılır kutu tüm turları **tek tabloda** listeler: tur no, komutun ilk cümlesi, token, maliyet. Satıra tıkla → o turun ayracına atlar (replay'deyken oynatmayı o tura taşır). Tur toplamları artık oturum toplamıyla birebir tutar — düşünme (thinking) adımlarının token'ı da turuna yazılır.
- **Show filtresi (2.7.0; 2.52.0'dan beri varsayılan Dialog; 3.20.0'da "Agent" adlandırması + ikonlar):** mesaj listesinin üstündeki chip satırı türlere göre filtreler: **All · Dialog · 🧑 User · 🤖 Agent · 🔧 Tool calls · 📄 Results · ⚠ Errors**. Yapay zekâ tarafının adı artık **Agent**, "Assistant" değil — burada karşılık veren bir ajandır; etiket, kullanıcının kendi yazdığı konuşmacı etiketiyle aynı duruşu izler. **Diyalog** ikonları (🧑 🤖) mesajların kendisinde de tekrarlanır; uzun bir transkript kelime kelime okunmadan, işaretten taranır — ama bir araç satırı onun yerine kendi **adım türü** çipini taşır (`⌘ ⇄ ⌗ ⑂ ⚙ ↩`, 3.88.0): 🔧 bir web çekimine, bir MCP çağrısına ve yereldeki bir Read'e aynı şekilde çiziliyordu, bir satırda bir işaret vardır. "Dialog" yalnız sen + ajan konuşmasını bırakır (araç trafiği gizlenir) ve görüntüleyici bununla açılır — **All**'a tek tık her şeyi geri getirir. Chip'ler çoklu seçilebilir. Filtre **replay'i de etkiler** — Dialog seçiliyken replay'de yalnız diyalog akar. Filtrenin gizlediği bir şeye giden derin link (timeline/arama/feed/tur satırı) hedefi kaçırmak yerine **filtreyi temizler**.
- **Tur başına model (2.52.0):** her tur bandı, breakdown tablosu ve Markdown dışa aktarımı o tura hizmet eden modeli gösterir — model her dört seansın yaklaşık birinde seans ortasında değiştiği için bu bilgi seans başına değil **tur başına** verilir. Model kimlikleri transkriptten **verbatim** okunur: yarın çıkan bir model burada güncelleme gerektirmez (yalnızca fiyat kuralı ister). Aynı mekanizma, Claude Code bir effort/reasoning etiketi yazmaya başladığı an onu da gösterir — bugün yazmıyor, dolayısıyla gösterilmiyor.
- **Alt başlıkta kaynak (3.20.0):** başlığın altındaki satır **🧑 your session** ya da **🤖 automation run** ile başlar — Sessions tablolarının filtrelediği ayrımın aynısı; açılan transkript, kendi konuşmanı mı yoksa zamanlı bir koşuyu mu okuduğunu ilk bakışta söyler.
- **⏵ Resume (2.7.0; 3.112.0'dan beri motor-farkındalıklı):** Claude oturumunu terminalde `claude --resume` ile, dış motor oturumunu kendi Console-resume yolu ve kendi kimliğiyle sürdürür.
- **⌨ Terminal (2.55.0, 2.56.0'dan beri oturum-hassas):** odağı **tam olarak bu oturumun** terminaline atlar — aynı düğme Dashboard'daki aktif oturum satırlarında ve Timeline canlı-oturum kartlarında da var. Her başlatma kendi terminalini kaydeder, canlı monitör oturum kimliğini ona bağlar; böylece aynı ajanın eşzamanlı iki oturumu kendi pencerelerine odaklanır. Oturum terminalleri `claude: <ajan> #n` başlığını taşır (her başlatmada benzersiz); harici Windows Terminal oturumları kendi penceresinde açılır ve o sabitlenmiş başlıkla bulunur. Oturum hakkında hiçbir şey bilinmiyorsa (2.55.0'dan önce ya da Agent Farm dışında başlatıldıysa) ajanın en son terminaline düşülür — o da bulunamazsa dürüst bir mesaj söyler.
- **Context now kartı (2.6.0, 2.11.0'da model-farkındalıklı):** son isteğin bağlam boyutu (prompt + cache + çıktı) ve **oturumun modelinin bağlam penceresi** içindeki yüzdesi. Tavan artık sabit 200K değil, modelden bulunur: Fable 5 / Mythos 5 / Opus 4.6–4.8 / Sonnet 4.6+ → 1M; Haiku 4.5 ve daha eski nesiller → 200K. %70'te sararır ve `/compact` ya da `/clear` önerir, %90'da kızarır. **Model tabloda yoksa** yüzde ve renk gösterilmez — sadece ham bağlam boyutu yazılır (tahmini tavan uydurulmaz). `agentFarm.contextWindowTokens` ayarına değer girerek sabit tavan zorlanabilir (0 = otomatik). Oturum çalışırken kayıt her değiştiğinde kart **canlı** tazelenir — "bağlam doldu mu, compact zamanı mı?" sorusunun anlık cevabı.
- **Context breakdown popover — /context dökümü, tek tıkla (3.12.0–3.13.0):** Context now kartının **tamamı tıklanabilir** (köşesindeki ⛁ glifi kalıcı işarettir; üzerine gelince belirginleşir + tooltip çıkar; tıkla → aç/kapa, dış tık ya da **Esc** kapatır) ve `/context`'in **kategori dökümünü** kartın üzerinde bir katmanda gösterir: System prompt · System tools · MCP tools · Skills · Messages · Free space… — her biri token, yüzde ve mini çubuğuyla, kartın düzenini bozmadan. Rakamlar uydurulmaz, iki **gerçek** kaynaktan gelir: (1) oturumda daha önce koşulmuş bir `/context`'in transkripte düşen kaydı (TUI'nin ANSI çıktısı da, print modun markdown tablosu da tanınır); (2) yoksa/tazelemek için popover'daki **⟳ Capture now / Refresh** düğmesi — host, kapalı oturumu `claude --resume <oturum> -p "/context"` ile koşturur (**yerel komut: API çağrısı yok, sıfır maliyet**; aynı oturum dosyasına yalnız zararsız bir snapshot satırı eklenir, fork olmaz; oturumun kendi modeli geçirilir ki pencere tavanı doğru olsun) ve döküm saniyeler içinde popover'a düşer. **Canlı oturumda** Capture bilinçli reddedilir (aynı transkripte ikinci yazar riski alınmaz — canlı monitör + 90 sn mtime tazeliği bunu yakalar): durum satırı seni oturumun terminaline yönlendirir — orada `/context` yaz, kart watcher'la kendini tazeler. Popover altında snapshot'ın **zaman damgası** yazar (canlı göstergeden biraz eski olabilir — koşulduğu ana aittir).
- Üstteki arama kutusu mesajları ve araç adlarını filtreler; kutu doluyken sağında beliren **✕** tek tıkla filtreyi temizler (2.37.0).
- **Open raw JSONL** ham kaydı editörde açar.
- **⌂ \<ajan\> (2.60.0):** hemen yanındaki düğme oturumun **sahibi olan ajanı** adıyla gösterir ve tek tıkla o ajanın sayfasını açar — "bu kimin oturumuydu?" diye Dashboard'a dönmek gerekmez. Ajan köklerinin dışında yaşayan oturumların sahibi yoktur, düğme de görünmez.
- Çok uzun oturumlarda son N mesaj gösterilir (`agentFarm.maxTranscriptMessages` ayarı, varsayılan 1500).
- **▶ Replay** oturumu adım adım oynatır — ayrıntı için [Oturum Replay](#oturum-replay).

### Turlar Sayfası (Turns) {#turlar-sayfasi}

**Agent Farm: Open Turns** (ya da Sessions tablosunun hemen yanındaki **⤢ Open Turns page** düğmesi) — bütün çiftlik **kullanıcı turu başına bir satır** olacak şekilde açılır (2.81.0, 3.171.0). Sessions tablosu "hangi oturum?" sorusuna cevaptır; bu sayfa "hangi *tur*, hangi oturumda olursa olsun, çiftlik çapında?" sorusuna. Tur özetleri transkriptler indekslenirken toplanır — sayfa anında açılır, kayıtlar değiştikçe kendini günceller.

- **Beş Motorlu Kapsam (3.173.0 — S-40):** Sayfa yalnızca Claude değil, çiftliğin beş motorunun da turlarını eksiksiz unroll eder: **Claude**, **Gemini** (kendi yanıtının token/fiyatı ve model bilgisi), **Antigravity (brain log)** (kendi adım ve planlayıcı çağrıları, dürüst 0 token), **Antigravity (barındırılan)** (Console `result` satırından gerçek token ve dolar hesabı) ve **OpenCode** (`rgb(60, 135, 255)` rozeti, `step-finish` roundtrip'i, ayrı sayılan `reasoning` ve bağlam penceresi).
- **Tablo Düzeni ve Bildirilmiş Genişlikler (3.171.0 — U-69):** `table-layout: fixed` ve `<colgroup>` ile sütun genişlikleri bildirilmiştir; filtreleme neyi elerse elesin tablo yerinde kalır. Satırlar tek satırda kırpılır, sığmayan değerler AFTip ile açılır.
- **Tek Konulu Hücre Panelleri (AFTip):** Her hücrenin hover'ı ilk satırında o hücrenin tam değerini yazar, altındaki blokta o değerin ima ettiği türetilmiş rakamları verir: **Steps** sütunu API çağrılarını, çağrı başına adımı ve **reasoning** payını gösterir; **Tokens** sütunu plan-ağırlıklı oranla birlikte maliyet ayrımını açıklar.
- **🔖 Wiki Aday Havuzu Entegrasyonu (3.203.0 — K-26):** Her tur satırının başında sakin bir **🔖** wiki rozeti yer alır; tıklandığında veya sağ tık menüsünden **Add to Wiki Candidates…** seçildiğinde açılan popover ile tur doğrudan aday havuzuna aktarılır.
- **Kolonlar:** **By** — turun ait olduğu oturumun 🧑/🤖 kaynağı · Ajan (● aktif noktası, `sub` rozeti, ⌨ terminale atlama) · **Turn** — turu açan komut, satırın kimliği · **Session** — kısa oturum adı · `n/N` tur numarası · Model ve motor rozeti · **Steps** · **Tokens** · When · Duration · Tools · Err · Cost.
- **Sessions tablolarının kontrolleri, tura uyarlanmış:** Sort by (Recent · Cost · Tokens · Duration · Tools · Errors · Turn #), **List** kutusu (varsayılan **200**), **Expand all / Collapse all / Single-open**, **🧑 kaynak anahtarı** ve **Filters** paneli.
- **Görüntüleyicideki gibi bir Show satırı:** **All · Dialog · 🧑 User · 🤖 Agent · 🔧 Tool calls · 📄 Results · ⚠ Errors** — **Dialog (sen + ajan) varsayılan**, araç trafiği bir chip uzağında.
- **▸ turun gerçek içeriğini açar** — komut, asistan cevapları ve araç çağrıları; **satıra tıklamak Oturum Görüntüleyici'yi tam o turdan açar.**
- **⬇ Export MD (2.81.1):** listelenen turları Markdown'a aktarır (`Current view` veya `Everything`).
- Köprü operasyonu: **`turns.list`** (`agent?`, `origin?`, `engine?`, `limit?`).

### Insights Ağacı

Tüm filonun sağlık bulguları tek listede: ⛔ hata, ⚠ uyarı, ℹ bilgi. Bulguya tıklayınca ilgili dosya açılır. Bulgular aşağıdaki Sağlık kurallarından üretilir.

### Live Feed

Filodaki son olayların canlı akışı: kullanıcı komutları (prompt), araç çağrıları ve hatalar, ajan adıyla birlikte. Oturum kayıtları değiştikçe kendiliğinden yenilenir. Bir olaya tıklayınca ait olduğu oturum açılır ve görüntüleyici **tam o olayın mesajına kayar** (2.42.0 — timeline ve arama ile aynı mekanizma).

### Durum Çubuğu

`🤖 N active • $X today` — aktif ajan sayısı ve bugünkü toplam maliyet. Üzerine gelince 5 saatlik pencere özetini de gösterir. 30 saniyede bir ve her veri değişiminde güncellenir.

**Token lap sayacı (2.6.0):** kronometrelerin lap tuşu ya da arabalardaki günlük kilometre sayacı gibi — ana sayaçlar (bugün / 5 saatlik pencere) transcript'lerden türediği için sıfırlanamaz, ama **kendi sıfırlanabilir sayacını** başlatabilirsin:

- **Agent Farm: Reset Token Lap** — o andan itibaren tüm filonun token/maliyet/mesajını saymaya başlar; durum çubuğunda `⏱ 84.2K` olarak görünür, tooltip'te ayrıntısı ve sıfırlama/temizleme linkleri vardır.
- Yeni tur için tekrar **Reset Token Lap**; sayacı kaldırmak için **Clear Token Lap**.
- Sınır: lap, son 48 saatlik mesaj penceresinden beslenir — 48 saatten yaşlı bir lap yalnızca son 48 saati sayar (tooltip'te uyarır).

## Console — panelin içinde konuşmak {#console}

*(3.28.0)* Denetimin etrafında kurulduğu **yapısal boşluk**: Agent Farm bir oturum hakkında her şeyi okuyabiliyordu, hiçbirine **bir şey söyleyemiyordu**. Console bunu kapatır.

**💬 Console** sekmesi (global nav'ın başında, `Ctrl+Alt+C`) uzun ömürlü `claude` süreçlerini **panelin içinde** barındırır — CLI'ın kendi streaming JSON kanalı üzerinden. Solda bu pencerenin barındırdığı oturumlar + rafın ve son transkriptler (tıklayınca **Console'un içine devam ettirilir**); sağda konuşma ve yazma kutusu.

> **Yazma kutusu pencerenin alt kenarına çivilidir (3.31.2).** Console bir *belge* değil *uygulama*: sayfanın kendisi **hiç kaymaz**, tam pencere boyundadır. Uzayabilecek iki şey — konuşma ve soldaki oturum listesi — **kendi içlerinde** kayar; yazma kutusu konuşmanın altında, pencerenin alt kenarından 12px yukarıda durur. Eskiden iki kural "en az bu kadar uzun" diyordu ("en fazla" demesi gerekirken): `#app` **min**-height:100% idi, yani sayfa konuşmayla birlikte büyüyordu; sol listenin de tavanı yoktu, uzun bir liste tek başına satırı uzatıyordu. Sonuç: her yeni satır yazma kutusunu biraz daha aşağı itiyor, sonunda ekrandan çıkarıyordu. **Ölçüldü** (Chromium, gerçek stylesheet, 40 oturum + 320 satır; 1200×700 ve 820×420): sayfa kaymıyor, yazma kutusunun alt kenarı **200 satır aktıktan ve 100 oturum eklendikten sonra bile aynı yerde**, Send görünür kalıyor, metin kutusunu elle büyütmek konuşmayı daraltıyor — kutuyu dışarı itmiyor.

**Senin kurulumun, senin aboneliğin:** bizim bir API anahtarımız yok, maliyet modeli değişmiyor, transkript yine `~/.claude/projects` altına yazılıyor — yani mevcut analitik / sağlık / zaman çizelgesi motorlarının hiçbiri bozulmuyor.

**Soldaki satıra sağ tık = VS Code'un kendi menüsü (3.30.2).** Barındırılan karta da, aşağıdaki devam ettirilebilir satıra da sağ tıkladığında **standart menü** (Copy/Paste vb.) açılır ve altına o oturumun eylemleri eklenir: **Resume in Terminal**, **Rename Session…**, **Open Transcript**, devam ettirilebilir satırda ayrıca **Resume in Console**. Sağ tık artık doğrudan bir yeniden adlandırma kutusu açmıyor — bir sağ tıkın tek anlamı olması, menüyü tamamen ortadan kaldırmak demekti. Kartlarda ajan adının yanında **oturumun adı** da yazar; devam ettirilen bir oturum kimliğini **süreç doğmadan** bilir, dolayısıyla adı ve yeniden adlandırması ilk andan itibaren çalışır ("bu oturum kimliğini bildirmedi" hatası buradan geliyordu).

**Satırlar ne söyler (3.30.4):** barındırılan kartta üst satır `developer (#407c78cb)` + sağda **maliyet ve aldığı token** (`$0.12 (48.2k)`), altında **oturumun adı**, en altta durum · tur · süre · **ctx now** (modelin penceresinde şu an ne var). Devam ettirilebilir satırlarda da kimlik ve **ctx now** vardır — o oturumu devam ettirmenin nereden başlayacağı tıklamadan önce görünür. Token'lar her asistan mesajının kendi `usage`'ından toplanır; oturum tablolarındaki sayıyla aynı aritmetik, dolayısıyla aynı anlam.

**‼️ "ctx now" ile "this session" iki ayrı ölçümdür (3.142.0 — X-43).** Şerit `ctx 220.5k / 258.4k · 85%` yazar: soldaki **son model çağrısından sonra pencerede duran** token, sağdaki **o oturumun kendi bildirdiği** etkin kapasite (model kataloğunun yayımlanmış tavanı değil — ölçülen gerçek vakada model tavanı 1,05M iken Codex oturumu 258.400 bildiriyordu). Yanındaki `… this session` ise **konuşmanın ömür boyu harcaması**; araç kullanan tek bir tur onlarca model çağrısı yaptığı için bu sayı pencereyi defalarca aşabilir ve bu normaldir. AFTip ölçümün kendisini, kapasiteyi, doluluğu, **nereden okunduğunu** (`stream-last-call`, Codex için oturumun kendi rollout'u) ve **kaç dakikalık** olduğunu söyler. Kaynak yoksa `—` yazar; hiçbir koşulda oturum veya tur toplamı "yaklaşık ctx" diye gösterilmez, `ctx > pencere` görülürse yüzde çizilmez.

**Akış seni takip eder, sen akışı değil (3.30.4).** Konuşma **yalnızca sen en alttayken** yeni satırı takip eder. Yukarı kaydırıp bir şey okuyorsan sayfa yerinde kalır, gelen satırları sayar ve altta **↓ N new lines** düğmesi çıkarır; ona basınca ya da elinle en alta inince takip kendiliğinden devam eder. Oturum değiştirmek sayacı sıfırlar ve en yeni satırda başlar. (Terminalin davranışının aynısı.)

**Satır türü filtresi (3.30.4).** Yazma kutusunun altındaki **show** seçicisi: 🧑 You · 🤖 Agent · 🔧 Tool calls · 📄 Tool results · ⚠ Errors · ⚙ System · ❓ Questions. Oturum Görüntüleyicideki Show çipleriyle **aynı sözlük**, Search/Notices sayfalarındaki **aynı çoklu-seçim kutusu** (herhangi bir alt küme; *Select all* = filtre yok, yani sonradan eklenen bir tür otomatik içeride). Kaç satırın gizlendiğini altında yazar, seçim yeniden yüklemede korunur.
**3.84.0'ta kutu iki jest kazandı** — ve ikisi de eklentideki *bütün* çoklu-seçim kutularında geçerlidir, açılacak bir ayar yoktur: **onay kutusu** eskisi gibi tek değeri açıp kapar, **yanındaki ad ise "yalnızca bunu"** demektir. İkincisi insanların en sık yaptığı harekettir ve eskiden Clear artı bir tık ediyordu. Ayrıca *Select all* ile *Clear* arasında, o listenin bir adı olan alt kümeleri duruyor: Console'un show kutusunda **Dialog** (sen + ajan, arada makine yok). Ayrıntı: `docs/CONVENTIONS.md` → Filtering.

**Canlı şerit iki satırdır (3.84.0).** Yazma kutusunun üstündeki şerit tek satırken hem cümleyi (*"Read src/core/live.ts"*) hem turun bütün rakamlarını taşımak zorundaydı; hangisi uzunsa diğerini yiyordu ve meta'nın kuyruğu sağ kenardan taşıp okunamıyordu. Artık **birinci satır ne olduğunu**, **ikinci satır ne tuttuğunu** söyler — süre, para, adım/tur sayısı, bekleyen mesaj, model ve effort — sağa yaslı. Aralarında bilerek boşluk yok: bu iki şerit değil, iki satıra basılmış tek şerittir.

**Proje şeridi artık kaydırılabiliyor (3.84.0).** Kutunun üstündeki proje çipi, oturuma verilecek metnin tamamını hover'da gösterir. O metin gerçek bir projede yüzlerce satırdır; yerleşik tooltip onu canı nerede isterse orada kesiyor, kaydırılamıyor ve imleç içine giremiyordu — yani görünmez kanalı görünür kılmak için var olan tek yüzey, sakladığı şeyi gösteremeyen tek yüzeydi. Artık backlog'un `more` kutusunu kanıtlayan zengin panelde (`media/afTip.js`): ekranın izin verdiği kadar uzun, kaydırılır, ve imleç içine girebilir.

**‼️ Ve o panel artık yeniden çizime dayanıyor.** Bu sayfalar host'un kendi ritminde bütün bölümleri baştan çiziyor; tarayıcı ise imleç kıpırdamadan yerine yeni bir düğüm konan öğeye `:hover`'ı **geri vermiyor** — imleç hareket edene kadar. Sonuç: üç satırını okuduğun panel, mouse hiç ayrılmadığı hâlde kendi kendine kapanıyor ve geri gelmiyordu. Düzeltme bileşenin kendisinde, çünkü bu paneli kullanan **her** yüzeyde aynı hata vardı: kaybolan `:hover`'ın yerine imlecin girdiği noktadaki öğeye bir sınıf konur (kaydırma konumu da taşınır), ve o sınıf imleç başka bir yere kıpırdadığı anda düşer — o andan itibaren `:hover` yine dürüsttür. Sayfaların hiçbirinin bundan haberi olmasına gerek yok; `test_tip_repaint.js` tutuyor.

**Kartın sağ tık menüsünde "End & Remove Session" (3.84.0).** End ile Remove ayrı olmaya devam ediyor — biten bir oturumun konuşması okunabilir kalmalı — ama sıradan durum ikisidir birden ve bu iki sağ tık ediyordu; arada gelen yeniden çizim de işaret ettiğin kartı oynatıyordu. Tek maddede ikisi. Ajan tarafında karşılığı zaten vardı: `console.close { id, forget: true }`.

**Console'da devam = kaldığın yerden devam (3.30.3).** Bir oturumu Console'a devam ettirdiğinde **önceki konuşma da geliyor**: yukarı kaydır, orada. Satırların kaynağı diskteki transkript (`~/.claude/projects/…jsonl`) — **yalnızca görüntü**: hiçbir yere bir şey gönderilmez, **tek token harcanmaz**; modelin kendi hafızası zaten `--resume` ile geliyor. Son **150** mesaj taşınır (üstteki satır kalanın transkriptte olduğunu söyler) ve dosyanın yalnızca **sonu** ayrıştırılır, yani devam ettirme maliyeti oturum uzadıkça büyümez.

**Console'daki bir oturumu terminale taşımak (3.30.3).** Console'da çalışan bir oturum için "Resume in Terminal" dediğinde artık "olmaz" duvarı yok: bir oturum bir sürece aittir, ama o süreç **bizim** — Agent Farm **"End it in the Console and continue here"** diye sorar, Console'daki oturumu kapatır, **pid gerçekten ölene kadar bekler** (aksi hâlde aynı transkript üstünde ikinci süreç doğardı) ve terminali aynı oturumla açar. Diğer seçenek oturumu çalıştığı yerde gösterir. Başkasının terminalindeki bir oturum için eski uyarı aynen geçerlidir — o süreç bizim değildir.


### ⚡ Superpowers Mühendislik Disiplini — Diskte Uyuyan Yetenekler ve Kompozitör Anahtarı (3.287.0 — X-55, X-132, X-133) {#superpowers}

*(3.286.0 - 3.287.0)* Yazılım mühendisliği disiplinlerini (Test Güdümlü Geliştirme - TDD, Sistematik Kök Neden Hata Ayıklama, Adım Adım Planlama, Beyin Fırtınası, Doğrulama ve Kod İncelemesi vb.) içeren **Obra Superpowers (v6.3.0)** kütüphanesi Agent Farm'a entegre edilmiştir.

- **Felsefe (Diskte 0 Token ile Uyuma):** 14 adet derin disiplin dosyasını her oturumda baştan prompt'a yüklemek hem devasa token maliyeti yaratır hem de mühendislik gerektirmeyen işleri hantallaştırır. Yetenekler diskte `D:\zone\agent\ajanlar\_SKILLS\superpowers` (veya `agentFarm.superpowersPath` ayarındaki yolda) **0 token maliyetle uyur**.
- **Kompozitör Anahtarı (`[⚡ Superpowers]` Toggle):** Console yazma kutusunun üst şeridinde, Proje çipinin hemen yanında yer alır. Üzerine gelindiğinde (AFTip hover) oturuma enjekte edilecek Kök Kanca metnini ve 14 yeteneğin fihristini **birebir** gösterir.
- **Kök Kanca Enjeksiyonu (`systemPromptFileFor`):** `--append-system-prompt-file` bayrağı tek bir dosya aldığı için, proje brief'i ile Superpowers kancası tek bir metinde birleştirilerek oturumun sistem promptuna verilir. Modele sadece ~2.5 KB'lık bir Kök Kanca (`using-superpowers/SKILL.md`) ve diskteki 14 dosyanın mutlak yol fihristi gider.
- **Talep Anında Okuma (On-Demand Reading):** Model bir hata ayıklarken veya kod yazarken fihriste bakar; kendi dosya okuma aracıyla yalnızca o an ihtiyaç duyduğu `SKILL.md` dosyasını diskten okur ve disipline girer.
- **Ajan Bazlı Varsayılanlar:** `developer` ajanı için bu anahtar **otomatik olarak AÇIK** başlar; diğer genel ajanlar için kapalıdır (`agentFarm.superpowersDefaults`).
- **Köprü:** `superpowers.status` (klasör sağlığı, yetenek sayısı ve ajan varsayılanları), `superpowers.set { agent, on }` (ajan varsayılanını değiştirme), `superpowers.hook` (enjekte edilen güncel kanca metni).
- **Ayrıntılı Kılavuz:** Mimari, dosya yapısı, yardımcı kod şablonları ve taşınabilirlik kuralları için: [`docs/SUPERPOWERS-MIMARISI.tr.md`](SUPERPOWERS-MIMARISI.tr.md).



### Slash Komut Kataloğu (/ Menüsü — 3.333.0 — 3.338.0 — K-29 — K-36)

- **Kompozitörde `/` Seçicisi (`K-30`):** Yazma kutusuna `/` yazıldığında, oturumun çalıştığı motorun (Claude Code, OpenCode vb.) desteklediği tüm yerleşik slash komutlarını listeleyen dinamik bir arama menüsü açılır.
- **Motor Paritesi ve Filtreleme (`K-31`, `K-32`):** Yalnızca o oturumda gerçekten çalıştırılabilecek komutlar sunulur; motorun tanımadığı komutlar elenir.
- **Kabuk ve Terminal Bütünlüğü (`K-33`):** PTY kabuk süreçleri ile doğrudan komut ayrımı yapılır; komutlar hazır olan kabuğa güvenle teslim edilir.

### Self-Restart ve Yeniden Başlatmadan Sağ Çıkan Konsol Oturumları (3.408.0 / 3.410.0 — X-230, X-232)

Agent Farm güncellendiğinde veya yeni bir VSIX paketi kurulduğunda, insan müdahalesine gerek kalmadan eklenti ana makinesinin kendini yenileyebilmesi ve açık diyalogların korunması sağlanmıştır:

- **Kendini Yenileme Köprüsü (`src/core/selfRestart.ts`):** Üç yeni köprü operasyonu eklenmiştir: `farm.health`, `farm.restartExtensionHost` ve `farm.reloadWindow`.
- **Kilitlenme ve Döngü Koruması:** Yeniden başlatma komutu asla köprü handler'ının içinde çalıştırılmaz (handler cevabı yazıp isteği silmeden host ölürse sonsuz açılış döngüsü doğar). Komut 600 ms zamanlayıcı boşluğunda ateşlenir ve diske senkron yazılan cooldown damgası 20 saniye içinde ikinci bir restart'ı kesin olarak reddeder.
- **Oturum Bitimini Bekleme (`when: "auto"`):** Canlı Konsol oturumu varsa restart armed (tetikte) durumuna geçer; son oturum bittiğinde host'u kendiliğinden yeniden başlatır.
- **Restart'tan Sağ Çıkan Konsol Oturumları (`X-232`):** `farm.restartExtensionHost { resume: true }` çağrıldığında, çalışan tüm Konsol oturumlarının kimlikleri, harcanan token tutarları ve scrollback geçmişi diske mühürlenir. Yeniden başlatma sonrasında her kart kendi koltuğunda, konuşma geçmişi transkriptten okunmuş olarak **kaldığı yerden devam eder**; oturumlar düşürülmez.


### Kompozitör ve Başlatma Mimarisi (X-152 / X-180 / K-40 / U-136)

*(3.510.0 — 3.517.0)* Yazma kutusunun altındaki kontrol şeridi (Ajan, Motor, Rota, Model, Efor, İzin Modu, Hesap, Superpowers) **16 Başlatma Boyutunun (`RunDimensions`)** tamamını yönetir.

- **Tek Kayıt Mimarisi (Pure View of Host Record — `X-152`):** Eski mimaride her açılır kutu için ayrı ayrı gönderilen parçalı mesajlar ve bağımsız state değişkenleri kaldırılmıştır. Kompozitör artık Extension Host'taki tek ve kanonik `RunDimensions` kaydının saf bir görünümüdür (`pure view`). Motor veya rota değiştiğinde altındaki model, efor ve hesap alanları anında ve atomik olarak reaktif daraltılır (`narrowing`).
- **Kayıtlı Kurulumlar / Profillerden Tek Tıkla Başlatma (`X-180`):** Sol paneldeki `Start Session…` (veya `agentfarm.startSessionWith`) menüsü gereksiz "Ajan seç" sorusunu atlayarak doğrudan kullanıcının **Kayıtlı Kurulumlar (Saved Setups / Launch Profiles)** listesiyle açılır. Listeden bir profile tıklamak **anında oturumu başlatır**. Profilde ajan atanmamışsa tek seferlik atanır ve kalıcı olarak hatırlanır.
- **Dar Panel Uyumlu Responsive Düzen (`U-136`):** Panel daraldığında kutular birbirinin üstüne binmez veya sayfadan taşmaz; etiketler otomatik olarak kompakt kısa isimlere (`shorthand`) geçer ve tüm butonlar erişilebilir kalır.
- **Varsayılan Dialog Modu ve Oturum Bazlı Filtre Hafızası (`K-40`):** Konsolda açılan yeni oturum kartları her zaman temiz **Dialog** modunda başlar (makine trafiği gizli). Kullanıcının bir oturum kartında seçtiği filtre (`show`) host tarafında oturum kimliğine (`consolePrefs.kindsBy[sessionId]`) bağlı olarak hatırlanır; genel panel varsayılanı bozulmaz.
- **Durdurma (Stop / Interrupt) ve Arka Plan Görev Emniyeti (`S-62`):** Kullanıcı Konsol üzerinde **Stop** (veya `Interrupt`) butonuna bastığında, turun başlattığı arka plan kabuk süreçleri (`run_in_background`) sistem tarafından takip edilir. Bu süreçlerin sonradan tamamlanıp CLI kuyruğuna sahipsiz `<task-notification>` bildirimleri basarak kullanıcıdan habersiz yeni turlar açması engellenir.
- **Canlı Boyut Ayarları:** Oturum çalışırken klasör (ajan) sabit kalırken; model, efor ve izin modu konuşma ortasında CLI'a canlı kontrol komutları (`/model`, `/effort`, `set_permission_mode`) olarak iletilir.

- **⎋ Interrupt:** çalışan turu durdurur — CLI'ın kendi kontrol kanalı üzerinden. **Tur biter, oturum ve bağlamı kalır.**
- **‼️ Tur içinde yazmak o turu yönlendirir (3.39.0).** Ajan çalışırken yazdığın mesaj **çalışan turun içine** gider — CLI onu turun bir sonraki adımında modele teslim eder; terminalde çalışırken yazdıklarının teslim edildiği yolun aynısı. Böylece "hayır, şöyle yap" hâlâ yönlendirilecek bir iş varken varıyor. Satır konuşmaya **↯** işaretiyle girer, çünkü üstündeki turu o başlatmadı. **İki kez ölçüldü:** çıplak CLI'da (araç çağıran bir turun altıncı saniyesinde stdin'e yazılan mesaj, turun bir sonraki adımında modele ulaştı) ve Console'un kendi host'undan `smoke_console_live.js` içinde — orada kelime ancak turu **kapatan satırdan önce** düşerse sayılıyor.
- **⏸ Hold** öteki seçenek, "bunu şimdi değil sırada söyle" için: mesaj kutunun üstünde bekler — **ve hâlâ senindir.** ✎ onu yeniden yazman için kompozitöre geri koyar (boş kutuda **↑** aynısını yapar, terminalin kendi tuşu), **⏩** beklemeyi bırakıp çalışan turun içine söyler, **⨯** atar. Bekletilenler tur bitince sırasıyla gider.
- **‼️ Hold KUTUDAKİNİ park eder — kutu boşken bunu söyler (3.40.0).** İki kompozitör düğmesi de metnini `send()`'e verir; `send()` ise gönderilecek bir şey yokken **tek kelime etmeden** geri döner. Send için bu görünmez (yazmadan bastın). Hold için ise **özelliğin tamamının bozuk görünmesiydi**: Hold'a uzanmanın doğal anı, bir mesaj çalışan turun içine gittikten **hemen sonra**dır — ve o anda kutu boştur, yani düğme hiçbir şey yapmıyor, hiçbir şey söylemiyordu; altındaki kuyruk hiç belirmiyor, dolayısıyla bekletilen satır ve onun **✎ ⏩ ⨯** düğmeleri de hiç görülmüyordu. Bir tıklamaya sessizlikle cevap veren kontrol, sana çalışmadığını öğretmiştir. Artık **park edilecek bir şey yokken düğme sönük** ve ipucu onu neyin canlandıracağını söylüyor; ilk harfte ikisi de canlanıyor. Send de aynı biçimde: boş kutuda tıklamayı yutmak yerine sönük duruyor. (Ayrıca `common.css` `:disabled`'ı nihayet biçimlendiriyor — hiç etmiyordu, yani devre dışı bir düğme tam rengini ve el imlecini koruyordu: başka yoldan aynı yalan, ve sayfa gerçekten render edilip bakılana kadar yarım bir düzeltme.)
- **‼️ Kutunun üstünde dört mini araç: ⎘ yapıştır · ⧉ kopyala · ✂ kes · ✕ temizle (3.43.0, yapıştır 3.45.0).** Bunlar **metne** dokunur, ajana asla — hiçbiri bir şey göndermez, başlatmaz, durdurmaz, park etmez; zaten bu yüzden altındaki kontrol satırında değil, kutunun kendi üstündeler. Yoksa mesajı baştan almak ya da yarım kalmışını başka yere yapıştırmak için almak, her eylemi bir düğme olan bir sayfada yalnızca klavyeyle yapılan bir iş kalıyordu (tümünü seç, sonra bir kısayol). Kutunun sağ altında, **köşenin sahibi olan yeniden boyutlandırma tutamağının solunda** dururlar; üzerine gelene kadar sönüktürler. Taslağa dokunan üçü **yalnızca kutuda metin varken görünür** — boş kutuda kopyala/kes/temizle, işi varmış gibi yapan üç düğmedir. **⧉ ve ⎘ bir anlığına yeşil ✓ ile cevap verir:** kes ve temizle kutuyu gözünün önünde boşaltır, yani makbuz kutunun kendisidir; ama panoya yazmak/panoyu okumak ekranda hiçbir şeyi değiştirmez — ve bir tıklamaya hiçbir şeyle cevap veren düğme, sana çalışmadığını öğretmiştir. İşlem sonrası imleç kutuya döner: fareye uzanmak klavyeyi kaybettirmez.
- **‼️ …ve ⎘ yapıştır asla saklanmayan araçtır, çünkü işi PANODADIR (3.45.0).** Bir yapıştırma düğmesine en çok ihtiyaç duyulan an, kutunun **boş** olduğu andır — yani üstteki kuralın onu tam da saklayacağı an — bu yüzden en solda ve kalıcıdır; üç komşusu onun yanında gelip gider. **Bir yapıştırma düğmesinin yanlış yaptığı tek şey boşluktur:** prompt'a yapıştırdığın şey neredeyse her zaman başka yerden alınmış bir addır (bir yol, bir hata metni, bir oturum id'si) ve tam yazmakta olduğun kelimenin arkasına düşer; imlece yapılan düz bir ekleme ikisini birbirine kaynatır — `şuna bak src/core/live.ts` yerine `şuna baksrc/core/live.ts` — ve düzeltmesi, henüz yapıştırdığın metnin ortasına bir tıklamaya mal olur. Bu yüzden **imlecin komşuları karar verir**: hemen solunda bir kelime karakteri varsa önce bir boşluk konur; boşluk, satır sonu, açılan parantez ya da kutunun en başı varsa dokunulmadan girer — zaten boşluk olan yere boşluk ekleyen kutu, aynı hatanın öteki yüzüdür. Boşluğu yalnızca **sol** taraf hak eder: sağ taraf imlecin bırakıldığı yerdir, yani sıradaki tuş hâlâ senindir. Seçim, tam Ctrl+V gibi değiştirilir ve imleç yapıştırılanın arkasında kalır.
- Her satırda oturumun kendi **maliyeti · tur sayısı · CLI'ın bağlam tahmini** durur.

### ‼️ Oturum sana bir şey sorabilir — ve tur bekler (3.44.0)

Her barındırılan oturum **`--permission-prompt-tool stdio`** ile çalışır — kanalı iki yönlü yapan bayrak budur. Bu bayrak olmadan, ölçülmüş hâliyle: CLI her izni ve her `AskUserQuestion` çağrısını **kendi başına** çözer ("kimse cevaplamadı"), araç hatalı bir sonuçla geri döner ve tur biter — Console'un eskiden gördüğü ve "cevaplanacak bir diyalog yok" diye yanlış yorumladığı durum tam olarak buydu. Bayrakla birlikte, gerçek CLI'a karşı ölçülmüş hâliyle: bir `can_use_tool` kontrol isteği gelir, **tur açık kalır**, ve aynı kanaldan geri gönderilen cevap turun devam etmesini sağlar — yeni bir turda değil, **aynı turda**.

Tur bir soruda beklemeye başladığı an **konuşma ile kompozitör arasında** bir kart belirir, ve oturumun satırı — çalışamayan bir turun göstereceği yanıltıcı `working` yerine — **`asking you`** der. İki şekil var, ve hangisi olduğunu CLI'ın kendisi söylüyor (`requires_user_interaction`):

- **Bir soru** (`AskUserQuestion`) — kendi seçenekleri, her biri tek tıkla; çoklu seçim sorusu **Answer**'a basana kadar toplamaya devam eder, tekli seçim ise onu tamamlayan tıklamada gönderir. Serbest metin de her zaman sunulur — "hiçbiri değil, şunu yap" için, ki bunu hiçbir seçenek listesi taşıyamaz. Ölçülmüş sözleşme: seçilen etiket **aracın kendi girdisinin içine**, sorunun tam metniyle anahtarlanarak geri gider (`answers["<soru>"] = "<etiket>"`) — girdi dokunulmadan `allow` göndermek bir cevap **DEĞİLDİR** ve aracın kendi düştüğü "cevaplanmadı" durumunu üretir.
- **Bir izin** (başka herhangi bir araç) — **üç** çıkış yolu, terminalin sunduğu üçün aynısı (3.93.0): **Allow once**, **Allow \<kural\>**, ya da bir gerekçeyle **Deny**.

#### ‼️ Ortadaki düğme: "izin ver ve bir daha sorma" (3.93.0)

Panelde uzun süre yalnızca dıştaki iki seçenek vardı, dolayısıyla `npm`'e yirmi kez ihtiyaç duyan bir koşu yirmi kez soruyordu ve tek kaçış yolu bütün oturumun kuralını genişletmekti. Ortadaki seçenek kanalın gerçek bir yeteneği: `allow` cevabı `updatedPermissions` taşıyabilir ve CLI onları aracı çalıştırmadan **önce** kurar. Ölçüldü (2.1.226): `default` modundaki bir oturumda üç `touch` komutu **üç soru** demekti; ilkini bu şekilde onaylamak onu **bire** indirdi.

- **Bash komut önekiyle** kapsanır (`npm:*`) — CLI'ın kendi bash kurallarını yazdığı gibi. `npm run package`'ı onaylayan bir insan "her Bash'e izin veriyorum" demiyor.
- **Diğer her araç** adıyla kapsanır; bir araç kuralının taşıyabileceği tek şey odur.
- Kural `destination: 'session'` — süreç kadar yaşar, **hiçbir ayar dosyasına yazılmaz**.
- Düğme hangi kuralı kuracağını **adıyla söyler**; "bir daha sorma" deyip neyi sormayacağını söylememek, kimsenin basmaya cesaret edemediği düğme türüdür.
- Bir `AskUserQuestion`'da sunulmaz: orada genişletilecek bir izin yoktur.

CLI'ın çoktan geri aldığı bir soruyu cevaplamak (tur kesildi, oturum kapandı, başka yerden cevaplandı) sessizce hiçbir şey yapmaz — bir cevabı geçerli kılan tıklama değil, istek kimliğidir. Bir soru hâlâ beklerken turu kesmek ya da oturumu kapatmak, önce onu bir "deny" ile cevaplar; böylece süreç, kimsenin hiç cevap vermeyeceği bir isteği elinde tutarak kalmaz.

**Bilerek köprülenmedi:** bir ajan bir *soruyu* cevaplayabilir (`console.answer`) ama bir araca izin **asla** veremez — genel Needs-You kuyruğunun çizdiği aynı sınır. Bir aracın makineye dokunup dokunamayacağına karar vermek, panelde, kullanıcının kararı olarak kalır.

### Geriye kalan durum: bir kural, bir diyalog değil

Artık izin kararlarının çoğu yukarıdaki kart olarak geliyor. Geriye kalan, **kimseye sorulmamış** ret — bir izin KURALI, bir hook, ya da bayrağı olmayan eski bir CLI — ve bunun için Console yine dürüstçe yapabileceğini sunuyor: **bu oturumun kalıcı izin kuralını canlı değiştirmek ve ajana tekrar denemesini söylemek** — `Allow file edits` · `⚠ Allow everything` · `Plan only`. İzin seçici oturum boyunca canlıdır; terminal yolunda bu hiç mümkün değildi.

#### ‼️ Canlı izin sözlüğü, başlatma sözlüğü değildir — ve CLI hayır diyebilir (3.93.0)

Canlı seçici uzun süre **başlatıcının** listesini (`PERMISSION_CHOICES`) kullandı. Çalışan bir oturum daha kısa bir sözlük konuşuyor; her satır kurulu CLI'a tek tek soruldu (2.1.226):

| gönderilen | CLI'ın cevabı |
|---|---|
| `bypassPermissions` | `success` — **yalnızca** oturum uygun bayrakla başlatıldıysa |
| `default` · `acceptEdits` · `plan` · `dontAsk` | `success` |
| `auto` | `error: auto mode unavailable for this model` |
| `manual` | `success` ama CLI geri `mode: "default"` diyor |
| `""` (başlatıcının "Default" satırı) | `error: must be one of acceptEdits, auto, bypassPermissions, default, dontAsk, plan` |

Yani yedi satırın **ikisi hiç çalışamazdı, biri sessizce başka bir şey demekti**. Canlı seçicinin artık kendi listesi var (`PERMISSION_MODES_LIVE`): `default · acceptEdits · plan · dontAsk · ⚠ bypassPermissions`. Başlatma seçicisi değişmedi; ret kutusundaki `Let it decide` düğmesi aynı ölçülmüş sebeple kaldırıldı.

**‼️ Ve ret artık sessiz değil.** `set_permission_mode`, ateşle-unut gönderilen tek kontrol isteğiydi: stdin'e yazılıyor, "oldu" deniyor, cevabıyla hiç karşılaştırılmıyordu. Reducer yalnızca *başarıyı* işlediği için bir ret hiçbir şeyi değiştirmiyor, hiçbir şey söylemiyor, seçici bir sonraki çizimde eski hâline dönüyordu — "bypass'a getirdim, sormaya devam etti"nin tamamı budur. Dahası **"grant + retry"** düğmesi, başarılı bir **yazma** üzerine ajana *"Permission granted — please retry"* diyordu; ajan kimsenin vermediği bir izinle tekrar deniyordu. Artık `setModel`/`setEffort` gibi **izlenen** bir istek: ret, CLI'ın kendi cümlesiyle konuşmaya düşen bir satır; kabul, **CLI'ın kabul ettiği** modu gösterir (istenen değil — `manual` geri `default` olarak gelir); tekrar-dene dürtüsü ancak evetten sonra gider. Köprüde `console.permissionMode` isteği **gönderilmiş** olarak raporlar: son sözü CLI söyler ve o söz kablodan gelir.

#### ‼️ Ayar dosyasındaki `bypassPermissions` artık kendiliğinden geçerli değil (S-18, 2026-08-08)

`~/.claude/settings.json` içindeki `permissions.defaultMode: "bypassPermissions"` aylarca her oturumu kapsadı. 2026-08-08'de kurulan CLI yapısı, bir öncekinde **olmayan** bir kapı taşıyor — dizeler ikilinin içinde, ve yalnızca yenisinde:

> `settings defaultMode "bypassPermissions" ignored for a VS Code-owned session without the allow-bypass setting`
> `Permission mode bypassPermissions from settings was ignored — enable the "Claude Code: Allow Dangerously Skip Permissions" setting in VS Code to consent to it`

telemetri anahtarı `tengu_settings_bypass_unconsented_noninteractive_ignored` — `claude.exe`'de **var**, `claude.exe.old`'da **yok**. Barındırılan bir Console oturumu tam olarak budur: VS Code'a ait ve etkileşimsiz. Yanında iki eski kesici duruyor — `bypassPermissions mode is disabled by feature gate` (`tengu_disable_bypass_permissions_mode`) ve `…disabled by settings` — ve bunlar **her çağrıda** değerlendiriliyor, başlangıçta bir kez değil; sormanın oturum sınırında değil **turun ortasında** başlayabilmesinin sebebi budur.

Barındırılan oturumlar bu yüzden `--allow-dangerously-skip-permissions` taşıyor. CLI'ın kendi yardımı: *"Enable bypassing all permission checks as an option, without it being enabled by default."* **Hiçbir şey vermez** — panelin kendi ⚠ kontrolünü mümkün kılar. Bypass'ı gerçekten açan `--dangerously-skip-permissions` komut satırına hiç konmaz.

### Kod değişiklikleri, akışın içinde

Her `Edit`/`Write` satırı dosyasıyla birlikte görünür; yanında **open** ve **vs HEAD** düğmeleri (3.25.0'ın diff yüzeyi, yeniden yazılmadan kullanılıyor).

### ‼️ Bir oturumu iki süreç paylaşamaz (3.29.0)

Claude Code **çalışan bir oturuma katılamaz.** Terminalde açık bir oturumu Console'a "devam ettirmek", aynı transkripte yazan **ikinci bir süreç** başlatır: ikisi de dosyaya yazar, hiçbiri diğerinin turlarını görmez, ve oturum listesi bunları **kimsenin yapmadığı tek bir konuşma** gibi gösterir.

Artık Console devam ettirmeden **önce sahibine bakıyor** (CLI'ın kendi kaydı: aynı sessionId iki pid'de görünüyorsa oturum meşguldür) ve **varsayılan olarak reddediyor** — ne olacağını açıklayıp gerçekten işe yarayan iki seçeneği sunuyor: **o terminale atla** ya da **aynı klasörde yeni oturum aç**. Başka yerde açık olan satırlar devam-ettirme listesinde soluk görünür. Terminale devam ettirmek de (sol paneldeki ⏵ Resume) aynı uyarıyı verir; bilerek isteyenler için "yine de ikinci süreci aç" seçeneği durur.

### ‼️ Console oturumu bir insanın konuşmasıdır (3.31.0)

Panelde yapılan konuşma, CLI'a headless bir koşunun kullandığı aynı akışlı `-p` kanalından ulaşır; bu yüzden kaydına `entrypoint: sdk-cli` yazılır — Agent Farm da kökeni tam olarak o alandan okur. Sonuç: **panelde yapılan her konuşma otomasyon diye dosyalanıyordu** ve varsayılanı **User** kapsamı olan Oturumlar tabloları, panolar, ajan sayfaları ve Turlar sayfası o konuşmanın hiç yaşanmadığını gösteriyordu. Oturum baştan beri indeksliydi ve canlıydı; sadece görünümün dışında kalıyordu.

Agent Farm artık **kendi Console'unun barındırdığı oturum kimliklerini hatırlıyor** (`globalStorage/console-sessions.json` — reload kaybettirmez) ve onları *user* olarak dosyalıyor. 3.31.0'dan **önce** Console'da başlatılmış oturumlar otomasyon sınıfında kalır; herhangi bir oturum tablosundaki 🤖 kapsam çipiyle görülürler.

### Sayfa bir kez kurulur, sonra yamanır (3.31.0)

Akan bir konuşma saniyede birkaç kez yeniden çizilir. Sayfa eskiden bunların her birinde **baştan** kuruluyordu — yazdığın metin kutusu yok edilip yeniden yaratılıyor ve tekrar odaklanıyordu; bir öğeyi odaklamak onu görünüme kaydırdığı için **sen yukarıda bir şey okurken sayfa kendini aşağı çekiyordu** ve yapı imlecin altında kayıyordu. Artık kabuk yalnızca *şekil* değişince kuruluyor (başka bir oturum, biten bir oturum), gerisi adlandırılmış yuvalara ve yalnızca içeriği gerçekten değiştiyse yazılıyor. Somut olarak düzelenler:

- **Yukarı kaydırdıysan yukarıda kalırsın.** Konuşma öğesi hiç değiştirilmediği için tarayıcı konumunu korur; en alta döndüğünde (ya da **↓ N new lines** düğmesine bastığında) akış kendiliğinden devam eder.
- **Filtrelediğin satır kaçırdığın haber değildir.** Sayaç yalnızca **show** filtresinin geçirdiği satırları sayar.
- **Yarım kalan mesajın**, imlecinin yerinde durur; akan satır onu bozmaz.
- **Sayfanın ortasında boşluk yok.** Console artık tam-yükseklik bir uygulama düzeni: tek kaydırılan yer konuşma, altında composer; kısa konuşma araya kocaman boş bir kutu bırakmak yerine composer'ın **üstüne oturur**.
- **"ctx now" güncel kalır.** Yalnızca CLI'ın ara sıra gönderdiği `thinking_tokens` olayından okunduğu için ilk değerde donuyordu; artık her asistan mesajının kendi usage'ından alınıyor — oturum tablolarının yaptığı aynı aritmetik.

> **"Context now" tek kuralla hesaplanır (3.31.1):** `girdi + iki tür cache + çıktı` — ve **sıfır bir ölçüm değildir**. Transkriptte sentetik asistan satırları vardır (kesilen tur, yerel bildirim) ve bunların usage bloğu **tamamen sıfırdır**; "son usage"ı harfi harfine almak, o satırla biten her oturumun rakamını siliyordu. Gerçek bir transkriptte ölçüldü: 67 satırın 2'si sıfır-usage, sonuncusu onlardan biri, ve penceresinde **78.512** token tutan bir oturum sayfasında `—`, tablolarda `0` görünüyordu. Artık son **gerçek** ölçüm geçerlidir. Kural tek yerde (`core/pricing.ts` → `contextAfter`), soran üç yer aynı cevabı alır: oturum tabloları, transkript sayfası, Console.

### Sıra kimde (3.33.0)

Sekiz oturum, sekiz ayrı iş, ve birkaç dakikada bir sorduğun tek soru: **hangisi beni bekliyor?** Sol panel bunu artık uzaktan bakınca cevaplıyor.

- **Her kart fazını aynı anda üç şekilde taşır** — renkli kenar, nokta ve **kelime** — böylece açık temada, renk körü bir okuyucuda ve iki metreden bakışta da çalışır. Durumlar "status" değil, **topu kim tutuyor**: *your turn* (cevapladı ve durdu) · *needs permission* (aynı top, daha ağır: sen karar verene kadar hiçbir şey olmaz) · *working* · *a message is held* · *starting…* · *nothing said yet* · *ended*.
- **Sakin tutan dilbilgisi:** **hareket yalnızca kendi kendine çözülen duruma** — çalışan noktanın nabzı atar (1,8 sn, sadece opaklık; *prefers-reduced-motion* ayarına uyar), çünkü gerçekten bir şey oluyor. **"Sıra sende" asla animasyon almaz**: kalıcı bir durumdur, kalıcı animasyon dırdırdır. Onun yerine **kontrast** alır: dolu yeşil kenar, hafif tint, kalın kelime — panelde doygun tek şey odur, bu yüzden anında bulunur. **Dürtme zamandır, animasyon değil**: *your turn · 41m* kendi kendine büyür. Biten oturumlar %55'e çekilir.
- **Seçim bir halkadır, renk değil.** Seçili kart eskiden link-mavisi bir tint alıyordu ve bu, "çalışıyor" anlamındaki maviyle yarışıyordu — bir kartta iki mavi, bu sistemin ortadan kaldırmak için var olduğu belirsizliğin ta kendisi. **Rengi faz sahiplenir, çerçeveyi seçim.**
- **Liste altında kendini yeniden sıralamaz** — imlecin altında zıplayan kart rahatsızlığın tanımıdır; varsayılan olarak hiçbir şey bir kartı yerinden oynatmaz. Onun yerine kartların üstünde tek satır: **● 3 waiting for you · longest 41m**; tıklayınca en uzun bekleyene gider. Bir kartı neyin hareket ettirebileceği **senin kararın** — bkz. *⇅ Kartları ne hareket ettirir*.
- **Bekleyiş kendi kendine büyür (3.35.1).** Bu paneldeki her rakam bir *veri itmesi* sırasında yazılır ve itme ancak CLI bir şey söyleyince gelir — seni bekleyen bir oturum ise tanımı gereği hiçbir şey söylemez. Bu yüzden `your turn · 0s` ve `longest 0s` tur biter bitmez yazılıp saatlerce öylece kalıyordu; yani var oluş sebebinin tam tersini söylüyordu. Artık **saat de bir yeniden çizme sebebi**: sol panel 10 saniyede bir kendini tazeliyor. Yalnızca sol panel — sayfanın zamana bağlı tek yeri orası — ve metin gerçekten değişmediyse hiçbir şey yazılmıyor.
- **Sekme de sayar:** Console arka plandayken `Console (2)`.

### ⇅ Kartları ne hareket ettirir — senin kararın (3.40.0)

Kural yazılıydı ama uygulanmıyordu: liste, **son etkinliğe göre** geliyordu. İki ajan paralel çalışırken bu bir yarıştır — biri tek satır yazar üste çıkar, öbürü hemen arkasından tek satır yazar o çıkar; 250 piksellik sütun saniyede birkaç kez altında kayar, ve tıkladığın kartın istediğin kart olması şansa kalır.

**＋ New session** düğmesinin sağındaki **⇅** — devam listesindeki **⌕** ile aynı dil, aynı yerde — minyatür bir panel açar. Üç cevap:

- **`cards never move` — VARSAYILAN.** Kartlar geldikleri yerde (en yeni üstte) durur ve orada kalır. Hareketsiz bir listeyi okumak bedavadır; kimin beklediğine zaten üstteki sayaç tek tıkla götürüyor.
- **`waiting for you first`** — üste çıkmayı hak eden tek şey **topun sende** olmasıdır: önce *needs permission*, sonra *your turn*. Bu bir **kaldırmadır, yeni bir ev değil**: cevapladığın anda kart geldiği yere geri iner. Grupların içinde hiçbir şey kımıldamaz, ve bir faz saatte birkaç kez değişir — saniyede on kez değil. Yani hem sakin hem işe yarar: panelin asıl konusu, sıralanmış hâli.
- **`busiest on top` — sönümlenmiş.** Bir kart ancak **`after`** kadar ayrı hayat belirtisi gösterdikten sonra tırmanabilir, ve sıra bir kez değiştiğinde **`hold`** saniye boyunca sabit tutulur. Böylece iki ajanın ping-pongu saniyede birkaç kez değil, hold başına bir kez olur. **`after` 1 · `hold` 0** yazarsan eski anlık davranışın aynısını geri alırsın — bilerek ifade edilebilir bırakıldı.

Ayar hatırlanır; panel kapalıyken sütunda küçük düğmeden başka hiçbir şey görünmez, ve düğme **varsayılan olmayan** bir sıra seçiliyse mavi çerçeveyle bunu söyler: altında kayabilen bir liste, kayabildiğini söylemek zorundadır.

### Tur bitince haber (3.33.0)

Sen başka yerdeyken biten tur **bir kez** haber verir: *"developer is waiting for you (1m · 4.2k tokens · $0.03)"* ve açan bir düğme. Bilerek dar tutuldu, yoksa kapatılan şey olur: **ekranındaki konuşma için asla**, **kestiğin ya da hata veren tur için asla**, tur başına bir kez, working→idle geçişinde. Kapatma: `agentFarm.notifyConsoleTurnEnd`.

**Her tur kendi rakamlarıyla kapanır:** `12.4s · 4.2k tokens · $0.03`. Tur, senin düşündüğün birimdir; "buna değdi mi?" sorusu, rakamlar yalnızca oturum başına varken cevapsızdı. Kimsenin süre tutmadığı bir tur uydurma sıfır yerine hiçbir şey yazmaz.

### "Çalışıyor" demek (3.32.0)

Mesajınla cevabın ilk satırı arasında sayfa **hiçbir şey** göstermiyordu — ölmüş bir oturumun gösterdiği de tam olarak budur. Artık konuşma ile yazma kutusu arasında bir şerit var ve terminalden **daha fazlasını** söylüyor: dönen bir işaret (donmuş bir etiket değil, canlı), **turun kaç saniyedir sürdüğü**, tuttuğu **context**, bekleyen mesaj sayısı — ve *Thinking…* gibi genel bir kelime yerine **şu an ne yaptığı**: en son uzandığı araç (`Read src/core/sessions.ts`, `Bash npm test`). Önceki turun aracı asla "şu an yapılan" diye gösterilmez. **Esc** çalışan turu durdurur (terminaldeki tuşun aynısı); hiçbir şey çalışmıyorken hiçbir şey yapmaz.

### Kaldığın yer (3.32.0)

Barındırılan oturum **penceresiyle birlikte biter** — bu bilerekdir: kimsenin okumadığı bir `claude` süreci 3.29.1'deki sızıntının ta kendisidir. Ama hangi konuşmaların içinde olduğun kaydedilmiyordu, dolayısıyla geri geldiğinde onu bütün transkriptlerin arasında aramak gerekiyordu. Artık Console, sol panelin en üstünde **⟲ Where you left off** ile açılıyor: son pencerenin barındırdığı oturumlar, her biri **tek tıkla** ve **söylenen her şeyle** devam ediyor. Satırlar oturumlar **çalışırken** yazılır (kapanışta değil), yani çökme, öldürülen pencere ve elektrik kesintisi de aynı dosyayla kapsanır. Satır, devam ettirilince ya da ✕ ile atılınca raftan düşer; iki haftadan eskiler kendiliğinden düşer.

> **Ölçüldü:** Console'un kendi taşıma katmanından gerçek CLI ile (haiku, en ucuz ayar) `--resume` **aynı oturum kimliğini** bildiriyor, **aynı transkript dosyasına** yazıyor ve model hatırlamaya devam ediyor — süreç tamamen öldürülüp devam ettirildikten sonra "az önce hangi kelimeyi söyledin?" sorusuna doğru cevap verdi. Yani oturumu pencereyle bitirmenin tek maliyeti "nerede kaldığını bilmek"tir; raf da onu geri veriyor.

### Kart oturumun komutlarını taşır (3.35.0)

Sol paneldeki kart **bir oturumdur**, o hâlde **sağ tıklanır**: Rename · Resume in Terminal · Open transcript · **⎋ Interrupt turn · ⏻ End session · ✕ Remove from list**. Önceden bir oturumu bitirmenin tek yolu onu önce **seçmekti** — yani okuduğun konuşmayı değiştirmek — sonra kutunun altındaki düğmeyi bulmaktı; panelde sekiz oturum varken baktığın oturumu durdurmak üç adım demekti.

**Menü gizlemez, soluklaştırır.** *Remove from list* baştan orada, soluk hâlde: bitirmenin **ardından** gelen adım odur, ve ancak oturum bitince beliren bir madde hem hiçbir şey öğretmez hem de menünün şeklini imlecin altında değiştirir. Böylece sıra, ihtiyaç duymadan önce görünür — oturum bitince *End session* solar, *Interrupt turn* yalnızca bir tur çalışırken yanar. Durumu kartın kendisi taşır (`data-vscode-context` → `package.json`'daki `enablement` ifadeleri); komutlar başka bir yoldan çağrılırsa yine kibarca reddeder, çünkü `enablement` bir **menü maddesini** devre dışı bırakır, komutu değil.

**Menü daha uzağa uzanıyor (3.38.0).** Sağ tık menüsünün bütün amacı başka hiçbir yere gitmek zorunda kalmamaktır; bu yüzden Console kartları ayrıca **📌 Pin · Label… · Copy Session ID · ⌨ Terminal** taşıyor, **Live Timeline kulvar satırı ya da live-sessions kartı** — ki o da bir oturumdur — zaten sahip olduğu menünün üstüne **📌 Pin · Label… · Copy Session ID · Resume in Console** ekliyor. Herhangi birinden pinlemek artık **açık olan her yüzeyi** yeniden çiziyor: eskiden yalnızca ağaçlara haber veriliyordu, dolayısıyla bir sayfada yıldız ancak başka bir şey tesadüfen yeniden çizimi tetiklediğinde beliriyordu — bu da *"bazen çalışıyor"* diye okunur.

### İki rakam satırı: kutunun üstünde tur, altında oturum (3.35.0)

İki şerit de **ctx** yazıyordu — aynı oturum-geneli rakam, üç santim arayla iki kez — çalışan tur hakkında gerçekten sorduğun sorunun ise sayfada hiçbir cevabı yoktu.

- **Kutunun üstünde, çalışan tur:** `⠹ Read src/core/sessions.ts — 41s · ~$0.031 (4.2k tokens) · 6 lines · 2 waiting · opus 5 · xhigh`. CLI bir turun maliyetini yalnızca tur **bitince** bildirir; bu yüzden buradaki para, o ana kadar görülen token'lardan, eklentinin diğer bütün maliyetlerinde kullandığı aynı tarifeyle hesaplanır ve gerçek rakam gelene kadar **`~`** taşır. Turu kapatan satır — iki santim yukarıda, konuşmanın içinde — CLI'ın kendi rakamıdır, aynı biçimde.
- **Kutunun altında, oturumun tamamı:** `session 407c78cb · ~24.1k ctx · $0.12 (48.2k tokens) this session · 3 turns`. Context buraya aittir: pencerenin **şu an tuttuğu** şeydir, bir turun yaptığı değil.
- **Maliyet, onu satın alan token'lar olmadan asla yazılmaz** — sayfanın her yerinde tek sıra: önce para, parantez içinde token. Haiku'nun `$0.03`'ü ile opus'un `$0.03`'ü aynı olay değildir.
- **‼️ …ve şerit, DÜŞÜNMEYİ yapan şeyle kapanıyor (3.45.0).** Şerit sana seçimin bütün *sonuçlarını* veriyordu — saniye, para, satır — seçimin kendisini hiç vermiyordu; yani "bu tur neden yavaş / pahalı?" ("çünkü opus, xhigh eforda") sorusunun cevabı ancak şeritten gözünü ayırıp aşağıdaki seçicilere bakmakla bulunabiliyordu — **oysa onlar bu turu değil, sıradaki turu anlatır.** Satırı kapatan alan artık turun kendi **modeli ve eforu**, ve tam bu yüzden tur-kapsamlı: iki anahtar da konuşmanın ortasında kabul edilir ve ikisi de *sıradaki turdan* itibaren geçerlidir; şerit onları tur başlarken fotoğraflar, bu arada yapılan bir değişiklik izlediğin turu yeniden yazamaz. Tur ortasında bunu düzeltmesine izin verilen tek şey `system:init`'tir — o, yalnızca takma adını bildiğimiz modeli CLI'ın adıyla söylemesidir. Model id'si, diğer bütün yüzeylerin kısalttığı gibi kısaltılır (`claude-opus-5-20260514` → `opus 5`); tanınan bir aileye girmeyen id geldiği gibi yazılır, çünkü tanımadığımız bir ad da cevabın kendisidir. Sessizlik anlamlıdır: model yoksa CLI hangisi olduğunu henüz söylememiştir, efor yoksa oturum hiç efor istememiştir. **Biten tur ikisini de saklar**, böylece şerit onları kesinleştikleri anda kaybetmez.
- **O satırı eskiden kapatan şey — `⎋ Interrupt stops it` — kaldırıldı (3.45.0).** İki santim aşağıda, ekranda duran ve zaten `⎋ Interrupt` yazan bir düğme hakkında kalıcı bir talimattı; yani şeridin en değerli sütununu kompozitörü tekrar etmeye harcıyordu. Öğrettiği Esc tuşu artık o düğmenin ipucunda — bir tuş ipucunun ait olduğu yerde.

### ‼️ Devam ettirilen oturum ne harcadığını hatırlıyor (3.38.0)

Barındırılan süreç oturumun kendisi değildir — **bu pencerenin o oturumdaki sırasıdır**. Sıfırdan başlayınca, devam ettirme, kutunun altındaki satırı konuşmanın değil sürecin anlatıcısı yapıyordu: iki yüz tur geçmişi olan bir konuşma için `$0.0000 · 0 tokens · 0 turns this session`. Ve dönüşteki ilk turda çalışan turun token'ını **iki kez** yazıyordu — kutunun üstünde TUR, altında OTURUM olarak — üç santim arayla büyüyen aynı rakam.

Toplamlar artık transkriptle birlikte geri geliyor: maliyet, token, tur ve context, devam listesinin zaten okuduğu aynı index satırından, devam ettirmenin **her kapısında** (Console'un kendi listesi, *Resume in Console*, bir ajanın `console.start`'ı). Tur yine eskiden olduğu gibi bir **fark**. Kutunun üstündeki şerit de hangisi olduğunu artık açıkça söylüyor: altta `$0.12 (48.2k tokens) **this session**` varken üstte `~$0.031 (4.2k tokens) **this turn**`.

### ‼️ Kutunun altındaki rakam, harcarken hareket eder (3.40.0)

`s.cost` yalnızca **CLI'ın bildirdiği** paradır, CLI de bir turun maliyetini **tur bitince** bildirir. Yani tur boyunca kutunun altındaki tek satır solda tırmanıyor (token'lar her asistan mesajından sayılıyor), sağda ise kımıldamıyordu — ve henüz bir turu bitirmemiş oturumda düpedüz **`$0.0000`** yazıyordu. Tek bir rakamın iki yarısının birbiriyle çelişmesi, tutulacak bir söz gibi değil, bozuk bir rakam gibi okunur.

Çalışan turun tahmini zaten hesaplanıyor — kutunun üstündeki şeridin gösterdiği şey o. Oturum satırı artık onu ekliyor ve bütün rakamı **`~`** ile işaretliyor: `~$5.75 (480.0k tokens) this session`. Çifte sayım imkânsız — tur kapandığında tahmin, CLI'ın kendi rakamının `s.cost`'a eklendiği **aynı adımda** siliniyor. Taban da bu pencerenin değil **oturumun**: devam ettirilen konuşma harcadığını yanında getirdiği için (bkz. *Devam ettirilen oturum ne harcadığını hatırlıyor*) `~` eski turların **üstünde** büyür, baştan saymaz.

### ‼️ Turun rakamları turdan uzun yaşıyor (3.41.0)

Kutunun üstündeki şerit, tur çalışırken *"bu tur bana ne kadara geliyor?"* sorusunu cevaplıyordu — ve cevap **kesinleştiği anda boşalıyordu**; yani okunmaya değdiği tek anda. Turun kendi rakamları konuşmaya bir kapanış satırı olarak düşüyor, sonra da onunla birlikte yukarı kayıp gidiyordu. Böylece sıra sana geçtiğinde asıl sorduğun soru — *biten tur ne kadara geldi, ne kadar sürdü?* — sayfanın hiçbir yerinde cevapsız kalıyordu.

Biten tur artık **sen yeni bir prompt gönderip yeni bir tur başlatana kadar aynı yerde duruyor**:

`✓ last turn — 41s · $0.031 (4.2k tokens) · 8 lines · your turn now`

- Rakamlar **CLI'ın kendi rakamlarıdır** (`result.total_cost_usd`), bu yüzden `~` yok: bu satır varken tahmin işi bitmiştir.
- Canlı şeritle karıştırılamaz — hareket yok, oturmuş bir glif ve açıkça **"last turn"** yazıyor. Kötü biten tur hangisi olduğunu söyler: **⎋ last turn interrupted** · **⚠ last turn failed**.
- Değişmez kural tek cümle: `lastTurn` tam olarak **sıra sendeyken ve bir tur çalışmışken** vardır. Sonraki prompt'un onu siler (`acceptUserText`); çalışan bir turun *içine* yönlendirdiğin mesaj silmez — o bir tura katıldı, tur başlatmadı.
- Köprüde: `console.sessions` artık `lastTurn` döndürüyor (`ms` · `tokens` · `cost` · `outcome`), tur çalışırken `null`.

### Model konuşmanın ortasında değişir (3.38.0)

Terminalde `/model` oturumun ortasında modeli değiştirir ve bir sonraki tur yenisiyle cevap verir. Panel ise çalışan bir oturumun modeli için "başlarken karar verildi" diyordu — bu hiçbir zaman yapısal bir sınır değildi, sadece kimsenin bakmadığı bir şeydi. **`set_model`, CLI'ın gerçekten işlediği bir kontrol isteğidir** (kurulu ikili üzerinde doğrulandı: CLI'ın kendi işlenen alt-tür kümesinde var, `model`'in string olduğunu doğruluyor ve success/error cevabı veriyor).

Bu yüzden kompozitör onu izin kipinin yanında sunuyor, `console.setModel` de ajanlar için köprüye koyuyor. Oturum, context'i ve transkripti el değmeden kalır; değişiklik **bir sonraki turdan itibaren** geçerlidir ve **CLI kabul edene kadar beklemededir** — `set_model`'in success cevabı boş gelir, yani istenen modele geri götüren tek bağ istek kimliğidir; cevap gelmeden yeni adı göstermek panelin tutamayacağı bir söz olurdu. Reddedilirse hata olarak söylenir ve model olduğu gibi kalır.

Ajan (yani klasörü) ve efor süreç ayağa kalktıktan sonra gerçekten sabittir; onlar da hep oldukları düz durum satırı olarak duruyor.

### 🔒 "Kaç tane gösterileceği" bir filtre değildir (3.38.0)

Satır sayısı HANGİ oturumların görüneceğini seçmez, sadece kaçını görebileceğini — bu yüzden **clear filter**'ın onu sıfırlaması için hiçbir sebep yoktu. Kutunun yanındaki kilit onu sabitler: **varsayılan olarak açık**, ayarladığın sayı filtre olsa da olmasa da listenin uzunluğudur ve unutulmaz. Söndürdüğünde tekrar sorunun bir parçası olur ve gerisiyle birlikte temizlenir.

**Ve hangi hâlde olduğunu tooltip'siz söylüyor (3.39.0).** 🔒 ile 🔓 10 pikselde birkaç piksel kilit dilinden ibaret; durum ancak üstüne gelince okunuyordu. Durumu artık **renk** taşıyor, hepsi tek tarafta: kilitliyken vurgu rengi, tam doygunlukta; açıkken hiç renk yok (gri tonlama + solgun) — bunu hiçbir tema tekrar sinyale çeviremez. Arama kutusunun da artık **kendi ⨯'i** var: başlıktaki ⌦ bütün soruyu temizler, ⨯ ise yalnızca yeniden yazdığın kelimeleri, ve yalnızca temizlenecek bir şey varken görünür.

### Bir oturum kimliğiyle bulunur (3.38.0)

`#407c78cb`, diğer bütün yüzeylerin gösterdiği tutamaktır — bir kart, bir menü, bir log satırı — ve devam filtresinin aramadığı tek şeydi. Metin kutusuna herhangi bir parçasını yapıştır, o oturuma in. **Copy Session ID** her kartın sağ tık menüsünde; zaten onu oradan alıyorsun.

### ‼️ Kendisini okuyan pencereden uzun yaşayan oturum (3.37.0)

Console oturumu, eklenti sürecinin (extension host) başlattığı ve bir boru üzerinden okuduğu bir `claude`'dur. VS Code kapanınca biter — ama **eklentiyi yeniden yüklemek ya da güncellemek o temiz kapanış değildir**: yeni eklenti süreci boş bir oturum haritasıyla başlar, eski süreç ise hâlâ canlıdır ve CLI'ın oturum kaydındaki girdisini hâlâ tutuyordur.

Bundan sonrası tek tek doğru davranır ve bütün bir tuzağa dönüşür. Live Timeline oturumu çalışıyor diye çizer (gerçekten çalışıyordur). Panel devam ettirmeyi reddeder (etmek zorundadır — Claude Code başka bir sürecin tuttuğu oturuma katılamaz). Ve raf, asla devam ettirilemeyecek bir konuşma için *click to continue* demeye devam eder.

- **Çıkış yolu, duvara tosladığın yerde sunuluyor:** böyle bir oturumu devam ettirmeye kalktığında panel ne olduğunu söylüyor — *"Agent Farm'ın önceki bir penceresinden hâlâ çalışıyor (pid N) — kimse okumuyor"* — ve **End it and continue here** diyor. Transkript diskte kalır, `--resume` söylenen her şeyi geri getirir; devam ettirme, ölmekte olan süreçle yarışmak yerine kaydın oturumu gerçekten bıraktığını bekler. Gerçek bir süreci durdurduğu için her seferinde sorulur.
- **Asla başkasının içinde olduğu bir konuşma değil.** Her pencere, okuduğu oturumları kendi eklenti-süreci pid'i altına yazıyor (`console-hosting.json`); iddia, onu ortaya atan pencereyle birlikte ölür — böylece "öteki pencere orada konuşuyor" ile "artık" asla karışmaz.
- **End session artık CLI'ın kaydettiği süreci bitiriyor**, yalnızca Agent Farm'ın başlattığı kabuğu değil — yeni artıkların oluşmasını engelleyen şey budur.

### Devam listesine soru sorulabiliyor (3.36.0)

**Resume an existing session** altındaki liste sabit bir cümleydi: rafın, artı en yeni on beş transkript. Bu yalnızca *"az önce yaptığım işe devam et"*i cevaplar — geçen salı günkü oturum indekslenmişti, diskte duruyordu, ama ondan daha yeni on dört oturum olmadıkça panelden **ulaşılamazdı**.

O satırın yanındaki küçük düğme, **kolonun içinde minyatür bir filtre** açıyor: metin (ad · ajan · etiket) · tek ajan · zaman (24s / 7 / 30 / 90 gün / *between…* iki tarih) · **📌 shelf** · **🧑 mine** (zamanlama / tetikleyici / görev koşularını gizler) · ve **show N**, kaç satır istediğin. Oturum tablolarındaki sözlüğün aynısı; bilerek ikinci bir filtre dili değil.

- **Liste, bütünün ne kadarı olduğunu söyler** — `20 of 1240` — yanında **clear filter** bağlantısıyla; ve bir şey ayarlıysa filtre düğmesi **yanık kalır**, panel kapalıyken bile: sessizce bir şeyleri gizleyen liste bunu söylemek zorundadır.
- **Filtre kullanılmazsa hiçbir şey değişmez.** Varsayılan tam olarak eski liste, ve **rafın satır sayısıyla asla kesilmez**.
- **Cevabı sayfa değil host verir.** Sayfa yalnızca kendisine gönderileni süzebilir; oysa mesele en yeni on beşte **olmayan** bir oturuma ulaşmak. Kapalı liste hiçbir şeye mal olmaz — bu anlık görüntü her oturumun her olayında yeniden kuruluyor — ve soru ne kadar geniş olursa olsun cevap 200 satırla sınırlı.
- **Kart artık token ile başlıyor** (`482.0k tok`), para ipucunda: 250px'lik bir satırda tek bir rakama yer var, gerisini adın kendisi istiyor, ve `$0.03` bunun kısa düşünen bir haiku mu yoksa daha yeni başlayan bir opus mu olduğunu söylemiyor. Konuşmanın altındaki iki şerit maliyeti tam olarak taşımaya devam ediyor.

### ‼️ …ve bu liste her motorun listesi, yalnız Claude'un değil (3.113.0)

Dış motor oturumları, Claude'un kendi analizleri onları asla ortalamaya katmasın diye oturum dizininin Claude'a ayrılmış yarısının **dışında** tutuluyor. Resume listesi işte o yarıyı okuyordu — bu onu süzülmüş bir liste değil, **kendi konusunu gizleyen** bir liste yapıyordu: Codex, Gemini ya da Antigravity ile yaptığınız her konuşma, işi konuşmayı sürdürmek olan tek panelden ulaşılamaz haldeydi ve panelde bunu söyleyen hiçbir şey yoktu.

- **Artık iki yarı birden.** Bir satırın listeye girmesi için hâlâ bir klasörü olması gerekiyor (`cwd`'si hiç öğrenilmemiş bir oturum hiçbir yerde başlatılamaz); listeden düşen tek şey bu.
- **Her satır kendi motor rozetini taşıyor, Claude dahil.** Rozetsiz bir satır ya "Claude" demektir ya da "bu liste motorları hiç öğrenmedi" — ve ikisini ayırt edecek hiçbir şey yoktur.
- **Arama kutusu da motora göre süzüyor** — `codex` yazın, yalnız onlar kalsın; motoru kayıtlı olmayan satır `claude`'a cevap verir, çünkü o odur.
- **Resume, konuşmanın YAPILDIĞI motorla başlıyor** ve composer'daki model/efor bayrağa dönüşmeden önce o motorun gerçekten sunduklarına daraltılıyor — böylece bir Codex thread'i `claude --resume`'a verilmiyor, bir Claude takma adı da onu ancak reddedebilecek bir CLI'ya gönderilmiyor.

### Oturumlar sekmeden uzun yaşar

Console sekmesini kapatmak konuşmayı **öldürmez**; oturumlar sen bitirince ya da pencere kapanınca biter.

### Nereden açılır

**Konusu olan iki sayfada Console düğmesi o konuyu kasteder (3.30.1; 3.30.2'de tek düğme):** ajan ve oturum sayfalarında nav'daki **💬 Console ▾** *tek* düğmedir ve iki maddelik bir menü açar — **Talk to Agent** / **Resume Session**, altında **Open Console**. Eskiden yan yana iki düğmeydi; aynı yere giden iki düğme araç çubuğunun dörtte birini yiyordu. Menü maddeleri iki-üç kelimedir: **menü seçenek listesidir, açıklama yeri değildir** — açıklama bu kılavuzun işi.

> **Başlık satırının yoğunluğu (3.30.4):** Refresh · ? Guide ile biten o satır taşıp ikinci satıra sarkıyordu. Yalnızca **o satırın** düğmeleri bir boy küçüldü ve araları daraldı (~%30 dar). **Hiçbir şey yeniden adlandırılmadı, gizlenmedi, sırası değişmedi, ikona çevrilmedi**; sayfaların gövdesindeki düğmeler normal boyunda kaldı.

- Global nav'daki **💬 Console** (her sayfada) · **`Ctrl+Alt+C`**
- Sol paneldeki **Agents** başlığındaki **💬** düğmesi
- Bir ajana **sağ tık → Talk in Console…**
- Ajan sayfasının üstündeki **💬 Console** düğmesi

Bunların hepsi Console'u o ajan **kompozitörde seçili** olarak açar; **sen bir şey söyleyene kadar hiçbir süreç başlatılmaz.**

### Kompozitör iki moddur

- **Yeni oturum:** ajan · model · efor · izin modu seçicileri + metin → **Start session**. Kompozitör altındaki **`⑂ Relay`** anahtarı açılarak oturum doğrudan bir baton zinciri olarak başlatılabilir.
- **Çalışan oturum:** ajan/model/efor artık **gösterilmez** (süreç başlarken kararlaştırıldılar, değiştirilemezler; ölü kutu koymanın anlamı yok). Yerlerinde düz bir durum satırı (`dev · haiku`), canlı izin modu seçicisi ve alt durum şeridinde röle kontrolleri yer alır: **`⑂→`** (*Pass now* — beklemeden devret), **`✕⑂`** (*Stop chain* — zinciri durdur), **`⑂+`** (*Attach relay* — çalışan oturumu 1. ayak olarak röleye bağla), **`↪`** (*Continue from handover* — devir notundan taze kompozitör aç) ve mavi **`⑂ n`** rozeti ([ayrıntılı mimari](#baton-relay)).

**Köprü:** `console.start` · `console.send` (tur çalışıyorsa **turun içine** gider; `hold:true` bekletir) · `console.queue` (bekletilenleri oku · `edit` · `drop` · `send` · `clear`) · `console.sessions` (tur bir soruda bekliyorsa `asking` döner) · `console.interrupt` · `console.setModel` · `console.setEffort` · `console.answer` (bekleyen bir *soruyu* çözer — bir araç iznini asla; o kullanıcının kararı olarak kalır) · `console.permissionMode` (`retry` ile) · `console.close` · `baton.status` · `baton.pass` · `baton.stop` · `baton.now` · `baton.attach`.

> **Doğrulama:** `test/smoke_console_live.js` **gerçek** claude süreçleriyle uçtan uca koşar (cevap · tur içine yönlendirme · bekletme + düzenleme + teslim · uçuşta kesme · reddedilen yazma · canlı izin verme · tekrar deneyip dosyayı gerçekten yazma · temiz kapanış): **27/27, $0,112**. Para harcadığı için `npm test`'in dışında tutulur. Ölçüm bir tasarım hatasını da yakaladı: **CLI ilk stdin satırını alana kadar hiçbir şey yayınlamıyor**, dolayısıyla ilk mesajı "oturum hazır görünene kadar" kuyrukta tutmak sonsuza kadar kilitleniyordu — ilk mesaj artık daima gönderilir.

### Otomatik Soru Çözümleyici (Auto-Timer Resolution)

Konsol oturumlarında `AskUserQuestion` ile kullanıcıya soru sorulduğunda, kullanıcı bilgisayar başında değilse oturumun sonsuza kadar askıda kalmasını ve nöbet turlarının kilitlenmesini önleyen otonom zamanlayıcı mekanizmasıdır (`src/core/autoAnswerTimers.ts`).

- **Süre Sınırı ve Ayarlar:** `agentFarm.console.autoAnswer.timeoutSeconds` (varsayılan 300 saniye, 5 ile 7200 sn arası kelepçeli; `agentFarm.console.autoAnswer.enabled` ile açılıp kapatılır).
- **Akıllı Tercih Matrisi (`src/core/autoAnswer.ts`):** Süre dolduğunda ajanın kendisinin `(Recommended)` veya `(Önerilen)` olarak işaretlediği seçenek, bu etiket yoksa ilk seçenek otomatik olarak seçilir.
- **Yıkıcı Eylem Koruması (`destructive` Engeli):** Soru başlığında, metninde veya seçeneklerinde silme/yıkma (`delete`, `drop`, `purge`, `remove`, `destroy` vb.) ifadeleri geçen sorularda zamanlayıcı devreye girmez; işlem güvenlik gerekçesiyle durdurulur (`refused: destructive`). Ayrıca araç izinlerinde (`PreToolUse`) zamanlayıcı asla çalıştırılmaz, daima insanın açık onayı beklenir.
- **Host Sürecinde Çalışan Saat:** Sayacın yaşam alanı webview değil, Extension Host sürecidir. Kullanıcı Console sekmesini kapatmış veya başka sayfaya geçmiş olsa dahi zamanlayıcı arka planda işlemeye devam eder.
- **Ajan ve Kayıt Şeffaflığı:** Cevap doğrudan `ConsoleHost.answer()` üzerinden iletilir; yanıtta ajana seçimin insan tarafından değil otomatik zaman aşımı mekanizmasıyla yapıldığı bildirilir. Transkript satırına `⏱️ Zaman aşımı: önerilen seçenekler seçildi — <soru> → <seçenek>` damgalanır. Kart üzerinde `⏳ 4:31 kaldı — sonra "..." seçilecek [Zamanlayıcıyı durdur]` geri sayımı çizilir; klavyeye basıldığında veya elle seçim yapıldığında zamanlayıcı anında iptal olur.

### Arka Plan Komutunda Bekleme ve Yönlendirme (waiting-task & Steer)

Ajan bir turu tamamlayıp arka planda uzun süren bir kabuk komutu (test paketi, build, migrasyon vb.) bıraktığında devreye giren özel arayüz durumudur (`src/core/liveMonitor.ts`).

- **`waiting-task` Durumu ve Mor Kart:** Ajan arkasında çalışan bir komut bırakıp beklemeye geçtiğinde oturum durumu sarı "Sıra Sizde" yerine mor renkli `waiting-task` durumuna geçer. Kartın sol şeridi mor renge bürünür (`var(--vscode-charts-purple)`), rozetinde `BACKGROUND` yazar ve 4.2 saniyelik yavaş bir nefes alma animasyonu (`animation: afdeep 4.2s`, `prefers-reduced-motion` destekli) çalışır.
- **Yanıltıcı Bildirimlerin Önlenmesi:** Bu durumda "sıra sizde" zili (`turn-ready`) asla çalmaz; oturum arka plandaki komutun sonucunu bekler. Yalnızca komut bittiğinde ya da gerçek bir soru/izin gerektiğinde sesli uyarı verilir.
- **Send Yerine `Steer` (Yönlendirme):** Kompozitör bu sırada normal mesaj göndermek yerine `Steer` (Yönlendir) modunda çalışır; kullanıcı isterse komut koşarken ajana yönlendirici müdahalede bulunabilir veya komut bittiğinde işlenmek üzere mesajı kuyruğa alabilir.

## İş Ne Kadar Tutuyor — iki rakam ve dokuz adım türü {#ne-kadar-tutuyor}

*(3.61.0 – 3.63.0)* Beş soruşturma bir token sayma hatası aradı, çünkü iki paket aynı iş için farklı toplam veriyor gibiydi. Sayma hatası yok — ve bunu kanıtlamak, kimsenin yapmadığı bir deney gerektirdi.

### Deney: veriyi dondur, sadece kodu değiştir

Önceki denetimlerin hepsi ya iki paketin **kaynağını okuyup** "aynı" dedi, ya da **iki canlı oturumu** karşılaştırdı — ki bu kodu *ve* veriyi aynı anda değiştirir, dolayısıyla hiçbir şeye karar veremez. Bunun yerine 3.56.0 ve 3.60.1 ayrı worktree'lerde derlendi ve kendi `parseSessionFile` + `PricingEngine`'leri **aynı 355 transcript** üzerinde koşturuldu: **iki tarafta da 4.329.012.662 token ve 8975,1433 USD**, farklı çıkan oturum 0, tur dizileri birebir. Rakamlar mutlak olarak da doğru — eklentiyle hiç kod paylaşmayan bağımsız bir parser, tartışmalı üç tur için 6,866M / 6,856M / 10,759M verdi; sayfadakiyle aynı.

### ‼️ Hata BİRİMDEYDİ

Ham token toplamının **%94–99'u cache-read**'dir ve planın döner limiti bir cache-read'i taze girdi token'ının onda biri sayar (çıktıyı beş katı, 1 saatlik cache yazımını iki katı, Opus'u beş Sonnet). Yani ham rakama içindeki en ucuz kalem hâkimdir ve **tarif ettiği duvarla orantılı değildir**. 32 günlük gerçek transcript üzerinde ölçüldü: tepe 5 saatlik pencerede ham ÷ ağırlıklı oranı **0,80× ile 3,86×** arasında geziyor.

**Bu yüzden artık her token rakamı ikisini birden taşıyor.** Önce ham, sonra `⚖` ve ağırlıklı ikizi — Console kartları, canlı tur şeridi, biten tur satırı, kompozitörün altındaki oturum satırı, devam ettirme listesi, Sessions tabloları ve tur açılımları, Turns sayfası, viewer'ın Tokens kartı / tur bandı / tur tablosu / Markdown dışa aktarımı, Dashboard'un ajan tabloları, aralık kartı ve 5 saat kartı, Portfolio'nun 30 günlük sütunları ve filo satırı, Live Timeline kartları, kenar çubuğu ipuçları, durum çubuğu lap çipi ve ipucu, filo raporu. Tek tanım (`pricing.ts` içindeki `QUOTA_WEIGHTS`), **aynı satırdan, aynı dedup muhafızının içinde, o satırı işleyen modelden** toplanıyor — ikisi asla farklı hikâye anlatamaz. Haiku'da koşan bir alt-ajan haiku olarak tartılır.

### ‼️ Cache yazımları TTL'e göre fiyatlanır ve geçerli olan 1 saatlik oran

3.61.0 cache-write ağırlığını yayınlanmış **5 dakikalık** orandan (1,25×) aldı — *transcript'te ne yazdığına bakmadan*. Oysa cevap orada, kimsenin okumadığı bir alanda: `usage.cache_creation` yazımı TTL'e göre bölüyor ve 40 en yeni transcript'teki 3.813 asistan satırında **17.923.938 cache-creation token'ının 17.923.938'i `ephemeral_1h`, 5 dakikalık sıfır**. 1 saatlik yazım girdinin **2 katı**, yani her ⚖ rakamı turun en pahalı kaleminde 1,6 kat eksikti. `toUsage()` artık bölümü okuyup her yarısını kendi oranından fiyatlıyor; bölüm bildirmeyen bir blok **1 saatlik** orandan ücretlendiriliyor, çünkü eksik saymak bu işin baştaki hatasıydı.

### Limit, gerçek uçtan ölçüldü

Planın kendi ucundan aynı pencere içinde iki kez örnek alındı (iki okumada da aynı sıfırlanma zamanı, yani aynı pencere): **%29 → %82, 28,1 dakika, 96 API çağrısı, 38,13M ham** — puan başına 0,72M ham, yani **tam 5 saatlik limit ~72M ham**; bu da bu işi başlatan "eskiden 75M'de doluyordu" ifadesinin neredeyse tam karşılığı. Sonra hesap değişti ve taze bir pencere **3,15M ham ile %42'ye** ulaştı — ima edilen limit **7,5M ham**, on kat küçük. *Ağırlıklı* ölçekte aynı iki pencere 46,9M ve 23,8M ima ediyor: fark **9,6×'ten 2,0×'e** iniyor. Birim işin çoğunu yapıyor — ilk pencere %98,7 cache-read, ikincisi %27,6 cache-**write** — ama 2 katlık bir artık kalıyor ve iki farklı hesapla bunun ağırlıktan mı yoksa iki farklı kotadan mı geldiği ayırt edilemez. Kesin ayrım için **tek bir hesap** içinde farklı şekilli iki örnek gerekir.

### Dokuz adım türü

Bir tur, birbirine benzeyen şeylerin listesiydi: `Read D:/x.ts` ile modelin dokuz saniye düşünmesi aynı satırı çiziyordu — oysa biri burada bedava çalışır, diğeri çıktı oranından faturalanır. Dolayısıyla *"limitim nereye gitti?"* sorusunun hiçbir sayfada karşılığı yoktu. Kategoriler **yazılmadan önce sayıldı** (60 transcript, 21.705 satır): Bash 1349 · Edit 1086 · Read 636 · PowerShell 425 · Grep 230 · Write 168 · `mcp__obsidian__*` 45 · `mcp__playwright__*` 13 · WebFetch 5 · WebSearch 5, artı harness araçları.

| | tür | neye mal olur |
|---|---|---|
| **◈** | thinking | model düşünüyor — **output** olarak faturalanır, en pahalı token |
| **▸** | reply | model yazıyor — output |
| **⌘** | local tool | bu makinede çalışır — **çalışması bedava**; sonucu *sonraki* çağrıda ödenir |
| **⇄** | MCP tool | MCP sunucusuna istek — model token'ı yok |
| **⌗** | web | internete çıkış — model token'ı yok; sayfa context'e girer |
| **⑂** | sub-agent | kendi context'i olan ayrı konuşma, bu oturumun bütçesinden |
| **⚙** | harness | CLI'ın içinde — ne model ne ağ |
| **↩** | tool result | üretimi bedava; **sonraki çağrıyı büyüten şey budur** |
| **·** | local only | modele hiç gitmedi |

**‼️ Görünmez olan thinking'di.** 878 text bloğuna karşı 1.737 thinking bloğu — model konuştuğundan yaklaşık iki kat fazla düşünüyor, bu token'ların hepsi çıktı oranından faturalanıyor ve hiçbir yerde sayılmıyordu. Satırlar hâlâ çizilmiyor (modelin özel çalışması) ama tur kaç tane olduğunu söylüyor.

### `26api·99steps` — çift rakam, ve her birinin kapsamı

Bir turun büyüklüğünü yazan her yüzey aynı dizeyi yazar: **önce gidiş-dönüşler, sonra onların taşıdığı bütün adımlar**. Bunlar *aynı* turun iki farklı ölçeğe göre iki ölçümüdür, bir toplamın iki parçası değil — 99 adım, 26 çağrının **içinde** geldi; bu yüzden toplanmazlar ve ayraç tam da bunun için nokta (`14api/26` "26'nın 14'ü" diye okunuyordu). Token'lar **çağrıları** izler.

**Ve ikinci rakam artık gerçekten toplam.** Adımın tanımı *"bir cevap parçası veya bir araç çağrısı"* idi — yani yukarıdaki tablonun en pahalı diye fiyatladığı şey, modelin kendi düşünmesi, kendine "toplam" diyen rakamın dışında kalıyordu. Bu makinenin en büyük altı güncel transkripti üzerinde ölçüldü (2026-08-07): **149 cevap + 1.583 araç çağrısı sayılıyor, 490 thinking bloğu sayılmıyordu** — gerçek 2.222'ye karşı 1.732, yani **%22 eksik**, ve eksik olan beşte bir tam da pahalı olan kısımdı. Adım artık bir ajanın yaptığı üç şeyden herhangi biri: **düşündü, yazdı, ya da bir araç çağırdı.** Araç *sonucu* hâlâ adım değil — o, geri gelen cevaptır ve sonuçlar çağrılarla 1:1 gider (aynı ölçümde 1.583'e karşı 1.582), dolayısıyla onları saymak rakamı ikiye katlar.

**Tek sayaç, üç yer, kayma yok.** Transkript ayrıştırıcısı (`core/sessions.ts`), oturum görüntüleyicinin kendi geçişi ve Console indirgeyicisi (`core/consoleproto.ts`) aynı üç blok türünü sayar. Özellikle Console'un canlı şeridi artık rakamı ekrandaki satırlardan çıkarmıyor: o yol her araç sonucunu ve panelin kendi yazdığı her sistem satırını içine alıyordu, thinking bloğunu ise hiç göremiyordu — aynı anda hem fazla büyük hem de en pahalı adımdan yoksun. Her tur ayrıca `thinking` taşıyor; böylece ipuçları toplamı **düşünme / araç çağrısı / cevap** diye, her birinin payıyla birlikte bölebiliyor.

**Her adım kendi API çağrısının harcamasını da taşıyor**, ham ve ⚖, **çağrı başına bir kez, ilk blokta**. Rakamı olmayan satır bedava değildir — üstündeki çağrıya binmiştir, ipucu bunu söyler. Console konuşmasında, çalışma şeridinde (spinner artık ne yapıldığının *kategorisiyle* başlar), transkript sayfasının meta satırında ve Markdown dışa aktarımda canlı.

**Anahtar nerede duruyor:** çipler tek glif ve şeritte legend bloğuna yer yok, bu yüzden **kompozitörün altındaki satırın en solundaki oturum kimliğinde** duruyor — her zaman ekranda olan ve hiç kımıldamayan tek etiket. `session cb489864` üzerine gel, şema orada: her glif ve neye mal olduğu. Transkript sayfası aynı legend'i konuşmanın üstünde görünür bir şerit olarak taşır. MCP üzerinden sürülen tarayıcı (`mcp__playwright__*`, `mcp__chrome-devtools__*`) MCP değil **web** sayılır; listelenmemiş bir araç **local** sayılır — yanılırsa bedeli olmayan varsayım. Webview'daki tablo kopyası `test_step_kinds.js` ile `src/core/stepkind.ts`'e birebir bağlıdır.

### Hepsi bir ayar

Bu sayılar sağlayıcının fiyat kartı, bizim değil; birinin değişmesi asla yeni sürüm gerektirmemeli. **Settings → Cost & budgets** altında:

- **`agentFarm.quotaWeightMode`** — `model-aware` (varsayılan: Opus 5, Sonnet 1, Haiku ⅓) · `model-flat` (token *türlerini* tart, hangi model koştuğunu yok say) · `raw` (⚖ ham toplam olur — sökmeden kapatmak).
- **`agentFarm.quotaWeights`** — tablonun kendisi. Model regex'i başına: `input`, `output`, `cacheWrite` (5 dakika), `cacheWrite1h` (1 saat), `cacheRead`; hepsi **bir Sonnet girdi token'ı = 1**'e göre. `agentFarm.pricing`'den bilerek ayrı: faturayı düzeltmek limit göstergesini sessizce kaydırmamalı.
- **`agentFarm.quotaBrakeBasis`** — kota freni ve model düşürme kuralı hangi rakamı okusun: `whichever` hangisi ilerideyse (varsayılan) · `weighted` · `raw`.
- **`agentFarm.windowWeightedTokenLimit`** — 5 saatlik tavan, ağırlıklı token cinsinden. Varsayılanı 0 ve **ayarlanana kadar hiçbir şeyi değiştirmez**; `windowTokenLimit` aynen çalışmaya devam eder.

Tablo değiştiği an bütün transcript'ler yerinde yeniden okunur — ⚖ toplamı parse *sırasında* toplanır, yeni oranın arkasında eski aritmetiğin durması hiç yoktan kötü olurdu. Kullanılamaz bir tablo (boş dizi, bozuk regex) izlenen göstergeyi sessizce sıfırlamak yerine paketle gelen tabloya düşer.

**Köprü:** `usage.window` döner 5 saatlik pencereyi **iki birimde**, aralarındaki oranla ve yapılandırılmış tavanlara göre yüzdeyle verir. Anthropic'in gerçek abonelik rakamı için `usage.plan`.

## Oturum Başlatma ve Denetim {#oturum-denetim}


### Aktif Süre vs. Boşluk Hassasiyeti (S-52 — `src/core/sessionSpan.ts`)

Oturum tablosunda eskiden `Duration` sütunu ilk mesaj ile son mesaj arasındaki çıplak farkı (`lastTs - firstTs`) gösteriyordu. Bu durum, akşam başlatılıp ertesi sabah devam ettirilen bir konuşmanın 36 saat boyunca aralıksız çalışmış gibi görünmesine yol açıyordu.

- **`sessionSpan` Modülü:** Duvar saatini **aktif çalışma süresi** ile **turlar arasındaki uyku/bekleme süresi** olarak ikiye ayırır (`50m ⋯25.8 h`).
- **`agentFarm.sessionBreakMin` Ayarı:** Varsayılan 30 dakikadır (0 = devre dışı). İki tur arasındaki boşluk 30 dakikayı aştığında aradaki süre çalışma süresinden düşülür ve hücrede dinlenme sembolüyle gösterilir.
- **Doğruluk:** Saatlik maliyet, tur başına süre ve çağrı başına harcama artık uyku süresine değil, fiili çalışma süresine bölünerek hesaplanır.


*(3.24.0)* Agent Farm oturumları **görüyordu**; artık onlara **dokunuyor**. Dört parça: bir oturum neyle başlar, hangi oturumlar elinin altında durur, çalışan bir oturum nasıl durdurulur, ve tüm bunlara klavyeden nasıl ulaşılır.

### Start Session… — bir oturum neyle başlar (A1)

Eskiden her oturum çıplak `claude` ile açılıyordu; model, efor, izin modu ve ilk cümle terminale elle yazılıyordu. Artık iki katman var:

- **Her oturuma uygulanan varsayılanlar — `agentFarm.launchDefaults`.** `model` · `effort` · `permissionMode`. Bir kere ayarla; **Start Session, Continue Latest ve Resume** dahil her başlatma bunları taşır. Her alan isteğe bağlıdır ve **boş alan hiç bayrak üretmez** — varsayılan `{}` ile başlatma, her zamanki çıplak `claude`'un aynısıdır.
- **Start Session… launcher'ı** (`Ctrl+Alt+S`, Agents panelinin başlığındaki 🚀, ajan sağ tık menüsü, Ajan Detay sayfasındaki **Start session…** düğmesi). Açık kalan tek bir seçici: her satır başlatmanın bir boyutu, en üstteki satır ise tetiktir — ve **açıklaması, çalışacak komut satırının tam kendisidir.** Gizli bayrak yok.

| Satır | Ne yapar | CLI / Sistem Karşılığı |
| --- | --- | --- |
| **▶ Start** | başlatır; açıklaması tam komut satırıdır | — |
| Agent | hangi klasörde açılacağı | `cwd` |
| Where | **terminalde mi, Console'da mı** (`surface` / `interactiveTarget`) | — |
| Engine | Claude, Codex, Gemini, OpenCode, OpenClaw | `--engine` |
| Model | senin model bilgi tabanından (`agentFarm.modelAliases`) + serbest metin | `--model` |
| Effort | low · medium · high · xhigh · max | `--effort` |
| Permissions | plan · acceptEdits · auto · manual · dontAsk · ⚠ bypassPermissions | `--permission-mode` |
| Route (Provider) | Claude / OpenRouter sağlayıcı rotası | `providerId` |
| Tier | Sağlayıcı katmanı | `tier` |
| Account | Seçili veya kural hesabı (`@standing`, `@emptiest`, `@round-robin`, `@kural`) | `account` |
| Superpowers | Standart ajan disiplini kancası On/Off | `superpowers` |
| Project | Oturumun ilişkilendirileceği proje (`PRS.*`) | `projectId` |
| Session name | prompt kutusunda, `/resume` seçicisinde, terminal başlığında **ve Agent Farm'ın oturum listelerinde** görünür | `-n` |
| First prompt | boş oturum yerine ilk mesajla açılır | konumsal argüman |

Alt kısımda **profiller**: *Save this as a profile…* mevcut seçimi `agentFarm.launchProfiles`'a adıyla yazar ("derin inceleme" = opus + xhigh + plan gibi), *Load a profile…* geri yükler; *Make model/effort/permissions my defaults* seçimi `launchDefaults`'a taşır. Launcher, her ajan için **en son ne ile başlattığını hatırlar** — aynı tür oturumu ikinci açışın tek Enter'dır.

#### Terminalde mi, Console'da mı — her başlatma soruyor (3.41.0)

[Console](#console) geldiğinden beri bir oturumun yaşayabileceği iki yer var, ama başlatma komutları hâlâ tek yeri biliyordu: **Start session**, **Start session…** ve **Continue latest** hiç sormadan terminale gidiyordu — yani ürünün yeni yarısı, konuşma başlatan her düğmeden görünmezdi. Artık soru, nerede olursan ol, bir kez soruluyor:

- **Ajan Detay sayfasında** üç düğme de adını koruyor ve altında **iki maddelik bir menü** açıyor — *In a terminal* / *In the Console* — nav düğmelerinin kullandığı menünün aynısı. (Yan yana iki düğme, tek tuşla verilen bir karar için araç çubuğunu iki katına çıkarırdı.)
- **Diğer her yerde** — komut paleti, ağaçtaki satırın sağ tık menüsü, `Ctrl+Alt+S`, Dashboard'un ve Portfolio'nun kendi başlat düğmeleri — aynı iki kelimeyi soran bir **QuickPick** çıkıyor ve en son seçtiğini hatırlıyor (`• last used`).
- **Launcher'da** bu bir satır: **Where** — model gibi, başlatmanın bir boyutu. Console modunda Start satırı komut satırı yerine başlatma özetini yazar, çünkü orada çalışan şey bir komut satırı değildir.
- **Ajan için**: `sessions.start` artık `surface: "terminal" | "console"` alıyor (varsayılan `terminal`, doğrulanır, asla tahmin edilmez).

**‼️ …ve HANGİ PROJE altında — ilk soru bu, ve varsayılan cevabı "hiçbiri" (3.84.0).** QuickPick, iki yerin üstünde tek bir **`Project`** satırıyla açılır — tek satır, asla proje adlarının listesi; adlar bir adım içeride, o satırın arkasındadır. İnsanın düşündüğü sırayla iki soru: bu iş ne, sonra bunu yaparken nerede oturmak istiyorum. Yeni oturumun başlatıldığı her yerde geçerli üç kural:

- **Cevap her seferinde `◧ No project` ile başlar, nereden başlatırsan başlat** — QuickPick, launcher'ın kendi **Project** satırı ve Console yazma kutusundaki proje kutusu. Eskiden pencerenin aktif projesini devralıyordu; yani saatler önce, başka bir iş için durum çubuğunda yapılmış tek bir seçim, ondan sonra başlatılan her oturumu sessizce dosyalıyor ve brifingliyordu. Durum çubuğundaki aktif proje hâlâ **pencerenin** cevabıdır; artık bu oturumun cevabı değildir ve ikisi birbirine yazmaz.
- **Seçim başlatmaya özeldir.** Buradaki cevap durum çubuğunu oynatmaz. (Onu oynatan komut `agentfarm.setActiveProject`'tir ve değişmedi.)
- **▶ → In the Console yazma kutusunu açar; oturum başlatmaz.** Ajan **sabitlenmiş** gelir — seçicinin yerinde adı, yanında seçiciyi geri veren bir ✕ — ve proje kutusu canlı kalır; çünkü proje bağlamı sistem promptuna **başlatma anında** biner ve ilk mesajından önce, onu seçebileceğin tek an odur. CLI, sen gönderince başlar.
- **Devam ettirmeye (resume) hiç sorulmaz:** projesi başladığı anda belirlenmiştir ve `stampSession` onun üzerine yazmayı reddeder; sorulsa cevap çöpe giderdi.
- Ajan tarafında `sessions.start` hâlâ `project?` alır ve boş bırakılınca pencerenin aktif projesini devralır — ajan her hâlükârda açık olmak zorundadır; `describe` metni arayüzün devralmadığını söyler.

Console yolunu "yaklaşık" değil **dürüst** yapan iki şey:

- **Hosted oturumun `-n`'i yoktur.** Yazdığın ad, CLI oturum kimliğini bildirdiği anda Agent Farm'ın kendi başlık deposundan uygulanır — sessizce düşürülmez.
- **`--continue` bir terminal kolaylığıdır:** klasörün en yeni oturumunu CLI'ın kendisi seçer. Hosted oturum ise **kimlikle** devam eder; bu yüzden *Continue latest → In the Console*, "en yeni"yi indeksten çözer (o ajanın klasörü, en yeniden başlayarak) ve *Resume in Console*'a verir. Devam edecek bir şey yoksa **söyler** ve yeni oturum önerir — geçmişini kaybetmiş gibi görünen boş bir konuşma açmaz.

**Oturum adı nereden okunuyor (3.24.1, kuralı 3.29.0'da düzeltildi):** `-n` ile verilen ad **transkripte yazılmaz**; CLI'ın kendi canlı kaydında (`~/.claude/sessions/<pid>.json`) durur ve süreç bitince o dosya silinir. Agent Farm bu kaydı okuyup adı **hatırlar**.

> **‼️ Kritik ayrım:** Claude Code **her** oturuma bir ad verir — kimse ad vermediyse kendisi uydurur (`basit-2e`, `developer-07`) ve bunu kayıtta **`nameSource: "derived"`** diye işaretler. Agent Farm **yalnızca insanın seçtiği adı** benimser (`nameSource` "derived" dışında bir şeyse, ya da adı zaten kendisi `-n` ile geçirdiyse); işaretsiz bir ada güvenilmez. **Ad vermeden açtığın oturum, eskiden olduğu gibi konuşmanın kendi ilk cümlesinden başlığını alır.**

Bir oturumun başlığının üç kaynağı vardır, bu sırayla: **senin verdiğin ad (Rename) → başlatılırken verilen ad (`-n`) → konuşmadan türetilen başlık**. Adın örttüğü başlık kaybolmaz, satırın tooltip'inde durur.

**‼️ "Konuşmadan türetilen" gerçekten konuşmadan türetilir — makinenin kendi sesinden değil.** Transkriptte kullanıcı mesajı gibi duran birkaç şey aslında düzeneğin kendisidir ve bir oturumu kendi tesisatının adıyla adlandırmak bilgi değil gürültüdür: `<…>` komut blokları ve yerel komut çıktısı, `/…` yazılan komutlar, `!…` kabuk geçişi — ve **köşeli parantez içindeki bildirimler**, ki gözden kaçan buydu: gerçek bir oturum `[Request interrupted by user]` adını almıştı, yani söylenen bir şeyin değil bir **durumun** adını. **Ayrım şurada:** yalnız **tamamı** tek bir köşeli parantez olan mesaj düzenektir. `[Image #2] şu dosyaya bak` bir insanın önüne ek iliştirerek konuşmasıdır — ölçüldü, bu kasada gerçek bir başlıktı — o yüzden işaret sökülür, cümle başlığı verir. "Köşeli parantezle başlıyorsa at" kuralı bir kötü adı düzeltirken bir iyi adı yok ederdi. Kararı **tek bir yer** verir (`conversationTitle`); oturum sayfası kendi kopyasını taşımaz, çünkü kuralın ilk kez ayrışması tam olarak iki kopya olmasındandı. Bu yargı başlığı olduğu kadar hover'daki **açılış prompt'unu** da yönetir: ikisi asla ayrı şey söylemez. Ölçüldü: 333 adlandırılmış oturumun 2'si değişti, ikisi de düzelme yönünde.

**Ad vermenin üç yeri (3.29.1; 3.30.2'de tamamlandı)** — hepsi aynı depoya yazar, yani bir yerde verilen ad **her yerde** görünür: sol paneldeki oturum satırına sağ tık · **Console'un sol panelindeki satıra sağ tık** (barındırılan kartlar da, aşağıdaki devam ettirilebilir liste de) · oturumun kendi sayfasındaki **✎ Rename**. Ad değiştiği an ağaçlar, Console satırları ve açık transkript sekmelerinin başlıkları birlikte güncellenir. Köprüde karşılığı **`sessions.rename`** (`sessionId`, `name`; boş `name` otomatik başlığı geri getirir) — yani bir ajana "şu oturumun adını şu yap" denebilir.

Serbest metin (ad, ilk cümle) her zaman tırnaklanır: `"` tek tırnağa döner, backtick (PowerShell kaçış karakteri) düşer, satır sonları boşluk olur — üç kabuğun (PowerShell · cmd · sh) hiçbirinde tırnak dışına taşamaz. `$` ve `%` **bilerek korunur**: kullanıcının kendi metnini sessizce bozmaktansa komut satırını göstermek doğru olanıdır (kabuk bir değişkeni genişletirse **Start satırında görürsün**).

### Raf — pin ve etiket (A2)

253 oturumun içinde her gün döndüğün altı iş vardır. **★** onları rafa koyar:

- Sessions tablolarında (Dashboard + Ajan Detay) satır başındaki **★** — dolu yıldız = rafta. **Rafa konan oturum listenin başında durur ve satır sınırından muaftır**: *Show 20* dediğinde 20 satır + rafın tamamı gelir, yani yedinciyi pinlemek altıncıyı gizlemez. Filtre panelindeki **★ Pinned** chip'i tabloyu yalnız rafa indirger.
- **Etiketler:** *Label Session…* (oturum sağ tık menüsü) virgülle ayrılmış serbest etiketler yazar — `zen, release, müşteri x`. Etiketler satırda çip olarak görünür ve **tablonun metin filtresi onları da arar**, yani "zen" yazmak hem başlığı hem etiketi tutar.
- **Recent Sessions ağacı**: pinli oturumlar 📌 ikonuyla en üstte, 30 satırlık kesmenin dışında; satır üstündeki pin düğmesi ve sağ tık menüsü aynı işi yapar.
- **Session shelf…** (`Ctrl+Alt+P`, Recent Sessions başlığındaki 📌): rafın kendisi — önce pinliler, sonra son 20 oturum; **Enter oturumu terminalde devam ettirir**, satırdaki 📖 transkripti açar, 📌 rafa alır/çıkarır.

Pin ve etiketler oturum **kimliğine** bağlıdır ve VS Code'un kalıcı deposunda tutulur; transcript dosyasına dokunulmaz, yeniden tarama ve yeniden başlatma onları etkilemez.

### Oturum sağ tık menüsü — aynı on bir şey, her yerde (3.41.0)

Bir oturum altı yerde görünüyor, sağ tık menüsü ise ikisinde vardı. Console kartında ya da Timeline kulvarında tüm set çıkıyordu; **Sessions tablosu satırında** (Dashboard, Ajan Detay), **Turns satırında**, bir **arama sonucunda** ya da bir **misyonun canlı akışında** yalnızca *Cut / Copy / Paste* çıkıyordu — yani "bunu nasıl yeniden adlandırırım?" sorusunun cevabı, o an hangi sayfaya baktığına bağlıydı.

Artık hepsinde tek bir sözleşme var (`media/afSessionCtx.js` + `package.json`'da tek bir `webviewSection == 'afSessionRow'` bloğu):

| Grup | Maddeler |
| --- | --- |
| açma | Open Transcript · **Resume in Terminal** · **Resume in Console** · Focus Session Terminal |
| işaretleme | Rename Session… · Pin / Unpin · Label Session… · Copy Session ID |
| durdurma | Interrupt Session · End Session · Clear From Live Timeline |

Bunu "var" olmaktan çıkarıp **çalışır** yapan iki tasarım kuralı:

- **Satır yalnızca bildiğini yayınlar.** `sessionId` *ya da* transcript yolu yeter — bir arama sonucu sadece yolu bilir, yeni bir Console kartı sadece kendi host kimliğini bilir. Host tarafındaki tek çözücü (`sessionFromArg`) gerisini oturum indeksinden tamamlar; satırın kendi `title`/`cwd`'si indekse üstün gelir, çünkü az önce yeniden adlandırılmış bir satır son taramadan yenidir. **Bir sonraki** oturum yüzeyini bedava yapan da bu: sözleşmeyi yayınla, menü gelsin.
- **Normal menü yerinde kalır.** `preventDefaultContextMenuItems: false` — Copy/Paste hâlâ orada; ve bu bilerek bir `contextmenu` dinleyicisi *değil*: sağ tıkı gasp etmek sayfanın kendi menüsünü elinden alırdı.

Timeline kartlarına eksik olan tek madde eklendi (**Resume in Terminal**), böylece bir konuşmayı geri almanın iki yolu, oturumun listelendiği her yerde yan yana duruyor.

### ⎋ Interrupt — çalışan bir turu durdurmak (A3)

Headless işler (task, mission) baştan beri durdurulabiliyordu — süreç bizim, ağacını öldürürüz. Konuştuğun bir oturum başka bir hayvan: onu durduran tek şey **insanın basacağı tuştur**. Agent Farm da tam olarak onu yapar — **oturumun kendi terminaline Esc yazar.** Süreç öldürülmez: **tur biter, oturum ve bağlamı yerinde kalır.**

- Nerede: Sessions tablolarında **çalışan** satırın yanındaki **⎋** · Timeline'ın canlı kartlarında **⎋ Interrupt** · Needs You'daki takılmış (stalled) satırda **⎋ Interrupt** · `Ctrl+Alt+I` (oturum seçtirir) · oturum sağ tık menüsü.
- Hedefleme sırası: (1) o oturumun **başlatıldığı** terminal, (2) o ajan adına açılmış en yeni entegre terminal, (3) harici pencere. **Kimliği çözülemeyen bir oturum için hiçbir şey yapılmaz** — rastgele bir claude penceresine Esc yazmak, pencere öne getirmekten farklı olarak geri alınamaz.
- Dürüst sınır: **harici terminal modunda** (`agentFarm.externalTerminal`) pencere bizim değildir, içine yazamayız — o durumda pencere öne getirilir ve "Esc'e orada bas" denir. Sahte düğme yok.
- Köprü: `sessions.interrupt` aynı ayrımı veri olarak döner (`interrupted: false` + gerekçe).

### Klavye (A4)

173 komutluk bir eklentide tek kısayol vardı. Artık bir **hub** ve altı doğrudan tuş var — hepsi VS Code'un Keyboard Shortcuts ekranından değiştirilebilir:

| Tuş | Ne açar |
| --- | --- |
| **Ctrl+Alt+F** | **Quick Menu** — gruplu, yazarak süzülen liste: Sessions · Pages · Work · System. Her satır **kendi kısayolunu yazar**, yani menü doğrudan tuşları öğretir. |
| Ctrl+Alt+S | Start Session… (launcher) |
| Ctrl+Alt+P | Session shelf… (pinliler + son oturumlar) |
| Ctrl+Alt+I | Interrupt session |
| Ctrl+Alt+D | Dashboard |
| Ctrl+Alt+N | Needs You |
| Ctrl+Alt+L | Live Timeline |
| Ctrl+Alt+A | Add to Work Queue |

**Türkçe-Q klavye notu:** Windows'ta Ctrl+Alt = AltGr. Türkçe-Q düzeninde AltGr **Q/E/T** harflerinde karakter üretir (`@`, `€`, `₺`), bu yüzden hiçbir kısayol o üç harfe konmuyor — kural istisnasız her bağlama için geçerli ve bir test bunu denetliyor. **Q harfi Agent Farm'dan tamamen boş:** eklenti Ctrl+Q'ya da hiçbir şey bağlamıyor (o tuş VS Code'un kendi *Open View* komutu — `workbench.action.quickOpenView`).

## Projeler, Portföy ve Kod Değişiklikleri {#projeler-portfoy}

*(3.25.0)* Çiftlik ajanları ve oturumları biliyordu; **onların üstünde** bir gruplama, **yan yana** bir filo görünümü ve **altında** ajanın ürettiği asıl şeyi — kodu — göremiyordu. Üçü de bu sürümde geldi.

### Projeler — her şeyin altında toplandığı şemsiye

*(3.52.0 — yeniden yazıldı.)* Proje eskiden bir ayarın içinde, maliyeti müşteri başına toplamak için ajanları gruplayan bir isimdi. Artık bir **varlık**: değişmez bir id, serbestçe seçilen bir ad, bir durum, bir belge **klasörü**, kod kökleri, taraflar, bütçeler ve tarihler — ama hâlâ neredeyse hiç kendi verisi yok. Oturumlar, görevler, misyonlar, bildirimler ve commit'ler bulundukları yerde yaşamaya devam ediyor; proje onların üzerindeki **birleştirme** katmanı.

**Nerede duruyor.** İki depo, her birinin tek sahibi. Projenin **klasörü** insanın yazdığı her şeyi tutar (tanım · plan · taraflar · çalışma günlüğü, artı notlar, kararlar, teslimler, kaynaklar, arşiv) — git ile seyahat eder, eklenti çalışmadan Obsidian'da açılır ve kayıt defterini yeniden kurabilir. `globalStorage/projects.json` yalnızca kayıt defterini ve **oturum bağ tablosunu** tutar. O tablo buradaki tek **yeniden üretilemeyen** şeydir — bu yüzden atomik yazılır ve depo her mutasyondan önce diski yeniden okur (iki pencere, tek dosya).

**Eklenti hiçbir dosya adına bağımlı değil.** Tanım, plan, günlük ve diğerleri frontmatter'daki `af-role` satırıyla bulunur. Yeniden adlandır, alt klasöre taşı, istediğin dilde yaz — hiçbir şey kırılmaz. Aynı `af-id`, **Obsidian'da yeniden adlandırılmış** bir klasörün sonraki taramada aynı proje olarak tanınmasını ve kopyalanmış bir klasörün sessizce aslıymış gibi davranmak yerine raporlanmasını sağlar. `agentFarm.projectSkeleton` gönderilen düzeni tamamen değiştirir (kendi adlandırma kuralı olan vault'lar için); `af-id` koymayı unutan özel bir şablona o anahtar eklenir, ama **beyan ettiği** bir anahtara asla dokunulmaz.

**Üyelik — tek sıra, beş adım.** Bir ajan gerçekte kaç projede çalışıyorsa o kadarına ait olabilir; eski tek sahiplik kuralı kalktı. Maliyet artık **oturuma** asılı — zaten çalışma dizini, zamanı ve doları olan atom — ve şöyle çözülür: açık atama → açık **projesizlik** → en uzun eşleşen klasör kökü → ajan kuralı → `Unassigned`. Her oturum yine tam olarak tek kovaya düşer, yani rakamlar hâlâ filo toplamına eşittir.

Bu adımlardan ikisi süs değil. **En uzun kök kazanır**, sessiz bir yanlış atfı düzeltir: `…/miropharm` ile `…/miropharm/muvu_talkScribe/ZEN` birlikte tanımlıyken ilk-eşleşen her ZEN oturumunu yanlış projeye veriyordu ve iki cevap da makul görünüyordu. **Açık "projesizlik"** gerçek bir durumdur: o olmadan, bir oturumu projeden çıkarmak kuralların onu hemen geri almasına yol açıyordu ve kimse sebebini öğrenemiyordu.

**Aktif proje — gerçekte ne yapar.** *(3.53.0.)* Bir proje seçmek, **o pencerede başlattığın oturumları o projeye dosyalar**: Console, oturum kimliğini taşıyan ilk olayda damgalar; terminal başlatması, canlı izleyici kimliği o başlatmaya bağladığı anda damgalar. Kaydedilen proje, oturumun **başladığı** projedir — kimlik geldiğinde durum çubuğu ne diyorsa o değil. Damga, elle dosyalamadan bilinçli olarak daha zayıftır: yalnızca bağ tablosunda hiçbir karar yokken yazar. Böylece başka bir projeye koyduğun — ya da her projeden açıkça çıkardığın — bir oturumu devam ettirmek, senin seçtiğini korur. Misyonlar ve bildirimler **henüz** damgalanmıyor ve arayüzde hiçbir yer damgalandığını söylemiyor.

**Ve nereden başlatırsan başlat sana soruluyor** *(3.56.0)*. Proje kutusu yalnızca Console'un yazma satırındaydı; başka hiçbir başlatma yolunda yoktu. Yani sol paneldeki bir ajanın ▶ simgesine basmak, oturumu durum çubuğu o an ne diyorsa ona dosyalıyor ve bunu hiç söylemiyordu — aynı "yeni oturum", hangi düğmeye bastığına göre iki farklı teklif. Bir oturumun **nerede** koştuğu ile **neye ait olduğu** aynı başlatmanın iki boyutudur, o yüzden birlikte gezerler: tek tıklık Start ikisini de gösteriyor, tam başlatıcı Project'i Model ve Effort'un yanında bir satır olarak taşıyor, ikisi de durum çubuğunun açtığı listeyi açıyor. **Devam ettirmeye** sorulmuyor — projesi başladığında karara bağlanmıştı, cevap çöpe giderdi.

**Devam ettirilen oturuma KENDİ projesi söyleniyor ve yeniden dosyalanmıyor** *(3.56.0)*. Eskiden pencereninkini devralıyordu: *A*'ya ait bir oturumu çubuk *B* derken devam ettirmek, ona *B*'nin brief'ini veriyordu — ajan çalışmadığı bir projenin durum özetini okuyor ve şüphelenmek için hiçbir nedeni olmuyordu. Dahası, *A*'ya yalnızca bir kuralla ait olan oturuma **açık** bir *B* ataması yazılıyordu; açık atama her kuralı yendiği için bu taşınma kalıcı ve sessizdi. Artık proje üyelik sırasından geliyor — diğer her yüzeyin verdiği aynı cevap — ve devam ettirme hiçbir şey yazmıyor. Terminal tarafındaki devam ettirmeye de yeniden söyleniyor: bayrak `--resume`'u atlatmıyor (ölçüldü) ve o yol bayrağı hiç geçirmiyordu.

### Proje oturumu protokolü — bir projeyi seçmek ajanı onun içine sokar

*(3.54.0.)* Bir projenin altında başlayan oturum, **daha ilk mesajdan önce o projeyi bilir**; kullanıcı tek kelime yazmaz. Ajana projenin adı, belge klasörü, kod kökleri ve güncel durumunu anlatan üretilmiş bir **brief** verilir: durum, özet, rolleriyle taraflar, **hangi `af-role`'ün hangi dosyada olduğu** ve son çalışma günlüğü satırları. Kendini asıl amorti eden kısım rol haritasıdır — çalışma günlüğünün nerede olduğunu bilen ajan, onu bulmak için klasörü okumak yerine doğrudan yazar.

**Kanal `--append-system-prompt-file`'dır ve bunun her parçası ölçüldü** (`test/smoke_project_context.mjs`, gerçek CLI üzerinde):

- Üç spawn yolu da bir shell altında çalışır. **Satır içi çok satırlı metin hiçbirinden sağ çıkmaz** — argv girdisi olarak argümanlar tırnaksız birleştirilir (`unknown option '---'`), komut dizesi içindeyse satır sonları komutu böler. Dosya yolu üçünden de sağ çıkar.
- Bayrak, `claude --help` bayrak listesinde görünmese de **vardır**.
- Yolu **Agent Farm tırnaklar**; tırnaksız bırakılan "John Doe" klasöründen geçen bir yol boşlukta kesilir.
- Bağlam **`--resume` ile hayatta kalmaz**, bu yüzden her spawn'da yeniden verilir — her komut satırının kurulduğu tek noktadan, ki bu "her spawn" ifadesini hatırlamaya değil yapıya bağlar.

**Burada şeffaflık isteğe bağlı değildir.** Kanal transkriptte iz bırakmaz; bu yüzden Console'da besteci alanının üstünde bir çip durur — `◧ <proje> — project context active` — ve üstüne gelindiğinde **metnin birebir kendisi** görünür. Proje seçili değilken kaybolmaz, bunu söyler. Oturum satırları da başlatıldıkları projeyi taşır.

**Maliyet:** tam bir bağlam **538 girdi token'ı**dır (1632 karakter — token başına 3.03 karakter; İngilizce için varsayılan 4 değil) ve cache-creation'a düşer, yani sonraki turlar onu ×0.1'e okur. Brief 2500 karakterle sınırlanır, satır sınırında kesilir ve tam metnin yolu eklenir.

**Kapsam.** Console oturumları, terminal başlatmaları ve headless görevler bunu taşır — görev, **oluşturulduğu** projeyi taşır, çünkü kuyruktaki bir görev saatler sonra, başka bir şeye geçmiş bir pencerede başlayabilir. Adlandırılmış CLI profilleri başka bir binary çalıştırır ve dokunulmaz. Kendi terminalinde devam ettirdiğin oturum hiçbir şey almaz (ölçüldü) — ama `_AF/BRIEF.md` proje klasöründe gerçek bir dosyadır, oradan okunabilir.

**Pencere yalnızca bir insanın oluşturduğu görev adına konuşur** *(3.54.1)*. "Oluşturulduğu proje" damgası, görev ortaya çıktığında pencereye bakan biri varsa doğrudur. 03:00'te ateşlenen bir **zamanlama**, bir dosya değişikliğine tepki veren bir **tetikleyici**, otomatik devredilen bir **içgörü** — bunların hiçbirinde kimse bakmıyordu, ve gözetimsiz bir koşuya bir projenin bağlamını artı "yaptığını o projenin günlüğüne yaz" talimatını vermek, hiçbir şey vermemekten kötüdür. Bu üçü proje almaz. Bir zamanlamayı projeye bağlamak **zamanlamanın üzerinde beyan edilecek** bir şeydir, pencereden çıkarsanacak değil; Şimdi Çalıştır da buna dahildir, çünkü zamanlayıcıdan farklı bir koşu üreten bir düğme zamanlayıcının testi değildir. **Yeniden denemeler ve sonraki iş akışı adımları kendi kökenini devralır** — özgün görevin projesi ya da koşunun başladığı proje; o proje "yok" olsa bile.

**`agentFarm.projectContextExtra`** her bağlama kendi tek satırını ekler — bir kurulumun ajanlarını kendi kurallarına bağladığı yer. Varsayılanı boştur.

**Yüzeyler.**
- **Sol panel bölmesi** (Agents'ın altında): **aktif proje** satırı, hiç proje seçili olmasa bile hep oradadır — görünmeden uygulanan bir damga, tam olarak kimsenin körü körüne güvenmemesi gereken otomasyondur. **Unassigned** hep en alttadır ve baştan utandırıcı bir sayı gösterir, çünkü sessizce başarısız olan kural, kural değildir.
- **Kendi sayfası** (`◧ Projects`, global nav'da ikinci): her alan burada düzenlenir — ad, durum, tür, simge ve renk, klasör seçici, kod kökleri, **rolleriyle** taraflar (kim karar verir, kim öder, kim yapar, kime sorulur), günlük *ve* toplam bütçe, tarihler, etiketler, ajan kuralları. `settings.json`'a hiçbir şey girmez. **Proje oluşturmak da burada** *(3.53.0)*: form adı ve belge klasörünü (Browse ile, ve sen devralana kadar adı izleyen bir öneriyle) artı durum, tür, özet ve kod köklerini sorar. Diğer bütün yollar — komut paleti, sol panelin boş durumu, "bu oturumdan yeni proje", aktif-proje ve ajan-kuralı seçicilerindeki "New project…" maddeleri — aynı formu açar; altta tek uygulama vardır, böylece klasör iskeleti ve hata metni hangi düğmeye basıldığına göre değişemez.
- **Bir projedeki `Sessions (n)`**, oturum tablosunu **o projeye daraltılmış** olarak açar ve oraya kaydırır *(3.53.0)*.
- **Her oturum satırında, her yerde.** Paylaşımlı sağ tık sözleşmesine eklenen tek madde, oturum listeleyen altı yüzeye birden ulaşır (Console · Missions · Search · sessions tabloları · Live Timeline · Turns) ve dört gerçekten farklı sonuç sunar: ata, aktar, **çıkar ve çıkmış kalsın**, ya da kararı unut da kurallar yeniden konuşsun. Yanlarında: **bu oturumdan yeni proje** (var olan en hızlı geriye dönük doldurma — oturum işin yapıldığı klasörü zaten biliyor) ve **oturumun klasörünü kod kökü olarak ekle**, ki tek seferlik atamayı kalıcı kurala çevirir.
- **Durum çubuğu:** `◧ <proje>` ya da `◧ No project`.

**Klasör kaybolursa.** Proje onunla birlikte kaybolmaz. Listede bir uyarı ve üç cevapla kalır — yeniden bağla · yeniden oluştur · yoksay — ve belge olmayan her şey (oturumlar, maliyet, zaman çizelgesi) çalışmaya devam eder. Hiçbir şey sessizce yeniden oluşturulmaz: taşınmış bir klasör ikinci bir kopyaya dönüşmemeli.

**Tek kaynak.** Bir proje yalnızca kayıt defterinde vardır — aynı şeyin bir de ayar dosyasında tanımı yoktur, iki şekli arasında bir uyarlayıcı da yoktur. Bir ajanın projesi, bir oturumunkiyle *aynı* fonksiyonla çözülür; böylece portföy sayfası ile yanındaki maliyet tablosu, bir işin kime ait olduğu konusunda birbirine ters düşemez.

### Proje sayfası — Overview · Timeline · Sessions · Cost

*(3.55.0.)* Sayfa yalnızca **düzenlenebiliyordu**; ne olduğunu anlatamıyordu. Artık sekmeleri var, ve Faz 1'in düzenleyicisi onlardan biri (⚙ Settings).

**Timeline, projenin dokunduğu her şeyin birleşimi** — koşan oturumlar, içlerindeki turlar, her oturumun ne yazdığı, görevler, misyon koşuları ve turları, ve projenin beyan ettiği kod köklerindeki git commit'leri. Her satır ait olduğu şeye derin bağlantı. Bir oturum **tek** satırdır (bittiği yere damgalanır, çünkü liste en yeniden okunur) ve bir oturumun dosya yazımları da **tek** satırdır: dosya başına satır olsaydı tek bir refactor bütün günü sahiplenirdi.

**Aidiyet tek yerde kararlaştırılır.** `core/projectFeed.ts` saftır ve kendisine zaten projeye ait satırlar verilir; yargı çözümleme sırasında (`core/projects.ts`) kalır. Oturumlar o sıradan, görevler ve misyonlar kendi `projectId`'lerinden, commit'ler beyan edilmiş bir kod kökünden gelir; kararlar, teslimler ve tamamlanmış plan maddeleri ise projenin kendi klasöründen *(3.57.0)* — onların aidiyeti bir tahmin bile değildir. **Bildirimler ve kuyruk maddeleri artık kendi damgalarını taşır** *(3.107.0)* ve biri o damgayı koyduğunda görünürler; mesajı kimin gönderdiğinden asla çıkarsanmaz, çünkü bu "bir ajan bir projeye aittir" hatasının kibar yazı tipiyle yazılmış hâlidir. Damgasız olan basitçe yoktur — makul olan değil, dürüst olan cevap budur.

**‼️ Bir belge olayının görünmesi için tarihi BELGENİN söylemesi gerekir** *(3.57.0)*. Karar `af-date` söyler; teslim, Date sütununu söyler; plan maddesi, Obsidian'ın kendi Tasks eklentisinin orada işaretlediğinde yazdığı ✅'yi taşır. "Q3" diye bir teslim ya da Agent Farm'dan işaretlenmiş (ki o ✅ yazmaz) bir madde, dosyanın kaydedildiği ana damgalanmak yerine **dışarıda bırakılır** — yüz satırın tek bir ana düşmesi, kesin görünüp hiçbir şey söylemeyen bir zaman çizelgesidir. Sayfa bunu da yazar, böylece eksik satır bir kayıp değil bir sınır olarak okunur.

**‼️ Tür süzgeci satır sınırından ÖNCE uygulanır, ve bu bir ölçümdür.** 150 oturumlu bir projede 3690 olayın 3000'i turdur. 300'de kesip sonra sayfada süzmek, okuyucuya kapattığı türden %81 oranında dolu 300 satır verir — timeline ~50 oturum gösterip gerisine "daha eski" der, oysa gerisi turlardır. Bu yüzden sayfa istediği türleri gönderir ve host süzdükten sonra keser. `counts` yine her şey üzerinden, herhangi bir süzgeçten önce alınır; böylece bir çip, açılırsa kaç satır ekleyeceğini söyler. Turlar kapalı başlar.

**Maliyet, ve bir maliyet kırılımının iddia EDEMEYECEĞİ şey.** Toplam · bugün · günlük seri · 7 ve 30 günlük yakma hızı · bitiş tarihindeki öngörü · bütçe menzili. Model kırılımı **tur** granülasyonundan türetilir, çünkü transkriptin bir modeli faturaladığı tek yer orasıdır — iki modelin hizmet ettiği bir tur, uydurma bir oranla bölünmek yerine `mixedTurnCost` olarak bildirilir; tur ayrıntısı olmayan oturumlar `unattributed`'a düşer. `byModel + mixedTurnCost + unattributed = total`.

**Sessions, `media/sessionsTable.js`'in bütün olarak gömülmesidir**; sütunlar, süzgeçler, sıralamalar, açılan tur dökümü ve paylaşılan sağ tık sözleşmesi bedava gelir. Bir buton, sekmenin cevaplamadığı "filonun bütününe göre nerede duruyor" sorusu için Dashboard'ı projeye daraltılmış açar.

**Sayfanın kendi maliyeti, ölçüldü:** 150 oturum · 3000 tur · 200 görev · 10 misyon · 120 commit → bütün akış ve rollup için **42 ms**. `git log` depo başına 60 sn önbellekli okunur ve bir repaint sırasında asla satır içi çalıştırılmaz; her sekmenin verisi yalnızca o sekme açıkken üretilir, çünkü bu sayfa her filo yenilemesinde yeniden çizilir.

### Belgeler — Plan · Docs · People, ve yazma tarafı

*(3.57.0.)* Bir proje okunabiliyordu ama **tutulamıyordu**. Klasöründe kurulduğu günden beri bir charter, bir plan, bir çalışma günlüğü ve bir teslim tablosu vardı; ve hiçbiri — ne bir sayfa, ne bir ajan, ne bir op — onlara tek satır yazmıyordu. Kayıt yalnızca biri Obsidian'ı açmayı hatırladığında büyüyordu.

**‼️ Bir plan maddesini işaretlemek dosyanızın tam olarak bir karakterini değiştirir.** **Plan** sekmesi, plan belgesinin kendi kutucuk satırlarını kutucuk olarak çizer, dosyanın kullandığı başlıklara göre gruplar, satırların taşıdığı 📅 ve ✅'yi gösterir. Birini işaretlemek, `[ ]` içindeki boşluğu özgün metinde offset ile `x` yapar — madde imi, boşluklar, girinti, simgeler, Obsidian Tasks metadata'sı (🆔 ⛔ ⏫ 📅) ve dosyadaki her satır sonu bayt bayt hayatta kalır. Satırı ayrıştırılmış parçalarından yeniden kurmak aynı testi geçer ve gerçek hayatta bir vault'u sessizce normalleştirir; dosyayı satır sonlarından bölüp birleştirmek ise tek kutucukluk bir isteği git'te bütün dosyalık bir diff'e çevirir.

**Ve bilerek hiçbir ✅ tamamlanma tarihi eklenmez.** Obsidian'ın Tasks eklentisi, kutuyu **siz orada** işaretlediğinizde onu yazar; Agent Farm sahibi olmadığı metadata'yı yazmaz. ✅ taşıyan bir maddenin işaretini kaldırmak onu yerinde bırakır ve bunu **söyler** — kullanıcının kendi aracının koyduğu bir satırı sessizce silmek yerine. Sayfa bütün bunları kutucukların yanında yazar, çünkü şaşırtıcı olan kısım bu kendini tutmadır.

**Belgeler her zamanki gibi bulunur — asla adıyla değil.** Kararlar yeni bir `af-role: decision`, her biri tek dosya (ADR deseni): ortak bir belgeye eklenselerdi kimsenin bağlantı veremeyeceği satırlara dönerlerdi ve aynı anda yazan iki ajandan biri kaybolurdu. Yenileri, zaten orada duran kararların yanına gider; ya da iskeletin `holds: 'decisions'` diye beyan ettiği klasöre — asla **adıyla** eşleşen bir klasöre değil, çünkü o, başka bir vault ona başka bir isim verdiği anda kırılırdı. O gün aynı başlık kullanılmışsa sonek alır; bu, var olan bir kaydı asla ezemez.

**Teslimler kullanıcının kendi tablosuna, tablonun kendi sütun adlarıyla girer.** Satır, dosyanın sonuna değil tablonun son satırından sonrasına eklenir ve her değer onu adlandıran sütuna yerleşir — böylece sütunları **yeniden sıralanmış** bir tablo da her değeri doğru yere alır, başka bir dilde yazılmış olan ise gönderilen sırayla konumsal doldurulur. Tablonun sahip olmadığı bir sütun, o değerin dışarıda kalması demektir; başkasının sütununa itilmesi değil.

**Docs sekmesi klasörün kendisidir.** Her belgenin `af-role`'ü üzerinde olan ve makine üretimi dosyaların işaretlendiği bir ağaç, seçili dosyanın diskteki hâli, ve başka yerlerde kullandığınız dört doc-open kipinden hangisiyle isterseniz **Open** (VS Code · render edilmiş önizleme · Obsidian · kendi uygulamanız) — Notices ve Queue panolarının kullandığı aynı sözleşme; diğer ikisiyle senkron tutulacak beşinci bir yarım render edici değil. Yeni notlar, seçtiğiniz bir klasöre oluşturulur.

**People kendi sekmesine taşındı**, çünkü kim karar verir / kim öder / kim yapar / kime sorulur, projeye **dair** bir sorudur; projenin **üstünde** bir ayar değil. Her oturuma anlatılan kayıt listesi orada düzenlenir, projenin kendi People belgesine giden bağlantının yanında. İkisi bilerek **senkronlanmaz**: biri Agent Farm'ın enjekte ettiği yapılandırılmış veridir, diğeri kullanıcının aynı kişiler hakkındaki düzyazısıdır, ve düzyazıyı bir tablodan yeniden yazmak bir programın deneme yazısını düzenlemesidir.

**Her yazım tek bir korumalı, atomik yoldan geçer.** Oku, değiştir, yaz — okumada alınan mtime yazıma verilerek; böylece arada Obsidian'da yapılan bir kayıt, yazımın onu silmesi yerine **reddetmesini** sağlar. Yazımlar geçici dosya ve rename ile iner, yani bir çökme yarım belge bırakamaz. Bir sayfanın ya da bir ajanın verdiği her yol proje klasörünün içinde çözülür, dışarı tırmanıyorsa reddedilir. Ve `projects.doc.write`, çağıranın dosyayı okuyup aldığı `mtimeMs`'i geri vermediği sürece var olan bir dosyayı değiştirmez — kör üzerine yazma, bu op'un imkânsız kılmak için tasarlandığı tek şeydir.

**Brief eksik olanı aldı, ve elindekini kaybetmeyi bıraktı.** Artık **açık** plan maddelerini (bitmişleri değil — bir brief'in bütçesi zaten yapılmış olana harcanmamalı) ve son kararları taşıyor. Onu büyütmek gerçek bir hatayı ortaya çıkardı: sistem prompt'u sınırı bitmiş metni kesiyordu ve brief'in **son** bölümü "Writing back" — günlüğün nerede olduğu, planın nerede olduğu, neyin yeniden biçimlendirilmeyeceği. Yani en eyleme geçirilebilir kısım ilk düşen şeydi. Enjekte edilen kopya artık bunun yerine **listelerini** kısaltan bir bütçeyle kuruluyor, sığana kadar kademe iniyor; diskteki `_AF/BRIEF.md` tam metin olarak kalıyor — "cut to fit" işaretinin gösterdiği şey zaten o.

**Ayarlar:** `agentFarm.projectsRoot` · `agentFarm.projectSkeleton` (bir klasör girdisi `holds: "decisions"` beyan edebilir) · `agentFarm.projectStaleDays` · `agentFarm.projectContextExtra`.
**Köprü:** `projects.list` · `get` · `create` · `set` · `rename` · `assign` · `current` · `health` · `rescan` · `sessions` (bir projenin oturumları, her biri *neden* ait olduğuyla) · `brief` (durum özeti; `context:true` bir oturuma verilen metnin birebir kendisini döndürür) · `timeline` (sayfanın kendi akışı; `counts` süzgeçten önce alınır, `unfiled` dosyalanamayanı adıyla söyler) · `cost` (sayfanın kendi rollup'ı, çekinceleriyle) · **`doc.list` · `doc.read` · `doc.write` · `log` · `plan` · `plan.add` · `plan.check` · `decision.add` · `deliver` · `people.set`** *(3.57.0 — yazma tarafı: bir işi bitiren ajan onu kendisi kaydeder, böylece bir sonraki oturumun brief'i birinin yazmayı hatırladığından değil, olandan kurulur)*.

### İş — beş depo, tek sekme, ve her birinde bir damga (3.107.0)

*(Faz 5.)* Bir proje **ne olduğunu** ve **ne kadara mal olduğunu** söyleyebiliyordu. İşin kendisi ise beş ayrı sayfada yaşıyordu ve her biri elle süzülmek zorundaydı — yani proje sayfasının var olma sebebi olan soru, *bu proje şu an gerçekten ne yapıyor*, o sayfada cevapsızdı.

**‼️ MEKANİZMANIN TAMAMI DAMGADIR, VE HİÇBİR ŞEY ÇIKARSANMAZ.** Görevler zaten bir `projectId` taşıyordu; artık **misyonlar, bildirimler ve iş kuyruğu maddeleri** de taşıyor. Damgayı, o şeyi yapan koyar — bir **insan** yaptıysa pencerenin aktif projesi, bir ajan yaptıysa açık bir `project` argümanı, hiç kimse pencerede değilse **otomasyonun kendi beyanı** — ve sonrasında satırın üzerinden değiştirilir ya da kaldırılır. Hiçbir kodun yapmadığı şey tahmindir: bir bildirimin göndericisine bakıp proje çıkarsamak yarısını yanlış dosyalar, çünkü bir ajan birden çok projede çalışır. Bedeli, damgasız işin projede görünmemesidir; her yüzey bunu boş görünmek yerine **yazar**.

**Kaldıramadığın bir işaret, kimsenin güvenmediği bir işarettir.** Otomatik damgalamayı burada güvenli kılan tek şey budur. Kuyruğun yakalama kutusu, hangi projeye dosyalayacağını **gösterir** ve Add'e basmadan önce değiştirmene izin verir; her bildirimin ve her maddenin kendi satırında bir proje seçici vardır ve boş seçeneği damgayı kaldırır; iki pano da bunu seçim üzerinden toplu yapar. Köprüde aynı işlem: `notices.project` ve `queue.project`.

**İki pano da proje filtresi kazandı**, ve **"No project"** filtrenin yokluğu değil gerçek bir seçenektir — projeye göre süzmek, dosyalanmamış satırları ekranda hiçbir şey söylemeden yok edemez, çünkü dosyalamak isteyeceğin tam da onlardır. Hiçbir şeyle eşleşmeyen bir proje filtresi **hiçbir şey** döndürür, her şeyi değil: sessizce süzmeyi bırakan bir filtre bütün panoyu geri verir ve cevap gibi görünür.

**Work sekmesi** beşini de sana ne kadar ihtiyaç duyduklarına göre gruplar — *Running now* · *Needs you* · *Queued* · *On the books* · *Fires by itself* · *Settled* — ve içi boş grup **çizilmez**, çünkü her biri "burada bir şey yok" diyen beş kart, gerçekten bir şeyi olan tek kartın üstünde beş paragraf demektir. Hiçbir şeyi olmayan bir sekme ise bunun sebebini ve ne yapılacağını söyler. Her satır kendi sayfasının söyleyeceğini taşır, fazlasını değil: kuyruktaki bir görev **kapının kendi cümlesiyle** neden başlamadığını taşır; bir misyon bu projede mi **başlatıldığını** yoksa **delegasyonları** buraya dosyalandığı için mi burada olduğunu söyler; bir zamanlama ne zaman ateşlendiğini ve freni olup olmadığını gösterir.

**Ve iş buradan başlar.** *Start a session here* önce projeyi **aktif yapar** — brief'i ajanın sistem istemine sokan şey budur — sonra Console kutusunu (ya da terminali) onun üstünde açar. Yanında: yeni görev, yeni zamanlama, yeni tetik; her biri diğer her yolun açtığı **aynı formu** projesi doldurulmuş hâlde açar. Bu sekme beş deponun hiçbirine kendisi yazmaz; zaten onlara sahip olana devreder — bir proje sayfasından yapılan görevin başka yerden yapılanla birebir aynı olmasının tek yolu budur.

**Bir misyonun projesi delegasyonlarına iner.** Planlayıcının ürettiği her görev, pencereyi okumak yerine misyonun projesini miras alır — bir dalga planlayıcı ne zaman karar verirse ateşlenir, bu da kimsenin pencereye bakmasından bir saat sonra olabilir. Bu olmadan Work sekmesi misyonu gösterir, sebep olduğu işi göstermezdi.

**Yol üstünde düzelen iki şey.** Bir görev veya misyon satırındaki "aç", argüman almayan bir komuta id geçiriyordu; yani bir timeline satırı iki yüz kişilik bir liste açıyor ve az önce tıkladığını bulmayı sana bırakıyordu — iki panel de artık odak alıyor. Ve sayfanın göreli saati, bu makineden birkaç saniye ileri bir damga için `-27304s ago` yazabiliyordu; bu normal bir durumdur ve sayfanın kendine bozuk demesidir.

**Köprü:** `projects.work` (aynı beş depo, sadece bitmemişler için `open:true`) · `notices.project` · `queue.project` · `notices.post`, `notices.list`, `queue.add`, `queue.list` ve `missions.start` üzerinde `project`.

### Parçalar, şablonlar, bir mektup ve bir karşılık (3.109.0)

*(Faz 7 — proje ekseninin son fazı.)* Tek bir sorunun dört cevabı: düz bir listede düz bir şey olmayan projeye ne olur.

**‼️ BİR ALT PROJE TAM OLARAK TEK BİR YERDE GÖRÜNÜR.** `parentId` Faz 1'den beri modeldeydi ve hiçbir ekranda değildi. Artık parça, sol paneldeki ağaçta ebeveyninin altına yuvalanıyor, sayfanın kendi listesinde içeriden başlıyor ve bir durum grubunda **ikinci kez görünmüyor** — aynı proje iki satırda olursa satırları sayan herkes yanılır. **Kendi durumu kendi satırında** yazıyor (aktif bir ebeveynin altındaki bitmiş bir parça hakkında başlık aksi hâlde yanlış bir şey söyler), ve ebeveyni listede olmayan bir parça — süzülüp çıkmış ya da başka pencerede silinmiş — **kaybolmak yerine üst seviye bir satır olarak geri gelir**.

**‼️ PARÇALARIN RAKAMLARI YANINDA DURUR, İÇİNDE DEĞİL.** Oturumlar ayrıktır, yani toplama aritmetik olarak meşrudur — ve yerinde yapmak yine de yanlış olurdu: satırlar filo toplamına eşit olmaktan çıkardı. `partsTotals` katlamayı **ayrı** verir ve hep onu okunur kılan sayıyla birlikte (`$11.60 toplam · 2 parçada +$84.15`); hover, bunun yanındaki rakamın içinde olmadığını açıkça söyler. Sayfa, sol panel ve köprü için tek uygulama. **Brief artık bir parçanın içindeki ajana onun bir parça olduğunu söylüyor** — yoksa worklog satırı, kararı ve backlog maddesi kardeş klasöre düşer, ve yoldaki hiçbir şey hangisi olduğunu söylemez.

**Şablonlar — ve liste BOŞ geliyor.** Şablon, insanın nasıl çalıştığına dair bir iddiadır; birinin beş plan maddesine dair tahminini taşıyan hazır bir "Müşteri projesi" bir özelliği ilk görüşte sildiren şeydir. Giriş kapısı, kendini zaten kanıtlamış bir projede **Şablon olarak kaydet**, ve bu bir **çoklu seçim — işaretlemediğin şey taşınmaz**: kimlik, kod kökleri, ajan kuralı, bütçeler, kişiler, klasör iskeleti, planın açık maddeleri, kuyruktaki backlog maddeleri. **Kimlik, klasör ve ebeveyn asla taşınmaz** (bunlar kimliktir, biçim değil), **durum da taşınmaz** — bitmiş bir projeden alınan şablon her yeni projeyi `done` yaratırdı. Oluşturma formunda **yazdığın her şey şablonu yener**; hiç şablon yokken kontrol, şablonların nereden geldiğini söyleyen bir cümledir, asla boş bir açılır liste değil.

**Devir belgesi — soğuk başlangıç mektubu.** İkinci bir rapor değil: rapor bir *dönemdir*, bu bir *başlangıç konumudur* ve dönemi yoktur. Bu ne (charter'ın kendi cümleleri) · her belge ve kod kökü nerede, **bu makinede olmayanlar** işaretli · kime sorulur · nerede duruyor · ne açık ve ne **engelli** · **‼️ birinin zaten dövüşüp açık bıraktığı madde**, defterden, son notuyla · neden böyle kurulmuş · ne teslim edilmiş · gerçekte nasıl çalışılıyor · ve gerçek kodları adıyla anan numaralı bir **ilk beş dakika**. **‼️ Makinelerin yazamayacağı bölüm asıl mesele:** belge senin olan bir blokla biter ve yeniden üretim onu **harfiyen korur** — düğmenin önizleme değil de yazma yapabilmesinin tek sebebi budur. İşaretini kaybetmiş bir belge **yeniden yazılmaz, reddedilir**.

**Arşiv aynalaması.** Biten proje karşılığına geçer (`agentFarm.projectsArchiveRoot`, ya da çevredeki vault'un zaten kendini aynaladığı gibi `<üst>/99_ARCHIVE/<kök>_ARCHIVE` olarak türetilir). **‼️ Kendiliğinden asla olmaz:** durumu `archived` yapmak diske dokunmaz, çünkü "bu iş bende bitti" ile "dosyalarımı taşı" farklı cümlelerdir. **İki yolu da yazan** modal onay; klasör adını korur; zaten var olan bir şeyin üstüne konmayı reddeder; kayıt defteri taşımayı izler; **Restore tam tersidir**. `projects.archived` kayıt defterini değil **klasörü** okur — kayıttan silinmiş bir projenin klasörü hâlâ durur, ve iki yıl sonra aranan tam olarak odur.

Köprü: `projects.handover` · `projects.templates` · `projects.template.save` · `projects.template.delete` · `projects.archive` (taşımayı anlatır; `apply: true` gelene kadar hiçbir şeye dokunmaz) · `projects.archived`, ayrıca `projects.create`'e `template` / `parentId` ve `projects.get`'e `parent` / `children` / `parts` / `archived`.

### Zekâ — geriye dönük doldurma, ikinci kat, ve sana ulaşan bir rapor (3.108.0)

*(Faz 6.)* Bir projenin yapamadığı dört şey: filodaki sahipsiz oturumlardan hangilerinin kendisine ait olduğunu söylemek; ne olduğunu değil **nasıl çalışıldığını** söylemek; "bu sistem yaşıyor mu" sorusunu cevaplayan tek ekranda görünmek; ve sorulmadan kendisi hakkında konuşmak.

**‼️ GERİYE DÖNÜK DOLDURMA ÖNERİR; ONAYLAYAN İNSANDIR.** Projeler var olmadan önce aylarca çalışmış bir filoda yüzlerce oturum `Unassigned` kovasındadır ve onları tek tek dosyalamak kimsenin yapmadığı bir iştir. `core/projectSuggest.ts` dört sinyal okur ve her birini **bir saniyede kontrol edebileceğin bir OLGU** olarak yazar: *11 dosyanın 11'ini `D:\…\muvu_talkScribe` altına yazdı* · *tam bu klasörden 9 oturum daha buraya dosyalanmış* · *bu ajanın dosyalanmış oturumlarının %88'i bu projede* · *başlığında "agentfarm" geçiyor*. Bir skor var ve SIRAYI o belirler; ama asla yazılmaz, çünkü "%84 eminim" okuyucunun kontrol edemeyeceği bir sayıdır ve böyle bir liste terk edilir.

Dört kural, her biri bunun yanlış gitme biçimlerinden birinin cevabı:

- **Yalnız kararsız olanlar.** Aidiyet sırasının zaten yerleştirdiği bir oturum karara bağlanmıştır — orada öneri, kapanmış bir soruya ikinci görüş demektir. Senin açıkça her projeden **çıkardığın** bir oturum için hiç öneri yapılmaz ve ayrı sayılır ki sayısı bir eksiklik sanılmasın: bir insanın reddettiğini önermeye devam eden motor, kapatılan motordur.
- **En güçlü sinyal, hiçbir yol kuralının göremediğidir.** Yola göre aidiyet bir oturumun nerede *durduğunu* sorar; `files` neye *dokunduğunu*. Kendi ev klasöründe çalışıp üç dizin ötedeki bir depoyu düzenleyen bir ajan sıradan durumdur ve her kurala görünmezdi.
- **Klasör kohortu YALNIZCA açık dosyalamaları sayar.** Kuralın yerleştirdiklerini saymak, sinyali onu yerleştiren kuralın yankısı yapardı — kendisiyle hemfikir olup buna kanıt demek. İki proje arasında bölünmüş bir klasör *klasör bölünmüş* der, çoğunlukla çözülmez.
- **‼️ Çekişmeli satır bildirilir, çözülmez.** Kıl payı yakın iki proje, motorun cevaplayamadığı bir sorudur; ikisini de adıyla yazar ve **"tümünü seç" onu dışarıda bırakır**. Elle işaretleyebilirsin — bilen sensin. Onları da çözen bir toplu hareket, iki yüz kat hızla yanlış dosyalardı.

Uygulama **yalnızca oturum id'leri** gönderir: projeyi host yeniden türetir, yani dört tur önceki listeyi elinde tutan bir sayfa motorun artık önermediği bir projeyi yazamaz. Artık önerilmeyen id'ler sessizce düşmez, `skipped` içinde geri gelir; ve dosyalanan her şey oturumun kendi menüsünden geri alınabilir.

**İkinci kat — Analysis sekmesi.** Timeline *ne oldu*, Cost *para nereye gitti*; bu, verinin ikinci kez katlanmış hâli. Haftalar (oturum, tur, maliyet, commit, ilk çalışılan ve kapanan backlog kalemleri) · işin gerçekten ne zaman yapıldığının **ritmi** (yerel gün ve saat) · bir kalemin ilk dokunuşundan kapanışına **çevrim süresi** · en çok yazılan dosyalar ve turları alan ajanlar · projenin **kendi ortalamasına karşı** verilen güncel tempo.

Üç kural, her biri bir analiz sayfasının yalan söyleme biçimi:

- **‼️ Bölmeye değer paydası olmayan rakam yazılmaz.** Ritim 40 tur, çevrim süresi 5 kapanmış kalem, tempo 2 hafta ister. Altında blok yoktur ve sayfa **neyin** ve **ne kadar** eksik olduğunu söyler — "henüz yeterli tur yok, şu ana kadar 23" bir cevaptır; altı noktadan okunan bir şekil ise okuyucunun inanacağı bir şekildir.
- **‼️ Eğilim bir kontrole karşı söylenir.** "Oturum başına $4.10" tek başına hiçbir şey demez; projenin kendi ortalamasının yanında kontrol edebileceğin bir iddiadır. Sayfa bunu rakamların yanında yazar.
- **‼️ Yerel günler, Pazartesi haftaları.** 23:40'taki bir oturum o akşama aittir — `toISOString` onu UTC'nin doğusunda yarına taşır — ve Pazar başlangıçlı hafta her hafta sonunu ikiye böler. Sessiz hafta bir **sıfır satırıdır**, boşluk değil: delikli bir seri yalan çizer.

Backlog tarafı **track defterinden** gelir, belgedeki tarihlerden değil: `[x]` bir kalemin kapalı *olduğunu* söyler, *ne zaman* kapandığını yalnız defter söyler, ve dosyayı okumak her kalemi Obsidian'da en son kaydedildiği ana tarihlerdi. `touch` bir denemedir, kapanış değil — herhangi bir türdeki son olayı kapanış saymak, terk edilmiş her kaleme bir çevrim süresi verirdi.

**Code sekmesi — iki kaynak, asla toplanmaz.** Commit'ler **git'in** beyan edilmiş bir kökte kaydettiğidir: orada kim ne yazdıysa hepsi. `sessionWrites` ise **bu projenin kendi oturumlarının** yazdığıdır, kendi transkriptlerinden, herhangi bir deponun dışındaki dosyalar dâhil. Farklı sorulara cevap verirler ve ikisinin toplamı hiçbir anlamı olmayan üçüncü bir sayı olurdu — `codeedits.ts`'in bir oturumun diff'i ile git diff'i arasına çektiği aynı çizgi. Bu makinede olmayan bir kök **eksik** diye bildirilir, çünkü orada boş bir commit listesi "sessiz depo" diye okunurdu.

**Sağlık Living sayfasına iner.** Proje sayfası eksik klasörler, aşılmış bütçeler ve aktif işaretli ama kimsenin dokunmadığı projeler hakkında hep doğruyu söyledi — proje sayfasında, yani zaten bir şeyden şüphelendiğinde gittiğin yerde. Living ise şüphelenmediğinde baktığın ekrandır ve yalnızca gitmeyi akıl etmen gereken bir yerde duran uyarı, Principle 1'in sessiz kuralıdır. Hepsi için **tek satır**, ki dokuz proje diğer bütün döngüleri sayfadan itmesin — ama **adlarını yazar**: adsız bir sayı, üzerine iş yapamayacağın bir satırdır. **Eksik klasör uyarı değil ölüdür** — plan, backlog ve worklog onun içindedir, yani proje ekseninin bütün yazma tarafı yeniden bağlanana kadar kırıktır. Uyarıları yeniden türetmez; proje sayfasının hesapladıklarını yazar, çünkü iki kez yazılmış bir "klasör var mı" kontrolü bir hafta içinde birbiriyle çelişecek iki cevaptır.

**Sana ulaşan bir haftalık özet.** Varsayılan kapalı (`agentFarm.projectDigestDay`); bir gün seç, her açık projenin haftası **Bildirimler panosuna** — zaten okuduğun yere — gerçek bir özet olarak düşsün, tam rapor ikinci bacak olarak eklenmiş hâlde. Kimsenin açmadığı bir klasöre yazılan rapor, Living'in görünür kılmak için var olduğu başarısızlığın ta kendisidir. Projesiyle damgalanır, yani o projenin Work sekmesinde ve zaman çizelgesinde de görünür. Proje başına haftada bir kez, ve nöbetçi bizim bir zaman damgamız değil **panonun kendisidir** (`sourceKey`): iki açık pencere ikinci kez gönderemez, ve sildiğin bir özet istersen geri gelebilir.

**Köprü:** `projects.suggest` · `projects.suggest.apply` · `projects.analysis` · `projects.code` · `projects.report` (aynı belge, istediğin dönem için; `post:true` ile panoya da düşer).

### Backlog — projenin bekleyen iş yığını (3.59.0)

**Birbirinden ayrı tutulan üç şey.** **Plan** yol haritasıdır: makro, faz ölçeğinde, on satır, ayda birkaç kez değişir. **İş kuyruğu** küresel kullanıcı→ajan kanalıdır: bir akış — yakalanır, gruplanır, delege edilir, biter. **Backlog** ise projenin *stoğu*: yüzlerce kalem; kodlu, sıralı, filtrelenebilir; "sırada ne var, şimdi hangisini yapayım" sorusunu cevaplar. Üçüncüsünü birincisinin içine koymak akla ilk gelen hamleydi ve iki bakımdan yanlıştı — yüz tane "şunu da düzeltelim" satırı yol haritasını okunmaz yapar, ve brief'in taşıdığı altı açık plan kalemi imla düzeltmeleriyle dolar.

**‼️ Bu bir belge, veritabanı değil.** `Backlog.md`, `af-role: backlog` ile bulunur ve kasanın zaten anladığı satırlardan oluşur: kutunun kendisi durumdur (`[ ]` açık · `[/]` yapılıyor · `[x]` bitti · `[-]` iptal), `#bug` türdür, Obsidian Tasks'ın kendi 🔺⏫🔼🔽⏬ ikonları önceliktir, `⛔ P-5.1` neyi beklediğidir, `[plan:: afprj-05]` hangi plan kalemine ait olduğunu söyler. Yalnızca *efor* kendi alanını gerektirdi (`[effort:: S]`, Dataview'ın yazımı). Böylece dosya Obsidian'dan her yerden düzenlenebilir, git ile taşınır ve her satır kullanıcının mevcut görev sorgularında çalışmaya devam eder.

**‼️ Alan adları İngilizcedir, kalemler değil.** Bir alan adı *mekanizmanın* parçasıdır — `effort`, `plan`, `from`, `was`, `closed` — ve eklentinin çalışma dili İngilizce olduğu için her kurulumda aynıdır; ne yazdığınız ise sizindir, Türkçe de Japonca da olur. Diskte hâlihazırda duran eski yazımlar (`efor::`, `boyut::`, `kaynak::`) **okunmaya devam eder**: bu bir ikinci çalışma dili değil, *girdi toleransıdır* — yıllar önce yazılmış bir satır ayrıştırılmayı sürdürmeli, ve bir sonraki alan düzenlemesi satırı zaten İngilizce yazımla yeniden kurduğu için eski adlar bir dosyayı kırarak değil kendiliğinden sönümlenir.

**Kod kalıcıdır; sıra kuyruğundur.** `P-5.3` — bir alan harfi, sonra noktalı bir yol; her düzey kendi başına geçerli bir koddur (`P-5` üstündeki epiktir, gerçek bir kalemdir). Numaralar yalnızca artar: iptal edilen bir kalemin numarası harcanmış kalır, üç ay önce `K-8` yazan bir not bugün de aynı kalemi gösterir. Sıralama bambaşka bir yerde, aşağıdaki 🎯 bloğunda olur ve hiçbir şeyi yeniden numaralamaz. "En üstteki beşini yap" cümlesinin hiçbir şeyi kontrol etmeden söylenebilmesinin sebebi tam olarak bu ayrımdır. Alanlar dosyanın kendi `## P — Projeler` başlıklarından gelir; yani **bölümler sözlüktür**: ne var, gruplanmış, her alan kendi kod sırasında (🧹 *Tidy file order* sapma olduğunda bunu geri getirir). Bir satırın nerede durduğu öncelik hakkında hiçbir şey söylemez.

**Not almak bedava.** Bir kalem kodsuz, önceliksiz ve boyutsuz, düz tek satır olabilir; `📥` gelen kutusuna düşer ve sonradan bağlamı olan kişi (ya da tarama yapan bir ajan) tarafından sınıflandırılır. `Agent Farm: Add to Backlog` (**Ctrl+Alt+B**) VS Code'un her yerinden bir düşünceyi alır ve tek bir ek soru sormaz; çünkü "hangi alan?" diye soran bir kutu bir formdur ve formu beklemek zorunda kalan düşünce hiç yazılmaz.

**‼️ `projects.backlog.next`, "en üstteki beşini yap"ın motorudur.** Bitmemiş bir `⛔`'yi bekleyen her şey geri tutulur *ve bildirilir*. "En üstteki beş" kullanıcının kuyruğundaki ilk beş kalemdir; gizli bir efor tavanı yoktur, dolayısıyla L/XL kalem kullanıcının verdiği sırayı korur. İstek bunun yerine belirli bir boyuta sığan işlerse çağıran taraf `maxEffort` değerini açıkça verir; boyutlanmamış kalem, boyutu bilinmediği için elenmez. `score` (öncelik ÷ efor) dayatma değil, bir görünüm olarak sunulur.

**‼️ TEK BİR SIRA VAR VE HER ŞEYİ O TUTAR.** Alanlar birer başlıktır, dolayısıyla **satır sırası bölmeli bir sıradır**: her `K` kalemi her `S` kaleminden önce gelir, hep de öyle kalır — çünkü bir satır, kalemi yeniden dosyalamadan başlık sınırını geçemez. "Sırada X-5 olsun" demek bu yüzden eksik bir düğme değil, eksik bir *sıra* idi. Artık sıra **dosyanın başındaki `## 🎯 Queue` bloğunda** yaşar: tek bir liste, bütün açık kalemler, iskambil gibi karışık, alanlar istendiği gibi iç içe.

Önce bir yarım çözüm denendi ve adının konması gerekiyor, çünkü bu problem tam olarak o şekle davetiye çıkarıyor: **sabitlenmiş bir baş** — ilk birkaçını sıralayıp gerisini dosyaya bırakan bir liste. Bu, tek bir sıra gibi davranan iki sıradır: bir şeyi 8. sıraya taşımak, üstündeki yediyi de yan etki olarak listeye sürüklemek zorunda kalır ve hiç dokunmadığınız bir kalem kendiliğinden pin kazanır. **Artık blok sıranın tamamıdır** ve bir kalemi taşımak tam olarak bir kalemi taşır.

- **Satırda:** eskiden sürükleme tutamağının olduğu yerdeki sayı, kalemin kuyruktaki **yeridir**. **▲/▼ bir sıra oynatır; imleci üzerinde bekletince açılan menü 2, 3, 4, 5, 10, 15, 20 ya da bütün listenin en tepesi / en dibi seçeneklerini sunar.** O sayıdan tutup sürüklemek de aynı işi yapar, **Next up**'ta bir çipi sürüklemek de.
- **Ne yazılır:** yalnızca blok, her zaman. Kalem satırlarının tek baytı değişmez; kalem kodunu, satırını, girintisini ve alanını korur. Bloğu Obsidian'da elle yeniden dizmek aynı düzenlemedir; kuyruğu boşalttığınız dosya, baştaki dosyanın byte-byte aynısıdır.
- **İçinde ne var:** kodlu, açık kalemler. Kapanmış kalem beklemiyordur, kodsuz bir yakalamanın da dosya düzenlendiğinde ayakta kalan bir tutamağı yoktur — bu yüzden 🗂 (dosyalama) aynı zamanda kuyruğa sokan şeydir. Bloğun henüz yerleştirmediği bir kod en arkaya girer; ilk yazma işlemi listenin tamamını maddeleştirir.
- **Sessizce yapmayacağı şey:** kalemi kapanmış ya da silinmiş bir girdi **bildirilir**, süpürülmez. Liste kullanıcınındır.

Sıra da kalemler de aynı belgede durduğu için, `Backlog.md`'yi eklenti çalışmıyorken okuyan biri ajana verilen kuyruğun aynısını görür.

**Ve tepesi brief'te gelir.** Her proje oturumu `## Next in backlog` bölümüyle açılır; "ilk üçünü yap" demek için yapıştırma da arama da gerekmez. Buradaki her şey ancak o bölüm sayesinde işe yarar.

**Backlog sekmesinde satırın kendisi editördür.** Kutu kalemi kapatır; öncelik, boyut ve iş türü ise küçük bir menü açar ve mevcut değer işaretli gelir — bunlar eskiden her basışta bir adım dönüyordu, yani altı ya da dokuz değerli bir eksende ekranda zaten duran bir değere ulaşmak sekiz basış ve **dosyaya sekiz yazma** demekti. 🗂, kodsuz bir yakalamayı *dosyalanacak satırın üzerinde* hangi alan diye sorarak dosyalar. Eylemler iki yüz satırı düğme duvarına çevirmemek için üzerine gelince belirir ve sabit genişlikte **iki satıra** yerleşir — tek satır olduklarında küme ait olduğu kalemden daha genişti, yani satırın var oluş sebebi olan metne kalanla yetiniliyordu. **Yakalama kutusu yazdığınızı korur**: filtre, host'tan gelen veri, yan sekmeye geçip dönmek — hiçbiri sözlerinizi almaz; kutu ancak host eklemeyi onayladığında boşalır. Konsolun konuşma kutusundaki dört metin aracı (yapıştır · kopyala · kes · temizle) aynı bileşenden burada da vardır. Her filtre ekseni bir LİSTEDİR ve sayfa tarafındadır; bir çip gidiş-dönüş değil, bir yeniden çizimdir — ayrıca her filtre satırı, geneline ek olarak kendi temizlemesini taşır. Beş açılır eksen — **state · filing · blocked · plan · due** — eklentinin kendi çoklu-seçim denetimidir (`media/afFilters.js`); Search, Queue, Notices ve oturum tablosu neyi kullanıyorsa aynısı. Böylece "done VE cancelled" söylenebilir hâle gelir, state yanına "show closed" kutusu iliştirilmiş tek bir seçim olmaktan çıkıp gerçek bir liste olur, ve 📥 *unfiled* kendi ekseni olur — çünkü kodu olmamak bir durum değildir. Sıralama tek seçim kalır, çünkü bir sıralama gerçekten tek seçimdir.
**‼️ Zaman Temelli Sıralamalar (3.174.0 — X-48):** Sıralama kutusunda zamanı cevaplayan üç seçenek yan yana durur:
- **`opened` (🌱 en son yazılan önce):** İz defterinin o kod hakkında kaydettiği ilk tarih damgası.
- **`last touched` (✎ en son çalışılan önce):** O kod üzerindeki en güncel işlem / dokunuş tarihi.
- **`closed` (✅ en son biten önce):** Kapanış anı (iz defterinden saniyesiyle, yoksa `✅` etiketinden).
Tarihler satır üzerinde 🌱 ve ✎ işaretleriyle çizilir, hover'ında her iki zaman birden görünür. Köprüde `projects.backlog { sort: "opened" | "touched" | "closed" }`.
**‼️ Track Sekmesinden Koda Tıklama (3.169.0 — U-71):** Track görünümünde bir backlog koduna sol tıkla basmak, doğrudan **Backlog sekmesine geçer** ve arama kutusunu o koda daraltarak satırı karşına getirir; ↗ düğmesi ise dosyayı açar.
**‼️ İş Kuyruğunda Motor, Model ve Efor Yönlendirmesi (3.180.0 — X-49):** Kuyruk yakalama formunda `target` (ajan/depo) yanında üç yeni eksen yer alır: `— engine —` · `— model —` · `— effort —`. Boş bırakılan eksen "fark etmez" demektir ve hiçbir varsayılan dayatılmaz; görev istemi bu alanları okuyarak yalnızca kendine ayrılmış işleri seçebilir. **Uzun bir kalem hover'da bütün hâlde açılır:** kutu satır kadar geniştir, **kaydırılır**, ve imleç içine girebilir; böylece `more` üzerinde beklemek bin kelimelik bir kalemi hiçbir şey açmadan okutur. **Ve sekme kendini sayaçların yanındaki bir `?` üzerinden anlatır**; panel sayfanın üzerinde açılır, sonraki tıklamada ya da Esc ile kapanır. Eskiden bu, son satırın altında duran, hiç kimsenin bakmadığı yerde sürekli açık duran on satırlık gri bir metindi. Kutuyu kapatmak dosyanın **tam olarak bir karakterini** değiştirir ve ✅ tarihi uydurmaz — plandaki sözün aynısı. Yinelenen bir kod **satırda işaretlenir, asla düzeltilmez**; birinin belgesini bizim ona dair fikrimize uydurmak, bu modülün yapmaması gereken şeyin ta kendisidir. **‼️ Bir kalem başka bir kalemin PARÇASI olabilir, ve bağ bir ALANDIR — girinti değil, kod biçimi değil, konum değil:** çocuğun kendi satırındaki `[parent:: P-4]`. Kod düz kalır (parça kendi alanının bir sonraki numarasını alır, yani bir `U` kaleminin bir `P` epic'inin parçası olması istisna değil olağan hâldir); hiçbir satır kımıldamaz (düzenleme yine koda göre sıralar, arşivleme yine tek kapalı satırı taşır, dosyadaki girinti yine hiçbir şey ifade etmez); ve **kuyruk bunu bilmez** — parça ile bütün ayrı ayrı kuyruktadır, hangisi önce çalışılırsa çalışılır, hiçbiri kapsayıcı değildir ve hiçbiri diğerini sürüklemez. İlişki satırda bir **işaret** olarak çizilir (`↳ P-4` bütüne gider, `⊂ 3` yalnız o aileyi gösterir); ağacın çizildiği tek yer **family** sıralamasıdır, o da bir bakma biçimidir. Bu ⛔ **değildir**: parça bütününü beklemez. Bir bütünü kapatmak parçalarını kapatmaz — hangilerinin açık kaldığını söyler. Olmayan bir kodu, kendini ya da kendi altındakilerden birini gösteren bir bağ girişte reddedilir; dosyada zaten varsa **bildirilir, asla düzeltilmez**. Noktalı eski bir kod (`U-14.3`) hâlâ okunur, çünkü bir kod kalıcıdır; ama kimseyi kimsenin altına asmaz ve yenisi asla öyle dağıtılmaz. Arşivleme, kapanmış kalemleri *aynı dosyanın* sonundaki bir başlığın altına taşır — bilerek: bir kod asla ikinci kez verilmemeli ve bunun en ucuz garantisi, projenin kullandığı her kodun üretecin okuduğu dosyada durmasıdır.

**Parça olmak her sıralamada satırın üzerinde çizilir.** Girinti yalnız **family** görünümünde vardır; diğer her yerde ilişki satırın en sağındaki bir rozetten ibaretti, oysa bir kod sütununu okurken göz orada değildir. Bu yüzden artık **kodun kendisi** söyler: *italik*, ve sol kenarında `⊂` rozetinin kullandığı yeşilin aynısıyla ince bir çizgi. Bütünü Obsidian'da silinmiş bir bağ aynı biçimi uyarı renginde alır — nedenini satırdaki `⚠` taşır. Satırda başka hiçbir şey değişmez; metni soluklaştırmak "bu daha az önemli" derdi, oysa bir şeyin parçası olmak bunun tam tersidir.

**Bir kalemin neyin parçası olduğunu seçmek artık yazılan bir kutudur.** Yakalama şeridindeki *— part of —* siz yazdıkça bütün canlı kalemleri süzer, **koda ya da kelimelere** göre, eklentinin kendi arama diliyle (iki kelime = ikisi de · `OR` · `"öbek"` · `joker*`); `↑ ↓` gezer, `Enter` yanan satırı alır, bir satırın üzerinde beklemek kalemin tamamını yanında açar. Satırın kendi `↳` seçicisi ise **satır genişliğinde** açılır; böylece elli kalemlik bir liste her satırın hangi kalem olduğunu kırk altı karakterle değil doğru düzgün söyler. İkisi de yerleşik bir `<select>`'ti, o da yalnız bir seçeneğin ilk harflerine atlayabilir — yani bu denetimin var oluş sebebi olan soru, *"bu, açık kalemlerimden hangisinin parçası"*, ancak zaten bildiğiniz bir kodla sorulabiliyordu.

**⚭ Gather families** — 🧹 *Tidy file order*'ın yanında durur ve ikilik bilinçlidir: **bu **KUYRUĞU** yeniden dizer ve hiçbir satırı kımıldatmaz; öteki **DOSYAYI** yeniden dizer ve hiçbir kuyruk kaydını kımıldatmaz.** Gather her parçayı bütününün altına çeker; böylece bir aile iki yüz kayda dağılmak yerine tek bir küme olarak okunur. **Bütünler kendi aralarındaki sırayı korur** — bir ailenin nerede durduğu, bütün hakkında verdiğiniz bir karardır — parçalar ona gelir ve aralarında zaten sahip oldukları sırayı, derinlik önce, korur. Bütününün *önünde* kuyrukta duran bir parça aşağı, onun altına iner; zaten en çok bunun için basılır. Tek bir aile için aynı iş satırın kendi **sağ tık** menüsündedir (*Gather its parts under it* — yalnız parçası olan satırda çizilir), ve köprüdeki karşılığı `projects.backlog.gather`'dır.

`⊂` aile görünümünde sürüklemek bilinçlidir ve **aynı hareketin elle yapılan hâlidir**: bırakma daima BÜTÜN kuyruğa göre iner, yani bir parçayı bütününün alt yarısına bırakmak onu — aralarında kaç gizli kayıt olursa olsun — doğrudan arkasına koyar. Dolayısıyla gerçek bir taşıma olup ekranda hiçbir şey olmamış gibi görünebilir; liste daraltılmışken tutamağın hover'ı bunu söyler.

**‼️ Satır, satıra açılan bir kapıdır; sayfa da o kapıdan geri döndüğünüzde peşinizden gelir.** Bir kalemin **koduna** (ya da ↗'ye) basmak belgeyi **o kalemin satırında** açar; hangi editörde açacağını Ayarlar → *Open documents with* söyler: VS Code ve önizleme kipi imleci oraya koyar, Obsidian satıra Advanced URI eklentisiyle atlar — kasa, `.obsidian` klasörü artı Obsidian'ın kendi kayıt defterinden çözülür, çünkü aynı anda iki kasa açıkken kasası adlandırılmamış bir URI yaklaşık yarı yarıya yanlış dosyayı açar — özel bir uygulama da şablonu istiyorsa `{line}` alır. Satır, sayfanın en son çizdiğinden değil, **tıklandığı andaki koddan** çözülür; böylece dosya başka yerde düzenlenmişken açık kalmış bir panel bile doğru kaleme iner. Panele geri dönmek belgeleri yeniden okur; yoksa eski metni göstermeye devam eden bir sayfa gidiş dönüşü anlamsız kılardı. **Next up** ise o kuyruğun sürüklenebilir hâlidir: başlanabilir on dört kalem, `.next`'in varsayılan beşinin nerede bittiğini gösteren işaretle; **her birinin metni hover'da bütün hâlde** — satırdaki `more` ile aynı zengin panel, çünkü bir kod üç harftir ve onu tanınır kılan tek şey arkasındaki kalemdir; tıklayınca satırına atlar (onu gizleyen filtreyi düşürür ve bunu söyler), ve **sürüklemek tam olarak bir kaydı** bırakıldığı yere taşır, hangi alandan olursa olsun. **Bu sayfada kalemin bir özelliği değil de bir sıralaması olan tek şey konumdur; o yüzden renklendirilen tek şey de odur:** varsayılanın içinde sayı dolu yeşil bir disktir, şeridin geri kalanında aynı renk yarı yanar, ve **aşağıdaki satır aynı sayıyı aynı yeşille taşır** — tek renk, iki kademe, iki yerde birden; çünkü o sayı aynı sayıdır. Şeridin ötesinde hiç renk yoktur: o kalemler sıra beklemiyordur, sadece dosyada da vardır. Kartın başlığı yalnızca değişen iki şeyi söyler (kaç kalem kuyrukta, ajan kaç tanesini alır); değişmeyen açıklama hover'ındadır.

**‼️ İçinde parçalar olan bir yığının iki dürüst boyu vardır ve sayaç şeridi hangisini gösterdiğini söyler (3.113.0).** `10 open · 110 done`, bir kalem bir başkasının parçası olabilmeden önce yazılmıştı; bu yüzden bir bütünü ve dört parçasını *yapılacak beş şey* diye sayıyor. Bu, "kaç satır açık" sorusunun doğru cevabı, "ne kadar iş kaldı" sorusunun yanlış cevabıdır — ve ekranda hangi soruyu cevapladığını söyleyen hiçbir şey yoktu. **Kontrol, rakamların kendisidir**: üzerine basınca parçalar sayımdan düşer (`⊟ wholes`), tekrar basınca geri gelir (`⊞ every`), ve seçim hatırlanır. **‼️ Eksiltilmiş okuma artık eksiltilmiş görünüyor (3.140.0).** İki ince çizgi karakteri tek başına kimsenin fark ettiği bir durum değildi; bu yüzden *wholes only* artık glif'in yanında kendi adını yazıyor, **kaç satırı dışarıda bıraktığını** söylüyor (`−8`) ve kesik çizgili bir vurgu çerçevesi taşıyor — düz okuma ise her zamanki tipografisini koruyor, çünkü ikisini birden vurgulamak sinyal değil rozet olurdu. **Alan rozetleri de aynı kuralla** hesaplanır, böylece alt alta iki satır asla birbiriyle çelişemez; hover ise **iki okumayı birden** taşır — yani soru hiçbir şeye basmadan da cevaplanabilir. Hiçbir kalemin `[parent:: …]` olmadığı bir dosyada düğme hiç çizilmez: aynı iki sayı arasında gidip gelen bir düğme, hiçbir şey yapmayan bir düğmedir. **family** ekseni de okumanın gerçekten ihtiyaç duyduğu satırı kazandı — **wholes only — nobody's part** — çünkü "bana bütünleri göster, parçaları değil" demek iki tik gerektiriyordu (*has parts* artı *stands on its own*) ve adı olmayan bir alt küme kimsenin bulamadığı bir alt kümedir.

**‼️ Satırı kimin yazdığı satırda yazar — öneri ile karar birbirine karışmasın diye.** Bir backlog'a üç ayrı yoldan kalem girer ve bunlardan yalnız biri, sahibinin verdiği karardır. `projects.backlog.add` yazdığı her satırı damgalar: ajan çalışırken kendisi fark edip yazdıysa **`#byAI`** (bu bir ÖNERİ — kimse ona evet demedi), kullanıcı söylediği için yazdıysa **`#byREQ`** (`origin:"user"`). Varsayılan `byAI`'tir, çünkü unutulduğunda yapılacak hata *az sahiplenen* yönde olmalıdır: ajanın fikrini kullanıcının kararı gibi kaydetmek sessiz ve kalıcı bir yanlıştır. Kullanıcının yakalama kutusundan ya da Obsidian'dan kendi yazdığı satır **hiçbirini taşımaz** — yokluk üçüncü hâldir. İkisi de **sıradan `#tag`**: filtrede diğerleri gibi süzülür, Obsidian'da elle eklenip silinir, ayrı bir alan istemez; sayfa yalnızca hover'ında ne anlama geldiğini söyler ve iş türü renklerini onlara vermez.

**Köprü:** `projects.backlog` · `.next` · `.add` · `.check` · `.set` · `.code` · `.move` (`dir` + `by`, ya da mutlak yer için `to`) · `.reorder` (başka bir kodun önüne/arkasına) · `.queue` (sıranın tamamını okur ya da değiştirir) · `.gather` (her parçayı bütününün altına çeker; `code` verilirse yalnız o aile — kuyruğu yazar, dosyayı değil) · `.tidy` (önce yanlış başlığın altına düşmüş kalemi kendi bölümüne taşır — sayfa bunu gizler, çünkü satırları KODA göre gruplar ve dosyada nerede olursa olsun doğru yerde çizer — sonra bölümleri kod sırasına koyar; taşınanları `reseated` ile adlarıyla söyler) · `.open` (belgeyi tek bir kalemin satırında, kullanıcının seçtiği editörde açar) · `.archive` · `.promote` (bir iş kuyruğu kalemi backlog kalemine dönüşür — akış stoğa devreder, tek yönlü). Sıralamayla ilgili ilk dört op aynı tek bloğu yazar, asla bir satırı değil.

### Backloglog — bir kalem hangi oturumun hangi turunda çözüldü (3.68.0)

Kod kalıcıydı, transkriptler diskteydi, ama aralarında **bağ yoktu**: `K-8` kodundan yola çıkıp o işin konuşulduğu turlara gitmenin bir yolu yoktu, dolayısıyla yüzlerce oturum aranamayan bir yığın olarak duruyordu. Kazanılan şey kayıt tutmak değil, **eldeki transkriptleri geriye dönük okunabilir bir günlüğe çevirmek**.

**‼️ İki dosya, iki sahip — tasarımın tamamı bu ayrımda.**

- **Defter — `90_Archive/_tracks/backlog-track.jsonl`, makinenin.** Yalnızca ekleme yapılır, satırı asla yerinde düzenlenmez; **olayları** tutar: kod, ne oldu, ne zaman, hangi oturum, hangi tur, kim, ve ne kadar emin. Ekleme-yalnızca temizlik meselesi değildir: aynı saniyede iki pencere ve bir ajan yazabilir ve kayıp güncellemesi olmayan tek yazma budur. Klasör **adıyla değil, iskeletin `holds: "tracks"` beyanıyla** bulunur — arşiv klasörüne başka bir ad veren bir kasa da çalışmaya devam etmeli.
- **Günlük — `Backloglog.md`, `Backlog.md`'nin yanında, paylaşımlı.** Agent Farm her kalemin **veri satırını** ve **oturum satırlarını** defterden yeniden kurar. Kalemin bloğundaki başka *her satır* — kapanış notu, sonraki bir okuyucuya uyarı, elle yapılmış bir düzeltme — **geri okunur ve aynen yazılır**. Yani olguların sahibi makine, metnin sahibi insandır ve hiçbiri diğerinin üzerine sessizce yazamaz. Yerleştirilemeyen bir blok (backlog'da artık olmayan bir kod) silinmez; *"Not in the backlog"* başlığı altında olduğu gibi taşınır.

**Satır kodu yazar, karşısına veriyi.** Kalemin metni buraya kopyalanmaz — o `Backlog.md`'de durur, orada yeniden yazılır, ve buradaki bir kopyası doğru tutulması gereken ikinci bir sürüm olurdu. Bu dosya "K-8 neydi" sorusunu değil, **"K-8'e ne oldu"** sorusunu cevaplar.

```markdown
- **K-8** [status:: done] [sessions:: 2] [turns:: 5] [closed:: 9c4d1f2a#3]
    - `3f2a1b2c` #11–14 · 2026-08-04 14:02 · developer · doing
    - `9c4d1f2a` #3 · 2026-08-05 09:20 · developer · **done**
    > Karşılaştırmanın iki tarafını da küçük harfe çevirerek kapandı. Aynı
    > karşılaştırma hafıza grafiğinde de var ve ORAYA DOKUNULMADI.
```

**‼️ `touch` olayı, bu defterin asıl değerini taşıyan şeydir.** Bir kalem üzerindeki işin çoğu onun kapandığı an değildir: "baktım, kök nedeni bulamadım" diyen üç oturum, üç ay sonra insanın ihtiyaç duyduğu geçmişin ta kendisidir, ve yalnızca bitişleri kaydeden bir günlük onu çöpe atar. Kapanış bir kere olur; ondan önce kaç oturum ve kaç tur geçtiği satırın kendi tarihidir. Durum bilgisi (`[status:: …]`) **backlog'dan** gelir — kutu neyin bittiğinin, defter ise oraya nasıl gelindiğinin doğrusudur.

**Hangi oturum olduğu çıkarımdır, ve bu açıkça söylenir.** Köprüye bir istek dosyası düşen ajan, tanımı gereği **turun ortasındadır**: oturumu canlıdır ve son olayı saniyeler önce olmuştur. Bu, sıradan her durumda oturumu adlandırmaya yeter. Yetmediğinde tahmin edilmez, bir **kuşku kodu** yazılır: `multi` (aynı ajanın iki canlı oturumu vardı) · `none` (hiçbir şey canlı değildi) · `stale` (tek aday çoktandır sessizdi) · `turn` (oturum kesin, tur numarası değil) · `guess` (sonradan yeniden kuruldu, izlenmedi). Yanlış bir oturum kimliği doğru olanla birebir aynı görünür; sessiz tahmin, eksik bilgiden kötüdür.

**Obsidian'da elle işaretlemek hiçbir olay üretmez — bu deliğin kapatılamayacağı kabul edildi, ama sessiz bırakılmadı.** Dosyaya her bakışta defterin ima ettiği durumla satırın gösterdiği durum karşılaştırılır; ayrışıyorlarsa `outside` olayı yazılır. Turu bilinemez ve uydurulmaz; kazanılan şey, günlükte **sessiz boşluk kalmamasıdır**. Satırdaki `✅` tarihi varsa o kullanılır, yoksa "fark edildiği an" olarak işaretlenir.

**Geriye dönük doldurma bir ipucuna dayanır ya da hiç yapılmaz.** `projects.tracks.backfill` transkriptlerde **kodun kendisini** arar: bir satır ancak kod o turda *gerçekten yazılmışsa* önerilir, iki tarihin birbirine yakın olmasından çıkarılmaz. Kimsenin hiç anmadığı bir kalem günlükte görünür biçimde boş kalır — dürüst cevap odur, ve eksiği de o gösterir. Yalnızca **diyalog** taranır, araç çıktısı değil: backlog dosyasını okumuş bir tur içindeki her kodu anar ve hiçbir şey kanıtlamaz. Her satır `by: backfill` + `uncertain: guess` damgası taşır, yani izlenerek kaydedilenden her zaman ayırt edilebilir; ve komut `apply` verilmedikçe yalnızca **önizleme** üretir.

**Kapanış izi dosyada da kalır.** Kapanan kalemin backlog satırına `[closed:: 9c4d1f2a#3]` yazılır — geçmişin tamamı değil, yalnızca son nokta, satırı şişirmeyen tek bilgi. Sebep dayanıklılık: Agent Farm çalışmıyorken dosyaya Obsidian'la bakan biri de "bu iş nerede bitti" sorusunun cevabını görsün. Damga, kutuyu değiştiren **tek karakterlik** yazmayı bozmamak için satırı yeniden kurmayan ayrı bir yazmayla konur.

**Track sekmesi: tek defter, dört soru.** Başka hiçbir yerin yapamadığı şey o birleştirme — **oturum/tur referansı o oturumun diyaloğuna açılan kapıdır**. Track'in işi tek bir rastgele olayı seçmek değil, kalemin nasıl ele alındığını okutmak olduğu için bu kapıların hepsi, daha önce açık olan bir görüntüleyiciyi bile **Dialog · bütün turlar kapalı · Single-open · sayfa başı** durumuna sıfırlar; seçili tur bırakmaz. Etrafında artık tek bir daraltmayı paylaşan dört görünüm var; bir görünümde kurduğunuz süzgeç diğerinde de geçerlidir:

- **⬢ Items** — kod başına bir kart: hangi oturumlarda ve hangi turlarda çalışıldığı, eskiden yeniye, altında birinin yazdığı kapanış notu. *Bu daha önce nasıl çözülmüştü?* Kart ayrıca yalnızca iki dosya birlikte açıkken var olan figürü taşır: backlog'un verdiği boyut, gerçekte harcanan tur sayısı ve **o boyutun bu projedeki medyanı** (medyanı anmaya değecek kadar boyutlanmış kalem varsa).
- **≡ Timeline** — hangi kodla ilgili olursa olsun her kayıtlı an, yeniden eskiye. *Burada son zamanlarda ne oldu?* — klasörün değil, **backlog'un** tarihi.
- **⌸ Sessions** — oturum başına bir kart: hangi kodlara dokunmuş, onlara ne yapmış ve oturumun kendi turlarının kaçı backlog'a gitmiş. *O koşu gerçekte neyi bitirdi?*
- **⚕ Gaps** — kaydın **bilmediği** şeyler: hiç geçmişi olmayan kodlar (kapsama oranıyla birlikte), gerekçesine göre ayrılmış "elden geldiğince" atıflar, izlenmek yerine geriye dönük kurulmuş satırlar ve işaret edecek oturumu olmayan kapanışlar. Bir kayıt, delikleri görünür olduğu kadar değerlidir.

**Süzme iki eksende yürür** ve ikisi bilerek farklı şeyler sorar: *kalem* (kod · metin · kapanış notu · geçmişindeki her ajan ve oturum kimliği · her olay notu üzerinde arama; alan chip'leri; durum) ve *kayıt* (olay türü, kaydın nereden geldiği, atıfın neden şüpheli olduğu, tarih aralığı ve üç anahtar — yalnız şüpheliler · yalnız kapanış notu olanlar · geriye dönük kurulanları gizle). Bir satır ancak kalem testini geçer **ve geriye bir kaydı kalırsa** çizilir; gövdesi boş bir kart hiç görünmez. Sıralama: son çalışılan (varsayılan) · ilk çalışılan · harcanan tur · oturum · süre · kapanış · kod · durum · alan.

**Üç eylem, ikisi iki kez sorar.** **✎ Record** deftere elle bir olay yazar — `panel` damgalı, yani gerçek ama hiçbir oturuma ait değil; çünkü bir tıklama hiçbir konuşmanın içinde geçmez. **⚕ Reconstruct** geriye dönük doldurmayı **önce önizleme** olarak koşar: yazacağı satırları tek tek gösterir, ikinci basış da yeniden hesaplamadan *tam o satırları* yazar. **↻ Rebuild the log** `Backloglog.md`'yi defterden yeniden kurar, sizin yazdığınız her satırı koruyarak. Satıra sağ tıklayınca aynı şeyler artı *yalnız bu kalemi göster*, *Backlog sekmesinde göster* ve kopyalar (kod · kapanış damgası · her oturum kimliği · geçmişin tamamı metin olarak).

Sekme kalemi **bilerek düzenleyemez** — öncelik yok, boyut yok, kuyruk yok. O iş Backlog sekmesinin; aynı alanı iki yüzeyin iki türlü yazması bu sistemin bedelini bir kez ödediği hatadır.

**Köprü:** `projects.track` (bu turda bu kalemle uğraştım — `touch` dâhil) · `projects.tracks` ("bu daha önce nasıl çözülmüştü": oturumlar, turlar, kapanış) · `projects.tracks.backfill` (kanıta dayalı geriye dönük doldurma, varsayılan olarak önizleme) · `projects.backloglog` (belgeyi defterden yeniden kur) · `projects.backlog.check` aynı kaydı *kendisi* düşer ve `note` ile kapanış notunu alır.

### Agent Portfolio — filo tek ekranda

Global nav'daki **Agents** sekmesi (`Open Agent Portfolio`). Ajan başına tek satır, projeye göre gruplu, **her kolondan sıralanabilir**: şu an ne yapıyor · **kaç gündür sessiz** (14 günü aşınca 💤) · 7g ve 30g oturum/maliyet/token · yazdığı dosya sayısı · nöbetler (⏳ bekleyen iş var, ⏸ duraklatılmış) · açık bulgular (hata/uyarı) · hafıza dosyası · sabit bağlam yükü. Projeye göre süz, uykudakileri gizle; satırdan **▶ oturum başlat · ◧ projeye ata · 📁 klasörü aç**. "Hangisi ölü?" sorusunun cevabı artık bir kolon.

### Ajan koda ne yaptı

Her oturumun transkripti `Edit` / `Write` / `MultiEdit` / `NotebookEdit` çağrılarını **kendi öncesi-sonrası metniyle** zaten taşıyordu; hiçbir yerde gösterilmiyordu. Oturum Görüntüleyicideki **Files changed** kutusu bunu gösterir: her dosya, yazma sayısı, ±satır, hangi turların dokunduğu — ve dosyayı açınca **oturumun kendi hunk'ları**, kırmızı üstte yeşil altta.

- **Kutu kapalı gelir ve sen ne yaptıysan öyle kalır (3.30.2).** Açıp kapatma tercihi kalıcıdır: canlı bir oturumda saniyede bir gelen yeniden çizimler, ayar değişince sayfanın baştan üretilmesi ya da pencerenin yeniden yüklenmesi onu bir daha açmaz. Kutu yalnızca **gerçekten dosya yazmış** oturumlarda görünür — her sayfada çıkmamasının sebebi budur.

- Bu, **o oturumun değiştirdiği şeydir** — dosyanın bugünkü hâli değil. Sonraki bir oturumun işi asla bunun gibi görünmez.
- **vs HEAD** düğmesi yanında durur ve *başka* soruyu sorar: "şu an bu dosyada commit edilmemiş ne var" — VS Code'un kendi diff görünümünde açılır, git deposu yoksa dürüstçe söyler.
- Hata dönen bir çağrı **failed — not applied** diye işaretlenir ve hiçbir sayıya girmez.
- Sessions tablolarında **Files** kolonu: indeksin zaten yaptığı tek geçişte sayıldığı için ek maliyeti yok.
- **Köprü:** `sessions.files` (`detail:true` hunk'ları da döner).

### Backlog — Görev Havuzu, Arşiv Ayrımı ve Filtreleme (3.288.0 — U-106, U-107) {#projeler-backlog}

*(3.288.0 — U-106 / U-107)* Proje klasöründeki `Backlog.md` dosyasını (`af-role: backlog`) okuyan, sıralayan ve yöneten arayüz.

- **Tamamlanmış (`done`) ile Arşivlenmiş (`archived`) Ayrımı (U-106):** Dosyada `## 🗄 Archive` başlığı altına taşınan eski tarihsel işler ile bu hafta tamamlanan işler eskiden aynı gri çizili şekilde çiziliyordu. Artık arşivlenmiş her satırın kodunun yanında **çerçeveli küçük bir 🗄 rozeti** belirir ve satırın tarihsel olduğunu, kodunun bir daha yeniden verilemeyeceğini söyler.
- **3 Durumlu Arşiv Filtreleme Çipi (U-107):** Filtre şeridindeki `🗄 archive N` çipi tek tuşla 3 modu dolaşır:
  1. *Listede göster* (arşivlenmişler açık işlerin altında yer alır),
  2. *Gizle* (arşiv tamamen gizlenir, sadece güncel işler kalır),
  3. *Yalnızca arşivi göster* (tarihsel kayıt aramaları için sadece arşiv gösterilir).
  Dosyada arşiv başlığı yoksa bu çip çizilmez.
- **Sıralamalar ve Zaman Eksenleri (X-48, 3.174.0):** `Queue order` (dosyadaki doğal sıra), `family` (ana-alt iş hiyerarşisi), `opened` (açılış zamanı), `last touched` (son çalışma zamanı — `backlog-track.jsonl` defterinden okunur) ve `closed` (kapanış zamanı).

### Obsidian Tasks Metadata Sözdizimi Koruması

Backlog satırlarında yer alan Obsidian Tasks formatındaki özel ikonlar (`📅`, `⏳`, `🛫`, `➕`, `✅`, `❌`, `🆔`, `⛔`, `🏁`) ayrıştırılırken, kullanıcının el yazısı başlık ve açıklamalarının bozulmasını önleyen katı sözdizimi ayrıştırma disiplinidir (`src/core/projectBacklog.ts`).

- **Gerekçe:** Eski ayrıştırma mantığı, metadatalı bir ikondan sonra gelen herhangi bir boşluksuz kelimeyi o ikonun değeri kabul edip siliyordu. Bu durum, başlığında `'⏳ Yanıt bekleniyor'` geçen bir kalemin `' bekleniyor'` haline gelmesine ya da yalın `⛔` blokaj işaretinin arkasındaki `"⛔ kullanıcı karar verecek"` ifadesinin ilk kelimesini yutarak `"karar verecek"` şeklinde kırpılmasına yol açıyordu.
- **Katı Biçim Denetimi:** Her ikon artık yalnızca kendi veri türüyle tam eşleştiğinde tüketilir:
  - `📅`, `⏳`, `🛫`, `➕`, `✅`, `❌`: Yalnızca arkasından gelen geçerli bir `YYYY-MM-DD` tarih deseniyle birlikte temizlenir. Tarih taşımayan yalın ikonlar kullanıcının kendi metni sayılır ve cümleden asla silinmez.
  - `🆔`: Yalnızca geçerli kimlik deseniyle (`[A-Za-z0-9_-]+`) birlikte tüketilir.
  - `⛔`: Yalnızca virgülle ayrılmış blokaj kod listesiyle birlikte tüketilir; yalın `⛔` ikonu satır içi tutma (`HOLD`) bayrağı olarak okunur ve arkasındaki kelimelere dokunulmaz.
  - `🏁`: Yalnızca `delete|keep` değerleriyle birlikte tüketilir.
- **Anayasa İlkesi:** Agent Constitution Madde 6 ve İlke 2 ("Kullanıcının elle belirlediği isimler, ikonlar ve formatlar asla bozulamaz") kod seviyesinde güvenceye alınmıştır.

## Dışarıdan Erişim — Mobil Web Kokpiti ve Sohbet Entegrasyonu {#disaridan-erisim}

*(3.26.0 — 3.649.0)* Agent Farm'ın ilk sürümleri yalnızca tek bir VS Code penceresinin içindeydi: telefondan bakılamıyor, VS Code kapalıyken hiçbir yüzey kalmıyordu (headless servis çiftliği **çalıştırıyor** ama kimseye **göstermiyordu**), ve dışarıdan bir mesaj yazıp cevap almanın yolu yoktu. Geliştirilen iki katmanlı uzaktan erişim mimarisi, çiftliği hem salt okunur mobil web paneli hem de tam teşekküllü iki yönlü sohbet kokpiti ile cebe taşır.

### Salt Okunur Mobil Web Kokpiti (Port 8378) ve Yerel QR Motoru

`agentFarm.web.enabled` ayarı ile etkinleştirilen yerel HTTP sunucusu, doğrudan cep telefonu tarayıcılarına uygun, başparmak ergonomisine göre boyutlandırılmış ve otomatik yenilenen tek bir hafif web uygulaması sunar: **ne seni bekliyor · ne çalışıyor · ajan ve proje başına harcama · son oturumlar · notices panosu**.

- **Snapshot Sözleşmesi (`web-snapshot.json`):** Web arayüzü sunucuya ağır veritabanı sorguları atmaz; eklenti arka planda 20 saniyede bir `web-snapshot.json` durum dökümü yazar ve portu kim tutuyorsa onu servis eder. Bu sayede sayfa VS Code ile **asla çelişmez**.
- **VS Code Kapanışında Headless Devri:** VS Code kapatıldığında portu işletim sistemi arka plan servisi (`agent-farm-headless`) devralır, elindeki son snapshot'ı sunmaya devam eder ve sayfada bunu açıkça belirtir (*"VS Code kapalı — son durum"*). VS Code yeniden açıldığında port çatışmasız geri devredilir.
- **Güvenlik ve Token Mekanizması:** Token zorunludur. Token yoksa sunucu **kesinlikle başlamaz**. Token `?t=` parametresi, `Authorization: Bearer` başlığı veya sayfanın kurduğu çerez ile taşınır.
- **Sıfır Bağımlılıklı Yerli QR Kod Motoru (`src/core/qr.ts`, `src/core/qrTables.ts`):** 
  - Token taşıyan bir URL'nin internetteki harici QR servislerine gönderilmesi kesin bir güvenlik ihlalidir. Agent Farm, hiçbir harici npm bağımlılığı olmadan kendi Galois Field GF(256), Reed-Solomon hata düzeltme (L/M/Q/H) ve BCH maskeleme algoritmasını çalıştırır.
  - Çıktı tamamen saf SVG `<path>` vektörüdür; betik içermez, harici referans taşımaz.
- **‼️ "QR Kod Bir Sözdür" ve `local` Uyarısı:**
  - `webCockpit.ts` bağlantıyı 6 farklı durumda denetler. Sunucu `127.0.0.1` (loopback) üzerinde dinliyorsa, telefon kamerasıyla taranacak bir QR kod telefonda hiçbir zaman açılamaz.
  - Sistem, taranamayacak bir QR kodu sahte bir başarıyla ekrana çizmek yerine **kehribar (amber)** renge geçer; QR alanına *"Sadece bu makineye bağlı — telefonun erişmesi için LAN seçilmelidir"* uyarısını yazar. QR kod ancak `phoneReachable` (LAN adresi açık ve geçerli) olduğunda çizilir.
- **Dashboard Üst Şerit `📱 Web` Butonu:** Dashboard başlığında doğrudan `📱 Web` düğmesi yer alır; tek tıkla LAN/Local bağlama durumunu ve QR kokpitini açar (`webCockpit.ts`).
- **Mobil Pil ve Ağ Koruması (`core/webpage.ts`):** 
  - Sayfa arka planda veya kilitli ekranda kaldığında (`document.hidden`), 15 saniyelik `setInterval` döngüsü anında durdurulur (`poll(false)`). Telefonun telsizi ve pili boş yere harcanmaz.
  - Sayfa tekrar öne geldiğinde tek bir anlık `fetch` yapılır ve periyodik yoklama yeniden başlatılır.
  - `viewport-fit=cover` çentikli telefon ekranları için `env(safe-area-inset-*)` kenar dolguları ile kusursuz hizalanır.
- **Köprü Operasyonları:** `web.status`, `web.stop`, `web.bind`, `web.token.new`.

### Çift Yönlü Sohbet Kokpiti — Telegram Entegrasyonu

Salt okunur web görünümünün ötesinde, telefon üzerinden ajanları yönetmek, onay vermek ve konuşmaları yönlendirmek için tam donanımlı bir Telegram köprüsü kurulmuştur.

**Connect Telegram…** bot token'ını alır, kaydetmeden önce Telegram API'sine doğrulatır ve **sır kasasına (secret vault)** yazar — `settings.json` içine asla düz metin yazılmaz. Dışarıya port açılmaz; çiftlik dışarı doğru güvenli `long-polling` yapar.

#### 1. Sohbetten Oturuma Yönlendirme ve Odak
Bir telefondan gelen mesajın masaüstündeki hangi oturuma ait olduğu otomatik çözümlenir (`agentFarm.telegram.routing`):
- `/focus <session-id>`: Sohbeti belirli bir Console kartına kilitler.
- Odaklanılan oturum `/sessions` listesinde `← focus` işaretiyle gösterilir.
- Ajan tek bir aktif oturuma sahipse mesaj doğrudan oraya akar.

#### 2. Telefona Zengin Tur Kartı Olarak Dönüş (core/telegramDigest.ts)
Ajan bir turu tamamladığında veya durakladığında telefona 4096 karakter sınırına sadık zengin bir kart gönderilir:
- **Ajanın Kendi Sözleri:** LLM ile yeniden özetleme (paraphrase) maliyeti ödenmez (her tur için fazladan API harcaması ve anlam kayması engellenir); modelin turun sonundaki kendi kapanış cümleleri filtrelenerek aktarılır.
- **Durum ve Maliyet:** Ajanın ne beklediği, turda kaç token harcandığı ve oturumun anlık maliyeti.
- **Etkileşimli Butonlar (Inline Keyboard, ≤64 bayt):**
  - **Soru Seçenekleri:** Ajanın sorduğu asenkron sorular kart altında doğrudan tıklanabilir seçenek butonları olarak belirir.
  - **İzin Onayları:** İzin istekleri `Allow` / `Deny` butonlarıyla cepte tek dokunuşla onaylanır veya reddedilir.
  - **Komuta Butonları:** `Continue` (boşta oturumu devam ettir), `Cancel` (çalışan turu durdur/interrupt).
  - **`📄 Diff` Butonu (`workdirChanges.ts`):** Tek dokunuşla ajanın çalışma dizinindeki Git durumunu (`status --short` ve `diff --stat`) telefona döker.

#### 3. Dört Katı Yürütme Kapısı ve Mesaj Kuyruğu (core/telegramExecution.ts)
Telefonda yazılan bir mesaj rastgele içeriye fırlatılmaz; sırasıyla şu dört emniyet kapısından geçer:
1. **Oturum Varlığı Kapısı:** Hedef oturum hala hayatta mı?
2. **Günlük Bütçe Kalkanı:** Mesajın başlatacağı tur, `agentFarm.telegram.maxDailyUSD` (varsayılan $1) tavanını aşıyor mu? Tavan dolmuşsa komut çalıştırılmaz, bütçe uyarısı verilir.
3. **Yıkıcı Komut Şekil Filtresi (`riskyIntent`):** `rm -rf`, `git reset --hard`, `git clean -f`, `git branch -D`, `DROP TABLE`, `del /s`, `format` gibi doğrudan veri kaybı yaratacak kabuk komut kalıpları derhal durdurulur ve kullanıcıdan onay istenir. Düz İngilizce/Türkçe yönergeler serbestçe geçer.
4. **Çalışma Durumu Kapısı:** Ajan o anda çalışıyor mu?
   - `agentFarm.telegram.whenBusy: queue` (varsayılan): Ajan meşgulken yazılan mesajlar kaybolmaz; **kaydedilen sohbet durumunda (`saved chat state`)** sıraya alınır (oturum başına 10 mesaja kadar). VS Code penceresi reload edilse dahi kuyruk korunur. Tur bittiğinde kuyruktaki en eski mesaj otomatik olarak yeni tur olarak başlatılır.
   - `agentFarm.telegram.whenBusy: steer`: Çalışan tura anında canlı yönlendirme olarak enjekte edilir.

#### 4. Telefondan Gerçek Console Oturumu Başlatma — 11. Lansman Kapısı
Eski `/agent <ad> <istem>` komutu salt arka planda tek seferlik headless bir görev çalıştırırken; **`/new <ajan> [istem]`** komutu masaüstünde tam teşekküllü bir **Console Oturumu** açar:
- **11. Başlatma Kapısı:** Eklentinin 11 resmi başlatma kapısından biridir; tüm başlatma paritesini (`_REF/agentfarm-dev.md`) taşır.
- Oturum `/sessions` içinde numaralandırılır, sohbet odağı doğrudan ona kilitlenir ve tur kartları anında telefona akmaya başlar.
- **Tohumlama (Seeding):** Ajanın son kullanıldığı lansmandaki tüm ayarları (model, motor, effort, izin seviyesi, aktif proje) otomatik devralınır (`seedLastLaunch`).
- **Ömür Boyu Bütçelendirme:** Oturumun açıldığı andan kapandığı ana kadar aldığı her tur, telefondan veya pencereden başlatılmış olmasına bakılmaksızın `agentFarm.telegram.maxDailyUSD` tavanına yazılır. Günlük bütçe bitmişse oturum hiç başlatılmaz ve telefona nedeni söylenir.
- Parametresiz `/new` doğrudan o sohbetin bağlı olduğu ajanı açar.

#### 5. Telefon Komut Seti Özeti
- `/new <ajan> [istem]`: Konsolda yeni bir oturum başlatır.
- `/agent <ad>`: Sohbeti varsayılan bir ajana bağlar.
- `/focus <id>`: Sohbet odağını çalışan belirli bir oturuma kilitler.
- `/sessions`: Açık oturumları listeler, hangisinin odakta olduğunu (`← focus`) gösterir.
- `/status`: Çalışan oturumlar, bekleyen sorular, kuyruktaki mesaj sayısı ve günlük bütçe harcaması.
- `/drop`: Çalışan oturumu bozmadan o oturuma ait telefon mesaj kuyruğunu temizler.
- `/agents`: Çiftlikte tanımlı ajanların listesini sunar.
- `/cancel`: Odaktaki çalışan turun yürütmesini derhal keser.
- `/help`: Kılavuzu ve tüm komutları açıklar.

### Sesli giriş neden burada değil

VS Code webview'i mikrofona erişemez (iframe'de `microphone` izni yok ve bunu verecek bir API de yok), dolayısıyla panel içinde bir dikte kutusu **harici bir kaydedici** gerektirirdi — GPU'suz, Docker'sız bir makinede yerel bir bağımlılık, hem de bloğun en düşük öncelikli maddesi için. Doğru yeri **web görünümü**: orası gerçek bir tarayıcı, `getUserMedia` orada zaten çalışıyor. O yüzden sesli giriş, web yüzeyi yazma eylemleri kazandığında oraya eklenecek — yarım yapılmak yerine yol haritasına yazıldı.

## Terminal Render Sağlığı

VS Code'un terminali gerçek bir terminal değildir — Chromium içinde çalışan **xterm.js** emülatörüdür (shell → PTY → xterm.js → Electron → GPU). Katman sayısı yüzünden uzun TUI oturumlarında (claude gibi) render aksaklıkları görülebilir: yazarken varmış gibi görünen hayalet boşluklar, kaybolan/bozulan satırlar, kaydırınca düzelen görüntü. İki çare var, ikisi de tek komutta: **Agent Farm: Terminal Rendering Fix…**

- **Apply render fix (önerilen):** `terminal.integrated.gpuAcceleration: off` + `smoothScrolling: off` — GPU/WebGL yerine DOM renderer. Hayalet boşluk/satır kaybı raporlarının çoğunu bu çözer. Yeni açılan terminallerde geçerli olur.
- **Claude sessions in external terminal:** `agentFarm.externalTerminal` ayarını açar/kapatır. Açıkken **Start Session / Continue Latest / Resume** oturumları VS Code terminali yerine **işletim sistemi terminalinde** açılır (Windows Terminal varsa o, yoksa düz cmd penceresi) — xterm.js tamamen devre dışı, native render. Farm görevleri bilerek entegre terminalde kalır: yaşam döngüleri terminal kapanma olayından izlenir.
- **Disable persistent sessions:** reload sonrası geri yüklenen terminaller de sık bir bozuk-görüntü kaynağıdır; bu seçenek geri yüklemeyi kapatır (bedeli: reload'da terminaller kaybolur).
- **Restore VS Code defaults:** üç ayarı da varsayılana döndürür. Komut açılırken mevcut durumu gösterir (`gpu off · smoothScrolling off · …`).

## Canlı Gözlem

### Canlı Bağlam ve Kota Disiplini Sinyalleri {#baglam-disiplini}

*(3.538.0 — 3.624.0)* Anayasanın ve devir protokolünün (`_REF/handover.md`) en temel ilkesi: Çok adımlı çalışan hiçbir ajan oturumunun context penceresi veya hesap kotası tükenene kadar kontrolsüzce ilerlemesine izin verilmemesidir. Ancak LLM motorları (Claude Code, Antigravity, Codex) çalışırken ne bağlam penceresinin doluluk oranını ne de hesabın kota durumunu kendi gözleriyle görebilir. Bu körlüğü ortadan kaldırmak için Agent Farm, motor seviyesinde bir **canlı izleme ve fısıldama (whisper)** altyapısı kurmuştur.

#### Canlı Kancadan Kulağa Fısıldama Mimarisi (PostToolUse / UserPromptSubmit)

Eklenti, Console host'un canlı olay akışını, diske düşen transkriptin son model çağrısını ve oturum indeksini milisaniyelik hassasiyetle izler. Bir oturum belirlenen disiplin eşiklerinden birini aştığı an:
1. Dinleyici, ajanın çalıştırdığı bir sonraki araç çağrısının (`PostToolUse`) veya kullanıcı girişinin (`UserPromptSubmit`) kanca yanıtına özel bir payload ekler: `{ hookSpecificOutput: { additionalContext: "..." } }`.
2. Motor (Claude Code), bu kanca çıktısını kullanıcının yazdığı bir sohbet mesajı olarak değil, doğrudan çalışma ortamından gelen bir **sistem bağlamı (additional context)** olarak modelin aktif penceresine yerleştirir.
3. Kullanıcı klavyeye dokunmadan, ajan araç kullandığı anda kulağına fısıltı ulaşır.
4. **Tek Seferlik İletim Kuralı:** Her eşik çizgisi için pencere başına yalnızca **bir kez** iletim yapılır (`delivered`). Boşalan bir pencere (compaction sonrası) çizgiyi tekrar geçerse kural baştan silahlanır.
5. **Kancasız Motor Koruması:** Kancası böyle bir ek bağlam kanalı taşımayan motorlarda (ör. Codex) bu geçiş oturum kaydında **`undelivered` (✕)** olarak işaretlenir; okunmayan fısıltılar varmış gibi davranılmaz.

#### Çift Boyutlu Koruma Eşikleri

Sistem iki ayrı duvarı bağımsız olarak denetler:

| Koruma Boyutu | Ölçülen Kaynak | CONVERGE (Toparlan) | HANDOVER (Dur ve Devret) | Fısıldanan Varsayılan Emir |
| :--- | :--- | :--- | :--- | :--- |
| **Model Context Penceresi** | Son model çağrısının token yükü ÷ modelin context pencere tavanı | **≥ %35** | **≥ %40** | `%35`: Yeni alt göreve başlama, elindeki atomik adımı bitir.<br>`%40`: Burada dur, temiz kodları commit'le, devir notunu yaz ve oturumu sonlandır. |
| **Hesabın 5 Saatlik Kotası** | Oturumun `CLAUDE_CONFIG_DIR` ile bağlandığı kendi hesabı (`five_hour`) | *Varsayılan kapalı* (`%0`) | **≥ %90** | `%90`: Hesabın 5 saatlik kullanım penceresi %90'a ulaştı. Temiz işi commit'le, devir notunu yaz (veya batondaysan bayrağı devret) ve çık. |

> **‼️ 5 Saatlik Pencere vs. Haftalık Kota Ayrımı:** 3.624.0 öncesinde kota fısıltısı, haftalık kullanım oranını (`seven_day`) 5 saatlik pencere sanarak kotası %34 olan bir oturuma erkenden durdurma emri verebiliyordu. Bu ayrım kesinleştirildi: Fısıltı daima oturumun çalıştığı hesabın **5 saatlik kullanım penceresini** okur; haftalık kota asla devir tetiği yapılmaz. Ayrıca kota bilgisi asla ev dizininden (`~/.claude`) okunmaz; oturum hangi hesap slotunda açıldıysa o slotun dizinindeki kimlik kullanılır.

#### Alt Şeritte Renkli Sinyal Noktaları (.sigdot) ve Görsel Durumlar

Console alt şeridinde (`c-status`), context ve kota rakamlarının yanında 6 piksellik renkli durum noktaları (`.sigdot`) belirir:

- 🟡 / 🟠 **Sarı / Turuncu Nokta (`.ctxsig`, `#cca700`):** `CONVERGE` eşiği (%35 context) geçildiğinde yanar. Ajanın toparlanma emrini aldığını gösterir.
- 🔴 **Kırmızı Nokta (`.ctxsig.stop` / `.ctxsig.bad`, `#f14c4c`):** `HANDOVER` eşiği (%40 context veya %90 kota) geçildiğinde yanar. Ajana durdurma ve devretme emrinin iletildiğini; veya kanalsız motorda sinyalin iletilemediğini (`undelivered`) gösterir.
- ⚪ / 🔘 **Gri / Nötr Nokta (`.ctxsig.done`):** Ajan devir emrini dinleyip devir notunu yazdığında ve oturumu kapattığında yanar. Alarm durumunun başarıyla kapandığını ifade eder.
- **AFTip Paneli:** Noktanın veya rakamın üzerine gelindiğinde; bağlamın o anki token büyüklüğü, pencere tavanı, doluluk yüzdesi, ölçüm kaynağı ve ajana fısıldanan tam emir metni zengin bir panelde açılır.

#### ↪ Kıvrık Ok — Devirden Tek Tıkla Devam Etme (Continue from Handover)

Normal (bayrak yarışında olmayan) bir oturum devir sınırına ulaşıp kapandığında, alt şeritte **`↪`** butonu belirir:
- **Tüm Lansman Boyutlarının Korunumu:** Tıklandığında ajanın motor, model, efor seviyesi, izin modu, Superpowers bayrağı ve proje bağlamını hafızadan alarak taze bir kompozitör açar.
- **Akıllı İlk Prompt Üretimi:**
  - Eğer oturum canlı kancadan veya transkriptten yakalanan bir devir notu bıraktıysa:  
    `"The session before you (<sid>) reached the context handover line at %41 and was closed... Its handover note is <path> — read it first and continue from where it stops."`
  - Eğer oturum devir notu bırakamadan kapandıysa (Failsafe):  
    `"No handover note has been found for it — read what it did with 'af.js sessions.read id=<sid>' before you start."`
- **Süreç Başlatılmaz, Kutuda Bekler:** Kompozitör prompt hazır şekilde açılır ama süreci kendiliğinden başlatmaz; çünkü kota nedeniyle devir yapmış bir oturumun yeni koşusunda kullanıcının hesap değiştirmek isteyebileceği gözetilir.
- **Devredilen Konuşma Asla Resume Edilmez:** Devir noktasına gelmiş bir oturumu `--resume` ile tekrar canlandırmak yasaktır; çünkü bağlamı dolu bir pencere ilk turda doğrudan duvara toslar.

#### Ayarlanabilir Disiplin Şablonları (DisciplineOrders)

Eşikler ve fısıldanan emirler koda gömülü sabit metinler değildir:
- Ayarlar sayfasında **Handover Discipline** kartından veya `sessions.contextGuard.set` köprü op'undan 8 farklı dalda özelleştirilebilir:
  - `converge` / `handover`: Normal oturumlara giden toparlanma ve devir emirleri.
  - `relayConverge` / `relayHandover`: Baton rölesi koşan oturumlara giden fısıltılar (`baton.pass` yönlendirmesi).
  - `relayPassedConverge` / `relayPassedHandover`: Bayrağı zaten devretmiş ama turun bitmesini bekleyen oturumlara giden emirler.
  - `relayBrakedConverge` / `relayBrakedHandover`: Kullanıcının zincirin son etabı yaptığı (frenlediği, `baton.lastLeg`) etaba giden emirler: bayrak devri yok, devir notu yazılır.
- Metin içindeki `{chain}` şablonu, rölenin kendi zincir ve etap numarasıyla dinamik olarak doldurulur.

#### Köprü Operasyonları

- `sessions.contextGuard` — Tüm oturumların bağlam/kota sinyal kayıtları, eşik ayarları, son okuma yüzdeleri ve canlı kart görünümü dökümü (`args: id?, limit?`).
- `sessions.contextGuard.set` — Canlı eşikleri (`convergePct`, `handoverPct`, `quotaHandoverPct`) ve emir metinlerini (`orders`) ayarlama.
- `console.continueFromHandover` — Belirtilen oturumun devir notundan veya transkriptinden devam kompozitörünü açma (`id, open=true`).

### Sesli Bildirimler, Uyarı Tonları ve Canlı Diyalog Okuyucu (DialogueSpeaker) (3.299.0 — 3.314.0 — A-20 — A-26)

Filonun durumunu ekrana bakmadan kulakla takip edebilmek için modern bir ses ve konuşma altyapısı kurulmuştur:

- **Modern Ses Paleti (A-20):** Windows yerel sesleri yerine 10 farklı ses nesnesi tanımlanmıştır. Hem OneCore köprüsü hem de SAPI / say / spd-say arka uçları desteklenir.
- **Çakışma Önleyici Ses Hakemi (Arbiter - A-22):** Sekiz ajanın aynı anda bitmesi durumunda kulak tırmalayan tek bir gürültü yerine sesler sırayla, aralıklı olarak çalınır (`nudge`).
- **Sessiz Saatler ve Mute (A-22):** Çiftliğe tek tıkla sus denilebilir; gece saatleri için otomatik sessize alma tanımlanabilir.
- **Oturum ve Ajan Bazlı Özel Tonlar (A-23, A-24):** Her oturumun ve her ajanın kendine ait bir ses tonu olabilir; satır üzerinde hangi tonun çalacağı simgeyle gösterilir.
- **Canlı Diyalog Okuyucu (`DialogueSpeaker` - A-26):** Ajanın ürettiği yanıtın markdown ve kod blokları temizlenerek (`sanitizeForSpeech`) yerel konuşma sentezleyicisi (TTS) üzerinden canlı olarak sesli okunması sağlanır.


Faz 2 ile gelen gerçek zamanlı izleme katmanı. Oturum kayıtları diske birkaç saniye gecikmeyle düşer; canlı gözlem ise **Claude Code hook'ları** üzerinden olayları anında yakalar: komut girildiği an, araç çalıştığı an, izin beklendiği an.

### Nasıl Çalışır

1. Eklenti, yalnızca bu makineden erişilebilen küçük bir dinleyici açar: `127.0.0.1:8377` (ayarlanabilir).
2. Claude Code'un hook sistemine 9 olay için tek satırlık bir `curl` komutu eklenir; her olay dinleyiciye JSON olarak POST edilir.
3. Eklenti olaylardan oturum başına bir **durum makinesi** yürütür:

| Durum | Anlamı |
| --- | --- |
| WORKING | Komut alındı, model düşünüyor |
| TOOL | Şu anda bir araç çalışıyor (adı gösterilir) |
| PERMISSION? | **İzin onayı bekliyor** — sen onaylayana kadar duruyor |
| YOUR TURN | Turunu bitirdi, senin girdini bekliyor |
| STALLED | Çalışıyordu ama uzun süredir olay yok — takılmış olabilir |
| IDLE / ENDED | Boşta / oturum kapandı |

Hiçbir veri makineden çıkmaz; dinleyici yalnızca localhost'a bağlıdır.

### Kurulum: Install Live Hooks

1. Komut paletinden **Agent Farm: Install Live Hooks** çalıştır.
2. Hedef seç: **User settings** (önerilen — tüm oturumları kapsar, tek dosya: `~/.claude/settings.json`) veya ajan başına `.claude/settings.local.json`.
3. Onay ver. Eklenti mevcut ayarlarına **dokunmaz**: kendi girdilerini yanına ekler, ilk yazımda `.agentfarm-bak` yedeği alır, senin elle koyduğun hook'ları korur.
4. **Önemli:** Hook'lar oturum başlarken okunur — halihazırda açık claude oturumlarını yeniden başlatmadan olay gelmez.

Kaldırmak için: **Agent Farm: Remove Live Hooks** — yalnızca Agent Farm'ın kendi girdilerini siler, seninkilere dokunmaz.

### Zaman Çizelgesi (Timeline)

**Agent Farm: Open Live Timeline** komutuyla veya Live Feed görünümündeki nabız ikonuyla açılır.

- **Kulvarlar (swim lanes):** Her ajan bir şerit; yeşil bloklar araç koşularını (süresiyle), noktalar/elmaslar olayları gösterir: mavi dolu daire = kullanıcı komutu (prompt), mavi içi boş halka = modelin cevabı (`say` olayı — 3.183.0, konuşmanın iki yakası tek grafikte), kırmızı elmas = izin bekleme, mor elmas = compaction, turuncu nokta = subagent bitti, çizgi = tur sonu.
- **Tek Konulu Zengin Paneller (3.179.0, 3.181.0 — U-67):** Kulvardaki her nokta ve araç bloğu kendi bağımsız `AFTip` paneline sahiptir: **Kim** (oturum, ajan, motor, model), **Ne söylendi** (tam ve alıntılanmış metin / araç komutu ve cevabı), **Zaman** (saat, tur no, aralık) ve **Eylemler** (tık = o ana atla, sağ tık = oturum menüsü). Araç blokları tek satır kompakt başlık ve süre taşır, gereksiz JSON yüküyle dolmaz.
- **Copy Corpus — Noktadan Tam Metin Kopyalama (3.184.0 — U-76):** Zaman çizelgesindeki bir noktaya veya araç bloğuna sağ tık → **Copy Corpus** transkripti açmaya gerek kalmadan o anın tüm metnini doğrudan diskteki ham transkriptten panoya kopyalar. Köprü: `timeline.corpus`.
- **Bir Konuşmanın Tamamını Köprüden Okumak (3.536.0 — B-24):** `sessions.read`, bir oturumun mesajlarını ajana transkript sayfasının kendi sözlüğüyle verir — her motor için `user | assistant | tool | toolResult | system`; hiçbir zaman motorun kendi kelimesiyle (konsol kaydındaki `agent`/`result`) değil. Kimlik, 8 haneli önek ya da transkript yolu alır (birden çok oturuma uyan önek adaylarıyla birlikte reddedilir); rol, tur ve alt ajan adımlarına göre süzer; `from`/`limit`/`next` ile sayfalar (negatif `from` sondan sayar) ve uzun metni `maxChars`'ta keserek tam uzunluğu `clipped` ile bildirir. Görüntüleyicinin kendi çevirisinden okur; ajan transkript dosyasını kendisi hiç açmaz.
- **Aynı ajanın eşzamanlı oturumları (2.45.0):** Aynı ajan aynı anda birden çok oturumda açıksa her eşzamanlı oturum **kendi satırını** alır (`dev #1`, `dev #2` …) — olaylar artık üst üste binmez. Ardışık (çakışmayan) oturumlar ise eskisi gibi tek satırı paylaşır, satır sayısı şişmez. Oturum kartları, bildirimler ve Needs You kuyruğu da aynı `#k` etiketini kullanır; ajan ağacında durum yanında `×2` rozeti görünür.
- **Tıkla → tam o ana git (2.37.0):** Kulvardaki herhangi bir işarete **veya yeşil araç bloğuna** tıklayınca Oturum Görüntüleyici yalnızca açılmakla kalmaz, kayıtta **tam o olayın olduğu mesaja** kayar ve mesajı kısa süreliğine çerçeveyle vurgular. Görüntüleyici zaten açıksa aynı tık onu öne getirip o noktaya taşır.
- **Sıra-sende uyarıları — ayar OTURUMUN, ajanın değil (3.144.0):** Her kulvarın solundaki dört kutucuk — **♪ ses · ◎ odak · ▣ modal · ▭ toast** — **o satırın oturumu** **YOUR TURN**'e geçtiğinde çalışacak eylemleri seçer. Satır zaten bir oturumdur: aynı ajanın üç eşzamanlı koşusu üç satırdır ve **üç bağımsız seçim** taşır; birine tıklamak ötekileri değiştirmez, arkalarında bir "ajan varsayılanı" katmanı yoktur (seçim yoksa uyarı yoktur). Kartların altındaki ikinci kontrol kopyası kaldırıldı — ayar yalnız kulvarda yaşar. Yalnız geçmiş çizen bir satırda kutucuklar **kapalıdır**: artık ateşleyemeyecek bir konuşmaya uyarı kurulmaz. Seçim `agentfarm.turnAlerts[sessionId]` altında `globalState`'e yazılır, tetikleme host tarafındadır — **panel kapalıyken de çalışır** — ve panel kapanmasına, VS Code reload'una dayanır. Terminal kulvarı sentetik `cli:…` kimliğinden gerçek konuşma kimliğine geçtiğinde tercih aynı adımda taşınır; hedefte kendi kaydı varsa birleştirme yapılmaz, çakışma söylenir. Eski ajan-anahtarlı harita **bir kez**, sürümlü bir göçle o an canlı olan oturumlara kopyalanır; sonrasında hiç okunmaz.
  *Ses:* eklentiyle gelen kısa bir WAV (`media/sounds/turn-ready.wav`, `tools/make_turn_sound.js` ile üretilir — lisanslanacak bir şey yok); Windows'ta gizli PowerShell `SoundPlayer.PlaySync()`, macOS'ta `afplay`, Linux'ta `paplay`→`aplay`. Dosya yolu komut metnine **hiç girmez** (Windows'ta ortam değişkeniyle, diğerlerinde `execFile` argümanıyla gider), yani kabuk enterpolasyonu yoktur. Her çalıştırma backend, çıkış kodu, `stderr`, süre ve timeout bilgisini döndürür; başarısızlık ilk olayda tanı veren bir uyarıyla söylenir ve tekrarları hız-sınırlanır. **`exit 0` yalnız "oynatıcı dosyayı kabul etti" demektir — duyulduğu iddiası değildir.** *Odak:* timeline panelini öne getirir (VS Code'un OS penceresini öne getiren API'si yoktur). *Modal:* doğru oturum adıyla bloklayıcı diyalog + Transkripti aç. *Toast:* köşede non-modal bildirim. Dört dal **birbirinden bağımsız** koşar: birinin hatası ötekini kesmez.
  **Aynı tura tek uyarı**, kaba bir 3 sn'lik yutma ile değil oturumun kendi tur sırasıyla: `Notification(waiting)` ve arkasından gelen `Stop` aynı turdur, tek kez çalar; gerçekten biten yeni bir tur bir saniye sonra gelse de yeniden çalar. İzin beklemesi YOUR TURN sayılmaz, reload'da geçmişten kurulan oturum bir daha duyurulmaz. Bu, global `notifyTurnEnd` ayarından ayrıdır — o tüm ajanlar için tek bir toast atar.
- **"3 saniye sonra test et" (3.144.0):** Her canlı kulvar satırındaki **⏱** kutucuğu o satırın seçili eylemlerini bilerek çalıştırır. Geri sayım host tarafındadır, yani başka bir pencereye geçip odağın gerçekten gelip gelmediğini görebilirsin. Sonuç, grafiğin altındaki şeritte oturum + dört dal olarak çıkar; AFTip'te her dalın `ok/failed/skipped` durumu, ses backend'i, çıkış kodu, `stderr` ve süresi yazar. Seçim yoksa test kapalıdır. Aynı çekirdek köprüde de var: `live.alerts.get` · `live.alerts.set` · `live.alerts.test`.
- **AFTip ve Canlı Etkileşim Kuralları (3.182.0, 3.195.0, 3.196.0 — U-74, U-81):**
  - **%100 Mat ve Opak:** Paneller `editor.background` ile tam opak çizilir; alt metinlerin görünmesini önleyen `tip-host` hiyerarşisi uygulanır.
  - **Hover Ele Yol Verir:** Tıklama veya klavye girişi yapıldığı anda panel anında gizlenir ve imleç öğeden ayrılana kadar sessiz kalır. Tıklanabilir butonların hover'ı kasıtlı olarak daha yavaş açılır (.6s).
  - **Titremesiz Yeniden Çizim (U-73):** Live Timeline periyodik olarak tüm DOM'u güncellese bile imlecin altındaki `tip-free` paneli yerini ve kaydırma konumunu korur.
- **Live sessions kartları (3.193.0, 3.195.0 — U-80, U-81):** Her oturumun anlık durumu, son komutu, sayaçları ve başlangıç saati. Kart üzerindeki metin satırları ızgara düzenini bozmamak için **90 karaktere kırpılır**; üzerine gelindiğinde `AFTip` paneli 4.000 karaktere kadar tam metni açar. Kart başlığında oturum kimliği (`(#407c78cb)`), model, klasör, pid ve tekil konulu metrik panelleri (Money, Work, Time) yer alır.
- **Host Tabanlı Panoya Kopyalama (3.194.0 — U-82):** Sağ tık menülerindeki tüm **Copy ▸ (The code · The words · Code and words)** eylemleri webview odak hatalarını aşmak için doğrudan extension host'un `vscode.env.clipboard` mekanizması üzerinden çalışır (`media/afCtx.js`).
- **Oturumu bitirmek ve temizlemek (3.31.0):** kartın düğmeleri ⌨ Terminal · ⎋ Interrupt (turu durdurur, oturum kalır) · **⏻ End session** (oturumu sahiplenen claude sürecini durdurur — önce sorar, kayıt diskte kalır) · **✕ Clear**. Süreci artık işletim sisteminde olmayan oturum *"canlı süreç yok — bitmiş, sadece hook'ları söylememiş"* diye işaretlenir, Interrupt düğmesini kaybeder ve sayfa başlığı hepsini tek tıkla temizlemeyi önerir. `sessions.live` / `sessions.end` / `sessions.dismiss` köprüde olduğundan bir ajan da üçünü yapabilir.
- **Kulvar satırına sağ tık (3.34.0, 3.202.0):** satır zaten bir oturumdur — Rename · Open session · Terminal · Interrupt · End session · Clear · **Add to Wiki Candidates…** (S-38). Satırın tamamı cevap verir (o an çizdiği oturumla).
- **Clear artık gerçekten siler (3.34.0):** eskiden Clear kartı kaldırıyor, kulvar satırını bırakıyordu — artık oturumu bu sayfadan **bütün olarak** alır (kart ve satır birlikte) ve VS Code yeniden başlasa da geri gelmez. Kayıt diskte durur, sürece sinyal gönderilmez.
- Panel olay geldikçe kendini günceller; kendisinden hiç haber alınmayan oturum artık takip penceresi dolduktan yarım dakika içinde kendiliğinden düşer (3.31.0).
- Not: 2.13.0 öncesi olaylar diske yazılmadığından, kurulumdan sonra uzun aralıklar zamanla dolar.

### Bildirimler

| Ayar | Varsayılan | Ne zaman |
| --- | --- | --- |
| `agentFarm.notifyPermission` | açık | Ajan izin onayı beklemeye başlayınca |
| `agentFarm.notifyStuck` | açık | Çalışan oturumdan `stuckThresholdSeconds` (240 sn) boyunca olay gelmeyince |
| `agentFarm.notifyTurnEnd` | kapalı | Ajan turunu her bitirdiğinde (gürültülü olabilir) |

Bildirimdeki **Open Timeline** düğmesi seni doğrudan kulvar görünümüne götürür. Ayrıca durum çubuğu izin/takılma varken sarıya döner: `🤖 2 active • $1.42 today • 🔔 1 waiting`.

### Güvenlik ve Performans

- Dinleyici yalnızca `127.0.0.1` — dışarıdan erişilemez, hiçbir dış servise veri gitmez.
- Hook komutu `curl --connect-timeout 2 -m 15 ... || cd .` kalıbındadır: çıkış kodu her zaman 0 olduğu için bir hook **ajanı asla bloklamaz**. ‼️ X-265 — sınır eskiden düz `-m 3`'tü ve orada bulunma sebebini hiç yerine getirmiyordu: `127.0.0.1` üzerinde dinleyici yoksa bağlantı yaklaşık bir milisaniyede REDDEDİLİR, zaman aşımı hiç devreye girmez. Üç saniyenin gerçekten kestiği şey, ORADA OLAN ama meşgul olan bir dinleyiciydi — ölçüldü: extension host boştayken 0,28–0,54 s, **yük altında 6,7 s** — ve bu sessizce başarısız oluyordu, çünkü `|| cd .` zaman aşımını yutar. Artık bağlanma sınırlıdır (ölü bir dinleyicinin gerçekten yaratabileceği tek takılma, bağlanmış ama kabul etmeyen bir sokettir), alışveriş değil.
- ‼️ **Yakalanmış bir hesap bir config dizinidir, dolayısıyla hook'ların kendi kopyasına ihtiyacı vardır** (X-265). `CLAUDE_CONFIG_DIR` motorun hangi `settings.json` dosyasını okuduğunu değiştirir; bir hesapla açılan oturum slot dizinindeki dosyayı okur. Agent Farm ayar dosyasını slot yakalanırken taşır ve daha önce yakalanmış slotları her açılışta onarır — ama yalnız kullanıcının kendi dosyasında hook'lar varsa (onları kaldırmak bir karardır) ve slotu yalnız hook içeren bir kütükle değil, o dosyanın TAMAMIYLA tohumlayarak. `hooks.status` ve kokpit kartı, hook'suz bir yakalanmış hesabı **partial** olarak, adıyla raporlar.
- Her araç çağrısına ~2 küçük süreç (curl) eklenir; pratikte hissedilmez.
- İki VS Code penceresi açıksa dinleyiciyi ilk açılan alır; diğeri Timeline başlığında "port in use" gösterir — sorun değildir, tek dinleyici yeter.

## Görev Kuyruğu

Faz 3 ile gelen koordinasyon katmanı. Yan paneldeki **Tasks** görünümünden ajanlarına iş sıralarsın; her görev ajanın klasöründe bir terminal açıp `claude` komutunu senin prompt'unla başlatır.

### Tek Tık Örnek Kurulum (2.39.0)

Boş sayfa problemine karşı: **Agent Farm: Set Up Example Automation…** üç çalışan örnekten birini gerçek, düzenlenebilir bir tanım olarak kurar — 📥 **Inbox nöbeti** (klasör seç → watch trigger + tasnif görevi), 🌅 **Sabah brifingi** (ajan seç → her gün 09:00 headless görev), 🔗 **İki ajanlı zincir** (A analiz → `{prev_text}` → B özet workflow'u, istersen hemen koştur). Kurulan şey sihir değildir; Tasks görünümünde görünür, düzenlenir, silinir. Komut palete ek olarak Tasks görünümünün boş karşılama ekranından, Dashboard'daki Farm Status kartından ve kurulum turundan (walkthrough) da erişilir. VS Code'un **Welcome → Walkthroughs** bölümündeki "Agent Farm: Beş Adımda Kurulum" turu, ajan tanıtmadan ilk otomasyona beş adımı sırayla yürütür.

### Görev Ekleme ve Çalıştırma

1. Tasks görünümünde **+** (Add Task): ajan seç → başlık → prompt → mod seç. Formdaki **?** popover butonu (3.192.0), webview içinden çıkmadan ve taslağı kaybetmeden **Görev ve Retry Mimarisi Rehberi**'ni açar (oturum devamlılığı, kota pencereleri, 3-prompt yönlendirme ve güvenlik frenleri).
2. Modlar ve Yürütme Hedefleri:
   - **Interactive (3.197.0 — M-26):** Etkileşimli oturum. İki kritik boyutuyla tam kontrol sunar:
     - **Opens in (`interactiveTarget`):** `vscode` (entegre terminal, varsayılan), `external` (işletim sisteminin kendi terminal penceresi / Windows Terminal — üretilen `.cmd` batch wrapper ile gerçek `%ERRORLEVEL%` çıkış kodu yakalanır), `console` (Agent Farm'ın kendi barındırılan Console webview paneli).
     - **When it answers (`interactiveClose`):** `stay-open` (sohbet açık kalır), `auto-close` (tek tur basıp çıkar — `claude -p` / `runArgs` ile çalışır, ajan cevabı tamamlanınca yüzey kapanır ve görev sonlanır).
   - **Headless:** `claude -p "prompt"` — görevi arka planda çalıştırır, çıktıyı arşivler ve çıkar. Otomasyon için idealdir.
3. **Kayıtlı Prompt Şablonları (3.190.0 — M-24):** Görev formu içerisindeki dört prompt kutusunda da (Görev promptu, Retry promptu, Devam promptu ve Workflow adım promptu) **sağ tık** yapıldığında ortak snippet penceresi (`media/afSnippets.js`) açılır. Kayıtlı prompt şablonları imlecin olduğu noktaya tek tıkla yapıştırılır.
4. **Tasks Başlık Şeridi ve Canlı Kapı Metrikleri (3.200.0 — M-21):** Tasks sayfası başlığındaki kontrol şeridi çiftliğin anlık durumunu tek bakışta özetler: ⚙️ Eşzamanlılık tavanları · ⏳ Bekleme süreleri ve kuyruk sırası · 🛡️ İnsan onayı bekleyenler · 📅 Zamanlama dağılımı · 🏁 Günlük başarı oranı · 💵 Harcama ve token türevleri.
5. **Plan & Runs Tabloları AFTip Panelleri (3.191.0 — M-25):** Runs tablosundaki **Tokens** ve **Cost** sütunları, Plan tablosundaki **Guard** (tasarruf edilen uyandırma sayısı), **Agent**, **Cost 7d** (koşu başı ortalama) ve **Last run** (tam yerel/UTC zamanı) hücreleri zengin AFTip panelleriyle açıklanır.
6. Kuyruktaki görevler sırayla bekler; ▶ ile başlatırsın, ↑↓ ile sıralarsın.
7. Görev terminali kapanınca (veya headless komut bitince) görev otomatik **done** olur. Shell integration açıksa çıkış koduna göre **failed** da işaretlenir. İstediğin an ✓ ile elle tamamlayabilirsin.
8. `agentFarm.queueAutoAdvance` ayarını açarsan, bir görev bitince o ajanın kuyruğundaki sıradaki görev kendiliğinden başlar — zincirleme çalışma.

Görev durumları: ○ queued → ⟳ running → ✓ done / ⛔ failed / ⊘ cancelled. Çalışan göreve tıklayınca terminali öne gelir.

**Dedup koruması (2.18.0):** aynı ajana birebir aynı prompt zaten kuyruktaysa Add Task seni uyarır — kazara ikinci kez eklemeyi önler.

### Çok Turlu Görevler ve Otomatik Tur Zinciri (3.292.0 — M-27 & M-30)

Gözetimsiz arka plan işlerinde bir konuşma içinde birden fazla aşamayı ("önce analiz et, sonra refactor et, ardından testleri çalıştır") yürütmek için **M-27 Tur Zinciri (Round Chain)** mimarisi kurulmuştur:

- **1. Tur = Ana Prompt:** Formdaki ilk büyük prompt kutusu zincirin başlangıcıdır.
- **Dinamik Turlar (`+ another prompt` / `+ Yeni Tur Ekle`):** Butona her basıldığında `R2`, `R3`, `R4`... satırları eklenir. Her turun kendi prompt metni, `wait: [N] min` bekleme dakikası ve silme butonu vardır.
- **Aynı Konuşmaya Bağlanma (`resumeSessionId`):** 1. tur tamamlandığı anda sistem oturumun transkript kimliğini (`runSessionId`) yakalar ve 2. turu **AYNI konuşmayı kaldığı yerden resume ederek** gönderir. Ajan 1. adımda ne yaptığını bilerek çalışır.
- **Kuyrukta Gerçek Görev Satırı (`notBefore`):** Bekleme süreleri bellekteki uçucu bir sayaç değil; kuyrukta `notBefore` zaman damgasıyla bekleyen bağımsız bir görev satırıdır (`Görev Adı · R2`). VS Code kapansa bile kaybolmaz, zamanı gelince otomatik tetiklenir ve iptal edilebilir.
- **Retry Tur Değildir:** Bir turda kota veya hata nedeniyle yapılan yeniden denemeler tur sayacını artırmaz; aynı turun retry'ı olarak kalır. Başarılı olan deneme bir sonraki turu açar.
- **Zamanlayıcı (Schedule) ve Şablon Entegrasyonu:** Çok turlu zincirler hem tek seferlik görevlerde hem de Daily/Weekly/OnceAt Zamanlanmış Görevlerde ve Şablonlarda (Templates) tam desteklenir.
- **Runs Tablosunda `R2/4` Rozeti:** Zincirleme görevler Runs tablosunda kaçıncı turda olduğunu gösteren rozet taşır (`R2/4`); üzerine gelindiğinde kalan süreler ve durumlar okunur.
- **⚡ Superpowers Mühendislik Disiplini Seçimi (M-30):** Task ve Schedule formlarında, ajanın varsayılan ayarından bağımsız olarak göreve özel Superpowers disiplini (TDD, sistematik hata ayıklama, kök neden analizi) açık veya kapalı seçilebilir.


### Yeniden Çalıştırma ve Öncelik

Biten veya bekleyen görevlerde tek tıkla (2.18.0):

- **Retry** (biten görevlerde ⟳): görevi taze bir kopya olarak yeniden kuyruğa alır (`(retry N)` başlığı, artan deneme sayacı). **Retry with edited prompt…** aynısını, prompt'u önce düzeltmen için bir kutuyla açar. `done`/`failed`/`cancelled` görevlerin hepsinde çalışır.
- **Resume workflow from this step** (⏵, workflow adımına ait biten görevlerde): zinciri o adımdan yeniden başlatır; besleme (handoff) aynı koşudaki bir önceki adımın çıktısından yeniden kurulur — baştan çalıştırmadan kaldığın yerden devam.
- **Run Next** (⌃, bekleyen görevlerde): görevi kuyruğun önüne alır (önceliğini diğer bekleyenlerin üstüne çıkarır); kapasite açılınca ilk o başlar. Satırda `⬆ next` etiketiyle görünür.

**Öncelik ve yaşlanma:** kuyruk artık salt ekleme sırası değil — yüksek öncelikli önce başlar, eşitlikte eski görev önce. Bekleyen her görev her 30 dakikada +1 öncelik kazanır (yaşlanma), böylece sürekli yüksek-öncelikli iş gelse bile eskiler aç kalmaz.

### Uzun İş Dayanıklılığı (Dalga F)

Saatlik render'lar ve gece koşuları pencere kapanışına dayanır (2.33.0):

- **Medya reattach:** fal/Replicate işi kuyruğa girdiği anda poll URL'leri göreve yazılır (diske persist). Pencere render ortasında kapanırsa bir sonraki pencere işe **yeniden bağlanır** — poll kaldığı yerden sürer, asset'ler iner, galeri meta'sı yazılır ve zincir olduğu adımdan devam eder (arşivde "reattached" notu düşer). Süresi dolmuş işler aşağıdaki resume teklifine düşer. **Paralel grup istisnası (2.36.0):** reattach edilen iş bir paralel grubun dalıysa zinciri İLERLETMEZ — grubun fan-in durumu pencereyle birlikte öldüğünden koşu duraklatılır ve son dal tamamlanınca Resume teklif edilir (Resume grubu baştan koşturur; bildirimde açıkça söylenir).
- **Yarıda kalan run tespiti + resume teklifi:** pencere kapanırken koşan workflow adımları eskiden sonsuza dek bekleyen zombi satırlara dönüşür, zincir sessizce ölürdü. Artık dürüstçe *cancelled* işaretlenirler (başarı oranı analitiğine girmezler, arşive "Interrupted" notu düşer) ve açılışta tek bildirim **Resume** teklif eder: her run, yarıda kalan en erken adımından, önceki adımın çıktısı diskten yeniden kurularak devam eder (paralel gruplar grup başından yeniden fan-out olur — fan-in durumu bellekteydi, dürüst sınır). Reddedersen görev satırlarındaki Resume butonları her zaman durur; teklif tek seferliktir.
- Ad-hoc medya koşuları (kalıcı workflow'u olmayanlar) resume teklif edilmez — reattach penceresi geçtiyse yeniden üretmek için galeriden **Re-run** kullan.
- **Ağ kesintisi toleransı (2.35.0):** tüm medya/webhook poll döngüleri geçici hatalara (ağ hatası, 5xx, 429) artan beklemelerle dayanır; kalıcı hatalar (4xx) anında düşer. **Submit asla yeniden denenmez** — çifte kuyruk/çifte ücret riski. Provider çağrıları çitlendi: beklenmedik hata artık task'ı sonsuza dek "running" bırakmaz, adım `onFail` yoluyla dürüstçe düşer.

### Zamanlanmış Görevler

Tasks görünümündeki takvim ikonuyla (**Add Scheduled Task**) tekrarlayan işler kurarsın:

- **Daily** — her gün belirtilen saatte (örn. sabah 08:30 gün planı)
- **Weekly** — haftanın belirli günü ve saati (örn. Pazar 21:00 haftalık rapor)
- **Once** — tek seferlik, tarih+saat

Kurulu bir zamanlamayı değiştirmek için sağ tık → **Edit Schedule…** (2.42.0): başlık, prompt, saat ve (haftalıkta) gün yerinde düzenlenir — eskiden sil + yeniden kur gerekiyordu.

Zamanı gelen görev otomatik olarak kuyruğa eklenir, başlatılır ve bildirim düşer. Tek seferlikler çalıştıktan sonra kendini kapatır.

**Kaçırılan zaman politikası (2.75.0):** Günlük/haftalık zamanlama kurarken (ve Edit Schedule'da) üçüncü bir soru sorulur — *saat geldiğinde hiçbir VS Code penceresi açık değilse ne olsun?* **Skip missed runs** (varsayılan, eski davranış): o sefer yanar; aynı gün içinde geç açarsan yine tetiklenir ama gün tamamen kaçtıysa kaçmıştır. **Catch up at first opportunity:** tamamen kaçan sefer, bir sonraki VS Code penceresi açılır açılmaz sormadan koşar (bildirim "caught up" der); o günün kendi seferi ayrıca saatinde çalışır. **Ask before catching up:** kaçan sefer **Run now / Skip this one** düğmeli bir uyarıyla sana sorulur — uyarıyı kapatırsan bir sonraki pencerede tekrar sorulur, sessizce ölmez. Politika kurulduğu anda geçmiş "kapanmış" sayılır: yeni kurulan bir catch-up zamanlaması dünün seferini koşmaya kalkmaz, yalnız kurulumdan SONRA kaçanlar yakalanır.

**Dışarıdan zamanlama tohumlama (2.77.0):** Bir ajan, script ya da başka bir makinenin kurulumu, store'un yanına **`seed-schedules.json`** bırakarak zamanlama kurabilir — RUNNER penceresi açılışta (ve runner devralmalarında) dosyayı okur, başlığa göre tekilleyerek zamanlamaları kurar ve dosyayı siler. `farm-tasks.json`'ı dışarıdan doğrudan yazmak runner'ın kayıtlarıyla yarışır ve kaybeder; yarışsız kapı budur. Format: `FarmSchedule` alanlarının dizisi (id'siz; bozuk girdiler atlanır, eksikler makul varsayılan alır).

**Önemli sınır:** Bu zamanlayıcı VS Code açıkken çalışır — kapalıysa o çalıştırma atlanır (gün içinde açarsan o günün görevi gecikmeli tetiklenir; tamamen kaçan günler için yukarıdaki catch-up politikası var). VS Code'dan bağımsız çalışması gerekenler için bir sonraki bölüme bak.

### VS Code Dışında Zamanlama (Windows)

Bir zamanlanmış görevi **Windows Görev Zamanlayıcı**'ya taşıyabilirsin: zamanlama üzerinde sağ tık → **Export as Windows Scheduled Task…**

1. Eklenti, ajan klasöründe `claude -p "prompt"` çalıştırıp çıktıyı log dosyasına yazan bir `.cmd` script'i üretir.
2. Hazır `schtasks /Create ...` komutu panoya kopyalanır — terminale yapıştırıp çalıştırınca kayıt tamamlanır.
3. Artık görev VS Code (hatta oturumun) kapalıyken bile işler; çıktılar log dosyasında birikir ("Open log folder" ile ulaşırsın).

### Farm Köprüsü — Ajanlar Farm'ı Kendisi Kullanır (2.78.0)

Kullanıcı bir ajana sohbette talimat verir; ajan Agent Farm'ı **takım arkadaşı gibi** kullanır — görev kuyruğa atar, zamanlama kurar, workflow koşturur, misyon başlatır, sağlık bulgularını okur. Kapı dosya-tabanlıdır, port keşfi gerekmez:

- **İstek:** `<globalStorage>/bridge/<ad>.request.json` → `{ "op": "tasks.add", "args": { "agent": "developer", "title": "…", "prompt": "…" } }` (UTF-8 BOM ve baştaki/sondaki boşluk tolere edilir — 2.79.0; PowerShell'in `Set-Content -Encoding utf8` çıktısı doğrudan çalışır)
- **Yanıt:** aynı ad `.response.json` → `{ "ok": true, "result": … }` ya da `{ "ok": false, "error": "…" }`. İstek dosyası işlenince silinir; toplanmayan yanıtlar 24 saat sonra temizlenir. VS Code kapalıysa istek bekler — bir sonraki RUNNER penceresi işler (çağıran taraf makul bir zaman aşımıyla dürüstçe pes etmeli).
- **Katalog kendini anlatır:** `{ "op": "farm.ops" }` o günkü sürümün TÜM operasyonlarını tek satırlık sözleşmeleriyle döndürür — ajan listeyi ezberlemez, **keşfeder**; yarın eklenen bir özellik kataloğa tek `register` satırıyla düşer. 3.11.0 itibarıyla katalog tam bir **kontrol düzlemidir**: `agents.*` · `tasks.*` (list/add/get/cancel/rerun/runNext/delete/clearFinished — `tasks.get` görevin arşivlenmiş çıktısını da döndürür) · `schedules.*` (list/add/**edit**/delete/toggle/runNow) · `triggers.*` (list/**add/edit/delete**/toggle/fire — webhook eklerken POST URL'i yanıt olarak döner) · `workflows.*` (list/**add/delete**/run) · `templates.*` (list/**add/delete**/run) · **`duties.*`** (list/add/update/delete/togglePause/move/automate — nöbet sistemi köprüden uçtan uca yönetilir; `duties.list` watch hedefinde iş bekleyip beklemediğini de söyler, `duties.add` CLAUDE.md'de DUTIES.md referansı yoksa uyarır ya da `ensureReference=true` ile kendisi ekler) · `missions.*` (list/start/status/**pause/resume/cancel/answer/approve** — bekleyen soru/onay `missions.status`'ta görünür ve köprüden cevaplanır) · `notices.*` · `toolbox.*` · `turns.list` · `insights.list` · `sessions.recent`. Güncel ve eksiksiz liste her zaman `farm.ops`'tadır.
- Her işlenen istek **bildirimle görünür** — ajanın farm'da ne yaptığı sessiz kalmaz. Hatalı istek dürüst hata mesajı alır (kataloğa yönlendirir).
- `seed-schedules.json` (2.77.0) yerinde durur — salt zamanlama tohumlamanın basit yolu; köprü genel kapıdır.

Gereksinim: `claude` komutunun PATH'te olması. Kaldırmak için: `schtasks /Delete /TN "AgentFarm\<isim>"`.

### Görev Çıktı Arşivi

Headless görevler (0.4.0'dan itibaren) terminalde değil, **arka plan süreci** olarak çalışır ve tüm çıktı otomatik arşivlenir:

- Her headless görevin çıktısı başlık/ajan/başlangıç bilgili bir Markdown dosyasına yazılır; sonuna çıkış kodu ve süre eklenir.
- Görev bittikten sonra sağ tık → **Open Task Output** ile açarsın (çalışırken de kısmi çıktıyı görebilirsin).
- Çıkış kodu 0 değilse görev otomatik **failed** işaretlenir — güvenilir otomasyon sinyali.
- Görev silinince veya **Clear Finished Tasks** deyince çıktı dosyaları da temizlenir.

### Görev Şablonları

Sık kullandığın görevleri şablonlaştır: görev üzerinde sağ tık → **Save as Template**. Şablon bir ajana bağlanabilir ya da "any agent" olur (çalıştırırken sorar). Tasks görünümündeki **Templates** bölümünden ▶ ile tek tıkta yeni görev üretir. Örnek şablonlar: "Günlük plan", "Haftalık özet", "Hafıza bakımı".

### Eşzamanlılık ve Kota Bekçisi

0.8.0'dan itibaren kuyruk gerçek bir kuyruk: aynı anda koşan görev sayısı sınırlıdır (`maxConcurrentTasks` varsayılan 2, `maxConcurrentPerAgent` varsayılan 1). Sınıra takılan başlatma **iptal edilmez** — "deferred" rozetiyle bekler ve kapasite açılınca kendiliğinden koşar.

**Kota bekçisi:** `windowTokenLimit` tanımlıysa ve `quotaGuardPercent` (örn. 85) ayarlıysa, 5 saatlik pencere o doluluğa ulaştığında **otomatik** işler ertelenir — bir gece fabrikası sabah kotanı yemiş olmaz. Pencere gevşeyince ertelenenler sırayla başlar.

**Çoklu pencere güvenliği (2.38.0):** Görev kuyruğunu aynı anda yalnızca **tek** VS Code penceresi yürütür. Pencereler açılışta bir kira dosyası (`tasks.owner`) için yarışır; kirayı alan pencere pompayı/zamanlayıcıyı çalıştırır, diğerleri **salt-okunur takipçi** olur — Tasks görünümünün başında kilit rozetli "Read-only — another window runs the queue" satırı görünür, liste yürütücünün kayıtlarını canlı yansıtır. Takipçide yapılan değişiklik kaydedilmez (uyarı çıkar; görev yönetimini yürütücü pencerede yap). Yürütücü pencere kapanınca kira ~20 saniye içinde boşa düşer ve takipçilerden biri **kendiliğinden devralır** (yarıda kalan koşular o anda tespit edilip Resume teklif edilir). Önceden iki pencere aynı zamanlanmış görevi çift başlatabilir ve birbirinin koşan satırlarını "iptal" diye ezebilirdi — bu yapısal olarak kapandı.

### Görev Maliyeti (2.40.0)

Headless biten her görev, `claude -p` koşusunun yazdığı transkriptle **yaşam süresi eşleşmesi** üzerinden buluşturulur ve transkriptin fiyatlanmış token maliyeti görev satırına rozet olarak düşer (`done • $0.12 • 3m ago`); günlük digest'e de günün toplamı eklenir. Dürüstlük kuralı: aynı ajan klasöründe aynı anda ikinci bir oturum varsa (belirsizlik) rakam **uydurulmaz** — görev maliyetsiz kalır. Terminal modundaki görevlerde eşleştirme yapılmaz (oturum görevden sonra da sürer). Eşleşen transkript görevin tooltip'inde durur; medya adımlarının `mediaCost`'u bundan ayrıdır.

### Görev Tarihçesi

Biten görevler kaybolmaz: liste tavana gelince veya **Clear Finished Tasks** deyince kayıtlar aylık `task-history/YYYY-AA.jsonl` dosyalarına taşınır (`Open Task History` komutuyla aç). Çıktı arşivi klasörü de `outputsMaxMB` tavanını aşınca en eski, referanssız çıktılardan temizlenir.

### Görev Öngörüsü (Forecast)

**Task Forecast** (Tasks görünümünün başlığındaki takvim ikonu, 2.21.0) — sonraki günlerde neyin, ne zaman koşacağını bir markdown belgesinde gösterir:

- **Zamanlanmış koşular:** her zamanlamanın sonraki `forecastDays` (varsayılan 7) gündeki ateşleme zamanları, güne göre gruplu; her koşunun yanında aynı işin **son 30 gündeki medyan süresi ve başarı oranı** (Görev Sağlığı verisinden — geçmiş yoksa boş).
- **Şu an çalışan** ve **kuyrukta bekleyen** görevler (bekleyenlerde erteleme nedeni).
- Üstte toplam koşu sayısı ve tahmini **ajan-süresi** (bilinen medyanların toplamı).

Not: Süre öngörüsü yalnız başarılı koşuların medyanından hesaplanır (hızlı bir hata süreyi çarpıtmasın). Görev başına dolar maliyeti izlenmediğinden (token maliyeti oturum transkriptinde, göreve bağlı değil) forecast dolar değil süre/başarı öngörür; medya maliyeti ayrıca Dashboard'da.

### Görev Sağlığı

Delege ettiğin işler ne kadar güvenilir dönüyor? (2.17.0) Tarihçe arşivi + canlı görev listesi birleştirilip üç yüzeye işlenir:

- **Ajan Detay sayfasında "Task health" kartı** — son 30 günün karnesi: koşu sayısı (✓/✗/iptal), başarı yüzdesi (yeşil ≥%80, kırmızı <%50), medyan süre, retry ve verify sayıları, kaynak dökümü (manual/schedule/trigger/workflow), medya maliyeti, o anki kuyruk durumu. Üst üste başarısızlık varsa kırmızı uyarı satırı son başarısız görevi adıyla gösterir.
- **Yetenek Matrisi'nde Tasks ızgarası** — aşağıda [Yetenek Matrisi](#yetenek-matrisi) bölümüne bak.
- **Insights uyarıları** — bir ajanın 30 günlük başarı oranı %50'nin altına düşerse (en az 5 tamamlanmış koşuyla) ve bir görev ailesinin son koşuları hep FAILED ise `task` kategorisinde uyarı düşer: zincir kırık, kota yakmaya devam etmeden çıktıya bak.

Tekrarlanan koşular **görev ailesi** olarak gruplanır: başlıktaki `(retry N)` eki, tarih ve sayılar normalize edilir — "Nöbet turu 2026-07-08" ile "Nöbet turu 2026-07-09" aynı ailedir. İptal edilen görevler başarı oranına katılmaz (kullanıcı kararıdır, hata değil).

## Tetikleyiciler

Otomasyonun kalbi (0.8.0): işler yalnızca saatle değil, **olayla** başlar. Tasks görünümünde ⚡ **Triggers** bölümü.

### Tetikleyici Türleri

- **Watch (klasör/dosya):** İzlenen yol değişince ateşler. Nöbet sisteminin eyleme köprüsü: nöbet "ajan çalışırken bakar", tetikleyici ise **ajan kapalıyken bile** değişiklik anında görevi/zinciri başlatır. Örnek: FAST_NOTE'a dosya düştü → 10 sn sonra tasnif zinciri koşuyor.
- **Hook (canlı olay):** Bir canlı olay ateşler (Live Hooks kurulu olmalı): `stop` (ajan turunu bitirdi), `end` (oturum kapandı), `permission`, `compact`, `subagent`. İsteğe bağlı ajan filtresi. Örnek: psikolog oturumu bitince asistan özet görevi koşsun.

### Eylem ve Korumalar

Tetik ateşleyince üç eylemden birini yapar (sihirbaz "What should it do when it fires?" diye sorar):

- **Run a task on an agent you pick** — bir sonraki adımda **ajanı sen seçersin**, sonra prompt'u yazarsın (prompt'ta `{watch}` izlenen yolu, `{payload}` webhook gövdesini verir). "Olay olunca şu ajana şu komutu ver" kurulumunun yolu budur.
- **Dispatch — route to the best agent automatically** — sabit ajan yok; her ateşlemede kurallar (`agentFarm.dispatchRules`) + ucuz model sınıflandırıcısı işi en uygun ajana yönlendirir. Ajan seçme adımı **bilerek** yoktur.
- **Run a workflow** — kayıtlı bir zinciri koşturur.

Fırtına korumaları yerleşiktir ve **2.8.0'dan itibaren her tetik için ayrı ayarlanır** — sihirbazın son adımı "Default timing / Customize timing…" diye sorar:

- **Debounce** (varsayılan watch'ta 10 sn): art arda değişiklikler tek ateşe iner.
- **Cooldown** (varsayılan 60 sn): ateş sonrası sessiz dönem.
- **Saatlik tavan** (varsayılan 6/saat, 0 = sınırsız): aşılırsa uyarıyla atlanır.
- Kendi çıktı arşivini izleyen tetik kurulamazsa/kurulmuşsa devre dışı kalır (geri besleme döngüsü koruması).

Yönetim: **Add Trigger** sihirbazı; tetik satırında ▶ (elle ateşle), aç/kapat, sil; sağ tık → **Edit Trigger** ile ad, prompt, hedef ajan, model, önkoşul, debounce, cooldown ve saatlik tavan sonradan değiştirilir (2.8.0 — `farm-tasks.json`'ı elle düzenlemek artık gerekmez). Kaç kez ateşlediği, kaç kez atlandığı ve son ateşleme zamanı satırda görünür. Watch yolu kaybolursa satır "path missing" rozetiyle görünür.

## Otomasyon Kapısı {#otomasyon-kapisi}

3.17.0 ile gelen katman. Yukarıdaki fırtına korumaları (debounce/cooldown/saatlik tavan) hepsi **sıklık** frenidir: uyanmanın ne sıklıkta olduğunu sınırlar, **değip değmediğini asla**. Sonuç ölçüldü: tek bir klasör tetikleyicisi beş gecede 23 kez opus uyandırdı, her seferinde yapacak iş bulamadı, **70,90 $** yaktı. "İş var mı?" sorusunun cevabını öğrenmenin tek yolu ajanı uyandırmaktı.

Artık her denetimsiz çalışma, **model çağrılmadan önce** iki soruyu geçmek zorunda.

### 1. Farm şu an çalışabilir mi?

- **Ana şalter** — `Pause All Automations` / `Resume All Automations`. Sebep yazılabilir; unutulmuş bir duraklatma açıklanabilir kalır.
- **Süreli duraklatma** — 1s / 8s / 24s; kendi kendine biter, temizlik gerektirmez.
- **Sessiz saat** (`Set Quiet Hours`, ör. 23:30–04:30; gece yarısını aşabilir) — pencere içinde hiçbir şey kendiliğinden uyanmaz. **Vakti gelen zamanlı görev düşmez, ERTELENİR**: pencere bitince ateşlenir, satırda `deferred` rozetiyle görünür. Elle "run now" sessiz saate takılmaz — düğmeye basmak denetimsiz uyanma değildir; ana şalter ona da uygulanır.

### 2. Gerçekten yapacak iş var mı? — `fireIf` önkoşulu

Zamanlama ve tetikleyicilere takılan, **bedava** değerlendirilen içerik freni:

| Tür | Ateşler ki | Tipik kullanım |
|---|---|---|
| `folderHasFiles` | klasörde ≥ `minCount` dosya var (`except[]` hariç, `recursive`) | boşalması gereken giriş klasörü (`except: ["_LOG_.md"]`) |
| `fileMissing` | yol **yok** | dürtü: bugünün gün dosyası yazılmamış |
| `pathChangedWithin` | yol son `hours` saatte değişmiş | taze hareket varsa çalış |
| `queueHasWork` | iş kuyruğunda ≥ `minCount` aktif kayıt | süpürme: boş kuyruk için uyanma |

Yollarda **`{today}` / `{yesterday}`** token'ları yerel `YYYY-MM-DD` olur. **Opt-in**: önkoşulu olmayan hiçbir otomasyonun davranışı değişmez. Bilinmeyen tür **fail-open** (ateşler) — bir koruma asla yanlışlıkla gerçek işi bastırmaz.

Sağlanmayan önkoşul hiçbir ajan uyandırmaz; zamanlamada o günkü koşu "halledildi" damgası alır (gün boyu tekrar denemez), tetikleyicide `skipCount` artar. **Her karar (fired/skipped + sebep) `automationLog`'a yazılır** — sessizce iş yutan bir koruma, anayasa İlke 1'in tam ihlali olurdu. Bu günlük Yaşam Panosu'nun altında ve `automations.status` çıktısında okunur.

### 3. Model otomasyonun üzerinde

`FarmSchedule.model` ve tetikleyici `action.model`, `agentFarm.modelPolicy` regex motorunu **yener**. Sebep: bir policy kuralının, görevin kendi `DUTIES.md` satırıyla sessizce çelişmesi mümkündü (gerçek vaka: "bu nöbeti opus yapar" yazarken kural onu sonnet'e düşürüyordu). Model artık sihirbazda seçilir, satırda rozet olarak görünür.

### 4. Bütçe fren, uyarı değil

`agentFarm.budgets` (ajan adı başına, `"*"` = filo) aşıldığında **yeni görev başlamaz** — sebebiyle park edilir. Eskiden yalnızca insight üretip görevi yine de başlatıyordu; geçilebilen tavan tavan değildir.

### Köprü

`automations.status` (kapı + her otomasyonun fired/skipped/skipRate + şu an ne ateşlerdi) · `automations.pause {minutes?, reason?}` · `automations.resume` · `automations.quietHours {from,to}` · `automations.bulk {set, kind?, titles?, tag?}`; ayrıca `schedules.add/edit` ve `triggers.add/edit` üzerinde `model` ve `fireIf` argümanları. Bir otomasyonun neden çalışmadığı **tahmin edilmez**, `automations.status` sorulur.

## Çoklu-Ajan İş Akışları

Faz 4'ün en güçlü aracı: **Workflows** — birden çok ajanın sırayla çalıştığı zincirler. Tasks sayfasının **Plan** sekmesinde `+ Workflow` ile kurulur.

**‼️ ZİNCİR BİR LİSTEDİR, BU YÜZDEN FORMU DA LİSTE (3.83.0 · U-9 Faz 2).** Bu iş 294 satırlık bir sihirbazdı: adım 4'ü, adım 1-3'ü hiç göstermeden soruyordu; adım 2'ye dönmenin yolu yoktu; Esc her şeyi çöpe atıyordu. Artık zincirin kendisi sayfada duruyor — okunan, `↑ ↓` ile sıralanan, kopyalanan, silinen ve yerinde düzenlenen bir liste. **Adım eklemek, taşımak ve silmek taslak üzerinde olur**, yani `Cancel` gerçekten iptal eder ve bir yeniden sıralama N ayrı komut değil tek kayıttır. Kaydet düğmesi adın ve zincirin tamamını **tek mesajda** gönderir.

**Bir adım bir karttır ve ne OLDUĞU kartın geri kalanını belirler.** Altı tür: 🤖 **agent** (prompt koşturur), 🌐 **webhook** (HTTP çağrısı, ajansız), 🎬 **media** (fal.ai / Replicate), 🧭 **browser** (ajan siteyi sürer), ✋ **approval** (zincir seni bekler), 🖼 **select** (üretilen varlıkların bir kısmını sen seçersin). Türü değiştirmek kartın yarısını değiştirir; sihirbazda bu **ilk soruydu** ve sonraki her şey ona bağlıydı — bir formda ise adım üçteyken fikrini değiştirebilirsin. Kartın altındaki blok her türde aynıdır, çünkü **zinciri** ilgilendirir, adımı değil: hata politikası (`onFail`), koşullu çalıştırma (`runIf`), çıktı sözleşmesi, hakem ölçütü ve paralellik. Reddi modal değil **kartın içinde** söyler.

`agentfarm.newWorkflow`, `addWorkflowStep`, `editWorkflowStep` ve `renameWorkflow` — paletten, sol panelden, satır menüsünden — hepsi bu formu açar; `addWorkflowStep` kartı boş, `editWorkflowStep` o adımın üstünde açar. Köprüde: `workflows.update` (ad + bütün zincir tek çağrıda), `workflows.step.add` / `.update` / `.move` / `.delete`.

- Bir adım **done** olunca sonraki adım kendiliğinden başlar (farklı ajan olabilir). Adım **failed** olursa zincir durur ve bildirim düşer.
- **Devir mekanizması:** Bir adımın prompt'unda `{prev_output}` yazarsan, önceki adımın arşivlenmiş çıktı dosyasının yolu oraya yerleştirilir. Sonraki ajan o dosyayı okuyarak işe başlar — ajandan ajana gerçek bilgi devri.
- Zincir adımları Tasks görünümünde `Akış adı 1/3: ...` biçiminde numaralı görünür.
- Adımlar için **headless** önerilir (çıktı arşivlenir ve devredilir); interactive adım terminali kapanınca zincir devam eder.

Örnek: "Sabah rutini" = 1. psikolog (headless): "dünkü günlüğü analiz et" → 2. asistan (headless): "şu analizi kullanarak gün planı çıkar: {prev_output}".

### Koşullu Dallanma

0.5.0 ile zincirler düz çizgi olmaktan çıktı — her adım için iki dallanma aracı var (wizard kurulumda sorar):

- **Koşullu çalıştırma (runIf):** Adıma bir regex verirsen, adım yalnızca **önceki adımın çıktısı** bu desenle eşleşiyorsa çalışır; eşleşmezse atlanır ve zincir sonraki adımdan devam eder (çıktı devri bozulmaz). Örnek: psikolog analizi "ALARM" içeriyorsa asistan acil plan yapsın, içermiyorsa o adım atlansın.
- **Hata yönlendirmesi (onFail):** Adım başarısız olursa ne olacağını seçersin: **Stop** (varsayılan — zincir durur), **Continue** (sonraki adıma geç) veya **Jump to step N** (belirli adıma sıçra — örn. temizlik/telafi adımı).

Güvenlik: `onFail` sıçramalarıyla oluşabilecek sonsuz döngülere karşı her çalıştırma **25 adım yürütmeyle** sınırlıdır; sınıra gelen zincir uyarıyla durur.

Örnek akıllı zincir: 1. psikolog: "günlüğü tara" → 2. asistan (runIf: `ALARM`): "acil müdahale planı: {prev_output}" → 3. genel (her zaman): "günü arşivle" (onFail: Continue).

### Doğrulayıcı Adımlar (Verify)

Gece koşan işe güvenin anahtarı (0.8.0): headless bir adıma **doğrulama ölçütü** verirsen, adım bitince ucuz bir "hakem" çağrısı (haiku — `judgeArgs` ayarı) çıktıyı ölçüte göre PASS/FAIL değerlendirir:

- **PASS** → zincir normal ilerler; karar, çıktı arşivinin sonuna yazılır (`Verify (attempt 1): PASS — …`).
- **FAIL** → adım, hakemin gerekçesi prompt'a eklenerek **yeniden denenir** (`retries`, varsayılan 1). Denemeler tükenirse adım failed sayılır ve onFail yoluna düşer.

Görev satırında `verify pass/fail` rozeti görünür. Hakem çağrıları da ajanın oturum kayıtlarına düştüğü için maliyetleri karneye otomatik yansır.

### Yapılandırılmış Devir (JSON)

`{prev_output}` (dosya yolu) ve `{prev_text}` (çıktı metni) yanında artık **alan bazlı devir** var (0.8.0):

1. Adımın **output contract**'ını JSON yap → adım `--output-format json` ile koşar.
2. Modelden JSON isteyen bir prompt yaz (çite sarsa da, düz yazının içine gömse de ayrıştırıcı toleranslıdır).
3. Sonraki adımda `{prev_json.alan}` (iç içe: `{prev_json.a.b}`) gerçek değerle değiştirilir.
4. Koşullarda `json:alan~regex` sözdizimi: `runIf: json:durum~ALARM` — metin tesadüflerine takılmadan alan üstünden dallanır.

### Paralel Adımlar (Fan-out / Fan-in)

Bağımsız işleri aynı anda koştur, sonra sonuçları birleştir (2.20.0). Bir adımı **parallel** işaretlersin (sihirbazda "Parallel" seçeneği ya da Edit Step → Parallel); **ardışık parallel adımlar bir grup** oluşturur.

- **Fan-out:** zincir gruba gelince grubun TÜM adımları aynı anda, aynı besleme (handoff) ile başlar. (Gerçek eşzamanlılık `maxConcurrentTasks`/`maxConcurrentPerAgent` ayarlarının izin verdiği kadar; aksi halde sırayla ama yine grup olarak biterler.)
- **Fan-in:** grubun tüm dalları bitince çıktıları **tek beslemede birleşir** ve gruptan sonraki adıma geçer. `{prev_text}` = her dalın çıktısı başlığıyla etiketli; `{prev_json.branches}` = `[{step, text, json}]` dizisi. (Birleşik beslemenin tek dosyası yoktur — `{prev_output}` fan-in'de boştur.)
- **Dal koşulu:** her dalın kendi `runIf`'i olabilir; tutmayan dal sessizce atlanır (grubu düşürmez).
- **Grup hatası:** bir dal bile başarısızsa grubun **ilk adımının onFail**'i uygulanır (stop/continue/jump).
- Grup üyeleri Tasks ağacında ∥ (mor git-merge ikonu) ile işaretlenir.
- **Uyarı:** koşan bir grup VS Code kapanırsa (in-flight run durumu bellekte tutulur) fan-in tamamlanmaz — bu mevcut workflow-run davranışıyla aynıdır. Onay/webhook/media/browser adımları da bir grupta yer alabilir; tek istisna, insan-onay adımı grup içinde beslemeyi geçirmez (kendi APPROVED notunu katar).

### Onay Adımı (İnsan Kapısı)

Zincire bir **Approval gate** koyarsın (2.19.0): o adıma gelince zincir DURUR ve senin onayını bekler — ajan yok, model çağrısı yok. New Workflow sihirbazında **$(check) Approval gate** seçeneği; isteğe bağlı bir mesaj sorar (`{prev_text}`/`{prev_json.x}` çözülür).

- Onay isteği hem bildirim olarak hem de **Needs You** panelinde çıkar (aynı istek, ilk cevap kazanır) — Approve/Reject.
- **Approve:** bir önceki adımın çıktısı (handoff) olduğu gibi sonraki adıma geçer — onay notu araya girmez.
- **Reject:** adımın **onFail** politikası uygulanır (varsayılan: zinciri durdur; Edit Step ile continue/jump yapabilirsin).
- Onay adımı Tasks ağacında görünür bir satırdır (`approval`), çıktı arşivine APPROVED/REJECTED damgası düşer.
- **Uyarı:** onay kapısı yalnızca VS Code açıkken çalışır; headless serviste (sen yokken) kapı otomatik onaylanır ki zincir asılı kalmasın.

### Görsel Seçim Adımı (Dalga B)

Üretimin kalbi: **8 aday görselden 2'sini seç, yalnız onlarla devam et.** Zincire **$(checklist) Select assets (visual pick)** adımı koyarsın (2.24.0): o adıma gelince, run'ın o ana kadar ürettiği tüm varlıklar bir **galeri-picker** panelinde açılır; kaç tane tutacağını seçersin (min veya min-max).

- Sihirbaz sorar: başlık, picker mesajı (`{prev_text}`/`{prev_json.x}` çözülür), kaç tane tutulacak (`2` ya da `1-3` ya da boş = en az 1).
- Panelde adaylara tıklayıp seçersin; min sağlanana kadar **Use selected** pasiftir, max'a ulaşınca fazlası engellenir.
- **Seçilenlerin URL'leri handoff olur:** sonraki adım `{prev_json.selected.0}` (tek URL) veya `{prev_text}` (satır satır tüm seçilen URL'ler) ile yalnız seçilenlerle çalışır. Kritik incelik: yerel dosya yolu değil, modelin ürettiği **uzak URL** akar — böylece bir sonraki fal.ai adımı (görsel→video) doğrudan tüketir.
- Seçilmeyenler galeride `✗ dropped`, seçilenler `✓ kept` rozetiyle işaretlenir.
- **Cancel:** adımın **onFail** politikası uygulanır. Tasks ağacında görünür `select` satırı; headless'ta (UI yoksa) hepsi tutulur ki zincir asılı kalmasın.

Tipik zincir: *ajan prompt yazar → media (4 aday üret) → **görsel seçim (2 tut)** → media (görsel→video, `{prev_json.selected.0}`)*.

### Workflow Düzenleme

Kurulu bir zinciri silip yeniden kurmana gerek yok (0.7.0):

- **Workflow üzerinde:** satırdaki `edit` — adı ve **bütün zinciri** açar. Bir akışın "düzenle"si eskiden `addWorkflowStep`'ti, yani bir akışta yapılamayan tek şey onu düzenlemekti; ve ad için ayrı bir "Rename" girişi vardı. İkisi de tek girişte birleşti (3.83.0).
- **Adım üzerinde:** formdaki `edit` — o adımın kartını açar. Eskiden bu bir **alan adları quickpick'iydi**: "On fail"i seç, tek kutuyu yanıtla, bir sonraki alan için menüyü baştan aç; bir medya adımında on beş giriş derinliğinde ve iki alanı aynı anda görmenin yolu yok. `↑ ↓ copy ✕` satırın üzerindedir.
- Değişiklikler **kaydedince** kalıcı olur ve bir sonraki çalıştırmada geçerlidir; süren bir koşuyu etkilemez.

### Zincirlerin Görselleştirilmesi

Live Timeline'da artık **Workflow runs** bölümü var: son 4 saatte koşan her zincir kendi şeridinde, adımlar numaralı bloklar halinde — yeşil = bitti, mavi = çalışıyor, kırmızı = başarısız. Bloğun üzerine gel: adım adı, ajan ve süre. İki ajanın birbirine iş devrettiğini kelimenin tam anlamıyla izlersin.

## Missions {#missions}

İş akışları önceden çizilir: her adım, dal ve sıçrama koşu başlamadan sabittir. **Mission** (2.62.0) bunun tersidir — bir **hedef**, bir **lead ajan** ve bir **ekip** verirsin; sıradaki adımın ne olacağına **çalışma anında**, tur tur, önceki sonuçlara bakılarak karar verilir. "Orkestratör analiz eder, coder yazar, reviewer inceler, tester testleri koşar, lead hepsini birleştirir" — bunu önce DAG olarak çizmeden. Başarısız bir delegasyon misyonu öldürmez; lead'in üzerine yeniden plan kurduğu bilgidir.

**Nasıl çalışır.** `Agent Farm: Missions` (her sayfanın üst araç çubuğundaki **Missions** düğmesi ya da sol paneldeki **Missions** bölümü — 2.63.0) → **+ New Mission**. Eklenti sonra bir planlayıcı döngüsü sürer:

1. **Lead ajan** headless çağrılır; brifing: hedef, ekip listesi (adlar + senin rol etiketlerin + her ajanın kendi CLAUDE.md'sinden bir kimlik satırı), kalan bütçe ve katı bir JSON karar şeması.
2. Lead her turda tek kararla yanıt verir: **delegate** (ekip ajanlarına işler; her biri kendi kendine yeten prompt + başarı ölçütüyle), **ask_user** (sana bir soru) ya da **finish/abort** (hüküm + özet).
3. Delegasyonlar **sıradan headless görev** olarak koşar — Tasks görünümünde görünür, çıktıları arşivlenir, maliyetleri ölçülür, kota/eşzamanlılık frenleri uygulanır. Hiçbir şey yeniden icat edilmez.
4. Sonuçlar (durum, maliyet, her çıktının özü, tam arşivin yolu) **aynı planlayıcı oturumuna** geri beslenir (`claude -p --resume`) — lead bağlamını ve prompt cache'ini turlar boyunca korur. Resume ölürse eklenti tarafındaki kompakt defter taze oturumu yeniden tohumlar.
5. Lead bitirene — ya da bir limit bitirtene — kadar tekrar.

**Katı limitler — asla modelin insafına değil.** Her misyonun bütçesi vardır: azami maliyet, tur, görev, dakika (seni beklerken geçen süre sayılmaz) ve paralel delegasyon. Biri tükenince planlayıcıya **yalnız-bitir turu** verilir: delegate reddedilir, dürüst bir hükümle (`success / partial / failed`) kapanmak zorundadır. Aynı işi aynı ajana ikinci kez göndermek engellenir (planlama-döngüsü kilidi); mutlak bir planlayıcı-çağrı tavanı her şeyi yedekler.

**Onay modları.** Varsayılan **each round**: turun delegasyonları **Needs You**'ya (ve bir toast'a) Approve/Reject ile düşer — ret, lead'e geri beslenir ve yeniden planlar. **auto** kapısız koşar; katı limitler yine geçerlidir. `ask_user` soruları da Needs You'ya (Answer…) ve panele düşer; sen yanıtlayana kadar duvar saati durur.

**Workdir emniyeti.** Misyona bir workdir ver — her delegasyon onun içinde koşar ve **iki yazıcı asla paralel koşmaz**: planlayıcının `readonly` işaretlediği adımlar (araştırma, inceleme) aynı dalgayı paylaşabilir, yazıcılar sıraya alınır.

**Planlayıcı planlar — işi yapmaz (2.64.0).** Lead'in planlama çağrısı bir *karardır*, çalışma oturumu değil; ve bu güvene değil mekaniğe bağlanmıştır: planlayıcı çağrılarında yazma araçları (Edit/Write/Bash/…) kapalıdır, keşfe dalıp kaybolan lead'i sert bir tur tavanı durdurur (tur düşmeden önce aynı oturumda bir kez "ŞİMDİ karar ver" dürtmesi denenir) ve zaman aşımına uğrayan çağrı gerçekten öldürülür — süreç ağacıyla birlikte — arka planda faturaya devam etmez. Brifing aynı şeyi sözle de söyler: *eforu hedefe göre ölçekle; küçük hedef = tek kısa tur.* Derin araştırma gerekiyorsa `readonly` delegasyon olur — orada izlenir ve bütçelenir.

**Kim hangi modelle koşar (2.64.0).** Üç katman, en özel olan kazanır: **Planner model** alanı lead'in planlama çağrılarını sabitler; her ekip üyesinin **model** alanı o üyenin delegasyonlarını sabitler; boş bırakılan her şey önce genel **model-policy kurallarına** (Farm Settings), en son ajanın kendi varsayılanına düşer. "Akıllı model planlasın, ucuz modeller çalışsın" tek formluk iş — seçilen modeller koşunun ekip çiplerinde ve her görevin çıktı başlığında görünür.

**Kim hangi uç noktayla koşar (3.534.0–3.537.0, X-107).** Aynı biçim **rota** için de geçerli — bir Claude delegasyonunun gerçekten konuştuğu uç nokta (Anthropic, bir Kimi profili, MiniMax…), ki motorun kendisi bunu asla söylemez. Her ekip satırında bir **Route** kutusu ve tier sunan bir rotanın altında bir **Tier** kutusu var (`opus` bir rotada `kimi-k2-thinking`, ötekinde `MiniMax-M2`dir; bu yüzden tier rotasının altında sorulur ve rota değişince düşer); **Orchestrator** bloğu planlayıcının çağrıları için kendi çiftini taşır; **Apply profile** ikisini de dahil edilen her satıra yazar. Boş, önceki her misyonun yaptığı şeydir: misyonun kendi rotası, sonra spawn anında ajanın duran kaydı. Makinenin işaret edemeyeceği bir rota misyonu daha var olmadan adıyla reddeder, üçüncü turda değil. Yalnız motorun rotası varsa çizilir — rotası olmayan motorda satır o yuvada `—` gösterir ki sütunlar sütun kalsın.

**Nefes aldığını görürsün.** Koşu aktifken sayfada canlı bir **now şeridi** vardır — *lead is planning round 2 · 1m 40s*, *round 2: running coder + reviewer (wave 1/2)* — motorun zaten yazdığı durum olaylarından beslenir (koşuya sıfır ek yük). Sol paneldeki koşu satırı da aynı satırı taşır.

**Mission control — her şey tek yerden (2.67.0).** Koşu sayfası, misyon uçuştayken tam bir gözlem odasıdır; tamamı eklentinin zaten elinde olan veriden kurulur (hook olayları, görev çıktıları, oturum index'i — yeni poller yok):

- **Live activity** (açılır-kapanır, now şeridinin altında): başlıkta katılımcı-başına durum çipleri — *lead (lead): working · coder: tool (Edit) · reviewer: quiet* — altında misyona-özel hook olay akışı (prompt'lar, araç başlangıç/bitişleri, **izin beklemeleri vurgulu**), en yenisi üstte, sadece bu koşunun ajanları ve bu koşunun başlangıcından itibaren. Transkripti olan her satır **tek tıkla oturum görüntüleyicide tam o âna** gider. Açık sayfa saniyede en fazla bir kez tazelenir; boşta duran çiftlik hiçbir bedel ödemez.
- **Adım akordeonu — kime ne dendi, ne cevap verdi:** herhangi bir delegasyon satırına tıkla: lead'in gönderdiği **tam prompt** (başarı ölçütleriyle) ve çıktı kutusu — adım koşarken **canlı tail** (3 sn'de bir tazelenir, host dosyanın sadece son KB'lerini okur), bitince son çıktının kuyruğu olur; yanında tam-dosya bağlantısı. Aynı anda tek adım açılır — tail sorgusu sınırlı kalır. Koşan adımın satırında ajanının canlı çipi de görünür (*tool (Bash)*).
- **Planner transcript** bağlantısı koşu başlığında: lead'in tüm konuşması — brifingler, düşünceler, kararlar, tur sonuçları — oturum görüntüleyicide açılır.
- **Ledger** (açılır-kapanır, turların altında): planlayıcının tur-başına-tek-satır sıkıştırılmış tarihi — resume edilen planlayıcıya yeniden verilen brifingin ta kendisi.
- **Zengin bütçe satırı:** maliyet, tur, **görev ve dakika** harcanan/limit tek bakışta.

**Panelin geri kalanıyla tek tasarım dili (2.68.0).** Missions sayfası artık kendi tarzını değil, eklentinin yerleşik dilini konuşur: **koşu listesi akordeondur** — tıklanana kadar sade satırlar (**Tokens** kolonuyla), tıklayınca tam detay satırın altında açılır; listenin üstünde viewer'ın chip kontrolleri (**Expand all / Collapse all / Single-open**); hiçbir şey kendiliğinden açılmaz. Her **tur, oturum görüntüleyicinin turn bandı olarak** çizilir — caret, renkli bant, kalın `R2`, aksiyon etiketi, bant başlığında planlayıcının düşüncesi ve sağa yaslı `token · maliyet · saat` istatistikleri (katlanmış bant `N delegation(s)` özeti gösterir); tıkla → katla/aç. **Token, maliyetin aktığı her yere akar:** planlayıcı zarfının usage'ı tura, delegenin oturum token'ları aynı maliyet-eşleme mekanizmasıyla adıma, koşu toplamları liste satırına ve bütçe satırına düşer. Durum rozetleri (`done`, `failed`, `running`, beklemeler) **outline stile** geçti — sayfa arkaplanı üstünde renkli çerçeve + renkli metin — açık ve koyu temada aynı okunurluk. Ve publisher/eklenti-kimliği değişimi eski kayıtları artık ortada bırakmaz: önceki globalStorage kimliği altındaki görev/misyon çıktı yolları **açılışta bir kez taşınır**.

Cila (2.69.0): **turlar kendi akordeon chip'lerine kavuştu** — çok turlu her koşuda turların üstünde Expand all / Collapse all / Single-open; uzun misyon tek tıkla katlanır. Tur bantları viewer'ın çiftli `N tok · $x` istatistiğini her zaman gösterir; sayısal kolonlarda başlık ve değer birlikte sağa yaslanır; ve **token rakamları, token'dan önce kaydedilmiş koşular için geriye doldurulur** — her adım eşleşen transkriptinden, koşu toplamı planlayıcının kendi oturumundan.

Zengin koşu satırları (2.70.0): her liste satırı artık misyonunu karakterize eder — lead **+ ekip sayısı**, turlar `R3/8` harcanan/limit, kırmızı `N✕` başarısız rozetli **Tasks kolonu** ve "done" yanında **hüküm rozeti** (`partial`/`failed`). Satırın üzerine gelince **tam tooltip** açılır: hedef, rol/modelleriyle ekip listesi, beş limitin tamamı, delegasyon ve süre rakamları ve **token'ı kim yedi** — ajan-başına yüzde dağılımı. Aynı dağılım açık detayda bütçe barının altında `tokens by agent: lead %62 · coder %28…` satırı olarak da çizilir (tooltip'i ham token sayılarını taşır).

Sıralama & filtreler (2.71.0): koşu listesi sessions tablosunun **Sort by** kontrolünü benimser — Recent, Status (aktif önce), Verdict, Mission A–Z, Lead A–Z, Team size, Rounds, Tasks, Failed tasks, Tokens, Cost, Duration — yön çevirme chip'iyle (string kriterler A–Z başlar, sayısallar büyük-önce). Yanındaki **Filters** chip'i aynı kriterler üzerinde gelişkin bir panel açar: status ve verdict için **seçim chip'leri**, **lead / ekip-üyesi dropdown'ları**, token, maliyet, tur, görev ve dakika için **min–max aralıkları** ve **başlangıç-tarihi aralığı** — serbestçe birleşir, canlı `N/M runs` sayacı, dürüst "No runs match" satırı ve tek tıkla **Clear**. Sıralama, yön ve filtreler reload'da korunur.

**Dürüst geri bildirimli Pause.** Pause hiçbir zaman aktiviteyi ortasından kesmez — süren planlayıcı çağrısı ya da dalga önce biter. 2.64.0'dan beri isteğin kendisi görünürdür: düğme basılı **Pausing… (undo)** hâline geçer, bir bekleme şeridi ne olacağını anlatır; tekrar tıklamak isteği geri çeker. Park edildikten sonra **Resume**, toplanan sonuçları lead'in kendi oturumuna geri besler.

**Kesintiler ve hatalar.** Pencere yeniden yüklenirse koşan misyonlar *paused* olarak park edilir; Needs You **Resume** sunar — delegasyon durumları görev kayıtlarından yeniden toplanır ve lead kendi oturumunda devam eder. İptal her an mümkündür; iptal, koşan delegasyonları da iptal eder. **Başarısız** biten koşu asla sessizce düşmez: neden (zaman aşımı, geçersiz planlayıcı cevabı, bütçe durdurması…) kapanış bildiriminde, koşu sayfasındaki kırmızı bantta ve sol paneldeki tooltip'te yazar.

**İyi bir lead'i ne yapar:** CLAUDE.md'si işi kendisi yapmak yerine planlayıp delege ettiğini söyleyen bir ajan — ör. *"Çok-ajanlı misyonları yönetirsin: hedefi parçala, kendi kendine yeten prompt'lar ve kabul ölçütleriyle delege et, sonuçları şüpheyle değerlendir, bütçeyi yakmaktansa kısmi sonuçla bitirmeyi tercih et."* Ekip üyelerinin yanına yazdığın rol etiketleri ("coder", "reviewer", "tester", "researcher", "git") lead'e ipucu olarak ulaşır.

Panel her koşuyu tur tur gösterir — lead'in gerekçesi, delegasyon tablosu (durum / maliyet / çıktı bağlantıları), soru-cevaplar, bütçe barı ve nihai hüküm. Kapanış özeti bildirim ve `mission` webhook olayı olarak da dışarı gider.

**Sol paneldeki Missions bölümü (2.63.0)** aynı takibin ağaç hâlidir — Tasks ile Recent Sessions arasında. Her koşu durum/hüküm ikonu, tur sayısı (`R3/8`), harcanan dolar ve yaşıyla listelenir; genişletince turlar ve her turun delegasyonları (durum, maliyet — tıkla → arşivlenmiş çıktı) görünür. Onay bekleyen tur ve lead'in sorusu **eyleme dönük satırlar** olarak en üste düşer: Approve/Reject ve Answer doğrudan satırdan. Satır eylemleri: Pause / Resume / Cancel, **Run again** (aynı hedef-ekip-limitlerle yeni koşu, onaylı) ve **Delete run**. Koşuya tıklamak tam Missions sayfasını açar.

### Klasik ve Adaptif Misyonlar (Classic vs. Adaptive)

Misyon motoru iki temel orkestrasyon modu sunar: **Classic (Klasik)** ve **Adaptive (Adaptif)**. Bunlar birbirinin iyi/kötü zıddı değil; farklı problem türleri, karmaşıklık düzeyleri ve yürütme gereksinimleri için tasarlanmış iki ayrı çalışma felsefesidir.

Aşağıda iki modun çalışma prensipleri arasındaki 5 temel mimari fark ve seçim kriterleri detaylandırılmıştır:

#### 1. Ajanlar Arası Çıktı Aktarımı ve İnceleme Hattı (Artefact Pipeline & Review)
* **Klasik Misyon:** Sıralı delegasyonlar şeklinde çalışır. Lider, A ajanına bir görev verir; A ajanı işi bitirdiğinde lider B ajanına yeni bir görev verirken A ajanının ürettiği dosya yollarını (`outputRef`), kod diff'lerini veya metin çıktılarını B ajanının sistem bağlamına otomatik olarak bağlayan bir veri hattı yoktur. Liderin önceki çıktıları kendi hafızasında tutup sonraki ajanın prompt metnine elle yapıştırması gerekir. Bu durum, turlar uzadıkça planlayıcı bağlamının şişmesine ve liderin çıktı ayrıntılarını unutmasına yol açabilir.
* **Adaptif Misyon (`review`, `compare`, `revise`):** İlk sınıf bir çıktı aktarım hattına sahiptir. Lider sadece `review { target: "task-1" }` veya `revise` dediğinde, motor arka planda 1. görevin ürettiği gerçek çıktı dosyasını ve diff'ini alarak incelemeyi yapacak uzmanın önüne otomatik olarak serer. İki farklı ajanın alternatif çözümleri `compare` ile yan yana koyulup kıyaslatılabilir; beğenilmeyen bir çıktıda ise sıfırdan başlamak yerine yalnızca hedefli düzeltme (`revise`) istenebilir.

#### 2. Eşzamanlılık ve Paralel Çalışma Yeteneği (Parallel Waves)
* **Klasik Misyon:** Her planlama turunda yalnızca tek bir sıralı delegasyon çalıştırır. Lider aynı anda 3 bağımsız iş yaptırmak istese bile (örneğin biri veritabanı şemasını araştırırken, diğeri frontend arayüz taslağını çıkarsın, üçüncüsü test senaryolarını hazırlasın), sistem bunları tek tek sıralı kuyruğa alır; biri tamamen bitmeden diğeri başlayamaz.
* **Adaptif Misyon (`parallel`):** Dinamik dalga yöneticisi (`planWaves`) sayesinde, birbirini beklemeyen bağımsız işleri aynı planlama turunda eşzamanlı dalgalar halinde başlatabilir. Aynı çalışma dizininde (workdir) dosya çakışmasını önleyen tekil yazıcı (single-writer) güvenlik kilitlerini korurken, salt-okunur veya bağımsız yazma alanlarına sahip görevleri paralel koşturarak toplam süreden ciddi tasarruf sağlar.

#### 3. Önceden Tanımlı İş Akışlarının Orkestrasyonu (Workflow Chains)
* **Klasik Misyon:** Agent Farm içinde önceden kaydedilmiş çok adımlı hazır "Workflow" zincirlerini (örneğin: *Kodu Derle → Test Çalıştır → Lint Yap → Paketle*) doğrudan bir bütün olarak çağıramaz. Lider bir akışı işletmek istediğinde, her bir adımı ayrı ayrı turlarda tek tek elle delege etmek zorunda kalır; bu da gereksiz tur ve token harcanmasına sebep olur.
* **Adaptif Misyon (`run_workflow`):** Var olan hazır workflow zincirlerini tek bir atomik adım olarak başlatabilir (`runId` üzerinden). Workflow arka planda kendi adımlarını sırayla tamamlar ve zincirin en son devrettiği nihai çıktıyı (final handoff) lidere tek parça halinde teslim eder.

#### 4. Hiyerarşik ve İç İçe Alt Hedefler (Nested Missions)
* **Klasik Misyon:** Tek düz bir döngüden (flat loop) ibarettir. Lider karmaşık ve çok yönlü bir hedefle karşılaştığında, bu hedefin bağımsız bir alt dalını (örneğin derin bir araştırma veya bağımsız bir alt bileşen geliştirmesini) kendi lideri ve turları olan ayrı bir alt çalışma grubuna devredemez; her şeyi tek bir ana döngünün içine sıkıştırmak zorunda kalır.
* **Adaptif Misyon (`run_mission`):** Karmaşık bir hedefin alt parçasını, kendi lideri, başarı kriterleri ve turları olan bağımsız bir "Çocuk Misyon"a devredebilir. 3 seviyeli derinlik sınırı ve döngüsel çağrı engeli (cycle guard) ile sonsuz döngülere karşı korunur; çocuk misyon ana hedefin kalan bütçesinden beslenir ve işi bittiğinde ana lidere net bir karar/hüküm (verdict) sunarak kapanır.

#### 5. Gerçek Ajan-Ajan Konuşması
* **Classic Mission:** Ajanlar birbirine hiç hitap etmez. Lead işi dışarı verir, sonuçları geri okur; bir tartışmaya en yakın şey, lead'in üç bağımsız cevabı okuyup kendi anlatısını yazmasıdır — ve bu, hiç yaşanmamış bir tartışmanın sonucu gibi okunur.
* **Adaptive Mission (`message`):** Amacı ve katılımcı kadrosu belli bir **conversation** açar ve içindeki her tur gerçek bir konuşma turudur: `from` alanında adı geçen ajan sıradan bir headless delegasyon olarak koşar ve `refs`'te sayılan mesajların **gerçek metnini** görür. Lead'in "biri şunu demişti" diye kendi ifadesini geçirebileceği bir alan yoktur. Birinin söylediği bir şey *hakkında* olan mesaj (`challenge`, `response`, `concede`, `synthesis`, `vote`) dayandığı mesaj kimliklerini adlandırmadıkça reddedilir; böylece hiçbir şeye atıf yapmayan bir "synthesis" kayda giremez. Bir konuşmada aynı anda tek katılımcı konuşur, farklı katılımcılar ise aynı anda konuşabilir — bağımsız ilk tur tam olarak budur. Her konuşmacıya **odada başka kimlerin olduğu ve turun hangisi için olduğu** söylenir: `to` kaydın kendi alanıdır ve boş olması "herkes" demektir, dolayısıyla `Ada → Rev, Cy` diye okunan bir satır, konuşmacıya gerçekten verilmiş bir hitabı anlatır — yalnızca transkriptin bildiği bir hitabı değil. **Arada hiçbir şey söylenmemişken aynı turun yeniden sipariş edilmesi adıyla reddedilir**: tekrarlanan bir konuşma turu farklı bir prompt üretir (devam ettirilen şerit kendi ön sözünü taşır), bu yüzden genel planlama-döngüsü koruması onu göremez ve lead aynı turu tur tur satın alabilirdi; *başarısız* bir turdan sonraki yeniden deneme tekrar değildir, çünkü teslim edilmiş bir şey yoktur. **Ve temiz dönüp içi boş olan tur yalnız mesajı değil adımı da düşürür**: tur mesajı adım durumundan üretildiği için, konuşmacısı hiçbir şey söylememiş bir lead'e daha önce başarılı bir tur gösteriliyor ve retry · revise · replan · skip · ask_user · partial seçenekleri hiç sunulmuyordu. Aynı ajan tekrar konuştuğunda, motorun resume sözlüğü varsa kendi oturumu devam ettirilir; yoksa konuşmacıya alışveriş metin olarak verilir ve tur `resumed` değil `handoff` diye etiketlenir. Turlar arasında lead'e sınırlı bir **digest** verilir (hâlâ cevapsız olanlar, son birkaç tur, adlandırabileceği kimlikler) — bütün transkript değil: planner oturumu her tur resume edildiği için oradaki bir transkript, koşunun geri kalanında tur başına bir kez ödenirdi. Tam metni okuyucular `missions.conversation` ile alır.

#### 6. Council — kürsüsü olan bir tartışma, tartışma motoru değil
* **Classic Mission:** böyle bir şey yok. Lead sonuçları okur ve onlara dair kendi anlatısını yazar.
* **Adaptive Mission (`council`):** **kürsüsü, tavanı ve adlandırılmış bir çıkışı olan bir conversation** açar — başka hiçbir şey değil. Yerleşik bir tartışma protokolü yoktur: "1. tur A, 2. tur B, 3. tur sentez" henüz kimsenin yaşamadığı bir tartışma hakkında bir tahmindir ve ikinci konuşmacı daha ilk cümlesinde teslim olsa bile 2. ve 3. turlar yine satın alınır. Sıranın kimde olduğu ve neyin konuşulacağı her tur, gerçekten söylenmiş olandan karar verilir — sıradan `message` primitive'iyle. Böylece bir council'ın turları katılımcı kilidinden, ref denetiminden, şerit dürüstlüğünden ve tekrar korumasından diğer her konuşma turuyla aynı şekilde geçer. Council'ın eklediği şey, kaydın kendi başına söyleyemediğidir: settle ettiği **soru** (hedeften daha dar), **kürsü**, bir **tur tavanı** ve **yedi adlandırılmış çıkış** (`consensus · sufficient evidence · no new information · decision clear · need execution · hard limit · chair abort`). ‼️ Kendinden başka bir kürsü adlandırırsan lead **kürsünün çağırmadığı bir turu sipariş edemez** — başkasının turu kürsünün son mesajını `refs`'te adlandırmak zorundadır; konuşmacı böylece lead'in aktarımını değil kürsünün gerçekten yazdığını okur. Açılış turu tek istisnadır, çünkü henüz atıf yapılacak bir şey yoktur. Tavan tartışmayı durdurur, bitişi değil: tavanı aşan tek bir tura izin verilir, o da yalnız kapatıyorsa. **Oylama opsiyoneldir ve tercih, oy verenin kendi sözcüğüdür** — turun gerçek metninden, council'ın adlandırdığı seçeneklere karşı okunur; hiçbirini adlandırmamışsa en olası seçeneğe çözülmez, `unclear` yazılır ve beraberlik beraberlik olarak raporlanır. ‼️ **Bir council kendi sorusuna karar verir, hedefe asla**: çoğunluk üyelerin ne düşündüğüdür ve bir success criterion'u yalnız `evaluate` verdict'i yargılar. Okuyucular bütün kaydı — manda, harcanan turlar, cevapsız uçlar, oylar, çıkış — `missions.council` ile alır.

#### 7. Hata Toleransı ve Stratejik Esneklik (Failure Taxonomy & Resilience)
* **Klasik Misyon:** Bir ajana görev verildiğinde o ajan beklenmedik bir komut hatası veya çıkış koduyla (exit code 1) kapandığında, motor bunu doğrudan "Tüm Misyon Çöktü (Fatal Fail)" kabul eder ve hedefi kapatır; lider ajana hatayı değerlendirip stratejisini değiştirme fırsatı tanımaz.
* **Adaptif Misyon (`missionFailure`):** Ajan veya alt sistem hatalarını 9 kapalı sınıfa ayırır (motor reddi, bütçe kısıtı, ajanın bulunamaması, komut başarısızlığı vb.). Hata olduğunda misyonu hemen öldürmek yerine lidere hatanın sınıfını, denenmiş işi ve tavsiye edilen kurtarma yolunu sunar. Lider elindeki delile bakarak: *"Aynı modelle tekrar dene"*, *"Daha yetenekli başka bir model/ajan seç"*, *"Hedefi revize et"* veya *"Kullanıcıya danış"* kararlarından birini vererek görevi kurtarabilir.

#### 8. Kullanıcı yüzeyi — tek Missions odası, iki çalışma türü (U-64)
* **Klasik Misyon:** formun bugüne kadar sorduğu tek şey buydu — lead, ekip, turlar, limitler. Adaptif bir hedef ancak köprüden başlatılabiliyordu.
* **Adaptif Objective:** aynı sayfa, aynı form, başında kalıcı bir seçim. ‼️ **Klasik varsayılandır ve hiçbir şeyi değişmez**: alanları, DOM'u ve gönderdiği mesaj aynıdır ve klasik bir Start **hiç `mode` anahtarı göndermez** — host `adaptive` dizesinden başka her şeyi klasik okur, dolayısıyla anahtarın yokluğu cevabın kendisidir. Adaptif tarafta temel görünüm bir sonucun üç sorusunu sorar (**ne elde etmek istiyorsun**, run'ın **yapmaması gerekenler**, sonucun **nasıl yargılanacağı**); zaten varsayılanı olan her şey — lead, havuz, workdir, limitler, motorlar, onay kapısı — **Advanced** katının altındadır. Kriter varsayılan olarak `required`'dır (kimsenin başarısız olamayacağı bir hedef, hedef değildir) ve her biri koşu boyunca değişmeyen kimliğini (`c1`, `c2`…) taşır; sonraki her evaluation ona bu adla atıf yapar. **Mod değiştirmek formu önce okur:** öteki modda yazılan hiçbir şey silinmez, yalnız gizlenir. **Model ve efor kutuları artık hangi motorda olduklarını bilir** — satırın motoru değişince o motorun canlı kataloğu model kutusuna düşer, efor yeteneği olmayan bir motorda efor kutusu ölü çizilir ve bunu hangi motorun kararlaştırdığını söyler.
* **Adaptif koşu detayı** klasik koşuda hiç olmayan yedi bölüm açar — her birinin tek konusu vardır ve hiçbir olgu ikisinde birden yazmaz: **Objective** (her kriterin, başarı kapısının kullandığı bayatlama kuralıyla okunan güncel hükmü), **Strategy** (yürürlükteki yaklaşım + ‼️ her revizyonun **neden** kesildiği — bu yarı yalnızca journal'da vardır), **Guide next decision** (tek seferlik steer; **nereye** indiğini açıkça söyler: bir sonraki planner sınırı, asla şu an koşan delegasyon), **Cast** (lead'in runtime'da **bağladığı** roller — adaptif bir koşunun "ekip"inin olgu olduğu tek yer), **Conversations** (gerçekten söylenmiş mesajları sayan tek satırlık özet), **Evaluations** (bayat olanlar dahil bütün hükümler) ve **Runtime graph** (gerçekte olan, düğüm düğüm, her düğümün fan-in'iyle — hiçbiri önceden çizilmemiştir). ‼️ **Lead'in gizli düşünme zinciri çizilmez**; gösterilen her cümle kayda geçmek üzere söylenmiş bir cümledir. Dürüst bir kapanış artık **ulaşamadığını da adlandırır** — başarı kapısının reddettiği kriter kimliklerini.

---

#### Hangi Durumda Hangisi Tercih Edilmeli?

* **Ne Zaman Klasik Misyon?**
  Hedefin baştan net, doğrusal ve az adımlı olduğu durumlar için en yalın çözümdür. Örneğin tek bir uzmanın (developer) 2-3 tur içinde sıralı adımlarla tamamlayabileceği, karmaşık alt akışlara, çapraz kod incelemelerine veya paralel araştırmalara ihtiyaç duymayan görevlerde minimum orkestrasyon yükü ve öngörülebilir bir maliyet sağlar.

* **Ne Zaman Adaptif Misyon?**
  Birden fazla uzmanın birlikte çalışmasını gerektiren, bir ajanın yazdığı kodun diğeri tarafından denetlenmesi veya kıyaslanması gereken, eşzamanlı paralel araştırmaların yürütüleceği, hazır workflow'ların devreye gireceği ya da belirsizliğin yüksek olup stratejinin turlar ilerledikçe dinamik olarak yeniden şekilleneceği kapsamlı ve kritik projeler için idealdir.




## Otonom Nöbet Sistemi — Çoklu Hesap Rotasyonu ve Kampanyalar (Sentry) {#otonom-nobet}

*(3.373.0 — 3.531.0, X-167, X-309 ailesi)* Uzun soluklu projelerde ve gece boyu süren geliştirme döngülerinde tek bir Claude veya Codex hesabının 5 saatlik kullanım kotası (~%85-90) veya haftalık tavanı tükendiğinde sistemin durmaması, nöbeti devralan diğer hesaplara ve motorlara kesintisiz geçebilmesi için **Otonom Nöbet (Sentry)** motoru inşa edilmiştir.

### Nöbet Mimarisi ve Temel Aktörler

Otonom nöbet, sıradan bir zamanlanmış görev değildir; kendi durumunu, kotasını ve çalışma ortamını izleyen canlı bir orkestrasyondur:

1. **Nöbet Lider Ajanı (`X-191`):** Nöbet başladığında lider ajan (varsayılan `developer` veya `manager`) uyanır. İlk yaptığı iş transkriptleri, git geçmişini ve son devir notlarını (`handover notes`) okuyarak projenin o anki durumunu kavramaktır (`plans/2026-09-05-x191-sentry-leader.md`). Durumu özetler, sıradaki adımları belirler, işleri alt ajanlara delege eder veya kendisi yürütür; ardından bir sonraki nöbet turuna kadar uykuya geçer.
2. **Nöbet Koşul ve Politika Motoru (`X-190`, `X-194`, `X-309`):** Kampanyanın ne zaman uyuyacağını, ne zaman uyanacağını ve ne zaman duracağını yöneten kural motorudur.
   - **5 Saatlik ve Haftalık Kota Tavanları (Binding Bar - `X-309`):** Kampanya havuzu yalnızca 5 saatlik pencereye değil, **7 günlük haftalık kullanım tavanına (`seven_day` bar)** da bakar. Haftalık duvarı aşmış (%100) bir hesap asla 'en boş' sanılıp seçilmez; havuz otomatik olarak sıradaki hesaba veya motora geçer.
   - **VE Grupları (AND Conditions):** Koşul satırları hem canlı kota okumalarını hem de tur limitlerini bir arada değerlendirir.
   - **Canlı Durum Sondası (`sentry.probe`):** Sistemin o an hangi hesapta olduğunu, kotanın ne kadar kaldığını ve nöbetin ilerleyişini anlık sorgular.
3. **Nöbet Bekçisi (Watchdog - `X-178`):** Gece yarısı (ör. 02:00) takılan turları, cevap vermeyen süreçleri ve düşen bağlantıları izler; kilitlenmiş oturumları güvenle sonlandırıp nöbet zincirini kurtarır.
4. **Talimat ve Şablon Havuzu (`X-175`, `X-192`, `X-319`, `X-320`):**
   - **İlk Turun Kalemi Öğrenmesi (`X-320`):** Kampanyanın açılış cümlesi ne olursa olsun, ilk turun sözlerine backlog kaleminin kodu ve metni (`withItemLine`) eksiksiz enjekte edilir; kör başlangıçlar önlenir.
   - **Boş Tur Sonrası Görev Aktarımı (`X-319`):** Eğer önceki tur hiçbir şey üretmeden kapandıysa (hit-the-wall / nothing-to-continue), sonraki tur kör bir "devam et" yerine kalemin asıl görev tanımını öğrenerek başlar.
5. **Nöbet Rotasyon Havuzu (Whitelist) ve Çok Motorlu Yedekleme (`X-207`, `X-312`):** Kullanıcı nöbetin hangi hesapları harcamaya yetkili olduğunu tek tek belirler (ör. Claude Hesap 1 + Claude Hesap 2 + Codex Hesap 1). İzin verilmeyen hesaplara asla dokunulmaz. Nöbet turunun retry işlemi kampanya havuzundan kaçamaz (`X-312`).
6. **Yangın Tatbikatı ve Devir Disiplini (`X-309`, `X-321`–`X-323`):**
   - **Oturum Kimliği Ön-Tahsisi (`X-321`):** Taze headless Claude turları `--session-id <uuid>` ile başlatılır; böylece turlar kendi oturum kimliklerini kesin olarak bilir ve transkript bağları saat tahminine dayanmadan kurulur.
   - **Devir Notu Ayrıştırması (`X-322`):** Oturumun yazdığı her markdown dosyası (kod/not) körlemesine devir notu sayılmaz; açık kimlik/handover işareti aranır.
   - **Kalem Kapatma Komut Enjeksiyonu (`X-323`):** Nöbet turuna kalemi kapatması için af.js köprüsünün tam yolu (`node <af.js> projects.backlog.check ...`) açık bir kabuk komutu olarak verilir; modelin araç arayıp halüsinasyona düşmesi engellenir.
   - **Hata Freni (Failure Brake):** Art arda 5 boş/başarısız tur geldiğinde sonsuz döngüye girmeden fren devreye girer ve nöbeti güvenle durdurur.

### Arayüz ve Kontroller

- **Console Canlı Şeridi (`X-177`):** Nöbet açıkken Konsol üst şeridinde nöbet rozeti, aktif hesap ve duraklatma (`Pause / Resume`) kontrolleri yer alır.
- **Ayarlar Nöbet Bölümü (`X-193`):** Nöbet şablonları, devir notu arama yolları ve klasör önizlemeleri Ayarlar sayfasında müstakil bir kartta yönetilir.
- **Köprü Operasyonları:** `sentry.status`, `sentry.start`, `sentry.stop`, `sentry.pause`, `sentry.resume`, `sentry.templates`, `sentry.probe`.


## Baton Rölesi — Oturumdan Oturuma Kesintisiz Bayrak Devri {#baton-relay}

*(3.620.0 — 3.651.0)* Uzun ve çok adımlı geliştirme işlerinde tek bir oturumun model context penceresini (%35–40 disiplin eşikleri) veya hesabın 5 saatlik kullanım kotasını (%90 eşiği) tüketerek duvara çarpması kaçınılmazdır. Klasik oturum devrinde (`handover note`), oturum durur, diskte bir devir notu bırakır ve kullanıcının ya da nöbetçinin taze bir oturum açmasını bekler. **Baton Rölesi (Baton Relay)**, bu süreci otonom bir bayrak yarışına çevirir: Ajan devir eşiğine geldiğinde işi bir dosya notuna gömmek yerine, halefinin ilk açılış mesajı olacak sözü tek bir çağrıyla (`baton.pass`) sisteme devreder; Agent Farm eski oturum kapandığı anda taze bir oturumu (`leg n+1`) aynı parametrelerle ve belirlenen hesap havuzundan otomatik olarak başlatır.

### Üç Ayaklı Çark Mimarisi

Sistem birbirinden bağımsız çalışan ama birbirini kanıtla tetikleyen üç aktör üzerinde yürür:

1. **Fısıltı (The Whisper / Sentry):** Agent Farm → koşan ajan. Ajan çalışırken token doluluğunu kendi gözüyle göremez. Agent Farm, canlı kancadan (`PostToolUse`) oturumu anlık izler; context %35'e ulaştığında `CONVERGE` (toparlan), %40'a ulaştığında veya 5 saatlik kota %90'a vurduğunda `HANDOVER` emrini fısıldar. Eğer oturum bir röle zincirindeyse, fısıltı "devir notu yaz" demez; doğrudan **"bayrağı devret: baton.pass"** emrini verir.
2. **Bayrak (The Baton):** Ajan → Agent Farm. Ajan devir kararı aldığında diskte dosya aramaz; o ana kadarki temiz kodları git'e commit'ler, ardından halefinin doğrudan işe başlamasını sağlayacak talimatı içeren bir payload hazırlayarak `node af.js baton.pass "@<dosya>"` (veya JSON dizesi) komutunu çalıştırır ve kendi turunu sonlandırır. Konsol ve terminal oturumları tur bitince kendiliğinden kapanmadığı için, Agent Farm bayrağı teslim eden oturumun durulduğunu gördüğünde (kuyrukta mesaj yok, açık soru yok, 10 saniye sükûnet) oturumu **kendisi temizce kapatır**. Tur sürerken oturum asla öldürülmez.
3. **Yatak (The Receiver / Bed):** Agent Farm → yeni koşucu. Agent Farm eski oturumun gerçekten kapandığını kanıtla doğrular (aynı anda çift oturum açılmaz). Ardından zincirin belirlenmiş hesap havuzundaki (`@emptiest` vb.) en uygun hesabı seçerek taze bir oturumu (`leg 2/6` vb.) aynı motor, model, efor, izin modu, Superpowers ve proje boyutlarıyla (`launchDimensions`) başlatır. Başlatıcı doğrudan görev panosudur (`tasks.add baton:true`); sistemde ikinci bir gizli başlatıcı yoktur.

### Zinciri Başlatma ve Canlıya Bağlama Yolları

Bir baton rölesi üç farklı kapıdan başlatılabilir veya koşan bir işe sonradan eklenebilir:

- **Kompozitörden Başlatma:** Console mesaj kutusunun (composer) altındaki **`⑂ Relay`** anahtarı açılır. İsteğe bağlı olarak bu zincire özel etap tavanı (`max hops`) ve hesap havuzu seçilir. İlk mesaj gönderildiğinde oturum doğrudan **1. Etap (`⑂ 1`)** olarak mühürlenir.
- **Görev Formundan Başlatma:** Tasks sayfasında yeni görev eklerken (`New Task`) `⑂ Relay` kutusu işaretlenir (`tasks.add baton:true`).
- **Çalışan Oturumu Röleye Bağlama (`⑂+ Attach relay`):** Normal (rölesiz) başlamış canlı bir oturumun alt şeridindeki `⑂+` butonuna basıldığında bir ayar şeridi açılır. Buradan havuz ve tavan seçilerek `⑂ Attach` dendiğinde, koşan oturum yeniden başlatılmaksızın anında **Leg 1** olarak zincire mühürlenir (`baton.attach`). Sonraki limit uyarısında devir notu yerine bayrak devri emri alır.

### Arayüz ve Canlı Kumanda Araçları

Console kartı ve oturum listeleri, bir röle bindiğinde şu özel kontrollerle donatılır:

- **`⑂→` (Pass now):** Oturumun kota veya bağlam limitlerine çarpmasını beklemeden, kullanıcı eliyle anında devir başlatma düğmesidir. Tıklandığında ajana `PASS NOW —` başlığıyla devir fısıltısı enjekte edilir. Ajan elindeki adımı commit'leyip `baton.pass` çağırır ve sonraki ayak hemen uyanır.
- **`✕⑂` (Stop chain):** Zincir frenidir. Tıklandığında o zincire ait bekleyen veya park edilmiş tüm bayrakları `stopped` durumuna çeker. Koşan mevcut oturum kendi işini bitirir fakat arkasından yeni bir etap açılmaz.
- **`⑂ n` Etiketi ve Durum Paneli:** Kartın alt şeridinde mavi renkte `⑂ 1`, `⑂ 2` rozeti çizer. Üzerine gelindiğinde (AFTip) zincir kimliğini (`chainId`), kaçıncı devirde (`hop`) olduğunu, hesap havuzunu ve limit durumunu döker.
- **Oturumlar Tablosu `⑂` Sütunu:** Tüm oturum listelerinde `⑂` başlığı altında yalnız röle taşıyan satırlarda `⑂ n` rozeti görünür; diğer satırlar temiz boş bırakılır.
- **Durum Çubuğu Canlı Göstergesi:** Aktif koşan zincir için durum çubuğunda `⑂ 1/6` formatında canlı sayaç tutulur.

### Otomatik Frenler ve Güvenlik Mekanizmaları

Zincirin sonsuz bir döngüde token yakmasını veya sahipsiz kalmasını engelleyen dörtlü güvenlik ağı vardır:

1. **Etap Tavanı (`agentFarm.batonMaxHops`):** Bir zincirin koşabileceği maksimum etap sayısıdır (varsayılan 6; 0 = sınırsız). Tavan aşıldığında `baton.pass` çağrısı yeni bir oturum açmaz, zincir durur, ajana devir notu yazması fısıldanır ve Notices'a bildirim bırakılır.
2. **Kısır Zincir Freni (Barren Chain Brake):** Arka arkaya koşan iki etap git üzerinde hiçbir yeni commit üretmeden sonlandıysa (aynı `git HEAD`), zincir kilitlenir. Böylece yerinde sayan ya da çözemediği bir hatada döngüye giren ajanların hesabı eritmesi önlenir. Etap, işinin düştüğü yerde ölçülür: kendi klasörü **ve koştuğu projenin kod repoları** (`legRoots.ts`) — proje oturumu ajan klasöründe açılır ama projenin reposuna commit'ler; yalnız klasöre bakmak bir kez üretken iki etabı kısır sayıp kurtarmayı durdurmuştu (S-83).
3. **Acil Kurtarma Emniyet Kilidi (EMERGENCY HANDOVER):** Bir etap `baton.pass` çağırmadan aniden biterse (süreç çökmesi, pencere kapanması, hata veya devir emri aldığı halde bayrağı geçemeden tükenmesi), Agent Farm devreye girer. Oturum temiz bittiyse veya kullanıcı eliyle kapatıldıysa zincir doğal olarak sonlanır (`done`). Ancak ortada (klasöründe ya da projenin repolarında) commit'lenmemiş kirli iş, açık bir hata veya ulaşmış bir devir emri varsa, Agent Farm sonraki etabı kendisi **`EMERGENCY HANDOVER`** başlığıyla ayağa kaldırır. Halefe, yazdıysa etabın devir notu; yazmadıysa **etabın kendisinin başladığı brif**, koşusunda commit'ledikleri ve commit'lenmemiş bıraktıkları verilir — kota duvarında kesilen etap tahminle değil kendi işiyle sürdürülür — ve öncülün transkript yolu. Kurtarma `baton.pass` ile aynı frenlerden geçer. Halef 30 saniye içinde hiçbir araç çağırmadan çökerse zincir kalıcı olarak durdurulur (`failed` - döngü koruması).
4. **Hareketsiz Konsol Etabı Kapanışı:** Konsol kartları süreç bitse de ekranda kalır. Devir emri verilmiş ama bayrağı geçmeden öylece duran bir konsol etabını Agent Farm 30 saniyelik sükûnetten sonra otomatik olarak kapatır; böylece acil kurtarma mekanizması devreye girip zinciri sıradaki ayağa taşıyabilir.

### Akıllı Hesap Havuzu Mirası

- **Havuz Kilidi:** Zincirin ilk etabı hangi hesap kuralıyla açıldıysa (`@GelistirmeHavuzu`, `@emptiest` vb.), sonraki bütün etaplar istisnasız bu havuzdan beslenir. Ajan devir çağrısında başka bir hesap adı geçirse dahi sistem havuzu korur (`poolKept`).
- **Park Etme:** Havuzdaki tüm hesapların kullanım kotaları dolmuşsa, sistem ana hesabı harcamaz; zincir ilk hesabın sıfırlanma saatine (`resetsAt`) kadar park edilir (`waiting-end`), saati gelince otomatik uyanır.

### Köprü Operasyonları (Bridge API)

- `baton.status` — Tüm zincirlerin, aktif etapların, park edilmiş bayrakların ve durma gerekçelerinin canlı listesi.
- `baton.pass` — Koşan etabın bayrağı devretme kapısı (`prompt`, opsiyonel `surface`, `account`, `note`).
- `baton.stop` — Belirli bir zinciri (`chainId`) veya bayrağı durdurma freni.
- `baton.now` — Park edilmiş bir bayrağı bekleme süresini atlayarak derhal çalıştırma.
- `baton.lastLeg` — Yumuşak fren (S-95): koşan etabı zincirin son etabı yapar (`on=true`) ya da devir anına kadar geri alır (`on=false`). Frenliyken devir emri not yazdırır, `baton.pass` `braked` döner, emniyet kilidi karışmaz. Konsol kartındaki ⑂⊣ Last leg aynı gövdeyi çalıştırır.
- `farm.cleanup` — Takılı kalanlar (S-101): hiç başlamamış kuyruk satırları, hiçbir şey çalışmadığı hâlde "running" kalan satırlar, hâlâ bekleyen bayraklar ve boşta Konsol kartları — 24 saati geçen, yeniden başlatmanın temizlemediği her şey. Varsayılan yalnız listeler; `apply=true` (istenirse `ids=`) iptal eder / durdurur / kapatır, hiçbir şey silinmez. Durum çubuğundaki 🧹 çipi (yalnız takılı bir şey varken görünür), inceleme listesi ve günde en fazla bir kez gelen bildirimin "Clean now" düğmesi aynı gövdeyi çalıştırır; `farm.health` sayıyı `stale` olarak verir.
- `baton.attach` — Canlı bir oturumu Leg 1 olarak mühürleyip röleye bağlama (`sessionId`, `account`, `maxHops`).


## MCP Yönetimi

Ajanlarının dış dünyaya açılan araç kapıları — MCP sunucuları — artık panelde görünür (0.9.0). Agents ağacında her ajanın **MCP** bölümü:

- Sunucular, Claude Code'un okuduğu aynı dosyalardan okunur (`.mcp.json`, `.claude/settings*.json`); ad, taşıma tipi (stdio/http/sse) ve tanım kaynağı görünür.
- **Bir bakışta durum (2.13.0):** bölüm başlığı `N server(s) • M used (30d) • K disabled` özetini gösterir. Sunucu satırında son kullanım zamanı (`last 3h`) yazar; tooltip'te **en çok çağrılan araçların dökümü** (`vault_read ×394, search_query ×88…`) — hangi MCP aracının gerçekten iş gördüğü tek bakışta belli olur.
- **Gerçek kullanım:** her sunucunun son 30 gündeki gerçek araç çağrısı sayısı satırda yazar (oturum kayıtlarından `mcp__sunucu__araç` sayımı). Yeşil fiş = kullanılıyor.
- **Ekle/Kaldır:** bölümde **+** → sihirbaz ajanın `.mcp.json`'ına yazar; sunucuda çöp ikonu → kaynağından siler (bir kerelik `.afbak` yedeğiyle).
- **Yönetim (2.13.0, sağ tık):**
  - **Edit MCP Server…** — komutu/URL'yi yerinde düzenler (yedekli).
  - **Disable / Enable MCP Server** — sunucuyu ajanın `.claude/settings.local.json` içindeki `disabledMcpjsonServers` listesine ekler/çıkarır (Claude Code'un onurlandırdığı aynı anahtar). Silmeden geçici kapatmak için; kapalı sunucu ağaçta ⊘ ile gri görünür.
  - **Copy MCP Server to Agent…** — tanımı başka bir ajanın `.mcp.json`'ına kopyalar (filo genelinde tek tanımı yayma).
- Değişiklik, ajanın yeni oturumunda geçerli olur.
- **Insights denetimi:** 30 gündür hiç kullanılmayan tanımlı sunucu bilgi bulgusu üretir — her sunucu oturum açılışına yük ekler, ölü olanı temizle.

## Skill Yönetimi

Ajanların öğretilmiş yetenekleri — Agent Skills (SKILL.md klasörleri) — panelde görünür (2.12.0). Agents ağacında her ajanın **Skills** bölümü:

- Skill'ler, Claude Code'un okuduğu aynı klasörlerden okunur: ajan klasöründeki `.claude/skills/` (**agent** kapsamı) + `~/.claude/skills/` (**user** kapsamı — bütün ajanlar paylaşır). Aynı ada sahip skill'de agent kapsamı user kapsamını gölgeler. Satırda ad, kapsam ve SKILL.md frontmatter'ındaki açıklama (tooltip) görünür; tıklamak SKILL.md'yi açar.
- **Bir bakışta durum (2.13.0):** bölüm başlığı `N skill(s) • M used (30d)` özetini gösterir; skill satırında son kullanım zamanı (`last 2d`) yazar.
- **Gerçek kullanım:** son 30 gündeki çağrı sayısı satırda yazar — hem modelin `Skill` aracıyla yaptığı çağrılar hem senin yazdığın `/skill-adi` komutları oturum kayıtlarından sayılır. Yeşil kıvılcım = kullanılıyor.
- **Ekle/Kaldır:** bölümde **+** → ad + tek satır açıklama sorulur, ajanın `.claude/skills/<ad>/SKILL.md` iskeleti oluşturulup açılır (talimatları sen yazarsın); skill satırında çöp ikonu → klasörü siler (bir kerelik yedek `.claude/skills.afbak/` altına alınır). User kapsamındaki bir skill silinirken bütün ajanların kaybedeceği modalda açıkça söylenir.
- **Yönetim (2.13.0, sağ tık):**
  - **Copy Skill to Agent…** — skill klasörünü (içindeki yardımcı dosyalarla) başka bir ajana kopyalar.
  - **Move Skill Between Agent/User Scope…** — agent kapsamındaki bir skill'i `~/.claude/skills`'e taşır (tüm ajanlarla paylaş) ya da user kapsamındakini bu ajanın klasörüne indirir (özelleştir). Onaylı, tek hareket.
  - **Reveal Skill Folder** — SKILL.md klasörünü sistem dosya yöneticisinde açar.
- Değişiklik, ajanın yeni oturumunda geçerli olur.
- **Insights denetimi (2.13.0):** açıklamasız SKILL.md için uyarı (claude açıklamaya bakarak skill'i yükler — açıklama yoksa nadiren ateşlenir) + 30 gündür kullanılmayan agent-kapsamı skill için bilgi bulgusu.
- Not: eklenti kurulumuyla gelen plugin skill'leri bu klasörlerin dışında yaşar ve listede görünmez — panel, senin yönettiğin dosya tabanlı skill'lere odaklanır.

## Yetenek Matrisi

**Agent Farm: Open Capability Matrix** (Agents ağacının başlığındaki tablo ikonu) — filonun bütün skill ve MCP yeteneklerini tek ızgarada gösterir (2.13.0). Amaç: hangi ajanda hangi yetenek var, hangisi gerçekten kullanılıyor, hangisi ölü ağırlık — hepsi bir bakışta.

- **İki matris:** *Skills × Ajanlar* ve *MCP sunucuları × Ajanlar*. Satır = yetenek, sütun = ajan.
- **Hücreler:** yeşil dolu rozet + sayı = son 30 günde kullanılmış (renk yoğunluğu = çağrı sıklığı); soluk ✓ = kurulu ama kullanılmamış; ⏻ = o ajanda kapalı; **＋** = kurulu değil — tıklayınca yeteneği başka bir ajandan **o ajana kopyalar** (onaylı).
- **＋ kaynağı asla kendi başına seçmez (2.81.0, varyant gruplu 2.81.1):** **dört tür için de aynı kural — skill'ler, MCP sunucuları, hafıza dosyaları VE nöbetler (duties).** Tek donör → kaynağı adıyla söyleyen onay. **Birden fazla donör → kopyalar aynı olsa bile her zaman seçim listesi**, karar senin olsun diye. Liste **kopyaları içeriğe göre gruplar**: aynı olan kopyalar harfli bir varyantı paylaşır (`A` = en yaygın / en yeni sürüm), böylece bir satır `variant A (shared by 3)` ya da `variant B (unique)` diye okunur — hangi ajanların aynı, hangisinin farklı olduğunu bir bakışta görüp kaynağı ona göre seçersin. Değişme tarihi, boyut ve recall sayısı da yanında. Artık sessizce "ilk bulunan ajan" yok.
- **Özet çipleri:** her matriste toplam / kullanılan (30g) / kullanılmayan sayısı. Hiçbir ajanın 30 günde kullanmadığı satır sarı ● ile işaretlenir — filo genelinde temizlenebilecek yetenekler.
- Satır adına ya da dolu bir hücreye tıklamak ilgili SKILL.md / config dosyasını açar. Herhangi bir kopyalama/düzenleme sonrası matris kendini tazeler.
- **Memory files matrisi (2.16.0):** aynı adlı hafıza dosyalarının hangi ajanlarda olduğu, hücrede 30 günlük recall sayısı; **turuncu halkalı hücre = kopya en yenisinden SAPMIŞ** (içerik farklı — birinde güncellenmiş, diğeri eski). ＋ ile dosyayı o ajana kopyala (hedef MEMORY.md'ye indeks satırıyla). Çok-ajanlı satırlar üstte — senkron/diverjans asıl orada önemli. **Recall sayıları klasör-sahibine göre (2.81.0):** hücre yalnız *o ajanın kendi* memory/ dosyasının okunmasını sayar — başka ajanın aynı adlı dosyasını (ya da `~/.claude` oto-hafızasını) okumak artık sayacı şişirmez; yeni kopyalanan dosya dürüstçe **0 recall** ile başlar.
- **Duties matrisi (2.16.0):** nöbet başlıkları × ajanlar; hücrede kadans kısaltması (`turn/start/daily/weekly/manual`), ⏸ = duraklatılmış; tooltip watch/do gösterir; ＋ ile nöbeti o ajana kopyala (hedefte CLAUDE.md DUTIES.md referansı yoksa onayla eklenir).
- **Tasks matrisi (2.17.0):** görev aileleri × ajanlar — son 30 günün en yoğun 30 ailesi ([Görev Sağlığı](#gorev-sagligi)). Hücrede tamamlanmış koşu sayısı: yeşil = hepsi başarılı, kırmızı = hepsi başarısız, turuncu halka = karışık (`2✓/1✗`); satır etiketi kaynağını söyler (`man/sch/trg/wf`), son koşuları hep başarısız aile kırmızı ● alır. Hücreye/satıra tıklamak tam görev tarihçesini açar.

## Toolbox — Eklenti Envanteri {#toolbox}

**Agent Farm: Open Toolbox** (kenar çubuğundaki Toolbox bölmesi ya da başlığındaki anahtar ikonu) — bir claude kurulumunu genişleten HER ŞEYİN tek konsolu (2.80.0): Skills, Subagent'lar, Komutlar, MCP sunucuları, Hook'lar, Plugin'ler, Output Style'lar ve ayar dosyalarının kendisi — **iki düzeyde birden**: **kullanıcı kapsamı** (`~/.claude` + `~/.claude.json` içindeki MCP sunucuları; makinedeki her ajan ve seans paylaşır) ve **ajan kapsamı** (her ajan klasörünün `.claude/`'u). Yetenek Matrisi "kim neyi KULLANIYOR" sorusuna, Toolbox "nerede ne KURULU, tam olarak nedir, nasıl yönetirim" sorusuna cevap verir.

- **Kenar çubuğu bölmesi:** tür → kapsam → öğe, tür başına sayaçlarla (`2 user · 3 agent`); öğeye tıklamak tanım dosyasını açar, başlıktaki ikon tam yönetim sayfasını açar.
- **Overview sekmesi:** her tür için sayı kartı + o türün *ne olduğunu* anlatan tek satır — makinenin bütün eklenti yüzeyinin haritası, kavramları öğrenme yeri.
- **Skills / Subagents / Commands / Styles sekmeleri:** ad, kapsam rozeti, frontmatter açıklaması, argüman ipuçları, model/araç bilgileri, 30 günlük gerçek kullanım (skill'ler); aksiyonlar: aç, Explorer'da göster, **yedekli sil** (öğe yandaki `.afbak` klasörüne taşınır — hiçbir şey kaybolmaz), **iki kapsamda da yeni oluştur** (komut adındaki `:` klasöre yuvalar, ör. `git:cleanup`).
- **MCP sekmesi — gerçek problu:** iki kapsamdaki tüm sunucular, taşıma türü ve maskeli tanımıyla. **Probe** sunucuya gerçekten bağlanır (stdio ya da streamable HTTP — claude'un yaptığı el sıkışmanın aynısı) ve **fiilen sunduğu araçları** listeler: ad, açıklama, parametreler (zorunlular yıldızlı). Sonuç diske cache'lenir, sen yenileyene kadar durur. Ajan başına aç/kapat (`disabledMcpjsonServers`), yedekli silme — kullanıcı kapsamındaki silme `~/.claude.json`'ı cerrahi düzenler, kalan her şeyi baytı baytına korur.
- **Hooks sekmesi:** kullanıcı + ajan ayar dosyalarındaki tüm yaşam-döngüsü hook'ları — olay, eşleştirici, komut — ve dosyanın kalanına dokunmadan tek hook silme.
- **Plugins sekmesi:** kurulu marketplace'ler ve katalogları (ad, kategori, yazar, açıklama, ana sayfa); etkinleştir/kapat, kullanıcı settings.json'daki `enabledPlugins` anahtarını yazar — claude'un tanıdığı anahtarın aynısı, bir sonraki seans başlangıcında uygulanır.
- **Files sekmesi:** iki kapsamdaki ayar dosyalarının kendisi (settings.json, settings.local.json, `.claude.json`, keybindings.json, CLAUDE.md), üst düzey anahtarları ve boyutlarıyla — tek tıkla aç. En işe yarar anahtarların açıklamalı düzenlemesi Farm Settings → Claude Code bölümünde durmaya devam eder.
- **‼️ Her sekme KENDİ sütunlarıyla süzülür.** Burada birkaç yüz satır var ve 3.87.0'a kadar tek giriş yolu bir metin kutusuydu; o da "bu kelime geçiyor mu" sorusunu yanıtlar — neredeyse her zaman yanlış soru: *"üreticisi Anthropic olup gerçekten enabled olanlar"* iki eksendir, `anthropic` yazmak ise onlardan söz eden her satırı getirir. Artık her sekme, o sekmenin tablosunda zaten görünen eksenleri taşıyor — Skills: kapsam · kullanıldı/hiç kullanılmadı · Subagents: kapsam · model · Commands: kapsam · ad alanı · MCP: kapsam · taşıma · enabled/disabled · problandı/başarısız/problanmadı · Hooks: kapsam · olay · Plugins: enabled/disabled · yazar · marketplace · kategori — ayrıca sıralama (ad, en çok kullanılan, önce enabled, en büyük, kapsam) ve kaç satırın kaldığını söyleyen canlı sayaç. **Eksenler VE ile birleşir** (birden fazla olmasının anlamı budur) ve seçenekleri VERİDEN okunur: yeni bir marketplace, taşıma türü ya da hook olayı listeye kendiliğinden düşer. **Seçim SEKME başına saklanır** — bir görünümü kurmak dört tıktır, MCP'ye bir bakmak için ona kıymak bu değişikliğin var oluş sebebidir; metin kutusu ise sayfa geneli, çünkü yazılan kelimeler bir sonraki sekmede nadiren aynı şeyi ifade eder. `✕ clear` yalnız o sekmenin ikisini birden bırakır.
- **Bridge op'ları:** `toolbox.list`, `toolbox.inspect`, `toolbox.mcptools` — ajanlar aynı envanteri sorgulayabilir, aynı probu tetikleyebilir (`farm.ops` sözleşmeleri listeler). **`toolbox.list` sayfanın eksenlerinin aynısını alır** — `q` (sorgu dili), `scope`, `agent`, `kind`, `state` (enabled|disabled; satır hangisini konuşuyorsa okuyucu için tek kelime), `event`, `transport`, `author`, `marketplace`, `model` — hepsi VE ile, yani sayfanın sorabildiği soruyu ajan da sorabilir.
- **‼️ …ve artık YAZABİLİYOR; bir süre yazamıyordu.** Sayfa araç kuruyor, kopyalıyor, siliyor ve açıp kapatıyordu; köprü ise yalnız okuyabiliyordu — yani "şunu kur" denen bir ajanın verebileceği tek cevap "sayfayı kendin aç" idi. `toolbox.install` (skill · subagent · command dosyalarını iskeletler; `mcp` ise JSON kaydını yazar — hiçbir diyalog zincirinin soramadığı `args`/`env`/`headers` ile birlikte, ve `mode:"edit"` sorulmayan her anahtarı korur) · `toolbox.copy` (başka bir ajana; ya da bir skill'i PAYLAŞMAK için `to:"user"` — bu **taşır**, çünkü iki kapsamda birden duran kopya bir gölgedir) · `toolbox.remove` (giden neyse yanında `.afbak` bırakır; geri dönüşün tek yolu odur) · `toolbox.enable` (MCP sunucusu ajan başına, eklenti kullanıcı ayarlarında — silmenin geri alınabilir yarısı). **Tek uygulama, iki kapı:** sayfa da köprü de `core/toolboxBridge.ts` içindeki `saveToolboxItem` / `removeToolboxItem`'ı çağırır; böylece ikisi asla farklı şey yazamaz.

## Değerlendirme — regresyon kümesi ve A/B {#degerlendirme}

**Agent Farm: Open Evals** (üst gezinme şeridinde 🧪 Evals) — bir ajanın **regresyon kümesi**, koşuları ve son iki koşu arasında NE DEĞİŞTİĞİ tek sayfada (3.92.0). Buraya kadar bunun hiçbir yüzeyi yoktu: dört komut paleti girdisi işin tamamıydı, dolayısıyla bir öğleden sonra kurduğun küme ancak tek satırlık quickpick etiketleri hâlinde geri okunabiliyordu.

- **Vaka (case) = girdi + beklenti.** Girdi her koşuda ajana aynen gönderilen prompt; **beklenti** ise hakeme (judge) olduğu gibi verilen ölçüt. Belirsiz bir beklenti belirsiz bir hüküm üretir — "olsa iyi olur"u değil, "doğru sayılması için ŞU olmalı"yı yaz.
- **Bir vaka normalde KÖTÜ BİR İZDEN doğar.** Kartın en üstündeki seçici, düşük puan verdiğin oturumları (⭐ ≤2) ve doğrulaması başarısız olan görevleri sunar; birini seçmek altındaki girdi kutusunu doldurur ve vakanın nereden geldiğini kaydeder — aynı iz iki kez vakaya çevrilemez. Elle yazmak da aynı kartta.
- **Koşu bir onay ister, çünkü para harcar:** vaka başına bir ajan çağrısı (`agentFarm.evalRunArgs`) + bir ucuz hakem çağrısı. Sonuç hem sayfaya düşer hem de tam rapor bir markdown editöründe açılır.
- **‼️ Asıl kazanç: ne değişti.** Sayfa son koşuyu bir öncekiyle vaka vaka karşılaştırır — **⛔ regressed** (geçiyordu, artık geçmiyor), **✅ fixed** (kalıyordu, artık geçiyor), **🆕 new**, ve değişmeyenler. Bir quickpick bunu hiçbir zaman söyleyemezdi.
- **A/B — ajanın kendi talimatları.** A = ajanın şu anki `CLAUDE.md`'si; B = aynı dosya + bir kural, ya da bambaşka bir dosya. Kural için en hazır kaynak, o ajan için açık duran **öneriler**; kartta doğrudan seçilebiliyorlar. Karşılaştırma prompt'ları varsayılan olarak ajanın eval vakalarından gelir (zaten güvendiğin küme en adil karşılaştırmadır). B kazanırsa, `.afbak` yedeğiyle birlikte uygulamayı teklif eder.
- **Bilerek yerli kalanlar:** koşu ve A/B önündeki **modal** (gerçek para), üretilen **rapor belgesi** (uzun cevap karşılaştırması için markdown editörü bir webview'dan iyi bir okuyucudur) ve varyant B dosyası için **işletim sistemi dosya seçicisi**.

## Airtable Engine Modülü {#airtable-engine}

Kullanıcının kendi veri motoru (bilgi atomları + medya kayıtları; her deploy'u kendi portunda çalışan bir "instance") artık eklentinin **gömülü bir modülü** (3.0.0): eklenti kurulunca gelir, ayrı kurulum yoktur. Ajanlar motorla `airtable_*` MCP araçları üzerinden konuşur — arar, kaydeder, günceller; medya dosyaları **mutlak yolla referanslanır**, asla taşınmaz/kopyalanmaz.

**Modülün kendi sayfası var: Agent Farm: Open Airtable Engine** (Toolbox başlığındaki 🗄️ Airtable Engine düğmesi ya da Toolbox → Overview'daki modül karosu da açar). Sayfa bir kontrol odası gibi önem sırasıyla dizilir:

1. **Instances** (en üstte) — klasörlerden keşfedilen her deploy bir KART: canlı/kapalı ışığı, port, içerik sayıları (lessons/sentences/media); **Open UI** motorun kendi paneline, **Set default** varsayılana. Kapalı instance soluk görünür ve nasıl başlatılacağını söyler. Portlar asla varsayılmaz — her bakışta yeniden keşfedilir.
2. **Folders** — **+ Add folder** ile motor klasörünü ekle: instance'ların üst klasörü de olur, bir instance klasörünün kendisi de (ikisi de çalışır — sistem `config.json`'ı iki seviyede arar). Klasör seçilince içi doğrulanır; instance yoksa uyarır ama istersen yine ekler. Çoklu klasör + tek tek çıkarma; `%VAR%` jetonları çalışır. Yanında medya kütüphanesi klasörleri.
3. **Defaults & connection** — varsayılan instance (boş = çalışan tek instance), dil ağacı, zaman aşımı; kayıt satırı ve modül config dosyası tek tıkla açılır.
4. **Register MCP** (başlık eylemleri) — kullanıcı-kapsamı kaydı `~/.claude.json`'a yazar; her YENİ claude seansı `airtable_*` araçlarını görür. Kayıt, sürümden bağımsız **staged kopyaya** işaret eder ve `${APPDATA}` jetonludur — ne eklenti güncellemesi ne makine değişimi kırar; sürüm-pinli eski kayıt aktivasyonda bildirimle **kendini onarır**. **Probe tools** kayıtlı sunucuya gerçekten bağlanıp araç listesini doğrular.
5. **Agent access** — ajanların bu motorla fiilen ne yapabildiği: 10 aracın listesi (prob yapıldıysa canlı-doğrulanmış haliyle) + örnek kullanım cümlesi.

**Ajan araçları (`airtable_*`):** `instances` (keşif + sağlık — önce bu), `stats`, `search` (koleksiyonda anahtar kelime/tag), `get` (tam kayıt), `media_templates`, `media_scan_folder` (klasördeki yeni/kayıtlı dosya ayrımı — ingest döngüsünün girişi), `media_save` (çekirdek: dosyayı mutlak yolla referanslayan tam-şema kayıt; AI üretimiyse provenance, saklanan deneme ise quarantine+failure), `media_update` (iyimser eşzamanlılıkla güncelleme — panel düzenlemesi ezilmez), `knowledge_save` (bilgi atomu → sentences), `note_save` (serbest not → arşiv). Ayarlanmamış modülde araçlar hata yerine **yol gösterir** ("Toolbox'taki karttan klasör ekleyin").

**Teknik zincir — TEK doğruluk kaynağı:** modülün kendi store dosyası `<globalStorage>/airtable-config.json`. Sayfa onu düzenler, MCP süreci her araç çağrısında taze okur — arada başka katman yoktur; sayfadaki bir değişiklik çalışan ajanlara restart'sız ulaşır, her yazma hatası kullanıcıya AÇIKÇA bildirilir (sessiz kayıp yok). **Bridge op'ları (§19.C):** `airtable.status`, `airtable.instances`, `airtable.config.get/set`, `airtable.folders.add/remove` (her seferinde tek klasör; sayfanın + Ekle ve kaldır düğmelerinin kullandığı aynı `addStoreFolder`/`removeStoreFolder` üzerinden — zaten listelenmiş bir klasör, büyük-küçük harf ya da eğik çizgi farkıyla da olsa, ikinci kez eklenmez; içinde örnek bulunmayan bir motor klasörü `anyway:true` ister), `airtable.register/unregister`.

**Medya kütüphanesi (X-417):** her veri tabanının (instance) bir medya kökü altında kendi medya klasörü vardır — `<kök>\media_<vt>\<image|video|audio>\<aşama>\`. Aşamalar, kullanıcının sözleriyle: **source** (giriş kaynağı) · **raw** (bir sınıfa girmeyen ama saklanan — hiçbir şey atılmaz) · **semi** (yarı olmuş) · **final** (gerçekten başarıya ulaşmış) · **asset** (her an kullanılacak hazine; yalnız açık bir terfiyle ulaşılır). `media_<vt>\all_in\` kullanıcının, henüz işlenmemiş dosyalar için bekleme alanıdır — ajanlar oraya dosya koymaz, adıyla reddedilir. Aşama kayıtta `workflow.stage` alanına da yazılır; kayıt Admin panelinin giriş formu gibi doldurulur: sınıflandırmanın çoğunu form yapar, klasör son halkadır. Bir koşunun dosyası aşamasını rolünden alır — girdi → source · aday / ara ürün → semi · başarısız / seçilmeyen → raw · son → final · bilinmeyen → raw. Çekirdek: `src/core/mediaLibrary.ts`. **Köprü:** `media.library` (kökler, bulunan veri tabanları, aşamalar ve anlamları, varsayılan eşleme), `media.library.plan` (bir dosyanın taşımadan nereye gideceği ve nedeni: kendi adı, alınmışsa `-2`, `-3`…), `media.library.file` (oraya taşır — sürücüler arasında kopyalayıp kaynağı siler, asla ezmez; kayıt ardından `airtable_media_save` ile yazılır). Koşu çıktısının otomatik dosyalanması, kayıt, formun bir modelce doldurulması, Airtable'ın koşu girdisi ve Studio'nun görünümü olması X-418…X-421'dir.

**Motoru başlatmak (X-416):** Airtable sayfasındaki kapalı instance kartında **Start** var: `<instance>\Admin` içinde `node server.js`, gizli ve bağımsız; `npm install` yok, arayüz derlemesi yok, tarayıcı sekmesi yok — `start_admin.bat` penceresi gibi VS Code'dan uzun yaşar, çıktısı `<globalStorage>\airtable-engine-<ad>.log`. Köprü: `airtable.start` (ardından onu bekleyen kayıtları yazar). Çekirdek: `src/core/airtableStart.ts`.

**Koşunun ürettiği her dosya yerleşir ve kaydedilir (X-418):** medya adımının indirdikleri ve tool adımının çıktıları doğrudan iş akışının veri tabanındaki aşama klasörüne gider — aday ya da parça → semi, başarısız adımın dosyası → raw — ve her biri tam bir medya kaydı alır: dosya çekirdeği, `ffmpeg -i` raporundan okunan teknik alanlar (süre, fps, boyut, oran, codec, bitrate, örnekleme hızı, kanal, çözünürlük sınıfı; makinede ffprobe yok), Provenans (köken, model, prompt ve hash'i, Orijinal Bağlam'da koşu ve adım), batch olarak koşu, `workflow.stage`, her olay için bir `pipeline_history` satırı, veri tabanında varsa `<Tür>-<Aşama>` şablonu ve içerik `fingerprint`'i (sha256) — aynı baytlar iki kez kaydedilmez. Bir adımın okuduğu ama koşunun üretmediği yerel dosya koşunun **girdisi**dir: olduğu yerde kaydedilir (zaten bir aşama klasöründeyse aşamasını korur), ondan üretilenin `causal.causes` ilişkisine bağlanır. Görüntü hakeminin FAIL dediği ve seçimin dışarıda bıraktığı dosya Başarı Statüsü doldurularak raw'a taşınır; koşu sonuna ulaşınca son üreten adımın dosyaları final'e, kütüphane dışından gelen girdileri source'a gider — dosya ve kaydı tek çağrıda; veritabanında kaydı zaten olan bir girdi nerede durursa dursun kütüphanededir: bağlanır, asla taşınmaz. Her dosya koşunun defterine (kaydında, kalıcı) yazılır; yeniden yüklemede hiçbir şey kaybolmaz ve sonraki adıma dosyanın ŞU ANKİ yolu verilir. Motor kapalıysa önce başlatılır (sor · otomatik · asla); yine kapalıysa dosya yine de yerleşir, kaydı motor cevap verene kadar bekleyen listesinde durur (`<globalStorage>\airtable-pending.json`). Esneme noktaları `library.*`: veri tabanı ve dil (Airtable sayfası → iş akışı → adım), kapalı motor (iş akışı), hangi dosyalar kayıt alır — all (varsayılan, başarısızlar dahil) · passed · none (kütüphane kapalı) — ve şablon (iş akışı → adım), aşama (adım; adı verilen aşama sonda terfi ettirilmez) ve prodüksiyonun kendi **aşama klasörleri** (iş akışı, X-417: `library.stages.{input, intermediate, failed, rejected, final}` — koşu girdisi, parça ya da geçen aday, hakem FAIL'i, seçilmeyen, son çıktı; her biri iş akışının seçtiği aşamaya; boş = yerleşik source · semi · raw · raw · final; eşleme defterin her satırında taşınır, bu yüzden FAIL, seçim ve koşu sonu ona uyar; adımın adını verdiği aşama kazanır). Alınmış bir ad `-2`, `-3`… alır — tasarım gereği asla ezilmez ve esneme noktası değildir.

**Kaydın anlamını bir model doldurur (X-419):** kaydedici kodun ölçebildiğini yazar; dosyaya BAKAN bir model yalnız bakınca söylenebileni doldurur — Admin formunun anlam bölümleri (motorun `Admin/src/App.jsx` dosyasındaki `MEDIA_FIELD_SECTIONS`, seçenek değerleri birebir): kimlik (anlamlı ad, konu, alt konu, içerik, açıklama), taksonomi, fonksiyon (usage_context, content_role, style, level), ton, eğitsel (yalnız içerik eğitselse — değilse gerekçesiyle eksik), pazarlama, platform uyumu, erişilebilirlik, SEO, etiketler ve başarısız dosyada kurtarma notları (hangi saniye, kare ya da bölge hâlâ kullanılabilir). Görseli claude (Read), videoyu agy (kareleri — ses yok; M-42'de ölçülmüş yol) açar, ses dosyasını kimse açamaz (atlanır, söylenir). Yalnız BOŞ alanlar doldurulur ve sürüm çakışmasında yeniden okunur; Admin panelinde bir insanın yaptığı düzeltme asla ezilmez. Tam dolan bölüm `completed_sections` bayrağını alır, kalanlar gerekçesiyle eksik bildirilir, bir `pipeline_history` satırı model, maliyet ve sonucu yazar. Esneme noktaları `library.enrich.*` (Farm ayarı `agentFarm.libraryEnrich*` → iş akışı formunun Library bloğu): ne zaman — end (varsayılan: koşu bitince, tek geçiş, durumu ne olursa olsun) · record (her dosya final ya da başarısız olduğu anda) · never; hangi dosyalar — final + başarısız (varsayılan) · final · hepsi; görsel modeli (sonnet), video modeli (gemini-3.8-flash-low), efor (low), bölümler, kayıt başına dolar (claude turu `--max-budget-usd` ile orada durur; agy maliyet bildirmez, uygulanmaz — söylenir). Plan, aşama eşlemesi gibi defterin her satırında taşınır ve satır sonucunu kaydeder (`enriched`). Çekirdek: `src/core/mediaEnrich.ts` (bölümler, prompt, cevap denetimi, uygulama), `enrichSpec.ts`, `mediaEnricher.ts`, `runEnrich.ts`. **Köprü:** `media.enrich` (id ya da dosyayla tek kayıt); `workflows.add/update` `library.enrich` alır. Çekirdek: `src/core/mediaRecorder.ts` (yerleştir · kaydet · aşama değiştir · boşalt), `mediaRecordFields.ts`, `mediaProbe.ts`, `mediaPending.ts`, `runLibrary.ts` (koşu kancaları), `runLibrarySpec.ts`; sayfa `media/afLibrary.js`. **Köprü:** `media.record`, `media.restage` (asset'e terfi budur), `media.pending`, `media.pending.flush`; `workflows.add/update` `library` ve `steps[].library` alır.

**Koşu malzemesini kütüphaneden alır (X-420):** `airtable` türündeki bir iş akışı girdisi bir değer değil, bir aramadır — veritabanı, sözcükler, aşamalar, tür, durum, etiketler, geçti/kaldı, en çok, sıra. 1. adımdan önce yerel Airtable'ın medya kayıtlarında çalışır ve bulduğu kayıtlar girdinin değeri olur: `{id, file, name, stage, type, topic, tags, status, failed}` biçiminde bir JSON listesi; bir adım `{input.refs}` diye okur, bir for-each adımı onu dolaşır (`{item.file}`, `{item.id}`). `{item.file}` ile beslenen bir araç adımı çıktısını o kaydı neden (`relations.causal.causes`) göstererek kaydeder — bağı olağan kütüphane defteri kurar, yeni bir şey değil. Koşunun kendi değeri kayıtlı sözcüklerin yerine geçer; bir dosya yolu o dosyanın kendi kaydıdır — bir aşama klasörü de böyle tetikleyici olur: olağan bir klasör tetikleyicisi `{file}` değerini airtable girdisine eşler. Varsayılanlar `airtable.input.stages/limit/sort` esneme noktalarıdır (girdinin arama satırı → Farm ayarları `agentFarm.airtableInput*` → asset + final · 20 · en yeni). Başarısız bir arama (veritabanı yok, motor yanıt vermiyor) koşuyu 1. adımdan önce nedenini söyleyerek bitirir; her girdinin ne bulduğu `workflows.status` → `airtable` altında bir satırdır ve koşuyla saklanır, yeniden yüklemede arama tekrarlanmaz. Böyle bir koşunun ajan adımına önce o veritabanına bakması söylenir (MCP `airtable_search` / `airtable_get`). Kod: `src/core/airtableInput.ts` (enjekte edilen listeleyici dışında saf), `media/afAirtableInput.js` (arama satırı), `tasks.ts` `airtableFirst`. **Köprü:** `media.find` (aynı arama, önizleme olarak), `workflows.add` `inputs[].airtable`.

## Sır Kasası

API anahtarları ayar dosyalarında düz metin gezmesin (0.9.0): **Set Secret…** komutu değeri **işletim sistemi anahtarlığına** (VS Code SecretStorage) koyar. Kasadaki sırlar iki yoldan işe karışır:

1. **Ortam değişkeni olarak:** her görev/workflow sürecine otomatik enjekte edilir (`FAL_KEY` diye kaydettiysen süreç `FAL_KEY` env'ini görür).
2. **Şablon değişkeni olarak:** webhook adımlarının URL/gövdesinde ve bildirim URL'sinde `{secret:FAL_KEY}` yazımı çağrı anında gerçek değerle değiştirilir — değer hiçbir dosyaya yazılmaz.

`List Secrets` yalnızca adları gösterir; değerler asla görüntülenmez. Sağlık motoru, ayar dosyalarında anahtara benzeyen düz metin görürse (`sk-…` vb.) kasaya taşıman için uyarır.

### API Anahtarı Nasıl Eklenir (adım adım)

Örnek: fal.ai anahtarını bağlamak —

1. [fal.ai](https://fal.ai) hesabında **Keys** bölümünden anahtarını kopyala (biçimi `xxxx:yyyy` şeklindedir).
2. VS Code'da `Ctrl+Shift+P` → **Agent Farm: Set Secret…**
3. Ad sorusuna **`FAL_KEY`** yaz (medya adımları varsayılan olarak bu adı arar; farklı ad istersen `agentFarm.mediaAuthSecret` ayarını değiştir).
4. Değer sorusuna anahtarı yapıştır (yazdıkça gizlenir) → Enter. Bitti — anahtar işletim sistemi anahtarlığında.
5. Kontrol: **List Secrets** komutu adı listeler (değeri asla göstermez). Medya adımı çalıştığında anahtar otomatik kullanılır.

Aynı yöntem her servis için geçerlidir: `ELEVENLABS_KEY`, `N8N_TOKEN`… — ad ne olursa görevlere env değişkeni olarak girer ve `{secret:AD}` şablonuyla erişilir. **Üç altın kural:** anahtarı asla bir dosyaya/prompt'a yazma; sohbete/ekrana yapıştırdıysan servis panelinden yenile (rotate); kullanmadığını **Delete Secret…** ile sil.

## Motorlar {#engines}


### Çoklu Hesap Yönetimi ve Hesap Kartları (X-167 / X-172 / X-217 / X-218)

*(3.374.0 — 3.411.0)* Tek bir makinede birden fazla Claude Pro veya Codex hesabı barındıran kullanıcılar için Engines sayfasına **Hesap Kartları (Account Cards)** altyapısı eklenmiştir:

- **Hesap Yakalama ve Saklama (`X-172`, `X-204`):** Eklenti, terminalde yapılan girişleri (`/login` veya OAuth grant'leri) otomatik algılar; her hesabı bağımsız bir yuvada (`slot`) adlandırarak saklar.
- **Tekil Seçim Disiplini (`X-217`):** Bir motor için aynı anda yalnızca tek bir hesap ayakta durabilir (`normalizeActive`). Bu aritmetiği dürüstçe yansıtmak amacıyla On/Off anahtarları kaldırılmıştır. Aktif hesap **`🟢 standing`** durum rozeti taşır; basıldığında ana girişe dönülür (`activeAccounts` temizlenir). Diğer tüm kartlar ise tek tıkla o hesabı aktif yapan **`⚡ Use this one`** eylem çipi taşır (`role="radio"` ve tek `aria-checked="true"`).
- **Canlı Kota ve Pencereli Sorgulama (`X-187`, `X-206`, `X-215`):** Her hesap kartı 5 saatlik pencere ve haftalık kullanım çubuklarını canlı gösterir. Claude kotaları ağ üzerinden tüm filonun ortak bütçesine istek atarken (5 saniye aralık ve 429 geri çekilme), Codex kotaları yerel diski okur.
- **Tüm Motorlar İçin Tek Tıkla Yenileme (`[🔄 Refresh all accounts (All Engines)]` - `X-218`):** Hesaplar bölümünün tepesinde yer alır. Ağ istekleriyle disk okumalarını birbirinin arkasında bekletmeden tüm hesapları paralel/sıralı olarak tazeler ve kuyruk ilerleyişini buton üzerinde (`◍ 3 in the line`) canlı çizer.
- **Ayrı Hesaplar Sayfası (`X-236`, 3.583.0):** `agentfarm.openAccounts` aynı bölümü kendi sayfasında açar. Görünüm tek kopyadır (`media/afAccounts.js`: kartlar, gruplar, capture formu, stil `AFAccounts.css`), basışları iki panelin ortak işleyicisi `src/panels/accountsMessages.ts` cevaplar, sayfanın bağımlılıkları `EnginesPanelDeps`'in alt kümesidir — iki yüzey bir hesap hakkında farklı şey söyleyemez. Hesap politikaları (X-305) şimdilik yalnız Engines sayfasında.

### Akıllı Hesap Seçim Politikaları, Protokolleri ve Kota Mimarisi (X-305 / X-324) {#hesap-politikalari}

*(3.520.0 — 3.535.0)* Çoklu hesap ortamlarında (özellikle birden fazla Claude Pro/Max veya kurumsal hesap kullanılan makinelerde), her görev, zamanlama veya konsol oturumu için **"Gelecekteki saatte hangi hesabımın kotası açık olacak?"** tahmininde bulunma zorunluluğu, Agent Farm'ın **Dinamik Hesap Politikaları (Account Policies)** motoru ile ortadan kaldırılmıştır.

Sistem, hesapları statik bir kimlik olmaktan çıkarıp **çalışma anında (runtime) canlı kotaya göre çözümlenen dinamik hedeflere** dönüştürür.

#### 1. Yerleşik Akıllı Politikalar (Built-in Policies)

Arayüzdeki ortak hesap seçicisinde (`media/afAccount.js` — Konsol, Tasks, Missions, Schedules, Workflows, Workqueue) ve Bridge API'sinde doğrudan kullanılabilen 4 yerleşik akıllı politika bulunur:

1. **`@emptiest` (En Boş Hesap):** O motorun altındaki kayıtlı **BÜTÜN** hesapları tarar. 5 saatlik penceresinde (ve haftalık tavanında) kullanılabilir boşluğu (`% room`) en yüksek olan hesabı otomatik seçer.
2. **`@pool` (Nöbet / Kampanya Havuzu):** Arka planda aktif koşan bir **Sentry Kampanyası (otonom nöbet)** havuzundan sıradaki en uygun hesabı seçer. Kampanya yoksa kural reddi verir.
3. **`@standing` (Sabit / Varsayılan Hesap):** Ajanın özel ayarlarında atanmış veya makinede o an `standing` (varsayılan) işaretlenmiş sabit hesabı kullanır.
4. **`@round-robin` (Dönüşümlü Dağıtım):** Sağlıklı ve kotası açık hesaplar arasında her yeni oturumda sırayla bir sonraki hesaba geçerek yükü eşit dağıtır.

#### 2. Özel Hesap Politikaları ve Kurallar (Custom Named Policies)

Kullanıcılar **Engines & Slots** sayfasından (`src/panels/enginesPanel.ts`) veya Bridge üzerinden (`policies.save`) kendi adlandırdıkları özel kuralları (örn. `Gece_Nobeti`, `Agir_Isler`, `Ucuz_Havuz`) tanımlayabilir. Her özel politika bir adımlar zincirinden oluşur.

##### İki Strateji Modu (Strategy Switch — X-324)
Her kural kartının tepe şablon alanında iki seçenekli bir strateji anahtarı yer alır:

- **`🔗 Zincirleme (Chain)` Modu (Varsayılan):** Sıralı bir yedekleme (fallback) zinciridir: `1. Adım → 2. Adım → 3. Adım`. Sistem 1. adımdaki hesabı kullanır. 1. hesap kota eşiğine (örn. %50 duvarına) ulaştığında otomatik olarak 2. adıma geçer; o da dolarsa 3. adıma geçer.
- **`⚡ Seçilenler Arasında En Boş (Emptiest Pool)` Modu:** Kuralın adımlarında listelenen doğrudan hesaplar (whitelist) arasında **bağımsız bir alt-havuz** oluşturur. `@emptiest` makinedeki *tüm* hesapları körlemesine tararken, bu mod **yalnızca kullanıcının seçtiği hesaplar** (örn. 5 hesaptan seçilen 3 hesap) arasından o an kotası en boş olanı seçer. Kampanya gerektirmeden tekil görev ve konsol oturumlarında çalışır.

##### Emniyet Kilidi ve Kural Kısıtı (Auto-Lock Constraint)
- Eğer bir kuralın adımları arasına doğrudan bir hesap yerine başka bir kural/politika (örn. `@standing`, `@round-robin` veya özel bir alt kural) eklenirse; kuralların tekil bir kota yüzdesi bulunamayacağı için `En Boş` modu mantıksal olarak uygulanamaz.
- Bu durumda seçim arayüzde **otomatik ve zorunlu olarak `Zincirleme (Chain)` moduna kilitlenir**, `En Boş` seçeneği devre dışı bırakılır ve açıklayıcı bir **AFTip** ipucu gösterilir (*"Adımlar arasında kural bulunduğu için bu kural yalnızca Zincirleme modunda çalışabilir"*).

#### 3. Kota Eşiği ve Duvar Mantığı (Launch-Time Filter vs. Mid-Flight Wall)

- **Kota Duvarı Süreci Bölmez:** Kota eşiği (%50 Wall vb.), çalışan aktif bir oturumun ortasında süreci aniden kesen bir mekanizma **DEĞİLDİR**.
- **Başlatma Anı Filtresi (Launch-Time Filter):** Kota eşiği, **yalnızca yeni bir oturum veya görev başlatılırken** hesap seçimi yapılırken çalışır. Hesap belirlenen tavanın (örn. %50) altındaysa oturum o hesapla güvenle başlatılır.
- **Kesintisiz Çalışma:** Oturum başladıktan sonra tur içinde harcama yapılıp kota %50'yi aşsa bile oturum bölünmez, işini tamamlar. Ancak oturum bittikten sonra başlayacak bir *sonraki* yeni iş için sistem hesabı tekrar kontrol ettiğinde duvarı aşmış görür ve sıradaki diğer hesaba geçer.

#### 4. Kota Önbelleği, Yenileme Döngüsü ve Hız Sınırı Koruması (Rate Limits)

- **Hafıza Önbelleği (`AccountUsageService`):** Anthropic ve servis sağlayıcıların OAuth uç noktaları katı hız sınırlarına (**HTTP 429 Too Many Requests**) tabidir. Her oturum açılışında 3–5 hesaba birden canlı istek atılması makinenin anında kilitlenmesine ve saatlerce kota okuyamamasına yol açar (*"Kotayı sormak, kotayı tüketen şey olmamalıdır — X-170"*). Bu yüzden sistem bellekte tutulan güvenli bir önbellek üzerinden karar verir.
- **Tazeleme Kanalları:**
  1. *Periyodik Nabız (`beat`):* Arka plandaki servis, eldeki hesapları sırayla (en eski okunan hesaptan başlayarak — *round-robin by staleness*) tek tek sorgular.
  2. *Tur Sonu (`readOnEdge`):* Bir ajan işini bitirdiği (harcama yaptığı) anda o hesabın güncel durumu taranır.
  3. *Manuel Yenileme:* Engines sayfasından veya durum çubuğundan tek tıkla zorlama.
  4. *Çalışma Anı Duvar Tespiti (Hit-the-Wall Failsafe):* Bir hesap gerçekte duvara çarptığında Claude CLI'ın döndürdüğü hata Agent Farm tarafından yakalanır, o hesabın kaydı hafızada derhal zorunlu güncellenir (`refreshSlot`) ve nöbet/retry mekanizması (`carryOnAccount`) işi sıradaki hesaba devreder.

#### 5. Köprü ve Parite (Bridge Parity)

Hesap politikaları UI'a sıkışmış bir özellik değildir; Farm Bridge üzerinden tam programatik kontrole sahiptir:
- `policies.list` — Kayıtlı tüm özel politikaları ve stratejilerini listeler.
- `policies.save` — Yeni bir politika oluşturur veya günceller (`id`, `label`, `engine`, `strategy: 'chain' | 'emptiest'`, `steps: [{account, rule, ceiling}]`).
- `policies.delete` — Belirtilen politikayı siler.

### Sağlayıcı, Rota ve Tier Omurgası (X-97 — X-117, X-148 — X-151) {#rota-mimarisi}

*(3.341.0 — 3.369.0)* Klasik mimaride motor (Claude Code, OpenCode) ile model doğrudan birbirine bağlıydı. Yeni mimaride motor bir **çalıştırma kabuğu**, sağlayıcı (provider) bir **uç nokta ve servis sağlayıcı**, rota (route) ise **bağlantı hattıdır**:

- **Motor vs. Sağlayıcı Ayrımı:** Claude Code veya OpenCode artık sadece resmî Anthropic uçlarına değil; Kimi, MiniMax, DeepSeek veya GLM gibi üçüncü parti sağlayıcılara yönlendirilebilir (`providerId`, `routeId`, `tier`).
- **16 Başlatma Boyutu (`RunDimensions`):** Bir görevin, oturumun veya otomasyonun nasıl başlayacağı `core/launchDimensions.ts` içinde veri olarak tanımlanmıştır: `engine`, `model`, `effort`, `permissionMode`, `route`, `tier`, `account`, `rounds`, `finishSound`, `superpowers` vb.
- **208 Parite Zorunluluğu (`parity.manifest.json`):** 13 başlatma kapısının tamamı (Konsol, Tasks, Harici Terminal, Misyonlar, Zamanlamalar vb.) aynı daraltma kurallarını (`narrowing rules`) yükler; bir kapının desteklediği bir boyutu diğerinin sessizce yutması testlerle engellenmiştir.
- **Arayüzde Rota Seçimi:** Kompozitörde (`c-route`), Konsol kartında, OS Terminalinde ve Görev formunda rota ve tier bağımsız birer açılır kutudur; motor değiştiğinde uyumsuz rota ve tier otomatik düşürülür.


**Anahtar merkezli bakmak yanlış bakmaktı.** Dört yerleşik motorun giriş ve
ödeme yolları aynı değil: Claude Code bir Pro/Max planı veya API key, Codex bir
ChatGPT planı veya API key, Gemini CLI kendi Google girişi veya API key,
Antigravity ise uygulamanın Google girişiyle çalışır ve ayrı bir key yolu
sunmaz. OAuth grant'leri ilgili CLI/uygulamada kalır; Agent Farm'a verilmez.
Bu yüzden sayfa "API anahtarları" sayfası değil; motor başına **dört soruyu**
yanıtlar:

1. CLI bu makinede var mı?
2. Bu motor **nasıl** ödeniyor?
3. Giriş yapılmış mı?
4. Yapılacak **tek şey** nedir?

Hiçbir satır yalnızca durum söylemez. Kurulu olmayan bir motora "giriş yap"
denmez — kurulum komutu satırdadır ve **Install** birincil düğmedir; giriş
ancak girilecek bir şey varken çıkar.

Yeni bir yerleşik motor eklenirken bağlayıcı uçtan uca prosedür:
[`YENI-MOTOR-EKLEME-SOP.tr.md`](YENI-MOTOR-EKLEME-SOP.tr.md). Motoru bir enum’a
veya seçiciye eklemek entegrasyon değildir; taşıma, protokol, kimlik, resume,
ölçüm, bütün çalışma/okuma yüzeyleri, Bridge ve gerçek iki turlu kabul birlikte
tamamlanır.

**⚡ Test — diskin söylemediği tek şey.** Yukarıdaki her satır diskten okunur ve
disk "giriş yapılmış" derken hiçbir şey çalışmıyor olabilir: bu makinede
`~/.codex/auth.json` canlı bir ChatGPT grant'i tutarken her Codex turu soket
seviyesinde ölüyordu (`os error 10013`, yerel güvenlik yazılımı). Bunu hiçbir
dosya okuması bulmaz; yalnız bir çağrı bulur. Test düğmesi **bir gerçek tur**
çalıştırır: motorun en küçük modeli, dört kelimelik bir prompt, ve motorun
sunduğu yerde salt-okunur kum havuzu — bir sağlık kontrolü dosyaya
dokunamamalıdır.

**‼️ Bu bir tur harcar, o yüzden kendiliğinden asla çalışmaz.** Zamanlamayla
değil, sayfa açılışında değil, yenilemede değil — yalnız düğmeye basınca.
Sonuç pencere boyunca önbellekte tutulur ve **yaşıyla** gösterilir: dört saat
önceki bir onay, dört saniye öncekiyle aynı iddia değildir. Başarısızlıkta
**motorun kendi sözleri** yazılır, uydurulmuş bir sebep değil.

### ‼️ Üreten motor · depolayan motor · köken — bir dosyanın klasörü kim çalıştırdı demek değildir (X-44)

Codex Desktop, başka bir ajanın geçmişini **kendi rollout biçimine çevirip**
gerçekten çalıştırdığı thread'lerin yanına yazar. Eklenti klasörü motor
saydığı için, Agent Farm'ın kendi başlattığı 13 dakikalık 12,47 $'lık headless
bir Claude mission'ı **13 milisaniyelik, 0 $'lık, kullanıcının yazdığı bir
Codex oturumu** olarak listelendi — üstelik kendi kaynağının yanında **ikinci
kez** sayılarak. Tek bir `engine` alanına üç ayrı olgu binmişti:

| Alan | Ne söyler | Bu vakada |
|---|---|---|
| `producerEngine` | işi **yapan** motor | claude |
| `storageEngine` | dosyanın **yaşadığı** biçim | codex |
| `provenance` | `native` · `imported` · `imported-unknown-source` | imported |

Bağ **tahmin edilmez, okunur**: `~/.codex/external_agent_session_imports.json`
her içe aktarılmış thread'i kaynak transcriptin yoluna, içerik hash'ine ve
aktarım anına bağlar (bu makinede tek seferde 50 kayıt). Manifest yoksa,
bozuksa ya da o thread'i anmıyorsa ham `<EXTERNAL SESSION IMPORTED>` /
`external-import-turn-*` işaretleri "bu bir kopyadır" demeye yeter, **üreticiyi
adlandırmaya yetmez** — sonuç `imported-unknown-source` olur, uydurulmuş bir
motor değil. Manifest ve kullanıcı transcriptleri **yalnız okunur**.

**Bir koşu, bir satır.** Kaynağı indekste bulunan bir import kopyası silinmez,
**alias**'a alınır: `aliasOf` kaynağa bakar, kaynak da `importAliases` ile
kopyayı bilir. `external()` / `allWithExternal()` yalnız kanonik satırı verir,
yani sayım bir kere olur; `byId` / `byFile` alias'ı bulmaya devam eder, yani
Codex thread'ini resume etmek ve "içe aktarılmış kopyayı aç" çalışmayı sürdürür.
Alias'ın **görünen olguları da kaynaktan miras alınır** — zaman aralığı,
maliyet, model, entrypoint, launcher — çünkü kopyanın kendi 13 ms'si ve 0 $'ı
üçüncü bir yalan olurdu. Kaynak indekste **yoksa** import görünür kalır ve
kendi elindeki veriyi sunar; hiçbir şey gizlenmez.

Sayım anahtarı `canonicalSessionKey()`, açma/resume anahtarı `sessionId`.
İkisini karıştırmak bu maddenin tamamıdır. Bridge tarafında `sessions.find` ve
`sessions.recent` satırları geriye uyumlu olarak `producer` · `storage` ·
`provenance` · `canonicalId` · `importedFrom` · `importedAt` · `aliasOf` ·
`importAliases` taşır.

### ‼️ `role: "user"` bir protokol kanalıdır, "bunu bir insan yazdı" demek değildir (S-36)

Claude ve Codex transcriptleri modele giden kanalı `user` diye adlandırır; bu
yüzden Agent Farm'ın **kendi ürettiği** mission/task/schedule brief'leri, bir
insanın yazdıklarıyla aynı satırda görünüyordu. Sonuç: "You are the LEAD of a
mission…" metni 🧑 **You** filtresinde çıkıyor, `search.transcripts
roles:["user"]` ise açıklamasında "yalnız bir İNSANIN sorduğu" diyordu.

Protokol rolü yerinde kalır; **yazarlık ikinci bir eksendir** ve Agent Farm'ın
zaten kaydettiği olgulardan türetilir (`authorship.ts` → `userAuthorOf`):

- `human` → **You** (Console'da yazılan `sdk-cli` oturumu dahil; istisna
  `sessionOrigin` içinde zaten var ve korunur)
- `automation` → **Mission prompt** · **Task prompt** · **Schedule prompt** ·
  **Trigger prompt** · **Workflow prompt**, launcher'ı bilinmiyorsa
  **Automation prompt**
- `unknown` → çözülemeyen bir import: **Imported — author unverified**. Kanıtsız
  kesin hüküm kurulmaz; belirsizlik görünür kalır.

Aramada bu, `automation` adlı **yeni bir rol yongası**dır: `user` artık gerçekten
yalnız insanın yazdıklarıdır, `Conversation` ön ayarı üçünü birden alır ve
**People only** tek tuşla yalnız insanı bırakır. Kayıt diskte hâlâ `user`
shard'ında durur (`storedRoles`); ayrım okuma anında, oturumun yazarına göre
yapılır (`displayRole`) — yani korpus yeniden kurulmaz.

**Başlık de wrapper'dan değil, işin kendisinden gelir.** `missions.ts` her lead
promptunu tek şablondan üretir, bu yüzden üç ayrı mission tek ve aynı başlıkla
geliyordu. `conversationTitle` artık tanınan şablonun `## Mission` gövdesini
başlık yapar; gövde boşsa **launch binding'in kendi adı** kullanılır. Tanınmayan
bir prompt asla spekülatif ayrıştırılmaz — mevcut başlık korunur.

### ‼️ Aynı gibi görünen oturumları ayırt et, gerçek tekrarları silme (U-63)

İki ayrı arıza aynı ekranda "aynı oturum üç kez çıkıyor" diye okunuyordu:
başlıklar şablondan geldiği için aynıydı (S-36) ve bir Claude transcripti ile
onun Codex kopyası iki ayrı grup üretiyordu (X-44). Arama tarafındaki üç
kural bunu kapatır:

1. **Havuz kanonik koşuda tekildir** — `orderSessions` `canonicalSessionId`
   üzerinden teke indirir; kaynak + alias tek grup, tek sayaç.
2. **Aynı kaydın iki kez gelmesi tek hit'tir** — kimlik `rol + tur + zaman +
   araç + metnin başı`, yani kaydın transcriptteki **yeri**. Kullanıcı aynı
   kelimeyi iki ayrı turda gerçekten yazdıysa iki hit korunur; snippet
   eşitliğine göre kör dedupe yasaktır.
3. **Grup başlığı ayırt edicidir** — motor rozetinin yanında `#<8 karakter>`
   kısa kimlik, yazar imzası (🧑 / 🤖 / ❔) ve import işareti `⇄`; uzun form
   AFTip'in içindedir (tam id, kanonik koşu, yazar ve launcher, üreten motor,
   köken cümlesi). DENSITY + SHORTHAND: dar yerde en kısa kesin biçim, anlam
   hover'da.

`matchesFound` · `matchesShown` · `sessionsMatched` · `sessionMatches` bu
kanonikleştirmeden **sonra** hesaplanır ve UI ile `search.transcripts` aynı
`TextSearchService` sonucunu gösterir.

Kimlik bilgisi hiçbir yolda eklentiden geçmez: giriş ve kurulum komutları bir
terminale **yazılır, çalıştırılmaz**; anahtar yolu kasanın kendi formunu açar;
belge bağlantısı yalnız `https`. Köprüde `engines.status` (okur) ve
`engines.test` (bir tur harcar, kurulu olmayan motorda reddeder).

Farm Settings'teki **Engines** bölümü bu sayfanın özetidir; derinlik burada.

### Birini seçmek — motor ekseni (3.102.0) {#engine-axis}

Hangi motorların çalıştığını bilmek işin yarısıydı. Öteki yarısı **onunla bir şey
başlatabilmek**, ve 3.102.0'a kadar eklentideki her düğme tek kelime etmeden
`claude` başlatıyordu.

**Nerede seçilir.** Console bestecisinde ajan kutusunun yanında bir motor kutusu
var; sol paneldeki ▶ bunu ilk sorusu olarak sorar (*Runs on*), tam **Start
Session…** başlatıcısı da öyle; New-task formunda bir **Engine** satırı var — ve
zamanlamalarla tetikleyiciler bunu miras alır, çünkü onlar henüz olmamış
görevlerdir; bir misyon delegasyonları için bir motor alır, üye kendi motorunu
yazarak onu ezebilir. En çok kullandığını `agentFarm.launchDefaults.engine`
içinde bir kez ayarla, aksi söylenene kadar her yerde cevap odur. **İkisi
arasında seçim yapmak zorunda değilsin:** aynı pencerede bir Claude oturumu ile
bir Codex oturumu yan yana koşar, ve her satır hangisinin hangisi olduğunu yazar.

**Burada koşamayan motor listede durur ve reddedilir.** Gizlemek "bu sürümde
Codex yok" ile "Codex'in giriş yapmamış"ı aynı görünüşe indirirdi; satır durur,
seçilemez, ve yanında yapılacak tek şey yazar. Ret cümlesi tek yerde yazılıdır —
panel, quick pick, görev ve köprü aynı şeyi söyler.

**‼️ İki motor aynı şeyin iki yazılışı değildir, ve yüzeyler bunu söyler.**
Claude Code tek uzun ömürlü süreçtir: tur sırasında yazdığın mesaj o turu
YÖNLENDİRİR, model/efor/izin canlı kontroldür. `codex exec` ise **tur başına bir
süreçtir** — tur sırasında yazılan mesaj tur bitene kadar BEKLETİLİR, seçiciler
*bir sonraki* turun bayraklarıdır, ve izin modu **önden seçilen bir KUM HAVUZUNA**
dönüşür, çünkü bu motorun soracak kimsesi yoktur ("Default" burada read-only
demektir). Çalışan bir oturum kartında motorunun rozetini taşır, bestecinin
altındaki satır da neyin değiştiğini açıkça yazar.

**Proje brief'i farklı yoldan gider.** Claude onu komut satırında ek bir sistem
promptu olarak alır. Codex'in böyle bir kanalı yoktur — prompt, `AGENTS.md`,
config, başka bir şey yok — bu yüzden Console'da brief **ilk promptun** içine,
çitlenmiş olarak ve bir kez biner. O motordaki bir *terminal* oturumuna ise hiç
anlatılmaz ve bu söylenir: senin kendi terminaline senin adına yazmak bu
eklentinin işi değildir.

**‼️ Abonelikli motor fiyat söylemez, ve $0.00 daha küçük bir sayı değil YANLIŞ
bir sayıdır.** Codex bir planla koşar ve tur başına ücret değil token bildirir;
onunla ilgili her rakam token cinsindendir ve yanında para olmamasının sebebini
yazar: çalışan tur, oturum satırı, kart hover'ı, turu kapatan satır ve köprü
(`tasks.list` / `tasks.add` üzerinde `reportsCost`). Tahmin de yapılmaz — bizim
fiyat kartımız Anthropic'in, onu bir ChatGPT planının tokenlerine uygulamak iki
kez yanlış olurdu.

**Ve böyle bir motorda maliyet tavanı hiçbir anlam taşımaz** — misyonlar bu
yüzden ikinci bir para birimi kazandı. Bir misyonda dişi olan tek sınır
`maxCostUSD`'dir; abonelikli bir delege onu hiç kıpırdatmaz, dolayısıyla böyle
bir ekip asla ulaşılamayacak 5 dolarlık bir tavana karşı bütün plan penceresini
yakabilirdi. `maxTokens` (varsayılan 2 000 000, `0` = yok) onunla birlikte
denetlenir, hangisi önce biterse koşu orada durur, ve **planlayıcıya brief'inde
token bütçesi de söylenir** — yalnızca "$5.00 left" gören bir lead hiç harcama
yapılmamış gibi plan yapardı.

### Tavanlar koşunun parasını ödeyene aittir (3.231.0) {#mission-limits-free}

Yukarıdaki sınırlar kullanıcınındır; bir süre değildi. `missions.start` yazılan
rakamı kırpıyordu — 24 saat duvar saati, 500 dolar bütçe, 30 tur, 60 görev, 6
paralel — ve bunu **sessizce** yapıyordu ki bu reddetmekten kötüdür: beş günlük
bir maraton istenen koşu iki gün alıyor ve kimsenin yazmadığı bir sebeple erken
bitiyordu. O rakamlar burada, başkasının parası için uyduruldu. Bir komuta
merkezi VARSAYILAN dağıtır; tavan, sahibinin verme ve ödeme hakkı olan bir
karardır.

Dolayısıyla hiçbir eksen yukarıdan kelepçelenmiyor ve **`0` her eksende
LİMİTSİZ demek** — `maxRounds`, `maxTasks`, `maxCostUSD`, `maxTokens`,
`maxMinutes`, `maxParallel`. Bu, `maxTokens`'ın zaten söylediği tek kelimedir;
artık altısı da onu söylüyor, böylece okuyan altı özel durum yerine bir kural
öğreniyor. Ayakta kalan şey TABAN: en küçük çalışabilir değerin altındaki
POZİTİF bir rakam istek değil yazım hatasıdır ve o tabana çekilir; `0` ise
"tavan yok"un yazılışıdır.

‼️ **Tur tavanının arkasında iki tasma saklıydı** ve onunla birlikte çıkarılması
gerekti. `hardCallCap` `maxRounds + 6` idi; yani "ne kadar sürerse sürsün koş"
diyen alan dosyanın en dar sınırını üretecekti — altı planlayıcı çağrısı. Ve
planlayıcının bütçe satırı lead'e "Infinity round(s)" kaldığını söyleyecekti.
`maxParallel: 0` bir turun tamamını tek dalgada koşar; tek-yazar kuralı yine de
böler, çünkü o kural hız değil doğruluk kuralıdır.

Kural çağıranın içinden çıkıp `src/core/missions.ts` içinde
`normalizeMissionLimits()` oldu, çünkü bir kapanışın içindeki kuralı hiçbir test
tutamaz. `test/test_mission_limits.js` onu tutuyor.

### Geçilebilen bir tavan tavan değildir (3.233.0) {#mission-wave-guard}

Yukarıdaki her sınır PLANLAYICI SINIRINDA ölçülüyordu — turun başında, önceki
dalga oturmuşken ve uçan hiçbir şey yokken. Asılı kalmış bir dalganın hiç
ulaşmadığı tek an da orasıdır. Gerçek bir koşuda ölçüldü (`mt4gqn99mxam3`): tek
bir delege 45+ dakika cevap vermeden kaldı, koşu 50 dakikalık tavanını geçti,
70. dakikada hâlâ `running` idi ve elle durdurulmak zorunda kaldı. Rakam 50
diyordu, koşu 70 sürdü; bu bir tavan değil, tavan görüntüsüdür — M-11'in bütçe
için söylediğinin aynısı.

Bu yüzden uçan dalga da ölçülüyor; kaba bir zamanlayıcıyla (`WAVE_GUARD_MS`,
15 sn — cevap vermeyi kesmiş iş için bir emniyet ağı, kronometre değil). Aynı
`guardReason(remainingBudget(…))` çağrısını koşuyor, dolayısıyla maliyet ve
token bedavaya geliyor: bir dalga hiç geri dönmeden ikisini de harcayabilir.

‼️ **Yapmadığı şey çekip gitmek.** Yere bırakılmış bir promise, kimsenin asla
sahiplenmeyeceği gerçek süreçleri çalışır hâlde bırakır; bu yüzden koruma bir
insanın isteyeceği iptalin aynısını istiyor — dalganın görevlerini, çocuk
hedeflerini ve zincirlerini durduran ama MOTORU durdurmayan `cancelWave` ile —
ve sonra dalganın oturmasını yine de bekliyor. Adımlar gerçek bir sonuçla,
defter gerçek bir maliyetle dönüyor ve oturmamış her adım *"stopped by the
mission ceiling — …"* cümlesini taşıyor. Koşu, tavanı adıyla anan `partial`
hükümle `hard-limit` olarak kapanıyor; bir elin yaptığını iddia edecek
`cancelled` ile değil.

### Model kutusu motorun kendisine sorar (3.103.0) {#engine-models}

Motor ekseni indi ama **yanındaki kutu inmedi**: hangi motor seçilirse seçilsin
model listesi `agentFarm.modelAliases` idi — elle yazılmış dört Claude takma adı.
Codex seçildiğinde kutuda hâlâ `sonnet` yazıyordu; o motorun CLI'ı bunu yalnızca
reddedebilirdi, üstelik kendi `/model`'i o sırada altı başka model sunuyordu.

Aynı kökten ikinci bir çürüme daha vardı ve o yalnız Codex'i ilgilendirmiyordu:
**sabit bir liste bir son kullanma tarihidir.** Yarın çıkan bir model akşam
CLI'ın içindedir, aylar sonra hâlâ bu listede yoktur — çünkü bir sabit ancak
biri varlığını hatırlarsa değişir.

Bu yüzden liste artık **yazılmıyor, okunuyor** (`core/models.ts`):

- **Codex** — `~/.codex/models_cache.json`, CLI'ın servise karşı tazelediği
  kendi kataloğu. `visibility: "list"` süzülür, `priority` sırasına dizilir:
  terminaldeki `/model` ile **aynı satırlar, aynı sırada**. Katalog her modelin
  **kendi** akıl yürütme dağarcığını da taşır, bu yüzden efor kutusunun cevabı da
  buradan gelir — luna'nın beş seviyesi vardır, 5.5'in dördü; tek ortak liste
  ikisi için de yanlıştı.
- **Claude Code** — diskte tam katalog yok: takma adlar CLI'ın içindedir ve
  `~/.claude/.claude.json` yalnızca `additionalModelOptionsCache`'i tutar, yani
  **bu hesaba** ayrıca verilenleri. Dolayısıyla Claude = senin takma ad listen
  **artı** CLI'ın hesap için kaydettikleri; yeni tanımlanan bir model hiçbir
  ayar düzenlenmeden kutuda belirir.
- **Gemini** — ölçülmüş bir katalog yok, o yüzden iddia da yok: ayar listesi
  durur ve kutunun `source`'u bunu söyler.
- **Antigravity** — motorun tek kataloğu `agy models` ve bu uzak bir istektir.
  Geçerli VS Code süreci için bir kez belleğe alınır (açılıştan sonra arka planda
  ısıtılır ya da ilk seçici çiziminde hemen istenir); pencere kapanana kadar bütün
  seçiciler aynı cevabı kullanır. Yeni VS Code süreci yeniden sorar. Arka plan
  cevabı listeyi değiştirirse açık bütün seçiciler yeniden çizilir; paneli tekrar
  açmak gerekmez.

Kutu **nereden geldiğini ve ne kadar eski olduğunu** yazar (`note`), çünkü
tarihlenemeyen bir listeden şüphelenilemez. Katalog okunamazsa (Codex kurulu ama
hiç koşmamış) takma ad listesine düşülür — ama **sessizce değil**: not, gösterilen
şeyin motorun kendi cevabı olmadığını söyler.

**Üç kutu tek bağımlı seçimdir.** Motor değişince model kutusu o motorun
önbellekteki kataloğundan yeniden kurulur ve efor hemen uzlaştırılır; model
değişince efor kutusu o modelin kendi dağarcığı ve varsayılanından yeniden
kurulur. `sonnet` Codex'e taşınsaydı CLI'ın reddedeceği bir değer kalırdı;
geçersiz değer görünmezce tutulmak yerine temizlenir. Console sekmesi zaten açık
olsa bile *Talk to Agent* yeni bir bestecidir: motor, model, efor ve izin önceki
başlatılmamış besteciden miras alınmaz, o anki başlatma varsayılanlarından tekrar
tohumlanır. Ajanlar da körlemesine ad geçirmesin diye `engines.models` motor
başına modelleri, model başına eforları ve cevabın motorun kendisinden mi ayardan
mı geldiğini taşır.

## Medya Üretim Hattı

1.0 ile eklenti kategori değiştirdi: metin ajanların ve **medya modelleri** (görsel/video/ses) aynı zincirde çalışır — İçerik Fabrikası.

### 🎬 Studio — hattın tek sayfası (3.30.0) {#studio}

Dört parça çalışıyordu ama hiçbiri diğerine bağlı değildi: sahne manifestosu (`production.json`), varlık duvarı (Galeri), sekans dışa aktarımı (Premiere) ve üreten/içeri alan makine (sağlayıcılar, izlenen klasörler, bütçe). Yani **kullanıcının fiilen yürüttüğü iş** — *planla → üret → ayıkla → sahneye ata → onayla → kurgula* — hiçbir yerde bütün olarak görünmüyordu.

**Studio** o hattın kendisidir; global nav'da **🎬 Studio**, beş sekme:

| Sekme | Ne cevaplar |
| --- | --- |
| **Pipeline** | Prodüksiyon sahne sahne: durum çipi (tıkla → değiştir), tür bazlı sayılar, küçük görsel şeridi ve **o sahnenin bir sonraki adımı** tek düğme olarak |
| **Assets** | **Medya kütüphanesinin duvarı** (3.681.0, X-424): yerel Airtable veritabanının kayıtları — her kart aşamasını, durumunu, sonucunu (gerekçesi üzerine gelince), A/H puanını, form doluluk yüzdesini ve sebep/sonuç zincirini (üzerine gelince) taşır. Burada üretilmiş kayıt Open · Re-run · Vary… · Feedback… · Scene… kapılarını korur; burada üretilmemiş kayıt yalın karttır. `.media.json` yan dosyaları yalnızca **önbellektir**: motor kapalıysa, veritabanı seçilmemişse ya da dosya henüz kaydedilmemişse — duvarın üstündeki not hangisi olduğunu söyler. Sayfa duran bir motoru asla başlatmaz. Filtreler (veritabanı, aşamalar, tür, başarı) esneme noktasıdır: `agentFarm.studioLibrary*` ayarları, canlı filtre satırı, köprüde `studio.library`. **Duvar geri yazar** (3.682.0, X-425): ✓ Keep → `workflow.approval_chain` · ✗ Drop → `failure` + `workflow.rejection_count` · ✎ etiketler / puan (`technical_quality.human_quality_score`, 0–1) / not (`moderation.notes`) — yalnızca kartın gösterdiği sürümün üzerine yazılır; o arada değişmiş bir kayda (Admin paneli, bir ajan) dokunulmaz ve kart bunu söyler. ↑ terfi ettirir (→ asset, → final): dosya bir sonraki aşama klasörüne, kaydı da onunla birlikte taşınır — önce sorar ya da `agentFarm.studioLibraryPromote` = `auto` ise hemen yapar. Çekirdek `core/studioLibraryWrite.ts`, pencereler `panels/studioLibraryActions.ts`, köprü `studio.library.edit` |
| **Triage** | **Kimsenin bakmadığı varlıklar** — ✓ Keep / ✗ Drop |
| **Assemble** | Dışa aktarımın **birebir** içereceği klipler, sırasıyla; XML + EDL düğmesi |
| **Sources** | Sağlayıcı anahtarları (var/yok), izlenen klasörler, elle varlık kaydı, bugün/30 gün/toplam maliyet ve bütçe |

**Sahnenin "bir sonraki adımı" tahmin değil, kanıttan türer** — bu sırayla: hiç varlık yoksa **Generate**, kimsenin yargılamadığı varlık varsa **Triage**, yargılanmış ama onaylanmamışsa **Set status**, onaylıysa **In sequence**.

**Triage neden yeni:** varlık ayıklama (keep/drop) eskiden yalnızca bir iş akışının *selection* adımının içinde vardı — yani bir iş akışı dışında üretilen ya da izlenen klasörden gelen hiçbir şey yargılanamıyordu. Studio'daki Triage aynı alanlara (`selectedUrls` / `rejectedUrls`) yazar, dolayısıyla galeri rozetleri ve **sekans seçici** kararı olduğu gibi onurlandırır: **düşürülmüş bir varlık sekansa asla girmez.**

Eski **Open Media Gallery** komutu duruyor ve Studio'nun **Assets** sekmesini açıyor — galeri tam olarak oydu.

**‼️ Köprü op'ları — Studio'nun hiç köprüsü yoktu, ve bunun en pahalıya patladığı yüzey burasıydı.** Medya üretmek tam olarak bir ajanın sürmesi gereken uzun, tekrarlı, çok adımlı iştir — manifestoyu yaz, üret, ayıkla, ata, onayla, kurgula — oysa bu hareketlerin her biri yalnızca birinin tıklaması gereken bir kart olarak vardı. Okuma: `studio.productions` (bütün manifestolar; her sahne durumu ve varlık sayılarıyla) · `studio.assets` (üretimler; prodüksiyona, sahneye ya da triage'ın verdiği karara göre daraltılır — üzerinde çalışılacak yığın `state:"undecided"`'dır). Yazma: `studio.production.new` (**her satıra bir sahne başlığı**, virgülden asla bölünmez) · `studio.scene.status` · `studio.assign` (bir prodüksiyona ve sahneye dosyalar; ikisi de verilmezse ayırır) · `studio.triage` (tut ya da ele — bir iş akışının selection adımının yazdığı aynı iki alan) · `studio.rerun` (`rerun` aynı girdiyi yollar · `vary` sizin yeniden yazdığınızı · `feedback` eleştiriyi özgün girdiye katar; kare neredeyse doğruyken başvurulacak olan budur — yeni koşu, ilkinin dosyalandığı yeri devralır) · `studio.export` (`fcpxml`, `edl` ya da `both` — XML ve yanında EDL, Studio'nun dışa aktarma kartının yazdığı; yalnız bir sahneye atanmış varlıklar yerleştirilir; kart da op da `core/sequenceExport.ts` üzerinden yazar). Kayıt `core/studioBridge.ts`'tedir ve sayfanın çağırdığı `core/production.ts`, `core/media.ts`, `core/premiere.ts`'in aynısını çağırır.

### Medya Adımı (🎬)

Workflow kurarken **Media step** seç: adım bir üretim modeli çağırır. Model kimliği serbest metindir ve **hangi sağlayıcıya gideceğini kimliğin öneki belirler** (2.26.0 — MediaProvider soyutlaması):

- **fal.ai (varsayılan):** önek yoksa fal.ai kuyruk API'sine gider — `fal-ai/flux/schnell` gibi. Tek kapı stratejisiyle Kling, Seedance, Veo, Flux, Nano Banana sınıfı yüzlerce modele erişirsin. Anahtar: **FAL_KEY**. Mevcut tüm workflow'lar değişmeden çalışır (önek eklenmedi).
- **Replicate:** `replicate:` önekiyle Replicate prediction API'sine gider — `replicate:black-forest-labs/flux-schnell` (en yeni) ya da `replicate:owner/name:<version>` (sabit sürüm). Anahtar: **REPLICATE_API_TOKEN** (secret olarak sakla; ayar `agentFarm.replicateAuthSecret`).

Sağlayıcı farkı adım için şeffaftır: indirme, asset arşivi, galeri, maliyet, seçim ve vision QA hepsi aynı çalışır. Yeni sağlayıcılar tek arayüzle (`submit/poll/assets`) eklenir; fal davranışı birebir korunur.

- **Girdi şablonu** JSON'dur ve `{prev_text}` / `{prev_json.alan}` çözülür: ajanın yazdığı prompt doğruca modele akar.
- Üretilen **varlıklar (asset) indirilir ve arşivlenir**; yanıt JSON'u sonraki adımın devri olur (`{prev_json.images.0.url}` gibi).
- Uzun video işleri dakikalarca sürebilir — adım `running` kalır, kuyruk durumu düzenli yoklanır (adım başına zaman aşımı ayarlanabilir).
- Ön koşul: **FAL_KEY** sırrı (yukarıdaki adımlar). Anahtar yoksa adım koşmaz ve net bir mesajla failed olur; kredi bittiyse fal'ın hatası arşive düşer.
- **Görsel kalite denetimi (vision QA — 2.25.0):** media adımına isteğe bağlı bir kalite ölçütü verirsin (sihirbaz sorar). Üretim biter bitmez **vision yetenekli bir model** (ucuz yargıç, varsayılan haiku) üretilen dosyayı **Read aracıyla açıp** inceler ve ölçüte göre PASS/FAIL + gerekçe döner. FAIL ise adım, gerekçeyi input'un `prompt` alanına ekleyip **kendini yeniden üretir** (ayarlanan deneme sayısına kadar); son denemede de geçemezse onFail uygulanır. Metin `verify` ölçütünün görsel karşılığıdır — "tek kişi, net yüz, altı parmak yok, tarife uygun" gibi. Yargıç çalışamazsa (model/izin) hattı bloke etmez, geçirir.

### Medya Galerisi

`Agent Farm: Open Media Gallery` (Tasks başlığındaki kamera ikonu): üretilmiş tüm görsel/video/sesler — önizleme, model, girdi, tahmini maliyet, hangi zincirden geldiği. **Re-run** aynı parametrelerle yeniden üretir; **Vary…** girdiyi düzenletip üretir; **Feedback… (2.40.0)** "neyi beğenmedin?" diye sorar ve eleştirini prompt'a enjekte edip yeniden üretir (vision-QA retry'ının elle hali). **Scene…** varlığı bir prodüksiyon sahnesine bağlar/çözer. Tıkla → dosya açılır.

### Prodüksiyon Sahneleri (Dalga A)

Sahne-sahne ilerleyen üretimler (storyboard → görsel → video → kurgu) için **prodüksiyon manifesti**: ajanın klasöründe `production.json` — proje başlığı + sahneler (her sahnenin durumu: `draft / generating / review / approved`). Elle düzenlenebilir; `Agent Farm: New Production` sihirbazıyla da kurulur (başlık + virgüllü sahne listesi).

- Galeride üstteki **prodüksiyon / sahne / kaynak** filtreleriyle varlıkları süzersin.
- Seçili prodüksiyonun **sahne durum panosu**: satır = sahne, sütun = varlık türü (görsel/video/ses/diğer); hücreye tıkla → o sahneyi süz, durum rozetine tıkla → durumu değiştir (`production.json`'a yazılır).
- Media adımı sihirbazında (manifest varsa) üretilen varlıklar bir sahneye bağlanabilir; galeriden **Scene…** ile sonradan da atanır.

### Harici Varlık Alımı (Ingest — Dalga A)

fal.ai dışı üretimler (Higgsfield/Flow'dan elle indirilen klip, Premiere export'u, ComfyUI çıktısı) da sisteme girer:

- **İzlenen klasörler** (`agentFarm.ingestFolders`): her 30 sn'de bir taranır; yeni görsel/video/ses dosyaları galeriye **yerinde** kaydedilir (kopya yok — video büyük). İndirme sürerken dosya büyümesi tamamlanana kadar beklenir; 48 saatten eski dosyalar taranmaz. Klasöre proje/sahne ön-ataması yapılabilir.
- **Elle kayıt:** `Agent Farm: Register Media Asset(s)…` — dosya(lar) seç, istersen sahneye bağla. Harici varlıklar galeride `external:` rozetiyle işaretlenir; Re-run/Vary onlara uygulanmaz (kaynak parametre yok).

### Medya Maliyeti ve Bütçesi

`agentFarm.mediaPricing` kurallarıyla (görsel başına / saniye başına / istek başına USD) her işin tahmini maliyeti hesaplanır, galeriye ve Dashboard'daki **Media cost** kartına işlenir — metin + medya, tüm AI harcaman tek karnede. Varsayılan fiyatlar yer tutucudur: fal.ai fiyat sayfasından doğrula ve ayarla. **Aylık bütçe uyarısı:** `agentFarm.mediaBudgetMonthUSD` (0 = kapalı) — son 30 günün tahmini medya maliyeti eşiği aşınca ayda bir kez uyarır (webhook forward'a da düşer).

### Kurgu Köprüsü — Premiere Sekansı (Dalga D)

Sahneleri tek tek üretip onayladıktan sonra **"klasördeki klipler"i Premiere'de açılır bir sekansa** çevirirsin: `Agent Farm: Export Premiere Sequence` (ya da galeride prodüksiyon seçiliyken **Export sequence →** butonu).

- Prodüksiyon manifestindeki **sahne sırasına** göre, her sahnenin varlığından bir klip dizilir. Seçim yaptıysan **tuttuğun (selected) video** tercih edilir; yoksa video, yoksa görsel; reddedilenler alınmaz; varlığı olmayan sahne atlanır.
- İki dosya yazılır: **FCP7 XML** (`.xml` — Premiere `File → Import` ile açar; bin/klip yapısı sahne sırasını taşır) ve **CMX3600 EDL** (`.edl`). Kare hızı (24/25/30/60) ve sahne başına varsayılan klip süresi sorulur; süreler kurguda incelenir.
- **Adlandırma konvansiyonu:** izlenen (ingest) klasöre bir prodüksiyon bağlıysa, dosya adındaki sahne belirteci (`…_s03_…` ya da `…_S3_…`) otomatik o sahneye bağlanır. Böylece Premiere export'unu `P01_S03_T02.mp4` gibi adlandırıp geri koyduğunda doğru sahneye düşer — döngü kapanır.
- **Export watch:** render/export klasörünü `agentFarm.ingestFolders`'a ekleyip bir watch-trigger'a bağlayarak "export düştü → sonraki adım/görev" otomasyonu kurulabilir (mevcut tetik altyapısı).

### Reçeteler

`Agent Farm: New Recipe Workflow…` hazır fabrika şablonları kurar: **Metin → Görsel**, **Metin → Görsel → Video**, **Ses → Metin (Whisper)**. Kurulan zincirdeki yer tutucuları (KONU, URL) düzenleyip çalıştırırsın — boş sayfa problemi yok.

## Tarayıcı Adımları

API'si olmayan servislerin kapısı: zincire **Browser step** ekle — adımın ajanı, kendi tarayıcı MCP'siyle siteye girer, hedefi yerine getirir ve bulgularını sonraki adıma `{prev_text}` olarak devreder.

**Ön koşul:** ajanda bir tarayıcı MCP sunucusu kurulu olmalı (Agents ağacı → MCP → **Add MCP Server…** → örn. `npx chrome-devtools-mcp@latest` veya Playwright MCP). Agent Farm tarayıcı motoru taşımaz; güvenlik zarfını taşır:

- **Alan adı allowlist'i (pazarlıksız):** adımın `allowHosts` listesi ya da global `agentFarm.browserAllowHosts` URL'yi kapsamıyorsa adım **hiç çalışmadan** failed olur (onFail kuralların işler). Alt alan adları dahildir.
- **Adım başı onay:** `agentFarm.browserApproval` = `ask` (varsayılan) — her koşudan önce URL+hedefle modal onay; `auto` yalnız bilinçli tercihle.
- Ajan prompt'una sert kurallar gömülür: listedışı bağlantı açma, kimlik bilgisi uydurma, MCP yoksa deneme — "BROWSER MCP YOK" raporla.

Kurulum: `New Multi-Agent Workflow…` → **Browser step** → ajan + URL + hedef + izinli alan adları. `Edit Step…` ile URL/hedef/allowlist sonradan değişir; URL ve hedefte `{prev_text}`/`{prev_json.x}` çözülür.

## Farm Bridge ve CLI Yardımcısı (af.js) {#farm-bridge}

Agent Farm, filodaki herhangi bir ajanın (veya harici bir betiğin) VS Code eklentisiyle çift yönlü haberleşmesini sağlayan platform bağımsız bir dosya köprüsü (`Farm Bridge`) sunar.

### Otomatik Kurulum (Self-Provisioning)

Eklenti her başlatıldığında, `af.js` CLI yardımcısını platformun global storage dizinine otomatik olarak kopyalar / günceller:
- **Windows:** `%APPDATA%\Code\User\globalStorage\muvusoft.agent-farm\bridge\af.js`
- **macOS:** `~/Library/Application Support/Code/User/globalStorage/muvusoft.agent-farm/bridge/af.js`
- **Linux:** `~/.config/Code/User/globalStorage/muvusoft.agent-farm/bridge/af.js`

### Ajanlar ve Betikler İçin Kullanım Yolları

`af.js` yardımıyla eklenti fonksiyonlarını çağırmak, kabuk tırnak ve kaçış (escaping) hatalarını tamamen engeller.

1. **Operasyon Kataloğu Keşfi (`farm.ops`):**
   ```bash
   node <bridgeDir>/af.js farm.ops
   ```
   Eklenti o an sunduğu tüm fonksiyonları ve argüman şemalarını yanıt olarak döndürür.

2. **Kabuktan Bağımsız Basit Argümanlar:**
   ```bash
   node <bridgeDir>/af.js notices.list handled=false limit=5
   ```
   `anahtar=değer` çiftleri PowerShell, cmd ve Bash'te tırnak kaçışına ihtiyaç duymaz.
   Boolean, sayı ve `null` değerleri kendi türlerine çevrilir; metinler metin olarak kalır.

3. **Dosya İle Argüman Gönderimi (`@args.json` - Karmaşık İçerik İçin Tavsiye Edilen Yöntem):**
   Uzun metinler, çok satırlı markdown raporlar veya karmaşık görev tanımları için argümanlar bir JSON dosyasına yazılır ve `@` takısı ile iletilir:
   ```bash
   node <bridgeDir>/af.js notices.post @args.json
   ```

4. **Yanıtı Dosyaya Yazdırma (`--out` / `-o`):**
   Ters yön, aynı gerekçe. `node af.js farm.ops > catalog.json` baytları **kabuğa**
   teslim eder; Windows PowerShell 5.1 çıkışta yeniden kodlar — operatöre göre
   UTF-16LE, ANSI kod sayfası ya da BOM'lu UTF-8. Diske düşen şey mojibake olur ve
   baştaki BOM'u `JSON.parse` doğrudan reddeder. `--out` dosyayı yardımcının kendi
   içinden, her zaman BOM'suz UTF-8 olarak yazar ve gövde yerine tek satır özet basar:
   ```bash
   node <bridgeDir>/af.js farm.ops --out docs/farm_ops_catalog.json
   # ok farm.ops -> D:\...\docs\farm_ops_catalog.json (184213 bytes, utf8)
   ```
   Olmayan klasörler oluşturulur; `--raw` yine sıkışık/okunaklı biçimi seçer.

5. **Klasik Ham Dosya Bırakma (Alternatif):**
   Gerekli hallerde istek `<bridgeDir>/<id>.request.json` olarak yazılıp `<id>.response.json` beklenerek de doğrudan kullanılabilir.

### Köprü Koruyucu ve Arama Filtresi (bridgeGuard)

Agent Farm ekosisteminde kural ihlallerini sessizce izlemek yerine mekanik olarak denetleyen kanca seviyesinde bir güvenlik katmanı bulunur (`src/core/bridgeGuard.ts`).

- **Gerekçe:** CLI motorlarının (Claude, OpenCode vb.) dahili oturum dosya düzenleri değişkendir ve doğrudan disk üzerinde oturum aramak (`grep`, `glob`, `find`, `rg`, `ls`, `dir`, `Select-String`) dakikalarca süren kör aramalarla bağlamı ve kota bütçesini tüketir. Agent Farm verileri dosya sisteminden elle taranmaz; daima köprüye sorulur.
- **Mekanik Engelleme (`PreToolUse` Kancası):** Ajan oturum kimliği içeren (36 karakterli tam UUID veya kayıtlı 8 karakterli kısa hex hash) bir arama yapmaya kalktığında, `PreToolUse` kanca seviyesinde `denyResponseBody` devreye girerek takım çağrısını (`permissionDecision: 'deny'`) durdurur.
- **Yönlendirici Ret Yanıtı:** Ajanın terminaline veya bağlamına arama yerine doğrudan köprü çağrısını gösteren net tek satırlık bir direktif yazılır:
  ```text
  "<id>" is a session id, and Agent Farm data is asked of the bridge, never hunted for on disk.
  Run `af.js sessions.find q=<id>` instead (answers file, engine, agent, cwd),
  and `af.js sessions.read id=<id>` hands over the conversation itself.
  ```
- **Kaçış Kapısı (`af:allow-id`):** Meşru bir dosya analizi veya ham disk erişimi zorunlu olduğunda, komut satırına veya arama desenine `af:allow-id` ibaresi eklendiğinde filtre o çağrı için güvenle devre dışı bırakılır. Ayrıca halihazırda köprüyü kullanan (`af.js`, `sessions.find`, `sessions.read`) komutlar asla durdurulmaz.
- **Motor Bazlı Kapsama (`bridgeGuardCoverage`):** Kancanın hangi CLI motoru üzerinde etkin olduğu (`claude-hook`, `codex-hook` veya desteksiz `none`) dinamik olarak raporlanır; desteklenmeyen motorlar sessizce geçiştirilmez.

### Oturum Kimlik Tespiti (sessions.whoami)

Çiftlikte çalışan bir ajan, CLI motorunun alt süreçleri altında (CLI → Shell → `node af.js`) yürütülür. Bir ajan köprüyü aradığında "Ben şu an hangi oturumum?" sorusu çalışma klasöründen tahmin edilerek değil, doğrudan somut kanıtlara dayanılarak çözülür (`src/core/whoami.ts`).

- **Klasör Tahmini Kesinlikle Yasaktır:** Aynı çalışma klasöründe (`cwd`) birden fazla eşzamanlı oturumun bulunması doğal bir durumdur. Klasör eşleşmesine dayalı kimliklendirme mimari olarak reddedilir.
- **Üç Kademeli Kanıt Çözümlemesi:**
  1. **Argüman (`arg`):** Çağrıcının parametre olarak açıkça ilettiği oturum ID'si (`session`).
  2. **Ortam Değişkeni (`env`):** CLI motorunun kendi süreç ortamına enjekte ettiği ve `af.js` yardımcısının otomatik olarak köprüye taşıdığı oturum kimliği (`envSessionId`).
  3. **Süreç Sicili ve Soy Ağacı Eşleşmesi (`registry`):** `af.js`, kendisini başlatan ebeveyn işlem kimliğini (`ppid`) gönderir. Sunucu, CLI'nin canlı oturum kayıt defterindeki (`<config-dir>/sessions/<pid>.json`) tüm etkin süreçleri tarar; çağıran sürecin ata zincirindeki en yakın CLI süreci oturumun gerçek sahibi olarak doğrulanır.
- **Kullanım Alanı:** Baton bayrak devri (`baton.pass`), oturum mühürleme (`baton.seal`) ve bildirim yanıtlama mekanizmalarında ajanın kendisini tanıtmasına gerek kalmadan bağlamın eksiksiz korunmasını sağlar.

### Çoklu-Motor Transkript Okuyucu (sessions.read)

Farklı yapay zekâ CLI motorları transkript kayıtlarını tamamen farklı veri yapılarında ve farklı terminolojilerle saklar (Claude `assistant`, Console `agent`/`result`, OpenCode SQLite veri tabanı vb.). `sessions.read` operasyonu, tüm motorların konuşma geçmişini tek bir ortak modele normalize eder (`src/core/sessionRead.ts`).

- **Ortak Rol Modeli (`ReadRole`):** `user`, `assistant`, `tool`, `toolResult`, `system`. Girdide `human`, `prompt`, `agent`, `model`, `call`, `result` gibi motor takma adları kabul edilir; çıktıda daima standart roller döndürülür.
- **Görsel Arayüzle Tam Eşitlik:** Ayrı bir ayrıştırıcı yazmak yerine görsel transkript sayfasının `buildData` motoru kullanılır; böylece arayüzde görünen ile ajanın köprüden okuduğu kayıt harfi harfine aynıdır.
- **Sayfalama ve Bağlam Koruması (Pagination & Clipping):**
  - `limit`: Sayfa başına adım sayısı (varsayılan 50, tavan 500).
  - `from`: Belirli bir adımdan itibaren okuma. Negatif değerler son adımları hedefler (örn. `from=-10`).
  - `turn`: Yalnızca belirli bir turun adımlarını seçebilme.
  - `maxChars`: Adım başına metin kırpma sınırı (varsayılan 4000 karakter). Taşma olduğunda `clipped` alanı gerçek bayt uzunluğunu raporlar.
  - Yanıtta `matched`, `returned`, `clipped` ve bir sonraki sayfa imleci olan `next` sunulur.

### Markdown Belge Dışa Aktarım Operasyonları (*.export ve mdTable)

Agent Farm arayüzündeki tüm Markdown dışa aktarma düğmeleri ile köprü operasyonları aynı veri inşa çekirdeğini paylaşır. Arayüzün ürettiği belge ile ajanın köprü üzerinden aldığı belge arasında hiçbir fark olamaz.

- **Ortak Tablo İnşa Çekirdeği (`src/core/mdTable.ts`):** Tablo üretiminde boru (`|`) işaretleri ve satır sonları güvenle kaçırılır; eksik alanlar ragged (düzensiz) bırakılmayıp boşluklarla hizalanır. En kritik kural: `0` ve `false` gibi falsy değerler eksik veri sanılıp yutulmaz, açıkça tablo hücresine yazılır. Sütunlar doğrudan kayıtlardan türetilir (`tableOfRecords`), yeni bir alan eklendiğinde tablo otomatik olarak genişler.
- **`tasks.export`:** Görev tahtasındaki tüm kayıtları (`taskRows()`) Markdown tablosu olarak diske döker. Maliyet (`costUSD`), durum, ajan, motor, oturum ID ve süre alanlarını standart bir tablo olarak dışa aktarır.
- **`turns.export`:** Belirli bir oturumun veya filtrelenmiş turların konuşma dökümünü (`turnsPanel.ts` görünümünde olduğu gibi) dışa aktarır. Her turun başlığı, kullanıcı mesajı, model yanıtı, araç çağrıları ve araç sonuçları hiyerarşik Markdown başlıkları altında yapılandırılır. Varsayılan olarak 50 tur sınırı ve `matched` / `truncated` sayaçları ile döner.
- **`tasks.analytics.export`:** Görev ve maliyet analitiği sayfasının özet metriklerini ve periyot tablolarını doğrudan Markdown raporu olarak dışa aktarır (`reports.tasks` veri çıktısının tablo karşılığı).

### İzole Git Worktree ile Paralel Görev Yürütme (parallel.run)

Aynı ajan üzerinde birden fazla görevi eşzamanlı olarak yürütmek için çalışma dizinini kirletmeden tam git izolasyonu sağlayan paralel yürütme motorudur (`src/core/parallelRuns.ts`).

- **Çift Kapı, Tek Çekirdek:** Komut paletindeki `"Agent Farm: Run Parallel…"` komutu ile köprüdeki `parallel.run` operasyonu tamamen aynı `planParallel` ve `launchParallel` fonksiyonlarından beslenir.
- **İzole Git Dizinleri (Worktree):** Her prompt için ana depodan bağımsız geçici bir `git worktree` ve `af/<worktree>-<stamp>` dalı açılır. Böylece görevler birbirinin kod değişikliklerini ezmez.
- **Eşzamanlılık ve Kota Disiplini:**
  - Tek seferde en fazla 6 prompt (`PARALLEL_MAX = 6`) kabul edilir; fazlası `dropped` dizisine aktarılır ve raporlanır.
  - Görevler ajanın `agentFarm.maxConcurrentPerAgent` limitine göre gerçekten paralel ya da kuyrukta sıralı (`serial`) başlatılır; dizinler her iki durumda da izole kalır.
- **Önce Plan, Sonra Çalıştırma (`dryRun: true` Varsayılanı):** `parallel.run` çağrıldığında varsayılan olarak `dryRun: true` döner. Hiçbir dizin veya görev oluşturulmadan önce depo geçerliliği (`gitRepo`), oluşturulacak dallar ve eşzamanlılık durumu ajan tarafından incelenebilir. Gerçek çalıştırma için açıkça `dryRun: false` verilmelidir.
- **Otomatik Commit Zorunluluğu:** Başlatılan her headless görevin promptuna otomatik olarak `" — İş bittiğinde değişiklikleri anlamlı bir mesajla commit et."` direktifi eklenir; böylece worktree birleştirmeleri (`Worktree Runs…`) sorunsuz tamamlanabilir.

### Sıfır Parite Açığı Güvencesi (parity.manifest.json)

Agent Farm mimarisinin temel taahhütlerinden biri "Arayüzde elle yapılabilen her eylemin ajanın köprüsü üzerinden de yapılabilmesidir".

- **Parite Bütçesi Kesinlikle Sıfırdır (`gapBudget: 0`):** `parity.manifest.json` dosyası, eklentideki tüm UI panellerini, butonlarını ve eylemlerini karşılık gelen köprü operasyonları (`ops`) ile birebir eşler. Açıkta kalan tek bir işlev dahi bırakılamaz.
- **Açık Gerekçeli Muafiyetler (`exempt`):** Köprü karşılığı olmayan tek eylemler, yalnızca insan gözünü ekranda gezdiren salt görsel gezinmelerdir (`navigation` türü muafiyetler — örneğin sadece paneli öne getiren veya imleci odaklayan komutlar).
- **Mekanik Test Kapısı (`test_parity.js`):** CI ve yerel test paketinde `test_parity.js` çalıştırılır. Yeni bir arayüz özelliği eklendiğinde karşılık gelen köprü op'u yazılmamışsa veya parite manifestosuna işlenmemişse derleme ve testler anında başarısız olur. Sistemde "unutulmuş veya ajana kapalı arayüz özelliği" var olamaz.

## Webhook Köprüsü

Dış dünya bağlantısının evrensel kapısı (0.9.0): n8n, Make, Zapier — webhook konuşan her şey.

### Dışarı: Webhook Adımı

Workflow kurarken ajan yerine **🌐 Webhook step** seçebilirsin: adım, claude değil bir HTTP çağrısıdır.

- URL ve JSON gövde şablonlarında `{prev_text}`, `{prev_json.alan}`, `{prev_output}` ve `{secret:NAME}` çözülür.
- Yanıt gövdesi arşive yazılır ve **sonraki adımın devri olur** — n8n'in döndürdüğü JSON'dan `{prev_json.alan}` ile okumaya devam edersin. 2xx dışı yanıt adımı failed yapar (onFail kuralların işler).
- Örnek zincir: psikolog analiz → webhook adımı analizi n8n'e POST'lar (n8n Telegram'a iletir) → n8n yanıtı zincirde kullanılır.
- **Auth başlığı (2.27.0):** sihirbaz opsiyonel bir başlık sorar (`Authorization: Bearer {secret:MY_TOKEN}` gibi; `{secret:}` çözülür) — kimlik isteyen API'lere bağlanmak için.
- **Poll modu (2.27.0) — genel kuyruk istemcisi:** sihirbazda "Poll until done?" sorulunca webhook adımı **submit → poll** yapan bir kuyruk istemcisine dönüşür. İlk çağrı işi başlatır; yanıttaki bir JSON yolundan (`urlField`, ör. `urls.get`/`status_url`/`name`) poll URL'si okunur; her poll'da bir durum alanı (`statusField`, ör. `status`) verilen "done"/"fail" regex'lerine göre değerlendirilir; iş bitince final yanıt devir olur. Böylece **provider yazmadan herhangi kuyruklu API** (Gemini gibi uzun-süren operasyon API'leri, self-hosted kuyruklar) zincire girer — auth başlığı poll isteklerine de taşınır, zaman aşımı ve aralık ayarlanır.

### İçeri: /trigger Ucu

**Add Trigger → Webhook** yeni bir gizli URL üretir: `http://127.0.0.1:<port>/trigger/<token>` (panoya kopyalanır; tetik satırından tekrar kopyalanabilir). Bu adrese POST gelen her istek tetiği ateşler; JSON gövde, görev prompt'una `{payload}` olarak girer. n8n tarafında bir HTTP Request node'u yeter: Gmail'e fatura düştü → n8n → Agent Farm "faturayı işle" görevi.

Güvenlik: uç yalnızca 127.0.0.1 dinler + token ister; yanlış token 404 alır; cooldown/saatlik tavan korumaları tetikte geçerlidir. Dış ağdan erişim gerekiyorsa bilinçli olarak kendi tünelini kurarsın (n8n yereldeyse gerekmez).

### Bildirim Yönlendirme (Cebe Düşen Filo)

`agentFarm.notifyWebhookUrl` ayarla → seçtiğin olaylar (izin bekliyor, takıldı, bütçe aşıldı, zincir bitti/başarısız — `notifyWebhookEvents`) o adrese JSON olarak POST'lanır: `{source:"agent-farm", type, message, ts}`. n8n'de webhook→Telegram akışı kurduğunda mutfaktayken telefonuna "psikolog izin bekliyor" düşer. URL'de `{secret:NAME}` kullanılabilir.

## Nöbet Görevleri

Ajanlarla yaptığın **süreklilik anlaşmalarının** sistemi: "şu dosyaya her tur bak, cevap gelmişse gereğini yap", "şu klasörü her gün kontrol et, dosya birikmişse tasnif et" gibi tetikte-kalma görevleri. Bunlar zamanla çoğalıp karışır — hangi klasördü, görev neydi, her tur muydu her gün müydü? Bu sistem hepsini tek yerde toplar.

### Nasıl Çalışır: Tek Kaynak, İki Okuyucu

Görevler, ajanın klasöründe **`DUTIES.md`** dosyasında yaşar. Bu bilinçli bir tasarım kararı:

- **Ajan okur:** CLAUDE.md'deki kısa bir yönergeyle ajan her oturum başında DUTIES.md'yi okur ve kurallarına uyar. Dosyanın başındaki şablon, ajan için kadans kurallarını da içerir ([every-turn] = her tur kontrol et, vb.).
- **Sen ve panel okursunuz:** Agents ağacında her ajanın **Duties** bölümü bu dosyadan beslenir — bir bakışta tüm nöbetler, kadansları ve **bekleyen iş durumu**.
- **Esneklik:** Dosyayı elle de düzenleyebilirsin; panel senin eklediğin satırları korur. Biçim basittir: `## Başlık [kadans]` + `- **Watch:**` + `- **Do:**` satırları.

### Görev Ekleme

Agents ağacında ajanın **Duties** satırına sağ tık → **Add Standing Duty** (ya da ajan detay sayfasındaki **Add duty**):

1. **Başlık** — örn. "Netleştirme istekleri"
2. **Kadans** — `every-turn` (her tur) / `session-start` (oturum başı) / `daily` / `weekly` / `manual`
3. **Watch** — izlenecek hedef: dosya seç, klasör seç, elle yol yaz veya boş bırak (hedefsiz görev de olur: "her tur ruh halimi kontrol et" gibi)
4. **Do** — değişiklik görünce yapılacak iş: "Cevaplanmış soruların gereğini yap ve soruyu dosyadan sil"

İlk görevi eklerken ajanın CLAUDE.md'sinde DUTIES.md referansı yoksa eklenti fark eder ve **onayınla** kısa bir yönerge bölümü ekler — referanssız görev, ajanın hiç bakmayacağı görevdir.

### Bir Bakışta Takip

Panelin asıl gücü burada — Duties bölümü sadece liste değil, **durum göstergesi**:

- İzlenen **klasörde** dosya birikmişse: turuncu göz + `3 waiting` — inbox'ta iş var demek. **Tooltip artık bekleyenleri gösterir (2.14.0):** hangi dosyaların beklediği (ilk 5 ad) ve en eskisinin ne zamandır oturduğu (`oldest 3d ago`) — panele gitmeden "ne birikmiş" görürsün.
- İzlenen **dosya** son 24 saatte değişmişse: turuncu göz + `changed 2h ago` — muhtemelen cevap yazdın, ajan henüz işlemedi.
- İzlenen yol **kayıpsa**: kırmızı uyarı + Insights'ta bulgu — klasör taşınmış, görev kopmuş.
- **Duraklatılmış** görevler soluk görünür ve ajan şablon kuralı gereği onları atlar.

Yönetim: göreve sağ tık → **Edit Duty…** (2.14.0 — başlık/kadans/watch/do/not alanlarını mevcut değerleriyle önceden doldurulmuş sihirbazda değiştir; dosyayı elle açmak gerekmez), **Pause/Resume** (silmeden dondur), **Delete**, **Open DUTIES.md** (elle düzenleme), **Move Up / Move Down** (2.15.0 — DUTIES.md'deki blok sırasını değiştirir; ajan dosyayı yukarıdan aşağı okur, önemli nöbeti üste al). Ajan detay sayfasında da tam tablo var: başlık, kadans, watch, do, durum.

2.15.0 ile gelen üç yönetim derinliği:

- **Add Duty from Template…** (Duties bölümüne sağ tık): kanıtlanmış nöbet kalıpları tek seçimle kurulur — *Soru-cevap döngüsü* (izlenen dosyada cevaplananların gereğini yap), *Inbox tasnifi* (klasörde birikenleri adlandır/taşı), *Haftalık hafıza bakımı*, *Çıktı klasörü nöbeti*. Şablon watch hedefini sorar, sonrasını Edit Duty… ile incelt.
- **Automate Duty (create trigger)…** (göreve sağ tık): nöbet ile otomasyon arasındaki köprü. Manuel nöbet yalnız **ajan çalışırken** işler; bu komut, watch hedefi gerçek bir dosya/klasör olan nöbetten bir **watch tetikleyicisi** üretir — hedef değiştiğinde ajan **boştayken bile** headless bir görev ateşlenir (debounce 10s, cooldown 60s, en çok 6/saat; Tasks görünümünden yönetilir). Nöbet DUTIES.md'de durur; ikisi birbirini tamamlar.
- **Copy Duty to Agent…** (göreve sağ tık): nöbeti başka ajana kopyalar (aynı başlık varsa uyarır); hedef ajanın CLAUDE.md'si DUTIES.md'ye referans vermiyorsa onayla ekletir.

**Ajan gerçekten bakıyor mu? (0.7.0)** Duties başlığında artık bir uyum göstergesi var: `read 2h ago` = ajan DUTIES.md'ye en son o zaman dokundu (oturum kayıtlarından tespit edilir); `never read` = kayıtlı oturumlarda hiç bakmamış. Ajan bu hafta oturum yaptığı hâlde dosyayı hiç okumadıysa Insights'a uyarı düşer — anlaşma kâğıt üzerinde kalmış demektir; CLAUDE.md yönergesini güçlendir.

### Örnekler

```
## Netleştirme istekleri [every-turn]
- **Watch:** `D:\zone\know\note\obsidian\NETLEŞTİRME İSTEKLERİ.md`
- **Do:** Cevaplanmış soru varsa gereğini yap ve soruyu dosyadan sil; aydınlatılması gereken yeni soruların varsa dosyaya ekle.

## Inbox tasnifi [every-turn]
- **Watch:** `D:\zone\know\note\obsidian\01_INBOX\00_FAST_NOTE`
- **Do:** İçerideki her dosyayı inbox girişi say: uygun isim ver, uygun klasöre taşı.

## Haftalık hafıza bakımı [weekly]
- **Do:** memory/ altındaki dosyaları gözden geçir; bayatlamış olanları güncelle veya arşivle.
```

**İpucu:** Görev/Workflow ile farkı karıştırma — nöbet görevi ajanın **oturum içindeyken** kendi kendine yaptığı kontroldür; Tasks kuyruğu ise senin (veya zamanlayıcının) dışarıdan başlattığı işlerdir. "Her tur bak" ancak ajan çalışırken işler; ajan hiç açılmıyorsa daily bir Task ile oturumu tetiklemek gerekir — ikisi birbirini tamamlar.

## Hafıza Yönetimi

Ajanın hafızası (`memory/*.md`) artık yalnız listelenmiyor — **gerçekten kullanılıp kullanılmadığı** ölçülüyor ve panelden yönetiliyor (2.14.0). Agents ağacında **Memory** bölümü:

- **Bir bakışta durum:** bölüm başlığı `N files • ~X tok • M recalled (30d)` — kaç dosya var, toplam ağırlığı ne, kaçı son 30 günde gerçekten hatırlanmış.
- **Recall takibi:** her dosya satırında `recalled ×5 (30d), last 2h` ya da `not recalled (30d)` yazar; hatırlanan dosyanın ikonu yeşildir. "Recall" = ajanın dosyayı bir araçla (Read/Edit/Write) **açıkça** açması — oturum kayıtlarından sayılır. MEMORY.md indeksi her oturumda pasif yüklendiği için bu metrikten muaftır (`index — loads every session` diye işaretli). Skills/MCP'deki "used/unused" mantığının hafıza karşılığı: 30 gündür hiç hatırlanmayan dosya, indekste yer kaplayan ölü ağırlık adayıdır.
- **Orphan işareti:** MEMORY.md'de referansı olmayan dosya satırda `⚠ orphan` gösterir — ajan indeksten bulamayacağı için o hafıza fiilen kayıptır.
- **Tooltip'te kimlik:** dosyanın frontmatter `type`'ı (project/feedback/user/reference) ve `description`'ı tooltip'te görünür.
- **New Memory File…** (bölümde **+**): ad + tür + tek satır açıklama sorar; frontmatter'lı dosyayı kurar ve **MEMORY.md'ye pointer satırını otomatik ekler** — yeni hafıza asla yetim doğmaz.
- **Archive Memory File** (dosya satırında arşiv ikonu): silmek yerine `memory/archive/` klasörüne taşır (tarama kapsamı dışı) ve MEMORY.md'deki satırını düşürür (indeks yedeklenir). "Belki lazım olur" dosyaları context'ten çıkarmanın güvenli yolu.
- **Copy Memory File to Agent…** (2.15.0, sağ tık): dosyayı başka ajana kopyalar ve hedefin MEMORY.md'sine pointer satırını otomatik ekler — kopya yetim doğmaz.
- **Scan Memory Contradictions…** (2.16.0, Memory bölümü sağ tık): ucuz model, ajanın hafıza dosyalarını çapraz okuyup **birbiriyle çelişen ifadeleri** listeler (hangi iki dosya, hangi iki iddia, kısa değerlendirme) — sonuç markdown raporu olarak açılır. Tarih/güncellik farkı çelişki sayılmaz; model çıktısı JSON doğrulamasından ve limit-mesajı korumasından geçer. **Bulgular öneri niteliğindedir: doğrulamadan silme/birleştirme yapma.**
- **Frontmatter denetimi (2.16.0):** description'sız hafıza dosyası Insights'a bilgi bulgusu düşürür — indeks satırı ve anlamsal arama açıklamaya dayanır.
- **Fix Memory Index…** (2.15.0, Memory bölümü/MEMORY.md sağ tık): indeksi tek seferde onarır — yetim dosyalara pointer satırı ekler (açıklama frontmatter'dan), var olmayan dosyalara işaret eden ölü satırları düşürür. Önerilen düzeltmeler tek tek seçilebilir; indeks yedeklenir.

### Hafıza Grafiği (Memory Graph)

**Agent Farm: Open Memory Graph** (Memory bölümüne sağ tık ya da komut paleti) — hafıza kayıtlarını birbirine bağlayan `[[wikilink]]` dokusunu görünür kılar (2.15.0). Kayıt yazma disiplininin ("ilgili kayıtlara [[ad]] ile bağlan") gerçekte işleyip işlemediğini burada görürsün:

- **Graf:** her kayıt bir düğüm (boyut = token ağırlığı, yeşil = son 30 günde hatırlanmış, sarı kesikli halka = MEMORY.md'de yok), her `[[link]]` bir kenar. `[[hedef]]` hem dosya adına hem frontmatter `name:` slug'ına çözülür. Düğüme tıkla → dosya açılır. MEMORY.md indeks olduğu için düğüm değildir.
- **Broken links:** hiçbir dosyaya çözülmeyen `[[hedefler]]` — yazım hatası ya da "yazılması planlanıp unutulmuş" kayıt. (Kullanıcı sözleşmesine göre kırık link hata değil, yazılacak kayıt işaretidir — ama farkında olmak istersin.)
- **Islands:** hiç link vermeyen/almayan kayıtlar — dokuya bağlanmamış bilgi; bağla ya da arşivle.
- **Hubs:** en çok link alan kayıtlar — bilginin merkezleri; bunları şişirme, bakımlı tut.
- **Not in MEMORY.md** kartındaki **Fix Memory Index…** düğmesi onarımı panelden başlatır.
- Ajan seçici üstte; veriler her açılış/Refresh'te dosyalardan taze okunur.
- **Sayfa dosyayı kendisi kurar (3.91.0):** yeni hafıza dosyası, başka ajana kopya ve damıtma bu sayfanın kartındadır — ad + tür + tek satır açıklama, ve dosya ile MEMORY.md satırı **aynı yazımda** doğar.

### ‼️ Hafıza köprüde: ajanın kendi tutması beklenen tek depo (3.93.0)

3.91.0 sayfaya "dosya kur" yeteneğini verdi ve köprüye söylemedi; `memory.*` **hiç yoktu** — okuması bile. Burada bu, başka herhangi bir yerden daha çok önemli: bir ajanın hafızası, ajanın **kendisinin** tutması beklenen depodur, ve o güne kadar bunu ancak eklentinin arkasından dosya yazarak yapabiliyordu — indeks satırı yok, tazeleme yok, frontmatter geleneği yok.

- **`memory.list { agent }`** — dosyalar, `type` ve `description`, ve her satırda **`inIndex`**. Bir hafıza dosyası hakkında dürüst soru "var mı" değil, "ajan onu hiç açacak mı"dır: her oturumda yüklenen tek şey indekstir.
- **`memory.add { agent, name, description, type? }`** — sayfanın çağırdığı yazarın aynısını (`core/memusage.ts`) çağırır, dolayısıyla dosya ve **MEMORY.md satırı tek yazımda** doğar. `description` süs değildir: **o satır indeks girdisinin kendisidir.** Ad kebab-case olmak zorundadır (dosya adı ve indeks hedefi olur), tür `user|feedback|project|reference`, ve aynı adla ikinci dosya sessizce birleştirilmez — reddedilir.

## Hafıza Senkronizasyonu

Sağlık motorunun yakaladığı **kopya hafıza** sorununun çözüm aracı: `Agent Farm: Sync Shared Memory…`

1. Ajanlar arasında aynı isimle bulunan hafıza dosyaları listelenir (✓ birebir aynı, ⚠ sapmış).
2. Dosyayı seç → iki eylemden biri:
   - **Compare two copies:** iki ajanın kopyasını VS Code diff ekranında yan yana karşılaştır — sapma tam olarak nerede, gör.
   - **Sync all copies from one source:** kaynak kopyayı seç (en yenisi işaretli gelir), onayla; diğer tüm kopyaların üzerine yazılır.
3. Üzerine yazılan her dosyanın yanına zaman damgalı `.afbak` yedeği bırakılır — pişmanlık geri alınabilir.

Senkron sonrası Insights kendini yeniler; grup "birebir aynı" durumuna düşer.

### Birleştirme Taslağı (Merge Draft)

Kopyalar sapmışsa ve ikisinde de değerli bilgi varsa "birini seç, diğerini ez" yetmez. Üçüncü seçenek **Create merge draft**:

1. Tüm kopyalar `=== FROM ajan (kaç gün önce) ===` başlıklarıyla tek bir taslak belgede alt alta açılır (en yenisi üstte).
2. Taslağı elinle düzenleyip nihai hâline getirirsin — işaret satırlarını ve istemediğin kısımları sil, iki kopyadaki değerli satırları birleştir.
3. `Agent Farm: Apply Merged Memory` komutunu çalıştır: düzenlediğin içerik (kalan işaret satırları otomatik ayıklanarak) **tüm kopyalara** yazılır; her dosyanın `.afbak` yedeği alınır.

Boş sonuç koruması vardır: taslağı tamamen silersen hiçbir dosyaya yazılmaz.

## LLM Wiki — Aday Havuzu ve Derleme (X-50) {#wiki}

*“Obsidian IDE'dir, LLM programcıdır, wiki kod tabanıdır.”* Kullanıcı `00_WIKI`'yi doğrudan elle yazmaz; ajanlar yazar. Ancak konuşma akıp giderken akılda tutulmaya değer bir anı fark ettiğinde, **"bu bilgi tam olarak nereye ait?"** sorusunu çözmeye çalışmak o anı kaydettirmemekle sonuçlanır. Bu yüzden sistem ikiye ayrılmıştır: **anında ve ucuz işaretleme** ile **bilinçli ve kurallı derleme**.

### Aday Havuzu Mantığı (3.201.0 — B-14)

**İşaretlemek bedavadır, geri alınabilir ve kasaya dokunmaz.** Aday havuzu (`wiki_candidates.json`), transkriptler ile kasanın `00_WIKI` yapısı arasında hafif bir bekleme istasyonudur. Bir konuşma veya tur işaretlendiğinde kasada hiçbir dosya oluşturulmaz veya değiştirilmez; derleme tamamen ayrı ve kontrollü bir adımdır.

- **Mükerrer İşaretleme Birleştirilir (Merge):** Aynı turun veya oturumun konsol rozetinden ve sağ tık menüsünden tekrar işaretlenmesi bir hata değildir ve ikinci bir satır yaratmaz. Örtüşen işaretleme konuları **birleştirir** ve tur aralığını genişletir; böylece sonradan aklına gelen bir konuyu eklemek için aynı yeri tekrar işaretlemen yeterlidir.

### İşaretleme Kapıları

1. **Tur Bazında İşaretleme (3.203.0 — K-26):**
   - Console'daki kullanıcı prompt satırlarında, transkript tur bantlarında ve Turns sayfasındaki her satırın başında sakin bir **🔖** rozeti yer alır.
   - Rozete tıklandığında veya sağ tık menüsünden **Add to Wiki Candidates…** seçildiğinde hafif bir popover (`media/afWiki.js`) açılır.
   - Popover tur aralığını (`4`, `3-7` veya tüm konuşma için boş), havuzda zaten var olan konuları tıklanabilir çipler olarak ve yeni konu yazma kutusunu sunar. Hem işaretlenen çipler hem de yazılan yeni konular birlikte kaydedilir.
   - Daha önce işaretlenmiş bir turda rozet yanık gelir (`lit`) ve tıklandığında mevcut konular seçili olarak açılır.

2. **Oturum Bazında İşaretleme (3.202.0 — S-38):**
   - Sessions tablosunda, Console oturum kartlarında ve Live Timeline kulvar sağ tık menülerinde **Add to Wiki Candidates…** seçeneği bulunur.
   - Seçili tüm oturumları tek seferde havuzdaki konularla etiketler ve bekleyen derleme sayısını bildirir.

### Derleme Motoru: Sentez ve Headless Koşu (3.204.0 — M-23)

Eklenti doğrudan wiki sayfası sentezlemez; çünkü bir eklentinin mekanik özeti, bu sistemin kaçınmak istediği yüzeyselliği üretir. Bunun yerine eklenti ile ajan arasında net bir sözleşme kurulmuştur:

1. **Brifing Üretimi (`wiki.compile`):** Seçilen adayları toplar, diskteki transkriptleri ve tam tur aralıklarını çözer, kasanın kendi anayasasını (`-WIKI-ANAYASA-.md`) okur, mevcut wiki dizinini tarar ve ajana ne yapması gerektiğini anlatan eksiksiz bir brifing hazırlar.
2. **Headless Derleme Koşusu (`wiki.compile.run`):** Komut paletinden **Agent Farm: Compile Wiki Candidates…** seçildiğinde bekleyen adaylar listelenir. Enter'a basıldığında `agentFarm.wikiAgent` (varsayılan: `developer` veya atanmış ajan) altında headless bir derleme görevi başlar.
3. **Eşzamanlılık ve Hak İddiası (Claim):** Koşan bir derleme, işlediği adayları rezerve eder (`pool.compiling`). İkinci bir derleme bu adayları çift derleyemez. Süreç çökerse bırakılan bayat iddia (`stale claim`) otomatik temizlenir ve adaylar tekrar `pending` durumuna döner.
4. **Sentez Kuralları (Kasa Anayasası):**
   - **Sayfa başına tek kavram:** Bir konu birden fazla sayfaya bölünmez.
   - **Çelişen bilgi silinmez:** Eski bilginin üzeri çizilmez; tarihli bir not satırıyla güncellenir.
   - **Her olgu kaynağını taşır:** Bilginin hangi transkriptten ve hangi turdan geldiği dipnotlanır.
5. **Geri Bildirim:** Ajan derlemeyi bitirdiğinde köprüden `wiki.candidates.edit {state:"compiled", pages:[…]}` çağrısı yaparak adayları kapatır ve oluşturulan/güncellenen sayfaları bildirir.

### Wiki Kokpiti — Havuzu Okuyan Tek Yüzey (3.205.0 — U-70) {#wiki-kokpiti}

Havuza **yazan** dört kapı vardı (🔖 rozeti, oturum sağ tıkı, köprü, komut paleti) ama havuzu **okuyan** hiçbir yüzey yoktu: neyin beklediği, neyle ilgili olduğu ve derlemenin sonucu nereye yazdığı görünmüyordu. Wiki paneli (her sayfanın araç çubuğundaki **📚 Wiki**, ya da `Agent Farm: Open Wiki`) bu üç soruyu tek bakışta cevaplar.

- **Kasa şeridi (üstte):** Wiki kökü, `-WIKI-ANAYASA-.md`, `index.md` ve `log.md` — her biri tıklanabilir, eksik olan **⚠** ile işaretli. Kök veya anayasa yoksa **iki derleme düğmesi de ölüdür ve sebebini basılmadan önce söyler**; derlemenin zaten reddedileceği bir düğmenin canlı görünmesi bu özelliğin kaçınmak için var olduğu yalandır.
- **Süzgeç çubuğu:** Konu çoklu-seçimi (yanında o konuda kaç işaretin beklediği), durum düğmeleri (Hepsi / ⏳ Bekleyenler / ✅ Derlenenler / 🚫 Düşenler) ve filonun ortak sorgu dilini konuşan canlı arama kutusu (`foo bar` = ikisi de, `-foo` = hariç, `"tam ifade"`). Arama bir işaretin konularına, açılış promptuna, notuna, oturumuna ve derlemenin yazdığı sayfalara birden bakar.
- **DENSE tablo:** Her işaret **tek satır**; büyüyebilecek her şey AFTip'e taşınmıştır. Durum · kaynak (oturum + tur aralığı) · konu çipleri (üçten fazlası `+N`) · söylenen · işaretlenme zamanı · yazılan sayfalar. Kaynak hücresi konuşmayı açar; satır üstündeki AFTip oturumu, ajanı, motoru, tur aralığını, notu ve kim/ne zaman işaretledi bilgisini **sıfır tıkla** verir.
- **İki derleme düğmesi:** **📚 Compile Selected** işaretlenen satırları, **⚡ Compile All Pending** bekleyen her şeyi tek koşuya verir. İkisi de `wiki.compile.run`'dur: **hiçbir şeyi derlenmiş işaretlemezler** — koşu `wiki.candidates.edit` ile geri bildirene kadar satır `pending` kalır.
- **Koşu çıkmış bir işaret seçilemez:** `compiling` havuzda bir durum değildir (durum sözlüğü yayımlanmış bir sözleşmedir, B-14); canlı bir koşusu olan **bekleyen** satırdır. O satırın kutucuğu hiç çizilmez ve "bekleyen" sayısına girmez — aynı kavramı iki kere dosyalamanın önündeki tek engel budur.
- **Satır içi düzenleme:** ✎ konuları virgüllü bir kutuda açar (Enter kaydeder, Escape vazgeçer; boş bırakılan liste hiç gönderilmez, çünkü konusuz işaret havuzun dosyalama anahtarını kaybetmek demektir). 🚫 işareti kuyruktan çıkarır, ↺ geri koyar, ✕ siler — **hiçbiri kasada yazılmış bir sayfaya dokunmaz.**
- **Provenance kırıntısı:** Derlenmiş satırlar `Kategori / Kavram` biçiminde tıklanabilir sayfa linkleri taşır; tıklayınca dosya senin `docOpen` tercihinle (Obsidian / VS Code / özel uygulama) açılır.
- **🩺 Lint:** `wiki.lint`'i sayfanın içine rapor eder (yetim sayfalar, kırık `[[link]]`, indekssiz sayfa, fazla derin klasör). **Rapor eder, asla onarmaz.**

### Köprü ve Sağlık Denetimleri

- **`wiki.candidates.add` / `wiki.candidates.list` / `wiki.candidates.edit` / `wiki.candidates.remove`:** Aday havuzu CRUD işlemleri.
- **`wiki.status`:** Havuz durumu (bekleyen, derlenen, derlenenler) ve kasa wiki istatistikleri (kök klasör, anayasa dosyası, indeks, kategori derinlikleri).
- **`wiki.lint`:** Kasa wiki'sinin yapısal sağlığını denetler (yetim sayfalar, kırık `[[link]]` bağlantıları, indekssiz sayfalar).
- **Ayarlar:** `agentFarm.wikiRoot` (Obsidian wiki klasör yolu, örn. `00_AGENT_AREA/00_WIKI`), `agentFarm.wikiAgent` (derlemeyi yürütecek ajan).


### Wiki Faz 2 — Derleme Onay Şeridi, Gelişmiş Arama ve Ayarlar (3.285.0 — X-56, U-90..U-95, X-57..X-58) {#wiki-faz2}

*(3.281.0 - 3.285.0)* Wiki aday havuzu ve kokpiti Faz 2 geliştirmeleriyle tam bir profesyonel bilgi derleme merkezine dönüştürülmüştür:

- **Derleme Onay Şeridi (3.285.0 — U-95):** 📚 Derleme butonuna basıldığında doğrudan arka planda token harcamak yerine, üstte bir onay şeridi açılır: hangi ajanın (`agentFarm.wikiAgent`), hangi motorla, hangi modelle ve hangi eforla çalışacağını açıkça belirtir. **⚙ Change…** butonu Ayarlar sayfasına yönlendirir.
- **Toplu İşlemler ve Canlı Durum (U-95):** Seçili satırlar için **⚡ Compile these N**, **🚫 Drop** ve **✕ Remove** toplu aksiyonları sunulur. Derleme çalışırken `compiling` rozeti nefes alan canlı bir animasyona kavuşur; biten derleme tek bir sessiz bildirimle kasadaki yeni sayfaları duyurur.
- **Gelişmiş Arama ve Satır İçi Düzenleyici (3.284.0 — U-92):** 12'den fazla kategori olduğunda otomatik çıkan Türkçe duyarlı arama kutusu (`TARIM` $\rightarrow$ `Tarım`). ✎ butonu satır altında adanmış bir kategori/not ve hariç tutulan tur (`excluded turns`) düzenleyicisi açar.
- **Kasa Ayarları ve Sağlık Paneli (3.283.0 — X-57, X-58):** Farm Settings altında `agentFarm.wikiRoot` adanmış bölümü: 3 zorunlu dosyanın sağlığı (`_KURALLAR_/-WIKI-ANAYASA-.md`, `index.md`, `log.md`), kategori derinlikleri ve **🛠 Start the wiki here** şablon başlatıcısı. Çöken veya kaza yapan bir derleme oturumunun turları kilitlemesi engellenmiştir.
- **Tur İçi Arama ve Yerinde Kategori Başlatma (3.282.0 — U-90, U-91):** Konuşma içindeki 🔖 Wiki rozeti, doğrudan Obsidian klasör yapısını tarayan açılır menü sunar; Obsidian'a gitmeden yerinde `+ Start category` ile yeni konu başlatılabilir.
- **Tur Aralığı Seçim Şeridi (3.281.0 — U-93, U-94):** Hangi turların derlemeye gireceği görsel turn-strip üzerinden seçilir; `Whole session` butonu tüm konuşmayı tek tıkla işaretler.


## Filo Raporu

`Agent Farm: Export Fleet Report (Markdown)` — filonun karşılaştırmalı karnesini Markdown dosyası olarak üretir (7/30/90 gün). Obsidian vault'una kaydetmek için biçilmiş kaftandır.

İçerik: filo toplamları, ajan karşılaştırma tablosu (oturum, maliyet, token, araç, hata oranı, **cache verimliliği**, bağlam yükü, hafıza sayısı), model kullanım tablosu, en pahalı oturumlar, sağlık bulguları.

**Cache verimliliği** = prompt token'larının cache'ten okunan payı. Yüksekse (%90+) aynı bağlam tekrar tekrar ucuza okunuyor demektir; düşükse oturumların kısa ve bağlamın sürekli yeniden yazılıyor olabilir — birleştirilebilecek kısa oturumları düşün.

Aynı karşılaştırma tablosu Dashboard'da da **Agent comparison** bölümünde canlı görünür; satıra tıklayınca ajan detayına gider.

### Otomatik Rapor (Vault'a)

Raporu elle almak yerine otomatiğe bağlayabilirsin — Obsidian vault'una düzenli karne düşer:

1. `agentFarm.autoReportFolder` ayarına hedef klasörü yaz (örn. vault içindeki bir klasör).
2. `agentFarm.autoReport` ayarını `daily` veya `weekly` yap.
3. Eklenti saatte bir kontrol eder; o gün/haftanın raporu yoksa üretir (`AgentFarm-Report-2026-07-08.md` veya `AgentFarm-Report-2026-W28.md`) ve bildirim düşer. Kapsanan dönem `agentFarm.autoReportDays` ile ayarlanır (varsayılan 7 gün).

VS Code açıkken çalışır; gün içinde ilk açılışta o günün raporu üretilir.

0.7.0'dan itibaren dönem içinde arşivlenmiş headless görev çıktısı varsa, **Task outputs** bölümü otomatik rapora eklenir — karne ve iş çıktıları tek belgede. İstemezsen `agentFarm.autoReportIncludeOutputs: false`.

### Görev Çıktı Özeti

`Agent Farm: Export Task Outputs Digest (Markdown)` — arşivlenmiş headless görev çıktılarını tek belgede toplar (bugün / 7 gün / 30 gün). Her görev için ajan, süre, durum ve çıktının kendisi (uzunsa kırpılır); başarısız görevler ⛔ ile işaretlenir. Zamanlanmış işlerin ve workflow'ların gün sonunda "ne üretmiş bunlar?" sorusunun tek bakışta cevabı. Varsayılan kayıt yeri `autoReportFolder` (ayarlıysa) — yani vault'una düşer.

## Sağlık ve Optimizasyon

Agent Farm ajanlarını sekiz kuralla denetler. Amaç: **daha ucuz, daha tutarlı, daha az unutan ajanlar.**

### Insight Tarihçesi — tekrar ediyor mu, düzeltmen tuttu mu? (3.27.0) {#insight-tarihcesi}

Insights bir **anlık görüntüydü**: bulgu çıkardı, düzeltir ya da ertelerdin, çiftlik unuturdu. Böylece bir bulguya değer verip vermeyeceğini belirleyen iki soru cevapsızdı — **ne zamandır burada / kaç kere geri geldi** ve **geçen sefer yaptığım şey işe yaradı mı**.

Artık insight listesini kuran aynı tazelemede bir **defter** işliyor. Üç anı kaydeder (ilk görülme · son görülme · son eylemin) ve hepsinden önemli bir sonucu türetir: **regressed** — sen müdahale ettikten sonra kayboldu, sonra geri geldi. "Düzeltme işe yaradı" ile "düzeltme işe yaramış gibi göründü" arasındaki fark budur.

- **Her satır kendi kaydını taşır:** dört ayrı kez geri gelmişse **↻4**, düzeltmen tutmamışsa **⚠back**, tooltip'te de cümlesiyle (`3× (came back) · first seen 12d ago · your fix did not hold — back after 2d`).
- **Insight History…** (Insights panelinin başlığındaki düğme) defteri en çok tekrar edenden başlayarak listeler; başlığında da asıl sayılar: kaç tanesi açık, kaçı tekrar ediyor, **kaçı sen müdahale ettikten sonra geri geldi**, kaç düzeltme tutuyor.
- **Tazeleme bir tekrar değildir:** listede durmaya devam eden bulgu *aynı* görülmedir, yani "4 kez görüldü" dört ayrı ziyaret demektir, dört pano yenilemesi değil. Müdahale edilmemiş bir bulgunun gelip gitmesi de asla "kırılmış düzeltme" sayılmaz.
- **Köprü:** `insights.history` (`limit?`, `recurringOnly?`) — "ne sürekli bozuluyor?" sorusu artık kayıttan cevaplanıyor.

### Insight Yaşam Döngüsü (2.41.0)

Insights artık salt-okunur bir liste değil — her bulgunun bir **kapanış yolu** var. Satırın üzerine gelince (veya sağ tık) üç eylem çıkar:

- **🛠 Fix** — mekanik düzeltmesi zaten var olan kategorilerde tek tık ilgili akışı başlatır: `memory-index` → indeks onarımı, `duplicate-memory` → birleştirme taslağı, `stale-memory`/`large-memory` → distilasyon, `antigravity` → senkron, `secrets` → anahtarı kasaya taşı, `pulse` → nabzı yeniden koş. Yalnız düzeltilebilir kategorilerde görünür.
- **🚀 Delegate to Agent** — bulguyu (ya da görünüm başlığındaki düğmeyle **birden çok bulguyu**) seçilen ajana headless görev olarak havale eder. İş emri otomatik yazılır: bulgular numaralı listelenir, "önce oku, kök nedeni anla, güvenle düzeltebildiğini düzelt, emin olmadığını YAPMA — raporla" kuralları eklidir. Çoklu havalede her bulgu **kendi ajanına** gider (ajanı olmayan filo-geneli bulgular için bir kez ajan seçersin); ajan başına tek görev açılır. Görev bitince çıktı arşivinde ne düzeltildiğinin raporu durur.
- **✕ Dismiss** — "olmuş bir olay" niteliğindeki bulgular (maliyet anomalisi gibi) sonsuza dek listede kalmasın: 1 gün / 7 gün / kalıcı gizle. Gizlenenler dürüstçe sayılır — listenin altında "n dismissed insight(s) hidden" satırı belirir; tıklayınca geri alma seçicisi açılır (görünüm menüsünde **Restore Dismissed Insights…**). Kimlik mesaj metnine değil ajan+kategori+dosyaya bağlıdır: "4.2×" yarın "3.9×" olsa da aynı bulgu gizli kalır.

**Tık davranışı da akıllandı:** `cost-anomaly` / `trend` / `budget` / `error-rate` bulgularına tıklamak artık kılavuz paragrafı değil, **ajanın kendi maliyet görünümünü** (Ajan Detayı) açar — kanıt oradadır.

**Otomatik havale (opsiyonel, varsayılan kapalı):** `agentFarm.insightAutoDelegate` ayarına kategori adları yaz (örn. `["memory-index", "duties"]`) — o kategorilerin warning/error bulguları belirir belirmez kendi ajanına headless görev olarak düşer. Aynı soruna 24 saatte en fazla bir görev açılır (bekleyen uyarı saat başı görev doğurmaz); görevleri yalnız görev-yürütücü pencere kuyruğa alır ve her otomatik havale bildirimle haber verilir. Ajan zamanı/parası harcadığı için bilinçli açılır.

### Sağlık: Bağlam Yükü

`CLAUDE.md` + `memory/MEMORY.md` + `.agents/AGENTS.md` her oturum başında otomatik olarak bağlama yüklenir — buna **sabit bağlam yükü** diyoruz ve her oturumda yeniden ödenir. `agentFarm.contextBudgetTokens` bütçesini (varsayılan 8.000 token) aşan ajanlar uyarı alır.

**Nasıl düzeltilir:** CLAUDE.md'yi kısalt; ayrıntıyı hafıza dosyalarına taşı (onlar sadece gerekince okunur); MEMORY.md indeksini tek satırlık özetlerle sınırla.

### Sağlık: Hafıza İndeksi

`MEMORY.md` indeksi ile diskteki dosyalar karşılaştırılır:

- İndekste geçen ama diskte olmayan dosya → **uyarı** (kırık bağlantı).
- Diskte olan ama indekste geçmeyen dosya → **bilgi** (yetim dosya — ajan onu asla hatırlamayabilir).
- Hafıza dosyaları var ama hiç MEMORY.md yok → **uyarı**.

### Sağlık: Kopya Hafıza

Aynı isimli hafıza dosyası birden çok ajanda varsa:

- İçerikler birebir aynıysa → **bilgi**: tek kaynağa bağlamayı düşün.
- İçerikler farklılaşmışsa → **uyarı**: kopyalar birbirinden saptı, ajanların birbiriyle çelişebilir. En günceli seçip diğerlerini eşitle.

### Sağlık: Bayat Hafıza

`agentFarm.staleMemoryDays` gününden (varsayılan 45) uzun süredir dokunulmamış hafıza dosyaları işaretlenir. Gözden geçir: hâlâ doğruysa dokun ve bırak, değilse güncelle veya arşivle.

### Sağlık: Büyük Dosya

20 KB'ı aşan hafıza dosyaları uyarı alır. Büyük dosya = ajan her okuduğunda büyük token maliyeti. Konuya göre parçala.

### Sağlık: Kimlik

`CLAUDE.md` olmayan ajan klasörü **hata** alır — kimliksiz ajan her oturumda kişiliksiz başlar.

### Sağlık: Hata Oranı

Son 7 günde araç çağrılarının %10'undan fazlası hata verdiyse uyarı üretilir. Yüksek hata oranı genelde şunlardan olur: bozuk araç scripti, eksik izin, yanlış yol varsayan hafıza kaydı.

## Zeki Gözetim

Maliyeti zaten görüyorsun; bu bölüm **kaliteyi** de aynı karneye koyar. Dört araç: kalite karnesi, talimat önerileri, haftalık akıllı özet ve transcript arama. İçeride model çağrısı gerektiren üçü daima ucuz modelle (`agentFarm.judgeArgs`) çalışır ve otomatik döngüleri varsayılan olarak **kapalıdır** — sen açana kadar hiçbir API harcaması yapılmaz; elle komutlar her zaman kullanılabilir.

### Kalite Karnesi

Ucuz model hakem, ajanların son oturumlarından örnekler alır: oturumun ilk isteğine karşı ajanın son cevabını okur ve 1-5 puanlar.

- **Elle:** `Agent Farm: Sample Output Quality Now` — ajan başına `qualitySamplesPerAgent` (varsayılan 2) puanlanmamış yeni oturumu skorlar.
- **Otomatik:** `agentFarm.qualitySample` = `daily` veya `weekly` (varsayılan `off`).
- **Nerede görünür:** Dashboard karşılaştırma tablosunda **Quality** kolonu (son 14 gün ortalaması), filo raporunda Quality kolonu.
- **Uyarılar:** bu haftanın ortalaması geçen haftadan belirgin düşerse (≥0,8 puan) veya son iki haftanın ortalaması 3'ün altındaysa Insights'ta `quality` uyarısı çıkar.

Puanlar `quality.json`'da (globalStorage) yaşar; aynı oturum iki kez puanlanmaz. Maliyet düşük ama kalite de düşükse otomasyon zarar — iki eğriyi yan yana izle.

### Talimat Önerileri

Ajanın kendini iyileştirme döngüsü: ucuz model, son 14 günün oturumlarındaki **takip mesajlarını** (ilk istek hariç — düzeltmeler oradadır) tarar ve tekrarlayan düzeltme kalıplarından CLAUDE.md kuralı önerir ("başlıkları Türkçe yaz" gibi).

- **Elle:** `Agent Farm: Scan for Instruction Suggestions…` — ajan seçersin; yeterli takip mesajı yoksa (en az 4) tarama yapmaz.
- **Otomatik:** `agentFarm.suggestScan` = `weekly` (varsayılan `off`).
- **Nerede görünür:** Insights'ta 💡 satırı olarak. Tıklayınca inceleme açılır: **Apply to CLAUDE.md** kuralı ajanın CLAUDE.md'sine `## Learned rules (Agent Farm)` bölümü altına ekler; **Dismiss** öneriyi kapatır. Hiçbir kural onaysız yazılmaz.
- Tüm açık önerileri gözden geçirmek için: `Agent Farm: Review Instruction Suggestions…` (Insights başlığındaki 💡).

### Haftalık Akıllı Özet

Sinyal yorgunluğuna karşı: on ayrı uyarı yerine haftada bir, üç cümlelik insan dili özet — maliyet gidişatı, dikkat gerektiren sorunlar (bütçe/hata/nöbet/kalite) ve tek öneri.

- **Elle:** `Agent Farm: Generate Weekly Summary Now`.
- **Otomatik:** `agentFarm.weeklySummary` = `true` (varsayılan `false`) — her ISO haftasının ilk VS Code açılışında bir kez çalışır.
- Özet bildirim olarak gösterilir, `autoReportFolder` ayarlıysa `AgentFarm-Weekly-Summary-<hafta>.md` olarak vault'a da yazılır ve `notifyWebhookUrl` üzerinden (`summary` olayı) cebe iletilebilir.

### Transcript Arama

"Bunu bir ajanla konuşmuştum ama hangisiyle?" — filo büyüyünce hafıza panelin işidir.

- **Aç:** `Agent Farm: Search Transcripts…`, Recent Sessions başlığındaki 🔍, ya da Dashboard / Ajan Detay / Oturum Görüntüleyicideki **⌕ Search** düğmeleri (2.53.0) — son ikisi paneli o ajana / o oturuma **ön-kapsamlı** açar; kapsam rozetindeki ✕ tekrar tüm filoya genişletir.
- **‼️ Bütün motorlar (3.114.0).** Tarama yalnız Claude transkriptlerini okuyordu; dört CLI ile çalışan bir filo tek motorda aranabiliyordu ve hiçbir yüzey bunu söylemiyordu. Codex, Gemini ve Antigravity transkriptleri artık Oturum Görüntüleyicinin okuduğu **aynı ayrıştırıcıyla** okunuyor ve her sonuç satırı kendi **motor rozetini** taşıyor.
- **Tek kompakt kontrol paneli, sonra cevap (3.118.0).** Panel üç bant halinde okunur: sorgu **nasıl** okunacak (Mode · Text · Regex · Meaning, Aa Case, ▣ Whole word, Syntax), **nerede** aranacak (açılış kapsamı, Agents, Find session ID…, ⚙ Filters) ve **neye** bakılacak (Quick scope ve içerik rozetleri). Sorgu kutusu artık **sabit yükseklikte tek satırdır** — sorgu paragraf değildir ve eski büyüyebilen textarea altındaki kontrollerin üstüne sürüklenebiliyordu. `Enter` çalıştırır; Text ve Regex ayrıca yazmayı bıraktıktan yarım saniye sonra kendiliğinden çalışır. İçerik rozetleri kısa kanonik adları taşır: 🧑 **You** · 🤖 **Agent** · 📤 **Delegator** · 📥 **Handler** · 🔧 **Tools** · 📄 **Results**; yanlarında ikinci bir küme olarak 📝 **Memory** ve ⌁ **Events** durur; ayrıntı geniş AFTip'tedir. **Conversation · Delegation · Tool trail · Everything** bir üst satırda, mor çerçeveli `Quick scope` rozetindedir. Sonuçlar hemen altında başlar.
  - **‼️ İmleç kutudan çıkmaz.** Sayfa her değişiklikte bütün kartı yeniden çiziyor; bu yüzden sen yazarken çalışan arama, cevabı geldiği anda imleci sorgu kutusundan atıyordu — bir sonraki harf hiçbir yere gitmiyor, tekrar kutuya tıklamak gerekiyordu. Artık odaklı kontrol ve imlecin yeri her yeniden çizimi atlatıyor; klavyeyle basılan bir rozet de klavyenin altına geri geliyor.
  - **‼️ Bir kontrol belirince hiçbir şey kaymaz.** İçerik bloğu sabit iki satırdır, altı tür ile iki ek kaynak tek tek değil grup olarak alt satıra iner, `⚙ Filters` çipi kendi sayacına yer ayırır ve iki ✕ temizleyicisi düğme çizilse de çizilmese de genişliğini koruyan yuvalarda oturur. Ölçüldü: hiçbir şey seçili değilken ve iki süzgeç seçiliyken geometri birebir aynı.
  - **Sorgu kutusunun tooltip'i yoktur.** Zaten bir tık altında `Syntax ▾` kartı dururken, kullandığın kontrolün üstünden her geçişte açılan paragraf gürültüdür. Tooltip'in taşıdığı her şey — kutunun neyi aradığı, her kipin dilbilgisine ne yaptığı, regex'in on saniyelik bütçesi, Meaning'in neyi kapsamadığı ve Whole word açıkken ne yaptığı — o karta taşındı.
  - **‼️ İşi veren ajan kullanıcı değildir.** Sub-agent şeridinde promptları işi **devreden ajan** yazar; bunlar `user` etiketiyle geliyordu, dolayısıyla "sadece benim sorduklarımda ara" dediğinde bir ajanın başka bir ajana yazdığı paragraflar geliyordu. Artık **Delegator** (adıyla: `delegator (manager)`), cevap veren taraf da **Handler**. Bu yüzden Dialog = sen + ajan; delegasyon şeridi tek tık uzakta ve sonuç satırı hangi türlerde arandığını, kaçının aranmadığını her seferinde yazıyor.
  - **Chip'ler rozettir: tık bir türü ekler ya da çıkarır**, yani iki türü aynı anda aramak tek harekettir; Ctrl/⌘-tık *yalnız onu* demektir. Kapsam asla boşalmaz — son chip'i söndürünce Dialog'a döner.
  - ~95 MB'lık filoda tam everything-taraması ~1.5 sn altında ölçüldü. İki ek kaynak kendi chip'iyle eşlik eder: ajanların 📝 **hafıza notları** (`memory/*.md`, isabet dosyayı açar) ve ⌁ **öksüz canlı olaylar** — transkripti artık var olmayan olaylar (harici CLI'lar, budanmış oturumlar); transkripti duran olaylar bilerek dışarıda, onları transkript taraması zaten kapsıyor.
- **Oturum süzgeçleri var ama sayfayı sürekli kaplamaz.** Agent kompakt kontrol satırında kalır. Engine, Project, Model, Session id/title/path, Started by, Lane, Pinned, Has errors, mesaj tarihi ve sonuç sırası birlikte **⚙ Filters (n)** altında açılır ve yeniden tek rozete kapanır. Session kutusu açılan satırın geniş esnek alanıdır. **‼️ Her temizleyici yalnız içinde durduğu bloktan sorumludur (3.118.0):** **Filters çipinin yanındaki ✕** bütün oturum eksenlerini *hepsi*ne döndürür — ajanlar, açılış kapsamı ve panelin içindekiler — **rozet satırının sonundaki ✕** ise içerik kapsamını Conversation'a, iki ek kaynak açık olacak şekilde döndürür. İkisi birbirine dokunmaz, hiçbiri sorguya dokunmaz. (Önceden tek bir Reset, dokunmadığı süzgeçler için yanıyor ve geri getirdiği rozetlerin satırın öteki ucunda duruyordu; Clear filters de reset'in olması gereken yerdeydi.) Süzgeç panelini ya da sözdizimi kartını açmak ve sıralamayı değiştirmek artık ekrandaki cevabı bayat işaretlemez — sıralama sayfanın elindeki isabetler üzerinde yapılır — buna karşılık **Aa Case** ve **▣ Whole word** "Search'e tekrar bas" demek yerine aramayı kendisi tekrarlar. Motor seçicisi geçici oturum havuzundan motor eksiltmez; ürünün tek kayıt defterindeki **Claude · Codex · Gemini · Antigravity** dördünü daima gösterir. Bunlar sonuçları sonradan elemez, **taranacak kümeyi** daraltır. Proje üyeliği ajan adına bakılarak tahmin edilmez; her oturum için açık üyelik → kod kökü → ajan varsayılanı sırasıyla çözülür.
- **Ajan seçici (onay kutulu menü, 2.60.0):** `Agents: all ▾` düğmesi tüm ajanların işaretlenebilir listesini açar — **herhangi bir kombinasyon** seçilir: bir, iki, biri hariç hepsi… Toplu işlemler için **Select all / Clear** bağlantıları. Varsayılan hepsi işaretli (yeni ajan kendiliğinden dahil olur), bu yüzden ayrı bir "tüm ajanlar" moduna gerek yok; işaret kaldırmak taramayı daraltır (hafıza notları ve canlı olaylar da aynı seçime uyar). Düğme `Agent: dev`, `Agents: 2/7` ya da `Agents: none` diye okunur — hiçbir şey işaretli değilse arama dürüstçe boş döner. Panel Ajan Detay sayfasından açılınca yalnız o ajan işaretli gelir; seçim değişince bayatlayan ajan rozeti kendiliğinden kalkar.
- Text, Regex ve Meaning ayrı kip düğmeleridir. Text kipinde **Match case** ve **Whole words** vardır; **Query guide** dilin tamamını sembol, anlam ve örnek olarak açar. Seçili her kip/içerik kontrolü işaretçi ayrılınca da dolgu, çerçeve, onay işareti ve erişilebilirlik durumu taşır.
- **‼️ "ID'sini biliyorum" (X-34, 3.117.0).** Bir oturum ID'sini — ya da eklentinin her track rozetinde ve log satırında yazdığı sekiz karakterlik öneki — sorgu kutusuna yapıştırıp üst satırdaki **`Find session ID…`** düğmesine bas: metin sonuçlarını süzmek yerine bütün indeks üzerinde doğrudan oturum bulucuyu açar; tam kimlik ve önek her motorda çalışır. Aynı kimliği normal Search ile aramak, onun geçtiği metinleri ve sonuçların üstündeki oturum bağlantısını bulur. Session ayrıntı kutusu ise yalnız taranacak oturum kümesini daraltır. Aynı bulucu başka her yerden **`Agent Farm: Find Session by ID…`** komutu ve Sessions görünümü başlığındaki 🔑 ile açılır; oturum tablolarının metin süzgeci de ID'yi arar.

**‼️ Sorgu dili (3.84.0) — tek dilbilgisi, arama yapılan her kutu.** Eklentideki her filtre kutusu tek bir soru soruyordu: "bu alt dizi geçiyor mu?" Liste bir ekranı aştığı anda bu yanlış sorudur — yan yana olmayan iki kelimeyi birlikte arayamıyor, "şu ya da bu" diyemiyor, uzun bir kelimenin parçası değil **tam kelime** isteyemiyor, bir şeyi dışarıda bırakamıyordun. Aşağıdaki dilbilgisi bunun cevabıdır ve **her yerde aynı dilbilgisidir** — Search sayfası, backlog, oturumlar, turlar, görevler, notices, kuyruk, secrets, toolbox, ayarlar, Console'un devam listesi ve kalıp prompt seçicisi. Eklenti host'u ile sayfalar birebir aynı dosyayı çalıştırır (`media/afQuery.js`, `src/core/query.ts` onu yükler), dolayısıyla ikisi asla farklı cevap veremez.

| Yazdığın | Anlamı |
|---|---|
| `foo bar` | **ikisi de**, sırası önemsiz — boşluk VE demektir |
| `foo OR bar` | ikisinden biri (`|` da olur). `AND` açıkça yazılabilir. |
| `-foo` / `NOT foo` | onu **içermeyen** satırlar |
| `(a OR b) c` | parantez gruplar; VE, VEYA'dan sıkı bağlar |
| `"tool call"` | o **öbek**, sırasıyla — ve **tam kelime**: `"log"`, `dialogue` içinde bulunmaz |
| `refact*` | `*` boşluksuz herhangi bir karakter dizisi yerine geçer |
| `"refact* the pars*"` | ikisi birlikte: hem *"refactor the parser"* hem *"refactored the parsing"* (aynısı Türkçe için de: `"kelime* bazıları ol*"` → *"kelimelerin bazıları olsun"* ve *"kelimenin bazıları oldu"*) |

- **Tırnaksız tek kelime hâlâ düz, harf duyarsız bir alt dizidir** — bilerek: bu dil gelmeden önce yazdığın hiçbir şey artık başka anlama gelmiyor. Tırnak, *daha az* değil **daha çok** kesinlik istemenin yoludur.
- **`whole word` (tam kelime) tırnaksız kesinliktir** (3.114.0): Search sayfasında işaretlersen tırnaksız kelime de tam kelime aramak zorunda kalır — `log` artık `dialogue` içinde bulunmaz. `*` yazdığın ucu bu kipte de açık bırakır, yani `refact*` yine `refactoring` bulur. `regex` kipinde bir şey yapmaz; orada desen kendi sınırını zaten söylüyor. Kip açıkken kutu bunu hover'ında yazar.
- `OR`, `AND`, `NOT` **yalnız büyük harfle** işler; "or" insanların gerçekten aradığı sıradan bir kelimedir. Kelime içindeki tire (`agent-farm`) tiredir; yalnız terimin başındakisi operatördür.
- Tam kelime sınırı Unicode farkındadır, yani Türkçe harflerde de çalışır — `\b` çalışmazdı.
- **Yarım yazılmış sorgu hata değildir.** Bu kutular yazarken süzer; kapanmamış `"` ya da `(` listeyi elinin altında boşaltmak yerine olduğu gibi, bir önek olarak ele alınır. Gerçekten bozuk bir sorgu (öksüz bir `)`) durumu kelimelerle söyler.
- Search sayfasındaki `regex` kutusu hâlâ metni doğrudan `RegExp`'e verir — o modda yukarıdaki dilbilgisi geçerli değildir.
- Her kutu dilbilgisini geniş, kaydırılabilir `AFTip` içinde taşır; ilk satır **o kutunun** neyi aradığını söyler. Açıklama metni yerli `title` tooltip'ine bırakılmaz.
- **Text ve Regex canlıdır.** En az üç karakter yazıp 500 ms durunca arama kendiliğinden yenilenir; `Ctrl/⌘+Enter` beklemeden çalıştırır. Meaning her sorgu ücretli olabileceği için yazarken veya filtre değişiminde asla kendiliğinden yenilenmez; ana **Search** düğmesi onu bilinçli olarak çalıştırır.
- **Sonuçlar oturum başına gruplu, tur alt-başlıklı** (2.53.0): her oturum tek blok (başlığa tık → oturumu aç), içindeki isabetler `Turn 3 — <açılış komutu>` etiketli; araç isabetleri araç adını taşır. İsabete tıklayınca oturum görüntüleyici açılır ve **tam eşleşen mesaja kayar** (2.40.0) — kısa süreliğine çerçeveyle vurgulanır.
- Önizlemeler oturum başına 12, toplam 250 ile sınırlıdır (tek oturumda çok daha yüksek); fakat motor eşleşmeleri saymayı sürdürür. Sayfa **bulunan · gösterilen · eşleşen oturum · taranan oturum** rakamlarını ayrı verir ve oturum başlığı `12 of 47 shown` diyebilir. Önizleme sınırı bütün cevapmış gibi sunulamaz. Azgın regex 10 saniyede kesilir; okunamayan transcript'ler ayrıca sayılır.
- **‼️ Artık hızlı, ve cevabın hiçbir yeri değişmedi (X-42, 3.141.0).** Sayfa her sorguda bütün transcript havuzunu — 405 oturum, 664 MB — eklenti host'unun ana iş parçacığında baştan okuyordu: hiç eşleşmeyen bir filo araması **6,5 saniye sürüyordu ve ikincisi 7 saniye**, çünkü 80 dosyalık önbellek newest→oldest her geçişte kendi başını atıyordu. Daha kötüsü, arama varsayılan You+Agent olsa bile ayrıştırıcı bütün rolleri üretiyordu: aranabilir 79,9 milyon karakterin diyalog kısmı 2,76 milyon; yani varsayılan arama, bakmaması söylenen 77 milyon karakterlik araç trafiğinin bedelini ödüyordu. Bugün aynı sorgu: **58 ms** ve **sıfır** transcript okuması.
  - Normalize metni **kalıcı, rol-parçalı bir korpus** tutuyor (globalStorage altında; oturum başına, rol başına bir shard; anahtar `mtime + size + motor + lane`). Dialog yalnız diyaloğu okur, araç izine hiç dokunmaz; yalnız imzası değişen oturum yeniden kurulur, silinen prune edilir, bozuk manifest ya da kayıp shard hata değil yeniden kurulumdur. Bu **bir cache'tir, transcript'lerin değil** — kaybı yalnız bir yeniden kuruluma mal olur.
  - **Açılışta hiçbir şey kurulmaz.** İlk sorgu kurar: newest-first, dosya aralarında nefes alarak, sayfada `Preparing search corpus n/total…` yazarken. Tek seferlik, 664 MB için 12,7 saniye; diskte 77,5 MB.
  - **Aday daraltma dilbilgisinin kendisinden çıkar**, yazdığının ikinci bir yorumundan değil: ayrıştırma ağacı, bir eşleşmenin vazgeçemeyeceği literalleri verir ve bir dosya ancak false-negative imkânsızsa atlanabilir. NOT hiç daraltmaz, raw regex hiç daraltmaz, hayatta kalan her kaydı yine aynı eşleştirici yargılar — yani AND/OR/NOT, parantez, phrase, wildcard, Türkçe Unicode, case ve whole-word aynen eskisi gibi davranır. **ripgrep yalnız kendi açılış maliyetini hak ettiği yerde çalışır** (~80 milyon karakterlik araç izi; altında Node bütün korpusu bir süreç başlatmaktan hızlı okur) ve **yalnız exit 1 dürüst sıfır sayılır** — ikili yoksa, çöktüyse ya da zaman aşımına uğradıysa boş sayfayı hızlıca ve yanlış göstermek yerine tam okumaya döner.
  - **Yerini alan arama artık öncekini durduruyor.** Hızlı yazarken host'ta dört tam filo taraması sıraya giriyor ve hepsi tam maliyetle ödeniyordu; sayfa yalnız üçünü çizmemeyi seçiyordu.

**Meaning modu (anlamsal arama):** *"ajanla motivasyon düşüklüğünü konuştuğum yer"* gibi sorular için kavramsal olarak benzer parçaları arar. Bilerek yalnız indekste bulunan ana-oturum konuşma parçalarını kapsar; tool trafiği, memory, event, mesaj tarihi ve indekste olmayan motorları kapsamaz. Çalışma alanı bu seçimleri sessizce yok saymak yerine devre dışı bırakır ve sınırı yazar. Oturum metadata süzgeçleri çalışır; izin verilen oturum ID'leri vektör sıralamasına **ilk-N seçiminden önce** uygulanır.

- Kurulum: `agentFarm.embeddingsProvider` = `gemini` (Google API — `GEMINI_API_KEY` sırrını Set Secret ile ekle) veya `openai` (OpenAI-uyumlu herhangi bir uç — **tamamen yerel** istersen Ollama: `embeddingsBaseUrl` = `http://127.0.0.1:11434/v1`, model örn. `nomic-embed-text`, anahtar gerekmez).
- İndeks: **Build Semantic Index** komutu son `semanticMaxSessions` (300) oturumu parçalar halinde vektörler; dosya tabanlıdır, artımlı çalışır (yalnız yeni/değişen oturumlar) ve her semantik aramada 20 oturuma kadar kendini tazeler.
- Sonuçlarda benzerlik yüzdesi rozeti görünür; semantik modda yazarken otomatik arama yapılmaz (her sorgu bir embedding çağrısıdır), Enter'la ararsın.

## Notices ve İş Kuyruğu — ajan↔kullanıcı kanalı {#notices-kuyruk}

İki yönlü asenkron kanal; global gezinmede artık dörtlü bir şerit halinde sunulur: **🔔 Notices | 📥 Queue | 🤖 A2A Notes | ⚡ A2A Tasks** (ikili çiftler arasında görsel ayraç ile). Durum çubuğunda dikkat rozeti (Notices/Queue için renkli çan; A2A için sadece kendi sekmelerinde sessiz gri rozet).

**Notices (ajan → sen):** her ajan sana söyleyeceği **tek şey için tek satır** bırakır. İki eksen: `type` (update · report · result · reminder · suggestion · warning · question) ve `level` (1 rutin → 4 ultra). Uzun içerik iki bacaklı gider: panoda **özet**, arkasında `10_REPORT`'a yazılan **tam rapor** ("📄 Open full report"). `question` tipi asenkron soru-cevap taşır: ajan sorar, sen UI'dan cevaplarsın (→answered) ya da cevapsız kaparsın (→declined), ajan bir sonraki turunda cevabı uygular ve kaydı kapatır. **Yaşlanma** için bkz. [Yaşam Panosu](#yasam-panosu).

**İş Kuyruğu (sen → ajan):** kullanırken fark ettiğin düzeltmeleri sürtünmesiz düşürdüğün kanal (`Ctrl+Alt+A`); kayıtlar **halledilene kadar kaybolmaz**. Boru hattı: `captured → grouped → delegated → done` (+ `blocked` = sana soru, tek dikkat çeken durum; `dropped` = geçersiz). Terminal olmayan bir kayıt **silinemez** — hatalı giriş `dropped`'a taşınır, o da "halledildi" sayılır.

**Bildirimden Tam Kuyruk Kaydı Üretme:** Bir notice kuyruğa aktarıldığında ("Add to queue" düğmesi veya bir sorunun kullanıcı tarafından yanıtlanması) artık sadece başlık aktarılmaz; tüm bildirim gövdesi, bölümleri ve rapor bağlantısı eksiksiz aktarılır (`sourceNoticeAgent`, `type`, `body`, `sections`, `reportPath`, proje kimliği). Tek bir saf fonksiyon (`core/noticeToQueue.ts`) üzerinden inşa edilir. İş, soruyu soran ajanın kuyruğuna otomatik yönlendirilir (Agent Farm'ın kendi ürettiği sistem bildirimleri hedefsiz kalır). Kuyruk kartında `❓ Question: <başlık> · from <ajan>` rozeti belirir ve **▸ Original** tıklandığında orijinal bildirim gövdesi, alt bölümleri ve rapor açma düğmesi kart içinde açılır. Ajanlar `queue.list { sourceNoticeAgent: "<ben>" }` ile kendi sorularının yanıtlarını kuyruktan takip eder (`[session-start]` anında hem Notices hem Queue taranır).

Olgunluk motoru — `queue.maturity` (3.18.1). Gruplama/olgunluk kararı (grupla · bekle · delege et) düzyazıdan koda taşındı: eşikleri (`agentFarm.queue.groupSize`, `queue.maxAgeHours`) uygulayıp `{ actionable, reason, ripe[], ungrouped, starving[] }` döndürür. **`starving`, `queue.groups`'un gösteremediği şeydir:** hiç gruplanmamış bir kaydın `groupId`'si yoktur, yani yalnız grup özetine bakan bir süpürme, kullanıcının kendi cevabı tavanı aşmış hâlde çürürken "kuyruk boş" sonucuna varır — gerçekte olan buydu. **Her süpürme `queue.maturity` ile başlar.**

## A2A (Agent-to-Agent) Protokolü — Ajanlar Arası İletişim ve İş Devri {#a2a-protokolu}

Notices panosu ajan→insan, İş Kuyruğu insan→ajan kanalıdır. **A2A (Agent-to-Agent)** ise filodaki ajanların insanı gereksiz yere meşgul etmeden ve Notices gürültüsü yaratmadan **birbirlerine teknik not bırakmaları**, **iş devretmeleri** ve **oturumlar arası teknik hafıza taşımaları** için kurulan bağımsız protokoldür (`a2a.*` köprü operasyonları).

Veriler Agent Farm'ın `globalStorage` alanında (`a2a-notes.json` ve `a2a-tasks.json`) tutulur ve doğrudan dosyalara değil, köprü API'sine danışılır.

### İki Ayrı Nesne: Not (Note) vs Görev (Task)

A2A dünyasında iki farklı varlık vardır, birbirine karıştırılamaz:

1. **Not (`a2a.notes.*`) — PASİF:**
   - Bir teknik gerçek, keşif, kütüphane uyarısı, kilitlenen veritabanı tablosu, geçici API arızası veya tamamlanan bir görevin teknik sonuç raporudur.
   - Kimseye özel olarak atanmaz; koordinatları uyan her ajan okuyabilir.
   - Bir ajanın notu okuması onu yalnızca *o ajan için* okundu (`read`) yapar. `a2a.notes.resolve` ise notu herkes için kapatır.
   - İşe dönüştürme: Bir notun fiili bir iş gerektirdiği anlaşılırsa `a2a.tasks.fromNote` ile tek bir göreve dönüştürülür. İkinci bir dönüştürme çağrısı isim çakışması gerekçesiyle engellenir.

2. **Görev (`a2a.tasks.*`) — SAHİPLİ (CLAIMED):**
   - Mutlaka bir ajanın üzerinde hak iddia etmesi (`claim`) gereken fiili bir iştir.
   - Sahiplik bir **kiralama (lease)** modelidir: talep eden ajana 30 dakikalık bir süre tanınır. Ajan belirli aralıklarla `heartbeat` sinyali göndermezse kira düşer ve görev yeniden havuza (`queued`) iade edilir.
   - Yaşam döngüsü: `queued → claimed → running → done | failed | blocked | cancelled`.

### 5 Boyutlu Koordinat Sistemi ve Katılık (Strictness) Matrisi

Bir notun veya görevin kime ait olduğunu belirleyen 5 eksenli bir eşleştirme motoru (`src/core/a2aMatch.ts`) çalışır:

- **`project`**: İşi/notu kapsar. `*` tüm filoya genel yayındır; aksi halde çalışma alanının aktif projesidir. **‼️ Proje her modda zorunlu bir filtredir; hiçbir gevşeklik proje sınırını aşamaz.**
- **`targetRole`**: Muhatabı belirler (bir rol, yetenek kümesi veya doğrudan ajan adı).
- **`subsystem` / `workdir` ve `topic`**: İşi tanımlar; sıralama puanını etkiler.
- **`targetSession`**: Oturum soykütüğü (lineage); oturum devam ettirildiğinde ID korunur.
- **`requires`**: Yetenek filtresi (`write_tools`, `browser`, `shell` vb.); küçük harfli `[a-z0-9_-]+` ile sıkı doğrulanır, geçersiz yetenekler kayıtta reddedilir.

| Koordinat Ekseni | `hard` | `preferred` (zarafet süresi içinde) | `preferred` (zarafet süresi sonrası) | `any` |
|---|---|---|---|---|
| **`project`** | zorunlu (`must`) | zorunlu (`must`) | zorunlu (`must`) | zorunlu (`must`) |
| **`role` · `session`** | zorunlu (`must`) | zorunlu (`must`) | sıralama (`rank`) | sıralama (`rank`) |
| **`subsystem` · `topic`** | zorunlu (`must`) | sıralama (`rank`) | sıralama (`rank`) | sıralama (`rank`) |

**Zarafet Süresi (`agentFarm.a2a.preferredGraceHours`, varsayılan 2 saat):** `preferred` modunda bir görev, ilk 2 saat boyunca yalnızca hedef role ayrılmıştır. Bu pencere içinde başka bir ajan işi almaya çalışırsa motor talebi reddeder ve yanıtta yapılandırılmış veri döndürür: `reserved for its target role`, açılacağı kesin zaman damgası (`opensAt`) ve eşleşmeyen eksenler (`axes`). Böylece ajan boş yere döngüde polling yapmaz. Süre dolduğunda iş projedeki diğer uygun ajanların talebine açılır.

**Çoklu Süreç Eşzamanlılık Koruması (Claim Race):** Birden fazla bağımsız Node sürecinin aynı salisede aynı görevi talep etmesi durumunda işletim sistemi düzeyinde dosya kilidi devreye girer; tam olarak tek bir süreç görevi alır, diğer tüm süreçler gerekçeli ret yanıtı alır. `a2a.tasks.next` ise en yüksek koordinat puanına sahip en eski işi ilk sıraya getirir.

### Görev Yaşam Döngüsü ve Döngü Koruması (Loop Guard)

1. **Talep:** `a2a.tasks.claim id=…` (veya `a2a.tasks.next claim=true`).
2. **Nabız (Heartbeat):** `a2a.tasks.heartbeat id=… progress="tek satır"`. Her birkaç turda bir kira yenilenir. Yanıt mutlaka okunur: insan denetçinin koyduğu direktifler ajana burada ulaşır.
3. **Tamamlama:** `a2a.tasks.finish id=… state=done|failed|blocked result="açıklama"`. Görevi başlatan ajana otomatik bir **sonuç notu** (`result note`) bırakılır; kullanıcıya ayrıca Notices spam'i atılmaz.
4. **Devir (Handoff) ve Döngü Koruması:** Ajan işi tamamlayamıyor ama başka bir ajanın yapabileceğini biliyorsa `a2a.tasks.handoff id=… targetRole=…` ile görevi devreder. **‼️ Üçüncü devir denemesi sistemce kesin olarak reddedilir ve görev `blocked` durumuna çekilir.** Ajanlar arası sonsuz paslaşma döngüsü bu mekanik emniyetle imkânsız kılınmıştır. Bloke olan iş yalnızca insan kararıyla yeniden yönlendirilebilir.

### ‼️ İnsan Denetçi Direktifi — En Üstün Hiyerarşik İrade

Sistemdeki en yüksek öncelik kullanıcının canlı sözüdür (`humanDirective`: `steer` | `veto` | `constraint`):

- **Mutlak Üstünlük:** Bir karta eklenen denetçi direktifi (`⚠️ [HUMAN SUPERVISOR DIRECTIVE]`); Anayasa'dan, ajanın kendi talimatlarından ve görevin orijinal metninden daha üstündür. Çelişki durumunda tereddütsüz direktif uygulanır.
- **İlk Anahtar Teslimatı:** Direktif taşıyan bir karta erişildiğinde (`a2a.tasks.claim`, `a2a.tasks.next`, `a2a.tasks.heartbeat`, `a2a.notes.get`), API yanıtının **İLK anahtarı** `supervisor` olarak döner. Ajan bu bloğu görmezden gelemez.
- **Canlı Araya Girme:** Çalışmakta olan bir göreve sonradan direktif verilirse, bu emir bir sonraki `heartbeat` çağrısında ajana anında teslim edilir.
- **Denetçi Kokpiti:** Kartların üstüne gelindiğinde beliren `+` butonu ile satırın altında satıra ait bir `AFForm` paneli açılır (`src/core/a2aSupervisor.ts`).
  - Kart üzerinde türüne göre renkli 👤 rozeti görünür (kehribar = yönlendirme/steer, mavi = kısıt/constraint, kırmızı = veto).
  - Notlar için doğrudan direktif verilir veya kaldırılır.
  - Görevler için direktif vermenin yanında **Re-route** (döngü sayacını sıfırlayarak işi başka hedefe aktarma) ve **⚡ Run Now** (`a2a.tasks.runNow`) bulunur. `Run Now` tıklandığında hedef ajan adına bir Console oturumu açılır ve görev normal talep (`claim`) mekanizmasıyla başlatılır.

### Baton Devirlerinin A2A Panosunda Yaşaması ve Hijyen

Baton rölesi (`baton.pass`), oturumdan oturuma bayrak devrederken devir notlarını yalnızca arka plandaki `batons.json` dosyasına yazmaz; aynı zamanda A2A panosuna asar:

- **Baton Kartları:** `category: 'baton'`, `topic: chainId` (`chn_...`) ve `strictness: 'hard'` koordinatlarıyla doğrudan hedef ajana asılır.
- **Otomatik Kapanma:** Halef oturum başarıyla çalışmaya başladığı an, devir kartı anında `resolved` durumuna geçer.
- **Hijyen Motoru (`a2aHygiene.ts`):** Çözümlenen kartlar 48 saatlik silinme sayacı başlatır (`resolvedAt`). Yarış bittiğinde (`done` / `failed` / iptal) tüm ilişkili devir kartlarına 24 saatlik TTL basılır ve otomatik süpürme (`sweep`) bunları temizler.
- **İğneleme (📌 Pin):** İğnelenen bir not hiçbir otomatik temizlik veya süre aşımıyla silinemez; sadece kullanıcı eliyle silinebilir (`a2a.notes.pin`, `a2a.notes.delete`).
- **Pano Arayüzü Denetimleri:**
  - **Üç Durumlu Röle Düğmesi:** `⑂ Batons: all` → `hidden` → `only`.
  - **Zincir Kilidi (Chain Lock):** Karttaki `⑂ chn_...` çipine tıklandığında sayfa o zincire kilitlenir, diğer filtreler kapanır ve koşu kronolojik olarak (en eskiden en yeniye) sıralanır.
  - **Seçimli ve Görüneni Silme:** Açık kartta `✕ Delete`, satır onay kutuları ile `🗑 Delete` (seçilenleri veya hiç seçilmediyse filtrelenen tüm görünenleri), ve yalnızca kapalı kartları temizleyen `● Clear resolved`.

### Dört Sekmeli Ajan Gelen Kutusu

Global gezinmede tek şeritte toplanan `🔔 Notices | 📥 Queue | 🤖 A2A Notes | ⚡ A2A Tasks` arayüzü:
- **Ortak Kart Grameri (`afA2A.js`):** Proje çipleri, mutlak dizin uç segmentleri, 30 dakikalık kira geri sayım çubuğu (yeşil/kehribar/kırmızı renk geçişli).
- **A2A Notes Sayfası (`a2aNotesPanel.ts`):** Çöz/Yeniden aç, göreve dönüştür (`a2a.tasks.fromNote`), Markdown dosya bağlantıları ve facts tablosu.
- **A2A Tasks Sayfası (`a2aTasksPanel.ts`):** Açık/kapalı sekmeleri, iptal etme, kira süresi, ilerleme bildirimleri ve çapraz bağlantılar.
- **Oturum Başlangıç Refleksi:** Her ajan oturum açılışında `a2a.status` çağrısı yaparak okunmamış teknik notları, alabileceği görevleri ve elindeki kiraları tek bir çağrıyla kontrol eder (`DUTIES.md` içindeki `[session-start]` nöbeti).

### A2A Köprü Operasyonları Referansı

| Kategori | Operasyon | Açıklama |
|---|---|---|
| **Durum** | `a2a.status` | Ajanın rol ve yeteneklerine göre okunmamış notlar, alınabilir görevler ve aktif kiraları tek çağrıda döner. |
| **Notlar** | `a2a.notes.list` | Notları listeler (`unreadOnly`, `category`, `project`, `topic`, `strictness` süzgeçleri). |
| | `a2a.notes.get` | Not detayını okur; okuyan ajan için `read` işaretler; varsa `supervisor` ilk anahtardır. |
| | `a2a.notes.add` | Yeni teknik not yazar (`project`, `targetRole`, `subsystem`, `topic`, `ttlHours`). |
| | `a2a.notes.resolve` | Notu çözümlendi işaretler; 48 saatlik silinme saatini başlatır. |
| | `a2a.notes.pin` | Notu iğneler veya iğneyi kaldırır (iğneli not süpürmeden korunur). |
| | `a2a.notes.delete` / `.deleteMany` / `.clear` | Notları tekli, çoklu veya kategori/topic bazında temizler. |
| | `a2a.notes.sweep` | Çözümlenmiş ve süresi dolmuş notları temizler (iğnelileri korur). |
| **Görevler** | `a2a.tasks.list` | Görevleri listeler (`status`, `project`, `targetRole`, `subsystem`). |
| | `a2a.tasks.get` | Görev detayını döner; varsa `supervisor` ilk anahtardır. |
| | `a2a.tasks.add` | Yeni görev ekler (`instructions`, `targetRole`, `strictness`, `requires`). |
| | `a2a.tasks.claim` | Görevi kiralar (30 dk lease); yarış korumalı atomik kilit; `supervisor` ilk anahtar. |
| | `a2a.tasks.next` | En uygun görevi seçip sıralar; `claim=true` ile doğrudan kiralar. |
| | `a2a.tasks.heartbeat` | Görev kirasını yeniler, ilerleme raporlar; canlı direktifleri teslim alır. |
| | `a2a.tasks.finish` | Görevi sonlandırır (`done` / `failed` / `blocked`); köken ajana sonuç notu bırakır. |
| | `a2a.tasks.handoff` | Görevi başka ajana devreder; 3. devirde döngü koruması görevi bloke eder. |
| | `a2a.tasks.cancel` | Görevi iptal eder. |
| | `a2a.tasks.fromNote` | Notu tek seferlik göreve dönüştürür. |
| | `a2a.tasks.reroute` | Kullanıcı işlemi: görevi döngü korumasını sıfırlayarak yeni koordinata yönlendirir. |
| | `a2a.tasks.runNow` | Kullanıcı işlemi: Console oturumu başlatıp görevi doğrudan çalıştırır. |
| **Denetçi** | `a2a.directive.set` / `.remove` | İnsan denetçi direktifi ekler veya kaldırır (`steer`, `veto`, `constraint`). |

## Yaşam Panosu {#yasam-panosu}

**Agent Farm: Open Living** (global gezinmede **💓 Living**) — 3.18.0. Tek soruya cevap veren tek ekran: **sistem bugün yaşıyor mu?**

Var olma sebebi ölçülmüş bir vakadır: LifeOS günlük döngüsü 16 gün durdu; emniyet nöbeti her sabah **doğru** çalıştı, hatırlatmasını panoya bıraktı, kimse okumadı. Hiçbir hata yoktu, hiçbir parça kırmızı değildi — ve sistem ölüydü. Diğer her sayfa bir **parçayı** raporluyor; bu sayfa **döngüleri** raporlar: bir şey açıldı — kapandı mı?

Satırlar:

- **Notices** — okunmamış seviye-3+ mesajın **yaşı** (sayısı değil). Üçten fazla bayat mesaj = durmuş.
- **Sorular** — cevapsız `open` soru. *Okundu ≠ cevaplandı.* Cevaplanmış ama ajanın henüz işlemediği sorular ayrı satır.
- **Kuyruk** — en eski aktif kaydın yaşı; `queue.maxAgeHours` tavanını aşan `captured` = boru durmuş. Bloke kayıtlar ayrı satır.
- **Otomasyonlar** — hepsi kapalıysa **ölü**; açık ama 7 gündür ateşleyememişse **sessiz ölüm**; açık ama korumasızsa maliyet uyarısı; kapı kapalıysa ayrı satır.
- **Nöbetler** — `[daily]`/`[weekly]` kadanslı olup arkasında hiçbir zamanlama/tetikleyici olmayan görev (`[every-turn]` tasarım gereği pasiftir, muaf).
- **Harcama** — bugünkü tutar / tavan; tavan yoksa "idle" (sağlıklı değil).
- **Kendi çeklerin** — `agentFarm.livingChecks`: önkoşul motoru burada **"DOĞRU = dikkat gerekiyor"** olarak okunur, yani aynı `{today}` token'larıyla gün dosyası / boş olması gereken klasör kontrol edilir. Çekler **sayfanın kendi satırları**dır (3.92.0): bir kerede biri açık, liste Save'de tek yazımla kaydedilir — dolayısıyla yeniden sıralama tek yazma, Cancel de gerçekten iptal. Köprüde `living.checks` (oku), `living.check.add` ve `living.check.remove` (yaz — **etikete göre**, aynı etiketi ikinci kez eklemek çeki *ayarlar*, sayfada birbirinden ayırt edilemeyen bir yığın üretmez).

**Skor:** ölü döngü 0, uyarı 0,5 sayılır — tek ölü döngüsü olan sistem "%94 sağlıklı" diye okunmaz. Sayfanın altında **otomasyon karar kuyruğu**: ne zaman, ne ateşlendi, ne atlandı ve **neden**.

**Notices yaşlanması (ikinci vuruş):** `agentFarm.noticeStaleHours`'ı (varsayılan 24) geçen okunmamış seviye-3+ mesaj veya cevapsız soru varsa durum çubuğu zili uyarı rengine geçer ve en eskisini adıyla + gün sayısıyla söyler; her cevapsız soru için **bir kez** "Answer now" bildirimi çıkar. Amaç dırdır değil — görmezden gelmenin bir sonucu olması.

## Komuta Merkezi

Filo büyüyünce dar boğaz sensin: kim izin bekliyor, hangi tarayıcı adımı onay istiyor, bütçe nerede taştı? Komuta Merkezi katmanı (Faz G) bu soruların tek ekranda cevaplanması içindir.

### Onay Kuyruğu

**Agent Farm: Open Needs You (Approval Queue)** — çiftliğin **takıldığı** her şey tek, aciliyet sıralı kuyrukta.

**‼️ GİRİŞ SINAVI — "elimi hiç sürmezsem çiftlik burada takılı kalır mı?"** Yalnız bunu geçen satır bu sayfaya girer. Olmuş bitmiş bir olgu (aşılmış bütçe), bir teklif (talimat önerisi), kendi kendine çözülen bir durum (kapasite bekleyen park görev) ve boşta bekleyen oturum **iş değil haberdir**: okunmak ve saklanmak için yapılmış olan **Notices**'a gider. İkisini karıştıran sayfa sana kendisini görmezden gelmeyi öğretir — engel kuyruğunun göze alamayacağı tek başarısızlık budur.

1. 🛡️ **İzin bekleyen oturumlar** (canlı hook verisinden) — tek tıkla oturumu veya Timeline'ı aç.
2. 🌐 **Onay bekleyen tarayıcı adımları** — kuyruktan doğrudan **Run / Reject**. Bildirim ile kuyruk yarışır; ilk karar kazanır. Bildirimi kaçırırsan istek kuyrukta bekler, workflow onayını alana kadar ilerlemez.
3. 🎯 **Sorusu olan / yarıda kalmış görevler (mission)** — **Answer… / Resume / Dismiss** satırın üstünde.
4. ⛓ **Yarıda kalan workflow koşuları** — pencere kapanışında kesilen zincirler kuyrukta kalıcı bir satırdır, **Resume / Dismiss** düğmeleri satırın üstündedir ve karar verilene dek durum çubuğu rozetine sayılır. Açılıştaki toast'ı kaçırmak koşuyu kaybettirmez.
5. ⏳ **Takılmış (stalled) oturumlar** · ⇄ **Antigravity çakışmaları** (tek tık uzlaştırma) — çakışma sınavı geçer çünkü onu ne saat, ne bir ajan, ne de yeniden deneme temizler; yalnız sen.

**Satırları temizleme.** Gördüğün ve hükmünü verdiğin satır kaybolur: satırdaki **✕**, seçim kutuları + **🧹 Clear selected**, ya da **🧹 Clear all**. Temizlenen satırlar **↩ Restore (N)** ile geri gelir.

**‼️ Temizleme kendi kendini onarır — hiçbir uyarıyı kalıcı olarak köreltemezsin.** Kayıt, satırın kimliğine bağlanır (oturum + problem türü; zaman damgası ve mesaj metni yok, çünkü problem dururken onlar oynar) ve **yalnız satır üretilmeye devam ettiği sürece** yaşar. Koşul bittiği an satır üretilmez, kayıt bayatlar ve silinir: **aynı** bekleyiş ömrü boyunca gizli kalır, **sonraki** — aynı oturumun yeni izin isteği, aynı oturumun yeniden takılması — temiz sayfayla gelir.

**Temizlenemeyen tek satır: tarayıcı onayı.** Onun arkasında `await`'te park etmiş gerçek bir ajan var; satırı gizlemek onu sonsuza dek orada bırakır ve cevap verecek yüzey kalmaz. Onun "clear"ı **Reject**'tir — sözü dürüstçe kapatır. O yüzden satırda seçim kutusu yerine 🔒 durur.

Durum çubuğu bu kuyruğu sayar: `🔔 N need you` görünüyorsa tıklamak kuyruğu açar.

**Ajan tarafı:** `needs.list` · `needs.clear` (`keys` veya `all:true`) · `needs.restore`.

### Beş Kavram — hangisi ne? {#gorev-kavramlari}

Karışmaması için tek yerde:

| Kavram | Nedir | Kendi kendine çalışır mı |
|---|---|---|
| ⏰ **Schedule** (zamanlama) | belirli bir saatte ajana iş verir | **evet** |
| ⚡ **Trigger** (tetikleyici) | bir şey olunca (dosya değişti, webhook, canlı olay) iş verir | **evet** |
| 🔗 **Workflow** (iş akışı) | birden çok adımın zinciri (farklı ajanlar, onay/seçim kapıları, medya) | hayır — sen ya da bir tetikleyici başlatır |
| 📋 **Template** (şablon) | kayıtlı bir istem; elle fırlatırsın | hayır |
| ▶ **Task** (görev) | **tek bir koşu.** Yukarıdakilerin hepsi task ÜRETİR | — |

**Task ayrı bir tür değil, çalışmanın kendisidir.** Bir zamanlama saati gelince bir task doğurur; bir tetikleyici ateşleyince bir task doğurur; bir iş akışının her adımı bir task'tır; **+ Run a task** ile sen de doğrudan bir task açabilirsin (tek seferlik iş). Bu yüzden Tasks sayfasında ilk dördü **Plan** sekmesinde (tanımlar), task'lar **Runs** sekmesindedir (koşular) — sayfanın adının "Tasks" olmasının sebebi de budur: hepsi sonunda task'a çıkar.

### Tasks Sayfası — Ajan Aktivitesi Yönetim Paneli {#tasks-sayfasi}

**Agent Farm: Open Tasks** (global gezinmedeki **Tasks** düğmesi) — 3.19.0'da **baştan tasarlandı**. Eski dört bölümlü düzen (Board / Automations / Reusables / Analytics) kaldırıldı: bölüm adları uygulamanın iç tiplerini yansıtıyordu, kullanıcının zihnindeki nesneleri değil, ve aynı şeyin *planı* ile *koşusu* iki ayrı sekmeye dağılmıştı ("tetikleyici var ama görevler nerede?").

Sayfa artık verideki gerçek ikiliğin üzerine kurulu:

- **PLAN** — işi **tanımlayan** her şey: zamanlama, tetikleyici, iş akışı, şablon. Dördü de farklı iç tipler ama kullanıcı hepsini **aynı şekilde** yönetir (aç/kapa, koru, modelini seç, koştur, düzenle, sil) — bu yüzden hepsi **tek tabloda**, tür sütunuyla.
- **KOŞU** — o tanımların gerçekte ne yaptığı.

Yönetim önce gelir ve zengin yüzeyi o alır.

#### Üst kontrol şeridi (her iki sekmede sabit)

Otomasyon kapısının durumu ve tek hamlelik kumandalar: **⏸ Pause all** / **▶ Resume all**, 1s / 8s / 24s süreli duraklatma, **🌙 sessiz saat**. Yanında sayılar: çalışan/limit · kuyruk · sana bakan · **kaç plan açık** · bugün biten/başarısız · otomasyonların **7 günlük maliyeti** · **engellenen uyanma sayısı** · **dikkat isteyen satır sayısı** (tıklayınca tabloyu o satırlara filtreler).

#### PLAN sekmesi

Tek tablo, tek satır dili:

| Sütun | Ne söyler |
|---|---|
| tür + ad | ⏰ zamanlama · ⚡ tetikleyici · 🔗 iş akışı · 📋 şablon, sorun rozetleriyle |
| ne zaman | "her gün 05:00" · "değişince · …/01_YERLEŞTİR" · "sen koşturunca" + bir sonraki koşu |
| ajan / model | modeli görevin **üzerinde** (policy motorunu yener); yoksa "default" |
| koruma | `fireIf` önkoşulu + **kaç uyanma engellediği** |
| maliyet 7g | o tanımın gerçek harcaması |
| son koşu | ne zaman + son kararın sebebi ("no files waiting") |
| açık/kapalı | gerçek bir **anahtar**; şablon/iş akışı gibi anahtarı olmayanlar "manual" der |

- **Arama** ad, istem, ajan ve zamanlama metninde birden arar.
- **Filtreler**: tür · ajan · model · durum · koruma · "dikkat isteyen". **Aktif her filtre, üstte kaldırılabilir bir çip olarak GÖRÜNÜR** ("showing 3 of 12 — kind: trigger ✕") ve yanında tek tıklık **Reset filters** durur. Unuttuğun bir filtre, filtresizlikten kötüdür.
- **Gruplama**: türe göre (varsayılan) · ajana göre · düz. Sıralama sütun başlıklarından; ikinci tık yönü çevirir.
- **Toplu işlem**: satır kutucukları + "hepsini seç" → tek hamlede aç/kapa (onaylı).
- **Satır detayı satır içinde açılır** (▸): tam istem, hedef, zamanlama, önkoşul, 7 günlük koşu/atlama/maliyet dökümü, iş akışıysa adım listesi. Hiçbir şey gizemli bir ikinci sayfa açmaz.
- **Ekleme** aynı çubukta: + Schedule · + Trigger · + Workflow.
- Sorun rozetleri ve anlamları: `no guard` (korumasız — iş olsun olmasın uyandırır) · `path missing` · `always fails` · `never ran` · `deferred` (sessiz saat erteledi) · `no steps`.

#### KOŞU sekmesi

Canlı, kuyrukta, park edilmiş ve biten koşular tek listede: durum · **nereden geldiği** (zamanlama / tetikleyici / iş akışı / sen) · süre · maliyet · ne zaman. Satırdan: başlat · öne al · terminal · iptal · yeniden koştur · çıktı · sil; park edilmişte "retry start". Detay satır içinde açılır (tam istem + transcript). Filtreler: ajan · durum · kaynak + arama, PLAN'daki aynı çip/reset mantığıyla. **Doğal dil komut çubuğu** bu sekmede (cümleni yaz, ucuz model plana çevirir, önizleme onayıyla kurulur).

Filtre durumu **sekme başına** hatırlanır; sekme değiştirmek diğerinin filtrelerini bulaştırmaz.

#### Yan paneldeki Tasks ağacı

Sayfayla **aynı modeli** öğretir; 3.19.0'da o da elden geçti. Üç kök, **her zaman görünür**:

- **Plan** — dört tanım türü tek listede (zamanlama → tetikleyici → iş akışı → şablon sırasıyla, açık zamanlamalar saate göre). Satırda ajan, saat, model, `no guard` / `PATH MISSING` / `deferred` uyarıları ve atlanan ateşleme sayısı; tooltip türü **kelimeyle** söyler ("⏰ SCHEDULE") ve önkoşulu açıklar. Kök başlıkta `açık/toplam` + kaç tanesinin elle çalıştığı.
- **Now** — yalnız **çalışan ve kuyrukta** olanlar; yani sana bakan iş. Çalışan görev tıklanınca terminali açar.
- **Recent** — son **12** biten koşu, en yenisi üstte; başlıkta kaç tanesinin başarısız olduğu. Tamamı sayfada ve aylık arşivde.

Düzeltilen iki kusur: (1) eskiden bölümler **yalnız içeriği varken** görünüyordu — iş akışı tanımlamamış bir kurulumda "Workflows" bölümü hiç çıkmıyor, özellik yokmuş gibi duruyordu; artık üç kök de her zaman var ve boş olan **ne ekleneceğini söyler** (tıklanabilir). (2) görevler **ajan başına gruplanıp bütün geçmiş** içeri konuyordu, her ajan bir tarih duvarına açılıyor ve kullanıcıya yapacak bir şey bırakmıyordu; geçmiş artık Recent'ın arkasında ve sınırlı.

Sağ tık menülerinin tamamı korundu (yaprak `contextValue`'ları değişmedi); Plan kökünde satır içi **+ Schedule / + Trigger / sayfayı aç**, Now kökünde **+ Task**, Recent kökünde **bitenleri temizle** düğmeleri var.

#### Analiz artık ayrı sayfa

**Agent Farm: Open Task Analytics** (PLAN çubuğundaki 📊 Analytics düğmesi) — 30 günlük KPI'lar, debi grafiği, ajan karnesi, görev aileleri, uyarılar ve öngörü. Yönetim yüzeyinden **bilerek ayrıldı**: bunlar *okuma* içindir; bir otomasyonu açarken grafiklerin altında anahtar aramak zorunda kalmamalısın. Sayfada her tablo kendi arama/filtre/sıralama/↺ reset/⬇ MD dışa aktarma araçlarını taşır.

### Maliyet Anomalisi

Sabit bütçe eşiği kör noktalıdır; anomali dedektörü "bugün her zamankinden çok farklı" gününü istatistikle yakalar:

- Ajan (ve filo) başına son **14 günün medyanı + MAD** (sağlam sapma) hesaplanır; bugün `medyan + 3.5σ` üstünde **ve** medyanın en az 2 katıysa Insights'a ⚠ düşer: *"psikolog bugün normalinin 4.2 katında"*.
- `agentFarm.costAnomalyMinUsd` (varsayılan 1$) altındaki günler gürültü sayılır; 0 dedektörü kapatır. Bütçelerden bağımsız çalışır, model çağrısı yoktur.
- **Agent Farm: Cost Anomaly Report** — tablo halinde bugün/medyan/çarpan + **ağır toplar raporu**: son 7 günde token'ın %50'sini yiyen oturumların listesi ("oturumların %5'i token'ın yarısını yedi").

### Eval Seti

Kalite karnesinin doğal evrimi: kötü giden üretim izleri **regresyon test vakası** olur (trace→dataset döngüsü).

1. **Add Eval Case…** — aday listesi otomatik gelir: düşük puanlı kalite örnekleri (≤2/5), verify FAIL olmuş adımlar, ya da elle yaz. Vaka = **girdi** (ajana yeniden sorulacak istem) + **beklenti** (hakem ölçütü, düz dil).
2. **Run Eval Set…** — onaylı ve maliyeti belli: her vaka bir ajan çağrısı (`agentFarm.evalRunArgs`, varsayılan haiku — gerçek modeli test etmek istersen boşalt) + bir ucuz hakem çağrısı. Sonuç karne: *"12/14 geçti, 2 geriledi"* — önceki koşuya göre gerileme/düzelme vaka adlarıyla raporlanır.
3. **Review Eval Cases…** — vakaları gözden geçir/sil. CLAUDE.md'yi değiştirdikten sonra seti koşmak, talimat değişikliğinin etkisini ölçülebilir yapar.

### Oturum Replay

Oturum görüntüleyicide **▶ Replay** — "ne oldu?" sorusunun en hızlı cevabı: mesajlar ve araç çağrıları gerçek zaman aralıklarına sadık kalarak (5 sn tavanlı, 1x-8x hız) adım adım akar. **next error ⚠** ve **next prompt 💬** düğmeleriyle kritik anlara atla; −1/+1 ile kare kare ilerle.

Kontrol çubuğu **yapışkandır** (2.6.0): mesajlar aşağı aktıkça çubuk ekranın üstüne sabitlenir — oynatma ne kadar ilerlerse ilerlesin Pause/hız/atlama düğmeleri hep elinin altındadır. Çubukta **✕ Exit** de vardır (2.7.0) — replay'den çıkmak için yukarı kaydırmak gerekmez.

Replay, **Show filtresine** uyar (2.7.0): Dialog seçiliyse yalnız diyalog mesajları oynar; Turn breakdown tablosunda bir satıra tıklamak oynatmayı o turun başına taşır.

### Subagent Ağacı

Subagent'lar maliyetin görünmez kısmıdır. Recent Sessions ve ajan oturum listeleri artık **ağaç**tır: alt-ajan kayıtları (`…/oturum-id/subagents/*.jsonl`) ebeveyn oturumun altında toplanır, ebeveyn satırında **⧉ N sub • $X total** rollup'ı görünür (kendisi + 5 seviyeye kadar altları). Tek tek maliyetler alt satırlarda durur.

## Güvenlik ve Güvenilirlik

Otonom filo büyüdükçe iki soru kritikleşir: "ajanlarım neye izinli?" ve "otomasyonuma güvenebilir miyim?" (Faz H).

### Guardrail Denetçisi

Her ajanın `.claude/settings(.local).json` izin kuralları otomatik denetlenir (`agentFarm.permissionLint`, varsayılan açık) ve bulgular Insights'a düşer; tıklayınca ayar dosyası açılır, kuralı orada daraltırsın:

- ⛔ **bypass modu:** `defaultMode: bypassPermissions` — tüm izin soruları kapalı demek.
- ⛔ **tehlikeli kalıp:** allow kuralının içinde `rm -rf`, `curl … | sh`, `-EncodedCommand`, `git push --force`, disk format gibi kalıplar (`--force-with-lease` muaf).
- ⚠ **aşırı geniş kural:** `Bash(*)`, çıplak `Bash`, `*`, `WebFetch(domain:*)` — her şey sorusuz koşar.
- ℹ **kullanılmayan geniş kural:** joker içeren kural ama o araç son 30 günde hiç çağrılmamış — bedava risk yüzeyi.
- ℹ **mükerrer kural** ve bozuk JSON uyarısı.

### Tetik Karnesi

Otomasyona güven ölçülebilir olmalı. Tasks ağacındaki her tetik satırı artık karnesini taşır: `fired 12× • 7d: 9✓/1✗ • start ~4s` (7 günlük başarı/başarısızlık + medyan başlama gecikmesi). **Agent Farm: Trigger Reliability Report** tam tabloyu verir. İki koku Insights'a otomatik düşer:

- ⚠ **hep fail:** tetiğin son koşuları üst üste FAILED — başlattığı zincir kırık.
- ℹ **hiç ateşlenmemiş:** tetik kurulu ama hiç çalışmamış — watch yolu/hook filtresi/webhook çağıranı kontrol et.

### Nabız Kontrolü

Sorunlar iş üstünde değil, nabızda yakalansın: her ajana sabit ucuz bir "kim olduğunu tek cümlede söyle" promptu gider, ucuz hakem cevabın CLAUDE.md kimliğiyle tutarlılığını PASS/FAIL'ler. Kırık CLI, bozulmuş CLAUDE.md, cevap veremeyen ajan gerçek işe girmeden görünür.

- `agentFarm.pulse`: `off` (varsayılan) / `nightly` / `weekly`; elle: **Run Pulse Check Now**.
- FAIL olan ajan Insights'ta ⛔ olur; maliyet ajan başına iki ucuz çağrıdır (`judgeArgs` modeli).

### Headless Servis

"VS Code açıkken" kısıtının ilacı: **Install Headless Service (Windows)…** küçük bir node sürecini oturum açılışına (schtasks, mevcut kullanıcı) kaydeder. Servis:

- VS Code çalışırken **uyur** (eklentinin 30 sn'de bir yazdığı heartbeat'e bakar) — çakışma olmaz; VS Code kapanınca ~90 sn içinde devralır.
- Devraldığında **zamanlanmış görevleri** ve **watch tetiklerini** işler: `claude -p` headless koşar, çıktıyı aynı arşive yazar, görev kayıtlarını `farm-tasks.json`'a ekler — panel açıldığında her şey yerli yerindedir ve "servis sen yokken N görev koştu" bildirimi gelir.
- Kapsam bilinçli olarak dar: hook/webhook tetikleri canlı dinleyici, workflow/dispatch aksiyonları tam motor ister — onlar VS Code'da kalır. Servis görevleri daima headless koşar.
- `node` PATH'te olmalı. Durum: **Headless Service Status**; kaldırma: **Remove Headless Service**. Günlük: `service-runs.jsonl`.

## Doğal Dil Komuta

Kurulum arayüzünün kestirmesi: Tasks başlığındaki 🚀 (veya `Agent Farm: Natural Language Command…`) → tek cümle yaz:

> *"yarın 09:00'da psikolog haftalık analizi koşsun"* · *"önce yazar taslak yazsın, sonra editör düzeltsin"* · *"asistana şimdi şu işi ver: …"*

Ucuz model cümleyi yapılandırılmış bir plana çevirir (tek seferlik iş / zamanlama / çok adımlı zincir), sana **insan diliyle önizleme** gösterilir — *Create* veya *Create & Run* demeden hiçbir şey kurulmaz. Plan doğrulanır: yalnızca gerçek ajan adların kabul edilir, saatler ve adımlar kontrol edilir; model saçmalarsa ham çıktıyla birlikte hata görürsün, sessizce yanlış bir şey kurulmaz. "Yarın" gibi ifadeler o anki tarihe göre hesaplanır.

## Dispatcher (İş Dağıtıcı)

Filo büyüyünce "bu iş hangi ajana?" sorusu da otomatikleşir. Tetikleyici eklerken eylem olarak **Dispatch — route to the best agent** seç: her ateşlemede gelen metne (webhook gövdesi / izlenen yol) bakılır ve iş en uygun ajana verilir.

1. **Kurallar önce:** `agentFarm.dispatchRules` — regex → ajan; ilk eşleşen kazanır. Örn. `[{"match": "uyku|kaygı", "agent": "psikolog"}]`. Deterministik ve bedava.
2. **Sınıflandırıcı sonra:** kural tutmazsa ucuz model, ajanların CLAUDE.md rol özetlerine bakarak seçer (`agentFarm.dispatchClassifier`, varsayılan açık; kapatırsan kural tutmayan iş düşer ve bildirilir).

Görev başlığına seçilen ajan ve yöntem yazılır (`inbox işi → psikolog [model]`). Kurmadan denemek için: `Agent Farm: Test Dispatcher…` — metni yaz, kimin alacağını ve gerekçeyi gör.

## Zekâ Derinliği

Talimat mühendisliğini tahminden ölçüme taşıyan katman (Faz I): her CLAUDE.md değişikliği kayıtlı, etkisi ölçülü, hafıza bakımı yarı-otomatik.

### Talimat Sürümleme

Her ajanın CLAUDE.md'si değiştiğinde otomatik olarak zaman damgalı tarihçeye alınır (içerikle birlikte — geriye dönüp bakabilirsin). **Instruction History & Impact…** komutu sürüm tablosunu açar: her sürümün hükmü boyunca kaç oturum koştu, kalite ortalaması ne oldu (▲/▼ önceki sürüme göre), günlük maliyet neydi. *"Bu kuraldan sonra kalite +0.6"* artık bir tablo satırıdır. A/B deneyinin kazananı uygulandığında da tarihçeye işlenir.

### A/B Talimat Deneyi

**A/B Instruction Experiment…** — iki CLAUDE.md varyantı, aynı istem seti, yan yana hakem:

1. B varyantı üç kaynaktan gelebilir: açık bir **talimat önerisini** dene (mevcut + kural), **dosyadan** seç veya kuralı **elle yaz**.
2. İstem seti: ajanın **eval vakaları** varsa otomatik onlar (en fazla 5); yoksa `;` ile ayırıp yazarsın.
3. Her istem iki izole kum havuzunda koşar (geçici klasör: varyant CLAUDE.md + memory kopyası — gerçek ajana dokunulmaz). Ucuz hakem cevapları **rastgele sırayla** görür (konum yanlılığı korunur) ve 1/2/EŞİT der.
4. Rapor: A-B-eşit skoru + istem başına gerekçeler. **B kazandıysa** tek tıkla kalıcı yapılır (.afbak yedekli, sürüm tarihçesine işlenir).

### Hafıza Distilasyonu

Bağlam diyetinin yarı-otomatik hali: **Distill Memory File…** → şişmiş (~2000+ token) veya bayat dosyalar aday listesinde önce gelir → ucuz model yoğunlaştırma taslağı üretir (tekrarlar birleşik, çelişkiler `⚠ ÇELİŞKİ:` ile işaretli, bayat satırlar "Arşiv adayı" bölümünde, frontmatter aynen) → **diff ekranında** karşılaştırırsın → Apply dersen .afbak yedeğiyle uygulanır. Korumalar: model limit/hata mesajı asla taslak sayılmaz; frontmatter'ı düşüren taslak reddedilir; MEMORY.md indeksi hiç aday olmaz (el emeği).

### Semantik Hafıza Sorgusu

Transcript araması geçmişi bulur; bu, **bilgiyi** bulur. **Ask Fleet Memory…** → *"kullanıcının uyku düzeni hakkında ne biliniyor?"* → tüm ajanların memory/*.md dosyaları embedding indeksinde aranır (aynı sağlayıcı ayarları: `embeddingsProvider`), sonuçlar ajan + dosya + benzerlik yüzdesiyle listelenir, seçince dosya açılır. İndeks artımlıdır (yalnız değişen dosyalar yeniden vektörlenir) ve transcript indeksinden ayrıdır.

### Model Politikası

Kota bekçisinin proaktif hali: görev nereden doğduysa ona göre model.

- `agentFarm.modelPolicy` kuralları — ilk eşleşen kazanır: `[{"source": "trigger", "model": "haiku"}]` = tetikten doğan her rutin iş ucuz modelde; `source` = trigger/schedule/workflow/manual/any, ayrıca `agent` ve `promptMatch` regex'leri.
- **Kota düşürme:** `quotaDowngradePercent` (örn. 70) — 5 saatlik pencere bu doluluk yüzdesini aşınca fabrika kaynaklı her görev `quotaDowngradeModel`'e (varsayılan haiku) zorlanır. Elle açtığın oturumlara karışılmaz.
- Uygulanan politika headless çıktı başlığına yazılır (`Model policy: quota window 82% ≥ 70% — downgraded…`) — neyin neden ucuz koştuğu hep izlenebilir.

## Ölçek ve Taşınabilirlik

Filo tek makineye sığmadığında: başka makinelerin oturumlarını aynı panelde izle, günlük karneyi cebine gönder, ajanlarını tek dosyayla taşı.

### Çoklu Makine

İkinci makinenin `.claude` klasörünü bir senkron aracıyla (Syncthing, OneDrive, SSH kopyası) bu makineye salt-okunur aynala, sonra:

```json
"agentFarm.extraClaudeDirs": [
  { "name": "laptop", "dir": "D:/sync/laptop/.claude" }
]
```

- O makinenin oturumları panele **⇄ laptop** rozetiyle gelir; maliyet, karne ve arama hepsini kapsar.
- Ajan eşleştirme yine çalışma dizinine bakar: iki makinede aynı klasör düzenini kullanıyorsan uzak oturumlar doğru ajana sayılır; eşleşmeyenler `Other projects (laptop)` altında toplanır (`includeUnmatchedProjects` açıkken).
- Senkron kopyada `projects` klasörü bulunamazsa açılışta uyarı alırsın — senkronun çalıştığını kontrol et.
- Agent Farm uzak klasöre **hiçbir şey yazmaz**; izleme tek yönlüdür.

### Günlük Özet Kartı (Cebe)

Haftalık akıllı özetin küçük kardeşi — model çağrısı yok, saf veri, telefon dostu tek mesaj: bugünün maliyeti, aktif ajanlar, en çok harcayanlar (bütçe yüzdesiyle), görev/nöbet durumu ve uyarılar.

- **Elle:** `Agent Farm: Send Daily Digest Now`.
- **Otomatik:** `agentFarm.dailyDigest` = `"21:30"` gibi bir saat — o saatten sonraki ilk kontrolde günde bir kez `notifyWebhookUrl`'e `digest` olayı olarak gönderilir (n8n → Telegram hattıyla cebe düşer).
- Webhook ayarlı değilse elle çalıştırma sonucu bildirim olarak gösterir.

### Ajan Paketleri

Ajanı şablonlaştırıp başka makineye taşımak veya paylaşmak için tek dosya: `.agentpack`.

- **Dışa aktar:** ajana sağ tık → **Export Agent Pack…** (veya komut paleti). Pakete girenler: `CLAUDE.md`, `DUTIES.md`, `tools/`, `.claude` ayarları, `.mcp.json` + ajanın karıştığı workflow/tetik/zamanlama/şablonlar.
- **ASLA girmeyenler:** `memory/` (kişisel hafıza) ve sırlar. İçinde kimlik bilgisi kokan dosyalar otomatik atlanır ve uyarı verilir; webhook token'ları paketten çıkarılır. `{secret:AD}` referansları korunur — hedef makinede aynı adla sır tanımlayınca çalışır.
- **İçe aktar:** **Import Agent Pack…** → paket dosyasını seç → kök klasör + yeni isim → onay. Taze `memory/MEMORY.md` iskeleti kurulur; workflow adımları yeni ajana bağlanır (aynı isimli yerel ajanlar isimle çözülür, bulunamayan self'e düşer ve uyarı verilir); tetikleyiciler ve zamanlamalar **kapalı** gelir — gözden geçirip kendin açarsın.

### Antigravity Uyumluluğu

Ajanların Claude için optimize; ama istersen aynı ajan Google Antigravity (Gemini) ve OpenAI Codex altında da çalışır. `memory/` dosyaları düz markdown olduğundan **iki taraf da olduğu gibi kullanır — dönüşüm gerekmez**.

**Üç motor, iki talimat dosyası — çünkü farklı yerlere bakıyorlar.** Bu bir tercih değil, motorların ölçülmüş davranışı:

| | Okuduğu | Üst klasöre çıkar mı? |
|---|---|---|
| **Codex** | her klasörden bir `AGENTS.md`, **git kökünden cwd'ye kadar** birleştirilerek (32 KiB tavanı) | **Evet** — bir üstteki ortak dosya kendiliğinden ulaşır |
| **Antigravity** | `<workspace kökü>/.agents/AGENTS.md` + global `~/.gemini/config/AGENTS.md` | **Hayır** — açık workspace'in üstündeki hiçbir şey yüklenmez |
| **OpenCode** | **aynı** `AGENTS.md` — cwd'den **git worktree'sine** kadar bulunan hepsi. `AGENTS.md`, `CLAUDE.md`'yi tamamen gölgeler (ilk eşleşen *ad* kazanır) | **Evet, ama git worktree'sinde durur** |

Bu yüzden senkron ikisini birden yazar: ajan klasöründe `AGENTS.md` (Codex'in araçlar-arası dosyası — OpenCode da onu okur) **ve** `.agents/AGENTS.md` (Antigravity'nin kural dosyası — workspace customization root'u). Aynı kaynak, farklı muhataplar; üçüncü motor için üçüncü bir kopya yok.

**Kur:** ajana sağ tık → **Sync Agent with the Other Engines…**

- `CLAUDE.md` → `AGENTS.md` üretilir (öz-referanslar uyarlanır; dosya başında senkron işareti).
- `CLAUDE.md` (+ aşağıdaki ortak anayasa) → `.agents/AGENTS.md`, Antigravity'nin gerçekten okuduğu dosya.
- Aktif nöbet görevleri → `.agents/workflows/` (Antigravity'de `/nobet-adi`) **ve** `.opencode/command/` (OpenCode'da `/nobet-adi`).
- `.mcp.json` varsa → `.agents/mcp_config.suggested.json` (global gemini dosyasına elle birleştirirsin — Agent Farm `~/.gemini`'ye asla yazmaz), Codex için `.agents/codex/mcp.suggested.toml`, OpenCode için `.opencode/mcp.suggested.json`. Üçü de **öneri**; hiçbirinin canlı yapılandırması bizim tarafımızdan düzenlenmez.
- Beceriler **kopyalanmaz**: OpenCode `~/.claude/skills/<ad>/SKILL.md` dosyalarını kendiliğinden yükler — gerçek bir skill çağrısıyla ölçüldü.

**Ortak anayasa.** Ajanlar bir *nest* içindeyse — ajan klasörlerini tutan ve kendi `CLAUDE.md`'si olan kök klasör — o dosya her ajanın yüklediği anayasadır. Claude Code üst klasördeki talimat dosyasını bedavaya yükler; diğer motorlar yüklemez, her biri kendi yolundan:

- **Codex** için nest klasörünün kendi `AGENTS.md`'si yeterli: **Dashboard'daki ⚖ Sync constitution düğmesi** (3.40.0 — komut paleti ve `constitution.sync` bridge op'u da aynı komutu çağırır) anayasayı oraya aynalar, Codex de hangi ajan klasöründe çalışıyorsa oraya inen yürüyüşünde onu birleştirir. Tek kopya, tekrar yok — ajanın kendi `AGENTS.md`'si bu yüzden anayasayı bilerek **tekrarlamaz**.
- **Antigravity**'ye bu yoldan ulaşılamaz; bu yüzden her ajanın `.agents/AGENTS.md` dosyası anayasayı **içine gömülü** taşır: `agent-farm:shared-constitution` bloğu içinde, ajanın kendi talimatından önce.
- **OpenCode** aynı nest aynasını yürüyüşünde bulur — **ama yürüyüşü git worktree'sinde durur.** Ajan klasörünün kendisi bir git deposuysa anayasa görünmez olur: bütün dosyalar yerinde, senkron “in sync” der ve kural sadece prompt'ta yoktur. Senkron bunu tespit edip o ajanın `opencode.json`'ına tek satır ekler (`"instructions": ["../AGENTS.md"]`, göreli — dosya repo ile yolculuk eder); dosya yorum taşıyorsa yeniden yazılmaz, bizim başlattığımız süreçlere `OPENCODE_CONFIG_CONTENT` ile verilir ve kalan boşluk adıyla söylenir. `agents.sync` cevabındaki `opencode.reachesConstitution` bunu ajan ajan söyler.
- OpenCode ayrıca **kimsenin ayarlamadığı bir global dosya** da yükler: `~/.config/opencode/AGENTS.md` yoksa kullanıcının kişisel `~/.claude/CLAUDE.md`'si. Agent Farm oraya yazmaz, ama `globalInstruction` ile bildirir.
- Anayasa **okunur, asla yazılmaz**: ters senkron, ajanın `CLAUDE.md`'sine bir şey yazmadan önce bu bloğu söker; hiçbir komut nest `CLAUDE.md`'sini yazmaz. Anayasa değiştiğinde Insights hangi ajanların hâlâ eski metni taşıdığını söyler.

**Yaşat (yönlü senkron):** Bu tek seferlik bir dışa aktarım değil. Her senkronda içerik parmak izleri `.agents/af-antigravity-sync.json`'a yazılır; sonraki çalıştırmada hangi taraf ilerlemiş anlaşılır:

- **CLAUDE.md değişti** → Insights'ta hatırlatma; komut AGENTS.md'yi tazeler.
- **AGENTS.md değişti** (Antigravity oturumu ajana bir şey öğretti) → komut sorar: **Apply to CLAUDE.md** dersen kazanım yedekli olarak CLAUDE.md'ye taşınır — optimizasyon mirası iki tarafta da yaşar.
- **İkisi de değişti** → çakışma uyarısı (warning): Diff görüntüle veya yön seç; kaybeden taraf `.afbak` yedeğiyle korunur.
- Elle düzenlediğin workflow dosyalarına ve senin yazdığın (bizim üretmediğimiz) AGENTS.md'ye onaysız dokunulmaz.

### Paralel Worktree Koşuları

Kod ajanları için ölçek anahtarı (Faz J): aynı repo'da birden çok iş, sıfır çakışma.

- **Run Parallel Worktrees…** → ajan (git repo olmalı) → istemleri `;` ile ayır → her istem kendi `git worktree`'sinde (`af/` dallı, repo'nun yanındaki `.af-worktrees-*` klasöründe) headless koşar; ajana "bitince commit et" talimatı otomatik eklenir. Kartlar panoda `⑂` önekiyle görünür.
- **Worktree Runs…** → koşu listesi: kaç commit, diffstat, kaydedilmemiş değişiklik var mı → seçince üç aksiyon: **Merge** (mevcut dala `--no-ff`, sonra worktree temizliği), **Open** (yeni pencerede aç, elle incele), **Discard** (worktree + dal silinir, onaylı).
- Eski git sürümlerinde (`worktree remove` yoksa) temizlik elle silme + `worktree prune` ile yapılır — sürüm kontrolü otomatik.

### Canlı Relay (Uzak Makine)

E1 klasör-senkronu geçmişi taşır; relay **canlılığı** taşır. Kurulum:

1. Bu makinede: **Save Relay Script for Another Machine…** → `farmRelay.js`'i kaydet, diğer makineye kopyala.
2. Diğer makinede: `node farmRelay.js --claude %USERPROFILE%\.claude --out <senkronKlasörü>\relay-laptop.jsonl --machine laptop` (başlangıca da koyabilirsin). Script transcript'lere eklenen satırları izler ve kompakt olay akışı yazar — ağ yok, taşıma senin senkron aracın.
3. Bu makinede: `agentFarm.relayFeeds` = `[{"name": "laptop", "file": "D:\\Sync\\relay-laptop.jsonl"}]` → olaylar canlı monitöre akar: uzak ajan Live Feed'de/ajan satırında WORKING görünür. Ajan eşleşmesi klasör adıyla yapılır (iki makinede aynı isimli ajan klasörü = aynı ajan).

### OpenTelemetry Dışa Aktarım

**Export Traces (OpenTelemetry JSON)…** — tüm oturumlar (subagent ağaçları ebeveyn-çocuk span ilişkisiyle) OTLP/JSON dosyasına yazılır: Langfuse, Grafana Tempo veya herhangi bir OTLP tüketicisine besleyebilirsin. Yerellik korunur: yalnızca dosya yazılır, nereye göndereceğin senin kararın. Span öznitelikleri: ajan, model, token'lar (`gen_ai.*`), maliyet, araç sayısı, hatalar (hatalı oturum = ERROR status).

### Agentpack Galerisi

Ajan paketlerinin tüketim tarafı: `agentFarm.packGalleryRepos` = git URL'leri veya yerel klasörler → **Browse Agent Pack Gallery…** kaynakları senkronlar (git: sığ klon + pull), bulunan `.agentpack`'leri listeler, seçtiğin normal **güvenli import akışıyla** kurulur (hafıza/sır asla pakette yok, tetikler kapalı gelir, yeni webhook token).

### Diğer Motorlarla Çalışma — Uçtan Uca

Artık iki ayrı ve bilinçli yol var. **Claude Code · Codex · Gemini · Antigravity birinci sınıf motorlardır**; `agentFarm.cliProfiles`, Agent Farm'ın tanımadığı keyfi bir komut için kaçış kapısıdır. Dört yerleşik motoru `cliProfiles` içine ekleme: Console, Start Session…, New Task, zamanlama/tetikleyici, misyon ve ekiplerdeki **Engine** kutusundan seç. Birinci sınıf yol motorun gerçek model/efor sözlüğünü, devam kurallarını, transkript adaptörünü ve token muhasebesini taşır. Jenerik profil yalnız stdout/stderr arşivi ile çıkış durumunu alır — uydurma transkript, fiyat ya da canlı semantik yoktur.

**Birinci sınıf motoru kur ve çalıştır.**

1. **Engines** sayfasını aç; CLI'ı oradan kur/giriş yap. **⚡ Test** salt-okunur tek tur harcar ve motorun kendi hükmünü kaydeder.
2. Ajan için bir kez **Sync Agent with the Other Engines…** çalıştır. Codex `AGENTS.md`'yi; Antigravity `.agents/AGENTS.md` ile üretilen workflow'ları okur. Aynı senkron ortak anayasayı da paralel tutar.
3. İşin başladığı yüzeyde motoru seç. `agentFarm.launchDefaults.engine` filo varsayılanını belirler; bir ajan motor başına kendi model/efor varsayılanını hatırlayabilir.
4. Motorun terminal CLI'ında güvenli bir devam biçimi yoksa **Console** üzerinden devam et. Codex ve Gemini tur başına süreçtir; Claude kalıcı süreçtir; Agent Farm Antigravity'yi barındırdığında `agy` CLI'ını sürer. Panel bir motorun bayraklarını ötekine çevirmeye kalkmak yerine farkı açıklar.

Antigravity masaüstü uygulaması hâlâ ayrı bir editördür. Senkron onun workspace dosyalarını hazırlar; birinci sınıf `agy` entegrasyonu ise Agent Farm'ın barındırabildiği CLI yoludur. Birbirlerinin yerine geçen iki ad değil, birbirini tamamlayan iki yoldur.

### Kapsam ve dürüst sınırlar (3.120.0)

Oturum indeksinin bilinçli olarak iki yarısı vardır. `all()` / `forAgent()` **Claude biçimindeki ölçüm kümesidir**; `allWithExternal()` / `forAgentWithExternal()` ise **eksiksiz kayıttır**. Kayıt yüzeyi her motoru listeler. Analitik yalnız gerçekten ölçebildiği biçimde kalır ve dışarıda bıraktığını söyler. İkisini karıştırmak ya konuşmaları gizler ya da dürüst sıfırları gerçek görünen ortalamalara katar.

| Yüzey / olgu | Kapsam |
| --- | --- |
| Sessions tabloları, kenar çubuğunun ajan başına oturum listesi ve başlık sayacı, ajan oturum günlüğü, Console devam/geçmiş, Text/Regex arama, Live Timeline, Portfolio etkinliği, Dashboard oturum sayıları, oturum rafı, filo durumu panosunun son oturum listesi, proje oturum listeleri, görev koşu geçmişi ve OTLP dışa aktarımı | Bütün motorlar; satırlar motor rozeti taşır. OTLP `gen_ai.system` yazar. |
| Turns — tablo, satırın açılan içeriği ve Markdown aktarımı, ayrıca `turns.list` op'u | Claude ve Codex gerçek tur satırlarına sahiptir; tablo motoru açıkça belirtir ve arkasındaki her adım aynı havuzu okur. |
| “Bu ajan şu anda çalışıyor mu” (kenar çubuğu noktası, Portfolio, Dashboard kartı, durum çubuğu, `agents.list`) | Bütün motorlar. Canlılık bir zaman damgasıdır; her motorun satırı onu dürüstçe taşır. |
| Meaning araması | Yalnız Claude Code transkript indeksi; kip ve indeks durumu dışarıda kalan diğer-motor oturum sayısını söyler. |
| Maliyet/cache/context sağlığı, kalite, skill/MCP/hafıza kullanımı ve nöbet uyumu | Claude Code transkript analitiği. Filo **ve ajan** bulguları, Cost Anomaly Report ve maliyet uyarıları yabancı oturumları sahte ortalamaya katmak yerine dışlamayı açıkça söyler — tek bir ifadeyle, `claudeOnlyScopeNote`'tan, bulgunun `scope` alanında taşınır; böylece her yüzey onu doğru yere koyar (kenar çubuğu hover'da, ajan sayfası tablosunun üstünde bir kez). |
| Plan limitleri | Motor başına: Claude OAuth endpoint'i, Codex'in kayıtlı rate-limit bloğu ve ölçülebilir veri yoksa açık “yayınlanmıyor / plan yok” cevabı. Eksik hiçbir zaman %0 demek değildir. |

Aynı kural köşelere de ulaştı: rename her motorda yeniden taramadan sonra korunur; Resume bir Codex kimliğini Claude'a vermek yerine kayıtlı motoru açar; “Open transcript” ve “Copy transcript path” kalıcı olarak okunamayan Antigravity protobuf deposunu açıklar; `includeUnmatchedProjects` anahtarı her motoru yönetir; çakışan canlı kulvar ve transkript kayıtlarında zengin transkript kazanır.

**Kenar çubuğunda yabancı satır için ayrı bir yol yoktur.** Her oturum satırını tek bir kurucu çizer: aynı sağ tık menüsü, aynı görüntüleyici ve motorun kendi olgularından doğan retler — çalışma klasörü yoksa devam ettirilemez, okunabilir transkript yoksa tıklama boş bir düzenleyici açmak yerine nedenini o motorun diliyle söyler.

Codex kullanımı kümülatif sayaç olarak ele alınır: her tur önceki toplamdan farkı yayımlar, `reasoning_output_tokens` zaten output'un içindedir ve context göstergesi rollout'un kaydettiği pencereyi kullanır. Görev koşusu yalnız kendi motorundaki oturumla eşleşir. Claude API karşılığı dolar gösterebilir; planla faturalı motor gerçekten bildirdiği token'ı gösterir ve yanıltıcı `$0.00` yazmaz.

### Jenerik CLI profilleri

Agent Farm'ın tanımadığı bir CLI — aider, opencode, şirket içi script — için şablon ekle:

```json
{"name": "aider", "headless": "aider --message \"{prompt}\"", "interactive": "aider"}
```

Profil bir komut yürütücüdür, beşinci motor değildir. `{prompt}` / `{args}` alır, çıktıyı arşivler ve çıkış kodunu bildirir. CLI hook sunuyorsa `cliHook.js` yaşam döngüsünü Live Timeline'a aynalayabilir; gerçek oturum geçmişi için özel bir `SessionSource` adaptörü gerekir. Agent Farm yabancı log biçimini asla tahmin etmez.

### Sesli Brifing

NoteScribe döngüsünün dönüş yarısı: **Speak Daily Briefing (TTS)** günlük özet kartını fal.ai TTS modelinden geçirir ve mp3'ü `digestTtsFolder`'a (telefonla senkron bir klasör / vault) düşürür. Ayarlar: `digestTtsModel` (fal'daki gerçek model kimliğini doğrula), anahtar aynı `FAL_KEY` sırrı. Klasör boşsa `autoReportFolder` kullanılır.

### Marketplace / Yayın

Eklenti yayın kalitesinde hazırlandı: `LICENSE` (MIT), `CHANGELOG.md`, README'de gizlilik beyanı ("telemetri yok") ve yayın adımları. Marketplace/Open VSX'e çıkmak bir ürünleşme kararıdır ve sana aittir — adımlar README'nin "Publishing" bölümünde (publisher hesabı + `vsce publish`).

## Maliyet Hesabı

Token kullanımı yerel kayıtlardan okunur ve `agentFarm.pricing` kurallarıyla fiyatlanır (milyon token başına USD; ilk eşleşen regex kazanır):

| Model deseni | Input | Output | Cache Write | Cache Read |
| --- | --- | --- | --- | --- |
| opus | 15 | 75 | 18.75 | 1.50 |
| fable, mythos | 15 | 75 | 18.75 | 1.50 |
| sonnet | 3 | 15 | 3.75 | 0.30 |
| haiku | 1 | 5 | 1.25 | 0.10 |

**Önemli:** Abonelik planında (Pro/Max) bu rakamlar fatura değildir — kullanımının **API karşılığı değeridir**. "Bu ay aboneliğimden ne kadar değer çıkardım?" sorusunun cevabıdır. Fiyat listesi güncellenirse ayarlardan düzelt; eşleşmeyen modeller Dashboard'un altında uyarı olarak listelenir ve 0$ sayılır.

Bu oranları JSON'a dokunmadan düzenleyebilirsin: bir ajanın detay sayfasını aç ve **Model pricing** editörünü kullan. Değişiklik **yalnızca ileriye** uygulanır — daha önce kaydedilmiş oturumlar faturalandıkları oranı korur, yani bir fiyatı güncellemek geçmiş maliyetleri asla yeniden yazmaz. Oranlar bir dahaki açılışta hatırlanır (`agentFarm.pricing` ayarında tutulur); arka planda tutulan tarihli geçmiş sayesinde her mesaj, çalıştığı andaki oranla fiyatlanır (2.47.0).

**5 saatlik pencere:** Abonelik planlarında kota ~5 saatlik yuvarlanan pencerelerle işler. Dashboard son 5 saatteki token toplamını gösterir; `agentFarm.windowTokenLimit` ayarına plan limitini yazarsan yüzde çubuğu görürsün.

### Bütçe Uyarıları

`agentFarm.budgets` ayarıyla ajan başına (ve `"*"` ile filo geneli) **günlük bütçe** tanımlarsın:

```
"agentFarm.budgets": { "psikolog": 20, "*": 50 }
```

- Bütçenin **%80'ine** gelen ajan Insights'ta ⚠ uyarı alır; **aşan** ajan ⛔ hata olur ve günde bir kez bildirim düşer.
- Dashboard'da bütçeli ajan kartlarında doluluk çubuğu görünür; filo bütçesi "Cost today" kartına işlenir.
- Rakamlar API karşılığı değerdir — abonelikte fatura değil, tüketim disiplinidir: "psikolog bugün değer olarak 20$'ı geçmesin" gibi.

### Trend Uyarıları

Bütçe "bugün"e bakar; trend uyarısı **haftalık gidişata** bakar. Bir ajanın son 7 günlük maliyeti, önceki 7 günün `agentFarm.trendAlertFactor` katına (varsayılan 2x) ulaşırsa Insights'ta uyarı belirir: *"Weekly cost trend: $24 this week vs $6 last week (4.0x)."* Filo geneli de ayrıca izlenir.

Gürültü koruması: önceki hafta 0.50$'ın, bu hafta 1$'ın altındaysa uyarı üretilmez (küçük rakamlarda kat sayısı anlamsızdır). `trendAlertFactor: 0` tamamen kapatır. Bu uyarı "kötü" demek değildir — bazen yoğun bir proje haftasıdır; amacı sessiz maliyet sürünmesini erken göstermektir.

## Ayarlar

### Farm Settings sayfası (2.54.0)

VS Code'un ayar arayüzünde kazı yapmana gerek yok: **Agent Farm: Farm Settings** (Dashboard'daki **⚙ Settings** düğmesi de) **tüm `agentFarm.*` ayarlarını** tek sayfada açar — alana göre gruplu (Core, Live Monitoring, Cost, Tasks, Media, Search, Multi-CLI, Health, Reports), filtre kutulu; her ayarın açıklaması adının altında, tam anahtar + varsayılan değeri tooltip'te. Boolean'lar onay kutusu, enum'lar açılır liste, liste/nesneler doğrulamalı JSON editörü — bozuk değer yazılmaz, satırın altında hatayla reddedilir. Varsayılandan farklı ayarlar işaretlidir ve tek tıkla **↺ reset** edilir. Değişiklikler anında kullanıcı ayarlarına kaydedilir; başka yerden yapılan düzenlemeler sayfaya canlı yansır.

Sayfa **şema-güdümlüdür**: eklenti manifestinin bildirdiği her şeyi çizer — gelecekte eklenen bir ayar kendiliğinden görünür.

**Ayar setleri:** mevcut varsayılan-dışı değerleri adlı bir set olarak kaydet (*Save current as…*), sonra **Apply** ile geri yükle — set uygulanırken setin anmadığı değiştirilmiş ayarlar da varsayılana döner, yani set bir katman değil **tam bir durumdur** (onay penceresi tam kaç değerin değişeceğini söyler). Setler **JSON dosyasına aktarılıp geri alınabilir** — makineler arası taşınabilir.

**Agent folders bölümü (2.61.0):** sayfanın ilk bölümü **ajanların nerede yaşadığını** yönetir — eskiden bir kerelik kurulum sorusu ve ham JSON dizisi olan parça. `agentFarm.agentRoots`'taki her kök bir satırdır; rozeti, keşfin o kökten ne anladığını söyler: **nest · N agents** (ajanlar alt klasörlerdir; kökün kendi `CLAUDE.md`'si ortak talimattır, ajan değildir), **single agent**, düz **N agents**, **folder missing** ya da **duplicate entry** (aynı klasörün iki farklı yazımı — tek tıkla temizlenir; büyük/küçük harf ve eğik çizgi farkları artık keşfi bozamaz). Her satır ajanlarını çip olarak listeler: ada tıklayınca o ajanın sayfası açılır; **Exclude** klasörü çiftlikten tamamen çıkarır — görünümler, analitik, oturum sahipliği dahil her yerde ajan olmaktan çıkar, **Include** ile geri gelir; dışlananlar soluk görünmeye devam eder ki geri dönüş hep tek tık olsun. **+ Add root…** klasör seçici açar; **Remove** kökü taramayı bırakır (onay penceresi kaç ajanın görünümlerden çıkacağını açıkça söyler; klasörün kendisine asla dokunulmaz); **Reveal** dosya gezgininde gösterir. Artık hiçbir şeye denk gelmeyen bayat dışlama kayıtları ayrı listelenir, tek tıkla silinir. Bölüm arka planda `agentFarm.agentRoots` / `agentFarm.excludeAgentDirs` ayarlarını düzenler — elle yapılan düzenlemeler ve ayar setleri sayfayla senkron kalır.

**Ajan başına varsayılan model (2.75.0, bilgi tabanı 2.78.0):** her ajan çipinde bir **model** açılır kutusu var — o ajanın oturumlarının varsayılan modeli. Seçenekler **senin model bilgi tabanından** gelir (`agentFarm.modelAliases`, varsayılan haiku/sonnet/opus/fable): yeni bir model adı çıktığında oraya bir kere ekle, her seçicide kalıcı görünür. Listede olmayan bir şey gerekiyorsa **custom…** seçeneği serbest metin girişi açar (Enter kaydeder, Esc vazgeçer); klasörde zaten tam bir model id'si yazılıysa o da listede korunur. Seçim ajanın `.claude/settings.local.json` dosyasındaki `model` anahtarına yazılır; **CLI default** seçmek anahtarı siler, claude'un kendi varsayılanı devreye girer. Tam model id'si gerekiyorsa dosyaya elle yazılabilir — kutu onu görüntüler ve bozmadan korur. Yeni ajanlar içinse `agentFarm.newAgentModel` ayarı (varsayılan **sonnet**) vardır: **New Agent** ile açılan her ajanın `settings.local.json`'ına bu model otomatik yazılır; boş bırakılırsa model yazılmaz.

**Oturum başlatma varsayılanları (3.24.0):** `agentFarm.launchDefaults` — her etkileşimli oturumun taşıdığı `model` · `effort` · `permissionMode` (Start, Continue ve Resume dahil); boş alan hiç bayrak üretmez, varsayılan `{}` ile davranış değişmez. `agentFarm.launchProfiles` ise adlı kurulumları tutar ("derin inceleme" = opus + xhigh + plan gibi) ve **Start Session…** launcher'ında listelenir. İkisi de Farm Settings'in **Core & Agents** bölümündedir — bkz. [Oturum Başlatma ve Denetim](#oturum-denetim).

**Makine-bağımsız store'lar ve yollar (2.76.0):** Eklentinin kalıcı dosyaları (`farm-tasks.json`, `missions.json`, görev tarih arşivi) git ile makineler arası taşınabilir: kayıt sırasında mutlak makine yolları `${claudeDir}` / `${globalStorage}` / `${home}` jetonlarına çevrilir, okunurken bu makinenin gerçek köklerine açılır. Jetonlardan önce yazılmış eski kayıtlardaki yabancı mutlak yollar (ör. başka makinenin `C:\Users\<ad>\.claude\...`'u) okunurken **kendiliğinden iyileşir** — `.claude` / `globalStorage` işaretinden sonrası bu makinenin köküne bağlanır; yalnız değeri komple yol olan alanlar iyileştirilir, düzyazı (prompt) asla bozulmaz. Ayrıca tüm klasör ayarları (`agentRoots`, `claudeDir`, `extraClaudeDirs`, `codexHome`, `geminiDir`, `autoReportFolder`, `digestTtsFolder`, `ingestFolders`) `%USERPROFILE%`, `${env:VAR}` ve `~` yazımını destekler — settings.json'ı git'le taşıyorsan makineye özel yol yazmak zorunda değilsin.

**Claude Code (claude CLI) bölümü (2.55.0):** aynı sayfa **claude'un kendi** `~/.claude/settings.json` dosyasını da düzenler — terminaldeki *"Set CLAUDE_CODE_USE_POWERSHELL_TOOL=1 …"* gibi ipuçlarının arkasındaki dosya. Açıklamalı seçilmiş katalog: varsayılan model, izin varsayılan modu, co-authored-by, transkript saklama süresi (`cleanupPeriodDays` — Agent Farm'ın arama ve analitiğinin ne kadar geriye görebildiğini sınırlar), output style ve bilinen env anahtarları (PowerShell tool önizlemesi, thinking/çıktı token tavanları, bash zaman aşımı, oto-güncelleme/telemetri kapatmaları). Bir değeri temizlemek anahtarı dosyadan siler — Claude'un kendi varsayılanı devreye girer. Geri kalan her şey kataloğun altındaki doğrulamalı **ham JSON editöründen** düzenlenir — bozuk JSON asla kaydedilmez, dosyanın yanında bir kerelik `.agentfarm-backup` kopyası tutulur. Değişiklikler **yeni** claude oturumlarına uygulanır.

### Referans tablosu

| Ayar | Varsayılan | Ne işe yarar |
| --- | --- | --- |
| `agentFarm.agentRoots` | `["D:/zone/agent/ajanlar"]` | Ajan klasörlerinin tarandığı kökler (bkz. Agent folders bölümü) |
| `agentFarm.excludeAgentDirs` | [] | Ajan gibi görünse de asla ajan sayılmayacak klasörler |
| `agentFarm.newAgentModel` | `sonnet` | New Agent ile açılan ajanın `settings.local.json`'ına yazılacak varsayılan model (boş = yazma) |
| `agentFarm.modelAliases` | `[haiku, sonnet, opus, fable]` | Model adı bilgi tabanın: bir kere ekle, her model seçicide kalıcı görünsün (2.78.0) |
| `agentFarm.claudeDir` | boş (`~/.claude`) | Claude Code veri dizini |
| `agentFarm.extraClaudeDirs` | [] | Diğer makinelerin senkronlu `.claude` klasörleri (`{name, dir}`) |
| `agentFarm.activeThresholdSeconds` | 150 | Bu süre içinde kaydı değişen oturum "aktif" sayılır |
| `agentFarm.staleMemoryDays` | 45 | Bayat hafıza eşiği |
| `agentFarm.contextBudgetTokens` | 8000 | Sabit bağlam yükü bütçesi |
| `agentFarm.windowTokenLimit` | 0 (kapalı) | 5 saatlik pencere limiti (yüzde çubuğu için) |
| `agentFarm.maxTranscriptMessages` | 1500 | Oturum görüntüleyicide gösterilen en fazla mesaj |
| `agentFarm.contextWindowTokens` | 0 (otomatik) | "Context now" tavanı. 0 = oturumun modelinden otomatik bulunur (bilinmeyen modelde yüzde gösterilmez); sabit tavan zorlamak için değer gir |
| `agentFarm.includeUnmatchedProjects` | false | Ajan köklerine eşleşmeyen oturumları da dahil et |
| `agentFarm.pricing` | yukarıdaki tablo | Model fiyat kuralları |
| `agentFarm.liveMonitor` | true | Canlı olay dinleyicisini çalıştır |
| `agentFarm.livePort` | 8377 | Dinleyici portu (değiştirince hook'ları yeniden kur) |
| `agentFarm.stuckThresholdSeconds` | 240 | Takılma eşiği |
| `agentFarm.notifyPermission` | true | İzin bekleme bildirimi |
| `agentFarm.notifyStuck` | true | Takılma bildirimi |
| `agentFarm.notifyTurnEnd` | false | Tur sonu bildirimi |
| `agentFarm.queueAutoAdvance` | false | Görev bitince sıradakini otomatik başlat |
| `agentFarm.taskExtraArgs` | boş | Görev komutlarına eklenen CLI argümanları (örn. `--model haiku`) |
| `agentFarm.judgeArgs` | haiku | Doğrulayıcı (hakem) çağrılarının CLI argümanları — ucuz model kalsın |
| `agentFarm.maxConcurrentTasks` | 2 | Filoda aynı anda koşan görev tavanı (0 = sınırsız) |
| `agentFarm.maxConcurrentPerAgent` | 1 | Ajan başına eşzamanlı görev tavanı |
| `agentFarm.quotaGuardPercent` | 0 (kapalı) | 5h penceresi bu doluluğa gelince otomatik işleri ertele |
| `agentFarm.outputsMaxMB` | 200 | Çıktı arşivi boyut tavanı |
| `agentFarm.notifyWebhookUrl` | boş | Bildirimlerin iletileceği webhook (n8n→Telegram vb.) |
| `agentFarm.notifyWebhookEvents` | hepsi | İletilecek olay türleri |
| `agentFarm.mediaAuthSecret` | FAL_KEY | Medya anahtarını tutan sır adı |
| `agentFarm.mediaPricing` | tablo | Medya maliyet tahmin kuralları (fal.ai'den doğrula) |
| `agentFarm.mediaBaseUrl` | boş | fal kuyruk adresi override (test/proxy) |
| `agentFarm.autoReport` | off | Otomatik filo raporu: off / daily / weekly |
| `agentFarm.autoReportFolder` | boş | Otomatik raporların yazılacağı klasör (vault) |
| `agentFarm.autoReportDays` | 7 | Otomatik raporun kapsadığı gün sayısı |
| `agentFarm.budgets` | {} | Ajan başına günlük USD bütçe; `"*"` = filo geneli |
| `agentFarm.trendAlertFactor` | 2 | Haftalık maliyet kat eşiği (0 = kapalı) |
| `agentFarm.autoReportIncludeOutputs` | true | Otomatik rapora görev çıktılarını ekle |
| `agentFarm.qualitySample` | off | Otomatik kalite örneklemesi: off / daily / weekly |
| `agentFarm.qualitySamplesPerAgent` | 2 | Örnekleme başına ajan başına puanlanacak oturum sayısı |
| `agentFarm.suggestScan` | off | Haftalık talimat önerisi taraması: off / weekly |
| `agentFarm.weeklySummary` | false | Haftada bir üç cümlelik akıllı filo özeti |
| `agentFarm.dailyDigest` | off | Günlük özet kartının webhook'a gönderileceği saat (örn. "21:30") |
| `agentFarm.dispatchRules` | [] | Dispatcher kuralları: regex → ajan (ilk eşleşen kazanır) |
| `agentFarm.dispatchClassifier` | true | Kural tutmazsa ucuz model ajan seçsin |
| `agentFarm.embeddingsProvider` | off | Semantik arama: gemini / openai (Ollama dahil) |
| `agentFarm.embeddingsModel` | boş (otomatik) | Embedding modeli |
| `agentFarm.embeddingsBaseUrl` | boş (otomatik) | Uç adresi override (Ollama: http://127.0.0.1:11434/v1) |
| `agentFarm.embeddingsSecret` | boş (otomatik) | Anahtarı tutan sır adı (GEMINI_API_KEY / OPENAI_API_KEY) |
| `agentFarm.semanticMaxSessions` | 300 | Semantik indeksin kapsadığı oturum sayısı |
| `agentFarm.browserAllowHosts` | [] | Tarayıcı adımları için global alan adı allowlist'i |
| `agentFarm.browserApproval` | ask | Tarayıcı adımı öncesi onay: ask / auto |
| `agentFarm.costAnomalyMinUsd` | 1 | Maliyet anomali dedektörü tabanı (USD); 0 kapatır |
| `agentFarm.agentRowCostUnit` | tokens | Agents görünümünde her ajan satırındaki günlük kullanım birimi: tokens / cost |
| `agentFarm.evalRunArgs` | --model haiku… | Eval koşularının CLI argümanları; boş = ajanın varsayılan modeli |
| `agentFarm.permissionLint` | true | İzin kurallarının guardrail denetimi (Insights) |
| `agentFarm.pulse` | off | Sentetik nabız kontrolü: off / nightly / weekly |
| `agentFarm.modelPolicy` | [] | Kural tabanlı model yönlendirme (source/agent/promptMatch → model) |
| `agentFarm.quotaDowngradePercent` | 0 | Pencere bu %'yi aşınca fabrika görevleri ucuz modele düşer |
| `agentFarm.quotaDowngradeModel` | haiku | Kota düşürmede zorlanan model |
| `agentFarm.cliProfiles` | [] | Alternatif CLI yürütücüleri ({prompt}/{args} şablonları) |
| `agentFarm.relayFeeds` | [] | Uzak makine canlı relay dosyaları ({name, file}) |
| `agentFarm.packGalleryRepos` | [] | Agentpack galeri kaynakları (git URL / yerel klasör) |
| `agentFarm.digestTtsModel` | boş | Sesli brifing için fal.ai TTS model kimliği |
| `agentFarm.digestTtsFolder` | boş | Brifing mp3'ünün düştüğü klasör (boş = autoReportFolder) |

## Komutlar

Tümü komut paletinde `Agent Farm:` önekiyle:

- **Open Dashboard** — genel pano
- **Open Guide** — bu belge
- **Refresh** — ajanları ve oturumları yeniden tara
- **New Agent** — şablondan yeni ajan iskeleti (CLAUDE.md + memory + .claude). **‼️ Ve artık köprüden de:** `agents.create` (name · mission · model · root — mission süs değildir, şablondaki "bu ajanın kimliğini anlat" yer tutucusunun yerine geçer; mission'sız açılan ajan, kimsenin dönüp doldurmadığı bir şablondur) · `agents.roots` (doğruladığı iki liste; böylece çağıran ne klasör ne model takma adı tahmin eder) · `agents.pack.import` (boş şablon yerine dışa aktarılmış bir `.afpack`'ten). Üçü de fleet sayfasının çağırdığı yazmanın aynısını çağırır.
- **Add Agent Root Folder** — yeni kök klasör ekle
- **Start Claude Session / Continue Latest Session** — ajan klasöründe terminal açıp `claude` başlatır (`agentFarm.launchDefaults` varsa onunla)
- **Start Session… (model · effort · permissions · first prompt)** `Ctrl+Alt+S` — launcher; bkz. [Oturum Başlatma ve Denetim](#oturum-denetim)
- **Quick Menu (everything, one key)** `Ctrl+Alt+F` — gruplu hızlı erişim listesi, her satır kendi kısayolunu yazar
- **Session Shelf… (pinned + recent)** `Ctrl+Alt+P` · **Pin / Unpin Session** · **Label Session…** — raf
- **Interrupt Session (send Esc)** `Ctrl+Alt+I` — çalışan turu durdurur, oturumu kapatmaz
- **Manage Projects… / Assign Agent to Project…** — proje ekseni ([Projeler, Portföy ve Kod Değişiklikleri](#projeler-portfoy))
- **Open Agent Portfolio** — filo tek ekranda (global nav'da **Agents**)
- **Open Web View…** — telefondan bakılan salt-okunur pano ([Dışarıdan Erişim](#disaridan-erisim))
- **Connect Telegram…** — sohbetten ajana mesaj, cevabı aynı iş parçacığına
- **Open Agent in New Window / Reveal in File Explorer**
- **Open Live Timeline** — kulvar görünümü (canlı gözlem)
- **Install Live Hooks / Remove Live Hooks** — canlı gözlem hook'larını kur/kaldır
- **Add Task / Add Scheduled Task** — görev kuyruğu ve zamanlama
- **Add Trigger** — olay tetikleyicisi (watch/hook/webhook); tetik satırında ▶ = elle ateşle
- **Open Task History** — aylık görev tarihçesi kayıtları
- **Set Secret… / Delete Secret… / List Secrets** — sır kasası
- **Add MCP Server… / Remove MCP Server** — MCP envanteri (Agents ağacındaki MCP bölümünden)
- **Add Skill… / Remove Skill** — skill envanteri (Agents ağacındaki Skills bölümünden; SKILL.md iskeleti kurar / yedekli siler)
- **Copy Skill to Agent… / Move Skill Between Agent/User Scope… / Reveal Skill Folder** — skill filo yönetimi (sağ tık)
- **Edit MCP Server… / Disable MCP Server / Enable MCP Server / Copy MCP Server to Agent…** — MCP yönetimi (sağ tık)
- **Open Capability Matrix (Skills × MCP × Agents)** — filonun yetenek ızgarası, kullanım yoğunluğu ve tek tıkla kopyalama
- **Open Backlog (the active project's standing pile of work)** — proje sayfasını doğrudan Backlog sekmesinde açar. Durum çubuğunu izler: bu pencerede hangi proje aktifse onu açar, aktif proje yoksa sorar — verdiğiniz cevap pencerenin aktif projesi olur, yani her basışta değil bir kez sorulur
- **Open Turns (every turn across the farm)** — çiftlik çapında kullanıcı turu başına bir satır ([Turlar Sayfası](#turlar-sayfasi))
- **Open Wiki (candidate pool + the vault’s own pages)** — aday havuzu ve kasa wiki’si yan yana ([Wiki Kokpiti](#wiki-kokpiti))
- **Copy Webhook URL** — webhook tetiğinin gizli adresi
- **Open Media Gallery** — üretilen medyalar (önizleme + Re-run/Vary)
- **New Recipe Workflow…** — hazır fabrika şablonları
- **New Multi-Agent Workflow… / Run Workflow** — çoklu-ajan zincirleri
- **Edit Step… / Add Step / Rename Workflow** — kurulu zinciri düzenleme
- **Missions / New Mission…** — dinamik orkestrasyon: lead ajan tur tur planlar, ekibe delege eder (bkz. [Missions](#missions))
- **Save as Template / New Task from Template** — görev şablonları
- **Open Task Output** — headless görev çıktı arşivi
- **Export as Windows Scheduled Task…** — VS Code'dan bağımsız zamanlama
- **Sync Shared Memory… / Apply Merged Memory** — kopya hafıza senkronizasyonu ve elle birleştirme
- **Export Fleet Report (Markdown)** — karşılaştırmalı filo raporu
- **Export Task Outputs Digest (Markdown)** — headless çıktıların toplu özeti
- **Quick Start (Hızlı Başlangıç)** — bu kılavuzun başlangıç bölümünü açar
- **Add Standing Duty / Add Duty from Template… / Edit Duty… / Copy Duty to Agent… / Automate Duty… / Move Duty Up-Down / Open DUTIES.md** — nöbet görevi yönetimi
- **New Memory File… / Archive Memory File / Copy Memory File to Agent… / Fix Memory Index… / Scan Memory Contradictions…** — hafıza yönetimi (frontmatter iskeleti + otomatik indeks satırı / yedekli arşivleme / tek-tık indeks onarımı / ucuz modelle çelişki taraması)
- **Open Memory Graph** — hafızanın [[wikilink]] dokusu: hub'lar, adalar, kırık hedefler, recall renklendirmesi
- **Search Transcripts…** — tüm oturum kayıtlarında metin/regex arama
- **Sample Output Quality Now** — kalite karnesi için elle örnekleme (ucuz model)
- **Scan for Instruction Suggestions… / Review Instruction Suggestions…** — düzeltme kalıplarından CLAUDE.md kuralı önerisi ve onaylı uygulama
- **Generate Weekly Summary Now** — üç cümlelik akıllı filo özeti (ucuz model)
- **Send Daily Digest Now** — günlük özet kartını webhook'a/bildirime gönder
- **Export Agent Pack… / Import Agent Pack…** — ajanı tek dosyayla taşı/paylaş (hafıza ve sırlar hariç)
- **Sync Agent with the Other Engines…** — AGENTS.md + workflow üretimi ve iki yönlü fark senkronu
- **Natural Language Command…** — cümleden onaylı görev/zamanlama/zincir kurulumu (ucuz model)
- **Test Dispatcher…** — bir metni dispatcher kimin alacağını göster
- **Build Semantic Index** — anlamsal arama için oturum vektör indeksini kur/tazele
- **Open Ultra Roadmap (Ultra Gelişim)** — araştırma temelli ikinci nesil yol haritası
- **Open Needs You (Approval Queue)** — sana gelen her şey tek aciliyet sıralı kuyrukta
- **Open Task Board (Kanban)** — sürükle-bırak görev panosu + komuta çubuğu
- **Cost Anomaly Report** — medyan+MAD anomali tablosu ve ağır toplar raporu
- **Add Eval Case… / Run Eval Set… / Review Eval Cases…** — kötü izlerden regresyon seti kur ve koş
- **Run Pulse Check Now** — tüm ajanlara sentetik nabız (ucuz model + ucuz hakem)
- **Trigger Reliability Report** — tetik güvenilirlik tablosu (ateşlenme, ✓/✗, gecikme)
- **Install / Remove Headless Service (Windows), Headless Service Status** — VS Code kapalıyken zamanlama/watch tetiklerini işleten yerel servis
- **Instruction History & Impact…** — CLAUDE.md sürüm tarihçesi + kalite/maliyet korelasyonu
- **A/B Instruction Experiment…** — iki talimat varyantını aynı istemlerle yarıştır, kazananı uygula
- **Distill Memory File…** — şişmiş/bayat hafıza dosyasına ucuz modelle yoğunlaştırma taslağı (diff + onay)
- **Ask Fleet Memory… (Semantic)** — "filo bu konuda ne biliyor?" — memory dosyalarında anlamsal arama
- **Run Parallel Worktrees… / Worktree Runs…** — çakışmasız paralel kod koşuları + merge/discard yönetimi
- **Export Traces (OpenTelemetry JSON)…** — oturumlar OTLP span'leri olarak dışarı
- **Browse Agent Pack Gallery…** — git/klasör kaynaklı paket galerisinden içe aktar
- **Speak Daily Briefing (TTS)** — günlük özeti fal.ai TTS ile mp3'e seslendir
- **Save Relay Script for Another Machine…** — uzak makine canlı relay script'i

## Veri ve Gizlilik

- **Telemetri yok.** Eklenti hiçbir veri toplamaz, hiçbir yere raporlamaz.
- **Kendi başına ağ isteği yapmaz.** Ağa çıkan yalnızca senin yapılandırdıkların: medya üretimi (fal.ai anahtarınla), webhook iletimi (senin URL'lerin) ve senin başlattığın `claude` koşuları. Canlı olay dinleyicisi yalnızca `127.0.0.1`'e bağlanır.
- **Sırlar** OS anahtarlığında (SecretStorage) yaşar — dosyalara yazılmaz, ajan paketlerine girmez.
- Oturum kayıtlarını Claude Code zaten tutuyor; Agent Farm onları yalnızca okur. Yazdığı yerler hep senin onayınla ve bellidir: yeni ajan iskeleti, hook kurulumu (yedekli), DUTIES.md, rapor/paket dosyaları.
- Ajan eşleştirme kuralı: oturumun çalışma dizini (`cwd`) bir ajan klasörünün altındaysa o ajana sayılır. Kökler dışındaki projeler varsayılan olarak kapsam dışıdır.

## SSS

**Ajanım listede yok.** Klasöründe `CLAUDE.md` (ya da `.claude` / `memory/`) var mı? Farm Settings → **Agent folders** bölümüne bak: kökü listede mi, klasör orada dışlanmış mı, kök missing/duplicate olarak mı işaretli? Sonra **Refresh**.

**Bir klasör ajan olarak görünüyor ama ajan değil.** Farm Settings → **Agent folders**'ta o klasöre **Exclude** de. Not: alt klasörleri ajan olan bir kök hiçbir zaman kendisi ajan olarak görünmez — `CLAUDE.md`'si ortak talimat (yuva) sayılır.

**Maliyetler 0 görünüyor.** Model, fiyat kurallarından hiçbiriyle eşleşmemiş olabilir — Dashboard'un altındaki uyarıya bak ve `agentFarm.pricing`'e kural ekle.

**"ACTIVE" hiç yanmıyor.** Aktiflik, transcript dosyasının son değişme zamanına bakar. Oturum başka makinede/dizinde çalışıyorsa görünmez. Eşiği `activeThresholdSeconds` ile genişletebilirsin.

**Rakamlar ccusage ile birebir aynı değil.** Yuvarlama ve pencere tanımı farkları normaldir; büyük resim aynıdır.

**Subagent (sub rozetli) oturumlar ne?** Ana oturumun yan görevleri (sidechain). Maliyetleri ayrı satır olarak görünür ki nereye token gittiğini görebil.

**Timeline boş, "No live events yet" diyor.** Üç sebep olabilir: (1) hook'lar kurulmadı — **Install Live Hooks** çalıştır; (2) hook'lar kuruldu ama açık claude oturumları yeniden başlatılmadı; (3) dinleyici portu başka pencere tarafından tutuluyor — başlıktaki duruma bak.

**Live Feed ile Timeline farkı ne?** İkisi de canlı olayları gösterir; Feed liste halinde yan panelde, Timeline zaman ekseninde kulvarlarla. Hook'lar yokken Feed, oturum kayıtlarından türetilmiş (birkaç saniye gecikmeli) olaylara döner.

**Zamanlanmış görev saatinde çalışmadı.** VS Code o saatte açık mıydı? Zamanlayıcı yalnızca VS Code açıkken işler. Ayrıca prompt'un içindeki çift tırnaklar tek tırnağa çevrilir — komut satırı güvenliği için.

**Görev bitti ama "running" görünüyor.** Terminal hâlâ açık olabilir; terminali kapat veya ✓ ile elle tamamla. Shell integration açıksa (VS Code varsayılanı) komut bitiminde otomatik işaretlenir.

**Senkronda yanlış kaynağı seçtim.** Üzerine yazılan her dosyanın yanında zaman damgalı `.afbak` yedeği durur — içeriği geri kopyala.

**Workflow adımı takıldı / zincir ilerlemiyor.** Adım "done" olmadan sonraki başlamaz. Interactive adımda terminali kapatman gerekir; headless adımda `claude` çıkış kodunu bekler. Zincir failed ile durduysa bildirimde hangi adım olduğu yazar; görevi düzeltip workflow'u yeniden çalıştır.

**Headless görev başlamadı / anında failed oldu.** `claude` PATH'te mi? Çıktı dosyasını aç (Open Task Output) — spawn hatası ve stderr orada görünür.

**runIf koşulum hiç tutmuyor.** Desen, önceki adımın **çıktı dosyası içeriğine** karşı büyük/küçük harf duyarsız test edilir. İlk adımda önceki çıktı olmadığından ilk adıma runIf koyma (wizard zaten sormaz). Interactive adımların çıktısı arşivlenmediği için sonraki adımın runIf'i eşleşmez — koşullu zincirlerde headless kullan.

**Bütçe bildirimi tekrar tekrar gelir mi?** Hayır — ajan başına günde bir kez. Insights'ta durum sürekli görünür.

**Ajan nöbet görevlerine bakmıyor.** İki şart var: (1) CLAUDE.md'de DUTIES.md referansı olmalı (Insights uyarır, ekleme sihirbazı önerir); (2) ajanın açık bir oturumu olmalı — nöbet görevleri ajan çalışırken işler. Oturum açıkken de aksıyorsa CLAUDE.md'deki yönergeyi güçlendir ("her turun sonunda DUTIES.md kontrolünü raporla" gibi).

**DUTIES.md'yi elle düzenledim, panel bozulur mu?** Hayır — biçim satırlarını (`## Başlık [kadans]`, `- **Watch:**`, `- **Do:**`) koruduğun sürece panel elle eklediğin her şeyi tanır ve yeniden yazımlarda korur.

## Yol Haritası

Tamamlanan fazlar (hepsi 2026-07-08):

- ~~**Faz 2 — Canlı gözlem**~~ ✅ 0.2.0 · ~~**Faz 3 — Koordinasyon**~~ ✅ 0.3.0 · ~~**Faz 4 — Otomasyon**~~ ✅ 0.4.0 · ~~**Faz 5 — Zekâ**~~ ✅ 0.5.0 · ~~**Faz 6 — Nöbet**~~ ✅ 0.6.0 · ~~**Faz 7 — Cila**~~ ✅ 0.7.x (+ gerçek test kampanyası)

**Bundan sonrası ayrı ve ayrıntılı bir belgede yaşıyor:** komut paletinden **Agent Farm: Open Development Plan** — uzak görüşlü gelişim planı: olay tetikleyicileri, doğrulayıcı adımlar, MCP paneli, n8n/webhook köprüsü, multimedya üretim hattı (Kling/Seedance/Nano Banana sınıfı modellerle içerik fabrikası), zeki gözetim, çoklu makine ve vizyoner ufuk. Kodlama o plandaki öncelik sırasını izler.

## Sürüm Notları

### 3.646.0 — 3.654.0 — OpenCode Kilit Yarışı Kurtarması, Muhakeme Varyantları, Wiki Kategori Birleştirme ve Tam Bildirim Dönüşümü (2026-09-23 — 2026-09-24)

- **OpenCode Başlangıç Kilit Yarışı Otomatik Yeniden Denemesi (3.654.0):** Aynı saniye içinde başlayan iki OpenCode oturumunun ilk kullanım SQLite göçünde (`CREATE TABLE ...` / `database is locked`) çökmesi engellendi. İlk saniyelerde bu hatayla düşen oturumlar 2 saniye sonra otomatik olarak bir kez daha denenir.
- **Kesintisiz İnceleme Panelleri ve Yeniden Çizim İyileştirmeleri (3.652.0 — 3.653.0):** Konsol şeridindeki arka plan paneli ve Canlı Zaman Çizelgesi hover panellerinin her 120ms'lik yeniden çizimde kaybolması ve titremesi engellendi; şeritler kararmadan anında ve 200ms içinde açılır.
- **Oturum Listesinde Röle Rozeti (3.651.0):** Sol oturum listesindeki kartlara aktif baton etabını gösteren `⑂ N` rozeti eklendi; üzerine gelindiğinde zincir, halef ve fren detayları gösterilir.
- **Arama Şardı Bütünlüğü (3.650.0):** Transkript değişikliklerinde eski şardların asenkron silinirken yeni yazılan şardları ezmesi önlendi; arama indeksleme hızı kararlı hale getirildi.
- **Telefondan Canlı Konsol Başlatma (3.649.0):** Telegram üzerinden `/new <ajan> [prompt]` komutuyla doğrudan gerçek bir Konsol oturumu açma kapısı eklendi; oturum kartları sohbete akar, telefondan yönlendirilebilir (`steer`) ve günlük bütçe tavanı (`maxDailyUSD`) ile korunur.
- **Wiki Kategori Yeniden Adlandırma ve Çatışmasız Birleştirme (3.648.0):** Kök klasör, `index.md` başlığı ve aday havuzu konuları tek hamlede taşınır; hedef isim zaten varsa sayfalar çatışma kontrolünden geçirilerek güvenle birleştirilir.
- **OpenCode Muhakeme Seviyeleri (3.647.0):** Modelin kendi yayımladığı muhakeme varyantları (`--variant`: low, medium, high vb.) headless görev formunda seçilebilir hale getirildi; modelin desteklemediği seviyeler başlatma anında reddedilir.
- **Tam Bildirim Kuyruk Dönüşümü (3.646.0):** Bir bildirimi görev kuyruğuna taşırken yalnızca başlık değil; tüm gövde, soru seçenekleri, bölümler, rapor yolu ve soruyu soran ajan eksiksiz korunur (`▸ Original`).

### 3.633.0 — 3.645.0 — Arka Plan Komutunda Bekleme Durumu (waiting-task), A2A Baton Kartları ve Obsidian Sözdizimi Koruması (2026-09-22 — 2026-09-23)

- **Arka Plan Komutunda Bekleme ve Mor Kart (3.644.0):** Bir tur arkasında çalışan bir kabuk komutu bıraktığında, oturum durumu sarı "Sıra Sizde" yerine mor renkli `waiting-task` durumuna geçer. Rozetinde `BACKGROUND` yazar, 4.2 saniyelik yavaş bir nefes animasyonu çalışır ve yanıltıcı bildirim zili çalmaz. Kompozitör `Steer` moduna geçer.
- **A2A Panosunda Baton Handovers ve Temizlik Politikası (3.633.0 — 3.635.0):** Baton rölesi devirleri A2A panosuna `category: 'baton'` olarak asılır; halef oturum başladığı anda otomatik çözülür. 📌 Pinli kartlar otomatik temizlikten muaf tutulur; biten zincirlerin kartları 24 saat sonra temizlenir.
- **Konsol Durum Şeridi Minimalizmi (3.632.0):** Durum şeridi tek bir sakin çizgiye kavuşturuldu; limit sinyalleri 6px noktalara (`.sigdot`), eylemler kompakt çiplere dönüştürüldü.
- **Backlog İkon Sözdizimi Koruması (3.630.0):** Obsidian Tasks metadataları (`📅`, `⏳`, `⛔`, `🆔`) yalnızca kendi katı formatındaki değerleri tüketir; tarihsiz veya yalın ikonların kullanıcının başlık kelimelerini yutması engellendi.
- **A2A Süpervizör Kokpiti ve Run Now (3.604.0):** Her A2A kartının altında doğrudan süpervizör direktifi verme, işi başka uzmana devretme (`Re-route`) ve tek tıkla yeni Konsol açarak görevi derhal çalıştırma (`Run Now`) kontrolleri sunuldu.

### 3.620.0 — 3.632.0 — Baton Rölesi, Markdown Dışa Aktarma ve Sıfır Parite Açığı Garantisi (2026-09-21 — 2026-09-22)

- **Baton Rölesi Çekirdeği ve Otonom Bayrak Devri (3.620.0):** Limitlere yaklaşan oturumların halefine talimat bırakarak temizce devretmesini sağlayan `baton.pass` operasyonu ve otomatik devir çarkı devreye alındı.
- **Röle Başlatma ve Yönetim Kontrolleri:** Kompozitörde `⑂ Relay` anahtarı, Tasks formunda `⑂ Relay` kutusu, canlı oturumda `⑂+ Attach relay`, anında devir için `⑂→ Pass now`, zinciri durdurmak için `✕⑂ Stop chain`.
- **Dörtlü Emniyet Kilidi:** Etap tavanı (`maxHops`), arka arkaya commit üretmeyen zincirleri durduran kısır zincir freni (`barren chain brake`), çöken veya kaza yapan oturumları kurtaran `EMERGENCY HANDOVER` mekanizması ve sahipsiz konsol kartlarının otomatik kapatılması.
- **Markdown Dışa Aktarım Operasyonları (3.627.0 — 3.628.0):** Görev panosu (`tasks.export`), konuşma turları (`turns.export`), analitik raporları (`tasks.analytics.export`) ve oturum dışa aktarımı (`sessions.export`) ortak tablo inşa çekirdeği (`mdTable`) üzerinden köprüye bağlandı.
- **Sıfır Parite Açığı (3.629.0):** Arayüzdeki tüm buton ve aksiyonlar köprü operasyonları ile birebir eşitlendi; parite bütçesi sıfırlandı (`gapBudget: 0`). Terminal onarımı, çalışma örnekleri ve dışa aktarım komutları köprüye eklendi.

### 3.605.0 — 3.619.0 — Otomatik Soru Çözümleyici, Oturum Kimliği Çözümleme ve A2A Eşleştirme Motoru (2026-09-21)

- **Otomatik Soru Çözümleyici (3.618.0):** AskUserQuestion ile bekleyen gözetimsiz oturumlarda süre dolduğunda (varsayılan 300 sn) ajanın önerdiği veya ilk seçeneğin otomatik seçilmesi sağlandı; yıkıcı eylem içeren sorularda otomatik seçim mimari olarak durdurulur.
- **Kanıta Dayalı Oturum Tespiti (`sessions.whoami` - 3.619.0):** Çağıran ajanın hangi oturumda çalıştığı çalışma klasöründen tahmin edilmek yerine; açık argüman, ortam değişkeni ve canlı süreç kayıt defteri taranarak kanıtla belirlenir.
- **A2A Eşleştirme Motoru (3.603.0):** Proje, rol, alt sistem, oturum ve yetenek eksenlerinde 5 boyutlu görev eşleme algoritması ve 2 saatlik intifa süresi (`grace window`) devreye girdi.
- **Dört Sekmeli Ajan Gelen Kutusu (3.603.0):** Bildirimler, Görev Kuyruğu, A2A Notları ve A2A Görevleri ortak kart dilinde birleştirildi.

### 3.586.0 — 3.604.0 — A2A Protokolü, İnsan Süpervizör Direktifi ve Telegram Kokpiti (2026-09-20 — 2026-09-21)

- **A2A Protokolü Çekirdeği:** Ajanlar arası pasif bilgi notları (`a2a.notes.*`) ve 30 dakikalık kiralama süresiyle devralınan aktif görevler (`a2a.tasks.*`) ayrıştırıldı.
- **İnsan Süpervizör Direktifi (Supreme Override):** Kullanıcının verdiği yönlendirme (`steer`), veto (`veto`) veya kısıtlama (`constraint`) direktifleri sistemdeki tüm anayasa kurallarının üstünde en yüksek öncelik olarak kabul edildi; yanıtlarda birinci anahtar olarak dönüldü.
- **Döngü Koruması (Loop Guard):** Ajanlar arası görev paslaşmalarında 3. ardışık devir mekanik olarak engellenerek görev kilitlendi (`blocked`).
- **Telegram İki Yönlü Kokpit ve QR Sunucu:** Cep telefonundan soru yanıtlama, canlı onay kapıları, oturum odaklama ve yerel ağ web sunucusu (port 8378) devreye alındı.

### 3.570.0 — 3.585.0 — Ayrı Hesaplar Sayfası, Antigravity Kotaları ve Çoklu Kota Grafikleri (2026-09-19 — 2026-09-20)

- **Ayrı Hesaplar Sayfası (3.583.0):** Hesap yönetimi Engines panelinden bağımsız, kendi müstakil sayfasına (`agentfarm.openAccounts`) kavuştu.
- **Antigravity Kota Okuma (3.580.0):** Antigravity motorunun kullanım verileri doğrudan yerel `/usage` uç noktasından okunarak takip edildi.
- **Birleşik Kota Grafikleri (3.572.0):** Hesap kartlarında 5 saatlik ve haftalık kota pencereleri tek bir görsel grafikte birleştirildi.
- **Sınırda Hesap Tercihi (3.570.0):** Kotası tükenen bir oturumun hangi hesapla devam edeceği kullanıcı tercihine bağlandı.

### 3.548.0 — 3.569.0 — Çoklu Sağlayıcı Rota Mimarisi, Bağlam Tavanı ve Güvenlik Sınırları (2026-09-18 — 2026-09-19)

- **Sağlayıcı Ayrımı ve Kota Pencereleri:** Kimi, MiniMax ve Claude üzerinden koşan işlerin farklı hesap pencerelerine yazılması ve karışık maliyetlerin (`mixed`) raporda şeffafça ayrıştırılması sağlandı.
- **Model Bağlam Tavanı Tespiti (3.564.0 — 3.566.0):** Konsol kartında modelin yayımladığı gerçek bağlam tavanı canlı olarak gösterilmeye başlandı.
- **Oturum Kartlarında Sabit Yükseklik (3.553.0):** Konuşma uzadıkça ve loglar aktıkça kartların ekranda zıplaması önlendi.
- **Rota Filtreleme (3.569.0):** Oturum listelerinde motora ek olarak sağlayıcı rotası bazında filtreleme eklendi.

### 3.532.0 — 3.547.0 — Köprü Disk Araması Koruması, Bağlam Disiplini Sinyalleri ve Devirden Devam Etme (2026-09-17 — 2026-09-18)

- **Köprü Arama Koruyucusu (`bridgeGuard` - 3.541.0 — 3.542.0):** Oturum kimliklerinin diskte `grep`/`find` ile aranması `PreToolUse` kancasında engellendi; ajana tek satırda köprü komutları gösterildi (`af:allow-id` kaçış kapısı ile).
- **Canlı Bağlam ve Kota Disiplini Sinyalleri (3.538.0 — 3.540.0):** Canlı kanca üzerinden %35 bağlamda toparlanma (`CONVERGE`), %40 bağlam veya %90 5 saatlik kotada devir (`HANDOVER`) fısıltısı enjekte edildi; devir emri alan oturumun yeniden başlatılmasında temiz oturum kuralı getirildi.
- **Devir Notundan Devam Et (`Continue from Handover` - 3.544.0):** Durdurulan oturum kartında tek tıkla devir notu içeriğiyle taze bir kompozitör oturumu açılması sağlandı (`↪`).
- **Tüm Motorlar İçin Transkript Okuyucu (`sessions.read` - 3.536.0):** Tüm CLI motorlarının konuşma adımları ortak bir modelde köprüye açıldı.
- **Bağımsız Kota Nabzı (3.532.0):** Her hesap kendi periyodunda arka planda kota okuyarak ağ çakışmalarını önledi.

### 3.531.0 — X-324 / X-106: Özel Hesap Politikalarında Strateji Seçici (Zincirleme vs. En Boş Havuz) ve Konsol Görevlerinde Lansman Boyutları (2026-09-17)

- **Temel Geliştirme (X-324):** Kullanıcı tanımlı akıllı hesap politikalarına `strategy: 'chain' | 'emptiest'` boyutu eklendi. Önceden kurallar yalnızca katı bir adımlama zinciri (`chain`) olarak çalışıyordu ve sıradaki hesap duvara çarpmadıkça yük sonraki hesaplara dağıtılamıyordu. Artık kural kartında `emptiest` stratejisi seçildiğinde, listelenen hesaplar kendi özel havuzunu oluşturur ve başlatma anında ölçülen kullanım verilerine göre en boş olanı (`roomOrder`) seçilerek oturum başlatılır.
- **Biçim Kilidi (Shape Lock - X-324):** Başka bir kuralı adım olarak içeren kurallar (`rule step`), tekil bir kota metriğine indirgenemeyeceği için sistem tarafından otomatik olarak `chain` modunda kilitlenir; Engines arayüzünde `locked` rozeti ve AFTip açıklaması ile korunur.
- **Konsol Görevlerinde Boyut Korunumu (X-106):** Görev kuyruğundan Konsol modunda başlatılan (`interactiveTarget: 'console'`) işlerde `providerId`, `tier`, `account` (tek seferlik `launchAccountFor` çözümü) ve `superpowers` boyutlarının kapıda düşmesi engellendi; `runExtras(task)` ile tam `RunDimensions` matrisi Konsol hostuna aktarıldı.

### 3.529.0 — 3.530.0 — X-309 / X-321 / X-322 / X-323: Üçüncü Nöbet Tatbikatı, Oturum Kimliği Ön-Tahsisi ve Uyarı Bildirimleri (2026-09-17)

- **Oturum Kimliği Ön-Tahsisi (X-321):** Headless Claude oturumları `--session-id <uuid>` ile başlatılarak transkript dosyasının anında netleşmesi sağlandı; arka arkaya açılan nöbet turlarında 120 saniyelik tolerans kaynaklı transkript bağlama gecikmeleri ve belirsizlikleri ortadan kaldırıldı.
- **Devir Notu ve Kanıt Ayrıştırması (X-322):** Bir turun ürettiği her markdown dosyası körlemesine devir notu kabul edilmez; oturum kimliği veya açık devir deseni aranır. Ortak klasördeki ilgisiz devir notlarının nöbet promptunu şişirmesi tek satırlık özetle sınırlandı.
- **Kalem Kapatma Komut Enjeksiyonu (X-323):** Nöbet turlarına backlog kalemini kapatabilmesi için af.js köprüsünün tam yolu ve parametreleri (`node <af.js> projects.backlog.check ...`) kabuk komutu olarak açıkça enjekte edildi; modelin olmayan araçları araması engellendi.
- **Uyarı Bildirimi Tipi Düzeltmesi (X-309):** Nöbet freni ve lider durdurma olaylarının bildirim tipi geçersiz 'alert' yerine 'warning' olarak düzeltildi.

### 3.524.0 — 3.528.0 — X-309 / X-312 / X-318 / X-319 / X-320: Nöbet Tatbikatları, İlk Tur Kalem Enjeksiyonu ve Haftalık Kota Duvarı (2026-09-16)

- **İlk Tur Kalem Enjeksiyonu (X-320):** Kampanyanın açılış cümlesi ne olursa olsun, backlogdan alınan kalemin başlığı ve kodu ilk turun sistem promptuna (`withItemLine`) otomatik olarak enjekte edilir; ilk turun kör başlaması engellendi.
- **Boş Tur Sonrası Görev Aktarımı (X-319):** Önceki tur hiçbir ilerleme kaydetmeden kapandığında, sonraki tura kör bir 'devam et' yerine kalemin gerçek tanımı aktarılır.
- **Nöbet Yeniden Deneme İzolasyonu (X-312):** Nöbet turlarının retry mekanizması ana kullanıcı profiline kaçamaz, yalnızca kampanya havuzundaki hesaplar üzerinde döner.
- **Haftalık Kota Tavanı (Binding Bar - X-309):** Nöbet havuzu seçimlerinde 5 saatlik pencerenin yanı sıra 7 günlük haftalık kota tavanı (`seven_day`) bağlayıcı filtre yapıldı; haftalık limiti dolmuş hesaplar en boş sanılarak seçilmez.

### 3.520.0 — 3.523.0 — X-305: Akıllı Hesap Seçim Politikaları, Protokolleri ve Arayüz Düzenleyicisi (2026-09-15 — 2026-09-16)

- **Akıllı Hesap Politikaları Çekirdeği:** Çiftlik genelindeki `@standing`, `@emptiest`, `@round-robin` kurallarına ek olarak kullanıcının özel hesap zincirleri tanımlayabilmesi sağlandı (`agentFarm.accountPolicies`).
- **Lansman Anı Çözümleme (`launchAccountFor`):** Politika kuralları başlatma anında canlı kota okumalarıyla değerlendirilir; duvara çarpan hesaplar atlanır ve ilk uygun hesaba geçilir. Tüm hesaplar doluysa sistem ana hesabı harcamaz, gerekçeli bir red ile durur.
- **Engines Arayüzü ve Kural Düzenleyici:** Motorlar sayfasına hesap kurallarının görsel olarak yönetildiği, adımların sürüklenebildiği ve test edilebildiği dinamik Kural Kartları ve Zincir Editörü entegre edildi.
- **Köprü Desteği:** `policies.list`, `policies.save`, `policies.delete`, `policies.test` operasyonları köprüye eklendi.

### 3.513.0 — 3.517.0 — X-152: Kompozitör Mimari Sadeleştirmesi ve Tekil Host-Record Modeli (2026-09-15)

- **Host-Record Mimarisi:** Konsol kompozitörünün niyet ve durum yönetimi bütünüyle Extension Host tarafına taşındı. Webview katmanı saf bir görüntüleyici (`pure view`) haline getirildi.
- **IPC Trafiğinin Sadeleştirilmesi:** 16+ farklı parçalı durum güncelleme mesajı kaldırılarak tekil, senkronize durum yayını modeline geçildi; durum sızıntıları ve arayüz desenskronizasyonları tamamen önlendi.

### 3.510.0 — 3.512.0 — X-180 / K-40: Kayıtlı Kurulumlar (Saved Setups) ve Tek Tıkla Lansman (2026-09-14 — 2026-09-15)

- **Kayıtlı Kurulumlar Menüsü (X-180):** `Start Session…` butonu aradaki ajan seçim adımlarını atlayarak doğrudan kullanıcının Kayıtlı Kurulumlar listesiyle açılır; listeden bir profile tıklamak anında oturumu başlatır.
- **Varsayılan Dialog Modu (K-40):** Konsol kartları varsayılan olarak temiz Dialog görünümünde açılır; oturum bazlı filtre tercihleri host tarafında oturum kimliğine bağlı olarak saklanır.

### 3.500.0 — 3.509.0 — S-60 / S-62 / U-136 / X-307 / X-252 / X-258: Durdurma Emniyeti, Dar Panel Düzeni ve Maliyet Analitiği (2026-09-14)

- **Arka Plan Süreç Takibi ve Durdurma Emniyeti (S-62):** `Stop` (Interrupt) butonuna basıldığında turun başlattığı arka plan kabuk süreçleri de takip edilir ve yetim bildirimlerin yeni turlar tetiklemesi engellenir.
- **Dar Panel Uyumlu Responsive Düzen (U-136):** Dar kenar çubuklarında kompozitör kontrolleri taşma yapmadan kompakt kısa isimlere (`shorthand`) geçer.
- **Hesap Maliyet Analitiği (X-252):** Hesap kartlarında aylık ve oturum bazlı token harcamaları ve USD maliyet dökümleri gösterilir.
- **Canlı Hesap Sahipliği ve Kuyruk Göstergesi (X-258):** Hesap kartlarında o an hangi ajanın/oturumun çalıştığı ve sırada kimin beklediği gösterilir.
- **Antigravity İzin Modu Güvenliği (S-60):** Antigravity motorunda desteklenmeyen izin modları arayüzden filtrelenir.

### 3.460.0 — 3.499.0 — X-301 / X-302 / X-277 / S-53 / X-296 / S-63 / S-59 / X-268: Havuz Liderliği, Süreç İzolasyonu ve Hata Toleransı (2026-09-13 — 2026-09-14)

- **Nöbet Lider Turu Rezervasyonu (X-302):** Kampanya lider turları için kota ayrımı ve kesintisiz yürütme garantisi sağlandı.
- **Filo Komut Geçmişi (X-277):** Entegre terminal geçmişi hesap bazlı değil filo genelinde birleşik hale getirildi.
- **Kendi Kendini Onaran Slot Bakımı (X-301):** Arka plan bakım süreçlerinde slot bozulmaları otomatik tespit edilip onarılır.
- **Gerçek Aktif Tur Süresi Hesaplaması (S-53):** Oturum süresi açık kalma süresine değil, fiilen çalışan tur sürelerinin toplamına göre hesaplanır.
- **429 Hata Yönetimi ve Üstel Bekleme (S-63 / X-278):** API hız sınırları algılandığında akıllı bekleme süresi hesaplanır.
- **Sahipsiz Süreç Temizliği (S-59):** Arka planda başıboş kalan CLI süreçleri tespit edilip güvenle sonlandırılır.
- **Köprü Talep Ön-Tahsis Kilidi (X-268):** Köprü istekleri işlenmeden önce diske kilitlenerek zaman aşımı çakışmaları engellenir.

### 3.412.0 — 3.459.0 — X-230 / X-232 / X-217 / X-218 / X-226 / X-228 / X-229: Kendini Yenileme Köprüsü, Konsol Diriltme ve Lansman Boyutları (2026-09-06 — 2026-09-13)

- **Kendini Yenileme Köprüsü (X-230):** `farm.health`, `farm.restartExtensionHost`, `farm.reloadWindow` köprü operasyonları ile eklenti yeniden başlatma otomasyonu kuruldu.
- **Konsol Oturumu Diriltme (X-232):** Extension host yeniden başlatmalarında canlı Konsol oturumlarının transkript ve durumlarıyla birlikte yeniden dirilmesi (`resume`) sağlandı.
- **Tekil Hesap Seçim Rozetleri (X-217):** Hesap kartlarında karmaşık On/Off anahtarları kaldırılarak `🟢 standing` ve `⚡ Use this one` çipleri getirildi.
- **Tüm Motorlarda Tek Tıkla Kota Yenileme (X-218):** Accounts görünümü tepesinde tüm motorların kotalarını tek tıkla yenileyen birleşik buton eklendi.
- **İş Akışı Adım Kartlarında Lansman Boyutları (X-228):** İş akışı adımlarına model, efor, izin, rota ve tier boyutları eklendi.
- **Çok Turlu Oturumlarda Boyut Kalıtımı (X-229):** İkinci ve sonraki turların doğru hesap ve konfigürasyonla devam etmesi garanti altına alındı.

### 3.411.0 — X-218: Tüm Motorlarda Tek Tıkla Hesap Yenileme ve Ayrık Maliyet Modeli (2026-09-06)

- **Temel Geliştirme:** Accounts bolumunun tepesinde motor ayrimi yapmayan tek yenileme presti; disk okumalari aga cikanlarin arkasinda bekletilmiyor, sira hareket ederken butonun uzerinde ciziliyor
- **Teknik Detay ve Doğrulama:** touch · _stale_ — ÖLÇÜLDÜ, KODLANMADI (oturum sonu). Kalemin üç isteğinden İKİSİ ZATEN VAR: (a) Codex kartlarında tekil [⟳] butonu var — `media/engines.js` `refresh` (~satır 487), `quotaSource==='none'` dışındaki her kartta çiziliyor ve Codex için `session-tail` dalıyla DİSKTEN okuyor, AFTip'i 'no request, no queue, no waiting' diyor (X-215); (b) grup başlığında [⟳ all] butonu var — aynı dosya ~satır 595, `data-acrefreshall=<engine>`, ikiden fazla okunabilir hesap varken çiziliyor ve disk motorunda kuyruk vaadi ETMİYOR. EKSİK OLAN TEK ŞEY: Accounts bölümünün EN TEPESİNDE motor ayrımı yapmayan tek bir [⟳ Tüm Hesapları Yenile (All Engines)] butonu + kuyruğun ilerleyişinin görünürlüğü.
- **No new rule was written to keep them apart, because the split is already:** **there.** `queueAccountRefresh` reads a slot whose figure is on disk here and now and never puts it in the line (X-215). So the button hands every readable slot of every engine to the function that already knows the difference — `data-acrefreshall=""`, which means on this side exactly what `refreshableSlots('')` already means on the other — and spends its sentence saying which half of the press waits and which half does not.
- **The line is drawn moving:** A card knows its own place (X-206); the section knows how much of the line is left, so while it runs the button reads `◍ 3 in the line` and its panel opens with `3 in the line — 1 being read, 2 still waiting`. A press that acts over half a minute with nothing changing is one nobody presses once and everybody presses five times.

### 3.410.0 — X-232: Restart'tan Sağ Çıkan Konsol Oturumu (Resume) (2026-09-06)

- **Temel Geliştirme:** 232: restart'tan sağ çıkan Konsol oturumu (resume)
- **Teknik Detay ve Doğrulama:** _stale_ — Kapandı (v11.278 / 3.410.0). `farm.restartExtensionHost { resume: true }` ölmeden önce canlı Konsol oturumlarını X-230'un senkron damgasına yazıyor; uyanışta her satır motorun verdiği id'siyle, kendi koltuğunda, scrollback'i transkriptten okunmuş ve `carried` geri yüklenmiş olarak yeniden başlatılıyor. ‼️ SONRAKİ OKUYUCUYA DÖRT NOT: (1) resume yalnız sonrasını değil KARARI değiştiriyor — geri alınabilir oturum artık engel değil (`liveBlockers(world, kind, resume)`), motorun ad vermediği oturum hâlâ engel ve KAYIP olarak bildiriliyor; (2) taşınan satır `RunDimensions`'tan türetiliyor (`test_console_revive.js` kaynaktan okuyor) — oraya boyut eklenirse dirilen oturum onu taşımadıkça derleme düşer; (3) plan `consoleHost.start`'tan ÖNCE `clearRestartRevive()` ile tüketiliyor, yoksa sonraki her activate aynı oturumları yeniden doğurur; (4) ‼️ CANLI DOĞRULAMA HENÜZ YAPILMADI: bu op'ları taşıyan ilk yapı (3.408.0+) kurulu ama çalışan extension host hâlâ eski kod olduğu için köprüde `farm.*` opları yok; kullanıcının bir kerelik `Developer: Restart Extension Host` adımından sonra X-230 ve X-232 canlı denenmeli (tarif: devir notu §canlı doğrulama).
- **And a resume changes the decision, not just the aftermath:** A session that will be taken up again was never a reason to wait, so it stops being a blocker and the restart happens at once. A session the engine never NAMED still is one: there is nothing to resume it by, so it is reported as lost rather than quietly dropped — the reader saw a card there. A terminal is never saved by any of this, so a window reload still waits for the terminals.

### 3.409.0 — X-217: Hesap Kartlarında Tekil Seçim (Durum Rozeti + Eylem Çipi) (2026-09-06)

- **Temel Geliştirme:** 217: hesap kartlarında tekil seçim (durum rozeti + eylem çipi)
- **Teknik Detay ve Doğrulama:** _stale_ — Kapandı (v11.277 / 3.409.0). Hesap kartlarındaki On/Off anahtarı kaldırıldı: duran hesap `🟢 standing` DURUM rozeti taşıyor (basınca ana girişe dönüyor, `activeAccounts[engine]` temizleniyor), diğerleri `⚡ Use this one` EYLEM çipi taşıyor. Tek sınıf iki durum (`.acsel` / `.acsel.on`), `role="radio"` ve tam olarak bir `aria-checked="true"` — şekil, 'birini seçiyorsun' aritmetiğini piksele bakmayan okuyucuya da söylüyor.

### 3.408.0 — X-230: Kendini Yenileme Köprüsü (farm.health, restartExtensionHost, reloadWindow) (2026-09-06)

- **Temel Geliştirme:** 230: kendini yenileme köprüsü (farm.health · farm.restartExtensionHost · farm.reloadWindow)
- **Teknik Detay ve Doğrulama:** _stale_ — Kapandı (v11.276 / 3.408.0). Üç op — `farm.health` · `farm.restartExtensionHost` · `farm.reloadWindow` — ve kuralın yaşadığı saf çekirdek `src/core/selfRestart.ts`. ‼️ KALEMİN İLK HÂLİNDE OLMAYAN, ÖLÇÜLÜP EKLENEN İKİ KORUMA: (1) köprü yanıtı handler döndükten SONRA yazılıp istek ondan sonra siliniyor, dolayısıyla handler içinde host'u öldüren bir op kendi istek dosyası diskteyken ölür ve yeni host onu tekrar uygular — sonsuz açılış döngüsü; komut artık gecikmeli ateşleniyor (600 ms, cevabın yazıldığı boşluk) ve diske SENKRON yazılan damga 20 sn'lik pencerede ikinci restart'ı reddediyor, `force` bu korumayı AÇMIYOR; (2) Konsol oturumunun tutamağı extension host'un belleğinde olduğu için restart canlı olanların hepsini kaybeder, terminal ise pencerenin çocuğu olduğundan sağ çıkar — terminalde koşan ajan host'u kendi altından yeniden başlatıp doğrulayabilir, aynı çağrı Konsol oturumundan intihardır.
- **It never restarts inside the handler:** `processBridge` claims a request off the disk before dispatching it (X-268) and writes the response only after the handler returns — a handler that killed the host inside itself would therefore die with no answer ever written and its caller told nothing. The command is fired on a timer, inside the gap the response is written in, and a cooldown stamp written synchronously to disk refuses a second restart within 20 seconds. `force` does not open that guard: force is about sessions, the loop is about the bridge.
- **And it never destroys work silently:** A Console session is a spawned child whose handle lives in the extension host's memory, so a host restart loses every live one of them; an integrated terminal belongs to the window and survives — which is exactly why an agent working in a terminal can restart the host under itself and live to verify the result. So the default (`when: "auto"`) ARMS the restart and fires it by itself once the last session ends, and says in the same answer what it is waiting for.

### 3.407.0 — X-216: Aktif Hesap Kablolaması ve Gösterge Senkronizasyonu (2026-09-06)

- **Temel Geliştirme:** 216 aktif hesap kablolaması
- **Teknik Detay ve Doğrulama:** _no session_ · 2026-09-06 13:48 noticed · agent · **done** · _agent_ — KAPANDI (v11.275 / 3.407.0). Kalem iki iş öngörüyordu; ÖLÇÜLDÜĞÜNDE yalnızca biri kırıktı. (1) KIRIK OLAN: `usageProbe`'un `.codex/sessions` kökü sabitti (`agentFarm.codexHome` ya da `~/.codex`), yani aktif Codex hesabı seçmek figürün üstündeki BAŞLIĞI değiştiriyor, altındaki sayıyı değiştirmiyordu — bir kontrolün alabileceği en kötü şekil, çünkü işe yaramış gibi görünür.

### 3.406.0 — X-215: Codex Kota Entegrasyonu ve Boş Kart Onarımı (2026-09-06)

- **Temel Geliştirme:** 215 Codex kota entegrasyonu
- **Teknik Detay ve Doğrulama:** _no session_ · 2026-09-06 13:36 noticed · agent · **done** · _agent_ — KAPANDI (v11.274 / 3.406.0). Kalemin öngördüğü şekilde yapıldı: `QuotaSource`'a üçüncü dal (`{ kind: 'session-tail', dir: 'sessions' }`), Codex adapter'ı ona bağlandı, `AccountUsageService` bu dalda SLOTUN KENDİ dizinini okuyor. Tek ayrıştırıcı iki köke hizmet ediyor — `readCodexUsage(probe, mtimeOf, relDir?)` parametrelendi; durum çubuğu makinenin `~/.codex/sessions`'ını, kart kendi klasörünü istiyor (ikinci kopya yok).

### 3.405.0 — X-226: Üç Hesap Boştayken Erken Uyuma Hatasının Önlenmesi (2026-09-06)

- **Temel Geliştirme:** 226 hesap devri
- **Teknik Detay ve Doğrulama:** touch · _stale_ — ÖLÇÜLDÜ, KODLANMADI. `reseal` (`src/core/consolehost.ts:2468`) tam olarak Konsol biçimli: süreci kapatır, `awaitRelease(sessionId)` ile CLI kaydının serbest kalmasını bekler, sonra `start(...)` ile `--resume` üzerinden YENİ hesapta açar, kartın koltuğunu ve `carryOn(s)` ile toplamlarını korur. Tasks tarafında bunun karşılığı süreç öldürmek DEĞİL: çok turlu görevin TUR SINIRIDIR — X-229 düzeltilirken okundu, `next.resumeSessionId` ile aynı konuşmaya giren `addTask` çağrısı orada.

### 3.404.0 — X-225: Misyon Planlayıcı ve Delegelerde Hesap İzolasyonu (2026-09-06)

- **Temel Geliştirme:** 225: misyon planlayıcı ve delegelerde hesap izolasyonu (account · plannerAccount)
- **Teknik Detay ve Doğrulama:** touch · _stale_ — OLCULDU, KODLANMADI (kota penceresi). Plan dosya dosya: (1) src/launch/doors/mission.ts - account exempt kaldirilir, collect withAccount ile sarilir; bu tek basina test/test_launch_matrix.js:247 listesini de degistirir (mission exempt listesinden carried listesine gecer). (2) MissionTeamMember (src/core/missions.ts:125) ve MissionPoolMember (src/core/missionMode.ts:64) account?

### 3.403.0 — X-228: İş Akışı Adım Kartında Launch Boyutları (Motor, Model, Efor, İzin, Rota, Tier) (2026-09-06)

- **Temel Geliştirme:** 228: iş akışı adım kartında launch boyutları (motor · model · efor · izin · rota · tier)
- **Teknik Detay ve Doğrulama:** _no session_ · 2026-09-06 11:16 noticed · agent · **done** · _agent_ — KAPANDI (v11.270 / 3.403.0). Adım kartına engine · model · effort · permissions · route · tier satırı eklendi; rota/tier host tarafında da eksikti (stepSeed sproviderId/stier yaymıyordu, stepFromDraft okumuyordu) — ikisi de bağlandı, rotasız tier düşürülüyor (runExtras'ın bir kat aşağıda yaptığı reddin aynısı). X-149 tuzağına düşmemek için engine satırı, izin paragrafı ve rota/tier çifti ntEngineRow · ntPermTip · ntRouteRows olarak ortaklaştırıldı (eskiden görev formunun içine yazılıydı — ikinci yüzeyin kopyalayacağı yer tam orasıydı); daraltma stepNarrow ile tek kurala (afLaunch + ntNarrowRoute/ntNarrowAccount) soruluyor, adım başka motora taşınınca model/efor/rota/tier/hesap düşüyor.

### 3.402.1 — X-229: İkinci Turun Doğru Hesapla Konuşmaya Devam Etmesi (2026-09-06)

- **Temel Geliştirme:** 167 ROUND 2: hesap boyutu Tasks · otomasyon · iş akışı adımı · yeniden deneme · tur sınırı yollarında
- **Teknik Detay ve Doğrulama:** _stale_ — KAPANDI (v11.268 / 3.402.1). Tur sınırı artık `runExtras(task)` ile ŞEKİLLE taşıyor; turun kendi alanları (round · rounds=next.rest · roundsTotal · roundOf · resume · notBefore) sonrasına yazılıp kazanıyor, yani `rounds` hâlâ "söylenecek kalan" demek. Beş eksik kapandı: account · providerId · tier · finishSound · superpowers.

### 3.402.0 — X-227 / X-224: Yeniden Deneme ve Zincirlerde Hesap Boyutu Korunması (2026-09-06)

- **X-227 — the unattended retry was dropping seven dimensions, and this one was found by reading rather than reported:** There are two retries in the product. `retryTask`, the one a person presses, carries every dimension of the original across by hand and says why beside each: *"a retry that quietly moved to the agent's standing endpoint is a different run wearing the same name."* `maybeScheduleRetry` — the one that fires BY ITSELF when a run fails, typically at 03:00, with nobody at a window — had its own shorter hand-written list.
- **X-224 — a workflow step can be billed to its own sign-in:** A chain is the shape that needs this most: every step is headless, so three steps on one plan eat it and the chain hits the wall in the middle with nobody in front of it. `WorkflowStep extends RunDimensions` and `runExtras(step)` has always carried the account to the run — the step's two readings and its card were the only places that could not say it. `stepSeed` now returns it, `stepFromDraft` reads it, and the card asks for it with the same `[machine global]` row the task form got in 3.401.0. The fixture `tasks-step-account` draws the card that holds it, in both themes, because a card nobody photographs is a layout nobody checked.

### 3.401.0 — X-221 / X-222 / X-223: Tasks Formunda Hesap Alanı ve Otomasyon Entegrasyonu (2026-09-06)

- **X-169 put an account box on the Tasks form, seeded it, tested it against mock launch doors, and closed:** The box drew. The page posted the value. And `src/panels/tasksPanel.ts` never read the field: `task-new` carried nine dimensions to `addTask` and not that one, the retry branch carried eleven and not that one, and `dims()` — the automation path, the one that matters most because a schedule fires at 03:00 with nobody at a window — collected fifteen and not that one. Measured before the fix: the word `account` appeared **four times** in a 2,400-line panel, and none of the four was a wire.
- **The measurement that could not see it, and the one that now can:** The existing sweep (`test_task_seed.js`) pins one direction: every `RunDimensions` field comes back OUT of a stored task and into the form. The mirror was never stated — a dimension the form is SEEDED with is a dimension the form can be SAVED with — so a box could be alive, carry a value, and be dropped one line before the store with every test green. That return leg is now measured on all five readings (three save paths, two automation seeds), derived from `RunDimensions` in the source, so the next dimension somebody draws a box for fails until its wire is connected. When it was written it went red on exactly one name: `account`.
- **And the third answer reached the form (X-223):** X-211 gave the Console a `[💻 Machine Global]` row — not a fancier way of saying nothing, but the answer that *clears* the engine's config variable, which the VS Code window may itself be carrying. That row never came to the Tasks form, so the bridge could write `account: "@machine"` on a task and the form that edits the same task could not say it back. Two doors into one field, disagreeing about what the field can hold. The row is now on the form, and — the trap found while wiring it — it survives an engine change: a slot belongs to one engine and is narrowed away when the engine moves, but the machine's own sign-in belongs to none, and dropping it would have turned "run this as the machine itself" into "run it as whatever is standing" the moment somebody touched the engine box.

### 3.400.2 — Codex Kota Gerekçesi Düzeltmesi ve X-210 Ayrıştırması (2026-09-06)

- **Temel Geliştirme:** Codex kota gerekçesinin düzeltilmesi (yanlış cümle) + X-210'un altıya bölünmesi
- **A stated reason is a claim about the world, and a wrong one is worse than a blank bar: it closes the question:** The `kind` stays `none`, because the account cards genuinely are not wired to that reader yet — that is X-215, opened for it — but the sentence now says which of those two things is true, so the next person to read it is pointed at the work instead of away from it.

### 3.400.1 — X-203: Engines Düğmesi ve Toolbox Başlık Çubuğu İkinci Yol (2026-09-06)

- **Temel Geliştirme:** 203: Engines kapısı her durumda, Toolbox başlık çubuğunda ikinci yol
- **Teknik Detay ve Doğrulama:** _no session_ · 2026-09-06 03:53 noticed · agent · **done** · _agent_ — KAPANDI (v11.264 / 3.400.1). (1) `farmstatus.ts` Engines satırının `action`ı YALNIZCA `dormant` dalındaydı — yani makinede ikinci bir motor kurulur kurulmaz ya da diskte yabancı oturum bulunur bulunmaz satır `ready`/`active` oluyor ve buton tamamen kayboluyordu. Kapı, bakılacak hiçbir şeyi olmayan makineye sunuluyor, dört motoru ve 35 oturumu olan makineden geri çekiliyordu.
- **A row's action is a way to the SUBJECT of the row, not a fix-it prompt for a subsystem nobody switched on:** The action is now on the row in every state, under one label, because it is one door.
- **Second way in:** `agentfarm.openEngines` was in no `view/title` menu at all, so with the Dashboard button gone there was no click-path to the page. It sits in the Toolbox view's title bar now, beside Secrets — both are facts of the MACHINE (which CLIs are installed, which sign-ins are captured) rather than of the fleet, and the Agents title bar already carries eight doors. The alternative was the Agents bar, which is more prominent and more crowded; the Dashboard row is the prominent path and this is the standing one.

### 3.400.0 — X-207: Nöbet Hesap Rotasyon Havuzu (Whitelist) ve Çok Motorlu Yedekleme (2026-09-06)

- **Temel Geliştirme:** 207: nöbet hesap rotasyon havuzu (whitelist) ve çok motorlu yedekleme
- **Teknik Detay ve Doğrulama:** _no session_ · 2026-09-06 03:39 noticed · agent · **done** · _agent_ — KAPANDI (v11.263 / 3.400.0). Kampanyaya iki alan eklendi: `pool` (izin verilen hesaplar, kullanıcının seçtiği SIRAYLA — sıra, kademeli stratejinin önceliğidir) ve `rotation` (`free` varsayılan / `tiered`). İkisi de opsiyonel ve YOKLUĞU bugünkü davranıştır, yani diskteki her mevcut kayıt birebir eskisi gibi planlanır.

### 3.399.4 — Eklenti Başlatma (Activate) Duman Testi ve Kurtarma (2026-09-06)

- **Temel Geliştirme:** eklentiyi açılamaz hâlden kurtaran düzeltme + `activate()` duman testi
- **‼️ 3.399.0 through 3.399.3 DO NOT ACTIVATE:** Not a broken page — no pages. `activate()` threw on its first surface and every command in the product answered "command not found":
- **The root cause is one of position, and one line long:** X-212 (3.399.0) gave the status bar the words for WHOSE plan it is showing — `usageAccountLabel`, declared beside the indicator it serves and reading `storedAccounts` out of the accounts block 470 lines further down. Ordinarily that is fine: a closure is allowed to name a `const` declared after it, because by the time anybody calls it the declaration has run. `PlanUsageBar` is the case where nobody waits — it paints inside its own constructor, so the very first thing that happens after `new` is a call back into a binding still in its temporal dead zone. The two readers are declared at the top of `activate()` now, with the rule written where they sit: **anything constructed during activation may call its dependencies before its constructor returns, so a reader handed to one is declared first.**
- **‼️ AND THE PART THAT MATTERS MORE — 18 972 assertions could not see it:** The suite was green, the vsix verified 16/16, the package installed, and the product was dead. Every file in `test/` tested a piece; not one had ever called `activate()`. Being able to switch the extension on is the precondition of everything the other assertions describe, and it was the one claim nothing checked — a rule that fails silently is not a rule.

### 3.399.3 — X-196 (Bölüm 2): Yinelenen Satır Hover'larının Temizlenmesi (part 2): the hover that repeated the row (2026-09-06)

- **Temel Geliştirme:** 195 (nobet seffafligi) ve X-196 (arayuz supurgesi) kapandi
- **Teknik Detay ve Doğrulama:** _multi_ — KAPANDI - v11.260 + v11.261 (3.399.2 / 3.399.3, kuruldu). Itemin saydigi dort yuzey de denetlendi. DUZELTILENLER: (1) Missions Sentry durum rozeti - alti durum sozunun (OFF/PAUSED/STOPPED/RUNNING/SLEEPING/WAITING) hicbirinin paneli yoktu, WAITING ile SLEEPING bilmeyen icin ayni resimdi; her biri uzun hali + kampanyanin kendi rakamlariyla aciliyor, SLEEPING'de uyanma saati (ikisini ayiran tek olgu).

### 3.399.2 — X-196 (Bölüm 1): Nöbet Bloğu ve Hesap Kartları Arayüz Süpürgesi (part 1): the sweep reaches the sentry block and the account cards (2026-09-06)

- **Teknik Detay ve Doğrulama:** _multi_ — KAPANDI - v11.260 + v11.261 (3.399.2 / 3.399.3, kuruldu). Itemin saydigi dort yuzey de denetlendi. DUZELTILENLER: (1) Missions Sentry durum rozeti - alti durum sozunun (OFF/PAUSED/STOPPED/RUNNING/SLEEPING/WAITING) hicbirinin paneli yoktu, WAITING ile SLEEPING bilmeyen icin ayni resimdi; her biri uzun hali + kampanyanin kendi rakamlariyla aciliyor, SLEEPING'de uyanma saati (ikisini ayiran tek olgu).

### 3.399.1 — X-195: Devir Notu Kaynağı ve Açılış Şeffaflığı (2026-09-06)

- **Teknik Detay ve Doğrulama:** touch — Çekirdek parça yazıldı ve commit'lendi (v11.255): `src/core/sentryWhy.ts` — saf `roundWhy()` kaydı + `whyShorthand()` rozeti, 16 test. Üç şeyi çiviliyor: (a) `path` sözü verilen değil GERÇEKTEN sözcükleri kuran yol — lider verdict'i alıp turu zaman aşımına uğrarsa o tur ŞABLON turudur, ama uyandıran koşullar ve başarısız turun faturası yine taşınır; (b) `opening` promptun yalnız İLK SATIRI — tam metin zaten görev satırında, ikinci kopya bayatlayan kopyadır; (c) `problems` turla birlikte yolculuk eder, yargılanamayan koşul sessizce yok sayılmaz. Rozet üç durumlu: L (lider yazdı) · M (hiç sorulmadı) · M!

### 3.399.0 — X-211 Ailesi ve X-195: Her Turun Hangi Kelimelerle Açıldığını Açıklaması (2026-09-06)

- **Teknik Detay ve Doğrulama:** _stale_ — SEMSIYE KAPANDI (v11.257) - dort cocugu (X-212, X-213, X-214) tamamlandi. Ailenin cekirdek kavrami: bos hesap IKI ayri cevapti tek yuzle - 'kimse secmedi' (standing hesaba duser, dusmeli) ve 'makinenin kendisini sectim' (dusmemeli). Artik ayri degerler: MACHINE_ACCOUNT ('@machine', core/accountStore.ts).

### 3.398.0 — X-194: Nöbet Koşullarında Canlı Okuma, sentry.probe, VE Grupları ve Lider Kesesi (2026-09-05)

- **Temel Geliştirme:** 194 kapanışı: koşul satırlarında canlı okuma, sentry.probe, VE grupları, lider kesesi
- **Teknik Detay ve Doğrulama:** touch — HOST YARISI BİTTİ ve commit'lendi (v11.244 · paket 3.390.0 kuruldu ve doğrulandı) — kalem KAPANMADI, görünür yarısı duruyor. Yapılan: sentry.start ve Missions'ın kendi kapısı (extension.ts:15421) artık preset (mechanical|intelligent|hybrid) ve conditions alıyor; newSentry içindeki yeni policyOf() preseti sözlükten dolduruyor, elle verilen koşullar preseti yeniyor ve preset yanında saklanıyor (bir yüzey 'hybrid (edited)' diyebilsin diye); tanınmayan preset ADIYLA reddediliyor, sessizce mekanik olmuyor; hiç mod istenmemesi hiçbir policy yazmıyor (turun kendi varsayılanı var). Testler test_sentry_campaign.js içinde.

### 3.397.0 — X-194 (Bölüm 2): Nöbet Formuna Mod ve Koşul Seçicileri (part 2): the sentry form gets a mode and its conditions (2026-09-05)

- **Temel Geliştirme:** Devir notu — U-130/U-131 kapandı, X-194 yarıda (oturum 2280dda6)
- **Teknik Detay ve Doğrulama:** touch — HOST YARISI BİTTİ ve commit'lendi (v11.244 · paket 3.390.0 kuruldu ve doğrulandı) — kalem KAPANMADI, görünür yarısı duruyor. Yapılan: sentry.start ve Missions'ın kendi kapısı (extension.ts:15421) artık preset (mechanical|intelligent|hybrid) ve conditions alıyor; newSentry içindeki yeni policyOf() preseti sözlükten dolduruyor, elle verilen koşullar preseti yeniyor ve preset yanında saklanıyor (bir yüzey 'hybrid (edited)' diyebilsin diye); tanınmayan preset ADIYLA reddediliyor, sessizce mekanik olmuyor; hiç mod istenmemesi hiçbir policy yazmıyor (turun kendi varsayılanı var). Testler test_sentry_campaign.js içinde.

### 3.396.0 — U-131: Çoklu Filtrelerde Sağ Tık Önayar Anahtarı (Preset Toggle) (2026-09-05)

- **Temel Geliştirme:** seçenek hover borcu sıfır (U-130) + filtrede sağ tık anahtarı (U-131)
- **Teknik Detay ve Doğrulama:** touch · _stale_ — BAŞLANMADI, yalnızca yer tespit edildi (kota eşiği). ÖLÇÜLDÜ: Console'daki "Show" kutusu bir <select> DEĞİL — media/console.js:3559 içinde window.AFFilter.multi({ id: "c-kinds", label: "show", allLabel: "everything", options: KINDS, presets: [{ id: "dialog", label: "Dialog", values: ["agent","user"] }] }) ile çizilen paylaşılan bileşen. Yani sağ tık davranışı console.js'e DEĞİL, media/afFilters.js içindeki bileşene yazılmalı — orada `presets` zaten var (satır 209 tanım, 233 çizim, 407 tıklama bağlama) ve bileşen dokuz sayfada kullanılıyor, dolayısıyla kural bir kez yazılınca hepsinde çalışır.

### 3.395.0 — U-130: 2.205 Sessiz Açılır Kutu Seçeneğine Native Tooltip (Sıfır Borç Kapısı) (2026-09-05)

- **Teknik Detay ve Doğrulama:** touch — İlk dilim ödendi (v11.236 · paket 3.382.0 kuruldu ve doğrulandı): paylaşılan Sessions tablosunun sıralama kutusu. Tablo dört sayfada birden gömülü olduğu için tek düzeltme dördünü birden düşürdü — sessions 30→0, agentdetail 6→0, dashboard 39→33, planusage 156→132; filo toplamı 2291→2225 ve manifest yeni tabana kilitlendi. YÖNTEM (sonraki dilimler için aynen tekrarlanır): sayfanın <option> üretecini bul, seçeneğin KENDİ metnini title'ın ilk satırı yap, varsa açıklamayı boş satırdan sonra ekle — açıklama sütunun <th>'inde veya RANGE_TIP'te zaten söyleneni TEKRARLAMAMALI, o seçeneği seçmenin ne YAPTIĞINI söylemeli (ONE SUBJECT).

### 3.394.0 — X-197: Atomik Yazıcı ve Yeniden Denebilir Dosyalama (2026-09-05)

- **Temel Geliştirme:** Devir notu — X-204/X-205/X-206/X-197 kapandı, sıra U-130 ve U-131'de
- **Teknik Detay ve Doğrulama:** _stale_ — v11.248 · paket 3.394.0 kuruldu ve doğrulandı. Dört maddenin dördü de yapıldı. Asıl hasarın düşen yazma DEĞİL, çağıranın "reddedildi" ile "yarısı yazıldı"yı ayırt edememesi olduğu tespit edildi — yineleme tam oradan doğdu.

### 3.393.0 — X-206: Tüm Hesapların Sıralı ve Pencereli Okunması (2026-09-05)

- **Teknik Detay ve Doğrulama:** _stale_ — v11.247 · paket 3.393.0 kuruldu ve doğrulandı. Yedi maddenin yedisi de yapıldı. ‼️ "Hepsini yenile" bir PATLAMA değil, bir SIRA: accountUsage hâlâ refreshAll() kabul etmiyor (o metot zaten o modülün önlemek için var olduğu çarpım), yeni core/accountQueue.ts bir SIRA tutuyor ve aynı tekil kapıdan (AccountUsageService.refreshSlot — hedefini adıyla söylüyor, başka hiçbir şeyi değiştirmiyor) beş saniyede bir okuma başlatıyor.

### 3.392.0 — X-205: Duran Hesap Anahtarı ve Doğrudan Seçim (2026-09-05)

- **Teknik Detay ve Doğrulama:** _stale_ — v11.246 · paket 3.392.0 kuruldu ve doğrulandı. İki metin butonu ("Use next" / "Main account") tek bir kontrolün iki konumu oldu: gerçek bir on/off anahtarı. ON rengi, standing rozeti ile kartın sol çizgisinin zaten taşıdığı AYNI mavi — bir gerçek için bir renk, böylece kart sütunu etiket okumadan taranıyor.

### 3.391.0 — X-204: Süresi Dolan Token ile Çıkış Yapılmış Hesap Ayrımı (2026-09-05)

- **Teknik Detay ve Doğrulama:** _stale_ — v11.245 · paket 3.391.0 kuruldu ve doğrulandı. Alarm kozmetik değildi: 401 → `expired` → `slotIsUsable` false → hesap nöbetin filo listesinden de düşüyordu (extension.ts:23985, sentryWatch.ts:114). Yeni `core/oauthRefresh.ts` grant'ın kısa yarısını CLI ile aynı şekilde yeniliyor (uç nokta, client id ve gövde şekli kurulu CLI ikilisinden OKUNDU, uydurulmadı).

### 3.390.0 — X-194 (Kısım 1): Kampanyanın Belirli Mod ile Başlatılabilmesi (part): a campaign can be STARTED with a mode (2026-09-05)

- **Temel Geliştirme:** nöbet ailesi: talimat havuzu (X-192), Ayarlar ▸ Nöbet bölümü ve yol önizlemesi (X-193), kampanyanın modla başlatılabilmesi (X-194 host yarısı)
- **Teknik Detay ve Doğrulama:** touch — HOST YARISI BİTTİ ve commit'lendi (v11.244 · paket 3.390.0 kuruldu ve doğrulandı) — kalem KAPANMADI, görünür yarısı duruyor. Yapılan: sentry.start ve Missions'ın kendi kapısı (extension.ts:15421) artık preset (mechanical|intelligent|hybrid) ve conditions alıyor; newSentry içindeki yeni policyOf() preseti sözlükten dolduruyor, elle verilen koşullar preseti yeniyor ve preset yanında saklanıyor (bir yüzey 'hybrid (edited)' diyebilsin diye); tanınmayan preset ADIYLA reddediliyor, sessizce mekanik olmuyor; hiç mod istenmemesi hiçbir policy yazmıyor (turun kendi varsayılanı var). Testler test_sentry_campaign.js içinde.

### 3.389.0 — X-193: Ayarlar Sayfasına Nöbet Bölümü ve Yol Önizlemeleri (2026-09-05)

- **Teknik Detay ve Doğrulama:** **done** — v11.243 · paket 3.389.0 kuruldu ve doğrulandı. Nöbetin kendi ayar bölümü var: on üç ayar dört SORU altında gruplandı (devir notunu nerede arar · sonraki oturuma ne söyler · lider ne harcayabilir · bir tur ne zaman boşa gidiyor) ve gruplamanın tanımadığı anahtar 'More' altında yine çiziliyor — gruplama elle yazılmış editoryal bir karar, bayatlayacak, ama bir ayarı GİZLEMEYECEK. Her yol satırı altında çözülmüş GERÇEK yolu taşıyor; kurulamayan yol yol yerine nedeni taşıyor (yeni saf fonksiyon previewPathList, satır hizalı — resolvePathList bilerek değil).

### 3.388.0 — X-192: Tek Nöbet Talimat Havuzu ve Çift Okuma (2026-09-05)

- **Teknik Detay ve Doğrulama:** **done** — v11.242 · paket 3.388.0 kuruldu ve doğrulandı. Kayıtlı talimat havuzu artık gerçekten havuz: TEK KAYNAK, İKİ KULLANIM. Başlığı bir verdict adlandıran blok şablondur (mekanik tur doldurur), HER blok liderin harmanladığı malzemedir.

### 3.387.0 — X-191: Nöbet Lider Ajanı ve Çok Kaynaklı Devir Notu Keşfi (2026-09-05)

- **Temel Geliştirme:** nöbet lider ajanı ve çok kaynaklı devir notu keşfi
- **Teknik Detay ve Doğrulama:** **done** — Kapatıldı: core/sentryLeader.ts (saf; model bir PORT olarak enjekte ediliyor — 'ileride diğer motorlar için de aynı sistem' böylece ikinci bir port, ikinci bir tasarım değil). ALTI TASMA, her biri tasma olarak test edildi: lider yalnız koşul ateşleyince uyanır (rutin gece SIFIR maliyet ve runner'ın hiç çağrılmadığı ÖLÇÜLÜYOR) · varsayılan model haiku, tek yerde adlandırılmış · tur başına süre ve maliyet tavanı · kampanya başına GÜNLÜK bütçe (gece yarısı devrediyor) · her tur ModelAssist olarak kayda geçiyor (model, ms, $, ok) — K1'in asıl kusuru buydu, sentryStep'e artık assist geçiliyor · üst üste N hata modu mekaniğe düşürüyor ve SÖYLÜYOR. ‼️ HİÇBİRİ İŞİN FRENİ DEĞİL: bütçe bitti, fren attı, tur kesildi, cevap okunamadı, runner yok, runner fırlattı — her yol turu YİNE açıyor, şablonla, ve arızayı kaydediyor.

### 3.386.0 — X-189: Devir Notunun Gerçekten Yazıldığı Yerde Aranması (2026-09-05)

- **Teknik Detay ve Doğrulama:** **done** — Kapatıldı: yeni saf modül core/handoverDiscovery.ts. Dört kaynak sırayla (transcript > configured > projectNotes > fallback) ve puanlı ad eşleştirme; kanonik ad artık tercih edilir ama zorunlu değil. ŞARTNAMEDEN BİLİNÇLİ BİR AYRIM: kimlik (+3) ad içindeki oturum kimliği VEYA oturumun dosyayı kendisinin yazmış olmasıyla kanıtlanır — tek bileşen, iki kanıt, asla iki kez sayılmaz; ve kimlik puandan bağımsız bir TABANDIR, çünkü 'devir + bugün + kanonik' klasördeki her notu tanımlar ve başkasının notunu benimsemek hiç bulmamaktan kötüdür.

### 3.385.0 — X-190: Nöbet İlke ve Koşul Motoru (Üç Modun Tekilleştirilmesi) (2026-09-05)

- **Temel Geliştirme:** 167 kurtarma ilk dilim (X-187 canlı kota · X-188 yol değişkenleri · X-190 nöbet koşul motoru)
- **Teknik Detay ve Doğrulama:** **done** — core/sentryPolicy.ts kuruldu (saf: fs/vscode/model/saat yok). ANA KARAR: mekanik/akıllı/hibrit ÜÇ KOD YOLU DEĞİL, tek koşul kümesinin üç ÖN AYARI — mekanik=boş küme, akıllı=her tur ateşleyen küme, hibrit=kullanıcının kümesi. Böylece mekanik yol her hibrit turunda zaten koşuyor, testsiz çürüyemiyor.

### 3.384.0 — X-188: Nöbet Klasör Ayarları ve Yol Değişkenleri Çözücüsü (2026-09-05)

- **Teknik Detay ve Doğrulama:** **done** — core/pathVars.ts kuruldu (saf, fs/vscode/path yok) ve üç gömülü kişisel yol ona bağlandı. Sözdizimi — prompt şablonlarının {name} sözdiziminden KASITLI olarak ayrı, çünkü yol şablonu settings kutusuna yazılır ve orada zaten konuşuluyor; VS Code adları (userHome, workspaceFolder) takma ad olarak da çalışır. TEK YASA: çözülemeyen değişken yolu İPTAL EDER, boş dizeye çevirmez.

### 3.383.0 — X-187: Engines Sayfasında Canlı Kota Sorgulama (2026-09-05)

- **Teknik Detay ve Doğrulama:** **done** — Motorlar sayfası artık kotayı kendisi istiyor. Kök neden: AccountUsageService üç kapıyla (beat/readOnEdge/refresh) yazılmış ama yalnız bridge accounts.list yolu bağlanmıştı; sayfa ağa hiç dokunmayan current() değerini okuduğu için soğuk hostta her kart percent -1 / resetsAt 0 çiziyordu. Yapılan: EnginesPanel açılışta, revealde ve her hesap hareketinde (capture/activate/forget) readAccounts() çağırıp cevabı bekliyor ve sonra taze payload gönderiyor; sayfa için TEK zamanlayıcı (hesap başına değil), sekme gizliyken atlanıyor, kapanışta temizleniyor.

### 3.382.0 — U-130 (1/n): Sessions Tablosu Seçenek Hover Borcu Ödemesi (1/n): the sessions table pays its own hover debt (2026-09-05)

- **Temel Geliştirme:** 130 (1/n): Sessions tablosu hover borcunu ödedi (kuruldu ve doğrulandı)
- **Teknik Detay ve Doğrulama:** touch — İlk dilim ödendi (v11.236 · paket 3.382.0 kuruldu ve doğrulandı): paylaşılan Sessions tablosunun sıralama kutusu. Tablo dört sayfada birden gömülü olduğu için tek düzeltme dördünü birden düşürdü — sessions 30→0, agentdetail 6→0, dashboard 39→33, planusage 156→132; filo toplamı 2291→2225 ve manifest yeni tabana kilitlendi. YÖNTEM (sonraki dilimler için aynen tekrarlanır): sayfanın <option> üretecini bul, seçeneğin KENDİ metnini title'ın ilk satırı yap, varsa açıklamayı boş satırdan sonra ekle — açıklama sütunun <th>'inde veya RANGE_TIP'te zaten söyleneni TEKRARLAMAMALI, o seçeneği seçmenin ne YAPTIĞINI söylemeli (ONE SUBJECT).

### 3.381.0 — U-128: Dar Kutulardaki Seçeneklerin Kendi Adını Taşıması (2026-09-05)

- **Temel Geliştirme:** 128: seçenek hover'ları + ölçülen bütçe kapısı (kuruldu ve doğrulandı)
- **Teknik Detay ve Doğrulama:** **done** — Düzeltildi ve — asıl önemlisi — ÖLÇÜLDÜ (v11.235 · paket 3.381.0 kuruldu ve extensions.json ile doğrulandı). Haklıydınız ve rapor ettiğinizden daha kötüydü: eklentinin çizdiği 2.639 <option>'ın 2.291'i hiçbir şey söylemiyordu, Console'un kendisinde 126'sı dâhil — çünkü seçenekler `title="${detail}"` diye kuruluyordu ve listelerin çoğunda detail yok. Yani 'yanındakilerde var' bile yarı doğruydu; birkaçı `title=""` çiziyordu.

### 3.380.0 — S-52: Oturum Süresi Ölçümü — Aktif Çalışma ile Gece Boşluğunun Ayrılması (sessionSpan) (2026-09-05)

- **Temel Geliştirme:** 52: resume edilen oturum artık pasif süreyi saymıyor
- **Teknik Detay ve Doğrulama:** **done** — EVET, ekliyordu — ve ölçüldü. Oturum tablosunun Duration'ı `lastTs - firstTs` idi, yani ertesi sabah resume edilen bir konuşma bir buçuk gün koşmuş gibi okunuyordu. Kullanıcının kendi transkript deposunda 36 oturumda bir saatten uzun iç boşluk var; en kötüsü 1247 dakika diyordu, gerçek çalışma ~144 dakika.

### 3.379.0 — X-178: Nöbet Bekçisi (Watchdog) ve Gece Kilitlenmelerini Önleme (2026-09-04)

- **Temel Geliştirme:** Nöbet yüzeyi + bekçisi (X-177, X-178) — Console canlı şeridi, takılan turu bitiren bekçi, slot sağlığı bildirimleri
- **Teknik Detay ve Doğrulama:** **done** — Bekçi ve slot sağlığı bitti (v11.233 · paket 3.379.0 kuruldu ve extensions.json ile doğrulandı). BEKÇİ: kampanyanın döngüsünü turların BİTMESİ sürüyor (sentryDue koşan tur varken bilerek false), dolayısıyla hiç bitmeyen bir tur onu sonsuza kadar tutuyordu — kota da kırmıyor, çünkü izin isteminde park etmiş oturum hiçbir şey harcamıyor. Aynı pompa vuruşu artık ikinci soruyu da soruyor (ikinci zamanlayıcı yok): tahtadaki tur hâlâ yaşıyor mu?

### 3.378.0 — X-177 (Bölüm 2): Nöbet Durumunun Konsol Canlı Şeridine Taşınması (2026-09-04)

- **Teknik Detay ve Doğrulama:** touch — BİRİNCİ YARI BİTTİ (v11.230-231, paket 3.377.0 kurulu): Missions sayfasının tepesinde Sentry bölümü + kampanyanın KENDİ paused durumu + sentry.pause/resume köprüde + parity girdileri + dört fixture fotoğraflandı + 16 sayfa testi. Kullanıcı kararları: (1) duraklat kampanyanın kendi durumu olacak, çiftliğin automation ana anahtarı DEĞİL; (2) Console şeridi kampanya kaydı varsa HEP görünecek (durmuşsa 'gece şunu yaptı, şu yüzden durdu' der). İKİNCİ YARI KALDI: Console canlı şeridi — sayfa başlığının altında tek satır, şu an hangi hesapla hangi kalem koşuyor, o hesabın kotasında kalan, sırada ne var, en son ne oldu; tıklayınca Missions'a gider.

### 3.377.0 — X-177 (Bölüm 1): Nöbet Yüzeyi ve Duraklatma Kontrolü (2026-09-04)

- **Teknik Detay ve Doğrulama:** touch — BİRİNCİ YARI BİTTİ (v11.230-231, paket 3.377.0 kurulu): Missions sayfasının tepesinde Sentry bölümü + kampanyanın KENDİ paused durumu + sentry.pause/resume köprüde + parity girdileri + dört fixture fotoğraflandı + 16 sayfa testi. Kullanıcı kararları: (1) duraklat kampanyanın kendi durumu olacak, çiftliğin automation ana anahtarı DEĞİL; (2) Console şeridi kampanya kaydı varsa HEP görünecek (durmuşsa 'gece şunu yaptı, şu yüzden durdu' der). İKİNCİ YARI KALDI: Console canlı şeridi — sayfa başlığının altında tek satır, şu an hangi hesapla hangi kalem koşuyor, o hesabın kotasında kalan, sırada ne var, en son ne oldu; tıklayınca Missions'a gider.

### 3.376.0 — X-176: Nöbet Kampanyasının Fiilen Koşması ve Planlayıcı (2026-09-04)

- **Teknik Detay ve Doğrulama:** touch — BAŞLANDI, YARIM (v11.225 / commit 7a8d91d) — saf planlayıcı bitti, sürücü ve op'lar duruyor. KARARLAR (kullanıcıya soruldu, 2026-09-04): (1) her nöbet turu NORMAL BİR GÖREV SATIRI olur; oturumu açan, terminalini izleyen, bitişini anlayan ve iptal düğmesi veren mevcut TaskManager'dır — kampanya yalnızca sıradaki görevi yaratır (kalemin 'ikinci zamanlayıcı yazılmaz' şartı harfiyen). (2) KAMPANYAYI YALNIZCA KULLANICI BİTİRİR: tur bütçesi ve zaman bütçesi YOK; boş backlog bir BEKLEYİŞTİR, bitiş değil.

### 3.375.0 — X-174 / X-175: Nöbet Şablon Dosyası ve Model Maliyetinin Prompt'a Ulaşması (2026-09-04)

- **Temel Geliştirme:** 175 nöbet promptu tamamlandı: şablonlar gerçekten bir dosyadan geliyor (agentFarm.sentryTemplatesFile), model maliyeti promptun sözlerine ulaşıyor, köprüye sentry.templates ve sentry.prompt eklendi
- **Teknik Detay ve Doğrulama:** **done** — src/core/sessionDiagnosis.ts kondu (v11.222) — saf modül: fs yok, child_process yok, motor çağrısı yok; bütün gerçekler dışarıdan veriliyor, “bedava” iddiası bu yüzden denetlenebilir. DÖRT hüküm: item-done · clean-handover · nothing-to-continue · hit-the-wall. Dördüncüsü kullanıcının kararı: “duvara toslamak” bir alarmdır, hiç tur üretmemiş oturuma onu demek alarmı okunmaz hale getirir.

### 3.374.0 — X-172: Engines Sayfasında Hesapları Yakalama, Tutma ve Bırakma (2026-09-04)

- **Teknik Detay ve Doğrulama:** touch — ILK DILIM KONDU VE COMMIT EDILDI (v11.220): motor kartindaki hesap cipi. BITEN: enginesPanel.ts'e EnginesPanelDeps.accounts?() + buildData'ya accounts; extension.ts'te enginesPanelDeps.accounts BRIDGE'IN CEVAPLADIGI AYNI OKUYUCUDAN (publicAccount) - sayfa ile accounts.list ayrisamaz; media/engines.js'e accountChipHtml(e) + .engacct CSS, cip engbadge'in hemen saginda; enginespanel fixture'ina uc durumu da iceren accounts verisi; iki temada BAKILDI (Claude'da mavi 'work@studio - 91%', Codex'te sessiz kesik cizgili 'main account', hesabi olmayan motorlarda HIC CIP YOK). Cip bilerek state badge'inden sessiz: badge 'bu kosabilir mi' diye cevaplar, cip 'kimin planiyla' - okuyucu ikincisini ancak birincisi evet olunca sorar; dolgu degil kontur, boylece bir durum hukmuyle karistirilamaz.

### 3.373.0 — X-169: Oturum Başlatan Her Kapıda Hesap Boyutu (Account RunDimension) (2026-09-04)

- **Temel Geliştirme:** Agent Farm 3.373.0 (VSIX) — X-169: hesap, oturum baslatan her kapida bir launch boyutu
- **Teknik Detay ve Doğrulama:** touch — KESILDI VE GERI ALINDI - kasitli, kod kalmadi, depo temiz. Yapilan is KESIF: boyutun nereye takilacagi bulundu ve olculdu. (1) media/afDimensions.js icine account satiri (owner user, remembered FALSE, perEngine false, redraws false, appliesTo hasAccounts) + src/core/launch.ts LaunchOptions.account + test/lib_launch_doors.js EVERYTHING fixture + test_launch_dimensions 16->17 + test_launch_matrix 208->221 hepsi calisti, testler yesil oldu.

### 3.372.0 — U-129: Motor Kurulum Butonunun Gerçekten Çalışan Komut Basması (2026-09-03)

- **Teknik Detay ve Doğrulama:** **done** — Kok neden: Install dugmeleri her motor icin npm install -g yaziyordu; hicbir motoru olmayan makinede Node de yok, o yuzden hepsi "npm is not recognized" veriyordu. Cozum: kullanicinin _setup/Install-Engines.ps1 tablosu kopyalandi - Claude/Codex/Antigravity icin ureticinin kendi kurulum script i (Windows: irm ... | iex, digerlerinde: curl ...

### 3.371.0 — U-126: Çalışma Dizini Noktası ile Oturumun Ayrıştırılması (2026-09-03)

- **Teknik Detay ve Doğrulama:** touch — KOK NEDEN BULUNDU, DUZELTME KODLANDI AMA GERI ALINDI (kota esigi) - repoda degisiklik yok, agac temiz. KOK NEDEN (kanit kodda): media/console.js `let colorPick` bir OTURUM KIMLIGI tutuyor, colorDot() ise `colorPick === id` olan HER noktaya paleti ciziyor. Ayni oturum panelde uc yerde birden cizilebiliyor - colorDot cagri yerleri: satir ~1872 canli kart (slot c-list), ~1916 'kaldigin yer' rafi (yine c-list), ~2117 resume listesi (slot c-rlist).

### 3.370.0 — X-166: AskUserQuestion Soru Formunda Kutu ve Metin Seçim Kaybı Onarımı (2026-09-03)

- **Temel Geliştirme:** AskUserQuestion secim kaybi duzeltmesi (X-166)
- **Teknik Detay ve Doğrulama:** **done** — Katman bulundu, sebep kanitlandi, Agent Farm tarafi duzeltildi ve kuruldu (v3.370.0 / v11.211). OLCUM: sekiz aylik transkriptteki 26 AskUserQuestion cagrisinin tamami tarandi. KURAL -> tool sonucunda `response` (serbest metin) varsa CLI yalnizca "The user responded: <metin>" basiyor ve `answers`i TAMAMEN atiyor.
- **MEASURED, over every AskUserQuestion in the transcript history (26 calls, eight months): when `response` is present the CLI renders `"The user responded: <text>"` and DROPS `answers` outright:** Eight of those calls lost picks that way. The picks were never lost from the RECORD — `toolUseResult.answers` has all four of them, sitting in the transcript that same evening — only from the model's view. That is the worst shape a bug can have: no error, no gap, an answer that looks complete.

### 3.369.0 — X-151: 13 Başlatma Kapısının Modül Olması ve Parite Matrisi Çağrısı (2026-08-31)

- **Temel Geliştirme:** 148 Hamle 3 (X-151): 13 baslatma kapisi modul oldu, 208'lik parite matrisi artik kapilari cagirarak olcuyor (bosluk 141 -> 31)
- **Teknik Detay ve Doğrulama:** **done** — 3.369.0 (v11.209, 61dea2b). 13 kapı artık modül: `src/launch/doors/`, her biri `collect(ctx)`. ‼️ KAPI OTURUM BAŞLATMIYOR — spawn, kayıt ve UI hidroliği yerinde kaldı; canlı üründe CEVABI çıkarmak matrisin ihtiyacı olan her şeydi, EYLEMİ çıkarmak yedi spawn yolunu tek seferde oynatırdı ve ölçüme hiçbir şey katmazdı.
- **The 13 doors are modules now (`src/launch/doors/`):** , each with one job: `collect(ctx)` returns the intent it has assembled. ‼️ **A door does not start a session.** The spawning, the recording and the UI plumbing stay exactly where they were — this is a live product, and extracting the ANSWER is all the matrix ever needed, while extracting the ACT would have moved seven spawn paths at once for no extra measurement.
- **So the matrix stopped grepping and started calling:** Each door is handed EVERY dimension there is and asked what it hands on. A dimension that does not survive the call is not carried, whatever the source says. The gap count fell from **141 to 31** — and the 31 are not noise, they are findings, each one named:

### 3.368.0 — X-150 (2/2): 208 Parite Zorunluluğu ve Ölçümü (2/2): 208 obligations, counted (2026-08-31)

- **Temel Geliştirme:** Agent Farm 3.366.0 · 3.367.0 · 3.368.0 — X-148 Hamle 1 ve 2 (X-149 + X-150) ve oturum devir notu
- **Teknik Detay ve Doğrulama:** **done** — İki sürümde çıktı: 3.367.0 (v11.206, 36af196) veri kaydı + 3.368.0 (v11.207, 2686841) matris. (1) 16 boyut artık veri: `media/afDimensions.js`, tipli kapısı `src/core/launchDimensions.ts`. Dizi `media/` altında çünkü kabuk anahtarını SAYFA hesaplamalı, yoksa her repaint bir gidiş-dönüş bekler — X-152'nin bitirmek istediği tur gecikmesi sınıfı.
- **A matrix can:** 16 dimensions crossed with 13 doors is 208 cells, and every one of them must now hold a verdict in `launch.matrix.json`: `carried`, `exempt: <reason>`, or `gap: <reason>`. A seventeenth dimension therefore arrives with THIRTEEN cells that have no verdict and the suite is red until somebody says, per door, which of the three it is. The obligation is created by the dimension, not by somebody remembering to create it — which is the whole item.
- **‼️ The first count is 67 carried, 141 gaps, and 7 of the 13 doors cannot be pointed at at all:** That is not a regression; it is the first time anybody has had the number. Most doors live inside quickpick loops and message handlers in a 30.476-line file, so their cells are declared rather than measured — and declared as gaps, because `door not addressable yet` is a count and not an excuse. Driving it to zero is X-151's acceptance criterion, stated in a figure rather than a paragraph.

### 3.367.0 — X-150 (1/2): 16 Başlatma Boyutunun Veri Haline Gelmesi (1/2): the 16 launch dimensions are data now (2026-08-31)

- **Teknik Detay ve Doğrulama:** **done** — İki sürümde çıktı: 3.367.0 (v11.206, 36af196) veri kaydı + 3.368.0 (v11.207, 2686841) matris. (1) 16 boyut artık veri: `media/afDimensions.js`, tipli kapısı `src/core/launchDimensions.ts`. Dizi `media/` altında çünkü kabuk anahtarını SAYFA hesaplamalı, yoksa her repaint bir gidiş-dönüş bekler — X-152'nin bitirmek istediği tur gecikmesi sınıfı.
- **The list is now a record, in `media/afDimensions.js`:** Each row says who the answer belongs to, whether a launch writes it back, whether it is remembered per ENGINE (X-145), whether changing it rebuilds the composer shell, where the dimension does not exist at all — and one line of why it is the way it is. It lives in `media/` for the reason the clock and the narrowing rule do: both sides need it, and the shell key has to be computed BY THE PAGE or every repaint waits a round trip. `src/core/launchDimensions.ts` is its typed door.
- **‼️ The array is pinned to `LaunchOptions` in BOTH directions:** A field added to the interface with no row goes red; a row for a field that no longer exists goes red too. That is the difference between this and the constant it replaced.
- **Three places that counted these fields by hand now fold over the list:** `ENGINE_MEMORY_FIELDS` is derived rather than typed; the row `launchToRemember` files under an engine is built from it; and the six engine-owned dimensions `withLastLaunch` used to name one by one are inherited by the shape. A seventh of them is a flag on a row now, not six edits somebody has to remember.

### 3.366.0 — X-149: İki Tarafça Yüklenen Tek Daraltma Kuralı (Narrowing Rule) (2026-08-31)

- **Teknik Detay ve Doğrulama:** **done** — 3.366.0 (v11.205, 0239582). Daraltma kuralı üç değil DÖRT yerdeydi: dördüncüsü media/afEngine.js'in launchNarrow'u ve kendi yorumu diğer üçünün taşınmadığını itiraf ediyordu. Kural artık tek yerde: media/afLaunch.js (çift ihraç), host onu src/core/aflaunch.ts ile AYNI DOSYA olarak yüklüyor (afTime.js deseni).
- **There is now one rule and it lives in `media/afLaunch.js`:** , the arrangement the clock and the query language already proved: the pages load it in the webview and the extension host loads the SAME FILE through `src/core/aflaunch.ts`. The four bodies are gone, not shadowed — a page that kept its own would have passed every test and stayed free to drift, so the absence is measured: `defaultEffort`, the one piece of arithmetic the rule owns, no longer appears in any of the three page scripts at all.
- **‼️ It did NOT make the four agree — that would have changed behaviour on surfaces that took months to get right:** The differences are real answers to real cases, so they are PARAMETERS now instead of divergences hidden in a copy: `keep` is S-34 (a setup a real launch on this engine used beats the catalogue), `preferModelDefault` is the Console's "a model was just picked by hand", `resolveAlias` is S-47/K-28 (`big-pickle` resolving to `opencode/big-pickle`), and `takesEffort` is X-35 (an engine with no effort flag offers none, answered at each call site because the two page surfaces resolve it differently before a catalogue has landed). Every one of them is now a word somebody can read, and converging them is a decision there is finally one place to take.
- **`test/test_launch_narrow.js` is one fixture table and every entry point answers all of it:** — Node, a webview sandbox, and the host's own compiled `narrowLaunch`. A case added there is a case every surface has to pass, and the page's answer is asserted equal to the host's on all 23 of them, which is the assertion the four copies could never make. Two source-text regexes in `test_launch_parity.js` and one in `test_tasks_webview.js` were replaced by running the rule rather than reading it: their subject had moved, and re-pointing a regex at the new file would have been the same measurement with the same blind spot.

### 3.365.0 — X-106: Otomasyonlara Rota Yayılımı (Schedule/Trigger/Template Rota Desteği) (2026-08-31)

- **Temel Geliştirme:** Agent Farm 3.365.0 (v11.204) — X-105 kapandı, X-106 omurgası çıktı
- **Teknik Detay ve Doğrulama:** touch — Omurga çıktı — 3.365.0 (v11.204, commit a4b83c5). BİTEN: providerId+tier artık RunDimensions'ta, yani schedule/trigger/template/workflow step şekil gereği taşıyor; runExtras ve retryTask koruyor (tier rota değişince düşüyor); runner'ın HER İKİ spawn şekli (headless + interactive/external) task'ın kendi rotasını routeOf(task) ile aynı resolver'a veriyor; bridgeRunDimensions rotayı kabul edip REDDEDIYOR (motorun işaret edemeyeceği rota, rotanın haritalamadığı tier, rotasız tier, cli+rota çakışması) — 'düşürmek' bilerek seçilmedi, çünkü otomasyon bir kez yazılıp aylar sonra okunuyor; rotanın VAR OLUP OLMADIĞI adapter sorusu olduğu için callback olarak geliyor ve tek yerde (runDims) bağlanıyor — extension.ts'te bridgeRunDimensions( tam olarak 1 kez geçiyor, test sayıyor; ROUTE_NOTE 5 kapıya işlendi; bridgeDimsOut geri veriyor; Yeni Görev formunda Route + Tier kutuları var (motorun sağlayıcı ekseni ve kurulu profili varsa çiziliyor, tier ancak rota seçilince), motor/rota değişince uyumsuz değer düşüyor; 4 seed fonksiyonu (task/schedule/trigger/template) rotayı geri veriyor. 33 yeni doğrulama (test_task_route.js); süit 267/17.396/0; koyu+açık render'a bakıldı.
- **It travels by the shape, not by ten call sites:** `providerId` and `tier` are now part of `RunDimensions`, so a schedule, a trigger, a template and a workflow step carry them without any of those knowing they exist — and a retry, a clone and an edit inherit them the same way. Both spawn shapes in the runner (the headless one and the interactive one, which live 400 lines apart) pass the task's own route to the same resolver the Console and the terminals already use.
- **Refused, not narrowed — and that is the difference between a composer and an automation:** A composer redraws, so dropping an impossible value and saying so is right there. An automation is written once and read months later, so a route quietly discarded at write time is a run that silently takes the agent's standing endpoint for ever after. A route this engine cannot be pointed at, a tier the route does not map, a tier with no route at all, and a route beside a `cli` profile are each refused by name at the moment they are written down.

### 3.364.0 — X-105 (6/n): Kartta Yalnız İstenen Değil, Gerçekte Cevap Veren Rota Kimliği (6/n): the card says who served the last turn, not only who was asked for (2026-08-31)

- **Teknik Detay ve Doğrulama:** touch — Uc dilim yapildi (3.358.0, 3.359.0, 3.360.0), kalem ACIK. (1) DOGRULUK — ve bu bir BULGUYDU: Console'un kalici (Claude) yolu, yani panelin var olma sebebi olan motor, cp.spawn'a hic env vermiyordu. X-101 per-turn motorlara, X-104 OS penceresine tam ortam vermisti; openPersistent atlanmisti.

### 3.363.0 — X-105 (5/n): Sağlayıcı Değişim Politikası ve console.switch (5/n): a provider change is answered, not guessed (2026-08-31)

- **Teknik Detay ve Doğrulama:** touch — Uc dilim yapildi (3.358.0, 3.359.0, 3.360.0), kalem ACIK. (1) DOGRULUK — ve bu bir BULGUYDU: Console'un kalici (Claude) yolu, yani panelin var olma sebebi olan motor, cp.spawn'a hic env vermiyordu. X-101 per-turn motorlara, X-104 OS penceresine tam ortam vermisti; openPersistent atlanmisti.
- **The verdict is the adapter's, and no engine is named to reach it:** `src/core/providerSwitch.ts` answers one question — may this live session change who serves it, and when — out of `providerScope` and `canSwitchProviderAtTurnBoundary`. Four answers, and `unchanged` is one of them: `unchanged` · `now` · `turn-boundary` · `refuse`. A refusal carries the remedy (`fork` when there is a conversation to carry over, `new` when there is not), because a no with nothing after it leaves the caller nowhere. The module names no engine at all, and a test measures that: a sixth engine gets the right answer by declaring its scope, not by somebody remembering to edit a list.
- **`console.switch` is the one door:** It asks the policy, THROWS a refusal rather than returning a success with a sentence beside it, and — on the engine where the model names the provider — refuses to invent a model, listing what that provider actually serves instead. `console.setModel` still changes what answers; this changes who serves it, and on two engines those are different questions.
- **And the card says who is serving it NOW:** On OpenCode a mid-session model change moves the provider, so a pill naming the launch value was pointing at an endpoint the session had stopped talking to. Both facts are kept and neither is stored twice: the current provider is DERIVED from the model the card is on (through the anti-guess reader — a prefix is only a provider when the engine published it), the launch record is untouched because X-102 made it immutable, and the panel's first line is the current one with `Started on:` under it. Same mark, no second pill, and the line is drawn only on a card that really moved.

### 3.362.0 — X-105 (4/n): Kompozitörde Rota Seçimi ve Köprü Rota Desteği (4/n): the composer PICKS the route, and the bridge can too (2026-08-31)

- **Teknik Detay ve Doğrulama:** touch — Uc dilim yapildi (3.358.0, 3.359.0, 3.360.0), kalem ACIK. (1) DOGRULUK — ve bu bir BULGUYDU: Console'un kalici (Claude) yolu, yani panelin var olma sebebi olan motor, cp.spawn'a hic env vermiyordu. X-101 per-turn motorlara, X-104 OS penceresine tam ortam vermisti; openPersistent atlanmisti.
- **‼️ AND THE SUB-AXIS IS ONLY A BOX WHERE IT IS A TIER:** Where the engine's sub-axis is the MODEL — OpenCode names one `provider/model` — that axis is already on this strip, so a picked provider **narrows the model box that is there** instead of adding a second one beside it. Two controls for one subject can disagree within a click, and ONE SUBJECT is the rule that would break.
- **‼️ Nothing is drawn where there is nothing to choose:** Four of five engines have no provider axis, and the fifth gets no box until a route has actually been set up — so the row measured at `nowrap` is unchanged for everybody who has never made one. There is no variant control either, and that is the transport's answer rather than an omission: a hosted card is spoken to over ACP, which declares only model and mode. The form says why, in the route box's own hover.
- **The narrowing stays where it belongs:** Picking a route, and moving the engine underneath one, both go through the adapter's own `prunePick` — which says out loud what it dropped, so a tier that stops existing is not something you discover at Send.

### 3.361.0 — S-51: Motor Değiştiğinde Model ve Seçenek Kutularının Senkron Hareketi (2026-08-31)

- **Teknik Detay ve Doğrulama:** **done** — Konsol bestecisinde motor degistiginde model ve efor kutulari guncellenmiyordu; ancak kullanici model kutusuna elini uzatinca duzeliyordu. Kok neden tek yerdeydi: model listesi, efor listesi ve motor ipucu satirinin ucu de engineNow() uzerinden ciziliyor, yani kabuk yeniden kurulmadan hicbiri kimildamiyor - ve motor secicisinin kendine ait bir yeniden cizimi yoktu, tek yeniden cizimi host'un setEngine echo'suydu. O echo tam da okuyucunun elinin hala az once bastigi secicinin uzerinde oldugu anda geliyor (native select secimden sonra odagi birakmaz), M-33 bunu 'eller isin basinda' diye okuyup yeniden kurmayi borca yaziyordu; borcu da kullanicinin model kutusuna uzanmasinin focusout'u oduyordu.
- **M-33 was not the thing to loosen:** Its rule already says *only a rebuild nobody asked for waits*, and this one was asked for by the very hand it was waiting on. So the fix is the answer the model picker beside it has always used: the engine picker repaints on the spot, and hands focus back to itself afterwards so an arrow-key walk through the engine list still reaches its second step.

### 3.360.0 — X-105 (3/n): Rota İçin Tek Okuyucu ve Köprü Bildirimi (3/n): one reader for the route, and the bridge says it too (2026-08-31)

- **Temel Geliştirme:** 3.360.0 — X-105 (1-3/n): Console karti rotasinda kosuyor, rotasini soyluyor ve kopru de soyluyor
- **Teknik Detay ve Doğrulama:** touch — Uc dilim yapildi (3.358.0, 3.359.0, 3.360.0), kalem ACIK. (1) DOGRULUK — ve bu bir BULGUYDU: Console'un kalici (Claude) yolu, yani panelin var olma sebebi olan motor, cp.spawn'a hic env vermiyordu. X-101 per-turn motorlara, X-104 OS penceresine tam ortam vermisti; openPersistent atlanmisti.
- **And it is the same reader the card draws from:** The resolution lives in one place that both the page and the op delegate to, and it asks the engine's own adapter — the same one the launcher's route row is built from — for the words it uses. If those were two readings, "what the card says is what the process runs on" could not be true by construction: it can only hold while there is one statement.

### 3.359.0 — X-105 (2/n): Konsol Kartının Hangi Rotadan Sunulduğunu Açıklaması (2/n): the card says what it is served by (2026-08-31)

- **Teknik Detay ve Doğrulama:** touch — Uc dilim yapildi (3.358.0, 3.359.0, 3.360.0), kalem ACIK. (1) DOGRULUK — ve bu bir BULGUYDU: Console'un kalici (Claude) yolu, yani panelin var olma sebebi olan motor, cp.spawn'a hic env vermiyordu. X-101 per-turn motorlara, X-104 OS penceresine tam ortam vermisti; openPersistent atlanmisti.
- **The route is now its own mark, beside the engine badge:** Not a line inside it: the engine is the program, the route is the endpoint, and a badge that answers two questions is a badge that will eventually answer one of them wrong.

### 3.358.0 — X-105 (1/n): Konsol Kartının Seçilen Rotada Koşması (1/n): the Console card runs on the route the card says it is on (2026-08-31)

- **Teknik Detay ve Doğrulama:** touch — Uc dilim yapildi (3.358.0, 3.359.0, 3.360.0), kalem ACIK. (1) DOGRULUK — ve bu bir BULGUYDU: Console'un kalici (Claude) yolu, yani panelin var olma sebebi olan motor, cp.spawn'a hic env vermiyordu. X-101 per-turn motorlara, X-104 OS penceresine tam ortam vermisti; openPersistent atlanmisti.
- **The same defect, a fourth time — this time on the surface the Console exists for:** 
- **And the card with no route chosen is the half that is easy to miss:** "No route" is not "no statement": the official endpoint is reached by *clearing* what was inherited. A leftover `ANTHROPIC_BASE_URL` in the window answered the exact question the official route was picked to answer, and nothing here could say otherwise because nothing here was said at all.

### 3.357.0 — S-50 / U-127: Soğuk Açılan Konsolun Kapı Yanıtlarıyla Gelmesi ve Tek Kimlik Sözlüğü (2026-08-31)

- **Temel Geliştirme:** 50 (soğuk açılan Console kapının cevaplarıyla geliyor) ve U-127 (Runs tablosunda tek kimlik sözlüğü)
- **Teknik Detay ve Doğrulama:** **done** — 3.357.0 ile kapandı. Kök neden tek satırlık sıralamaydı: ConsolePanel.show yeni panel dalında sayfanın kabuğunu constructor içinde, yani apply()'dan ÖNCE kuruyordu — sayfanın okuduğu ilk yük henüz hiçbir şey söylenmemiş bir paneli anlatıyordu. Ardından gelen refresh() gerçek yükü henüz betiği çalışmamış bir webview'a itiyordu; yüklenmemiş sayfaya yapılan push geç değil, KAYIPTIR.

### 3.356.0 — X-104: Harici İşletim Sistemi Terminalinin Seçilen Rota Ortamında Başlatılması (1/n): the OS terminal window runs on the route you picked (2026-08-31)

- **Temel Geliştirme:** 33 kapandı (Plan sekmesinde toplu/tekil silme + repaint korumasının 24 sayfaya süpürülmesi) ve X-104'ün ilk yarısı (haricî terminal artık seçilen rotanın ortamında koşuyor)
- **Teknik Detay ve Doğrulama:** touch — YARIM — 3.356.0 ile ilk yarısı yayımlandı, kalem AÇIK. YAPILAN: haricî terminal, CLI başlatan yüzeyler içinde HİÇ ortam taşımayan tek yüzeymiş. Entegre terminal X-101'den beri overlay alıyor (ajanın kendi değişkenleri + rotanın endpoint/anahtarı + miras kalan Anthropic rotasını susturan clear listesi); üç satır ötedeki haricî dal hepsini düşürüyordu.
- **On Windows the values travel in a file the script eats, and they are not in the script:** There is no in-memory channel to an OS window here: when Windows Terminal is already running, `wt.exe` is a thin client and the window is opened by a process that started long before this one, so an environment set on the spawn reaches nothing. A route's value is an API key, so the design is about how briefly it exists: the launcher script's first act is to read the file and **delete** it, before it runs anything. A window closed later — with the CLI still running, or killed — leaves nothing behind. Writing the values into the script instead would have left them for as long as the session lasted, because the script only removes itself on its last line and a session is exactly the case that never reaches it.

### 3.355.0 — M-33: Plan Sekmesinde Toplu/Tekil Silme ve 24 Sayfaya Repaint Koruması (2026-08-31)

- **Teknik Detay ve Doğrulama:** touch — ODAK YARISI BİTTİ VE YAYIMLANDI (3.354.0 · v11.190); TOPLU SİLME YARISI HENÜZ BAŞLAMADI. KÖK SEBEP BULUNDU VE DOĞRULANDI — boşluk tuşunun suçu yok. `media/tasksPage.js`'te host'tan gelen `data` push'u doğrudan `render()` çağırıyordu, o da `#app`'in tümünü değiştiriyor; o ana kadar verilmiş her element kopuyor ve kopmuş bir düğüm imleci tutamıyor.
- **Every row can be ticked now, not only the switchable ones:** A workflow and a template have no switch, so they could not be picked at all — and the one act that applies to all four kinds was exactly the one that could not reach them. The two switch buttons say how much of your selection they can touch and grey out when the answer is none; the ticks are pruned to what is actually on screen, so "4 selected" always means four boxes in front of you and a filter change cannot leave a hidden row inside a delete.

### 3.354.0 — M-33: Misyon Plan Sekmesinde İmlecin Kutudan Atılmasının Önlenmesi (2026-08-31)

- **Temel Geliştirme:** 33: imleç artık kutudan atılmıyor
- **Teknik Detay ve Doğrulama:** touch — ODAK YARISI BİTTİ VE YAYIMLANDI (3.354.0 · v11.190); TOPLU SİLME YARISI HENÜZ BAŞLAMADI. KÖK SEBEP BULUNDU VE DOĞRULANDI — boşluk tuşunun suçu yok. `media/tasksPage.js`'te host'tan gelen `data` push'u doğrudan `render()` çağırıyordu, o da `#app`'in tümünü değiştiriyor; o ana kadar verilmiş her element kopuyor ve kopmuş bir düğüm imleci tutamıyor.

### 3.353.0 — X-102: İstek ile Gerçek Yanıtın Birleşimi (Launch Manifest Join) (2026-08-31)

- **Temel Geliştirme:** 102: bir koşunun ne olması istendiği, ne cevap verdiğinin yanında
- **Teknik Detay ve Doğrulama:** touch — X-102 2/n (v11.177 + v11.178 — sürüm yok, hiçbir şey spawn'a bağlanmadı). LaunchBinding.launchId + manifestOf(): binding ile manifesti birleştiren halka. Join taskId DEĞİL, çünkü retry yeni bir spawn'dır ve kendi manifestini alır; taskId ile anahtarlansa ikinci koşu birincinin route'unu sessizce sahiplenirdi.
- **What the engine actually said, read out of its own events:** One rule, and it is the one the catalogs already followed: *the field, not the printed prefix*. A provider is reported when the engine NAMED it in a field of its own; a model spelled with a slash in it proves nothing. OpenCode publishes the same fact three ways — its export, its JSON run stream, its ACP config options — and has changed its wire shape twice already, so one scan collects the named fields wherever they sit rather than three readers that each need remembering. The one qualified name the engine states as its own current value is cut only where the head is a provider that same engine published.
- **Claude reports no route, and never will:** Measured in August against a local fake endpoint: two Claude processes ran concurrently on separate routes under one model name, and the transcript preserved neither. So `claude-opus-5` is not evidence of Anthropic, the reported-provider list on this engine is permanently empty, and that is an answer rather than a gap. The MODEL is a different field and the transcript does name it — which is what the manifest now has to compare itself against.

### 3.352.0 — S-49 / S-48: Kompozitörün Ajan Seçimiyle Ezilmesinin Önlenmesi (2026-08-31)

- **Teknik Detay ve Doğrulama:** **done** — S-49 kapandı (3.351.0 → 3.352.0 · v11.182). Kök sebep media/console.js içindeki c-agent change işleyicisiydi: ajan kutusu değişince seedFromAgent() çağrılıyor, o da st.model / st.effort / st.permissionMode değerlerini yeni ajanın lastLaunch kaydından eziyor, üstüne setEngine ve setSuperpowers mesajlarını da atıyordu. Bu kural S-34'te bilerek konmuştu ama yanlış yerde: KAPI (ConsolePanel.show → composerLaunch) kompozitörün NEYLE AÇILACAĞINA karar verir; kutular bir kez çizildikten sonra onlar kullanıcınındır.
- **S-49 — a DOOR seeds the composer; the composer never reseeds itself:** Set a model, set an effort, set a permission mode in the Console composer, then change your mind about WHO runs it — and all three answers were replaced by the newly chosen agent's last-launch record. That rule (S-34) is right for a door that OPENS the panel and wrong for a box the person is standing in: the last decision of a launch was silently undoing the first three. The agent picker now REPAINTS and does nothing else. Where the boxes open from is still decided once, host-side, by the door that opened the panel (`ConsolePanel.show` → `composerLaunch`); once they are drawn, the only thing that writes them is a hand on them. The Superpowers chip follows the new agent exactly as before, because an untouched choice is resolved against the agent the picker is showing rather than written anywhere — and a chip the user HAS pressed now keeps their answer for the same reason the boxes do.
- **S-48 — the row you pressed is the agent you get:** Pressing the play triangle on an agent row sometimes asked "Select an agent" anyway, and picking a different name there really did start a different agent, so aiming at the row meant nothing. It was a RACE, and it began when the engine work multiplied the live events: `live` fires once per hook, every one of them rebuilt every row in the Agents view including the inline action bar under the pointer, and a press landing inside that rebuild reaches an action with no row behind it — so the command arrives with no argument at all.

### 3.351.0 — U-84 (2/2): Telegram Köprü Yönetim Kartının Sayfa Ayarlarından Beslenmesi (2026-08-30)

- **Teknik Detay ve Doğrulama:** touch — KISMİ — Toolbox yarısı BİTTİ ve yayımlandı (3.346.0 · v11.171 · commit 733e2cf), Farm Settings yarısı BİTMEDİ. YAPILAN: yeni saf çekirdek src/core/telegramCockpit.ts (bridgeStatus · parseChatId · budgetReading) + Toolbox sayfasına Services sekmesi ve Telegram Bridge kartı + toolboxPanel.ts beş mesaj kapısı + telegram.status köprü op'u + beş parity kaydı + test/test_telegram_cockpit.js (47 doğrulama) + test/fixtures/toolbox.js (6 varyant). ÖLÇÜLEN VE ÖNEMLİ: (1) Boş allowlist poller'ı DURDURMUYOR — applyChatBridge uyarıp yine de start() çağırıyor, mesajları isAllowed reddediyor; bu yüzden "running" ile "state" iki ayrı cevap.
- **So the card carries only what a settings row cannot:** The token is in the secret vault, the day's spend is in the extension's own storage, and "is the poller alive" is a fact about a running process — none of the three is in any box, and all three are the reason somebody opens this page when their phone gets no answer. The card says: token in the vault or not, which bot answered, poller alive or stopped, how many chats the list admits, and what today has cost against today's ceiling. Plus the two acts that are not settings at all — connect a token, ask Telegram who this bot is.
- **‼️ ONE CARD, and that is now structural rather than a promise:** The badge, the tones, the budget bar and the wiring live in `media/afTelegram.js`, shipped to every page by the shell; the data is composed once by `telegramCard()` in `core/telegramCockpit.ts`; and every `svc-*` message both pages can post is handled by one function in `panels/base.ts` — including the allowlist of the three settings a webview may write, which is the thing a second copy forgets. The tests fail if either page grows a tone vocabulary of its own.
- **‼️ A SETTING WHOSE ANSWER IS A NAME THAT HAS TO EXIST NOW GETS A PICKER:** `telegram.defaultAgent` was a text box, so the one way to get it wrong — type a name no agent has — was the easiest thing to do and produced no error anywhere. The correct values are not a fact of the manifest (they are whatever agents this machine has today), so the schema names a SOURCE instead: `"x-af-values": "agent"`, and the host fills it in on every draw. Derived, never a list of keys on the page — the same rule `x-af-browse` follows, and `wikiAgent` gets the picker for free. A stored name the host has never heard of stays selected and is marked "not on this machine", because a page that silently swapped it would be changing a setting nobody touched.

### 3.350.0 — X-103: Rota Seçici — Motor, Sağlayıcı, Tier ve Model Ekseni (2026-08-30)

- **Temel Geliştirme:** 103 route seçici (VSIX kuruldu ve doğrulandı)
- **Teknik Detay ve Doğrulama:** **done** — X-103 kapandı (3.349.0 → 3.350.0 · v11.175 + v11.176). Start Session formu artık adapter kataloğundan çiziliyor: engine → route/provider → tier/model → variant. Yeni saf modül core/launchProvider.ts; formun neyi sunacağına karar veren filtre adaptörün kendi normalizeSelection'ı — böylece kimlik bilgisi olmayan hazır route ŞABLONLARI (Anthropic/Kimi/MiniMax) launcher'da çıkmıyor: seçilseydi hiçbir şey enjekte etmeden mirasla koşardı, yani satır "Kimi" derken oturum başka uçta olurdu.
- **The rows come from the adapter, never from the engine's name:** A form with `if (engine === 'claude')` in it is a second statement of what each engine offers, and the day an adapter changes its mind the form goes on drawing the old answer confidently. The filter for what may be offered is the engine's own word — `normalizeSelection`.
- **‼️ Only what can actually run is offered:** The Claude catalog carries the shipped route *templates* (Anthropic, Kimi, MiniMax) beside your own profiles. A template is a SHAPE: no id to hold a credential under, nothing behind it. Picked, it resolves to `unknown` identity and injects **nothing** — the session would run on whatever the shell was already carrying while the row said "Kimi". That is exactly the lie X-101 exists to prevent, so the launcher offers profiles and the template list stays where you create one.

### 3.349.0 — X-101 (3/3): Konsol Rota Kabul Maddesi ve Entegrasyon (3/3): the Console, and the acceptance line closed (2026-08-30)

- **Temel Geliştirme:** 101 ortak runtime registry ve motor adaptorleri
- **Teknik Detay ve Doğrulama:** touch — HENÜZ KOD YAZILMADI — SADECE ZEMİN ÖLÇÜLDÜ (2026-08-30). Sonraki ajanın en pahalı keşfi bu olurdu, o yüzden yazıyorum. (1) ENJEKSİYON NOKTASI: src/core/tasks.ts:3193 ve :3204 — iki çağrı yeri, ikisi de `env: { ...process.env, ...engineEnv, ...this.opts.getEnv?.(agent.id) }` kuruyor.
- **‼️ The item's acceptance line, closed and measured:** All four launch surfaces — headless runs, interactive task terminals, session terminals and Console cards — resolve through one symbol, `engineRuntimeFor(agentId, engine)`. The suite reads the real source and fails if a second resolution appears beside it, or if any spawn site returns to spreading `process.env` with the route still in it.

### 3.348.0 — X-101 (2/2): Terminal Yüzeylerinde Rota Ortam Değişkenleri (2/2): the terminal surfaces, where absence is not an instruction (2026-08-30)

- **Teknik Detay ve Doğrulama:** touch — HENÜZ KOD YAZILMADI — SADECE ZEMİN ÖLÇÜLDÜ (2026-08-30). Sonraki ajanın en pahalı keşfi bu olurdu, o yüzden yazıyorum. (1) ENJEKSİYON NOKTASI: src/core/tasks.ts:3193 ve :3204 — iki çağrı yeri, ikisi de `env: { ...process.env, ...engineEnv, ...this.opts.getEnv?.(agent.id) }` kuruyor.
- **‼️ And all of them through ONE symbol:** `engineRuntimeFor(agentId, engine)` in `extension.ts` is what the runner, the interactive terminal and the session terminal all call, and the suite fails the build if a second resolution appears beside it. That is the item's acceptance line stated as a symbol rather than as an intention: three surfaces resolving a launch three ways are three answers to "which route is this run on", and the transcript records none of them.

### 3.347.0 — X-101 (1/2): Ortak Runtime Registry ve Motor Adaptörleri Omurgası (2026-08-30)

- **Teknik Detay ve Doğrulama:** touch — HENÜZ KOD YAZILMADI — SADECE ZEMİN ÖLÇÜLDÜ (2026-08-30). Sonraki ajanın en pahalı keşfi bu olurdu, o yüzden yazıyorum. (1) ENJEKSİYON NOKTASI: src/core/tasks.ts:3193 ve :3204 — iki çağrı yeri, ikisi de `env: { ...process.env, ...engineEnv, ...this.opts.getEnv?.(agent.id) }` kuruyor.
- **‼️ The environment names were MEASURED, not remembered:** Read out of the real `claude` binary on this machine, a 217 MB bundle:
- **‼️ And the two families get different treatment, which is the measurement worth writing down:** All 75 `ANTHROPIC_*` names are route, credential, model-mapping, alternate-backbone or organisation identity: there is not one a run legitimately keeps while being told to use a different route. So that family is a PREFIX rule, and a name shipped next year is covered before anybody hears about it. The `CLAUDE_*` family is not like that at all — it holds the alternate backbones and the plan credential AND the working context Agent Farm itself depends on (`CLAUDE_PROJECT_DIR`, `CLAUDE_PLUGIN_ROOT`, `CLAUDE_CODE_ENTRYPOINT`). Clearing that family wholesale would break the user's own hooks in the name of isolating a route they never changed, so there it is what a name MEANS that decides.
- **‼️ Nothing chosen means nothing touched:** A user who has never opened this feature is running on their own shell's setup deliberately, and sanitising it because Agent Farm now *could* would break a working machine to enforce a choice nobody made. The moment a route IS chosen the inherited ones all go — including when the choice is Anthropic's own endpoint, because an inherited `ANTHROPIC_BASE_URL` would otherwise send that run to a third party while the manifest recorded first-party. That is the exact lie measured in August.

### 3.346.0 — U-84 (1/2): Toolbox Services Sekmesi ve Telegram Köprü Kartı (2026-08-30)

- **Temel Geliştirme:** 84 (kısmi): Toolbox Services sekmesi ve Telegram Bridge yönetim kartı, telegram.status köprü op'u, telegramCockpit çekirdeği
- **Teknik Detay ve Doğrulama:** touch — KISMİ — Toolbox yarısı BİTTİ ve yayımlandı (3.346.0 · v11.171 · commit 733e2cf), Farm Settings yarısı BİTMEDİ. YAPILAN: yeni saf çekirdek src/core/telegramCockpit.ts (bridgeStatus · parseChatId · budgetReading) + Toolbox sayfasına Services sekmesi ve Telegram Bridge kartı + toolboxPanel.ts beş mesaj kapısı + telegram.status köprü op'u + beş parity kaydı + test/test_telegram_cockpit.js (47 doğrulama) + test/fixtures/toolbox.js (6 varyant). ÖLÇÜLEN VE ÖNEMLİ: (1) Boş allowlist poller'ı DURDURMUYOR — applyChatBridge uyarıp yine de start() çağırıyor, mesajları isAllowed reddediyor; bu yüzden "running" ile "state" iki ayrı cevap.
- **‼️ The card derives nothing for itself:** Every badge and figure comes from `core/telegramCockpit.ts`, which is measured against what `applyChatBridge()` really does. A page working out "is it running" from `enabled && hasToken` would be a second copy of the launch rules living in a file nobody thinks of as launch logic, going out of date the first time that function changes — in green.
- **‼️ RUNNING and USABLE are two different questions:** , and this was measured rather than assumed: an empty allowlist does NOT stop the poller. It warns and starts anyway, and every message that arrives is refused. A single badge collapsing the two would call a live-but-deaf bridge "off" and send somebody to restart a service that is running fine.

### 3.345.0 — X-100 (Yüzey): Agent Farm Rotaları ve Ölçülebilir Sınırlar (surface): the routes Agent Farm holds, and the boundary drawn where it can be measured (2026-08-30)

- **Temel Geliştirme:** 145 (oturum açma kanalları: motor bazlı hafıza + ▶ kapısı Settings'ten çözüyor) ve X-100 (sağlayıcı sahipliği, profil yönetimi, kasa sınırı: yüzey + köprü + parity)
- **Teknik Detay ve Doğrulama:** touch — YARIM — ÇEKİRDEK BİTTİ, YÜZEY YAPILMADI (3.343.0, commit 5babe43). BİTEN: core/providerOwnership.ts — sahiplik tablosu (engine × veri türü, her satır GEREKÇESİYLE; claude → catalog/credential/config Agent Farm'ın, opencode → üçü de motorun; 'selection' yani bir koşunun hangi sağlayıcıyla başladığı HER motorda Agent Farm'ın, çünkü o yapılandırma değil TARİHTİR ve hiçbir motor tutmuyor), secretKeyFor (profil ID'sinden türer, ETİKETTEN DEĞİL — etiket değişince anahtar kayar ve eski giriş keychain'de sahipsiz kalır), publicProfile (allow-list ile inşa, silme ile değil; hasSecret VARLIK bilgisi public, sırrın kendisi değil), ownershipRefusal (motorun kendi yolunu adlandırarak reddeder: 'opencode auth login'), bumpRevision + copyProfile (kopya YENİ profildir, revision 1'den başlar ve KİMLİK BİLGİSİ TAŞIMAZ). 35 doğrulama, sızdıran sürüm yerleştirilip düştüğü kanıtlandı.
- **The failure this prevents is still two vaults:** , and the surface is where that becomes a thing a person can act on. So the Engines page now draws the ownership table itself: engine × kind of data, each cell saying which side owns it and carrying the reason in words on its hover. ‼️ The `selection` column reads **Agent Farm on every engine** — which provider a run was actually started with is history, not configuration, and no engine keeps it.
- **The routes themselves:** get CRUD, copy, revision and credential status:

### 3.344.0 — X-145: Hatırlanan Kurulumun Tek Bir Motora Ait Olması ve Ayarlar Yanıtı (2026-08-30)

- **Teknik Detay ve Doğrulama:** **done** — 3.344.0 — v11.168 + v11.169. Üç kusur: (1) Kayıt bir ajan için tek model/efor/izin kutusu tutuyordu; artık `byEngine` ile motor başına bir satır ve motor değişimi o satırı GERİ ÇAĞIRIYOR (düşürmek hatırlamak değildi). (2) İzin modu artık motorla birlikte düşüyor — S-34 onu 'plan Agent Farm'ın sözü' diye tutuyordu, yazılış için doğru ETKİ için yanlış: bayrak oluyor ve bayrak motorun kendi ayar dosyasını yener, kullanıcının ~/.claude/settings.json'daki bypassPermissions'ı ezen şey buydu.
- **The reported fault, in the user's own sequence:** Start OpenCode from the launcher without permissions (`manual`). Then press ▶ on the same agent's row and choose Claude — whose default in `~/.claude/settings.json` is `bypassPermissions`. The Claude session came up in `manual`. Nobody had ever said `manual` about Claude.
- **1. The memory had ONE box for an agent used on three engines:** The record kept one model, one effort and one permission mode per agent, so every engine overwrote the last. S-34 had already dropped the model and the effort on an engine switch — half a fix, because dropping is not remembering: an agent used on two engines has two setups, and emptying the boxes made the user retype the one they had chosen on that engine an hour earlier. The record now holds `byEngine`, one row per engine, and a switch **recalls** that engine's setup. The other engines' rows survive every launch.
- **2. ▶ answered four questions it never asked:** The ▶ on an agent's row asks engine · project · where, and inherited the model, the effort, the permission mode and the discipline from a record written by a **different door** on a **different engine**, with nothing on screen mentioning any of them. But at that door the agent is known and the dialog makes you choose the engine — both halves of the Farm Settings key are settled before anything starts. So that channel now resolves the way the Settings page draws it: this agent's per-engine default → `agentFarm.launchDefaults` → the engine's own settings file. The same agent on the same engine gives the same session every time.

### 3.343.0 — X-100 (Çekirdek): Rota Mimarisinde Hangi Olguyu Kimin Sahiplendiği (core): who owns which fact, and where the vault boundary runs (2026-08-30)

- **Temel Geliştirme:** 3.343.0 — X-100 (çekirdek): sağlayıcı sahiplik tablosu ve kasa sınırı; secret profil-id ile anahtarlanır, public yarı allow-list ile inşa edilir, Agent Farm sahibi olmadığı veriyi yönetmeyi reddeder. Yüzey/köprü/parity yapılmadı, kalem açık.
- **Teknik Detay ve Doğrulama:** touch — YARIM — ÇEKİRDEK BİTTİ, YÜZEY YAPILMADI (3.343.0, commit 5babe43). BİTEN: core/providerOwnership.ts — sahiplik tablosu (engine × veri türü, her satır GEREKÇESİYLE; claude → catalog/credential/config Agent Farm'ın, opencode → üçü de motorun; 'selection' yani bir koşunun hangi sağlayıcıyla başladığı HER motorda Agent Farm'ın, çünkü o yapılandırma değil TARİHTİR ve hiçbir motor tutmuyor), secretKeyFor (profil ID'sinden türer, ETİKETTEN DEĞİL — etiket değişince anahtar kayar ve eski giriş keychain'de sahipsiz kalır), publicProfile (allow-list ile inşa, silme ile değil; hasSecret VARLIK bilgisi public, sırrın kendisi değil), ownershipRefusal (motorun kendi yolunu adlandırarak reddeder: 'opencode auth login'), bumpRevision + copyProfile (kopya YENİ profildir, revision 1'den başlar ve KİMLİK BİLGİSİ TAŞIMAZ). 35 doğrulama, sızdıran sürüm yerleştirilip düştüğü kanıtlandı.
- **The failure this prevents is two vaults:** The obvious design gives every engine the same provider-profile manager. For Claude Code that is exactly right: a provider there is a route Agent Farm assembles, and if Agent Farm does not hold it, nobody does. For OpenCode it is exactly wrong — that engine already owns `/connect`, `opencode auth login`, `auth.json` and `opencode.json`, and a second copy makes two vaults and two revisions where the stale one wins silently.

### 3.342.0 — X-99: Motorların Ne Sunduğunu Gerçekten Bilen Kaynaklardan Okunması (2026-08-30)

- **Temel Geliştirme:** 3.342.0 — X-99: çift kaynaklı sağlayıcı/model/variant/yetenek kataloğu (OpenCode ölçülür, Claude route şablonları veri olarak beyan edilir) + spawn öncesi katalog reddi
- **Teknik Detay ve Doğrulama:** **done** — core/providerCatalog.ts — çift kaynak. ÖLÇÜLEN taraf: opencode models --verbose, brace-depth ile ayrıştırılıyor (objeler çok satırlı ve kendi süslü parantezlerini taşıyor; satır bazlı bölme, bir modele alan eklendiği gün iki modeli birleştirirdi) ve sağlayıcı providerID ALANINDAN okunuyor, basılan provider/model satırını bölerek DEĞİL — X-98 kuralı bir katman yukarıda, tek satır. BEYAN EDİLEN taraf: CLAUDE_ROUTE_TEMPLATES veri olarak (anthropic · anthropic-api · kimi · minimax), kullanıcının settings'te tarif ettiği route aynı fonksiyonla aynı şekle okunuyor ve aynı adlı hazır satırı yerine geçiyor (iki satır tek ad = akıl yürütülemez bir seçici).
- **Two engines, two owners, and the ownership is the design:** OpenCode owns its provider list, its credentials and its config; Agent Farm reads the public half and records what was chosen rather than keeping a second copy — two vaults, two revisions and two contradicting truths being the alternative. So that catalog is **measured**. Claude Code has no provider list at all: a provider there is a ROUTE Agent Farm assembles (base URL, auth kind, tier→model mapping), so that catalog is **declared** — and because living provider names must not require a code change, the templates are DATA and a route the user describes in settings is read by the same function into the same shape, replacing a shipped row of the same name rather than appearing twice beside it.
- **Measured on OpenCode 1.18.19 here, 30 Aug 2026 — three things the shape had to be honest about:** 

### 3.341.0 — X-98: Bu Oturumu Kimin Sunduğunun Her Motor İçin Tek Biçimde Tespiti (2026-08-30)

- **Temel Geliştirme:** 3.341.0 — X-98: motor-agnostik sağlayıcı kimliği ve adapter sözleşmesi (saf çekirdek) + 'model adından provider tahmin edilmez' kuralını ölçen kapı
- **Teknik Detay ve Doğrulama:** **done** — Saf çekirdekte kuruldu: core/providerIdentity.ts (ProviderIdentity · TurnRuntimeIdentity; origin/scope/proof eksenleri, redactRoute allow-list ile) + core/providerAdapter.ts (catalog·runtime·preflight·identity·resume·billing sözleşmesi; provider ekseni olmayan motor için notApplicableAdapter tam cevap verir). Üç kabul maddesi de karşılandı ve ÖLÇÜLÜYOR: (1) test_provider_identity.js kapısı, model adından provider çıkaran iki şekli reddediyor — ikisi de kasten yerleştirilip düştüğü görüldü, bugün tek muafiyet var (tasks.ts, medya üretim servisi, farklı alan) ve muafiyetin kendisi de ölçülüyor; (2) Claude session-scoped ile OpenCode turn-scoped tek şemada, scope alanı + scopeAllowsTurnChange ile kayıpsız; (3) motor alanı olmayan eski kayıt legacy-inherit kalıyor, model adından doldurulmuyor. 44 yeni doğrulama.
- **‼️ NOTHING GUESSES THE PROVIDER FROM THE MODEL NAME, and that is now measured rather than asked for:** `claude-opus-5` does not prove Anthropic served it: measured in August against a local fake endpoint, two routes answered under the same model name and the transcript preserved neither. So a provider is DECLARED, or REPORTED, or unknown — and `unknown` is an answer this system has to be able to give rather than an absence it fills in. A record from before any of this stays `legacy-inherit`, which says "nobody was asked" and can be backfilled from real evidence later, rather than `unknown`, which would say "asked, no answer".

### 3.340.0 — S-34 (Yeniden): Hatırlanan Modelin Kaydedildiği Motora Ait Olması (2026-08-30)

- **Temel Geliştirme:** 3.340.0 — S-34 yeniden: hatırlanan model kaydedildiği motorun malıdır (motor değişince model/efor devralınmıyor); iki sahte-yeşil test düzeltildi
- **Teknik Detay ve Doğrulama:** **done** — Launcher artık en son kullanılan kurulumu YÜZEYİYLE birlikte açıyor. Motor/model/effort/izin zaten hatırlanıyordu; eksik olan tek boyut pencereydi (lastLaunch kaydına `surface` eklendi, sıra: çağıranın istediği → bu ajanın kendi sonu → pencerenin son cevabı → terminal). Ayrıca Start satırı kurulumun hangi kayıtlı profile denk düştüğünü söylüyor — hatırlanan bir isim değil, `matchProfile` ile türetiliyor, yani model satırı değişince iddia da düşüyor.
- **‼️ Switch the launcher from Antigravity to Claude, press Start, and the Console came up saying Claude with the Antigravity model in the box beside it:** A setup that cannot run, drawn as if it would. 3.339.0 taught the composer to keep a seeded model the engine's published catalog does not list — right, because a catalog is what an engine OFFERS and not everything it can run — but it decided whether to keep by comparing the seeded value against itself, a comparison that cannot fail. So the reconcile was not narrowed, it was silenced, and the one case it exists for went with it.
- **And two tests were reporting green on prose:** `test_run_surface.js` slices the `startSession` command out of the source at a fixed length, and its last check had drifted to offset 4190 of a 4200-character window — the command had not changed, the comment above it had. `test_finish_sound.js` matched a bare `\n` and passed only while that file happened to be sitting in the working tree with LF endings. Both now measure the behaviour rather than the layout.

### 3.339.0 — S-34: Eksik Kurulum Hatırlamasının Onarımı ve Başlatma Satırı (2026-08-30)

- **Temel Geliştirme:** 34: başlatma konfigürasyonunun tam hatırlanması, motorun kararlılığı ve Start satırında okunabilir kurulum özeti
- **Teknik Detay ve Doğrulama:** **done** — Launcher artık en son kullanılan kurulumu YÜZEYİYLE birlikte açıyor. Motor/model/effort/izin zaten hatırlanıyordu; eksik olan tek boyut pencereydi (lastLaunch kaydına `surface` eklendi, sıra: çağıranın istediği → bu ajanın kendi sonu → pencerenin son cevabı → terminal). Ayrıca Start satırı kurulumun hangi kayıtlı profile denk düştüğünü söylüyor — hatırlanan bir isim değil, `matchProfile` ile türetiliyor, yani model satırı değişince iddia da düşüyor.
- **‼️ "Sometimes it forgets the model, sometimes the effort" — and it was one line in the page:** Every door seeds the composer's boxes from the agent's record; the composer then reconciled them against the engine's published catalog and **cleared anything the catalog does not list**. A catalog is what an engine is OFFERING, not what it can run — an alias typed into the launcher's "Other…" box, a model added to `agentFarm.modelAliases` and later removed, a level a catalog stopped advertising. So the model vanished; and because the effort list is looked up BY model, an emptied model then landed on a different list and took the effort with it. A value a real launch on **this** engine used now survives the check, and the select draws it. An engine CHANGE still clears both — those values belong to a different program, which is the case the reconcile exists for.
- **‼️ Starting an agent from a Projects page silently reset that agent's remembered engine:** That door stated the fleet default engine as its own answer — which beats the memory, because what a caller says wins — and then recorded it. Two doors writing one record, one of them with an answer nobody gave: which is the whole of "sometimes it insists on Antigravity and then suddenly it is Claude again". It now inherits like every other door.

### 3.338.0 — K-36 / M-32: Slash Katalogunun Hatırlanması ve Form Bütünlüğü (2026-08-30)

- **Temel Geliştirme:** 36 slash kataloğu hatırlanıyor · M-32 görev formu kaydettiğini geri veriyor
- **Teknik Detay ve Doğrulama:** **done** — Ölçüm: gerçek Claude system:init'i 49 komut bildiriyor (17'si skill), terminal_slash_commands ise sadece doctor+color diyor. Seçici oturum yokken 18 gömülü satır + 2 disk skill'i = 20 gösteriyordu. Çözüm motor-bağımsız: rapor globalState'te 'agentfarm.slashCatalog' altında motor ve motor|ajan anahtarıyla saklanıyor (rememberSlashReport / recallSlashReport, core/slashCommands.ts); konsol kapısı canlı karttan, aynı motordaki başka bir canlı oturumdan veya hafızadan okuyor ve gördüğünü öğreniyor; toolbox.slashCommands aynı kaydı okuyor.
- **‼️ K-36 — the `/` picker offered 18 commands where the same machine's terminal offers 49:** The catalog's one authoritative source is a running session's `system:init`, and the composer's `/` is pressed exactly when there is not one yet — so the picker fell back to the shipped table, and no shipped table can ever close that gap: two thirds of the real list is skills and plugins, i.e. facts about THIS install. So the report is now **remembered** (per engine, and per agent where an agent has folders of its own), written by every door that sees one and read by the ones that cannot. Nothing is spawned to learn it — a session started for its own reasons pays for it once and every later composer is right. `toolbox.slashCommands` reads the same record, so an agent asking "what could I type here" is told what the picker offers.
- **‼️ And a report is a COMPLETE answer, not an addition:** Measured against a real Claude: 49 names, and `/cost` — which is in the shipped table — is not among them. Offering it anyway teaches a command that answers "unknown", so once a process has named its commands, a shipped row it did not name is dropped. The disk is untouched by this: a file that exists is a command whether or not a running session listed it.

### 3.337.0 — K-32: Çift Motor Paritesinin Ölçülmesi (2026-08-30)

- **Temel Geliştirme:** 14 slash komut kokpiti tamamlandı (katalog · arayüz · satır · kabul)
- **Teknik Detay ve Doğrulama:** **done** — 3.337.0 (commit v11.160 / 98c1fc0). Kabul yarısı. Zaten yapılmış olanlar sayıldı, EKSİK OLANLAR yazıldı: (1) TÜREVDEN PARİTE — `parity.manifest.json` Konsolun `slashCommands` mesajı ile `toolbox.slashCommands` op'unu aynı yetenek sayıyordu; bunu DOĞRU KILAN şey artık test ediliyor: sayfanın kolu kendi kataloğunu kurmuyor, aynı `scanSlashSources` + `getSlashCommands`'i çağırıyor ve kapı TÜM kataloğu veriyor (o mesajda bir `q` olsaydı K-29'un kaçındığı gidiş-dönüş olurdu).
- **‼️ The Console's door and the bridge op are the same capability, and it is pinned by DERIVATION:** `parity.manifest.json` already said so; what makes it true is that the page's `slashCommands` handler calls the same `scanSlashSources` + `getSlashCommands` rather than assembling a catalog of its own. A second assembler would drift on the first engine anybody added, and the symptom would be an agent being told about commands the picker never offers. The sweep also checks the door hands over the **whole** catalog — the narrowing is the page's, per keystroke, and a `q` on that message would be the round trip K-29 was built to avoid.
- **‼️ X-97's `provider` is carried and does not narrow — now measured as such:** A provider decides which *models* a session may run on; nothing anybody has measured says it decides which *commands* the CLI offers. The op accepts it and returns the identical list, and the test says why: a filter invented here would take commands away on the strength of a guess, and the loss would look exactly like a catalog that failed to scan.

### 3.336.0 — K-31: Slash Komutunun Kime Ait Olduğu ve Çalışamayacağı Yerin Tespiti (2026-08-30)

- **Teknik Detay ve Doğrulama:** **done** — 3.336.0 (commit v11.159 / a9e1e32). Seçici satırı artık adın ve cümlenin söyleyemediği iki şeyi söylüyor. (1) ROZET: CLI'nin kendi komutu MOTOR rozetini takıyor — `window.AFEngine.badge` ile, yani kartta/turda/oturum satırında hangi renkse o (X-110).
- **Whose command it is, in the badge every other surface draws:** A command the CLI itself owns wears the ENGINE badge (X-110, the same colour as on a card, a turn and a session row): `/model` on Claude and `/model` on Codex are different programs' commands, and a list that called both of them "engine" would be hiding the one thing that decides whether it can be typed here at all. A command that came from a file is nobody's engine, so it says which kind of file instead — **local · skill · workflow**.
- **‼️ And the one it cannot run here:** `/model` with no argument opens an interactive menu *in a terminal*. This session is hosted over stream-json and has no terminal to open it in, so it can only answer with text — offering it silently is offering a way to spend a turn on nothing. The row carries a ▤, and the sentence is a **line in the panel that follows the highlight**: `▤ /model opens a menu in a terminal. This session is hosted, so it can only answer with text — give it its argument (/model [name]) and it acts.` It is not a hover, because a panel over a list you are arrowing through covers the very rows you are comparing.

### 3.335.0 — K-30: Kompozitör Kutusunda '/' Slash Komut Seçicisi (2026-08-30)

- **Temel Geliştirme:** 30 slash komut seçici arayüzü (konsol kompozitörü)
- **Teknik Detay ve Doğrulama:** touch — Zemin atıldı, arayüz yok — commit v11.156 / d1e35d3 (ara commit: sürüm artmadı, paket yok). Eklenen: `slashQueryAt(text, caret) → {start, q} | undefined` (`core/slashCommands.ts`), saf ve imleç tabanlı. Kodladığı üç kural: komut bir kelime başlatır (URL/yol/kesir komut değil), yalnızca imlecin içinde olduğu token canlı sorgudur, boşluk adı bitirir (`/model opus` bir komut + argümandır).
- **‼️ A TYPEAHEAD, NOT A WINDOW, and that is the whole design:** The saved-prompt picker takes the screen because choosing a prompt is what you stopped to do; this opens *while* you are mid-sentence. A window that took the focus would mean typing the query twice — once to open it, once inside it. So the box keeps the caret, the box keeps the query, and the list draws above it. There is no filter input in the picker: **`/mod` in the composer IS the filter.**

### 3.334.0 — Kırmızı Kutu, İstenmeyen Hover ve Kapanmayan Palet Onarımları (2026-08-30)

- **U-121, settled — the box stays, and it goes red:** The mark filed under nothing keeps the ordinary checkbox, so it can still be ticked with four others and dropped in one press; what it gets is a **red frame**. No icon beside it and no second word: the colour is the whole message, and the sentence explaining it already lives in the State cell (ONE SUBJECT). The pick button that briefly stood there took the row out of every bulk act to say something the row could say by looking different.
- **The colour dot no longer opens a hover:** It said the same three sentences on every card in the list — a colour is a mark, it is kept against the session id, it survives the window closing — and it spilled under the conversation pane, so it was unreadable exactly where it appeared. A hover identical on twenty cards is not information; it is a paragraph dismissed twenty times. The dot is its own answer: the colour it is drawn in is the colour it carries. The **dead** dot keeps a short native title, because a control that refuses a press still owes a reason — and a native tooltip is drawn by the host above every pane, so it cannot be clipped by the one it sits in.
- **The colour palette closes the way everything else closes:** It was openable and un-closable: every control inside it stops the click, so the only way out was the same dot that opened it, and it stood over the next card while the reader worked on. A click anywhere else now shuts it, and so does Escape. The listener is on the document and bound once — a repaint rewires the dots, and a close handler rebound with them would stack up one per repaint — and it repaints only when something was actually open.

### 3.333.0 — K-29: Slash Komut Kataloğu Çekirdeği ve Bridge Desteği (2026-08-30)

- **Temel Geliştirme:** 29: slash komut katalogu ve saglayici adaptoru
- **Teknik Detay ve Doğrulama:** **done** — 3.333.0 (commit v11.155 / c03c29c). `core/slashCommands.ts`: `SlashCommand` tipi (name · description · scope engine|local|skill|workflow · engine · args · source · tui · reported), `BUILTIN_SLASH` motor tablosu, `getSlashCommands(query)`, `narrowSlash(list, q)`, `mergeReported(had, next)`. Disk yarısı `core/toolbox.ts` → `scanSlashSources(agentDir, home)` (kullanıcı kapsamı önce, ajan kapsamı sonra — yakın olan kazanır).
- **‼️ The finding that shaped it, measured rather than assumed:** A real Claude `system:init` on this machine named **47** slash commands, and the list mixed the CLI's own (`/model`, `/compact`, `/context`) with the SKILLS this machine happens to have installed (`/dataviz`, `/account-signup`) and two internal names nobody types (`__remote-workflow`). No table shipped inside Agent Farm can be right about that. So the catalog is a **merge**, not a table.
- **Precedence is one-way: disk beats the session's report beats the shipped table:** — a file is the only source with a description somebody wrote on purpose. A second `system:init` (a resume, a `/reload-skills`) **adds** rather than replaces, so a picker never loses commands it had a moment ago. Internal names beginning `_` are dropped rather than offered.

### 3.332.0 — S-34: Ajanın En Son Kurulumunun Her Başlatma Kapısının Hafızası Olması (2026-08-30)

- **Temel Geliştirme:** 34: son kullanilan baslatma kurulumu her kapida
- **Teknik Detay ve Doğrulama:** **done** — Launcher artık en son kullanılan kurulumu YÜZEYİYLE birlikte açıyor. Motor/model/effort/izin zaten hatırlanıyordu; eksik olan tek boyut pencereydi (lastLaunch kaydına `surface` eklendi, sıra: çağıranın istediği → bu ajanın kendi sonu → pencerenin son cevabı → terminal). Ayrıca Start satırı kurulumun hangi kayıtlı profile denk düştüğünü söylüyor — hatırlanan bir isim değil, `matchProfile` ile türetiliyor, yani model satırı değişince iddia da düşüyor.
- **Now it is a layer, and every door stands on it:** The resolution order is the same everywhere: what this launch states → what this AGENT was last started with → the agent's engine defaults → `agentFarm.launchDefaults`. Reading is one function (`seedLastLaunch`), writing is one function (`rememberLaunch`), and what is kept is decided once, in the core — so the next dimension added to a launch is remembered by the shape rather than by ten call sites, which is the failure this item is named for.
- **‼️ What the composer shows is what runs:** The boxes are seeded from the record and then left alone: an empty box is a person asking for the default, and re-applying the memory at Send would be the panel arguing with a control they had just cleared.

### 3.331.0 — M-31: Liste Sayımının Peşinden Gitmesi ve Senkronizasyon (2026-08-30)

- **Temel Geliştirme:** 31: backlog sayac seridi listeyi de daraltiyor
- **Teknik Detay ve Doğrulama:** **done** — 3.331.0 (commit v11.153 / 06ea9ac). Sayaç şeridine basış artık `blFilter.rel` eksenini de yazıyor: whole → `['top']` ("wholes only"), every → `null` ("any"). Doğruluğun sebebi: `top` yüklemi (`!i.parent`) ile yuvarlamanın saydığı yüklem (`blCounted`) BİREBİR aynı — o yüzden liste, rakamın saydığı satırların tam kendisi oluyor, yakını değil.
- **Now the press moves the family filter with it:** `⊟` ticks *wholes only*, `⊞` puts the axis back to *any* — and because "wholes only" is the SAME predicate the roll-up counts by (nobody's part), the rows on screen are exactly the lines behind the number, never a near-miss.
- **‼️ The arrow points one way:** The strip writes the axis; the axis never writes the strip. Narrowing to *part of something* is a question about the family tree, not an instruction to change what the headline counts. And what you pick AFTER a press stands — change the axis, or clear the filters altogether, and nothing re-applies it until you press the figure again.

### 3.330.0 — K-35: Konsol Kartında Renk Etiketi Desteği (2026-08-29)

- **Temel Geliştirme:** 35: konsol kartlarina renk etiketi
- **Teknik Detay ve Doğrulama:** **done** — Kapandı — 3.330.0 (commit v11.152 / d829ca2). Sol panel birbirine benzeyen kartlardan oluşan bir sütun; "wiki ile ilgili olanı" bulmak her seferinde okumak demekti. Renk artık bir İŞARET: pin ve etiketlerle aynı türden şey (`core/sessionmarks.ts` → `color`, `normalizeColor`, `setColor`, `colorOf`, `SESSION_COLORS`), oturum kimliğine göre dosyalanıyor, kalıcılığı globalState'ten bedava geliyor ve `SessionIndex.applyMark` onu her `SessionInfo`'ya yansıtıyor.
- **So a session can carry a colour:** , picked from a dot at the bottom-right of its card: ten fixed swatches, a colour of your own, and "none" to take it off. It is a MARK — the same kind of thing as the pin and the labels (`core/sessionmarks.ts`), keyed by session id and remembered for ever.
- **‼️ Which is why the dot is on every card kind in that panel:** — live, "where you left off", and resumable. A colour that is right on two surfaces out of three is a colour nobody trusts on any of them.

### 3.329.0 — U-122: Vault Şeridindeki Her Nesnenin Bir Yol Olarak Davranması (2026-08-29)

- **Temel Geliştirme:** 122: Wiki vault ve prosedür bilgi şeridi etkileşim zenginliği
- **Teknik Detay ve Doğrulama:** **done** — Kapandı — 3.329.0 (commit v11.151 / 4f885c0). Şerit altı şey adlandırıyor, üçüne basmaya izin veriyordu: görüp kopyalayamadığın bir yol, adını okuyup açamadığın bir kutu ve ölü bir `<span>` olarak çizilen ajan prosedürü — aynı eksiğin üç yüzü. ‼️ `_REF/wiki.md` artık açılıyor: `agentRoots`'a göre çözülüyor (`WikiDeps.agentRoots` + `resolveProcedure`, çekirdekte — köprü ve sayfa aynı yolu görüyor), onu gerçekten tutan İLK kök kazanıyor, hiçbiri tutmuyorsa hiçbir şeyi açmayan bir bağlantı olmak yerine düz metin kalıyor.
- **📥 `_RAW_` is on the strip, with the count that is the reason to look at it:** The whole promised gesture is "drop a browser export in `_RAW_` and do nothing else"; a folder you have to hunt for in Explorer is that gesture with a hunt in front of it. Pressing it opens the folder.
- **Everything on the strip has a right-click menu:** — open it in the editor, show it in the folder, copy the absolute path, and for the root, open Wiki settings. Nothing there is new behaviour invented for a menu: each item sends the message the strip's own press already sends, so the menu and the button cannot drift.

### 3.328.0 — U-120: Çiplerin Hangi Kapsama Ait Olduğunu Bildirmesi (2026-08-29)

- **Temel Geliştirme:** 120: aday etiketleme popover'ında kapsam renk dili ve AFTip hover bilgisi
- **Teknik Detay ve Doğrulama:** touch — Yalnızca ÖLÇÜM yapıldı, kod yazılmadı — kota %80'de yeni bir kaleme başlamak yerine sonraki ajanı keşif turundan kurtarmak için. ‼️ YAPISAL ENGEL BULUNDU: popover'ın seçili konuları `state.picked` — DÜZ BİR STRING DİZİSİ (`media/afWiki.js`), ve `window.AFCombo.html({ picked })` bu diziden çip üretiyor (`media/afCombo.js` satır ~78: `picked.map(p => '<span class="afc-chip">' + esc(p) + …)`). Yani bir çipin HANGİ işaretten geldiği — dolayısıyla kapsamı — çipin çizildiği yerde YOK.
- **A session-wide chip is now warm:** (the editor's own warning pair, so it holds its contrast in both themes) and a partial one keeps the ordinary accent. The rule is the same from a turn's badge and from a session's, because both popovers are the same panel.
- **‼️ And what a chip reports is what pressing "Keep it" LEAVES BEHIND:** — every turn the topic is already kept on, plus the scope now chosen. That second half is why it is worth repainting: choosing *Whole session* turns the partial chips warm **before** the press rather than after it. The hover states the count the way the cockpit says it (`Whole session (10 turns)` · `3 turns (3/10)`), then the span (`Turns: 1–3, 7`), then where the topic stands today and what this press would add.

### 3.327.0 — U-121: Onay Kutusunun Derleme Kutusundan Ayrıştırılması (2026-08-29)

- **Temel Geliştirme:** Wiki kokpiti araç çubuğu, master seçim kutusu ve toplu geri kazanma (U-121)
- **Teknik Detay ve Doğrulama:** **done** — Üç ayrı sıkıntı, üçü de aynı hatadan: onay kutusu bir SEÇİM kutusu değil, DERLEMENİN kutusuydu. ‼️ Master kutu bu yüzden yalnız bir kez basılabiliyordu — her çizimde `checked` yazılmadan çiziliyordu, yani tarayıcı tıklaması her zaman “aç” diye okunuyordu; artık `checked`'i satırlardan, `indeterminate`'i kısmi seçimden alıyor (‼️ `indeterminate` bir ÖZELLİK, işaretlemeye yazılamaz, boyamadan sonra atanmalı — deselect-all'ı kıran şey tam olarak buydu) ve hover'ı iki basıştan hangisini yapmak üzere olduğunu söylüyor. `dropped`/`compiled` sekmelerinde hiç kutu yoktu; artık bir koşunun çıkmış olduğu satır dışında her satır seçilebiliyor ve toplu gruba `↺ Reopen` eklendi.
- **‼️ So the master box could only be pressed once:** It was drawn unchecked on every repaint, which means a browser click always read as *turn on*: ticking everything worked and untticking it was impossible — the one gesture that box exists for. It now takes its `checked` from the rows themselves and its `indeterminate` from a partial selection (a property, so it cannot be written in markup and has to be set after the paint), and its hover says which of the two presses you are about to make.
- **And the `dropped` and `compiled` tabs had no boxes at all:** , so five dropped marks could only be brought back one row at a time — which is what made 🚫 Drop feel irreversible even though every row has had its own ↺ all along. Every row is tickable now except the one a run is out for, where anything you do fights the run, and the bulk group gained **↺ Reopen**.

### 3.326.0 — X-140: Bırakılan Dosyanın Derleme Havuzundaki Rotası ve Hedefi (2026-08-29)

- **Temel Geliştirme:** Derleme sözleşmesi ve arşivleme protokolü (X-140)
- **Teknik Detay ve Doğrulama:** **done** — Brief ve derleme promptu bir CLI transkriptinin dilbilgisiyle yazılmıştı — tur kapsamı, tur numaraları, her turun ne ile açıldığı — ve bir tarayıcı dışa aktarımı koşuya diğer her başlığın aynısı bir başlığın altında, altında “turn scope: whole file” yazarak veriliyordu. ‼️ Artık bırakılan dosya kendi bloğunun İLK SATIRINDA ilan ediliyor (EXTERNAL FILE — NOT A CLI SESSION, tamamını oku, turu yok); notu “neden saklandı” değil ⚠️ KULLANICI DİREKTİFİ olarak gidiyor ve promptta koşunun kendi yargısından üstün olduğu yazıyor — bir dosyada daraltacak tur numarası olmadığı için o notun statüsü gerçekten farklı. ‼️ Derlenen bırakma `_RAW_/_DONE_` altına AJANIN eliyle, raporla aynı nefeste taşınıyor: eklenti bir sayfanın yazıldığını asla öğrenmez, bunu yalnız `wiki.candidates.edit {state:"compiled"}` söyler, dolayısıyla hiçbir şey yazmamış bir koşunun gücüyle taşınan dosya havuz hâlâ pending derken işlenmiş sayılırdı.
- **‼️ And a compiled drop is moved into `_RAW_/_DONE_` — by the agent, in the same breath as the report:** The extension never learns that a page was written; only `wiki.candidates.edit {state:"compiled"}` says so, so a file moved on the strength of a run that then wrote nothing would be filed as done while the pool still said pending. One actor, one moment. The prompt names the pair together and says what each half costs alone: a file left in the drop box is offered to the next compile as though nothing had happened, and a file moved without the report leaves the pool waiting for a file that is no longer where the mark points.

### 3.325.0 — U-117: Bırakılan Dosyanın Oturum Taklidi Yapmasının Engellenmesi (2026-08-29)

- **Temel Geliştirme:** Wiki kokpitinde ham dosya yönetimi (U-117)
- **Teknik Detay ve Doğrulama:** **done** — X-139’un doldurduğu havuzdaki harici dosyalar artık kokpitte oturum taklidi yapmıyor. Kaynak hücresinde dosyanın kendi adı + RAW/DONE rozeti (oturumlar karşılık gelen işareti taşıyor); konusuz ham aday kendi aşaması olarak çiziliyor (🌱 needs a topic), onay kutusunun yerinde seçiciyi açan bir düğme var, boş konu hücresi tire yerine “pick a category” diyor. ‼️ Kural yalnızca görsel değil, gövdenin kendisi: startCompileRun konusuz işareti DOSYA ADIYLA reddediyor (bir id hangi bırakmayı dosyalamayı unuttuğunu söylemez), all:true onları dışarıda bırakıyor — tek bir triaj edilmemiş dosya Compile All’u sonsuza kadar tıkayamaz — ve dışarıda bırakmak geriye hiçbir şey bırakmazsa ret hangi dosyaların konu beklediğini söylüyor.
- **‼️ And the stage a drop arrives in is its own state, not `waiting`:** A raw file lands with no topic on purpose — a topic is the key a page is filed under and a scan will not guess one. So the row reads `🌱 needs a topic`, its empty topics cell says `pick a category…` instead of a dash, and where the tick box would be there is a 🌱 that opens the picker. Three stages, visible at a glance: dropped → filed → compiled.

### 3.324.0 — X-139: Wiki Bırakma Kutusunun Kendiliğinden Bir Havuz Olması (2026-08-29)

- **Temel Geliştirme:** `_RAW_` bırakma kutusu kendiliğinden bir havuz (syncRawCandidates; dosya bırakmak tek jest)
- **Teknik Detay ve Doğrulama:** **done** — 3.324.0 (commit v11.145 / f177312). `syncRawCandidates(root, store)` yazıldı; `wikiStatus` ve `wiki.candidates.list` ikisi de çağırıyor, yani kokpit kendini çizerken bir saniye önce bırakılan dosya zaten cevabın içinde. Bırakılan dosya ETİKETSİZ aday oluyor (`engine: raw-file`, `addedBy: auto-raw`, `topics: []`, id `wc-raw-…`); etiket dosyanın ilk gerçek satırı, YAML ön maddesi atlanıyor; yalnız `.md`/`.txt`.

### 3.323.0 — S-47: Resume Edilen Oturumun Her Motorda Kendisi Olarak Geri Gelmesi (2026-08-29)

- **Temel Geliştirme:** resume edilen oturum artık beş motorda da kendisi olarak geri geliyor (codex model/efor/izin, Konsol aynası üç boyut, gemini model, opencode çıplak id tamamlama)
- **Teknik Detay ve Doğrulama:** **done** — 3.323.0 (commit v11.144 / 2472b09). Beş motorun beşi de kapsandı, hepsi tek tek ölçülerek. CODEX: `lastModel` zaten yerel değişkende tutuluyordu (oturumu fiyatlandıran şey o) ama satıra hiç yazılmıyordu — ölçüldü, 110 rollout'un 2'si yanlış modelle resume olurdu; ayrıca `turn_context.effort` (110'un 60'ı) ve `sandbox_policy` üzerinden izin kipi (35'i).

### 3.322.0 — S-46: Antigravity Oturumunun Kendi Modeli ve Eforuyla Başlaması (2026-08-29)

- **Temel Geliştirme:** Antigravity oturumu kendi modeliyle başlıyor ve kendi modeliyle geri geliyor (defaultEffort haritası, eforsuz modelin çalıştırılmadan reddi, transkriptten model/efor okuma)
- **Teknik Detay ve Doğrulama:** **done** — 3.322.0 (commit v11.143 / b69927c). Üç parça da kapandı. (1) `readAgyCatalog` artık her modelin `defaultEffort`'unu da bildiriyor — etiketi yazan çağrının aynısı, yani "Default → medium" yazan kutu ile komut satırına giden değer bir daha ayrışamaz; efor almayan model (claude-sonnet-4-6) hiçbir şey kazanmıyor.
- **‼️ And the second half of S-45, on the engine it never reached:** Resume inheritance was built and tested against the Claude parser alone, so an Antigravity conversation came back on the fleet default — the exact failure S-45 exists to end, one engine over. This engine writes no model field anywhere; it staples a sentence to the user's step, and that sentence is the record:

### 3.321.0 — B-20: Bildirim Panosu Eylemlerinin Köprü Üzerinden Yürütülmesi (2026-08-29)

- **Temel Geliştirme:** Agent Farm 3.317.0 → 3.321.0 (beş sürüm) + devir notu
- **Teknik Detay ve Doğrulama:** **done** — Kapandı — 3.321.0 (v11.142 / 2691044). Üç maddesi de yapıldı, dört op: `notices.edit` (yalnızca geçilen alan değişir; ilk düzenleme orijinali anlık görüntüler; hiçbir şeyi değiştirmeyen düzenleme reddedilir), `notices.pin`, `notices.stars`, `notices.undo`. ‼️ SONRAKİ OKUYUCUYA İKİ ŞEY: (1) YILDIZ ÖLÇEĞİ 0-3'TÜR VE ARALIK DIŞI DEĞER KIRPILMAZ, SIFIR OLUR (`coerceStars`, `src/core/notices.ts:181`) — beş yıldız sanıp `stars: 5` gönderen bir çağıran puanı SİLER.
- **‼️ And undo is why the store changed, not just the ops:** The board's Undo kept the removed notices on the **panel**, which made it a property of a window: an agent that dismissed the wrong batch over the bridge had nothing to take back, and the person's own Undo vanished the moment the board was closed. The memory lives on the store now, so the button and the op undo the same removal — one deep, deliberately, because Undo here means "that was a mistake" and not "walk back through the day".

### 3.320.0 — X-138: Wiki Bırakma Kutusu (Göreceli ve Kendi Kendini Onaran) (2026-08-29)

- **Teknik Detay ve Doğrulama:** **done** — Kapandı — 3.320.0 (v11.141 / 095fd09). Kalemin dört maddesi de yapıldı. `WIKI_RAW_REL = '_RAW_'` ve `WIKI_DONE_REL = path.join('_RAW_','_DONE_')` (`src/core/wiki.ts`), `ensureRawDirs(root)` → `{ raw, done, ready, created[], error?
- **Relative to the root, never absolute:** `agentFarm.wikiRoot` is a setting the user retypes on every machine, `%USERPROFILE%` and all. A path baked into the code would be right on exactly one computer.
- **‼️ Self-healing, because the folder lives in the user's own vault:** — where Obsidian, a sync client and their own hand all reach it. It *will* be deleted, renamed, or simply absent on a fresh machine, and every one of those is a normal Tuesday rather than an error worth a dialog. `ensureRawDirs` makes whatever is missing, recursively and silently, and says what it had to make. It runs on `scaffoldWiki`, `wikiHealth` and `wikiStatus`: asking "is something wrong here" is the moment a user asks, so answering "`_RAW_` is missing" and leaving it missing would be a diagnosis where the fix costs one syscall.
- **‼️ And it still refuses to create the ROOT:** `mkdir -p <root>/_RAW_/_DONE_` brings the root into existence too — and the root is a hand-typed path. A typo would quietly become a real empty folder on the disk while the real wiki sat untouched beside it, and the health check meant to *report* the problem would have manufactured the evidence that there wasn't one. An unset root is refused outright: `path.join('', '_RAW_')` is the **relative** `_RAW_`, which would appear in whatever directory the process happens to be in.

### 3.319.0 — U-111: Ajan Sayfasında Zaman Aralığı Seçicisi (2026-08-29)

- **Teknik Detay ve Doğrulama:** **done** — Kapandı — 3.319.0 (v11.140 / 599a322). Dashboard'un zaman aralığı satırının aynısı ajan sayfasına eklendi (`rangeControls()` → `AFHeader.controls`), 30d varsayılanı ile — yani satırın gelmesi sayfanın ilk görünüşünü değiştirmiyor. Yönettikleri: maliyet kartı, oturum kartı, günlük maliyet grafiği (120 günü aşınca haftalık kova).
- **The same row, on the agent page:** the first week day by day, then 14 / 30 / 90 / 180 / 365, then two dates. It opens on **30d**, which is exactly what the page already drew — the row arriving changes nothing about the first thing you see.
- **‼️ And the two cards it cannot govern say so:** Tool calls are kept per session, not per day, so there is no honest way to cut them by a span; the memory count is a picture of the present. A page where some cards are scoped and others silently are not is worse than one where none are.
- **‼️ Sessions are counted from their spans, not from the table:** The obvious implementation — filter the sessions array — is wrong: that array is a *pool*, the union of the true top-N per sortable criterion, built for a table you sort. On a busy agent the count would quietly stop growing at the cap, and it would look perfectly right on every quiet agent. The panel now ships two numbers per session for **all** of them, every engine, and the page counts the ones **overlapping** the span — a conversation opened on Monday and still being written on Friday belongs to every day in between.

### 3.318.0 — K-33: Komutun PTY Yerine Hazır Olan Kabuğa Verilmesi (2026-08-29)

- **Teknik Detay ve Doğrulama:** touch — TEŞHİS KONDU, DÜZELTME YAPILMADI (bilerek — aşağıda sebebi). Kalem 'iki yarış durumu' diyor; biri ZATEN ÇÖZÜLMÜŞ, diğeri tam olarak yerinde bulundu. (1) ÇÖZÜLMÜŞ OLAN — süreç devri.
- **The shell was still starting:** Every terminal here was driven the same way: `createTerminal` … `show()` … `sendText(command, true)` **on the very next statement** — before the shell inside the pty had finished running the user's own startup (a PowerShell profile, oh-my-posh, conda init). On a slow profile the written line is swallowed by or interleaved with that startup's output, and a `claude --resume <id>` that loses its tail runs as a bare `claude`: a fresh process, no conversation, the onboarding screen. The session looks like it evaporated. (The **external** terminal path was always immune — it writes the command to a `.cmd` file first — which is why switching to it "fixed" it.)
- **The line now waits for the shell to report in:** VS Code can only install its own integration once the shell has started, so `Terminal.shellIntegration` becoming defined is exactly the signal that was missing. ‼️ **The delivery is unchanged** — still `sendText`. `shellIntegration.executeCommand` looks made for this and is deliberately not used: it sends ^C first to interrupt whatever is running, and what these terminals run is a full-screen TUI.
- **All three doors:** every terminal session the extension opens, the task terminal (whose `exit` line is still second, and still after the command it is meant to outlive) and the session viewer's own fallback.

### 3.317.0 — S-45: Resume Edilen Oturumun Model, Efor ve İzinlerle Dönmesi (2026-08-29)

- **Teknik Detay ve Doğrulama:** touch — KEŞİF YAPILDI, KOD YAZILMADI. Kalem üç boyut istiyor (model · efor · izin modu); ölçüldü, ÜÇÜ AYNI DURUMDA DEĞİL ve bu, işin şeklini tamamen değiştiriyor. MODEL — ZATEN ELDE.
- **The transcript is the answer, and it is the right one:** A `/model` typed INSIDE a session changes the run without Agent Farm ever hearing about it, so anything written down at launch would be stale exactly when it mattered. The file records what actually happened, so a resume now reads it:
- **All four doors, not the two the report named:** The Console's own resume, the terminal resume, *Resume in Console* (which already reached for the model — and reached wrong) and the `sessions.start` bridge op. `sessions.context` was resuming on the wrong model for the same reason and is fixed with them.
- **‼️ Order, and one deliberate exception:** In the panels the transcript comes **first**: the composer's boxes are *seeded from* the fleet defaults, so the value travelling with a resume click is a default rather than a choice, and anything placed after it could never win. On the bridge it is the other way round — an argument a caller actually wrote is the most deliberate answer in the room, so it beats the transcript, and the defaults are consulted only for what neither answers.

### 3.316.0 — K-34: Oturum Açan Her Kapının Aynı Kurulumu Taşıması (2026-08-29)

- **Temel Geliştirme:** işitsel kokpit tamamlandı + Superpowers her kapıda (üç sürüm: 3.314.0 A-26 canlı diyalog okuyucu · 3.315.0 M-30 Superpowers işin kendi boyutu · 3.316.0 K-34 başlatma paritesi ve kompozitörün korunması)
- **Teknik Detay ve Doğrulama:** **done** — Kapandı — 3.316.0 (v11.137 / 0ca6699). Kalemin istediği her şey yapıldı. (a) `⚡ Superpowers` artık bir başlatma boyutu: `LaunchOptions` üzerinde, yani çok boyutlu başlatıcı, kenar çubuğu ağaç satırları, yüzey seçici, KAYITLI PROFİL ve terminalin kendisi taşıyor.
- **`⚡ Superpowers` is a launch dimension now:** , like the model and the permissions: on `LaunchOptions`, so the multi-dimension launcher, the sidebar tree rows, the surface picker, a **saved profile** and the terminal itself all carry it. The launcher shows what will actually happen — *`agent default (on for developer)`* — rather than leaving the reader to guess which setting answered.
- **‼️ Three answers, and the empty one is not "off":** *Agent default* hands the decision back to `agentFarm.superpowersDefaults`, which is what every session started before this row existed did. A profile that says nothing about the discipline **clears** it on load rather than leaving the last launcher's answer standing — the same rule the model already followed.

### 3.315.0 — M-30: Superpowers Mühendislik Disiplininin İş Boyutu Olması (2026-08-29)

- **Teknik Detay ve Doğrulama:** **done** — Kapandı — 3.315.0 (v11.136 / 1618280). Dört maddenin dördü de yapıldı. (1) Yeni görev formunda Model/Efor/İzinler'in yanına `⚡ Superpowers` kutusu; aynı kompozitörü görev, zamanlayıcı, tetikleyici, şablon ve iş akışı adımı paylaştığı için beşi birden kazandı.
- **`⚡ Superpowers`:** , in the new-task form beside Model, Effort and Permissions — so a **task, a schedule, a trigger, a template and a workflow step** can each say it, and an automation that fires at 03:00 says it when it is *written*, which is the only moment anybody is there to say it.
- **‼️ THREE ANSWERS, AND THE EMPTY ONE IS NOT "OFF":** *Agent default* hands the decision back to the agent's own setting — which is exactly what every task ever written before this row existed said, and what they all keep saying. *On* and *Off* are a person overriding that default for this job alone. A checkbox would have had two states and would have had to invent an answer for every existing automation on the day it shipped.
- **An explicit pick beats the default, and a retry inherits it:** A rerun that quietly fell back to the agent's setting would be a different job from the one being retried — the same defect the engine, the model and the finish sound each had here once.

### 3.314.0 — A-26: Canlı Diyalog Okuyucu (DialogueSpeaker) ve Sesli Yanıt (2026-08-29)

- **Teknik Detay ve Doğrulama:** touch — Dört parçanın İKİSİ bitti, ikisi duruyor — kalem AÇIK. (1/4) `sanitizeForSpeech` + `cutForSpeech` (commit v11.133 / 669ee39): markdown'ın sesli parafrazı — çitli blok boyutuna, tablo boyutuna, yol son parçasına, link etiketine, sembol yığını duraklamaya; her blok noktayla bitiyor; tavan DIALOGUE_MAX=1200 ve kesme cümle sonunda, kesildiğini DIALOGUE_MORE ile söylüyor. (2/4) `DialogueSpeaker` (commit v11.134 / 2c18f74): kesilebilir çalıcı, kendi kanalında.
- **`🔊 Read this session aloud`:** , in the same right-click the mute and the voice already live in (`Sound for this session…`). Turn it on for the ONE conversation you walked away from, and every turn it finishes is read out loud in that session's own voice.
- **Per session, and only per session:** There is no fleet-wide "read everything": eight agents reading over each other is a crowd, not a cockpit. For the same reason there is **one reader for the window** — a newer answer cuts short an older one still being read, on purpose.
- **It is not part of the alert plan:** A session with every ♪ box unticked still reads when you ask it to, and a muted fleet does not silence it: mute exists to stop noise nobody chose, and this switch was thrown by hand. It does not go through the alert queue either — that queue serialises short tones, and a minute-long reading would hold every chime in the farm behind it.

### 3.313.0 — U-123: Nudge Uyarısının Ham JSON Yerine Kendi Kontrolünü Alması (2026-08-29)

- **Temel Geliştirme:** 24 (Sound on finish) + U-123 (dürtme kontrolü); A-26 motor yarısı commit'li
- **Teknik Detay ve Doğrulama:** **done** — 3.313.0 (commit v11.132 / 05da57b). Alert sounds kartındaki SON ham JSON kutusu kapandı. `⏰ Nudge after [3] min, [2] × [ton]` kapı şeridinde, mute ve sessiz saatlerin yanında — ait olduğu yer orası, çünkü kapının sorusunu ("bir ses olacak mı") cevaplıyor, tablonun sorusunu değil.
- **`⏰ Nudge after [3] min, [2] × [tone]`:** , on the gate strip, beside the two switches that decide whether the FIRST alert is heard at all. That is where it belongs: it answers the gate's question — *will a sound happen* — not the table's, *which sound*.
- **And what is waiting right now is on the strip:** `2 waiting` is the number of questions actually armed for a reminder at this moment; a session that is answered or leaves the list disarms itself, so it is what is outstanding rather than a running total. **The card head says the nudge is on** too, beside the armed count — a policy that produces an unrequested chime some minutes later is worth a badge.

### 3.312.0 — A-24: Oturum Bittiğinde Çalacak Sesin Belirlenebilmesi (2026-08-29)

- **Teknik Detay ve Doğrulama:** **done** — 3.312.0 (commit v11.131 / 4c1fd2a). Görev · zamanlayıcı · tetikleyici formlarına "Sound on finish" alanı geldi: Default | bir ton | Silent. Üç sürümdür bekleten itiraz ("Sessiz dürüstçe yapılamaz") A-22'nin oturum susturmasıyla çözüldü.
- **Sound on finish:** , on the New-task form and on the schedule and trigger editors beside it: *Default* · a tone · *Silent — no sound at all*. Drawn for every run, headless included — a headless run has no window to open, but it does END, and it is the one nobody is watching.
- **It adds no step to the alert chain:** The moment the run's session has an id, the pick is written onto **that session's own step** — the one A-23 built, that the resolution chain already reads and the Live Timeline already draws. So the row goes on saying "this session's own choice" and is telling the truth. Declared ids (a Console run, a resumed conversation) are stamped at the spawn; an ordinary headless run is stamped the moment its transcript names it.
- **Picking a tone also arms that session's ♪:** — otherwise the choice would be accepted, stored, drawn, and silent whenever the fleet switch happened to be off, which is the defect the field exists to fix.

### 3.311.0 — A-25: Ses Ayarları Şeridi ve Oturum Sesi Menüsü (2026-08-29)

- **Temel Geliştirme:** 25 sesli anons seridi ve oturum sesi menusu
- **Teknik Detay ve Doğrulama:** **done** — Teslim edildi — 3.311.0 (commit v11.130 / 01a479e). `agentFarm.alerts.speak` artık Alert sounds kartında kendi şeridi: kapının altında, tabloya girmeden önce — anahtar, ses seçici (Windows'un İKİ kayıt defteri de, her satırda dil ve motor), hız, seviye, cümle kutusu ve test düğmesi. Anahtar `ALERT_CARD_KEYS`e girdi, yanında ham JSON kutusu kalmadı.
- **The strip:** Under the gate, on the same card, in the order the two are read: *is anything heard at all* → *and what does it say*. Switch · voice · rate · volume · the sentence · ▶ test. `agentFarm.alerts.speak` no longer appears as a box beside it.
- **Every voice on the machine, with its LANGUAGE on the row:** Both of Windows' registries, asked of the machine and not guessed, sorted by language — because an `en-US` voice reading Turkish is not accented, it is unintelligible. The answer costs a PowerShell process, so it is asked once when the card opens and kept; ↻ is for the language pack installed a minute ago.

### 3.310.0 — A-20: Makinedeki Tüm Sesler ve Oturum Başına Ses Ataması (2026-08-29)

- **Temel Geliştirme:** 20 İşitsel Kokpit — çok formatlı çalıcı motoru, on modern ses ve yerel TTS anonsu (OneCore köprüsü dahil)
- **Teknik Detay ve Doğrulama:** touch — 1. ADIM YAPILDI, kalem AÇIK (3.299.0, commit v11.115). Tasarım notunun (10_Notes/A-18 …) yapım sırasındaki adım 1'i: tools/make_alert_sounds.js on sesi ÜRETİYOR (indirmiyor — lisans), chime-soft = turn-ready.wav ve yeniden üretilmiyor; src/core/alertVoices.ts çözünürlük zincirini (oturum>ajan>ayar>varsayılan) tek yerde cevaplıyor ve hangi basamaktan geldiğini de söylüyor; kayıp dosya alt basamağa düşüyor, sessizliğe değil.
- **Windows keeps its voices in TWO registries and `System.Speech` sees one:** SAPI 5 reads `Speech\Voices\Tokens` — David and Zira, en-US. Every voice a user has ever installed from Settings goes to `Speech_OneCore\Voices\Tokens`, and `SelectVoice` can neither list nor choose one. Measured on this machine: SAPI 5 had two voices, OneCore had four — one of them **`Microsoft Tolga — Turkish`, already installed and completely unreachable.** So the advice the last release printed ("install a language pack") was for a problem the user did not have.
- **The COM server underneath reaches both:** `SpVoice.GetVoices()` enumerates the SAPI 5 set only, but `SpObjectToken.SetId(<registry path>)` loads ANY token by id, OneCore included — verified out loud, in Turkish, before it was written. The Windows backend is now that, walking both registries to find a voice by name: **`Tolga` finds `Microsoft Tolga - Turkish (Turkey)`.** Every voice on the machine is selectable, in every language it has.

### 3.309.0 — A-20: Filonun Hangi Ajan Olduğunu Söyleyebilmesi (SAPI/say) (2026-08-29)

- **Teknik Detay ve Doğrulama:** touch — 1. ADIM YAPILDI, kalem AÇIK (3.299.0, commit v11.115). Tasarım notunun (10_Notes/A-18 …) yapım sırasındaki adım 1'i: tools/make_alert_sounds.js on sesi ÜRETİYOR (indirmiyor — lisans), chime-soft = turn-ready.wav ve yeniden üretilmiyor; src/core/alertVoices.ts çözünürlük zincirini (oturum>ajan>ayar>varsayılan) tek yerde cevaplıyor ve hangi basamaktan geldiğini de söylüyor; kayıp dosya alt basamağa düşüyor, sessizliğe değil.
- **A spoken line can, and it costs nothing:** `System.Speech` has been in every Windows install for twenty years; macOS `say` and Linux `spd-say` are equally already there. No network, no account, no model, no per-token anything.
- **It is an addition to the tone, not a replacement:** A tone reaches the ear in half a second and is recognised before it finishes; a sentence takes two and cannot be told from a podcast in the next room until it is over. So the tone still says what kind, immediately, and the sentence arrives behind it saying which one. **Both ride in one queue ticket** — submitted separately, another lane's chime would land in the middle of this one's sentence, which is the exact overlap the queue exists to stop. It follows the same mute, the same quiet hours and the same per-session mute.
- **It ships off, and out of the box announces only `question`:** That is the argument for the feature rather than a limitation of it: `question` is the one event where an agent is STOPPED and the cost of not knowing is the whole run standing still. A fleet that announces every finished turn out loud is one you silence in an afternoon — and then you hear nothing at all, including the question.

### 3.308.0 — A-20: On Ses Nesnesi ve Modern Ses Paleti (2026-08-29)

- **Teknik Detay ve Doğrulama:** touch — 1. ADIM YAPILDI, kalem AÇIK (3.299.0, commit v11.115). Tasarım notunun (10_Notes/A-18 …) yapım sırasındaki adım 1'i: tools/make_alert_sounds.js on sesi ÜRETİYOR (indirmiyor — lisans), chime-soft = turn-ready.wav ve yeniden üretilmiyor; src/core/alertVoices.ts çözünürlük zincirini (oturum>ajan>ayar>varsayılan) tek yerde cevaplıyor ve hangi basamaktan geldiğini de söylüyor; kayıp dosya alt basamağa düşüyor, sessizliğe değil.
- **So the ten new ones are ten different OBJECTS:** The partials of a real thing are not a harmonic series, and that — not the envelope — is what makes wood sound like wood: a marimba bar rings at 1 : 3.9 : 9.2, a tubular bell at 1 : 2.76 : 5.40. Three new instruments in the generator (a struck body with arbitrary partial ratios, a pitch glide whose phase is integrated so it does not click, and a seeded noise transient) make: **Crystal** · **Intercom knock** · **Zen bowl** · **Deep sonar** · **Lullaby** · **Marimba** · **Pop** · **Thin ticks** · **Bell, urgent** · **Pulse**.
- **And they are measured, because nobody can listen to them in a review:** `node tools/make_alert_sounds.js --stats` prints each voice's length, brightness and body, and checks the pairs that carry the feature. The two defaults — Crystal for a finished turn, Intercom knock for a question — sit a factor of **4.7 apart in brightness** and differ as much again in body: one is struck glass, the other a knuckle on a panel with almost no pitch at all. That is a difference you hear through a closed door, which a difference of melody is not.
- **All five defaults changed, and that is said out loud rather than shipped quietly:** A default nobody hears is not a delivery. What is safe about it: alerts ship OFF, so anybody hearing anything has been to the settings page already; and a voice you CHOSE lives a step above the default in the chain and is untouched. Only "sound on, never picked a voice" moves.

### 3.307.0 — A-20: Windows Sesli Uyarısının Gecikmesiz Çalması (2026-08-29)

- **Teknik Detay ve Doğrulama:** touch — 1. ADIM YAPILDI, kalem AÇIK (3.299.0, commit v11.115). Tasarım notunun (10_Notes/A-18 …) yapım sırasındaki adım 1'i: tools/make_alert_sounds.js on sesi ÜRETİYOR (indirmiyor — lisans), chime-soft = turn-ready.wav ve yeniden üretilmiyor; src/core/alertVoices.ts çözünürlük zincirini (oturum>ajan>ayar>varsayılan) tek yerde cevaplıyor ve hangi basamaktan geldiğini de söylüyor; kayıp dosya alt basamağa düşüyor, sessizliğe değil.
- **Measured: every Windows alert was eight seconds late:** `MediaPlayer` is a WPF `DispatcherObject`, and its `MediaEnded` event is raised on a Dispatcher that `powershell -Command` never runs. So the event never came, the process sat in its wait loop for 17.7 seconds, this module's own timeout killed it at eight, the backend was reported as broken — and the sound you finally heard was the SoundPlayer fallback, announcing a turn that had ended eight seconds earlier. Nothing in the extension was in a position to notice: the fallback returned success, so the alert was working, just late enough to be useless.
- **The player asks the file how long it is instead:** `NaturalDuration` is filled in by the media engine and needs no dispatcher — which makes it two answers at once: how long to wait, and, when it never arrives, the codec saying it cannot open this file. Measured end to end: **1.8 s for a `.wav`, 2.3 s for an `.mp3`**, and a file no codec can open now reports that, in those words. Before, a refused file left through the same silent loop with exit 0 and was reported as PLAYED.
- **And it was reported as played:** That is the second half of the same bug and the more dangerous one: `.mp3`, `.flac` and anything else the codec refused came back green. A user who pointed an alert at their own file was told it worked and heard nothing, for ever.

### 3.306.0 — A-22: Birlikte Biten Sekiz Ajanın Sırayla Ses Vermesi (Arbiter) (2026-08-29)

- **Teknik Detay ve Doğrulama:** **done** — İki sürümde kapandı. 3.305.0 KAPI: src/core/alertGate.ts saf çekirdeği (quiet hours + silence), durum çubuğunda tek tıklık 🔇 (src/views/muteBar.ts — ilk kez bir şey silahlandırıldığında BELİREN, susturuluyken ekranda KALAN bir öge), gece yarısını saran sessiz saatler, ve oturum bazında susturma. 3.306.0 KUYRUK: AudioArbiter (öncelik question > error > stalled > ended > turn-ready; 500 ms aralık son sesin BİTİŞİNDEN; tavan 6, taşarken en az acil olan düşer; aynı uyarının ikincisi tek uyarı) ve akıllı dürtme (yalnız 'question', varsayılan 3 dk, en fazla 2 hatırlatma, 30 sn'lik süpürge aynı zamanda silahsızlandırma).
- **One queue for the whole window:** Eight lanes is the normal case, and eight players started in the same 40 ms do not make eight sounds — they make ONE noise, out of which nothing can be told apart, which is the exact ability ten named tones exist to give. The sounds now go one at a time, ordered by how much the news matters: `question` first (the only event where the agent is STOPPED and waiting on you), then `error`, `stalled`, `ended`, and `turn-ready` last — the one that happens most and costs least to miss, because the Timeline shows it anyway.
- **The 500 ms gap is measured from the END of the last sound:** , not its start. The tones are up to 1.2 s long, so a gap counted from the start would let them overlap, which is the whole thing the queue exists to stop.
- **The queue has a small ceiling, and something IS dropped:** A backlog of twenty chimes is twenty seconds of noise describing a fleet that has since moved on — not merely useless but actively misleading. Over six waiting, the LEAST urgent goes and says so. The same alert twice is one alert.

### 3.305.0 — A-22: Çiftliği Susturma Kontrolü (Mute ve Sessiz Saatler) (2026-08-29)

- **Teknik Detay ve Doğrulama:** **done** — İki sürümde kapandı. 3.305.0 KAPI: src/core/alertGate.ts saf çekirdeği (quiet hours + silence), durum çubuğunda tek tıklık 🔇 (src/views/muteBar.ts — ilk kez bir şey silahlandırıldığında BELİREN, susturuluyken ekranda KALAN bir öge), gece yarısını saran sessiz saatler, ve oturum bazında susturma. 3.306.0 KUYRUK: AudioArbiter (öncelik question > error > stalled > ended > turn-ready; 500 ms aralık son sesin BİTİŞİNDEN; tavan 6, taşarken en az acil olan düşer; aynı uyarının ikincisi tek uyarı) ve akıllı dürtme (yalnız 'question', varsayılan 3 dk, en fazla 2 hatırlatma, 30 sn'lik süpürge aynı zamanda silahsızlandırma).
- **Which sound and whether it sounds are two questions, and they stay two:** `resolveVoice` answers the first and is guaranteed to always have an answer; teaching it to resolve to nothing would make every fall-through in it indistinguishable from a deliberate silence. The gate (`core/alertGate.ts`) sits in FRONT of the chain, names who closed it, and edits no choice.
- **🔇, one click, from wherever the eye already is:** A status bar item that APPEARS the first time anything is armed — the whole family ships off, and an icon sitting there for months on a fleet that has never made a noise is clutter — and stays up while muted, because a control that hides itself once pressed is one nobody can undo. It is the same act as `Agent Farm: Mute / Unmute Alert Sounds`, the Settings card and the `alerts.mute` op: one function, three doors.
- **Quiet hours WRAP MIDNIGHT:** 23:00→08:00 read as `from <= now < to` is quiet for exactly no minutes of the day, and that is the only shape anybody sets. A time that is not `HH:MM` is refused BY NAME rather than stored: a schedule that reads as configured and silences nothing is the worst of the three outcomes. Start equal to end is an EMPTY window, never all day, so a typo cannot mute a farm around the clock.

### 3.304.0 — X-142: Arşivden Açılan Kalemin Arşivde Asılı Kalmaması (2026-08-28)

- **Temel Geliştirme:** 142: arşivden yeniden açılan kalemin otomatik olarak kendi alanına taşınması (auto-reseat on reopen)
- **Teknik Detay ve Doğrulama:** **done** — 3.304.0 (v11.123) ile kapandı. Kök sebep: eve taşıma makinesi (`reseatMisfiled`) X-134'te zaten kurulmuştu ve tam bu şekli teşhis ediyordu — ama YALNIZCA bilinçli bir `projects.backlog.tidy` çağırıyordu. Yeniden açma, satırın canlı işe DÖNÜŞTÜĞÜ andır; artık makine o anda çağrılıyor (`setBacklogState`, dolayısıyla hem köprü `projects.backlog.check` hem de sayfadaki kutucuk tıklaması aynı kapıdan geçiyor).
- **The line's text is not touched:** It is lifted and re-inserted verbatim; what changes is where it sits. `setBacklogState`'s promise has always been that it never REBUILDS somebody's line out of parsed pieces, and that still holds.
- **Only that one item moves:** The full sweep is still a deliberate act: quietly relocating four other mis-filed lines because somebody unticked a box would be an edit they did not ask for, in a file they read by eye.

### 3.303.0 — A-23: Oturumun Kendi Tonunun Olması ve Satırda Gösterilmesi (2026-08-28)

- **Temel Geliştirme:** 23: oturuma özel uyarı sesi (Timeline ♪ AFTip'i · sağ tık 'Sound for This Session…' · ⏱ olay seçimi · alerts.voice.set scope:session)
- **Teknik Detay ve Doğrulama:** **done** — 3.303.0 (v11.122) ile kapandı — A-18 tasarım notunun 5. adımı. Asıl iş, A-18'den beri boş duran çözünürlük zincirinin `session` basamağını YAZILABİLİR hale getirmekti: `resolveVoice` bu basamağı hep okuyordu ama `voiceDeps().session` kancası hiçbir yere bağlı değildi, dolayısıyla 'bu konuşmaya kendi sesini ver' her seferinde sessizce `settings` basamağına düşüyordu.

### 3.302.0 — A-21: Uyarı Sesleri Kartı ve Ses Seçimi (2026-08-28)

- **Temel Geliştirme:** Settings ▸ Alert sounds kartı (A-21)
- **Teknik Detay ve Doğrulama:** **done** — 3.302.0 (v11.119) ile kapandı. Kalem metnindeki her şey karşılandı — adanmış görsel kart, 5 olay × ses eşleştirme matrisi, her satırda ▶ dinle, özel ses kütüphanesi (ekle / yeniden adlandır / sil / önizle, 10 sınırı, dosya kopyalanmıyor). ‼️ YAPILMAYAN İKİ ŞEY, ikisi de bilerek: (1) Master Audio toggle — kalem istiyordu ama adım 3'te verilen "iki yetki BİRLEŞİR, birbirini KAPILAMAZ" kararını bozardı; kapılayan bir master, kendi ♪'sini silahlandırmış bir oturumu susturur.

### 3.301.0 — K-22 / U-118 / U-119: Tıkanmış Oturumun Çıkmaz Sokak Olmaktan Çıkması (2026-08-28)

- **Temel Geliştirme:** 22 (CLI bypass sözleşmesi), U-118 (Needs You bütünsel okuma), U-119 (terminal izin köprüsü) ve A-20 adım 2+3 (uyarı olayları ve ayarları)
- **Teknik Detay ve Doğrulama:** _round 1_ · 2026-08-28 16:01 · reopened — _CONSOLE BYPASS GERÇEKTE BYPASS OLSUN; HİÇBİR İZİN PENCERESİ GÖSTERMESİN: Kullanıcı kararı kesindir: Console'da açık `bypassPermissions` seçimi veya `Default` seçiminin Claude effective ayarlarda `bypassPermissions` çözülmesi “ne olursa olsun bana izin sorma” sözleşmesidir; UI'da bypass yazıp normal tool izni sormak kabul edilemez. REGRESYON GEÇMİŞİ/KÖK NEDEN: Bu sorun daha önce S-18'de, 602b9720-... oturumundan sonra araştırıldı; uygulama oturumu `47c0722d-bbca-48a0-a8f8-1abeeaa45c04`, commit `20aab6d37b8824f657e9d0be0930346b4aab7fa9` (v3.93.0).
- **And `Default` was never resolved at all:** A user whose own settings say `permissions.defaultMode: bypassPermissions` got an asking terminal session — the picker even promised it would ask. The layers are read before the command line is built, exactly as the Console reads them, and the launcher's preview shows the flags the launch will really carry. **A bypass that a policy forbids refuses to start** rather than opening under a label it cannot keep: in a terminal that failure is invisible, because nothing draws a card.
- **A row is a line and an opened row is the text:** Every row kind goes through one reading standard now — a caret and a selectable block that keeps its line breaks, plus an AFTip carrying the whole thing so the common case needs no click at all. **The caret is drawn only when there is more behind it**: a triangle that opens onto the sentence already on the row teaches a reader in two clicks that opening rows tells them nothing. Opening one posts nothing and marks nothing — a blocker is not a message. Queue, Tasks and the Timeline already carried their full text; Needs You was the outlier.

### 3.300.0 — A-20 (Adım 2): Filonun Hangi Tür Dikkat İstediğini Belirtmesi (step 2): the farm says WHICH kind of attention it wants (2026-08-28)

- **Teknik Detay ve Doğrulama:** touch — 1. ADIM YAPILDI, kalem AÇIK (3.299.0, commit v11.115). Tasarım notunun (10_Notes/A-18 …) yapım sırasındaki adım 1'i: tools/make_alert_sounds.js on sesi ÜRETİYOR (indirmiyor — lisans), chime-soft = turn-ready.wav ve yeniden üretilmiyor; src/core/alertVoices.ts çözünürlük zincirini (oturum>ajan>ayar>varsayılan) tek yerde cevaplıyor ve hangi basamaktan geldiğini de söylüyor; kayıp dosya alt basamağa düşüyor, sessizliğe değil.
- **Step two of the auditory cockpit (A-18):** Step one built the ten voices and the chain that picks one, and nothing was wired to it. This wires it: the live monitor now reports every edge that wants the user, carrying the event that names what happened, and the alert dispatch takes that event all the way to the sound, the modal and the toast.
- **`waiting-input` was two different endings wearing one status:** A turn that finished hands control back; a turn parked on an `AskUserQuestion` is still open and wants an ANSWER. They were the same beep and the same "your turn" modal, so the only way to tell them apart was to walk back and look — which is the whole thing the sound was for. `LiveConfig.pendingAskOf` is injected, because only the host knows: a hosted conversation's pending ask lives in the Console, and the monitor keeps its promise never to reach outside itself.
- **Four edges, one emit site:** `waiting-permission` → `question`, `waiting-input` → `question` or `turn-ready` depending on the parked ask, `SessionEnd` → `ended`, the stall sweep → `stalled`. **Once per crossing**, exactly as before: the "waiting" Notification and the `Stop` behind it are one edge, and a session parked in a state does not keep ringing. `onTurnReady` survives unchanged as the narrow view of the same emit — wire one or the other, never both.

### 3.299.0 — A-20 (Adım 1): On Uyarı Sesi ve Hangisinin Çalacağı (step 1): ten alert voices, and which one plays (2026-08-28)

- **Temel Geliştirme:** 20 1. adım — on üretilmiş uyarı sesi + alertVoices.ts çözünürlük zinciri; Windows çalıcısı MediaPlayer'a taşındı
- **Teknik Detay ve Doğrulama:** touch — 1. ADIM YAPILDI, kalem AÇIK (3.299.0, commit v11.115). Tasarım notunun (10_Notes/A-18 …) yapım sırasındaki adım 1'i: tools/make_alert_sounds.js on sesi ÜRETİYOR (indirmiyor — lisans), chime-soft = turn-ready.wav ve yeniden üretilmiyor; src/core/alertVoices.ts çözünürlük zincirini (oturum>ajan>ayar>varsayılan) tek yerde cevaplıyor ve hangi basamaktan geldiğini de söylüyor; kayıp dosya alt basamağa düşüyor, sessizliğe değil.
- **The first step of the auditory cockpit (A-18), and nothing is wired to it yet:** — this is the core plus its assets, in the build order the design note lays out. The farm could make exactly one noise, on the one edge where a turn finished. Away from the screen, "your turn" and "it is asking you something" were the same beep, so the only way to tell them apart was to walk back and look — which is the whole thing the sound was for.
- **Ten voices, generated rather than sourced:** (`tools/make_alert_sounds.js`). The obvious way to get ten alert sounds is to download them, and then the extension ships ten files whose licence nobody can state; these are written from arithmetic, cost 340 kB together, and each one's character is a line of code somebody can read and argue with. All are ≤1.2 s, 44.1 kHz mono, normalised to −3 dBFS. **`chime-soft` is `turn-ready.wav` and is not regenerated** — it is the sound every current install already makes, and a "nicer" replacement would have changed it silently.

### 3.298.0 — U-110: Ad-Değer Haritaları İçin Satır Editörü (2026-08-28)

- **Temel Geliştirme:** üç ad→değer haritası satır editörü aldı; U-89 kapandı, ayarlar sayfasında çıplak JSON kutusu kalmadı
- **Teknik Detay ve Doğrulama:** **done** — Kapandı — 3.298.0, commit v11.114. Üç ad→değer haritası (budgets, superpowersDefaults, agentEngineDefaults) satır editörü aldı: ad kutusu, ok, değer kutusu, ✕, '+ add', 'Save the pairs'. Ad kutusu ÖNERİR ama KISITLAMAZ (datalist) — '*' gerçek bir anahtar, henüz olmayan bir ajan da öyle.
- **Three settings are a free-form object:** — `budgets`, `superpowersDefaults`, `agentEngineDefaults`. Nothing can list their keys, which is why all three were left as a JSON textarea, and it is the wrong conclusion: **the key is free, the pair is not.** Setting a budget meant hand-writing `{"developer": 20}` including the brace, the quote and the colon, and getting the agent's name right from memory — with a misfiled name failing silently for ever.
- **The three maps are not the same shape, and each now says so:** `budgets` is name → **number** and gets number boxes; `superpowersDefaults` is name → **boolean** and gets a yes/no picker that can still say "not set"; `agentEngineDefaults` declares nothing about its values and keeps their JSON, honestly, in one cell. All read off `additionalProperties`. **Where the names come from is a manifest fact too** (`x-af-keys`), because the three differ: `budgets` takes agent names and `*` for the whole fleet, `superpowersDefaults` takes names with **no wildcard at all** (it is an exact match), and `agentEngineDefaults` is keyed by an agent's folder. One guessed list for all three would have offered `*` where it does nothing.

### 3.297.0 — U-109: Şeması Tanımlı Ayarlar İçin Gerçek Form/Tablo Görünümü (2026-08-28)

- **Temel Geliştirme:** alanları tanımlı ayarlar gerçek form/tablo oldu (2 form, 13 tablo); livingChecks hiç olmayan items şemasını aldı
- **Teknik Detay ve Doğrulama:** **done** — Kapandı — 3.297.0, commit v11.113. Alanları tanımlı 2 ayar (taskRetry 16 alan, launchDefaults 4) FORM, 13 ayar TABLO oldu; ikisi de shape.kind'dan türüyor, hiçbir yerde ayar adı listelenmiyor. livingChecks hiç olmayan items şemasını aldı, böylece 'free' kutu sayısı sıfırlandı.
- **Fifteen settings name every field of their value, type it, say which ones are required and write a sentence about each — and the page drew a JSON textarea over the top of all of it:** `taskRetry` declares SIXTEEN fields; the user was asked to hand-write its braces and to remember that `backoff` takes one of four words, while typing it into a box that accepts anything.
- **One object with declared fields is now a FORM:** (`taskRetry`, `launchDefaults`) — one box per field, its own sentence beside it. **A list of them is a TABLE** (`cliProfiles`, `launchProfiles`, `pricing`, `mediaPricing`, `quotaWeights`, `modelPolicy`, `dispatchRules`, `relayFeeds`, `ingestFolders`, `extraClaudeDirs`, `projectSkeleton`, `projectTemplates`, `livingChecks`) — one row per entry, `+ add`, a ✕ to drop one, **Save the table** to commit. A closed set is a picker rather than a box that accepts anything, a required column is marked where it is asked for, and a number typed into with words is refused in words rather than written as `NaN`. Both are chosen from `shape.kind`, so a setting whose fields are declared tomorrow gets its editor with nobody touching the page.

### 3.296.0 — U-108: Düz Liste Ayarlarının JSON Kutusu Olmaktan Çıkarılması (2026-08-28)

- **Temel Geliştirme:** 27 (V2) çok turlu görevler gerçekten çalışıyor + U-108 liste ayarları editörü
- **Teknik Detay ve Doğrulama:** **done** — 3.296.0 (commit v11.112). Dokuz düz liste ayarı artık girdi başına bir kutu + ✕ + '+ add' + 'Save the list'; ekleme/silme TASLAK üzerinde, yapısal her hareket kutuları önce okuyor, değer gerçek dizi olarak gidiyor (ayrıştırma hatası imkânsız). agentRoots ve excludeAgentDirs'in her satırında Browse var ve bu bir MANIFEST gerçeği: items üzerinde x-af-browse.
- **Nine settings are an array of strings or numbers:** — root folders, excluded folders, model names, Telegram chat ids, queue targets, webhook events, allowed hosts, pack gallery sources, insight categories. The schema says `items.type: "string"` and nothing more: there is no structure to get right in any of them. The page asked for JSON anyway — a textarea, a pair of brackets, and a comma the user had to remember — which is the report U-89 was opened about.
- **Where the schema says the entries are PATHS, every row gets a Browse:** Declared as `x-af-browse` on `items`, exactly as a scalar path setting declares it on itself — so `agentRoots` and `excludeAgentDirs` get the picker as a fact of the manifest, and the next list of paths gets it by one line there rather than by editing the page. The row picker **saves nothing**: it posts the path back and the draft takes it, because the list around that row is still being edited and saving would commit every other row at the same moment.

### 3.295.0 — M-27 (v2): Çok Turlu Görevler Denetimi ve Onarımı (2026-08-28)

- **Asenkron Oturum Bağlama Koruması (`round:binding`):** Claude ve diğer motorların oturum kimlikleri süreç bittiğinde henüz transcriptte bağlanmamışsa zinciri düşürmek yerine tur `round:binding` ile kuyrukta park edilir; kimlik diske düşünce `releaseRounds()` ile serbest bırakılır.
- **Otomasyon & Zamanlama Zincirleri (`RunDimensions`):** `rounds` alanı model ve retry gibi bir `RunDimension` oldu; `FarmSchedule`, `FarmTrigger` ve `FarmTemplate` plan formunda kaydedilir, düzenlemede geri yüklenir ve `runExtras` ile göreve aktarılır.
- **İnteraktif Mod Sınırı:** `--resume` doğası gereği headless olduğundan, interactive modda turların çalışamayacağı formda açıklanarak alan yerinde devre dışı bırakıldı.
- **DOM Shim Onarımı:** `<textarea>` değerlerinin test shim'inde kaybolması düzeltildi (`test/lib_page_dom.js`).

### 3.294.0 — U-89: Şema Alan Açıklamaları ve İlk Eşleşen Kural Koruması (2026-08-28)

- **Fiyatlandırma ve Medya Şemaları:** `pricing` ve `mediaPricing` alanlarının her biri net açıklama metinleri ve zorunluluk etiketleriyle donatıldı.
- **Sıra Duyarlılığı Koruması:** `match` kuralında ilk eşleşen kuralın kazandığı (sıranın kritik olduğu) şema paneline ve AFTip açıklamasına eklendi.

### 3.293.0 — U-89: Ayarlar Sayfası Şemadan Türeyen JSON Yapı Kartları ve Example Butonu (2026-08-28)

- **Şemadan Türeyen JSON Kartları:** Ham textarea kutuları yerine değerin yapısını söyleyen çip (`a list of entries · 3 field(s)`, `one object · 16 field(s)`) ve arkasında alan/tip/enum/açıklama tablosu taşıyan AFTip panelleri eklendi (`src/core/settingShape.ts`).
- **Example Butonu:** Şemadan doğrulanan tam bir örnek girdiyi kutuya yazar; hiçbir şeyi otomatik kaydetmez.

### 3.292.0 — M-27: Çok Turlu Görevler ve Otomatik Tur Zinciri (2026-08-28)

- **Dinamik Tur Zinciri (`src/core/taskRounds.ts`):** 1. tur ana prompt kutusu, `+ another prompt` ile sınırsız tur ekleme, tur başına bekleme dakikası (`wait min`).
- **Aynı Konuşmaya Bağlanma:** 1. tur bittiğinde `resumeSessionId` ile aynı oturuma bağlanarak sonraki turlar sırayla yürütülür.
- **Kuyrukta Bağımsız Satır:** Turlar bellekteki sayaçta değil, kuyrukta `notBefore` taşıyan gerçek görev satırı olarak tutulur (`Görev Adı · R2`).
- **Runs Tablosunda `R2/4` Rozeti:** Kaçıncı turda olduğunu gösteren rozet ve detaylı hover.

### 3.291.0 — X-130: BacklogEcho — Eklenti Yazım Yankısını Atlama (2026-08-28)

- **Yankı Filtresi (`BacklogEcho`):** Dizin izleyicisi eklentinin kendi yazımını duyduğunda baytları karşılaştırıp gereksiz uzlaştırma geçişini atlar (~54 ms → 6.2 ms hızlanma).

### 3.290.0 — X-134 / X-135: Backlog Arşiv Koruması ve Otomatik OpenedAt Sıralaması (2026-08-27)

- **Arşiv Koltuk Koruması (X-134):** Yeni eklenen kalemlerin yanlışlıkla `## 🗄 Archive` altına düşmesi engellendi; açık kalanlar otomatik kurtarılır.
- **`openedAt` Zaman Sıralaması (X-135):** Yeni açılan kalemler track defterine damgalanarak zaman sıralamalarında en başa yerleşir.

### 3.289.0 — X-136: Ayarlar'da Superpowers Bölümü ve Dinamik Ajan Kökü (2026-08-27)

- **Ayarlar Superpowers Kartı:** Klasör sağlığı (kök kanca kontrolü), yeteneklerin AFTip fihristi ve her ajan için bağımsız varsayılan onay kutuları.
- **Dinamik Taşınabilir Kök:** Boş bırakılan ayar, ajan kökleri yanındaki `_SKILLS/superpowers` klasörüne dinamik olarak çözülür.

### 3.288.0 — U-106 / U-107: Backlog Arşiv Ayrımı ve 3 Durumlu Filtre Çipi (2026-08-26)

- **Tamamlanmış ile Arşivlenmiş Satır Ayrımı (U-106):** `## 🗄 Archive` altındaki satırlar ile yeni bitirilenler ayırt ediliyor. Arşivlenmiş satırın yanına çerçeveli 🗄 rozeti eklendi.
- **3 Durumlu `🗄 archive N` Filtre Çipi (U-107):** Filtre şeridinde tek basışla listede göster · gizle · yalnızca arşiv durumları arasında geçiş yapar.

### 3.287.0 — X-133: Superpowers Kompozitör Anahtarı ve Sistem Promptu Enjeksiyonu (2026-08-26)

- **Tek Sistem Promptu Dosyası (`systemPromptFileFor`):** `--append-system-prompt-file` tek dosya aldığı için proje brief'i ile Superpowers kancası birleştirildi. Projesiz oturumlarda da çalışır.
- **Kompozitörde `[⚡ Superpowers]` Çipi:** Üzerine gelindiğinde modele verilecek kanca metnini birebir gösterir.
- **Ajan Bazlı Varsayılanlar (`agentFarm.superpowersDefaults`):** `developer` açık başlar. Köprüye `superpowers.set` eklendi.

### 3.286.0 — X-132: Diskte Uyuyan Superpowers Yetenekleri ve Kök Kanca Fihristi (2026-08-26)

- **14 Mühendislik Yeteneği (`_SKILLS/superpowers`):** TDD, sistematik hata ayıklama, planlama ve doğrulama yetenekleri diskte 0 token ile tutulur.
- **Kök Kanca ve Yol Fihristi:** `src/core/superpowers.ts` klasörü tarar, her yeteneğin ad, açıklama ve mutlak yolunu kanca bloğuna (`superpowersBlock`) dönüştürür. Köprü op'ları: `superpowers.status`, `superpowers.hook`.

### 3.285.0 — U-95: Wiki Derleme Onay Şeridi ve Toplu Aksiyonlar (2026-08-26)

- **Derleme Onay Şeridi:** 📚 butonu doğrudan model başlatmaz; hangi ajan, motor, model ve eforla koşacağını gösteren şerit açar.
- **Toplu Seçim Aksiyonları:** **⚡ Compile these N**, **🚫 Drop** ve **✕ Remove** toplu butonları; canlı nefes alan compiling animasyonu ve tek bildirimli kapanış.

### 3.284.0 — U-92: Wiki Kokpiti Aranabilir Kategori Menüsü ve Satır İçi Düzenleyici (2026-08-26)

- **Aranabilir Kategori Menüsü:** 12+ seçenekte Türkçe duyarlı arama kutusu.
- **Gelişmiş Satır İçi Düzenleyici:** ✎ butonu kategori, not ve hariç tutulan turları (`excluded turns`) düzenler.

### 3.283.0 — X-57 / X-58: Wiki Ayarları ve Tur Kurtarma (2026-08-26)

- **Farm Settings Wiki Bölümü (X-57):** `agentFarm.wikiRoot` adanmış ayar kartı, 3 zorunlu dosyanın varlık denetimi ve `🛠 Start the wiki here` şablon oluşturucu.
- **Kaza Yapan Derlemeyi Kurtarma (X-58):** Çöken derlemelerin turları sonsuza kadar kilitlemesi engellendi.

### 3.277.0 — X-32: Adaptif Misyon Kabul Matrisi ve Doğrulama (2026-08-26)

- Çok-ajanlı adaptif misyonların uçtan uca kabul matrisi ve un-pause düzeltmeleri tamamlandı.

### 3.271.0 - 3.274.0 — X-32: Adaptif Misyon Kompozitörü ve Oturum Yalıtımı (2026-08-23 - 2026-08-24)

- **Misyon Kompozitörü:** Planlayıcının ne yapacağını önceden söyleyen şerit ve adım bazlı planlama.
- **Oturum Yalıtımı:** Misyon delegasyonlarının ana oturumlardan tamamen izole çalışması ve transkript güvenliği.


### 3.209.0 — X-54: Ürüne Giden Örnek Özel Not Değildir, ve Askıya Alınamayan Tavan (2026-08-21)

- **Bütçe örneği bu kurulumun gerçek bir ajanını, üstelik Türkçe, adıyla anıyordu**: `{"psikolog": 20, "*": 50}` — eklentinin kurulduğu herkesin okuduğu bir manifestoda. Artık `{"agent_one": 20, "*": 50}`; dispatcher'ın örneği de (Türkçe eşleşme sözcükleri ve aynı ajan adı) onunla birlikte düzeltildi. İkisi aynı hata olduğu için ayarlar manifestosu bu hataya karşı süpürülüyor: ürüne giden herhangi bir açıklama bu filonun bir ajanını anarsa ya da kullanıcının kendi dilinde yazılmışsa test derlemeyi düşürüyor.
- **`budgets` içindeki `0` rakamı o isimde TAVAN YOK demektir** (fren `> 0` diye bakar), yani `{"*": 0}` filo tavanını kaldırırken ajan başına yazılmış her rakam yürürlükte kalır — misyon tavanlarının konuştuğu "0 = limitsiz" kelimesinin aynısı.
- ‼️ **Ve okuyucu artık yalnız yapılandırma kaydına güvenmiyor (3.232.0).** Bu sürümün katkı verdiği 124 ayardan tam bir tanesi — `agentFarm.budgetsUnlimited` — çalışan pencerenin kaydında yok: `getConfiguration().get()` bildirilmiş varsayılan yerine `undefined` veriyor ve `update()` "is not a registered configuration" diyerek reddediyor; oysa aynı manifest nesnesinde onun iki yanındaki anahtarlar çalışıyor. Manifestte bir sorun yok ve düşürülmüş bir anahtarı hiçbir eklenti içeriden geri koyamaz. Kaybolan bir ayar ayar değildir; bu yüzden her Agent Farm değeri, kayıt susunca kullanıcının kendi `settings.json`'ına düşen tek bir kapıdan okunuyor (JSONC farkında: yorumlar, sondaki virgüller ve o dosyadaki her yolun içindeki `//`). Geri düşüş yalnız OKUMA tarafında — bir dosyayı okumak onu bozamaz — ve VS Code'un reddettiği bir yazma artık reddin orada kalması yerine dosya yolunu ve yapıştırılacak tam satırı söylüyor.
- **`budgetsUnlimited` — girdiğin rakamları kaybetmeden bütün günlük bütçeleri askıya al.** Bir tavanı kaldırmanın tek yolu rakamları silip sonra yeniden yazmaktı. Anahtar açıkken hiçbir ajanın tavanı yok, harcama üzerinden hiçbir şey uyarmıyor ve engellemiyor; rakamlar ayarlarda olduğu gibi duruyor ve anahtarı kapatınca aynen yürürlüğe giriyor. Varsayılan kapalı — bir tavan güncellemeyle kaldırılmaz.
- **‼️ Ya her yerde geçerli ya hiç.** Bütçeleri yedi yer okuyor; altısının uyduğu bir anahtar, hiç olmayan anahtardan kötüdür — tavan kalkmış görünür ve bir şey hâlâ çalışmayı reddeder. Artık ayarı kimse doğrudan okumuyor: anahtar açıkken tek erişim noktası boş bir harita döndürüyor (bu zaten her okuyucunun "tavan yok" diye anladığı şekil) ve yeni bir çağrı yeri ayarı ham okuduğu anda test derlemeyi düşürüyor.

### 3.208.0 — S-43: Kimsenin Başlatmadığı Oturum ve Gördüğünün Üstündeki Süreç (2026-08-21) {#spare-oturumlar}

- **Daemon'ın yedek işçisi artık oturum diye çizilmiyor.** Claude Code v2.1+, yazdığın `claude`'ın anında açılması için arka planda bir daemon ve önceden ısıtılmış boşta bir işçi tutar. O işçi kendini gerçek bir oturum gibi kaydeder (`"kind":"bg","spare":true,"status":"idle"`) ve aynı SessionStart kancasını atar — Live Timeline da kimsenin başlatmadığı bir oturumu kart olarak basıyor, üstelik işçinin bulunduğu klasöre göre bir ajanın hanesine yazıyordu.
- **‼️ Karar her okumada, iki yönde de yeniden veriliyor.** Kanca işçi doğar doğmaz geliyor ve o pid'in kayıt dosyası henüz diskte olmayabiliyor; yani SessionStart anındaki dürüst cevap "bilmiyorum" olabilir — orada karara bağlayan bir süzgeç kendi testinden geçer, hayatta sızar. Bilinmeyene dayanarak hiçbir şey gizlenmiyor (bu zaten eski davranışın aynısı, dolayısıyla öbür motorlarda regresyon imkânsız); soru liste her okunduğunda yeniden soruluyor, o an dosya çoktan yerinde. Bir kez prompt almış oturum serbest bırakılıyor ve bir daha asla tutulmuyor — daemon'ın yedeğini gerçek bir konuşmaya devretmesi tam olarak budur ve `spare:true`'ya bakmayı sürdüren bir kural konuşmayı da gizlerdi.
- **☠ Force kill — yaprağı değil ağacı sonlandır.** "End session" kaydın işaret ettiği süreci durduruyor, Windows'ta `taskkill /T` ise yalnızca AŞAĞI yürüyor: üstteki daemon işçisinin öldüğünü görüp yenisini yeni bir ID ile doğuruyor, kart sonsuza kadar geri geliyordu. Force Kill, ağacın **claude** kısmının tepesine tırmanıp orayı durduruyor. Tırmanış üç yerden sınırlı ve üçü de güvenlik kuralı: VS Code'un kendi soy ağacına asla girmiyor, yalnızca tanınabilir biçimde claude olan bir süreçten geçiyor (terminalden başlatılmış bir oturumda en üstteki claude'da duruyor, kabuğa dokunmuyor) ve sabit bir derinlikten sonra vazgeçiyor — yeniden kullanılmış bir pid döngüye dönüşemesin. Onay kutusu gidecek her süreci adıyla ve pid'iyle sayıyor.
- Oturum kartında, iki sağ tık menüsünde ve köprüde `sessions.forceKill` olarak. Console'un barındırdığı bir oturum adıyla reddediliyor — onun ağacı bu pencerenin altında koşuyor ve End session onu zaten düzgün kapatıyor.
- `test/test_spare_sessions.js` içinde 45 kontrol: yarış durumu, devir, claude kaydı hiç olmayan dört motor ve tehlikeli vaka — büyükbabası editör olan bir yaprak.

### 3.206.0 — X-51 (X-50): Zincirin Uçtan Uca Yürünmesi ve Paket Doğrulaması (2026-08-21)

- **Uçtan Uca Kabul (`test/test_wiki_e2e.js`, 41 kontrol):** İşaretle → brifing → koşuyu başlat (iddia, hâlâ `pending`, ikinci koşu adıyla reddedilir) → **prompt ne diyorsa onu yaz** → geri bildir → iki tarafı da sor → yazılanın şeklini denetle. Parçalar tek tek test ediliyordu; **dikiş yeri** hiç test edilmemişti.
- **‼️ İlk koşuşta bulunan gerçek hata:** bir `[[link]]` ve `index.md` satırı sayfanın **dosya adı biçimini** kullanmak zorunda (`[[Aday_Havuzu]]`, `[[Aday Havuzu]]` değil). Obsidian bağlantıyı dosya adına göre çözer, `wiki.lint` de öyle — boşluklu bir bağlantı iki tarafta birden kırıktır. Ajan prosedürü (`_REF/wiki.md` §2, §4) artık bunu söylüyor.
- **Paket Doğrulaması (`npm run verify` → `tools/verify_vsix.js`, 12 kontrol):** Depodaki bütün kapılar `vsce`'den **önce** koşuyordu; `.vscodeignore` bir desen listesi olduğu için yeni bir `media/*.js` ya da `out/panels/*.js` sessizce düşebiliyordu — eklenti sorunsuz kurulur, sayfa ilk açılışta boş gelir. Bu araç VSIX'in kendi zip dizinini okuyup her panelin, çekirdek modülün, medya dosyasının ve **`htmlShell`'in webview'dan istediği her betiğin** gerçekten içeride olduğunu doğruluyor.

### 3.205.0 — U-70 (X-50): Wiki Kokpiti — Havuzu Okuyan Tek Yüzey (2026-08-21)

- **Adanmış Wiki paneli:** `Agent Farm: Open Wiki` ya da Toolbox → **📚 Wiki**. Havuza yazan dört kapı vardı, okuyan hiçbir yüzey yoktu ([detay](#wiki-kokpiti)).
- **Kasa şeridi:** kök · `-WIKI-ANAYASA-.md` · `index.md` · `log.md` — tıklanabilir, eksik olan ⚠. **Kök ya da anayasa yoksa iki derleme düğmesi de ölü ve sebebini basılmadan önce söylüyor.**
- **DENSE tablo:** bir işaret = bir satır; uzayan her şey AFTip. Satır üstünde oturum, ajan, motor, tur aralığı, not ve kim/ne zaman işaretledi — sıfır tıkla.
- **[Seçilenleri Derle] / [Tüm Bekleyenleri Derle]:** ikisi de `wiki.compile.run`. **Hiçbir şeyi derlenmiş işaretlemez** — kapatan tek şey koşunun geri bildirmesi.
- **Koşusu çıkmış işaret teklif edilmez:** `compiling` havuzda bir durum değil, iddiası yaşayan bir `pending` satır; kutucuk çizmez, sayıya girmez.
- **Satır içi düzenleme ve provenance:** ✎ konular (boş liste hiç gönderilmez), 🚫 düşür, ↺ geri koy, ✕ sil — üçü de kasadaki sayfaya dokunmaz; derlenmiş satırlar `Kategori / Kavram` kırıntısı taşır.
- **🩺 Lint:** `wiki.lint` sayfanın içine rapor eder — rapor eder, asla onarmaz.

### 3.204.0 — M-23 (X-50): Wiki Derleme Motoru ve Headless Koşu (2026-08-21)

- **Headless Derleme (`wiki.compile.run`):** Aday havuzunda biriken turları ve konuşmaları `-WIKI-ANAYASA-.md` kuralları altında sentezleyen bağımsız headless ajan çalıştırması.
- **Komut Paleti Kapısı:** `Agent Farm: Compile Wiki Candidates…` ile bekleyen tüm adaylar işaretli gelir; tek basışta derleme başlatılır.
- **Eşzamanlı Derleme Koruması (Claim):** Koşan derleme aldığı adayları kilitler (`pool.compiling`), aynı konunun çift yazılmasını önler. Çöken süreçlerin kilitleri (`stale claim`) otomatik temizlenir.
- **Sözleşme:** Ajan sentez sonrası `wiki.candidates.edit {state:"compiled", pages:[…]}` ile sayfaları bildirir ve adayları kapatır.

### 3.203.0 — K-26 (X-50): Tur Satırlarında 🔖 Wiki Tagger Rozeti (2026-08-21)

- **Doğrudan Tur İşaretleme:** Console prompt satırlarına, transkript tur bantlarına ve Turns tablosuna sakin bir **🔖** rozeti eklendi.
- **Popover Seçici (`afWiki.js`):** Tıklandığında açılan hafif panelde tur aralığı (`4`, `3-7` veya tüm konuşma), mevcut konular ve yeni konu kutusu sunulur. İşaretli turlar açık gelir (`lit`), mükerrer eklemeler konuları birleştirir.

### 3.202.0 — S-38 (X-50): Oturum ve Zaman Çizelgesinden Aday Ekleme (2026-08-21)

- **Oturum Bazlı Aday Seçici:** Sessions tablosu, Console kartları ve Live Timeline sağ tık menüsüne **Add to Wiki Candidates…** eklendi.
- **Konu Listesi ve Birleştirme:** Havuzda kayıtlı konular onay kutusu olarak listelenir, yeni konu tek tuşla eklenir. Tekrarlanan işaretlemeler çakışmadan birleştirilir.

### 3.201.0 — B-14 (X-50): Wiki Aday Havuzu Altyapısı (2026-08-21)

- **Hafif Aday Havuzu (`wiki_candidates.json`):** İşaretleme ücretsiz, geri alınabilir ve kasaya dokunmaz.
- **`wiki.compile` Brifingi:** Transkriptleri toplar, tur aralıklarını çözer, kasa anayasasını ve mevcut sayfaları analiz ederek ajana tam brifing verir.
- **Köprü ve Sağlık:** `wiki.status` havuz ve kasa durumunu raporlar, `wiki.lint` yetim ve indekssiz sayfaları denetler.

### 3.200.0 — M-21: Tasks Başlık Şeridi Türetilmiş Metrikleri (2026-08-21)

- **Zengin Başlık İpuçları:** ⚙️ Tavanlar, ⏳ Bekleyenler ve sıra kuralı, 🛡️ İnsan onayları, 📅 Zamanlamalar, 🏁 Günlük başarı oranı, 💵 Harcama türevleri zengin AFTip panelleriyle açıklandı.

### 3.197.0 — M-26: İnteraktif Görev Hedefleri ve Kapanış Politikaları (2026-08-21)

- **`interactiveTarget`:** `vscode` (entegre terminal), `external` (harici OS penceresi / Windows Terminal `.cmd` wrapper ile gerçek exit code yakalama), `console` (barındırılan webview).
- **`interactiveClose`:** `stay-open` (sohbet açık kalır), `auto-close` (tek tur basıp çıkar — `claude -p` / `runArgs`).

### 3.196.0 / 3.195.0 — U-81: Oturum Kartlarında AFTip ve Tam Metin Açılışı (2026-08-21)

- **Tam Metin İpucu:** Kartlardaki ilk ve son prompt satırları 4.000 karaktere kadar AFTip ile açılır, "How it opened" mükerrer bloğu kaldırıldı.
- **%100 Mat Opak Panel:** `editor.background` ve `tip-host` rengiyle ata-opaklık engelleri giderildi, 260px kart genişliğine özel boyutlandırma yapıldı.

### 3.194.0 — U-82: Host Tabanlı Panoya Kopyalama (2026-08-21)

- **Güvenli Clipboard Köprüsü:** Webview odak hatalarını aşmak için tüm **Copy ▸** eylemleri (`media/afCtx.js`) doğrudan extension host'un `vscode.env.clipboard` mekanizmasına bağlandı.

### 3.193.0 — U-80: Live Sessions Kartları Prompt Kırpması (2026-08-21)

- **90 Karakter Kırpma:** Live Timeline kartlarının ızgara düzenini korumak için prompt satırları 90 karaktere sınırlandı; tam metin AFTip hover paneline bağlandı.

### 3.192.0 — Webview İçi Görev ve Retry Mimarisi Rehberi (2026-08-20)

- **Dahili Modal Rehber:** New Task formunda `?` butonu ile açılan, taslağı kaybetmeden kapanan interaktif mimari kılavuzu (S-19 devamlılık, M-3/M-10 kota pencereleri, M-12 3-prompt yönlendirmesi).

### 3.191.0 — M-25: Tasks Plan ve Runs Tabloları AFTip Panelleri (2026-08-20)

- **Metrik Açıklamaları:** Plan tablosu Guard wake-up tasarrufları, Runs tablosu Tokens/Cost hücreleri ve koşu başı ortalama maliyetler AFTip panelleriyle açıklandı.

### 3.190.0 — M-24: Görev Formlarında Kayıtlı Prompt Şablonları (2026-08-20)

- **Sağ Tık Snippet Penceresi:** Görev formu içerisindeki tüm prompt alanlarında sağ tık ile `media/afSnippets.js` penceresi açılır ve şablonlar doğrudan imlece yapıştırılır.

### 3.189.0 — M-21: New Task Konumu ve Runs Tokens Sütunu (2026-08-20)

- **Sayfa Çubuğu:** "New task" butonu Runs sekmesinden sayfa üst çubuğuna taşındı. Runs tablosuna sıralanabilir **Tokens** sütunu eklendi.

### 3.188.0 — K-28: OpenCode Resume Model Eşleme Düzeltmesi (2026-08-20)

- **Model Seçeneği Doğrulama:** Devam ettirilen OpenCode oturumlarında `opencode/big-pickle` biçimi motorun aktif seçenek listesiyle eşleştirilerek geçersiz model değişim reddi engellendi.

### 3.187.0 — K-27: Kesinti (Interrupted) Yanlış Alarm Koruması (2026-08-20)

- **Dürüst Durum Ayrımı:** Araç hatalarının yanlışlıkla kullanıcı "Stop" kesintisi gibi `last turn interrupted` göstermesi engellendi; Antigravity, Codex ve Gemini için gerçek sonuçlar ayrıştırıldı.

### 3.186.0 — U-75: Antigravity Transkript Birleştirme Güvenliği (2026-08-20)

- **Kimlik Bazlı Merge:** Konsoldan devam ettirilen Antigravity oturumlarının dosyanın önceki turlarını ezmesi engellendi, mesaj kimlikleriyle tam geçmiş korundu.

### 3.185.0 — U-73: Live Timeline Tooltip Titreme Düzeltmesi (2026-08-20)

- **Yeniden Çizim Köprüsü:** Canlı zaman çizelgesi periyodik olarak yeniden çizilirken imleç altındaki `tip-free` hover panellerinin kaybolması ve titremesi engellendi.

### 3.184.0 — U-76: Noktadan Tam Metin Kopyalama (Copy Corpus) (2026-08-20)

- **Doğrudan Transkript Kopyalama:** Live Timeline noktasına veya araç bloğuna sağ tık → **Copy Corpus** ile ham transkriptteki tam metin anında panoya kopyalanır (`timeline.corpus`).

### 3.183.0 — U-78: Live Timeline'da Model Cevapları (`say` Olayı) (2026-08-20)

- **Birinci Sınıf Cevap Noktaları:** Asistan yanıtları mavi içi boş halka (`say`) olarak zaman çizelgesine işlenir, kullanıcı promptları dolu daire olarak kalır.

### 3.182.0 — U-74: Hover Panelinin Ele Yol Vermesi (2026-08-20)

- **Etkileşim Sessize Alma:** Butona tıklandığında veya tuşlandığında AFTip paneli anında kapanır. Tıklanabilir butonların hover'ı daha yavaş (.6s) açılarak hedeflenen butona engel olması önlenir.

### 3.180.0 — X-49: İş Kuyruğu Motor, Model ve Efor Yönlendirmesi (2026-08-20)

- **Hedef Eksenleri:** Kuyruk yakalama formuna ve filtrelerine `engine`, `model`, `effort` seçenekleri eklendi.

### 3.175.0 — X-47: Arka Plan Süreçlerinde Konsol Penceresi Yalıtımı (2026-08-19)

- **Windows Hide Güvencesi:** Tüm arka plan `child_process` spawn çağrılarında `windowsHide: true` zorunlu kılındı (`test_no_console_flash.js`).

### 3.174.0 — X-48: Backlog Açılış ve Son Dokunuş Sıralamaları (2026-08-19)

- **Zaman Sıralamaları:** Backlog için `opened` (ilk kayıt tarihi 🌱) ve `last touched` (son çalışma tarihi ✎) sıralama kipleri eklendi.

### 3.173.0 — S-40: Beş Motorlu Turlar Sayfası (2026-08-19)

- **Tüm Motorlar Tek Tabloda:** Claude, Gemini, Antigravity (brain log & Console), OpenCode oturumları kullanıcı turlarına açılarak tek sayfada listelenir (`turns.list`).

### 3.171.0 — U-69: Turlar Tablosu Düzeni ve AFTip Hücreleri (2026-08-19)

- **Sabit Tablo Düzeni:** `<colgroup>` ve `table-layout: fixed` ile sütun genişlikleri sabitlendi. Steps sütununa **reasoning** ayrımı eklendi.

### 3.168.0 — X-52: OpenCode Model Listesi Isınması (2026-08-19)

- **Arka Planda Katalog Çekimi:** `opencode models` arka planda taranır ve `globalState`'te saklanır; oturum açılmasını beklemeden model kutuları doldurulur.

### 2.21.0 — Görev Öngörüsü & Digest Sonuçları, Dalga 4 (2026-07-11)

- **Task Forecast:** sonraki 7 günün zamanlı koşuları + kuyruk + çalışanlar, her koşuda 30g medyan süre/başarı; tahmini ajan-süresi. Tasks başlığındaki takvim ikonu. Bkz. [Görev Öngörüsü](#gorev-ongorusu-forecast).
- **Günlük digest'e görev sonuçları:** günlük özet kartına "Bugün biten: X✓ Y✗ — hata: …" satırı.
- Dolar-maliyet tahmini bilinçli ertelendi (görev başına token maliyeti izlenmiyor); forecast süre/başarı öngörür. **Tasks yol haritası (Dalga 1-4) tamamlandı.**

### 2.20.0 — Paralel Adımlar & Fan-in, Dalga 3b (2026-07-11)

- **Parallel adım grupları:** ardışık `parallel` adımlar aynı anda başlar (fan-out), hepsi bitince çıktıları tek beslemede birleşip sonraki adıma geçer (fan-in). Her dalın kendi runIf'i; grup hatasında ilk adımın onFail'i. Lineer motorla tam geriye uyumlu (bayraksız adımlar bugünkü gibi). Bkz. [Paralel Adımlar](#paralel-adimlar-fan-out--fan-in). Dalga 3 (DAG orkestrasyon) tamamlandı.

### 2.19.0 — Workflow Onay Adımı, Dalga 3a (2026-07-11)

- **Approval gate (insan kapısı):** workflow zincirine onay adımı — o adımda zincir durur, Needs You panelinde/bildirimle onay bekler. Approve → önceki çıktı olduğu gibi geçer; Reject → onFail. Ajan/model yok. Bkz. [Onay Adımı](#onay-adimi-insan-kapisi). (Dalga 3'ün ilk yarısı; paralel adım/fan-in ayrı dalga.)

### 2.18.0 — Görev Yaşam Döngüsü Ergonomisi, Dalga 2 (2026-07-11)

Delege edilen işi yönetmek tek tıka indi ([Yeniden Çalıştırma ve Öncelik](#yeniden-calistirma-ve-oncelik)):

- **Retry / Retry with edited prompt:** biten görevi taze kopya olarak yeniden kuyruğa al (isteğe bağlı prompt düzeltmesiyle).
- **Resume workflow from this step:** başarısız workflow zincirini kaldığı adımdan, önceki adımın çıktısını yeniden besleyerek devam ettir — baştan koşma yok.
- **Run Next + öncelik/yaşlanma:** bekleyen görevi kuyruğun önüne al; kuyruk önceliğe göre sıralanır, bekleyen görevler yaşlandıkça öncelik kazanır (açlık önleme).
- **Dedup koruması:** aynı ajana birebir aynı prompt zaten kuyruktaysa Add Task uyarır.

### 2.17.0 — Görev Sağlığı & Analitiği, Dalga 1 (2026-07-11)

Skills/MCP/hafızanın "bir bakışta + sağlık" olgunluğu görev sistemine taşındı. Kaynak: canlı görev listesi + `task-history` arşivi birleşimi ([Görev Sağlığı](#gorev-sagligi)).

- **Ajan Detayında "Task health" kartı:** 30 günlük karne — koşular (✓/✗/iptal), başarı yüzdesi, medyan süre, retry/verify, kaynak dökümü, medya maliyeti, anlık kuyruk; üst üste başarısızlıkta kırmızı uyarı + son başarısız görev.
- **Yetenek Matrisi'ne Tasks ızgarası:** görev aileleri × ajanlar (retry/tarih gürültüsü normalize edilir); hücre yeşil = hep başarılı, kırmızı = hep başarısız, turuncu halka = karışık; kaynak etiketi (`man/sch/trg/wf`); tıkla → görev tarihçesi.
- **Insights `task` uyarıları:** başarı oranı %50 altına düşen ajan (≥5 koşu) ve son koşuları hep FAILED olan görev ailesi uyarı düşürür.

### 2.16.0 — Hafıza & Nöbet Yönetimi Dalga 3: Birleşik Zekâ (2026-07-11)

- **Yetenek Matrisi'ne iki yeni matris:** *Memory files × Ajanlar* (recall yoğunluğu + **diverjans halkası** — kopya en yeni sürümden sapmışsa turuncu; ＋ ile indeksli kopyalama) ve *Duties × Ajanlar* (kadans/⏸ hücreleri, ＋ ile nöbet kopyalama). Filonun tüm bilgi ve nöbet dokusu tek ekranda.
- **Ajan Detayında "Context health" kartı:** hafıza (dosya/token/orphan/hatırlanmayan/bayat), skills ve MCP kullanım özetleri, nöbet uyumu (DUTIES.md son okuma + haftalık oturum sayısı) — "bu ajanın zihni ne durumda" tek kart. Memory files tablosuna **Recalls 30d** kolonu ve orphan işareti eklendi.
- **Scan Memory Contradictions…:** ucuz modelle hafıza dosyaları arasında çelişki taraması; markdown rapor. Bkz. [Hafıza Yönetimi](#hafiza-yonetimi).
- **Frontmatter denetimi:** description'sız hafıza dosyaları Insights'ta.

### 2.15.0 — Hafıza & Nöbet Yönetimi Dalga 2 (2026-07-11)

- **Memory Graph paneli:** hafıza kayıtlarının `[[wikilink]]` dokusu — düğüm boyu token, yeşil = hatırlanmış, sarı halka = indekste yok; broken links / islands / hubs kartları; düğüme tıkla → dosya. Ayrıntı: [Hafıza Grafiği](#hafiza-grafigi-memory-graph).
- **Fix Memory Index…:** yetim dosyalara pointer ekle + ölü indeks satırlarını düş — seçmeli, yedekli, tek komut.
- **Copy Memory File to Agent…:** dosya + hedef MEMORY.md pointer'ı birlikte.
- **Add Duty from Template…:** kanıtlanmış 4 nöbet kalıbı (soru-cevap döngüsü, inbox tasnifi, haftalık hafıza bakımı, çıktı nöbeti).
- **Automate Duty…:** watch'lu nöbetten tek tıkla watch tetikleyicisi — ajan boştayken de ateşlenir; nöbet yerinde kalır.
- **Copy Duty to Agent… / Move Duty Up-Down:** nöbetleri filoda çoğalt, DUTIES.md sırasını panelden düzenle.

### 2.14.0 — Hafıza & Nöbet Yönetimi Dalga 1 (2026-07-11)

Skills/MCP'ye gelen "bir bakışta gör + tek tıkla yönet" olgunluğu hafıza ve nöbetlere taşındı:

- **Hafıza recall takibi:** Memory bölümü artık `N files • ~X tok • M recalled (30d)`; her dosyada gerçek hatırlanma sayısı/zamanı (`recalled ×5, last 2h` / `not recalled (30d)`), yeşil = kullanılıyor. Recall = ajanın dosyayı araçla açıkça açması (oturum kayıtlarından). Ayrıntı: [Hafıza Yönetimi](#hafiza-yonetimi).
- **Orphan işareti:** MEMORY.md'de referansı olmayan dosya satırda `⚠ orphan`; tooltip'te frontmatter type/description.
- **New Memory File… / Archive Memory File:** frontmatter iskeleti + otomatik indeks satırı; arşivleme `memory/archive/`'e taşır ve indeks satırını yedekli düşürür.
- **Edit Duty…:** nöbet görevini önceden doldurulmuş sihirbazla düzenle (başlık/kadans/watch/do/not) — DUTIES.md'yi elle açmak gerekmez.
- **Watch önizleme:** `3 waiting` tooltip'i artık bekleyen dosya adlarını ve en eskisinin yaşını gösterir.
- **Oturum görüntüleyici varsayılanı:** `maxTranscriptMessages` 400 → **1500**.
- **Ayrıca (2.13.1–2.13.2):** timeline session-start işareti maviye döndü; bazı oturum sayfalarının "Loading…"de takılması düzeltildi (transkriptte `</script>` geçen oturumlar inline script'i bozuyordu — enjeksiyon artık kaçışlı).

### 2.13.0 — Yetenek Yönetiminde Derinlik + Uzun Zaman Aralıkları (2026-07-10)

**Skills & MCP yönetimi — bir bakışta gör, tek tıkla yönet:**

- **Yetenek Matrisi paneli** (yeni): Skills × Ajanlar ve MCP × Ajanlar ızgaraları; 30 günlük kullanım yoğunluğu, özet çipleri, ölü yetenek işaretleri ve boş hücreden tek tıkla kopyalama. Bkz. [Yetenek Matrisi](#yetenek-matrisi).
- **Ağaçta bir-bakışta durum:** MCP/Skills bölüm başlıkları artık `N • M used (30d)` (+ MCP'de `K disabled`); satırlarda son kullanım zamanı; MCP tooltip'inde en çok çağrılan araç dökümü.
- **MCP yönetimi (sağ tık):** Edit MCP Server… (yerinde düzenle, yedekli), Disable/Enable MCP Server (ajanın `disabledMcpjsonServers` listesi), Copy MCP Server to Agent…
- **Skill yönetimi (sağ tık):** Copy Skill to Agent…, Move Skill Between Agent/User Scope…, Reveal Skill Folder.
- **Sağlık bulguları:** açıklamasız SKILL.md uyarısı + kullanılmayan agent-kapsamı skill bilgisi.

**Uzun zaman aralıkları:**

- **Live Timeline** artık **8h** ayrıntı + **24h / 3d / 7d / 30d** yoğunluk görünümü sunuyor. Yoğunluk görünümünde her kulvar zaman dilimlerine bölünüp aktivite çubuklarıyla çizilir (araçlar/komutlar/izin beklemeleri). Olaylar `globalStorage/live-events.jsonl`'e yazıldığı için **reload zaman çizelgesini sıfırlamıyor**; bellekte 24 saat, diskte 31 gün tutulur (64MB tavan). Neden 31 gün: hook olayları daha uzun ölçekte desen taşımaz; uzun vade için Dashboard doğru araç.
- **Dashboard** maliyet aralığına **180g ve 365g** eklendi; 120 günü aşınca çubuklar okunur kalsın diye günlükler haftalık gruplanıyor. Ek yük yok — veri zaten oturum kayıtlarında.

### 2.12.0 — Skill Yönetimi (2026-07-10)

- **Agents ağacına Skills bölümü:** her ajanın altında MCP'nin yanına — Claude Code'un okuduğu aynı klasörlerden (`.claude/skills/` agent kapsamı + `~/.claude/skills/` user kapsamı, agent gölgeler) SKILL.md envanteri; ad, kapsam, açıklama (tooltip) ve **son 30 gündeki gerçek çağrı sayısı** (modelin `Skill` aracı çağrıları + senin yazdığın `/komut` çağrıları oturum kayıtlarından sayılır; yeşil kıvılcım = kullanılıyor). Tıkla → SKILL.md açılır. Ayrıntı: [Skill Yönetimi](#skill-yonetimi).
- **Add Skill… / Remove Skill:** bölümde **+** ad + açıklama sorup `.claude/skills/<ad>/SKILL.md` iskeletini kurar ve açar; çöp ikonu klasörü siler (bir kerelik yedek `.claude/skills.afbak/` altında; user kapsamlı skill silinirken "bütün ajanlar kaybeder" uyarısı modalda).

### 2.11.0 — ↑ Zıplama Düzeltmesi, Model Bazlı Context Tavanı, Damgalı Export (2026-07-10)

- **↑ oku düzeltildi:** tur bandındaki ↑ (ve Turn breakdown tablosunda yukarıdaki bir tura tıklama) hiçbir şey yapmıyordu. Neden: bantlar yapışkan (`position: sticky`) olduğundan geçilmiş her bant tarayıcıya "zaten ekranın tepesindeyim" diyor, `scrollIntoView` da yerinden kıpırdamıyordu. Zıplama artık turun ilk mesajını çapa alıp bant yüksekliği kadar pay bırakarak kaydırıyor — iki yön de çalışıyor.
- **Context now tavanı modele göre:** sabit 200K varsayımı kalktı. Tavan oturumun modelinden bulunur (Fable 5 / Mythos 5 / Opus 4.6–4.8 / Sonnet 4.6+ → 1M; Haiku 4.5 ve eski nesiller → 200K); model tabloda yoksa yüzde/renk yok, sadece ham bağlam boyutu. `agentFarm.contextWindowTokens` varsayılanı artık **0 = otomatik**.
- **Export MD dosya adına zaman damgası:** `session-<id>-YYYY-MM-DD_HHMMSS.md` (yerel saat) — aynı gün içindeki tekrarlı dışa aktarımlar aynı adı önermez.

### 2.10.0 — Terminal Render Çareleri (2026-07-10)

- **Terminal Rendering Fix… komutu:** hayalet boşluk / satır kaybı yaşayanlara tek durak — mevcut ayar durumunu gösterir; render fix (`gpuAcceleration: off` + `smoothScrolling: off`), persistent sessions kapatma, varsayılana dönüş ve tüm terminal ayarlarına kısayol.
- **`agentFarm.externalTerminal`:** Start/Continue/Resume oturumları Windows Terminal'de (yoksa cmd) açılır — uzun claude oturumları xterm.js'e hiç girmez. Farm görevleri izleme için entegre terminalde kalır. Ayrıntı: [Terminal Render Sağlığı](#terminal-render-sagligi).

### 2.9.0 — Export Seçim Kolaylıkları, Tur Gezinmesi, Odak Denetimi (2026-07-10)

2.8.0'a anında gelen geri bildirimin ("toplu seçim ve gezinme söylenmeden gelmeli") karşılığı:

- **Export seçimi her yerden:** Turn breakdown tablosuna tur başına onay kutusu (`md` kolonu) — **bantlardaki kutularla canlı senkron**; satırda **only** (yalnız bu tur), üstte **All / None / Invert** toplu düğmeleri; başlıkta ve Export MD düğmesinde `12/37 in export` sayacı.
- **Tur gezinmesi:** her bantta **↑ ↓** — kaydırmadan önceki/sonraki tura atla (bant yapışkan, oklar hep görünür).
- **Export MD son kaydedilen klasörü hatırlar;** bir sonraki kayıt penceresi oradan açılır.
- **Odak kaybı denetimi (tüm eklenti):** dengeli-parantez taramasıyla 38 QuickPick/InputBox adımının pencere odak kaybında **sessizce kapandığı** bulundu — sihirbaz ortasında akışı mesajsız öldürüyordu ("ajan sorusu hiç gelmedi" deneyiminin en olası nedeni). 38'i de düzeltildi. Ayrıca çapraz doğrulama: tanımlı her komut kayıtlı, her menü referansı geçerli, her sağ-tık `when` koşulu gerçek bir ağaç durumuyla eşleşiyor.
- **Add Trigger ajan sorusu netleşti:** "Which agent runs this task when the trigger fires?" + kurulum onayı hedefi söylüyor ("armed — runs on psikolog…"). Workflow sihirbazındaki "Run now" artık tam olarak yeni kurulan zinciri koşturuyor.

### 2.8.0 — Tur Bantları, MD Dışa Aktarım, Sihirbaz ve Tetik Düzeltmeleri (2026-07-10)

Üçüncü geri bildirim turu:

- **Belirgin tur bantları:** silik `Turn n/m` çizgisi tam genişlikte **renkli ve yapışkan** banda dönüştü — vurgu renkli kenar, kalın tur numarası, komut özeti, token/maliyet. Kaydırırken aktif turun bandı üstte sabit kalır.
- **⬇ Export MD:** görüntüleyicideki **o anki görünüm** Markdown dosyasına iner — Show chip'leri (yalnız Dialog, yalnız Tool calls…), metin filtresi ve replay konumu aynen uygulanır. Her tur bandındaki onay kutusuyla turlar tek tek dahil/hariç edilir. Dosya başına oturum kimliği, toplamlar ve filtre özeti yazılır; kayıt sonrası dosya editörde açılır.
- **Workflow sihirbazı düzeltildi:** `✓ Finish & save workflow` artık adım seçicinin **en üstünde**; adım varken Esc'ye basmak sihirbazı sessizce çöpe atmak yerine **Save / Discard** diye sorar ("workflow oluşturamıyorum" şikâyetinin kökü buydu); adım ortasında vazgeçmek yalnız o adımı iptal eder. Adım sorusundaki "Stop workflow" etiketi netleşti: "If this step fails: stop the workflow" — bu, hata durumu seçimidir, sihirbazı bitirmez.
- **Tetik başına zamanlama:** Add Trigger sihirbazının son adımı **Default timing / Customize timing…** — debounce, cooldown ve saatlik tavan artık her tetik için ayrı ayarlanır. Kurulu tetikte sağ tık → **Edit Trigger**: ad, prompt, hedef ajan ve üç zamanlama alanı panelden düzenlenir; `farm-tasks.json`'ı elle açmak gerekmez.
- **Tetik eylemi netleşti:** "Run a task **on an agent you pick**" (sonraki adımda ajanı sen seçersin) ile "Dispatch — route to the best agent **automatically**" (ajan seçimi bilerek yok; kural + sınıflandırıcı yönlendirir) ayrımı etikette; ajan seçici pencere odak kaybında artık sessizce kapanmıyor.

### 2.7.0 — Oturum Görüntüleyici Cilası (2026-07-10)

İkinci geri bildirim turu — hepsi oturum inceleme deneyimi üzerine:

- **Herhangi bir oturumdan devam:** oturum satırında ⏵ / sağ tık → **Resume Session in Terminal** (`claude --resume <id>`); Oturum Görüntüleyicide sağ üstte **⏵ Resume**. Continue Latest artık tek seçenek değil.
- **Turn breakdown tablosu:** tüm turlar tek tabloda (no, komut özeti, token, maliyet); satıra tıkla → tura atla. Tur muhasebesi düzeltildi: thinking-only asistan adımlarının token'ı artık turuna yazılıyor — tur toplamları oturum toplamını birebir tutuyor (önceden büyük kısmı görünmüyordu).
- **Show filtresi:** All / Dialog / User / Assistant / Tool calls / Results / Errors chip'leri; pasif görünümü de replay akışını da filtreler. "Dialog" = yalnız sen + asistan.
- **Replay çubuğunda ✕ Exit** — çıkış için yukarı kaydırma bitti.
- **Oturum adları insanlaştı:** `<command-name>…` blokları, `/komutlar` ve `!` satırları başlık olmaz; başlık ilk gerçek cümleden gelir (array içerikli yeni transcript formatı da destekli). Tur etiketlerinde komutlar `/clear` gibi kısa adla görünür.
- **Rename Session…:** oturuma kalıcı özel ad ver; boş bırak → otomatik başlık geri gelir.
- Arayüzdeki "Kılavuz" kelimeleri temizlendi (arayüz dili İngilizce).

### 2.6.0 — Gözlemlenebilirlik Cilası (2026-07-10)

İlk gerçek kullanıcı geri bildirimi turu. Dört istek, dört özellik:

- **Tur bazlı token dökümü:** oturum görüntüleyicide her kullanıcı komutu bir tur ayracı açar — `Turn 3/12 · 45.2K tok · $0.31`. Oturum toplamının hangi turda harcandığı artık görünür. Yalnız araç çağıran (metinsiz) asistan adımlarının token'ı da artık kaybolmuyor: ilk araç satırında gösterilir.
- **Context now göstergesi:** son isteğin bağlam boyutu ve `contextWindowTokens` yüzdesi; %70'te sarı + `/compact` önerisi, %90'da kırmızı. Oturum kaydı değiştikçe görüntüleyici kendini **canlı** tazeler; Recent Sessions tooltip'inde de `Context now: ~181.9K tokens` satırı var.
- **Yapışkan replay çubuğu:** replay kontrolleri artık mesajlarla birlikte yukarı kayıp kaybolmuyor — çubuk ekranın üstüne sabitlenir, Pause/hız her an elinin altında.
- **Token lap sayacı:** `Reset Token Lap` komutu kronometre lap'ı / günlük km sayacı gibi ikinci bir sayaç başlatır; durum çubuğunda `⏱ 84.2K`, tooltip'te ayrıntı ve sıfırlama linkleri. `Clear Token Lap` kaldırır. (Son 48 saatlik pencereden beslenir.)
- Ayrıca: Quick Start'a "bölüm görünmüyorsa" notu (VS Code'un gizlenmiş görünümleri hatırlaması).

### 2.5.0 — Ölçek ve Ekosistem / Ultra Faz J (2026-07-09) — ULTRA PLAN TAMAM

- **Paralel worktree koşuları (J1):** `Run Parallel Worktrees…` her istemi kendi git worktree'sinde koşturur (af/ dalları); `Worktree Runs…` ile diffstat + Merge/Open/Discard; eski git sürümü geri düşüşü
- **Canlı relay (J2):** uzak makinede `farmRelay.js` transcript olaylarını senkron dosyasına yazar; `agentFarm.relayFeeds` bu dosyayı canlı monitöre akıtır — uzak ajan WORKING görünür
- **OpenTelemetry dışa aktarım (J3):** oturumlar (subagent ağacı ebeveyn-çocuk span'leriyle) OTLP/JSON — Langfuse/Tempo'ya beslenebilir
- **Agentpack galerisi (J4):** `packGalleryRepos` (git/klasör) → `Browse Agent Pack Gallery…` → güvenli import akışı
- **Çoklu-CLI (J5):** `cliProfiles` ile gemini/codex görevleri ({prompt}/{args} şablonları); derin gözlem Claude'a özgü kalır
- **Sesli brifing (J6):** `Speak Daily Briefing (TTS)` — günlük özet fal.ai TTS ile mp3 olarak telefona/vault'a

### 2.4.0 — Zekâ Derinliği / Ultra Faz I (2026-07-09)

- **Talimat sürümleme (I1):** her CLAUDE.md değişikliği içeriğiyle tarihçeye; `Instruction History & Impact…` sürüm başına oturum/kalite/maliyet korelasyon tablosu ("bu kuraldan sonra kalite ▲0.6")
- **A/B talimat deneyi (I2):** iki varyant izole kum havuzlarında aynı istemlerle koşar (eval vakaları otomatik istem seti olur), hakem rastgele sırayla karşılaştırır; B kazanırsa tek tık kalıcı (.afbak + tarihçe)
- **Hafıza distilasyonu (I3):** şişmiş/bayat memory dosyalarına ucuz model yoğunlaştırma taslağı → diff → onaylı uygulama; limit mesajı/frontmatter kaybı korumaları
- **Semantik hafıza sorgusu (I4):** `Ask Fleet Memory…` — memory/*.md dosyalarında anlam bazlı arama, ajan bazlı sonuç (transcript indeksinden ayrı artımlı indeks)
- **Model politikası (I5):** `agentFarm.modelPolicy` kurallarıyla kaynak/ajan/istem bazlı model yönlendirme + `quotaDowngradePercent` ile pencere dolunca otomatik ucuza düşürme; karar çıktı başlığına yazılır

### 2.3.0 — Güvenlik ve Güvenilirlik / Ultra Faz H (2026-07-09)

- **Guardrail denetçisi (H1):** izin kuralları otomatik denetlenir — bypass modu, tehlikeli kalıplar (`rm -rf`, `curl|sh`, force push…), aşırı geniş kurallar (`Bash(*)`), 30 gündür kullanılmayan joker kurallar, mükerrerler; bulgular Insights'ta, tık = ayar dosyası
- **Tetik karnesi (H2):** tetik satırında `fired 12× • 7d: 9✓/1✗ • start ~4s`; `Trigger Reliability Report` tablosu; "hep fail" ve "hiç ateşlenmemiş" uyarıları
- **Nabız kontrolü (H3):** ajan başına sabit ucuz prompt + kimlik tutarlılığı hakemi; `agentFarm.pulse` nightly/weekly veya elle; FAIL → Insights ⛔
- **Headless servis (H4):** VS Code kapalıyken zamanlama + watch tetiklerini işleten yerel node servisi (schtasks, logon); heartbeat ile çakışmasız devir; çıktılar aynı arşive, "sen yokken N görev koştu" bildirimi

### 2.2.0 — Komuta Merkezi / Ultra Faz G (2026-07-09)

- **Onay kuyruğu (G1):** "Needs You" paneli — izin bekleyenler, tarayıcı onayları (kuyruktan Run/Reject), stalled, bütçe aşımı, Antigravity çakışması, talimat önerileri, park edilmiş görevler tek aciliyet sıralı listede; durum çubuğu rozeti artık kuyruğu sayar ve tıklayınca açar
- **Kanban panosu (G5):** Inbox/Parked/Running/Needs Approval/Done kolonları, sürükle-bırak geçişler, kart rozetleri, üstte doğal dil komuta çubuğu
- **Maliyet anomalisi (G2):** 14 gün medyan+MAD dedektörü (bütçeden bağımsız, model çağrısız) + `Cost Anomaly Report` (ağır toplar: token'ın %50'sini yiyen oturumlar)
- **Eval seti (G3):** düşük puanlı/verify-FAIL izler tek adımda regresyon vakası; onaylı koşu + "12/14 geçti, 2 geriledi" karnesi
- **Oturum replay (G4):** görüntüleyicide ▶ Replay — gerçek aralıklarla adım adım oynatma, hız 1x-8x, hata/prompt atlama
- **Subagent ağacı (G6):** oturum listeleri ağaç oldu; ebeveyn satırında ⧉ maliyet rollup'ı (5 seviye)

### 2.1.0 — Semantik Arama + Tarayıcı Adımları + Ultra Yol Haritası (2026-07-09)

- **Semantik arama (D4 tamam):** arama panelinde "semantic" modu — anlam bazlı sorgu; Gemini API veya OpenAI-uyumlu uç (Ollama ile tamamen yerel olabilir); dosya tabanlı artımlı vektör indeksi, `Build Semantic Index` komutu, benzerlik rozetleri
- **Tarayıcı adımları (F3 tamam):** zincirde Browser step — ajan kendi tarayıcı MCP'siyle koşar; alan adı allowlist'i pazarlıksız (kapsamayan URL hiç çalışmaz), adım başı modal onay varsayılan; onFail kuralları işler
- **ULTRA Gelişim Planı:** internet araştırmasına dayalı ikinci nesil yol haritası (G/H/I/J fazları — onay kuyruğu, maliyet anomalisi, eval seti, kanban pano, guardrail denetçisi…) — `Open Ultra Roadmap` komutu
- Testler: 20 kontrol — sahte embedding sunucusuyla (OpenAI+Gemini şemaları) tam semantik hat, artımlılık/kalıcılık/prune, allowlist ve prompt korumaları

### 2.0.0 — Doğal Dil Komuta ve Dispatcher / Plan Faz F çekirdeği (2026-07-09)

- **🚀 Doğal Dil Komuta:** tek cümle → ucuz model → doğrulanmış plan (görev/zamanlama/zincir) → insan-okur önizleme → onayla kurulum; yalnızca gerçek ajan adları kabul edilir, "yarın" gibi ifadeler o anki tarihe göre çözülür
- **Dispatcher:** tetik eylemi "Dispatch" — gelen işi kurallar (regex→ajan) yönlendirir, tutmazsa ucuz model CLAUDE.md rol özetlerinden seçer; `Test Dispatcher…` ile kurmadan dene
- Faz F durumu: F1+F2 kod olarak tamam; F3 (tarayıcı otomasyonu) tarayıcı MCP + MCP paneliyle bugün de kurulabilir (özel adım tipi ertelendi); F4 (ses döngüsü) mevcut Whisper reçetesi + inbox tetiğiyle karşılanıyor (S20); F5 (çoklu-CLI) düşük öncelikle ertelendi
- Testler: 16 kontrol — plan doğrulama/önizleme, kural yönlendirme; gerçek haiku ile "yarın 09:00" zaman hesabı, 2 adımlı zincir sırası ve sınıflandırıcının doğru ajanı seçmesi

### 1.3.0 — Antigravity Uyumluluğu (2026-07-09)

- **Sync Agent with the Other Engines…:** CLAUDE.md → AGENTS.md üretimi (senkron işaretli), aktif nöbetler → `.agents/workflows/` slash-komutları, `.mcp.json` → global gemini yapılandırması için birleştirme önerisi; `memory/` dokunulmaz (iki araç da düz markdown okur)
- **Yönlü senkron:** parmak izi takibiyle hangi tarafın ilerlediği algılanır — Claude→Antigravity tazeleme, Antigravity→Claude geri taşıma (yedekli), çakışmada Diff/yön seçimi; elle düzenlenen dosyalar korunur
- **Insights:** `antigravity` kategorisi — tek taraf ilerlemişse info hatırlatma, iki taraf da değiştiyse warning
- Testler: 27 kontrol — dönüşüm/geri dönüşüm, tam yaşam döngüsü (none→in-sync→ahead→conflict→çözüm), yabancı dosya koruması, sıfır gürültü

### 1.2.0 — Ölçek ve Taşınabilirlik / Plan Faz E (2026-07-09)

- **Çoklu makine:** `extraClaudeDirs` ile diğer makinelerin senkronlu `.claude` klasörleri aynı panelde; oturumlarda ⇄ makine rozeti, cwd ile ajan eşleşmesi, eksik senkron uyarısı
- **Günlük özet kartı:** telefon dostu, model çağrısız günlük karne — `dailyDigest` saatiyle webhook'a (`digest` olayı) veya elle
- **Ajan paketleri:** `.agentpack` dışa/içe aktarım — kimlik+nöbet+araçlar+workflow/tetik/zamanlama tek dosyada; hafıza ve sırlar asla pakete girmez, sır kokan dosyalar otomatik atlanır, içe aktarılan tetik/zamanlamalar kapalı gelir
- **Yayın hazırlığı:** LICENSE (MIT), CHANGELOG.md, README gizlilik beyanı + yayın adımları — Marketplace kararı kullanıcıda
- Testler: 26 kontrol — paket roundtrip/sır dışlama/yol kaçışı/yeniden bağlama, digest içerikleri, çoklu makine taraması gerçek dosyalarla

### 1.1.0 — Zeki Gözetim / Plan Faz D (2026-07-09)

- **Kalite Karnesi:** ucuz model hakem son oturumları 1-5 puanlar; Dashboard ve filo raporunda Quality kolonu; düşüş trendi ve düşük ortalama uyarıları Insights'ta
- **Talimat Önerileri:** takip mesajlarındaki tekrarlanan düzeltmelerden CLAUDE.md kuralı önerisi; Insights'ta 💡, tek tıkla onaylı uygulama (`## Learned rules` bölümü)
- **Haftalık Akıllı Özet:** bütçe-trend-hata-kalite başlıklarının üç cümlelik insan dili özeti; bildirim + vault dosyası + webhook (`summary` olayı)
- **Transcript Arama:** tüm oturum kayıtlarında metin/regex arama paneli (ajan filtresi, vurgulu bağlam, oturuma atlama)
- Otomatik döngüler varsayılan kapalı (`qualitySample`, `suggestScan`, `weeklySummary`) — elle komutlar her zaman açık; iç çağrılar daima ucuz model
- Testler: 28 kontrol — kalite örnekleme/trend, öneri motoru (dedupe + CLAUDE.md'ye ekleme), arama (regex/filtre/sınır), özet; gerçek haiku çağrılarıyla uçtan uca

### 1.0.0 — İçerik Fabrikası / Plan Faz C (2026-07-09)

- **🎬 Medya adımları:** fal.ai kuyruk API'siyle görsel/video/ses üretimi zincirin içinde; varlıklar arşive iner, yanıt sonraki adıma devrolur; anahtarsız/kredisiz durumlar net hatayla yakalanır
- **Medya Galerisi:** önizlemeli panel (görsel/video/ses), model+girdi+maliyet+köken bilgisi, Re-run ve Vary
- **Medya maliyeti:** kural tabanlı tahmin, galeri toplamı ve Dashboard "Media cost" kartı — metin+medya tek karnede
- **Reçeteler:** Metin→Görsel, Metin→Görsel→Video, Ses→Metin hazır şablonları
- **API anahtarı rehberi:** Sır Kasası bölümüne adım adım "anahtar nasıl eklenir" + üç altın kural
- Testler: sahte fal sunucusuyla tam hat (indirme/meta/maliyet/devir) + gerçek fal.ai kimlik-hata yolu (anahtar tanındı, bakiye hatası zarifçe yakalandı)

### 0.9.0 — Dış Dünya Köprüsü / Plan Faz B (2026-07-09)

- **MCP Yönetimi:** ajan başına sunucu envanteri (gerçek 30 günlük kullanım sayılarıyla), panelden ekle/kaldır, kullanılmayan sunucu denetimi
- **Sır Kasası:** anahtarlar OS anahtarlığında; görevlere env enjeksiyonu + `{secret:NAME}` şablonu; düz metin anahtar uyarısı
- **Webhook Köprüsü:** 🌐 webhook adımı (yanıt zincire devrolur), `/trigger/<token>` içeri ucu (`{payload}` değişkeni), n8n/Make/Zapier ile çift yönlü entegrasyon
- **Bildirim Yönlendirme:** izin/takılma/bütçe/zincir olayları seçilebilir filtreli webhook'a JSON POST — telefona düşen filo
- Tümü gerçek HTTP mekanikleriyle test edildi (yerel sunucu + gerçek dinleyici; filo MCP kullanımı gerçek transcript'lerden doğrulandı: obsidian=394 çağrı/30g)

### 0.8.0 — Otomasyon Çekirdeği / Plan Faz A (2026-07-09)

- **Tetikleyiciler:** watch (dosya/klasör değişince) ve hook (canlı olay) tetikleri → görev veya workflow; debounce/cooldown/saatlik tavan fırtına korumaları; `{watch}` değişkeni; Tasks'ta ⚡ Triggers bölümü
- **Doğrulayıcı adımlar:** ucuz-model hakem (PASS/FAIL) + gerekçeli otomatik retry; karar arşive işlenir; `verify pass/fail` rozetleri
- **Yapılandırılmış devir:** JSON output contract, `{prev_text}` ve `{prev_json.alan}` değişkenleri, `json:alan~regex` koşulları; çit/gömülü JSON'a toleranslı ayrıştırıcı (gerçek testin yakaladığı ders)
- **Eşzamanlılık + kota bekçisi:** görev tavanları, "deferred" bekletme ve otomatik pompa; 5h penceresi doluluk eşiğinde otomatik işleri erteleme
- **Görev tarihçesi:** aylık JSONL arşivi (Open Task History), çıktı klasörü boyut tavanı
- Çıkış ölçütü gerçek testle kanıtlandı: inbox'a bırakılan dosya, tetikleyici→zincir→hakem onayı→arşiv döngüsünü elle hiç dokunmadan tamamladı

### 0.7.2 — Gerçek Test Kampanyası (2026-07-08)

- **11 senaryonun tamamı gerçek çalıştırmalarla test edildi** (13 haiku oturumu, $0.17) — Örnek Kullanımlar belgesinde her senaryoya test notu eklendi
- **Düzeltme (runIf):** koşul artık yalnızca modelin çıktısına bakar — eskiden arşiv başlığındaki workflow adı/prompt metni koşulu yanlışlıkla tetikleyebiliyordu (gerçek testin yakaladığı bug)
- **Düzeltme (stdin):** headless görevlerde claude'un 3 saniyelik stdin beklemesi ve arşivlere sızan "no stdin data" uyarısı giderildi — görevler daha hızlı, çıktılar temiz

### 0.7.1 — Örnekler ve Ucuz Otomasyon (2026-07-08)

- **Örnek Kullanımlar belgesi:** 11 adım-adım operasyon senaryosu (`Agent Farm: Open Examples`); kritik akışlar gerçek haiku çalıştırmalarıyla test edildi
- **`agentFarm.taskExtraArgs`:** görev/workflow komutlarına CLI argümanı ekleme — rutin otomasyonu `--model haiku` ile ucuza koşturmanın anahtarı
- Kılavuz paneli artık birden çok belgeyi destekliyor
- Ajan kökünde `deneme` alıştırma ajanı (testlerde kuruldu; senaryoların uygulama sahası — istenirse silinebilir)

### 0.7.0 — Cila (2026-07-08)

- **Workflow düzenleyici:** adım düzenle (başlık/prompt/ajan/mod/on-fail/run-if), sırala, ekle, sil; workflow yeniden adlandır — silip kurmak tarih oldu
- **Timeline'da zincirler:** Workflow runs bölümü — her koşu kendi şeridinde, numaralı adım blokları, durum renkleri
- **Haftalık trend uyarıları:** son 7 gün önceki 7 günün `trendAlertFactor` katına ulaşınca Insights uyarısı (ajan + filo)
- **Nöbet uyumu:** Duties başlığında `read 2h ago / never read`; oturum yapıp DUTIES.md'ye hiç bakmayan ajan için uyarı
- **Otomatik raporda çıktılar:** dönemin görev çıktı özeti rapora eklenir (`autoReportIncludeOutputs`)
- **Eklenti ikonu:** Extensions görünümünde Agent Farm artık kendi yüzüyle görünüyor

### 0.6.0 — Nöbet ve Erişilebilirlik (2026-07-08)

- **Nöbet Görevleri (Standing Duties):** ajanla süreklilik anlaşmaları tek sistemde — `DUTIES.md` (ajan okur + panel yönetir), kadanslar (every-turn/session-start/daily/weekly/manual), Watch/Do alanları, sihirbazla ekleme, duraklat/sil, elle düzenleme korunur
- **Bir bakışta durum:** izlenen klasörde biriken dosya sayısı (`3 waiting`), dosyada son değişiklik, kayıp yol uyarısı — Agents ağacında ve ajan detay tablosunda
- **CLAUDE.md entegrasyonu:** referans yoksa onayla otomatik yönerge ekleme; Insights denetimleri (referanssız DUTIES.md, kayıp watch yolu, Do'suz görev)
- **Türkçe Hızlı Başlangıç:** ilk 3 dakika turu, üç temel alışkanlık, 14 maddelik "ne yapmak istiyorsun?" tarif listesi, 30 saniyede kavramlar; `Agent Farm: Quick Start` komutu

### 0.5.0 — Zekâ (2026-07-08)

- **Koşullu dallanma:** adım başına `runIf` (önceki çıktıya regex koşulu; tutmazsa adım atlanır) ve `onFail` (Stop / Continue / Jump to step N); 25 yürütmelik döngü koruması
- **Bütçe uyarıları:** `agentFarm.budgets` ile ajan/filo günlük bütçeleri; %80'de uyarı, aşımda hata + günde bir bildirim; Dashboard'da bütçe çubukları
- **Birleştirme taslağı:** sapmış hafıza kopyalarını tek belgede aç, elle birleştir, `Apply Merged Memory` ile yedekli olarak hepsine yaz
- **Görev Çıktı Özeti:** arşivlenmiş headless çıktıların dönemlik toplu Markdown raporu

### 0.4.0 — Otomasyon (2026-07-08)

- **Çoklu-Ajan İş Akışları:** ajan zincirlerinde otomatik adım geçişi; `{prev_output}` ile önceki adımın çıktısını sonraki ajana devretme; hata durumunda zincir durur
- **Headless çıktı arşivi:** headless görevler arka plan süreci olarak çalışır; çıktı başlık+çıkış kodu+süre ile Markdown'a arşivlenir; Open Task Output
- **Görev şablonları:** Save as Template / New Task from Template; ajana bağlı veya serbest
- **Otomatik filo raporu:** günlük/haftalık, hedef klasöre (Obsidian vault) kendiliğinden yazılır
- **Windows Görev Zamanlayıcı dışa aktarımı:** zamanlanmış görevi VS Code'dan bağımsız çalışan schtasks kaydına çevirir (script + panoya hazır komut)

### 0.3.0 — Koordinasyon (2026-07-08)

- **Tasks görünümü:** ajan başına görev kuyruğu; interactive/headless modlar, başlat/sırala/tamamla/iptal, terminal takibiyle otomatik done/failed, isteğe bağlı otomatik ilerleme (`queueAutoAdvance`)
- **Zamanlanmış görevler:** günlük / haftalık / tek seferlik; VS Code açıkken otomatik tetiklenir, bildirim düşer
- **Sync Shared Memory:** kopya hafıza gruplarını bul, diff'le karşılaştır, tek kaynaktan yedekli senkronla
- **Export Fleet Report:** karşılaştırmalı Markdown karne (cache verimliliği, hata oranı, bağlam yükü…) — Obsidian dostu
- Dashboard'a **Agent comparison** tablosu eklendi

### 0.2.0 — Canlı Gözlem (2026-07-08)

- **Live Timeline paneli:** ajan başına kulvar, araç koşu blokları, olay işaretleri, 15m/1h/4h pencere, canlı "şu an" çizgisi
- **Hook dinleyicisi:** 127.0.0.1 üzerinde yerel HTTP dinleyici; 9 hook olayı (PreToolUse, PostToolUse, UserPromptSubmit, Notification, Stop, SubagentStop, SessionStart, SessionEnd, PreCompact)
- **Install/Remove Live Hooks:** yedekli, mevcut ayarları koruyan güvenli kurulum sihirbazı
- **Durum makinesi:** WORKING / TOOL / PERMISSION? / YOUR TURN / STALLED / IDLE / ENDED
- **Bildirimler:** izin bekleme, takılma (ayarlanabilir eşik), isteğe bağlı tur sonu
- Agents ağacı ve durum çubuğu canlı durumla besleniyor; bekleyen ajan varken durum çubuğu sarıya döner
- Live Feed gerçek zamanlı hook olaylarını gösteriyor (hook yokken transcript'e döner)

### 0.1.0 — İlk sürüm (2026-07-08)

- Agents / Recent Sessions / Insights / Live Feed ağaçları
- Dashboard: KPI'lar, ajan bazlı günlük maliyet, model dağılımı, token tipleri, ısı haritası, 5 saatlik pencere, en pahalı oturumlar
- Ajan Detay Sayfası ve Oturum Görüntüleyici
- 8 kurallı sağlık/optimizasyon motoru
- Maliyet motoru (düzenlenebilir fiyat kuralları, cache ayrımı, tekrar sayım koruması)
- Yeni ajan iskeleti, oturum başlat/devam ettir, durum çubuğu
- Bu kılavuz


---

## Ek: Ajan Ekosistemi Kurulum & Taşınabilirlik Kılavuzu (Portability Blueprint) {#portability-blueprint}

> [!abstract] 📖 EL KİTABININ AMACI VE KAPSAMI
> Bu başucu kitabı; bağımsız yapay zeka ajanlarından oluşan bir geliştirme ve operasyon filosunu, bu filoyu yöneten **Agent Farm** VS Code kokpitini ve arka plandaki **Obsidian Bilgi Tabanını (LifeOS)** sıfırdan kurmak, yapılandırmak veya başka bir bilgisayara eksiksiz taşımak için hazırlanmış uçtan uca mimari rehberdir.
> 
> İster bir format sonrası felaket kurtarma (disaster recovery) senaryosunda olun, ister sistemi tamamen yeni bir donanımda ayağa kaldırıyor olun; bu rehberdeki adımları sırasıyla takip ettiğinizde 15-20 dakika içinde çalışan, tam fonksiyonel bir ajan ekosistemine sahip olursunuz.

---

### 00. Giriş & Sistem Mimarisi Felsefesi

Modern yapay zeka araçlarının en büyük kısıtı "anlık ve hafızasız (stateless)" olmalarıdır. Ajanlar bir görevi tamamlayıp kapandığında bağlam kaybolur, projelerin tarihçesi unutulur ve sistem dağılır. 

Bu ekosistem, yapay zekayı anlık bir sohbet botu olarak değil; **yaşayan, kuralları olan, hafızasını koruyan ve birbiriyle organize çalışan otonom bir şirket filosu** olarak kurgular.

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                           İNSAN OPERATÖR                                │
│           (Stratejik Karar, Hedef Belirleme, Onay & Vizyon)             │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ (Görsel Denetim & Bildirimler)
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    AGENT FARM KOKPİTİ (VS Code)                         │
│   Filo Durumu · Bütçe Takibi · Oturumlar · Canlı Akış · Görev Kuyruğu   │
└──────────────────┬───────────────────────────────────┬──────────────────┘
                   │ (Bridge IPC / JSONL)              │ (REST API / MCP)
                   ▼                                   ▼
┌──────────────────────────────────────┐  ┌───────────────────────────────┐
│        AJAN FİLOSU (CLI)             │  │   BİLGİ TABANI (LifeOS Vault) │
│ • Developer (Kod & Hata Çözümü)      │  │ • Projeler & Backlog          │
│ • Manager (Planlama & Koordinasyon)  │◄─┼─►• Ajan Anayasası & Kararlar   │
│ • Psikolog (Kişisel Bağlam & Odak)   │  │ • Wiki & Hafıza Havuzu        │
│ • Basit / Haiku (Mekanik İşler)      │  │ • Canlı Sistem Tanımları      │
└──────────────────────────────────────┘  └───────────────────────────────┘
```

---

#### 0.1 İnsan - Kokpit - Filo Sacayağı

Sistem birbirinden ayrılmaz üç temel sütun üzerine kuruludur:

1. **Bilgi Tabanı ve Bellek (Obsidian LifeOS):** Sistemin "tek doğruluk kaynağıdır (Single Source of Truth)". Proje planları, görevler, anayasa kuralları, kararlar ve kullanıcı tercihleri burada yaşar.
2. **Yönetim Kokpiti (Agent Farm - VS Code Extension):** İnsan operatörün ajanları gözlemlediği, görev atadığı, maliyet ve token tüketimini izlediği görsel kumanda merkezidir.
3. **Çalışan Ajan Gücü (CLI Ajanları — Claude Code, Gemini, Antigravity):** Dosya sisteminde doğrudan kod yazan, test çalıştıran, dosyaları düzenleyen ve birbirine iş devreden bağımsız motorlardır.

> [!info] 📖 İLKE: TEK DOĞRULUK KAYNAĞI (SINGLE SOURCE OF TRUTH)
> Bir veri iki farklı yerde tutulursa kaçınılmaz olarak çelişki üretir. Bu mimaride tüm *olgular (FACTS)* Obsidian kütüphanesinde, tüm *çalışma metotları (METHODS)* ajan anayasasında (`CLAUDE.md` ve `_REF/`) yaşar. Ajanlar bilgiyi kendi hafızalarında kopyalamaz, kütüphanedeki adrese işaret eder.

---

#### 0.2 Taşınabilirlik (Portability) ve Yalıtım Prensipleri

Bu ekosistemin herhangi bir işletim sisteminde (Windows, macOS, Linux) ve herhangi bir kullanıcı klasöründe sorunsuz çalışabilmesi için **3 Altın Kural** geçerlidir:

*   **1. Asla Sabit Kullanıcı Yolu Yazmayın:** Kullanıcı adına bağımlı yollar yerine her zaman ortam değişkeni (`${env:USERPROFILE}`, `~` veya göreceli yol) kullanılır.
*   **2. Anayasa ve Kod Ayrımı:** Ajanların davranış kuralları (Anayasa) kod tabanına gömülmez; bağımsız markdown dosyalarında taşınır.
*   **3. Dizin Parametrizasyonu:** Tüm kök klasörler Agent Farm ayarlarından (`agentFarm.agentRoots`, `agentFarm.projectsRoot`) tek bir merkezden yapılandırılır.

---

#### 0.3 TÜM BAĞIMLILIKLAR VE DIŞ BAĞLANTI MATRIXİ (MASTER INVENTORY)

> [!important] 🔴 KURULUM ÖNCESİ KONTROL LİSTESİ
> Yeni bir bilgisayara geçildiğinde veya format sonrasında kurulması gereken tüm araçlar, eklentiler, motorlar ve portlar önem derecesine göre 5 ana katmanda toplanmıştır:

##### 1. Host & Çalışma Zamanı Katmanı (Zemin)
*   🔴 **Node.js (v20+ LTS):** `winget install OpenJS.NodeJS.LTS` (Zorunlu motor)
*   🔴 **Git (v2.40+):** `winget install Git.Git` (Sürüm kontrolü ve worktree)
*   🔴 **VS Code (v1.90+):** `code.visualstudio.com` (Agent Farm kokpit kabuğu)
*   🔴 **Global NPM Araçları:** `npm i -g @anthropic-ai/claude-code @vscode/vsce`

##### 2. Yapay Zeka Motorları ve CLI Katmanı (Zeka)
*   🔴 **Claude Code CLI (`@anthropic-ai/claude-code`):** Ana ajan çalıştırma motoru (`claude login` yetkisi şarttır).
*   🟢 **Antigravity / Gemini CLI:** Alternatif/çoklu-model motoru (`GEMINI_API_KEY`).
*   🟢 **OpenCode / Codex CLI:** Açık kaynaklı/yerel model motorları (`agentFarm.codexHome`).

##### 3. Bilgi Tabanı ve Obsidian Katmanı (Bellek)
*   🔴 **Obsidian (Uygulama):** `obsidian.md` (Vault kökü).
*   🔴 **`obsidian-local-rest-api`:** Vault okuma/yazma HTTP köprü (Port `27123`/`27124` + Bearer Token).
*   🔴 **`obsidian-tasks-plugin`:** Görev biçim standardı (🆔, ⛔, ⏫, 📅).
*   🟡 **`dataview`:** Dinamik proje indeksleri ve sorgular.
*   🟢 **`obsidian-git`:** Otomatik vault yedeği.

##### 4. Yerel Portlar ve Protokoller Katmanı (Haberleşme)
*   `4141` — **Bridge IPC Soketi:** Ajanlar ile VS Code arasında JSONL mesajlaşma.
*   `8377` — **Live Hook Listener:** Claude olaylarını (prompt, tool, permission) panele işleme.
*   `8378` — **Read-Only Web View:** Telefondan/LAN'dan filo ve bütçe izleme.
*   `27123/27124` — **Obsidian REST API:** Vault dosyalarına erişim.

##### 5. Harici Bulut ve Mesajlaşma Katmanı (İsteğe Bağlı Entegrasyonlar)
*   🟢 **Airtable API:** Görev tablosu bulut senkronizasyonu (`AIRTABLE_API_KEY` + `BASE_ID`).
*   🟢 **Telegram Bot API:** Telefondan ajana mesaj atma köprü (`agentFarm.telegram.enabled`).
*   🟢 **Replicate API:** Ajan bazlı görsel/medya üretimi (`mediaAuthSecret`).

---

### 01. Katman 0 — Host Ortamı ve Temel Çalışma Zamanı (Runtime)

Ajanların terminalde koşturulabilmesi ve Agent Farm eklentisinin derlenebilmesi için işletim sisteminde temel geliştirme araçlarının eksiksiz bulunması gerekir.

```powershell
# Sürümleri kontrol edin
node -v
npm -v
git --version
```

```powershell
# Claude Code CLI ve Eklenti Paketleme araçlarını global yükleyin
npm install -g @anthropic-ai/claude-code
npm install -g @vscode/vsce

# Claude CLI oturumunu başlatın ve tarayıcıdan giriş yapın
claude
```

---

### 02. Katman 1 — Bilgi Tabanı ve Yaşam İşletim Sistemi (Obsidian Vault)

```text
📁 {{VAULT_DIR}} (Obsidian Vault Kökü)
├── 📁 00_AGENT_AREA/                # Ajanların özel operasyon alanı
│   ├── 📁 10_PROJECTS/              # Aktif ve arşiv proje klasörleri
│   ├── 📁 20_WIKI/                  # Damıtılmış bilgi ve sentez havuzu
│   └── 📁 99_SYSTEM/                # Sistem anayasaları ve LifeOS tanımları
├── 📁 01_INBOX/                     # Giriş kutusu ve operasyonel akış
│   ├── 📁 10_TODO/                  # Görev listeleri (__TODO__.md)
│   └── 📁 20_PROGRESS/              # Devam eden işlerin durum raporları
└── 📁 90_OTHER/                     # Şablonlar, arşiv ve yardımcı dosyalar
```

#### 2.1 Obsidian Kurulumu ve Şart Eklentiler

> [!important] 🔴 ZORUNLU EKLENTİLER
> Obsidian kurulduktan sonra aşağıdaki topluluk eklentileri (Community Plugins) mutlaka kurulmalı ve etkinleştirilmelidir:
> 
> 1. **Local REST API (`obsidian-local-rest-api`):** Ajanların ve MCP sunucusunun vault'a HTTP üzerinden güvenli okuma/yazma yapmasını sağlar.
> 2. **Tasks (`obsidian-tasks-plugin`):** Görev yönetimi, öncelik (🆔, ⛔, ⏫, 📅) ve tarih formatlarını denetler.
> 3. **Dataview (`dataview`):** Dinamik sorgular ve proje indeksleri için gereklidir.

---

### 03. Katman 2 — Ajan Çekirdeği, Anayasa ve Görev Sistemi

```text
📁 {{AGENT_DIR}} (Ajan Filosu Kök Klasörü)
├── 📄 AGENTS.md             # Shared Constitution (Tüm ajanların ortak anayasası)
├── 📄 CLAUDE.md             # Claude CLI kök direktifleri (AGENTS.md ile senkron)
├── 📁 _REF/                 # Şartlı prosedürler kütüphanesi (On-demand recipes)
│   ├── 📄 bridge.md         # Köprü protokol kuralları
│   ├── 📄 notices.md        # Bildirim ve soru-cevap formatları
│   └── 📄 duties.md         # Nöbet görevleri format rehberi
└── 📁 developer/            # Örnek Ajan: Yazılım Geliştirici
    ├── 📄 AGENTS.md         # Ajanın kimliği, uzmanlık alanı ve odak repoları
    ├── 📄 DUTIES.md         # Ajanın periyodik nöbet görevleri kontrol listesi
    └── 📁 memory/           # Ajanın uzun vadeli hafıza bankası
```

---

### 04. Katman 3 — Kimlikler, İletişim ve MCP Sunucuları (Protocols)

`📂 ~/.claude/claude_desktop_config.json` veya `%USERPROFILE%\.claude.json`:
```json
{
  "mcpServers": {
    "obsidian": {
      "command": "npx",
      "args": [
        "-y",
        "obsidian-mcp",
        "--vault-path",
        "YOUR_VAULT_PATH_HERE",
        "--api-key",
        "YOUR_OBSIDIAN_REST_API_KEY_HERE"
      ]
    }
  }
}
```

---

### 05. Katman 4 — Agent Farm Kokpiti (VS Code Extension)

```powershell
# 1. Eklenti dizinine geçin ve derleyin
cd ~/projects/vsc_AgentFarm
npm install
npm run compile

# 2. VSIX paketini üretin ve kurun
vsce package --no-dependencies
code --install-extension agent-farm-3.206.0.vsix
```

`📂 %APPDATA%\Code\User\settings.json`:
```json
{
  "agentFarm.agentRoots": [
    "~/projects/ai-agents"
  ],
  "agentFarm.projectsRoot": "~/documents/lifeos_vault/00_AGENT_AREA/10_PROJECTS",
  "agentFarm.livePort": 8377,
  "agentFarm.web.enabled": false,
  "agentFarm.web.port": 8378,
  "agentFarm.newAgentModel": "sonnet"
}
```

---

### 06. Katman 5 — Köprü (Bridge) ve Bildirimler (Notices) Motoru

Bridge; yerel soket üzerinden JSONL formatında mesajlaşma sağlar (`localhost:4141`).

```json
{
  "type": "notice",
  "agent": "developer",
  "noticeType": "question",
  "title": "Mimari Onay Talebi",
  "content": "Değişiklik onaylansın mı?",
  "handled": false
}
```

---

### 07. Katman 6 — Uçtan Uca Doğrulama ve Felaket Kurtarma Kontrol Listesi

```text
┌───┐
│ ✔ │ 1. Node.js, Git ve Claude CLI terminalden hatasız yanıt veriyor mu?
├───┤
│ ✔ │ 2. Obsidian açıldı ve Local REST API eklentisi aktif mi?
├───┤
│ ✔ │ 3. Vault içinde 00_AGENT_AREA ve 99_SYSTEM klasörleri mevcut mu?
├───┤
│ ✔ │ 4. ajanlar/ kök klasöründe AGENTS.md ve _REF/ fihristi yerinde mi?
├───┤
│ ✔ │ 5. VS Code'da Agent Farm paneli tüm ajanları yeşil/hazır listeliyor mu?
└───┘
```

#### Hızlı Kurulum Özeti (Cheat Sheet)

```powershell
# 1. Ortamı hazırla
winget install OpenJS.NodeJS.LTS Git.Git
npm install -g @anthropic-ai/claude-code @vscode/vsce

# 2. Giriş yap
claude

# 3. Agent Farm'ı derle ve kur
cd ~/projects/vsc_AgentFarm
npm install
npm run compile
vsce package --no-dependencies
code --install-extension agent-farm-*.vsix
```

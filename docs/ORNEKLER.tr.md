# Agent Farm — Örnek Kullanımlar

> Bu belge, Agent Farm'ı **bilgi ekranı olarak değil, iş yaptıran bir sistem olarak** kullanmanın senaryolarıdır. Her senaryo hiç bilmeyen biri takip edebilsin diye adım adım yazıldı. ✅ işaretli senaryolar `deneme` ajanında **gerçek çalıştırmalarla** doğrulandı (13 haiku oturumu, toplam maliyet $0.17). Komut paletinden `Agent Farm: Open Examples` ile her an açılır.

## Başlamadan: Alıştırma Ajanı

Ajan kökünde **`deneme`** adında bir alıştırma ajanı var (test sürecinde kuruldu). İçinde:

- `CLAUDE.md` — mini kimlik + DUTIES.md yönergesi
- `DUTIES.md` — "Inbox tasnifi" nöbeti kurulu
- `inbox/` ve `arsiv/` klasörleri — nöbet alıştırma sahası
- `.claude/settings.local.json` — model **haiku**'ya sabitli (alıştırmalar ucuza koşar)

Aşağıdaki senaryoları önce `deneme` üzerinde uygulayıp sonra gerçek ajanlarına taşıyabilirsin. İşin bitince klasörü silmen yeterli — panel kendini günceller.

---

## S1 — Inbox Nöbeti: "Klasöre düşeni tasnif et" ✅

**Amaç:** Bir klasöre bıraktığın her dosyayı ajanın kendiliğinden işlemesi (senin FAST_NOTE akışın).

**Adımlar:**

1. Agents ağacında ajanı genişlet → **Duties** satırına sağ tık → **Add Standing Duty**.
2. Başlık: `Inbox tasnifi` → kadans: **every-turn** → **Pick a folder to watch…** ile klasörü seç (örn. `01_INBOX\00_FAST_NOTE`).
3. Do satırı: `Klasördeki her dosyayı inbox girişi say: uygun isim ver, uygun klasöre taşı.`
4. Eklenti "CLAUDE.md does not mention DUTIES.md" diye sorarsa **Append to CLAUDE.md** de — bu olmadan ajan nöbete bakmaz.
5. **Dene:** İzlenen klasöre bir dosya bırak. Birkaç saniye içinde Duties satırında turuncu göz + **"1 waiting"** belirir (Dashboard ajan kartında da `👁 1 pending`).
6. Ajanı çalıştır: ajana sağ tık → **Start Claude Session** (oturum açıldığında ajan DUTIES.md gereği inbox'a bakar) — ya da oturum açmadan tek atımlık: Tasks → **+** → prompt: `DUTIES.md dosyanı oku ve every-turn görevlerini şimdi uygula` → **Headless**.
7. **Doğrula:** Dosya hedef klasöre taşınır, Duties rozeti **"empty"** olur, Duties başlığında `read Xs ago` görünür (ajan nöbete baktı kanıtı).

> ✅ Test: `deneme` ajanında `inbox/not-2026.md` dosyası haiku tarafından okunup `arsiv/`e taşındı; rozet "1 waiting" → "empty" geçti; uyum sinyali (`read …`) düştü.

---

## S2 — Netleştirme Döngüsü: Ajanla yazılı soru-cevap hattı ✅

**Amaç:** Ajan aklına takılanı bir dosyaya yazar; sen müsait olunca cevaplarsın; ajan cevabı görünce gereğini yapıp soruyu siler.

**Adımlar:**

1. Vault kökünde `NETLEŞTİRME İSTEKLERİ.md` dosyası oluştur (boş olabilir).
2. Ajanın Duties bölümüne görev ekle: kadans **every-turn**, Watch = bu dosya, Do: `Cevaplanmış soru varsa gereğini yap ve o soruyu dosyadan sil. Aydınlatılması gereken yeni soruların varsa dosyaya "- Soru: ..." biçiminde ekle.`
3. Ajanın CLAUDE.md yönergesi eklendiyse döngü hazır.
4. **Kullanım ritmi:** Duties satırında **"changed 2h ago"** gördüğünde iki anlamı olabilir: ajan yeni soru yazdı (dosyayı aç, cevapla) ya da senin cevabın henüz işlenmedi (ajanın bir sonraki turunu bekle).
5. Cevap yazdıktan sonra ajanın ilk turunda: gereği yapılır + soru silinir → dosya sadeleşir.

**İpucu:** Bu dosya birden çok ajanla ortaksa her ajana aynı görevi ekle; kim sorduysa sorusunun başına adını yazsın diye Do satırına ekleme yap.

> ✅ Test: `deneme/NETLESTIRME.md` içine cevaplı bir soru kondu ("Cevap: Hayır, dosya adları aynen kalsın"); nöbet turunda haiku cevaplanmış satırı dosyadan sildi, cevaplanmamış içeriğe dokunmadı; "changed …" sinyali doğru çalıştı.

---

## S3 — Rutin Otomasyonu Ucuz Modele Bağla ✅

**Amaç:** Günlük mekanik işler (tasnif, özet, kontrol) pahalı modelle koşmasın.

**Adımlar:**

1. Ayarlar (`Ctrl+,`) → "agent farm" ara → **Task Extra Args** → `--model haiku` yaz. Artık **tüm görev ve workflow komutları** haiku ile koşar (etkileşimli oturumların modeline karışmaz — sadece Tasks/Workflows).
2. Alternatif (ajan bazlı): ajanın `.claude/settings.local.json` dosyasına `"model": "claude-haiku-4-5-20251001"` ekle — o ajanın her şeyi haiku olur.
3. Tasks → takvim ikonu → **Add Scheduled Task**: Daily 08:30, prompt: `inbox'u tasnif et ve tek paragraf sabah özeti yaz`, mod: **Headless**.
4. Ertesi sabah: görev kendiliğinden koşar; sağ tık → **Open Task Output** ile çıktıyı oku. Maliyeti Dashboard'da gör — haiku ile kuruş mertebesinde.

> ✅ Test: headless görevler `--model haiku` ile koştu; 4 gerçek çalıştırmanın toplamı $0.06, çıktılar arşivlendi, çıkış kodları doğru işlendi.

---

## S4 — İki Ajanlı Sabah Rutini: Devirli Zincir ✅

**Amaç:** psikolog analiz etsin, asistan o analizi kullanıp plan yapsın — elden ele.

**Adımlar:**

1. Tasks başlığında zincir ikonuna tıkla (**New Multi-Agent Workflow…**), ad: `Sabah rutini`.
2. **Adım 1:** ajan `psikolog`, başlık `analiz`, prompt: `Dünkü günlük kayıtlarını analiz et; ruh hali ve önemli konuları maddeler halinde yaz.`, mod **Headless** (zincirde çıktı devri için şart), on-fail: Stop.
3. **Adım 2:** ajan `asistan`, başlık `plan`, prompt: `Şu dosyada psikoloğun analizi var: {prev_output} — dosyayı oku ve buna göre bugünün planını çıkar.`, mod **Headless**.
4. **Finish workflow** → "Run now".
5. **İzle:** `Open Live Timeline` → **Workflow runs** şeridinde adım 1 mavi (çalışıyor) → yeşil, sonra adım 2 başlar. Bitince "workflow completed ✓" bildirimi.
6. Çıktılar: Tasks'ta her adımın üzerinde sağ tık → **Open Task Output**.
7. Her sabah otomatik olsun istersen: bu zinciri elle değil, S3'teki zamanlanmış görevden tetikle — prompt'u `Sabah rutini workflow'unu düşün ve...` yapmak yerine en temizi zinciri sabah görevine dönüştürmektir: Adım 1'in prompt'unu zamanlanmış göreve koy, devri workflow'a bırak.

> ✅ Test: iki adımlı zincir gerçek koştu; 2. adım `{prev_output}` yoluyla 1. adımın çıktı dosyasını gerçekten okudu ve içeriğini kullandı; tamamlanma bildirimi düştü.

---

## S5 — Koşullu Alarm Zinciri: "Sadece gerekiyorsa müdahale" ✅

**Amaç:** Analizde alarm kelimesi geçerse acil plan adımı çalışsın; geçmezse atlansın.

**Adımlar:**

1. S4'teki zinciri kur; **Adım 2**'yi eklerken "run only if previous output matches" sorusuna `ALARM` yaz (adım 1'in prompt'una da "kritik bir durum varsa ALARM kelimesini kullan" talimatı ekle).
2. Ya da kurulu zincirde: adımın üzerinde kalem ikonu → **Edit Step…** → **Run-if condition** → `ALARM`.
3. Adım 3 (arşivleme gibi her durumda çalışacak iş) eklerken on-fail sorusuna **Continue** de — önceki adım atlansa/başarısız olsa da arşiv çalışır.
4. **Doğrula:** Alarm yokken çalıştır → bildirimde "step 2 skipped (condition not met)" görürsün; zincir 3. adımdan devam eder.

> ✅ Test (iki dal da gerçek): "Durum normal" çıktısında 2. adım atlandı; "ALARM: disk alanı kritik" çıktısında 2. adım koştu ve haiku gerçek bir müdahale planı yazdı ("temp dizini ve eski logları sil…"). Bu test bir bug da yakalattı: koşul eskiden arşiv başlığındaki workflow adına da bakıyordu ("Alarm kontrolü" adı koşulu tetikliyordu) — 0.7.2'de düzeltildi, koşul artık yalnızca modelin çıktısına bakar.

---

## S6 — Bağlam Diyeti: Ajanı Ucuzlat (Optimizasyon) ✅

**Amaç:** Her oturumda otomatik yüklenen sabit bağlamı küçültüp kalıcı tasarruf almak.

**Adımlar:**

1. **Ölç:** Ajan detay sayfası → **Fixed context load** kartı. Çubuk bütçeyi aşıyorsa (veya Insights'ta `context-load` uyarısı varsa) diyet vakti. Kartta CLAUDE.md / MEMORY.md / AGENTS.md kırılımı var — şişman olan hangisi, gör.
2. **Taşı:** CLAUDE.md'yi aç (Agents ağacında Identity satırı). Kimlik ve çalışma tarzı kalsın; **detay bilgi ve nadiren gereken talimatları** `memory/` altına ayrı dosyalara taşı, MEMORY.md indeksine tek satır özet ekle. Hafıza dosyaları yalnızca gerekince okunur — sabit maliyete girmez.
3. **Kontrol et:** Insights'ta `memory-index` bulgusu çıkmasın diye taşıdığın her dosyayı MEMORY.md'ye bağla (yetim dosya = ajan hatırlamaz).
4. **Tekrar ölç:** Agents başlığında Refresh → detay sayfasında token sayısının düştüğünü gör.
5. **Kazancı hesapla:** düşüş × günlük oturum sayısı = günlük token tasarrufu. 2.000 token kısmak, günde 10 oturumda 20k token/gün eder.

> ✅ Test: `deneme`'nin CLAUDE.md'sine 2.662 token'lık bölüm eklendi (65→2.727), bütçe uyarısı doğrulandı; bölüm hafıza dosyasına taşınıp indekslenince yük 83 token'a döndü, uyarı temizlendi, yetim-dosya bulgusu çıkmadı.

---

## S7 — Kopya Hafızaları Düzelt: Diff → Birleştir → Eşitle ✅

**Amaç:** Aynı dosyanın ajanlara dağılmış, birbirinden sapmış kopyalarını tek doğruya indirmek (örnek: `ajan_kurulumu.md`).

**Adımlar:**

1. Komut paleti → **Agent Farm: Sync Shared Memory…** — gruplar listelenir: ✓ birebir aynı, ⚠ sapmış.
2. Sapmış grubu seç → **Compare two copies** → iki ajanın kopyası diff ekranında; farkın ne olduğunu anla.
3. Karar ver:
   - Bir kopya açıkça doğruysa: tekrar komutu çalıştır → **Sync all copies from one source** → kaynağı seç (en yenisi işaretli) → **Sync**. Ezilen her dosyanın yanına `.afbak` yedeği bırakılır.
   - İki kopyada da değerli satır varsa: **Create merge draft** → açılan taslakta `=== FROM ... ===` bloklarından nihai metni elinle birleştir → komut paleti → **Agent Farm: Apply Merged Memory** → onayla.
4. **Doğrula:** Insights'taki `duplicate-memory` uyarısı "duplicated identically" (bilgi) seviyesine düşer.

> ✅ Test: geçici ikinci ajanla (deneme2) gerçek dosyalar üzerinde: sapma tespiti, en-yeni-kaynak önerisi, yedekli senkron (v1 yedekte korundu), merge taslağının iki varyantı da içermesi, birleşik v3'ün her iki kopyaya yedekli yazılması — tümü doğrulandı; test ajanı sonrasında silindi.

---

## S8 — Bütçe ve Trend Disiplini ✅

**Amaç:** Maliyet sürprizle değil, eşikle yönetilsin.

**Adımlar:**

1. Ayarlar → `agentFarm.budgets` → **Edit in settings.json** → örn:
```
"agentFarm.budgets": { "psikolog": 20, "genel": 10, "*": 40 }
```
2. Davranış: %80'de Insights'ta ⚠, aşımda ⛔ + günde bir bildirim; Dashboard'da ajan kartlarında doluluk çubuğu, "Cost today" kartında filo çubuğu.
3. Trend tarafı kendiliğinden açık: bir ajanın haftalık maliyeti önceki haftanın 2 katına çıkarsa Insights'ta `trend` uyarısı görürsün (`trendAlertFactor` ile ayarlanır, 0 = kapalı).
4. **Aylık rutin:** Dashboard → Agent comparison → **Cache eff.** kolonuna bak. %90+ iyi; düşükse o ajanın oturumları kısa ve bağlam sürekli yeniden yazılıyor demektir — işleri birleştirmeyi düşün.

> ✅ Test: `deneme`'nin **gerçek** günlük maliyeti ($0.06) 0.01$'lık bütçeye karşı denendi → ⛔ error bulgusu üretildi; filo bütçesi aşılmamışken uyarı çıkmadı; tek günlük gerçek veride trend false-positive üretmedi.

---

## S9 — VS Code Kapalıyken Sabah Görevi (Windows) ✅

**Amaç:** 08:30 görevi bilgisayar açık ama VS Code kapalıyken de koşsun.

**Adımlar:**

1. Önce görevi normal zamanlanmış görev olarak kur (S3 adım 3).
2. Tasks → Scheduled altında göreve sağ tık → **Export as Windows Scheduled Task…**
3. Bildirim: script yazıldı, `schtasks /Create ...` komutu panoya kopyalandı. Bir terminal aç (`Ctrl+ü`), yapıştır, Enter. Çıktıda "SUCCESS" görmelisin.
4. **Doğrula:** `schtasks /Query /TN "AgentFarm\<görev adı>"` — kayıt listelenir. Çıktılar bildirimdeki **Open log folder** klasöründeki log dosyasında birikir.
5. Kaldırmak istersen: `schtasks /Delete /TN "AgentFarm\<görev adı>" /F`.

**Not:** `claude` komutu PATH'te olmalı (terminale `claude --version` yazarak kontrol et).

> ✅ Test: eklentinin ürettiği biçimle gerçek kayıt döngüsü çalıştırıldı — `schtasks /Create` (hem DAILY hem ONCE) SUCCESS döndü, `/Query` kaydı gördü, `/Delete` ile temizlendi. Bu sistemde tarih formatı sorunsuz.

---

## S10 — Vault'a Otomatik Karne ✅

**Amaç:** Haftalık filo raporu + gece işlerinin çıktıları, elini sürmeden Obsidian'a düşsün.

**Adımlar:**

1. Ayarlar → `agentFarm.autoReportFolder` → vault içinde bir klasör yolu (örn. `D:\zone\know\note\obsidian\20_PROGRESS\ajan-karneleri`).
2. `agentFarm.autoReport` → `weekly` (veya `daily`).
3. Hepsi bu. Eklenti saatte bir kontrol eder; dönemin raporu yoksa üretir (`AgentFarm-Report-2026-W28.md`), bildirimle haber verir. Dönem içinde headless görev çıktısı varsa **Task outputs** bölümü de rapora eklenir.
4. Obsidian'da klasörü açtığında karşılaştırma tablosu, model kullanımı, sağlık bulguları ve iş çıktıları tek notta.

> ✅ Test: gerçek filo verisi + gerçek görev çıktılarıyla rapor üretilip hedef klasöre yazıldı; karşılaştırma tablosu, "Task outputs" bölümü (gerçek zincir çıktılarıyla) ve sağlık bulguları doğrulandı.

---

## S11 — Takılan Ajanı Yakala ve Müdahale Et ✅

**Amaç:** Uzun işte bir ajan sessizce durduysa dakikalar içinde haberin olsun.

**Ön koşul:** Canlı gözlem kurulu (**Install Live Hooks** + oturumları yeniden başlatmış olmak).

**Adımlar:**

1. Normalde hiçbir şey yapmazsın — ajan izin onayına düştüğünde `⚠ waiting for permission` bildirimi, 4 dakika olay üretmeyince `looks stalled` bildirimi kendiliğinden gelir; durum çubuğu sarıya döner.
2. Bildirimdeki **Open Timeline** → takılan ajanın şeridine bak: son olay ne, hangi araçta kaldı (kartta `STALLED` + son araç adı).
3. Müdahale: izin bekliyorsa terminaline geç ve onayla/reddet; gerçekten donduysa görevi Tasks'tan iptal et (`Cancel Task` süreci güvenle sonlandırır) veya terminali kapat, sonra **Continue Latest Session** ile kaldığı yerden devam ettir.
4. Aynı ajan sık takılıyorsa Insights'ta `error-rate` bulgusuna bak — genelde bozuk bir araç scripti veya eksik izin vardır.

> ✅ Test (altyapı): hook'lar `deneme` ajanına kuruldu, **gerçek** bir claude oturumunun hook olayları (session start → prompt → stop → end) dinleyiciye canlı aktı, ajan doğru çözüldü, kaldırma sonrası model ayarının korunduğu doğrulandı. İzin/takılma durum geçişleri ayrıca sentetik olaylarla test edilmişti (Faz 2).

---

## S12 — Inbox Fabrikası: Elleme, Kendi Başlasın ✅

**Amaç:** S1'in tam otomasyonu — ajan oturumu bile beklemeden, klasöre dosya düştüğü an tasnif zinciri koşsun ve sonucu bir hakem doğrulasın.

**Adımlar:**

1. Önce zinciri kur (Tasks → New Multi-Agent Workflow): tek adım yeter — ajan `deneme`, prompt: `DUTIES.md dosyanı oku ve Inbox tasnifi görevini şimdi uygula. Sonunda neyi nereye taşıdığını raporla.`, mod **Headless**, doğrulama ölçütü: `Çıktı, inbox'taki bir dosyanın arsiv klasörüne taşındığını açıkça raporlamalı.`
2. Tetikleyiciyi kur: Tasks başlığı **⋯** → **Add Trigger** → ad `Inbox fabrikası` → **Watch a folder** → inbox klasörünü seç → **Run a workflow** → zinciri seç.
3. Triggers bölümünde ⚡ satırın "armed" göründüğünü doğrula.
4. **An:** İzlenen klasöre bir dosya bırak. ~10 sn (debounce) sonra bildirim düşer: "trigger fired → workflow". Görev koşar, hakem çıktıyı PASS'ler, zincir tamamlanır.
5. **Doğrula:** dosya hedef klasörde, görev satırında `verify pass`, çıktının sonunda hakem kararı, tetik satırında `fired 1×`.

Korumalar: art arda 10 dosya atarsan debounce hepsini tek ateşe indirir; 60 sn içinde yeni ateş olmaz (cooldown); saatte en fazla 6 ateş. Kota bekçisi açıksa (S8) pencere doluyken fabrika kibarca bekler.

> ✅ Test (çıkış ölçütü): `deneme/inbox`'a bırakılan gerçek dosya tetikleyiciyi ateşledi, haiku dosyayı arşive taşıdı, hakem (haiku) "PASS — dosya adını, kaynak ve hedef klasörleri açıkça belirtiyor" kararını arşive yazdı, zincir tamamlandı — insan eli değmeden.

## S13 — Alan Bazlı Devir: JSON Sözleşmeli Zincir ✅

**Amaç:** Adımlar arası devri metin tesadüflerine değil, yapılandırılmış alanlara bağlamak.

**Adımlar:**

1. Zincir kur: **Adım 1** (headless, output contract: **JSON**): `Şu alanlarla geçerli bir JSON yaz: durum (ALARM/normal), seviye (1-5), ozet.` **Adım 2** (headless, run-if: `json:durum~ALARM`): `Seviye {prev_json.seviye} alarm: {prev_json.ozet}. Tek cümlelik müdahale planı yaz.`
2. Çalıştır: durum=ALARM ise adım 2'nin prompt'una gerçek değerler gömülür ("Seviye 3 alarm: disk alanı kritik…"); durum=normal ise adım atlanır.
3. Model JSON'u kod çitine sarsa bile ayrıştırıcı tolere eder — sen sadece alan adlarını doğru yaz.

> ✅ Test (iki dal da gerçek haiku ile): alanlar prompt'a doğru gömüldü, ALARM dalı koştu, plan üretildi; çitli JSON toleransı gerçek çıktıyla doğrulandı.

## S14 — n8n Köprüsü: Dış Dünyayla Çift Yönlü Hat ✅ (mekanikler)

**Amaç:** Dış olaylar (mail, Telegram, takvim…) ajan fabrikasını tetiklesin; fabrika sonuçları dış dünyaya teslim etsin. n8n örnek — Make/Zapier'de birebir aynı mantık.

**Ön hazırlık:** API anahtarların varsa önce kasaya koy: `Agent Farm: Set Secret…` (örn. ad `N8N_TOKEN`). Ayar dosyalarına anahtar yazma — panel zaten uyarır.

**İçeri hat (n8n → Agent Farm):**

1. Tasks → **Add Trigger** → ad ver → **Webhook** → eylem olarak görev seç, prompt örneği: `Şu isteği işle: {payload}` → gizli URL panoya kopyalanır (`http://127.0.0.1:8377/trigger/…`).
2. n8n'de akış kur: (tetik: Gmail/Telegram/ne istersen) → **HTTP Request** node: POST, URL = kopyaladığın adres, body JSON (örn. `{"gorev":"fatura işle","kimden":"…"}`).
3. n8n aynı makinedeyse doğrudan çalışır; başka makinedeyse bilinçli olarak tünel/proxy kurman gerekir (uç güvenlik gereği yalnızca 127.0.0.1 dinler).
4. **Dene:** n8n akışını elle tetikle → Agent Farm bildirimi düşer, görev koşar, `{payload}` prompt'ta.

**Dışarı hat (Agent Farm → n8n → Telegram):**

1. n8n'de bir **Webhook** node'lu akış kur (arkasına Telegram/Slack/mail node'u bağla), webhook adresini al.
2. İki kullanım:
   - **Zincir adımı olarak:** workflow kurarken **🌐 Webhook step** → URL = n8n adresi → body: `{"text":"{prev_text}"}` — önceki ajan adımının çıktısı Telegram'a gider; n8n'in yanıtı da `{prev_json.alan}` ile sonraki adımda kullanılabilir.
   - **Bildirim yönlendirme olarak:** Ayarlar → `agentFarm.notifyWebhookUrl` = n8n adresi → izin bekleme/takılma/bütçe/zincir olayları JSON olarak akar; n8n mesaja çevirir. Artık "psikolog izin bekliyor" telefonda.

> ✅ Test (gerçek HTTP mekanikleriyle): /trigger ucuna doğru token'la POST → görev ateşledi ve `{payload}` prompt'a girdi; yanlış token 404 aldı. Webhook adımı: `{secret:}` URL'de, `{prev_json.*}` gövdede çözüldü, sunucu yanıtı sonraki adıma devroldu (3/3 adım done). Permission olayı forward kanalından JSON olarak ulaştı. n8n tarafı reçetedir — kendi akışını bağladığında hat hazır.

## S15 — İçerik Fabrikası: Metin → Görsel → Video ✅ (hat; gerçek üretim kredi bekliyor)

**Amaç:** Ajan metni yazsın, medya modelleri görseli ve videoyu üretsin — tek zincir, galeri ve karneyle.

**Bir kerelik kurulum (anahtar):**

1. [fal.ai](https://fal.ai) hesabından API anahtarını al (Keys bölümü) ve hesabına kredi yükle (Billing).
2. `Ctrl+Shift+P` → **Agent Farm: Set Secret…** → ad: `FAL_KEY` → değeri yapıştır. Bu kadar — anahtar OS anahtarlığında, hiçbir dosyada değil. (Detay: Kılavuz → Sır Kasası → "API Anahtarı Nasıl Eklenir".)

**Zincir kurulumu (kolay yol — reçete):**

1. Tasks başlığı **⋯** → **New Recipe Workflow…** → **Metin → Görsel → Video** → ajanı seç (örn. `genel`).
2. Workflows altında kurulan zincirde 1. adımın kalem ikonuna bas → Prompt → `KONUYU BURAYA YAZ` kısmını gerçek konunla değiştir (örn. "sabah rutini hakkında motive edici kısa video").
3. İstersen video adımının modelini güncelle (Edit Step → Media model) — güncel model adlarını fal.ai/models'ten kontrol et.
4. ▶ **Run Workflow**: ajan İngilizce sinematik promptu yazar → Flux kapak görselini üretir → Kling kısa videoyu üretir. Video adımı dakikalar sürebilir; Timeline'da koşusunu izlersin.
5. **Sonuç:** Tasks başlığındaki 📷 ikonuyla **Media Gallery** — görsel ve video önizlemeli, model + girdi + tahmini maliyetle. Beğenmedin mi: **Vary…** ile promptu düzenleyip yeniden üret. Dashboard'da **Media cost** kartı harcamayı gösterir.

**Sık takılmalar:** "Set Secret" hatası = FAL_KEY girilmemiş; arşivde "Exhausted balance" = fal hesabında kredi yok; model adı hatası = fal.ai/models'ten güncel kimliği al.

> ✅ Test: hattın tamamı sahte fal sunucusuyla uçtan uca doğrulandı (ajan promptu → üretim → görselin indirilmesi → galeri/maliyet → videonun bir sonraki adıma devri). Gerçek fal.ai'de kimlik doğrulama ve hata yolu senin anahtarınla test edildi: API anahtarı tanıdı, kredisiz hesabı "Exhausted balance" ile reddetti ve bu hata arşive düzgün işlendi. Krediyi yüklediğin gün bu senaryo ilk gerçek koşusunu yapar.

## S16 — Zeki Gözetim: Kalite Karnesi, Talimat Önerisi, Arama ✅ (mekanikler)

**Amaç:** Maliyetin yanına kaliteyi koy, ajanın tekrar tekrar yaptığı hatayı kurala çevir, eski konuşmayı saniyede bul.

**Kalite karnesi (haftalık ritmin parçası):**

1. `Ctrl+Shift+P` → **Agent Farm: Sample Output Quality Now** — ucuz model hakem, ajan başına 2 yeni oturumu 1-5 puanlar (birkaç saniye/oturum).
2. Dashboard → **Agent comparison** tablosunda **Quality** kolonu: son 14 günün ortalaması. Filo raporuna da aynı kolon gelir.
3. Sürekli izlemek istersen: `agentFarm.qualitySample` = `weekly`. Puan düşüşe geçerse Insights'ta `quality` uyarısı belirir — maliyet ucuz ama karne kırıksa otomasyon zarar ediyor demektir.

**Talimat önerisi (ajan kendini iyileştirsin):**

1. Bir ajana birkaç oturumdur aynı düzeltmeyi yazıyorsan ("başlıkları Türkçe yaz" gibi) → **Agent Farm: Scan for Instruction Suggestions…** → ajanı seç.
2. Ucuz model takip mesajlarını tarar; tekrarlayan kalıp bulursa Insights'a 💡 satırı düşer.
3. 💡'ya tıkla → öneri ve dayanağı gösterilir → **Apply to CLAUDE.md** dersen kural, ajanın CLAUDE.md'sine `## Learned rules (Agent Farm)` altına eklenir; **Dismiss** dersen kapanır. Onaysız hiçbir şey yazılmaz.

**Transcript arama:**

1. Recent Sessions başlığındaki 🔍 (veya **Search Transcripts…**) → sorguyu yaz (3+ harfte kendiliğinden arar, Enter ile de).
2. Ajan filtresi ve `regex` kutusu var; sonuçta eşleşme vurgulu, bağlamıyla görünür. Tıkla → oturum görüntüleyici açılır.

**Haftalık özet (bonus):** `agentFarm.weeklySummary` = `true` → her hafta ilk açılışta üç cümlelik insan dili karne bildirimi; `autoReportFolder` ayarlıysa vault'a da yazılır, n8n webhook'una `summary` olayı olarak gider.

> ✅ Test: mekaniklerin tamamı gerçek haiku çağrılarıyla doğrulandı — örnekleme puanı üretip sakladı (aynı oturum ikinci kez puanlanmıyor), tekrarlanan "Türkçe başlık / tarih biçimi" düzeltmelerinden kural önerisi çıktı ve CLAUDE.md'ye bölüm halinde eklendi, arama düz metin/regex/ajan filtresi/sınır durumlarıyla, haftalık özet üç cümle sınırıyla test edildi (28 kontrol).

## S17 — Ölçek: İkinci Makine, Cepte Karne, Taşınabilir Ajan ✅ (mekanikler)

**Amaç:** Filo büyüyünce komuta merkezi tek kalsın: laptop'un oturumları da bu panelde, günlük karne Telegram'da, ajanın kendisi tek dosyada.

**İkinci makineyi bağla:**

1. Laptop'un `~/.claude` klasörünü bir senkron aracıyla bu makineye aynala (Syncthing önerilir; OneDrive/SSH kopyası da olur). Tek yön yeterli: laptop → burası.
2. Ayarlara ekle: `"agentFarm.extraClaudeDirs": [{ "name": "laptop", "dir": "D:/sync/laptop/.claude" }]`.
3. **Refresh** → laptop oturumları Recent Sessions'ta **⇄ laptop** rozetiyle belirir. İki makinede aynı ajan klasör düzenini kullanıyorsan oturumlar doğru ajana sayılır; maliyet, karne, arama — hepsi artık iki makineyi görür.

**Günlük karneyi cebe gönder:**

1. S14'teki n8n → Telegram hattın varsa ekstra bir şey gerekmez: `agentFarm.dailyDigest` = `"21:30"`.
2. Her akşam o saatten sonra tek mesaj düşer: bugünün maliyeti, en çok harcayanlar (bütçe yüzdesiyle), görev/nöbet durumu, uyarılar. Model çağrısı yok — sıfır ek maliyet.
3. Denemek için: **Agent Farm: Send Daily Digest Now** (webhook yoksa bildirim olarak gösterir).

**Ajanı taşı / paylaş:**

1. Ajana sağ tık → **Export Agent Pack…** → `kahveci.agentpack` kaydet. Kimlik, nöbetler, araçlar ve ajanın workflow/tetik/zamanlamaları tek dosyada; **hafızası ve sırların dışarıda** (kimlik bilgisi kokan dosyaları da kendiliğinden atlar ve söyler).
2. Hedef makinede **Import Agent Pack…** → dosyayı seç → kök + isim → onay. Ajan taze bir hafızayla kurulur; tetik ve zamanlamalar güvenlik için kapalı gelir — gözden geçir, `{secret:AD}` kullanan adımlar için sırları `Set Secret…` ile tanımla, sonra aç.

> ✅ Test: mekanikler gerçek dosyalarla doğrulandı (26 kontrol) — paket dışa/içe roundtrip, sır kokan dosyanın dışlanması, `memory/` dışlaması, yol-kaçışı (zip-slip) koruması, isimle yeniden bağlama ve bilinmeyen ajanın self'e düşmesi, kapalı gelen tetik/zamanlama; iki sahte `.claude` diziniyle çoklu makine taraması (⇄ rozet, ajan eşleşmesi, eksik senkron uyarısı); digest kartının dolu/temiz gün içerikleri.

## S18 — Çift Beyin: Ajanı Antigravity'de de Çalıştır ✅ (mekanikler)

**Amaç:** Claude için kurduğun ajan, istediğinde Google Antigravity (Gemini) altında da aynı kimlik ve hafızayla çalışsın — ve iki dünyada öğrenilenler birbirine aksın.

**Kurulum (bir kez):**

1. Ajana sağ tık → **Sync Agent with Antigravity…** → onay. Üç şey üretilir: `AGENTS.md` (CLAUDE.md'den), `.agents/workflows/` (aktif nöbetlerin — Antigravity'de `/inbox-tasnifi` gibi slash komut olurlar), `.mcp.json` varsa MCP birleştirme önerisi.
2. Antigravity'yi ajan klasöründe aç — AGENTS.md kimliği ve memory/ hafızayı (düz markdown olduğu için) doğrudan okur. MCP kullanıyorsan öneri dosyasını `~/.gemini/config/mcp_config.json`'a birleştir.

**Yaşatma (asıl değer bu):**

- Claude oturumunda CLAUDE.md'yi geliştirdin → Insights'ta "CLAUDE.md changed…" hatırlatması belirir → komutu çalıştır, AGENTS.md tazelenir.
- Antigravity oturumu AGENTS.md'ye bir ders ekledi → komut fark eder ve sorar: **Apply to CLAUDE.md** → kazanım yedekli olarak Claude tarafına taşınır. Optimizasyon mirası tek tarafta hapsolmaz.
- İkisi birden değiştiyse çakışma uyarısı: önce **Show Diff**, sonra yön seç — kaybeden içerik `.afbak` yedeğinde durur.

**Sık takılmalar:** kendi elle yazdığın AGENTS.md varsa komut onaysız üzerine yazmaz; elle düzenlediğin workflow dosyaları senkronda atlanır (notta söylenir); nöbet tanımının tek kaynağı DUTIES.md kalır.

> ✅ Test: tam yaşam döngüsü gerçek dosyalarla doğrulandı (27 kontrol) — üretim, ileri/geri senkron (öz-referans dönüşümleri dahil: "CLAUDE.md" ↔ "AGENTS.md"), çakışma tespiti ve çözümü, yabancı dosya/elle düzenleme korumaları, opt-in olmayan ajanda sıfır Insights gürültüsü.

## S19 — Cümleyle Komuta + Kendi Yolunu Bulan İş ✅

**Amaç:** Kurulum ekranlarına hiç girmeden konuşur gibi iş kur; gelen işler de doğru ajanı kendileri bulsun.

**Doğal dil komuta:**

1. Tasks başlığındaki 🚀 → *"yarın sabah 09:00'da psikolog haftalık analiz raporunu koşsun"* yaz.
2. Ucuz model planı çıkarır, önizleme gelir: `📅 Zamanlama: … Ajan: psikolog … bir kez — 2026-07-10 09:00`. **Create** dersen kurulur — demezsen hiçbir şey olmaz.
3. Zincir de kurabilirsin: *"önce yazar taslağı yazsın, sonra editör düzeltsin"* → 2 adımlı workflow, `{prev_text}` devri hazır.

**Dispatcher:**

1. `agentFarm.dispatchRules`'a bariz kuralları koy: `[{"match": "uyku|kaygı|rüya", "agent": "psikolog"}]` — deterministik ve bedava.
2. Tetik ekle: **Add Trigger** → Webhook → eylem: **Dispatch — route to the best agent**. Artık n8n'den düşen her iş önce kurallara, tutmazsa ucuz model sınıflandırıcısına gider (ajanların CLAUDE.md rol özetlerini okur).
3. Kurmadan denemek için **Test Dispatcher…**: *"dün gece uyuyamadım"* → `psikolog [rule]` veya kural yoksa `psikolog [model] — gerekçe`.

> ✅ Test: gerçek haiku çağrılarıyla doğrulandı — "yarın 09:00" ifadesi doğru tarihe çevrildi (2026-07-10 09:00), iki adımlı zincir doğru ajan sırasıyla kuruldu, sınıflandırıcı uyku/kaygı metnini psikoloğa yönlendirdi; bozuk regex'ler atlanıyor, bilinmeyen ajan adı planı geçirmiyor (16 kontrol).

## S20 — Ses Döngüsü: Telefondan Konuş, Fabrika İşlesin (F4 tarifi)

**Amaç:** Sesli notun kendi kendine metne dönüşüp doğru zincire girmesi — hepsi bugün var olan yapıtaşlarıyla.

1. **Ses → Metin:** `New Recipe Workflow…` → **Ses → Metin (Whisper)** reçetesi (FAL_KEY gerekli). İlk adım ses dosyasını transkribe eder, ikinci adım ajanla özetler/işler.
2. **Kendiliğinden başlasın:** telefonundan sesli notların bir klasöre düşüyorsa (NoteScribe/Syncthing/OneDrive), o klasöre **watch tetiği** kur; eylemi yukarıdaki workflow yap. Ses dosyası düştü → zincir başladı.
3. **Doğru ajana gitsin:** eylemi workflow yerine **Dispatch** yaparsan transkript içeriğine göre iş psikoloğa/asistana/kime uygunsa ona gider (S19).
4. **Cevap cebe:** zincirin sonuna bir webhook adımı ekle → n8n → Telegram'a özet döner. (TTS ile seslendirme fal.ai TTS modeliyle ek bir medya adımı — modeli fal.ai/models'ten doğrula.)

Bu tarif, plandaki F4'ün bugünkü karşılığıdır; NoteScribe tarafı olgunlaştıkça doğrudan köprü (uygulamadan tetik) eklenebilir.

## Kapanış: Ritim Önerisi

- **Her gün 10 saniye:** durum çubuğu + Duties rozetleri (pending var mı?).
- **Her hafta 5 dakika:** Dashboard karşılaştırması + Insights sıfırlama + vault karnesi + kalite örneklemesi (S16).
- **Her ay 15 dakika:** bağlam diyeti (S6) + kopya hafıza kontrolü (S7) + bütçe gözden geçirme (S8).

Yeni senaryo ihtiyacın doğduğunda bu belge büyümeye hazır — Blueprint gibi bu da eklentiyle birlikte yaşayan bir belge.

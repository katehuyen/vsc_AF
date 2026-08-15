# LIVING SAYFASI living

- Session: `706b5536-964d-4938-8bff-ef3d2eb55257`
- Folder: `D:\zone\agent\ajanlar\developer`
- Span: Aug 15, 2026, 02:13 AM (19:13 UTC) → Aug 15, 2026, 02:15 AM (19:15 UTC)
- Total: 1.4M (⚖ 303.3k) tok · $0.000 · 1 turns · 24 tool calls
- Export: current view · show: user, assistant · 3 of 49 messages

---

## Turn 1/1 — living butonu daha doğrusu sayfası tam olarak ne iş yapıyor bu eklerde de bana inceleyip … · gemini-3.7-flash · high · 1.4M tok · $0.000

**USER** (02:13 AM (19:13 UTC))

living  butonu daha doğrusu sayfası tam olarak ne iş yapıyor bu eklerde de bana inceleyip ayrıntılı açıklasana

**GEMINI** (▸ reply · 02:15 AM (19:15 UTC) · gemini-3.7-flash)

**Agent Farm** bünyesindeki **💓 Living (Yaşam Panosu)** sayfası; çiftliğin tek bir soruya net cevap vermesi için tasarlanmış merkezi bir denetim ekranıdır: **"Sistem bugün gerçekten yaşıyor mu?"**

Agent Farm mimarisinde bu sayfanın neden var olduğunu, ne iş yaptığını ve arkasındaki mekanizmaları detaylarıyla inceleyelim:

---

### 1. Temel Felsefesi ve Doğuş Nedeni

Agent Farm'daki diğer tüm sayfalar ve paneller sistemin **ayrı ayrı parçalarını** raporlar:
- Görevler sayfası görevleri,
- Notices panosu bildirimleri,
- Queue sayfası iş kuyruğunu,
- Dashboard ise harcamaları gösterir.

**Sorun şudur:** Bütün parçalar tek tek "yeşil" (hatasız) çalışırken bile sistemin **bütünü ölmüş** olabilir. 
> **Gerçekleşmiş ölçülen vaka:** LifeOS günlük döngüsü 16 gün boyunca durdu. Güvenlik nöbeti her sabah başarıyla uyandı, hiçbir hata vermeden panoya bildirimini bıraktı, fakat o bildirimi kimse okumadı. Parçaların hepsi teknik olarak "çalışıyordu", ancak döngü tamamlanmadığı için sistem fiilen ölüydü.

Anayasa Prensip 1 gereğince (*"Sessizce başarısız olan bir kural, kural değildir"*), Living sayfası bir hata logu değil, bir **DÖNGÜ (LOOP) denetleyicisidir:** *Bir şey açıldı mı ve kapandı mı?*

---

### 2. Living Sayfasının Takip Ettiği 7 Temel Yaşam Sinyali

Sayfa açıldığında ([`core/living.ts`](file:///D:/zone/dev/git/miropharm/vsc_AgentFarm/src/core/living.ts)) arka plandaki tüm alt sistemleri tarayarak aşağıdaki döngüleri çıkarır:

#### 1. Bildirimler ve Sorular (Ajan → Kullanıcı Döngüsü)
- **Okunmamış Seviye 3+ Bildirimler:** Önemli bir bildirim `noticeStaleHours` (varsayılan 24 saat) süresince okunmadan beklediyse bayat sayılır. 3'ten fazla bayat bildirim varsa bu döngü **🛑 Ölü (dead)** olarak işaretlenir.
- **Cevap Bekleyen Sorular:** Ajan bir karar için sana soru sormuş (`question`) ve bekliyorsa, ajan o cevap gelene kadar tıkalıdır. 24 saatten eski cevapsız sorular sistemi durdurmuş sayılır.
- **İşlenmemiş Cevaplar:** Sen soruyu yanıtlamışsın ama ilgili ajan henüz çalışıp o cevabı tüketmemişse (`unhandled`) bunu da takip eder.

#### 2. İş Kuyruğu (Kullanıcı → Ajan Döngüsü)
- `captured`, `grouped`, `blocked` durumundaki kayıtların yaşı denetlenir.
- `queue.maxAgeHours` süresini aşan ve süpürülmeyen bir kayıt varsa boru hattı durmuş demektir.
- Senden bilgi bekleyen bloke (`blocked`) kayıtlar ayrı bir uyarı satırı olarak öne çıkar.

#### 3. Otomasyonlar (Zamanlamalar & Tetikleyiciler)
- **Tümü Kapalı mı:** Tüm otomasyonlar devre dışıysa sistem ölüdür (çünkü her şey senin manuel hatırlamana kalmıştır).
- **Sessiz Ölüm:** Bir otomasyon açık ve yeşil görünüyor ama 7 gündür **hiç ateşlenmemişse** (koşulu hiç tutmuyor veya bir yere bağlanmamışsa) sarı alarm verir.
- **Korumasız Otomasyonlar:** Önkoşul (`fireIf` guard) taşımayan, iş olsun olmasın boş yere ajan uyandırıp jeton yakan otomasyonları listeler.
- **Otomasyon Kapısı (`gateReason`):** Otomasyon ana şalteri veya sessiz saatler devredeyse durumu bildirir.

#### 4. Nöbetler (Standing Duties)
- Ajanların `DUTIES.md` dosyalarında tanımlı `[daily]` veya `[weekly]` periyotlu nöbetlerinin arkasında onları tetikleyecek gerçek bir Schedule/Trigger var mı (`wired`)?
- Arkasında otomasyon olmayan nöbetler kendi kendine çalışamaz; sayfa bunları tespit eder.

#### 5. Günlük Harcama & Bütçe
- Bugünkü API eşdeğeri harcamayı günlük bütçe tavanıyla kıyaslar. 
- %100 aşılmışsa **🛑 Durduruldu (dead)**, %80 üzerindeyse **⚠️ Uyarı (warn)** verir. Tavan tanımlı değilse "idle" kalır.

#### 6. Projeler (Project Health)
- Aktif projelerin sağlık durumunu kontrol eder (klasörü yerinde mi, bütçesi ne durumda, son zamanlarda dokunuldu mu?).
- Proje klasörünün diskte bulunamaması doğrudan **🛑 Ölü (dead)** sinyali üretir çünkü plan, backlog ve worklog bağı kopmuştur.

#### 7. Kullanıcının Özel Çekleri (`Living Checks`)
- Tamamen senin belirlediğin disk ve kuyruk denetimleridir (Örn: "Bugünün günlük notu yazıldı mı?", "Inbox klasöründe dosya birikti mi?", "X dosyası son 24 saatte değişti mi?").
- `{today}` ve `{yesterday}` gibi dinamik tarih şablonlarını destekler.
- Sıfır maliyetlidir; kontrol için herhangi bir yapay zeka/model çağrısı yapmaz, doğrudan disk/kuyruk durumunu inceler.

---

### 3. Sağlık Skoru ve Karar Akışı

- **Dürüst Skorlama:** 
  $$\text{Skor} = \frac{\text{Açık/Sağlıklı} + 0.5 \times \text{Uyarı}}{\text{Toplam Döngü}} \times 100$$
  Tek bir ölü döngüsü olan sistem hiçbir zaman yanıltıcı şekilde "%98 sağlıklı" görünmez; ölü döngü sıfır puan sayılır.
- **Otomasyon Karar Geçmişi (What the farm has been doing):** Sayfanın en altında son 25 otomasyon kararı listelenir: Hangi otomasyon ne zaman tetiklendi (`fired`) veya hangi önkoşul koruması sayesinde boşuna çalışmayıp atlandı (`skipped`).

---

### 4. Sayfa Üzerindeki Etkileşim ve Yetenekler

1. **Hızlı Geçiş (`data-goto`):** Herhangi bir uyarı satırına tıklandığında seni doğrudan ilgili ekrana (Notices, Queue, Tasks, Projects, Dashboard) fırlatır.
2. **Yerleşik Çek Editörü (`Configure checks`):** `settings.json` dosyasıyla uğraşmadan sayfa içindeki formdan yeni disk/kuyruk kontrolleri ekleyebilir, sıralarını değiştirebilir ve silebilirsin.
3. **Canlı Tazelenme:** Arka planda her dakika kendini yeniler; sinyallerin yaşları (`12 min`, `3 h`, `2 days`) bayatlamadan ekranda akar.
4. **Köprü (Bridge) Desteği:** Ajanlar da `living.checks`, `living.check.add` ve `living.check.remove` operasyonlarıyla bu yaşam kontrollerini programatik olarak yönetebilir.

Özetle **Living**, sistemin tüm bileşenlerinin birbiriyle uyum içinde akıp akmadığını ve hiçbir işin/bildirimin ortada sahipsiz kalmadığını tek bir bakışta garanti eden bir **bütünlük ve hayatiyet göstergesidir**.


**GEMINI** (▸ reply · 02:15 AM (19:15 UTC) · gemini-3.7-flash)

Living sayfası ve mekanizmalarıyla ilgili merak ettiğiniz başka bir detay veya özelleştirmek istediğiniz özel bir yaşam kontrolü (Living Check) kuralı varsa birlikte inceleyip yapılandırabiliriz.


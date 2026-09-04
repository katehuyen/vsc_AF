# Otonom Nöbet & Çoklu Hesap Rotasyonu
Siz bilgisayar başında değilken bir projenin backlog'unu sırayla alıp, hesap kotalarını döndürerek, devir notlarını otomatik bağlayıp kesintisiz çalışan otonom bir kampanya mekanizması kurdu.

Kullanıcı olarak bunu devreye almak için izleyeceğiniz adımlar, gireceğiniz yerler ve vermeniz gereken parametreler şunlardır:

---

### 1. Adım: Hesapları Mühürleme (Tek Seferlik Hazırlık)
Sistemin 3 Claude Pro hesabınız arasında otomatik geçiş yapabilmesi için hesapların birer kez sisteme tanıtılması gerekir.

1. **Nereden girilir:** Agent Farm sol menüsünden **Motorlar (Engines)** sayfasını açın.
2. **Sayfanın altındaki yeni bölüm:** [`Accounts`](file:///D:/zone/dev/git/miropharm/vsc_AgentFarm/media/engines.js#L436-L480).
3. **Nasıl mühürlenir:**
   - Terminalde normal şekilde 1. hesabınızla giriş yapın (`claude login`).
   - Motorlar sayfasındaki **Accounts** bölümüne gelin, motor olarak **Claude Code** seçin, isteğe bağlı bir etiket yazın (örn: `pro-hesap-1` ya da boş bırakın; e-postayı otomatik okur).
   - **"Capture this sign-in"** düğmesine basın. Sistem kimliği izole bir dizine kopyalar, geçmiş transkript bağlarını kurar ve kartını oluşturur.
   - Ardından terminalde 2. ve 3. hesaplarınızla sırayla giriş yapıp aynı şekilde **"Capture this sign-in"** diyerek onları da mühürleyin.
4. **Sonuç:** Ekranda her hesabın 5 saatlik canlı kota çubuğu, yenilenme geri sayımı ve sağlık durumu kart olarak görünür.

---

### 2. Adım: Nöbet Kampanyasını Başlatma (Giriş Kapısı)
Kampanyanın yapılandırıldığı ve başlatıldığı ana yer **Missions** sayfasıdır.

1. **Nereden girilir:** Agent Farm sol panelinden **Missions** sayfasını açın.
2. **Nöbet bölümü:** En üstte yer alan [`Sentry`](file:///D:/zone/dev/git/miropharm/vsc_AgentFarm/media/missions.js#L3136-L3187) bloğunu bulun ve **`+ Start a campaign`** butonuna basın.
3. **Forma girilecek parametreler:**
   - **Project (Zorunlu):** Backlog'u tüketilecek projeyi seçin (örn: `PRS.MuratVural_DEV_VSC.AgentFarm`).
   - **Runs as (Zorunlu):** Oturumları hangi ajanın koşturacağını seçin (örn: `developer`).
   - **Engine:** `Claude Code` seçin. *(Önemli: Motor seçilmezse hesap rotasyonu devreye girmez, sadece makinenin ana girişi kullanılır. Claude Code seçildiğinde mühürlediğiniz 3 hesap arasında kota rotasyonu aktif olur).*
   - **Model:** İsteğe bağlı (boş bırakılırsa motor varsayılanı).
   - **Permissions:** Varsayılan olarak `bypassPermissions` gelir *(İnsansız nöbette oturumun izin onayında kilitlenip kotayı yakmaması için kasten varsayılandır)*.
   - **Superpowers:** İhtiyaca göre checkbox işaretlenir/kaldırılır.
   - **First round opens with (İlk Prompt - Zorunlu):**
     - Kampanyanın ilk oturumunu başlatacak başlangıç cümlesini yazın.
     - *Neden gerekli?* Sonraki tüm turlar bir önceki oturumun devir notuna ve backlog sırasına göre prompt'unu otomatik üretir ([`X-175`](file:///D:/zone/dev/git/miropharm/vsc_AgentFarm/src/core/sentryPrompt.ts)). Ancak 1. turun önünde henüz bir oturum olmadığı için başlangıç kıvılcımını sizin cümleniz verir.
     - *Örnek giriş:*  
       `"Projeye devam et, backlog'daki sıradaki görevi al, kural ve test disiplinine uyarak tamamla."`
   - **İsteğe Bağlı Emniyet Ayarları:**
     - **Ceiling %:** Hesabın 5 saatlik penceresi bu orana ulaştığında (örn. %90) oturum açılmaz, diğer hesaba geçilir.
     - **Safety min:** Kota sıfırlanma saatinden sonra kaç dakika emniyet payı bekleneceği (örn. 3 dk).
     - **Failure brake:** Arka arkaya kaç boş/hatalı tur olursa döngünün otomatik durdurulacağı (boş oturum açıp sabaha kadar kota harcamayı engelleyen güvenlik freni).
4. **`Start campaign`** butonuna basın.

---

### 3. Adım: Canlı İzleme ve Müdahale

- **Console Canlı Şeridi ([`X-177`](file:///D:/zone/dev/git/miropharm/vsc_AgentFarm/media/console.js#L2582-L2635)):**
  - Kampanya başladığında Console sayfasının en üstünde tek satırlık **SENTRY** şeridi açılır.
  - Şeritte canlı olarak: Şu an hangi turda, hangi görev kodunda, hangi ajanın hangi hesapla çalıştığı ve o hesabın 5 saatlik kotasından **ne kadar kaldığı** anlık gösterilir.
  - Hesapların kotası biterse şerit sarıya döner: `SLEEPING · until 02:15` (en erken reset saatine kadar sıfır token/istekle uyur, saniyesinde uyanıp devam eder).
  - Şeride tıklandığında doğrudan Missions yönetim paneline geçer.
- **Missions Kontrolleri:**
  - **Pause / Resume:** İstediğiniz an duraklatıp devam ettirebilirsiniz.
  - **Stop:** Kampanyayı tamamen kapatır.
  - **Rounds Tablosu:** Biten turların durumunu (`done`, `failed`, `cancelled`), harcanan hesabı ve kaç dakika sürdüğünü listeler.
- **Nöbet Bekçisi ([`X-178`](file:///D:/zone/dev/git/miropharm/vsc_AgentFarm/src/core/sentryWatch.ts)):**
  - Bir oturum izin bekleyip 45 dk sessiz kalırsa bekçi onu sonlandırıp bir sonraki adıma geçer; sistem kilitlenmez.
  - Bir hesabın token'ı düşerse (401), Notices üzerinden size haber verilir ve sistem kalan hesaplarla çalışmaya devam eder.

Alternatif olarak, köprü üzerinden `af sentry.start project=... agent=...` veya VS Code komut paletinden de tetiklenebilir; ancak günlük kullanım için en doğrudan yol **Missions > Sentry** formudur.





# Tamamen arayüz (GUI) üzerinden, sadece fare tıklamalarıyla adım adım nereye basacağınız


### Arayüzün Genel Yerleşimi
Agent Farm arayüzü 3 ana parçadan oluşur:
1. **Sol Kenar Çubuğu (Side Bar):** VS Code'un solundaki Agent Farm simgesine basınca açılan ağaç panelleri (`AGENTS`, `PROJECTS`, `TASKS`, `MISSIONS`, `TOOLBOX` vb.).
2. **Ortak Başlık Çubuğu (Global Toolbar):** Açılan her Agent Farm sayfasının en sağ üstünde duran sabit gezinme butonları (`Dashboard`, `Console`, `Tasks`, `Missions`, `Toolbox`, `⚙` Settings vb.).
3. **Sayfa Gövdesi:** İlgili sayfanın kendi kartları, tabloları ve formları.

Yeni eklenen bu özellik (hesap rotasyonu ve nöbet) arayüzde 3 ana ekrana yayılmıştır:
* **Engines Ekranı:** Hesapların mühürlendiği yer.
* **Missions Ekranı:** Nöbetin (kampanyanın) başlatıldığı yer.
* **Console Ekranı:** Canlı nöbet şeridi ve tekil hesap seçici.

---

### 1. Adım: Hesapları Arayüzden Mühürleme (Engines Sayfası)

Bu sayfaya arayüzden **iki farklı tıklama yoluyla** ulaşabilirsiniz:

* **1. Yol (Dashboard üzerinden):**
  1. Sol paneldeki **`AGENTS`** panel başlığının üstünde yer alan ilk ikon olan **grafik `$(graph)` (Open Dashboard)** simgesine tıklayın.
  2. Açılan Dashboard sayfasında ortada **"Farm status"** kartını göreceksiniz.
  3. Kartın içindeki alt sistemler listesinde **`Engines`** satırının sağındaki **`Engines`** butonuna tıklayın.
* **2. Yol (Settings üzerinden):**
  1. Açık olan herhangi bir Agent Farm sayfasının sağ üst köşesindeki **`⚙` (Settings)** simgesine tıklayın.
  2. Açılan sayfada aşağı kaydırıp **Engines** başlığını bulun.
  3. Başlığın hemen altındaki **`⚙ Open Engines`** butonuna tıklayın.

#### Engines Ekranında Ne Yapacaksınız?
Sayfanın en altına indiğinizde yeni eklenen **[`Accounts`](file:///D:/zone/dev/git/miropharm/vsc_AgentFarm/media/engines.js#L436-L480)** bölümünü göreceksiniz:
1. Bir hesabınız aktifken bu sayfadaki açılır kutudan motoru **`Claude Code`** seçin.
2. Yanındaki metin kutusuna (`what to call it`) hesabı ayırt etmek için bir etiket yazın (örn. `pro-1` ya da boş bırakabilirsiniz; e-posta adresini otomatik okur).
3. **`Capture this sign-in`** butonuna tıklayın. Sistem o anki kimliği izole bir dizine kopyalar ve sayfada o hesaba ait bir kart oluşturur.
4. Diğer hesaplarınızla da giriş yapıldığında aynı şekilde bu butona basarak 2. ve 3. kartları oluşturun.

**Oluşan Kartlardaki Kontroller:**
* **Canlı Kota Çubuğu:** Hesabın 5 saatlik penceresinden yüzde kaç kaldığını ve sıfırlanma saatini gösterir.
* **`Use next` butonu:** Sıradaki başlatılacak oturumun doğrudan bu hesapla açılmasını sağlar (kartın soluna mavi çizgi ve `standing` rozeti ekler).
* **`Main account` butonu:** Mühürlü hesaptan çıkıp makinenin ana varsayılan hesabına dönülmesini sağlar.
* **`Forget` butonu:** Hesabı listeden kaldırır.

---

### 2. Adım: Nöbeti (Kampanyayı) Başlatma (Missions Sayfası)

Hesaplar tanımlandıktan sonra insansız nöbeti başlatacağınız yer **Missions** sayfasıdır.

* **Arayüzden Ulaşım:**
  * Sol kenar çubuğundaki **`MISSIONS`** panel başlığının sağındaki **roket `$(rocket)` (Missions Page)** ikonuna tıklayın (veya sayfa üstündeki başlıktan `Missions` butonuna basın).

#### Missions Ekranında Ne Yapacaksınız?
Sayfanın en üstünde yeni eklenen **[`Sentry`](file:///D:/zone/dev/git/miropharm/vsc_AgentFarm/media/missions.js#L3136-L3187)** bloğu ve yanında gri **`OFF`** rozeti yer alır:
1. Başlığın sağ tarafındaki **`+ Start a campaign`** butonuna tıklayın. Aşağıya doğru form açılır.
2. **Formdaki Seçimler:**
   * **Project:** Açılır kutudan üzerinde çalışılacak projeyi seçin (örn: `PRS.MuratVural_DEV_VSC.AgentFarm`).
   * **Runs as:** Oturumları koşturacak ajanı seçin (örn: `developer`).
   * **Engine:** Açılır kutudan **`Claude Code`** seçin. *(Bunu seçtiğiniz anda sistem mühürlediğiniz hesaplar arasında kota rotasyonunu otomatik yönetir).*
   * **Permissions:** Varsayılan olarak `bypassPermissions` seçilidir (gece nöbetinde terminalde izin sorup takılmaması için).
   * **First round opens with (İlk Prompt Metni):** Formun altındaki metin kutusuna ilk oturumu ateşleyecek başlangıç cümlesini yazın (Örn: `"Backlog'daki sıradaki görevi al, kural ve test disiplinine uyarak tamamla"`). Sonraki tüm turlar, bir önceki turun devir notundan kendi prompt'unu otomatik üretecektir.
   * *(İsteğe Bağlı Emniyet Ayarları):*
     * `Ceiling %`: Hesap kotası bu sınıra (örn. %90) dayanınca diğer hesaba geçilir.
     * `Failure brake`: Arka arkaya kaç verimsiz/başarısız turda sistemin otomatik duracağı.
3. Formun altındaki **`Start campaign`** butonuna tıklayın.

---

### 3. Adım: Canlı Takip ve Müdahale

* **Console Ekranı ([`X-177`](file:///D:/zone/dev/git/miropharm/vsc_AgentFarm/media/console.js#L2582-L2635)):**
  * Sol paneldeki `AGENTS` başlığından **`$(comment-discussion)` (Open Console)** ikonuna tıklayın.
  * Console sayfasının en üstünde tek satırlık **`SENTRY`** canlı şeridi belirir.
  * Şerit anlık olarak: Hangi turda olunduğunu, hangi görevin koştuğunu, hangi hesabın kullanıldığını ve o hesabın 5 saatlik kotasından **ne kadar kaldığını** gösterir.
  * Kotası biten hesap olursa şerit sarıya döner ve uyku sayacını (`SLEEPING · until 02:15`) gösterir; en erken kota yenilenme anında kendiliğinden uyanır.
  * Bu şeride tıkladığınızda doğrudan Missions yönetim sayfasına geçersiniz.
* **Missions Ekranı Kontrolleri:**
  * Kampanya çalışırken `Sentry` başlığında **`Pause`**, **`Resume`** ve **`Stop`** butonları çıkar.
  * Altındaki tabloda geçmiş turlar (`done`, `failed`), harcanan hesap ve turun kaç dakika sürdüğü listelenir.

---

### 4. Adım: Manuel / Tekil Oturumlarda Hesap Seçimi (X-169)

Nöbet dışında, gündüz elle tekil bir oturum açarken de mühürlediğiniz hesapları arayüzden seçebilirsiniz:
* **Console Bestecisi:** Konuşma kutusunun (c-text) hemen altındaki ayar çubuğunda Model ve Route açılır kutularının yanına **`Account`** seçici kutusu eklenmiştir.
* **Launcher:** Sol paneldeki `▶` veya Launch menüsünden oturum açarken Model seçiminin yanındaki **`Account`** katmanından istediğiniz hesabı işaretleyip oturumu başlatabilirsiniz.

---

### Arayüz Erişilebilirlik Tespiti
Şu an **Engines** sayfasına arayüzden ulaşmak için ya **Dashboard > Farm Status > Engines** butonuna basmak ya da **Sağ Üstteki ⚙ (Settings) > Open Engines** butonuna basmak gerekiyor. Sol kenar çubuğundaki **`TOOLBOX`** başlığında `Open Toolbox` ve `Open Secrets` varken doğrudan bir `Open Engines` ikonu bulunmuyor. Dilerseniz sol kenar çubuğundaki `TOOLBOX` başlığına doğrudan bir **`Open Engines` (`$(plug)`)** ikonu ekleyebiliriz; böylece tek tıkla doğrudan hesap yönetimine geçilebilir.

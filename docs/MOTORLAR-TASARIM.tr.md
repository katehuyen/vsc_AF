# Motorlar — Claude dışı modellerin eklentide kullanımı (X-3)

> Tasarım belgesi. Faz 1 uygulandı (3.97.0); Faz 2–4 yol haritasıdır ve
> **yerleşim kararı kullanıcıya sorulmadan uygulanmayacaktır** (X-3 kaleminin
> kendi şartı: "nereye ve nasıl konacağı önce kullanıcı ile konuşulacak").

## 1. Sorunun kendisi — yanlış zihinsel model

Eklentinin Claude dışı bir motor hakkında bildiği tek şey şuydu: **kasada bir
anahtar var mı.** Kasa (Secrets) ise düz bir `ad → değer` tablosudur; hangi adın
hangi motora ait olduğunu bilmez. Dolayısıyla "bu makinede Codex neden
çalışmıyor" sorusunun bir yüzeyi yoktu — cevap `Ctrl+Shift+P → Set Secret` ve
hangi adı yazacağını tahmin etmekti.

Asıl mesele bir kutu eksikliği değil. **Üç motorun ikisi anahtarla değil,
abonelikle ödeniyor:**

| Motor | Normal ödeme yolu | Kimlik nerede durur | Ölçüm |
|---|---|---|---|
| Claude Code | Claude Pro / Max planı | `~/.claude/.credentials.json` → `claudeAiOauth` | bu makinede doğrulandı, 2026-08-09 |
| Codex | ChatGPT Plus / Pro / Team planı | `~/.codex/auth.json` → `auth_mode: "chatgpt"`, `OPENAI_API_KEY: null` | bu makinede doğrulandı, 2026-08-09 |
| Gemini / Antigravity | **API anahtarı** | — | "Google ile giriş" yolu Haziran 2026'da kapatıldı |

Yani anahtar merkezli bir ekran, **istisnayı** merkeze alan bir ekrandır. Kullanıcı
"arayüz yok" derken haklıydı ama eksik olan şey anahtar kutusu değil, şu dört
sorunun tek yerde cevaplanmasıydı:

1. CLI bu makinede var mı?
2. Bu motor **nasıl** ödeniyor?
3. Şu an giriş yapılmış mı?
4. Yapılmamışsa **tek yapılacak şey** nedir?

## 2. İlke

- **Kimlik bilgisi eklentiden geçmez.** Abonelik girişi CLI'ın kendi komutudur;
  tarayıcı ile CLI arasında hallolur, grant CLI'ın kendi dosyasında kalır.
  Eklenti onu ne okur ne saklar.
- **Anahtar yolu kasanındır.** Değer yalnız OS anahtarlığında durur; panel
  metadata görür, değer görmez. Köprüye hiçbir koşulda değer çıkmaz
  (`core/secrets.ts` güvenlik istisnası).
- **Bir satır asla yalnızca durum söylemez.** "Yapılandırılmamış" bu kalemin
  varlık sebebidir: durumu adlandırıp çözümü kullanıcıya aratır. Her satır bir
  **eylemle** biter.
- **Tarihli gerçekler yazılır.** Gemini'nin giriş yolunun kapandığı satırda
  yazar; yoksa kullanıcı olmayan bir düğmeyi arar.

## 3. Faz 1 — uygulandı (3.97.0)

**`src/core/engines.ts`** — enjekte edilen bir `EngineProbe` üzerinde saf.
Ev dizini, PATH, kasa **adları** ve süreç ortamı dışında hiçbir şeye dokunmaz;
her okuma best-effort, hata veren bir okuma tek satırı sessizleştirir, sayfayı
düşürmez. Çıktı motor başına: `cli` (var mı, nerede), `auth` (`subscription` /
`apikey` / `none`, hangi dosyadan, ne zaman tazelendi), `key` (`env` adı,
kasada var mı), `ready`, `next`, `loginCommand`, `billing`, `docs`.

**Farm Settings → Engines** — sayfanın en üstündeki bölüm ve gezinme
bağlantısı. Satır soldan sağa okunur: ad → rozet (*on a plan* / *on a key* /
*not signed in* / *not installed*) → üç düğme. Sol kenar çubuğu durumun
rengidir. Rozetin hover'ı figürleri taşır (komut, yol, okunduğu dosya, son
tazeleme, anahtar adı), açıklama satırı ne yapılacağını söyler.

Üç jest, üçünü de host yapar:

- **Sign in with a plan** — bir terminal açar ve komutu **yazar, çalıştırmaz**
  (`sendText(command, false)`). Tarayıcı girişini başlatmak kullanıcının işidir.
- **Add / Replace key** — kasanın kendi formunu tam o adla açar.
- **Docs** — yalnız `https://`.

**Köprü:** `engines.status` (`args: id?`). Aynı matrisi döndürür; **hiçbir
kimlik bilgisi geçmez** ve buradan bir kimlik bilgisi ayarlanamaz. Test
`test_bridge.js` içinde teli tarayıp `access_token`/`refresh_token` aramaktadır.

**Testler:** `test/test_engines.js` (31) + köprü sevk testi.

## 4. Faz 2 — sağlık: "hazır" ile "gerçekten çalışıyor" farkı

Faz 1 diskten okur. Diskteki grant süresi dolmuş olabilir, anahtar iptal
edilmiş olabilir. Eklenecek: satır başına **Test** düğmesi — motorun en ucuz
çağrısını yapıp (Codex/Claude için tek turluk bir `-p` çağrısı, Gemini için bir
model listeleme) sonucu satıra iliştirir. Sonuç önbelleğe alınır ve yaşı
gösterilir; kendiliğinden çalışmaz, çünkü para harcatan bir kontrolün sessizce
dönmesi bu sistemde kabul edilmez.

## 5. Faz 3 — motor seçimi oturum yüzeylerine iner

Bugün Console yalnız `claude` başlatır (`ConsoleHost.exe`). Faz 3, oturum
başlatan her yüzeye (Console besteci, ▶ üçgeni, görevler, misyonlar) bir
**motor** ekseni ekler ve hazır olmayan motoru seçilebilir kılmaz — seçilirse
sebebini ve Faz 1'in `next` satırını gösterir. Bu, protokol farkları nedeniyle
gerçek iş: Codex'in akış formatı Claude'unkiyle aynı değildir, dolayısıyla
`consoleproto.ts` seviyesinde bir adaptör gerekir. Ayrı bir kalem olarak
kuyruğa girmeyi hak eder.

## 6. Faz 4 — adanmış panel (yerleşim kararı bekliyor)

X-3 "Ayarlar sayfasından açılan, bu işe adanmış bir yönetim paneli" diyor ve
yerleşimin önce konuşulmasını şart koşuyor. Faz 1 bilinçli olarak **bölüm**
olarak yapıldı: bilgiyi hemen görünür kılar, ama adanmış panelin yerini
kullanıcı adına kararlaştırmaz. Konuşulacak üç seçenek:

1. **Ayarlar içinde bölüm kalsın** (bugünkü hâli) — bir yer daha öğrenmeye gerek
   yok, ama motorlar ayarların içinde bir satır olarak kalır.
2. **Ayarlar'dan açılan ayrı bir Engines paneli** — kalemdeki tarif. Sağlık
   testleri, kullanım/kota, model listeleri ve motor başına varsayılanlar için
   yer açar; sol paneldeki gezinmeye de bir giriş ister mi, o da soruya dâhil.
3. **Secrets sayfasının bir sekmesi** — kimlik bilgisi zaten orada; motorlar
   "anahtarların anlamı" sekmesi olur. Anahtar olmayan iki motoru anahtar
   sayfasına koymak pahasına.

Karar alınmadan Faz 4 uygulanmaz (Anayasa, İlke 2).

## 7. Kapsam dışı bırakılanlar ve nedeni

- **Abonelik grant'ını eklentinin kendisinin tutması.** Teknik olarak mümkün
  (Codex'in `auth.json`'ı düz metindir) ama yanlış: token'ın tazelenmesi CLI'ın
  işidir ve bir kopya, iptal edildiğinde sessizce eskir. Eklenti kimlik
  bilgisini görmemeye devam eder.
- **Anahtarların köprüden yönetilmesi.** Köprü düz metin dosya kanalıdır; bu,
  kullanıcının 2026-07-19'da kabul ettiği güvenlik istisnasıdır.

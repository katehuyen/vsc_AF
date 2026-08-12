# Agent Farm — Arama sisteminin yeniden kurulumu (X-24 ailesi)

*X-24 ve parçaları U-42 · X-25 · X-33 · X-34 tek bir bütün olarak tasarlanıp tek
seferde kodlanıyor. Dev-internal belge: Türkçe, çevrilmez.*

---

## 0. Bugün ne var — ölçülmüş

| Katman | Dosya | Durum |
|---|---|---|
| Sorgu dili | `media/afQuery.js` (+ `src/core/query.ts` kapısı) | **Sağlam.** AND/OR/NOT, parantez, tırnaklı öbek, `*` joker. Tek gerçek kusuru: örnekleri **Türkçe** ve tam-kelime/kısmi ayrımı hiçbir yerde anlatılmıyor. |
| Motor | `src/core/search.ts` | Claude JSONL satır tarayıcı. 4 rol (`user · assistant · tool · toolResult`), zaman penceresi, ajan/dosya kapsamı, bütçe. **Sadece Claude**: `index.all()` claude-only, diğer üç motorun transcript'i hiç okunmuyor. |
| Yüzey | `media/search.js` | Sorgu kutusu + ajan picker + 4 rol chip'i + tarih + sıralama. **Süzgeç yok**: motor, proje, model, başlatan, sub-agent, pinned, hata, oturum ID — hiçbiri yok. |
| Oturum tabloları | `media/sessionsTable.js` | Zengin süzgeç paneli var; ama **kutunun metni yalnız title/ajan/etiket** arıyor, oturum ID aramıyor. Panelin kendi kontrollerinin hover'ları ya yerli `title` ya da **hiç yok**. |
| Transcript | `media/sessionViewer.js` | Sidechain satırlar `USER` / model adıyla çiziliyor: işi **veren ajan** ile **insan** aynı kelimeyi taşıyor. |

**Sonuç:** dil hazır, motor yarım, yüzey çıplak. Bu tasarım üçünü aynı anda
kapatıyor.

---

## 1. Beş kalem, tek bütün

| Kod | Ne istiyor | Bu tasarımda nereye düşüyor |
|---|---|---|
| **X-24** | Gelişkin arama: AND/OR/NOT, tam-kelime/kısmi, **dolu süzgeç ekseni**, anlaşılır İngilizce tooltip | Katman 2 · 3 · 4 · 5 |
| **U-42** | Search sayfasının kapsam chip'leri oturum sayfasındaki gibi **rozet** olsun, **çoklu seçim** yapılabilsin | Katman 5.2 |
| **X-25** | Sub-agent transcript'inde `USER` → **DELEGATOR (ajan)**, cevap veren → **HANDLER** | Katman 2.1 · 6 |
| **X-33** | Süzgeç satırlarının tooltip'leri kayboluyor / tablo satırlarıyla aynı değil | Katman 5.4 |
| **X-34** | ID'sini bildiğim oturumu kolayca bulmak; tablo süzgeci ve Search ID'ye duyarlı olsun | Katman 3.3 · 5.5 · 6.2 · 7 |

Bunlar ayrı ayrı yamanmaz: X-25 yeni **rol** doğuruyor, o rol X-24'ün chip
satırına giriyor; U-42 o chip satırının davranışını değiştiriyor; X-34 hem
motorun hem iki ayrı yüzeyin işi. Bu yüzden tek tasarım, tek commit ailesi.

---

## 2. Katman 1 — Sorgu dili (`media/afQuery.js`)

Gramer **değişmiyor** (kimsenin öğrendiği şey bozulmuyor); üç şey ekleniyor.

### 2.1 `wholeWord` seçeneği — X-24'ün "hâlâ bilmiyorum" dediği şey

Bugün tam-kelime yalnız tırnak içinde var (`"log"` → `dialogue` içinde bulunmaz).
Kullanıcı bunu bilmiyor çünkü hiçbir yerde yazmıyor ve bir **düğmesi** yok.

- `compile(q, { wholeWord: true })` → **çıplak kelimeler de** tırnaklı öbek gibi
  sınırlanır (`(?<!\p{L}\p{N}_)` … `(?!…)`, `WORD` sabitiyle — `\b` Türkçe
  harflerde yalan söylüyor, o yüzden lookaround).
- `*` biten/başlayan kelime **açık uçlu** kalır: `kelime*` whole-word açıkken de
  `kelimeler` bulur. Yazılanın anlamı hiçbir kipte tersine dönmez.
- Sayfada karşılığı: sorgu satırında `whole word` onay kutusu, `regex` ve
  `match case` ile aynı yerde, aynı dilde.

### 2.2 Söz dizimi artık İngilizce ve **yapılı**

`SYNTAX` düz metin kalıyor (tooltip'ler onu kullanıyor) ama örnekleri
İngilizceye çevriliyor — eklentinin arayüzü İngilizce, örneği Türkçe bir yardım
metni kullanıcının yüzüne söylediği hatadır.

Yanına `SYNTAX_ROWS` geliyor: `[{ sym, what, example }]`. Search sayfası bundan
gerçek bir **yardım kartı** çiziyor (Katman 5.3); tooltip dar bir satırla
yetinmek zorunda kalmıyor.

| sym | what | example |
|---|---|---|
| `a b` | both words, any order | `parser error` |
| `OR` | either one | `codex OR gemini` |
| `-a` | without it | `parser -test` |
| `( )` | grouping | `(codex OR gemini) install` |
| `"…"` | exact phrase, whole words | `"session id"` |
| `*` | any run of characters | `refact*` |
| `"a* b*"` | phrase with partial words | `"refact* the pars*"` |

### 2.3 `tip(subject)` değişmiyor

Her kutu kendi konusunu bir satırda söyler, gramer ortak metinden gelir. Yeni
kural: **whole word açıkken tooltip bunu söyler** (`Whole word is ON: bare words
must match a whole word.`) — kipin ne yaptığını kullanıcı kutunun üstünde görür.

---

## 3. Katman 2 — Motor (`src/core/search.ts`)

### 3.1 İki yeni rol: `delegator` ve `handler` (X-25)

Türetme **satır düzeyinde** ve tahmin değil:

| transcript satırı | rol |
|---|---|
| `type:user`, `isSidechain` yok | `user` — insanın yazdığı |
| `type:assistant`, `isSidechain` yok | `assistant` |
| `type:user`, `isSidechain:true` | **`delegator`** — işi veren ajanın yazdığı |
| `type:assistant`, `isSidechain:true` | **`handler`** — işi alan ajanın cevabı |
| `tool_use` | `tool` |
| `tool_result` | `toolResult` |

Sub-agent'ın **kendi dosyası** olan transcript'lerde (`…/<parentId>/subagents/*.jsonl`,
`SessionInfo.isSidechain`) her satır aynı kurala girer: oturumun tamamı
delegasyon şeridi sayılır.

`delegator` hit'i **kimin verdiğini** taşır: `speaker` alanı = oturumun
`agentName`'i. Yüzey `DELEGATOR (developer)` diye çizer.

> **Varsayılanın anlamı değişiyor ve bu bilinçli.** `Dialog` artık
> `user + assistant`; delegasyon şeridi ayrı bir ön-ayar. X-25'in şikâyeti tam
> buydu: "sadece kullanıcı promptlarında ara" dendiğinde işi veren ajanın metni
> insanmış gibi geliyordu. Sonuç satırı ne aradığını yazacak, böylece daralma
> sessiz olmayacak.

### 3.2 Çok motorluluk — arama artık dört motoru da okuyor

`searchTranscripts` claude JSONL'i satır satır tarıyor; Codex/Gemini/Antigravity
dosyaları o şemaya uymadığı için **hiç bulunmuyordu**.

Çözüm: `SearchOptions.parseForeign?: (raw, file) => ForeignMessages | undefined`.
Çağıran (`searchPanel` ve köprü) `core/cliViewer.ts → parseCliViewer` verir —
oturum görüntüleyicinin okuduğu **aynı** ayrıştırıcı. Motor kendi başına yeni bir
bağımlılık edinmez, test bir saplama geçebilir.

- Claude parse'ı bir şey üretmediyse yabancı yol denenir (sıra: claude → foreign).
- Yabancı mesajlar rollere aynen düşer (`user · assistant · tool · toolResult`);
  o motorlarda sidechain kavramı yok, delegasyon rolleri üretilmez.
- **Önbellek:** `file → { mtime, parsed }`, modül seviyesinde. Aynı aramada ve
  ardışık aramalarda dosya bir kez ayrıştırılır; `mtime` değişince düşer.
- Zaman bütçesi (10 sn) aynen geçerli.

### 3.3 Hit artık oturumu tanımlıyor

`SearchableSession` alanları: `sessionId · engine · project · isSidechain`.
`SearchHit` bunları taşır (`sessionId`, `engine`, `speaker`). Kazanç üç yerde:
sonuç satırına **motor rozeti**, ID ile eşleşme (X-34), ve sonucun sağ tık
menüsünün oturum kimliğini bilmesi.

---

## 4. Katman 3 — Oturum ekseni süzgeçleri (host: `src/panels/searchPanel.ts`)

Süzgeçler **oturum kümesini** daraltır, sonra motor o kümeyi tarar. Yani süzgeç
taramayı ucuzlatır; sonucu sonradan elemez.

### 4.1 Havuz

`index.allWithExternal()` — X-27'de tabloların yaptığı genişleme. Arama sayfası
bir ölçüm değil bir **kayıt yüzeyi**dir; dört motorun oturumu da buraya girer.

### 4.2 Eksenler

| Eksen | Kaynak | Kontrol |
|---|---|---|
| Agents | `s.agentName` | çoklu picker (var) |
| Engines | `s.source ?? 'claude'` → `AFEngine.label` | çoklu picker |
| Projects | ajan→proje haritası, `Unassigned` sonda | çoklu picker |
| Models | `s.models[]` (vendor öneki atılmış) | çoklu picker |
| Started by | `sessionOrigin(s)` | chip: All · 🧑 You · 🤖 Automation |
| Lanes | `s.isSidechain` | chip: All · Main · Sub-agents |
| Flags | `s.pinned`, `s.errors>0` | chip: ★ Pinned · ⚠ Has errors |
| Session | `sessionId` / `title` | metin kutusu (X-34) |
| When | mesajın **kendi** zamanı | tarih aralığı (var) |

**Facet'ler gerçeğe göre üretilir**: picker'ların seçenekleri havuzda gerçekten
bulunan değerlerden çıkar, sabit listeden değil. Bir motor/model/proje ortadan
kalkarsa süzgeçte de kalmaz; yeni biri geldiğinde kod değişmeden görünür.

### 4.3 ID çözümü (X-34)

`resolveSessionRef(text)` host tarafında:

1. tam `sessionId` eşleşmesi,
2. `sessionId` **ön eki** (≥6 karakter — `4d361981` gibi kısa formu her yerde
   yazıyoruz),
3. transcript **yolu**,
4. hiçbiri değilse `null`.

Dönen kayıt: `{ sessionId, file, title, agent, engine, ts }`. Search sayfası bunu
sonuçların **üstünde** bir şerit olarak çizer ("↳ Session #4d361981 — başlık ·
open"), tıklanır. Kutuya ID yapıştıran kullanıcı, o ID'nin metin olarak geçtiği
yerleri de görmeye devam eder — şerit aramayı daraltmaz, üstüne ekler.

**Hiçbir şeye işaret etmediğinde de bir şey yazar.** İki oturumun paylaştığı bir
ön ek cevap değildir; şeridi sessizce çizmemek okuyucuya "ID'n yok" dedirtir. O
yüzden aynı yerde soluk bir satır çıkar ve sonunda **`Find session by id ▸`**
durur: `agentfarm.findSession` komutunu yazılmış metinle tohumlar (Katman 7).

---

## 5. Katman 4 — Search sayfası (`media/search.js`)

### 5.1 Düzen

```
┌ başlık ─────────────────────────────────────────────────────────┐
│ [sorgu kutusu ✕] [scope pill] [Agents ▾] ☐semantic ☐regex        │
│                                 ☐match case ☐whole word [Search] [?]│
├ kapsam chip'leri ───────────────────────────────────────────────┤
│ Search in: Dialog · Delegation · Everything │ 🧑 User 🤖 Agent    │
│            📤 Delegator 📥 Handler 🔧 Tool calls 📄 Results        │
│            │ 📝 Memory ⌁ Events                                   │
├ süzgeç şeridi ──────────────────────────────────────────────────┤
│ ⚙ Filters (n) │ [açılınca 3 satırlık panel]                      │
├ ID şeridi (varsa) ──────────────────────────────────────────────┤
│ sonuçlar: oturum grubu → tur başlığı → hit satırı                │
```

### 5.2 Chip'ler rozet gibi davranır (U-42)

- **Düz tık = aç/kapa.** Oturum sayfasındaki (`sessionViewer`) davranışın
  aynısı — kullanıcının "gayet güzel" dediği yüzey. İki rolü aynı anda seçmek
  artık mümkün; yapısal engel yok, motor zaten dizi alıyor.
- **Ctrl/⌘ + tık = yalnız bu.** Eski davranış kayboluyor değil, bir tuş
  arkasına geçiyor.
- **Kapsam asla boşalmaz**: son chip'i söndürmek yerine `Dialog`'a döner.
- Satır sonundaki `→ the conversation` **kalkıyor**: hangi chip yanıyorsa cevap
  odur; oku okumak için satırı ikinci kez okumak gerekiyordu.
- `📝 Memory` / `⌁ Events` onay kutuları da chip oluyor — tek satır, tek
  gramer.

`docs/CONVENTIONS.md` "Chips that are a scope" kuralı bu karara göre
güncelleniyor: **rozet mantığı asıl, "yalnız bu" değiştiricinin arkasında.**

### 5.3 Yardım kartı — `?` (X-24: "tooltip bile aptalca")

Sorgu satırındaki `?` `SYNTAX_ROWS`'tan üç sütunlu bir kart açar (sembol ·
anlamı · örnek), altında üç satır: whole word ne yapar, regex ne yapar, semantic
ne yapar. Kart sayfanın içinde, katlanır, durumu korunur. Tooltip'ler
kısalıyor — çünkü artık bir yerleri var.

### 5.4 Süzgeç panelinin hover'ları (X-33)

Panel her süzgeç değişiminde yeniden çiziliyor; yerli `title` yeniden çizimde
imleç altında kaybolur ve pointer kımıldayana kadar geri gelmez. Tablo hücreleri
`AFTip` kullandığı için hayatta kalıyor — panel kullanmadığı için kalmıyordu.
Üstelik aralık kutuları ve tarih kutusunun hiç tooltip'i yoktu.

Kural, iki yüzeyde birden (Search paneli **ve** `sessionsTable` süzgeç paneli):

- açıklama taşıyan her kontrol → **`AFTip.wrap`** (repaint köprüsü bedava),
- rakam taşıyan (aralık kutuları: sütunun anlamı + o an ne aralık seçili) →
  `Label: value` satırları,
- **tooltip'siz kontrol kalmaz.**

### 5.5 Sonuç satırları

- Oturum grubu başlığında **motor rozeti** (`AFEngine.badge`) + ajan + başlık +
  hit sayısı + zaman.
- Hit rozeti rolü kendi adıyla söyler: `user · agent · delegator (developer) ·
  handler · tool:Bash · result`.
- Sonuç özeti ne aradığını yazar: *"12 match(es) in 40 scanned session(s) —
  searched in 🧑 User · 🤖 Agent · 4 kinds not searched."*

---

## 6. Katman 5 — Oturum tabloları (`media/sessionsTable.js`)

1. **X-34:** metin süzgeci artık `title + agent + tags + sessionId` üzerinde
   çalışır; placeholder ve tooltip bunu söyler (`title, agent, label or session
   id…`). Kısa ID ön eki de eşleşir çünkü çıplak kelime zaten alt dize aramasıdır.
2. **X-33:** süzgeç panelinin bütün kontrolleri yukarıdaki hover kuralına
   geçer.

---

## 7. Katman 6 — Transcript görüntüleyici (X-25)

`src/panels/sessionViewer.ts` mesaja `delegated: true` bayrağı koyar (rol
değişmez — o sayfanın chip'leri role bağlı, X-25 "sadece isim değişikliği" diyor).

`media/sessionViewer.js` etiketleri:

| durum | etiket |
|---|---|
| `user`, sidechain değil | `USER` |
| `user`, sidechain | `DELEGATOR (developer)` — ajan adı oturumdan |
| `assistant`, sidechain değil | model etiketi (bugünkü) |
| `assistant`, sidechain | `HANDLER` |

Export MD aynı etiketleri yazar — dışarı çıkan metinle ekrandaki metin ayrışmaz.

---

## 8. Katman 7 — Köprü (agentfarm-dev kuralı: aynı commit)

| op | değişiklik |
|---|---|
| `search.transcripts` | yeni argümanlar: `wholeWord`, `engines`, `projects`, `models`, `origin`, `lane` (`main`/`sub`), `pinnedOnly`, `errorsOnly`, `sessionId`; `roles` artık `delegator`/`handler` de kabul eder; hit'ler `sessionId` + `engine` + `speaker` taşır |
| `sessions.find` | **yeni.** ID / ID ön eki / başlık / yol ile oturum bulur — X-34'ün ajan tarafındaki karşılığı. `{ id?, q?, limit? }` |

VS Code komutu: `agentfarm.findSession` — "Find Session by ID…" — palet ve
Search sayfasından açılır; tek satırlık bir QuickPick değil, **bütün** oturumlar
üzerinde ID + başlık + ajan eşleşmesi.

---

## 9. Testler ve **bakmak**

| Ne | Nerede |
|---|---|
| whole word · İngilizce syntax · `SYNTAX_ROWS` | `test/test_query.js` |
| delegator/handler rolleri · yabancı transcript · sessionId/engine alanları | `test/test_search_scopes.js` |
| chip'in düz tıkla toggle olması, Ctrl ile "yalnız bu", boşalmama | `test/test_search_scopes.js` |
| süzgeç panelinin her kontrolünün hover'ı olması | `test/test_filter_controls.js` |
| `sessions.find` sevki + `search.transcripts` yeni argümanları | `test/test_bridge.js` |
| **görsel** | `test/fixtures/search.js` → `render_page.js search` + `shoot_page.js search`, ayrıca `--light` |

`test/fixtures/search.js` gerçek dağılımı taşır: dört motordan oturum, Türkçe
başlık, delegator/handler hit'i, uzun snippet, memory + event bölümleri.

---

## 10. Faz sırası

1. Sorgu dili (`afQuery.js`, `query.ts`) + testi
2. Motor (`search.ts`): roller · yabancı ayrıştırıcı · hit alanları + testi
3. Host (`searchPanel.ts`): havuz · facet'ler · süzgeçler · ID çözümü
4. Yüzey (`search.js`): chip'ler · süzgeç paneli · yardım kartı · sonuç satırı
5. Oturum tabloları (X-33 · X-34)
6. Görüntüleyici (X-25)
7. Köprü + komut + testler
8. Belgeler (`CONVENTIONS.md`, `BLUEPRINT.{en,tr}.md`, `CHANGELOG.md`) → paket →
   kurulum → commit


Bu blueprint'te aslında senin de sezdiğin gibi **iki ayrı senkron katmanı** var, çünkü Codex ile Antigravity dosyaları farklı yerlerden okuyor:

| | Nereden okur | Yukarı doğru yürür mü? |
|---|---|---|
| **Codex** | Her klasörde bir `AGENTS.md`, git kökünden `cwd`'ye kadar birleştirilir (32 KiB tavan) | **Evet** — bir üst klasördeki ortak dosya kendiliğinden gelir |
| **Antigravity** | `<workspace kökü>/.agents/AGENTS.md` + global `~/.gemini/config/AGENTS.md` | **Hayır** — açılan workspace'in üstündeki hiçbir şey yüklenmez |

Bu fark yüzünden sync tek dosya değil, **iki hedef dosya** üretiyor: `AGENTS.md` (Codex için) ve `.agents/AGENTS.md` (Antigravity için). Aynı kaynak, iki farklı alıcı.

## A) Ajan bazında senkron

**Ne yapılır:** ajana sağ tık → **Sync Agent with Antigravity + Codex…**

> [Interactive Widget: ajan_bazinda_senkron]

Bu komut aynı anda dört şey yapar:
- `CLAUDE.md` → `AGENTS.md` üretilir (üstte senkron etiketiyle, kendine referanslar uyarlanmış olarak)
- `CLAUDE.md` (+ varsa anayasa) → `.agents/AGENTS.md` üretilir — Antigravity'nin gerçekten okuduğu dosya
- Aktif standing duty'ler → `.agents/workflows/` altına slash komut olarak yazılır (Antigravity'de `/duty-adi` şeklinde çağrılır)
- `.mcp.json` varsa → `.agents/mcp_config.suggested.json` (global gemini dosyasına elle taşıman gerekir, Agent Farm `~/.gemini`'ye asla yazmaz) + Codex için `.agents/codex/mcp.suggested.toml`

## B) Sistem/anayasa bazında senkron (nest)

Ajanları barındıran kök klasörün kendi `CLAUDE.md`'si varsa, buna **nest** denir ve o dosya tüm ajanların ortak **anayasası**dır. Claude Code bunu zaten otomatik yükler ama Codex ve Antigravity için ayrı ayrı taşınması gerekir:

> [Interactive Widget: anayasa_bazinda_senkron]




### 1. Agent senkronizasyon yönü (`agentfarm.syncAntigravity`)

Baştan "hangi yöne senkronize edilsin?" diye soran bir ekran **yok**.

Yön, gizli çalışan bir durum makinesi (`src/core/antigravity.ts`) tarafından belirleniyor. Bu sistem dosyaların hash'lerini ve `.agents/af-antigravity-sync.json` adlı kayıt dosyasını karşılaştırıyor.

Çalışma şekli:

- **Normal durumda** (değişiklik yoksa veya sadece `CLAUDE.md` değiştiyse), **hiç soru sormadan** `CLAUDE.md → Codex/Antigravity` yönünde senkronizasyon yapıyor.
- Sadece karşı tarafta son senkronizasyondan sonra **elle değişiklik yapıldığını** tespit ederse bir diyalog açılıyor.
  - `antigravity-ahead`
    - CLAUDE.md'ye uygula
    - Farkları göster
    - CLAUDE.md ile üzerine yaz
  - `conflict`
    - Farkları göster
    - Claude kazansın
    - Antigravity kazansın

Önemli nokta:

- **Hiçbir merge (birleştirme) modu yok.**
- Yapılan işlem her zaman bir tarafın dosyasını diğerinin üzerine tamamen yazmak.
- "İki taraftaki eksik bölümleri birleştir" diye bir seçenek yok.
- Varsayılan senkronizasyon yönünü seçebileceğin bir ayar da bulunmuyor.

Sonuç olarak:

> Sen yanlış hatırlamıyorsun. Hatırladığın "hangi yöne senkronize edilsin?" seçeneği aslında sadece kısmen var. O da yalnızca iki taraf da değiştiğinde tepki olarak çıkıyor; baştan kullanıcıya seçim yaptırmıyor ve gerçek anlamda merge de yapmıyor.

---

### 2. Constitution senkronizasyonu (`agentfarm.syncConstitution`)

Bu özellik gerçekten mevcut ve doğru çalışıyor.

Görevi:

- Ana `CLAUDE.md` dosyasını,
- iç içe (nested) `AGENTS.md` dosyalarına,
- Codex/Antigravity tarafına senkronize etmek.

Bu özellik v3.22.0'da eklenmiş (`CHANGELOG.md` satır 303).

Fakat:

**Buna hiçbir zaman bir kullanıcı arayüzü (UI) eklenmemiş.**

Şu anda yalnızca:

- Command Palette (`Ctrl+Shift+P`)
- veya `constitution.sync` komutu üzerinden çalıştırılabiliyor.

Buna karşılık normal agent sync komutu agent ağacında sağ tık menüsüne eklenmiş.

Constitution sync ise:

- ❌ sağ tık menüsünde yok
- ❌ webview'de yok
- ❌ Farm Settings / Toolbox'ta yok

Dokümantasyon bunu doğru anlatıyor; yani gizlenmiş bir buton yok.

Sorun basitçe:

> Buton hiç yapılmamış.

---

## Planı yazmadan önce sorduğu 3 soru

### 1.

Senkronizasyonu her çalıştırdığında baştan şöyle bir seçim ekranı mı gelsin?

- Push
- Pull
- Merge

Yoksa mevcut davranış korunsun mu?

Yani normalde sessiz çalışsın; sadece karşı tarafta değişiklik varsa Push / Pull / Merge seçenekleri sunulsun.

---

### 2.

"Merge" tam olarak ne anlama gelsin?

Çünkü `CLAUDE.md` ve `AGENTS.md` kod değil, düz Markdown belgeleri.

Önerisi şu:

- Markdown başlıklarına göre karşılaştır.
- Sadece bir tarafta bulunan bölümleri diğer tarafa ekle.
- Her iki tarafta da bulunan bölümleri değiştirme.

Yoksa merge ile uğraşmaya değmez; sadece Push ve Pull mı olsun?

---

### 3.

Constitution Sync butonu nereye eklensin?

Bulduğu en mantıklı yer:

Agent ağacının üst araç çubuğu (toolbar). Burada zaten birkaç ikon var ve `$(law)` ikonu bu komut için ayrılmış durumda.

Soru şu:

- Sadece toolbar'a bir ikon eklemek yeterli mi?
- Yoksa Farm Settings / Toolbox içine de eklenmesini ister misin?



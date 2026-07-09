# Agent Farm — ULTRA Gelişim Planı

*2026-07-09 · İnternet araştırmasına dayalı ikinci nesil yol haritası. İlk plan (GELISIM-PLANI) A-F fazlarıyla tamamlandı; bu belge "en gelişmiş eklenti" hedefi için sonraki ufku çizer. Kodlama bu belgeyi izleyecekse sıralama öncelik matrisine uyar.*

## Araştırma Özeti: 2026'da Sahada Ne Var?

**Ajan gözlemlenebilirlik platformları** (Langfuse, Braintrust, Confident AI, AgentOps, Arize): adım bazlı değerlendirme (tool seçimi/argümanları, plan tutarlılığı), **trace→dataset döngüsü** (kötü giden üretim izleri otomatik test vakası olur), **istatistiksel maliyet anomali tespiti** ("hangi %5 istek token'ın %50'sini yiyor"), guardrail'lerin iz kaydı (hangi politika neyi engelledi), insan geri bildirimi toplama, oturum replay.

**Claude Code filo araçları** (Fleet kontrol kulesi, Shipyard, claude-flow, Agent Teams): "sana ihtiyacı olanlar üstte" **onay kuyruğu**, tmux/arka plan oturum panoları, **git worktree ile çakışmasız paralel koşular**, subagent ağaçları (5 seviye iç içe), bulutta inceleme filoları (/ultrareview), takım halinde koordineli oturumlar.

**Agentic IDE'ler** (Antigravity, Cursor): **Manager/kanban yüzeyi** (görevler kart olarak sürüklenir), **Artifact sistemi** (plan/walkthrough/ekran görüntüsü gibi tiplendirilmiş çıktılar), doğal dil kurulum.

Agent Farm'ın bu ekosistemdeki benzersiz konumu: **tamamen yerel, dosya tabanlı, telemetrisiz** — bu ilkelerden taviz vermeden aşağıdakiler eklenebilir.

Kaynaklar: [aimultiple/agentic-monitoring](https://aimultiple.com/agentic-monitoring) · [Confident AI karşılaştırma](https://www.confident-ai.com/knowledge-base/compare/best-ai-agent-observability-tools-2026) · [Braintrust buyer's guide](https://www.braintrust.dev/articles/best-ai-observability-tools-2026) · [Fleet kontrol kulesi](https://nicknisi.com/posts/fleet/) · [Shipyard multi-agent](https://shipyard.build/blog/claude-code-multi-agent/) · [CloudZero Claude agents maliyet](https://www.cloudzero.com/blog/claude-code-agents/) · [MLflow agent observability](https://mlflow.org/top-5-agent-observability-tools/)

---

# FAZ G — Komuta Merkezi Olgunluğu

### G1. Onay Kuyruğu — "Needs You" Paneli [M] ⭐⭐⭐
- **Ne:** Tek görünümde, aciliyet sıralı: izin bekleyen oturumlar, onay bekleyen browser adımları, Antigravity çakışmaları, açık talimat önerileri, bütçe aşımı kararları. Her satırda tek tık aksiyon.
- **Neden:** Araştırmadaki en net desen (Fleet): filo büyüyünce dar boğaz sensin — sana gelen her şey tek kuyrukta olmalı.

### G2. Maliyet Anomali Dedektörü [S-M] ⭐⭐⭐
- **Ne:** Bütçeden bağımsız istatistiksel uyarı: ajan/gün maliyetinin hareketli medyanı + MAD sapması; "psikolog bugün normalinin 4.2 katında" + en pahalı 3 oturuma bağlantı. "Token'ın %50'sini yiyen %5 oturum" raporu.
- **Neden:** Sabit bütçe eşiği kör noktalı; anomali tespiti sızıntıyı erken yakalar (Braintrust/CloudZero deseni).

### G3. Eval Seti — Trace→Dataset Döngüsü [M-L] ⭐⭐⭐
- **Ne:** Kalite karnesinde düşük puan alan / FAIL verify'lı çıktılar tek tıkla "eval vakası" olur (girdi+beklenti). `CLAUDE.md` değişince veya istenince eval seti ucuz modelle koşulur → regresyon karnesi ("12/14 vaka geçti, 2 geriledi").
- **Neden:** D1 karnesinin doğal evrimi; talimat değişikliğinin etkisi ölçülebilir olur. G8 ile birleşince altın döngü.

### G4. Oturum Replay [M] ⭐⭐
- **Ne:** Session viewer'a "oynat" modu: mesajlar/araç çağrıları zaman çizelgesinde adım adım, hız kontrolüyle akar; kritik anlara (hata, izin, compaction) atlama.
- **Neden:** "Ne oldu?" sorusunun en hızlı cevabı; observability platformlarının temel özelliği, yerelde kimsede yok.

### G5. Kanban Görev Panosu (Manager Yüzeyi) [M-L] ⭐⭐⭐
- **Ne:** Webview pano: Gelen / Kuyrukta / Çalışıyor / Onay Bekliyor / Bitti kolonları; görev kartları sürükle-bırak; kart üstünde ajan, maliyet, süre; komuta çubuğu (F1) panonun üstünde.
- **Neden:** Antigravity Manager yüzeyinin yereldeki karşılığı; TreeView'ın ölçek sınırını aşar.

### G6. Subagent Ağacı + Maliyet Rollup [S-M] ⭐⭐
- **Ne:** Sidechain oturumları ana oturuma bağlayan ağaç görünümü; ebeveyn karta toplam (kendisi+altları) maliyet; 5 seviyeye kadar.
- **Neden:** Subagent'lar maliyetin görünmez kısmı (CloudZero bulgusu: paralel ajanlar kotayı katlıyor).

# FAZ H — Güvenlik ve Güvenilirlik

### H1. Guardrail Denetçisi (Permission Lint) [M] ⭐⭐⭐
- **Ne:** Ajanların `settings.local.json` izinlerini tarayan kural seti: aşırı geniş allow (`Bash(*)`), tehlikeli kalıplar (rm -rf, curl|sh), izin-kullanım uyumu (hiç kullanılmayan geniş izinler). Insights + tek tık daraltma önerisi.
- **Neden:** Otonom filo büyüdükçe en büyük risk yanlış izin; guardrail izleri 2026'nın standart beklentisi.

### H2. Tetik Güvenilirlik Karnesi [S] ⭐⭐
- **Ne:** Tetik başına: ateşlenme/başarı/başarısızlık sayıları, medyan gecikme, son 7 gün zaman çizgisi; "hiç ateşlenmeyen tetik" ve "hep fail olan zincir" uyarıları.
- **Neden:** Otomasyona güven ölçülebilir olmalı — SLA'nın yerel hali.

### H3. Sentetik Nabız Görevleri (Smoke) [S-M] ⭐⭐
- **Ne:** Gecelik/haftalık mini görev: her ajana sabit ucuz "nabız" promptu → beklenen davranış judge'la kontrol; kırık MCP, bozuk CLAUDE.md, dolan bağlam erken yakalanır.
- **Neden:** Sorunlar iş üstünde değil, nabızda yakalansın.

### H4. Headless Farm Servisi [L] ⭐⭐
- **Ne:** VS Code kapalıyken de tetik/zamanlama işleyen küçük yerel servis (node, Windows service/schtasks); panel açılınca durumu devralır. E1 relay'in yerel yarısı.
- **Neden:** "VS Code açıkken" kısıtı otomasyonun tavanı; kaldırmak fabrikayı gerçek fabrika yapar.

# FAZ I — Zekâ Derinliği

### I1. Talimat Sürümleme + Karne Korelasyonu [M] ⭐⭐⭐
- **Ne:** CLAUDE.md/AGENTS.md her senkron/uygulamada zaman damgalı tarihçeye alınır; kalite karnesi ve maliyet, sürüm sınırlarıyla çizilir: "bu kuraldan sonra kalite +0.6".
- **Neden:** D2 önerilerinin etkisi kanıtlanabilir olur; G3 ile tam döngü.

### I2. A/B Talimat Deneyi [M-L] ⭐
- **Ne:** İki CLAUDE.md varyantı + aynı görev seti → yan yana judge karşılaştırması, kazanan tek tıkla kalıcı.
- **Neden:** Talimat mühendisliğini tahminden ölçüme taşır.

### I3. Hafıza Distilasyonu [M] ⭐⭐
- **Ne:** Büyüyen/bayatlayan memory dosyaları için ucuz modelle "yoğunlaştırma taslağı" (birleştir, sıkıştır, çelişkiyi işaretle) — daima onaylı, .afbak yedekli; hafıza senkron akışına eklenir.
- **Neden:** Bağlam diyeti (S6) elle; yarı-otomatik hali filo ölçeğinde şart.

### I4. Semantik Hafıza Sorgusu [S-M] ⭐⭐
- **Ne:** Mevcut embedding altyapısını (2.1.0) memory/*.md dosyalarına da uygula: "filo bu konuda ne biliyor?" — cevap: ilgili hafıza kayıtları ajan-bazlı.
- **Neden:** Transcript araması geçmişi bulur; bu, bilgiyi bulur. Aynı indeks motoru, düşük maliyet.

### I5. Model Politikası Motoru [M] ⭐⭐
- **Ne:** Kurallı model seçimi: görev türü/uzunluk/tetik kaynağına göre model ("tetikten gelen rutin → haiku; kullanıcı elle → varsayılan"); kota %X üstünde otomatik ucuza düşür + bildir.
- **Neden:** Kota bekçisinin proaktif hali; maliyet disiplini kendiliğinden.

# FAZ J — Ölçek ve Ekosistem

### J1. Paralel Worktree Koşuları [L] ⭐⭐
- **Ne:** Aynı repo'da git worktree açıp ajanları çakışmasız paralel koşturma; bitince diff özeti + birleştirme yardımı.
- **Neden:** 2026 filo araçlarının (Shipyard/Conductor) ana deseni; kod ajanları için ölçek anahtarı.

### J2. Farm Relay — Gerçek Zamanlı Uzak Makine [L] ⭐
- **Ne:** Uzak makinede hafif daemon: hook olaylarını ve transcript özetlerini güvenli kanaldan iletir; E1'in klasör-senkron yaklaşımının canlı hali.

### J3. OpenTelemetry / JSONL Dışa Aktarım [S] ⭐
- **Ne:** Oturum/görev izlerini OTLP-JSON olarak dışa verme — Langfuse/Grafana'ya beslenebilir. Yerellik korunur: kullanıcı nereye göndereceğini seçer.

### J4. Agentpack Galerisi [M] ⭐
- **Ne:** Topluluk agentpack deposu (git repo tabanlı): göz at → içe aktar; E4 yayınıyla birlikte anlam kazanır.

### J5. Çoklu-CLI Yürütücü (eski F5) [L] ⭐
- **Ne:** Görev yürütücüde komut şablonu soyutlaması: gemini CLI / codex CLI görevleri; izleme derinliği Claude'a özgü kalır (beklenti kılavuzda net çizilir). Antigravity senkronu (1.3.0) zemin hazırladı.

### J6. Sesli Brifing (TTS) [S-M] ⭐
- **Ne:** Günlük digest'in fal.ai TTS ile seslendirilip vault'a/telefona mp3 düşmesi; NoteScribe döngüsünün dönüş yarısı.

---

## Öncelik Matrisi

| # | Özellik | Etki | Zorluk | Bağımlılık |
| --- | --- | --- | --- | --- |
| G1 | Onay kuyruğu | ⭐⭐⭐ | M | — |
| G2 | Maliyet anomalisi | ⭐⭐⭐ | S-M | — |
| H1 | Guardrail denetçisi | ⭐⭐⭐ | M | — |
| G5 | Kanban panosu | ⭐⭐⭐ | M-L | G1 |
| I1 | Talimat sürümleme | ⭐⭐⭐ | M | — |
| G3 | Eval seti | ⭐⭐⭐ | M-L | D1, I1 |
| I4 | Semantik hafıza | ⭐⭐ | S-M | 2.1.0 |
| H2 | Tetik karnesi | ⭐⭐ | S | — |
| H3 | Nabız görevleri | ⭐⭐ | S-M | A2 |
| G4 | Oturum replay | ⭐⭐ | M | — |
| G6 | Subagent ağacı | ⭐⭐ | S-M | — |
| I3 | Hafıza distilasyonu | ⭐⭐ | M | — |
| I5 | Model politikası | ⭐⭐ | M | — |
| H4 | Headless servis | ⭐⭐ | L | — |
| J1 | Worktree paralel | ⭐⭐ | L | — |
| I2 / J2-J6 | Kalanlar | ⭐ | M-L | çeşitli |

**Önerilen ilk dalga (2.2):** G1 + G2 + H1 — üçü de bağımsız, üçü de "filo büyüdükçe" acıyan yerlere dokunuyor.

## İlkeler (değişmez)

1. Tamamen yerel, telemetrisiz; ağa yalnızca kullanıcının yapılandırdıkları çıkar.
2. Bağımlılıksız çalışma zamanı — native modül yok, dosya tabanlı depolama.
3. İç model çağrıları daima ucuz model; otomatik döngüler varsayılan kapalı.
4. Onaysız yazma yok; her üzerine yazmada .afbak yedeği.

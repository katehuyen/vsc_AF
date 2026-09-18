# 03. Marketplace Vitrini, Markalama ve Pazarlama Stratejisi

> Harika bir mühendislik ürünü, kötü bir vitrinle satılamaz. VS Code Marketplace'te bir eklentinin kaderini **ilk ekran görüntüsü, 10 kelimelik başlık ve 15 saniyelik demo GIF'i** belirler.

---

## 🎨 1. Marketplace Meta Verileri ve `package.json` Revizyonu

Mevcut durumda `package.json` içindeki eksik alanların tamamlanması gerekir:

```json
{
  "name": "agent-farm",
  "displayName": "Agent Farm — Mission Control for AI Coding Agents",
  "description": "Orchestrate, monitor and automate your local AI coding agents: Claude Code, Codex, Gemini & OpenCode with multi-account rotation, autonomous sentry runs and live console.",
  "version": "3.545.0",
  "publisher": "muvusoft",
  "categories": [
    "AI",
    "Chat",
    "Programming Languages",
    "Productivity"
  ],
  "keywords": [
    "claude-code",
    "ai-agents",
    "codex",
    "gemini-cli",
    "multi-agent",
    "sentry",
    "mission-control",
    "autonomous-coding"
  ],
  "repository": {
    "type": "git",
    "url": "https://github.com/muvusoft/agent-farm"
  },
  "bugs": {
    "url": "https://github.com/muvusoft/agent-farm/issues"
  },
  "homepage": "https://agentfarm.dev"
}
```

---

## 🖼 2. README ve Görsel Vitrin Düzeni

Marketplace sayfasını açan bir geliştiriciyi karşılayacak hiyerarşi:

1. **Hero Banner & Slogan:**
   > *"Don't just talk to one agent. Command an entire fleet."*
   > *(Yalnızca tek bir ajanla konuşma. Bütün bir filoyu yönet.)*
2. **15 Saniyelik Hero GIF / Video:**
   - Konsolda canlı akış,
   - Yan panelde yeşil yanan aktif ajanlar,
   - Anlık maliyet sayacı ve kota dolunca otomatik hesap değiştiren nöbet sistemi.
3. **3 Temel Değer Önerisi (Value Pillars):**
   - 🛡 **%100 Yerel ve Güvenli:** Sıfır sunucu, sıfır veri sızıntısı. Her şey senin diskinde.
   - 🔄 **Otonom Gece Nöbetleri & Kota Kurtarma:** Kotan dolsa bile hesaplar arasında geçiş yaparak işi bitiren zeka.
   - 🚀 **Çok Motorlu Özgürlük:** Claude, Codex, Gemini veya OpenCode — istediğin modeli istediğin ajana bağla.
4. **Rakiplerle Karşılaştırma Tablosu:**
   - Agent Farm vs. Cursor vs. Cline vs. Roo Code.

---

## 🚀 3. Lansman ve Dağıtım Planı

```
[Faz 1: Erken Erişim & Topluluk Doğrulaması (Beta)]
 ├── 20-30 Seçilmiş Geliştiriciye Özel VSIX Dağıtımı
 ├── Geri Bildirim ve Onboarding Sürtünmelerinin Giderilmesi
 └── Gerçek Kullanıcı Yorumları ve Testimonial Toplama

[Faz 2: Açık Lansman (Public Launch)]
 ├── VS Code Marketplace'te Yayınlama
 ├── Product Hunt Lansman Kampanyası
 ├── Hacker News ("Show HN: Agent Farm — Local AI Agent Fleet Orchestrator")
 └── Reddit (r/ClaudeAI, r/LocalLLaMA, r/vscode) Detaylı Teknik Yazılar

[Faz 3: Büyüme & İçerik Motoru]
 ├── 30 Saniyelik "Nasıl Yapılır?" YouTube Shorts / X Videoları
 ├── Topluluk Tarafından Üretilen Ajan Şablonları (Community Agent Packs)
 └── Teknik Blog Yazıları (Örn: "How we automated multi-account rotation for Claude Code")
```

---

## 📋 Uygulama Görevleri (Checklist)

- [ ] `package.json` meta verilerini (kategoriler, anahtar kelimeler, URL'ler) güncelle.
- [ ] 3 adet yüksek kaliteli ekran görüntüsü ve 1 adet optimize edilmiş demo GIF hazırla (`docs/media/`).
- [ ] Marketplace README'sini pazarlama odaklı, temiz ve görsel destekli olarak yeniden yaz.
- [ ] `agentfarm.dev` veya basit bir dokümantasyon/indirme landing page'i hazırla.

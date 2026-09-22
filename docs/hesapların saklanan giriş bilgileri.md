# hesapların saklanan giriş bilgileri hangi dosyaları tam olarak tutuluyor

- Session: `3ad28ebd-7289-4c37-b8c3-6cfbc5be4d85`
- Folder: `D:\zone\agent\ajanlar\developer`
- Span: Sep 18, 2026, 07:06 PM (12:06 UTC) → Sep 18, 2026, 07:09 PM (12:09 UTC)
- Total: 1.7M (⚖ 392.0k) tok · $0.000 · 1 turns · 32 tool calls
- Export: current view · show: user, assistant · 2 of 62 messages

---

## Turn 1/1 — hesapların saklanan giriş bilgileri hangi dosyaları tam olarak tutuluyor · gemini-3.7-flash · high · 1.7M tok · $0.000

**USER** (07:06 PM (12:06 UTC))

hesapların saklanan giriş bilgileri hangi dosyaları tam olarak tutuluyor

**GEMINI** (▸ reply · 07:09 PM (12:09 UTC) · gemini-3.7-flash)

Agent Farm sisteminde ve yerel ortamda motorların (Claude, Codex, Gemini vb.) hesap giriş ve kimlik bilgileri iki seviyede tutulur:

---

### 1. Agent Farm İzole Hesap Yuvaları (Multi-Account Slots)

Agent Farm çoklu hesapları izole edebilmek için her hesabı ayrı bir profil dizini (`slot`) altında saklar.

* **Ana Depolama Dizini:**  
  [`%APPDATA%/Code/User/globalStorage/muvusoft.agent-farm/accounts/`](file:///C:/Users/rotam/AppData/Roaming/Code/User/globalStorage/muvusoft.agent-farm/accounts)
  * Örnek yuvalar: `claude-aicozums`, `claude-kateanhkim`, `claude-murvietnam`, `claude-wmmuratvural`, `codex-murposta`
* **Hesap Listesi & Metadata:**  
  VS Code Global Ayarları (`settings.json`) içindeki `agentFarm.accounts` anahtarında tutulur.

---

### 2. Motor Bazında Kimlik ve Giriş Dosyaları

#### A. Claude Code
* **OAuth & Token Bilgileri (`.credentials.json`):**  
  OAuth access token, refresh token, token geçerlilik süreleri (`refreshTokenExpiresAt`) ve abonelik türünü (`subscriptionType: "pro"` vb.) tutar.
  * **İzole Yuvalarda:** `.../accounts/<slot-id>/.credentials.json`
  * **Varsayılan / Makine Genel:** [`C:/Users/rotam/.claude/.credentials.json`](file:///C:/Users/rotam/.claude/.credentials.json)
* **Hesap & Profil Kimliği (`.claude.json`):**  
  Giriş yapılan e-posta adresi (`oauthAccount.emailAddress`), kullanıcı ID (`accountUuid`, `userID`), onaylanan MCP sunucuları ve proje izinlerini tutar.
  * **İzole Yuvalarda:** `.../accounts/<slot-id>/.claude.json`
  * **Varsayılan / Makine Genel:** [`C:/Users/rotam/.claude.json`](file:///C:/Users/rotam/.claude.json)

---

#### B. Codex (ChatGPT / OpenAI)
* **Yetkilendirme Dosyası (`auth.json`):**  
  ChatGPT OAuth oturum token'ları (`access_token`), giriş modu (`auth_mode: "chatgpt"`) veya doğrudan girilen `OPENAI_API_KEY` bilgisini tutar.
  * **İzole Yuvalarda:** `.../accounts/<slot-id>/auth.json`
  * **Varsayılan / Makine Genel:** [`C:/Users/rotam/.codex/auth.json`](file:///C:/Users/rotam/.codex/auth.json)

---

#### C. Gemini CLI
* **Google OAuth Dosyaları (`oauth_creds.json` & `google_accounts.json`):**  
  Google hesabının yenileme anahtarını (`refresh_token`) ve hesap bilgilerini tutar.
  * **Konum:** [`C:/Users/rotam/.gemini/oauth_creds.json`](file:///C:/Users/rotam/.gemini/oauth_creds.json)

---

#### D. OpenCode
* **Sağlayıcı Kimlikleri (`auth.json`):**  
  Bağlanan sağlayıcıların (Anthropic, OpenAI, Groq vb.) API anahtarlarını barındırır.
  * **Konum:** [`C:/Users/rotam/.local/share/opencode/auth.json`](file:///C:/Users/rotam/.local/share/opencode/auth.json)

---

#### E. Antigravity CLI
* Uygulama oturumu tabanlıdır, ayrı bir izole dosya token'ı tutulmaz; genel veriler [`C:/Users/rotam/.gemini/antigravity-cli`](file:///C:/Users/rotam/.gemini/antigravity-cli) altındadır.


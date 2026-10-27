// src/setup/ui.ts

export function renderConnectProviderHtml(csrfToken: string, token: string, provider: string, isValid: boolean): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OpenAssistant AI — Secure Credential Setup</title>
  <style>
    :root {
      --bg-base: #0f172a;
      --bg-surface: #1e293b;
      --bg-surface-elevated: #334155;
      --border-color: #334155;
      --border-focus: #0ea5e9;
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --accent: #0ea5e9;
      --accent-hover: #0284c7;
      --success: #10b981;
      --error: #ef4444;
      --radius: 6px;
      --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg-base);
      color: var(--text-main);
      font-family: var(--font);
      font-size: 14px;
      line-height: 1.5;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .card {
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: var(--radius);
      max-width: 480px;
      width: 100%;
      padding: 28px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
    }
    .badge {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 500;
      margin-bottom: 12px;
    }
    .badge-provider { background: #0284c722; color: var(--accent); border: 1px solid #0ea5e944; }
    .badge-error { background: #ef444422; color: var(--error); border: 1px solid #ef444444; }
    .badge-success { background: #10b98122; color: var(--success); border: 1px solid #10b98144; }
    h1 { font-size: 18px; font-weight: 600; margin-bottom: 8px; }
    p { color: var(--text-muted); font-size: 13px; margin-bottom: 20px; }
    .form-group { margin-bottom: 16px; }
    label { display: block; font-size: 13px; font-weight: 500; margin-bottom: 6px; }
    input {
      width: 100%;
      background: #0b1120;
      border: 1px solid var(--border-color);
      color: var(--text-main);
      padding: 10px 12px;
      border-radius: var(--radius);
      font-family: var(--font-mono);
      font-size: 13px;
    }
    input:focus { outline: none; border-color: var(--border-focus); }
    .hint { font-size: 11px; color: var(--text-muted); margin-top: 4px; display: block; }
    .btn {
      width: 100%;
      background: var(--accent);
      color: #fff;
      border: none;
      padding: 10px 16px;
      border-radius: var(--radius);
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      margin-top: 8px;
    }
    .btn:hover { background: var(--accent-hover); }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    #status { margin-top: 14px; font-size: 13px; display: none; }
  </style>
</head>
<body>
  <div class="card">
    <span class="badge badge-provider">${provider.toUpperCase()} CREDENTIAL SETUP</span>
    <h1>Connect AI Provider</h1>
    <p>Enter your secret API key below. Keys are encrypted with AES-256-GCM and never echoed in chat messages or logs.</p>

    ${!isValid ? `
      <div class="badge badge-error" style="display: block; text-align: center; padding: 12px; margin-bottom: 16px;">
        ⚠️ This setup session is invalid or has already expired. Please request a new setup link from Telegram using <code>/connect ${provider}</code>.
      </div>
    ` : `
      <form id="connect-form" onsubmit="submitKey(event)">
        <input type="hidden" id="token" value="${token}">
        <div class="form-group">
          <label for="api-key">${provider.toUpperCase()} API Key *</label>
          <input type="password" id="api-key" placeholder="sk-..." required autocomplete="off">
          <span class="hint">Your key will be securely tested against ${provider} before storage.</span>
        </div>

        ${provider === 'openai' || provider === 'xai' || provider === 'openrouter' ? `
        <div class="form-group">
          <label for="base-url">API Base URL (Optional)</label>
          <input type="text" id="base-url" placeholder="https://api.../v1">
          <span class="hint">Leave blank to use default official endpoint.</span>
        </div>
        ` : ''}

        <button type="submit" class="btn" id="submit-btn">Verify & Connect Provider</button>
      </form>
    `}

    <div id="status"></div>
  </div>

  <script>
    async function submitKey(e) {
      e.preventDefault();
      const btn = document.getElementById('submit-btn');
      const statusDiv = document.getElementById('status');
      const apiKey = document.getElementById('api-key').value.trim();
      const baseUrl = document.getElementById('base-url')?.value.trim() || undefined;
      const token = document.getElementById('token').value;

      if (!apiKey) return;

      btn.disabled = true;
      btn.innerText = 'Validating & Encrypting...';
      statusDiv.style.display = 'block';
      statusDiv.innerHTML = '<span style="color: var(--text-muted);">Testing connection with ${provider}...</span>';

      try {
        const res = await fetch('/api/connect-provider', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': "${csrfToken}"
          },
          body: JSON.stringify({ token, apiKey, baseUrl })
        });
        const data = await res.json();

        if (res.ok && data.success) {
          statusDiv.innerHTML = '<div class="badge badge-success" style="display:block; padding:10px; text-align:center;">' +
            '✅ Connected successfully!<br>Masked Key: <code>' + data.maskedKey + '</code><br><br>' +
            'You can now close this tab and return to Telegram. OpenAssistant AI will route requests using this provider.</div>';
          document.getElementById('connect-form').style.display = 'none';
        } else {
          statusDiv.innerHTML = '<div class="badge badge-error" style="display:block; padding:10px;">' +
            '❌ ' + (data.error || 'Failed to connect provider') + '</div>';
          btn.disabled = false;
          btn.innerText = 'Verify & Connect Provider';
        }
      } catch (err) {
        statusDiv.innerHTML = '<div class="badge badge-error" style="display:block; padding:10px;">' +
          '❌ Network error connecting to setup server.</div>';
        btn.disabled = false;
        btn.innerText = 'Verify & Connect Provider';
      }
    }
  </script>
</body>
</html>`;
}

export function renderDashboardHtml(csrfToken: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OpenAssistant AI — Setup & Deployment Wizard</title>
  <style>
    :root {
      --bg-base: #0f172a;
      --bg-surface: #1e293b;
      --bg-surface-elevated: #334155;
      --border-color: #334155;
      --border-focus: #0ea5e9;
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --accent: #0ea5e9;
      --accent-hover: #0284c7;
      --success: #10b981;
      --warning: #f59e0b;
      --error: #ef4444;
      --radius: 6px;
      --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: var(--bg-base);
      color: var(--text-main);
      font-family: var(--font);
      font-size: 14px;
      line-height: 1.5;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }

    /* Header */
    header {
      background: var(--bg-surface);
      border-bottom: 1px solid var(--border-color);
      padding: 16px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .brand-title {
      font-size: 16px;
      font-weight: 600;
      letter-spacing: -0.01em;
    }

    .brand-tag {
      font-size: 11px;
      background: #0284c722;
      color: var(--accent);
      border: 1px solid #0ea5e944;
      padding: 2px 8px;
      border-radius: 9999px;
      font-weight: 500;
    }

    /* Container */
    .container {
      max-width: 1080px;
      width: 100%;
      margin: 24px auto;
      padding: 0 16px;
      display: grid;
      grid-template-columns: 240px 1fr;
      gap: 24px;
      flex: 1;
    }

    @media (max-width: 768px) {
      .container {
        grid-template-columns: 1fr;
      }
    }

    /* Sidebar Navigation */
    .sidebar {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .nav-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-radius: var(--radius);
      color: var(--text-muted);
      cursor: pointer;
      font-weight: 500;
      transition: all 0.15s ease;
      background: transparent;
      border: 1px solid transparent;
      text-align: left;
    }

    .nav-item:hover {
      background: var(--bg-surface);
      color: var(--text-main);
    }

    .nav-item.active {
      background: var(--bg-surface);
      color: var(--text-main);
      border-color: var(--border-color);
    }

    .step-number {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: var(--bg-surface-elevated);
      color: var(--text-muted);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 600;
    }

    .nav-item.active .step-number {
      background: var(--accent);
      color: #fff;
    }

    /* Card Panels */
    .content-card {
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: var(--radius);
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .card-header h2 {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 4px;
    }

    .card-header p {
      color: var(--text-muted);
      font-size: 13px;
    }

    /* Forms */
    .form-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    label {
      font-size: 13px;
      font-weight: 500;
      color: var(--text-main);
    }

    input, select, textarea {
      background: #0b1120;
      border: 1px solid var(--border-color);
      color: var(--text-main);
      padding: 9px 12px;
      border-radius: var(--radius);
      font-family: inherit;
      font-size: 13px;
      transition: border-color 0.15s ease;
    }

    input:focus, select:focus, textarea:focus {
      outline: none;
      border-color: var(--border-focus);
    }

    .hint {
      font-size: 11px;
      color: var(--text-muted);
    }

    /* Buttons */
    .btn {
      padding: 8px 16px;
      border-radius: var(--radius);
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: all 0.15s ease;
      border: 1px solid transparent;
    }

    .btn-primary {
      background: var(--accent);
      color: #fff;
    }

    .btn-primary:hover {
      background: var(--accent-hover);
    }

    .btn-secondary {
      background: var(--bg-surface-elevated);
      color: var(--text-main);
      border-color: var(--border-color);
    }

    .btn-secondary:hover {
      background: #475569;
    }

    .btn-danger {
      background: #ef444422;
      color: var(--error);
      border-color: #ef444444;
    }

    .btn-danger:hover {
      background: #ef444444;
    }

    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* Badges */
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 2px 8px;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 500;
    }

    .badge-success { background: #10b98122; color: var(--success); border: 1px solid #10b98144; }
    .badge-error { background: #ef444422; color: var(--error); border: 1px solid #ef444444; }
    .badge-warning { background: #f59e0b22; color: var(--warning); border: 1px solid #f59e0b44; }
    .badge-neutral { background: #64748b22; color: var(--text-muted); border: 1px solid #64748b44; }

    /* Tables */
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }

    th {
      text-align: left;
      padding: 8px 12px;
      border-bottom: 1px solid var(--border-color);
      color: var(--text-muted);
      font-weight: 500;
    }

    td {
      padding: 10px 12px;
      border-bottom: 1px solid #1e293b;
    }

    /* Execution Log Terminal */
    .terminal-box {
      background: #020617;
      border: 1px solid var(--border-color);
      border-radius: var(--radius);
      padding: 12px;
      font-family: var(--font-mono);
      font-size: 12px;
      height: 220px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .terminal-line {
      white-space: pre-wrap;
      word-break: break-all;
    }

    /* Memory Explorer Styles */
    .graph-container {
      background: #020617;
      border: 1px solid var(--border-color);
      border-radius: var(--radius);
      position: relative;
      height: 380px;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .graph-svg {
      width: 100%;
      height: 100%;
    }

    .graph-node {
      cursor: pointer;
      transition: transform 0.15s ease;
    }

    .graph-node:hover circle {
      stroke: var(--accent);
      stroke-width: 2.5px;
    }

    .graph-node.active circle {
      stroke: #fff;
      stroke-width: 3px;
    }

    .detail-drawer {
      background: var(--bg-surface-elevated);
      border: 1px solid var(--border-color);
      border-radius: var(--radius);
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .filter-pills {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }

    .filter-pill {
      background: var(--bg-surface-elevated);
      border: 1px solid var(--border-color);
      color: var(--text-muted);
      padding: 4px 10px;
      border-radius: 9999px;
      font-size: 12px;
      cursor: pointer;
    }

    .filter-pill.active {
      background: var(--accent);
      color: #fff;
      border-color: var(--accent);
    }
  </style>
</head>
<body>
  <!-- Header -->
  <header>
    <div class="brand">
      <span style="font-size: 20px;">⚡</span>
      <span class="brand-title">Open Assistant AI</span>
      <span class="brand-tag">v0.1.0 • Multi-Provider</span>
    </div>
    <div style="font-size: 12px; color: var(--text-muted);">
      Automated Setup & AI Control Panel
    </div>
  </header>

  <!-- Container -->
  <div class="container">
    <!-- Sidebar Navigation -->
    <nav class="sidebar">
      <button class="nav-item active" onclick="switchTab(0)">
        <span class="step-number">1</span> Prerequisites
      </button>
      <button class="nav-item" onclick="switchTab(1)">
        <span class="step-number">2</span> Supabase
      </button>
      <button class="nav-item" onclick="switchTab(2)">
        <span class="step-number">3</span> Telegram Bot
      </button>
      <button class="nav-item" onclick="switchTab(3)">
        <span class="step-number">4</span> Google Gemini
      </button>
      <button class="nav-item" onclick="switchTab(4)">
        <span class="step-number">5</span> Review & Deploy
      </button>
      <button class="nav-item" onclick="switchTab(5)">
        <span class="step-number">6</span> Status Dashboard
      </button>
      <button class="nav-item" onclick="switchTab(6)">
        <span class="step-number">7</span> AI Provider Hub
      </button>
      <button class="nav-item" onclick="switchTab(7)">
        <span class="step-number">8</span> Memory Explorer
      </button>
    </nav>

    <!-- Main Step Panels -->
    <main>
      <!-- Step 0: Prerequisites -->
      <section id="panel-0" class="content-card">
        <div class="card-header">
          <h2>Local Prerequisites</h2>
          <p>Verify that your system has the required development tooling installed.</p>
        </div>

        <table>
          <thead>
            <tr>
              <th>Tool</th>
              <th>Status</th>
              <th>Version / Path</th>
            </tr>
          </thead>
          <tbody id="prereqs-table">
            <tr><td colspan="3">Detecting installed tools...</td></tr>
          </tbody>
        </table>

        <div id="prereqs-alert" style="display: none;" class="badge badge-error"></div>

        <div style="display: flex; justify-content: flex-end; gap: 8px;">
          <button class="btn btn-secondary" onclick="checkPrereqs()">Re-check Tools</button>
          <button class="btn btn-primary" onclick="switchTab(1)">Continue to Supabase</button>
        </div>
      </section>

      <!-- Step 1: Supabase -->
      <section id="panel-1" class="content-card" style="display: none;">
        <div class="card-header">
          <h2>Connect Supabase</h2>
          <p>Specify the target Supabase project where your database and edge functions will run.</p>
        </div>

        <div class="form-group">
          <label for="sb-ref">Supabase Project Reference *</label>
          <input type="text" id="sb-ref" placeholder="e.g. abcdefghijklmnopqrst">
          <span class="hint">The 20-character reference code from your Supabase dashboard URL.</span>
        </div>

        <div class="form-group">
          <label for="sb-token">Supabase Access Token *</label>
          <input type="password" id="sb-token" placeholder="sbp_xxxxxxxxxxxxxxxxxxxx">
          <span class="hint">Required for CLI deployment. Generate an access token at <a href="https://supabase.com/dashboard/account/tokens" target="_blank" style="color: var(--accent);">Supabase Dashboard &gt; Access Tokens</a>.</span>
        </div>

        <div class="form-group">
          <label for="sb-pass">Database Password (Optional)</label>
          <input type="password" id="sb-pass" placeholder="••••••••••••">
          <span class="hint">Only required if your local Supabase CLI demands db push authentication.</span>
        </div>

        <div id="sb-status" style="margin-top: 8px;"></div>

        <div style="display: flex; justify-content: space-between; margin-top: 16px;">
          <button class="btn btn-secondary" onclick="switchTab(0)">Back</button>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-secondary" onclick="validateSupabase()">Test Connection</button>
            <button class="btn btn-primary" onclick="switchTab(2)">Continue to Telegram</button>
          </div>
        </div>
      </section>

      <!-- Step 2: Telegram Bot -->
      <section id="panel-2" class="content-card" style="display: none;">
        <div class="card-header">
          <h2>Connect Telegram Bot</h2>
          <p>Provide your Telegram bot token from @BotFather and authorized user IDs.</p>
        </div>

        <div class="form-group">
          <label for="tg-token">Telegram Bot Token *</label>
          <input type="password" id="tg-token" placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ">
          <span class="hint">Create a bot using <a href="https://t.me/BotFather" target="_blank" style="color: var(--accent);">@BotFather</a> on Telegram.</span>
        </div>

        <div class="form-group">
          <label for="tg-user">Authorized Telegram User ID(s) *</label>
          <input type="text" id="tg-user" placeholder="e.g. 123456789">
          <span class="hint">Comma-separated Telegram user IDs allowed to interact with the bot. Send a message to @userinfobot to find your ID.</span>
        </div>

        <div class="form-group">
          <label for="tg-secret">Webhook Secret Token (Optional)</label>
          <input type="text" id="tg-secret" placeholder="Auto-generated if empty">
          <span class="hint">Secret header string used to authenticate Telegram webhook payloads.</span>
        </div>

        <div id="tg-status" style="margin-top: 8px;"></div>

        <div style="display: flex; justify-content: space-between; margin-top: 16px;">
          <button class="btn btn-secondary" onclick="switchTab(1)">Back</button>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-secondary" onclick="validateTelegram()">Test Bot Token</button>
            <button class="btn btn-primary" onclick="switchTab(3)">Continue to Gemini</button>
          </div>
        </div>
      </section>

      <!-- Step 3: Google Gemini -->
      <section id="panel-3" class="content-card" style="display: none;">
        <div class="card-header">
          <h2>Google Gemini AI API Key</h2>
          <p>Provide your Google AI Studio API key used by OpenAssistant AI for natural language parsing.</p>
        </div>

        <div class="form-group">
          <label for="gemini-key">Gemini API Key *</label>
          <input type="password" id="gemini-key" placeholder="AIzaSy...">
          <span class="hint">Get an API key at <a href="https://aistudio.google.com/app/apikey" target="_blank" style="color: var(--accent);">Google AI Studio</a>.</span>
        </div>

        <div class="form-group">
          <label for="gemini-model">Gemini Model</label>
          <div style="display: flex; gap: 8px;">
            <select id="gemini-model" style="flex: 1;">
              <option value="gemini-3.8-flash">gemini-3.8-flash (Recommended)</option>
              <option value="gemini-3.5-flash-lite">gemini-3.5-flash-lite (Ultra Fast)</option>
              <option value="gemini-3.8-pro">gemini-3.8-pro (Deep Reasoning)</option>
            </select>
            <button type="button" class="btn btn-secondary" onclick="detectGeminiModels()">Auto-Detect Models</button>
          </div>
          <span class="hint">Google Gemini flash models provide sub-second task extraction.</span>
        </div>

        <div class="form-group">
          <label for="user-tz">Default Timezone</label>
          <input type="text" id="user-tz" value="Asia/Kolkata">
          <span class="hint">IANA timezone (e.g. Asia/Kolkata, America/New_York, Europe/London).</span>
        </div>

        <div id="gemini-status" style="margin-top: 8px;"></div>

        <div style="display: flex; justify-content: space-between; margin-top: 16px;">
          <button class="btn btn-secondary" onclick="switchTab(2)">Back</button>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-secondary" onclick="validateGemini()">Test Gemini API</button>
            <button class="btn btn-primary" onclick="switchTab(4)">Review Deployment Plan</button>
          </div>
        </div>
      </section>

      <!-- Step 4: Review & Deploy -->
      <section id="panel-4" class="content-card" style="display: none;">
        <div class="card-header">
          <h2>Deployment Plan</h2>
          <p>Review the automated deployment steps that will be executed.</p>
        </div>

        <div style="display: flex; flex-direction: column; gap: 8px;">
          <div class="deploy-step-row"><span>1. Verify prerequisites & credentials</span><span class="badge badge-neutral">Plan</span></div>
          <div class="deploy-step-row"><span>2. Link Supabase project (<span class="plan-sb-ref">Pending</span>)</span><span class="badge badge-neutral">Plan</span></div>
          <div class="deploy-step-row"><span>3. Push database schema migrations</span><span class="badge badge-neutral">Plan</span></div>
          <div class="deploy-step-row"><span>4. Set Supabase Edge Function secrets</span><span class="badge badge-neutral">Plan</span></div>
          <div class="deploy-step-row"><span>5. Deploy telegram-webhook function</span><span class="badge badge-neutral">Plan</span></div>
          <div class="deploy-step-row"><span>6. Deploy process-reminders function</span><span class="badge badge-neutral">Plan</span></div>
          <div class="deploy-step-row"><span>7. Schedule pg_cron worker (* * * * *)</span><span class="badge badge-neutral">Plan</span></div>
          <div class="deploy-step-row"><span>8. Register Telegram webhook with secret token</span><span class="badge badge-neutral">Plan</span></div>
          <div class="deploy-step-row"><span>9. Run health checks & verification</span><span class="badge badge-neutral">Plan</span></div>
        </div>

        <div style="display: flex; justify-content: space-between; margin-top: 16px;">
          <button class="btn btn-secondary" onclick="switchTab(3)">Back</button>
          <button class="btn btn-primary" id="btn-deploy" onclick="startDeployment()">Deploy OpenAssistant AI Now</button>
        </div>
      </section>

      <!-- Step 5: Live Execution Dashboard -->
      <section id="panel-5" class="content-card" style="display: none;">
        <div class="card-header">
          <h2>Deployment Status & Logs</h2>
          <p>Real-time execution log and health monitoring.</p>
        </div>

        <div id="deploy-steps-container" style="display: flex; flex-direction: column; gap: 8px;"></div>

        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 14px; margin-bottom: 6px;">
          <h3 style="font-size: 13px; font-weight: 600; margin: 0;">Live Execution Output</h3>
          <button class="btn btn-secondary" style="padding: 4px 10px; font-size: 12px;" onclick="copyLogs()">Copy Logs</button>
        </div>
        <div class="terminal-box" id="terminal-output">
          <div class="terminal-line">[System] Ready to start deployment...</div>
        </div>

        <div id="deployment-summary" style="display: none; background: #020617; border: 1px solid var(--border-color); border-radius: var(--radius); padding: 16px;">
          <h3 style="color: var(--success); font-size: 14px; margin-bottom: 8px;">🎉 Deployment Succeeded!</h3>
          <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 12px;">Your OpenAssistant AI bot is now live and registered with Telegram.</p>
          <button class="btn btn-secondary" onclick="copySummary()">Copy Deployment Summary</button>
        </div>
      </section>

      <!-- Step 6: AI Provider Hub -->
      <section id="panel-6" class="content-card" style="display: none;">
        <div class="card-header">
          <h2>AI Provider Hub & Smart Routing</h2>
          <p>Connect and configure personal AI providers (OpenAI, Gemini, Anthropic, xAI, OpenRouter).</p>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px;">
          <!-- Routing Settings Card -->
          <div style="background: var(--bg-surface-elevated); border: 1px solid var(--border-color); border-radius: var(--radius); padding: 16px;">
            <h3 style="font-size: 14px; font-weight: 600; margin-bottom: 12px;">Task-Aware Routing</h3>
            <div class="form-group" style="margin-bottom: 12px;">
              <label for="route-mode">Routing Policy</label>
              <select id="route-mode">
                <option value="best_available">Best Available (Auto Capability & Latency)</option>
                <option value="quick_answer">Quick Answer (Low Latency Flash)</option>
                <option value="deep_reasoning">Deep Reasoning (Pro / Reasoning)</option>
                <option value="coding">Coding Mode (Technical & Debugging)</option>
                <option value="budget">Budget Mode (Free / Low Cost)</option>
                <option value="manual">Manual Selection</option>
              </select>
            </div>
            <div class="form-group">
              <label for="route-default-model">Default Model</label>
              <select id="route-default-model">
                <option value="gemini-3.8-flash">Google Gemini 3.8 Flash</option>
                <option value="gpt-4o-mini">OpenAI GPT-4o Mini</option>
                <option value="claude-3-5-haiku-latest">Anthropic Claude 3.5 Haiku</option>
                <option value="grok-2-mini">xAI Grok 2 Mini</option>
                <option value="meta-llama/llama-3.3-70b-instruct:free">OpenRouter Llama 3.3 70B</option>
              </select>
            </div>
          </div>

          <!-- Connect New Key Card -->
          <div style="background: var(--bg-surface-elevated); border: 1px solid var(--border-color); border-radius: var(--radius); padding: 16px;">
            <h3 style="font-size: 14px; font-weight: 600; margin-bottom: 12px;">Connect Provider Key</h3>
            <div class="form-group" style="margin-bottom: 10px;">
              <label for="hub-provider">Provider</label>
              <select id="hub-provider">
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic Claude</option>
                <option value="xai">xAI (Grok)</option>
                <option value="openrouter">OpenRouter</option>
                <option value="gemini">Google Gemini</option>
              </select>
            </div>
            <div class="form-group" style="margin-bottom: 10px;">
              <label for="hub-key">API Key</label>
              <input type="password" id="hub-key" placeholder="Enter provider API key">
            </div>
            <button class="btn btn-secondary" style="width: 100%;" onclick="testHubProvider()">Test & Connect Key</button>
            <div id="hub-key-status" style="margin-top: 8px; font-size: 12px;"></div>
          </div>
        </div>

        <!-- Model Catalog Table -->
        <div>
          <h3 style="font-size: 14px; font-weight: 600; margin-bottom: 8px;">Available Model Catalog</h3>
          <table>
            <thead>
              <tr>
                <th>Model</th>
                <th>Provider</th>
                <th>Capabilities</th>
                <th>Cost Tier</th>
              </tr>
            </thead>
            <tbody id="catalog-table-body">
              <tr>
                <td><strong>Gemini 3.8 Flash</strong></td>
                <td><span class="badge badge-neutral">gemini</span></td>
                <td>Quick Answer, Coding, Tools, Structured Output</td>
                <td><span class="badge badge-success">low</span></td>
              </tr>
              <tr>
                <td><strong>GPT-4o Mini</strong></td>
                <td><span class="badge badge-neutral">openai</span></td>
                <td>Quick Answer, Coding, Tools, Structured Output</td>
                <td><span class="badge badge-success">low</span></td>
              </tr>
              <tr>
                <td><strong>Claude 3.5 Haiku</strong></td>
                <td><span class="badge badge-neutral">anthropic</span></td>
                <td>Quick Answer, Coding, Tools</td>
                <td><span class="badge badge-success">low</span></td>
              </tr>
              <tr>
                <td><strong>Grok 2 Mini</strong></td>
                <td><span class="badge badge-neutral">xai</span></td>
                <td>Quick Answer, Budget</td>
                <td><span class="badge badge-success">low</span></td>
              </tr>
              <tr>
                <td><strong>Llama 3.3 70B</strong></td>
                <td><span class="badge badge-neutral">openrouter</span></td>
                <td>Quick Answer, Budget, Coding</td>
                <td><span class="badge badge-success">free</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Step 7: Graphical Memory Explorer -->
      <section id="panel-7" class="content-card" style="display: none;">
        <div class="card-header">
          <h2>Personal Graph Memory Explorer</h2>
          <p>Explore long-term memories, preferences, and entity relationships across conversations.</p>
        </div>

        <!-- Filter and View Controls -->
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap;">
          <div class="filter-pills" id="memory-category-filters">
            <button class="filter-pill active" onclick="filterMemories('all')">All</button>
            <button class="filter-pill" onclick="filterMemories('preference')">Preferences</button>
            <button class="filter-pill" onclick="filterMemories('project')">Projects</button>
            <button class="filter-pill" onclick="filterMemories('goal')">Goals</button>
            <button class="filter-pill" onclick="filterMemories('fact')">Facts</button>
          </div>
          <div style="display: flex; gap: 8px;">
            <input type="text" id="memory-search" placeholder="Search memories..." style="width: 200px; padding: 6px 10px;" oninput="searchMemoryNodes()">
            <button class="btn btn-secondary" onclick="toggleMemoryView()">Toggle Table View</button>
          </div>
        </div>

        <!-- Interactive SVG Memory Graph -->
        <div id="memory-graph-view" class="graph-container">
          <svg id="memory-svg" class="graph-svg" viewBox="0 0 700 380">
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="20" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b"></path>
              </marker>
            </defs>
            <g id="svg-edges"></g>
            <g id="svg-nodes"></g>
          </svg>
        </div>

        <!-- Accessible Table View Alternative -->
        <div id="memory-table-view" style="display: none;">
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Key / Label</th>
                <th>Memory Content</th>
                <th>Confidence</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="memory-table-body">
              <tr><td colspan="5" style="color: var(--text-muted);">No memories stored yet.</td></tr>
            </tbody>
          </table>
        </div>

        <!-- Node Details Drawer -->
        <div id="memory-detail-drawer" class="detail-drawer" style="display: none;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span id="detail-category-badge" class="badge badge-neutral">fact</span>
            <span id="detail-confidence" style="font-size: 11px; color: var(--text-muted);">Confidence: 1.0</span>
          </div>
          <h4 id="detail-key" style="font-size: 14px; font-weight: 600;">Memory Detail</h4>
          <p id="detail-content" style="font-size: 13px; color: var(--text-main); margin: 0;"></p>
          <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px;">
            <button class="btn btn-danger" style="padding: 4px 10px; font-size: 12px;" onclick="deleteSelectedMemory()">Delete Memory</button>
            <button class="btn btn-secondary" style="padding: 4px 10px; font-size: 12px;" onclick="closeMemoryDetail()">Close</button>
          </div>
        </div>

        <!-- Add Memory & Supermemory Integration Grid -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
          <!-- Add Memory Box -->
          <div style="background: var(--bg-surface-elevated); border: 1px solid var(--border-color); border-radius: var(--radius); padding: 16px;">
            <h3 style="font-size: 13px; font-weight: 600; margin-bottom: 8px;">Add Personal Memory</h3>
            <div class="form-group" style="margin-bottom: 8px;">
              <label for="new-mem-content">Content *</label>
              <input type="text" id="new-mem-content" placeholder="e.g. My primary project is OpenAssistant AI">
            </div>
            <div class="form-group" style="margin-bottom: 8px;">
              <label for="new-mem-category">Category</label>
              <select id="new-mem-category">
                <option value="fact">Fact</option>
                <option value="project">Project</option>
                <option value="preference">Preference</option>
                <option value="goal">Goal</option>
                <option value="relationship">Relationship</option>
              </select>
            </div>
            <button class="btn btn-secondary" style="width: 100%;" onclick="saveNewMemory()">Save Memory</button>
          </div>

          <!-- Supermemory Integration Card -->
          <div style="background: var(--bg-surface-elevated); border: 1px solid var(--border-color); border-radius: var(--radius); padding: 16px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <h3 style="font-size: 13px; font-weight: 600;">Optional Supermemory Sync</h3>
              <span class="badge badge-neutral" id="supermemory-status-badge">Disconnected</span>
            </div>
            <p style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px;">
              External cloud memory sync with per-user container tag isolation.
            </p>
            <div class="form-group" style="margin-bottom: 8px;">
              <label for="sm-api-key">Supermemory API Key</label>
              <input type="password" id="sm-api-key" placeholder="sm-...">
            </div>
            <button class="btn btn-secondary" style="width: 100%;" onclick="testSupermemoryKey()">Test & Enable Sync</button>
          </div>
        </div>
      </section>
    </main>
  </div>

  <script>
    const CSRF_TOKEN = "${csrfToken}";
    const STORAGE_KEY = 'jana_ai_setup_form_v1';
    let currentTab = 0;
    let cachedMemories = [];
    let selectedMemoryId = null;

    function switchTab(index) {
      saveFormData();
      currentTab = index;
      document.querySelectorAll('.nav-item').forEach((item, i) => {
        item.classList.toggle('active', i === index);
      });
      document.querySelectorAll('main > section').forEach((panel, i) => {
        panel.style.display = (i === index) ? 'flex' : 'none';
      });

      if (index === 7) {
        loadMemoryGraph();
      }
    }

    // Memory Graph Rendering
    async function loadMemoryGraph() {
      try {
        const res = await fetch('/api/memory/graph?userId=default-user');
        const graph = await res.json();
        renderGraphSvg(graph);

        const listRes = await fetch('/api/memory?userId=default-user');
        const listData = await listRes.json();
        cachedMemories = listData.memories || [];
        renderMemoryTable(cachedMemories);
      } catch (e) {
        console.error('Failed to load memory graph', e);
      }
    }

    function renderGraphSvg(graph) {
      const nodesGroup = document.getElementById('svg-nodes');
      const edgesGroup = document.getElementById('svg-edges');
      if (!nodesGroup || !edgesGroup) return;

      nodesGroup.innerHTML = '';
      edgesGroup.innerHTML = '';

      const nodes = graph.nodes || [];
      const edges = graph.edges || [];

      if (nodes.length === 0) {
        nodesGroup.innerHTML = '<text x="350" y="190" text-anchor="middle" fill="#64748b" font-size="13">No memories recorded yet. Add one below!</text>';
        return;
      }

      // Calculate radial / circle layout
      const cx = 350, cy = 190, r = Math.min(cx, cy) - 60;
      const positions = {};

      nodes.forEach((node, i) => {
        const angle = (i / nodes.length) * 2 * Math.PI - Math.PI / 2;
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        positions[node.id] = { x, y };

        const colorMap = {
          preference: '#0284c7',
          project: '#10b981',
          goal: '#f59e0b',
          relationship: '#8b5cf6',
          fact: '#64748b'
        };
        const color = colorMap[node.category] || '#64748b';

        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', 'graph-node');
        g.setAttribute('id', 'node-' + node.id);
        g.onclick = () => selectMemoryNode(node);

        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', x);
        circle.setAttribute('cy', y);
        circle.setAttribute('r', '16');
        circle.setAttribute('fill', color);
        circle.setAttribute('stroke', '#1e293b');
        circle.setAttribute('stroke-width', '2');

        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', x);
        text.setAttribute('y', y + 26);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('fill', '#94a3b8');
        text.setAttribute('font-size', '11');
        text.textContent = node.label || node.content.slice(0, 15);

        g.appendChild(circle);
        g.appendChild(text);
        nodesGroup.appendChild(g);
      });

      edges.forEach((edge, i) => {
        const sourcePos = positions[edge.source];
        const targetPos = positions[edge.target];
        if (sourcePos && targetPos) {
          const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          line.setAttribute('x1', sourcePos.x);
          line.setAttribute('y1', sourcePos.y);
          line.setAttribute('x2', targetPos.x);
          line.setAttribute('y2', targetPos.y);
          line.setAttribute('stroke', '#475569');
          line.setAttribute('stroke-width', '1.5');
          line.setAttribute('marker-end', 'url(#arrow)');
          edgesGroup.appendChild(line);
        }
      });
    }

    function selectMemoryNode(node) {
      selectedMemoryId = node.id;
      const drawer = document.getElementById('memory-detail-drawer');
      drawer.style.display = 'flex';
      document.getElementById('detail-category-badge').innerText = node.category;
      document.getElementById('detail-confidence').innerText = 'Confidence: ' + (node.confidence || 1.0);
      document.getElementById('detail-key').innerText = node.label || 'Memory Item';
      document.getElementById('detail-content').innerText = node.content;

      document.querySelectorAll('.graph-node').forEach(el => el.classList.remove('active'));
      document.getElementById('node-' + node.id)?.classList.add('active');
    }

    function closeMemoryDetail() {
      document.getElementById('memory-detail-drawer').style.display = 'none';
      selectedMemoryId = null;
      document.querySelectorAll('.graph-node').forEach(el => el.classList.remove('active'));
    }

    async function deleteSelectedMemory() {
      if (!selectedMemoryId) return;
      try {
        await fetch('/api/memory/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': CSRF_TOKEN },
          body: JSON.stringify({ id: selectedMemoryId, userId: 'default-user' })
        });
        closeMemoryDetail();
        loadMemoryGraph();
      } catch (e) {
        alert('Failed to delete memory');
      }
    }

    async function saveNewMemory() {
      const content = document.getElementById('new-mem-content').value.trim();
      const category = document.getElementById('new-mem-category').value;
      if (!content) return;

      try {
        await fetch('/api/memory', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': CSRF_TOKEN },
          body: JSON.stringify({ content, category, userId: 'default-user' })
        });
        document.getElementById('new-mem-content').value = '';
        loadMemoryGraph();
      } catch (e) {
        alert('Failed to save memory');
      }
    }

    function renderMemoryTable(memories) {
      const tbody = document.getElementById('memory-table-body');
      if (!tbody) return;
      if (memories.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="color: var(--text-muted);">No memories stored yet.</td></tr>';
        return;
      }
      tbody.innerHTML = memories.map(m => \`
        <tr>
          <td><span class="badge badge-neutral">\${m.category}</span></td>
          <td><strong>\${m.key || '—'}</strong></td>
          <td>\${m.content}</td>
          <td>\${m.confidence || 1.0}</td>
          <td><button class="btn btn-danger" style="padding: 2px 8px; font-size: 11px;" onclick="deleteMemoryDirect('\${m.id}')">Delete</button></td>
        </tr>
      \`).join('');
    }

    async function deleteMemoryDirect(id) {
      await fetch('/api/memory/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': CSRF_TOKEN },
        body: JSON.stringify({ id, userId: 'default-user' })
      });
      loadMemoryGraph();
    }

    function toggleMemoryView() {
      const graph = document.getElementById('memory-graph-view');
      const table = document.getElementById('memory-table-view');
      if (graph.style.display === 'none') {
        graph.style.display = 'flex';
        table.style.display = 'none';
      } else {
        graph.style.display = 'none';
        table.style.display = 'block';
      }
    }

    function filterMemories(category) {
      document.querySelectorAll('#memory-category-filters .filter-pill').forEach(btn => {
        btn.classList.toggle('active', btn.innerText.toLowerCase() === category || (category === 'all' && btn.innerText === 'All'));
      });
      const filtered = category === 'all' ? cachedMemories : cachedMemories.filter(m => m.category === category);
      renderMemoryTable(filtered);
    }

    function searchMemoryNodes() {
      const q = document.getElementById('memory-search').value.toLowerCase().trim();
      document.querySelectorAll('.graph-node').forEach(node => {
        const text = node.textContent.toLowerCase();
        node.style.opacity = (!q || text.includes(q)) ? '1.0' : '0.2';
      });
    }

    async function testSupermemoryKey() {
      const key = document.getElementById('sm-api-key').value.trim();
      const badge = document.getElementById('supermemory-status-badge');
      if (!key) return;

      badge.innerText = 'Testing...';
      try {
        const res = await fetch('/api/supermemory/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': CSRF_TOKEN },
          body: JSON.stringify({ apiKey: key })
        });
        const data = await res.json();
        if (res.ok && data.valid) {
          badge.className = 'badge badge-success';
          badge.innerText = 'Connected & Isolated';
        } else {
          badge.className = 'badge badge-error';
          badge.innerText = 'Invalid Key';
        }
      } catch (e) {
        badge.className = 'badge badge-error';
        badge.innerText = 'Test Failed';
      }
    }

    async function testHubProvider() {
      const provider = document.getElementById('hub-provider').value;
      const apiKey = document.getElementById('hub-key').value.trim();
      const status = document.getElementById('hub-key-status');
      if (!apiKey) return;

      status.innerHTML = '<span style="color: var(--text-muted);">Testing provider connection...</span>';
      try {
        const res = await fetch('/api/providers/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': CSRF_TOKEN },
          body: JSON.stringify({ provider, apiKey })
        });
        const data = await res.json();
        if (res.ok && data.valid) {
          status.innerHTML = '<span style="color: var(--success);">✅ Verified & Connected to ' + provider.toUpperCase() + '!</span>';
        } else {
          status.innerHTML = '<span style="color: var(--error);">❌ ' + (data.error || 'Connection failed') + '</span>';
        }
      } catch (e) {
        status.innerHTML = '<span style="color: var(--error);">❌ Network error during test.</span>';
      }
    }

    // Prerequisites Detection
    async function checkPrereqs() {
      const tbody = document.getElementById('prereqs-table');
      const alertDiv = document.getElementById('prereqs-alert');
      tbody.innerHTML = '<tr><td colspan="3">Detecting installed tools...</td></tr>';

      try {
        const res = await fetch('/api/prerequisites');
        const data = await res.json();

        const rows = [
          { name: 'Node.js (>= 18)', item: data.node },
          { name: 'Git', item: data.git },
          { name: 'Supabase CLI', item: data.supabase },
          { name: 'Docker (Optional for remote)', item: data.docker }
        ];

        tbody.innerHTML = rows.map(r => \`
          <tr>
            <td><strong>\${r.name}</strong></td>
            <td>\${r.item.installed ? '<span class="badge badge-success">Installed</span>' : '<span class="badge badge-error">Missing</span>'}</td>
            <td><code>\${r.item.version || r.item.path || 'Not detected'}</code></td>
          </tr>
        \`).join('');

        if (!data.node.installed || !data.git.installed || !data.supabase.installed) {
          alertDiv.style.display = 'block';
          alertDiv.innerText = '⚠️ Required tools are missing. Please install Supabase CLI before proceeding.';
        } else {
          alertDiv.style.display = 'none';
        }
      } catch (e) {
        tbody.innerHTML = '<tr><td colspan="3" style="color: var(--error);">Failed to check prerequisites.</td></tr>';
      }
    }

    // Validation Functions
    async function validateSupabase() {
      const ref = document.getElementById('sb-ref').value.trim();
      const token = document.getElementById('sb-token').value.trim();
      const statusDiv = document.getElementById('sb-status');

      if (!ref || !token) {
        statusDiv.innerHTML = '<span class="badge badge-error">Project reference and token are required.</span>';
        return;
      }

      statusDiv.innerHTML = '<span class="badge badge-neutral">Validating Supabase access...</span>';
      try {
        const res = await fetch('/api/validate/supabase', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': CSRF_TOKEN },
          body: JSON.stringify({ projectRef: ref, accessToken: token })
        });
        const data = await res.json();
        if (data.valid) {
          statusDiv.innerHTML = '<span class="badge badge-success">✅ Connected to Supabase project ' + ref + '</span>';
        } else {
          statusDiv.innerHTML = '<span class="badge badge-error">❌ ' + data.error + '</span>';
        }
      } catch (e) {
        statusDiv.innerHTML = '<span class="badge badge-error">Validation failed</span>';
      }
    }

    async function validateTelegram() {
      const token = document.getElementById('tg-token').value.trim();
      const statusDiv = document.getElementById('tg-status');

      if (!token) {
        statusDiv.innerHTML = '<span class="badge badge-error">Telegram bot token is required.</span>';
        return;
      }

      statusDiv.innerHTML = '<span class="badge badge-neutral">Checking @BotFather token...</span>';
      try {
        const res = await fetch('/api/validate/telegram', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': CSRF_TOKEN },
          body: JSON.stringify({ token })
        });
        const data = await res.json();
        if (data.valid) {
          statusDiv.innerHTML = '<span class="badge badge-success">✅ Valid bot: @' + (data.botUsername || 'JanaBot') + '</span>';
        } else {
          statusDiv.innerHTML = '<span class="badge badge-error">❌ ' + data.error + '</span>';
        }
      } catch (e) {
        statusDiv.innerHTML = '<span class="badge badge-error">Validation failed</span>';
      }
    }

    async function detectGeminiModels() {
      const apiKey = document.getElementById('gemini-key').value.trim();
      const statusDiv = document.getElementById('gemini-status');
      const select = document.getElementById('gemini-model');

      if (!apiKey) {
        statusDiv.innerHTML = '<span class="badge badge-error">Please enter a Gemini API Key first.</span>';
        return;
      }

      statusDiv.innerHTML = '<span class="badge badge-neutral">Querying available models from Google AI Studio...</span>';
      try {
        const res = await fetch('/api/validate/gemini-models', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': CSRF_TOKEN },
          body: JSON.stringify({ apiKey })
        });
        const data = await res.json();
        if (data.valid && data.models && data.models.length > 0) {
          select.innerHTML = '';
          data.models.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m;
            opt.innerText = m;
            if (m === 'gemini-3.8-flash' || m === 'gemini-3.5-flash-lite') opt.selected = true;
            select.appendChild(opt);
          });
          statusDiv.innerHTML = '<span class="badge badge-success">✅ Found ' + data.models.length + ' available Gemini models for your key.</span>';
        } else {
          statusDiv.innerHTML = '<span class="badge badge-error">❌ ' + (data.error || 'Failed to detect models') + '</span>';
        }
      } catch (e) {
        statusDiv.innerHTML = '<span class="badge badge-error">Failed to auto-detect models.</span>';
      }
    }

    async function validateGemini() {
      const apiKey = document.getElementById('gemini-key').value.trim();
      const model = document.getElementById('gemini-model').value;
      const statusDiv = document.getElementById('gemini-status');

      if (!apiKey) {
        statusDiv.innerHTML = '<span class="badge badge-error">Gemini API key is required.</span>';
        return;
      }

      statusDiv.innerHTML = '<span class="badge badge-neutral">Validating Gemini API key with ' + model + '...</span>';
      try {
        const res = await fetch('/api/validate/gemini', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': CSRF_TOKEN },
          body: JSON.stringify({ apiKey, model })
        });
        const data = await res.json();
        if (data.valid) {
          statusDiv.innerHTML = '<span class="badge badge-success">✅ Gemini API key validated successfully (' + model + ').</span>';
        } else {
          statusDiv.innerHTML = '<span class="badge badge-error">❌ ' + data.error + '</span>';
        }
      } catch (e) {
        statusDiv.innerHTML = '<span class="badge badge-error">Validation failed</span>';
      }
    }

    // Deployment Execution
    async function startDeployment() {
      const btn = document.getElementById('btn-deploy');
      btn.disabled = true;
      switchTab(5);

      const terminal = document.getElementById('terminal-output');
      const stepsContainer = document.getElementById('deploy-steps-container');
      terminal.innerHTML = '<div class="terminal-line">[System] Initiating automated deployment pipeline...</div>';
      stepsContainer.innerHTML = '';

      const config = {
        supabaseProjectRef: document.getElementById('sb-ref').value.trim(),
        supabaseAccessToken: document.getElementById('sb-token').value.trim(),
        supabaseDbPassword: document.getElementById('sb-pass').value.trim() || undefined,
        telegramBotToken: document.getElementById('tg-token').value.trim(),
        authorizedTelegramUsers: document.getElementById('tg-user').value.trim(),
        telegramWebhookSecret: document.getElementById('tg-secret').value.trim() || undefined,
        geminiApiKey: document.getElementById('gemini-key').value.trim(),
        geminiModel: document.getElementById('gemini-model').value,
        defaultTimezone: document.getElementById('user-tz').value.trim(),
      };

      try {
        const res = await fetch('/api/deploy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-csrf-token': CSRF_TOKEN },
          body: JSON.stringify(config)
        });

        const result = await res.json();
        if (result.steps) {
          stepsContainer.innerHTML = result.steps.map(s => \`
            <div style="display: flex; justify-content: space-between; padding: 6px 12px; background: #0b1120; border-radius: var(--radius);">
              <span>\${s.title}</span>
              <span class="badge \${s.status === 'succeeded' ? 'badge-success' : s.status === 'failed' ? 'badge-error' : 'badge-neutral'}">\${s.status}</span>
            </div>
          \`).join('');
        }

        if (result.logs) {
          terminal.innerHTML = result.logs.map(l => \`<div class="terminal-line">\${l}</div>\`).join('');
          terminal.scrollTop = terminal.scrollHeight;
        }

        if (result.success) {
          document.getElementById('deployment-summary').style.display = 'block';
        }
      } catch (err) {
        terminal.innerHTML += '<div class="terminal-line" style="color: var(--error);">[FATAL] Deployment failed: ' + err.message + '</div>';
      } finally {
        btn.disabled = false;
      }
    }

    function copyLogs() {
      const text = document.getElementById('terminal-output').innerText;
      navigator.clipboard.writeText(text);
      alert('Logs copied to clipboard!');
    }

    function copySummary() {
      const summary = "OpenAssistant AI Deployment Summary\\nProject: " + document.getElementById('sb-ref').value + "\\nStatus: Live & Configured";
      navigator.clipboard.writeText(summary);
      alert('Summary copied to clipboard!');
    }

    function saveFormData() {
      const draft = {
        sbRef: document.getElementById('sb-ref')?.value || '',
        sbToken: document.getElementById('sb-token')?.value || '',
        sbPass: document.getElementById('sb-pass')?.value || '',
        tgToken: document.getElementById('tg-token')?.value || '',
        tgUser: document.getElementById('tg-user')?.value || '',
        tgSecret: document.getElementById('tg-secret')?.value || '',
        geminiKey: document.getElementById('gemini-key')?.value || '',
        geminiModel: document.getElementById('gemini-model')?.value || '',
        userTz: document.getElementById('user-tz')?.value || '',
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
      } catch (e) {}
    }

    function loadFormData() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const draft = JSON.parse(raw);
        if (draft.sbRef) document.getElementById('sb-ref').value = draft.sbRef;
        if (draft.sbToken) document.getElementById('sb-token').value = draft.sbToken;
        if (draft.sbPass) document.getElementById('sb-pass').value = draft.sbPass;
        if (draft.tgToken) document.getElementById('tg-token').value = draft.tgToken;
        if (draft.tgUser) document.getElementById('tg-user').value = draft.tgUser;
        if (draft.tgSecret) document.getElementById('tg-secret').value = draft.tgSecret;
        if (draft.geminiKey) document.getElementById('gemini-key').value = draft.geminiKey;
        if (draft.geminiModel) document.getElementById('gemini-model').value = draft.geminiModel;
        if (draft.userTz) document.getElementById('user-tz').value = draft.userTz;
      } catch (e) {}
    }

    window.addEventListener('DOMContentLoaded', () => {
      loadFormData();
      checkPrereqs();
      document.querySelectorAll('input, select').forEach(el => {
        el.addEventListener('input', saveFormData);
        el.addEventListener('change', saveFormData);
      });
    });
  </script>
</body>
</html>`;
}

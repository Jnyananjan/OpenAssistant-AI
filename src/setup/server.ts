// src/setup/server.ts
import http from 'node:http';
import crypto from 'node:crypto';
import { SetupValidator } from './validator.js';
import { SetupDeployer } from './deployer.js';
import { renderDashboardHtml, renderConnectProviderHtml } from './ui.js';
import { SetupConfig } from './types.js';
import { DatabaseRepository } from '../db/repository.js';
import { InMemoryDatabaseRepository } from '../db/in-memory-repository.js';
import { SmartModelRouter } from '../ai/router.js';
import { EncryptionService } from '../security/encryption.js';
import { MemoryEngine } from '../memory/memory-engine.js';
import { DEFAULT_MODEL_CATALOG } from '../ai/catalog.js';
import { ProviderId } from '../ai/provider.js';
import { SupermemoryClient } from '../memory/supermemory.js';

export interface SetupServerOptions {
  port?: number;
  host?: string;
  projectRoot?: string;
  validator?: SetupValidator;
  deployer?: SetupDeployer;
  db?: DatabaseRepository;
  router?: SmartModelRouter;
  encryption?: EncryptionService;
  memoryEngine?: MemoryEngine;
}

export class SetupServer {
  private readonly port: number;
  private readonly host: string;
  private readonly projectRoot: string;
  private readonly validator: SetupValidator;
  private readonly deployer: SetupDeployer;
  private readonly db: DatabaseRepository;
  private readonly router: SmartModelRouter;
  private readonly encryption: EncryptionService;
  private readonly memoryEngine: MemoryEngine;
  private server: http.Server | null = null;
  private csrfToken: string;
  private latestDeployment: unknown = null;

  constructor(options: SetupServerOptions = {}) {
    this.port = options.port || 4173;
    this.host = options.host || '127.0.0.1';
    this.projectRoot = options.projectRoot || process.cwd();
    this.validator = options.validator || new SetupValidator(this.projectRoot);
    this.deployer = options.deployer || new SetupDeployer(this.projectRoot, this.validator);
    this.db = options.db || new InMemoryDatabaseRepository();
    this.router = options.router || new SmartModelRouter();
    this.encryption = options.encryption || new EncryptionService();
    this.memoryEngine = options.memoryEngine || new MemoryEngine({ backend: this.db });
    this.csrfToken = crypto.randomBytes(32).toString('hex');
  }

  getCsrfToken(): string {
    return this.csrfToken;
  }

  async start(): Promise<{ port: number; url: string }> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        try {
          await this.handleRequest(req, res);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Internal Server Error';
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: msg }));
        }
      });

      this.server.on('error', reject);
      this.server.listen(this.port, this.host, () => {
        const url = `http://${this.host}:${this.port}/setup`;
        resolve({ port: this.port, url });
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.server = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  private isAllowedOrigin(originHeader: string | undefined): boolean {
    if (!originHeader) return true; // Direct local browser navigation
    try {
      const parsed = new URL(originHeader);
      return (
        (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') &&
        parsed.port === String(this.port)
      );
    } catch {
      return false;
    }
  }

  private async parseJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      let body = '';
      let bytes = 0;
      const MAX_BYTES = 50 * 1024; // 50KB limit

      req.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > MAX_BYTES) {
          reject(new Error('Payload Too Large'));
          return;
        }
        body += chunk.toString();
      });

      req.on('end', () => {
        if (!body.trim()) {
          resolve({});
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error('Invalid JSON'));
        }
      });

      req.on('error', reject);
    });
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url || '/', `http://${this.host}:${this.port}`);
    const pathname = url.pathname;
    const method = req.method || 'GET';

    // Origin verification for CSRF mitigation
    const origin = req.headers.origin;
    if (origin && !this.isAllowedOrigin(origin)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden: Origin mismatch' }));
      return;
    }

    // Serve HTML dashboard
    if (method === 'GET' && (pathname === '/' || pathname === '/setup')) {
      const html = renderDashboardHtml(this.csrfToken);
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(html);
      return;
    }

    // Serve Single-use Secure Setup Session page
    if (method === 'GET' && pathname === '/connect-provider') {
      const token = url.searchParams.get('token') || '';
      let provider = 'openai';
      let isValid = false;

      if (token) {
        const session = await this.db.getSetupSession(token);
        if (session && !session.usedAt && new Date(session.expiresAt).getTime() > Date.now()) {
          isValid = true;
          provider = session.provider;
        }
      }

      const html = renderConnectProviderHtml(this.csrfToken, token, provider, isValid);
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(html);
      return;
    }

    // API: Check Prerequisites
    if (method === 'GET' && pathname === '/api/prerequisites') {
      const prereqs = await this.validator.checkPrerequisites();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(prereqs));
      return;
    }

    // API: Provider Model Catalog
    if (method === 'GET' && pathname === '/api/providers/catalog') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ catalog: DEFAULT_MODEL_CATALOG }));
      return;
    }

    // API: Memory Graph
    if (method === 'GET' && pathname === '/api/memory/graph') {
      const userId = url.searchParams.get('userId') || 'default-user';
      const graph = await this.memoryEngine.buildGraph(userId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(graph));
      return;
    }

    // API: Memory Records List
    if (method === 'GET' && pathname === '/api/memory') {
      const userId = url.searchParams.get('userId') || 'default-user';
      const memories = await this.memoryEngine.recall(userId, '', undefined, 50);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ memories }));
      return;
    }

    // For state-changing POST requests, verify CSRF Token
    if (method === 'POST') {
      const tokenHeader = req.headers['x-csrf-token'];
      if (!tokenHeader || tokenHeader !== this.csrfToken) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Forbidden: Invalid CSRF Token' }));
        return;
      }

      // API: Submit Secure Provider Key via Session
      if (pathname === '/api/connect-provider') {
        const body = await this.parseJsonBody(req);
        const token = String(body.token || '');
        const apiKey = String(body.apiKey || '').trim();
        const baseUrl = body.baseUrl ? String(body.baseUrl).trim() : undefined;

        if (!token || !apiKey) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing session token or API key' }));
          return;
        }

        const session = await this.db.getSetupSession(token);
        if (!session || session.usedAt || new Date(session.expiresAt).getTime() <= Date.now()) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Setup session is invalid or has expired' }));
          return;
        }

        const provider = session.provider as ProviderId;
        const adapter = this.router.getAdapter(provider);
        if (!adapter) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Unsupported provider: ${provider}` }));
          return;
        }

        // Validate key against provider
        const validation = await adapter.validateCredentials({ apiKey, baseUrl });
        if (!validation.valid) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: validation.error || 'API key validation failed' }));
          return;
        }

        // Encrypt and persist
        const encrypted = this.encryption.encrypt(apiKey);
        const masked = EncryptionService.maskKey(apiKey);
        await this.db.saveUserCredential(session.userId, provider, encrypted, masked, baseUrl);
        await this.db.markSetupSessionUsed(token);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, provider, maskedKey: masked }));
        return;
      }

      // API: Validate Provider Connection
      if (pathname === '/api/providers/validate') {
        const body = await this.parseJsonBody(req);
        const provider = String(body.provider || '') as ProviderId;
        const apiKey = String(body.apiKey || '');
        const baseUrl = body.baseUrl ? String(body.baseUrl) : undefined;

        const adapter = this.router.getAdapter(provider);
        if (!adapter) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ valid: false, error: 'Unknown provider' }));
          return;
        }

        const result = await adapter.validateCredentials({ apiKey, baseUrl });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        return;
      }

      // API: Test Supermemory Key
      if (pathname === '/api/supermemory/test') {
        const body = await this.parseJsonBody(req);
        const apiKey = String(body.apiKey || '');
        const client = new SupermemoryClient({ apiKey });
        const result = await client.validateKey();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        return;
      }

      // API: Save Memory
      if (pathname === '/api/memory') {
        const body = await this.parseJsonBody(req);
        const userId = String(body.userId || 'default-user');
        const content = String(body.content || '');
        const category = (body.category as any) || 'fact';
        const key = body.key ? String(body.key) : undefined;

        if (!content) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Memory content is required' }));
          return;
        }

        const memory = await this.memoryEngine.remember(userId, content, category, key);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ memory }));
        return;
      }

      // API: Delete Memory
      if (pathname === '/api/memory/delete') {
        const body = await this.parseJsonBody(req);
        const id = String(body.id || '');
        const userId = String(body.userId || 'default-user');

        const success = await this.db.deleteMemory(id, userId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success }));
        return;
      }

      // API: Validate Telegram Token
      if (pathname === '/api/validate/telegram') {
        const body = await this.parseJsonBody(req);
        const token = String(body.token || '');
        const result = await this.validator.validateTelegramToken(token);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        return;
      }

      // API: Validate Gemini API Key
      if (pathname === '/api/validate/gemini') {
        const body = await this.parseJsonBody(req);
        const apiKey = String(body.apiKey || '');
        const model = body.model ? String(body.model) : 'gemini-3.8-flash';
        const result = await this.validator.validateGeminiApiKey(apiKey, model);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        return;
      }

      // API: Fetch available Gemini Models for Key
      if (pathname === '/api/validate/gemini-models') {
        const body = await this.parseJsonBody(req);
        const apiKey = String(body.apiKey || '');
        const result = await this.validator.fetchAvailableModels(apiKey);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        return;
      }

      // API: Validate Supabase Project
      if (pathname === '/api/validate/supabase') {
        const body = await this.parseJsonBody(req);
        const projectRef = String(body.projectRef || '');
        const accessToken = body.accessToken ? String(body.accessToken) : undefined;
        const result = await this.validator.validateSupabaseProject(projectRef, accessToken);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
        return;
      }

      // API: Deploy OpenAssistant AI
      if (pathname === '/api/deploy') {
        const body = await this.parseJsonBody(req);
        const config = body as unknown as SetupConfig;

        if (!config.supabaseProjectRef || !config.telegramBotToken || !config.geminiApiKey) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing required configuration parameters' }));
          return;
        }

        const deploymentResult = await this.deployer.executeDeployment(config);
        this.latestDeployment = deploymentResult;

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(deploymentResult));
        return;
      }
    }

    // API: Current Deployment Status
    if (method === 'GET' && pathname === '/api/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ deployment: this.latestDeployment }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  }
}

// Auto-run if executed as standalone script
if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  const server = new SetupServer();
  server.start().then(({ url }) => {
    console.log(`\n======================================================`);
    console.log(`🚀 OpenAssistant AI Setup Dashboard is running!`);
    console.log(`👉 Open: ${url}`);
    console.log(`======================================================\n`);
    console.log(`Press Ctrl+C to stop.`);
  }).catch((err) => {
    console.error('Failed to start setup server:', err);
    process.exit(1);
  });
}

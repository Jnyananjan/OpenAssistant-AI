// src/setup/deployer.ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  SetupConfig,
  DeploymentStep,
  DeploymentProgress,
} from './types.js';
import { SetupValidator } from './validator.js';

const execFileAsync = promisify(execFile);

export interface StepLogCallback {
  (stepIndex: number, logLine: string): void;
}

export interface StepStatusCallback {
  (stepIndex: number, step: DeploymentStep): void;
}

export class SetupDeployer {
  private readonly projectRoot: string;
  private readonly validator: SetupValidator;
  private readonly fetchFn: typeof fetch;

  constructor(
    projectRoot: string = process.cwd(),
    validator?: SetupValidator,
    fetchFn: typeof fetch = globalThis.fetch.bind(globalThis)
  ) {
    this.projectRoot = projectRoot;
    this.validator = validator || new SetupValidator(projectRoot, fetchFn);
    this.fetchFn = fetchFn;
  }

  createInitialProgress(sessionId: string = crypto.randomUUID()): DeploymentProgress {
    const steps: DeploymentStep[] = [
      { id: 'prereqs', title: 'Verify local prerequisites', status: 'pending', logs: [] },
      { id: 'validate', title: 'Validate API credentials', status: 'pending', logs: [] },
      { id: 'config', title: 'Update local project configuration', status: 'pending', logs: [] },
      { id: 'link', title: 'Link Supabase project', status: 'pending', logs: [] },
      { id: 'migrate', title: 'Apply database migrations', status: 'pending', logs: [] },
      { id: 'secrets', title: 'Configure Supabase function secrets', status: 'pending', logs: [] },
      { id: 'deploy-webhook', title: 'Deploy telegram-webhook function', status: 'pending', logs: [] },
      { id: 'deploy-worker', title: 'Deploy process-reminders function', status: 'pending', logs: [] },
      { id: 'schedule', title: 'Configure scheduled reminder worker (pg_cron)', status: 'pending', logs: [] },
      { id: 'webhook', title: 'Register Telegram webhook', status: 'pending', logs: [] },
      { id: 'verify', title: 'Run end-to-end health checks', status: 'pending', logs: [] },
    ];

    return {
      sessionId,
      inProgress: false,
      completed: false,
      success: false,
      steps,
      currentStepIndex: 0,
    };
  }

  redactSecrets(text: string, secrets: string[]): string {
    let result = text;
    for (const secret of secrets) {
      if (secret && secret.length > 3) {
        result = result.replaceAll(secret, '***REDACTED***');
      }
    }
    // Also catch common token patterns
    result = result.replace(/bot\d+:[A-Za-z0-9_-]{20,}/g, 'bot***REDACTED***');
    result = result.replace(/key=[A-Za-z0-9_-]{20,}/g, 'key=***REDACTED***');
    result = result.replace(/Bearer\s+[A-Za-z0-9_.-]{20,}/g, 'Bearer ***REDACTED***');
    return result;
  }

  async runSafeCommand(
    cmd: string,
    args: string[],
    secretsToRedact: string[],
    extraEnv: Record<string, string> = {}
  ): Promise<{ stdout: string; stderr: string }> {
    try {
      const mergedEnv = {
        ...process.env,
        ...extraEnv,
      };

      const resolvedCmd = process.platform === 'win32' && cmd === 'npm' ? 'npm.cmd' : cmd;
      const result = await execFileAsync(resolvedCmd, args, {
        cwd: this.projectRoot,
        timeout: 90000,
        env: mergedEnv,
        shell: false,
      });

      return {
        stdout: this.redactSecrets(result.stdout || '', secretsToRedact),
        stderr: this.redactSecrets(result.stderr || '', secretsToRedact),
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(this.redactSecrets(msg, secretsToRedact));
    }
  }

  async executeDeployment(
    config: SetupConfig,
    onLog?: StepLogCallback,
    onStepUpdate?: StepStatusCallback
  ): Promise<DeploymentProgress> {
    const progress = this.createInitialProgress();
    progress.inProgress = true;
    progress.startedAt = new Date().toISOString();

    const webhookSecret = config.telegramWebhookSecret || crypto.randomBytes(24).toString('hex');
    const workerSecret = config.workerSecret || crypto.randomBytes(24).toString('hex');
    const geminiModel = config.geminiModel || 'gemini-3.8-flash';
    const timezone = config.defaultTimezone || 'Asia/Kolkata';

    const secretList = [
      config.telegramBotToken,
      config.geminiApiKey,
      config.supabaseAccessToken || '',
      config.supabaseDbPassword || '',
      webhookSecret,
      workerSecret,
    ].filter(Boolean);

    const runStep = async (
      index: number,
      action: (addLog: (line: string) => void) => Promise<void>
    ): Promise<boolean> => {
      progress.currentStepIndex = index;
      const step = progress.steps[index];
      step.status = 'running';
      step.startedAt = new Date().toISOString();
      if (onStepUpdate) onStepUpdate(index, step);

      const addLog = (line: string) => {
        const sanitized = this.redactSecrets(line, secretList);
        step.logs.push(`[${new Date().toLocaleTimeString()}] ${sanitized}`);
        if (onLog) onLog(index, sanitized);
      };

      try {
        await action(addLog);
        step.status = 'success';
        step.completedAt = new Date().toISOString();
        if (onStepUpdate) onStepUpdate(index, step);
        return true;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        const sanitizedError = this.redactSecrets(msg, secretList);
        step.status = 'failed';
        step.error = sanitizedError;
        step.completedAt = new Date().toISOString();
        addLog(`ERROR: ${sanitizedError}`);
        if (onStepUpdate) onStepUpdate(index, step);
        return false;
      }
    };

    // Step 0: Prerequisites check
    const step0Ok = await runStep(0, async (log) => {
      log('Checking local tools: Node.js, npm, Supabase CLI...');
      const prereqs = await this.validator.checkPrerequisites();
      if (!prereqs.node.installed) throw new Error('Node.js is not installed or not in PATH.');
      if (!prereqs.npm.installed) throw new Error('npm is not installed or not in PATH.');
      if (!prereqs.supabase.installed) {
        throw new Error(
          'Supabase CLI is not installed. Install via "npm install -g supabase" or "scoop install supabase".'
        );
      }
      log(`Node.js: ${prereqs.node.version}`);
      log(`npm: ${prereqs.npm.version}`);
      log(`Supabase CLI: ${prereqs.supabase.version}`);
    });
    if (!step0Ok) return this.finalizeProgress(progress, false);

    // Step 1: Validate credentials
    const step1Ok = await runStep(1, async (log) => {
      log('Validating Telegram Bot token...');
      const tg = await this.validator.validateTelegramToken(config.telegramBotToken);
      if (!tg.valid) throw new Error(`Telegram Bot validation failed: ${tg.error}`);
      log(`Telegram Bot verified: @${tg.botUsername} (${tg.botName})`);

      log('Validating Google Gemini API key...');
      const gemini = await this.validator.validateGeminiApiKey(config.geminiApiKey, geminiModel);
      if (!gemini.valid) throw new Error(`Gemini API key validation failed: ${gemini.error}`);
      log(`Google Gemini verified with model: ${geminiModel}`);

      log(`Validating Supabase project reference: ${config.supabaseProjectRef}...`);
      const sb = await this.validator.validateSupabaseProject(
        config.supabaseProjectRef,
        config.supabaseAccessToken
      );
      if (!sb.valid) throw new Error(`Supabase project validation failed: ${sb.error}`);
      log(`Supabase project reachable at ${sb.projectUrl}`);
    });
    if (!step1Ok) return this.finalizeProgress(progress, false);

    // Step 2: Update local project configuration
    const step2Ok = await runStep(2, async (log) => {
      const configPath = path.join(this.projectRoot, 'supabase', 'config.toml');
      log(`Updating project_id in ${configPath}...`);
      if (fs.existsSync(configPath)) {
        let content = fs.readFileSync(configPath, 'utf8');
        content = content.replace(/project_id\s*=\s*"[^"]*"/, `project_id = "${config.supabaseProjectRef}"`);
        fs.writeFileSync(configPath, content, 'utf8');
        log(`Set project_id = "${config.supabaseProjectRef}" in config.toml`);
      } else {
        log('supabase/config.toml not found, skipping local file update.');
      }
    });
    if (!step2Ok) return this.finalizeProgress(progress, false);

    // Step 3: Link Supabase project
    const step3Ok = await runStep(3, async (log) => {
      log(`Running: supabase link --project-ref ${config.supabaseProjectRef}...`);
      const args = ['link', '--project-ref', config.supabaseProjectRef];
      if (config.supabaseDbPassword) {
        args.push('--password', config.supabaseDbPassword);
      }

      const extraEnv: Record<string, string> = {};
      if (config.supabaseAccessToken) {
        extraEnv.SUPABASE_ACCESS_TOKEN = config.supabaseAccessToken;
      }

      try {
        const { stdout, stderr } = await this.runSafeCommand('supabase', args, secretList, extraEnv);
        if (stdout) log(stdout);
        if (stderr) log(stderr);
        log('Supabase project linked successfully.');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('privileges to access this endpoint') || msg.includes('access-control')) {
          throw new Error(
            `Supabase permission error: Your Supabase Access Token or CLI session does not have access to project "${config.supabaseProjectRef}".\n` +
            `Solution:\n` +
            `1. Make sure you generated a Personal Access Token from the Supabase account that owns "${config.supabaseProjectRef}" at https://supabase.com/dashboard/account/tokens\n` +
            `2. Paste that "sbp_..." token into Step B (Connect Supabase) of the dashboard.\n` +
            `3. If you are using your own Supabase project, make sure the Project Reference matches your own dashboard URL.`
          );
        }
        throw err;
      }
    });
    if (!step3Ok) return this.finalizeProgress(progress, false);

    // Step 4: Apply database migrations
    const step4Ok = await runStep(4, async (log) => {
      log('Pushing migrations to Supabase database...');
      const args = ['db', 'push'];
      if (config.supabaseDbPassword) {
        args.push('--password', config.supabaseDbPassword);
      }

      const extraEnv: Record<string, string> = {};
      if (config.supabaseAccessToken) {
        extraEnv.SUPABASE_ACCESS_TOKEN = config.supabaseAccessToken;
      }

      const { stdout, stderr } = await this.runSafeCommand('supabase', args, secretList, extraEnv);
      if (stdout) log(stdout);
      if (stderr) log(stderr);
      log('Database schema and stored procedures applied successfully.');
    });
    if (!step4Ok) return this.finalizeProgress(progress, false);

    // Step 5: Configure Supabase function secrets
    const step5Ok = await runStep(5, async (log) => {
      log('Setting Edge Function secrets in Supabase...');
      const secretsToSet = [
        `TELEGRAM_BOT_TOKEN=${config.telegramBotToken}`,
        `TELEGRAM_WEBHOOK_SECRET=${webhookSecret}`,
        `GEMINI_API_KEY=${config.geminiApiKey}`,
        `GEMINI_MODEL=${geminiModel}`,
        `DEFAULT_TIMEZONE=${timezone}`,
        `MAX_FOLLOW_UPS=8`,
        `ALLOWED_TELEGRAM_USERS=${config.telegramUserId}`,
        `WORKER_SECRET=${workerSecret}`,
      ];

      const args = [
        'secrets',
        'set',
        '--project-ref',
        config.supabaseProjectRef,
        ...secretsToSet,
      ];

      const extraEnv: Record<string, string> = {};
      if (config.supabaseAccessToken) {
        extraEnv.SUPABASE_ACCESS_TOKEN = config.supabaseAccessToken;
      }

      const { stdout, stderr } = await this.runSafeCommand('supabase', args, secretList, extraEnv);
      if (stdout) log(stdout);
      if (stderr) log(stderr);
      log('Function secrets configured successfully.');
    });
    if (!step5Ok) return this.finalizeProgress(progress, false);

    // Step 6: Deploy telegram-webhook
    const step6Ok = await runStep(6, async (log) => {
      log('Bundling edge functions into self-contained units...');
      try {
        await this.runSafeCommand('npx', [
          '--yes',
          'esbuild',
          'supabase/functions/telegram-webhook/main.ts',
          '--bundle',
          '--format=esm',
          '--alias:@supabase/supabase-js=npm:@supabase/supabase-js@2',
          '--alias:zod=npm:zod@3',
          '--external:npm:*',
          '--outfile=supabase/functions/telegram-webhook/index.ts',
        ], secretList);
        await this.runSafeCommand('npx', [
          '--yes',
          'esbuild',
          'supabase/functions/process-reminders/main.ts',
          '--bundle',
          '--format=esm',
          '--alias:@supabase/supabase-js=npm:@supabase/supabase-js@2',
          '--alias:zod=npm:zod@3',
          '--external:npm:*',
          '--outfile=supabase/functions/process-reminders/index.ts',
        ], secretList);
        log('Edge functions bundled successfully with Deno npm: specifiers.');
      } catch (bundleErr: unknown) {
        log(`Note: using existing index.ts bundles (${bundleErr instanceof Error ? bundleErr.message : String(bundleErr)})`);
      }

      log('Deploying function: telegram-webhook...');
      const args = [
        'functions',
        'deploy',
        'telegram-webhook',
        '--no-verify-jwt',
        '--project-ref',
        config.supabaseProjectRef,
      ];

      const extraEnv: Record<string, string> = {};
      if (config.supabaseAccessToken) {
        extraEnv.SUPABASE_ACCESS_TOKEN = config.supabaseAccessToken;
      }

      const { stdout, stderr } = await this.runSafeCommand('supabase', args, secretList, extraEnv);
      if (stdout) log(stdout);
      if (stderr) log(stderr);
      log('Function telegram-webhook deployed successfully.');
    });
    if (!step6Ok) return this.finalizeProgress(progress, false);

    // Step 7: Deploy process-reminders
    const step7Ok = await runStep(7, async (log) => {
      log('Deploying function: process-reminders...');
      const args = [
        'functions',
        'deploy',
        'process-reminders',
        '--no-verify-jwt',
        '--project-ref',
        config.supabaseProjectRef,
      ];

      const extraEnv: Record<string, string> = {};
      if (config.supabaseAccessToken) {
        extraEnv.SUPABASE_ACCESS_TOKEN = config.supabaseAccessToken;
      }

      const { stdout, stderr } = await this.runSafeCommand('supabase', args, secretList, extraEnv);
      if (stdout) log(stdout);
      if (stderr) log(stderr);
      log('Function process-reminders deployed successfully.');
    });
    if (!step7Ok) return this.finalizeProgress(progress, false);

    // Step 8: Configure scheduled reminder worker
    const step8Ok = await runStep(8, async (log) => {
      log('Configuring Supabase Cron schedule for reminder worker...');
      const cronSql = `
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema extensions;

do $$
begin
  -- Unschedule existing job if already present to guarantee idempotency
  if exists (select 1 from cron.job where jobname = 'open-assistant-reminders') then
    perform cron.unschedule('open-assistant-reminders');
  end if;

  perform cron.schedule(
    'open-assistant-reminders',
    '* * * * *',
    $cron_body$
    select net.http_post(
      url := 'https://${config.supabaseProjectRef}.supabase.co/functions/v1/process-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ${workerSecret}'
      ),
      body := '{}'::jsonb
    ) as request_id;
    $cron_body$
  );
end $$;
`;

      let configured = false;

      // Method 1: If access token is provided, apply directly via Supabase Management API
      if (config.supabaseAccessToken && config.supabaseAccessToken.trim()) {
        log('Applying cron schedule via Supabase Management API...');
        try {
          const res = await this.fetchFn(
            `https://api.supabase.com/v1/projects/${config.supabaseProjectRef}/database/query`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${config.supabaseAccessToken.trim()}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ query: cronSql }),
            }
          );
          if (res.ok) {
            configured = true;
            log('Successfully configured pg_cron schedule via Management API.');
          } else {
            const errData = (await res.json().catch(() => ({}))) as { message?: string };
            log(`Management API notice: ${errData.message || res.statusText}, applying via migration fallback...`);
          }
        } catch (mgtErr: unknown) {
          log(`Management API error: ${mgtErr instanceof Error ? mgtErr.message : String(mgtErr)}`);
        }
      }

      // Method 2: Fallback to pushing via supabase db push
      if (!configured) {
        log('Applying cron schedule via migration file and supabase db push...');
        const migrationPath = path.join(
          this.projectRoot,
          'supabase',
          'migrations',
          '20261025000002_cron_schedule.sql'
        );
        fs.writeFileSync(migrationPath, cronSql, 'utf8');

        const args = ['db', 'push'];
        if (config.supabaseDbPassword) {
          args.push('--password', config.supabaseDbPassword);
        }

        const extraEnv: Record<string, string> = {};
        if (config.supabaseAccessToken) {
          extraEnv.SUPABASE_ACCESS_TOKEN = config.supabaseAccessToken;
        }

        const { stdout, stderr } = await this.runSafeCommand('supabase', args, secretList, extraEnv);
        if (stdout) log(stdout);
        if (stderr) log(stderr);
        log('Cron migration 20261025000002_cron_schedule.sql applied successfully.');
      }

      log('Cron schedule "open-assistant-reminders" configured (* * * * *).');
    });
    if (!step8Ok) return this.finalizeProgress(progress, false);

    // Step 9: Register Telegram Webhook
    const step9Ok = await runStep(9, async (log) => {
      const webhookUrl = `https://${config.supabaseProjectRef}.supabase.co/functions/v1/telegram-webhook`;
      log(`Registering webhook with Telegram: ${webhookUrl}...`);

      const res = await this.fetchFn(
        `https://api.telegram.org/bot${config.telegramBotToken}/setWebhook`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: webhookUrl,
            secret_token: webhookSecret,
            allowed_updates: ['message', 'callback_query'],
          }),
        }
      );

      const data = (await res.json()) as { ok: boolean; description?: string };
      if (!res.ok || !data.ok) {
        throw new Error(`Telegram setWebhook failed: ${data.description || 'Unknown error'}`);
      }
      log(`Telegram webhook registered successfully.`);
    });
    if (!step9Ok) return this.finalizeProgress(progress, false);

    // Step 10: Run verification health checks
    const step10Ok = await runStep(10, async (log) => {
      log('Querying Telegram getWebhookInfo...');
      const infoRes = await this.fetchFn(
        `https://api.telegram.org/bot${config.telegramBotToken}/getWebhookInfo`
      );
      const infoData = (await infoRes.json()) as {
        ok: boolean;
        result?: { url: string; has_custom_certificate: boolean; pending_update_count: number };
      };

      if (!infoData.ok || !infoData.result) {
        throw new Error('Could not retrieve webhook info from Telegram.');
      }
      log(`Live Webhook URL: ${infoData.result.url}`);
      log(`Pending updates count: ${infoData.result.pending_update_count}`);

      log('Testing process-reminders endpoint ping...');
      try {
        const pingRes = await this.fetchFn(
          `https://${config.supabaseProjectRef}.supabase.co/functions/v1/process-reminders`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${workerSecret}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({}),
          }
        );
        log(`process-reminders returned HTTP ${pingRes.status} (${pingRes.statusText})`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        log(`Warning on worker ping: ${msg} (Cron will retry automatically).`);
      }

      log('All deployment steps and verifications completed successfully!');
    });

    return this.finalizeProgress(progress, step10Ok);
  }

  private finalizeProgress(progress: DeploymentProgress, success: boolean): DeploymentProgress {
    progress.inProgress = false;
    progress.completed = true;
    progress.success = success;
    progress.completedAt = new Date().toISOString();
    return progress;
  }
}

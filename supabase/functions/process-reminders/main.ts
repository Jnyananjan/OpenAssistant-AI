// supabase/functions/process-reminders/index.ts
import {
  ReminderWorker,
  SupabaseDatabaseRepository,
  TelegramClient,
  DefaultReminderPolicy,
} from '../_shared/index.js';

export async function handleProcessReminders(req: Request): Promise<Response> {
  const getEnv = (key: string): string => {
    if (typeof Deno !== 'undefined' && Deno.env) {
      return Deno.env.get(key) || '';
    }
    if (typeof process !== 'undefined' && process.env) {
      return process.env[key] || '';
    }
    return '';
  };

  const botToken = getEnv('TELEGRAM_BOT_TOKEN');
  const supabaseUrl = getEnv('SUPABASE_URL');
  const supabaseServiceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  const workerSecret = getEnv('WORKER_SECRET');
  const maxFollowUps = parseInt(getEnv('MAX_FOLLOW_UPS') || '8', 10);

  // Authenticate invocation if worker secret is configured
  if (workerSecret) {
    const authHeader = req.headers.get('Authorization') || '';
    const secretHeader = req.headers.get('x-worker-secret') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    if (token !== workerSecret && secretHeader !== workerSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized worker invocation' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  if (!botToken || !supabaseUrl || !supabaseServiceRoleKey) {
    return new Response(
      JSON.stringify({ error: 'Server configuration error: missing required environment variables' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const db = new SupabaseDatabaseRepository({
    supabaseUrl,
    supabaseServiceRoleKey,
  });

  const notification = new TelegramClient({
    botToken,
  });

  const policy = new DefaultReminderPolicy(maxFollowUps);

  const worker = new ReminderWorker({
    db,
    notification,
    policy,
  });

  try {
    const runResult = await worker.runBatch();
    return new Response(JSON.stringify({ ok: true, result: runResult }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// Start Deno server if running in Deno Edge runtime
if (typeof Deno !== 'undefined' && 'serve' in Deno) {
  // @ts-ignore Deno namespace
  Deno.serve(handleProcessReminders);
}

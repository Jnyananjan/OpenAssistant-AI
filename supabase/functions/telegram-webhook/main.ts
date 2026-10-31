// supabase/functions/telegram-webhook/index.ts
import {
  WebhookController,
  SupabaseDatabaseRepository,
  TelegramClient,
  GeminiProvider,
  UserAllowlist,
  TelegramWebhookUpdate,
} from '../_shared/index.js';

export async function handleTelegramWebhook(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const getEnv = (key: string): string => {
    // Check Deno.env or process.env
    if (typeof Deno !== 'undefined' && Deno.env) {
      return Deno.env.get(key) || '';
    }
    if (typeof process !== 'undefined' && process.env) {
      return process.env[key] || '';
    }
    return '';
  };

  const botToken = getEnv('TELEGRAM_BOT_TOKEN');
  const webhookSecret = getEnv('TELEGRAM_WEBHOOK_SECRET');
  const geminiApiKey = getEnv('GEMINI_API_KEY');
  const geminiModel = getEnv('GEMINI_MODEL') || 'gemini-3.5-flash-lite';
  const supabaseUrl = getEnv('SUPABASE_URL');
  const supabaseServiceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  const allowedUsersEnv =
    getEnv('ALLOWED_TELEGRAM_USERS') ||
    getEnv('TELEGRAM_ALLOWED_USERS') ||
    getEnv('TELEGRAM_USER_ID');

  if (!botToken || !supabaseUrl || !supabaseServiceRoleKey || !webhookSecret) {
    return new Response(
      JSON.stringify({ error: 'Server configuration error: missing required environment variables' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const secretTokenHeader = req.headers.get('X-Telegram-Bot-Api-Secret-Token');

  let update: TelegramWebhookUpdate;
  try {
    update = (await req.json()) as TelegramWebhookUpdate;
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const db = new SupabaseDatabaseRepository({
    supabaseUrl,
    supabaseServiceRoleKey,
  });

  const notification = new TelegramClient({
    botToken,
  });

  const aiProvider = new GeminiProvider({
    apiKey: geminiApiKey,
    model: geminiModel,
  });

  const allowlist = new UserAllowlist(allowedUsersEnv);

  const controller = new WebhookController({
    webhookSecret,
    db,
    notification,
    aiProvider,
    allowlist,
  });

  try {
    const result = await controller.handleRequest(secretTokenHeader, update);
    return new Response(JSON.stringify(result.body), {
      status: result.statusCode,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Telegram webhook error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// Start Deno server if running in Deno Edge runtime
if (typeof Deno !== 'undefined' && 'serve' in Deno) {
  // @ts-ignore Deno namespace
  Deno.serve(handleTelegramWebhook);
}

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
  const geminiApiKey = getEnv('GEMINI_API_KEY');
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

  const digestGenerator = async (topics: string): Promise<string> => {
    if (!geminiApiKey) return '';
    try {
      const prompt = `You are an executive intelligence assistant. Generate a crisp, structured morning briefing digest for these topics: "${topics}".
Format rules:
- Differentiate each topic under its own heading with an emoji (e.g. 🤖 AI, 🧠 ML, 🦾 Robotics, 💼 Startups).
- For each topic, give 1-2 bullet points with key recent developments or trends.
- Keep each bullet point concise (1-2 sentences), factual, and directly informative.
- Do NOT use markdown code blocks. Use clean Telegram-friendly markdown (*bold*, _italic_, bullet points).`;

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 800 },
        }),
      });

      if (!res.ok) {
        const res2 = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 800 },
          }),
        });
        if (!res2.ok) return '';
        const data2 = await res2.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
        return data2.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
      }

      const data = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
      return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    } catch {
      return '';
    }
  };

  const worker = new ReminderWorker({
    db,
    notification,
    policy,
    digestGenerator,
  });

  try {
    const runResult = await worker.runBatch();
    let briefings = { morningCount: 0, eveningCount: 0 };
    try {
      briefings = await worker.checkScheduledBriefings();
    } catch (e) {
      // Non-fatal if briefings check encounters error
    }
    return new Response(JSON.stringify({ ok: true, result: runResult, briefings }), {
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

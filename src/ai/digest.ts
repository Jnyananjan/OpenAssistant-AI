// src/ai/digest.ts

export async function generateTopicDigest(topics: string, apiKey: string): Promise<string> {
  if (!apiKey || !topics.trim()) return '';
  const prompt = `You are an executive intelligence assistant. Generate a crisp, structured morning briefing digest for these topics: "${topics}".
Format rules:
- Differentiate each topic under its own heading with an emoji (e.g. 🤖 AI, 🧠 ML, 🦾 Robotics, 💼 Startups).
- For each topic, give 1-2 bullet points with key recent developments or trends.
- Keep each bullet point concise (1-2 sentences), factual, and directly informative.
- Do NOT use markdown code blocks. Use clean Telegram-friendly markdown (*bold*, _italic_, bullet points).`;

  for (const model of ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.8-flash']) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 800 },
        }),
      });
      if (res.ok) {
        const data = await res.json() as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (text) return text;
      }
    } catch {
      // try next model
    }
  }
  return '';
}

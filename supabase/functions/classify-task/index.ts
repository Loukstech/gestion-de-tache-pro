// Supabase Edge Function: classify-task
// Deploy: supabase functions deploy classify-task
// Secret: supabase secrets set GEMINI_API_KEY=...
//
// The Gemini key lives only here, on the server. The browser never sees it.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SYSTEM_PROMPT = `You are a precise task assistant for a French-speaking professional.
The user dictates a task in natural language. You must reason and return ONE task
that is correctly structured.

Rules:
- Reply in French.
- title: short, actionable, imperative, max 90 chars.
- notes: useful context extracted from the sentence, or "" if none.
- priority: "high" if urgent/deadline/important consequence; "medium" if normal work; "low" if optional/idea.
- category: a short label in title case (e.g. "Projet Alpha", "Admin", "Client", "Perso"). Infer from context; "Divers" if unclear.
- due: ISO date YYYY-MM-DD if the sentence implies a date or a relative day (today/tomorrow/Friday...). Otherwise null. Current date is {{TODAY}}.
- subtasks: an array of 0 to 4 short strings when the request clearly has steps.
- reasoning: one short sentence explaining why you chose this priority/category/date.
- reply: one warm, short sentence confirming what you did, spoken aloud to the user.

Return ONLY valid JSON matching this shape, with no markdown:
{"title":"","notes":"","priority":"medium","category":"","due":null,"subtasks":[],"reasoning":"","reply":""}`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const auth = req.headers.get('authorization');
    if (!auth) return json({ error: 'Missing authorization' }, 401);

    const { text } = await req.json();
    if (!text || typeof text !== 'string' || !text.trim()) {
      return json({ error: 'Missing text' }, 400);
    }

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) return json({ error: 'GEMINI_API_KEY not configured' }, 500);

    const today = new Date().toISOString().slice(0, 10);
    const prompt = SYSTEM_PROMPT.replace('{{TODAY}}', today);

    const upstream = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent',
      {
        method: 'POST',
        headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: prompt }] },
          contents: [{ role: 'user', parts: [{ text: text.trim() }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            maxOutputTokens: 512,
          },
        }),
      }
    );

    const raw = await upstream.text();
    if (!upstream.ok) {
      return json({ error: 'Gemini request failed', detail: raw.slice(0, 400) }, 502);
    }

    const parsed = JSON.parse(raw);
    const content = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) return json({ error: 'Empty model response' }, 502);

    const task = JSON.parse(content);
    return json({
      title: String(task.title || text).slice(0, 160),
      notes: String(task.notes || '').slice(0, 2000),
      priority: ['high', 'medium', 'low'].includes(task.priority) ? task.priority : 'medium',
      category: String(task.category || 'Divers').slice(0, 60),
      due: /^\d{4}-\d{2}-\d{2}$/.test(task.due || '') ? task.due : null,
      subtasks: Array.isArray(task.subtasks) ? task.subtasks.slice(0, 4).map(String) : [],
      reasoning: String(task.reasoning || '').slice(0, 300),
      reply: String(task.reply || 'Tâche enregistrée.').slice(0, 300),
    });
  } catch (err) {
    return json({ error: 'Invalid request', detail: String(err).slice(0, 300) }, 400);
  }
});

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

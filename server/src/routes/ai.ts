import { Router } from 'express';
import multer from 'multer';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { z } from 'zod';
import { HttpError } from '../lib/core.js';

export const aiRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /^image\/(jpeg|png|webp|heic|heif)$/.test(file.mimetype)),
});

const analysis = z.object({
  source: z.enum(['label', 'screenshot', 'photo', 'text']),
  confidence: z.enum(['high', 'medium', 'low']),
  mealName: z.string(),
  notes: z.string(),
  items: z
    .array(
      z.object({
        name: z.string(),
        quantity: z.string(),
        calories: z.number().min(0),
        protein: z.number().min(0),
        carbs: z.number().min(0),
        fat: z.number().min(0),
      }),
    )
    .max(30),
});

const PROMPT = `You are a precise nutrition logging assistant for a fitness app.
Identify what the input is and extract every food item with its macros:
- "label": a nutrition facts label. Read the numbers exactly; scale to the servings the user mentions (default 1 serving).
- "screenshot": a screenshot from another app, menu or receipt that shows foods and/or macros. Copy listed numbers exactly; only estimate missing values.
- "photo": a photo of real food. Estimate portion sizes visually and use standard nutrition data.
- "text": the user only described the meal in words.
Rules: calories in kcal, protein/carbs/fat in grams, all per item as eaten (not per 100g).
"quantity" is a short human portion like "2 large", "150 g", "1 cup".
"confidence" is high for labels/screenshots with visible numbers, medium for clear photos, low when guessing.
"notes" is one short sentence about assumptions (empty string if none). "mealName" is a 2-5 word title.
If the image contains no food or nutrition info, return an empty items array and explain in notes.`;

// Per-user daily cap so the free Gemini quota isn't burned by one account.
const usage = new Map<string, { day: string; count: number }>();
function checkQuota(userId: string) {
  const limit = Number(process.env.AI_DAILY_LIMIT ?? 40);
  const day = new Date().toISOString().slice(0, 10);
  const u = usage.get(userId);
  const count = u && u.day === day ? u.count : 0;
  if (count >= limit) throw new HttpError(429, `Daily AI scan limit reached (${limit}). Try again tomorrow or log manually.`);
  usage.set(userId, { day, count: count + 1 });
}

/** Failed scans shouldn't eat into the user's daily allowance. */
function refundQuota(userId: string) {
  const u = usage.get(userId);
  if (u && u.count > 0) u.count--;
}

// Measured on the free tier (Oct 2026): flash-lite answers in ~2s, while the
// "thinking" flash models can take 45s+ or stall under load. So: fast model
// first, a stronger model with low thinking as the fallback, and a hard
// timeout per attempt so a scan can never hang.
const DEFAULT_MODEL = 'gemini-3.1-flash-lite';
const FALLBACK_MODEL = 'gemini-3-flash-preview';
const ATTEMPT_TIMEOUT_MS = 25_000;
const isTransient = (status?: number) => status === undefined || status === 503 || status === 429 || status === 500;

let client: GoogleGenAI | null = null;
function gemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new HttpError(
      503,
      'AI scanning is not set up yet. Add a free GEMINI_API_KEY to server/.env (get one at aistudio.google.com/apikey) and restart the server.',
    );
  }
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

aiRouter.get('/status', (_req, res) => {
  res.json({ enabled: Boolean(process.env.GEMINI_API_KEY), model: process.env.GEMINI_MODEL || DEFAULT_MODEL });
});

aiRouter.post('/analyze-food', upload.single('image'), async (req, res) => {
  const hint = typeof req.body?.hint === 'string' ? req.body.hint.slice(0, 500).trim() : '';
  if (!req.file && !hint) throw new HttpError(400, 'Upload an image or describe your meal');

  const ai = gemini();
  checkQuota(req.userId);

  const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [];
  if (req.file) parts.push({ inlineData: { data: req.file.buffer.toString('base64'), mimeType: req.file.mimetype } });
  parts.push({ text: hint ? `User notes: ${hint}` : 'No extra notes from the user.' });

  const primary = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const attempts = primary === FALLBACK_MODEL ? [primary] : [primary, FALLBACK_MODEL];

  let raw: string | undefined;
  let lastStatus: number | undefined;
  for (const [i, model] of attempts.entries()) {
    const started = Date.now();
    try {
      const result = await ai.models.generateContent({
        model,
        contents: [{ role: 'user', parts }],
        config: {
          systemInstruction: PROMPT,
          temperature: 0.2,
          responseMimeType: 'application/json',
          responseJsonSchema: z.toJSONSchema(analysis),
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          abortSignal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
        },
      });
      raw = result.text;
      console.log(`Gemini ${model} answered in ${Date.now() - started}ms`);
      break;
    } catch (err) {
      // An abort (timeout) has no HTTP status; treat it like an overloaded model.
      lastStatus = (err as { status?: number }).status;
      console.error(`Gemini request failed (${model}, attempt ${i + 1}/${attempts.length}, ${Date.now() - started}ms):`, lastStatus ?? 'timeout', (err as Error).message.slice(0, 200));
      if (!isTransient(lastStatus)) break;
    }
  }

  if (raw === undefined) {
    refundQuota(req.userId);
    if (lastStatus === 429) throw new HttpError(429, 'The free Gemini quota is used up for now. Wait a minute and try again.');
    if (lastStatus === 503) throw new HttpError(503, 'Gemini is overloaded right now (free tier). Give it a minute and try again.');
    if (lastStatus === undefined) throw new HttpError(504, 'The AI took too long to answer. Try again, or log it manually.');
    if (lastStatus === 400 || lastStatus === 403) throw new HttpError(502, 'Gemini rejected the request. Check GEMINI_API_KEY and GEMINI_MODEL.');
    throw new HttpError(502, 'Could not reach the AI service. Try again.');
  }

  let json: unknown = null;
  try {
    json = JSON.parse(raw ?? '');
  } catch {
    // handled by the schema check below
  }
  const parsed = analysis.safeParse(json);
  if (!parsed.success) throw new HttpError(502, 'The AI returned an unexpected answer. Try a clearer image.');
  const round = (n: number) => Math.round(n * 10) / 10;
  res.json({
    ...parsed.data,
    items: parsed.data.items.map((i) => ({
      ...i,
      calories: Math.round(i.calories),
      protein: round(i.protein),
      carbs: round(i.carbs),
      fat: round(i.fat),
    })),
  });
});

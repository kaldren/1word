import OpenAI from "openai";

export interface AiSense {
  summary: string;
  part_of_speech: string | null;
  example: string | null;
  keywords: string[];
}

export interface FetchSensesResult {
  senses: AiSense[];
  bestSenseIndex: number | null;
}

const SENSES_SYSTEM_BASE = [
  "You are a concise dictionary.",
  "For the given word or phrase, return up to 5 of its most common distinct senses.",
  "For each sense provide: a short learner-friendly definition (max 25 words),",
  "the part of speech, one short example sentence, and 5-10 keywords —",
  "content words that strongly signal this particular sense of the word",
  "(e.g. for the 'light = not heavy' sense: weight, mass, carry, load, heavy).",
  "If the input is not a real word or phrase, return an empty senses array.",
].join(" ");

const SENSE_ITEM_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    part_of_speech: { type: ["string", "null"] },
    example: { type: ["string", "null"] },
    keywords: { type: "array", items: { type: "string" } },
  },
  required: ["summary", "part_of_speech", "example", "keywords"],
  additionalProperties: false,
};

export async function fetchAllSenses(
  apiKey: string,
  word: string,
  context?: string,
): Promise<FetchSensesResult> {
  const client = new OpenAI({ apiKey });
  const hasContext = !!(context?.trim());

  const systemPrompt = hasContext
    ? `${SENSES_SYSTEM_BASE} The word appears in this context: "${context}". Also set best_sense_index to the 0-based index of the sense that best fits this context (or null if the senses array is empty).`
    : SENSES_SYSTEM_BASE;

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: hasContext ? 700 : 600,
    temperature: 0.2,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "senses",
        strict: true,
        schema: {
          type: "object",
          properties: {
            senses: { type: "array", items: SENSE_ITEM_SCHEMA },
            best_sense_index: { type: ["number", "null"] },
          },
          required: ["senses", "best_sense_index"],
          additionalProperties: false,
        },
      },
    },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: word },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error("openai_empty_response");
  const parsed = JSON.parse(content) as { senses: AiSense[]; best_sense_index: number | null };

  const raw = parsed.best_sense_index;
  const bestSenseIndex =
    raw !== null && parsed.senses.length > 0
      ? Math.max(0, Math.min(Math.round(raw), parsed.senses.length - 1))
      : null;

  return { senses: parsed.senses, bestSenseIndex };
}

export async function selectSenseForContext(
  apiKey: string,
  word: string,
  context: string,
  senses: Pick<AiSense, "summary">[],
): Promise<number> {
  const client = new OpenAI({ apiKey });
  const senseList = senses.map((s, i) => `${i}: ${s.summary}`).join("\n");

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 50,
    temperature: 0,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "sense_selection",
        strict: true,
        schema: {
          type: "object",
          properties: {
            sense_index: { type: "number" },
          },
          required: ["sense_index"],
          additionalProperties: false,
        },
      },
    },
    messages: [
      {
        role: "system",
        content:
          "Given a word, its surrounding context, and numbered sense definitions, return the 0-based index of the sense that best matches the context.",
      },
      {
        role: "user",
        content: `Word: "${word}"\nContext: "${context}"\n\nSenses:\n${senseList}`,
      },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error("openai_empty_response");
  const parsed = JSON.parse(content) as { sense_index: number };
  return Math.max(0, Math.min(Math.round(parsed.sense_index), senses.length - 1));
}

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fetch from "node-fetch";
import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// -----------------------------
// helper: safe JSON parse (tries to extract JSON object from model text)
// -----------------------------
function extractJSON(text) {
  if (!text) return null;
  // try direct parse
  try {
    return JSON.parse(text);
  } catch (e) {
    // try to find first "{" ... "}" block
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const sub = text.slice(start, end + 1);
      try {
        return JSON.parse(sub);
      } catch (e2) {
        return null;
      }
    }
    return null;
  }
}

// -----------------------------
// helper: Levenshtein distance / similarity
// -----------------------------
function levenshtein(a, b) {
  if (!a || !b) return Math.max(a?.length || 0, b?.length || 0);
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1].toLowerCase() === b[j - 1].toLowerCase() ? 0 : 1;
      dp[i][j] = Math.min(dp[i-1][j] + 1, dp[i][j-1] + 1, dp[i-1][j-1] + cost);
    }
  }
  return dp[m][n];
}
function similarityScore(a, b) {
  if (!a || !b) return 0;
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - dist / maxLen;
}

// -----------------------------
// Google Books search & select best match
// returns {title, authors, description} or null
// -----------------------------
async function findBestBook(titleQuery) {
  try {
    const q = encodeURIComponent(titleQuery);
    const url = `https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=10&key=${process.env.GOOGLE_KEY}`;
    const r = await fetch(url);
    const data = await r.json();
    if (!data.items || data.items.length === 0) return null;

    // Build candidates
    const candidates = data.items.map(it => {
      const info = it.volumeInfo || {};
      return {
        id: it.id,
        title: (info.title || "").trim(),
        authors: (info.authors || []).join(", "),
        description: info.description || ""
      };
    });

    // Score candidates by similarity to query
    const scored = candidates.map(c => {
      const scoreTitle = similarityScore(titleQuery, c.title);
      const scoreAuthor = 0; // we don't have author input here for matching; if you want to include author from user, extend function
      return { c, score: Math.max(scoreTitle, scoreAuthor) };
    });

    scored.sort((a,b) => b.score - a.score);

    // choose top candidate if score reasonably high (>=0.45). threshold is conservative.
    const top = scored[0];
    if (top && top.score >= 0.45) {
      return top.c;
    }
    return null;
  } catch (e) {
    console.error("Google Books error:", e);
    return null;
  }
}

// -----------------------------
// sentence splitter (naive)
function splitSentences(text) {
  if (!text) return [];
  // normalize newlines
  const chunks = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  let out = [];
  for (const c of chunks) {
    const parts = c.split(/(?<=[.?!])\s+/);
    for (const p of parts) {
      const s = p.trim();
      if (s) out.push(s);
    }
  }
  return out;
}

// -----------------------------
// call model asking for strict JSON output (emulating function-calling)
// temperature 0 for stability
// -----------------------------
async function callModelForJSON(prompt, max_output_tokens = 1200) {
  const resp = await openai.responses.create({
    model: "gpt-4o-mini",
    input: prompt,
    temperature: 0.0,
    max_output_tokens
  });
  return resp.output_text ?? "";
}

// -----------------------------
// POST /api/summary
// body: { title: string, style: string, num: number }
// style = free text (user-provided)
app.post("/api/summary", async (req, res) => {
  try {
    const titleRaw = (req.body.title || "").toString().trim();
    const style = (req.body.style || "").toString().trim() || "기본 말투";
    let num = parseInt(req.body.num, 10) || 5;
    if (num < 1) num = 1;
    if (num > 70) num = 70;

    if (!titleRaw) {
      return res.json({ error: "제목을 입력하세요." });
    }

    // 1) find best matching book via Google Books (auto-correct)
    const book = await findBestBook(titleRaw);

    if (!book) {
      // no match -> explicitly return not found
      return res.json({
        found: false,
        correctedTitle: null,
        intro: "❌ 책을 찾을 수 없습니다. 제목을 다시 확인해주세요.",
        summary: ""
      });
    }

    // 2) Build function-like prompt that forces JSON output
    // We instruct model to output EXACT JSON with fields: exists, corrected_title, intro, summary_sentences (array)
    const prompt = `
You are a precise summarization assistant. Output MUST be valid JSON only (no extra text) with this exact schema:

{
  "exists": boolean,
  "corrected_title": string,
  "intro": string,                // 1-2 sentence book intro (no invention)
  "summary_sentences": [strings]  // an array of exactly ${num} sentences; each element is one sentence.
}

Rules:
- Do NOT invent facts beyond the provided book description below. If you cannot be sure this book exists or description is missing, set "exists": false and set "intro" to an explanation (short).
- "summary_sentences" must contain exactly ${num} items. If you cannot produce exactly ${num} sentences without inventing content, produce as many true sentences as possible and set exists=false.
- Use the following style instruction (user-provided) to shape wording: "${style}"
- Language: use the same language as the user requested (assume Korean unless specified in style).

Provided book info (from Google Books):
Title: ${book.title}
Authors: ${book.authors}
Description: ${book.description ? book.description.replace(/\n/g, " ") : ""}

Now produce the JSON only.
`;

    let raw = await callModelForJSON(prompt, 1400);
    let parsed = extractJSON(raw);

    // If can't parse JSON, try a more constrained re-prompt (up to 2 tries)
    let tries = 0;
    while ((!parsed || typeof parsed !== "object") && tries < 2) {
      tries++;
      const fixPrompt = `
The previous response did not contain valid JSON. Reply with ONLY valid JSON matching the schema. This is the schema:

{ "exists": boolean, "corrected_title": string, "intro": string, "summary_sentences": [strings] }

Reminder: summary_sentences must have exactly ${num} items if possible.
Use the same book info and style.
`;
      raw = await callModelForJSON(fixPrompt + "\n\nPrevious output:\n" + raw, 800);
      parsed = extractJSON(raw);
    }

    if (!parsed) {
      return res.json({
        found: true,
        correctedTitle: book.title,
        intro: "요약 생성 실패 (모델 응답 파싱 실패)",
        summary: ""
      });
    }

    // If model reported exists false -> return that
    if (parsed.exists === false) {
      return res.json({
        found: false,
        correctedTitle: parsed.corrected_title || book.title,
        intro: parsed.intro || "책이 존재하지 않거나 설명 부족합니다.",
        summary: ""
      });
    }

    // Ensure summary_sentences array length == num; if fewer, request continuation
    let sentences = Array.isArray(parsed.summary_sentences) ? parsed.summary_sentences.map(s => s.trim()).filter(Boolean) : [];
    let attemptCont = 0;
    while (sentences.length < num && attemptCont < 3) {
      const need = num - sentences.length;
      // ask model to produce only the missing number of sentences as a JSON array
      const contPrompt = `
You previously returned ${sentences.length} summary sentences. Please provide exactly ${need} additional summary sentences (no numbering, no extra text), as a JSON array. They must not duplicate previous sentences and must follow the same style: "${style}".
Previous sentences:
${JSON.stringify(sentences, null, 2)}
Respond with only a JSON array of strings.
`;
      const contRaw = await callModelForJSON(contPrompt, 600);
      const contParsed = extractJSON(contRaw);
      if (Array.isArray(contParsed)) {
        const more = contParsed.map(s => s.trim()).filter(Boolean);
        // append up to needed
        for (let m of more) {
          if (sentences.length < num) sentences.push(m);
        }
      } else {
        // fallback: try to split text into sentences
        const guessed = splitSentences(contRaw);
        for (let g of guessed) {
          if (sentences.length < num) sentences.push(g);
        }
      }
      attemptCont++;
    }

    // Final trim/pad check
    if (sentences.length > num) sentences = sentences.slice(0, num);

    // if still not enough, return what we have but mark note
    let finalSummary = sentences.join(" ");
    if (sentences.length < num) {
      finalSummary += `\n\n※ 요청한 ${num}문장 중 ${sentences.length}문장만 생성되었습니다.`;
    }

    return res.json({
      found: true,
      correctedTitle: parsed.corrected_title || book.title,
      intro: parsed.intro || "",
      summary: finalSummary
    });
  } catch (err) {
    console.error("ERROR /api/summary:", err);
    return res.json({ found: false, correctedTitle: null, intro: "오류 발생", summary: "" });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));

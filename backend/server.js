import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// helper: split text into sentences (naive, but robust for our use)
function splitIntoSentences(text) {
  if (!text) return [];
  // Normalize newlines to spaces but keep explicit newlines as potential separators
  // We'll split on newline OR a sentence end (.!?)+ followed by whitespace/newline.
  const byNewline = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  let sentences = [];
  for (const chunk of byNewline) {
    // split chunk by punctuation that usually ends sentences
    const parts = chunk.split(/(?<=[.?!])\s+/);
    for (let p of parts) {
      p = p.trim();
      if (p) sentences.push(p);
    }
  }
  // final filter: remove standalone bracket tokens etc.
  sentences = sentences.map(s => s.replace(/^[\-\–\—\s]+/, "").trim()).filter(Boolean);
  return sentences;
}

// call OpenAI responses API with stable params
async function callOpenAI(prompt, max_output_tokens = 800) {
  const resp = await openai.responses.create({
    model: "gpt-4o-mini",
    input: prompt,
    temperature: 0.0,
    max_output_tokens
  });
  return resp.output_text ?? "";
}

// POST /api/summary
app.post("/api/summary", async (req, res) => {
  try {
    let { title, lang = "한국어", tone = "기본 말투", num = 5 } = req.body;

    title = (title || "").toString().trim();
    num = parseInt(num) || 5;

    if (!title) {
      return res.json({ intro: "", summary: "제목이 없습니다." });
    }

    // clamp max to 70
    if (num > 70) num = 70;
    if (num < 1) num = 1;

    // 1) initial prompt: ask for intro + exactly N sentences in SUMMARY
    const initialPrompt = `
당신은 요약 전문가입니다.
아래 규칙을 반드시 지키세요.

규칙:
- 새로운 내용을 창작하지 마세요. (실존하는 책이 아니면 "존재하지 않는 책입니다." 라고 출력하세요.)
- 출력은 오직 다음 형식을 따르세요.
[INTRO]
(간단한 책 소개 — 한두 문장 권장)

[SUMMARY]
(정확히 ${num}개의 문장. 각 문장은 별도의 줄로만 출력하세요. 번호나 추가 설명 금지.)
- 문장 끝은 마침표/물음표/느낌표로 끝나야 합니다.
- 같은 내용을 반복하지 마세요.
- 언어: ${lang}
- 문체: ${tone}

책 제목: ${title}
`;

    let fullOutput = await callOpenAI(initialPrompt, 1200);
    // Extract intro and summary block
    const introPart = (fullOutput.split("[SUMMARY]")[0] || "").replace("[INTRO]", "").trim();
    let summaryPart = (fullOutput.split("[SUMMARY]")[1] || "").trim();

    let sentences = splitIntoSentences(summaryPart);

    // If model refused due to "존재하지 않는 책입니다." -> return early
    if (introPart && introPart.includes("존재하지 않는 책")) {
      return res.json({ intro: introPart, summary: "" });
    }

    // If fewer sentences than requested, ask the model to continue until we have num sentences
    let attempts = 0;
    while (sentences.length < num && attempts < 3) {
      const need = num - sentences.length;
      attempts++;

      // build follow-up prompt that includes what we already have and asks for remaining sentences
      const followUpPrompt = `
아래는 이전에 생성된 요약의 일부입니다. 부족한 문장 개수만큼 "반복 없이" 이어서 생성해 주세요.
이전 SUMMARY:
${sentences.join("\n")}

요청: 아직 ${need}개의 문장이 부족합니다. 이전 내용과 중복하지 않게 ${need}개의 문장을 같은 언어와 문체로 추가해 주세요.
출력은 오직 추가 문장들만, 각 문장을 별도의 줄에 하나씩 출력하세요. 번호나 해설 금지.
`;
      const moreText = await callOpenAI(followUpPrompt, 600);
      const moreSentences = splitIntoSentences(moreText);
      // append
      sentences = sentences.concat(moreSentences).slice(0, num); // keep cap
      // small throttle not needed; loop limited to 3
    }

    // final trimming to exactly num sentences
    if (sentences.length > num) sentences = sentences.slice(0, num);

    // if still too few, we will return what we have but mark it
    let finalSummary = sentences.join(" ");
    if (sentences.length < num) {
      finalSummary += `\n\n※ 주의: 요청한 ${num}문장 중 ${sentences.length}문장만 생성되었습니다.`;
    }

    return res.json({
      intro: introPart || `소개를 생성하지 못했습니다.`,
      summary: finalSummary
    });

  } catch (err) {
    console.error("SUMMARY ERROR:", err);
    return res.json({ intro: "", summary: "요약 생성 중 오류가 발생했습니다." });
  }
});

// default route
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));

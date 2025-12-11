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

// public 폴더 제공
app.use(express.static(path.join(__dirname, "public")));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ===============================
//       SUMMARY API
// ===============================
app.post("/api/summary", async (req, res) => {
  try {
    let { title, lang, tone, num } = req.body;

    if (!title) {
      return res.json({ intro: "", summary: "제목이 없습니다." });
    }

    if (!num || num > 70) num = 70;

    const prompt = `
규칙:
1) 실존 책이 아니면 "존재하지 않는 책입니다." 라고 말하고 끝내기.
2) 새로운 내용 상상 금지.
3) 문체: ${tone}
4) 언어: ${lang}
5) 요약 문장 수: ${num}

책 제목: ${title}

출력 형식:
[INTRO]
책 소개

[SUMMARY]
요약
`;

    const ai = await openai.responses.create({
      model: "gpt-4o-mini",
      input: prompt,
    });

    const text = ai.output_text || "";

    const intro = text.split("[SUMMARY]")[0].replace("[INTRO]", "").trim();
    const summary = text.split("[SUMMARY]")[1]?.trim() || "";

    res.json({ intro, summary });
  } catch (err) {
    console.error("SUMMARY ERROR:", err);
    res.json({
      intro: "",
      summary: "요약 중 오류 발생",
    });
  }
});

// "/" → index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Server running on port " + PORT));

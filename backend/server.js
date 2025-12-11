import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static("public")); // public 폴더 서빙

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ===============================
//      SUMMARY API
// ===============================
app.post("/api/summary", async (req, res) => {
  try {
    const { title, lang, tone, num } = req.body;

    if (!title) {
      return res.json({
        intro: "책 재목은여?",
        summary: "ㅠㅠ",
      });
    }

    // 존재하는 실제 책인지 검증
    const checkPrompt = `
다음 책 제목이 실제로 존재하는 책인지 검사해.
정확한 공식 출판 책이 아니면 "NO"만 출력해.
존재하면 "YES"만 출력해.

책 제목: ${title}
`;

    const check = await openai.responses.create({
      model: "gpt-4o-mini",
      input: checkPrompt,
    });

    const exists = check.output_text.trim();

    if (exists !== "YES") {
      return res.json({
        intro: "ㅓㅓ 책을 찾을수가 없는데여?",
        summary: ".ㅠㅠ.",
      });
    }

    const prompt = `
규칙:
1) 새로운 내용 만들지 않기
2) 문체: ${tone}
3) 언어: ${lang}
4) 문장 수: ${num}

책 제목: ${title}

출력 형식:
[INTRO]
(책 소개)

[SUMMARY]
(요약)
`;

    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      input: prompt,
    });

    const output = response.output_text;

    const intro = output.split("[SUMMARY]")[0].replace("[INTRO]", "").trim();
    const summary = output.split("[SUMMARY]")[1]?.trim() || "";

    res.json({
      intro,
      summary,
    });

  } catch (err) {
    console.error("SUMMARY ERROR:", err);
    res.json({
      intro: "오류오류오류오류오류오류오류오류오류오류오류오류오류오류오류오류오류오류오류오류오류오류오륭로유로유로유로오류오류오류오류오류오류오류오오로ㅠ오류오류오류ㅗ유로유로유ㅗ류오류오",
      summary: "아아아ㅏ아아ㅏ아아아아아아아아앙아아아아아아아아아아아아아ㅏ아아ㅏㅏㅏㅏㅏㅏㅏㅏㅏ",
    });
  }
});

// ROOT
app.get("/", (req, res) => {
  res.sendFile("index.html", { root: "public" });
});

// SERVER START
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Server running on port " + PORT));

import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ==========================
//   Google Books Search
// ==========================
async function searchBook(title) {
  const url = "https://www.googleapis.com/books/v1/volumes?q=" + encodeURIComponent(title) + "&maxResults=1&key=" + process.env.GOOGLE_KEY;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json();
    if (!data.items || data.items.length === 0) return null;

    const book = data.items[0].volumeInfo;

    return {
      title: book.title || "",
      author: book.authors ? book.authors.join(", ") : "",
      description: book.description || ""
    };
  } catch (err) {
    console.error("Google API ERROR:", err);
    return null; // 실패하면 없는 걸로 처리
  }
}

// ==========================
//   SUMMARY + INTRO API
// ==========================
app.post("/api/summary", async (req, res) => {
  try {
    const { title, userStyle } = req.body;

    if (!title || title.trim().length < 1) {
      return res.json({ error: "제목이 비어있습니다." });
    }

    // 1) Google Books 먼저 검색
    const book = await searchBook(title);

    if (!book) {
      return res.json({
        error: `‘${title}’ 라는 책을 찾을 수 없습니다. 제목 오타가 있는지 확인해주세요.`
      });
    }

    // 2) AI 요약 + 소개 생성
    const fnResponse = await openai.responses.create({
      model: "gpt-4o-mini",
      input: "책 정보를 기반으로 소개와 요약을 JSON으로 출력하라.",
      reasoning: { effort: "medium" },
      tools: {
        generate: {
          output: {
            type: "object",
            properties: {
              intro: { type: "string" },
              summary: { type: "string" }
            },
            required: ["intro", "summary"]
          }
        }
      },
      tool_choice: { type: "tool", name: "generate" },
      tool_input: {
        bookTitle: book.title,
        author: book.author,
        description: book.description,
        userStyle: userStyle || "일반적인 한국어 설명",
        maxSentences: 70
      }
    });

    return res.json({
      intro: fnResponse.output.intro,
      summary: fnResponse.output.summary
    });

  } catch (e) {
    console.error("SUMMARY ERROR:", e);
    return res.json({ error: "요약 중 오류 발생" });
  }
});

// ==========================
//       STATIC (front)
// ==========================
app.use(express.static("public"));

// ==========================
//       START SERVER
// ==========================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});

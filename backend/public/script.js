document.getElementById("generateBtn").addEventListener("click", generate);

async function generate() {
  const title = document.getElementById("titleInput").value.trim();
  const lang = document.getElementById("lang").value;
  const tone = document.getElementById("tone").value;
  let num = parseInt(document.getElementById("num").value);

  if (!title) return alert("책 제목을 입력해주세요.");

  if (num > 70) num = 70;

  document.getElementById("intro").innerText = "불러오는 중...";
  document.getElementById("summary").innerText = "생성 중...";

  const res = await fetch("/api/summary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, lang, tone, num })
  });

  const data = await res.json();

  document.getElementById("intro").innerText = data.intro || "소개 생성 실패";
  document.getElementById("summary").innerText = data.summary || "요약 생성 실패";
}

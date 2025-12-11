document.getElementById("generateBtn").addEventListener("click", async () => {
  const title = document.getElementById("titleInput").value.trim();
  const lang = document.getElementById("lang").value;
  const tone = document.getElementById("tone").value;
  const num = document.getElementById("num").value;

  const intro = document.getElementById("intro");
  const summary = document.getElementById("summary");

  if (!title) return alert("책 제목이 없습니다");

  intro.innerText = "불러오는 중...";
  summary.innerText = "생성 중...";

  const res = await fetch("/api/summary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, lang, tone, num })
  });

  const data = await res.json();

  intro.innerText = data.intro || "다시 시도 해주십시오";
  summary.innerText = data.summary || "요약 생성 실패!";
});


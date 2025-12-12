const btn = document.getElementById("generateBtn");
const titleInput = document.getElementById("titleInput");
const styleInput = document.getElementById("styleInput");
const numInput = document.getElementById("num");
const introEl = document.getElementById("intro");
const summaryEl = document.getElementById("summary");

let inProgress = false;

btn.addEventListener("click", async () => {
  if (inProgress) return;
  const title = titleInput.value.trim();
  const style = styleInput.value.trim();
  let num = parseInt(numInput.value, 10) || 5;
  if (!title) return alert("책 제목을 입력하세요.");
  if (num < 1) num = 1;
  if (num > 70) num = 70;

  inProgress = true;
  btn.disabled = true;
  introEl.innerText = "불러오는 중...";
  summaryEl.innerText = "생성 중...";

  try {
    const res = await fetch("/api/summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, style, num })
    });
    const data = await res.json();

    introEl.innerText = data.intro || "소개가 있엇는데 없어용";
    summaryEl.innerText = data.summary || "요약 ㅃ2ㅃ2";
  } catch (e) {
    introEl.innerText = "오류 발생";
    summaryEl.innerText = "";
    console.error(e);
  } finally {
    inProgress = false;
    btn.disabled = false;
  }
});

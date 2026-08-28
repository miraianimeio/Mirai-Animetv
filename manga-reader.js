const readerParams = new URLSearchParams(window.location.search);
const readerMangaId = readerParams.get("manga");
let readerChapterId = readerParams.get("chapter");

let readerChapterList = [];
let readerDataSaver = false;

function currentChapterIndex() {
  return readerChapterList.findIndex(ch => ch.id === readerChapterId);
}

function chapterOptionLabel(ch) {
  const vol = ch.volume ? `Vol. ${ch.volume}, ` : "";
  return `${vol}Ch. ${ch.chapter ?? "?"}${ch.title ? " - " + ch.title : ""}`;
}

function populateChapterJump() {
  const select = document.getElementById("chapter-jump");
  if (!select) return;

  if (!readerChapterList || readerChapterList.length === 0) {
    select.innerHTML = `<option value="">No chapters available</option>`;
    return;
  }

  select.innerHTML = readerChapterList
    .map(ch => `<option value="${ch.id}" ${ch.id === readerChapterId ? "selected" : ""}>${chapterOptionLabel(ch)}</option>`)
    .join("");
}

function updateNavButtons() {
  const idx = currentChapterIndex();
  const hasPrev = idx > 0;
  const hasNext = idx >= 0 && idx < readerChapterList.length - 1;

  [document.getElementById("prev-chapter-btn"), document.getElementById("prev-chapter-btn-bottom")]
    .forEach(btn => { if (btn) btn.disabled = !hasPrev; });
  [document.getElementById("next-chapter-btn"), document.getElementById("next-chapter-btn-bottom")]
    .forEach(btn => { if (btn) btn.disabled = !hasNext; });
}

function goToChapter(chapterId) {
  if (!chapterId) return;
  const url = new URL(window.location.href);
  url.searchParams.set("chapter", chapterId);
  window.location.href = url.toString();
}

async function loadChapterPages() {
  const pagesEl = document.getElementById("reader-pages");
  if (!pagesEl) return;

  if (!readerChapterId) {
    pagesEl.innerHTML = `<p class="manga-empty" style="text-align:center; color:#ccc; padding:30px;">No chapter selected or available.</p>`;
    return;
  }

  pagesEl.innerHTML = `<p class="manga-loading" style="text-align:center; color:#aaa; padding:20px;">Loading pages...</p>`;

  const chapter = readerChapterList.find(ch => ch.id === readerChapterId);
  const labelEl = document.getElementById("reader-chapter-label");
  if (labelEl) labelEl.textContent = chapter ? chapterOptionLabel(chapter) : "Chapter";

  const creditEl = document.getElementById("scanlation-credit");
  if (creditEl) creditEl.textContent = chapter ? renderScanlationCredit(chapter.scanlationGroup) : "";

  if (chapter) document.title = `${chapterOptionLabel(chapter)} - Mirai`;

  if (chapter && chapter.externalUrl) {
    pagesEl.innerHTML = `
      <div style="text-align: center; padding: 40px 20px; background: rgba(255,255,255,0.05); border-radius: 8px; max-width: 600px; margin: 20px auto;">
        <i class="fas fa-external-link-alt" style="font-size: 2.5rem; color: #ffb347; margin-bottom: 15px;"></i>
        <h3 style="color: #fff; margin-bottom: 10px;">Official Publisher Chapter</h3>
        <p style="color: #ccc; margin-bottom: 20px;">This chapter is hosted externally by the official license holder (${chapter.scanlationGroup}).</p>
        <a href="${chapter.externalUrl}" target="_blank" rel="noopener noreferrer"
           style="display: inline-block; padding: 12px 24px; background: #ffb347; color: #000; border-radius: 6px; text-decoration: none; font-weight: bold;">
          Read on Official Website <i class="fas fa-arrow-right"></i>
        </a>
      </div>`;
    return;
  }

  try {
    const pages = await getChapterPages(readerChapterId, { dataSaver: readerDataSaver });
    if (!pages || pages.length === 0) {
      pagesEl.innerHTML = `<p class="manga-empty" style="text-align:center; color:#ccc;">No image pages found for this chapter.</p>`;
      return;
    }

    pagesEl.innerHTML = pages
      .map((p, index) => `
        <div style="text-align:center; margin-bottom: 12px;">
          <img class="reader-page-img" src="${p.url}" alt="Page ${index + 1}"
               referrerpolicy="no-referrer"
               style="max-width: 100%; height: auto; display: block; margin: 0 auto; min-height: 200px; background: #111;"
               onerror="this.onerror=null; this.alt='Failed to load page ${index + 1}'; this.style.minHeight='50px';">
        </div>
      `)
      .join("");
  } catch (err) {
    console.error("Failed to load chapter pages:", err);
    pagesEl.innerHTML = `
      <div style="text-align:center; padding: 30px; color:#ff6b6b;">
        <p>Couldn't load image pages for this chapter directly from MangaDex.</p>
        <p style="color: #aaa; font-size: 0.9rem; margin-top: 8px;">Try switching chapters or selecting a fan-scanlated group version if available.</p>
      </div>`;
  }
}

async function initReaderPage() {
  if (!readerMangaId) {
    const pagesEl = document.getElementById("reader-pages");
    if (pagesEl) pagesEl.innerHTML = `<p class="manga-empty" style="text-align:center; color:#fff;">No manga selected.</p>`;
    return;
  }

  const backLink = document.getElementById("back-to-manga");
  if (backLink) backLink.href = `manga-details.html?id=${readerMangaId}`;

  try {
    readerChapterList = await getChapterFeed(readerMangaId, { limit: 500 });
  } catch (err) {
    console.error("Failed to load chapter list:", err);
  }

  populateChapterJump();
  updateNavButtons();
  loadChapterPages();

  const jumpSelect = document.getElementById("chapter-jump");
  if (jumpSelect) jumpSelect.addEventListener("change", e => goToChapter(e.target.value));

  const prevHandler = () => {
    const idx = currentChapterIndex();
    if (idx > 0) goToChapter(readerChapterList[idx - 1].id);
  };
  const nextHandler = () => {
    const idx = currentChapterIndex();
    if (idx >= 0 && idx < readerChapterList.length - 1) goToChapter(readerChapterList[idx + 1].id);
  };

  ["prev-chapter-btn", "prev-chapter-btn-bottom"].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener("click", prevHandler);
  });

  ["next-chapter-btn", "next-chapter-btn-bottom"].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener("click", nextHandler);
  });

  const dataSaverToggle = document.getElementById("data-saver-toggle");
  if (dataSaverToggle) {
    dataSaverToggle.addEventListener("change", e => {
      readerDataSaver = e.target.checked;
      loadChapterPages();
    });
  }
}

document.addEventListener("DOMContentLoaded", initReaderPage);

function getMangaIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id");
}

let currentMangaId = null;

async function displayMangaDetails() {
  currentMangaId = getMangaIdFromUrl();
  const loadingEl = document.getElementById("manga-details-loading");
  const bodyEl = document.getElementById("manga-details-body");

  if (!currentMangaId) {
    if (loadingEl) loadingEl.textContent = "No manga selected.";
    return;
  }

  try {
    const manga = await getMangaDetails(currentMangaId);

    document.title = `${manga.title} - Mirai`;
    const coverEl = document.getElementById("manga-cover");
    if (coverEl) {
      coverEl.src = manga.coverUrl;
      coverEl.alt = manga.title;
    }

    const titleEl = document.getElementById("manga-title");
    if (titleEl) titleEl.textContent = manga.title;

    const authorsEl = document.getElementById("manga-authors");
    if (authorsEl) {
      authorsEl.textContent = manga.authors.length
        ? `Author(s): ${manga.authors.join(", ")}`
        : "Author: Unknown";
    }

    const statusEl = document.getElementById("manga-status");
    if (statusEl) {
      statusEl.textContent = `Status: ${manga.status ? manga.status.toUpperCase() : "UNKNOWN"}`;
    }

    const descEl = document.getElementById("manga-description");
    if (descEl) {
      let cleanDesc = (manga.description || "No description available.")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/\*\*/g, "");
      descEl.textContent = cleanDesc;
    }

    const tagsEl = document.getElementById("manga-tags");
    if (tagsEl && manga.tags) {
      tagsEl.innerHTML = manga.tags
        .map(tag => `<span class="manga-tag" style="display:inline-block; margin:2px 4px; padding:3px 8px; background:rgba(255,255,255,0.1); border-radius:4px; font-size:0.85rem;">${tag}</span>`)
        .join("");
    }

    if (loadingEl) loadingEl.style.display = "none";
    if (bodyEl) bodyEl.style.display = "block";

    await loadChapters("en");

  } catch (err) {
    console.error("Failed to load manga details:", err);
    if (loadingEl) loadingEl.textContent = "Couldn't load details right now. Please try refreshing.";
  }
}

async function loadChapters(language = "en") {
  const chaptersListEl = document.getElementById("manga-chapters-list");
  if (!chaptersListEl) return;

  chaptersListEl.innerHTML = `<p class="manga-loading">Loading chapters...</p>`;

  try {
    const chapters = await getChapterFeed(currentMangaId, { language, limit: 500 });

    if (!chapters || chapters.length === 0) {
      chaptersListEl.innerHTML = `<p style="color: #ccc; padding: 10px;">No chapters found in this language on MangaDex.</p>`;
      return;
    }

    chaptersListEl.innerHTML = chapters.map(ch => {
      const volStr = ch.volume ? `Vol. ${ch.volume} ` : "";
      const chNumStr = ch.chapter ? `Chapter ${ch.chapter}` : "Oneshot";
      const titleStr = ch.title ? `: ${ch.title}` : "";
      const isExternal = Boolean(ch.externalUrl);

      return `
        <div class="chapter-item" style="margin: 8px 0; padding: 12px; background: rgba(255,255,255,0.05); border-radius: 6px; display: flex; justify-content: space-between; align-items: center;">
          <a href="manga-reader.html?manga=${currentMangaId}&chapter=${ch.id}" style="color: ${isExternal ? '#ffb347' : '#4da6ff'}; text-decoration: none; font-weight: bold; font-size: 1rem;">
            ${volStr}${chNumStr}${titleStr} ${isExternal ? '<span style="font-size: 0.75rem; background: #ffb347; color: #000; padding: 2px 6px; border-radius: 4px; margin-left: 6px;">External</span>' : ''}
          </a>
          <span style="font-size: 0.8rem; color: #aaa;">${ch.scanlationGroup || "Scanlation"}</span>
        </div>
      `;
    }).join("");

  } catch (err) {
    console.error("Failed to fetch chapters:", err);
    chaptersListEl.innerHTML = `<p style="color: #ff6b6b;">Failed to load chapter list.</p>`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  displayMangaDetails();

  const langSelect = document.getElementById("chapter-language");
  if (langSelect) {
    langSelect.addEventListener("change", (e) => {
      loadChapters(e.target.value);
    });
  }
});
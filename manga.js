const BASE_URL = "https://api.mangadex.org/manga";
const MANGA_PAGE_SIZE = 20;
let mangaCurrentPage = 1;
let mangaStatusFilter = "";
let mangaContentRatingFilter = "";

const CORS_PROXIES = [
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  url => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
];

async function fetchWithFallback(url) {
  for (const proxy of CORS_PROXIES) {
    try {
      const res = await fetch(proxy(url));
      if (res.ok) return await res.json();
    } catch (e) {
      continue;
    }
  }
  throw new Error("All proxies failed");
}

function formatManga(manga) {
  const coverRel = manga.relationships?.find(r => r.type === "cover_art");
  const fileName = coverRel?.attributes?.fileName;

  const coverUrl = fileName
    ? `https://uploads.mangadex.org/covers/${manga.id}/${fileName}`
    : "https://mangadex.org/img/avatar.png";

  return {
    id: manga.id,
    title: manga.attributes.title.en || Object.values(manga.attributes.title)[0] || "Unknown Title",
    status: manga.attributes.status,
    contentRating: manga.attributes.contentRating,
    coverUrl
  };
}

async function getLatestUpdates({ limit = 12 } = {}) {
  const url = `${BASE_URL}?order[updatedAt]=desc&limit=${limit}&includes[]=cover_art`;
  const data = await fetchWithFallback(url);
  return { results: data.data ? data.data.map(formatManga) : [] };
}

async function getPopularManga({ limit = 20, offset = 0 } = {}) {
  const url = `${BASE_URL}?order[followedCount]=desc&limit=${limit}&offset=${offset}&includes[]=cover_art`;
  const data = await fetchWithFallback(url);
  return { results: data.data ? data.data.map(formatManga) : [] };
}

async function searchManga(query, { limit = 24 } = {}) {
  const url = `${BASE_URL}?title=${encodeURIComponent(query)}&limit=${limit}&includes[]=cover_art`;
  const data = await fetchWithFallback(url);
  return { results: data.data ? data.data.map(formatManga) : [] };
}

function mangaCardHtml(manga) {
  return `
  <div class="anime-card">
    <div class="poster-container">
      <a href="manga-details.html?id=${manga.id}" class="poster-link">
        <img src="${manga.coverUrl}" alt="${manga.title}" class="poster-image" loading="lazy" referrerpolicy="no-referrer">
      </a>
      ${manga.status ? `<span class="format-badge">${manga.status}</span>` : ""}
    </div>
    <h4 class="card-title">
      <a href="manga-details.html?id=${manga.id}" title="${manga.title}">
        ${manga.title}
      </a>
    </h4>
  </div>`;
}

function renderMangaGrid(containerId, mangaList) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = mangaList.length
    ? mangaList.map(mangaCardHtml).join("")
    : `<p class="manga-empty">Nothing here yet.</p>`;
}

async function loadLatestUpdates() {
  const container = document.getElementById("manga-latest-container");
  if (container) container.innerHTML = '<p class="manga-loading">Loading latest updates...</p>';
  try {
    const { results } = await getLatestUpdates({ limit: 12 });
    renderMangaGrid("manga-latest-container", results);
  } catch (err) {
    console.error("Failed to load latest manga updates:", err);
    if (container) container.innerHTML = '<p class="manga-empty">Failed to load. Check your connection and try again.</p>';
  }
}

async function loadPopularManga() {
  const offset = (mangaCurrentPage - 1) * MANGA_PAGE_SIZE;
  const container = document.getElementById("manga-popular-container");
  if (container) container.innerHTML = '<p class="manga-loading">Loading popular manga...</p>';
  try {
    const { results } = await getPopularManga({ limit: MANGA_PAGE_SIZE, offset });
    const filtered = results.filter(m => {
      if (mangaStatusFilter && m.status !== mangaStatusFilter) return false;
      if (mangaContentRatingFilter && m.contentRating !== mangaContentRatingFilter) return false;
      return true;
    });
    renderMangaGrid("manga-popular-container", filtered);
    const pageEl = document.getElementById("manga-page-indicator");
    if (pageEl) pageEl.textContent = `Page ${mangaCurrentPage}`;
  } catch (err) {
    console.error("Failed to load popular manga:", err);
    if (container) container.innerHTML = '<p class="manga-empty">Failed to load. Check your connection and try again.</p>';
  }
}

async function runMangaSearch(query) {
  const searchSection = document.getElementById("manga-search-section");
  const browseSection = document.getElementById("manga-browse-section");

  if (!query.trim()) {
    if (searchSection) searchSection.style.display = "none";
    if (browseSection) browseSection.style.display = "";
    return;
  }

  if (searchSection) searchSection.style.display = "";
  if (browseSection) browseSection.style.display = "none";

  try {
    const { results } = await searchManga(query.trim(), { limit: 24 });
    renderMangaGrid("manga-search-container", results);
  } catch (err) {
    console.error("Manga search failed:", err);
    renderMangaGrid("manga-search-container", []);
  }
}

function initMangaIndexPage() {
  loadLatestUpdates();
  loadPopularManga();

  const searchBox = document.getElementById("mangaSearchBox");
  const searchBtn = document.getElementById("mangaSearchBtn");
  let debounceTimer;

  if (searchBox) {
    searchBox.addEventListener("input", () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => runMangaSearch(searchBox.value), 400);
    });
  }
  if (searchBtn && searchBox) {
    searchBtn.addEventListener("click", () => runMangaSearch(searchBox.value));
  }

  const statusFilter = document.getElementById("filter-status");
  if (statusFilter) {
    statusFilter.addEventListener("change", e => {
      mangaStatusFilter = e.target.value;
      mangaCurrentPage = 1;
      loadPopularManga();
    });
  }

  const contentRatingFilter = document.getElementById("filter-content-rating");
  if (contentRatingFilter) {
    contentRatingFilter.addEventListener("change", e => {
      mangaContentRatingFilter = e.target.value;
      mangaCurrentPage = 1;
      loadPopularManga();
    });
  }

  const prevBtn = document.getElementById("manga-prev-page");
  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      if (mangaCurrentPage > 1) {
        mangaCurrentPage--;
        loadPopularManga();
      }
    });
  }

  const nextBtn = document.getElementById("manga-next-page");
  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      mangaCurrentPage++;
      loadPopularManga();
    });
  }
}

document.addEventListener("DOMContentLoaded", initMangaIndexPage);
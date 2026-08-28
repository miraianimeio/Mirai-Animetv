const CORS_PROXIES = [
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  url => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
];
const MANGADEX_API = "https://api.mangadex.org";
const MANGADEX_COVERS = "https://uploads.mangadex.org/covers";
const MANGADEX_REPORT_URL = "https://api.mangadex.network/report";

const MANGA_CACHE_PREFIX = "mdxCache:";
const MANGA_CACHE_TTL_MS = 1000 * 60 * 60 * 6;

const _requestQueue = [];
let _draining = false;
const MIN_GAP_MS = 220;

function _drainQueue() {
  if (_draining) return;
  _draining = true;

  const step = () => {
    const job = _requestQueue.shift();
    if (!job) {
      _draining = false;
      return;
    }
    job().finally(() => setTimeout(step, MIN_GAP_MS));
  };
  step();
}

function queuedFetch(url, options) {
  return new Promise((resolve, reject) => {
    _requestQueue.push(() =>
      fetch(url, options).then(resolve).catch(reject)
    );
    _drainQueue();
  });
}

function cacheGet(key) {
  try {
    const raw = localStorage.getItem(MANGA_CACHE_PREFIX + key);
    if (!raw) return null;
    const { value, expiresAt } = JSON.parse(raw);
    if (Date.now() > expiresAt) {
      localStorage.removeItem(MANGA_CACHE_PREFIX + key);
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

function cacheSet(key, value, ttl = MANGA_CACHE_TTL_MS) {
  try {
    localStorage.setItem(
      MANGA_CACHE_PREFIX + key,
      JSON.stringify({ value, expiresAt: Date.now() + ttl })
    );
  } catch {

  }
}

async function mdxGet(path, params = {}, { cacheKey, ttl } = {}) {
  if (cacheKey) {
    const cached = cacheGet(cacheKey);
    if (cached) return cached;
  }

  const url = new URL(MANGADEX_API + path);
  for (const [key, val] of Object.entries(params)) {
    if (val === undefined || val === null) continue;
    if (Array.isArray(val)) {
      val.forEach(v => url.searchParams.append(key, v));
    } else {
      url.searchParams.set(key, val);
    }
  }

  let lastError;
  for (const proxy of CORS_PROXIES) {
    try {
      const res = await queuedFetch(proxy(url.toString()), {
        headers: { Accept: "application/json" }
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`MangaDex ${res.status} on ${path}: ${body.slice(0, 200)}`);
      }

      const data = await res.json();
      if (cacheKey) cacheSet(cacheKey, data, ttl);
      return data;
    } catch (err) {
      lastError = err;
      continue;
    }
  }
  throw lastError;
}

function coverFileName(mangaResult) {
  const rel = (mangaResult.relationships || []).find(r => r.type === "cover_art");
  return rel && rel.attributes ? rel.attributes.fileName : null;
}

function coverUrl(mangaId, fileName, size = 512) {
  if (!fileName) return "./mirai-logo.png";
  return `${MANGADEX_COVERS}/${mangaId}/${fileName}.${size}.jpg`;
}

function authorNames(mangaResult) {
  return (mangaResult.relationships || [])
    .filter(r => r.type === "author" || r.type === "artist")
    .map(r => r.attributes && r.attributes.name)
    .filter(Boolean);
}

function bestTitle(titleObj, altTitles = []) {
  if (!titleObj) return "Untitled";
  return (
    titleObj.en ||
    Object.values(titleObj)[0] ||
    (altTitles.find(t => t.en) || {}).en ||
    "Untitled"
  );
}

function shapeManga(result) {
  const attr = result.attributes;
  return {
    id: result.id,
    title: bestTitle(attr.title, attr.altTitles),
    description: (attr.description && (attr.description.en || Object.values(attr.description)[0])) || "",
    status: attr.status,
    year: attr.year,
    contentRating: attr.contentRating,
    tags: (attr.tags || []).map(t => t.attributes.name.en).filter(Boolean),
    authors: authorNames(result),
    coverUrl: coverUrl(result.id, coverFileName(result))
  };
}

async function searchManga(title, { limit = 20, offset = 0 } = {}) {
  const data = await mdxGet("/manga", {
    title,
    limit,
    offset,
    "includes[]": ["cover_art", "author", "artist"],
    "order[relevance]": "desc",
    "contentRating[]": ["safe", "suggestive"]
  });
  return { results: data.data.map(shapeManga), total: data.total };
}

async function getPopularManga({ limit = 20, offset = 0 } = {}) {
  const data = await mdxGet(
    "/manga",
    {
      limit,
      offset,
      "includes[]": ["cover_art", "author", "artist"],
      "order[followedCount]": "desc",
      "contentRating[]": ["safe", "suggestive"],
      hasAvailableChapters: true
    },
    { cacheKey: `popular:${limit}:${offset}` }
  );
  return { results: data.data.map(shapeManga), total: data.total };
}

async function getLatestUpdates({ limit = 20 } = {}) {
  const data = await mdxGet(
    "/manga",
    {
      limit,
      "includes[]": ["cover_art", "author", "artist"],
      "order[latestUploadedChapter]": "desc",
      "contentRating[]": ["safe", "suggestive"],
      hasAvailableChapters: true
    },
    { cacheKey: `latest:${limit}`, ttl: 1000 * 60 * 10 }
  );
  return { results: data.data.map(shapeManga), total: data.total };
}

async function getMangaDetails(mangaId) {
  const data = await mdxGet(
    `/manga/${mangaId}`,
    { "includes[]": ["cover_art", "author", "artist"] },
    { cacheKey: `manga:${mangaId}` }
  );
  return shapeManga(data.data);
}

async function getChapterFeed(mangaId, { language = "en", limit = 100, offset = 0 } = {}) {
  const data = await mdxGet(`/manga/${mangaId}/feed`, {
    "translatedLanguage[]": [language],
    "order[chapter]": "asc",
    "includes[]": ["scanlation_group"],
    limit,
    offset,
    "contentRating[]": ["safe", "suggestive"]
  });

  return data.data.map(ch => {
    const group = (ch.relationships || []).find(r => r.type === "scanlation_group");
    return {
      id: ch.id,
      chapter: ch.attributes.chapter,
      volume: ch.attributes.volume,
      title: ch.attributes.title,
      pages: ch.attributes.pages,
      externalUrl: ch.attributes.externalUrl || null,
      publishAt: ch.attributes.publishAt,
      scanlationGroup: group && group.attributes ? group.attributes.name : "Unknown group"
    };
  });
}

async function getChapterPages(chapterId, { dataSaver = false } = {}) {
  const targetUrl = `${MANGADEX_API}/at-home/server/${chapterId}`;

  let lastError;
  for (const proxy of CORS_PROXIES) {
    try {
      const res = await queuedFetch(proxy(targetUrl));
      if (!res.ok) throw new Error(`SERVER_ERROR_${res.status}`);
      const data = await res.json();

      const quality = dataSaver ? "data-saver" : "data";
      const filenames = dataSaver ? data.chapter.dataSaver : data.chapter.data;

      return filenames.map(name => ({
        url: `${data.baseUrl}/${quality}/${data.chapter.hash}/${name}`,
        filename: name
      }));
    } catch (err) {
      lastError = err;
      continue;
    }
  }
  throw lastError;
}

function reportPageResult({ url, success, bytes = 0, durationMs = 0, cached = false }) {
  if (navigator.sendBeacon) {
    navigator.sendBeacon(
      MANGADEX_REPORT_URL,
      new Blob(
        [
          JSON.stringify({
            url,
            success,
            bytes,
            duration: durationMs,
            cached
          })
        ],
        { type: "application/json" }
      )
    );
  }
}

function renderScanlationCredit(scanlationGroupName) {
  return `Chapter provided by MangaDex, scanlated by ${scanlationGroupName || "an unlisted group"}.`;
}
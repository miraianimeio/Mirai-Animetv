const MIRAI_CACHE_TTL_MS = 5 * 60 * 1000;

function cacheGet(key) {
    try {
        const raw = sessionStorage.getItem(key);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (e) {
        return null;
    }
}

function cacheSet(key, data) {
    try {
        sessionStorage.setItem(key, JSON.stringify({ data, savedAt: Date.now() }));
    } catch (e) {
        
    }
}

async function fetchAniListCached(cacheKey, query, variables, renderFn) {
    const cached = cacheGet(cacheKey);
    let renderedFromCache = false;

    if (cached) {
        renderFn(cached.data);
        renderedFromCache = true;
        if (Date.now() - cached.savedAt < MIRAI_CACHE_TTL_MS) {
            return;
        }
    }

    try {
        const response = await fetch("https://graphql.anilist.co", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify({ query, variables })
        });
        if (!response.ok) throw new Error(`API Error: ${response.status}`);
        const json = await response.json();
        cacheSet(cacheKey, json);
        renderFn(json);
    } catch (error) {
        if (!renderedFromCache) throw error;
       
    }
}

const homepageQuery = `
query {
  recommended: Page (page: 1, perPage: 15) {
    media (type: ANIME, sort: SCORE_DESC) {
      id
      title { english romaji }
      coverImage { large }
      episodes
      format
      nextAiringEpisode { episode }
    }
  }
    trending: Page (page: 1, perPage: 54) {
    media (type: ANIME, sort: TRENDING_DESC) {
      id
      title { english romaji }
      coverImage { large }
      episodes
      format
      nextAiringEpisode { episode }
    }
  }
}`;

function generateCardHtml(anime) {
    const mainTitle = anime.title.english || anime.title.romaji;
    const posterUrl = anime.coverImage.large;
    const animeFormat = anime.format || "TV";

    let totalEpisodes = "?";

if (anime.nextAiringEpisode) {
    totalEpisodes = anime.nextAiringEpisode.episode - 1;
} else if (anime.episodes) {

    totalEpisodes = anime.episodes;
} else {
    totalEpisodes = 1;
}

    return `
  <div class="anime-card">
  <div class="poster-container">
    <a href="anime-details.html?id=${anime.id}" class="poster-link">
      <img src="${posterUrl}" alt="${mainTitle}" class="poster-image" loading="lazy" decoding="async">
    </a>
    <span class="format-badge">${animeFormat}</span>
    <div class="info-overlay">
      <div class="badge-group">
        <span class="badge badge-sub">
          <i class="fas fa-closed-captioning"></i> ${totalEpisodes}
        </span>
        <span class="badge badge-dub">
          <i class="fas fa-microphone"></i> ${totalEpisodes}
        </span>
      </div>
      <span class="ep-count">
        <i class="fas fa-layer-group"></i> ${totalEpisodes} EP
      </span>
    </div>
  </div>
  <h4 class="card-title">
    <a href="anime-details.html?id=${anime.id}" title="${mainTitle}">
      ${mainTitle}
    </a>
  </h4>
</div>`;
}

let trendingAnimeList = [];
let trendingPage = 1;
const trendingPageSize = 18;

function renderTrendingPage(page = 1, direction = null) {
    const trendingContainer = document.getElementById("trending-container");
    const prevBtn = document.getElementById("trending-prev-btn");
    const nextBtn = document.getElementById("trending-next-btn");
    const pageIndicator = document.getElementById("trending-page-indicator");
    if (!trendingContainer || !prevBtn || !nextBtn || !pageIndicator) return;

    const pageCount = Math.max(1, Math.ceil(trendingAnimeList.length / trendingPageSize));
    trendingPage = Math.min(Math.max(page, 1), pageCount);
    const startIndex = (trendingPage - 1) * trendingPageSize;
    const pageItems = trendingAnimeList.slice(startIndex, startIndex + trendingPageSize);

    trendingContainer.innerHTML = "";
    if (pageItems.length === 0) {
        trendingContainer.innerHTML = "<p style='padding-left: 5px; color: #4ed9ff; width: 100%; grid-column: 1 / -1;'>No trending anime available.</p>";
    } else {
        trendingContainer.insertAdjacentHTML("beforeend", pageItems.map(anime => generateCardHtml(anime)).join(""));
    }

    pageIndicator.textContent = `Page ${trendingPage} of ${pageCount}`;
    prevBtn.disabled = trendingPage <= 1;
    nextBtn.disabled = trendingPage >= pageCount;

    trendingContainer.classList.remove("page-transition-next", "page-transition-prev");
    if (direction && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        requestAnimationFrame(() => {
            trendingContainer.classList.add(`page-transition-${direction}`);
        });
    }
}

async function loadHomepageDatabase() {
    const recommendedContainer = document.getElementById("recommended-container");
    const trendingContainer = document.getElementById("trending-container");

    if(!recommendedContainer || !trendingContainer) return;

    const hasCache = !!cacheGet("mirai_homepage_cache");
    if (!hasCache) {
        recommendedContainer.innerHTML = "<p style='padding-left: 5px; color: #4ed9ff; width: 100%; grid-column: 1 / -1;'>⏳ Loading recommendations...</p>";
        trendingContainer.innerHTML = "<p style='padding-left: 5px; color: #4ed9ff; width: 100%; grid-column: 1 / -1;'>⏳ Loading trending database...</p>";
    }

    try {
        await fetchAniListCached("mirai_homepage_cache", homepageQuery, undefined, (jsonResponse) => {
            const recommendedList = jsonResponse.data.recommended.media;
            const trendingList = jsonResponse.data.trending.media;

            recommendedContainer.innerHTML = "";
            const recommendedMarkup = recommendedList.map(anime => generateCardHtml(anime)).join("");
            recommendedContainer.insertAdjacentHTML("beforeend", recommendedMarkup + recommendedMarkup);
            recommendedContainer.classList.remove("recommended-enter");
            requestAnimationFrame(() => recommendedContainer.classList.add("recommended-enter"));

            trendingAnimeList = trendingList;
            renderTrendingPage(1);
        });
    } catch (error) {
        const errorTemplate = `<p style="color: #ff3e6c; padding-left: 5px; grid-column: 1 / -1;">Error loading row contents: ${error.message}</p>`;
        recommendedContainer.innerHTML = errorTemplate;
        trendingContainer.innerHTML = errorTemplate;
    }
}

const searchInput = document.getElementById("animeSearchBox");
const searchButton = document.getElementById("animeSearchBtn");
const searchWrap = searchInput?.closest(".search-wrap");
let searchDropdown;
let searchDebounceTimer;
let searchRequestId = 0;
const searchCache = new Map();

function escapeSearchText(value) {
    return String(value || "").replace(/[&<>'"]/g, character => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
    })[character]);
}

function closeSearchDropdown() {
    if (!searchDropdown) return;
    searchDropdown.hidden = true;
    searchDropdown.innerHTML = "";
}

function renderSearchDropdown(results, keyword) {
    if (!searchDropdown) return;
    if (!results.length) {
        searchDropdown.innerHTML = `<div class="anime-search-empty">No anime found for "${escapeSearchText(keyword)}"</div>`;
        searchDropdown.hidden = false;
        return;
    }

    searchDropdown.innerHTML = results.map((anime, index) => {
        const title = anime.title.english || anime.title.romaji || "Untitled anime";
        const details = [
            anime.format || "Unknown",
            anime.episodes ? `${anime.episodes} Eps` : "Episodes unknown",
            anime.seasonYear || "Year unknown"
        ].join(" · ");
        const score = anime.averageScore ? `★ ${(anime.averageScore / 10).toFixed(1)}` : "★ --";
        return `
            <a class="anime-search-result" href="anime-details.html?id=${anime.id}" role="option" data-search-index="${index}">
                <img src="${escapeSearchText(anime.coverImage?.medium)}" alt="" width="42" height="58" loading="lazy" decoding="async">
                <span class="anime-search-result-copy">
                    <strong>${escapeSearchText(title)}</strong>
                    <small>${score} · ${escapeSearchText(details)}</small>
                </span>
            </a>`;
    }).join("");
    searchDropdown.hidden = false;
}

async function loadSearchSuggestions(keyword) {
    const normalizedKeyword = keyword.trim();
    if (normalizedKeyword.length < 2) {
        closeSearchDropdown();
        return;
    }

    const cachedResults = searchCache.get(normalizedKeyword.toLowerCase());
    if (cachedResults) {
        renderSearchDropdown(cachedResults, normalizedKeyword);
        return;
    }

    const requestId = ++searchRequestId;
    try {
        const response = await fetch("https://graphql.anilist.co", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify({
                query: `query ($search: String) {
                    Page (page: 1, perPage: 6) {
                        media (type: ANIME, search: $search, sort: SEARCH_MATCH) {
                            id
                            title { english romaji }
                            coverImage { medium }
                            averageScore
                            episodes
                            format
                            seasonYear
                        }
                    }
                }`,
                variables: { search: normalizedKeyword }
            })
        });
        if (!response.ok) throw new Error("Search request failed");
        const json = await response.json();
        if (requestId !== searchRequestId || searchInput.value.trim() !== normalizedKeyword) return;

        const results = json.data?.Page?.media || [];
        if (searchCache.size >= 20) searchCache.delete(searchCache.keys().next().value);
        searchCache.set(normalizedKeyword.toLowerCase(), results);
        renderSearchDropdown(results, normalizedKeyword);
    } catch (error) {
        if (requestId === searchRequestId) closeSearchDropdown();
    }
}

if (searchInput && searchWrap) {
    searchDropdown = document.createElement("div");
    searchDropdown.className = "anime-search-dropdown";
    searchDropdown.hidden = true;
    searchDropdown.setAttribute("role", "listbox");
    searchWrap.appendChild(searchDropdown);

    searchInput.addEventListener("input", () => {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => loadSearchSuggestions(searchInput.value), 280);
    });

    searchInput.addEventListener("keydown", event => {
        if (event.key === "Escape") closeSearchDropdown();
        if (event.key === "ArrowDown" && searchDropdown && !searchDropdown.hidden) {
            event.preventDefault();
            searchDropdown.querySelector(".anime-search-result")?.focus();
        }
    });

    searchWrap.addEventListener("click", event => event.stopPropagation());
    document.addEventListener("click", closeSearchDropdown);
}

function handleSearchRedirect() {
    if (!searchInput) return;
    const keyword = searchInput.value.trim();
    if (keyword) {
        window.location.href = `all-anime-index.html?search=${encodeURIComponent(keyword)}`;
    }
}

if (searchButton) {
    searchButton.addEventListener("click", handleSearchRedirect);
}

if (searchInput) {
    searchInput.addEventListener("keyup", (event) => {
        if (event.key === "Enter") {
            handleSearchRedirect();
        }
    });
}

document.querySelectorAll(".genre-link").forEach(button => {
    button.addEventListener("click", () => {
        window.location.href = `all-anime-index.html?genre=${encodeURIComponent(button.dataset.genre)}`;
    });
});

document.querySelectorAll(".types-link").forEach(button => {
    button.addEventListener("click", () => {
        window.location.href = `all-anime-index.html?type=${encodeURIComponent(button.dataset.type)}`;
    });
});

document.querySelectorAll(".dropdown-toggle").forEach(toggle => {
    toggle.addEventListener("click", (event) => {
        event.preventDefault();
        const parentDropdown = toggle.closest(".nav-dropdown");
        if (!parentDropdown) return;

        parentDropdown.classList.toggle("open");
        const isExpanded = parentDropdown.classList.contains("open");
        toggle.setAttribute("aria-expanded", isExpanded ? "true" : "false");
    });
});

document.addEventListener("click", (event) => {
    document.querySelectorAll(".nav-dropdown.open").forEach(dropdown => {
        if (!dropdown.contains(event.target)) {
            dropdown.classList.remove("open");
            const toggle = dropdown.querySelector(".dropdown-toggle");
            if (toggle) toggle.setAttribute("aria-expanded", "false");
        }
    });
});

const trendingPrevButton = document.getElementById("trending-prev-btn");
const trendingNextButton = document.getElementById("trending-next-btn");
if (trendingPrevButton && trendingNextButton) {
    trendingPrevButton.addEventListener("click", () => renderTrendingPage(trendingPage - 1, "prev"));
    trendingNextButton.addEventListener("click", () => renderTrendingPage(trendingPage + 1, "next"));
}

const recommendedTrack = document.getElementById("recommended-container");
const recommendedViewport = recommendedTrack?.closest(".carousel-viewport");
if (recommendedTrack && recommendedViewport) {
    let isDraggingRecommended = false;
    let dragStartX = 0;
    let dragStartScrollLeft = 0;
    let draggedRecommended = false;

    recommendedViewport.addEventListener("pointerdown", (event) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        isDraggingRecommended = true;
        draggedRecommended = false;
        dragStartX = event.clientX;
        dragStartScrollLeft = recommendedViewport.scrollLeft;
        recommendedViewport.setPointerCapture?.(event.pointerId);
        recommendedViewport.classList.add("is-dragging");
        recommendedTrack.style.animationPlayState = "paused";
    });

    recommendedViewport.addEventListener("pointermove", (event) => {
        if (!isDraggingRecommended) return;
        const distance = event.clientX - dragStartX;
        if (Math.abs(distance) > 5) draggedRecommended = true;
        if (draggedRecommended) {
            event.preventDefault();
            recommendedViewport.scrollLeft = dragStartScrollLeft - distance;
        }
    });

    const stopRecommendedDrag = (event) => {
        if (!isDraggingRecommended) return;
        isDraggingRecommended = false;
        recommendedViewport.releasePointerCapture?.(event.pointerId);
        recommendedViewport.classList.remove("is-dragging");
        if (!prefersReducedMotion.matches) {
            recommendedTrack.style.animationPlayState = "running";
        }
    };

    recommendedViewport.addEventListener("pointerup", stopRecommendedDrag);
    recommendedViewport.addEventListener("pointercancel", stopRecommendedDrag);
    recommendedViewport.addEventListener("click", (event) => {
        if (!draggedRecommended) return;
        event.preventDefault();
        event.stopPropagation();
        draggedRecommended = false;
    }, true);

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let recommendedIsVisible = false;

    const updateRecommendedMotion = (isVisible) => {
        recommendedIsVisible = isVisible;
        recommendedTrack.style.animationPlayState = isVisible && !isDraggingRecommended && !prefersReducedMotion.matches
            ? "running"
            : "paused";
    };

    let visibilityFrame = 0;
    const refreshRecommendedVisibility = () => {
        if (visibilityFrame) return;
        visibilityFrame = requestAnimationFrame(() => {
            visibilityFrame = 0;
            const bounds = recommendedViewport.getBoundingClientRect();
            updateRecommendedMotion(bounds.bottom > 0 && bounds.top < window.innerHeight);
        });
    };

    if ("IntersectionObserver" in window) {
        const carouselObserver = new IntersectionObserver(([entry]) => {
            updateRecommendedMotion(entry.isIntersecting);
        }, { threshold: 0.05 });
        carouselObserver.observe(recommendedViewport);
    } else {
        updateRecommendedMotion(true);
    }

    new MutationObserver(refreshRecommendedVisibility).observe(recommendedTrack, { childList: true });
    window.addEventListener("scroll", refreshRecommendedVisibility, { passive: true });
    window.addEventListener("resize", refreshRecommendedVisibility, { passive: true });
    refreshRecommendedVisibility();

    prefersReducedMotion.addEventListener?.("change", () => {
        updateRecommendedMotion(recommendedIsVisible);
    });
}

loadHomepageDatabase();

const video = document.getElementById('hero-video');
const image = document.getElementById('hero-image');

if (video && image) {
    if (video.querySelector('source')) {
        const revealVideo = () => {
            video.classList.remove('fade-out');
            video.classList.add('fade-in');
            image.classList.remove('fade-in');
            image.classList.add('fade-out');
            video.play().catch(() => {
                video.classList.remove('fade-in');
                video.classList.add('fade-out');
                image.classList.remove('fade-out');
                image.classList.add('fade-in');
            });
        };

        if (video.readyState >= 3) {
            revealVideo();
        } else {
            video.addEventListener('canplay', revealVideo, { once: true });
        }

        video.addEventListener('ended', function() {
            video.classList.remove('fade-in');
            video.classList.add('fade-out');
            image.classList.remove('fade-out');
            image.classList.add('fade-in');
            sessionStorage.setItem('mirai_hero_played', 'true');
        });
    }
}

function injectSafeTutorialModal() {
    if (localStorage.getItem("mirai_seen_guide_v3")) return;

    const cssStyle = document.createElement("style");
    cssStyle.textContent = `
        .m-modal-overlay {
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0, 0, 0, 0.85); backdrop-filter: blur(5px);
            z-index: 9999999; display: flex; align-items: center; justify-content: center;
            opacity: 0; transition: opacity 0.4s ease; font-family: 'Poppins', sans-serif;
            padding: 20px; box-sizing: border-box;
        }
        .m-modal-card {
            background: #111c24; border: 1px solid #1f3747; color: #fff;
            padding: 30px; border-radius: 12px; max-width: 460px; width: 100%;
            box-shadow: 0 15px 35px rgba(0,0,0,0.7); transform: translateY(-20px);
            transition: transform 0.4s ease; position: relative; box-sizing: border-box;
        }
        .m-modal-close {
            position: absolute; top: 15px; right: 20px; color: #7f8c8d;
            font-size: 26px; cursor: pointer; transition: color 0.2s;
        }
        .m-modal-close:hover { color: #e74c3c; }
        .m-title { color: #4ed9ff; font-size: 22px; margin: 0 0 5px 0; font-weight: 600; }
        .m-subtitle { color: #8a99a6; font-size: 13px; margin: 0 0 20px 0; line-height: 1.4; }
        .m-step { display: flex; align-items: flex-start; gap: 15px; margin-bottom: 20px; }
        .m-icon { background: rgba(78, 217, 255, 0.1); color: #4ed9ff; min-width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 14px; }
        .m-text { font-size: 13.5px; color: #d1dbe3; line-height: 1.5; }
        .m-text strong { color: #fff; display: block; margin-bottom: 2px; }
        .m-btn { width: 100%; background: #00a0e9; color: #fff; border: none; padding: 12px; font-size: 14px; font-weight: bold; border-radius: 6px; cursor: pointer; transition: background 0.2s; margin-top: 10px; }
        .m-btn:hover { background: #0089c7; }
    `;
    document.head.appendChild(cssStyle);

    const overlay = document.createElement("div");
    overlay.className = "m-modal-overlay";
    overlay.innerHTML = `
        <div class="m-modal-card">
            <span class="m-modal-close">&times;</span>
            <h3 class="m-title"><i class="fas fa-rocket"></i> Welcome to MiraiAnime!</h3>
            <p class="m-subtitle">Let's show you how to navigate our player system smoothly.</p>
            <div class="m-step">
                <div class="m-icon"><i class="fas fa-search"></i></div>
                <div class="m-text"><strong>Instant Smart Search</strong>Type any name in the bar up top to pull titles instantly.</div>
            </div>
            <div class="m-step">
                <div class="m-icon"><i class="fas fa-th-list"></i></div>
                <div class="m-text"><strong>Categorized Filters</strong>Browse using the "Genre" or "Types" tabs to sort lists immediately.</div>
            </div>
            <div class="m-step">
                <div class="m-icon"><i class="fas fa-play"></i></div>
                <div class="m-text"><strong>Seamless Stream Play</strong>Click into any card item wrapper details and press "Play Now".</div>
            </div>
            <button class="m-btn">Got it, let's explore!</button>
        </div>
    `;

    document.body.appendChild(overlay);

    setTimeout(() => {
        overlay.style.opacity = "1";
        overlay.querySelector(".m-modal-card").style.transform = "translateY(0)";
    }, 800);

    const closeGuide = () => {
        overlay.style.opacity = "0";
        overlay.querySelector(".m-modal-card").style.transform = "translateY(-20px)";
        setTimeout(() => {
            overlay.remove();
            localStorage.setItem("mirai_seen_guide_v3", "true");
        }, 400);
    };

    overlay.querySelector(".m-modal-close").addEventListener("click", closeGuide);
    overlay.querySelector(".m-btn").addEventListener("click", closeGuide);
}

document.addEventListener("DOMContentLoaded", () => {
    injectSafeTutorialModal();

    const navMenu = document.querySelector(".menu");
    if (navMenu) {
        const existingAllAnimeLink = Array.from(navMenu.querySelectorAll("a")).find(a => a.textContent.includes("All Anime"));
        if (!existingAllAnimeLink) {
            const allAnimeBtn = document.createElement("li");
            allAnimeBtn.innerHTML = `<a href="all-anime-index.html">All Anime</a>`;
            const homeLink = navMenu.querySelector("li");
            if (homeLink) {
                homeLink.insertAdjacentElement('afterend', allAnimeBtn);
            } else {
                navMenu.prepend(allAnimeBtn);
            }
        }
    }

    const allAnimeContainer = document.getElementById("all-anime-container");
    if (allAnimeContainer) {
        let currentPage = 1;

        const pageUrlParams = new URLSearchParams(window.location.search);
        let requestedGenre = pageUrlParams.get('genre') || "";
        let requestedType = pageUrlParams.get('type') || "";
        let requestedSearch = pageUrlParams.get('search') || "";
        let requestedYear = "";
        let requestedStatus = "";
        let requestedSeason = "";

        if(requestedGenre) document.getElementById("filter-genre").value = requestedGenre;
        if(requestedType) document.getElementById("filter-type").value = requestedType;

        const titleElement = document.querySelector("#main-homepage-content h2");
        function updateTitleText() {
            if (!titleElement) return;
            if (requestedSearch) {
                titleElement.innerHTML = `<i class="fas fa-search"></i> Search Results for "${requestedSearch}"`;
            } else if (requestedGenre || requestedType || requestedYear || requestedStatus || requestedSeason) {
                titleElement.innerHTML = `<i class="fas fa-filter"></i> Filtered Anime Index`;
            } else {
                titleElement.innerHTML = `<i class="fas fa-th-list"></i> All Anime`;
            }
        }

        async function loadAllAnimePaginated(page, direction = null) {
            allAnimeContainer.innerHTML = `<p style="color: #4ed9ff; width: 100%; text-align: center; grid-column: 1 / -1;">Loading...</p>`;
            allAnimeContainer.classList.remove("page-transition-next", "page-transition-prev");

            const query = `
            query ($page: Int, $genre: String, $format: MediaFormat, $search: String, $seasonYear: Int, $status: MediaStatus, $season: MediaSeason) {
                Page (page: $page, perPage: 18) {
                    media (type: ANIME, sort: POPULARITY_DESC, genre: $genre, format: $format, search: $search, seasonYear: $seasonYear, status: $status, season: $season) {
                        id
                        title { english romaji }
                        coverImage { large }
                        episodes
                        format
                    }
                }
            }`;

            const variables = { page: page };
            if (requestedGenre) variables.genre = requestedGenre;
            if (requestedType) variables.format = requestedType;
            if (requestedSearch) variables.search = requestedSearch;
            if (requestedYear && !isNaN(requestedYear)) variables.seasonYear = parseInt(requestedYear);
            if (requestedStatus) variables.status = requestedStatus;
            if (requestedSeason) variables.season = requestedSeason;

            try {
                const response = await fetch("https://graphql.anilist.co", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ query, variables })
                });
                const json = await response.json();
                allAnimeContainer.innerHTML = "";

                const results = json.data.Page.media;
                if (!results || results.length === 0) {
                    allAnimeContainer.innerHTML = `<p style="color: #ff3e6c; width: 100%; text-align: center; grid-column: 1 / -1;">No anime found matching your criteria.</p>`;
                    return;
                }

                results.forEach(anime => {
                    allAnimeContainer.insertAdjacentHTML("beforeend", generateCardHtml(anime));
                });
                document.getElementById("page-indicator").textContent = `Page ${page}`;
                updateTitleText();
                if (direction && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
                    requestAnimationFrame(() => {
                        allAnimeContainer.classList.add(`page-transition-${direction}`);
                    });
                }
            } catch (err) {
                allAnimeContainer.innerHTML = `<p style="color: #ff3e6c; grid-column: 1 / -1;">Error loading content.</p>`;
            }
        }

        const applyFilters = () => {
            requestedYear = document.getElementById("filter-year").value;
            requestedGenre = document.getElementById("filter-genre").value;
            requestedType = document.getElementById("filter-type").value;
            requestedStatus = document.getElementById("filter-status").value;
            requestedSeason = document.getElementById("filter-season").value;
            requestedSearch = "";
            currentPage = 1;
            loadAllAnimePaginated(currentPage);
        };

        document.getElementById("filter-year").addEventListener("change", applyFilters);
        document.getElementById("filter-genre").addEventListener("change", applyFilters);
        document.getElementById("filter-type").addEventListener("change", applyFilters);
        document.getElementById("filter-status").addEventListener("change", applyFilters);
        document.getElementById("filter-season").addEventListener("change", applyFilters);

        const prevBtn = document.getElementById("prev-page");
        const nextBtn = document.getElementById("next-page");

        if(prevBtn) {
            prevBtn.addEventListener("click", () => {
                if (currentPage > 1) {
                    currentPage--;
                    loadAllAnimePaginated(currentPage, "prev");
                }
            });
        }

        if(nextBtn) {
            nextBtn.addEventListener("click", () => {
                currentPage++;
                loadAllAnimePaginated(currentPage, "next");
            });
        }

        loadAllAnimePaginated(currentPage);
    }

    loadAiringSchedule();
    loadAiringSchedule("homeAiringScheduleList");

    loadTopAnimeRanking("day");
    initTopAnimeTabs();
});

function formatAiringCountdown(airingAtSeconds) {
    const diffMs = (airingAtSeconds * 1000) - Date.now();
    if (diffMs <= 0) return "Airing now";

    const totalMinutes = Math.floor(diffMs / 60000);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}

async function loadAiringSchedule(listId = "airingScheduleList") {
    const listEl = document.getElementById(listId);
    if (!listEl) return;

    const query = `
    query {
        Page(page: 1, perPage: 10) {
            media(type: ANIME, status: RELEASING, sort: POPULARITY_DESC) {
                id
                title { english romaji }
                coverImage { large }
                nextAiringEpisode { airingAt episode }
            }
        }
    }`;

    const renderSchedule = (json) => {
        const results = (json.data.Page.media || []).filter(anime => anime.nextAiringEpisode);

        if (results.length === 0) {
            listEl.innerHTML = `<p class="schedule-empty">No upcoming episodes found right now.</p>`;
            return;
        }

        results.sort((a, b) => a.nextAiringEpisode.airingAt - b.nextAiringEpisode.airingAt);

        listEl.innerHTML = results.slice(0, 8).map(anime => {
            const mainTitle = anime.title.english || anime.title.romaji;
            const posterUrl = anime.coverImage.large;
            const episode = anime.nextAiringEpisode.episode;
            const airingAt = anime.nextAiringEpisode.airingAt;
            const isNewSeries = episode <= 2;
            const countdownText = formatAiringCountdown(airingAt);
            const isLiveNow = countdownText === "Airing now";
            return `
              <a href="anime-details.html?id=${anime.id}" class="schedule-item">
                <img src="${posterUrl}" alt="${mainTitle}" class="schedule-thumb" loading="lazy">
                <div class="schedule-info">
                    <span class="schedule-title">${isNewSeries ? '<span class="schedule-badge-new">NEW</span>' : ''}${mainTitle}</span>
                    <div class="schedule-meta">
                        <span class="schedule-chip schedule-chip-ep">EP ${episode}</span>
                        <span class="schedule-chip schedule-chip-time${isLiveNow ? ' schedule-chip-live' : ''}">${countdownText}</span>
                    </div>
                </div>
              </a>
            `;
        }).join("");
    };

    if (!cacheGet("mirai_airing_cache")) {
        listEl.innerHTML = `<p class="top-anime-loading">Loading schedule...</p>`;
    }

    try {
        await fetchAniListCached("mirai_airing_cache", query, undefined, renderSchedule);
    } catch (err) {
        listEl.innerHTML = `<p class="schedule-error">Couldn't load the airing schedule.</p>`;
    }
}

function initTopAnimeTabs() {
    const widget = document.getElementById("topAnime");
    if (!widget) return;

    widget.querySelectorAll(".top-anime-tab").forEach(tab => {
        tab.addEventListener("click", () => {
            if (tab.classList.contains("active")) return;
            widget.querySelectorAll(".top-anime-tab").forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            loadTopAnimeRanking(tab.dataset.period);
        });
    });
}

async function loadTopAnimeRanking(period) {
    const listEl = document.getElementById("topAnimeList");
    if (!listEl) return;

    const sortMap = {
        day: "TRENDING_DESC",
        week: "POPULARITY_DESC",
        month: "FAVOURITES_DESC"
    };
    const sortField = sortMap[period] || "TRENDING_DESC";

    const cacheKey = `mirai_top_anime_cache_${period}`;
    if (!cacheGet(cacheKey)) {
        listEl.innerHTML = `<p class="top-anime-loading">Loading ranking...</p>`;
    }

    const query = `
    query ($sort: [MediaSort]) {
        Page(page: 1, perPage: 7) {
            media(type: ANIME, sort: $sort) {
                id
                title { english romaji }
                coverImage { large }
                format
                episodes
                nextAiringEpisode { episode }
            }
        }
    }`;

    const renderRanking = (json) => {
        const results = json.data.Page.media || [];

        if (results.length === 0) {
            listEl.innerHTML = `<p class="top-anime-empty">No ranking data found.</p>`;
            return;
        }

        listEl.innerHTML = results.map((anime, index) => {
            const mainTitle = anime.title.english || anime.title.romaji;
            const posterUrl = anime.coverImage.large;
            const format = anime.format || "TV";
            let episodeCount = "?";
            if (anime.nextAiringEpisode) {
                episodeCount = anime.nextAiringEpisode.episode - 1;
            } else if (anime.episodes) {
                episodeCount = anime.episodes;
            }
            return `
              <a href="anime-details.html?id=${anime.id}" class="top-anime-item">
                <span class="top-anime-rank">${index + 1}</span>
                <img src="${posterUrl}" alt="${mainTitle}" class="top-anime-thumb" loading="lazy">
                <div class="top-anime-info">
                    <span class="top-anime-title">${mainTitle}</span>
                    <div class="top-anime-meta">
                        <span class="top-anime-chip">${format}</span>
                        <span class="top-anime-chip">${episodeCount} EP</span>
                    </div>
                </div>
              </a>
            `;
        }).join("");
    };

    try {
        await fetchAniListCached(cacheKey, query, { sort: [sortField] }, renderRanking);
    } catch (err) {
        listEl.innerHTML = `<p class="top-anime-error">Couldn't load the ranking.</p>`;
    }
}

window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return; 

    if (document.getElementById("recommended-container")) {
        loadHomepageDatabase();
    }
    if (document.getElementById("airingScheduleList")) {
        loadAiringSchedule("airingScheduleList");
    }
    if (document.getElementById("homeAiringScheduleList")) {
        loadAiringSchedule("homeAiringScheduleList");
    }
    const topAnimeWidget = document.getElementById("topAnime");
    if (topAnimeWidget) {
        const activeTab = topAnimeWidget.querySelector(".top-anime-tab.active");
        loadTopAnimeRanking(activeTab ? activeTab.dataset.period : "day");
    }
    if (typeof renderContinueWatchingHome === "function" && document.getElementById("continue-watching-container")) {
        renderContinueWatchingHome();
    }
    if (typeof renderWatchHistory === "function" && document.getElementById("history-container")) {
        renderWatchHistory();
    }
});


document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
    e.preventDefault();
    const searchInput = document.getElementById('animeSearchBox');
    if (searchInput) {
      searchInput.focus();
      searchInput.select();
    }
  }
});

document.addEventListener("DOMContentLoaded", () => {

    const style = document.createElement("style");
    style.textContent = `
        .anime-modal-overlay {
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0, 0, 0, 0.88); backdrop-filter: blur(12px);
            z-index: 9999999; display: flex; align-items: center; justify-content: center;
            opacity: 0; pointer-events: none; transition: opacity 0.25s ease;
            font-family: 'Poppins', system-ui, -apple-system, sans-serif; padding: 20px; box-sizing: border-box;
        }
        .anime-modal-overlay.active { opacity: 1; pointer-events: auto; }
        
        .anime-modal-card {
            background: #0d151c; border: 1px solid #1a2936; color: #fff;
            border-radius: 16px; max-width: 860px; width: 100%; max-height: 88vh;
            overflow-y: auto; box-shadow: 0 20px 50px rgba(0,0,0,0.85);
            transform: translateY(-15px); transition: transform 0.25s ease;
            position: relative; display: flex; flex-direction: column;
            scrollbar-width: thin; scrollbar-color: #1e3040 #0d151c;
        }
        .anime-modal-card::-webkit-scrollbar { width: 6px; }
        .anime-modal-card::-webkit-scrollbar-track { background: #0d151c; }
        .anime-modal-card::-webkit-scrollbar-thumb { background: #1e3040; border-radius: 4px; }
        .anime-modal-card::-webkit-scrollbar-thumb:hover { background: #00a0e9; }

        .anime-modal-overlay.active .anime-modal-card { transform: translateY(0); }
        
        .anime-modal-close {
            position: absolute; top: 16px; right: 16px; color: #a0aec0; background: rgba(0,0,0,0.6);
            width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center;
            justify-content: center; font-size: 18px; cursor: pointer; z-index: 10; transition: all 0.2s;
            border: 1px solid rgba(255,255,255,0.1);
        }
        .anime-modal-close:hover { background: #e74c3c; color: #fff; transform: scale(1.05); }
        
        .anime-modal-banner {
            height: 200px; background-size: cover; background-position: center; position: relative; flex-shrink: 0;
        }
        .anime-modal-banner::after {
            content: ''; position: absolute; inset: 0;
            background: linear-gradient(0deg, #0d151c 0%, rgba(13,21,28,0.3) 70%, transparent 100%);
        }
        
        .anime-modal-body { padding: 0 28px 20px 28px; display: flex; gap: 24px; margin-top: -60px; position: relative; z-index: 2; flex-wrap: wrap; }
        .anime-modal-poster {
            width: 150px; aspect-ratio: 2/3; object-fit: cover; border-radius: 10px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.7); flex-shrink: 0; background: #15222e; border: 2px solid rgba(255,255,255,0.08);
        }
        
        .anime-modal-details { flex: 1; min-width: 260px; display: flex; flex-direction: column; gap: 8px; margin-top: 30px; }
        .anime-modal-title { font-size: 22px; font-weight: 700; color: #fff; line-height: 1.25; margin: 0; }
        .anime-modal-native-title { font-size: 12px; color: #64748b; margin-top: -4px; }
        
        .anime-modal-meta { display: flex; gap: 10px; align-items: center; color: #94a3b8; font-size: 12px; flex-wrap: wrap; margin-top: 2px; }
        .anime-modal-badge { background: #162634; color: #38bdf8; padding: 3px 8px; border-radius: 5px; font-weight: 600; font-size: 11px; }
        
        .anime-modal-genres { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 2px; }
        .anime-modal-genre-tag { background: #142433; color: #7dd3fc; padding: 3px 8px; border-radius: 5px; font-size: 11px; font-weight: 500; }
        
        .anime-modal-desc {
            color: #cbd5e1; font-size: 13px; line-height: 1.6; max-height: 110px;
            overflow-y: auto; margin-top: 4px; padding-right: 6px;
            scrollbar-width: thin; scrollbar-color: #1a2a3a transparent;
        }
        .anime-modal-desc::-webkit-scrollbar { width: 4px; }
        .anime-modal-desc::-webkit-scrollbar-thumb { background: #1a2a3a; border-radius: 4px; }

        .anime-modal-actions { display: flex; gap: 10px; margin-top: 8px; }
        .anime-modal-btn {
            padding: 9px 18px; border-radius: 6px; text-decoration: none; font-size: 12px;
            font-weight: 600; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; border: none; transition: all 0.2s;
        }
        .anime-modal-btn:hover { transform: translateY(-1px); filter: brightness(1.1); }
        .anime-modal-btn-play { background: #0284c7; color: #fff; box-shadow: 0 4px 12px rgba(2,132,199,0.3); }
        .anime-modal-btn-details { background: #1e293b; color: #cbd5e1; }
        
        .section-header { font-size: 14px; font-weight: 600; color: #38bdf8; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; letter-spacing: 0.2px; }
        .section-header svg { width: 16px; height: 16px; fill: currentColor; }

        .anime-modal-va-section { padding: 18px 28px; border-top: 1px solid rgba(255,255,255,0.05); }
        .anime-modal-va-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 10px; }
        
        .va-card { display: flex; justify-content: space-between; background: #121d28; border-radius: 8px; padding: 6px 10px; align-items: center; border: 1px solid rgba(255,255,255,0.03); }
        .va-person { display: flex; align-items: center; gap: 10px; }
        .va-person img { width: 38px; height: 38px; object-fit: cover; border-radius: 50%; border: 1px solid rgba(255,255,255,0.1); }
        .va-info { display: flex; flex-direction: column; }
        .va-char-name { color: #f1f5f9; font-size: 12px; font-weight: 600; line-height: 1.2; }
        .va-actor-name { color: #64748b; font-size: 11px; margin-top: 2px; }
        
        .anime-modal-similar-section { padding: 18px 28px 24px 28px; border-top: 1px solid rgba(255,255,255,0.05); }
        .anime-modal-similar-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(105px, 1fr)); gap: 10px; }
        
        .similar-card { cursor: pointer; border-radius: 8px; overflow: hidden; background: #121d28; transition: transform 0.2s, box-shadow 0.2s; border: 1px solid rgba(255,255,255,0.03); }
        .similar-card:hover { transform: translateY(-3px); box-shadow: 0 6px 15px rgba(0,0,0,0.4); }
        .similar-card img { width: 100%; aspect-ratio: 2/3; object-fit: cover; display: block; }
        .similar-card-title { color: #e2e8f0; font-size: 11px; font-weight: 500; padding: 6px 4px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-align: center; line-height: 1.2; }

        @media (max-width: 600px) {
            .anime-modal-body { flex-direction: column; align-items: center; text-align: center; margin-top: -40px; }
            .anime-modal-details { margin-top: 8px; align-items: center; }
            .anime-modal-actions { justify-content: center; }
            .anime-modal-va-grid { grid-template-columns: 1fr; }
            .anime-modal-similar-grid { grid-template-columns: repeat(3, 1fr); }
        }
    `;
    document.head.appendChild(style);

    const modalOverlay = document.createElement("div");
    modalOverlay.className = "anime-modal-overlay";
    modalOverlay.id = "anime-expanded-modal";
    modalOverlay.innerHTML = `
        <div class="anime-modal-card">
            <span class="anime-modal-close" id="close-expanded-modal">&times;</span>
            <div class="anime-modal-banner" id="modal-banner"></div>
            <div class="anime-modal-body">
                <img src="" alt="Poster" class="anime-modal-poster" id="modal-poster">
                <div class="anime-modal-details">
                    <h2 class="anime-modal-title" id="modal-title">Loading...</h2>
                    <span class="anime-modal-native-title" id="modal-native-title"></span>
                    
                    <div class="anime-modal-meta">
                        <span class="anime-modal-badge" id="modal-format">--</span>
                        <span><span id="modal-year">----</span></span>
                        <span>•</span>
                        <span><span id="modal-episodes">--</span> EP</span>
                        <span>•</span>
                        <span><span id="modal-status">--</span></span>
                        <span>•</span>
                        <span style="color:#f59e0b; font-weight:600;">★ <span id="modal-score">--</span></span>
                    </div>
                    
                    <div class="anime-modal-genres" id="modal-genres"></div>
                    <p class="anime-modal-desc" id="modal-desc">Fetching details...</p>

                    <div class="anime-modal-actions">
                        <a href="#" class="anime-modal-btn anime-modal-btn-play" id="modal-play-btn">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> Watch Now
                        </a>
                        <a href="#" class="anime-modal-btn anime-modal-btn-details" id="modal-details-btn">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg> Details
                        </a>
                    </div>
                </div>
            </div>

            <div class="anime-modal-va-section">
                <div class="section-header">
                    <svg viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
                    Main Characters & Voice Actors
                </div>
                <div class="anime-modal-va-grid" id="modal-va-container">
                    <p style="color:#64748b; font-size:12px; grid-column:1/-1;">Loading cast...</p>
                </div>
            </div>

            <div class="anime-modal-similar-section">
                <div class="section-header">
                    <svg viewBox="0 0 24 24"><path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12z"/></svg>
                    You Might Also Like
                </div>
                <div class="anime-modal-similar-grid" id="modal-similar-container">
                    <p style="color:#64748b; font-size:12px; grid-column:1/-1;">Loading recommendations...</p>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modalOverlay);

    const expandedQuery = `
    query ($id: Int) {
      Media (id: $id) {
        id
        title { english romaji native }
        coverImage { extraLarge }
        bannerImage
        description
        seasonYear
        episodes
        format
        status
        averageScore
        genres
        nextAiringEpisode { episode }
        characters (perPage: 6, sort: [ROLE, RELEVANCE]) {
          edges {
            role
            node {
              name { full }
              image { medium }
            }
            voiceActors (language: JAPANESE) {
              name { full }
              image { medium }
            }
          }
        }
        recommendations (perPage: 6, sort: RATING_DESC) {
          nodes {
            mediaRecommendation {
              id
              title { english romaji }
              coverImage { medium }
            }
          }
        }
      }
    }`;

    async function openExpandedModal(animeId) {
        document.getElementById("modal-title").textContent = "Loading...";
        document.getElementById("modal-native-title").textContent = "";
        document.getElementById("modal-desc").textContent = "Loading anime data...";
        document.getElementById("modal-poster").src = "";
        document.getElementById("modal-banner").style.backgroundImage = "none";
        document.getElementById("modal-genres").innerHTML = "";
        document.getElementById("modal-va-container").innerHTML = "<p style='color:#64748b; font-size:12px; grid-column:1/-1;'>Loading cast...</p>";
        document.getElementById("modal-similar-container").innerHTML = "<p style='color:#64748b; font-size:12px; grid-column:1/-1;'>Loading recommendations...</p>";

        modalOverlay.classList.add("active");

        try {
            const response = await fetch("https://graphql.anilist.co", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query: expandedQuery, variables: { id: parseInt(animeId) } })
            });

            const json = await response.json();
            const media = json.data?.Media;
            if (!media) throw new Error("Data not found.");

            const mainTitle = media.title.english || media.title.romaji;
            const cover = media.coverImage.extraLarge;
            const banner = media.bannerImage || cover;
            const score = media.averageScore ? (media.averageScore / 10).toFixed(1) : "N/A";
            const year = media.seasonYear || "N/A";
            const totalEps = media.episodes || "?";
            const cleanDesc = media.description ? media.description.replace(/<[^>]*>?/gm, '') : "No synopsis provided.";

            let availableEps = totalEps;
            if (media.nextAiringEpisode) {
                availableEps = media.nextAiringEpisode.episode - 1;
            }

            document.getElementById("modal-title").textContent = mainTitle;
            document.getElementById("modal-native-title").textContent = media.title.native || "";
            document.getElementById("modal-poster").src = cover;
            document.getElementById("modal-banner").style.backgroundImage = `url('${banner}')`;
            document.getElementById("modal-format").textContent = media.format || "TV";
            document.getElementById("modal-year").textContent = year;
            document.getElementById("modal-episodes").textContent = `${availableEps} / ${totalEps}`;
            document.getElementById("modal-status").textContent = media.status || "UNKNOWN";
            document.getElementById("modal-score").textContent = score;
            document.getElementById("modal-desc").textContent = cleanDesc;

            document.getElementById("modal-genres").innerHTML = (media.genres || [])
                .map(g => `<span class="anime-modal-genre-tag">${g}</span>`).join("");

            document.getElementById("modal-play-btn").href = `watch.html?id=${media.id}`;
            document.getElementById("modal-details-btn").href = `anime-details.html?id=${media.id}`;

            const charEdges = media.characters?.edges || [];
            const vaContainer = document.getElementById("modal-va-container");

            if (charEdges.length === 0) {
                vaContainer.innerHTML = "<p style='color:#64748b; font-size:12px; grid-column:1/-1;'>No voice actor details indexed.</p>";
            } else {
                vaContainer.innerHTML = charEdges.map(edge => {
                    const charName = edge.node?.name?.full || "Unknown";
                    const charImg = edge.node?.image?.medium || "";
                    const va = edge.voiceActors?.[0];
                    const vaName = va ? va.name.full : "N/A";
                    const vaImg = va ? va.image.medium : "";

                    return `
                        <div class="va-card">
                            <div class="va-person">
                                <img src="${charImg}" alt="${charName}">
                                <div class="va-info">
                                    <span class="va-char-name">${charName}</span>
                                    <span class="va-actor-name">${vaName}</span>
                                </div>
                            </div>
                            ${vaImg ? `<div class="va-person"><img src="${vaImg}" alt="${vaName}"></div>` : ''}
                        </div>
                    `;
                }).join("");
            }

            const similarNodes = media.recommendations?.nodes || [];
            const similarContainer = document.getElementById("modal-similar-container");
            
            if (similarNodes.length === 0) {
                similarContainer.innerHTML = "<p style='color:#64748b; font-size:12px; grid-column:1/-1;'>No recommendations found.</p>";
            } else {
                similarContainer.innerHTML = similarNodes
                    .filter(n => n.mediaRecommendation)
                    .map(n => {
                        const rec = n.mediaRecommendation;
                        const recTitle = rec.title.english || rec.title.romaji;
                        return `
                            <div class="similar-card" data-rec-id="${rec.id}">
                                <img src="${rec.coverImage.medium}" alt="${recTitle}" loading="lazy">
                                <div class="similar-card-title">${recTitle}</div>
                            </div>
                        `;
                    }).join("");
            }

        } catch (err) {
            document.getElementById("modal-title").textContent = "Error Loading Details";
            document.getElementById("modal-desc").textContent = err.message;
        }
    }

    document.addEventListener("click", (e) => {
        const card = e.target.closest(".anime-card");
        const similarCard = e.target.closest(".similar-card");

        if (similarCard) {
            e.preventDefault();
            const recId = similarCard.dataset.recId;
            if (recId) openExpandedModal(recId);
            return;
        }

        if (card) {
            const link = card.querySelector("a[href*='id=']");
            let animeId = card.dataset.id;
            
            if (!animeId && link) {
                const match = link.href.match(/id=(\d+)/);
                if (match) animeId = match[1];
            }

            if (animeId) {
                e.preventDefault();
                openExpandedModal(animeId);
            }
        }
    });

    const closeModal = () => modalOverlay.classList.remove("active");
    document.getElementById("close-expanded-modal").addEventListener("click", closeModal);
    modalOverlay.addEventListener("click", (e) => {
        if (e.target === modalOverlay) closeModal();
    });
});

(async function loadAnimeDetailsVoiceActors() {
    const vaContainer = document.getElementById("anime-details-va-grid");
    if (!vaContainer) return;

    const urlParams = new URLSearchParams(window.location.search);
    const animeId = urlParams.get("id");
    if (!animeId) return;

    const vaQuery = `
    query ($id: Int) {
      Media (id: $id) {
        characters (perPage: 8, sort: [ROLE, RELEVANCE]) {
          edges {
            node {
              name { full }
              image { medium }
            }
            voiceActors (language: JAPANESE) {
              name { full }
              image { medium }
            }
          }
        }
      }
    }`;

    try {
        const response = await fetch("https://graphql.anilist.co", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: vaQuery, variables: { id: parseInt(animeId) } })
        });

        const json = await response.json();
        const charEdges = json.data?.Media?.characters?.edges || [];

        if (charEdges.length === 0) {
            vaContainer.innerHTML = "<p style='color:#64748b;'>No voice actor details found.</p>";
            return;
        }

        vaContainer.innerHTML = charEdges.map(edge => {
            const charName = edge.node?.name?.full || "Unknown";
            const charImg = edge.node?.image?.medium || "";
            const va = edge.voiceActors?.[0];
            const vaName = va ? va.name.full : "N/A";
            const vaImg = va ? va.image.medium : "";

            return `
                <div class="va-card" style="display:flex; justify-content:space-between; background:#121d28; border-radius:8px; padding:6px 10px; align-items:center; border:1px solid rgba(255,255,255,0.03);">
                    <div class="va-person" style="display:flex; align-items:center; gap:10px;">
                        <img src="${charImg}" alt="${charName}" style="width:38px; height:38px; object-fit:cover; border-radius:50%;">
                        <div class="va-info" style="display:flex; flex-direction:column;">
                            <span style="color:#f1f5f9; font-size:12px; font-weight:600;">${charName}</span>
                            <span style="color:#64748b; font-size:11px;">${vaName}</span>
                        </div>
                    </div>
                    ${vaImg ? `<img src="${vaImg}" alt="${vaName}" style="width:38px; height:38px; object-fit:cover; border-radius:50%;">` : ''}
                </div>
            `;
        }).join("");

    } catch (err) {
        vaContainer.innerHTML = "<p style='color:#ef4444;'>Failed to load voice actors.</p>";
    }
})();
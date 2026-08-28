const WATCH_HISTORY_KEY = "watchHistory";

function getWatchHistory() {
  try {
    return JSON.parse(localStorage.getItem(WATCH_HISTORY_KEY)) || [];
  } catch (err) {
    return [];
  }
}

function setWatchHistory(history) {
  localStorage.setItem(WATCH_HISTORY_KEY, JSON.stringify(history));
}

function formatRelativeTime(timestamp) {
  const diffSeconds = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSeconds < 60) return "Just now";
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 5) return `${diffWeeks}w ago`;
  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths}mo ago`;
}

function generateHistoryCardHtml(entry) {
  const posterUrl = entry.poster || "logo.png";
  const title = entry.title || "Unknown Anime";
  const watchHref = `watch.html?id=${entry.id}&ep=${entry.episode}`;
  const progressPercent = entry.totalEpisodes
    ? Math.max(4, Math.min(100, Math.round((entry.episode / entry.totalEpisodes) * 100)))
    : 6;

  return `
  <div class="history-row" data-history-id="${entry.id}">
    <a href="${watchHref}" class="history-row-thumb">
      <img src="${posterUrl}" alt="${title}">
      <span class="history-row-play"><i class="fas fa-play"></i></span>
    </a>
    <div class="history-row-info">
      <a href="${watchHref}" class="history-row-title" title="${title}">${title}</a>
      <div class="history-row-meta">
        <span class="history-row-episode">EPISODE <b>${entry.episode}</b></span>
        <span class="history-row-time">${formatRelativeTime(entry.updatedAt)}</span>
      </div>
      <div class="history-row-progress">
        <div class="history-row-progress-fill" style="width:${progressPercent}%"></div>
      </div>
    </div>
    <button type="button" class="history-row-remove" data-remove-id="${entry.id}" title="Remove from history">
      <i class="fas fa-xmark"></i>
    </button>
  </div>`;
}

function renderWatchHistory() {
  const container = document.getElementById("history-container");
  const emptyState = document.getElementById("history-empty-state");
  const clearBtn = document.getElementById("clear-history-btn");
  if (!container) return;

  const history = getWatchHistory();

  if (history.length === 0) {
    container.innerHTML = "";
    if (emptyState) emptyState.style.display = "flex";
    if (clearBtn) clearBtn.style.display = "none";
    return;
  }

  if (emptyState) emptyState.style.display = "none";
  if (clearBtn) clearBtn.style.display = "inline-flex";

  container.innerHTML = history.map(generateHistoryCardHtml).join("");

  container.querySelectorAll(".history-row-remove").forEach(btn => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const idToRemove = btn.dataset.removeId;
      const updatedHistory = getWatchHistory().filter(item => String(item.id) !== String(idToRemove));
      setWatchHistory(updatedHistory);
      renderWatchHistory();
    });
  });
}

function generateContinueWatchingCardHtml(entry) {
  const posterUrl = entry.poster || "logo.png";
  const title = entry.title || "Unknown Anime";
  const watchHref = `watch.html?id=${entry.id}&ep=${entry.episode}`;
  const progressPercent = entry.totalEpisodes
    ? Math.max(4, Math.min(100, Math.round((entry.episode / entry.totalEpisodes) * 100)))
    : 6;

  return `
  <div class="anime-card cw-card" data-history-id="${entry.id}">
    <div class="poster-container">
      <a href="${watchHref}" class="poster-link">
        <img src="${posterUrl}" alt="${title}" class="poster-image">
        <span class="cw-play-overlay"><i class="fas fa-play"></i></span>
      </a>
      <span class="format-badge">EP ${entry.episode}</span>
      <button type="button" class="cw-remove-btn" data-remove-id="${entry.id}" title="Remove from history">
        <i class="fas fa-xmark"></i>
      </button>
      <div class="cw-progress-track">
        <div class="cw-progress-fill" style="width:${progressPercent}%"></div>
      </div>
    </div>
    <h4 class="card-title">
      <a href="${watchHref}" title="${title}">${title}</a>
    </h4>
  </div>`;
}

function renderContinueWatchingHome() {
  const section = document.getElementById("continue-watching-section");
  const container = document.getElementById("continue-watching-container");
  if (!section || !container) return;

  const history = getWatchHistory();

  if (history.length === 0) {
    section.style.display = "none";
    container.innerHTML = "";
    return;
  }

  section.style.display = "block";
  container.innerHTML = history.map(generateContinueWatchingCardHtml).join("");

  container.querySelectorAll(".cw-remove-btn").forEach(btn => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const idToRemove = btn.dataset.removeId;
      const updatedHistory = getWatchHistory().filter(item => String(item.id) !== String(idToRemove));
      setWatchHistory(updatedHistory);
      renderContinueWatchingHome();
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  renderWatchHistory();
  renderContinueWatchingHome();

  const clearBtn = document.getElementById("clear-history-btn");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      if (confirm("Clear your entire watch history? This can't be undone.")) {
        setWatchHistory([]);
        renderWatchHistory();
      }
    });
  }

  const downloadBtn = document.getElementById("download-history-btn");
  if (downloadBtn) {
    downloadBtn.addEventListener("click", () => {
      const history = getWatchHistory();
      if (history.length === 0) return;

      const data = {
        exportedAt: new Date().toISOString(),
        totalEntries: history.length,
        watchHistory: history.map(entry => ({
          title: entry.title,
          anilistId: entry.id,
          lastEpisodeWatched: entry.episode,
          totalEpisodes: entry.totalEpisodes,
          poster: entry.poster,
          lastWatchedAt: entry.updatedAt ? new Date(entry.updatedAt).toISOString() : null
        }))
      };

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mirai-watch-history-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  const cwTrack = document.getElementById("continue-watching-container");
  const cwPrevBtn = document.getElementById("cw-prev-btn");
  const cwNextBtn = document.getElementById("cw-next-btn");
  if (cwTrack && cwPrevBtn && cwNextBtn) {
    const scrollAmount = () => Math.round(cwTrack.clientWidth * 0.8);
    cwPrevBtn.addEventListener("click", () => {
      cwTrack.scrollBy({ left: -scrollAmount(), behavior: "smooth" });
    });
    cwNextBtn.addEventListener("click", () => {
      cwTrack.scrollBy({ left: scrollAmount(), behavior: "smooth" });
    });
  }
});


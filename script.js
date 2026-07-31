/* =============================================================
   VibeBoard — vanilla JavaScript
   - Calls Unsplash + YouTube directly (prototype only)
   - Extracts dominant colors from Unsplash `color` field
   - Dynamically retheme the UI via CSS variables
   - LocalStorage for saved packs
   ============================================================= */

// ⚠️ Prototype-only: keys are in the client. For production, proxy through a server.
const UNSPLASH_ACCESS_KEY = "Uu82lAm8tUuvMdmUMOZB6swJdKhXgUFZbZ6eHt-PcbI";
const YOUTUBE_API_KEY = "AIzaSyDezIcKsQxc8zy6SnMomYwPGzkcetGrchA";

const UNSPLASH_URL = "https://api.unsplash.com/search/photos";
const YOUTUBE_URL = "https://www.googleapis.com/youtube/v3/search";

const PRESET_MOODS = [
  { id: "rainy-cafe",      label: "Rainy Cafe",       emoji: "☕️", imageQuery: "rainy cafe cozy window coffee aesthetic",  videoQuery: "rainy coffee shop ambience lofi" },
  { id: "soft-girl",       label: "Soft Girl",        emoji: "🌸", imageQuery: "soft pastel pink flowers aesthetic soft girl", videoQuery: "soft aesthetic playlist pastel lofi" },
  { id: "midnight-coding", label: "Midnight Coding",  emoji: "🌙", imageQuery: "midnight coding desk neon dark aesthetic", videoQuery: "midnight coding lofi ambience" },
  { id: "gamer-setup",     label: "Gamer Setup",      emoji: "🎮", imageQuery: "gamer setup rgb neon battlestation",       videoQuery: "gaming ambience synthwave chill" },
  { id: "study-room",      label: "Study Room",       emoji: "📚", imageQuery: "cozy study room desk books warm light aesthetic", videoQuery: "study with me lofi library ambience" },
  { id: "forest-escape",   label: "Forest Escape",    emoji: "🌲", imageQuery: "misty forest green nature aesthetic",       videoQuery: "forest ambience nature sounds relaxing" },
  { id: "summer-beach",    label: "Summer Beach",     emoji: "🏖️", imageQuery: "summer beach ocean sunset aesthetic",       videoQuery: "beach ambience ocean waves lofi" },
  { id: "space-dream",     label: "Space Dream",      emoji: "🚀", imageQuery: "space nebula stars galaxy aesthetic",       videoQuery: "space ambient music cosmic drift" },
  { id: "cozy-autumn",     label: "Cozy Autumn",      emoji: "🍂", imageQuery: "cozy autumn fall leaves warm sweater aesthetic", videoQuery: "autumn cafe ambience lofi" },
  { id: "cyberpunk",       label: "Cyberpunk",        emoji: "🌆", imageQuery: "cyberpunk neon city night rain aesthetic",  videoQuery: "cyberpunk ambient synthwave night" },
];

// ---------------------------------------------------
// State
// ---------------------------------------------------
const state = {
  loading: false,
  activePreset: null,
  pack: null,           // { query, preset, resolvedQuery, palette, images, videos }
  activeVideoId: null,
  saved: loadSaved(),
};

// ---------------------------------------------------
// DOM refs
// ---------------------------------------------------
const $ = (sel) => document.querySelector(sel);
const chipsEl     = $("#chips");
const loadingEl   = $("#loading");
const emptyEl     = $("#empty");
const packEl      = $("#pack");
const anchorEl    = $("#anchor");
const savedBtn    = $("#savedBtn");
const savedCount  = $("#savedCount");
const drawer      = $("#drawer");
const savedListEl = $("#savedList");
const searchForm  = $("#searchForm");
const searchInput = $("#searchInput");
const searchSubmit= $("#searchSubmit");
const toastEl     = $("#toast");

// ---------------------------------------------------
// Init
// ---------------------------------------------------
function init() {
  renderChips();
  updateSavedCount();
  bindEvents();
  handleDeepLink();
}

function bindEvents() {
  searchForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = searchInput.value.trim();
    if (q) runSearch({ query: q });
  });

  savedBtn.addEventListener("click", () => openDrawer());
  drawer.addEventListener("click", (e) => {
    if (e.target.dataset.close !== undefined) closeDrawer();
  });
}

function handleDeepLink() {
  const params = new URLSearchParams(location.search);
  const mood = params.get("mood");
  const q = params.get("q");
  if (mood) {
    const m = PRESET_MOODS.find((x) => x.id === mood);
    if (m) runSearch({ mood: m });
  } else if (q) {
    searchInput.value = q;
    runSearch({ query: q });
  }
}

// ---------------------------------------------------
// Render mood chips
// ---------------------------------------------------
function renderChips() {
  chipsEl.innerHTML = "";
  PRESET_MOODS.forEach((m) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip";
    btn.dataset.moodId = m.id;
    btn.innerHTML = `<span class="chip-emoji">${m.emoji}</span><span>${m.label}</span>`;
    btn.addEventListener("click", () => runSearch({ mood: m }));
    chipsEl.appendChild(btn);
  });
}

function setActiveChip(id) {
  chipsEl.querySelectorAll(".chip").forEach((c) => {
    c.dataset.active = c.dataset.moodId === id ? "true" : "false";
  });
}

// ---------------------------------------------------
// Search — core dual-API workflow
// ---------------------------------------------------
async function runSearch({ mood, query }) {
  state.loading = true;
  state.activePreset = mood ? mood.id : null;
  setActiveChip(state.activePreset);
  showLoading();

  try {
    const imgQuery = mood ? mood.imageQuery : `${query} aesthetic`;
    const vidQuery = mood ? mood.videoQuery : `${query} ambience lofi`;
    const resolvedQuery = mood ? mood.label : query;

    const [images, videos] = await Promise.all([
      fetchUnsplash(imgQuery),
      fetchYouTube(vidQuery),
    ]);

    const palette = buildPalette(images);
    state.pack = {
      query: query || mood.label,
      preset: mood ? mood.id : null,
      resolvedQuery,
      palette,
      images,
      videos,
    };
    state.activeVideoId = videos[0]?.id || null;

    applyVibeTheme(palette);
    renderPack();
    scrollAnchor();
  } catch (err) {
    console.error(err);
    toast(err.message || "Something drifted off.");
  } finally {
    state.loading = false;
    hideLoading();
  }
}

async function fetchUnsplash(query) {
  const url = `${UNSPLASH_URL}?query=${encodeURIComponent(query)}&per_page=9&orientation=landscape&content_filter=high`;
  const res = await fetch(url, {
    headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` },
  });
  if (!res.ok) throw new Error(`Unsplash error: ${res.status}`);
  const data = await res.json();
  return (data.results || []).map((it) => ({
    id: it.id,
    url: it.urls.regular,
    thumb: it.urls.small,
    color: it.color || "#111111",
    alt: it.alt_description,
    author: it.user?.name || "Unknown",
    link: it.links?.html || "https://unsplash.com",
  }));
}

async function fetchYouTube(query) {
  const params = new URLSearchParams({
    part: "snippet",
    q: query,
    type: "video",
    maxResults: "6",
    videoEmbeddable: "true",
    videoCategoryId: "10",
    safeSearch: "moderate",
    key: YOUTUBE_API_KEY,
  });
  let res = await fetch(`${YOUTUBE_URL}?${params.toString()}`);
  if (!res.ok) {
    // retry without music category filter
    params.delete("videoCategoryId");
    res = await fetch(`${YOUTUBE_URL}?${params.toString()}`);
    if (!res.ok) throw new Error(`YouTube error: ${res.status}`);
  }
  const data = await res.json();
  return (data.items || [])
    .filter((it) => it.id?.videoId)
    .map((it) => ({
      id: it.id.videoId,
      title: it.snippet?.title || "",
      channel: it.snippet?.channelTitle || "",
      thumbnail:
        it.snippet?.thumbnails?.high?.url ||
        it.snippet?.thumbnails?.medium?.url ||
        it.snippet?.thumbnails?.default?.url ||
        "",
    }));
}

// ---------------------------------------------------
// Palette + dynamic theming
// ---------------------------------------------------
function buildPalette(images) {
  const seen = [];
  for (const img of images) {
    const c = (img.color || "").toLowerCase();
    if (c && !seen.includes(c) && c !== "#000000") seen.push(c);
    if (seen.length >= 5) break;
  }
  return seen.length ? seen : ["#7c5cff"];
}

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const num = parseInt(full, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function rgbToHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function pickAccent(palette) {
  if (!palette.length) return { h: 250, s: 60, l: 60 };
  const scored = palette
    .map((hex) => rgbToHsl(hexToRgb(hex)))
    .map((c) => ({ ...c, score: c.s * 1.2 - Math.abs(c.l - 55) }))
    .sort((a, b) => b.score - a.score);
  const top = scored[0];
  return {
    h: top.h,
    s: Math.max(top.s, 45),
    l: Math.min(Math.max(top.l, 45), 68),
  };
}

function applyVibeTheme(palette) {
  const { h, s, l } = pickAccent(palette);
  const root = document.documentElement;
  root.style.setProperty("--vibe-h", String(h));
  root.style.setProperty("--vibe-s", `${s}%`);
  root.style.setProperty("--vibe-l", `${l}%`);
  root.style.setProperty("--vibe-color", `hsl(${h} ${s}% ${l}%)`);
  root.style.setProperty("--vibe-glow", `hsla(${h}, ${s}%, ${l}%, 0.22)`);
  root.style.setProperty("--vibe-border", `hsla(${h}, ${s}%, ${l}%, 0.45)`);
  root.style.setProperty("--vibe-soft", `hsla(${h}, ${s}%, ${l}%, 0.10)`);
}

// ---------------------------------------------------
// Rendering — Vibe Pack
// ---------------------------------------------------
function renderPack() {
  const p = state.pack;
  if (!p) return;
  emptyEl.classList.add("hidden");
  packEl.classList.remove("hidden");

  const savedId = packId(p);
  const isSaved = state.saved.some((s) => s.id === savedId);

  packEl.innerHTML = `
    <div class="pack-header">
      <div>
        <p class="pack-label">Vibe Pack</p>
        <h2 class="pack-title">${escapeHtml(p.resolvedQuery)}</h2>
      </div>
      <div class="pack-actions">
        <button id="saveBtn" class="pack-btn" ${isSaved ? "disabled" : ""}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="${isSaved ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
          ${isSaved ? "Saved" : "Save Vibe"}
        </button>
        <button id="shareBtn" class="pack-btn">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 3.9M15.4 6.6L8.6 10.5"/></svg>
          Share
        </button>
        <div class="palette">
          ${p.palette.slice(0, 5).map((c) => `<span class="palette-swatch" style="background:${c}"></span>`).join("")}
        </div>
      </div>
    </div>

    <div class="moodboard fade-up">
      ${p.images.slice(0, 9).map((img, i) => `
        <a class="bento fade-up" style="animation-delay:${i * 60}ms; background:${img.color}" href="${img.link}" target="_blank" rel="noopener">
          <img src="${img.url}" alt="${escapeHtml(img.alt || p.resolvedQuery)}" loading="lazy" />
          <div class="bento-credit"><span>by ${escapeHtml(img.author)}</span></div>
        </a>
      `).join("")}
    </div>

    ${p.videos.length > 0 ? `
      <div class="videos fade-up">
        <div class="videos-heading">
          <span class="videos-dot"></span>
          <p class="videos-label">Matching Ambience</p>
        </div>
        <div class="video-layout">
          <div class="video-player-col">
            <div class="video-player" id="videoPlayer"></div>
            <h3 class="video-title" id="videoTitle"></h3>
            <p class="video-channel" id="videoChannel"></p>
          </div>
          <div class="video-list-col">
            <div class="video-list">
              ${p.videos.map((v) => `
                <button class="video-item" data-video-id="${v.id}" data-active="${v.id === state.activeVideoId}">
                  <div class="video-thumb"><img src="${v.thumbnail}" alt="" loading="lazy" /></div>
                  <div class="video-item-text">
                    <p class="video-item-title">${escapeHtml(v.title)}</p>
                    <p class="video-item-channel">${escapeHtml(v.channel)}</p>
                  </div>
                </button>
              `).join("")}
            </div>
          </div>
        </div>
      </div>
    ` : ""}
  `;

  // Wire up video player + list
  if (state.activeVideoId) mountVideo(state.activeVideoId);
  packEl.querySelectorAll(".video-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.videoId;
      state.activeVideoId = id;
      packEl.querySelectorAll(".video-item").forEach((b) => {
        b.dataset.active = b.dataset.videoId === id ? "true" : "false";
      });
      mountVideo(id);
    });
  });

  // Wire up save/share
  packEl.querySelector("#saveBtn")?.addEventListener("click", handleSave);
  packEl.querySelector("#shareBtn")?.addEventListener("click", handleShare);
}

function mountVideo(id) {
  const p = state.pack;
  const v = p.videos.find((x) => x.id === id);
  if (!v) return;
  const player = $("#videoPlayer");
  const title = $("#videoTitle");
  const channel = $("#videoChannel");
  if (player) {
    player.innerHTML = `<iframe src="https://www.youtube.com/embed/${id}?rel=0&modestbranding=1" title="${escapeHtml(v.title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
  }
  if (title) title.textContent = v.title;
  if (channel) channel.textContent = v.channel;
}

// ---------------------------------------------------
// Save / Share / Local storage
// ---------------------------------------------------
function packId(p) {
  return `${p.preset || "custom"}::${p.query.toLowerCase().trim()}`;
}

function loadSaved() {
  try {
    return JSON.parse(localStorage.getItem("vibeboard.saved.v1") || "[]");
  } catch { return []; }
}

function persistSaved() {
  localStorage.setItem("vibeboard.saved.v1", JSON.stringify(state.saved));
  updateSavedCount();
}

function updateSavedCount() {
  savedCount.textContent = String(state.saved.length);
}

function handleSave() {
  const p = state.pack;
  if (!p) return;
  const id = packId(p);
  if (state.saved.some((s) => s.id === id)) return;
  state.saved.unshift({
    id,
    query: p.query,
    preset: p.preset,
    resolvedQuery: p.resolvedQuery,
    palette: p.palette,
    thumbs: p.images.slice(0, 4).map((i) => i.thumb),
    savedAt: new Date().toISOString(),
  });
  state.saved = state.saved.slice(0, 30);
  persistSaved();
  renderPack();
  toast("Vibe saved to your board");
}

function handleShare() {
  const p = state.pack;
  if (!p) return;
  const url = new URL(location.origin + location.pathname);
  if (p.preset) url.searchParams.set("mood", p.preset);
  else url.searchParams.set("q", p.query);
  navigator.clipboard?.writeText(url.toString()).then(
    () => toast("Share link copied"),
    () => toast("Copy failed — link: " + url.toString())
  );
}

function deleteSaved(id) {
  state.saved = state.saved.filter((s) => s.id !== id);
  persistSaved();
  renderSavedList();
  toast("Removed");
}

function openSaved(item) {
  closeDrawer();
  if (item.preset) {
    const m = PRESET_MOODS.find((x) => x.id === item.preset);
    if (m) runSearch({ mood: m });
  } else {
    searchInput.value = item.query;
    runSearch({ query: item.query });
  }
}

// ---------------------------------------------------
// Drawer
// ---------------------------------------------------
function openDrawer() {
  drawer.classList.remove("hidden");
  renderSavedList();
}
function closeDrawer() { drawer.classList.add("hidden"); }

function renderSavedList() {
  if (!state.saved.length) {
    savedListEl.innerHTML = `<p class="saved-empty">No packs saved yet. Conjure a mood and hit save to keep it.</p>`;
    return;
  }
  savedListEl.innerHTML = state.saved.map((s) => `
    <div class="saved-item">
      <div class="saved-thumbs">
        ${(s.thumbs || []).slice(0, 4).map((t) => `<img src="${t}" alt="" />`).join("")}
      </div>
      <div class="saved-info">
        <p class="saved-info-title">${escapeHtml(s.resolvedQuery)}</p>
        <div class="saved-info-palette">
          ${(s.palette || []).slice(0, 4).map((c) => `<span style="background:${c}"></span>`).join("")}
        </div>
      </div>
      <div class="saved-actions">
        <button class="saved-action" data-open="${s.id}" title="Open">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14L21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>
        </button>
        <button class="saved-action delete" data-delete="${s.id}" title="Delete">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
        </button>
      </div>
    </div>
  `).join("");

  savedListEl.querySelectorAll("[data-open]").forEach((b) =>
    b.addEventListener("click", () => {
      const item = state.saved.find((s) => s.id === b.dataset.open);
      if (item) openSaved(item);
    })
  );
  savedListEl.querySelectorAll("[data-delete]").forEach((b) =>
    b.addEventListener("click", () => deleteSaved(b.dataset.delete))
  );
}

// ---------------------------------------------------
// UI helpers
// ---------------------------------------------------
function showLoading() {
  emptyEl.classList.add("hidden");
  packEl.classList.add("hidden");
  loadingEl.classList.remove("hidden");
  searchSubmit.disabled = true;
}
function hideLoading() {
  loadingEl.classList.add("hidden");
  searchSubmit.disabled = false;
}
function scrollAnchor() {
  setTimeout(() => anchorEl?.scrollIntoView({ behavior: "smooth", block: "start" }), 250);
}

let toastTimer = null;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2400);
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Boot
init();

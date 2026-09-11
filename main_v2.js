// ==========================================================
// Cobblemon : Trinity — script joueurs / Twitch (version fusionnée)
// ⚠️ IMPORTANT : penser à régénérer/vérifier régulièrement le
// accessToken (les tokens Twitch expirent, en général sous 60 jours).
// ==========================================================

// ----- Config -----
const TWITCH_CLIENT_ID = "gp762nuuoqcoxypju8c569th9wz7q5";
const TWITCH_ACCESS_TOKEN = "79v1l8ku6pve2me1o9ggjpjorozzcl";

// ✅ Domaine parent corrigé (avant: blueredemption2.carrd.co, reliquat de l'ancien projet)
const PARENT_DOMAIN = "cobblemontrinity.carrd.co";

const PLAYERDATA_URL = "https://raw.githubusercontent.com/pommecakeVT/BRDATABASE/refs/heads/main/twitchv2";
const SOCIAL_URLS = {
  bluesky: "https://raw.githubusercontent.com/pommecakeVT/BRDATABASE/refs/heads/main/bluesky",
  instagram: "https://raw.githubusercontent.com/pommecakeVT/BRDATABASE/refs/heads/main/instagram",
  tiktok: "https://raw.githubusercontent.com/pommecakeVT/BRDATABASE/refs/heads/main/tiktok",
  twitter: "https://raw.githubusercontent.com/pommecakeVT/BRDATABASE/refs/heads/main/twitter",
  youtube: "https://raw.githubusercontent.com/pommecakeVT/BRDATABASE/refs/heads/main/youtube",
};
const FALLBACK_AVATAR = "https://i.ibb.co/NgTXMdDW/twitch-update.gif";

const REFRESH_TWITCH_MS = 60 * 1000;       // statuts live toutes les 60s
const REFRESH_DB_MS = 10 * 60 * 1000;      // DB joueurs toutes les 10min

// ----- État global -----
let cachedPlayerData = [];
let lastDbFetch = 0;
let hasRenderedList = false; // pour ne construire le DOM qu'une seule fois

// ==========================================================
// Chargement de la base joueurs (GitHub RAW)
// ==========================================================
async function loadPlayerData(force = false) {
  const now = Date.now();
  if (!force && cachedPlayerData.length > 0 && (now - lastDbFetch) < REFRESH_DB_MS) {
    return cachedPlayerData;
  }
  try {
    const res = await fetch(PLAYERDATA_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("JSON invalide (pas un tableau)");
    cachedPlayerData = data;
    lastDbFetch = now;
    return cachedPlayerData;
  } catch (err) {
    console.error("❌ Impossible de charger la DB joueurs:", err);
    return cachedPlayerData; // on continue avec le cache existant, site pas cassé
  }
}

// ==========================================================
// Appels Twitch (streams + users, en chunks de 50)
// ==========================================================
async function fetchTwitchData(playerData) {
  const chunkSize = 50;
  const chunks = [];
  for (let i = 0; i < playerData.length; i += chunkSize) {
    chunks.push(playerData.slice(i, i + chunkSize));
  }

  let allStreams = [];
  let allUsers = [];

  await Promise.all(chunks.map(async (chunk) => {
    const logins = chunk.map(p => (p.twitch || "").toLowerCase()).filter(Boolean);
    if (logins.length === 0) return;

    const headers = {
      "Client-ID": TWITCH_CLIENT_ID,
      "Authorization": `Bearer ${TWITCH_ACCESS_TOKEN}`,
    };

    const streamUrl = `https://api.twitch.tv/helix/streams?user_login=${logins.join("&user_login=")}`;
    const streamRes = await fetch(streamUrl, { headers });
    if (streamRes.ok) {
      const s = await streamRes.json();
      allStreams = allStreams.concat(s.data || []);
    } else {
      console.error("❌ Erreur streams:", streamRes.status, await streamRes.text());
    }

    const userUrl = `https://api.twitch.tv/helix/users?${logins.map(u => "login=" + u).join("&")}`;
    const userRes = await fetch(userUrl, { headers });
    if (userRes.ok) {
      const u = await userRes.json();
      allUsers = allUsers.concat(u.data || []);
    } else {
      console.error("❌ Erreur users:", userRes.status, await userRes.text());
    }
  }));

  return { allStreams, allUsers };
}

// ==========================================================
// Compteurs (viewers / participants live)
// ==========================================================
function updateCounters(allStreams) {
  const totalViewers = allStreams.reduce((sum, s) => sum + (s.viewer_count || 0), 0);
  const totalParticipants = allStreams.length;

  const viewersEl = document.getElementById("totalViewers");
  if (viewersEl) animateNumber(viewersEl, totalViewers, 900);

  const participantsEl = document.getElementById("totalParticipants");
  if (participantsEl) animateNumber(participantsEl, totalParticipants, 700);
}

function animateNumber(element, newValue, duration = 800) {
  if (!element) return;
  const startValue = parseInt(element.textContent.replace(/\D/g, "")) || 0;
  const endValue = parseInt(newValue) || 0;
  const startTime = performance.now();

  function update(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = Math.round(startValue + (endValue - startValue) * eased).toLocaleString("fr-FR");
    if (progress < 1) requestAnimationFrame(update);
  }
  requestAnimationFrame(update);
}

// ==========================================================
// Construction initiale de la liste des joueurs (une seule fois)
// ==========================================================
function renderPlayerList(playerData) {
  const container = document.getElementById("playerList");
  if (!container) return;

  container.innerHTML = playerData.map(player => `
    <div class="player-wrapper" data-player-id="${player.id}">
      <div class="player-avatar-container">
        <img id="${player.id}" class="player-avatar offline"
             src="${player.avatar || FALLBACK_AVATAR}"
             onclick="openPopup('${player.id}')" />
      </div>
      <p class="player-name">${player.twitch}</p>
    </div>
  `).join("");

  hasRenderedList = true;
}

// ==========================================================
// Mise à jour des avatars / statuts live (sans reconstruire le DOM)
// ==========================================================
function updateAvatars(allStreams, allUsers, playerData) {
  playerData.forEach(player => {
    const img = document.getElementById(player.id);
    if (!img) return;

    const liveInfo = allStreams.find(s => s.user_login.toLowerCase() === player.twitch.toLowerCase());
    const userInfo = allUsers.find(u => u.login.toLowerCase() === player.twitch.toLowerCase());
    const isLive = !!liveInfo;

    let borderColor = "#B7B3AC"; // offline
    if (isLive) {
      borderColor = liveInfo.game_id === "27471" ? "#5FAF5F" : "#F2D171"; // 27471 = Minecraft
    }

    if (userInfo && userInfo.profile_image_url) {
      img.src = userInfo.profile_image_url;
    }

    img.parentElement.style.borderColor = borderColor;
    img.classList.toggle("online", isLive);
    img.classList.toggle("offline", !isLive);

    // ✅ on stocke isLive/game sur l'objet joueur pour le tri
    player.isLive = isLive;
    player.game = isLive ? (liveInfo.game_name || "Autre") : "Hors ligne";
  });
}

// ==========================================================
// Tri (live en priorité, puis alphabétique) + réordonnancement DOM
// ⚠️ le filtre "redemption II" vient de l'ancien projet Blue Redemption,
// à adapter/retirer si ça ne correspond plus au contexte Cobblemon
// ==========================================================
function sortPlayers(playerData) {
  return [...playerData].sort((a, b) => {
    const aGame = (a.game || "").toLowerCase();
    const bGame = (b.game || "").toLowerCase();

    if (a.isLive && b.isLive) {
      if (aGame.includes("redemption ii") && !bGame.includes("redemption ii")) return -1;
      if (!aGame.includes("redemption ii") && bGame.includes("redemption ii")) return 1;
    }
    if (a.isLive && !b.isLive) return -1;
    if (!a.isLive && b.isLive) return 1;
    return a.twitch.localeCompare(b.twitch);
  });
}

function reorderPlayerList(playerData) {
  const container = document.getElementById("playerList");
  if (!container) return;

  const sorted = sortPlayers(playerData);
  sorted.forEach(player => {
    const node = container.querySelector(`[data-player-id="${player.id}"]`);
    if (node) container.appendChild(node); // déplace le noeud à la fin dans le nouvel ordre
  });
}

// ==========================================================
// Boucle principale
// ==========================================================
async function checkLiveStatus() {
  const playerData = await loadPlayerData(false);
  if (!playerData || playerData.length === 0) {
    console.error("🚨 Aucune donnée joueur disponible.");
    return;
  }

  if (!hasRenderedList) {
    renderPlayerList(playerData);
  }

  try {
    const { allStreams, allUsers } = await fetchTwitchData(playerData);
    updateCounters(allStreams);
    updateAvatars(allStreams, allUsers, playerData);
    reorderPlayerList(playerData); // ✅ re-tri dynamique à chaque refresh
  } catch (err) {
    console.error("❌ Erreur checkLiveStatus:", err);
  }
}

// ==========================================================
// Réseaux sociaux (pop-up)
// ==========================================================
let socialCache = null;
let socialCachePromise = null;

async function loadSocialDBs() {
  if (socialCache) return socialCache;
  if (socialCachePromise) return socialCachePromise;

  socialCachePromise = (async () => {
    const entries = await Promise.all(
      Object.entries(SOCIAL_URLS).map(async ([key, url]) => {
        try {
          const r = await fetch(url, { cache: "no-store" });
          const j = await r.json();
          return [key, Array.isArray(j) ? j : []];
        } catch (e) {
          console.error(`❌ Social DB KO (${key})`, e);
          return [key, []];
        }
      })
    );
    socialCache = Object.fromEntries(entries);
    return socialCache;
  })();

  return socialCachePromise;
}

async function updateSocialLinks(playerId) {
  const db = await loadSocialDBs();

  const setBtn = (id, key) => {
    const url = db[key]?.find(p => p.id === playerId)?.[key] || "#";
    const el = document.getElementById(`popup-${id}`);
    if (!el) return;
    el.href = url;
    el.style.display = (url && url !== "#") ? "inline-flex" : "none";
  };

  setBtn("bluesky", "bluesky");
  setBtn("instagram", "instagram");
  setBtn("tiktok", "tiktok");
  setBtn("twitter", "twitter");
  setBtn("youtube", "youtube");
}

// ==========================================================
// Pop-up joueur
// ==========================================================
function openPopupSafe(playerId) {
  if (typeof window.openPopup === "function") {
    return window.openPopup(playerId);
  }
  console.warn("⚠️ Popup pas encore chargée, réessaie dans 1s.");
}
window.openPopup = openPopupSafe; // sera remplacé juste en dessous

window.openPopup = async function (playerId) {
  const player = cachedPlayerData.find(p => p.id === playerId);
  if (!player) {
    console.error(`🚨 Joueur non trouvé : ${playerId}`);
    return;
  }

  const twitchEmbed = document.getElementById("popup-twitch");
  const twitchChat = document.getElementById("popup-chat");

  if (player.twitch) {
    twitchEmbed.src = `https://player.twitch.tv/?channel=${player.twitch}&parent=${PARENT_DOMAIN}`;
    twitchChat.src = `https://www.twitch.tv/embed/${player.twitch}/chat?darkpopout&parent=${PARENT_DOMAIN}`;
  } else {
    twitchEmbed.src = "";
    twitchChat.src = "";
  }

  await updateSocialLinks(playerId);

  const popup = document.getElementById("popup-player");
  const overlay = document.getElementById("modal-overlay");
  if (!popup || !overlay) {
    console.error("🚨 Impossible de trouver le pop-up !");
    return;
  }

  popup.classList.add("active");
  overlay.classList.add("active");
  popup.style.display = "block";
  overlay.style.display = "block";
};

window.closePopup = function () {
  const popup = document.getElementById("popup-player");
  const overlay = document.getElementById("modal-overlay");
  if (!popup || !overlay) return;

  popup.classList.remove("active");
  overlay.classList.remove("active");

  setTimeout(() => {
    popup.style.display = "none";
    overlay.style.display = "none";
  }, 300);

  document.getElementById("popup-twitch").src = "";
  document.getElementById("popup-chat").src = "";
};

// ==========================================================
// Navigation (onglets carrd-btn)
// ==========================================================
(function initNav() {
  const btns = Array.from(document.querySelectorAll(".carrd-btn"));

  function setActiveById(id) {
    btns.forEach(b => b.classList.toggle("is-active", b.dataset.target === id));
  }

  function getHashId() {
    return (window.location.hash || "#home").replace("#", "").trim() || "home";
  }

  function syncFromHash() {
    setActiveById(getHashId());
  }
  window.addEventListener("hashchange", syncFromHash);
  syncFromHash();

  const targets = ["home", "lives", "forms"].map(id => document.getElementById(id)).filter(Boolean);
  if (targets.length) {
    const io = new IntersectionObserver((entries) => {
      const visible = entries.filter(e => e.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible?.target?.id) setActiveById(visible.target.id);
    }, { threshold: [0.35, 0.5, 0.65] });
    targets.forEach(el => io.observe(el));
  }

  btns.forEach(b => {
    b.addEventListener("click", (e) => {
      const id = b.dataset.target;
      const el = document.getElementById(id);
      if (!el) return;
      e.preventDefault();
      history.pushState(null, "", "#" + id);
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveById(id);
    });
  });
})();

// ==========================================================
// Init unique (un seul système, un seul interval)
// ==========================================================
(async () => {
  await loadPlayerData(true);
  await checkLiveStatus();
  setInterval(checkLiveStatus, REFRESH_TWITCH_MS);
})();

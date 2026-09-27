var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

// shared/http.js
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
var DEADLINE_MS = 4e4;
var running = 0;
var idle = [];
var deadline = Infinity;
function send(url, opts) {
  if (Date.now() > deadline) return Promise.reject(new Error(`deadline reached, skipped ${url}`));
  running++;
  const done = () => {
    if (--running === 0) idle.splice(0).forEach((resolve) => resolve());
  };
  return fetch(url, opts).then((res) => {
    done();
    return res;
  }, (err) => {
    done();
    throw err;
  });
}
function provider(getStreams2) {
  return {
    getStreams(...args) {
      return __async(this, null, function* () {
        deadline = Date.now() + DEADLINE_MS;
        let streams = [];
        try {
          streams = (yield getStreams2(...args)) || [];
        } catch (e) {
          console.error(e.message);
        }
        if (running) yield new Promise((resolve) => idle.push(resolve));
        return streams;
      });
    }
  };
}
function request(_0) {
  return __async(this, arguments, function* (url, opts = {}) {
    const res = yield send(url, Object.assign({}, opts, { headers: Object.assign({ "User-Agent": UA }, opts.headers) }));
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    return res;
  });
}
var getText = (url, opts) => __async(null, null, function* () {
  return (yield request(url, opts)).text();
});
var getJson = (url, opts) => __async(null, null, function* () {
  return JSON.parse(yield getText(url, opts));
});

// shared/tmdb.js
function getMeta(tmdbId, mediaType) {
  return __async(this, null, function* () {
    const type = mediaType === "tv" ? "tv" : "movie";
    const d = yield getJson(`https://api.themoviedb.org/3/${type}/${tmdbId}?api_key=${globalThis.TMDB_API_KEY}&language=de-DE&append_to_response=external_ids,translations,alternative_titles`);
    const tr = (d.translations || {}).translations || [];
    const en = tr.find((t) => t.iso_639_1 === "en" && t.iso_3166_1 === "US") || tr.find((t) => t.iso_639_1 === "en");
    const alts = ((d.alternative_titles || {}).titles || (d.alternative_titles || {}).results || []).filter((a) => a.iso_3166_1 === "DE" || a.iso_3166_1 === "AT").map((a) => a.title);
    const title = d.title || d.name;
    const originalTitle = d.original_title || d.original_name;
    const englishTitle = en && (en.data.title || en.data.name);
    const date = d.release_date || d.first_air_date || "";
    return {
      tmdbId: String(tmdbId),
      type,
      title,
      originalTitle,
      englishTitle,
      year: date ? Number(date.slice(0, 4)) : null,
      imdbId: (d.external_ids || {}).imdb_id || d.imdb_id || null,
      titles: [title, originalTitle, englishTitle].concat(alts).filter((t, i, a) => t && a.indexOf(t) === i)
    };
  });
}

// shared/match.js
function norm(s) {
  s = String(s || "").toLowerCase();
  if (s.normalize) s = s.normalize("NFD").replace(/[̀-ͯ]/g, "");
  return s.replace(/ß/g, "ss").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}
function score(title, year, meta) {
  const t = norm(title);
  if (!t) return 0;
  let s = 0;
  for (const m of meta.titles.map(norm)) {
    if (t === m) s = Math.max(s, 3);
    else if (m.length > 3 && (t.includes(m) || m.includes(t))) s = Math.max(s, 1);
  }
  if (year && meta.year) {
    const d = Math.abs(Number(year) - meta.year);
    s += d === 0 ? 2 : d === 1 ? 1 : -2;
  }
  return s;
}
function pickBest(items, meta) {
  let best = null, bestScore = 2;
  for (const it of items) {
    const s = score(it.title, it.year, meta);
    if (s > bestScore) {
      best = it;
      bestScore = s;
    }
  }
  return best;
}

// src/plutotv/index.js
var uuid = () => "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => (Math.random() * 16 | (c === "y" ? 8 : 0)).toString(16).slice(-1));
function getStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    try {
      const meta = yield getMeta(tmdbId, mediaType);
      const boot = yield getJson(`https://boot.pluto.tv/v4/start?appName=web&appVersion=9.22.0&deviceVersion=142.0.0&deviceModel=web&deviceMake=firefox&clientID=${uuid()}&clientModelNumber=1.0.0`);
      const servers = boot.servers;
      const headers = { Authorization: `Bearer ${boot.sessionToken}` };
      const type = mediaType === "tv" ? "series" : "movie";
      for (const q of meta.titles) {
        const found = ((yield getJson(`${servers.search}/v1/search?q=${encodeURIComponent(q)}&limit=100`, { headers })).data || []).filter((r) => r.type === type);
        if (!found.length) continue;
        const items = (yield getJson(`${servers.vod}/v4/vod/items?ids=${found.map((r) => r.id).join(",")}`, { headers })).map((i) => ({ title: i.name, year: ((i.clip || {}).originalReleaseDate || "").slice(0, 4) || null, id: i._id, stitched: i.stitched }));
        const hit = pickBest(items, meta);
        if (!hit) continue;
        let stitched = hit.stitched;
        if (type === "series") {
          const info = yield getJson(`${servers.vod}/v4/vod/series/${hit.id}/seasons`, { headers });
          const s = (info.seasons || []).find((s2) => s2.number === season);
          const ep = s && s.episodes.find((e) => e.number === episode);
          if (!ep) return [];
          stitched = ep.stitched;
        }
        if (!stitched || !stitched.path || stitched.type && stitched.type !== "hls") return [];
        return [{
          name: "PlutoTV",
          title: `${hit.title} \xB7 Deutsch \xB7 HLS`,
          url: `${servers.stitcher}/v2${stitched.path}?jwt=${boot.sessionToken}&masterJWTPassthrough=true`,
          quality: "auto",
          headers
        }];
      }
    } catch (e) {
      console.error(`[PlutoTV] ${e.message}`);
    }
    return [];
  });
}
module.exports = provider(getStreams);

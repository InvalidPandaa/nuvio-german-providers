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
var LANGS = [
  [/ger-?sub/i, "Ger-Sub"],
  [/eng-?sub/i, "Eng-Sub"],
  [/\bomu\b/i, "OmU"],
  [/\bov\b/i, "OV"],
  [/englisch|\ben\b/i, "Englisch"],
  [/franz|\bfr\b/i, "Franz\xF6sisch"],
  [/deutsch|\bde\b/i, "Deutsch"]
];
function decorate(s) {
  const lang = (LANGS.find(([re]) => re.test(s.title || "")) || [])[1] || "Deutsch";
  const quality = s.quality && s.quality !== "auto" ? s.quality : /\.m3u8|\/hls|master/i.test(s.url) ? "HLS" : "MP4";
  const host = ((s.title || "").split(" \xB7 ")[0].match(/^[\w-]+\.[a-z]{2,}$/) || [])[0];
  return Object.assign({}, s, { name: [s.name, lang, host].filter(Boolean).join(" \xB7 "), quality });
}
function provider(getStreams2) {
  return {
    getStreams(tmdbId, mediaType, season, episode) {
      return __async(this, null, function* () {
        deadline = Date.now() + DEADLINE_MS;
        if (mediaType !== "movie") mediaType = "tv";
        let streams = [];
        try {
          streams = (yield getStreams2(tmdbId, mediaType, season, episode)) || [];
        } catch (e) {
          console.error(e.message);
        }
        if (running) yield new Promise((resolve) => idle.push(resolve));
        return streams.map(decorate);
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

// src/welt/index.js
var HEADERS = {
  "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:149.0) Gecko/20100101 Firefox/149.0",
  "Accept-Language": "en-US,en;q=0.9",
  "Sec-GPC": "1",
  "Cache-Control": "no-cache"
};
var QUALITY = { 700: "360p", 1200: "432p", 2400: "720p", 4800: "1080p" };
function getStreams(tmdbId, mediaType) {
  return __async(this, null, function* () {
    if (mediaType !== "movie") return [];
    try {
      const meta = yield getMeta(tmdbId, mediaType);
      for (const q of meta.titles) {
        const res = yield getJson(`https://www.welt.de/api/search/${encodeURIComponent(q)}?offset=0&section=mediathek`, { headers: HEADERS });
        const hit = pickBest((res.items || []).filter((i) => i.type === "video").map((i) => ({ title: i.headline, url: i.url })), meta);
        if (!hit) continue;
        const html = yield getText(hit.url, { headers: HEADERS });
        const video = (html.match(/<noscript><video[\s\S]*?<\/video>/) || [""])[0];
        const sources = [];
        video.replace(/<source src="([^"]+)" type="([^"]+)"/g, (_, src, type) => sources.push({ src, type }));
        return sources.map(({ src, type }) => {
          const hls = /mpegurl/i.test(type);
          const quality = hls ? "auto" : QUALITY[(src.match(/_(\d+)\.mp4/) || [])[1]] || "auto";
          return { name: "Welt", title: `Deutsch \xB7 ${quality} \xB7 ${hls ? "HLS" : "MP4"}`, url: src, quality };
        }).sort((a, b) => (parseInt(b.quality) || 1e4) - (parseInt(a.quality) || 1e4));
      }
    } catch (e) {
      console.error(`[Welt] ${e.message}`);
    }
    return [];
  });
}
module.exports = provider(getStreams);

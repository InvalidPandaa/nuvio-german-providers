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
function request(_0) {
  return __async(this, arguments, function* (url, opts = {}) {
    const res = yield fetch(url, Object.assign({}, opts, { headers: Object.assign({ "User-Agent": UA }, opts.headers) }));
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
    const title2 = d.title || d.name;
    const originalTitle = d.original_title || d.original_name;
    const englishTitle = en && (en.data.title || en.data.name);
    const date = d.release_date || d.first_air_date || "";
    return {
      tmdbId: String(tmdbId),
      type,
      title: title2,
      originalTitle,
      englishTitle,
      year: date ? Number(date.slice(0, 4)) : null,
      imdbId: (d.external_ids || {}).imdb_id || d.imdb_id || null,
      titles: [title2, originalTitle, englishTitle].concat(alts).filter((t, i, a) => t && a.indexOf(t) === i)
    };
  });
}

// shared/match.js
function norm(s) {
  s = String(s || "").toLowerCase();
  if (s.normalize) s = s.normalize("NFD").replace(/[̀-ͯ]/g, "");
  return s.replace(/ß/g, "ss").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}
function score(title2, year, meta) {
  const t = norm(title2);
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

// src/ard/index.js
var API = "https://api.ardmediathek.de";
var ACCESSIBLE = /Audiodeskription|Gebärdensprache|Klare Sprache/i;
var LANGS = { deu: "Deutsch", eng: "Englisch", fra: "Franz\xF6sisch", ov: "OV" };
var title = (t) => (t.shortTitle || t.longTitle || t.title || "").trim();
var targetId = (t) => ((t.links || {}).target || {}).id || t.id;
var search = (kind, q) => getJson(`${API}/search-system/search/${kind}/ard?query=${encodeURIComponent(q)}&pageSize=30&platform=MEDIA_THEK&sortingCriteria=SCORE_DESC`).then((r) => r.teasers || []);
function findShow(meta, types) {
  return __async(this, null, function* () {
    for (const q of meta.titles) {
      const shows = (yield search("shows", q)).filter((t) => types.test(t.coreAssetType || ""));
      const hit = pickBest(shows.map((t) => ({ title: title(t), id: targetId(t) })), meta);
      if (hit) return hit;
    }
    return null;
  });
}
function groupingTeasers(showId, compilation) {
  return __async(this, null, function* () {
    const page = yield getJson(`${API}/page-gateway/pages/ard/grouping/${showId}?seasoned=true&embedded=true`);
    let widgets = (page.widgets || []).filter((w) => w.compilationType === compilation);
    if (!widgets.length) widgets = (page.widgets || []).filter((w) => /^itemsOf/.test(w.compilationType || ""));
    const out = [];
    for (const w of widgets) {
      let teasers = w.teasers || [];
      const self = ((w.links || {}).self || {}).href;
      if (self && w.pagination && teasers.length < w.pagination.totalElements) {
        teasers = [];
        for (let p = 0; teasers.length < Math.min(w.pagination.totalElements, 1e3); p++) {
          const next = (yield getJson(self.replace(/pageNumber=\d+/, `pageNumber=${p}`).replace(/pageSize=\d+/, "pageSize=200"))).teasers || [];
          if (!next.length) break;
          teasers = teasers.concat(next);
        }
      }
      for (const t of teasers) {
        if ((t.coreAssetType === "EPISODE" || /Originalversion|\(OV\)/.test(title(t))) && !ACCESSIBLE.test(title(t))) out.push(t);
      }
    }
    return out;
  });
}
function tmdbEpisodeName(tmdbId, season, episode) {
  return __async(this, null, function* () {
    try {
      return (yield getJson(`https://api.themoviedb.org/3/tv/${tmdbId}/season/${season}/episode/${episode}?api_key=${globalThis.TMDB_API_KEY}&language=de-DE`)).name;
    } catch (e) {
      return null;
    }
  });
}
function findEpisodes(meta, season, episode) {
  return __async(this, null, function* () {
    const show = yield findShow(meta, /SERIES$/);
    if (!show) return [];
    const teasers = yield groupingTeasers(show.id, "itemsOfSeason");
    const tag = new RegExp(`\\(S0*${season}/E0*${episode}\\)`);
    let hits = teasers.filter((t) => tag.test(title(t)));
    if (!hits.length) {
      const name = norm(yield tmdbEpisodeName(meta.tmdbId, season, episode));
      if (name.length > 3) hits = teasers.filter((t) => norm(title(t)).split(norm(show.title))[0].trim() === name || norm(title(t)) === name);
    }
    return hits;
  });
}
function findMovie(meta) {
  return __async(this, null, function* () {
    const show = yield findShow(meta, /^SINGLE$/);
    if (show) return groupingTeasers(show.id, "itemsOfShow");
    for (const q of meta.titles) {
      const vods = (yield search("vods", q)).filter((t) => t.coreAssetType === "EPISODE" && t.duration >= 3e3 && !ACCESSIBLE.test(title(t)));
      const hit = pickBest(vods.map((t) => ({ title: title(t), t })), meta);
      if (hit) return [hit.t];
    }
    return [];
  });
}
function streamsOf(teaser) {
  return __async(this, null, function* () {
    const item = yield getJson(`${API}/page-gateway/pages/ard/item/${targetId(teaser)}?embedded=true&mcV6=true`);
    const player = (item.widgets || []).find((w) => /^player/.test(w.type || ""));
    const embedded = player && player.mediaCollection && player.mediaCollection.embedded;
    if (!embedded) return [];
    let media = [].concat.apply([], (embedded.streams || []).map((s) => s.media || []));
    const standard = media.filter((m) => !(m.audios || []).some((a) => a.kind === "audio-description" || a.kind === "speech-optimized"));
    if (standard.length) media = standard;
    return media.filter((m) => m.url).map((m) => {
      const hls = /mpegurl/i.test(m.mimeType || "") || /\.m3u8/.test(m.url);
      const lang = ((m.audios || [])[0] || {}).languageCode;
      return {
        name: "ARD",
        title: [title(teaser), LANGS[lang] || lang, m.forcedLabel, hls ? "HLS" : "MP4"].filter(Boolean).join(" \xB7 "),
        url: m.url.startsWith("//") ? "https:" + m.url : m.url,
        quality: hls ? "auto" : m.maxVResolutionPx ? `${m.maxVResolutionPx}p` : "auto",
        res: hls ? 1e5 : m.maxVResolutionPx || 0
      };
    });
  });
}
function getStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    try {
      const meta = yield getMeta(tmdbId, mediaType);
      const teasers = mediaType === "tv" ? yield findEpisodes(meta, season || 1, episode || 1) : yield findMovie(meta);
      const seen = {};
      const streams = [].concat.apply([], yield Promise.all(teasers.map(streamsOf))).filter((s) => !seen[s.url] && (seen[s.url] = true)).sort((a, b) => b.res - a.res);
      return streams.map((s) => ({ name: s.name, title: s.title, url: s.url, quality: s.quality }));
    } catch (e) {
      console.error(`[ARD] ${e.message}`);
    }
    return [];
  });
}
module.exports = { getStreams };

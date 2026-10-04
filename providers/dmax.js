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
var SUBBED = [[/ger(man)?[\s._-]*sub|untertitel deutsch/i, "Original, dt. UT"], [/eng(lish)?[\s._-]*sub|untertitel englisch/i, "Original, engl. UT"]];
var LANGS = [[/japanisch, dt\. ut/i, "Japanisch, dt. UT"], [/japanisch, engl\. ut/i, "Japanisch, engl. UT"]].concat(SUBBED, [
  [/\bomu\b/i, "OmU"],
  [/\bov\b/i, "OV"],
  [/englisch|\ben\b/i, "Englisch"],
  [/franz|\bfr\b/i, "Franz\xF6sisch"],
  [/spanisch/i, "Spanisch"],
  [/japanisch/i, "Japanisch"],
  [/deutsch|\bde\b/i, "Deutsch"]
]);
var fileNames = {};
function decorate(s) {
  const hit = LANGS.find(([re]) => re.test(s.title || ""));
  let lang = hit ? hit[1] : "Deutsch", title = s.title;
  const sub = SUBBED.find(([re]) => re.test(fileNames[s.url] || ""));
  if (sub && !/UT|OmU/.test(lang)) {
    lang = sub[1];
    title = hit ? title.replace(hit[0], lang) : [title, lang].filter(Boolean).join(" \xB7 ");
  }
  const quality = s.quality && s.quality !== "auto" ? s.quality : /\.m3u8|\/hls|master/i.test(s.url) ? "HLS" : "MP4";
  const host = ((s.title || "").split(" \xB7 ")[0].match(/^[\w-]+\.[a-z]{2,}$/) || [])[0];
  return { lang, stream: Object.assign({}, s, { name: [s.name, lang, host].filter(Boolean).join(" \xB7 "), title, quality }) };
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
        const rank = (lang) => lang === "Deutsch" ? 0 : /dt\. UT|OmU/.test(lang) ? 1 : 2;
        return streams.map(decorate).map((d, i) => [rank(d.lang), i, d.stream]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((d) => d[2]);
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
var postJson = (url, body, opts = {}) => getJson(url, Object.assign({}, opts, {
  method: "POST",
  body: JSON.stringify(body),
  headers: Object.assign({ "Content-Type": "application/json" }, opts.headers)
}));

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

// src/dmax/aurora.js
var API = "https://public.aurora.enhanced.live";
function aurora({ name, mainUrl, serviceIdentifier, mediathekSlug, apiTokenRealm }) {
  const env = `filter%5Benvironment%5D=${serviceIdentifier}&v=2&include=default`;
  function findPage(meta) {
    return __async(this, null, function* () {
      const parts = [].concat(...meta.titles.map((t) => t.split(/ [-–:] |: /))).map((p) => p.trim()).filter((p) => p.length > 3);
      meta = Object.assign({}, meta, { titles: meta.titles.concat(parts).filter((t, i, a) => a.indexOf(t) === i) });
      const longest = (re) => meta.titles.map((t) => t.split(re).map((x) => x.trim()).sort((a, b) => b.length - a.length)[0]);
      const queries = meta.titles.concat(longest(/[^\wäöüß -]+/i), longest(/[^\wäöüß]+/i));
      for (const q of queries.filter((q2, i, a) => q2 && a.indexOf(q2) === i)) {
        let res;
        try {
          res = yield getJson(`${API}/site/search/page/?q=${encodeURIComponent(q)}&${env}&filter%5Btype%5D=showpage&page%5Bsize%5D=50`);
        } catch (e) {
          continue;
        }
        const items = (res.data || []).map((d) => ({ title: d.title, slug: d.slug }));
        const hit = pickBest(items, meta) || pickBest(items.map((i) => ({ title: i.title.split(/ [-–:] /)[0], slug: i.slug })), meta);
        if (hit) return getJson(`${API}/site/page/${hit.slug}/?${env}&parent_slug=${mediathekSlug}`);
      }
      return null;
    });
  }
  function getStreams2(tmdbId, mediaType, season, episode) {
    return __async(this, null, function* () {
      try {
        const meta = yield getMeta(tmdbId, mediaType);
        const page = yield findPage(meta);
        if (!page) return [];
        const blocks = page.blocks || [];
        let videoId, label;
        if (mediaType === "tv") {
          const show = blocks.find((b) => b.showId);
          const ep = show && (show.items || []).find((i) => i.id && Number(i.seasonNumber) === Number(season) && Number(i.episodeNumber) === Number(episode));
          if (ep) {
            videoId = ep.id;
            label = `S${season}E${episode} ${ep.title || ""}`.trim();
          }
        } else {
          const v = blocks.find((b) => b.videoId && norm(b.title) === norm(page.title));
          if (v) {
            videoId = v.videoId;
            label = page.title;
          }
        }
        if (!videoId) return [];
        const token = (yield getJson(`${API}/token?realm=${apiTokenRealm}`)).data.attributes.token;
        const info = yield postJson(`${API}/playback/v3/videoPlaybackInfo`, {
          videoId,
          deviceInfo: { adBlocker: false, drmSupported: false, hdrCapabilities: ["SDR"], hwDecodingCapabilities: [], soundCapabilities: ["STEREO"] },
          wisteriaProperties: {}
        }, { headers: { Authorization: `Bearer ${token}`, Referer: `${mainUrl}/` } });
        return info.data.attributes.streaming.filter((s) => s.type === "hls" && !(s.protection && (s.protection.drmEnabled || s.protection.clearkeyEnabled))).map((s) => ({ name, title: `${label} \xB7 Deutsch \xB7 HLS`, url: s.url, quality: "auto" }));
      } catch (e) {
        console.error(`[${name}] ${e.message}`);
      }
      return [];
    });
  }
  return getStreams2;
}

// src/dmax/index.js
var getStreams = aurora({ name: "DMAX", mainUrl: "https://dmax.de", serviceIdentifier: "dmaxde", mediathekSlug: "sendungen", apiTokenRealm: "de" });
module.exports = provider(getStreams);

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

// src/southpark/index.js
var BASE = "https://www.southpark.de";
var TOPAZ = "https://topaz.paramount.tech/topaz/api";
function getStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    if (String(tmdbId) !== "2190" || mediaType !== "tv" || !season) return [];
    try {
      let path = "/seasons/south-park";
      if (season !== 1) {
        const m = (yield getText(BASE + path)).match(new RegExp(`/seasons/south-park/[a-z0-9]+/staffel-${season}"`));
        if (!m) return [];
        path = m[0].slice(0, -1);
      }
      const mgid = (yield getText(BASE + path)).match(/mgid:arc:season:southpark\.intl:[0-9a-f-]+/);
      if (!mgid) return [];
      const items = (yield getJson(`${BASE}/api/context/${encodeURIComponent(mgid[0])}/episode/1/100`)).items || [];
      const ep = items.find((i) => {
        const h = i.meta.header.title;
        const m = String(h && h.text || h).match(/S(\d+)\D+(\d+)/);
        return m && Number(m[1]) === season && Number(m[2]) === episode;
      });
      if (!ep) return [];
      const streams = [];
      for (const [ns, lang] of [["de", "Deutsch"], ["en", "Englisch"]]) {
        const res = yield getJson(`${TOPAZ}/mgid:arc:episode:shared.southpark.gsa.${ns}:${ep.id}/mica.json?clientPlatform=mobile`);
        const src = res.stitchedstream && res.stitchedstream.source;
        if (src) streams.push({ name: "South Park", title: `S${season}E${episode} ${ep.meta.subHeader || ""} \xB7 ${lang} \xB7 HLS`, url: src, quality: "auto" });
      }
      return streams;
    } catch (e) {
      console.error(`[South Park] ${e.message}`);
    }
    return [];
  });
}
module.exports = provider(getStreams);

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
  const quality2 = s.quality && s.quality !== "auto" ? s.quality : /\.m3u8|\/hls|master/i.test(s.url) ? "HLS" : "MP4";
  const host = ((s.title || "").split(" \xB7 ")[0].match(/^[\w-]+\.[a-z]{2,}$/) || [])[0];
  return Object.assign({}, s, { name: [s.name, lang, host].filter(Boolean).join(" \xB7 "), quality: quality2 });
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
var postJson = (url, body, opts = {}) => getJson(url, Object.assign({}, opts, {
  method: "POST",
  body: JSON.stringify(body),
  headers: Object.assign({ "Content-Type": "application/json" }, opts.headers)
}));
var postForm = (url, form, opts = {}) => getText(url, Object.assign({}, opts, {
  method: "POST",
  body: Object.keys(form).map((k) => encodeURIComponent(k) + "=" + encodeURIComponent(form[k])).join("&"),
  headers: Object.assign({ "Content-Type": "application/x-www-form-urlencoded" }, opts.headers)
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

// shared/dom.js
var cheerio = require("cheerio");
var load = (html) => cheerio.load(html);
var all = ($, sel, ctx) => (ctx ? $(sel, ctx) : $(sel)).toArray().map((e) => $(e));

// shared/extractors/util.js
var origin = (url) => url.match(/^https?:\/\/[^/]+/)[0];
var scripts = (html) => (html.match(/<script[^>]*>[\s\S]*?<\/script>/gi) || []).map((s) => s.replace(/^<script[^>]*>|<\/script>$/gi, ""));
var fetchPage = (url, headers = {}) => getText(url, { headers: Object.assign({ "User-Agent": UA }, headers) });
function quality(label) {
  const m = String(label || "").match(/(\d{3,4})p/i) || String(label || "").match(/^(\d{3,4})$/);
  return m ? `${m[1]}p` : "auto";
}
function unpack(text) {
  const packed = (text.match(/eval\(function\(p,a,c,k,e,[\s\S]*?\.split\('\|'\)[^)]*\)\)/) || [])[0];
  const m = packed && packed.match(/\}\s*\('([\s\S]*)',\s*(.*?),\s*(\d+),\s*'([\s\S]*?)'\.split\('\|'\)/);
  if (!m) return null;
  const payload = m[1].replace(/\\'/g, "'");
  const radix = parseInt(m[2], 10) || 36;
  const symtab = m[4].split("|");
  if (symtab.length !== Number(m[3])) return null;
  const alphabet = radix > 36 ? (radix <= 62 ? "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ" : " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~").slice(0, radix) : null;
  const unbase = (w) => alphabet ? w.split("").reverse().reduce((n, ch, i) => n + Math.pow(radix, i) * alphabet.indexOf(ch), 0) : parseInt(w, radix);
  return payload.replace(/\b\w+\b/g, (w) => symtab[unbase(w)] || w);
}
function jwplayer(script, base) {
  const fix = (u) => {
    u = u.replace(/\\\//g, "/");
    return /^https?:/.test(u) ? u : u.startsWith("//") ? "https:" + u : u.startsWith("/") ? origin(base) + u : `${origin(base)}/${u}`;
  };
  const out = [];
  const re = /"?sources"?:\s*(\[.*?\])/g;
  let m;
  while (m = re.exec(script)) {
    try {
      const json = m[1].replace(/"?(file|label|type)"?\s*:/g, '"$1":').replace(/'/g, '"');
      for (const s of JSON.parse(json)) if (s.file) out.push({ url: fix(s.file), quality: quality(s.label) });
    } catch (e) {
    }
  }
  if (!out.length) {
    const urlRe = /[:=]\s*"([^"\s]+(\.m3u8|master\.txt)[^"\s]*)/g;
    while (m = urlRe.exec(script)) out.push({ url: fix(m[1]), quality: "auto" });
  }
  return out;
}

// shared/extractors/hosters.js
var CryptoJS = require("crypto-js");
function voe(url, referer) {
  return __async(this, null, function* () {
    let html = yield fetchPage(url, { Referer: referer || url });
    const redirect = html.match(/window\.location\.href\s*=\s*'([^']+)';/);
    if (redirect) {
      url = redirect[1];
      html = yield fetchPage(url, { Referer: referer || url });
    }
    const json = (html.match(/<script type="application\/json">([\s\S]*?)<\/script>/) || [])[1];
    if (!json) return [];
    let s = json.trim().replace(/^\["/, "").replace(/"\]$/, "");
    s = s.replace(/[a-zA-Z]/g, (c) => {
      const base = c <= "Z" ? 65 : 97;
      return String.fromCharCode((c.charCodeAt(0) - base + 13) % 26 + base);
    });
    for (const p of ["@$", "^^", "~@", "%?", "*~", "!!", "#&"]) s = s.split(p).join("_");
    s = atob(s.replace(/_/g, ""));
    s = s.split("").map((c) => String.fromCharCode(c.charCodeAt(0) - 3)).reverse().join("");
    const data = JSON.parse(atob(s));
    const headers = { Referer: origin(url) + "/", Origin: origin(url) };
    const out = [];
    if (data.source) out.push({ url: data.source, quality: "auto", headers });
    if (data.direct_access_url) out.push({ url: data.direct_access_url, quality: "auto", headers: { Referer: url } });
    return out;
  });
}
function dood(url) {
  return __async(this, null, function* () {
    const embed = url.replace("/d/", "/e/");
    const res = yield send(embed, { headers: { "User-Agent": UA } });
    const html = yield res.text();
    const host = origin(res.url || embed);
    const pass = (html.match(/\/pass_md5\/[^']*/) || [])[0];
    if (!pass) return [];
    const prefix = yield getText(host + pass, { headers: { Referer: res.url || embed } });
    let token = "";
    const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 10; i++) token += abc[Math.floor(Math.random() * abc.length)];
    const title = (html.match(/<title>([\s\S]*?)<\/title>/) || [])[1];
    return [{ url: `${prefix}${token}?token=${pass.split("/").pop()}&expiry=${Date.now()}`, quality: quality(title), headers: { Referer: host + "/" } }];
  });
}
function aesDecrypt(cipherBytes, key, opts) {
  return CryptoJS.AES.decrypt(CryptoJS.lib.CipherParams.create({ ciphertext: cipherBytes }), key, opts);
}
function vidstack(url) {
  return __async(this, null, function* () {
    const hash = url.split("#").pop().split("/").pop();
    const enc = (yield getText(`${origin(url)}/api/v1/video?id=${hash}`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0" }
    })).trim();
    const key = CryptoJS.enc.Utf8.parse("kiemtienmua911ca");
    for (const iv of ["1234567890oiuytr", "0123456789abcdef"]) {
      try {
        const text = aesDecrypt(CryptoJS.enc.Hex.parse(enc), key, { iv: CryptoJS.enc.Utf8.parse(iv), mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }).toString(CryptoJS.enc.Latin1);
        const src = (text.match(/"source":"(.*?)"/) || [])[1];
        if (src) return [{ url: src.replace(/\\\//g, "/"), quality: "auto", headers: { Referer: url, Origin: origin(url) } }];
      } catch (e) {
      }
    }
    return [];
  });
}
function supervideo(url) {
  return __async(this, null, function* () {
    const html = yield fetchPage(url);
    return jwplayer(unpack(html) || "", url).map((s) => Object.assign(s, { headers: { Referer: origin(url) + "/" } }));
  });
}
function vidhidepro(url, referer) {
  return __async(this, null, function* () {
    const embed = url.replace(/\/(d|download|file|f)\//, "/v/");
    const html = yield fetchPage(embed, { Referer: referer || embed });
    const script = unpack(html) || scripts(html).find((s) => s.includes("sources:")) || "";
    return jwplayer(script, embed).map((s) => Object.assign(s, { headers: { Referer: origin(embed) + "/", Origin: origin(embed) } }));
  });
}
function streamwish(url, referer) {
  return __async(this, null, function* () {
    const embed = url.replace(/\/[fe]\//, "/");
    const html = yield fetchPage(embed, { Referer: referer || embed });
    const script = unpack(html) || scripts(html).find((s) => s.includes('jwplayer("vplayer").setup(')) || scripts(html).find((s) => s.includes("sources:")) || "";
    return jwplayer(script, embed).map((s) => Object.assign(s, { headers: { Referer: origin(embed) + "/", Origin: origin(embed) } }));
  });
}
function mixdrop(url) {
  return __async(this, null, function* () {
    const html = yield fetchPage(url.replace("/f/", "/e/"));
    const link = ((unpack(html) || html).match(/wurl.*?=.*?"(.*?)";/) || [])[1];
    return link ? [{ url: link.startsWith("//") ? "https:" + link : link, quality: "auto", headers: { Referer: url, "User-Agent": UA } }] : [];
  });
}
function filemoon(url, referer) {
  return __async(this, null, function* () {
    const headers = { Referer: url, "Sec-Fetch-Dest": "iframe", "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Site": "cross-site" };
    let html = yield fetchPage(url, headers);
    const iframe = (html.match(/<iframe[^>]+src="([^"]+)"/) || [])[1];
    if (iframe) html = yield fetchPage(iframe, Object.assign({}, headers, { "Accept-Language": "en-US,en;q=0.5" }));
    return jwplayer(unpack(html) || "", iframe || url).map((s) => Object.assign(s, { headers: { Referer: origin(iframe || url) + "/" } }));
  });
}
function vidoza(url) {
  return __async(this, null, function* () {
    const html = yield fetchPage(url);
    const line = (html.match(/sourcesCode:\s*(\[[^\n]*\])/) || [])[1];
    if (!line) return [];
    return JSON.parse(line.replace(/"?(src|type|label|res)"?\s*:/g, '"$1":')).map((s) => ({ url: s.src, quality: quality(s.res || s.label), headers: { Referer: url } }));
  });
}
function streamtape(url) {
  return __async(this, null, function* () {
    const html = yield fetchPage(url);
    const line = (html.match(/botlink'\)\.innerHTML\s*=\s*([^\n;]+)/) || [])[1];
    if (!line) return [];
    const value = line.split("+").map((part) => {
      let s = (part.match(/'([^']*)'/) || [])[1] || "";
      const re = /\.substring\((\d+)\)/g;
      let m;
      while (m = re.exec(part)) s = s.substring(Number(m[1]));
      return s;
    }).join("");
    return value ? [{ url: `https:${value}&stream=1`, quality: "auto", headers: { Referer: url } }] : [];
  });
}
function lulustream(url, referer) {
  return __async(this, null, function* () {
    const html = yield postForm(`${origin(url)}/dl`, { op: "embed", file_code: url.split("/").pop(), auto: "1", referer: referer || "" });
    const script = scripts(html).find((s) => s.includes("vplayer")) || "";
    return jwplayer(script, url).map((s) => Object.assign(s, { headers: { Referer: origin(url) + "/" } }));
  });
}
function sniff(url, referer) {
  return __async(this, null, function* () {
    const html = yield fetchPage(url, { Referer: referer || url });
    if (html.includes("/pass_md5/")) return dood(url);
    if (html.includes('"/api/stream"') && html.includes("filecode")) {
      const d = yield getJson(origin(url) + "/api/stream", { method: "POST", body: JSON.stringify({ filecode: url.split("/").filter(Boolean).pop(), device: "web" }), headers: { "Content-Type": "application/json", Referer: url } });
      return d.streaming_url ? [{ url: d.streaming_url, quality: "auto", headers: { Referer: origin(url) + "/" } }] : [];
    }
    const blob = (html.match(/id="token-blob"[^>]*>([^<]*)</) || [])[1];
    if (blob) {
      const d = yield postJson(`${origin(url)}/api/videos/${url.split("?")[0].split("/").pop()}/resolve`, { blob: blob.trim() }, { headers: { Referer: url } });
      return d.signedVideoUrl ? [{ url: d.signedVideoUrl, quality: "auto", headers: { Referer: origin(url) + "/", Origin: origin(url) } }] : [];
    }
    const hex = (html.match(/_0x1 = '([0-9a-f|]+)'/) || [])[1];
    if (hex) {
      const s = hex.split("|").join("").replace(/../g, (b) => String.fromCharCode(parseInt(b, 16)));
      return [{ url: s.split("").reverse().join(""), quality: "auto", headers: { Referer: origin(url) + "/" } }];
    }
    if (html.includes("application/json") && /window\.location\.href|voe/i.test(html)) return voe(url, referer);
    if (/window\.location\.href = 'https?:\/\/[^']+\/e\/\w+'/.test(html)) return voe(url, referer);
    if (html.includes("sourcesCode:")) return vidoza(url);
    if (html.includes("botlink').innerHTML")) return streamtape(url);
    let found = jwplayer(unpack(html) || "", url);
    if (!found.length) found = jwplayer(scripts(html).find((s) => s.includes("sources:")) || "", url);
    return found.map((s) => Object.assign(s, { headers: { Referer: origin(url) + "/", Origin: origin(url), "User-Agent": UA } }));
  });
}

// shared/extractors/index.js
var HOSTS = [
  [voe, ["voe.sx", "goofy-banana.com", "urochsunloath.com", "donaldlineelse.com", "charlestoughrace.com", "tubelessceliolymph.com", "simpulumlamerop.com", "nathanfromsubject.com", "yip.su", "metagnathtuggers.com"]],
  [dood, ["dood", "d000d.com", "vide0.net", "dsvplay.com", "dooodster.com", "doods.pro", "playmogo.com", "d0000d.com", "ds2play.com", "doodstream.com"]],
  [vidstack, ["moflix.upns.xyz", "moflix.rpmplay.xyz"]],
  [supervideo, ["supervideo", "dropload", "abstream.to", "dr0pstream.com"]],
  [vidhidepro, ["vidhide", "filelions", "ryderjet.com", "moflix-stream.click", "smoothpre.com", "dhtpre.com", "peytonepre.com"]],
  [streamwish, ["streamwish", "luluvdo.com", "streamruby.com", "savefiles.com", "wishembed", "swdyu.com", "strwish"]],
  [lulustream, ["lulustream.com", "luluvdoo.com"]],
  [mixdrop, ["mixdrop", "mixdrp", "mxdrop", "mdy48tn97.com"]],
  [filemoon, ["filemoon"]],
  [vidoza, ["vidoza.net", "videzz.net"]],
  [streamtape, ["streamtape", "watchadsontape.com", "shavetape.cash"]]
];
function decoderFor(url) {
  const host = (url.match(/^https?:\/\/(?:www\.)?([^/:?#]+)/i) || [])[1] || "";
  const hit = HOSTS.find(([, names]) => names.some((n) => host === n || !n.includes(".") && host.includes(n)));
  return hit ? hit[0] : sniff;
}
function resolveEmbed(url, referer) {
  return __async(this, null, function* () {
    if (!url) return [];
    if (url.startsWith("//")) url = "https:" + url;
    try {
      const host = url.split("/")[2].replace(/^www\./, "");
      return (yield decoderFor(url)(url, referer)).filter((s) => s.url).map((s) => Object.assign(s, { host }));
    } catch (e) {
      console.error(`[extractor] ${url}: ${e.message}`);
      return [];
    }
  });
}
var resolveAll = (urls, referer) => __async(null, null, function* () {
  return [].concat(...yield Promise.all(urls.map((u) => resolveEmbed(u, referer))));
});

// src/kellerkino/index.js
var BASE = "https://www.kellerkino.com";
function getStreams(tmdbId, mediaType) {
  return __async(this, null, function* () {
    if (mediaType !== "movie") return [];
    try {
      const meta = yield getMeta(tmdbId, mediaType);
      for (const q of meta.titles) {
        const $ = load(yield getText(`${BASE}/?s=${encodeURIComponent(q)}`));
        const items = all($, "article.movie-card").map((e) => ({
          title: e.find("h2").text().trim(),
          url: e.find("h2 a").attr("href"),
          year: (e.text().match(/\b(19|20)\d{2}\b/) || [])[0]
        }));
        const hit = pickBest(items, meta);
        if (!hit) continue;
        const page = load(yield getText(hit.url));
        const imdb = page("article.movie-detail .nfo-movie-imdb-id").text().replace(/^[:\s]+/, "").trim();
        if (imdb && meta.imdbId && imdb !== meta.imdbId) continue;
        const embeds = all(page, "iframe").map((e) => e.attr("src")).filter(Boolean);
        return (yield resolveAll(embeds, BASE + "/")).map((s) => ({
          name: "KellerKino",
          title: `${s.host} \xB7 Deutsch \xB7 ${s.quality}`,
          url: s.url,
          quality: s.quality,
          headers: s.headers
        }));
      }
    } catch (e) {
      console.error(`[KellerKino] ${e.message}`);
    }
    return [];
  });
}
module.exports = provider(getStreams);

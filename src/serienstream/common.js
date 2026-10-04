import { getText, UA, send } from '../../shared/http.js';
import { score } from '../../shared/match.js';

// Aniworld and Serienstream hide hosters behind a 30x redirect. Let the client follow it and take the final URL:
// aniworld sends that 301 with "content-encoding: gzip" and an empty body, which OkHttp (Nuvio desktop/Android)
// can only survive by not reading it, and Nuvio strips any Accept-Encoding a plugin sets (iOS ignores manual redirects anyway).
export async function followRedirect(url, referer) {
    const res = await send(url, { headers: { 'User-Agent': UA, Referer: referer } });
    return res.url && res.url !== url ? res.url : null;
}

// exact title matches only; several (remakes, same-name shows) -> the one whose page links the TMDB IMDb id
export async function pickSeries(items, meta, base) {
    const hits = items.filter(i => score(i.title, null, meta) >= 3);
    if (hits.length > 1 && meta.imdbId) {
        for (const h of hits) if ((await getText(base + h.link)).includes(meta.imdbId)) return h;
    }
    return hits[0] || null;
}

// TMDB lists many anime as one season with absolute numbering (Re:ZERO S1 E78) where both sites split them into
// seasons (staffel-4/episode-12): walk the season pages from the requested one and subtract their episode counts.
// null when the episode is in the requested season after all, or past the last season.
export async function splitSeasonPath(base, link, season, episode) {
    for (let s = season; ; s++) {
        const html = await getText(`${base}${link}/staffel-${s}`).catch(() => '');
        const count = new Set(html.match(new RegExp(`${link}/staffel-${s}/episode-\\d+`, 'g'))).size;
        if (!count || (s === season && episode <= count)) return null;
        if (episode <= count) return `${link}/staffel-${s}/episode-${episode}`;
        episode -= count;
    }
}

// both sites' search misses many exact titles (s.to has "Dark" only on result page 3), so guess the slug and verify via IMDb id
export async function bySlug(base, prefix, meta) {
    if (!meta.imdbId) return null;
    for (const t of meta.titles) {
        const link = prefix + t.toLowerCase().replace(/['’]/g, '').replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
            .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const html = await getText(base + link).catch(() => '');
        if (html.includes(meta.imdbId)) return { link, title: t };
    }
    return null;
}

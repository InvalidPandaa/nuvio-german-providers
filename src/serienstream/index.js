import { getText, provider } from '../../shared/http.js';
import { getMeta } from '../../shared/tmdb.js';
import { load, all } from '../../shared/dom.js';
import { resolveEmbed } from '../../shared/extractors/index.js';
import { bySlug, followRedirect, pickSeries } from './common.js';

const BASE = 'https://serienstream.to';

async function getStreams(tmdbId, mediaType, season, episode) {
    if (mediaType !== 'tv' || season == null || episode == null) return [];
    try {
        const meta = await getMeta(tmdbId, mediaType);
        let series = null;
        for (const q of meta.titles) {
            const $ = load(await getText(`${BASE}/suche?term=${encodeURIComponent(q)}&tab=shows`, { headers: { Referer: `${BASE}/suche` } }));
            const items = all($, 'a.show-cover').map(a => ({ link: a.attr('href'), title: $('img', a).attr('alt') }));
            if ((series = await pickSeries(items, meta, BASE))) break;
        }
        series = series || await bySlug(BASE, '/serie/', meta);
        if (!series) return [];
        const epUrl = `${BASE}${series.link}/staffel-${season}/episode-${episode}`;
        const $ = load(await getText(epUrl));
        const links = all($, '.link-wrapper button').map(b => ({
            url: b.attr('data-play-url'), lang: b.attr('data-language-label'),
        }));
        // s.to shows a Turnstile captcha instead of redirecting after ~10 links per IP; those links are skipped
        const out = await Promise.all(links.map(async l => {
            const embed = await followRedirect(BASE + l.url, epUrl).catch(() => null);
            return (await resolveEmbed(embed, epUrl)).map(s => ({
                name: 'Serienstream', title: `${s.host} · ${l.lang}`, url: s.url, quality: s.quality, headers: s.headers,
            }));
        }));
        return [].concat(...out);
    } catch (e) {
        console.error(`[Serienstream] ${e.message}`);
    }
    return [];
}

module.exports = provider(getStreams);

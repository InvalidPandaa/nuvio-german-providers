import { getText, postForm, provider } from '../../shared/http.js';
import { getMeta } from '../../shared/tmdb.js';
import { norm } from '../../shared/match.js';
import { load, all } from '../../shared/dom.js';
import { resolveEmbed } from '../../shared/extractors/index.js';
import { bySlug, followRedirect, pickSeries, splitSeasonPath } from '../serienstream/common.js';

const BASE = 'https://aniworld.to';
const LANG = { 1: 'Deutsch', 2: 'Eng-Sub', 3: 'Ger-Sub' };

const clean = s => String(s || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#0?39;/g, "'").replace(/&quot;/g, '"').trim();

async function search(q) {
    const text = await postForm(`${BASE}/ajax/search`, { keyword: q }, { headers: { 'X-Requested-With': 'XMLHttpRequest', Referer: `${BASE}/search` } });
    // empty body when nothing matches
    return (JSON.parse(text || '[]') || []).map(i => ({ link: i.link, title: clean(i.title) }));
}

// movies: standalone films are their own entry (staffel-1/episode-1), franchise films sit in staffel-0 ("... [Movie]: Naruto Staffel 0 Episode 2")
async function findMovie(meta) {
    const queries = [].concat(...meta.titles.map(t => [t, t.split(/\s[-–:]\s|:\s/).pop()]))
        .filter((q, i, a) => q.length > 3 && a.indexOf(q) === i);
    for (const q of queries) {
        const items = await search(q);
        const series = await pickSeries(items.filter(i => /^\/anime\/stream\/[^/]+$/.test(i.link)), meta, BASE);
        if (series) return series.link + '/staffel-1/episode-1';
        const film = items.find(i => /\/staffel-0\/episode-\d+$/.test(i.link) && norm(i.title.split(']:')[0]).includes(norm(q)));
        if (film) return film.link;
    }
    return null;
}

async function episodePage(path) {
    const epUrl = BASE + path;
    const $ = load(await getText(epUrl));
    const links = all($, '.hosterSiteVideo ul li').map(li => ({
        url: li.attr('data-link-target'), lang: li.attr('data-lang-key'),
    })).filter(l => l.url);
    return { epUrl, $, links };
}

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        const meta = await getMeta(tmdbId, mediaType);
        let path = null, series = null;
        if (mediaType === 'movie') path = await findMovie(meta);
        else if (season != null && episode != null) {
            // the search wants short queries: 'Frieren: Beyond Journey's End' finds nothing, 'Frieren' does
            const queries = [].concat(...meta.titles.map(t => [t, t.split(/\s[-–:]\s|:\s/)[0]])).filter((q, i, a) => q.length > 3 && a.indexOf(q) === i);
            for (const q of queries) {
                series = await pickSeries((await search(q)).filter(i => /^\/anime\/stream\/[^/]+$/.test(i.link)), meta, BASE);
                if (series) break;
            }
            series = series || await bySlug(BASE, '/anime/stream/', meta);
            if (series) path = `${series.link}/staffel-${season}/episode-${episode}`;
        }
        if (!path) return [];
        let page = await episodePage(path);
        // an episode that does not exist answers 200 without hosters
        if (!page.links.length && series) {
            const split = await splitSeasonPath(BASE, series.link, season, episode);
            if (split) page = await episodePage(split);
        }
        const { epUrl, $, links } = page;
        const out = await Promise.all(links.map(async l => {
            const embed = await followRedirect(BASE + l.url, epUrl).catch(() => null);
            const lang = LANG[l.lang] || $(`.changeLanguageBox img[data-lang-key="${l.lang}"]`).attr('title') || '';
            return (await resolveEmbed(embed, epUrl)).map(s => ({
                name: 'Aniworld', title: `${s.host} · ${lang}`, url: s.url, quality: s.quality, headers: s.headers,
            }));
        }));
        return [].concat(...out);
    } catch (e) {
        console.error(`[Aniworld] ${e.message}`);
    }
    return [];
}

module.exports = provider(getStreams);

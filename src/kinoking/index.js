import { getText, provider } from '../../shared/http.js';
import { getMeta } from '../../shared/tmdb.js';
import { pickBest } from '../../shared/match.js';
import { load, all } from '../../shared/dom.js';
import { resolveEmbed } from '../../shared/extractors/index.js';
import { meineCloud } from './meinecloud.js';

const BASE = 'https://kinoking.cc';

const resolve = url => (/meinecloud\.click/.test(url) ? meineCloud(url, BASE + '/') : resolveEmbed(url, BASE + '/')).catch(() => []);

async function findEntry(meta) {
    const type = meta.type === 'tv' ? 'series' : 'movie';
    for (const q of meta.titles) {
        const $ = load(await getText(`${BASE}/index.php?search=${encodeURIComponent(q)}`));
        const items = all($, 'main div#ajax-grid-container > div')
            .map(e => ({ id: e.attr('data-id'), type: e.attr('data-type'), tmdb: e.attr('data-tmdb'), title: e.attr('data-title') }))
            .filter(i => i.id && i.type === type);
        const hit = items.find(i => i.tmdb === meta.tmdbId) || pickBest(items.filter(i => !i.tmdb), meta);
        if (hit) return hit;
    }
    return null;
}

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        const meta = await getMeta(tmdbId, mediaType);
        const entry = await findEntry(meta);
        if (!entry) return [];
        const url = `${BASE}/${entry.type}.php?id=${entry.id}`;
        const html = await getText(url);
        let embeds;
        if (entry.type === 'movie') {
            const $ = load(html);
            const pages = all($, 'main a').map(a => a.attr('href') || '').filter(h => h.startsWith('?id='))
                .filter((h, i, a) => a.indexOf(h) === i);
            embeds = await Promise.all(pages.map(p => getText(`${BASE}/movie.php${p}`).then(page => {
                const iframe = (page.match(/target\.innerHTML = `([^`]*)`/) || [])[1] || '';
                return ((iframe.match(/<iframe[^>]*src="([^"]+)"/) || [])[1] || '').replace(/&amp;/g, '&');
            }).catch(() => '')));
        } else {
            const json = (html.match(/const allEpisodesData = (.*)/) || [])[1];
            const ep = JSON.parse(json.replace(/;\s*$/, '')).find(e => +e.season_number === season && +e.episode_number === episode);
            embeds = ep ? (ep.video_links || '').split(',') : [];
        }
        embeds = embeds.map(e => e.trim()).filter((e, i, a) => e && a.indexOf(e) === i);
        const streams = [].concat(...await Promise.all(embeds.map(resolve)));
        return streams.map(s => ({
            name: 'KinoKing',
            title: `${s.host} · Deutsch · ${s.quality}`,
            url: s.url,
            quality: s.quality,
            headers: s.headers,
        }));
    } catch (e) {
        console.error(`[KinoKing] ${e.message}`);
    }
    return [];
}

module.exports = provider(getStreams);

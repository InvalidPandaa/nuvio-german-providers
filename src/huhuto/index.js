import { request } from '../../shared/http.js';
import { getMeta } from '../../shared/tmdb.js';
import { resolveEmbed } from '../../shared/extractors/index.js';

const BASE = 'https://huhu.to';

// huhu.to's old /web-vod API is gone; the site is now a MediaURL addon keyed by TMDB/IMDb ids
async function sources(meta, season, episode) {
    const body = { language: 'de', region: 'DE', clientVersion: '3.1.0', type: meta.type === 'tv' ? 'series' : 'movie', ids: { tmdb_id: meta.tmdbId, imdb_id: meta.imdbId }, name: meta.title };
    if (meta.type === 'tv') body.episode = { season, episode };
    const res = await request(`${BASE}/mediaurl-source.json`, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'User-Agent': 'MediaUrl/2' },
    });
    return res.json();
}

// HuhuToExtractor: huhu.to links only redirect to the real hoster
async function resolve(src) {
    let url = src.url;
    if (url.includes('huhu.to/')) url = (await request(url)).url;
    return (await resolveEmbed(url, `${BASE}/`)).map(s => ({
        name: 'Huhu',
        title: `${s.host} · ${(src.languages || []).join('/').toUpperCase() || 'DE'}${src.tag ? ' · ' + src.tag : ''}`,
        url: s.url,
        quality: /\d/.test(s.quality) ? s.quality : ((src.tag || '').match(/\d{3,4}p/) || ['auto'])[0],
        headers: s.headers,
    }));
}

async function getStreams(tmdbId, mediaType, season, episode) {
    try {
        const meta = await getMeta(tmdbId, mediaType);
        const list = (await sources(meta, season, episode)).filter(s => s.type === 'url' && s.url);
        return [].concat(...await Promise.all(list.map(s => resolve(s).catch(() => []))));
    } catch (e) {
        console.error(`[Huhu] ${e.message}`);
    }
    return [];
}

module.exports = { getStreams };

import { getJson, getText } from '../../shared/http.js';
import { getMeta } from '../../shared/tmdb.js';
import { pickBest } from '../../shared/match.js';

// welt.de's WAF 403s some non-browser TLS clients on /api/search; these are the headers the original plugin sends
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:149.0) Gecko/20100101 Firefox/149.0',
    'Accept-Language': 'en-US,en;q=0.9',
    'Sec-GPC': '1',
    'Cache-Control': 'no-cache',
};
const QUALITY = { 700: '360p', 1200: '432p', 2400: '720p', 4800: '1080p' };

// Only single documentaries (TMDB movies) map; Welt's series use their own "Folge N" numbering, unrelated to TMDB seasons.
async function getStreams(tmdbId, mediaType) {
    if (mediaType !== 'movie') return [];
    try {
        const meta = await getMeta(tmdbId, mediaType);
        for (const q of meta.titles) {
            const res = await getJson(`https://www.welt.de/api/search/${encodeURIComponent(q)}?offset=0&section=mediathek`, { headers: HEADERS });
            // no year: publicationDate is the (re)upload date, not the production year, so only exact titles match
            const hit = pickBest((res.items || []).filter(i => i.type === 'video').map(i => ({ title: i.headline, url: i.url })), meta);
            if (!hit) continue;
            const html = await getText(hit.url, { headers: HEADERS });
            const video = (html.match(/<noscript><video[\s\S]*?<\/video>/) || [''])[0];
            const sources = [];
            video.replace(/<source src="([^"]+)" type="([^"]+)"/g, (_, src, type) => sources.push({ src, type }));
            return sources.map(({ src, type }) => {
                const hls = /mpegurl/i.test(type);
                const quality = hls ? 'auto' : QUALITY[(src.match(/_(\d+)\.mp4/) || [])[1]] || 'auto';
                return { name: 'Welt', title: `Deutsch · ${quality} · ${hls ? 'HLS' : 'MP4'}`, url: src, quality };
            }).sort((a, b) => (parseInt(b.quality) || 1e4) - (parseInt(a.quality) || 1e4));
        }
    } catch (e) {
        console.error(`[Welt] ${e.message}`);
    }
    return [];
}

module.exports = { getStreams };

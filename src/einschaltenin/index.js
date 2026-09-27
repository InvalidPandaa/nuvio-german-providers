import { getJson } from '../../shared/http.js';
import { resolveEmbed } from '../../shared/extractors/index.js';

const BASE = 'https://einschalten.in';

// the site's movie ids are TMDB ids, so the search step of the CloudStream plugin is unnecessary
async function getStreams(tmdbId, mediaType) {
    if (mediaType !== 'movie') return [];
    try {
        const src = await getJson(`${BASE}/api/movies/${tmdbId}/watch`);
        const quality = (src.releaseName.match(/\d{3,4}p/) || ['auto'])[0];
        return (await resolveEmbed(src.streamUrl, `${BASE}/`)).map(s => ({
            name: 'EinschaltenIn',
            title: `${s.host} · ${src.releaseName}`,
            url: s.url,
            quality: /\d/.test(s.quality) ? s.quality : quality,
            headers: s.headers,
        }));
    } catch (e) {
        console.error(`[EinschaltenIn] ${e.message}`);
    }
    return [];
}

module.exports = { getStreams };

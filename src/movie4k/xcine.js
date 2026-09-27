import { getJson } from '../../shared/http.js';
import { getMeta } from '../../shared/tmdb.js';
import { pickBest } from '../../shared/match.js';
import { resolveEmbed } from '../../shared/extractors/index.js';

// series are stored per season: "Title - Staffel 2" (s: 2)
const SEASON = /\s*[-–:]\s*(?:Staffel|Season)\s*(\d+)\s*$/i;

export function xcine({ name, mainUrl }) {
    const opts = { headers: { Referer: `${mainUrl}/` } };

    async function find(meta, season) {
        for (const q of meta.titles) {
            const url = `${mainUrl}/data/browse/?lang=2&keyword=${encodeURIComponent(q)}&year=&networks=&rating=&votes=&genre=&country=&cast=&directors=&type=&order_by=&page=1&limit=20`;
            const items = ((await getJson(url, opts)).movies || []).map(m => {
                const s = m.s || +((m.title || '').match(SEASON) || [])[1] || null;
                return { id: m._id, title: (m.title || m.original_title || '').replace(SEASON, ''), year: m.year, s };
            });
            const hit = season == null
                ? pickBest(items.filter(i => !i.s), meta)
                // season entries carry that season's air year, not the show's first year
                : pickBest(items.filter(i => i.s === season).map(i => Object.assign(i, { year: null })), meta);
            if (hit) return hit;
        }
        return null;
    }

    async function getStreams(tmdbId, mediaType, season, episode) {
        try {
            const meta = await getMeta(tmdbId, mediaType);
            const tv = mediaType === 'tv';
            const hit = await find(meta, tv ? Number(season) : null);
            if (!hit) return [];
            const res = await getJson(`${mainUrl}/data/watch/?_id=${hit.id}`, opts);
            const streams = (res.streams || []).filter(s => s.stream && (!tv || Number(s.e) === Number(episode)));
            // sites often list hundreds of mirrors per title; like the original, keep the first 3 per host
            const perHost = {};
            const picked = streams.filter(s => {
                const host = s.stream.split('/')[2];
                perHost[host] = (perHost[host] || 0) + 1;
                return perHost[host] <= 3;
            });
            const groups = await Promise.all(picked.map(async s => {
                const q = ((s.release || '').match(/\b(2160|1080|720|480)p\b/i) || [])[0];
                return (await resolveEmbed(s.stream, `${mainUrl}/`)).map(r => (
                    { name, title: `${r.host} · Deutsch${q ? ' · ' + q : ''}`, url: r.url, quality: r.quality || q || 'auto', headers: r.headers }));
            }));
            return [].concat(...groups);
        } catch (e) {
            console.error(`[${name}] ${e.message}`);
        }
        return [];
    }

    return getStreams;
}

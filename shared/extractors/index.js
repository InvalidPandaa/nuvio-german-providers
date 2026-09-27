import * as h from './hosters.js';

// host (without www.) -> decoder; mirrors from GermanProviders' extractor registrations + CloudStream core
const HOSTS = [
    [h.voe, ['voe.sx', 'kinoger.ru', 'goofy-banana.com', 'urochsunloath.com', 'donaldlineelse.com', 'charlestoughrace.com', 'tubelessceliolymph.com', 'simpulumlamerop.com', 'nathanfromsubject.com', 'yip.su', 'metagnathtuggers.com']],
    [h.dood, ['dood', 'd000d.com', 'vide0.net', 'dsvplay.com', 'dooodster.com', 'doods.pro', 'playmogo.com', 'd0000d.com', 'ds2play.com', 'doodstream.com']],
    [h.vidstack, ['kinoger.re', 'kinoger.p2pplay.pro', 'moflix.upns.xyz', 'moflix.rpmplay.xyz']],
    [h.supervideo, ['supervideo', 'dropload', 'abstream.to', 'dr0pstream.com']],
    [h.vidhidepro, ['vidhide', 'filelions', 'ryderjet.com', 'kinoger.be', 'moflix-stream.click', 'smoothpre.com', 'dhtpre.com', 'peytonepre.com']],
    [h.streamwish, ['streamwish', 'luluvdo.com', 'streamruby.com', 'savefiles.com', 'wishembed', 'swdyu.com', 'strwish']],
    [h.lulustream, ['lulustream.com', 'luluvdoo.com', 'kinoger.pw']],
    [h.mixdrop, ['mixdrop', 'mixdrp', 'mxdrop', 'mdy48tn97.com']],
    [h.filemoon, ['filemoon']],
    [h.vidoza, ['vidoza.net', 'videzz.net']],
    [h.streamtape, ['streamtape', 'watchadsontape.com', 'shavetape.cash']],
];

export function decoderFor(url) {
    const host = (url.match(/^https?:\/\/(?:www\.)?([^/:?#]+)/i) || [])[1] || '';
    const hit = HOSTS.find(([, names]) => names.some(n => host === n || (!n.includes('.') && host.includes(n))));
    return hit ? hit[0] : h.sniff;
}

// embed URL -> [{url, quality, headers, host}], never throws
export async function resolveEmbed(url, referer) {
    if (!url) return [];
    if (url.startsWith('//')) url = 'https:' + url;
    try {
        const host = url.split('/')[2].replace(/^www\./, '');
        return (await decoderFor(url)(url, referer)).filter(s => s.url).map(s => Object.assign(s, { host }));
    } catch (e) {
        console.error(`[extractor] ${url}: ${e.message}`);
        return [];
    }
}

export const resolveAll = async (urls, referer) => [].concat(...await Promise.all(urls.map(u => resolveEmbed(u, referer))));

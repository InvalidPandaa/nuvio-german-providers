import { xcine } from '../movie4k/xcine.js';

const getStreams = xcine({ name: 'Streamcloud', mainUrl: 'https://streamcloud.sx' });

module.exports = { getStreams };

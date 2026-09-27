import { xcine } from '../movie4k/xcine.js';

const getStreams = xcine({ name: 'XcineRU', mainUrl: 'https://xcine.ru' });

module.exports = { getStreams };

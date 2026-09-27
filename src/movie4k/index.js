import { xcine } from './xcine.js';

const getStreams = xcine({ name: 'Movie4k', mainUrl: 'https://movie4k.sx' });

module.exports = { getStreams };

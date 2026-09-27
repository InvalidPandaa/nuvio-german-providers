import { xcine } from '../movie4k/xcine.js';

const getStreams = xcine({ name: 'KinoKiste', mainUrl: 'https://kinokiste.club' });

module.exports = { getStreams };

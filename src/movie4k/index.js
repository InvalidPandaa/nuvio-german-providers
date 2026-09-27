import { provider } from '../../shared/http.js';
import { xcine } from './xcine.js';

const getStreams = xcine({ name: 'Movie4k', mainUrl: 'https://movie4k.sx' });

module.exports = provider(getStreams);

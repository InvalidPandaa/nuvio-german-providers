import { aurora } from '../dmax/aurora.js';

const getStreams = aurora({ name: 'TELE 5', mainUrl: 'https://tele5.de', serviceIdentifier: 'tele5', mediathekSlug: 'mediathek', apiTokenRealm: 'de' });

module.exports = { getStreams };

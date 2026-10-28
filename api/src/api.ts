import { Hono } from 'hono';
import authMiddleware from '@/middleware/authMiddleware';
import snakeCaseKeysMiddleware from '@/middleware/snakeCaseKeysMiddleware';
import albumRoutes from '@/routes/albums';
import artistRoutes from '@/routes/artists';
import genreRoutes from '@/routes/genres';
import mediaTypeRoutes from '@/routes/mediaTypes';
import playlistRoutes from '@/routes/playlists';
import trackRoutes from '@/routes/tracks';

const api = new Hono().basePath('/api');

api.use(snakeCaseKeysMiddleware);
api.use(authMiddleware);

api.route('/albums', albumRoutes);
api.route('/artists', artistRoutes);
api.route('/genres', genreRoutes);
api.route('/media-types', mediaTypeRoutes);
api.route('/playlists', playlistRoutes);
api.route('/tracks', trackRoutes);

export default api;

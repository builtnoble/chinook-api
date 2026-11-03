import { Hono } from 'hono';
import authMiddleware from '@/middleware/authMiddleware';
import bodyLimitMiddleware from '@/middleware/bodyLimitMiddleware';
import originGuardMiddleware from '@/middleware/originGuardMiddleware';
import requireAdminMiddleware from '@/middleware/requireAdminMiddleware';
import snakeCaseKeysMiddleware from '@/middleware/snakeCaseKeysMiddleware';
import albumRoutes from '@/routes/albums';
import artistRoutes from '@/routes/artists';
import genreRoutes from '@/routes/genres';
import mediaTypeRoutes from '@/routes/mediaTypes';
import playlistRoutes from '@/routes/playlists';
import trackRoutes from '@/routes/tracks';

const api = new Hono().basePath('/api');

api.use(snakeCaseKeysMiddleware);
api.use(bodyLimitMiddleware);
api.use(originGuardMiddleware);
api.use(authMiddleware);
api.use(requireAdminMiddleware);

api.route('/albums', albumRoutes);
api.route('/artists', artistRoutes);
api.route('/genres', genreRoutes);
api.route('/media-types', mediaTypeRoutes);
api.route('/playlists', playlistRoutes);
api.route('/tracks', trackRoutes);

export default api;

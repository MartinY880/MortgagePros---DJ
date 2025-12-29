import { Router } from 'express';
import { spotifyController } from '../controllers/spotify.controller';
import { requireAuth, optionalAuth } from '../middleware/auth.middleware';
import { requireClerkAuth } from '../middleware/clerk.middleware';

const router = Router();

router.get('/token', requireClerkAuth, requireAuth, spotifyController.getPlaybackToken);
router.get('/playlists', requireClerkAuth, requireAuth, spotifyController.getUserPlaylists);
router.post('/playlist/start', requireClerkAuth, requireAuth, spotifyController.startPlaylist);
router.get('/search', requireClerkAuth, optionalAuth, spotifyController.search);
router.get('/search-artists', requireClerkAuth, optionalAuth, spotifyController.searchArtists);
router.get('/playback', requireClerkAuth, optionalAuth, spotifyController.getCurrentPlayback);
router.post('/play', requireClerkAuth, requireAuth, spotifyController.play);
router.post('/pause', requireClerkAuth, requireAuth, spotifyController.pause);
router.post('/next', requireClerkAuth, requireAuth, spotifyController.next);

export default router;

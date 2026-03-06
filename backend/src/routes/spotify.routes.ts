import { Router } from 'express';
import { spotifyController } from '../controllers/spotify.controller';
import { requireAuth, optionalAuth } from '../middleware/auth.middleware';
import { requireLogtoAuth } from '../middleware/logto.middleware';

const router = Router();

router.get('/token', requireLogtoAuth, requireAuth, spotifyController.getPlaybackToken);
router.get('/search', requireLogtoAuth, optionalAuth, spotifyController.search);
router.get('/search-artists', requireLogtoAuth, optionalAuth, spotifyController.searchArtists);
router.get('/playback', requireLogtoAuth, optionalAuth, spotifyController.getCurrentPlayback);
router.post('/play', requireLogtoAuth, requireAuth, spotifyController.play);
router.post('/pause', requireLogtoAuth, requireAuth, spotifyController.pause);
router.post('/next', requireLogtoAuth, optionalAuth, spotifyController.next);

export default router;

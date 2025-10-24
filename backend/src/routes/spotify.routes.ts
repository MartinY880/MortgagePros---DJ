import { Router } from 'express';
import { spotifyController } from '../controllers/spotify.controller';
import { requireAuth, optionalAuth } from '../middleware/auth.middleware';

const router = Router();

router.get('/search', optionalAuth, spotifyController.search);
router.get('/playback', optionalAuth, spotifyController.getCurrentPlayback);
router.post('/play', requireAuth, spotifyController.play);
router.post('/pause', requireAuth, spotifyController.pause);
router.post('/next', requireAuth, spotifyController.next);

export default router;

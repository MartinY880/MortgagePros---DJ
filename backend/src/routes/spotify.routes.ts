import { Router } from 'express';
import { spotifyController } from '../controllers/spotify.controller';
import { requireAuth, optionalAuth } from '../middleware/auth.middleware';
import { requireClerkAuth } from '../middleware/clerk.middleware';

const router = Router();

router.get('/search', requireClerkAuth, optionalAuth, spotifyController.search);
router.get('/playback', requireClerkAuth, optionalAuth, spotifyController.getCurrentPlayback);
router.post('/play', requireClerkAuth, requireAuth, spotifyController.play);
router.post('/pause', requireClerkAuth, requireAuth, spotifyController.pause);
router.post('/next', requireClerkAuth, requireAuth, spotifyController.next);

export default router;

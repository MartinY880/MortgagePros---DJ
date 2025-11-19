import { Router } from 'express';
import { sessionController } from '../controllers/session.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { requireClerkAuth } from '../middleware/clerk.middleware';
import { scheduledPlaybackController } from '../controllers/scheduledPlayback.controller';
import { bannedTrackController } from '../controllers/bannedTrack.controller';

const router = Router();

router.post('/', requireClerkAuth, requireAuth, sessionController.create);
router.post('/code/:code/join', requireClerkAuth, sessionController.joinByCode);
router.post('/:id/reopen', requireClerkAuth, requireAuth, sessionController.reopen);
router.post('/:id/join', requireClerkAuth, sessionController.joinById);
router.get('/recent', requireClerkAuth, requireAuth, sessionController.getRecent);
router.get('/:id/scheduled-playback', requireClerkAuth, scheduledPlaybackController.list);
router.get('/:id/banned-track-lists', requireClerkAuth, requireAuth, bannedTrackController.list);
router.get('/:id/participant', requireClerkAuth, sessionController.getParticipant);
router.post('/:id/scheduled-playback', requireClerkAuth, requireAuth, scheduledPlaybackController.create);
router.delete('/:id/scheduled-playback/:scheduleId', requireClerkAuth, requireAuth, scheduledPlaybackController.cancel);
router.post('/:id/banned-track-lists', requireClerkAuth, requireAuth, bannedTrackController.createList);
router.post('/:id/banned-track-lists/:listId/tracks', requireClerkAuth, requireAuth, bannedTrackController.addTrack);
router.delete('/:id/banned-track-lists/:listId/tracks/:trackId', requireClerkAuth, requireAuth, bannedTrackController.removeTrack);
router.post('/:id/banned-track-lists/:listId/artists', requireClerkAuth, requireAuth, bannedTrackController.addArtist);
router.delete('/:id/banned-track-lists/:listId/artists/:artistId', requireClerkAuth, requireAuth, bannedTrackController.removeArtist);
router.get('/:id', sessionController.getById);
router.get('/code/:code', sessionController.getByCode);
router.delete('/:id', requireClerkAuth, requireAuth, sessionController.delete);
router.post('/:id/settings', requireClerkAuth, requireAuth, sessionController.updateSettings);
router.post('/:id/guest-credits', requireClerkAuth, requireAuth, sessionController.grantGuestCredits);

export default router;

import { Router } from 'express';
import { sessionController } from '../controllers/session.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { requireLogtoAuth } from '../middleware/logto.middleware';
import { scheduledPlaybackController } from '../controllers/scheduledPlayback.controller';
import { bannedTrackController } from '../controllers/bannedTrack.controller';

const router = Router();

router.post('/', requireLogtoAuth, requireAuth, sessionController.create);
router.post('/code/:code/join', requireLogtoAuth, sessionController.joinByCode);
router.post('/:id/reopen', requireLogtoAuth, requireAuth, sessionController.reopen);
router.post('/:id/join', requireLogtoAuth, sessionController.joinById);
router.get('/recent', requireLogtoAuth, requireAuth, sessionController.getRecent);
router.get('/:id/scheduled-playback', requireLogtoAuth, scheduledPlaybackController.list);
router.get('/:id/banned-track-lists', requireLogtoAuth, requireAuth, bannedTrackController.list);
router.get('/:id/participant', requireLogtoAuth, sessionController.getParticipant);
router.post('/:id/scheduled-playback', requireLogtoAuth, requireAuth, scheduledPlaybackController.create);
router.delete('/:id/scheduled-playback/:scheduleId', requireLogtoAuth, requireAuth, scheduledPlaybackController.cancel);
router.post('/:id/banned-track-lists', requireLogtoAuth, requireAuth, bannedTrackController.createList);
router.post('/:id/banned-track-lists/:listId/tracks', requireLogtoAuth, requireAuth, bannedTrackController.addTrack);
router.delete('/:id/banned-track-lists/:listId/tracks/:trackId', requireLogtoAuth, requireAuth, bannedTrackController.removeTrack);
router.post('/:id/banned-track-lists/:listId/artists', requireLogtoAuth, requireAuth, bannedTrackController.addArtist);
router.delete('/:id/banned-track-lists/:listId/artists/:artistId', requireLogtoAuth, requireAuth, bannedTrackController.removeArtist);
router.get('/:id', sessionController.getById);
router.get('/code/:code', sessionController.getByCode);
router.delete('/:id', requireLogtoAuth, requireAuth, sessionController.delete);
router.post('/:id/settings', requireLogtoAuth, requireAuth, sessionController.updateSettings);
router.post('/:id/guest-credits', requireLogtoAuth, requireAuth, sessionController.grantGuestCredits);

export default router;

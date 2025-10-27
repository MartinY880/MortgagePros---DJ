import { Router } from 'express';
import { sessionController } from '../controllers/session.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.post('/', requireAuth, sessionController.create);
router.post('/code/:code/join', sessionController.joinByCode);
router.post('/:id/reopen', requireAuth, sessionController.reopen);
router.post('/:id/join', sessionController.joinById);
router.get('/recent', requireAuth, sessionController.getRecent);
router.get('/:id/participant', sessionController.getParticipant);
router.get('/:id', sessionController.getById);
router.get('/code/:code', sessionController.getByCode);
router.delete('/:id', requireAuth, sessionController.delete);
router.post('/:id/settings', requireAuth, sessionController.updateSettings);

export default router;

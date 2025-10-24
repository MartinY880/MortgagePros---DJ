import { Router } from 'express';
import { sessionController } from '../controllers/session.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.post('/', requireAuth, sessionController.create);
router.post('/code/:code/join', sessionController.joinByCode);
router.post('/:id/join', sessionController.joinById);
router.get('/:id/participant', sessionController.getParticipant);
router.get('/:id', sessionController.getById);
router.get('/code/:code', sessionController.getByCode);
router.delete('/:id', requireAuth, sessionController.delete);

export default router;

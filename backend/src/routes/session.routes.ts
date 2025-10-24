import { Router } from 'express';
import { sessionController } from '../controllers/session.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.post('/', requireAuth, sessionController.create);
router.get('/:id', sessionController.getById);
router.get('/code/:code', sessionController.getByCode);
router.delete('/:id', requireAuth, sessionController.delete);

export default router;

import { Router } from 'express';
import { queueController } from '../controllers/queue.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.post('/:sessionId/add', requireAuth, queueController.add);
router.get('/:sessionId', queueController.get);
router.delete('/:queueItemId', requireAuth, queueController.remove);
router.post('/:queueItemId/vote', requireAuth, queueController.vote);

export default router;

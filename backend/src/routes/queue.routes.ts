import { Router } from 'express';
import { queueController } from '../controllers/queue.controller';
import { optionalAuth } from '../middleware/auth.middleware';
import { requireLogtoAuth } from '../middleware/logto.middleware';

const router = Router();

router.post('/:sessionId/add', requireLogtoAuth, optionalAuth, queueController.add);
router.get('/:sessionId', queueController.get);
router.delete('/:queueItemId', requireLogtoAuth, optionalAuth, queueController.remove);
router.post('/:queueItemId/vote', requireLogtoAuth, optionalAuth, queueController.vote);

export default router;

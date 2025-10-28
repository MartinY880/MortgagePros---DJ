import { Router } from 'express';
import { queueController } from '../controllers/queue.controller';
import { optionalAuth } from '../middleware/auth.middleware';
import { requireClerkAuth } from '../middleware/clerk.middleware';

const router = Router();

router.post('/:sessionId/add', requireClerkAuth, optionalAuth, queueController.add);
router.get('/:sessionId', queueController.get);
router.delete('/:queueItemId', requireClerkAuth, optionalAuth, queueController.remove);
router.post('/:queueItemId/vote', requireClerkAuth, optionalAuth, queueController.vote);

export default router;

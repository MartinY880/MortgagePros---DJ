import { Router } from 'express';
import { queueController } from '../controllers/queue.controller';
import { optionalAuth } from '../middleware/auth.middleware';

const router = Router();

router.post('/:sessionId/add', optionalAuth, queueController.add);
router.get('/:sessionId', queueController.get);
router.delete('/:queueItemId', optionalAuth, queueController.remove);
router.post('/:queueItemId/vote', optionalAuth, queueController.vote);

export default router;

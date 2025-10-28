import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { requireClerkAuth } from '../middleware/clerk.middleware';

const router = Router();

router.get('/login', authController.login);
router.get('/callback', authController.callback);
router.get('/me', requireClerkAuth, requireAuth, authController.me);
router.post('/logout', requireClerkAuth, authController.logout);

export default router;

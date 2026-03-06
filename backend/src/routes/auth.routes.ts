import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { requireLogtoAuth } from '../middleware/logto.middleware';

const router = Router();

router.get('/login', authController.login);
router.get('/callback', authController.callback);
router.get('/me', requireLogtoAuth, requireAuth, authController.me);
router.post('/logout', requireLogtoAuth, authController.logout);

export default router;

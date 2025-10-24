import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.get('/login', authController.login);
router.get('/callback', authController.callback);
router.get('/me', requireAuth, authController.me);
router.post('/logout', authController.logout);

export default router;

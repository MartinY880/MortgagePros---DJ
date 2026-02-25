import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { requireClerkAuth } from '../middleware/clerk.middleware';
import { signInTicketController } from '../controllers/signInTicket.controller';

const router = Router();

router.get('/login', authController.login);
router.get('/callback', authController.callback);
router.get('/me', requireClerkAuth, requireAuth, authController.me);
router.post('/logout', requireClerkAuth, authController.logout);
router.post('/iframe-token', requireClerkAuth, signInTicketController.createIframeToken);

export default router;

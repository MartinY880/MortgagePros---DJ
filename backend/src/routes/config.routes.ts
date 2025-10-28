import { Router } from 'express';
import { config } from '../config';

const router = Router();

router.get('/', (_req, res) => {
  res.json({
    apiBaseUrl: config.frontend.apiBaseUrl,
    socketUrl: config.frontend.socketUrl,
    clerkPublishableKey: config.frontend.clerkPublishableKey,
  });
});

export default router;

import { Router } from 'express';
import { config } from '../config';

const router = Router();

router.get('/', (_req, res) => {
  res.json({
    apiBaseUrl: config.frontend.apiBaseUrl,
    socketUrl: config.frontend.socketUrl,
    logtoEndpoint: config.frontend.logtoEndpoint,
    logtoAppId: config.frontend.logtoAppId,
    logtoApiResource: config.frontend.logtoApiResource,
  });
});

export default router;

import express from 'express';
import authController from '../controllers/auth.controller.js';
import authMiddleware from '../middleware/auth.middleware.js';
import {
    registerLimiter,
    loginLimiter,
    forgotPasswordLimiter,
} from '../middleware/rate-limit.middleware.js';

const router = express.Router();

router.post('/register', registerLimiter, authController.register);
router.get('/verify-email', authController.verifyEmail);
router.post('/login', loginLimiter, authController.login);
router.post('/forgot-password', forgotPasswordLimiter, authController.forgotPassword);
router.get('/me', authMiddleware, authController.me);

export default router;
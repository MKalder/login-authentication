import rateLimit from 'express-rate-limit';

const rateLimitMessage = (windowMs, max) => ({
    error: `Zu viele Anfragen. Maximal ${max} Versuche pro ${windowMs / 60000} Minuten.`,
});

export const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5, // ← max → limit
    message: rateLimitMessage(60 * 60 * 1000, 5),
    standardHeaders: true,
    legacyHeaders: false,
});

export const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10, // ← max → limit
    message: rateLimitMessage(15 * 60 * 1000, 10),
    standardHeaders: true,
    legacyHeaders: false,
});

export const forgotPasswordLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 3, // ← max → limit
    message: rateLimitMessage(60 * 60 * 1000, 3),
    standardHeaders: true,
    legacyHeaders: false,
});
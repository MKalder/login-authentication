import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/env.js';

const authMiddleware = (req, res, next) => {
    const authHeader = req.headers['authorization'];

    // 1. Header?
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing Token.' });
    }

    // 2. Token extract
    const token = authHeader.split(' ')[1];

    // 3. Token verification
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // userId + email for Controller
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expired.' });
        }
        return res.status(401).json({ error: 'Token invalid.' });
    }
};

export default authMiddleware;
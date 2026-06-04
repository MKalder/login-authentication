import bcrypt from 'bcrypt';
import crypto from 'crypto';
import authRepository from '../repositories/auth.repository.js';
import { APP_URL } from '../config/env.js';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/env.js';
import { sendVerificationMail, sendPasswordResetMail } from './mail.service.js';

const register = async (email, password) => {
    const existing = await authRepository.findUserByEmail(email);
    if (existing) {
        throw new Error('EMAIL_TAKEN');
    }

    // 1. create user
    const password_hash = await bcrypt.hash(password, 12);
    const user = await authRepository.createUser(email, password_hash);

    // 2. generate token
    const raw_token = crypto.randomBytes(32).toString('hex');
    const token_hash = crypto.createHash('sha256').update(raw_token).digest('hex');
    const expires_at = new Date(Date.now() + 30 * 60 * 1000); // 30 min validity

    // 3. save token
    await authRepository.createVerificationToken(user.id, token_hash, expires_at);

    // 4. send mail
    const verificationLink = `${APP_URL}/auth/verify-email?token=${raw_token}`;
    await sendVerificationMail(email, verificationLink);

    return user;
};

const verifyEmail = async (raw_token) => {
    // 1. Token hashen
    const token_hash = crypto.createHash('sha256').update(raw_token).digest('hex');

    // 2. Token in DB suchen
    const token = await authRepository.findVerificationToken(token_hash);
    if (!token) {
        throw new Error('TOKEN_INVALID');
    }

    // 3. Bereits verwendet?
    if (token.used_at) {
        throw new Error('TOKEN_USED');
    }

    // 4. Abgelaufen?
    if (new Date() > new Date(token.expires_at)) {
        throw new Error('TOKEN_EXPIRED');
    }

    // 5. User verifizieren + Token invalidieren
    await authRepository.verifyUser(token.user_id);
    await authRepository.markTokenAsUsed(token.id);
};


const me = async (userId) => {
    const user = await authRepository.findUserById(userId);
    if (!user) {
        throw new Error('USER_NOT_FOUND');
    }
    return user;
};

const forgotPassword = async (email) => {
    const user = await authRepository.findUserByEmail(email);

    // Bewusst keine Fehlermeldung — User-Enumeration verhindern
    if (!user || !user.is_verified) return;

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 Minuten

    await authRepository.createPasswordResetToken(user.id, tokenHash, expiresAt);

    const resetLink = `${APP_URL}/auth/reset-password?token=${rawToken}`;
    await sendPasswordResetMail(email, resetLink);
};

const resetPassword = async (rawToken, newPassword) => {
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const token = await authRepository.findPasswordResetToken(tokenHash);
    if (!token) {
        throw new Error('TOKEN_INVALID');
    }

    if (token.used_at) {
        throw new Error('TOKEN_USED');
    }

    if (new Date() > new Date(token.expires_at)) {
        throw new Error('TOKEN_EXPIRED');
    }

    const password_hash = await bcrypt.hash(newPassword, 12);

    await authRepository.updatePassword(token.user_id, password_hash);
    await authRepository.markResetTokenAsUsed(token.id);
};

const changePassword = async (userId, oldPassword, newPassword) => {
    // 1. User laden
    const user = await authRepository.findUserById(userId);
    if (!user) {
        throw new Error('USER_NOT_FOUND');
    }

    // 2. Altes Passwort prüfen
    const isValid = await bcrypt.compare(oldPassword, user.password_hash);
    if (!isValid) {
        throw new Error('INVALID_PASSWORD');
    }

    // 3. Neues Passwort darf nicht gleich dem alten sein
    const isSame = await bcrypt.compare(newPassword, user.password_hash);
    if (isSame) {
        throw new Error('SAME_PASSWORD');
    }

    // 4. Neues Passwort hashen und speichern
    const password_hash = await bcrypt.hash(newPassword, 12);
    await authRepository.updatePassword(userId, password_hash);
};

// login anpassen — Refresh Token zusätzlich erstellen
const login = async (email, password) => {
    const user = await authRepository.findUserByEmail(email);
    if (!user) throw new Error('INVALID_CREDENTIALS');

    if (!user.is_verified) throw new Error('EMAIL_NOT_VERIFIED');

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) throw new Error('INVALID_CREDENTIALS');

    // Access Token — kurzlebig
    const accessToken = jwt.sign(
        { userId: user.id, email: user.email },
        JWT_SECRET,
        { expiresIn: '15m' }
    );

    // Refresh Token — langlebig, in DB gespeichert
    const rawRefreshToken = crypto.randomBytes(32).toString('hex');
    const refreshTokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 Tage

    await authRepository.createRefreshToken(user.id, refreshTokenHash, expiresAt);

    return {
        accessToken,
        refreshToken: rawRefreshToken,
        user: { id: user.id, email: user.email },
    };
};

// Refresh — neuer Access Token gegen Refresh Token
const refresh = async (rawRefreshToken) => {
    const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');

    const token = await authRepository.findRefreshToken(tokenHash);
    if (!token) throw new Error('TOKEN_INVALID');

    if (token.revoked_at) throw new Error('TOKEN_REVOKED');

    if (new Date() > new Date(token.expires_at)) throw new Error('TOKEN_EXPIRED');

    const user = await authRepository.findUserById(token.user_id);
    if (!user) throw new Error('USER_NOT_FOUND');

    const accessToken = jwt.sign(
        { userId: user.id, email: user.email },
        JWT_SECRET,
        { expiresIn: '15m' }
    );

    return { accessToken };
};

// Logout — Refresh Token widerrufen
const logout = async (rawRefreshToken) => {
    const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
    await authRepository.revokeRefreshToken(tokenHash);
};

export default {
    register,
    verifyEmail,
    login,
    me,
    forgotPassword,
    resetPassword,
    changePassword,
    refresh,
    logout,
};





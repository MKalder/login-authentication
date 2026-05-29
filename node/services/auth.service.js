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

const login = async (email, password) => {
    // 1. Search user
    const user = await authRepository.findUserByEmail(email);
    if (!user) {
        throw new Error('INVALID_CREDENTIALS');
    }

    // 2. E-Mail verified?
    if (!user.is_verified) {
        throw new Error('EMAIL_NOT_VERIFIED');
    }

    // 3. Password check
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
        throw new Error('INVALID_CREDENTIALS');
    }

    // 4. Create JWT 
    const token = jwt.sign(
        { userId: user.id, email: user.email },
        JWT_SECRET,
        { expiresIn: '15m' }
    );

    return { token, user: { id: user.id, email: user.email } };
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

export default { register, verifyEmail, login, me, forgotPassword, resetPassword, changePassword };




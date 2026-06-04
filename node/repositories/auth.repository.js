import db from '../db/index.js';

const findUserById = async (id) => {
    const result = await db.query(
        'SELECT id, email, password_hash, is_verified, created_at FROM users WHERE id = $1',
        [id]
    );
    return result.rows[0] || null;
};

const findUserByEmail = async (email) => {
    const result = await db.query(
        'SELECT id, email, password_hash, is_verified FROM users WHERE email = $1',
        [email]
    );
    return result.rows[0] || null;
};

const createUser = async (email, password_hash) => {
    const result = await db.query(
        'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at',
        [email, password_hash]
    );
    return result.rows[0];
};

const createVerificationToken = async (user_id, token_hash, expires_at) => {
    await db.query(
        'INSERT INTO email_verification_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
        [user_id, token_hash, expires_at]
    );
};

const findVerificationToken = async (token_hash) => {
    const result = await db.query(
        `SELECT t.id, t.user_id, t.expires_at, t.used_at
         FROM email_verification_tokens t
         WHERE t.token_hash = $1`,
        [token_hash]
    );
    return result.rows[0] || null;
};

const markTokenAsUsed = async (token_id) => {
    await db.query(
        'UPDATE email_verification_tokens SET used_at = NOW() WHERE id = $1',
        [token_id]
    );
};

const verifyUser = async (user_id) => {
    await db.query(
        'UPDATE users SET is_verified = true WHERE id = $1',
        [user_id]
    );
};

const createPasswordResetToken = async (user_id, token_hash, expires_at) => {
    await db.query(
        'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
        [user_id, token_hash, expires_at]
    );
};

const findPasswordResetToken = async (token_hash) => {
    const result = await db.query(
        `SELECT id, user_id, expires_at, used_at
         FROM password_reset_tokens
         WHERE token_hash = $1`,
        [token_hash]
    );
    return result.rows[0] || null;
};

const updatePassword = async (user_id, password_hash) => {
    await db.query(
        'UPDATE users SET password_hash = $1 WHERE id = $2',
        [password_hash, user_id]
    );
};

const markResetTokenAsUsed = async (token_id) => {
    await db.query(
        'UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1',
        [token_id]
    );
};

const createRefreshToken = async (user_id, token_hash, expires_at) => {
    await db.query(
        'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
        [user_id, token_hash, expires_at]
    );
};

const findRefreshToken = async (token_hash) => {
    const result = await db.query(
        `SELECT id, user_id, expires_at, revoked_at
         FROM refresh_tokens
         WHERE token_hash = $1`,
        [token_hash]
    );
    return result.rows[0] || null;
};

const revokeRefreshToken = async (token_hash) => {
    await db.query(
        'UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1',
        [token_hash]
    );
};

const revokeAllRefreshTokens = async (user_id) => {
    await db.query(
        'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
        [user_id]
    );
};

export default {
    findUserByEmail,
    findUserById,
    createUser,
    createVerificationToken,
    findVerificationToken,
    markTokenAsUsed,
    verifyUser,
    createPasswordResetToken,
    findPasswordResetToken,
    updatePassword,
    markResetTokenAsUsed,
    createRefreshToken,
    findRefreshToken,
    revokeRefreshToken,
    revokeAllRefreshTokens,
};


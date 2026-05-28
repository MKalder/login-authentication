import db from '../db/index.js';

const findUserById = async (id) => {
    const result = await db.query(
        'SELECT id, email, is_verified, created_at FROM users WHERE id = $1',
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

export default {
    findUserByEmail,
    createUser,
    createVerificationToken,
    findVerificationToken,
    markTokenAsUsed,
    verifyUser,
    findUserById
};

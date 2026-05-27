import db from '../db/index.js';

const findUserByEmail = async (email) => {
    const result = await db.query(
        'SELECT id FROM users WHERE email = $1', [email]
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

export default { findUserByEmail, createUser };
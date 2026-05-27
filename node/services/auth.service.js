import bcrypt from 'bcrypt';
import authRepository from '../repositories/auth.repository.js';

const register = async (email, password) => {
    const existing = await authRepository.findUserByEmail(email);
    if (existing) {
        throw new Error('EMAIL_TAKEN');
    }

    const password_hash = await bcrypt.hash(password, 12);
    const user = await authRepository.createUser(email, password_hash);
    return user;
};

export default { register };
import authService from '../services/auth.service.js';

const register = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'E-Mail & Password are required.' });
    }
    if (password.length < 8) {
        return res.status(400).json({ error: 'Password has to fullfill the requirements.' });
    }

    try {
        const user = await authService.register(email, password);
        return res.status(201).json({ message: 'Successfully registrated.', user });
    } catch (err) {
        if (err.message === 'EMAIL_TAKEN') {
            return res.status(409).json({ error: 'E-Mail already registrated.' });
        }
        console.error(err);
        return res.status(500).json({ error: 'Error.' });
    }
};

const verifyEmail = async (req, res) => {
    const { token } = req.query;

    if (!token) {
        return res.status(400).json({ error: 'Token fehlt.' });
    }

    try {
        await authService.verifyEmail(token);
        return res.status(200).json({ message: 'E-Mail erfolgreich bestätigt.' });
    } catch (err) {
        if (err.message === 'TOKEN_INVALID') {
            return res.status(400).json({ error: 'Ungültiger Token.' });
        }
        if (err.message === 'TOKEN_USED') {
            return res.status(400).json({ error: 'Token wurde bereits verwendet.' });
        }
        if (err.message === 'TOKEN_EXPIRED') {
            return res.status(400).json({ error: 'Token abgelaufen.' });
        }
        console.error(err);
        return res.status(500).json({ error: 'Serverfehler.' });
    }
};

export default { register, verifyEmail };
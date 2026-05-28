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
        return res.status(400).json({ error: 'Token missing.' });
    }

    try {
        await authService.verifyEmail(token);
        return res.status(200).json({ message: 'E-Mail successfully activated.' });
    } catch (err) {
        if (err.message === 'TOKEN_INVALID') {
            return res.status(400).json({ error: 'Invalid Token.' });
        }
        if (err.message === 'TOKEN_USED') {
            return res.status(400).json({ error: 'Token already used.' });
        }
        if (err.message === 'TOKEN_EXPIRED') {
            return res.status(400).json({ error: 'Token expired.' });
        }
        console.error(err);
        return res.status(500).json({ error: 'Error.' });
    }
};


const login = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'E-Mail and Passwort are required.' });
    }

    try {
        const { token, user } = await authService.login(email, password);
        return res.status(200).json({ token, user });
    } catch (err) {
        if (err.message === 'INVALID_CREDENTIALS') {
            return res.status(401).json({ error: 'E-Mail or Password incorrect.' });
        }
        if (err.message === 'EMAIL_NOT_VERIFIED') {
            return res.status(403).json({ error: 'E-Mail has not been activated.' });
        }
        console.error(err);
        return res.status(500).json({ error: 'Error.' });
    }
};

export default { register, verifyEmail, login };

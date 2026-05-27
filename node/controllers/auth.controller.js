import authService from '../services/auth.service.js';

const register = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'E-Mail und Passwort sind erforderlich.' });
    }
    if (password.length < 8) {
        return res.status(400).json({ error: 'Passwort muss mindestens 8 Zeichen haben.' });
    }

    try {
        const user = await authService.register(email, password);
        return res.status(201).json({ message: 'Registrierung erfolgreich.', user });
    } catch (err) {
        if (err.message === 'EMAIL_TAKEN') {
            return res.status(409).json({ error: 'E-Mail bereits registriert.' });
        }
        console.error(err);
        return res.status(500).json({ error: 'Serverfehler.' });
    }
};

export default { register };
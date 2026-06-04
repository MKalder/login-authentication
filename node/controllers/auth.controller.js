import authService from '../services/auth.service.js';

const COOKIE_OPTIONS = {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 Tage
};

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

const me = async (req, res) => {
    try {
        const user = await authService.me(req.user.userId);
        return res.status(200).json({ user });
    } catch (err) {
        if (err.message === 'USER_NOT_FOUND') {
            return res.status(404).json({ error: 'User nicht gefunden.' });
        }
        console.error(err);
        return res.status(500).json({ error: 'Serverfehler.' });
    }
};

const forgotPassword = async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ error: 'E-Mail ist erforderlich.' });
    }

    try {
        await authService.forgotPassword(email);
        // Immer gleiche Antwort — User-Enumeration verhindern
        return res.status(200).json({
            message: 'Falls diese E-Mail registriert ist, wurde ein Reset-Link gesendet.',
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Serverfehler.' });
    }
};

const resetPassword = async (req, res) => {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
        return res.status(400).json({ error: 'Token und neues Passwort sind erforderlich.' });
    }

    if (newPassword.length < 8) {
        return res.status(400).json({ error: 'Passwort muss mindestens 8 Zeichen haben.' });
    }

    try {
        await authService.resetPassword(token, newPassword);
        return res.status(200).json({ message: 'Passwort erfolgreich zurückgesetzt.' });
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

const changePassword = async (req, res) => {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
        return res.status(400).json({ error: 'Altes und neues Passwort sind erforderlich.' });
    }

    if (newPassword.length < 8) {
        return res.status(400).json({ error: 'Passwort muss mindestens 8 Zeichen haben.' });
    }

    try {
        await authService.changePassword(req.user.userId, oldPassword, newPassword);
        return res.status(200).json({ message: 'Passwort erfolgreich geändert.' });
    } catch (err) {
        if (err.message === 'INVALID_PASSWORD') {
            return res.status(401).json({ error: 'Altes Passwort ist falsch.' });
        }
        if (err.message === 'SAME_PASSWORD') {
            return res.status(400).json({ error: 'Neues Passwort muss sich vom alten unterscheiden.' });
        }
        if (err.message === 'USER_NOT_FOUND') {
            return res.status(404).json({ error: 'User nicht gefunden.' });
        }
        console.error(err);
        return res.status(500).json({ error: 'Serverfehler.' });
    }
};


const login = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'E-Mail und Passwort sind erforderlich.' });
    }

    try {
        const { accessToken, refreshToken, user } = await authService.login(email, password);

        // Refresh Token als HTTPOnly Cookie setzen
        res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS);

        // Access Token im Body zurückgeben
        return res.status(200).json({ accessToken, user });
    } catch (err) {
        if (err.message === 'INVALID_CREDENTIALS') {
            return res.status(401).json({ error: 'E-Mail oder Passwort falsch.' });
        }
        if (err.message === 'EMAIL_NOT_VERIFIED') {
            return res.status(403).json({ error: 'E-Mail noch nicht bestätigt.' });
        }
        console.error(err);
        return res.status(500).json({ error: 'Serverfehler.' });
    }
};

const refresh = async (req, res) => {
    // Refresh Token aus Cookie lesen — nicht aus Body
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
        return res.status(401).json({ error: 'Kein Refresh Token vorhanden.' });
    }

    try {
        const { accessToken } = await authService.refresh(refreshToken);
        return res.status(200).json({ accessToken });
    } catch (err) {
        if (err.message === 'TOKEN_INVALID') return res.status(401).json({ error: 'Ungültiger Refresh Token.' });
        if (err.message === 'TOKEN_REVOKED') return res.status(401).json({ error: 'Refresh Token wurde widerrufen.' });
        if (err.message === 'TOKEN_EXPIRED') return res.status(401).json({ error: 'Refresh Token abgelaufen.' });
        console.error(err);
        return res.status(500).json({ error: 'Serverfehler.' });
    }
};

const logout = async (req, res) => {
    const refreshToken = req.cookies.refreshToken;

    // Cookie löschen — auch wenn kein Token vorhanden
    res.clearCookie('refreshToken', COOKIE_OPTIONS);

    if (!refreshToken) {
        return res.status(200).json({ message: 'Erfolgreich ausgeloggt.' });
    }

    try {
        await authService.logout(refreshToken);
        return res.status(200).json({ message: 'Erfolgreich ausgeloggt.' });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Serverfehler.' });
    }
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



import bcrypt from 'bcrypt';
import db from '../db/index.js';

const register = async (req, res) => {
    const { email, password } = req.body;

    // 1. Eingabe prüfen
    if (!email || !password) {
        return res.status(400).json({
            error: 'E-Mail und Passwort sind erforderlich.',
        });
    }

    if (password.length < 8) {
        return res.status(400).json({
            error: 'Passwort muss mindestens 8 Zeichen haben.',
        });
    }

    try {
        // 2. Prüfen ob E-Mail bereits existiert
        const existing = await db.query(
            'SELECT id FROM users WHERE email = $1',
            [email]
        );

        if (existing.rows.length > 0) {
            return res.status(409).json({
                error: 'E-Mail bereits registriert.',
            });
        }

        // 3. Passwort hashen
        const password_hash = await bcrypt.hash(password, 12);

        // 4. User anlegen
        const result = await db.query(
            `
      INSERT INTO users (email, password_hash)
      VALUES ($1, $2)
      RETURNING id, email, created_at
      `,
            [email, password_hash]
        );

        const user = result.rows[0];

        return res.status(201).json({
            message: 'Registrierung erfolgreich.',
            user: {
                id: user.id,
                email: user.email,
                created_at: user.created_at,
            },
        });

    } catch (err) {
        console.error(err);

        return res.status(500).json({
            error: 'Serverfehler.',
        });
    }
};

export default {
    register,
};
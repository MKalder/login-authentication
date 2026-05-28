import nodemailer from 'nodemailer';
import { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM } from '../config/env.js';

const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
    },
});

export const sendVerificationMail = async (email, token) => {
    // Link is build in auth.service
    await transporter.sendMail({
        from: MAIL_FROM,
        to: email,
        subject: 'Bitte bestätige deine E-Mail',
        html: `
            <h2>Willkommen!</h2>
            <p>Klicke auf den Link um deine E-Mail zu bestätigen:</p>
            <a href="${token}">E-Mail bestätigen</a>
            <p>Der Link ist 30 Minuten gültig.</p>
        `,
    });
};
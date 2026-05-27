import nodemailer from 'nodemailer';
import { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM } from '../config/env.js';

const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
    },
});

await transporter.sendMail({
    from: MAIL_FROM,
    to: 'info@prodowner.de',
    subject: 'Test',
    html: '<p>Nodemailer is running.</p>',
});

console.log('Mail send to: info@prodowner.de');
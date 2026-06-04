import * as api from './api.js';
import { saveAccessToken } from './storage.js';

export const initLogin = (showScreen) => {
    const loginBtn = document.getElementById('login-btn');
    const errorEl = document.getElementById('login-error');

    document.getElementById('go-register').addEventListener('click', (e) => {
        e.preventDefault();
        showScreen('register');
    });

    document.getElementById('go-forgot').addEventListener('click', (e) => {
        e.preventDefault();
        showScreen('forgot');
    });

    // Enter-Taste im Passwortfeld
    document.getElementById('login-password').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') loginBtn.click();
    });

    loginBtn.addEventListener('click', async () => {
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;

        errorEl.classList.add('hidden');

        if (!email || !password) {
            errorEl.textContent = 'Bitte E-Mail und Passwort eingeben.';
            errorEl.classList.remove('hidden');
            return;
        }

        loginBtn.disabled = true;
        loginBtn.textContent = 'Anmelden…';

        try {
            const { accessToken } = await api.login(email, password);
            await saveAccessToken(accessToken);
            document.getElementById('login-email').value = '';
            document.getElementById('login-password').value = '';
            showScreen('dashboard');
        } catch (err) {
            errorEl.textContent = err.message;
            errorEl.classList.remove('hidden');
        } finally {
            loginBtn.disabled = false;
            loginBtn.textContent = 'Anmelden';
        }
    });
};
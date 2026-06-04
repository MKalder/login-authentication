import * as api from './api.js';

export const initRegister = (showScreen) => {
    const registerBtn = document.getElementById('register-btn');
    const errorEl = document.getElementById('register-error');
    const successEl = document.getElementById('register-success');

    document.getElementById('go-login-from-register').addEventListener('click', (e) => {
        e.preventDefault();
        showScreen('login');
    });

    document.getElementById('register-password').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') registerBtn.click();
    });

    registerBtn.addEventListener('click', async () => {
        const email = document.getElementById('register-email').value.trim();
        const password = document.getElementById('register-password').value;

        errorEl.classList.add('hidden');
        successEl.classList.add('hidden');

        if (!email || !password) {
            errorEl.textContent = 'Bitte E-Mail und Passwort eingeben.';
            errorEl.classList.remove('hidden');
            return;
        }

        if (password.length < 8) {
            errorEl.textContent = 'Passwort muss mindestens 8 Zeichen haben.';
            errorEl.classList.remove('hidden');
            return;
        }

        registerBtn.disabled = true;
        registerBtn.textContent = 'Registrieren…';

        try {
            await api.register(email, password);
            successEl.textContent = '✓ Registrierung erfolgreich. Bitte bestätige deine E-Mail.';
            successEl.classList.remove('hidden');
            document.getElementById('register-email').value = '';
            document.getElementById('register-password').value = '';
        } catch (err) {
            errorEl.textContent = err.message;
            errorEl.classList.remove('hidden');
        } finally {
            registerBtn.disabled = false;
            registerBtn.textContent = 'Konto erstellen';
        }
    });
};
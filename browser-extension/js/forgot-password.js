import * as api from './api.js';

export const initForgotPassword = (showScreen) => {
    const forgotBtn = document.getElementById('forgot-btn');
    const errorEl = document.getElementById('forgot-error');
    const successEl = document.getElementById('forgot-success');

    document.getElementById('go-login-from-forgot').addEventListener('click', (e) => {
        e.preventDefault();
        showScreen('login');
    });

    document.getElementById('forgot-email').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') forgotBtn.click();
    });

    forgotBtn.addEventListener('click', async () => {
        const email = document.getElementById('forgot-email').value.trim();

        errorEl.classList.add('hidden');
        successEl.classList.add('hidden');

        if (!email) {
            errorEl.textContent = 'Bitte E-Mail eingeben.';
            errorEl.classList.remove('hidden');
            return;
        }

        forgotBtn.disabled = true;
        forgotBtn.textContent = 'Senden…';

        try {
            await api.forgotPassword(email);
            successEl.textContent = '✓ Falls diese E-Mail registriert ist, erhältst du einen Reset-Link.';
            successEl.classList.remove('hidden');
            document.getElementById('forgot-email').value = '';
        } catch (err) {
            errorEl.textContent = err.message;
            errorEl.classList.remove('hidden');
        } finally {
            forgotBtn.disabled = false;
            forgotBtn.textContent = 'Reset-Link senden';
        }
    });
};
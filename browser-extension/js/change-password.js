import * as api from './api.js';
import { getAccessToken } from './storage.js';

export const initChangePassword = (showScreen) => {
    const submitBtn = document.getElementById('change-password-submit-btn');
    const errorEl = document.getElementById('change-password-error');
    const successEl = document.getElementById('change-password-success');

    document.getElementById('go-dashboard').addEventListener('click', (e) => {
        e.preventDefault();
        // Felder leeren beim Zurückgehen
        document.getElementById('old-password').value = '';
        document.getElementById('new-password').value = '';
        errorEl.classList.add('hidden');
        successEl.classList.add('hidden');
        showScreen('dashboard');
    });

    document.getElementById('new-password').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submitBtn.click();
    });

    submitBtn.addEventListener('click', async () => {
        const oldPassword = document.getElementById('old-password').value;
        const newPassword = document.getElementById('new-password').value;

        errorEl.classList.add('hidden');
        successEl.classList.add('hidden');

        if (!oldPassword || !newPassword) {
            errorEl.textContent = 'Bitte beide Felder ausfüllen.';
            errorEl.classList.remove('hidden');
            return;
        }

        if (newPassword.length < 8) {
            errorEl.textContent = 'Neues Passwort muss mindestens 8 Zeichen haben.';
            errorEl.classList.remove('hidden');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Ändern…';

        try {
            const accessToken = await getAccessToken();
            await api.changePassword(accessToken, oldPassword, newPassword);
            successEl.textContent = '✓ Passwort erfolgreich geändert.';
            successEl.classList.remove('hidden');
            document.getElementById('old-password').value = '';
            document.getElementById('new-password').value = '';
        } catch (err) {
            errorEl.textContent = err.message;
            errorEl.classList.remove('hidden');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Passwort ändern';
        }
    });
};
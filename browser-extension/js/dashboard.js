import * as api from './api.js';
import { getAccessToken, clearAccessToken, saveAccessToken } from './storage.js';

export const initDashboard = (showScreen) => {
    document.getElementById('logout-btn').addEventListener('click', async () => {
        try {
            await api.logout();
        } catch (err) {
            console.error('Logout Fehler:', err);
        } finally {
            await clearAccessToken();
            showScreen('login');
        }
    });

    document.getElementById('change-password-btn').addEventListener('click', () => {
        showScreen('change-password');
    });
};

export const loadDashboard = async () => {
    const errorEl = document.getElementById('dashboard-error');

    let accessToken = await getAccessToken();

    // Kein Token? Versuche Refresh
    if (!accessToken) {
        try {
            const { accessToken: newToken } = await api.refresh();
            await saveAccessToken(newToken);
            accessToken = newToken;
        } catch {
            return; // Wird von popup.js behandelt
        }
    }

    try {
        const { user } = await api.me(accessToken);

        document.getElementById('dashboard-email').textContent =
            user.email;

        document.getElementById('dashboard-id').textContent =
            user.id;

        document.getElementById('dashboard-verified').textContent =
            user.is_verified ? '✓ Ja' : '✗ Nein';

        document.getElementById('dashboard-created').textContent =
            new Date(user.created_at).toLocaleDateString('de-DE', {
                day: '2-digit', month: '2-digit', year: 'numeric'
            });

        errorEl.classList.add('hidden');
    } catch (err) {
        // Access Token abgelaufen — Refresh versuchen
        if (err.message.includes('abgelaufen') || err.message.includes('ungültig')) {
            try {
                const { accessToken: newToken } = await api.refresh();
                await saveAccessToken(newToken);
                await loadDashboard(); // Nochmal laden mit neuem Token
            } catch {
                errorEl.textContent = 'Sitzung abgelaufen. Bitte neu anmelden.';
                errorEl.classList.remove('hidden');
            }
        } else {
            errorEl.textContent = err.message;
            errorEl.classList.remove('hidden');
        }
    }
};
import { getAccessToken, saveAccessToken, clearAccessToken } from './storage.js';
import * as api from './api.js';
import { initLogin } from './login.js';
import { initRegister } from './register.js';
import { initDashboard, loadDashboard } from './dashboard.js';
import { initForgotPassword } from './forgot-password.js';
import { initChangePassword } from './change-password.js';

// ─── Screen wechseln ───────────────────────────────────────────────────────
export const showScreen = async (screenId) => {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById(`screen-${screenId}`).classList.remove('hidden');

    if (screenId === 'dashboard') {
        await loadDashboard();
    }
};

// ─── Auth-State beim Start prüfen ─────────────────────────────────────────
const init = async () => {
    // Alle Screens initialisieren
    initLogin(showScreen);
    initRegister(showScreen);
    initDashboard(showScreen);
    initForgotPassword(showScreen);
    initChangePassword(showScreen);

    const accessToken = await getAccessToken();

    if (accessToken) {
        try {
            // Access Token noch gültig?
            await api.me(accessToken);
            await showScreen('dashboard');
        } catch {
            // Access Token abgelaufen — Refresh versuchen
            try {
                const { accessToken: newToken } = await api.refresh();
                await saveAccessToken(newToken);
                await showScreen('dashboard');
            } catch {
                // Refresh Token auch abgelaufen/ungültig → Login
                await clearAccessToken();
                showScreen('login');
            }
        }
    } else {
        // Kein Access Token — Refresh Cookie noch gültig?
        try {
            const { accessToken: newToken } = await api.refresh();
            await saveAccessToken(newToken);
            await showScreen('dashboard');
        } catch {
            showScreen('login');
        }
    }
};

document.addEventListener('DOMContentLoaded', init);
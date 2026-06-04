const BASE_URL = 'https://login-mvp.prodowner.de/auth';

const request = async (endpoint, options = {}) => {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
        ...options,
        credentials: 'include', // HTTPOnly Cookie mitsenden
        headers: {
            'Content-Type': 'application/json',
            ...options.headers,
        },
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || 'Unbekannter Fehler.');
    }

    return data;
};

export const login = (email, password) =>
    request('/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
    });

export const register = (email, password) =>
    request('/register', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
    });

export const logout = () =>
    request('/logout', { method: 'POST' });

export const refresh = () =>
    request('/refresh', { method: 'POST' });

export const me = (accessToken) =>
    request('/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

export const forgotPassword = (email) =>
    request('/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
    });

export const changePassword = (accessToken, oldPassword, newPassword) =>
    request('/change-password', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ oldPassword, newPassword }),
    });
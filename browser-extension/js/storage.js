export const saveAccessToken = (token) =>
    chrome.storage.local.set({ accessToken: token });

export const getAccessToken = () =>
    chrome.storage.local.get('accessToken').then(r => r.accessToken || null);

export const clearAccessToken = () =>
    chrome.storage.local.remove('accessToken');
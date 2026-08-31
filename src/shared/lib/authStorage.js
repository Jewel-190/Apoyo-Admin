/**
 * Auth token storage for staff login "Remember me".
 *
 * Checked: persist GoTrue session in localStorage (survives browser restart).
 * Unchecked: sessionStorage only (cleared when the tab/window is closed).
 *
 * Until the user submits the login form, missing preference keeps writing to
 * localStorage so existing persisted sessions are not moved on token refresh.
 * Reads fall back across both stores so a current session still restores.
 */

const PREFERENCE_KEY = "apoyo_admin_remember_session";

function localStore() {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function sessionStore() {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

function safeGet(store, key) {
  try {
    return store?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function safeSet(store, key, value) {
  try {
    store?.setItem(key, value);
  } catch {
    // Private mode / quota — ignore; auth still works in-memory for this tab.
  }
}

function safeRemove(store, key) {
  try {
    store?.removeItem(key);
  } catch {
    // Ignore storage write failures.
  }
}

export function getAuthPersistPreference() {
  return safeGet(localStore(), PREFERENCE_KEY) === "1";
}

export function setAuthPersistPreference(remember) {
  safeSet(localStore(), PREFERENCE_KEY, remember ? "1" : "0");
}

function shouldPersistAuthSession() {
  const raw = safeGet(localStore(), PREFERENCE_KEY);
  if (raw === "0") {
    return false;
  }
  return true;
}

export const apoyoAuthStorage = {
  getItem(key) {
    return safeGet(sessionStore(), key) ?? safeGet(localStore(), key);
  },
  setItem(key, value) {
    if (shouldPersistAuthSession()) {
      safeSet(localStore(), key, value);
      safeRemove(sessionStore(), key);
    } else {
      safeSet(sessionStore(), key, value);
      safeRemove(localStore(), key);
    }
  },
  removeItem(key) {
    safeRemove(localStore(), key);
    safeRemove(sessionStore(), key);
  },
};

/* eslint-disable react-refresh/only-export-components */
/**
 * App-wide access to the scoped platform settings stores.
 *
 * Any component can read a scope's settings (merged over defaults) via
 * {@link useScopeSettings}. Loading is lazy and cached per scope, so mounting
 * the provider is cheap; a scope is only fetched once a consumer asks for it.
 *
 * Superadmin write access is exposed through `saveGroup`; RLS still enforces
 * that non-superadmins cannot persist changes.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "./AuthContext";
import {
  SETTINGS_SCOPES,
  fetchScopeSettings,
  getScopeDefaults,
  saveSettingsGroup,
} from "../lib/settingsStore";

const SettingsContext = createContext(null);

function emptyScopeState(scope) {
  return {
    data: getScopeDefaults(scope),
    loading: false,
    loaded: false,
    error: null,
  };
}

function buildInitialState() {
  const state = {};
  for (const scope of SETTINGS_SCOPES) {
    state[scope] = emptyScopeState(scope);
  }
  return state;
}

export function SettingsProvider({ children }) {
  const { isAuthenticated, user } = useAuth();
  const [scopes, setScopes] = useState(buildInitialState);
  const requestedRef = useRef(new Set());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Reset when the authenticated principal changes (avoid cross-account bleed).
  useEffect(() => {
    requestedRef.current = new Set();
    setScopes(buildInitialState());
  }, [user?.id]);

  const loadScope = useCallback(
    async (scope, { force = false } = {}) => {
      if (!SETTINGS_SCOPES.includes(scope)) {
        return;
      }
      if (!isAuthenticated) {
        return;
      }
      if (!force && requestedRef.current.has(scope)) {
        return;
      }
      requestedRef.current.add(scope);

      setScopes((prev) => ({
        ...prev,
        [scope]: { ...prev[scope], loading: true, error: null },
      }));

      try {
        const data = await fetchScopeSettings(scope, { forceRefresh: force });
        if (!mountedRef.current) return;
        setScopes((prev) => ({
          ...prev,
          [scope]: { data, loading: false, loaded: true, error: null },
        }));
      } catch (error) {
        if (!mountedRef.current) return;
        requestedRef.current.delete(scope);
        setScopes((prev) => ({
          ...prev,
          [scope]: {
            ...prev[scope],
            loading: false,
            error: error?.message || "Failed to load settings.",
          },
        }));
      }
    },
    [isAuthenticated]
  );

  const saveGroup = useCallback(
    async (scope, groupId, value) => {
      await saveSettingsGroup(scope, groupId, value);
      // Optimistically reflect the write, then refresh from source.
      if (mountedRef.current) {
        setScopes((prev) => ({
          ...prev,
          [scope]: {
            ...prev[scope],
            data: { ...prev[scope].data, [groupId]: value },
          },
        }));
      }
      await loadScope(scope, { force: true });
    },
    [loadScope]
  );

  const value = useMemo(
    () => ({ scopes, loadScope, saveGroup }),
    [scopes, loadScope, saveGroup]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

function useSettingsContext() {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error("useScopeSettings/useSettings must be used within a SettingsProvider");
  }
  return ctx;
}

/**
 * Subscribe to a single settings scope. Triggers a lazy load on first use.
 *
 * @param {"system"|"admin"|"user"} scope
 * @returns {{
 *   settings: Record<string, any>,
 *   loading: boolean,
 *   loaded: boolean,
 *   error: string | null,
 *   reload: () => Promise<void>,
 *   saveGroup: (groupId: string, value: any) => Promise<void>,
 * }}
 */
export function useScopeSettings(scope) {
  const { scopes, loadScope, saveGroup } = useSettingsContext();

  useEffect(() => {
    void loadScope(scope);
  }, [scope, loadScope]);

  const state = scopes[scope] ?? emptyScopeState(scope);

  const reload = useCallback(() => loadScope(scope, { force: true }), [loadScope, scope]);
  const saveScopedGroup = useCallback(
    (groupId, value) => saveGroup(scope, groupId, value),
    [saveGroup, scope]
  );

  return {
    settings: state.data,
    loading: state.loading,
    loaded: state.loaded,
    error: state.error,
    reload,
    saveGroup: saveScopedGroup,
  };
}

/** Access all scopes at once (rarely needed; prefer useScopeSettings). */
export function useSettings() {
  return useSettingsContext();
}

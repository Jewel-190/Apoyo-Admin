/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { supabase } from "../lib/supabaseClient";
import {
  getRoleConfig,
  isAdminsRoleLinePlaceholder,
  lineRoleMatchesCatalogAdminKey,
  normalizeRawRole,
  normalizeRoleKey,
  resolveAdminRole,
} from "../config/roleConfig";
import {
  buildCatalogRoleConfig,
  buildGlobalCatalogView,
  fetchAssistanceCatalogSnapshot,
} from "../data/adminCatalog";
import { collectAllowedServiceIds } from "../lib/lineServiceScope";

const AuthContext = createContext(null);

const BROWSER_SESSION_KEY = "apoyo_admin_browser_session_id";
const LAST_PROTECTED_ROUTE_KEY = "apoyo_admin_last_protected_route";
const SESSION_TTL_SECONDS = 180;
const HEARTBEAT_INTERVAL_MS = 30 * 1000;

function createBrowserSessionId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function getOrCreateBrowserSessionId() {
  try {
    if (typeof window === "undefined" || !window.sessionStorage) {
      return createBrowserSessionId();
    }

    const existingId = window.sessionStorage.getItem(BROWSER_SESSION_KEY);
    if (existingId) {
      return existingId;
    }

    const nextId = createBrowserSessionId();
    window.sessionStorage.setItem(BROWSER_SESSION_KEY, nextId);
    return nextId;
  } catch {
    return createBrowserSessionId();
  }
}

function clearLastProtectedRoute() {
  try {
    if (typeof window === "undefined" || !window.sessionStorage) {
      return;
    }

    window.sessionStorage.removeItem(LAST_PROTECTED_ROUTE_KEY);
  } catch {
    // Ignore storage write failures.
  }
}

function logSession(session) {
  if (import.meta.env.DEV) {
    console.log("Session:", session);
  }
}

function logAuthEvent(event) {
  if (import.meta.env.DEV) {
    console.log("Auth event:", event);
  }
}

function normalizeErrorMessage(error, fallback = "Unexpected error") {
  if (!error) {
    return fallback;
  }

  if (typeof error === "string") {
    return error;
  }

  return error.message || error.error_description || fallback;
}

/** Any row that can be scoped after catalog load (explicit role, pin, or service_type slug). */
function isAdminProfileAllowed(profile) {
  if (!profile) {
    return false;
  }
  if (normalizeRawRole(profile.role) === "super_admin") {
    return true;
  }
  if (resolveAdminRole(profile)) {
    return true;
  }
  if (profile.category_id) {
    return true;
  }
  if (normalizeRoleKey(profile.service_type)) {
    return true;
  }
  return false;
}

async function fetchAdminProfile(userId) {
  const { data, error } = await supabase
    .from("admins")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  return { data, error };
}

async function fetchServerActiveSessionByEmail(email, candidateSessionId) {
  return supabase.rpc("is_admin_session_locked", {
    p_email: email,
    p_candidate_session_id: candidateSessionId,
    p_ttl_seconds: SESSION_TTL_SECONDS,
  });
}

async function claimServerActiveSession({ userId, email, sessionId }) {
  return supabase.rpc("claim_admin_session", {
    p_user_id: userId,
    p_email: email,
    p_session_id: sessionId,
    p_ttl_seconds: SESSION_TTL_SECONDS,
  });
}

async function touchServerActiveSession({ userId, sessionId }) {
  return supabase.rpc("touch_admin_session", {
    p_user_id: userId,
    p_session_id: sessionId,
    p_ttl_seconds: SESSION_TTL_SECONDS,
  });
}

async function releaseServerActiveSession({ userId, sessionId }) {
  return supabase.rpc("release_admin_session", {
    p_user_id: userId,
    p_session_id: sessionId,
  });
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [adminProfile, setAdminProfile] = useState(null);
  const [catalogSnapshot, setCatalogSnapshot] = useState(null);
  const [catalogBootstrapDone, setCatalogBootstrapDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sessionLockWarning, setSessionLockWarning] = useState("");

  const tabSessionIdRef = useRef(getOrCreateBrowserSessionId());
  const mountedRef = useRef(false);
  const syncVersionRef = useRef(0);
  const lockOwnedRef = useRef(false);
  const isManualSignInFlowRef = useRef(false);
  const currentSessionUserIdRef = useRef(null);
  const isAuthorizedAdminRef = useRef(false);
  const isBootstrappingSessionRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const clearAuthState = useCallback(() => {
    syncVersionRef.current += 1;
    setSession(null);
    setUser(null);
    setAdminProfile(null);
    setCatalogSnapshot(null);
    setCatalogBootstrapDone(false);
    setSessionLockWarning("");
    lockOwnedRef.current = false;
    currentSessionUserIdRef.current = null;
    isAuthorizedAdminRef.current = false;
  }, []);

  const attemptSessionLock = useCallback(async (nextSession, syncVersion) => {
    const nextUser = nextSession?.user;
    if (!nextUser?.id) {
      return;
    }

    const normalizedEmail = String(nextUser.email || "").trim().toLowerCase();

    if (!normalizedEmail) {
      return;
    }

    const { data: lockClaimed, error: claimError } = await claimServerActiveSession({
      userId: nextUser.id,
      email: normalizedEmail,
      sessionId: tabSessionIdRef.current,
    });

    if (!mountedRef.current || syncVersionRef.current !== syncVersion) {
      return;
    }

    if (claimError) {
      lockOwnedRef.current = false;
      console.warn("Session lock failed:", normalizeErrorMessage(claimError));
      setSessionLockWarning("Session lock check is unavailable right now. You can continue.");
      return;
    }

    if (!lockClaimed) {
      lockOwnedRef.current = false;
      console.warn("Session lock failed:", "This account appears active on another device/browser.");
      setSessionLockWarning("This account appears active on another device/browser.");
      return;
    }

    lockOwnedRef.current = true;
    setSessionLockWarning("");
  }, []);

  const applySession = useCallback(
    async (nextSession, eventLabel) => {
      const syncVersion = syncVersionRef.current + 1;
      syncVersionRef.current = syncVersion;

      logAuthEvent(eventLabel);
      logSession(nextSession);

      const nextUser = nextSession?.user ?? null;
      if (!nextUser?.id) {
        clearAuthState();
        return { profile: null, profileError: null, stale: false };
      }

      setSession(nextSession);
      setUser(nextUser);

      const { data: profile, error: profileError } = await fetchAdminProfile(nextUser.id);

      if (!mountedRef.current || syncVersionRef.current !== syncVersion) {
        return { profile: null, profileError: null, stale: true };
      }

      if (profileError) {
        console.warn("Admin profile fetch failed:", normalizeErrorMessage(profileError));
        setAdminProfile(null);
      } else {
        setAdminProfile(profile ?? null);
      }

      currentSessionUserIdRef.current = nextUser.id;
      isAuthorizedAdminRef.current = isAdminProfileAllowed(profile);

      // Session lock is optional and should never break authentication.
      if (isAdminProfileAllowed(profile)) {
        void attemptSessionLock(nextSession, syncVersion);
      }

      return { profile: profile ?? null, profileError, stale: false };
    },
    [attemptSessionLock, clearAuthState]
  );

  const signOut = useCallback(async () => {
    const currentUserId = user?.id;
    const currentSessionId = tabSessionIdRef.current;

    if (currentUserId) {
      const { error: releaseError } = await releaseServerActiveSession({
        userId: currentUserId,
        sessionId: currentSessionId,
      });

      if (releaseError) {
        console.warn("Session lock release failed:", normalizeErrorMessage(releaseError));
      }
    }

    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) {
      console.warn("Supabase signOut failed:", normalizeErrorMessage(error));
    }

    clearAuthState();
    clearLastProtectedRoute();
    setLoading(false);
  }, [clearAuthState, user?.id]);

  const signIn = useCallback(
    async ({ email, password, rememberMe = false }) => {
      void rememberMe;

      const normalizedEmail = String(email || "").trim().toLowerCase();

      if (!normalizedEmail.endsWith("@apoyo.gov")) {
        return {
          data: null,
          error: { message: "Use your @apoyo.gov email address." },
        };
      }

      setSessionLockWarning("");
      isManualSignInFlowRef.current = true;

      try {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });

        if (error) {
          return { data: null, error };
        }

        const activeSession = data?.session ?? null;
        const result = await applySession(activeSession, "SIGNED_IN");

        if (!result.stale && !isAdminProfileAllowed(result.profile) && !result.profileError) {
          const { error: localSignOutError } = await supabase.auth.signOut({ scope: "local" });

          if (localSignOutError) {
            console.warn("Supabase signOut failed:", normalizeErrorMessage(localSignOutError));
          }

          clearAuthState();
          return {
            data: null,
            error: {
              message: "Account is not authorized for this system.",
            },
          };
        }

        clearLastProtectedRoute();

        return {
          data: {
            user: data?.user ?? null,
            profile: result.profile,
          },
          error: null,
        };
      } catch (error) {
        return {
          data: null,
          error: {
            message: normalizeErrorMessage(error, "Unable to log in right now. Please try again."),
          },
        };
      } finally {
        isManualSignInFlowRef.current = false;
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    },
    [applySession, clearAuthState]
  );

  const checkAccountCurrentlyLoggedIn = useCallback(async (email) => {
    const normalizedEmail = String(email || "").trim().toLowerCase();

    if (!normalizedEmail) {
      return false;
    }

    const { data, error } = await fetchServerActiveSessionByEmail(
      normalizedEmail,
      tabSessionIdRef.current
    );

    if (error) {
      console.warn("Session lock check failed:", normalizeErrorMessage(error));
      return false;
    }

    return Boolean(data);
  }, []);

  const isAccountCurrentlyLoggedIn = useCallback((email) => {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    return Boolean(normalizedEmail);
  }, []);

  const lineAdminRole = useMemo(() => {
    if (!adminProfile) {
      return null;
    }
    const explicit = resolveAdminRole(adminProfile);
    if (explicit === "super_admin") {
      return "super_admin";
    }

    const cats = catalogSnapshot?.categories;
    let raw =
      explicit && !isAdminsRoleLinePlaceholder(explicit)
        ? normalizeRoleKey(explicit)
        : null;

    if (!raw && cats?.length && adminProfile.category_id) {
      const c = cats.find((x) => x.id === adminProfile.category_id);
      raw = c?.admin_role_key ? normalizeRoleKey(c.admin_role_key) : null;
    }

    if (!raw && cats?.length) {
      const st = normalizeRoleKey(adminProfile.service_type);
      if (st) {
        const bySlug = cats.find((x) => normalizeRoleKey(x.slug) === st);
        const byRole = cats.find(
          (x) =>
            x.admin_role_key &&
            lineRoleMatchesCatalogAdminKey(adminProfile.service_type, x.admin_role_key)
        );
        const c = bySlug || byRole;
        raw = c?.admin_role_key ? normalizeRoleKey(c.admin_role_key) : null;
      }
    }

    if (!raw) {
      return null;
    }

    if (raw !== "super_admin" && cats?.length) {
      const cat = cats.find(
        (x) =>
          x.admin_role_key &&
          lineRoleMatchesCatalogAdminKey(raw, x.admin_role_key)
      );
      if (cat?.admin_role_key) {
        return normalizeRoleKey(cat.admin_role_key);
      }
    }

    return raw;
  }, [adminProfile, catalogSnapshot]);

  useEffect(() => {
    let cancelled = false;

    const initialize = async () => {
      setLoading(true);
      isBootstrappingSessionRef.current = true;

      const {
        data: { session: initialSession },
        error,
      } = await supabase.auth.getSession();

      if (cancelled || !mountedRef.current) {
        return;
      }

      if (error) {
        console.warn("Initial session fetch failed:", normalizeErrorMessage(error));
      }

      if (!initialSession) {
        clearAuthState();
        setLoading(false);
        isBootstrappingSessionRef.current = false;
        return;
      }

      const result = await applySession(initialSession, "INITIAL_SESSION");

      if (cancelled || !mountedRef.current) {
        isBootstrappingSessionRef.current = false;
        return;
      }

      if (result.stale) {
        isBootstrappingSessionRef.current = false;
        return;
      }

      if (!result.stale && !isAdminProfileAllowed(result.profile) && !result.profileError) {
        const { error: localSignOutError } = await supabase.auth.signOut({ scope: "local" });

        if (localSignOutError) {
          console.warn("Supabase signOut failed:", normalizeErrorMessage(localSignOutError));
        }

        clearAuthState();
      }

      setLoading(false);
      isBootstrappingSessionRef.current = false;
    };

    void initialize();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (cancelled || !mountedRef.current) {
        return;
      }

      logAuthEvent(event);

      if (event === "SIGNED_OUT") {
        clearAuthState();
        setLoading(false);
        return;
      }

      if (!nextSession?.user?.id) {
        clearAuthState();
        setLoading(false);
        return;
      }

      if (isBootstrappingSessionRef.current && event === "SIGNED_IN") {
        logAuthEvent("SIGNED_IN skipped during bootstrap");
        return;
      }

      // Avoid duplicate bind on reload when session is already applied.
      if (
        event === "SIGNED_IN" &&
        currentSessionUserIdRef.current === nextSession.user.id &&
        isAuthorizedAdminRef.current
      ) {
        setSession(nextSession);
        setUser(nextSession.user);
        logSession(nextSession);
        return;
      }

      // Prevent double-apply race when signIn already handles profile binding.
      if (event === "SIGNED_IN" && isManualSignInFlowRef.current) {
        logAuthEvent("SIGNED_IN skipped during manual sign-in flow");
        return;
      }

      if (event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        setSession(nextSession);
        setUser(nextSession.user);
        logSession(nextSession);
        return;
      }

      if (event === "INITIAL_SESSION" || event === "SIGNED_IN") {
        setLoading(true);
        void (async () => {
          const result = await applySession(nextSession, event);

          if (cancelled || !mountedRef.current) {
            return;
          }

          if (result.stale) {
            return;
          }

          if (!isAdminProfileAllowed(result.profile) && !result.profileError) {
            const { error: localSignOutError } = await supabase.auth.signOut({ scope: "local" });

            if (localSignOutError) {
              console.warn("Supabase signOut failed:", normalizeErrorMessage(localSignOutError));
            }

            clearAuthState();
          }

          if (event === "INITIAL_SESSION") {
            isBootstrappingSessionRef.current = false;
          }

          setLoading(false);
        })();
      }
    });

    return () => {
      cancelled = true;
      isBootstrappingSessionRef.current = false;
      subscription.unsubscribe();
    };
  }, [applySession, clearAuthState]);

  useEffect(() => {
    if (!user?.id || !session) {
      return;
    }

    // Only maintain server lock heartbeat for admin sessions.
    if (!lineAdminRole) {
      return;
    }

    const userId = user.id;
    const normalizedEmail = String(user.email || "").trim().toLowerCase();
    const sessionId = tabSessionIdRef.current;

    const timerId = window.setInterval(async () => {
      const { data, error } = await touchServerActiveSession({
        userId,
        sessionId,
      });

      if (!error && data) {
        lockOwnedRef.current = true;
        return;
      }

      if (error) {
        console.warn("Session lock heartbeat failed:", normalizeErrorMessage(error));
      }

      if (!normalizedEmail) {
        return;
      }

      const { data: lockClaimed, error: claimError } = await claimServerActiveSession({
        userId,
        email: normalizedEmail,
        sessionId,
      });

      if (claimError || !lockClaimed) {
        lockOwnedRef.current = false;
        console.warn(
          "Session lock heartbeat reclaim failed:",
          normalizeErrorMessage(claimError, "Account may be active on another device/browser.")
        );
        setSessionLockWarning("Your account may also be active on another device/browser.");
        return;
      }

      lockOwnedRef.current = true;
      setSessionLockWarning("");
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      window.clearInterval(timerId);
    };
  }, [lineAdminRole, session, user]);

  useEffect(() => {
    let cancelled = false;

    if (!adminProfile) {
      setCatalogSnapshot(null);
      setCatalogBootstrapDone(true);
      return;
    }
    setCatalogBootstrapDone(false);

    const loadCatalog = async () => {
      try {
        const snap = await fetchAssistanceCatalogSnapshot();
        if (!cancelled) {
          setCatalogSnapshot(snap);
        }
      } catch (error) {
        console.warn("Assistance catalog fetch failed:", normalizeErrorMessage(error));
        if (!cancelled) {
          setCatalogSnapshot(null);
        }
      } finally {
        if (!cancelled) {
          setCatalogBootstrapDone(true);
        }
      }
    };

    void loadCatalog();

    return () => {
      cancelled = true;
    };
  }, [adminProfile]);

  const adminShellReady = useMemo(() => {
    if (loading) {
      return false;
    }
    if (!adminProfile) {
      return true;
    }
    return catalogBootstrapDone;
  }, [loading, adminProfile, catalogBootstrapDone]);

  const roleConfig = useMemo(() => {
    if (!adminProfile) {
      return getRoleConfig(null);
    }
    if (lineAdminRole === "super_admin") {
      const base = getRoleConfig("super_admin");
      if (!catalogSnapshot) {
        return base;
      }
      const global = buildGlobalCatalogView(catalogSnapshot);
      return {
        ...base,
        requestSources: global.services.map((s) => ({
          serviceId: s.serviceId,
          category: s.displayName,
          displayName: s.displayName,
        })),
        serviceIds: global.services.map((s) => s.serviceId).filter(Boolean),
        catalogServices: global.services,
        attachmentCatalog: global.attachmentCatalog,
      };
    }
    if (!lineAdminRole) {
      if (catalogSnapshot) {
        return buildCatalogRoleConfig(adminProfile, null, catalogSnapshot);
      }
      return getRoleConfig(null);
    }
    if (catalogSnapshot) {
      return buildCatalogRoleConfig(adminProfile, lineAdminRole, catalogSnapshot);
    }
    return getRoleConfig(lineAdminRole);
  }, [lineAdminRole, adminProfile, catalogSnapshot]);

  const allowedServiceIds = useMemo(
    () => collectAllowedServiceIds(roleConfig),
    [roleConfig]
  );

  const isAuthorizedSuperadmin = useMemo(
    () =>
      lineAdminRole === "super_admin" && Boolean(session && user && adminProfile),
    [adminProfile, lineAdminRole, session, user]
  );

  const value = useMemo(
    () => ({
      session,
      user,
      adminProfile,
      catalogSnapshot,
      adminRole: lineAdminRole,
      roleConfig,
      allowedServiceIds,
      attachmentCatalog: roleConfig?.attachmentCatalog,
      catalogServices: roleConfig?.catalogServices,
      theme: roleConfig?.theme,
      loading,
      adminShellReady,
      sessionLockWarning,
      signIn,
      signOut,
      isAccountCurrentlyLoggedIn,
      checkAccountCurrentlyLoggedIn,
      isAuthenticated: Boolean(session),
      isAuthorizedAdmin:
        Boolean(session && user && adminProfile) &&
        isAdminProfileAllowed(adminProfile) &&
        normalizeRawRole(adminProfile?.role) !== "super_admin",
      isAuthorizedSuperadmin,
    }),
    [
      lineAdminRole,
      allowedServiceIds,
      adminProfile,
      checkAccountCurrentlyLoggedIn,
      isAccountCurrentlyLoggedIn,
      isAuthorizedSuperadmin,
      loading,
      adminShellReady,
      roleConfig,
      catalogSnapshot,
      session,
      sessionLockWarning,
      signIn,
      signOut,
      user,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}


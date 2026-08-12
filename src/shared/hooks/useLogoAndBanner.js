/**
 * Live Logo & Banner assets for chrome surfaces (navbars, login).
 * Authenticated: prefers SettingsContext system scope.
 * Login / anon: fetches the public settings row directly.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useScopeSettings } from "../context/SettingsContext";
import {
  LOGO_BANNER_DEFAULTS,
  LOGO_BANNER_KEY,
  fetchLogoAndBanner,
  resolveLogoAndBanner,
} from "../lib/brandingAssets";

export function useLogoAndBanner(fallbacks = {}) {
  const { isAuthenticated } = useAuth();
  const { settings, loading: scopeLoading, loaded: scopeLoaded } = useScopeSettings("system");
  const [publicValue, setPublicValue] = useState(LOGO_BANNER_DEFAULTS);
  const [publicLoading, setPublicLoading] = useState(!isAuthenticated);
  const [publicError, setPublicError] = useState(null);

  useEffect(() => {
    if (isAuthenticated) {
      setPublicLoading(false);
      return undefined;
    }

    let cancelled = false;
    setPublicLoading(true);
    setPublicError(null);

    fetchLogoAndBanner()
      .then((value) => {
        if (!cancelled) {
          setPublicValue(value);
          setPublicLoading(false);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setPublicError(error?.message || "Failed to load branding.");
          setPublicLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const stored = useMemo(() => {
    if (isAuthenticated) {
      return settings?.[LOGO_BANNER_KEY] ?? LOGO_BANNER_DEFAULTS;
    }
    return publicValue;
  }, [isAuthenticated, settings, publicValue]);

  const assets = useMemo(
    () => resolveLogoAndBanner(stored, fallbacks),
    // Callers pass stable Vite asset module URLs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      stored,
      fallbacks.apoyoLogo,
      fallbacks.apoyoBanner,
      fallbacks.dasmaLogo,
      fallbacks.dasmaBanner,
    ]
  );

  const reloadPublic = useCallback(async () => {
    const value = await fetchLogoAndBanner();
    setPublicValue(value);
    return value;
  }, []);

  return {
    assets,
    raw: stored,
    loading: isAuthenticated ? scopeLoading && !scopeLoaded : publicLoading,
    error: publicError,
    reloadPublic,
  };
}

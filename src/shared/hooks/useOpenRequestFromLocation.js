import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  consumeOpenRequestLocationState,
  fetchAdminApplicationByRequestId,
} from "../lib/adminRequestNavigation";
import { useAuth } from "../context/AuthContext";

/**
 * When navigated here with `location.state.openRequestId`, open that request
 * once the module list has finished loading. Falls back to a direct fetch if
 * the row is missing from the in-memory list.
 */
export function useOpenRequestFromLocation({
  applications,
  isLoading,
  onOpen,
  getRequestId = (app) => app?.requestId,
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { allowedServiceIds } = useAuth();

  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  const getRequestIdRef = useRef(getRequestId);
  getRequestIdRef.current = getRequestId;

  const handledNonceRef = useRef(null);
  const fallbackInFlightRef = useRef(null);

  useEffect(() => {
    const requestId = location?.state?.openRequestId;
    const nonce = location?.state?.openRequestNonce ?? requestId;
    if (!requestId || isLoading) {
      return undefined;
    }

    const attemptKey = `${String(requestId)}:${String(nonce)}`;
    if (handledNonceRef.current === attemptKey) {
      return undefined;
    }

    const match = (applications || []).find(
      (app) => String(getRequestIdRef.current(app) || "") === String(requestId)
    );

    if (match) {
      handledNonceRef.current = attemptKey;
      consumeOpenRequestLocationState(navigate, location.pathname);
      onOpenRef.current?.(match);
      return undefined;
    }

    // List finished loading without the row — fetch it directly once per attempt.
    if (fallbackInFlightRef.current === attemptKey) {
      return undefined;
    }
    fallbackInFlightRef.current = attemptKey;

    let cancelled = false;

    void (async () => {
      try {
        const fetched = await fetchAdminApplicationByRequestId(
          requestId,
          allowedServiceIds
        );
        if (cancelled) {
          return;
        }
        if (!fetched) {
          // Give up on this attempt so we don't loop forever.
          handledNonceRef.current = attemptKey;
          consumeOpenRequestLocationState(navigate, location.pathname);
          return;
        }
        handledNonceRef.current = attemptKey;
        consumeOpenRequestLocationState(navigate, location.pathname);
        onOpenRef.current?.(fetched);
      } catch (error) {
        console.warn("[useOpenRequestFromLocation] fallback fetch failed:", error);
        if (!cancelled) {
          handledNonceRef.current = attemptKey;
          consumeOpenRequestLocationState(navigate, location.pathname);
        }
      } finally {
        if (fallbackInFlightRef.current === attemptKey) {
          fallbackInFlightRef.current = null;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    allowedServiceIds,
    applications,
    isLoading,
    location.pathname,
    location?.state?.openRequestId,
    location?.state?.openRequestNonce,
    navigate,
  ]);
}

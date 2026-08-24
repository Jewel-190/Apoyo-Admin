/**
 * Live Logo & Banner assets via the shared runtime store (cache → network).
 * Prefer this over SettingsContext for paint-critical chrome.
 */
import { useSyncExternalStore } from "react";
import {
  getLogoAndBannerSnapshot,
  subscribeLogoAndBanner,
} from "../lib/brandingAssets";

export function useLogoAndBanner() {
  const snapshot = useSyncExternalStore(
    subscribeLogoAndBanner,
    getLogoAndBannerSnapshot,
    getLogoAndBannerSnapshot
  );

  return {
    assets: snapshot.assets,
    raw: snapshot.raw,
    ready: snapshot.ready,
    loading: !snapshot.ready,
    error: null,
  };
}

/**
 * Live system theme via the shared runtime store (cache → network).
 * Prefer this over reading SettingsContext for paint-critical chrome.
 */
import { useSyncExternalStore } from "react";
import {
  getSystemThemeSnapshot,
  subscribeSystemTheme,
} from "../lib/systemTheme";

export function useSystemTheme() {
  const snapshot = useSyncExternalStore(
    subscribeSystemTheme,
    getSystemThemeSnapshot,
    getSystemThemeSnapshot
  );

  return {
    primaryColor: snapshot.primaryColor,
    cssVars: snapshot.cssVars,
    ready: snapshot.ready,
    loading: !snapshot.ready,
    error: null,
  };
}

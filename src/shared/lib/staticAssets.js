/**
 * Single catalog for bundled and public static images.
 *
 * Rules:
 * - Every Vite `import` of a file under `src/assets` lives in this module.
 * - `public/` URLs stay here too so favicons / notification icons share one map.
 * - UI code should import named exports from here (or from brandingAssets for CMS).
 */

import apoyoLogo from "../../assets/apoyo-logo.png";
import apoyoBanner from "../../assets/apoyo-banner.png";
import loginHero from "../../assets/login-hero.png";

export const STATIC_ASSETS = Object.freeze({
  apoyoLogo,
  apoyoBanner,
  loginHero,
  /** Locked Apoyo product mark in `public/` (not CMS-editable). */
  favicon: "/apoyo-favicon.png",
});

export const APOYO_LOGO_URL = STATIC_ASSETS.apoyoLogo;
export const APOYO_BANNER_URL = STATIC_ASSETS.apoyoBanner;
export const LOGIN_HERO_URL = STATIC_ASSETS.loginHero;
/** Browser / notification icon (public URL, not hashed). */
export const FAVICON_URL = STATIC_ASSETS.favicon;

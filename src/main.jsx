// ============================================
// FILE: main.jsx — Entry point
// ============================================
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import { bootstrapLogoAndBanner } from "./shared/lib/brandingAssets";
import { bootstrapSystemTheme } from "./shared/lib/systemTheme";

// Paint-critical platform chrome: hydrate from cache, then reconcile with DB.
bootstrapSystemTheme();
bootstrapLogoAndBanner();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

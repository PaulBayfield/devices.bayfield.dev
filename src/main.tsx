import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { registerPrefsDesktop } from "./lib/prefs";
import "./styles.css";
import "./devices.css";

// Back from single sign-on (which always lands on "/"): return to the page that asked for it.
try {
  const back = sessionStorage.getItem("devices.returnTo");
  if (back && location.pathname === "/" && !location.search.includes("signin_error")) history.replaceState(null, "", back);
  sessionStorage.removeItem("devices.returnTo");
} catch {
  // Storage unavailable: stay on the home page.
}

// Desktop app: the shared preferences use its Tauri functions (see lib/prefs.ts).
if ("__TAURI_INTERNALS__" in window) registerPrefsDesktop({ invoke, openUrl });

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

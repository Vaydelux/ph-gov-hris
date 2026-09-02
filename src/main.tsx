import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

/* Global diagnostics: anything that escapes React's commit phase (async code,
   timers, third-party scripts) is logged with a structured envelope instead of
   disappearing silently. */
window.addEventListener("error", (e) => {
  console.error("[gov-hris] uncaught error:", e.message, { source: e.filename, line: e.lineno, col: e.colno });
});
window.addEventListener("unhandledrejection", (e) => {
  console.error("[gov-hris] unhandled rejection:", e.reason instanceof Error ? e.reason.message : e.reason);
});

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);

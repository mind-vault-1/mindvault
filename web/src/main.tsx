import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.js";
import { ErrorBoundary } from "./components/ErrorBoundary.js";
import "./i18n/config.js";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);

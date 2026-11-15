import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { LanguageProvider } from "./i18n/LanguageContext";
import "./styles/hud.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Could not find #root element");
}

createRoot(container).render(
  <StrictMode>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </StrictMode>,
);

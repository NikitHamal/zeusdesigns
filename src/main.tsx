import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { installDesignFonts } from "./lib/fonts";
import { applyTheme } from "./lib/theme";
import { useStore } from "./store";

try {
  const { theme, hue } = useStore.getState().settings;
  applyTheme(theme, hue);
  installDesignFonts();
} catch {
  applyTheme("dark", 17);
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

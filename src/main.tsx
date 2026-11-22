import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { nativePerf } from "./lib/bridge";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Release inline singlefile script DOM text buffers and trim working set right after initial mount
setTimeout(() => {
  document.querySelectorAll<HTMLScriptElement>("script[type='module']").forEach((s) => {
    if (s.textContent && s.textContent.length > 10000) s.textContent = "";
  });
  void nativePerf.trim();
}, 450);

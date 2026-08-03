import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./pages/App";
import "./styles.css";
import "./styles/project.css";
import "./styles/user-management.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

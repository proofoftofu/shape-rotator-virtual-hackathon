import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { installBufferPolyfill } from "./installBufferPolyfill.js";
import "./index.css";

installBufferPolyfill();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

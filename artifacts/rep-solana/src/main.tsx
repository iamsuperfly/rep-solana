// RepSolana — main entry.
// Buffer / process / global are polyfilled by vite-plugin-node-polyfills
// (configured in vite.config.ts) so all Solana libs Just Work in the browser.
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
// Wallet adapter UI base styles (Phantom modal, etc.)
import "@solana/wallet-adapter-react-ui/styles.css";

createRoot(document.getElementById("root")!).render(<App />);

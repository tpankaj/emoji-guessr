import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

// In dev, /api is proxied straight to the Functions emulator.
const FUNCTION_URL = "/demo-emoji-guesser/us-central1/api";

export default defineConfig({
  plugins: [preact()],
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:5001",
        rewrite: (path) => FUNCTION_URL + path,
      },
    },
  },
});

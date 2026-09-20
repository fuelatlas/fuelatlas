import { defineConfig } from "vite";

// Relative base so the same build works on GitHub Pages under /<repo>/.
export default defineConfig({ base: "./", build: { target: "es2022" } });

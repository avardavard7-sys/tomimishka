import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#0B0B12",
        panel: "#12121D",
        ink: "#F3F2FA",
        graphite: "#A3A1BC",
        line: "#242438",
        amber: "#FFB020",
        dimred: "#FF6B5E",
        violet: "#8B5CF6",
        pink: "#EC4899",
      },
      fontFamily: {
        display: ["var(--font-display)"],
        body: ["var(--font-body)"],
        mono: ["var(--font-mono)"],
      },
    },
  },
  plugins: [],
};
export default config;

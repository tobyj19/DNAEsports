import type { Config } from "tailwindcss";

// DNA Analytics palette — taken from the logo kit (dark set). Use these tokens
// instead of hex values so every page stays on-brand:
//   cyan / magenta  brand accents (buttons, selected states, links, progress)
//   mint / bad      meaning only: good vs bad (faster/slower, profit/loss)
//   amber           warnings and caveats
const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#05070D", // page background (logo ground)
        panel: "#0B111A", // cards
        panel2: "#101826", // raised / hover
        line: "#1B2533", // borders
        fg: "#EAF6FF", // primary text (logo text)
        soft: "#C3D0DD", // secondary text
        muted: "#8B9BB0", // labels, captions
        faint: "#5B6878", // disabled, axis ticks
        cyan: "#22E5FF",
        magenta: "#FF2BD6",
        mint: "#4ADE80",
        bad: "#F87171",
        amber: "#F5A623",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;

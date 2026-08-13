/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // AGEROUTE Guinée — Charte graphique officielle (logo 2024)
        // Bleu marine institutionnel — triangle principal + "ROUTE"
        navy: {
          DEFAULT: "#1B2A4A",   // bleu marine profond — sidebar, textes
          light:   "#243660",   // survol / hover
          50:      "#EEF1F7",   // fond très léger
          100:     "#C8D0E2",
        },
        // Or institutionnel — petit triangle + "AGE"
        gold: {
          DEFAULT: "#F0A500",   // or AGEROUTE (petit triangle + "AGE")
          light:   "#F5B833",   // variante claire
          pale:    "#FFF8E1",   // fond subtil
          dark:    "#C8860A",   // pression / hover
        },
        // Accents UI
        brand: {
          blue:   "#1B2A4A",    // bleu marine principal
          gold:   "#F0A500",    // or accent
          red:    "#C62828",    // rouge danger / blocage
        },
        // Statuts conformité
        conform: {
          vert:      "#16A34A",
          "vert-bg": "#F0FDF4",
          orange:    "#D97706",
          "orng-bg": "#FFFBEB",
          rouge:     "#DC2626",
          "rge-bg":  "#FEF2F2",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card:  "0 1px 3px 0 rgba(0,0,0,.07), 0 1px 2px -1px rgba(0,0,0,.06)",
        modal: "0 8px 32px rgba(0,0,0,.18)",
      },
    },
  },
  plugins: [],
};

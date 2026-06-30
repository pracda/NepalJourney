const base = require("@nepal-journey/config/tailwind");

/** @type {import('tailwindcss').Config} */
module.exports = {
  ...base,
  content: ["./src/**/*.{ts,tsx}"],
};

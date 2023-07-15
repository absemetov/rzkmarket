const path = require("path");

export default {
  root: path.resolve(__dirname, "sites/rzk.com.ru/vite"),
  build: {
    outDir: "../dist",
  },
  server: {
    port: 5000,
  },
};

import { resolve } from "path";
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const rawPyPlugin = {
  name: "raw-py",
  transform(code: string, id: string) {
    if (id.endsWith(".py")) {
      return { code: `export default ${JSON.stringify(code)};`, map: null };
    }
    return null;
  },
};

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        external: ["better-sqlite3"],
        plugins: [rawPyPlugin],
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve("src/preload/index.ts"),
          askpass: resolve("src/preload/askpass.ts"),
        },
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        "@renderer": resolve("src/renderer/src"),
      },
    },
    plugins: [tailwindcss(), react()],
  },
});

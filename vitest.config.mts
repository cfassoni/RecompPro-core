import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    fileParallelism: false,
    projects: [
      {
        test: {
          name: "node",
          include: ["src/lib/__tests__/**/*.test.ts"],
          environment: "node",
          globals: true,
        },
        resolve: {
          alias: {
            "@": path.resolve(process.cwd(), "./src"),
          },
        },
      },
      {
        test: {
          name: "jsdom",
          include: [
            "src/components/**/__tests__/**/*.test.tsx",
            "src/components/__tests__/**/*.test.tsx",
            "src/views/__tests__/**/*.test.tsx",
            "src/context/__tests__/**/*.test.tsx",
            "src/app/__tests__/**/*.test.tsx",
          ],
          environment: "jsdom",
          globals: true,
          setupFiles: ["./vitest.setup.ts"],
        },
        resolve: {
          alias: {
            "@": path.resolve(process.cwd(), "./src"),
          },
        },
      },
    ],
  },
});

import nextConfig from "eslint-config-next";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const canonicalPlugins = new Map();

function normalizeFlatConfigs(configs) {
  return configs.map((entry) => {
    if (!entry || typeof entry !== "object" || !entry.plugins) {
      return entry;
    }
    const normalizedPlugins = {};
    for (const [name, plugin] of Object.entries(entry.plugins)) {
      if (!canonicalPlugins.has(name)) {
        canonicalPlugins.set(name, plugin);
      }
      normalizedPlugins[name] = canonicalPlugins.get(name);
    }
    return {
      ...entry,
      plugins: normalizedPlugins,
    };
  });
}

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "test-results/**",
      "playwright-report/**",
      "dist/**",
      "out/**",
    ],
  },
  ...normalizeFlatConfigs([
    ...(Array.isArray(nextConfig) ? nextConfig : [nextConfig]),
    ...(Array.isArray(nextCoreWebVitals) ? nextCoreWebVitals : [nextCoreWebVitals]),
    ...(Array.isArray(nextTypescript) ? nextTypescript : [nextTypescript]),
  ]),
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-require-imports": "off",
      "@next/next/no-img-element": "off",
      "react-hooks/exhaustive-deps": "off",
      "react-hooks/set-state-in-effect": "off",
      "import/no-anonymous-default-export": "off",
    },
  },
];

export default eslintConfig;

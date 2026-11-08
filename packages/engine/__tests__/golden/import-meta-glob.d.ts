// Vitest runs test files through Vite, which provides `import.meta.glob`. The engine has
// no Vite or Node types (purity guard), so the golden test declares only what it uses.
interface ImportMeta {
  glob(
    pattern: string,
    options: { readonly eager: true; readonly import: 'default' },
  ): Record<string, unknown>;
}

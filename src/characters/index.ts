export * from './registry';
export * from './Blob';
export * from './Robot';
export * from './Prop';
export * from './animations';

// Auto-discover any custom character files dropped into src/characters/*.tsx in Vite environments
try {
  const globMeta = import.meta as unknown as {
    glob?: (pattern: string, opts: { eager: boolean }) => Record<string, unknown>;
  };
  if (typeof globMeta.glob === 'function') {
    globMeta.glob('./*.tsx', { eager: true });
  }
} catch {
  // Node/CLI environment uses explicit exports above or dynamic import discovery
}


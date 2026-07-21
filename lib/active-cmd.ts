import { loadContext } from './context-core.js';

// Prints the active layer. No context is a valid answer for this command,
// so it stays informational: stdout, exit 0.
export default function activeCmd(): void {
  const ctx = loadContext();

  if (!ctx) {
    console.log('no active layer - run: arcq use <name>');
    return;
  }

  const label =
    ctx.name && ctx.service != null && ctx.layerId != null
      ? `${ctx.service}:${ctx.layerId} → ${ctx.name}`
      : ctx.name || ctx.url;

  console.log(label);
  console.log(ctx.url);
}

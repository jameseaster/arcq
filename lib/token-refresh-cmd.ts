import { performRefresh, type RefreshDeps } from './oauth-core.js';

export default async function tokenRefreshCmd(
  deps: RefreshDeps = {}
): Promise<void> {
  const { expires } = await performRefresh(deps);
  console.log(`Token refreshed (expires ${new Date(expires).toISOString()}).`);
}

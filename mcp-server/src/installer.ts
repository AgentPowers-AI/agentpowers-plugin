/** Installer — re-exported from @agentpowers/core. */

export {
  validateSlug,
  getInstallDir,
  validateArchiveMembers,
  downloadAndExtract,
  flattenSingleTopDir,
  TOOL_CONFIG_DIRS,
} from "@agentpowers/core";

export type { InstallResult, PackageType } from "@agentpowers/core";

/** Set of valid target tool identifiers. */
import { TOOL_CONFIG_DIRS as _dirs } from "@agentpowers/core";
export const SUPPORTED_TOOLS = new Set(Object.keys(_dirs));

import { fileURLToPath } from "node:url"
import { version } from "../package.json"

if (process.platform !== "linux") {
  throw new Error("Use the installer in release/ on macOS or Windows.")
}

const result = Bun.spawnSync([
  "sh",
  fileURLToPath(new URL("./install-calcn.sh", import.meta.url)),
  fileURLToPath(new URL(`../release/calcn-${version}.AppImage`, import.meta.url)),
], { stdout: "inherit", stderr: "inherit" })
process.exit(result.exitCode)

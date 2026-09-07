import { copyFile } from "node:fs/promises"

if (process.platform === "linux") {
  await copyFile(
    new URL("./install-calcn.sh", import.meta.url),
    new URL("../release/install-calcn.sh", import.meta.url),
  )
}

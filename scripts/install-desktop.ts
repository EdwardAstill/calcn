import { chmod, copyFile, mkdir, rename } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { version } from "../package.json"

if (process.platform !== "linux") {
  throw new Error("Use the installer in release/ on macOS or Windows.")
}

const binDirectory = join(homedir(), ".local", "bin")
const executable = join(binDirectory, "calcn")
await mkdir(binDirectory, { recursive: true })
const temporaryExecutable = `${executable}.new`
await copyFile(new URL(`../release/calcn-${version}.AppImage`, import.meta.url), temporaryExecutable)
await chmod(temporaryExecutable, 0o755)
await rename(temporaryExecutable, executable)
console.log(`Installed ${executable}. Run calcn to open the desktop app.`)

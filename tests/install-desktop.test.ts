import { afterEach, expect, test } from "bun:test"
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const installer = fileURLToPath(new URL("../scripts/install-calcn.sh", import.meta.url))
const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

test("release installer registers and updates an app without running it", async () => {
  const directory = await mkdtemp(join(tmpdir(), "calcn-install-"))
  directories.push(directory)
  const home = join(directory, "home with spaces %")
  const data = join(directory, "custom data")
  const appImage = join(directory, "download.AppImage")
  await mkdir(home)
  await writeFile(appImage, "first build")
  const install = () => Bun.spawnSync(["sh", installer, appImage], {
    env: { ...process.env, HOME: home, XDG_DATA_HOME: data },
  })
  expect(install().exitCode).toBe(0)
  const executable = join(home, ".local/bin/calcn")
  expect(await readFile(executable, "utf8")).toBe("first build")
  expect((await stat(executable)).mode & 0o777).toBe(0o755)
  const desktopPath = join(data, "applications/calcn.desktop")
  const desktop = await readFile(desktopPath, "utf8")
  expect(desktop).toContain(`Exec="${executable.replaceAll("%", "%%")}"`)
  expect(desktop).toContain("Terminal=false")
  expect(desktop).not.toContain("Icon=")
  expect(await Bun.file(join(data, "icons/hicolor/scalable/apps/calcn.svg")).exists()).toBe(false)
  if (Bun.which("desktop-file-validate")) {
    expect(Bun.spawnSync(["desktop-file-validate", desktopPath]).exitCode).toBe(0)
  }
  await writeFile(appImage, "second build")
  expect(install().exitCode).toBe(0)
  expect(await readFile(executable, "utf8")).toBe("second build")
  expect(await readFile(desktopPath, "utf8")).toBe(desktop)
})

test("installer uses the default data directory and rejects a missing release", async () => {
  const home = await mkdtemp(join(tmpdir(), "calcn-install-"))
  directories.push(home)
  const appImage = join(home, "download.AppImage")
  const env = { ...process.env, HOME: home, XDG_DATA_HOME: "" }
  expect(Bun.spawnSync(["sh", installer, appImage], { env }).exitCode).toBe(1)
  expect(await Bun.file(join(home, ".local/bin/calcn")).exists()).toBe(false)
  await writeFile(appImage, "build")
  expect(Bun.spawnSync(["sh", installer, appImage], { env }).exitCode).toBe(0)
  expect(await Bun.file(join(home, ".local/share/applications/calcn.desktop")).exists()).toBe(true)
})

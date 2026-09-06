# calcn distribution handoff

## Intent and scope

Let people install the Electron calculator with Bun and launch it by typing
`calcn`, while retaining desktop downloads and the shadcn registry.

The Bun/npm distribution described below is a proposal. The user requested an
explanation before implementation, then requested this handoff. No npm package
has been published and no package-install launcher has been implemented.

## Current state

- Public repository: https://github.com/EdwardAstill/calcn.
- Electron opens the compiled frontend from `dist/` in its own window.
- `bun run desktop:install` builds a Linux AppImage and copies it to
  `~/.local/bin/calcn`. This currently requires a source checkout and build tools.
- `bun run build:executable` produces packages in `release/`: Linux AppImage,
  macOS DMG, or Windows NSIS installer, depending on the build platform.
  Linux has been built and launched locally; Windows and macOS are unverified.
- `package.json` is currently private, has no `bin` entry, and lists Electron as
  a development dependency. It is not ready for npm publication.
- The calculator and registry share source under `registry/calculator/`.
  Direct GitHub installation was verified with a shadcn dry run:

  ```bash
  npx shadcn@latest add EdwardAstill/calcn/calculator
  ```

The solver downloads Pyodide and SymPy at startup. Packaging the desktop UI does
not make the solver fully offline.

## Proposed Bun/npm install

Desired user experience, subject to npm package-name availability:

```bash
bun install -g calcn
calcn
```

Publish a package containing the compiled frontend, Electron main process, and
a small command launcher. A `bin` entry exposes `calcn` globally. The launcher
resolves the installed package directory and starts Electron with that app;
it must work from any working directory without rebuilding the frontend.

Electron would be a runtime dependency of the published app package. Its runtime
download supplies the executable for the user's operating system and
architecture. Verify the exact download behavior with the selected Electron
version and Bun's default lifecycle-script policy: a fresh install may defer
the runtime download until first launch. Do not assume postinstall scripts run
or require users to grant blanket script trust.

The existing Electron development launcher uses Node. A Bun installation alone
must be tested explicitly: either make the new launcher run correctly with Bun
and launch the resolved Electron binary directly, or document any additional
runtime requirement. Do not promise a Bun-only installation until verified.

Publish only the app's runtime files and dependencies. The frontend is already
bundled, so consumers should not need the repository's full build toolchain.
Decide whether to publish from the root package or stage a smaller package with
its own manifest; keep the shadcn registry structure intact either way.

## Three distribution options

| Option | User experience | Purpose |
| --- | --- | --- |
| Bun/npm package | Global install, then `calcn` | Desktop app for command-line users |
| Desktop downloads | AppImage, DMG, or EXE installer | Desktop app without Bun or a source checkout |
| shadcn registry | `npx shadcn@latest add EdwardAstill/calcn/calculator` | Calculator source embedded in another app |

The shadcn component should not install Electron. It uses the host project's
React, Tailwind CSS, and Base UI shadcn setup.

## Decisions still needed

- Check whether `calcn` is available on npm. A scoped package such as
  `@edwardastill/calcn` could still expose the command `calcn`; availability and
  ownership of that scope have not been checked.
- Establish the npm account and publication access. GitHub authentication does
  not imply npm authentication.
- Confirm the license. MIT was suggested, but no license choice was received.
- Decide which operating systems and architectures to support initially.
- Confirm publication when the package contents and install flow are ready for
  review. This handoff itself does not authorize implementing or publishing the
  proposed npm distribution.

## Verification before publishing

1. Run the existing checks and build the frontend.
2. Pack the proposed npm package locally and inspect its contents. Include the
   launcher, Electron entry point, and all referenced frontend assets; exclude
   credentials, caches, development outputs, and desktop installer binaries.
3. Install the tarball globally in a clean environment using Bun's default
   settings. Launch `calcn` from outside the checkout with no system Node if
   claiming Bun-only support.
4. Confirm the Electron window opens, expressions can be added and solved, plots
   work, and the runtime download has useful failure handling.
5. Test upgrades, uninstall behavior, and command resolution. This workstation
   already has an AppImage at `~/.local/bin/calcn`, which may shadow Bun's global
   command; account for that when testing or migrating.
6. Verify supported platforms individually and recheck the shadcn install.

Preserve the current 1200 × 550 opening size. Floating behavior on this machine
comes from a calcn-specific Hyprland rule in the user's dotfiles, not from the
portable package. Electron currently disables hardware acceleration on Wayland
to avoid the observed Vulkan error and shows the window after loading the UI.

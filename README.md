# calcn

A desktop scientific calculator and shadcn registry, extracted from edcn.
The app and installable registry use the same source in `registry/calculator/`.

## Electron desktop app

Install the desktop command on Linux (requires Bun 1.4 or newer to build):

```bash
bun install
bun run desktop:install
calcn
```

This installs a standalone Electron AppImage at `~/.local/bin/calcn`.
Ensure `~/.local/bin` is on your PATH. Running `calcn` opens its own desktop
window directly. Run `bun run desktop:install` again after making changes.
For development, `bun run dev` builds and opens the Electron app from source.

Package without installing:

```bash
bun run build:executable
```

Packages are written to `release/`: an AppImage on Linux, a DMG on macOS,
or an EXE installer on Windows. Build on the target operating system.
The packaged app includes Electron and opens in its own desktop window;
users do not need Bun, Node, a browser, or the source checkout.
On Linux, run `./release/calcn-0.1.0.AppImage`. If FUSE is unavailable,
run it with `--appimage-extract-and-run`.

The desktop app loads the same calculator frontend directly from its bundled
files. The shadcn registry is still built into `public/r/` and `dist/r/`;
serve the registry or publish `dist/r/` to install it in other projects.
The solver still needs internet access to load Pyodide and SymPy.

## Install the calculator in another app

From a shadcn app using Base UI, install directly from GitHub:

```bash
npx shadcn@latest add EdwardAstill/calcn/calculator
```

```tsx
import { ScientificCalculator } from "@/components/calculator/scientific-calculator"

export default function CalculatorPage() {
  return <ScientificCalculator />
}
```

The calculator renders plots directly with Recharts. Shared shadcn controls are
declared as external registry dependencies. No edcn checkout is needed.

This copies the calculator source into your project and installs its dependencies.
Electron is only used by the desktop app and is not installed with the registry
component. Your app needs React, Tailwind CSS, and shadcn configured with Base UI.
The solver downloads Pyodide and SymPy on startup, so internet access is required.
See [shadcn's GitHub registry documentation](https://ui.shadcn.com/docs/registry/github).

For local registry development, run `bun run registry:serve` and install from
`http://localhost:3100/r/calculator.json`. Set `PORT` to override port 3100.

## Build and verify

```bash
bun run check
bun run build
```

`build` regenerates solver/help assets and registry JSON, compiles CSS, and
creates the frontend files in `dist/` that Electron loads, including the registry
at `dist/r/`. Hosted registry installs use `<your-origin>/r/calculator.json`.

After changing help, Python, or worker sources, run `bun run calculator:gen`.
`bun run registry:build` also regenerates these assets and writes `public/r/`.

See [calculator documentation](registry/calculator/README.md) for notation and solver behavior.

# Calculator

A standalone scientific calculator extracted from `edcn`, with MathJax
rendering in cells, symbolic algebra and calculus, and a shared-equation workspace.

## Install

Run this in a Base UI shadcn app:

```bash
npx shadcn@latest add EdwardAstill/calcn/calculator
```

```tsx
import { ScientificCalculator } from "@/components/calculator/scientific-calculator"

export default function Example() {
  return <ScientificCalculator />
}
```

Uses the shared shadcn Base UI controls declared in `registryDependencies` and
your application's theme. The component renders MathML through `better-react-mathjax`, loading MathJax 4
and its fonts from jsDelivr on first use. Math rendering requires network access
on first load. Its provider and math stylesheet are included automatically.
The Python solver starts when the component mounts and downloads Pyodide
314.0.6 and SymPy from jsDelivr. Initial startup needs network access; subsequent
calculations reuse the worker. The worker is bundled into a module Blob.

## Notation

- Arithmetic and implicit multiplication: `2(x+1)`, `sqrt(2)`, `sin(pi/2)`.
- Algebra: `simplify((x^2-1)/(x-1))`, `expand((x+1)^3)`, `factor(x^2-1)`.
- Calculus: `diff(x^3, x)`, `integrate(sin(x), x)`, `limit(sin(x)/x, x, 0)`.
- Shared relations: save equations such as `2x + 3 = 7` and expression queries
  such as `x^2 + 1`, then solve them together.

The solver returns exact, finite real solutions and distinguishes inconsistent,
underdetermined, overdefined, unsupported, and unresolved systems. More equation
rows than distinct unknowns count as overdefined, including redundant rows.
The interface has **Equations** and **Variables** grids. Equation symbols appear
as variable rows automatically. Supplied variable values may be expressions:
the cell shows the evaluated value, hover reveals the source, and editing shows
the full expression. Values derived from equations and supplied variables are
grey and read-only. Clearing a supplied value makes it unknown again. Each saved
change recalculates values, including determined variables in a partial system.
Names are optional for standalone expressions. Multiple solutions retain their
matching solution numbers across variable rows.

Enter saves and moves down, Tab saves and moves across, and Escape cancels.
Selecting another cell also commits the edit. Ctrl+O opens the floating function
picker; Ctrl+E opens the equation library. Functions insert into the active cell
and library equations append to Equations. Plotting is currently hidden.

## Source layout

- `components/`: public `ScientificCalculator` component and export.
- `ui/`: result rendering.
- `lib/`: state, operations, parser, MathML/LaTeX, solver, and generated assets.
- `../../app/`: standalone app.
- `../../tests/calculator/`: parser, reducer, operations, and solver-client tests.

After changing `lib/help.md`, `lib/solver/solver.py`, or the worker source, run
`bun run calculator:gen` to regenerate the embedded assets. Then run
`bun run registry:build` and `bun run check`.

The optional `solverClient` prop accepts a `SolverClient` for embedding or tests;
otherwise the component creates and disposes its own worker-backed client.

## Probability

Distribution definitions go in Variables (name and expression in separate cells). For example:

```text
X = Norm(0, 1)
P(-1 < X < 1)
E(X)
Var(X)
quantile(X, 0.95)
Y = Pois(4)
P(Y = 3)
W = Weib(2, 5)
P(W > 10)
```

Supported constructors: `Norm(mean, variance)` / `N(mean, variance)`,
`Pois(rate)`, `Bin(trials, probability)`, `Bern(probability)`,
`Unif(lower, upper)`, `Exp(rate)`, `Weib(shape, scale)`, `Gamma(shape, scale)`,
`Beta(alpha, beta)`, `T(degrees)`, `Chi2(degrees)`, and `F(degrees1, degrees2)`.
Distribution names are case-sensitive (`Exp` differs from arithmetic `exp`).
The second Normal parameter is **variance**, not standard deviation.

Probability calculations use bundled jStat numerical functions and do not need
Python when all selected rows are declarations and numeric queries. Algebra and
calculus continue to use SymPy. Probability values are approximate. One random
variable and its affine transformations are supported per event; different
variables do not silently become independent. General nonlinear transformations,
fitting, and solving probability constraints for unknowns are not implemented.
Use `quantile` for inverse cumulative probabilities.

The active input cell offers grey function completions. Tab or Right Arrow inserts
the function name and opening parenthesis; Escape cancels the edit. Parameter hints
also cover differentiation, integration, limits, and existing scientific functions.

### Vectors, matrices, and multivariable calculus

Vectors use `[1,2,3]` (column convention); matrices use `[[1,2],[3,4]]` (rows).
Named definitions support exact symbolic entries, dimension-checked arithmetic,
`dot`, `cross`, `norm`, `unit`, `transpose`, `det`, `inv`, `trace`, `rank`, and
`linsolve(A,b)`. Matrix powers accept integer exponents on square matrices.
Calculus operates componentwise; `grad`, `jacobian`, `div`, `curl`, and `hessian`
accept an explicit variable vector. See Help for limits.

Run the Python adapter regression tests with a SymPy-enabled Python environment:
`uv run --with sympy python tests/solver_matrix_test.py`.

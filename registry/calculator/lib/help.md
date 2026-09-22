- **Natural input**
  Implicit multiplication works: `2x`, `2(x+1)`, and `(x+1)(x-1)`. Functions accept ordinary parentheses; curly braces are optional.

- **Equations and variables**
  Enter constraints in Equations. Their symbols appear automatically in Variables. Supply values or expressions in the value cells; names are optional for standalone expressions. For example, add `F=m*a`, then supply `m` with `1+1` and `a` with `3`. The mass cell displays `2` but remains editable; `f` displays `6` in grey and is locked because it is calculated from the equations. Clear a supplied value to make it unknown again. Values update after each saved change. Variables with missing dependencies stay editable. Multiple solutions are shown with matching solution numbers.

- **Cell editing and copying**
  Enter/F2 or double-click a cell to edit. Supplied expressions display their evaluated value normally; hover to see the full expression, or edit to change its source. Enter saves and moves down, Tab saves and moves across, and Escape cancels. Selecting another cell saves the edit. Use arrows to navigate, Shift + arrows or Shift + click to select a rectangle, and Ctrl+C to copy displayed cell values. Home/End move across a row; Ctrl+Home/End reach the first/last cell. Grey calculated values can be selected and copied but cannot be edited.

- **Floating pickers**
  Ctrl+F focuses Variables. Ctrl+O opens all operators/functions in a floating picker; Ctrl+E opens the equation library. Ctrl+R also focuses Variables and Ctrl+L also opens the library. A function inserts into the active editable cell. Library checkboxes, Add selected, and Add set append equations. Escape closes a picker and restores cell focus. In the function picker, press a group key followed by an operation key: R then P adds; R then S subtracts. Group keys are R (Arithmetic), S (Scientific), A (Algebra), C (Calculus), and P (Probability).

- **Symbolic work**
  Try `factor(x^2-1)`, `diff(x^3, x)`, or `integrate(sin(x), x)`. Underdetermined systems are reported directly rather than shown with generated parameters.

- **V1 result states**
  No solution means the real set is proven empty. Unresolved means the request is valid but SymPy could not produce a decisive finite result. Unsupported identifies a feature outside V1.

- **Probability distributions**
  The Probability group in the functions picker inserts distribution and query functions at the cursor, or wraps selected text. In Variables, give `X` the expression `Norm(0, 1)`, `Y` the expression `Pois(4)`, or `W` the expression `Weib(2, 5)`. Use `P(X < 3.1)`, `P(-1 <= X <= 1)`, `P(Y = 3)`, or inline `P(3.1 > N(0, 1))`. Discrete `<` and `<=` have different meanings. `E(X)`, `Var(X)` and `quantile(X, 0.95)` calculate the mean, variance and percentile cutoff.

- **Distribution parameters**
  `Norm(mean, variance)` (alias `N`), `Pois(rate)`, `Bin(trials, probability)`, `Bern(probability)`, `Unif(lower, upper)`, `Exp(rate)`, `Weib(shape, scale)`, `Gamma(shape, scale)`, `Beta(alpha, beta)`, `T(degrees)`, `Chi2(degrees)`, and `F(degrees1, degrees2)`. Names are case-sensitive: `Exp` is a distribution; `exp` is the exponential function. Use `Weib`, not `Wieb`.

- **Probability scope**
  Parameters and cutoffs must be numeric or supplied by direct numeric definitions such as `mu = 3`. Affine transformations such as `Y = 2*X + 3` preserve identity: `X-X` is zero. Calculations combining different random variables, general nonlinear transformations, and solving probability equations for unknown parameters are not supported yet. Use `quantile` for inverse cumulative probabilities. Undefined statistics report an error; infinite values may appear in standalone queries.

- **Inline function help**
  Type `Nor`, `Wei`, `dif`, or another function prefix to see a grey completion. Press Tab or Right Arrow to insert the function name and opening parenthesis; enter your own arguments using the signature beneath the input. Escape cancels the cell edit. Calculus hints cover `diff(expression, variable)`, `integrate(expression, variable)`, and `limit(expression, variable, point)`.

## Vectors and matrices

In Variables, give `u` the column-vector expression `[1,2,3]`, or give `A` the matrix expression `[[1,2],[3,4]]`.
Entries may be exact numbers or symbolic expressions. All rows must have equal length.
Named values can refer to other enabled definitions, regardless of row order.

- Add and subtract matching shapes: `u+v`, `A-B`; scale with `3*u` or `A/2`.
- Multiply matrices with `A*B` and matrix–vector products with `A*u`.
- Use `dot(u,v)` for a dot product and `cross(u,v)` for a 3D cross product.
- `norm(u)` gives Euclidean length; `unit(u)` gives a unit vector.
- `transpose(A)`, `det(A)`, `inv(A)`, `trace(A)`, `rank(A)` provide linear algebra operations.
- `A^2` is a matrix power; powers require square matrices and integer exponents.
- `linsolve(A,b)` solves `A*x=b`, including rectangular systems. Underdetermined systems return free parameters such as `tau0`; inconsistent systems produce an error.

`diff`, `integrate`, and `limit` act on every component. For example,
`r=[cos(t),sin(t),t]` and `diff(r,t)` give `[-sin(t),cos(t),1]`.

Multivariable calculus uses an explicit ordered list of distinct variables:

- `grad(x^2+y^2,[x,y])`: gradient of a scalar expression.
- `jacobian([x*y,sin(x)],[x,y])`: rows are output components, columns are variables.
- `div([x^2,y^2],[x,y])`: divergence.
- `curl([y,z,x],[x,y,z])`: 3D curl.
- `hessian(x^2+x*y,[x,y])`: matrix of second partial derivatives.

Grey autocomplete and argument hints support all these functions. Press Tab or Right Arrow to accept.
Results retain exact fractions and symbolic expressions. Calculus at a defined scalar parameter differentiates before substituting its value.
In a workspace containing matrices, equations must be direct `name=expression` definitions; use `linsolve(A,b)` for implicit linear systems. Names retain the calculator's case-insensitive behavior, so `A` and `a` refer to the same value.

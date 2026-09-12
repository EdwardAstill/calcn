- **Natural input**
  Implicit multiplication works: `2x`, `2(x+1)`, and `(x+1)(x-1)`. Functions accept ordinary parentheses; curly braces are optional.

- **Keyboard shortcuts**
  Ctrl+C opens Calculator, Ctrl+P opens Plot, Ctrl+R focuses Relations, and Ctrl+L opens Library. Ctrl+C copies normally when text is selected. Escape toggles focus between the expression field and the operation tabs. Outside the expression field, press a group key followed by an operation key: R then P adds, R then S subtracts. Group keys are R (Arithmetic), S (Scientific), A (Algebra), C (Calculus), and P (Probability). The tab shows the group key; each operation shows only its second key. Inserting an operation returns focus to the expression. Escape also cancels a pending sequence and returns to the expression. Letter shortcuts are disabled while typing formulas or using a dialog.

- **Shared system**
  Save equations as constraints and bare expressions as queries. Calculate uses every saved row together and returns all discrete real solutions.

- **Symbolic work**
  Try `factor(x^2-1)`, `diff(x^3, x)`, or `integrate(sin(x), x)`. Underdetermined systems are reported directly rather than shown with generated parameters.

- **V1 result states**
  No solution means the real set is proven empty. Unresolved means the request is valid but SymPy could not produce a decisive finite result. Unsupported identifies a feature outside V1.

- **Probability distributions**
  The Probability tab inserts distribution and query functions at the cursor, or wraps selected text. Define random variables in Relations: `X = Norm(0, 1)`, `Y = Pois(4)`, or `W = Weib(2, 5)`. Use `P(X < 3.1)`, `P(-1 <= X <= 1)`, `P(Y = 3)`, or inline `P(3.1 > N(0, 1))`. Discrete `<` and `<=` have different meanings. `E(X)`, `Var(X)` and `quantile(X, 0.95)` calculate the mean, variance and percentile cutoff.

- **Distribution parameters**
  `Norm(mean, variance)` (alias `N`), `Pois(rate)`, `Bin(trials, probability)`, `Bern(probability)`, `Unif(lower, upper)`, `Exp(rate)`, `Weib(shape, scale)`, `Gamma(shape, scale)`, `Beta(alpha, beta)`, `T(degrees)`, `Chi2(degrees)`, and `F(degrees1, degrees2)`. Names are case-sensitive: `Exp` is a distribution; `exp` is the exponential function. Use `Weib`, not `Wieb`.

- **Probability plots**
  Tick distribution declarations and open Plot to see density curves or discrete probability bars. Tick a `P(...)` query to highlight its event. Keep the declarations and numeric parameter definitions it uses ticked. The plot frames the distributions automatically; Reset view restores that range. Continuous densities and discrete masses use separate plots. Numerical results and plots are approximate.

- **Probability scope**
  Parameters and cutoffs must be numeric or supplied by direct numeric definitions such as `mu = 3`. Affine transformations such as `Y = 2*X + 3` preserve identity: `X-X` is zero. Calculations combining different random variables, general nonlinear transformations, and solving probability equations for unknown parameters are not supported yet. Use `quantile` for inverse cumulative probabilities. Undefined statistics report an error; infinite values may appear in standalone queries.

- **Inline function help**
  Type `Nor`, `Wei`, `dif`, or another function prefix to see a grey completion. Press Tab or Right Arrow to insert the function name and opening parenthesis; enter your own arguments using the signature beneath the input. Escape dismisses the suggestion. Calculus hints cover `diff(expression, variable)`, `integrate(expression, variable)`, and `limit(expression, variable, point)`.

## Vectors and matrices

Write column vectors as `u = [1,2,3]` and matrix rows as `A = [[1,2],[3,4]]`.
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

### Vector plots

Select 2D vectors such as `[3,4]` to plot arrows from the origin, or a two-component expression such as `[cos(t),sin(t)]` to plot a parametric curve. Curves use a fixed parameter range of −10 to 10, displayed in the legend; pan and zoom change the viewing window. Selected scalar definitions supply parameter values. Vector addition and scalar multiplication can be plotted directly. For other operations, plot the evaluated two-component expression. Matrices, 3D vectors, and vector fields are not plotted in this release.

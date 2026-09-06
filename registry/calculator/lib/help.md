- **Natural input**
  Implicit multiplication works: `2x`, `2(x+1)`, and `(x+1)(x-1)`. Functions accept ordinary parentheses; curly braces are optional.

- **Shared system**
  Save equations as constraints and bare expressions as queries. Calculate uses every saved row together and returns all discrete real solutions.

- **Symbolic work**
  Try `factor(x^2-1)`, `diff(x^3, x)`, or `integrate(sin(x), x)`. Underdetermined systems are reported directly rather than shown with generated parameters.

- **V1 result states**
  No solution means the real set is proven empty. Unresolved means the request is valid but SymPy could not produce a decisive finite result. Unsupported identifies a feature outside V1.

"""Trusted SymPy adapter for validated calculator AST payloads.

This module deliberately contains no parsing or evaluation of source strings.
Every accepted operation is selected from closed dispatch tables below.
"""

import sympy as sp


class UnsupportedFeature(Exception):
    """Raised when a valid payload asks for a capability outside V1."""


class RealDomainError(Exception):
    """Raised when a valid operation produces a non-real value in real mode."""


class UndefinedDomainError(Exception):
    """Raised when an operation produces an undefined closed value."""


class UnresolvedValueError(Exception):
    """Raised when SymPy cannot establish whether a closed value is real."""


SYMBOLIC_QUERY_OPERATIONS = {
    "simplify",
    "expand",
    "factor",
    "diff",
    "integrate",
    "limit",
    "grad", "jacobian", "div", "curl", "hessian",
}

CALCULUS_BINDING_INDEX = {"diff": 1, "integrate": 1, "limit": 1}


def _collect_symbols(node, names):
    kind = node.get("kind") if isinstance(node, dict) else None
    if kind == "array":
        for item in node["items"]:
            _collect_symbols(item, names)
        return
    if kind == "symbol":
        names.add(str(node["name"]).lower())
        return
    if kind in {"number", "constant"}:
        return
    if kind in {"unary", "factorial"}:
        _collect_symbols(node["operand"], names)
        return
    if kind == "binary":
        _collect_symbols(node["left"], names)
        _collect_symbols(node["right"], names)
        return
    if kind == "call":
        binding_index = CALCULUS_BINDING_INDEX.get(node.get("name"))
        for index, argument in enumerate(node.get("args", [])):
            if index != binding_index:
                _collect_symbols(argument, names)
        return
    raise UnsupportedFeature(f"Unsupported AST node: {kind or 'unknown'}")


def _equation_symbol_names(relations):
    names = set()
    for relation in relations:
        if relation.get("kind") != "equation":
            continue
        _collect_symbols(relation["left"], names)
        _collect_symbols(relation["right"], names)
    return sorted(names)


def _number(value):
    try:
        return sp.Rational(str(value))
    except (TypeError, ValueError) as error:
        raise UnsupportedFeature(f"Unsupported number literal: {value}") from error


def _require_symbol(value, operation):
    if not isinstance(value, sp.Symbol):
        raise UnsupportedFeature(f"{operation} requires a variable as its second argument")
    return value


def _build_allowed_call(name, raw_args, symbols):
    binding = 1 if name in {"diff", "integrate", "limit", "grad", "jacobian", "div", "curl", "hessian"} else None
    scope = symbols
    bound = set()
    if binding is not None and len(raw_args) > binding:
        _collect_symbols(raw_args[binding], bound)
        if hasattr(symbols, "without"):
            scope = symbols.without(bound)
    args = [build_expr(argument, {} if index == binding else scope) for index, argument in enumerate(raw_args)]
    result = _apply_allowed_call(name, args)
    if scope is not symbols and name != "limit":
        substitutions = {sp.Symbol(key, real=True): symbols.setdefault(key, sp.Symbol(key, real=True)) for key in bound}
        if any(isinstance(value, sp.MatrixBase) for value in substitutions.values()):
            raise UnsupportedFeature("Calculus variables must have scalar values")
        result = result.subs(substitutions, simultaneous=True)
    return result


def _apply_allowed_call(name, args):
    if name in {"dot", "cross", "norm", "unit", "transpose", "det", "inv", "trace", "rank", "linsolve", "grad", "jacobian", "div", "curl", "hessian"}:
        return _matrix_call(name, args)
    unary_calls = {
        "sqrt": sp.sqrt,
        "abs": sp.Abs,
        "exp": sp.exp,
        "ln": sp.log,
        "log": sp.log,
        "sin": sp.sin,
        "cos": sp.cos,
        "tan": sp.tan,
        "asin": sp.asin,
        "acos": sp.acos,
        "atan": sp.atan,
        "sinh": sp.sinh,
        "cosh": sp.cosh,
        "tanh": sp.tanh,
        "simplify": sp.simplify,
        "expand": sp.expand,
        "factor": sp.factor,
    }
    if name in unary_calls and len(args) == 1:
        return unary_calls[name](args[0])
    if name == "log10" and len(args) == 1:
        return sp.log(args[0], 10)
    if name == "diff" and len(args) == 2:
        return sp.diff(args[0], _require_symbol(args[1], name))
    if name == "integrate" and len(args) == 2:
        return sp.integrate(args[0], _require_symbol(args[1], name))
    if name == "limit" and len(args) == 3:
        variable = _require_symbol(args[1], name)
        return args[0].applyfunc(lambda entry: sp.limit(entry, variable, args[2])) if isinstance(args[0], sp.MatrixBase) else sp.limit(args[0], variable, args[2])
    raise UnsupportedFeature(f"Unsupported function or argument count: {name}")


def build_expr(node, symbols):
    if not isinstance(node, dict):
        raise UnsupportedFeature("AST nodes must be objects")
    kind = node.get("kind")
    if kind == "array":
        items = node.get("items", [])
        if not items:
            raise UnsupportedFeature("Vectors and matrices cannot be empty")
        if any(item.get("kind") == "array" for item in items):
            if not all(item.get("kind") == "array" and len(item["items"]) == len(items[0]["items"]) for item in items):
                raise UnsupportedFeature("Matrices require equally sized rows")
            values = [[build_expr(entry, symbols) for entry in item["items"]] for item in items]
        else:
            values = [[build_expr(item, symbols)] for item in items]
        if any(isinstance(entry, sp.MatrixBase) for row in values for entry in row):
            raise UnsupportedFeature("Vector and matrix entries must be scalars")
        return sp.ImmutableMatrix(values)
    if kind == "number":
        return _number(node.get("value"))
    if kind == "symbol":
        name = str(node.get("name", "")).lower()
        if not name:
            raise UnsupportedFeature("Symbols must have a name")
        return symbols.setdefault(name, sp.Symbol(name, real=True))
    if kind == "constant":
        constants = {"pi": sp.pi, "e": sp.E}
        name = node.get("name")
        if name not in constants:
            raise UnsupportedFeature(f"Unsupported constant: {name}")
        return constants[name]
    if kind == "unary":
        operand = build_expr(node["operand"], symbols)
        if node.get("operator") == "+":
            return operand
        if node.get("operator") == "-":
            return -operand
        raise UnsupportedFeature(f"Unsupported unary operator: {node.get('operator')}")
    if kind == "binary":
        left = build_expr(node["left"], symbols)
        right = build_expr(node["right"], symbols)
        operator = node.get("operator")
        lm, rm = isinstance(left, sp.MatrixBase), isinstance(right, sp.MatrixBase)
        if lm or rm:
            if operator in {"+", "-"} and (not lm or not rm or left.shape != right.shape):
                raise UnsupportedFeature("Addition and subtraction require matching vector or matrix dimensions")
            if operator == "*" and lm and rm and left.cols != right.rows:
                raise UnsupportedFeature(f"Cannot multiply {left.rows}×{left.cols} by {right.rows}×{right.cols}; use dot(u,v) for a dot product")
            if operator == "/" and rm:
                raise UnsupportedFeature("Division requires a scalar divisor; use inv or linsolve")
            if operator == "^" and (not lm or rm or right.is_Integer is not True or left.rows != left.cols):
                raise UnsupportedFeature("Matrix powers require a square matrix and an integer exponent")
        if operator == "+":
            return left + right
        if operator == "-":
            return left - right
        if operator == "*":
            return left * right
        if operator == "/":
            return left / right
        if operator == "^":
            return left**right
        raise UnsupportedFeature(f"Unsupported binary operator: {operator}")
    if kind == "factorial":
        return sp.factorial(build_expr(node["operand"], symbols))
    if kind == "call":
        return _build_allowed_call(node.get("name"), node.get("args", []), symbols)
    raise UnsupportedFeature(f"Unsupported AST node: {kind or 'unknown'}")


def _underdetermined(symbols):
    names = sorted({str(symbol) for symbol in symbols})
    return {
        "status": "underdetermined",
        "symbols": names,
        "message": "The saved relations leave "
        + (", ".join(names) if names else "one or more values")
        + " undetermined.",
    }


def _set_has_continuum(value):
    if value in {sp.S.Reals, sp.S.Complexes, sp.S.UniversalSet}:
        return True
    if isinstance(value, sp.Interval):
        return True
    if isinstance(value, sp.Union):
        return any(_set_has_continuum(argument) for argument in value.args)
    return False


def _classify_nested_sets(values, variables):
    nested_sets = [value for value in values if isinstance(value, sp.Set)]
    if not nested_sets:
        return None
    if any(value == sp.EmptySet for value in nested_sets):
        return {"status": "no-solution", "message": "No real solution exists."}
    if any(_set_has_continuum(value) for value in nested_sets):
        return _underdetermined(variables)
    return {
        "status": "unresolved",
        "message": "SymPy returned a non-finite solution representation.",
        "detail": str(tuple(nested_sets)),
    }


def classify_solution_set(solution_set, variables, allow_symbolic=False):
    """Classify a SymPy set without conflating unknown and empty results."""
    if solution_set is sp.EmptySet or solution_set == sp.EmptySet:
        return {"status": "no-solution", "message": "No real solution exists."}
    if isinstance(solution_set, sp.ConditionSet):
        return {
            "status": "unresolved",
            "message": "SymPy could not resolve this system to a finite solution set.",
            "detail": str(solution_set),
        }
    if not isinstance(solution_set, sp.FiniteSet):
        return {
            "status": "unresolved",
            "message": "SymPy returned a non-finite solution representation.",
            "detail": str(solution_set),
        }

    candidates = []
    for item in solution_set:
        values = tuple(item) if isinstance(item, (tuple, sp.Tuple)) else (item,)
        if len(values) != len(variables):
            return _underdetermined(variables)
        nested_classification = _classify_nested_sets(values, variables)
        if nested_classification:
            if nested_classification["status"] == "no-solution":
                continue
            return nested_classification
        if any(value.free_symbols for value in values) and not allow_symbolic:
            return _underdetermined(variables)
        if any(value.is_real is False for value in values):
            continue
        candidates.append(values)

    if not candidates:
        return {"status": "no-solution", "message": "No real solution exists."}

    candidates.sort(key=sp.default_sort_key)
    deduplicated = []
    seen = set()
    for candidate in candidates:
        key = tuple(sp.srepr(sp.simplify(value)) for value in candidate)
        if key not in seen:
            seen.add(key)
            deduplicated.append(candidate)
    return {"status": "solved", "raw_solutions": deduplicated}


def _display_value(value):
    exact_value = value
    display = {
        "exact": str(exact_value),
        "mathml": sp.mathml(exact_value, printer="presentation"),
    }
    if not isinstance(exact_value, sp.MatrixBase) and not exact_value.free_symbols and exact_value.is_number and not exact_value.is_Integer:
        approximate = str(sp.N(exact_value, 12))
        if approximate != display["exact"]:
            display["approximate"] = approximate
    return display


def _query_allows_symbolic_result(relation):
    expression = relation.get("expression", {})
    return (
        expression.get("kind") == "call"
        and expression.get("name") in SYMBOLIC_QUERY_OPERATIONS
    )


def _evaluate_queries(query_rows, symbols, assignments, allow_symbolic=False):
    values = []
    unresolved_symbols = set()
    for relation in query_rows:
        value = build_expr(relation["expression"], symbols).subs(assignments, simultaneous=True)
        if not _query_allows_symbolic_result(relation):
            value = sp.simplify(value)
        if value.has(sp.nan, sp.zoo):
            raise UndefinedDomainError(
                "This query is undefined in V1 real mode."
            )
        if any(entry.is_real is False for entry in (list(value) if isinstance(value, sp.MatrixBase) else [value])):
            raise RealDomainError(
                "This query produces a complex value, which is outside V1 real mode."
            )
        if not value.free_symbols and any(entry.is_real is None for entry in (list(value) if isinstance(value, sp.MatrixBase) else [value])):
            raise UnresolvedValueError(
                "SymPy could not establish a valid real value for this query."
            )
        if (
            value.free_symbols
            and not allow_symbolic
            and not _query_allows_symbolic_result(relation)
        ):
            unresolved_symbols.update(value.free_symbols)
        values.append(value)
    return values, unresolved_symbols


def _validate_candidates(candidates, equations, variables):
    valid = []
    unresolved = False
    for values in candidates:
        assignments = dict(zip(variables, values, strict=True))
        candidate_valid = True
        for equation in equations:
            residual = sp.simplify(equation.subs(assignments, simultaneous=True))
            if residual == 0 or residual.is_zero is True:
                continue
            if residual.is_zero is False:
                candidate_valid = False
                break
            unresolved = True
            candidate_valid = False
            break
        if candidate_valid:
            valid.append((values, assignments))
    return valid, unresolved


def _vector(value, operation):
    if not isinstance(value, sp.MatrixBase) or value.cols != 1:
        raise UnsupportedFeature(f"{operation} requires column vectors")
    return value


def _matrix_call(name, args):
    a = args[0]
    if name in {"grad", "jacobian", "div", "curl", "hessian"}:
        variables = list(_vector(args[1], name))
        if not all(isinstance(v, sp.Symbol) for v in variables) or len(set(variables)) != len(variables):
            raise UnsupportedFeature(f"{name} requires a list of distinct variables")
        if name in {"grad", "hessian"}:
            if isinstance(a, sp.MatrixBase):
                raise UnsupportedFeature(f"{name} requires a scalar expression")
            return sp.ImmutableMatrix([sp.diff(a, v) for v in variables]) if name == "grad" else sp.ImmutableMatrix(sp.hessian(a, variables))
        a = _vector(a, name)
        if name == "jacobian":
            return a.jacobian(variables)
        if len(a) != len(variables):
            raise UnsupportedFeature(f"{name} requires one vector component per variable")
        if name == "div":
            return sum(sp.diff(a[i], v) for i, v in enumerate(variables))
        if len(variables) != 3:
            raise UnsupportedFeature("curl requires three components and three variables")
        return sp.ImmutableMatrix([sp.diff(a[2], variables[1])-sp.diff(a[1], variables[2]), sp.diff(a[0], variables[2])-sp.diff(a[2], variables[0]), sp.diff(a[1], variables[0])-sp.diff(a[0], variables[1])])
    if not isinstance(a, sp.MatrixBase):
        raise UnsupportedFeature(f"{name} requires a vector or matrix")
    if name in {"dot", "cross", "norm", "unit"}:
        _vector(a, name)
        if name in {"dot", "cross"}:
            b = _vector(args[1], name)
            if a.shape != b.shape:
                raise UnsupportedFeature(f"{name} requires vectors of equal length")
            if name == "cross" and a.rows != 3:
                raise UnsupportedFeature("cross requires 3D vectors")
            return a.dot(b) if name == "dot" else a.cross(b)
        length = sp.sqrt(a.dot(a))
        if name == "unit" and length == 0:
            raise UnsupportedFeature("The zero vector has no unit vector")
        return length if name == "norm" else a / length
    if name == "transpose": return a.T
    if name == "rank": return sp.Integer(a.rank())
    if name == "linsolve":
        b = _vector(args[1], name)
        if a.rows != b.rows:
            raise UnsupportedFeature("linsolve requires one right-hand entry per matrix row")
        result = sp.linsolve((a, b))
        if result == sp.EmptySet:
            raise UnsupportedFeature("This linear system has no solution")
        return sp.ImmutableMatrix(next(iter(result)))
    if a.rows != a.cols:
        raise UnsupportedFeature(f"{name} requires a square matrix")
    if name == "det": return a.det()
    if name == "trace": return a.trace()
    if name == "inv":
        if a.det() == 0:
            raise UnsupportedFeature("A singular matrix has no inverse")
        return a.inv()
    raise UnsupportedFeature(f"Unsupported matrix operation: {name}")


def _has_matrix(node):
    if isinstance(node, list):
        return any(_has_matrix(item) for item in node)
    if not isinstance(node, dict):
        return False
    return node.get("kind") == "array" or node.get("name") in {"dot", "cross", "norm", "unit", "transpose", "det", "inv", "trace", "rank", "linsolve", "grad", "jacobian", "div", "curl", "hessian"} or any(_has_matrix(value) for value in node.values())


def _solve_matrix_relations(relations):
    definitions = {}
    for row in relations:
        if row["kind"] != "equation": continue
        if row["left"]["kind"] != "symbol":
            raise UnsupportedFeature("Use name = expression for matrix definitions and linsolve(A,b) for linear systems")
        name = row["left"]["name"].lower()
        if name in definitions:
            raise UnsupportedFeature(f"Multiple definitions for {name}")
        definitions[name] = row["right"]

    class Definitions(dict):
        def __init__(self, blocked=()):
            super().__init__()
            self.pending = set()
            self.blocked = set(blocked)

        def without(self, names):
            return Definitions(self.blocked | names)

        def setdefault(self, name, default=None):
            if name in self: return self[name]
            if name not in definitions or name in self.blocked: return super().setdefault(name, default)
            if name in self.pending:
                raise UnsupportedFeature(f"Circular definition involving {name}")
            self.pending.add(name)
            try:
                self[name] = build_expr(definitions[name], self)
            finally:
                self.pending.remove(name)
            return self[name]

    symbols = Definitions()
    values = {name: symbols.setdefault(name) for name in definitions}
    # Validate declarations through the same real-domain checks as queries.
    rows = [{"kind": "query", "expression": {"kind": "symbol", "name": name}} for name in definitions]
    rows += [row for row in relations if row["kind"] == "query"]
    evaluated, _ = _evaluate_queries(rows, symbols, {}, allow_symbolic=True)
    return {"status": "solved", "variables": list(values), "solutions": [{"assignments": {name: _display_value(evaluated[index]) for index, name in enumerate(values)}, "queries": [_display_value(value) for value in evaluated[len(values):]]}]}


def solve_payload(payload):
    try:
        relations = payload.get("relations", []) if isinstance(payload, dict) else []
        if not relations:
            return {"status": "error", "message": "No relations were supplied."}
        mode = payload.get("mode", "system")
        if mode not in {"system", "symbolic", "workspace"}:
            raise UnsupportedFeature(f"Unsupported solver mode: {mode}")
        allow_symbolic = mode in {"symbolic", "workspace"}

        equation_rows = [row for row in relations if row.get("kind") == "equation"]
        query_rows = [row for row in relations if row.get("kind") == "query"]
        if len(equation_rows) + len(query_rows) != len(relations):
            raise UnsupportedFeature("Relations must be equations or queries")

        if any(_has_matrix(row) for row in relations):
            return _solve_matrix_relations(relations)

        variable_names = _equation_symbol_names(relations)
        equation_count = len(equation_rows)
        if equation_count > len(variable_names):
            return {
                "status": "overdefined",
                "equationCount": equation_count,
                "variableCount": len(variable_names),
                "message": f"{equation_count} equation{'s' if equation_count != 1 else ''} exceeds {len(variable_names)} distinct unknowns.",
            }

        symbols = {name: sp.Symbol(name, real=True) for name in variable_names}
        variables = [symbols[name] for name in variable_names]
        equations = [
            build_expr(row["left"], symbols) - build_expr(row["right"], symbols)
            for row in equation_rows
        ]

        if not equations:
            query_values, free = _evaluate_queries(
                query_rows, symbols, {}, allow_symbolic=allow_symbolic
            )
            if free:
                return _underdetermined(free)
            return {
                "status": "solved",
                "variables": [],
                "solutions": [
                    {
                        "assignments": {},
                        "queries": [_display_value(value) for value in query_values],
                    }
                ],
            }

        solution_set = sp.nonlinsolve(equations, variables)
        classification = classify_solution_set(
            solution_set, variables, allow_symbolic=allow_symbolic
        )
        if classification["status"] != "solved":
            return classification

        valid, validation_unresolved = _validate_candidates(
            classification["raw_solutions"], equations, variables
        )
        if validation_unresolved:
            return {
                "status": "unresolved",
                "message": "SymPy produced candidates that could not be verified exactly.",
            }
        if not valid:
            return {"status": "no-solution", "message": "No real solution exists."}

        display_variables = [
            variable
            for variable in variables
            if not allow_symbolic
            or any(assignments[variable] != variable for _, assignments in valid)
        ]
        if mode == "workspace":
            # Only lock a variable if every solution determines its value.
            # Free parameters stay editable even when other variables are solved.
            display_variables = [
                variable for variable in display_variables
                if all(not assignments[variable].free_symbols for _, assignments in valid)
            ]
        serialized_solutions = []
        for _, assignments in valid:
            query_values, free = _evaluate_queries(
                query_rows,
                symbols,
                assignments,
                allow_symbolic=allow_symbolic,
            )
            if free:
                return _underdetermined(free)
            serialized_solutions.append(
                {
                    "assignments": {
                        str(variable): _display_value(assignments[variable])
                        for variable in display_variables
                    },
                    "queries": [_display_value(value) for value in query_values],
                }
            )

        return {
            "status": "solved",
            "variables": [str(variable) for variable in display_variables],
            "solutions": serialized_solutions,
        }
    except UndefinedDomainError as error:
        return {
            "status": "unsupported",
            "message": str(error),
            "feature": "undefined-domain",
        }
    except UnresolvedValueError as error:
        return {
            "status": "unresolved",
            "message": str(error),
        }
    except RealDomainError as error:
        return {
            "status": "unsupported",
            "message": str(error),
            "feature": "complex-domain",
        }
    except UnsupportedFeature as error:
        return {
            "status": "unsupported",
            "message": str(error),
            "feature": str(error),
        }
    except NotImplementedError as error:
        return {
            "status": "unresolved",
            "message": "SymPy does not implement this valid operation.",
            "detail": str(error),
        }
    except Exception as error:  # worker boundary: always return a serializable state
        return {"status": "error", "message": f"Solver error: {error}"}

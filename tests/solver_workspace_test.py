"""Run with: uv run --with sympy python tests/solver_workspace_test.py"""
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'registry/calculator/lib/solver'))
from solver import solve_payload


def num(n): return {'kind': 'number', 'value': str(n)}
def sym(n): return {'kind': 'symbol', 'name': n}
def op(operator, a, b): return {'kind': 'binary', 'operator': operator, 'left': a, 'right': b}
def eq(a, b): return {'kind': 'equation', 'left': a, 'right': b}


class WorkspaceSolverTests(unittest.TestCase):
    def solve(self, *relations):
        result = solve_payload({'mode': 'workspace', 'relations': list(relations)})
        self.assertEqual(result['status'], 'solved', result)
        return result

    def test_equations_and_supplied_expressions(self):
        result = self.solve(eq(sym('f'), op('*', sym('m'), sym('a'))), eq(sym('m'), op('+', num(1), num(1))), eq(sym('a'), num(3)))
        self.assertEqual({name: value['exact'] for name, value in result['solutions'][0]['assignments'].items()}, {'a': '3', 'f': '6', 'm': '2'})

    def test_partial_system_returns_only_determined_variables(self):
        result = self.solve(eq(sym('x'), num(2)), eq(op('+', sym('y'), sym('z')), num(10)))
        self.assertEqual(result['variables'], ['x'])
        self.assertEqual(result['solutions'][0]['assignments']['x']['exact'], '2')

    def test_unsupplied_dependencies_do_not_become_locked_values(self):
        result = self.solve(eq(sym('f'), op('*', sym('m'), sym('a'))), eq(sym('m'), num(2)))
        self.assertEqual(result['variables'], ['m'])

    def test_preserves_multiple_real_values(self):
        result = self.solve(eq(op('^', sym('x'), num(2)), num(4)))
        self.assertEqual([solution['assignments']['x']['exact'] for solution in result['solutions']], ['-2', '2'])

    def test_parameter_in_any_branch_stays_editable(self):
        result = self.solve(eq(op('*', sym('x'), sym('y')), num(0)))
        self.assertEqual(result['variables'], [])

    def test_default_system_mode_still_reports_underdetermined(self):
        result = solve_payload({'relations': [eq(sym('x'), num(2)), eq(op('+', sym('y'), sym('z')), num(10))]})
        self.assertEqual(result['status'], 'underdetermined')


if __name__ == '__main__':
    unittest.main()

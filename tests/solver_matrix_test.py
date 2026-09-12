"""Run with: uv run --with sympy python tests/solver_matrix_test.py"""
import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'registry/calculator/lib/solver'))
from solver import solve_payload


def num(n): return {'kind': 'number', 'value': str(n)}
def sym(n): return {'kind': 'symbol', 'name': n}
def arr(*items): return {'kind': 'array', 'items': [num(i) if isinstance(i, int) else i for i in items]}
def call(name, *args): return {'kind': 'call', 'name': name, 'args': list(args)}
def op(operator, a, b): return {'kind': 'binary', 'operator': operator, 'left': a, 'right': b}
def define(name, value): return {'kind': 'equation', 'left': sym(name), 'right': value}
def query(value): return {'kind': 'query', 'expression': value}


class MatrixSolverTests(unittest.TestCase):
    def result(self, expression, *definitions):
        return solve_payload({'relations': [*definitions, query(expression)]})

    def exact(self, expression, expected, *definitions):
        result = self.result(expression, *definitions)
        self.assertEqual(result['status'], 'solved', result)
        self.assertEqual(result['solutions'][0]['queries'][0]['exact'], expected)
        return result

    def test_vector_algebra(self):
        u, v = arr(1, 2, 3), arr(4, 5, 6)
        self.exact(call('dot', u, v), '32')
        self.exact(call('cross', u, v), 'Matrix([[-3], [6], [-3]])')
        self.exact(call('norm', arr(3, 4)), '5')
        self.exact(call('unit', arr(3, 4)), 'Matrix([[3/5], [4/5]])')
        self.exact(op('+', u, v), 'Matrix([[5], [7], [9]])')
        self.exact(op('/', u, num(2)), 'Matrix([[1/2], [1], [3/2]])')

    def test_linear_algebra(self):
        a = arr(arr(1, 2), arr(3, 4))
        for name, expected in [('det', '-2'), ('trace', '5'), ('rank', '2'), ('transpose', 'Matrix([[1, 3], [2, 4]])'), ('inv', 'Matrix([[-2, 1], [3/2, -1/2]])')]:
            with self.subTest(name=name): self.exact(call(name, sym('A')), expected, define('A', a))
        self.exact(op('^', a, num(2)), 'Matrix([[7, 10], [15, 22]])')
        self.exact(op('*', a, arr(1, 2)), 'Matrix([[5], [11]])')
        self.exact(call('linsolve', a, arr(5, 11)), 'Matrix([[1], [2]])')
        self.exact(call('linsolve', arr(arr(1, 0), arr(0, 1), arr(1, 1)), arr(1, 2, 3)), 'Matrix([[1], [2]])')

    def test_named_calculus_and_forward_definitions(self):
        t = sym('t')
        r = arr(call('cos', t), call('sin', t), t)
        self.exact(call('diff', sym('r'), t), 'Matrix([[-sin(t)], [cos(t)], [1]])', define('r', sym('q')), define('q', r))
        self.exact(call('integrate', arr(t, op('^', t, num(2))), t), 'Matrix([[t**2/2], [t**3/3]])')
        self.exact(call('limit', arr(op('/', call('sin', t), t), t), t, num(0)), 'Matrix([[1], [0]])')
        self.exact(call('diff', op('*', sym('A'), sym('v')), t), 'Matrix([[2*t], [4*t**3]])', define('A', arr(arr(t, 0), arr(0, op('^', t, num(2))))), define('v', arr(t, op('^', t, num(2)))))

    def test_calculus_at_assigned_parameter(self):
        self.exact(call('diff', sym('r'), sym('t')), 'Matrix([[4], [1]])', define('r', arr(op('^', sym('t'), num(2)), sym('t'))), define('t', num(2)))

    def test_multivariable_calculus(self):
        x, y, z = sym('x'), sym('y'), sym('z')
        xy = arr(x, y)
        square = lambda a: op('^', a, num(2))
        self.exact(call('grad', op('+', square(x), square(y)), xy), 'Matrix([[2*x], [2*y]])')
        self.exact(call('jacobian', arr(op('*', x, y), call('sin', x)), xy), 'Matrix([[y, x], [cos(x), 0]])')
        self.exact(call('div', arr(square(x), square(y)), xy), '2*x + 2*y')
        self.exact(call('curl', arr(y, z, x), arr(x, y, z)), 'Matrix([[-1], [-1], [-1]])')
        self.exact(call('hessian', op('+', square(x), op('*', x, y)), xy), 'Matrix([[2, 1], [1, 0]])')
        self.exact(call('grad', op('*', x, square(y)), arr(y, x)), 'Matrix([[2*x*y], [y**2]])')

    def test_invalid_operations(self):
        cases = [(op('*', arr(1,2), arr(3,4)), 'Cannot multiply'), (op('+', arr(1), arr(1,2)), 'matching'), (call('unit', arr(0,0)), 'zero vector'), (call('inv', arr(arr(1,2),arr(2,4))), 'singular'), (call('cross', arr(1,2),arr(3,4)), '3D'), (call('grad', sym('x'),arr(sym('x'),sym('x'))), 'distinct'), (op('^', arr(arr(1,2)),num(2)), 'square'), (call('linsolve',arr(arr(0)),arr(1)), 'no solution')]
        for expression, message in cases:
            with self.subTest(message=message):
                result = self.result(expression)
                self.assertEqual(result['status'], 'unsupported', result)
                self.assertIn(message, result['message'])

    def test_definition_errors_and_real_domain(self):
        result = self.result(sym('a'),define('a',sym('b')),define('b',op('*',sym('a'),arr(1,2))))
        self.assertIn('Circular', result['message'])
        self.assertIn('Multiple', self.result(sym('a'),define('a',arr(1)),define('a',arr(2)))['message'])
        self.assertEqual(self.result(arr(call('sqrt',num(-1))))['feature'], 'complex-domain')

    def test_scalar_solver_regression(self):
        self.exact(call('diff',op('^',sym('x'),num(2)),sym('x')), '2*x')
        self.exact(op('+',sym('x'),num(1)), '3',define('x',num(2)))


if __name__ == '__main__': unittest.main()

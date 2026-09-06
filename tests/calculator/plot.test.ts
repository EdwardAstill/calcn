import { expect, test } from 'bun:test'
import { parseRelation } from '@/registry/calculator/lib/dsl/parser'
import type { Relation } from '@/registry/calculator/lib/model'
import { preparePlot, sampleEquation } from '@/registry/calculator/lib/plot'
import { panViewport, zoomViewport } from '@/registry/calculator/lib/plot-interaction'

test('panning follows the drag direction on both axes', () => {
  expect(panViewport({ x: [-10, 10], y: [-10, 10] }, 0.25, 0.5))
    .toEqual({ x: [-15, 5], y: [0, 20] })
})

test('zoom keeps the value beneath the pointer fixed and can be reversed', () => {
  const view = { x: [-10, 10] as [number, number], y: [-20, 20] as [number, number] }
  const zoomed = zoomViewport(view, 0.25, 0.75, 0.5)
  expect(zoomed).toEqual({ x: [-7.5, 2.5], y: [-15, 5] })
  expect(zoomViewport(zoomed, 0.25, 0.75, 2)).toEqual(view)
  const limited = zoomViewport(view, 0.5, 0.5, 1e-30)
  expect(limited.x[1] - limited.x[0]).toBeCloseTo(1e-6, 10)
})

test('equations are resampled beyond the initial domain with independent axes', () => {
  const plot = preparePlot([relation('x=25')], { x: [20, 30], y: [40, 60] })
  const points = plot.curves[0]!.data!.filter((point) => point.y !== null)
  expect(points.length).toBeGreaterThan(0)
  for (const point of points) {
    expect(point.x).toBeCloseTo(25, 5)
    expect(point.y!).toBeGreaterThanOrEqual(40)
    expect(point.y!).toBeLessThanOrEqual(60)
  }
})

function relation(source: string, enabled = true): Relation {
  return { id: source, source, ast: parseRelation(source), enabled, createdAt: 0 }
}

test('only ticked relations contribute curves and variables', () => {
  const plot = preparePlot([relation('y=x^2'), relation('z+w=3', false)])
  expect(plot.curves.map((curve) => curve.label)).toEqual(['y=x^2'])
  expect([plot.xLabel, plot.yLabel]).toEqual(['x', 'y'])
  expect(plot.curves[0]!.data!.filter((point) => point.y !== null).length).toBeGreaterThan(0)
  expect(preparePlot([relation('x=1', false)]).curves).toEqual([])
})

test('more than two variables across selected rows raises an actionable error', () => {
  expect(() => preparePlot([relation('x+y=1'), relation('z=2')])).toThrow('more than 2 variables')
  expect(() => preparePlot([relation('x+y+z=1')])).toThrow('3: x, y, z')
  expect(() => preparePlot([relation('x+y'), relation('z')])).toThrow('more than 2 variables')
  expect(() => preparePlot([relation('y=sin(x)+pi+e')])).not.toThrow()
})

test('expressions use the calculator AST and numerical function semantics', () => {
  const plot = preparePlot([relation('2t^2+sin(pi/2)+3!')])
  expect(plot.xLabel).toBe('t')
  expect(plot.curves[0]!.fn!(2)).toBeCloseTo(15)
  expect(() => preparePlot([relation('diff(x^2,x)')])).toThrow('Plotting diff is not supported')
  expect(() => preparePlot([relation('x+y')])).toThrow('Write an equation')
})

test('implicit equations include both circle branches and vertical lines', () => {
  const circle = sampleEquation((x, y) => x*x + y*y - 4).filter((point) => point.y !== null)
  expect(circle.some((point) => point.y! > 1.9)).toBe(true)
  expect(circle.some((point) => point.y! < -1.9)).toBe(true)
  for (const point of circle) expect(point.x ** 2 + point.y! ** 2).toBeCloseTo(4, 4)
  const vertical = sampleEquation((x) => 2*x + 3 - 7).filter((point) => point.y !== null)
  expect(vertical.length).toBeGreaterThan(0)
  for (const point of vertical) expect(point.x).toBeCloseTo(2, 5)
})

test('poles and non-real values do not create equation contours', () => {
  expect(sampleEquation((x) => 1 / (x - 0.031))).toEqual([])
  expect(sampleEquation(() => NaN)).toEqual([])
})

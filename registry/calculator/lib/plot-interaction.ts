import type { PlotViewport } from '@/registry/calculator/lib/plot'

export function panViewport(view: PlotViewport, dx: number, dy: number): PlotViewport {
  const x = dx * (view.x[1] - view.x[0])
  const y = dy * (view.y[1] - view.y[0])
  return { x: [view.x[0] - x, view.x[1] - x], y: [view.y[0] + y, view.y[1] + y] }
}

export function zoomViewport(view: PlotViewport, x: number, y: number, factor: number): PlotViewport {
  const zoom = (domain: [number, number], anchor: number): [number, number] => {
    const span = domain[1] - domain[0]
    const nextSpan = Math.min(1e8, Math.max(1e-6, span * factor))
    const low = domain[0] + anchor * (span - nextSpan)
    return [low, low + nextSpan]
  }
  return { x: zoom(view.x, x), y: zoom(view.y, 1 - y) }
}

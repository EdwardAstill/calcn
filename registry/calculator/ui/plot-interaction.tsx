'use client'

import { useEffect, useRef } from 'react'
import { usePlotArea } from 'recharts'
import type { PlotViewport } from '@/registry/calculator/lib/plot'
import { panViewport, zoomViewport } from '@/registry/calculator/lib/plot-interaction'

export function PlotInteraction({ view, onChange }: {
  view: PlotViewport
  onChange: (view: PlotViewport) => void
}) {
  const area = usePlotArea()
  const surface = useRef<SVGRectElement>(null)
  const drag = useRef<{ id: number; x: number; y: number; view: PlotViewport } | null>(null)
  useEffect(() => {
    const element = surface.current
    if (!element || !area) return
    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = element.getBoundingClientRect()
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1)
      onChange(zoomViewport(view, (event.clientX - rect.left) / rect.width,
        (event.clientY - rect.top) / rect.height, Math.exp(Math.max(-1, Math.min(1, delta * 0.002)))))
    }
    element.addEventListener('wheel', wheel, { passive: false })
    return () => element.removeEventListener('wheel', wheel)
  }, [area, view, onChange])
  if (!area) return null
  return (
    <g>
      <rect ref={surface} x={area.x} y={area.y} width={area.width} height={area.height}
        fill="transparent" style={{ touchAction: 'none', cursor: drag.current ? 'grabbing' : 'grab' }}
        onPointerDown={(event) => {
          if (event.button !== 0 || drag.current) return
          event.currentTarget.setPointerCapture(event.pointerId)
          drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, view }
        }}
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          const start = drag.current
          if (start && start.id === event.pointerId) {
            onChange(panViewport(start.view, (event.clientX - start.x) / rect.width, (event.clientY - start.y) / rect.height))
          }
        }}
        onPointerUp={(event) => {
          if (drag.current?.id !== event.pointerId) return
          drag.current = null
          event.currentTarget.releasePointerCapture(event.pointerId)
        }}
        onLostPointerCapture={() => { drag.current = null }}
        onPointerCancel={() => { drag.current = null }}
      />
    </g>
  )
}

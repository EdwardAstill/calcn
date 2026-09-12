'use client'

import { useMemo, useState } from 'react'
import { Area, CartesianGrid, ComposedChart, getNiceTickValues, Line, XAxis, YAxis } from 'recharts'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { ChartContainer, ChartLegend, ChartLegendContent } from '@/components/ui/chart'
import type { Relation } from '@/registry/calculator/lib/model'
import { DEFAULT_VIEWPORT, preparePlot, type PlotPoint } from '@/registry/calculator/lib/plot'

import { Button } from '@/components/ui/button'
import { PlotInteraction } from '@/registry/calculator/ui/plot-interaction'

function formatTick(value: number) {
  const magnitude = Math.abs(value)
  const rounded = Number(value.toPrecision(10))
  return magnitude !== 0 && (magnitude >= 100000 || magnitude < 0.0001)
    ? rounded.toExponential()
    : String(rounded)
}

export function RelationPlot({ relations }: { relations: readonly Relation[] }) {
  return <PlotCanvas key={relations.filter(row => row.enabled).map(row => `${row.id}:${row.source}`).join('|')} relations={relations} />
}

function PlotCanvas({ relations }: { relations: readonly Relation[] }) {
  const initialView = useMemo(() => {
    try { return preparePlot(relations).viewport ?? DEFAULT_VIEWPORT } catch { return DEFAULT_VIEWPORT }
  }, [relations])
  const [view, setView] = useState(initialView)
  const result = useMemo(() => {
    try {
      const plot = preparePlot(relations, view)
      return { plot: { ...plot, curves: plot.curves.map((curve) => ({
        ...curve,
        data: curve.fn ? Array.from({ length: 400 }, (_, index): PlotPoint => {
          const x = view.x[0] + index / 399 * (view.x[1] - view.x[0])
          const y = curve.fn!(x)
          return { x, y: Number.isFinite(y) ? y : null }
        }) : curve.data,
      })) } }
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Unable to plot the selected relations.' }
    }
  }, [relations, view])

  if (!result.plot) {
    return <Alert variant="destructive" role="alert"><AlertTitle>Cannot plot</AlertTitle><AlertDescription>{result.error}</AlertDescription></Alert>
  }
  const { curves, xLabel, yLabel } = result.plot
  if (curves.length === 0) {
    return <Alert><AlertTitle>No relations selected</AlertTitle><AlertDescription>Tick a saved equation or expression to plot it.</AlertDescription></Alert>
  }
  const config = Object.fromEntries(curves.map((curve, index) => [curve.id, {
    label: curve.label, color: `var(--chart-${index % 5 + 1})`,
  }]))
  const xTicks = getNiceTickValues(view.x, 5).filter((tick) => tick >= view.x[0] && tick <= view.x[1])
  const yTicks = getNiceTickValues(view.y, 5).filter((tick) => tick >= view.y[0] && tick <= view.y[1])
  return (
    <div className="grid min-w-0 max-w-full gap-2">
      <ChartContainer className="aspect-auto min-w-0 max-w-full overflow-hidden" config={config} initialDimension={{ width: 320, height: 360 }} style={{ width: '100%', height: 360 }}>
        <ComposedChart accessibilityLayer aria-label="Selected relations plot" margin={{ top: 12, right: 16, bottom: 20, left: 8 }}>
          <CartesianGrid />
          <XAxis dataKey="x" type="number" domain={view.x} ticks={xTicks} tickFormatter={formatTick} minTickGap={24} allowDataOverflow label={{ value: xLabel, position: 'insideBottom', offset: -12 }} />
          <YAxis type="number" domain={view.y} ticks={yTicks} tickFormatter={formatTick} width={80} minTickGap={12} allowDataOverflow label={{ value: yLabel, angle: -90, position: 'insideLeft' }} />
          {curves.filter(curve => curve.shaded && !curve.discrete).map(curve => (
            <Area key={`${curve.id}-area`} data={curve.data} dataKey="shaded" type="linear" fill={config[curve.id]!.color} fillOpacity={0.25} stroke="none" legendType="none" isAnimationActive={false} />
          ))}
          {curves.map((curve) => curve.discrete ? (
            <Line key={curve.id} name={curve.id} data={curve.data?.flatMap(p => [{ x: p.x, y: 0 }, p, { x: p.x, y: null }])} dataKey="y" stroke={config[curve.id]!.color} strokeOpacity={curve.shaded ? 0.25 : 0.8} strokeWidth={6} dot={false} activeDot={false} isAnimationActive={false} />
          ) : (
            <Line key={curve.id} name={curve.id} data={curve.data} dataKey="y" type="linear" dot={false} activeDot={false} connectNulls={false} isAnimationActive={false} stroke={config[curve.id]!.color} />
          ))}
          {curves.filter(curve => curve.shaded && curve.discrete).map(curve => (
            <Line key={`${curve.id}-selected`} data={curve.data?.flatMap(p => [{ x: p.x, y: 0 }, { x: p.x, y: p.shaded ?? 0 }, { x: p.x, y: null }])} dataKey="y" stroke={config[curve.id]!.color} strokeWidth={6} dot={false} activeDot={false} legendType="none" isAnimationActive={false} />
          ))}
          <PlotInteraction view={view} onChange={setView} />
          <ChartLegend content={<ChartLegendContent nameKey="name" className="flex-wrap gap-x-3 gap-y-1 [&>div]:min-w-0 [&>div]:max-w-full [&_span]:truncate" />} />
        </ComposedChart>
      </ChartContainer>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Drag to pan. Scroll to zoom. Plots are approximate.</p>
        <Button variant="outline" size="sm" onClick={() => setView(initialView)}>Reset view</Button>
      </div>
    </div>
  )
}

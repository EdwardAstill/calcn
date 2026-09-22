import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { ScientificCalculator } from "@/registry/calculator/components/scientific-calculator"

test("calculator renders with shared controls without starting a worker during SSR", () => {
  const html = renderToStaticMarkup(<ScientificCalculator />)
  expect(html).not.toContain('data-slot="card"')
  expect(html).not.toContain('data-slot="input-group-control"')
  expect(html).not.toContain('Rendered math preview')
  expect(html).not.toContain('Worksheet')
  expect(html).not.toContain('aria-label="Plot"')
  expect(html).toContain('Add an equation')
  expect(html).toContain('Add a value or expression')
  expect(html).not.toContain('Expression / equation')
  expect(html).not.toContain('>Type</th>')
  expect(html).not.toContain('aria-label="Inputs"')
  expect(html).not.toContain('aria-label="Outputs"')
  expect(html.match(/role="grid"/g)).toHaveLength(2)
  expect(html).toContain('aria-keyshortcuts="Control+o"')
  expect(html).toContain('aria-keyshortcuts="Control+e"')
  expect(html).not.toContain('Add selected')
  expect(html).not.toContain('Add set')
  expect(html).not.toContain('role="tablist"')
  for (const label of ['Equations', 'Variables']) {
    expect(html).toContain(`role="grid" aria-label="${label}"`)
  }
})

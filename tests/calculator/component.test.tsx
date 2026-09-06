import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { ScientificCalculator } from "@/registry/calculator/components/scientific-calculator"

test("calculator renders with shared controls without starting a worker during SSR", () => {
  const html = renderToStaticMarkup(<ScientificCalculator />)
  expect(html).not.toContain('data-slot="card"')
  expect(html).toContain('data-slot="input"')
  expect(html).toContain('Calculator expression')
  expect(html).toContain('No relations yet')
})

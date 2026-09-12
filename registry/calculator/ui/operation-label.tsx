import { MathExpression } from '@/registry/calculator/ui/math'
import type { OperationItem } from '@/registry/calculator/lib/operations'

const MATH_LABELS: Record<string, string> = {
  add: '<mo>+</mo>',
  subtract: '<mo>−</mo>',
  multiply: '<mo>×</mo>',
  divide: '<mo>÷</mo>',
  power: '<msup><mi>x</mi><mi>y</mi></msup>',
  sqrt: '<msqrt><mi>x</mi></msqrt>',
  factorial: '<mi>n</mi><mo>!</mo>',
  parentheses: '<mo>(</mo><mi>x</mi><mo>)</mo>',
  sin: '<mi>sin</mi>',
  cos: '<mi>cos</mi>',
  tan: '<mi>tan</mi>',
  asin: '<mi>arcsin</mi>',
  acos: '<mi>arccos</mi>',
  atan: '<mi>arctan</mi>',
  sinh: '<mi>sinh</mi>',
  cosh: '<mi>cosh</mi>',
  tanh: '<mi>tanh</mi>',
  ln: '<mi>ln</mi>',
  log: '<mi>log</mi>',
  log10: '<msub><mi>log</mi><mn>10</mn></msub>',
  exp: '<msup><mi>e</mi><mi>x</mi></msup>',
  abs: '<mo>|</mo><mi>x</mi><mo>|</mo>',
  pi: '<mi>π</mi>',
  e: '<mi>e</mi>',
}

export function OperationLabel({ item }: { item: OperationItem }) {
  const mathml = MATH_LABELS[item.id]
  return (
    <span
      className={`calculator-operation-label min-w-0 font-normal ${mathml ? 'text-base' : 'text-xs leading-none whitespace-normal text-left'}`}
      aria-hidden="true"
    >
      {mathml ? (
        <MathExpression mathml={`<mrow>${mathml}</mrow>`} />
      ) : <span className="min-w-0 break-words">{item.label}</span>}
    </span>
  )
}

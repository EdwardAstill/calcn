'use client'

import { MathJax, MathJaxContext } from 'better-react-mathjax'
import type { ComponentProps, ReactNode } from 'react'

export function CalculatorMathProvider({ children }: { children: ReactNode }) {
  return (
    <MathJaxContext version={4} config={{ startup: { typeset: false }, options: { enableMenu: false } }}>
      {children}
    </MathJaxContext>
  )
}

export function MathExpression({ mathml, ...props }: { mathml: string } & ComponentProps<'span'>) {
  const text = /^\s*<math(?:\s|>)/.test(mathml)
    ? mathml
    : `<math xmlns="http://www.w3.org/1998/Math/MathML">${mathml}</math>`

  return (
    <MathJax
      key={text}
      {...props}
      inline
      hideUntilTypeset="first"
      renderMode="pre"
      typesettingOptions={{ fn: 'mathml2chtmlPromise' }}
      text={text}
    />
  )
}

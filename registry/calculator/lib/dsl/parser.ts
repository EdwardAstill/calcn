import {
  BUILTIN_ARITY,
  isBuiltinFunction,
  type BuiltinFunction,
  type ExpressionAst,
  type RelationAst,
} from '@/registry/calculator/lib/dsl/ast'
import { tokenize, type Token, type TokenKind } from '@/registry/calculator/lib/dsl/tokenize'

export class ParseError extends Error {
  readonly start: number
  readonly end: number

  constructor(message: string, start: number, end: number) {
    super(`${message} at position ${start + 1}`)
    this.name = 'ParseError'
    this.start = start
    this.end = end
  }
}

class Parser {
  private readonly tokens: Token[]
  private index = 0

  constructor(tokens: Token[]) {
    this.tokens = tokens
  }

  parseRelation(): RelationAst {
    const left = this.parseExpression()
    if (this.match('equals')) {
      const right = this.parseExpression()
      this.expectEnd()
      return { kind: 'equation', left, right }
    }
    this.expectEnd()
    return { kind: 'query', expression: left }
  }

  private parseExpression(): ExpressionAst {
    return this.parseAdditive()
  }

  private parseAdditive(): ExpressionAst {
    let expression = this.parseMultiplicative()
    while (this.at('plus') || this.at('minus')) {
      const operator = this.advance().kind === 'plus' ? '+' : '-'
      expression = {
        kind: 'binary',
        operator,
        left: expression,
        right: this.parseMultiplicative(),
      }
    }
    return expression
  }

  private parseMultiplicative(): ExpressionAst {
    let expression = this.parseUnary()

    while (true) {
      if (this.at('star') || this.at('slash')) {
        const operator = this.advance().kind === 'star' ? '*' : '/'
        expression = {
          kind: 'binary',
          operator,
          left: expression,
          right: this.parseUnary(),
        }
        continue
      }
      if (this.startsImplicitFactor()) {
        expression = {
          kind: 'binary',
          operator: '*',
          implicit: true,
          left: expression,
          right: this.parseUnary(),
        }
        continue
      }
      break
    }

    return expression
  }

  private parseUnary(): ExpressionAst {
    if (this.at('plus') || this.at('minus')) {
      const operator = this.advance().kind === 'plus' ? '+' : '-'
      return { kind: 'unary', operator, operand: this.parseUnary() }
    }
    return this.parsePower()
  }

  private parsePower(): ExpressionAst {
    let expression = this.parsePostfix()
    if (this.match('caret')) {
      expression = {
        kind: 'binary',
        operator: '^',
        left: expression,
        right: this.parseUnary(),
      }
    }
    return expression
  }

  private parsePostfix(): ExpressionAst {
    let expression = this.parsePrimary()
    while (this.match('bang')) expression = { kind: 'factorial', operand: expression }
    return expression
  }

  private parsePrimary(): ExpressionAst {
    const token = this.current()
    if (this.match('number')) return { kind: 'number', value: token.text }

    if (this.match('identifier')) {
      const normalized = token.text.toLowerCase()
      if (isBuiltinFunction(normalized)) {
        if (!this.at('lparen') && !this.at('lbrace')) {
          throw new ParseError(
            `Function "${token.text}" requires parentheses or braces`,
            token.start,
            token.end,
          )
        }
        return this.parseCall(normalized, token)
      }
      if (normalized === 'pi' || normalized === 'e') {
        return { kind: 'constant', name: normalized }
      }
      if (token.text.length > 1 && (this.at('lparen') || this.at('lbrace'))) {
        throw new ParseError(
          `Unknown function "${token.text}"`,
          token.start,
          token.end,
        )
      }
      return { kind: 'symbol', name: token.text }
    }

    if (this.at('lparen') || this.at('lbrace')) {
      const opening = this.advance()
      const closingKind = opening.kind === 'lparen' ? 'rparen' : 'rbrace'
      const closingText = opening.kind === 'lparen' ? ')' : '}'
      const expression = this.parseExpression()
      this.expect(closingKind, `Expected "${closingText}"`)
      return expression
    }

    const shown = token.kind === 'eof' ? 'end of input' : `"${token.text}"`
    throw new ParseError(`Expected an expression, found ${shown}`, token.start, token.end)
  }

  private parseCall(name: BuiltinFunction, nameToken: Token): ExpressionAst {
    const opening = this.advance()
    const closingKind = opening.kind === 'lparen' ? 'rparen' : 'rbrace'
    const closingText = opening.kind === 'lparen' ? ')' : '}'
    const args: ExpressionAst[] = []

    if (!this.at(closingKind)) {
      do {
        args.push(this.parseExpression())
      } while (this.match('comma'))
    }
    this.expect(closingKind, `Expected "${closingText}"`)

    const expected = BUILTIN_ARITY[name]
    if (args.length !== expected) {
      throw new ParseError(
        `${name} expects ${expected} argument${expected === 1 ? '' : 's'}`,
        nameToken.start,
        nameToken.end,
      )
    }
    return { kind: 'call', name, args }
  }

  private startsImplicitFactor(): boolean {
    return (
      this.at('number') ||
      this.at('identifier') ||
      this.at('lparen') ||
      this.at('lbrace')
    )
  }

  private expectEnd(): void {
    if (this.at('eof')) return
    const token = this.current()
    throw new ParseError(
      `Unexpected "${token.text}"; expected end of input`,
      token.start,
      token.end,
    )
  }

  private expect(kind: TokenKind, message: string): Token {
    if (this.at(kind)) return this.advance()
    const token = this.current()
    throw new ParseError(message, token.start, token.end)
  }

  private match(kind: TokenKind): boolean {
    if (!this.at(kind)) return false
    this.advance()
    return true
  }

  private at(kind: TokenKind): boolean {
    return this.current().kind === kind
  }

  private current(): Token {
    return this.tokens[this.index]
  }

  private advance(): Token {
    const token = this.current()
    if (token.kind !== 'eof') this.index += 1
    return token
  }
}

export function parseRelation(source: string): RelationAst {
  return new Parser(tokenize(source)).parseRelation()
}

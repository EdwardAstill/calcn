export type TokenKind =
  | 'number'
  | 'identifier'
  | 'plus'
  | 'minus'
  | 'star'
  | 'slash'
  | 'caret'
  | 'bang'
  | 'lparen'
  | 'rparen'
  | 'lbrace'
  | 'rbrace'
  | 'comma'
  | 'equals'
  | 'eof'

export type Token = {
  kind: TokenKind
  text: string
  start: number
  end: number
}

export class TokenizeError extends Error {
  readonly start: number
  readonly end: number

  constructor(message: string, start: number, end: number) {
    super(`${message} at position ${start + 1}`)
    this.name = 'TokenizeError'
    this.start = start
    this.end = end
  }
}

const SINGLE_TOKENS: Record<string, TokenKind> = {
  '+': 'plus',
  '-': 'minus',
  '*': 'star',
  '/': 'slash',
  '^': 'caret',
  '!': 'bang',
  '(': 'lparen',
  ')': 'rparen',
  '{': 'lbrace',
  '}': 'rbrace',
  ',': 'comma',
  '=': 'equals',
}

function isDigit(character: string | undefined): boolean {
  return character !== undefined && character >= '0' && character <= '9'
}

function isIdentifierStart(character: string | undefined): boolean {
  return (
    character !== undefined &&
    ((character >= 'a' && character <= 'z') ||
      (character >= 'A' && character <= 'Z') ||
      character === '_')
  )
}

function isIdentifierPart(character: string | undefined): boolean {
  return isIdentifierStart(character) || isDigit(character)
}

function readNumber(source: string, start: number): number {
  let index = start

  while (isDigit(source[index])) index += 1
  if (source[index] === '.') {
    index += 1
    while (isDigit(source[index])) index += 1
  }

  if (source[index]?.toLowerCase() === 'e') {
    let exponentEnd = index + 1
    if (source[exponentEnd] === '+' || source[exponentEnd] === '-') {
      exponentEnd += 1
    }
    const digitStart = exponentEnd
    while (isDigit(source[exponentEnd])) exponentEnd += 1
    if (exponentEnd > digitStart) index = exponentEnd
  }

  return index
}

export function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  let index = 0

  while (index < source.length) {
    const character = source[index]
    if (/\s/u.test(character)) {
      index += 1
      continue
    }

    const singleKind = SINGLE_TOKENS[character]
    if (singleKind) {
      tokens.push({ kind: singleKind, text: character, start: index, end: index + 1 })
      index += 1
      continue
    }

    if (isDigit(character) || (character === '.' && isDigit(source[index + 1]))) {
      const end = readNumber(source, index)
      tokens.push({ kind: 'number', text: source.slice(index, end), start: index, end })
      index = end
      continue
    }

    if (isIdentifierStart(character)) {
      let end = index + 1
      while (isIdentifierPart(source[end])) end += 1
      tokens.push({ kind: 'identifier', text: source.slice(index, end), start: index, end })
      index = end
      continue
    }

    throw new TokenizeError(`Unexpected character "${character}"`, index, index + 1)
  }

  tokens.push({ kind: 'eof', text: '', start: source.length, end: source.length })
  return tokens
}

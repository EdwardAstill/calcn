import { expect, test } from 'bun:test'
import { readFileSync, readdirSync } from 'node:fs'
import { parseLibraryMarkdown } from '../../scripts/render-calculator-library'
import { EQUATION_LIBRARY } from '@/registry/calculator/lib/generated/equation-library'

test('library reads headings and inline/display equations, ignoring prose and code blocks', () => {
  const file = parseLibraryMarkdown('# Motion\nNotes\n$v = u + a*t$\n## Force\n$$\nF = m*a\n$$\n```\n$not valid$\n```', 'physics.md')
  expect(file.groups.map((group) => [group.title, group.equations.map((eq) => eq.source)]))
    .toEqual([['Motion', ['v = u + a*t']], ['Force', ['F = m*a']]])
})

test('library reports invalid equations with their file and group', () => {
  expect(() => parseLibraryMarkdown('# Broken\n$x = $', 'bad.md')).toThrow('bad.md (Broken): x =')
  expect(() => parseLibraryMarkdown('$x + 1$', 'query.md')).toThrow('Expected an equation')
  expect(parseLibraryMarkdown('No equations', 'empty.md').groups).toEqual([])
})

test('bundled library matches every Markdown file in the library folder', () => {
  const folder = new URL('../../library/', import.meta.url)
  const expected = readdirSync(folder).filter((name) => /\.md$/i.test(name))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => parseLibraryMarkdown(readFileSync(new URL(name, folder), 'utf8'), name))
  expect(EQUATION_LIBRARY).toEqual(expected)
})

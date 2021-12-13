import { CodeLoc, CodeSection } from './parsed'
import { StrView } from './strview'

export const matchUnion = <U extends { [key in D]: string }, D extends keyof U, T>(
  subject: U,
  prop: D,
  callbacks: { [variant in U[D]]: (value: Extract<U, { [key in D]: variant }>) => T }
): T =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
  callbacks[subject[prop]](subject as any)

export const matchUnionWithFallback = <U extends { [key in D]: string }, D extends keyof U, T>(
  subject: U,
  prop: D,
  callbacks: { [variant in U[D]]?: (value: Extract<U, { [key in D]: variant }>) => T } & { _: (value: U) => T }
): T =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
  (callbacks[subject[prop]] ?? callbacks._)(subject as any)

export const matchStr = <S extends string, T>(str: S, callbacks: { [variant in S]: () => T }): T => callbacks[str]()

export const computeCodeSectionEnd = (section: CodeSection, source: StrView): CodeLoc =>
  section.start.line === section.next.line && section.start.col === section.next.col
    ? section.start
    : section.next.col === 0
    ? {
        file: section.start.file,
        line: section.next.line - 1,
        col:
          source
            .toFullStringSlow() /* SLOW */
            .split(/\n/)[section.next.line - 1].length - 1,
      }
    : { file: section.start.file, line: section.next.line, col: section.next.col - 1 }

// export const getExtractEndLoc = (loc: FormatableExtractEndLoc, source: string): CodeLoc =>
//   loc.col !== 'lineEnd' ? loc : { line: loc.line, col: source.split(/\n/)[loc.line].length - 1 }

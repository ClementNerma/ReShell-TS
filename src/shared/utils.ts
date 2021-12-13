export const matchUnion = <U extends { [key in D]: string }, D extends keyof U>(subject: U) => {
  return <T>(
    prop: D,
    callbacks:
      | { [variant in U[D]]: (value: Extract<U, { [key in D]: variant }>) => T }
      | ({ [variant in U[D]]?: (value: Extract<U, { [key in D]: variant }>) => T } & {
          _: (value: U[D]) => T
        })
  ): T => (callbacks[subject[prop]] ?? (callbacks as { _: any })._)(subject as any)
}

export const matchStr =
  <S extends string>(str: S) =>
  <T>(callbacks: { [variant in S]: () => T }): T =>
    callbacks[str]()

// export const tokenEnd = (token: Token<unknown>): FormatableExtractEndLoc =>
//   token.start.line === token.next.line && token.start.col === token.next.col
//     ? token.start
//     : token.next.col === 0
//     ? { line: token.next.line - 1, col: 'lineEnd' }
//     : { line: token.next.line, col: token.next.col - 1 }

// export const getExtractEndLoc = (loc: FormatableExtractEndLoc, source: string): CodeLoc =>
//   loc.col !== 'lineEnd' ? loc : { line: loc.line, col: source.split(/\n/)[loc.line].length - 1 }

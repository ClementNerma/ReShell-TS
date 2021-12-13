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

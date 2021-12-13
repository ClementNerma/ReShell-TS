export type Token<T> = { parsed: T; matched: string; at: CodeSection }

export type CodeSection = {
  start: CodeLoc
  next: CodeLoc
}

export type CodeLoc = {
  file: { ref: string | null /* entrypoint */ }
  line: number
  col: number
}

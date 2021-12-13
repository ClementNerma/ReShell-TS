export type Token<T> = { parsed: T; matched: number; at: CodeSection }

export type CodeSection = {
  start: CodeLoc
  next: CodeLoc
}

export type CodeLoc = {
  file: CodeLocFile
  line: number
  col: number
}

export type CodeLocFile = { type: 'file'; path: string } | { type: 'entrypoint' } | { type: 'internal'; path: string }

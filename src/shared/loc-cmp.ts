import { CodeLoc } from '../shared/parsed'
import { matchUnion } from '../shared/utils'

export function isLocEq(a: CodeLoc, b: CodeLoc): boolean {
  return (
    a.col === b.col &&
    a.line === b.line &&
    matchUnion(a.file, 'type', {
      entrypoint: () => b.file.type === 'entrypoint',
      file: ({ path }) => b.file.type === 'file' && b.file.path === path,
      internal: ({ path }) => b.file.type === 'internal' && b.file.path === path,
    })
  )
}

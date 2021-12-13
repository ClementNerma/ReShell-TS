import { StrView } from '../shared/strview'
import { Parser, success } from './lib/base'

/**
 * Comments are very hard to handle with parser combinators
 * Example: how to parse `2 + 3 + # comment \n 5`?
 * There can be comments inside expressions, commands, etc.
 * So the most simple solution is to strip them *before* the program is actually parsed
 *
 * This function removes all comments from a source program and returns its stripped version
 */
export const commentStripper: Parser<StrView> = (start, input) => {
  const lines = input.toFullStringSlow().split(/\n/) // SLOW

  const output = lines.map((line) => {
    if (!line.includes('#')) {
      return line
    }

    if (!line.includes('"')) {
      return line.replace(/#.*$/, '')
    }

    const firstQuoteLoc = line.indexOf('"')
    const firstSharpLoc = line.indexOf('#')

    if (firstSharpLoc < firstQuoteLoc) {
      return line.replace(/#.*$/, '')
    }

    let opened = false
    let willEscape = false
    let commentStartsAt = -1

    for (let i = 0; i < line.length; i++) {
      if (willEscape) {
        willEscape = false
      } else if (line.charAt(i) === '"') {
        opened = !opened
      } else if (opened) {
        if (line.charAt(i) === '\\') {
          willEscape = true
        }
      } else if (line.charAt(i) === '#') {
        commentStartsAt = i
        break
      }
    }

    return commentStartsAt === -1 ? line : line.substr(0, commentStartsAt)
  })

  return success(
    start,
    { file: start.file, line: lines.length - 1, col: lines[lines.length - 1].length },
    StrView.create(output.join('\n')), // SLOW
    input.toFullStringSlow().length // SLOW
  )
}

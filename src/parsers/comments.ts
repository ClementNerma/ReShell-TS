import { Parser, success } from './lib/base'
import { StrView } from './lib/strview'

export const commentStripper: Parser<StrView> = (start, input) => {
  let lines = input.toFullStringSlow().split(/\n/) // SLOW

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
    { line: lines.length - 1, col: lines[lines.length - 1].length },
    StrView.create(output.join('\n')), // SLOW
    input.toFullStringSlow() // SLOW
  )
}

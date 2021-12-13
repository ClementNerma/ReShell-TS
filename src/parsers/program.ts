import { Program } from '../shared/ast'
import { commentStripper } from './comments'
import { Parser } from './lib/base'
import { then } from './lib/conditions'
import { takeWhile } from './lib/loops'
import { fullSource } from './lib/super'
import { withNormalizedNewlines } from './lib/utils'
import { statementChain } from './statements'

const strippedProgram: Parser<Program> = takeWhile(statementChain)

export const program: Parser<Program> = withNormalizedNewlines(
  then(commentStripper, (_, data, context) =>
    fullSource(strippedProgram, { eos: 'unexpected end of input' })(data.at.start, data.parsed, context)
  )
)

import { Program } from '../shared/ast'
import { commentStripper } from './comments'
import { Parser } from './lib/base'
import { then } from './lib/conditions'
import { fullSource } from './lib/super'
import { withNormalizedNewlines } from './lib/utils'
import { block } from './statements'

const strippedProgram: Parser<Program> = block

export const program: Parser<Program> = withNormalizedNewlines(
  then(commentStripper, (_, data, context) =>
    fullSource(strippedProgram, { eos: 'unexpected end of input' })(data.at.start, data.parsed, context)
  )
)

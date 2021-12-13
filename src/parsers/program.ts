import { Parser } from '../lib/base'
import { then } from '../lib/conditions'
import { takeWhile } from '../lib/loops'
import { fullSource } from '../lib/super'
import { withNormalizedNewlines } from '../lib/utils'
import { Program } from '../shared/parsed'
import { commentStripper } from './comments'
import { statementChain } from './statements'

const strippedProgram: Parser<Program> = takeWhile(statementChain)

export const program: Parser<Program> = withNormalizedNewlines(
  fullSource(
    then(commentStripper, ({ data: { start, parsed } }, context) => strippedProgram(start, parsed, context)),
    { eos: 'Expected statement' }
  )
)

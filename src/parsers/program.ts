import { Parser } from '../lib/base'
import { then } from '../lib/conditions'
import { takeForever } from '../lib/loops'
import { fullSource } from '../lib/super'
import { commentStripper } from './comments'
import { Program } from './data'
import { statementChain } from './statements'

const strippedProgram: Parser<Program> = takeForever(statementChain)

export const program: Parser<Program> = fullSource(
  then(commentStripper, ({ data: { start, parsed } }, context) => strippedProgram(start, parsed, context))
)

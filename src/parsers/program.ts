import { Program } from '../shared/ast'
import { block } from './block'
import { commentStripper } from './comments'
import { Parser } from './lib/base'
import { combine } from './lib/combinations'
import { then } from './lib/conditions'
import { maybe_s_nl } from './lib/littles'
import { fullSource } from './lib/super'
import { map } from './lib/transform'
import { withNormalizedNewlines } from './lib/utils'

const strippedProgram: Parser<Program> = map(combine(maybe_s_nl, block, maybe_s_nl), ([_, { parsed: prog }]) => prog)

export const program: Parser<Program> = withNormalizedNewlines(
  then(commentStripper, (_, data, context) =>
    fullSource(strippedProgram, { eos: 'expected end of input' })(data.at.start, data.parsed, context)
  )
)

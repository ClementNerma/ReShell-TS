import { StrView } from '../shared/strview'
import { UNICODE_LETTER } from './lib/littles'

type Predicate = (input: StrView) => boolean

export const startsWithLetter: Predicate = (input) =>
  input.startsWithChar('_') || input.matchFirstChar(UNICODE_LETTER) !== null

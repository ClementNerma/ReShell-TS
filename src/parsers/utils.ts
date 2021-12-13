import { unicodeSingleLetter } from '../lib/littles'
import { exact } from '../lib/matchers'
import { matcher } from '../lib/raw'
import { or } from '../lib/switches'

export const startsWithLetter = matcher(or([unicodeSingleLetter, exact('_')]), null)

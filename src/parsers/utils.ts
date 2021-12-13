import { unicodeSingleLetter } from '../lib/littles'
import { exact } from '../lib/matchers'
import { matcher } from '../lib/raw'
import { or } from '../lib/switches'

export const startsWithLetter = matcher(or([unicodeSingleLetter, exact('_')]), null)

export function matchUnion<U extends { [key in D]: string }, D extends keyof U, T>(
  subject: U,
  prop: D,
  callbacks: { [variant in U[D]]: (value: Extract<U, { [key in D]: variant }>) => T }
): T {
  return callbacks[subject[prop]](subject as any)
}

import { FormatableErrInput } from '../../shared/errors'

export function addComplementsIf(
  message: string,
  cond: boolean,
  complements: [string, string][]
): string | FormatableErrInput {
  return cond ? { message, complements } : message
}

import { DoubleOp } from './ast'
import { matchStr } from './utils'

export const getOpPrecedence = (op: DoubleOp['op']['parsed']): 1 | 2 | 3 | 4 =>
  matchStr(op, {
    Add: () => 1,
    Sub: () => 1,
    Mul: () => 2,
    Div: () => 2,
    Rem: () => 1,
    Null: () => 2,
    And: () => 4,
    Or: () => 4,
    Xor: () => 4,
    Eq: () => 3,
    NotEq: () => 3,
    GreaterThanOrEqualTo: () => 3,
    LessThanOrEqualTo: () => 3,
    GreaterThan: () => 3,
    LessThan: () => 3,
  })

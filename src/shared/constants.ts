import { DoubleOp } from './ast'
import { matchStr } from './utils'

export const getOpPrecedence = (op: DoubleOp['op']['parsed']): 1 | 2 | 3 | 4 | 5 =>
  matchStr(op, {
    Add: () => 1,
    Sub: () => 1,
    Mul: () => 2,
    Div: () => 2,
    Rem: () => 1,
    Null: () => 3,
    And: () => 5,
    Or: () => 5,
    Xor: () => 5,
    Eq: () => 4,
    NotEq: () => 4,
    GreaterThanOrEqualTo: () => 4,
    LessThanOrEqualTo: () => 4,
    GreaterThan: () => 4,
    LessThan: () => 4,
  })

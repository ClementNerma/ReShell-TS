import { Expr, ValueType } from './ast'
import { Token } from './parsed'

export type ObjectsTypingMap = {
  assignedExpr: Map<Expr, ValueType>
  forLoopsValueVar: Map<Token<string>, ValueType>
}

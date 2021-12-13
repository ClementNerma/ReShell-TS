// TODO: function calls, redirections, computed commands '$(...)', '$@(...)', '$^(...)' etc.
// TODO: streams support
// TODO: background tasks management
// TODO: detaching task from shell
// TODO: launching sub-scripts
// TODO: commands declaration
// TODO: accessing struct members
// TODO: methods or wrapping?

export type CodeLoc = {
  line: number
  col: number
}

export type CodeSection = {
  start: CodeLoc
  next: CodeLoc
}

export type Token<T> = { parsed: T; matched: string; at: CodeSection }

// ============== //

export type Program = Token<StatementChain>[]

export type StatementChain =
  | { type: 'empty' }
  | { type: 'chain'; start: Token<Statement>; sequence: Token<ChainedStatement>[] }

export type ChainedStatement = { op: Token<StatementChainOp>; chainedStatement: Token<Statement> }

export type StatementChainOp = 'Then' | 'And' | 'Or' | 'Pipe'

export type Statement =
  | {
      type: 'variableDecl'
      varname: Token<string>
      vartype: Token<ValueType> | null
      mutable: Token<boolean>
      expr: Token<Expr>
    }
  | {
      type: 'assignment'
      varname: Token<string>
      propAccess: Token<NonNullablePropertyAccess>[]
      prefixOp: Token<DoubleArithOp> | null
      expr: Token<Expr>
    }
  | {
      type: 'ifBlock'
      cond: Token<Expr>
      body: Token<StatementChain>[]
      elif: ElIfBlock[]
      els: Token<StatementChain>[] | null
    }
  | { type: 'forLoop'; loopvar: Token<string>; subject: Token<Expr>; body: Token<StatementChain>[] }
  | { type: 'whileLoop'; cond: Token<Expr>; body: Token<StatementChain>[] }
  | {
      type: 'tryBlock'
      body: Token<StatementChain>[]
      catchVarname: Token<string>
      catchBody: Token<StatementChain>[]
    }
  | { type: 'throw'; expr: Token<Expr> }
  | { type: 'typeAlias'; typename: Token<string>; content: Token<ValueType> }
  | { type: 'fnDecl'; name: Token<string>; fnType: FnType; body: Token<StatementChain>[] }
  | { type: 'return'; expr: Token<Expr | null> }
  | ({ type: 'cmdCall' } & CmdCall)

export type ElIfBlock = { cond: Token<Expr>; body: Token<StatementChain>[] }

export type NonNullablePropertyAccess =
  | { type: 'refIndexOrKey'; indexOrKey: Token<Expr> }
  | { type: 'refStructMember'; member: Token<string> }

export type PropertyAccess = { nullable: boolean; access: NonNullablePropertyAccess }

export type FnType = {
  named: Token<string> | null
  args: FnArg[]
  returnType: ValueType | null
  failureType: ValueType | null
}

export type FnArg = {
  // mutable: boolean
  name: Token<string>
  optional: boolean
  type: ValueType
  defaultValue: LiteralValue | null
}

export type CmdCall = { name: Token<string>; args: Token<CmdArg>[]; redir: Token<CmdRedir> | null }

export type CmdFlag = { short: Token<boolean>; name: Token<string>; directValue: Token<Expr> | null }

export type CmdArg =
  // Backslash followed by a newline
  | { type: 'escape' }
  // NOTE: flags may have a non-direct value, e.g. `--arg value` will be parsed as a long 'arg' flag without direct value,
  // followed by a 'value' expr
  | ({ type: 'flag' } & CmdFlag)
  | { type: 'reference'; varname: Token<string> }
  | { type: 'expr'; expr: Token<Expr> }
  | { type: 'value'; value: Token<Value> }

export type CmdRedir = { op: Token<CmdRedirOp>; path: Token<Token<string>[]> }

export type CmdRedirOp =
  | 'Input'
  | 'Stdout'
  | 'AppendStdout'
  | 'Stderr'
  | 'AppendStderr'
  | 'StdoutStderr'
  | 'AppendStdoutStderr'

export type NonNullableValueType =
  | PrimitiveTypes
  | { type: 'list'; itemsType: ValueType }
  | { type: 'map'; itemsType: ValueType }
  | { type: 'struct'; members: StructTypeMember[] }
  | { type: 'fn'; fnType: FnType }
  | { type: 'aliasRef'; typeAliasName: Token<string> }
  | { type: 'unknown' }
  | InternalTypes

export type PrimitiveTypes = { type: 'bool' } | { type: 'number' } | { type: 'string' } | { type: 'path' }

export type InternalTypes = { type: 'void' }

export type StructTypeMember = { name: string; type: ValueType }

export type ValueType = { nullable: boolean; inner: NonNullableValueType }

export type ResolvedValueType = Exclude<ValueType, { type: 'aliasRef' }>

export type ComputedStringSegment = { type: 'literal'; content: Token<string> } | { type: 'expr'; expr: Token<Expr> }

export type ComputedPathSegment =
  | { type: 'separator' }
  | { type: 'literal'; content: Token<string> }
  | { type: 'expr'; expr: Token<Expr> }

export type InlineCmdCall = CmdCall

export type InlineChainedCmdCall = { op: Token<StatementChainOp>; chainedCmdCall: Token<InlineCmdCall> }

export type InlineCmdCallCapture = 'Stdout' | 'Stderr' | 'Both'

export type FnCallArg = ({ type: 'flag' } & CmdFlag) | { type: 'expr'; expr: Token<Expr> }

export type LiteralValue =
  | { type: 'null' }
  | { type: 'bool'; value: Token<boolean> }
  | { type: 'number'; value: Token<number> }
  | { type: 'string'; value: Token<string> }
  | { type: 'path'; segments: Token<Token<string>[]> }

export type Value =
  | LiteralValue
  | { type: 'computedString'; segments: Token<ComputedStringSegment>[] }
  | { type: 'computedPath'; segments: Token<ComputedPathSegment>[] }
  | { type: 'list'; items: Token<Expr>[] }
  | { type: 'map'; entries: { key: Token<string>; value: Token<Expr> }[] }
  | { type: 'struct'; members: { name: Token<string>; value: Token<Expr> }[] }
  | { type: 'closure'; fnType: FnType; body: Token<StatementChain>[] }
  | { type: 'fnCall'; name: Token<string>; args: Token<FnCallArg>[] }
  | {
      type: 'inlineCmdCallSequence'
      start: Token<InlineCmdCall>
      sequence: Token<InlineChainedCmdCall>[]
      capture: Token<InlineCmdCallCapture> | null
    }
  | { type: 'reference'; varname: Token<string> }

export type ExprSequenceAction =
  | { type: 'propAccess'; right: Token<PropertyAccess> }
  | { type: 'doubleOp'; op: Token<DoubleOp>; right: Token<ExprElement> }

export type ExprElement =
  | { type: 'value'; content: Token<Value> }
  | { type: 'paren'; inner: Token<Expr> }
  | { type: 'ternary'; cond: Token<Expr>; then: Token<Expr>; elif: ElIfExpr[]; els: Token<Expr> }
  | { type: 'try'; trying: Token<Expr>; catchVarname: Token<string>; catchExpr: Token<Expr> }
  | { type: 'assertion'; varname: Token<string>; minimum: Token<ValueType> }
  | { type: 'singleOp'; op: Token<SingleOp>; right: Token<ExprElement> }

export type ElIfExpr = { cond: Token<Expr>; expr: Token<Expr> }

export type Expr = { from: Token<ExprElement>; sequence: Token<ExprSequenceAction>[] }

export type DoubleOp = { type: 'arith'; op: Token<DoubleArithOp> } | { type: 'logic'; op: Token<DoubleLogicOp> }

export type DoubleArithOp = 'Add' | 'Sub' | 'Mul' | 'Div' | 'Rem' | 'Null'

export type DoubleLogicOp =
  | 'And'
  | 'Or'
  | 'Xor'
  | 'Eq'
  | 'NotEq'
  | 'GreaterThanOrEqualTo'
  | 'LessThanOrEqualTo'
  | 'GreaterThan'
  | 'LessThan'

export type SingleOp = { type: 'logic'; op: Token<SingleLogicOp> }

export type SingleLogicOp = 'Not'

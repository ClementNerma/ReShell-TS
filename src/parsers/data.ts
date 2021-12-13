import { Token } from '../lib/base'

// TODO: function calls, redirections, computed commands '$(...)', '$@(...)', '$^(...)' etc.
// TODO: streams support
// TODO: background tasks management
// TODO: detaching task from shell
// TODO: launching sub-scripts
// TODO: commands declaration
// TODO: accessing struct members
// TODO: methods or wrapping?

export type Program = Token<StatementChain>[]

export type StatementChain =
  | { type: 'empty' }
  | { type: 'chain'; start: Token<Statement>; sequence: Token<ChainedStatement>[] }

export type ChainedStatement = { op: Token<StatementChainOp>; chainedStatement: Token<Statement> }

export enum StatementChainOp {
  Then,
  And,
  Or,
  Pipe,
}

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
      prefixOp: Token<DoubleArithOp> | null
      expr: Token<Expr>
    }
  | { type: 'forLoop'; loopvar: Token<string>; subject: Token<Expr> }
  | { type: 'whileLoop'; cond: Token<Expr> }
  | { type: 'ifBlock'; cond: Token<Expr> }
  | { type: 'elifBlock'; cond: Token<Expr> }
  | { type: 'elseBlock' }
  | { type: 'blockEnd' }
  | { type: 'typeAlias'; typename: Token<string>; content: Token<ValueType> }
  | { type: 'fnOpen'; name: Token<string>; fnType: FnType }
  | { type: 'return'; expr: Token<Expr | null> }
  | ({ type: 'cmdCall' } & CmdCall)

export type FnType = {
  named: Token<string> | null
  args: Token<FnArg>[]
  returnType: Token<ValueType> | null
}

export type FnArg = {
  // mutable: boolean
  name: Token<string>
  optional: Token<boolean>
  type: Token<ValueType>
  defaultValue: Token<LiteralValue> | null
}

export type CmdCall = { name: Token<string>; args: Token<CmdArg>[]; redir: Token<CmdRedir> | null }

export type CmdFlag = { short: Token<boolean>; name: Token<string>; directValue: Token<Expr> | null }

export type CmdArg =
  // NOTE: flags may have a non-direct value, e.g. `--arg value` will be parsed as a long 'arg' flag without direct value,
  // followed by a 'value' expr
  | ({ type: 'flag' } & CmdFlag)
  | { type: 'reference'; varname: Token<string> }
  | { type: 'expr'; expr: Token<Expr> }
  | { type: 'literal'; value: Token<LiteralValue> }

export type CmdRedir = { op: Token<CmdRedirOp>; path: Token<Token<string>[]> }

export enum CmdRedirOp {
  Input,
  Stdout,
  AppendStdout,
  Stderr,
  AppendStderr,
  StdoutStderr,
  AppendStdoutStderr,
}

export type NonNullableValueType =
  | { type: 'bool' }
  | { type: 'number' }
  | { type: 'string' }
  | { type: 'path' }
  | { type: 'list'; itemsType: Token<ValueType> }
  | { type: 'map'; itemsType: Token<ValueType> }
  | { type: 'struct'; members: Token<[Token<string>, Token<ValueType>][]> }
  | { type: 'fn'; fnType: FnType }
  | { type: 'aliasRef'; typeAliasName: Token<string> }

export type ValueType = { nullable: boolean; inner: NonNullableValueType }

export type ResolvedValueType = Exclude<ValueType, { type: 'aliasRef' }>

export type LiteralValue =
  | { type: 'null' }
  | { type: 'bool'; value: Token<boolean> }
  | { type: 'number'; value: Token<number> }
  | { type: 'string'; value: Token<LiteralString> }
  | { type: 'path'; segments: Token<Token<string>[]> }
  | { type: 'closure'; fnType: FnType; body: Token<StatementChain>[] }

export type LiteralString =
  | { type: 'raw'; content: Token<string> }
  | { type: 'computed'; segments: Token<ComputedStringSegment>[] }

export type ComputedStringSegment = { type: 'literal'; content: Token<string> } | { type: 'expr'; expr: Token<Expr> }

export type InlineCmdCall = CmdCall

export type InlineChainedCmdCall = { op: Token<StatementChainOp>; chainedCmdCall: Token<InlineCmdCall> }

export enum InlineCmdCallCapture {
  Stdout,
  Stderr,
  Both,
}

export type FnCallArg = ({ type: 'flag' } & CmdFlag) | { type: 'expr'; expr: Token<Expr> }

export type Value =
  | LiteralValue
  | { type: 'list'; items: Token<Token<Expr>[]> }
  | { type: 'map'; entries: Token<{ key: Token<LiteralString>; expr: Token<Expr> }[]> }
  | { type: 'struct'; entries: Token<{ member: Token<string>; expr: Token<Expr> }[]> }
  | { type: 'fnCall'; name: Token<string>; args: Token<FnCallArg>[] }
  | {
      type: 'inlineCmdCallSequence'
      start: Token<InlineCmdCall>
      sequence: Token<InlineChainedCmdCall>[]
      capture: Token<InlineCmdCallCapture> | null
    }
  | { type: 'reference'; varname: Token<string> }

export type ExprSequenceAction =
  | { type: 'refIndexOrKey'; indexOrKey: Token<Expr> }
  | { type: 'refStructMember'; member: Token<string> }
  | { type: 'doubleOp'; op: Token<DoubleOp>; right: Token<ExprElement> }

export type ExprElement =
  | { type: 'value'; content: Token<Value> }
  | { type: 'paren'; inner: Token<Expr> }
  | { type: 'ternary'; cond: Token<Expr>; then: Token<Expr>; els: Token<Expr> }
  | { type: 'singleOp'; op: Token<SingleOp>; right: Token<ExprElement> }

export type Expr = { from: Token<ExprElement>; sequence: Token<ExprSequenceAction>[] }

export type DoubleOp = { type: 'arith'; op: Token<DoubleArithOp> } | { type: 'logic'; op: Token<DoubleLogicOp> }

export enum DoubleArithOp {
  Add,
  Sub,
  Mul,
  Div,
  Rem,
  Null,
}

export enum DoubleLogicOp {
  And,
  Or,
  Xor,
  Eq,
  NotEq,
  GreaterThanOrEqualTo,
  LessThanOrEqualTo,
  GreaterThan,
  LessThan,
}

export type SingleOp = { type: 'logic'; op: Token<SingleLogicOp> }

export enum SingleLogicOp {
  Not,
}

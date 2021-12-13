import { CodeLoc, CodeSection, Token } from './parsed'

// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ Statements ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ //

export type AST = Program

export type Program = Block

export type Block = Token<Statement>[]

export type ChainedStatement = { op: Token<StatementChainOp>; chainedStatement: Token<Statement> }

export type StatementChainOp = 'Then'

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
      propAccesses: Token<PropertyAccess>[]
      prefixOp: Token<DoubleOp> | null
      listPush: Token<void> | null
      expr: Token<Expr>
    }
  | {
      type: 'ifBlock'
      cond: Token<CondOrTypeAssertion>
      then: Block
      elif: ElIfBlock[]
      els: Block | null
    }
  | { type: 'forLoop'; loopVar: Token<string>; subject: Token<ForLoopSubject>; body: Block }
  | { type: 'forLoopDuo'; keyVar: Token<string>; valueVar: Token<string>; subject: Token<Expr>; body: Block }
  | { type: 'whileLoop'; cond: Token<CondOrTypeAssertion>; body: Block }
  | { type: 'continue' }
  | { type: 'break' }
  | { type: 'typeAlias'; typename: Token<string>; content: Token<ValueType> }
  | { type: 'enumDecl'; typename: Token<string>; variants: Token<string>[] }
  | {
      type: 'match'
      subject: Token<Expr>
      arms: Token<{ variant: Token<string>; matchWith: Token<Block> }[]>
    }
  | { type: 'fnDecl'; name: Token<string>; fnType: FnType; body: Token<Block> }
  | {
      type: 'methodDecl'
      name: Token<string>
      forType: Token<ValueType>
      fnType: FnType
      body: Token<Block>
    }
  | { type: 'return'; expr: Token<Expr> | null }
  | { type: 'panic'; message: Token<Expr> }
  | { type: 'fnCall'; content: FnCall }
  | { type: 'cmdCall'; content: CmdCall }
  | { type: 'cmdDecl'; name: Token<string>; body: CmdDeclSubCommand }
  | { type: 'fileInclusion'; content: Program }

export type ElIfBlock = { cond: Token<CondOrTypeAssertion>; body: Block }

export type ForLoopSubject = { type: 'expr'; expr: Token<Expr> } | { type: 'range'; from: Token<Expr>; to: Token<Expr> }

// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ Types ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ //

export type ValueType =
  | PrimitiveValueType
  | { type: 'list'; itemsType: ValueType }
  | { type: 'map'; itemsType: ValueType }
  | { type: 'struct'; members: StructTypeMember[] }
  | { type: 'enum'; variants: Token<string>[] }
  | { type: 'fn'; fnType: FnType }
  | { type: 'aliasRef'; typeAliasName: Token<string> }
  | { type: 'nullable'; inner: ValueType }
  | { type: 'failable'; successType: Token<ValueType>; failureType: Token<ValueType> }
  | { type: 'unknown' }
  | { type: 'generic'; name: Token<string>; orig: CodeSection; fromFnCallAt: CodeLoc | null }
  | InternalTypes

export type PrimitiveValueType = { type: 'bool' } | { type: 'number' } | { type: 'string' } | { type: 'path' }

export type InternalTypes = { type: 'void' }

export type StructTypeMember = { name: string; type: ValueType }

export type ResolvedValueType = Exclude<ValueType, { type: 'aliasRef' }>

// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ Expressions ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ //

export type Expr = { from: Token<ExprElement>; doubleOps: Token<ExprDoubleOp>[] }

export type ExprOrNever = { type: 'expr'; content: Token<Expr> } | Extract<Statement, { type: 'return' | 'panic' }>

export type CondOrTypeAssertion =
  | { type: 'expr'; inner: Token<Expr> }
  | { type: 'directAssertion'; varname: Token<string>; assertion: AssertionContent }
  | { type: 'aliasedAssertion'; subject: Token<Expr>; alias: Token<string>; assertion: AssertionContent }

export type TypeAssertionAgainst =
  | { against: 'null' }
  | { against: 'ok' }
  | { against: 'err' }
  | { against: 'custom'; type: Token<ValueType> }

export type AssertionContent = { inverted: boolean; minimum: Token<TypeAssertionAgainst> }

export type ExprElement = { content: Token<ExprElementContent>; chainings: Token<ValueChaining>[] }

export type ExprElementContent =
  | { type: 'value'; content: Token<Value> }
  | { type: 'paren'; inner: Token<Expr> }
  | {
      type: 'ternary'
      cond: Token<CondOrTypeAssertion>
      then: Token<ExprOrNever>
      elif: ElIfExpr[]
      els: Token<ExprOrNever>
    }
  | { type: 'singleOp'; op: Token<SingleOp>; right: Token<ExprElementContent> }
  // Internal type
  | { type: 'synth'; inner: Token<Expr> }

export type ElIfExpr = { cond: Token<CondOrTypeAssertion>; expr: Token<ExprOrNever> }

export type ValueChaining =
  | { type: 'propertyAccess'; nullable: boolean; access: PropertyAccess }
  | { type: 'method'; nullable: boolean; call: FnCall }

export type PropertyAccess =
  | { type: 'refIndex'; index: Token<Expr> }
  | { type: 'refStructMember'; member: Token<string> }

export type ExprDoubleOp = { op: Token<DoubleOp>; right: Token<ExprElement> }

export type DoubleOp =
  | { type: 'arith'; op: Token<DoubleArithOp> }
  | { type: 'logic'; op: Token<DoubleLogicOp> }
  | { type: 'comparison'; op: Token<DoubleComparisonOp> }

export type DoubleArithOp = 'Add' | 'Sub' | 'Mul' | 'Div' | 'Rem' | 'Null'

export type DoubleLogicOp = 'And' | 'Or' | 'Xor'

export type DoubleComparisonOp =
  | 'Eq'
  | 'NotEq'
  | 'GreaterThanOrEqualTo'
  | 'LessThanOrEqualTo'
  | 'GreaterThan'
  | 'LessThan'

export type SingleOp = { type: 'logic'; op: Token<SingleLogicOp> }

export type SingleLogicOp = 'Not'

// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ Values ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ //

export type Value =
  | LiteralValue
  | { type: 'computedString'; segments: Token<ComputedStringSegment>[] }
  | { type: 'computedPath'; segments: Token<ComputedPathSegment>[] }
  | { type: 'list'; items: Token<Expr>[] }
  | { type: 'map'; entries: { key: Token<string>; value: Token<Expr> }[] }
  | { type: 'struct'; members: { name: Token<string>; value: Token<Expr> }[] }
  | { type: 'enumVariant'; enumName: Token<string> | null; variant: Token<string> }
  | { type: 'match'; subject: Token<Expr>; arms: Token<{ variant: Token<string>; matchWith: Token<Expr> }[]> }
  // | { type: 'closure'; fnType: FnType; body: Token<Block> }
  | { type: 'callback'; args: Token<ClosureCallArg>[]; restArg: Token<string> | null; body: Token<ClosureBody> }
  | { type: 'fnCall'; content: FnCall }
  | { type: 'inlineCmdCall'; content: InlineCmdCall }
  | { type: 'reference'; varname: Token<string> }

export type LiteralValue =
  | { type: 'null' }
  | { type: 'bool'; value: Token<boolean> }
  | { type: 'number'; value: Token<number> }
  | { type: 'string'; value: Token<string> }
  | { type: 'path'; segments: Token<Token<string>[]> }

export type ComputedStringSegment =
  | { type: 'literal'; content: Token<string> }
  | { type: 'expr'; expr: Token<Expr> }
  | { type: 'inlineCmdCall'; content: InlineCmdCall }

export type ComputedPathSegment =
  | { type: 'separator' }
  | { type: 'literal'; content: Token<string> }
  | { type: 'expr'; expr: Token<Expr> }

export type FnCall = {
  at: CodeSection
  name: Token<string>
  generics: Token<Token<ValueType | null>[]> | null
  args: Token<FnCallArg>[]
}

export type FnCallArg = ({ type: 'flag' } & CmdFlag) | { type: 'expr'; expr: Token<Expr> }

export type ClosureCallArg = ({ type: 'flag' } & CmdFlag) | { type: 'variable'; name: Token<string> }

export type ClosureBody = { type: 'expr'; body: Token<Expr> } | { type: 'block'; body: Token<Block> }

export type InlineCmdCall = {
  content: Token<CmdCall>
  capture: Token<InlineCmdCallCapture>
}

export type InlineCmdCallCapture = 'Stdout' | 'Stderr' | 'Both'

// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ Functions ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ //

export type FnType = {
  generics: Token<string>[]
  args: Token<FnDeclArg>[]
  restArg: Token<string> | null
  returnType: Token<ValueType> | null
  method: { forType: Token<ValueType>; selfArg: Token<string> } | null
}

export type FnDeclArg = {
  flag: Token<string> | null
  name: Token<string>
  optional: boolean
  type: Token<ValueType>
  defaultValue: Token<LiteralValue> | null
}

// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ Commands ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ //

export type CmdCall = {
  base: Token<SingleCmdCall>
  chain: ChainedSingleCmdCall[]
}

export type SingleCmdCall = {
  base: Token<CmdCallSub>
  pipes: Token<CmdCallSub>[]
  redir: Token<CmdRedir> | null
}

export type ChainedSingleCmdCall = { op: ChainedCmdCallOp; call: Token<SingleCmdCall> }

export type ChainedCmdCallOp = 'And' | 'Or'

export type CmdCallSub = { unaliased: boolean; name: Token<string>; args: Token<CmdArg>[] }

export type CmdFlag = { prefixSym: Token<'--' | '-'>; name: Token<string>; directValue: Token<Expr> | null }

export type CmdArg =
  // NOTE: flags may have a non-direct value, e.g. `--arg value` will be parsed as a long 'arg' flag without direct value,
  // followed by a 'value' expr
  | ({ type: 'flag' } & CmdFlag)
  // | { type: 'reference'; varname: Token<string> }
  | { type: 'action'; name: Token<string> }
  | { type: 'expr'; expr: Token<Expr> }
  | { type: 'fnCall'; content: Token<FnCall> }
  | { type: 'value'; value: Token<Value> }
  | { type: 'rest'; varname: Token<string> }

export type CmdRedir = { op: Token<CmdRedirOp>; path: Token<Token<string>[]> }

export type CmdRedirOp =
  | 'Input'
  | 'Stdout'
  | 'AppendStdout'
  | 'Stderr'
  | 'AppendStderr'
  | 'StdoutStderr'
  | 'AppendStdoutStderr'

// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ Command declarations ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ //

export type CmdDeclSubCommand = {
  base: Token<CmdVariantContent> | null
  variants: Token<CmdVariant>[]
}

export type CmdVariant = { argCandidates: Token<string>[] } & CmdVariantContent

export type CmdVariantContent = {
  description: Token<string> | null
  signature: CmdVariantSignature
}

export type CmdVariantSignature =
  | { type: 'direct'; args: Token<FnDeclArg>[]; rest: Token<string> | null }
  | { type: 'subCmd'; content: CmdDeclSubCommand }

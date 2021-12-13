import { StrView } from './strview'

export type SourceFilesServerAgent = (path: string) => string | false
export type SourceFilesServerPathResolver = (path: string, relativeTo: string) => string

export class SourceFilesServer {
  private filesCache = new Map<string, StrView>()
  private entrypointContent: StrView

  constructor(
    private readonly agent: SourceFilesServerAgent,
    private readonly pathResolver: SourceFilesServerPathResolver,
    public readonly entrypointPath: string,
    entrypointContent: string
  ) {
    this.entrypointContent = StrView.create(entrypointContent)
  }

  entrypoint(): StrView {
    return this.entrypointContent
  }

  read(file: string): StrView | false {
    const cached = this.filesCache.get(file)
    if (cached !== undefined) return cached

    const content = this.agent(file)
    if (content === false) return false

    const strView = StrView.create(content)
    this.filesCache.set(file, strView)

    return strView
  }

  resolvePath(file: string, relativeTo: string): string {
    return this.pathResolver(file, relativeTo)
  }
}

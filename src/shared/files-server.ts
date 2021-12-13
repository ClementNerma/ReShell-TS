import { StrView } from './strview'

export type SourceFilesServerAgent = (filename: string, relativeTo: string | null) => string | false

export class SourceFilesServer {
  private filesCache = new Map<string, StrView>()
  private entrypointContent: StrView

  constructor(
    private readonly agent: SourceFilesServerAgent,
    public readonly entrypointFilename: string,
    entrypointContent: string
  ) {
    this.entrypointContent = StrView.create(entrypointContent)
  }

  entrypoint(): StrView {
    return this.entrypointContent
  }

  read(file: string, relativeTo: string | null): StrView | false {
    const cached = this.filesCache.get(file)
    if (cached !== undefined) return cached

    const content = this.agent(file, relativeTo)
    if (content === false) return false

    const strView = StrView.create(content)
    this.filesCache.set(file, strView)

    return strView
  }
}

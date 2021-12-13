// TODO: <little optimization> store length in class so when a comparison is done, if pattern < length fail immediatly

export class StrView {
  private readonly isLastSegment: boolean
  private readonly firstSegment: number
  private readonly firstSegmentOffset: number
  private readonly firstSegmentRem: number
  // private readonly lastSegmentLen: number
  // public readonly length: number

  private constructor(
    private readonly segments: string[],
    private readonly offsetInside = 0,
    private readonly segmentSize = 1024
  ) {
    this.firstSegment = Math.floor(offsetInside / this.segmentSize)
    this.isLastSegment = this.firstSegment === this.segments.length - 1
    this.firstSegmentOffset = offsetInside % this.segmentSize
    this.firstSegmentRem = this.isLastSegment
      ? this.segments[this.firstSegment].length - this.firstSegmentOffset
      : this.segmentSize - this.firstSegmentOffset
    // this.lastSegmentLen = this.segments[this.segments.length - 1].length
  }

  public firstChar(): string {
    return this.segments[this.firstSegment].charAt(this.firstSegmentOffset)
  }

  private start(): string {
    return this.segments[this.firstSegment].substr(this.firstSegmentOffset)
  }

  // TODO: rename
  public littleView(): string {
    return this.isLastSegment
      ? this.segments[this.firstSegment].substr(this.firstSegmentOffset)
      : this.segments[this.firstSegment].substr(this.firstSegmentOffset) + this.segments[this.firstSegment + 1]
  }

  public empty(): boolean {
    return this.isLastSegment && this.firstSegmentOffset === this.segments[this.firstSegment].length
  }

  public startsWith(pattern: string): boolean {
    if (pattern.length <= this.firstSegmentRem) {
      return this.start().startsWith(pattern)
    }

    const additionalSegments = Math.round(pattern.length - this.firstSegmentRem)
    const subject =
      this.start() + this.segments.slice(this.firstSegment + 1, this.firstSegment + 1 + additionalSegments).join('')

    return subject.startsWith(pattern)
  }

  public startsWithChar(char: string): boolean {
    if (char.length !== 1) throw new Error('Input is not exactly 1 character long')
    return this.firstChar() === char
  }

  public matchFirstChar(regex: RegExp): RegExpMatchArray | null {
    return this.firstChar().match(regex)
  }

  public matchShort(regex: RegExp): RegExpMatchArray | null {
    if (this.isLastSegment) {
      return this.start().match(regex)
    }

    const beg = this.start() + this.segments[this.firstSegment + 1]

    const match = beg.match(regex)
    if (match === null) return null
    if (match.length === 0) return match

    let lastMatch: RegExpMatchArray = match
    let matchOn = beg
    let segment = this.firstSegmentRem + 1

    while (++segment < this.segments.length) {
      matchOn += this.segments[++segment]

      const match = matchOn.match(regex)
      if (!match) return lastMatch
      if (match.length === lastMatch.length) return match

      lastMatch = match
    }

    return match
  }

  public offset(addOffset: number) {
    return new StrView(this.segments, this.offsetInside + addOffset, this.segmentSize)
  }

  public toFullStringSlow(): string {
    return this.isLastSegment ? this.start() : this.start() + this.segments.slice(this.firstSegment + 1).join('')
  }

  public withSlowMapper(mapper: (input: string) => string) {
    return StrView.create(mapper(this.toFullStringSlow()), this.offsetInside, this.segmentSize)
  }

  // TODO: function to match longer regexps at once

  static create(input: string, offset = 0, segmentSize = 128) {
    if (offset && offset >= input.length) {
      throw new Error('String view cannot start past input length')
    }

    const segments = new Array(Math.floor(input.length / segmentSize))
      .fill(0)
      .map((_, i) => input.substr(i * segmentSize, segmentSize))

    const rem = input.length % segmentSize

    if (rem > 0) {
      segments.push(input.substr(input.length - rem, rem))
    }

    return new StrView(segments, offset, segmentSize)
  }
}

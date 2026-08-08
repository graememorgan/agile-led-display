export class Reloader<ValueT, TokenT> {
  private lastValue: ValueT | undefined = undefined;
  private lastToken: TokenT | undefined = undefined;
  private sequenceNumber: number = 0;

  constructor(
    private readonly valueSupplier: (t: TokenT, cancelled: () => boolean) => ValueT,
    private readonly tokenSupplier: () => TokenT,
    private readonly tokenComparator: (a: TokenT, b: TokenT) => boolean,
  ) {}

  public get(): ValueT {
    const token = this.tokenSupplier();
    if (this.lastToken === undefined || !this.tokenComparator(this.lastToken, token)) {
      const current = ++this.sequenceNumber;
      this.lastValue = this.valueSupplier(token, () => this.sequenceNumber != current);
      this.lastToken = token;
    }
    return this.lastValue!;
  }
}

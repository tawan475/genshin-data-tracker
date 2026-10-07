/**
 * Byte-level building blocks of the binary storage formats (sections v2,
 * snapshot meta, the artifact catalog): unsigned LEB128 varints, zigzag for
 * signed values, length-prefixed UTF-8. Varints are built with arithmetic, not
 * 32-bit bit operations, so every safe integer (up to 2^53) round-trips.
 */

const encoder = new TextEncoder()
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })

/** Thrown when stored bytes end early or hold something the reader cannot parse. */
export class CorruptDataError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CorruptDataError'
  }
}

export class ByteWriter {
  private buffer = new Uint8Array(256)
  private length = 0

  private reserve(count: number): void {
    if (this.length + count <= this.buffer.length) return
    let size = this.buffer.length * 2
    while (size < this.length + count) size *= 2
    const next = new Uint8Array(size)
    next.set(this.buffer.subarray(0, this.length))
    this.buffer = next
  }

  byte(value: number): this {
    this.reserve(1)
    this.buffer[this.length++] = value & 0xff
    return this
  }

  bytes(value: Uint8Array): this {
    this.reserve(value.length)
    this.buffer.set(value, this.length)
    this.length += value.length
    return this
  }

  /** A non-negative safe integer. */
  uint(value: number): this {
    if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`Not a uint: ${value}`)
    let rest = value
    while (rest >= 0x80) {
      this.byte((rest % 0x80) | 0x80)
      rest = Math.floor(rest / 0x80)
    }
    return this.byte(rest)
  }

  /** Any safe integer, zigzag-mapped: 0, -1, 1, -2… become 0, 1, 2, 3… */
  int(value: number): this {
    return this.uint(zigzag(value))
  }

  /** UTF-8, prefixed with its byte length. */
  string(value: string): this {
    const bytes = encoder.encode(value)
    return this.uint(bytes.length).bytes(bytes)
  }

  finish(): Uint8Array {
    return this.buffer.slice(0, this.length)
  }
}

export class ByteReader {
  private position = 0

  constructor(private readonly data: Uint8Array) {}

  /** Bytes read so far. */
  get offset(): number {
    return this.position
  }

  get done(): boolean {
    return this.position >= this.data.length
  }

  /** Bytes left to read. */
  get remaining(): number {
    return this.data.length - this.position
  }

  byte(): number {
    if (this.position >= this.data.length) throw new CorruptDataError('Unexpected end of data')
    return this.data[this.position++]!
  }

  bytes(count: number): Uint8Array {
    if (count < 0 || this.position + count > this.data.length) {
      throw new CorruptDataError('Unexpected end of data')
    }
    const out = this.data.subarray(this.position, this.position + count)
    this.position += count
    return out
  }

  uint(): number {
    let value = 0
    let scale = 1
    for (;;) {
      const byte = this.byte()
      value += (byte & 0x7f) * scale
      if (byte < 0x80) break
      scale *= 0x80
      if (scale > 2 ** 49) throw new CorruptDataError('Varint too long')
    }
    if (!Number.isSafeInteger(value)) throw new CorruptDataError('Varint out of range')
    return value
  }

  int(): number {
    return unzigzag(this.uint())
  }

  string(): string {
    const length = this.uint()
    try {
      return decoder.decode(this.bytes(length))
    } catch (error) {
      if (error instanceof CorruptDataError) throw error
      throw new CorruptDataError('Invalid UTF-8')
    }
  }

  /** The bytes not read yet. */
  rest(): Uint8Array {
    const out = this.data.subarray(this.position)
    this.position = this.data.length
    return out
  }

  /** For formats that must be read to their last byte. */
  end(): void {
    if (!this.done) throw new CorruptDataError('Trailing bytes')
  }
}

export function zigzag(value: number): number {
  if (!Number.isSafeInteger(value)) throw new RangeError(`Not a safe integer: ${value}`)
  return value >= 0 ? value * 2 : -value * 2 - 1
}

export function unzigzag(value: number): number {
  return value % 2 === 0 ? value / 2 : -(value + 1) / 2
}

/** Byte-wise equality. */
export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || !/^[0-9a-f]*$/.test(hex)) throw new RangeError(`Not hex: ${hex}`)
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

export function bytesToHex(bytes: Uint8Array): string {
  let hex = ''
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0')
  return hex
}

/**
 * Raw DEFLATE through the platform's Compression Streams, which Workers and
 * every current browser implement natively. The server compresses once on
 * import; the browser inflates stored bytes as-is during export.
 */

export async function deflateRaw(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

export async function inflateRaw(bytes: Uint8Array): Promise<string> {
  const stream = new Blob([bytes as Uint8Array<ArrayBuffer>])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'))
  return new Response(stream).text()
}

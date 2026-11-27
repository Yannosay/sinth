/** Encodes playground code into a URL hash (deflate + base64url), so links work without a server. */

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): Uint8Array {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(binary, c => c.charCodeAt(0))
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(out).arrayBuffer())
}

export async function encodeCode(code: string): Promise<string> {
  const bytes = new TextEncoder().encode(code)
  if (typeof CompressionStream === 'undefined') return 'r' + toBase64Url(bytes)
  return 'z' + toBase64Url(await pipe(bytes, new CompressionStream('deflate-raw')))
}

export async function decodeCode(value: string): Promise<string | null> {
  try {
    const bytes = fromBase64Url(value.slice(1))
    if (value.startsWith('r')) return new TextDecoder().decode(bytes)
    if (value.startsWith('z')) return new TextDecoder().decode(await pipe(bytes, new DecompressionStream('deflate-raw')))
  } catch {
    return null
  }
  return null
}

/** Reads `#code=...` from a location hash. */
export async function codeFromHash(hash: string): Promise<string | null> {
  const match = /(?:^#|&)code=([^&]+)/.exec(hash)
  return match?.[1] ? decodeCode(match[1]) : null
}

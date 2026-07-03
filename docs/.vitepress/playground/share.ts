// Decoder for the `#code=<base64url>` payload that a "Open in playground" link
// carries (encoded at build time by plugins/compile-helix.mjs::encodeShare).
// base64url of the UTF-8 bytes, so it survives in a URL hash without escaping.
export function decodeShare(hash: string): string | null {
  const m = /[#&]code=([^&]+)/.exec(hash);
  if (!m) return null;
  try {
    const b64 = m[1].replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

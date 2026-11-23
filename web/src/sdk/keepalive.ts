export function fitsKeepalive(body: string) {
  return new TextEncoder().encode(body).byteLength <= 60 * 1024
}

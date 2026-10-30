import dns from 'node:dns/promises'
import { BlockList, isIP } from 'node:net'

const deniedV4 = new BlockList()
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  deniedV4.addSubnet(address, prefix, 'ipv4')

const globalV6 = new BlockList()
globalV6.addSubnet('2000::', 3, 'ipv6')
const deniedV6 = new BlockList()
for (const [address, prefix] of [
  ['2001::', 23], // Special-purpose assignments, including Teredo and benchmarking.
  ['2001:db8::', 32],
  ['2002::', 16], // 6to4 embeds an IPv4 destination.
  ['3ffe::', 16], // Retired 6bone allocation.
  ['3fff::', 20],
] as const)
  deniedV6.addSubnet(address, prefix, 'ipv6')

function publicAddress(address: string) {
  if (isIP(address) === 4) return !deniedV4.check(address, 'ipv4')
  return isIP(address) === 6 && globalV6.check(address, 'ipv6') && !deniedV6.check(address, 'ipv6')
}

/** Fail closed before sending any URL to Exa; remote redirects/rebinding remain provider-owned. */
export async function checkPublicUrls(urls: string[], signal: AbortSignal) {
  for (const value of urls) {
    signal.throwIfAborted()
    const url = new URL(value)
    const host = url.hostname
    if (
      !/^https?:\/\//i.test(value) ||
      !['http:', 'https:'].includes(url.protocol) ||
      value.includes('\\') ||
      url.username ||
      url.password ||
      value.split('/')[2]?.includes('@') ||
      url.href.includes('#') ||
      url.port ||
      isIP(host.replace(/^\[|\]$/g, '')) ||
      !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(
        host,
      ) ||
      /\.(?:localhost|local|localdomain|internal|lan|home|test|invalid|onion|arpa|alt|example|corp)$/.test(
        host,
      )
    )
      throw new Error('Expected a public HTTP(S) URL')

    // lookup has no AbortSignal option. Bound our wait without leaving an abort listener behind.
    const aborted = Promise.withResolvers<never>()
    const onAbort = () => aborted.reject(signal.reason)
    signal.addEventListener('abort', onAbort, { once: true })
    if (signal.aborted) onAbort()
    try {
      const answers = await Promise.race([dns.lookup(host, { all: true }), aborted.promise])
      signal.throwIfAborted()
      if (!answers.length || !answers.every(({ address }) => publicAddress(address))) {
        throw new Error('Expected public DNS answers only')
      }
    } finally {
      signal.removeEventListener('abort', onAbort)
    }
  }
}

const prefix = 'ultimate.markdown-viewer.'

export function readPreference(key: string) {
  try {
    return localStorage.getItem(prefix + key)
  } catch {
    // The reader also works in browsers that block local storage.
    return null
  }
}

export function writePreference(key: string, value: string) {
  try {
    localStorage.setItem(prefix + key, value)
  } catch {
    // A storage error must not prevent reading the file.
  }
}

/** Identify the chosen version of a file without storing its name, metadata, path or text. */
export async function fileKey(file: File, text: string) {
  try {
    const salt = readPreference('salt') ?? crypto.randomUUID()
    writePreference('salt', salt)
    const bytes = new TextEncoder().encode(
      JSON.stringify([salt, file.name, file.lastModified, text]),
    )
    return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)).toHex()
  } catch {
    // Without secure browser crypto there is no persistent file identity.
    return undefined
  }
}

export type Position = { block: number; fraction: number; end: boolean }

type SavedPosition = Position & { key: string }

function positions(): SavedPosition[] {
  try {
    const value: unknown = JSON.parse(readPreference('positions') ?? '[]')
    return Array.isArray(value) ? (value as SavedPosition[]) : []
  } catch {
    // Ignore unavailable or invalid preferences.
    return []
  }
}

export function readPosition(key: string) {
  return positions().find((position) => position?.key === key)
}

export function writePosition(key: string, position: Position) {
  writePreference(
    'positions',
    JSON.stringify([
      { key, ...position },
      ...positions()
        .filter((item) => item?.key !== key)
        .slice(0, 31),
    ]),
  )
}

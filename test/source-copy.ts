import { constants } from 'node:fs'
import { cp, mkdir, readdir, readFile, symlink, writeFile } from 'node:fs/promises'
import { join, relative, resolve, sep } from 'node:path'

export async function linkDependencies(root: string) {
  const target = join(root, 'node_modules')
  await mkdir(target)
  for (const name of await readdir(resolve('node_modules'))) {
    if (name.startsWith('.vite')) continue
    await symlink(resolve('node_modules', name), join(target, name))
  }
}

/** Copy this checkout without Git into the empty folder `root`, linking its installed packages, for a server to run from. */
export async function copySource(root: string) {
  const source = resolve('.')
  await cp(source, root, {
    recursive: true,
    // Clone where supported; dependencies are linked below, and build and cache output is never source.
    mode: constants.COPYFILE_FICLONE,
    filter: (path) =>
      !relative(source, path)
        .split(sep)
        .some(
          (part) =>
            part === '.git' ||
            part === 'node_modules' ||
            part === 'dist' ||
            part.startsWith('.vite'),
        ),
  })
  await linkDependencies(root)
  const config = join(root, 'vite.config.ts')
  // Optimize on page requests, not fixture boot.
  // This config is immutable after boot: ignore stale native events replayed from the initial copy.
  const replace = (text: string, from: string, to: string) => {
    if (!text.includes(from)) throw new Error(`vite.config.ts no longer contains ${from}`)
    return text.replace(from, to)
  }
  await writeFile(
    config,
    replace(
      await readFile(config, 'utf8'),
      'export default defineConfig({',
      "export default defineConfig({ cacheDir: '.vite-cache', optimizeDeps: { entries: [] }, server: { watch: { ignored: [(file) => file === fileURLToPath(import.meta.url)] } },",
    ),
  )
}

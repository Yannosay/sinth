/**
 * The agent skill from the repository's skills/ folder, bundled as Nitro server assets (see
 * nitro.serverAssets in nuxt.config.ts) and served under /skills/ and /agents.md.
 */

const SKILL = 'sinth'
const SAFE_PATH = /^[a-z0-9-]+(\/[a-z0-9-]+)*\.(md|json)$/i

function storage() {
  return useStorage('assets:skills')
}

/** Every file of the skill, as paths relative to its folder (e.g. "references/language.md"). */
export async function skillFiles(): Promise<string[]> {
  const keys = await storage().getKeys(SKILL)
  return keys
    .map(k => k.split(':').slice(1).join('/'))
    .filter(p => SAFE_PATH.test(p))
    .sort((a, b) => (a === 'SKILL.md' ? -1 : b === 'SKILL.md' ? 1 : a.localeCompare(b)))
}

export async function readSkillAsset(path: string): Promise<string | null> {
  if (!SAFE_PATH.test(path) || path.includes('..')) return null
  const raw = await storage().getItem<string | Uint8Array>(path.split('/').join(':'))
  if (raw === null || raw === undefined) return null
  return typeof raw === 'string' ? raw : new TextDecoder().decode(raw)
}

export function markdown(event: Parameters<typeof setHeader>[0], body: string): string {
  setHeader(event, 'Content-Type', 'text/markdown; charset=utf-8')
  return body
}

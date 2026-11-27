import { skillFiles } from '../../../utils/skills'

/** The files of the Sinth skill, for agents installing it from /agents.md. */
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const site = String(config.public.siteUrl).replace(/\/+$/, '')
  const files = await skillFiles()
  setHeader(event, 'Content-Type', 'application/json; charset=utf-8')
  return {
    name: 'sinth',
    version: String(config.public.sinthVersion),
    description: 'Build, check and deploy websites written in Sinth.',
    install: `${site}/agents.md`,
    files: files.map(path => ({ path, url: `${site}/skills/sinth/${path}` }))
  }
})

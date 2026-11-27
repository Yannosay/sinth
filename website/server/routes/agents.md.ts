import { markdown, readSkillAsset } from '../utils/skills'

/** Instructions an AI agent follows to install the Sinth skill (see the copyable prompt on the site). */
export default defineEventHandler(async (event) => {
  const body = await readSkillAsset('agents.md')
  if (!body) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  return markdown(event, body)
})

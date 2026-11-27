import { markdown, readSkillAsset } from '../../../utils/skills'

export default defineEventHandler(async (event) => {
  const path = getRouterParam(event, 'path') ?? ''
  const body = await readSkillAsset('sinth/' + path)
  if (!body) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  return markdown(event, body)
})

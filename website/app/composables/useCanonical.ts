import { computed, toValue, type MaybeRefOrGetter } from 'vue'

export function useCanonical(path: MaybeRefOrGetter<string>): void {
  const config = useRuntimeConfig()
  const siteUrl = String(config.public.siteUrl).replace(/\/+$/, '')

  const href = computed(() => {
    const value = toValue(path)
    const normalized = value.startsWith('/') ? value : `/${value}`
    return `${siteUrl}${normalized}`
  })

  useHead({
    link: [
      { rel: 'canonical', href }
    ]
  })
}
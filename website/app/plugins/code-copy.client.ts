export default defineNuxtPlugin(() => {
  if (typeof document === 'undefined') return

  const RESET_DELAY_MS = 2000
  const DEFAULT_LABEL = 'Copy'
  const COPIED_LABEL = 'Copied'
  const FAILED_LABEL = 'Failed'

  document.addEventListener('click', async (event) => {
    const target = event.target
    if (!(target instanceof Element)) return

    const button = target.closest('[data-copy-code]')
    if (!(button instanceof HTMLButtonElement)) return

    const wrapper = button.closest('[data-code-block]')
    if (!wrapper) return

    const codeElement = wrapper.querySelector('code')
    if (!codeElement) return

    const text = codeElement.textContent ?? ''

    try {
      await navigator.clipboard.writeText(text)
      button.dataset.state = 'copied'
      button.textContent = COPIED_LABEL
    } catch {
      button.dataset.state = 'failed'
      button.textContent = FAILED_LABEL
    }

    button.disabled = true
    window.setTimeout(() => {
      button.disabled = false
      delete button.dataset.state
      button.textContent = DEFAULT_LABEL
    }, RESET_DELAY_MS)
  })
})
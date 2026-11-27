import { encodeCode } from '~/playground/share'

/**
 * "Try it" buttons on `sinth live` code blocks in the docs open an embedded playground below the
 * example, loaded on demand so pages stay light.
 */
export default defineNuxtPlugin(() => {
  document.addEventListener('click', async (event) => {
    const button = (event.target as Element | null)?.closest?.('[data-run-code]')
    if (!(button instanceof HTMLButtonElement)) return
    const block = button.closest('[data-code-block]')
    if (!block) return

    const existing = block.nextElementSibling
    if (existing?.classList.contains('live-embed')) {
      existing.remove()
      button.textContent = 'Try it'
      return
    }

    const code = block.querySelector('code')?.textContent ?? ''
    const frame = document.createElement('iframe')
    frame.className = 'live-embed'
    frame.title = 'Interactive example'
    frame.loading = 'lazy'
    frame.src = `/embed#code=${await encodeCode(code)}`
    block.after(frame)
    button.textContent = 'Close'
  })
})

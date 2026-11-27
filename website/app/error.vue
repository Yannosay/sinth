<template>
  <div class="error-page">
    <div class="error-page__content">
      <div class="prose error-page__code">
        <div class="code-block" data-code-block>
          <pre><code class="hljs language-sinth" v-html="codeHtml" /></pre>
          <button
            type="button"
            class="code-block__copy"
            data-copy-code
            aria-label="Copy code"
          >copy</button>
        </div>
      </div>

      <div class="error-page__actions">
        <UiButton variant="ghost" @click="goBack">Go Back</UiButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import UiButton from '~/components/ui/Button.vue'

const props = defineProps<{
  error: {
    statusCode?: number
    statusMessage?: string
    message?: string
  } | null
}>()

const statusCode = computed<number>(() => {
  const raw = props.error?.statusCode
  const numeric = Number(raw)
  if (!Number.isFinite(numeric) || numeric <= 0) return 500
  return numeric
})

const displayMessage = computed<string>(() => {
  if (statusCode.value === 404) return '404 - Page not found'
  if (statusCode.value === 403) return '403 - Forbidden'
  if (statusCode.value === 500) return '500 - Something went wrong'
  return `${statusCode.value} - Something went wrong`
})

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const codeHtml = computed<string>(() => {
  const message = escapeHtml(displayMessage.value)
  return [
    '<span class="hljs-title">Heading</span> <span class="hljs-sinth-brace">{</span>',
    `  <span class="hljs-string">"${message}"</span>`,
    '<span class="hljs-sinth-brace">}</span>'
  ].join('\n')
})

function goBack(): void {
  if (typeof window === 'undefined') return
  if (window.history.length > 1) {
    window.history.back()
    return
  }
  void navigateTo('/')
}
</script>

<style lang="scss" scoped>
.error-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 2rem;
  background-color: var(--bg);
  color: var(--fg-body);
}

.error-page__content {
  width: 100%;
  max-width: 32rem;
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.error-page__code {
  font-size: 0.9rem;
}

.error-page__code :deep(.code-block) {
  margin: 0;
}

.error-page__actions {
  display: flex;
  justify-content: flex-start;
}
</style>
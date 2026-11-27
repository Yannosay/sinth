<template>
  <div class="playground" :class="{ 'playground--compact': compact }">
    <div class="playground__bar">
      <template v-if="!compact">
        <label class="playground__select">
          <span class="visually-hidden">Example</span>
          <select v-model="exampleId" @change="loadExample">
            <option value="" disabled>Examples</option>
            <option v-for="ex in EXAMPLES" :key="ex.id" :value="ex.id">{{ ex.title }}</option>
          </select>
        </label>
        <button type="button" class="playground__btn" @click="share">{{ shareLabel }}</button>
        <button type="button" class="playground__btn" @click="reset">Reset</button>
      </template>
      <span v-else class="playground__title">index.sinth</span>
      <span class="playground__status" :class="`playground__status--${status}`">{{ statusText }}</span>
      <span class="playground__spacer" />
      <span v-if="version" class="playground__version">Sinth {{ version }}</span>
      <a v-if="compact" class="playground__btn" :href="playgroundHref" target="_blank" rel="noopener">Open in playground ↗</a>
    </div>

    <div class="playground__panes">
      <section class="playground__pane playground__pane--editor" aria-label="Sinth source">
        <CodeEditor v-model="code" label="Sinth source code" />
      </section>

      <section class="playground__pane playground__pane--output" aria-label="Output">
        <div class="playground__tabs" role="tablist">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            type="button"
            role="tab"
            class="playground__tab"
            :class="{ 'playground__tab--active': activeTab === tab.id }"
            :aria-selected="activeTab === tab.id"
            @click="activeTab = tab.id"
          >
            {{ tab.label }}<span v-if="tab.id === 'console' && logs.length" class="playground__count">{{ logs.length }}</span>
          </button>
        </div>

        <div class="playground__view">
          <iframe
            v-show="activeTab === 'preview'"
            ref="frame"
            class="playground__frame"
            title="Preview"
            sandbox="allow-scripts allow-modals allow-forms"
          />
          <CodeEditor v-if="activeTab === 'html'" :model-value="output.html" language="html" readonly label="Compiled HTML" />
          <CodeEditor v-if="activeTab === 'js'" :model-value="output.js" language="javascript" readonly label="Compiled JavaScript" />
          <CodeEditor v-if="activeTab === 'css'" :model-value="output.css" language="css" readonly label="Compiled CSS" />
          <div v-if="activeTab === 'console'" class="playground__console" role="log">
            <p v-if="!logs.length" class="playground__empty">Console output appears here.</p>
            <pre v-for="(log, i) in logs" :key="i" :class="`playground__log playground__log--${log.level}`">{{ log.text }}</pre>
          </div>

          <div v-if="error" class="playground__error" role="alert">
            <pre>{{ error }}</pre>
          </div>
          <div v-else-if="warnings.length && activeTab === 'preview'" class="playground__warnings">
            <pre v-for="(w, i) in warnings" :key="i">{{ w }}</pre>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import CodeEditor from '~/components/playground/CodeEditor.vue'
import { EXAMPLES } from '~/playground/examples'
import { bodyOf, previewDocument, type PreviewMessage, type PreviewPayload } from '~/playground/preview'
import { codeFromHash, encodeCode } from '~/playground/share'
import type { CompileResponse } from '~/playground/compiler.worker'

const props = withDefaults(defineProps<{ compact?: boolean; initialCode?: string }>(), { compact: false, initialCode: '' })

const route = useRoute()
const STORAGE_KEY = 'sinth-playground:code'
const DEFAULT_CODE = EXAMPLES[0]?.code ?? ''

const tabs = [
  { id: 'preview', label: 'Preview' },
  { id: 'html', label: 'HTML' },
  { id: 'js', label: 'JS' },
  { id: 'css', label: 'CSS' },
  { id: 'console', label: 'Console' }
] as const

const code = ref(props.initialCode || DEFAULT_CODE)
const exampleId = ref('')
const activeTab = ref<(typeof tabs)[number]['id']>('preview')
const version = ref('')
const status = ref<'loading' | 'ok' | 'error'>('loading')
const error = ref('')
const warnings = ref<string[]>([])
const logs = ref<{ level: string; text: string }[]>([])
const output = ref({ html: '', js: '', css: '' })
const shareLabel = ref('Share')
const frame = ref<HTMLIFrameElement | null>(null)
const previewHtml = previewDocument()
let runs = 0
const playgroundHref = ref('/playground')

let worker: Worker | null = null
let runtime = ''
let requestId = 0
let timer: ReturnType<typeof setTimeout> | undefined
let pending: PreviewPayload | null = null

const statusText = computed(() => (status.value === 'loading' ? 'Compiling…' : status.value === 'error' ? 'Error' : 'Compiled'))

function compile(): void {
  if (!worker) return
  status.value = 'loading'
  worker.postMessage({ id: ++requestId, source: code.value })
}

function onWorkerMessage(event: MessageEvent): void {
  const data = event.data as ({ ready: true; version: string; runtime: string } | CompileResponse)
  if ('ready' in data) {
    version.value = data.version
    runtime = data.runtime
    compile()
    return
  }
  if (data.id !== requestId) return
  if (!data.ok) {
    status.value = 'error'
    error.value = data.error
    return
  }
  status.value = 'ok'
  error.value = ''
  warnings.value = data.warnings
  const entry = data.modules.find(m => m.id === data.entry)
  output.value = { html: data.html, js: entry?.js ?? '', css: data.css }
  logs.value = []
  pending = {
    type: 'run', runtime, modules: data.modules, entry: data.entry, css: data.css, body: bodyOf(data.html),
    externalScripts: data.externalScripts, externalStyles: data.externalStyles
  }
  // A changed srcdoc reloads the frame, so every run starts from a fresh document.
  if (frame.value) frame.value.srcdoc = `${previewHtml}<!-- run ${++runs} -->`
}

function onFrameMessage(event: MessageEvent): void {
  const msg = event.data as PreviewMessage
  if (!msg || msg.source !== 'sinth-preview' || event.source !== frame.value?.contentWindow) return
  if (msg.type === 'ready' && pending) {
    frame.value?.contentWindow?.postMessage(pending, '*')
  } else if (msg.type === 'console' && msg.data) {
    logs.value.push({ level: msg.data.level ?? 'log', text: msg.data.text })
  } else if (msg.type === 'error' && msg.data) {
    logs.value.push({ level: 'error', text: msg.data.text })
  }
}

function loadExample(): void {
  const ex = EXAMPLES.find(e => e.id === exampleId.value)
  if (ex) code.value = ex.code
}

function reset(): void {
  code.value = DEFAULT_CODE
  exampleId.value = ''
}

async function share(): Promise<void> {
  const url = `${location.origin}/playground#code=${await encodeCode(code.value)}`
  history.replaceState(null, '', url)
  try {
    await navigator.clipboard.writeText(url)
    shareLabel.value = 'Link copied'
  } catch {
    shareLabel.value = 'Link in address bar'
  }
  setTimeout(() => { shareLabel.value = 'Share' }, 2000)
}

watch(code, value => {
  clearTimeout(timer)
  timer = setTimeout(compile, 250)
  if (!props.compact) {
    try { localStorage.setItem(STORAGE_KEY, value) } catch { /* storage unavailable */ }
  }
  void encodeCode(value).then(encoded => { playgroundHref.value = `/playground#code=${encoded}` })
})

onMounted(async () => {
  window.addEventListener('message', onFrameMessage)
  // The router owns the URL during hydration, so read the hash from the route rather than location.
  const fromHash = await codeFromHash(route.hash || location.hash)
  if (fromHash !== null) code.value = fromHash
  else if (!props.compact && !props.initialCode) {
    try { code.value = localStorage.getItem(STORAGE_KEY) || code.value } catch { /* storage unavailable */ }
  }
  playgroundHref.value = `/playground#code=${await encodeCode(code.value)}`
  worker = new Worker(new URL('../../playground/compiler.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = onWorkerMessage
  worker.onerror = (e) => {
    status.value = 'error'
    error.value = `The compiler failed to start: ${e.message}`
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('message', onFrameMessage)
  worker?.terminate()
  clearTimeout(timer)
})
</script>

<style lang="scss" scoped>
.playground {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: #0e0e13;
  border: 1px solid var(--line);
  border-radius: 10px;
  overflow: hidden;
}

.playground__bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--line);
  background: #111117;
  font-size: 0.8rem;
  flex-wrap: wrap;
}

.playground__title {
  font-family: var(--font-mono);
  color: var(--fg-muted);
}

.playground__select select,
.playground__btn {
  font: inherit;
  color: var(--fg);
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 0.35rem 0.65rem;
  cursor: pointer;
  text-decoration: none;

  &:hover {
    border-color: var(--line-strong);
    background: rgba(255, 255, 255, 0.07);
  }

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
}

.playground__select option {
  background: #111117;
}

.playground__status {
  font-size: 0.75rem;
  color: var(--fg-muted);

  &--ok { color: #86efac; }
  &--error { color: #f87171; }
}

.playground__spacer {
  flex: 1;
}

.playground__version {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--fg-muted);
}

.playground__panes {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr;
  grid-template-rows: minmax(16rem, 1fr) minmax(16rem, 1fr);

  @media (min-width: 900px) {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
  }
}

// Embeds have a fixed height, so the stacked panes share it instead of overflowing (and clipping the preview).
.playground--compact .playground__panes {
  grid-template-rows: minmax(0, 1fr) minmax(0, 1fr);

  @media (min-width: 900px) {
    grid-template-rows: minmax(0, 1fr);
  }
}

.playground__pane {
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.playground__pane--editor {
  border-bottom: 1px solid var(--line);

  @media (min-width: 900px) {
    border-bottom: none;
    border-right: 1px solid var(--line);
  }
}

.playground__tabs {
  display: flex;
  gap: 0.25rem;
  padding: 0.35rem 0.5rem;
  border-bottom: 1px solid var(--line);
  background: #111117;
}

.playground__tab {
  font: inherit;
  font-size: 0.78rem;
  color: var(--fg-muted);
  background: none;
  border: none;
  border-radius: 5px;
  padding: 0.3rem 0.6rem;
  cursor: pointer;

  &:hover { color: var(--fg); }

  &--active {
    color: var(--fg);
    background: rgba(167, 139, 250, 0.14);
  }
}

.playground__count {
  margin-left: 0.35rem;
  font-size: 0.7rem;
  color: var(--accent);
}

.playground__view {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.playground__frame {
  flex: 1;
  width: 100%;
  border: 0;
  background: #fff;
}

.playground__console {
  flex: 1;
  overflow: auto;
  padding: 0.5rem 0.75rem;
}

.playground__empty {
  color: var(--fg-muted);
  font-size: 0.8rem;
}

.playground__log {
  margin: 0;
  padding: 0.25rem 0;
  border-bottom: 1px solid var(--line-soft);
  font: 0.78rem/1.5 var(--font-mono);
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--fg-body);

  &--warn { color: #fbbf24; }
  &--error { color: #f87171; }
}

.playground__error,
.playground__warnings {
  position: absolute;
  left: 0.5rem;
  right: 0.5rem;
  bottom: 0.5rem;
  max-height: 60%;
  overflow: auto;
  border-radius: 8px;
  padding: 0.75rem 1rem;

  pre {
    margin: 0;
    font: 0.78rem/1.55 var(--font-mono);
    white-space: pre-wrap;
    word-break: break-word;
  }
}

.playground__error {
  background: #1d1013;
  border: 1px solid #5b1d24;
  color: #fecaca;
}

.playground__warnings {
  background: #1c170c;
  border: 1px solid #5a4514;
  color: #fde68a;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
</style>

<template>
  <div ref="host" class="code-editor" />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState, Compartment } from '@codemirror/state'
import { keymap } from '@codemirror/view'
import { indentWithTab } from '@codemirror/commands'
import { javascript } from '@codemirror/lang-javascript'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { sinthLanguage } from '~/playground/sinth-mode'
import { editorTheme } from '~/playground/theme'

const props = withDefaults(defineProps<{
  modelValue: string
  language?: 'sinth' | 'javascript' | 'html' | 'css'
  readonly?: boolean
  label?: string
}>(), { language: 'sinth', readonly: false, label: 'Code editor' })

const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>()

const host = ref<HTMLDivElement | null>(null)
const languageSlot = new Compartment()
let view: EditorView | null = null

function languageExtension() {
  switch (props.language) {
    case 'javascript': return javascript()
    case 'html': return html()
    case 'css': return css()
    default: return sinthLanguage
  }
}

onMounted(() => {
  if (!host.value) return
  view = new EditorView({
    parent: host.value,
    state: EditorState.create({
      doc: props.modelValue,
      extensions: [
        basicSetup,
        keymap.of([indentWithTab]),
        EditorState.tabSize.of(2),
        languageSlot.of(languageExtension()),
        editorTheme,
        EditorState.readOnly.of(props.readonly),
        EditorView.editable.of(!props.readonly),
        EditorView.contentAttributes.of({ 'aria-label': props.label }),
        EditorView.updateListener.of(update => {
          if (update.docChanged) emit('update:modelValue', update.state.doc.toString())
        })
      ]
    })
  })
})

watch(() => props.modelValue, value => {
  if (view && value !== view.state.doc.toString()) {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } })
  }
})

watch(() => props.language, () => view?.dispatch({ effects: languageSlot.reconfigure(languageExtension()) }))

onBeforeUnmount(() => view?.destroy())
</script>

<style scoped>
.code-editor {
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.code-editor :deep(.cm-editor) {
  height: 100%;
}
</style>

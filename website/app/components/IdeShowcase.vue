<template>
  <figure class="ide" role="img" aria-label="Sinth IDE with a Sinth page open in the editor, the project explorer, a running dev server in the terminal and component completions">
    <div class="ide__window" aria-hidden="true">
      <div class="ide__titlebar">
        <span class="ide__brand">Sinth IDE</span>
        <span class="ide__title">orders — my-shop</span>
        <span class="ide__controls"><i /><i /><i /></span>
      </div>
      <div class="ide__toolbar">
        <span class="ide__project">my-shop</span>
        <span class="ide__actions">
          <span class="ide__action ide__action--running"><b class="ide__stop" />Stop</span>
          <span class="ide__action">Build</span>
          <span class="ide__action">Preview</span>
          <span class="ide__action">Check</span>
          <span class="ide__action">Deploy</span>
        </span>
        <span class="ide__url">localhost:3000</span>
      </div>
      <div class="ide__body">
        <div class="ide__activity">
          <i class="is-active" /><i /><i /><i />
        </div>
        <div class="ide__explorer">
          <div class="ide__panel-title">Explorer</div>
          <div v-for="item in tree" :key="item.name + item.depth" class="ide__node" :class="{ 'is-active': item.active, 'is-dir': item.dir }" :style="{ paddingLeft: 0.6 + item.depth * 0.75 + 'rem' }">
            <span class="ide__icon" :class="item.icon" />{{ item.name }}
          </div>
        </div>
        <div class="ide__main">
          <div class="ide__tabs">
            <span class="ide__tab is-active"><span class="ide__icon sinth" />orders.sinth</span>
            <span class="ide__tab"><span class="ide__icon sinth" />OrderRow.sinth</span>
            <span class="ide__tab"><span class="ide__icon ts" />orders.ts</span>
          </div>
          <div class="ide__editor">
            <div v-for="(line, i) in highlighted" :key="i" class="ide__line" :class="{ 'is-current': i === cursorLine }">
              <span class="ide__gutter">{{ i + 1 }}</span>
              <span class="ide__code"><span v-for="(t, j) in line" :key="j" :class="t.c">{{ t.v }}</span><span v-if="i === cursorLine" class="ide__caret" /></span>
            </div>
            <div class="ide__completion">
              <div v-for="(c, i) in completions" :key="c.name" class="ide__completion-item" :class="{ 'is-active': i === 0 }">
                <span class="ide__completion-kind">◆</span>
                <span class="ide__completion-name">{{ c.name }}</span>
                <span class="ide__completion-detail">{{ c.detail }}</span>
              </div>
            </div>
          </div>
          <div class="ide__terminal">
            <div class="ide__term-tabs">
              <span class="is-active">Run</span><span>Check</span><span>Terminal</span>
            </div>
            <pre class="ide__term"><span class="t-dim">  Sinth dev v5.3.4</span>

  <span class="t-green">➜</span>  <b>Local:</b>   <span class="t-cyan t-link">http://localhost:3000/</span>
  <span class="t-dim">ready in 184ms, 4 page(s)</span>

<span class="t-green">✓</span> <span class="t-dim">pages/orders.sinth</span> updated in 21ms</pre>
          </div>
        </div>
      </div>
      <div class="ide__status">
        <span class="ide__status-accent">Sinth 5.3.4 (project)</span>
        <span><span class="t-green">●</span> 0 problems</span>
        <span class="ide__status-right">Ln 15, Col 5 · UTF-8 · Sinth</span>
      </div>
    </div>
  </figure>
</template>

<script setup lang="ts">
const code = `import { Button, Table, toast } from "sinth:ui"
import { PUBLIC_API_URL } from "sinth:env"

title = "Orders"

var obj[] orders = []
computed num total = orders.reduce((s, o) => s + o.amount, 0)

onMount {
  orders = await (await fetch(PUBLIC_API_URL + "/orders")).json()
}

Main {
  Heading(level: 1) { "Orders: " + total + " €" }
  Ta
  Button(onClick: toast("Exported")) { "Export CSV" }
}`

const cursorLine = 14

const tree = [
  { name: 'my-shop', depth: 0, dir: true, icon: 'dir' },
  { name: 'pages', depth: 1, dir: true, icon: 'dir' },
  { name: 'index.sinth', depth: 2, icon: 'sinth' },
  { name: 'orders.sinth', depth: 2, icon: 'sinth', active: true },
  { name: 'components', depth: 1, dir: true, icon: 'dir' },
  { name: 'OrderRow.sinth', depth: 2, icon: 'sinth' },
  { name: 'functions', depth: 1, dir: true, icon: 'dir' },
  { name: 'orders.ts', depth: 2, icon: 'ts' },
  { name: 'public', depth: 1, dir: true, icon: 'dir' },
  { name: '.env', depth: 1, icon: 'file' },
  { name: 'sinth.config.json', depth: 1, icon: 'json' }
]

const completions = [
  { name: 'Table', detail: 'sinth:ui · columns, rows, sortable' },
  { name: 'Tabs', detail: 'sinth:ui · tabs, selected' },
  { name: 'Textarea', detail: 'element · <textarea>' },
  { name: 'Tooltip', detail: 'sinth:ui · text, placement' }
]

const KEYWORDS = new Set(['import', 'from', 'var', 'const', 'computed', 'onMount', 'await', 'function', 'if', 'else', 'for', 'in', 'return'])
const TYPES = new Set(['obj', 'num', 'str', 'bool'])
const COMPONENTS = new Set(['Button', 'Table', 'Ta'])

/** A small highlighter for the sample, using the IDE's token colors. */
function highlight(line: string): { c: string; v: string }[] {
  const out: { c: string; v: string }[] = []
  const re = /("[^"]*")|(\b\d+\b)|(\b[A-Za-z_]\w*\b)(\s*:)?|(\s+)|([^\sA-Za-z_"\d]+)/g
  for (const m of line.matchAll(re)) {
    const [all, str, num, word, colon, space] = m
    if (str) out.push({ c: 't-string', v: str })
    else if (num) out.push({ c: 't-number', v: num })
    else if (word) {
      let c = 't-ident'
      if (KEYWORDS.has(word)) c = 't-keyword'
      else if (TYPES.has(word)) c = 't-type'
      else if (COMPONENTS.has(word)) c = 't-component'
      else if (/^[A-Z]/.test(word)) c = 't-element'
      else if (colon) c = /^on[A-Z]/.test(word) ? 't-event' : 't-attr'
      else if (word === 'title') c = 't-attr'
      out.push({ c, v: word })
      if (colon) out.push({ c: 't-op', v: colon })
    } else if (space) out.push({ c: '', v: space })
    else out.push({ c: 't-op', v: all })
  }
  return out
}

const highlighted = code.split('\n').map(highlight)
</script>

<style lang="scss" scoped>
.ide {
  margin: 0;
  --i-bg0: #0a0a0b;
  --i-bg1: #0f0f11;
  --i-bg2: #151518;
  --i-bg3: #1c1c20;
  --i-border: #232328;
  --i-fg: #f5f5f6;
  --i-muted: #a1a1aa;
  --i-subtle: #6e6e78;
  --i-accent: #c084fc;
  --i-accent-soft: rgba(192, 132, 252, 0.13);
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
}

.ide__window {
  border: 1px solid var(--i-border);
  border-radius: 12px;
  overflow: hidden;
  background: var(--i-bg0);
  color: var(--i-fg);
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(192, 132, 252, 0.06);
  font-size: 12px;
  user-select: none;
}

.ide__titlebar {
  display: flex;
  align-items: center;
  height: 32px;
  padding: 0 0.75rem;
  background: var(--i-bg1);
  border-bottom: 1px solid var(--i-border);
}

.ide__brand {
  font-weight: 700;
  font-size: 11px;
  letter-spacing: 0.02em;
  color: var(--i-accent);
}

.ide__title {
  flex: 1;
  text-align: center;
  color: var(--i-muted);
  font-size: 11.5px;
}

.ide__controls {
  display: flex;
  gap: 0.9rem;

  i {
    width: 10px;
    height: 10px;
    border: 1.5px solid var(--i-subtle);
    border-radius: 2px;
  }
}

.ide__toolbar {
  display: flex;
  align-items: center;
  gap: 1rem;
  height: 38px;
  padding: 0 0.75rem;
  background: var(--i-bg1);
  border-bottom: 1px solid var(--i-border);
}

.ide__project {
  font-weight: 600;
  min-width: 7rem;
}

.ide__actions {
  display: flex;
  gap: 0.3rem;
  flex: 1;
  justify-content: center;
}

.ide__action {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.25rem 0.6rem;
  border-radius: 6px;
  color: var(--i-muted);
  border: 1px solid transparent;
}

.ide__action--running {
  color: var(--i-fg);
  background: var(--i-accent-soft);
  border-color: rgba(192, 132, 252, 0.35);
}

.ide__stop {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  background: var(--i-accent);
}

.ide__url {
  color: var(--i-accent);
  font-family: var(--font-mono);
  font-size: 11px;
}

.ide__body {
  display: grid;
  grid-template-columns: 40px 190px minmax(0, 1fr);
  height: 580px;

  @media (max-width: 760px) {
    grid-template-columns: 40px minmax(0, 1fr);

    .ide__explorer {
      display: none;
    }
  }
}

.ide__activity {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding-top: 0.8rem;
  background: var(--i-bg1);
  border-right: 1px solid var(--i-border);

  i {
    width: 16px;
    height: 16px;
    border-radius: 4px;
    border: 1.5px solid var(--i-subtle);

    &.is-active {
      border-color: var(--i-accent);
      background: var(--i-accent-soft);
    }
  }
}

.ide__explorer {
  background: var(--i-bg1);
  border-right: 1px solid var(--i-border);
  overflow: hidden;
}

.ide__panel-title {
  padding: 0.6rem 0.75rem 0.4rem;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--i-subtle);
}

.ide__node {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  height: 22px;
  color: var(--i-muted);
  white-space: nowrap;

  &.is-dir {
    color: var(--i-fg);
  }

  &.is-active {
    background: var(--i-accent-soft);
    color: var(--i-fg);
    box-shadow: inset 2px 0 0 var(--i-accent);
  }
}

.ide__icon {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  flex-shrink: 0;
  background: var(--i-subtle);

  &.dir { background: #a1a1aa; border-radius: 1px 3px 2px 2px; }
  &.sinth { background: var(--i-accent); }
  &.ts { background: #3b82f6; }
  &.json { background: #fbbf24; }
  &.file { background: #52525b; }
}

.ide__main {
  display: grid;
  grid-template-rows: 32px minmax(0, 1fr) 128px;
  min-width: 0;
}

.ide__tabs {
  display: flex;
  background: var(--i-bg1);
  border-bottom: 1px solid var(--i-border);
  overflow: hidden;
}

.ide__tab {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0 0.85rem;
  color: var(--i-muted);
  border-right: 1px solid var(--i-border);
  white-space: nowrap;

  &.is-active {
    background: var(--i-bg0);
    color: var(--i-fg);
    box-shadow: inset 0 -2px 0 var(--i-accent);
  }
}

.ide__editor {
  position: relative;
  padding: 0.5rem 0;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 19px;
  overflow: hidden;
}

.ide__line {
  display: flex;
  white-space: pre;

  &.is-current {
    background: var(--i-bg2);
  }
}

.ide__gutter {
  width: 2.6rem;
  padding-right: 0.9rem;
  text-align: right;
  color: #4a4a52;
  flex-shrink: 0;
}

.ide__caret {
  display: inline-block;
  width: 2px;
  height: 15px;
  margin-bottom: -3px;
  background: var(--i-accent);
  animation: ide-blink 1.1s steps(1) infinite;
}

@keyframes ide-blink {
  50% { opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .ide__caret { animation: none; }
}

.ide__completion {
  position: absolute;
  top: calc(0.5rem + 15 * 19px);
  left: calc(2.6rem + 4ch);
  width: min(23rem, calc(100% - 4rem));
  padding: 0.25rem;
  background: #1f1f24;
  border: 1px solid #303037;
  border-radius: 6px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6);
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
}

.ide__completion-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.2rem 0.45rem;
  border-radius: 4px;

  &.is-active {
    background: var(--i-accent-soft);
  }
}

.ide__completion-kind {
  color: #fbbf24;
  font-size: 9px;
}

.ide__completion-name {
  font-family: var(--font-mono);
  font-weight: 600;
}

.ide__completion-detail {
  margin-left: auto;
  color: var(--i-subtle);
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ide__terminal {
  border-top: 1px solid var(--i-border);
  background: var(--i-bg0);
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.ide__term-tabs {
  display: flex;
  gap: 1rem;
  padding: 0.35rem 0.8rem;
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--i-subtle);

  .is-active {
    color: var(--i-fg);
    box-shadow: 0 2px 0 var(--i-accent);
  }
}

.ide__term {
  margin: 0;
  padding: 0.15rem 0.8rem;
  font-family: var(--font-mono);
  font-size: 11.5px;
  line-height: 1.5;
  color: #e4e4e7;
  background: none;
  border: 0;
  overflow: hidden;
}

.ide__status {
  display: flex;
  gap: 1.25rem;
  align-items: center;
  height: 24px;
  padding: 0 0.75rem;
  background: var(--i-bg1);
  border-top: 1px solid var(--i-border);
  color: var(--i-muted);
  font-size: 11px;
}

.ide__status-accent {
  color: var(--i-accent);
}

.ide__status-right {
  margin-left: auto;
}

.t-keyword { color: #c084fc; }
.t-type { color: #67e8f9; }
.t-element { color: #93c5fd; }
.t-component { color: #fbbf24; }
.t-attr { color: #a5b4fc; }
.t-event { color: #f9a8d4; }
.t-string { color: #fcd34d; }
.t-number { color: #fdba74; }
.t-op { color: #d4d4d8; }
.t-ident { color: #f5f5f6; }
.t-dim { color: #71717a; }
.t-green { color: #22c55e; }
.t-cyan { color: #67e8f9; }
.t-link { text-decoration: underline; text-underline-offset: 2px; }
</style>

<template>
  <figure class="ide" role="img" aria-label="Sinth IDE: a Sinth page in the editor with component completions, the running page in the built-in preview, and the dev server in the terminal">
    <div class="ide__window" aria-hidden="true">
      <div class="ide__titlebar">
        <img class="ide__logo" src="/favicon.png" alt="" width="16" height="16">
        <span class="ide__project">my-shop <svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" /></svg></span>
        <span class="ide__actions">
          <span class="ide__stop"><b />Stop</span>
          <span class="ide__action">Build</span>
          <span class="ide__action">Preview</span>
          <span class="ide__action">Check</span>
          <span class="ide__action">Deploy</span>
          <span class="ide__url"><i />localhost:3000</span>
        </span>
        <span class="ide__search">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          Search my-shop
          <kbd>Ctrl+P</kbd>
        </span>
        <span class="ide__right">
          <span class="ide__toggle"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M14 4v16" /></svg></span>
          <span class="ide__win"><svg viewBox="0 0 12 12"><path d="M2 6h8" /></svg><svg viewBox="0 0 12 12"><rect x="2.5" y="2.5" width="7" height="7" rx="1" /></svg><svg viewBox="0 0 12 12"><path d="m3 3 6 6M9 3 3 9" /></svg></span>
        </span>
      </div>
      <div class="ide__body">
        <div class="ide__activity">
          <svg class="is-active" viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
          <svg viewBox="0 0 24 24"><path d="m16 18 6-6-6-6M8 6l-6 6 6 6" /></svg>
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
        </div>
        <div class="ide__explorer">
          <div class="ide__panel-title">Explorer</div>
          <div v-for="item in tree" :key="item.name + item.depth" class="ide__node" :class="{ 'is-active': item.active, 'is-dir': item.dir }" :style="{ paddingLeft: 0.7 + item.depth * 0.8 + 'rem' }">
            <span class="ide__icon" :class="item.icon" />{{ item.name }}
          </div>
        </div>
        <div class="ide__main">
          <div class="ide__split">
            <div class="ide__code-col">
              <div class="ide__tabs">
                <span class="ide__tab is-active"><span class="ide__icon sinth" />orders.sinth</span>
                <span class="ide__tab"><span class="ide__icon ts" />orders.ts</span>
              </div>
              <div class="ide__editor">
                <div v-for="(line, i) in highlighted" :key="i" class="ide__line" :class="{ 'is-current': i === cursorLine }">
                  <span class="ide__gutter">{{ i + 1 }}</span>
                  <span class="ide__code"><span v-for="(t, j) in line" :key="j" :class="t.c">{{ t.v }}</span><span v-if="i === cursorLine" class="ide__caret" /></span>
                </div>
                <div class="ide__completion">
                  <div v-for="(c, i) in completions" :key="c.name" class="ide__completion-item" :class="{ 'is-active': i === 0 }">
                    <span class="ide__completion-name">{{ c.name }}</span>
                    <span class="ide__completion-detail">{{ c.detail }}</span>
                  </div>
                </div>
              </div>
            </div>
            <div class="ide__preview">
              <div class="ide__address">
                <svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4v7h-7" /></svg>
                <span class="ide__address-field"><span>localhost:3000</span>/orders</span>
              </div>
              <div class="ide__page">
                <div class="ide__page-nav"><b>my-shop</b><span>Orders</span><span>Products</span></div>
                <div class="ide__page-body">
                  <div class="ide__page-h1">Orders: 1,284 €</div>
                  <div class="ide__page-table">
                    <div class="ide__page-row is-head"><span>Order</span><span>Customer</span><span>Total</span></div>
                    <div v-for="r in rows" :key="r[0]" class="ide__page-row"><span>{{ r[0] }}</span><span>{{ r[1] }}</span><span>{{ r[2] }}</span></div>
                  </div>
                  <span class="ide__page-btn">Export CSV</span>
                </div>
              </div>
            </div>
          </div>
          <div class="ide__terminal">
            <div class="ide__term-tabs"><span class="is-active">Run</span><span>Terminal 1</span></div>
            <pre class="ide__term"><span class="t-dim">  Sinth dev v5.4.0</span>
  <span class="t-green">➜</span>  Local:   <span class="t-cyan">http://localhost:3000/</span>
<span class="t-green">✓</span> <span class="t-dim">pages/orders.sinth updated in 21ms</span></pre>
          </div>
        </div>
      </div>
      <div class="ide__status">
        <span>⊘ 0 &nbsp;△ 0</span>
        <span>Sinth 5.4.0</span>
        <span class="ide__status-right">Ln 15, Col 5 &nbsp; UTF-8 &nbsp; LF &nbsp; Sinth</span>
      </div>
    </div>
  </figure>
</template>

<script setup lang="ts">
const code = `import { Button, Table, toast } from "sinth:ui"
import { PUBLIC_API_URL } from "sinth:env"

title = "Orders"

var obj[] orders = []
computed num total = orders.reduce((s, o) => s + o.total, 0)

onMount {
  orders = await (await fetch(PUBLIC_API_URL + "/orders")).json()
}

Content {
  Heading(level: 1) { "Orders: " + total + " €" }
  Ta
  Button(onClick: toast("Exported")) { "Export CSV" }
}`

const cursorLine = 14

const tree = [
  { name: 'pages', depth: 0, dir: true, icon: 'dir' },
  { name: 'index.sinth', depth: 1, icon: 'sinth' },
  { name: 'orders.sinth', depth: 1, icon: 'sinth', active: true },
  { name: 'components', depth: 0, dir: true, icon: 'dir' },
  { name: 'functions', depth: 0, dir: true, icon: 'dir' },
  { name: 'orders.ts', depth: 1, icon: 'ts' },
  { name: 'public', depth: 0, dir: true, icon: 'dir' },
  { name: '.env', depth: 0, icon: 'file' },
  { name: 'sinth.config.json', depth: 0, icon: 'json' }
]

const completions = [
  { name: 'Table', detail: 'sinth:ui · columns, rows' },
  { name: 'Tabs', detail: 'sinth:ui · tabs, selected' },
  { name: 'Textarea', detail: 'element' },
  { name: 'Tooltip', detail: 'sinth:ui · text' }
]

const rows = [
  ['#1042', 'Ada Lovelace', '249 €'],
  ['#1041', 'Linus T.', '89 €'],
  ['#1040', 'Grace H.', '412 €']
]

const KEYWORDS = new Set(['import', 'from', 'var', 'const', 'computed', 'onMount', 'await', 'function', 'if', 'else', 'for', 'in', 'return'])
const TYPES = new Set(['obj', 'num', 'str', 'bool'])
const COMPONENTS = new Set(['Button', 'Table', 'Content', 'Ta'])

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
  --i-bg1: #0e0e11;
  --i-bg2: #131317;
  --i-bg3: #1a1a1f;
  --i-border: rgba(255, 255, 255, 0.07);
  --i-fg: #f5f5f6;
  --i-muted: rgba(245, 245, 246, 0.6);
  --i-subtle: rgba(245, 245, 246, 0.38);
  --i-accent: #a78bfa;
  --i-accent-soft: rgba(167, 139, 250, 0.12);
  font-family: var(--font-sans);
  letter-spacing: -0.005em;
}

svg {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.ide__window {
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 12px;
  overflow: hidden;
  background: var(--i-bg0);
  color: var(--i-fg);
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(167, 139, 250, 0.05);
  font-size: 10.5px;
  user-select: none;
}

.ide__titlebar {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  height: 38px;
  padding-left: 0.75rem;
  border-bottom: 1px solid var(--i-border);
}

.ide__logo { width: 16px; height: 16px; }

.ide__project {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-weight: 500;

  svg { width: 11px; height: 11px; color: var(--i-subtle); }
}

.ide__actions {
  display: flex;
  align-items: center;
  gap: 0.15rem;
  padding-left: 0.6rem;
  border-left: 1px solid var(--i-border);
}

.ide__stop {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  height: 22px;
  padding: 0 0.6rem;
  margin-right: 0.3rem;
  border-radius: 6px;
  color: #f87171;
  background: rgba(248, 113, 113, 0.12);
  box-shadow: inset 0 0 0 1px rgba(248, 113, 113, 0.35);

  b { width: 7px; height: 7px; border-radius: 1.5px; background: currentColor; }
}

.ide__action { padding: 0 0.45rem; color: var(--i-muted); }

.ide__url {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin-left: 0.3rem;
  font-family: var(--font-mono);
  color: var(--i-muted);

  i { width: 5px; height: 5px; border-radius: 50%; background: #4ade80; box-shadow: 0 0 0 3px rgba(74, 222, 128, 0.15); }
}

.ide__search {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
  max-width: 15rem;
  height: 24px;
  margin: 0 auto;
  white-space: nowrap;
  overflow: hidden;
  padding: 0 0.35rem 0 0.55rem;
  border-radius: 6px;
  background: var(--i-bg2);
  border: 1px solid var(--i-border);
  color: var(--i-subtle);

  svg { width: 11px; height: 11px; flex-shrink: 0; }

  @media (max-width: 1400px) {
    kbd { display: none; }
  }

  kbd {
    margin-left: auto;
    padding: 1px 4px;
    border-radius: 4px;
    border: 1px solid var(--i-border);
    font-family: var(--font-mono);
    font-size: 9px;
  }
}

.ide__right { display: flex; align-items: center; height: 100%; }

.ide__toggle {
  display: inline-flex;
  padding: 4px;
  margin-right: 0.4rem;
  border-radius: 5px;
  color: var(--i-accent);
  background: var(--i-accent-soft);

  svg { width: 13px; height: 13px; }
}

.ide__win {
  display: flex;
  height: 100%;
  border-left: 1px solid var(--i-border);

  svg { width: 34px; height: 100%; padding: 0 12px; stroke-width: 1; color: var(--i-muted); }
}

.ide__body {
  display: grid;
  grid-template-columns: 38px 150px minmax(0, 1fr);
  height: 540px;

  @media (max-width: 760px) {
    grid-template-columns: 38px minmax(0, 1fr);

    .ide__explorer { display: none; }
  }
}

.ide__activity {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.9rem;
  padding-top: 0.8rem;
  border-right: 1px solid var(--i-border);

  svg { width: 16px; height: 16px; color: var(--i-subtle); }
  .is-active { color: var(--i-accent); }
}

.ide__explorer {
  background: var(--i-bg1);
  border-right: 1px solid var(--i-border);
  overflow: hidden;
}

.ide__panel-title { padding: 0.7rem 0.75rem 0.45rem; font-size: 10.5px; font-weight: 500; }

.ide__node {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  height: 22px;
  color: var(--i-muted);
  white-space: nowrap;

  &.is-dir { color: var(--i-fg); }

  &.is-active {
    background: var(--i-accent-soft);
    color: var(--i-fg);
  }
}

.ide__icon {
  width: 9px;
  height: 9px;
  border-radius: 2px;
  flex-shrink: 0;
  background: var(--i-subtle);

  &.dir { background: #a78bfa; opacity: 0.55; border-radius: 1px 3px 2px 2px; }
  &.sinth { background: var(--i-accent); }
  &.ts { background: #60a5fa; }
  &.json { background: #fbbf24; }
  &.file { background: #52525b; }
}

.ide__main {
  display: grid;
  grid-template-rows: minmax(0, 1fr) 96px;
  min-width: 0;
}

.ide__split {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
  min-height: 0;

  @media (max-width: 760px) {
    grid-template-columns: minmax(0, 1fr);

    .ide__preview { display: none; }
  }
}

.ide__code-col { display: grid; grid-template-rows: 32px minmax(0, 1fr); min-width: 0; }

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
  padding: 0 0.8rem;
  color: var(--i-muted);
  border-right: 1px solid var(--i-border);
  white-space: nowrap;

  &.is-active { background: var(--i-bg0); color: var(--i-fg); box-shadow: inset 0 1px 0 var(--i-accent); }
}

.ide__editor {
  position: relative;
  padding: 0.5rem 0;
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 18px;
  overflow: hidden;
}

.ide__line {
  display: flex;
  white-space: pre;

  &.is-current { background: #121216; }
}

.ide__gutter {
  width: 2.3rem;
  padding-right: 0.8rem;
  text-align: right;
  color: #45454d;
  flex-shrink: 0;
}

.ide__caret {
  display: inline-block;
  width: 2px;
  height: 14px;
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
  top: calc(0.5rem + 15 * 18px);
  left: calc(2.3rem + 4ch);
  width: min(17rem, calc(100% - 3.5rem));
  padding: 0.25rem;
  background: #131317;
  border: 1px solid rgba(255, 255, 255, 0.13);
  border-radius: 8px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6);
  font-family: var(--font-sans);
  font-size: 10px;
}

.ide__completion-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.45rem;
  border-radius: 5px;

  &.is-active { background: var(--i-accent-soft); }
}

.ide__completion-name { font-family: var(--font-mono); font-size: 11px; }

.ide__completion-detail {
  margin-left: auto;
  color: var(--i-subtle);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ide__preview {
  display: grid;
  grid-template-rows: 32px minmax(0, 1fr);
  min-width: 0;
  border-left: 1px solid var(--i-border);
  background: var(--i-bg1);
}

.ide__address {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0 0.5rem;
  border-bottom: 1px solid var(--i-border);

  svg { width: 11px; height: 11px; color: var(--i-muted); flex-shrink: 0; }
}

.ide__address-field {
  flex: 1;
  height: 20px;
  display: flex;
  align-items: center;
  padding: 0 0.5rem;
  border-radius: 5px;
  background: var(--i-bg0);
  border: 1px solid var(--i-border);
  font-family: var(--font-mono);
  color: var(--i-fg);

  span { color: var(--i-subtle); }
}

.ide__page {
  margin: 0;
  overflow: hidden;
  background: #ffffff;
  color: #0a0a0b;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  letter-spacing: 0;
}

.ide__page-nav {
  display: flex;
  gap: 0.8rem;
  align-items: center;
  height: 30px;
  padding: 0 0.8rem;
  border-bottom: 1px solid #e4e4e9;
  font-size: 10px;
  color: #6b6b76;

  b { color: #0a0a0b; margin-right: auto; }
}

.ide__page-body { display: flex; flex-direction: column; gap: 0.7rem; padding: 1rem 0.8rem; }
.ide__page-h1 { font-size: 17px; font-weight: 700; letter-spacing: -0.03em; }

.ide__page-table { border: 1px solid #e4e4e9; border-radius: 8px; overflow: hidden; font-size: 9.5px; }

.ide__page-row {
  display: grid;
  grid-template-columns: 1fr 1.6fr 0.8fr;
  padding: 0.4rem 0.6rem;
  border-top: 1px solid #e4e4e9;

  span:last-child { text-align: right; font-variant-numeric: tabular-nums; }

  &.is-head { border-top: 0; background: #f6f6f8; color: #6b6b76; font-weight: 600; }
}

.ide__page-btn {
  align-self: flex-start;
  padding: 0.4rem 0.7rem;
  border-radius: 7px;
  background: #7c3aed;
  color: #fff;
  font-size: 9.5px;
  font-weight: 600;
}

.ide__terminal {
  border-top: 1px solid var(--i-border);
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.ide__term-tabs {
  display: flex;
  gap: 0.25rem;
  padding: 0.3rem 0.4rem;

  span { padding: 0.15rem 0.55rem; border-radius: 5px; color: var(--i-muted); }
  .is-active { background: var(--i-bg3); color: var(--i-fg); }
}

.ide__term {
  margin: 0;
  padding: 0.1rem 0.8rem;
  font-family: var(--font-mono);
  font-size: 10.5px;
  line-height: 1.55;
  color: #e4e4e7;
  background: none;
  border: 0;
  overflow: hidden;
}

.ide__status {
  display: flex;
  gap: 1.1rem;
  align-items: center;
  height: 24px;
  padding: 0 0.75rem;
  border-top: 1px solid var(--i-border);
  color: var(--i-muted);
  font-size: 9.5px;
}

.ide__status-right { margin-left: auto; }

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
.t-green { color: #4ade80; }
.t-cyan { color: #67e8f9; }
</style>

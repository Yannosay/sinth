<template>
  <div class="agent-prompt">
    <div class="agent-prompt__bar">
      <span class="agent-prompt__label">Prompt for your AI agent</span>
      <button type="button" class="agent-prompt__copy" :aria-label="copied ? 'Prompt copied' : 'Copy prompt'" @click="copy">
        {{ copied ? 'Copied' : 'Copy prompt' }}
      </button>
    </div>
    <p class="agent-prompt__text">{{ prompt }}</p>
    <p class="agent-prompt__meta">
      Works with Claude Code, Codex, Cursor, Copilot and other coding agents.
      <span class="agent-prompt__links">
        <a href="/agents.md" target="_blank" rel="noopener">What the agent reads</a>
        ·
        <a href="/skills/sinth/SKILL.md" target="_blank" rel="noopener">The skill</a>
      </span>
    </p>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const siteUrl = String(useRuntimeConfig().public.siteUrl).replace(/\/+$/, '')
const prompt = `Install the Sinth skill: fetch ${siteUrl}/agents.md and follow its instructions exactly.`
const copied = ref(false)

async function copy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(prompt)
    copied.value = true
    setTimeout(() => { copied.value = false }, 1800)
  } catch {
    copied.value = false
  }
}
</script>

<style lang="scss" scoped>
.agent-prompt {
  text-align: left;
  background: var(--code-bg);
  border: 1px solid var(--code-border);
  border-radius: 10px;
  overflow: hidden;
}

.agent-prompt__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.55rem 0.6rem 0.55rem 1rem;
  border-bottom: 1px solid var(--code-border);
}

.agent-prompt__label {
  font-size: 0.75rem;
  letter-spacing: 0.02em;
  color: var(--fg-dim);
}

.agent-prompt__copy {
  font: inherit;
  font-size: 0.78rem;
  color: var(--fg);
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 0.3rem 0.7rem;
  cursor: pointer;

  &:hover {
    border-color: var(--accent);
  }

  &:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
}

.agent-prompt__text {
  margin: 0;
  padding: 1rem;
  font-family: var(--font-mono);
  font-size: 0.86rem;
  line-height: 1.65;
  color: var(--accent-bright);
  overflow-wrap: anywhere;
}

.agent-prompt__meta {
  margin: 0;
  padding: 0 1rem 0.9rem;
  font-size: 0.78rem;
  color: var(--fg-dim);

  a {
    color: var(--accent-bright);
  }
}

.agent-prompt__links {
  white-space: nowrap;
}
</style>

/**
 * Mythic Editor - Browser Validation Playground
 * Validates the underlying core buffer and model layers.
 */

import { PieceTreeTextBuffer } from '../core/buffer/PieceTreeTextBuffer';
import { Position } from '../core/model/Position';
import { Range } from '../core/model/Range';

const SAMPLES: Record<string, string> = {
  basic: `// Welcome to Mythic Editor Core Playground!
function calculateFibonacci(n: number): number {
  if (n <= 1) return n;
  return calculateFibonacci(n - 1) + calculateFibonacci(n - 2);
}

console.log(calculateFibonacci(10));`,

  unicode: `// Unicode & Astral Planes Test
const greeting = "नमस्ते दुनिया!"; // Devanagari
const chinese = "你好，世界！"; // CJK
const arabic = "مرحبا بالعالم"; // RTL Arabic
const emojis = "🚀 😈 🔥 💀 ⚡ 😀"; // Surrogate Pairs (2 UTF-16 code units each)
const math = "∀x ∈ ℝ: x² ≥ 0"; // Math symbols`,

  multiline: Array.from({ length: 50 }, (_, i) => `Line ${i + 1}: The quick brown fox jumps over the lazy dog (${i * 10})`).join('\n')
};

class PlaygroundApp {
  private buffer: PieceTreeTextBuffer;
  private logBox: HTMLElement;
  private bufferView: HTMLElement;

  constructor() {
    this.buffer = new PieceTreeTextBuffer(SAMPLES.basic, '\n');
    this.logBox = document.getElementById('log-box')!;
    this.bufferView = document.getElementById('buffer-lines')!;

    this.bindEvents();
    this.render();
    this.log('Playground initialized with sample text.');
  }

  private bindEvents(): void {
    // Sample select
    const sampleSelect = document.getElementById('sample-select') as HTMLSelectElement;
    sampleSelect.addEventListener('change', () => {
      const key = sampleSelect.value;
      if (SAMPLES[key]) {
        this.buffer = new PieceTreeTextBuffer(SAMPLES[key], '\n');
        this.render();
        this.log(`Loaded sample: ${key}`);
      }
    });

    // Insert operation
    document.getElementById('btn-insert')?.addEventListener('click', () => {
      const offsetInput = document.getElementById('insert-offset') as HTMLInputElement;
      const textInput = document.getElementById('insert-text') as HTMLInputElement;
      const offset = parseInt(offsetInput.value, 10);
      const text = textInput.value;

      if (isNaN(offset) || !text) return;

      const t0 = performance.now();
      this.buffer.insert(offset, text);
      const dt = (performance.now() - t0).toFixed(3);

      this.render();
      this.log(`Inserted ${text.length} chars at offset ${offset} in ${dt}ms`);
    });

    // Delete operation
    document.getElementById('btn-delete')?.addEventListener('click', () => {
      const offsetInput = document.getElementById('delete-offset') as HTMLInputElement;
      const countInput = document.getElementById('delete-count') as HTMLInputElement;
      const offset = parseInt(offsetInput.value, 10);
      const count = parseInt(countInput.value, 10);

      if (isNaN(offset) || isNaN(count)) return;

      const t0 = performance.now();
      this.buffer.delete(offset, count);
      const dt = (performance.now() - t0).toFixed(3);

      this.render();
      this.log(`Deleted ${count} chars at offset ${offset} in ${dt}ms`);
    });

    // Offset-to-position calculator
    const calcOffset = document.getElementById('calc-offset') as HTMLInputElement;
    calcOffset?.addEventListener('input', () => {
      const offset = parseInt(calcOffset.value, 10);
      const res = document.getElementById('calc-pos-result');
      if (res && !isNaN(offset)) {
        const pos = this.buffer.getPositionAt(offset);
        res.textContent = `Line ${pos.lineNumber}, Col ${pos.column}`;
      }
    });

    // Position-to-offset calculator
    const calcLine = document.getElementById('calc-line') as HTMLInputElement;
    const calcCol = document.getElementById('calc-col') as HTMLInputElement;
    const updatePosToOffset = () => {
      const line = parseInt(calcLine.value, 10);
      const col = parseInt(calcCol.value, 10);
      const res = document.getElementById('calc-offset-result');
      if (res && !isNaN(line) && !isNaN(col)) {
        const offset = this.buffer.getOffsetAt(new Position(line, col));
        res.textContent = `Offset: ${offset}`;
      }
    };
    calcLine?.addEventListener('input', updatePosToOffset);
    calcCol?.addEventListener('input', updatePosToOffset);
  }

  private render(): void {
    // Stats
    const lengthEl = document.getElementById('stat-length');
    const linesEl = document.getElementById('stat-lines');
    const eolEl = document.getElementById('stat-eol');

    if (lengthEl) lengthEl.textContent = this.buffer.getLength().toString();
    if (linesEl) linesEl.textContent = this.buffer.getLineCount().toString();
    if (eolEl) eolEl.textContent = this.buffer.getEOL() === '\n' ? 'LF (\\n)' : 'CRLF (\\r\\n)';

    // Buffer lines view
    this.bufferView.innerHTML = '';
    const lineCount = this.buffer.getLineCount();

    // Render up to 500 lines for the playground view
    const renderLimit = Math.min(lineCount, 500);
    for (let i = 1; i <= renderLimit; i++) {
      const row = document.createElement('div');
      row.className = 'line-row';

      const lineNo = document.createElement('div');
      lineNo.className = 'line-no';
      lineNo.textContent = i.toString();

      const lineContent = document.createElement('div');
      lineContent.className = 'line-content';
      lineContent.textContent = this.buffer.getLineContent(i);

      row.appendChild(lineNo);
      row.appendChild(lineContent);
      this.bufferView.appendChild(row);
    }

    if (lineCount > 500) {
      const overflow = document.createElement('div');
      overflow.className = 'line-row';
      overflow.style.color = '#9ca3af';
      overflow.style.paddingLeft = '50px';
      overflow.textContent = `... and ${lineCount - 500} more lines`;
      this.bufferView.appendChild(overflow);
    }
  }

  private log(message: string): void {
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    const time = new Date().toLocaleTimeString();
    entry.textContent = `[${time}] ${message}`;
    this.logBox.appendChild(entry);
    this.logBox.scrollTop = this.logBox.scrollHeight;
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new PlaygroundApp();
});

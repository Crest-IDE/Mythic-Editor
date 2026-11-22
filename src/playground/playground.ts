/**
 * Mythic Editor - Playground & Interactive View Host
 */

import { PieceTreeTextBuffer } from '../core/buffer/PieceTreeTextBuffer';
import { Position } from '../core/model/Position';
import { EditorView } from '../view/EditorView';
import { TreeSitterHighlighter } from '../syntax/TreeSitterHighlighter';

const SAMPLES: Record<string, string> = {
  basic: `// Welcome to Mythic Editor View Engine!
function calculateFibonacci(n: number): number {
  if (n <= 1) return n;
  return calculateFibonacci(n - 1) + calculateFibonacci(n - 2);
}

console.log(calculateFibonacci(10));`,

  python: `# Mythic Editor - Python Tree-sitter & Helix Queries Test
import math
from typing import List, Dict, Optional

class PrimeEngine:
    """High performance prime generator and factorization engine."""
    def __init__(self, name: str = "MythicPython", max_cache: int = 1000):
        self.name: str = name
        self.max_cache: int = max_cache
        self.cache: Dict[int, bool] = {}
        self.total_queries: int = 0

    def is_prime(self, n: int) -> bool:
        """Check prime status using trial division with caching."""
        self.total_queries += 1
        if n in self.cache:
            return self.cache[n]
        if n <= 1:
            return False
        if n <= 3:
            return True
        if n % 2 == 0 or n % 3 == 0:
            return False

        limit = int(math.isqrt(n))
        for i in range(5, limit + 1, 6):
            if n % i == 0 or n % (i + 2) == 0:
                self.cache[n] = False
                return False

        if len(self.cache) < self.max_cache:
            self.cache[n] = True
        return True

engine = PrimeEngine("MythicTester", max_cache=500)
primes = [x for x in range(2, 50) if engine.is_prime(x)]
print(f"Generated {len(primes)} primes: {primes}")
`,

  unicode: `// Unicode & Astral Planes Test
const greeting = "नमस्ते दुनिया!"; // Devanagari
const chinese = "你好，世界！"; // CJK
const arabic = "مرحبا بالعالم"; // RTL Arabic
const emojis = "🚀 😈 🔥 💀 ⚡ 😀"; // Astral Emojis
const math = "∀x ∈ ℝ: x² ≥ 0"; // Math symbols`,

  multiline: Array.from({ length: 100 }, (_, i) => `Line ${i + 1}: The quick brown fox jumps over the lazy dog (${i * 10})`).join('\n')
};

const SAMPLE_LANGUAGES: Record<string, string> = {
  basic: 'typescript',
  python: 'python',
  unicode: 'javascript',
  multiline: 'typescript'
};

class PlaygroundApp {
  private editorView!: EditorView;
  private highlighter: TreeSitterHighlighter | null = null;
  private logBox: HTMLElement;
  private mountEl: HTMLElement;

  constructor() {
    this.mountEl = document.getElementById('editor-mount')!;
    this.logBox = document.getElementById('log-box')!;

    this.initEditor(SAMPLES.basic, 'typescript');
    this.bindEvents();
    this.log('Interactive Editor View mounted successfully.');
  }

  private async initEditor(text: string, language: string = 'typescript'): Promise<void> {
    this.mountEl.innerHTML = '';
    const buffer = new PieceTreeTextBuffer(text, '\n');
    this.editorView = new EditorView(this.mountEl, buffer);

    if (this.highlighter) {
      if (this.highlighter.getLanguage() !== language) {
        if (!TreeSitterHighlighter.hasLanguage(language)) {
          this.log(`⏳ Loading Tree-sitter grammar for ${language}...`);
          await TreeSitterHighlighter.loadLanguage(language);
        }
        this.highlighter.setLanguage(language);
      }
      this.highlighter.update(buffer);
      this.editorView.setTokensProvider(this.highlighter);
    } else {
      await this.loadTreeSitter(buffer, language);
    }

    // Keep stats updated
    const updateStats = () => {
      const lenEl = document.getElementById('stat-length');
      const linesEl = document.getElementById('stat-lines');
      const cursorEl = document.getElementById('stat-cursor');

      if (lenEl) lenEl.textContent = buffer.getLength().toString();
      if (linesEl) linesEl.textContent = buffer.getLineCount().toString();
      if (cursorEl) {
        const sel = this.editorView.getSelection();
        cursorEl.textContent = sel.isEmpty()
          ? `(${sel.positionLineNumber}, ${sel.positionColumn})`
          : `[${sel.selectionStartLineNumber},${sel.selectionStartColumn} -> ${sel.positionLineNumber},${sel.positionColumn}]`;
      }
    };

    updateStats();
    window.addEventListener('mouseup', updateStats);
    window.addEventListener('keyup', updateStats);
  }

  private async loadTreeSitter(buffer: PieceTreeTextBuffer, language: string = 'typescript'): Promise<void> {
    try {
      this.log(`⏳ Initializing Tree-sitter WebAssembly parser (${language})...`);
      const highlighter = new TreeSitterHighlighter(language);
      const ok = await highlighter.ready();
      if (ok) {
        this.highlighter = highlighter;
        this.highlighter.update(buffer);
        this.editorView.setTokensProvider(this.highlighter);
        this.log(`✅ Tree-sitter active (${language})! Syntax highlighting live.`);
      } else {
        this.log(`⚠️ Tree-sitter parser could not be initialized for ${language}.`);
      }
    } catch (err: any) {
      this.log(`⚠️ Tree-sitter notice: ${err?.message || err}`);
    }
  }

  private bindEvents(): void {
    // Sample select
    const sampleSelect = document.getElementById('sample-select') as HTMLSelectElement;
    sampleSelect?.addEventListener('change', async () => {
      const key = sampleSelect.value;
      if (SAMPLES[key]) {
        const lang = SAMPLE_LANGUAGES[key] || 'typescript';
        await this.initEditor(SAMPLES[key], lang);
        this.log(`Loaded sample: ${key} (${lang})`);
      }
    });

    // Undo / Redo buttons
    document.getElementById('btn-undo')?.addEventListener('click', () => {
      if (this.editorView.undo()) {
        this.log('Undo executed');
      }
    });

    document.getElementById('btn-redo')?.addEventListener('click', () => {
      if (this.editorView.redo()) {
        this.log('Redo executed');
      }
    });

    // Programmatic Insert operation
    document.getElementById('btn-insert')?.addEventListener('click', () => {
      const offsetInput = document.getElementById('insert-offset') as HTMLInputElement;
      const textInput = document.getElementById('insert-text') as HTMLInputElement;
      const offset = parseInt(offsetInput.value, 10);
      const text = textInput.value;

      if (isNaN(offset) || !text) return;

      const t0 = performance.now();
      const buffer = this.editorView.getBuffer();
      buffer.insert(offset, text);
      this.editorView.render();
      const dt = (performance.now() - t0).toFixed(3);

      this.updateMetrics();
      this.log(`Inserted ${text.length} chars at offset ${offset} in ${dt}ms`);
    });

    // Programmatic Delete operation
    document.getElementById('btn-delete')?.addEventListener('click', () => {
      const offsetInput = document.getElementById('delete-offset') as HTMLInputElement;
      const countInput = document.getElementById('delete-count') as HTMLInputElement;
      const offset = parseInt(offsetInput.value, 10);
      const count = parseInt(countInput.value, 10);

      if (isNaN(offset) || isNaN(count)) return;

      const t0 = performance.now();
      const buffer = this.editorView.getBuffer();
      buffer.delete(offset, count);
      this.editorView.render();
      const dt = (performance.now() - t0).toFixed(3);

      this.updateMetrics();
      this.log(`Deleted ${count} chars at offset ${offset} in ${dt}ms`);
    });

    // Offset-to-position calculator
    const calcOffset = document.getElementById('calc-offset') as HTMLInputElement;
    calcOffset?.addEventListener('input', () => {
      const offset = parseInt(calcOffset.value, 10);
      const res = document.getElementById('calc-pos-result');
      if (res && !isNaN(offset)) {
        const pos = this.editorView.getBuffer().getPositionAt(offset);
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
        const offset = this.editorView.getBuffer().getOffsetAt(new Position(line, col));
        res.textContent = `Offset: ${offset}`;
      }
    };
    calcLine?.addEventListener('input', updatePosToOffset);
    calcCol?.addEventListener('input', updatePosToOffset);

    // Resize handling
    window.addEventListener('resize', () => {
      this.editorView.layout();
      this.editorView.render();
    });
  }

  private updateMetrics(): void {
    const buffer = this.editorView.getBuffer();
    const lenEl = document.getElementById('stat-length');
    const linesEl = document.getElementById('stat-lines');
    if (lenEl) lenEl.textContent = buffer.getLength().toString();
    if (linesEl) linesEl.textContent = buffer.getLineCount().toString();
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

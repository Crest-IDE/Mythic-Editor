/**
 * Mythic Editor - Input Controller (Mobile / Gboard / IME Bridge)
 *
 * Portions derived from Microsoft Monaco Editor (MIT License)
 * Reference: vs/editor/browser/controller/editContext/textArea/textAreaEditContextInput.js
 *
 * Manages an invisible textarea aligned with the cursor that captures keyboard,
 * Android soft keyboard (Gboard), and IME composition events.
 */

import { Position } from '../core/model/Position';
import { Viewport } from './Viewport';

export interface IInputEvents {
  onType: (text: string) => void;
  onDeleteBackward: () => void;
  onDeleteForward: () => void;
  onEnter: () => void;
  onTab: () => void;
  onArrow: (direction: 'left' | 'right' | 'up' | 'down', expandSelection: boolean) => void;
  onSave?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
}

export class InputController {
  readonly textArea: HTMLTextAreaElement;
  private readonly viewport: Viewport;
  private isComposing: boolean = false;
  private events: IInputEvents;

  constructor(viewport: Viewport, events: IInputEvents) {
    this.viewport = viewport;
    this.events = events;

    this.textArea = document.createElement('textarea');
    this.textArea.className = 'mythic-inputarea';
    this.textArea.setAttribute('autocomplete', 'off');
    this.textArea.setAttribute('autocorrect', 'off');
    this.textArea.setAttribute('autocapitalize', 'off');
    this.textArea.setAttribute('spellcheck', 'false');
    this.textArea.setAttribute('tabindex', '0');
    this.textArea.setAttribute('inputmode', 'text');
    this.textArea.setAttribute('wrap', 'off');
    this.textArea.setAttribute('rows', '1');

    this.bindEvents();
  }

  focus(): void {
    this.textArea.readOnly = false;
    this.textArea.removeAttribute('readonly');
    this.textArea.setAttribute('inputmode', 'text');
    try {
      this.textArea.focus({ preventScroll: true });
    } catch (_) {
      this.textArea.focus();
    }

    // Explicitly notify Android host to show the soft keyboard
    if (typeof (window as unknown as { CrestAndroidBridge?: { showKeyboard: () => void } }).CrestAndroidBridge?.showKeyboard === 'function') {
      try {
        (window as unknown as { CrestAndroidBridge: { showKeyboard: () => void } }).CrestAndroidBridge.showKeyboard();
      } catch (_) {}
    }
  }

  blur(): void {
    this.textArea.readOnly = true;
    this.textArea.setAttribute('inputmode', 'none');
    try {
      this.textArea.blur();
    } catch (_) {}
    if (typeof (window as unknown as { CrestAndroidBridge?: { hideKeyboard: () => void } }).CrestAndroidBridge?.hideKeyboard === 'function') {
      try {
        (window as unknown as { CrestAndroidBridge: { hideKeyboard: () => void } }).CrestAndroidBridge.hideKeyboard();
      } catch (_) {}
    }
  }

  updatePosition(cursorPosition: Position, lineContent?: string, overrideLeft?: number): void {
    const top = this.viewport.getLineTop(cursorPosition.lineNumber);
    const left = overrideLeft !== undefined ? overrideLeft : this.viewport.getColumnLeft(cursorPosition.column, lineContent);
    this.textArea.style.transform = `translate3d(${left}px, ${top}px, 0)`;
  }

  private bindEvents(): void {
    let beforeInputHandled = false;
    // Keyboard events
    this.textArea.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 's' || e.key === 'S') {
          e.preventDefault();
          this.events.onSave?.();
          return;
        }
        if (e.key === 'z' || e.key === 'Z') {
          e.preventDefault();
          if (e.shiftKey) {
            this.events.onRedo?.();
          } else {
            this.events.onUndo?.();
          }
          return;
        }
        if (e.key === 'y' || e.key === 'Y') {
          e.preventDefault();
          this.events.onRedo?.();
          return;
        }
      }

      if (this.isComposing) return;

      switch (e.key) {
        case 'Enter':
          e.preventDefault();
          this.events.onEnter();
          break;
        case 'Backspace':
          e.preventDefault();
          this.events.onDeleteBackward();
          break;
        case 'Delete':
          e.preventDefault();
          this.events.onDeleteForward();
          break;
        case 'Tab':
          e.preventDefault();
          this.events.onTab();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          this.events.onArrow('left', e.shiftKey);
          break;
        case 'ArrowRight':
          e.preventDefault();
          this.events.onArrow('right', e.shiftKey);
          break;
        case 'ArrowUp':
          e.preventDefault();
          this.events.onArrow('up', e.shiftKey);
          break;
        case 'ArrowDown':
          e.preventDefault();
          this.events.onArrow('down', e.shiftKey);
          break;
      }
    });

    // Composition events (Gboard / Android IME)
    this.textArea.addEventListener('compositionstart', () => {
      this.isComposing = true;
    });

    this.textArea.addEventListener('compositionend', (e: CompositionEvent) => {
      this.isComposing = false;
      if (e.data) {
        this.events.onType(e.data);
      }
      this.textArea.value = '';
    });

    // Modern input & beforeinput events (including Android soft keyboard Undo/Redo)
    this.textArea.addEventListener('beforeinput', (e: InputEvent) => {
      if (this.isComposing) return;

      if (e.inputType === 'historyUndo') {
        e.preventDefault();
        this.events.onUndo?.();
        return;
      } else if (e.inputType === 'historyRedo') {
        e.preventDefault();
        this.events.onRedo?.();
        return;
      }

      if ((e.inputType === 'insertText' || e.inputType === 'insertReplacementText') && e.data) {
        beforeInputHandled = true;
        e.preventDefault();
        this.events.onType(e.data);
        // Clean textarea in next tick in case Android WebView native engine forces text in
        setTimeout(() => {
          this.textArea.value = '';
          beforeInputHandled = false;
        }, 0);
      } else if (e.inputType === 'insertLineBreak' || e.inputType === 'insertParagraph') {
        e.preventDefault();
        this.events.onEnter();
      } else if (e.inputType === 'deleteContentBackward') {
        e.preventDefault();
        this.events.onDeleteBackward();
      } else if (e.inputType === 'deleteContentForward') {
        e.preventDefault();
        this.events.onDeleteForward();
      }
    });

    // Fallback standard input event
    this.textArea.addEventListener('input', () => {
      if (this.isComposing) return;
      if (beforeInputHandled) {
        this.textArea.value = '';
        beforeInputHandled = false;
        return;
      }
      if (this.textArea.value.length > 0) {
        const val = this.textArea.value;
        this.textArea.value = '';
        this.events.onType(val);
      }
    });

    // Paste event
    this.textArea.addEventListener('paste', (e: ClipboardEvent) => {
      e.preventDefault();
      const text = e.clipboardData?.getData('text/plain');
      if (text) {
        this.events.onType(text);
      }
    });
  }
}

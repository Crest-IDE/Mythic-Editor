/**
 * Mythic Editor - Mobile Touch Selection, Handles & Dynamic Floating Toolbar
 *
 * Ported and adapted from Crest-IDE Mobile Touch Engine
 * Reference: Crest-IDE/editor-core/src/main.js (setupMobileTouchSelection)
 *
 * Provides native Android teardrop selection handles (start/end), long-press
 * selection with haptic feedback, finger offset dragging, dynamic edge-flipping,
 * floating action toolbar (Cut/Copy/Paste/Select All), and suppresses Android OS
 * broken native selection across virtualized DOM lines.
 */

import { Position } from '../core/model/Position';
import { Selection } from '../core/model/Selection';
import { ITextBuffer } from '../core/buffer/ITextBuffer';

export interface IEditorTouchHost {
  readonly rootElement: HTMLElement;
  readonly scrollContainer: HTMLElement;
  readonly buffer: ITextBuffer;
  getSelection(): Selection;
  setSelection(selection: Selection): void;
  getTargetAtClientPoint(clientX: number, clientY: number): { position: Position };
  getWordAtPosition(pos: Position): { startColumn: number; endColumn: number; word: string } | null;
  getScrolledVisiblePosition(pos: Position): { top: number; left: number; height: number } | null;
  focus(): void;
  blur(): void;
  typeText(text: string): void;
  handleDeleteBackward(): void;
  selectAll(): void;
  getSelectedText(): string;
}

export class TouchSelectionController {
  private readonly host: IEditorTouchHost;
  readonly startHandle: HTMLElement;
  readonly endHandle: HTMLElement;
  readonly floatingToolbar: HTMLElement;
  readonly floatingCut: HTMLButtonElement;
  readonly floatingCopy: HTMLButtonElement;
  readonly floatingPaste: HTMLButtonElement;
  readonly floatingSelectAll: HTMLButtonElement;

  private pressTimer: any = null;
  private startX: number = 0;
  private startY: number = 0;
  private activeDrag: { isStart: boolean } | null = null;
  private isScrolling: boolean = false;
  private scrollResetTimer: any = null;
  private suppressMouseUntil: number = 0;
  private isLongPressConfirmed: boolean = false;
  private isHandleMoving: boolean = false;
  private handleStillTimer: any = null;
  private pendingUiRaf: number | null = null;
  private touchHasMoved: boolean = false;
  private isUserTouchDragging: boolean = false;
  private lastScrollTime: number = 0;

  private readonly HANDLE_SIZE: number = 24;

  constructor(host: IEditorTouchHost) {
    this.host = host;

    // 1. Create Teardrop Selection Handles
    this.startHandle = document.createElement('div');
    this.startHandle.className = 'selection-handle handle-start';
    this.startHandle.setAttribute('aria-hidden', 'true');

    this.endHandle = document.createElement('div');
    this.endHandle.className = 'selection-handle handle-end';
    this.endHandle.setAttribute('aria-hidden', 'true');

    // 2. Create Floating Action Menu
    this.floatingToolbar = document.createElement('div');
    this.floatingToolbar.id = 'floating-toolbar';
    this.floatingToolbar.className = 'mythic-floating-toolbar';
    this.floatingToolbar.setAttribute('role', 'toolbar');

    this.floatingCut = document.createElement('button');
    this.floatingCut.type = 'button';
    this.floatingCut.textContent = 'Cut';

    this.floatingCopy = document.createElement('button');
    this.floatingCopy.type = 'button';
    this.floatingCopy.textContent = 'Copy';

    this.floatingPaste = document.createElement('button');
    this.floatingPaste.type = 'button';
    this.floatingPaste.textContent = 'Paste';

    this.floatingSelectAll = document.createElement('button');
    this.floatingSelectAll.type = 'button';
    this.floatingSelectAll.textContent = 'Select All';

    this.floatingToolbar.appendChild(this.floatingCut);
    this.floatingToolbar.appendChild(this.floatingCopy);
    this.floatingToolbar.appendChild(this.floatingPaste);
    this.floatingToolbar.appendChild(this.floatingSelectAll);

    // 3. Attach Elements to Editor Root
    this.host.rootElement.appendChild(this.startHandle);
    this.host.rootElement.appendChild(this.endHandle);
    this.host.rootElement.appendChild(this.floatingToolbar);

    this.bindEvents();
  }

  /**
   * Schedule debounced UI update for handle and toolbar positions
   */
  scheduleUiUpdate(): void {
    if (this.pendingUiRaf) return;
    if (typeof requestAnimationFrame === 'undefined') {
      this.updateUiNow();
      return;
    }
    this.pendingUiRaf = requestAnimationFrame(() => {
      this.pendingUiRaf = null;
      this.updateUiNow();
    });
  }

  /**
   * Immediately update handle and toolbar positions
   */
  updateUiNow(): void {
    const wrapRect = this.host.rootElement.getBoundingClientRect();
    this.updateHandles(wrapRect);
    this.updateCopyToolbar(wrapRect);
  }

  hideToolbar(): void {
    this.floatingToolbar.classList.remove('visible');
  }

  hideHandles(): void {
    this.startHandle.classList.remove('visible');
    this.endHandle.classList.remove('visible');
  }

  private isMarginTarget(target: EventTarget | null): boolean {
    if (!target || !(target as HTMLElement).closest) return false;
    return !!((target as HTMLElement).closest('.mythic-gutter') || (target as HTMLElement).closest('.mythic-line-number'));
  }

  private isScrollbarTarget(target: EventTarget | null): boolean {
    if (!target) return false;
    if (target === window || target === document || target === document.body) return true;
    if (typeof (target as HTMLElement).closest === 'function') {
      return !!((target as HTMLElement).closest('.scrollbar') || (target as HTMLElement).closest('.slider'));
    }
    return false;
  }

  private isHandleOrToolbarTarget(target: EventTarget | null): boolean {
    if (!target || !(target as HTMLElement).closest) return false;
    return !!(
      (target as HTMLElement).closest('.selection-handle') ||
      (target as HTMLElement).closest('.mythic-floating-toolbar') ||
      (target as HTMLElement).closest('#floating-toolbar')
    );
  }

  private selectWordAt(clientX: number, clientY: number): void {
    const target = this.host.getTargetAtClientPoint(clientX, clientY);
    if (!target || !target.position) return;
    const word = this.host.getWordAtPosition(target.position);
    if (!word) {
      this.host.setSelection(new Selection(target.position.lineNumber, target.position.column, target.position.lineNumber, target.position.column));
      this.scheduleUiUpdate();
      return;
    }
    this.host.setSelection(
      new Selection(
        target.position.lineNumber,
        word.startColumn,
        target.position.lineNumber,
        word.endColumn
      )
    );
    this.scheduleUiUpdate();
  }

  private positionForHandle(handle: HTMLElement, position: Position, isStart: boolean, wrapRect: DOMRect): void {
    const visible = this.host.getScrolledVisiblePosition(position);
    if (!visible) {
      handle.classList.remove('visible');
      return;
    }

    const caretX = Math.round(visible.left);
    const caretY = Math.round(visible.top + (visible.height || 18));

    let x: number;
    let y = caretY;
    let flipped = false;

    if (isStart) {
      // Start handle: sharp tip at top-right, curves down-left
      x = caretX - this.HANDLE_SIZE;
      if (x < 2) {
        x = caretX;
        flipped = true;
      }
    } else {
      // End handle: sharp tip at top-left, curves down-right
      x = caretX;
      if (x + this.HANDLE_SIZE > wrapRect.width - 2) {
        x = caretX - this.HANDLE_SIZE;
        flipped = true;
      }
    }

    handle.classList.toggle('flipped', flipped);
    handle.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    handle.classList.add('visible');
  }

  private updateHandles(wrapRect: DOMRect): void {
    if (this.activeDrag) return;
    const selection = this.host.getSelection();
    if (!selection || selection.isEmpty()) {
      this.startHandle.classList.remove('visible');
      this.endHandle.classList.remove('visible');
      return;
    }
    this.positionForHandle(this.startHandle, selection.getStartPosition(), true, wrapRect);
    this.positionForHandle(this.endHandle, selection.getEndPosition(), false, wrapRect);
  }

  private updateCopyToolbar(cachedWrapRect?: DOMRect): void {
    if (this.isHandleMoving) {
      this.floatingToolbar.classList.remove('visible');
      return;
    }
    const selection = this.host.getSelection();
    const hasSelection = selection && !selection.isEmpty();
    const wrapRect = cachedWrapRect || this.host.rootElement.getBoundingClientRect();

    if (hasSelection) {
      this.floatingCut.style.display = '';
      this.floatingCopy.style.display = '';
      this.floatingPaste.style.display = '';
      this.floatingSelectAll.style.display = '';

      const start = this.host.getScrolledVisiblePosition(selection.getStartPosition());
      const end = this.host.getScrolledVisiblePosition(selection.getEndPosition());
      if (!start || !end) {
        this.floatingToolbar.classList.remove('visible');
        return;
      }

      const toolbarWidth = this.floatingToolbar.offsetWidth || 180;
      const toolbarHeight = this.floatingToolbar.offsetHeight || 34;
      const isSingleLine = selection.startLineNumber === selection.endLineNumber;
      const startXPos = start.left;
      const endXPos = end.left;
      const selectionMidX = isSingleLine ? (startXPos + endXPos) / 2 : startXPos + 35;
      const left = Math.max(4, Math.min(Math.round(selectionMidX - toolbarWidth / 2), wrapRect.width - toolbarWidth - 4));

      const lineHeight = start.height || 19;
      const topOfSelection = start.top;
      const gapAboveHandle = 10;
      let top = Math.round(topOfSelection - toolbarHeight - gapAboveHandle);
      if (top < 8) {
        const handleOffset = isSingleLine ? 28 : 6;
        top = Math.round(topOfSelection + lineHeight + handleOffset);
      }
      top = Math.max(8, Math.min(top, wrapRect.height - toolbarHeight - 8));

      this.floatingToolbar.style.transform = `translate3d(${left}px, ${top}px, 0)`;
      this.floatingToolbar.classList.add('visible');
    } else if (Date.now() < this.suppressMouseUntil) {
      // Tap caret menu (Paste & Select All only)
      this.floatingCut.style.display = 'none';
      this.floatingCopy.style.display = 'none';
      this.floatingPaste.style.display = '';
      this.floatingSelectAll.style.display = '';

      const pos = selection.getPosition();
      const visible = this.host.getScrolledVisiblePosition(pos);
      if (!visible) return;

      const toolbarWidth = this.floatingToolbar.offsetWidth || 110;
      const toolbarHeight = this.floatingToolbar.offsetHeight || 34;
      const left = Math.max(4, Math.min(Math.round(visible.left - toolbarWidth / 2), wrapRect.width - toolbarWidth - 4));
      const gap = 8;
      let top = Math.round(visible.top - toolbarHeight - gap);
      if (top < 2) top = Math.round(visible.top + (visible.height || 19) + gap);

      this.floatingToolbar.style.transform = `translate3d(${left}px, ${top}px, 0)`;
      this.floatingToolbar.classList.add('visible');
    } else {
      this.floatingToolbar.classList.remove('visible');
    }
  }

  private async copySelection(): Promise<void> {
    const text = this.host.getSelectedText();
    if (!text) return;

    // 1. Android Bridge Check
    const bridge = (window as any).CrestAndroidBridge;
    if (bridge && typeof bridge.setClipboardText === 'function') {
      try {
        bridge.setClipboardText(text);
        this.floatingToolbar.classList.remove('visible');
        return;
      } catch (_) {}
    }

    // 2. Modern Clipboard API
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        this.floatingToolbar.classList.remove('visible');
        return;
      } catch (_) {}
    }

    // 3. Fallback ExecCommand
    try {
      const temp = document.createElement('textarea');
      temp.value = text;
      temp.style.position = 'fixed';
      temp.style.left = '-9999px';
      document.body.appendChild(temp);
      temp.select();
      document.execCommand('copy');
      temp.remove();
    } catch (_) {}

    this.floatingToolbar.classList.remove('visible');
  }

  private async cutSelection(): Promise<void> {
    await this.copySelection();
    this.host.handleDeleteBackward();
    this.host.focus();
    this.scheduleUiUpdate();
  }

  private async pasteClipboard(): Promise<void> {
    let text = '';

    // 1. Android Bridge Check
    const bridge = (window as any).CrestAndroidBridge;
    if (bridge && typeof bridge.getClipboardText === 'function') {
      try {
        text = bridge.getClipboardText();
      } catch (_) {}
    }

    // 2. Modern Clipboard API
    if (!text && typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.readText) {
      try {
        text = await navigator.clipboard.readText();
      } catch (_) {}
    }

    if (!text) return;

    this.host.typeText(text);
    this.host.focus();
    this.floatingToolbar.classList.remove('visible');
    this.scheduleUiUpdate();
  }

  private selectAll(): void {
    this.suppressMouseUntil = Date.now() + 600;
    this.host.selectAll();
    this.host.focus();
    this.scheduleUiUpdate();
  }

  private beginHandleDrag(isStart: boolean, event: PointerEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.suppressMouseUntil = 0;

    const initialSelection = this.host.getSelection();
    if (!initialSelection || initialSelection.isEmpty()) return;

    this.floatingToolbar.classList.remove('visible');
    this.isHandleMoving = true;
    clearTimeout(this.handleStillTimer);

    const fixedAnchor = isStart ? initialSelection.getEndPosition() : initialSelection.getStartPosition();
    const pointerId = event.pointerId;
    const targetHandle = isStart ? this.startHandle : this.endHandle;

    if (pointerId !== undefined && typeof targetHandle.setPointerCapture === 'function') {
      try {
        targetHandle.setPointerCapture(pointerId);
      } catch (_) {}
    }

    this.activeDrag = { isStart };
    let latestX = event.clientX;
    let latestY = event.clientY;

    const processDrag = () => {
      if (!this.activeDrag) return;
      const fingerOffsetY = 20; // Keeps text visible above the user's finger!
      const target = this.host.getTargetAtClientPoint(latestX, latestY - fingerOffsetY);
      if (!target || !target.position) return;

      const moving = target.position;
      const fixedOffset = this.host.buffer.getOffsetAt(fixedAnchor);
      const movingOffset = this.host.buffer.getOffsetAt(moving);

      const start = movingOffset <= fixedOffset ? moving : fixedAnchor;
      const end = movingOffset <= fixedOffset ? fixedAnchor : moving;

      this.host.setSelection(new Selection(start.lineNumber, start.column, end.lineNumber, end.column));

      const current = this.host.getSelection();
      if (current) {
        const wrapRect = this.host.rootElement.getBoundingClientRect();
        this.positionForHandle(this.startHandle, current.getStartPosition(), true, wrapRect);
        this.positionForHandle(this.endHandle, current.getEndPosition(), false, wrapRect);
      }
    };

    const move = (e: PointerEvent) => {
      if (!this.activeDrag || e.pointerId !== pointerId) return;
      if (!this.isHandleMoving) {
        this.isHandleMoving = true;
        this.floatingToolbar.classList.remove('visible');
      }
      latestX = e.clientX;
      latestY = e.clientY;
      processDrag();
    };

    const up = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      if (pointerId !== undefined && typeof targetHandle.releasePointerCapture === 'function') {
        try {
          targetHandle.releasePointerCapture(pointerId);
        } catch (_) {}
      }
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);

      this.activeDrag = null;
      this.isHandleMoving = false;
      this.scheduleUiUpdate();

      clearTimeout(this.handleStillTimer);
      this.handleStillTimer = setTimeout(() => {
        if (!this.isHandleMoving) {
          this.scheduleUiUpdate();
        }
      }, 100);
    };

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('pointermove', move, { capture: true, passive: false });
      window.addEventListener('pointerup', up, { capture: true, passive: false });
      window.addEventListener('pointercancel', up, { capture: true, passive: false });
    }
  }

  private bindEvents(): void {
    const editorNode = this.host.rootElement;
    if (!editorNode || typeof editorNode.addEventListener !== 'function') {
      return;
    }

    // Button event listeners
    this.floatingCut.addEventListener?.('click', () => this.cutSelection());
    this.floatingCopy.addEventListener?.('click', () => this.copySelection());
    this.floatingPaste.addEventListener?.('click', () => this.pasteClipboard());
    this.floatingSelectAll.addEventListener?.('click', () => this.selectAll());

    // Stop propagation from floating toolbar to prevent clearing selection
    ['touchstart', 'touchend', 'touchcancel', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'click'].forEach((evt) => {
      this.floatingToolbar.addEventListener?.(evt, (e) => e.stopPropagation());
    });

    ['touchstart', 'touchend', 'touchcancel', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'click'].forEach((evt) => {
      this.startHandle.addEventListener?.(evt, (e) => e.stopPropagation());
      this.endHandle.addEventListener?.(evt, (e) => e.stopPropagation());
    });

    // Teardrop handle pointerdown listeners
    this.startHandle.addEventListener?.('pointerdown', (e: PointerEvent) => this.beginHandleDrag(true, e));
    this.endHandle.addEventListener?.('pointerdown', (e: PointerEvent) => this.beginHandleDrag(false, e));

    // Suppress native selectionchange during active touch selection
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener(
        'selectionchange',
        (event) => {
          if (Date.now() < this.suppressMouseUntil || this.isLongPressConfirmed) {
            event.stopImmediatePropagation();
          }
        },
        true
      );
    }

    // Suppress Android default context menu (cut/copy bubble)
    editorNode.addEventListener(
      'contextmenu',
      (e) => {
        e.preventDefault();
        e.stopPropagation();
      },
      true
    );

    // Touch event listeners for long-press & tap
    editorNode.addEventListener(
      'touchstart',
      (e: TouchEvent) => {
        if (this.isScrollbarTarget(e.target) || this.isMarginTarget(e.target) || this.isHandleOrToolbarTarget(e.target)) {
          clearTimeout(this.pressTimer);
          return;
        }
        if (e.touches.length !== 1) {
          clearTimeout(this.pressTimer);
          return;
        }

        const touch = e.touches[0];
        this.startX = touch.clientX;
        this.startY = touch.clientY;
        clearTimeout(this.pressTimer);
        this.isLongPressConfirmed = false;
        this.isUserTouchDragging = false;
        this.touchHasMoved = false;

        this.pressTimer = setTimeout(() => {
          if (!this.isScrolling) {
            this.isLongPressConfirmed = true;
            this.suppressMouseUntil = Date.now() + 5000;
            this.selectWordAt(this.startX, this.startY);
            if (typeof navigator !== 'undefined' && navigator.vibrate) {
              try {
                navigator.vibrate(35);
              } catch (_) {}
            }
          }
        }, 380);
      },
      true
    );

    editorNode.addEventListener(
      'touchmove',
      (e: TouchEvent) => {
        if (this.isScrollbarTarget(e.target) || this.isMarginTarget(e.target) || this.isHandleOrToolbarTarget(e.target)) {
          clearTimeout(this.pressTimer);
          return;
        }
        if (this.isLongPressConfirmed) return;

        if (e.touches && e.touches.length > 0) {
          const touch = e.touches[0];
          const dx = Math.abs(touch.clientX - this.startX);
          const dy = Math.abs(touch.clientY - this.startY);

          if (dx > 8 || dy > 8 || e.touches.length > 1) {
            this.touchHasMoved = true;
            clearTimeout(this.pressTimer);
            this.isUserTouchDragging = true;
            this.isScrolling = true;
            this.lastScrollTime = Date.now();
            this.floatingToolbar.classList.remove('visible');

            clearTimeout(this.scrollResetTimer);
            this.scrollResetTimer = setTimeout(() => {
              this.isScrolling = false;
              this.scheduleUiUpdate();
            }, 350);
          }
        } else {
          clearTimeout(this.pressTimer);
        }
      },
      true
    );

    editorNode.addEventListener(
      'touchend',
      (e: TouchEvent) => {
        clearTimeout(this.pressTimer);
        if (this.isScrollbarTarget(e.target) || this.isHandleOrToolbarTarget(e.target)) return;

        this.isUserTouchDragging = false;
        if (this.isLongPressConfirmed) {
          e.preventDefault();
          e.stopPropagation();
          this.isLongPressConfirmed = false;
          this.suppressMouseUntil = Date.now() + 300;
          return;
        }

        if (Date.now() < this.suppressMouseUntil) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }

        if (this.touchHasMoved || this.isScrolling) {
          this.lastScrollTime = Date.now();
          clearTimeout(this.scrollResetTimer);
          this.scrollResetTimer = setTimeout(() => {
            this.isScrolling = false;
            this.scheduleUiUpdate();
          }, 350);
          return;
        }

        const touch = e.changedTouches && e.changedTouches[0];
        if (touch) {
          const dx = Math.abs(touch.clientX - this.startX);
          const dy = Math.abs(touch.clientY - this.startY);
          if (dx < 8 && dy < 8) {
            if (this.isMarginTarget(e.target)) {
              return;
            }
            const target = this.host.getTargetAtClientPoint(touch.clientX, touch.clientY);
            if (target && target.position) {
              this.host.setSelection(
                new Selection(
                  target.position.lineNumber,
                  target.position.column,
                  target.position.lineNumber,
                  target.position.column
                )
              );
              this.host.focus();
              this.scheduleUiUpdate();
            }
          }
        }
      },
      true
    );

    editorNode.addEventListener('touchcancel', () => {
      clearTimeout(this.pressTimer);
      this.isLongPressConfirmed = false;
      this.isUserTouchDragging = false;
      this.touchHasMoved = false;
    });

    // Tap outside handles & toolbar to dismiss
    editorNode.addEventListener(
      'click',
      (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target && target.closest && (target.closest('.selection-handle') || target.closest('#floating-toolbar'))) {
          return;
        }
        if (this.isMarginTarget(target)) return;

        if (Date.now() < this.suppressMouseUntil || this.isLongPressConfirmed || this.isScrolling || Date.now() - this.lastScrollTime < 300) {
          e.stopPropagation();
          e.stopImmediatePropagation();
          e.preventDefault();
          return;
        }

        const t = this.host.getTargetAtClientPoint(e.clientX, e.clientY);
        if (t && t.position) {
          this.scheduleUiUpdate();
        }
      },
      true
    );
  }

  dispose(): void {
    clearTimeout(this.pressTimer);
    clearTimeout(this.scrollResetTimer);
    clearTimeout(this.handleStillTimer);
    if (this.startHandle.parentNode) this.startHandle.parentNode.removeChild(this.startHandle);
    if (this.endHandle.parentNode) this.endHandle.parentNode.removeChild(this.endHandle);
    if (this.floatingToolbar.parentNode) this.floatingToolbar.parentNode.removeChild(this.floatingToolbar);
  }
}

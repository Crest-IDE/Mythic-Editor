/**
 * Mythic Editor - DOM Range Measurement Utility
 *
 * Portions derived from Microsoft Monaco Editor (MIT License)
 * Reference: vs/editor/browser/viewParts/viewLines/rangeUtil.ts
 *
 * Accurately measures sub-pixel horizontal offsets for rendered characters
 * in line DOM elements using browser DOM Range API (document.createRange).
 * This eliminates cursor drift and positioning mismatch on emojis (e.g. 😈🔥😂),
 * full-width CJK, ligature sequences, and non-monospace system emoji fonts.
 */

export class RangeUtil {
  private static reusableRange: Range | null = null;

  private static getRange(): Range | null {
    if (typeof document === 'undefined' || typeof document.createRange !== 'function') {
      return null;
    }
    if (!this.reusableRange) {
      try {
        this.reusableRange = document.createRange();
      } catch {
        return null;
      }
    }
    return this.reusableRange;
  }

  /**
   * Measure the precise horizontal pixel offset (0-based, relative to line left)
   * for a 0-based character offset inside a rendered line DOM element.
   *
   * @param lineEl The rendered line HTMLElement (.mythic-view-line)
   * @param targetOffset 0-based UTF-16 code unit offset within the line
   * @returns Pixel offset from the left of lineEl, or null if unmeasurable.
   */
  public static readHorizontalOffset(lineEl: HTMLElement, targetOffset: number): number | null {
    if (typeof document === 'undefined') {
      return null;
    }

    if (targetOffset <= 0) {
      return 0;
    }

    const lineRect = lineEl.getBoundingClientRect?.();
    // In headless environments or non-rendered elements, return null to use fallback
    if (!lineRect || (lineRect.width === 0 && lineRect.left === 0 && lineRect.right === 0)) {
      return null;
    }

    const range = this.getRange();
    if (!range) {
      return null;
    }

    try {
      // Collect leaf text nodes
      const textNodes: Text[] = [];
      const showTextFilter = typeof NodeFilter !== 'undefined' ? NodeFilter.SHOW_TEXT : 4;
      const walker = document.createTreeWalker(lineEl, showTextFilter, null);
      let currentNode: Node | null;
      while ((currentNode = walker.nextNode())) {
        textNodes.push(currentNode as Text);
      }

      if (textNodes.length === 0) {
        return 0;
      }

      let accumulatedOffset = 0;
      for (const textNode of textNodes) {
        const textLen = textNode.textContent?.length || 0;
        if (accumulatedOffset + textLen >= targetOffset) {
          const offsetInNode = Math.min(textLen, Math.max(0, targetOffset - accumulatedOffset));
          range.setStart(textNode, offsetInNode);
          range.collapse(true);

          const clientRects = range.getClientRects();
          if (clientRects && clientRects.length > 0) {
            return Math.max(0, clientRects[0].left - lineRect.left);
          }

          // Fallback if collapsed range returns empty rect at boundary
          if (offsetInNode > 0) {
            range.setStart(textNode, offsetInNode - 1);
            range.setEnd(textNode, offsetInNode);
            const spanRects = range.getClientRects();
            if (spanRects && spanRects.length > 0) {
              return Math.max(0, spanRects[spanRects.length - 1].right - lineRect.left);
            }
          }
          break;
        }
        accumulatedOffset += textLen;
      }

      // Beyond the last text node (at end of line)
      if (textNodes.length > 0) {
        const lastNode = textNodes[textNodes.length - 1];
        const lastLen = lastNode.textContent?.length || 0;
        range.setStart(lastNode, lastLen);
        range.collapse(true);

        const rects = range.getClientRects();
        if (rects && rects.length > 0) {
          return Math.max(0, rects[0].left - lineRect.left);
        }

        if (lastLen > 0) {
          range.setStart(lastNode, lastLen - 1);
          range.setEnd(lastNode, lastLen);
          const spanRects = range.getClientRects();
          if (spanRects && spanRects.length > 0) {
            return Math.max(0, spanRects[spanRects.length - 1].right - lineRect.left);
          }
        }
      }
    } catch {
      return null;
    }

    return null;
  }

  /**
   * Determine the 1-based column from a DOM node and character offset inside a line element.
   */
  public static getColumnFromNodeOffset(lineEl: HTMLElement, targetNode: Node, nodeOffset: number): number | null {
    if (typeof document === 'undefined') {
      return null;
    }

    try {
      const showTextFilter = typeof NodeFilter !== 'undefined' ? NodeFilter.SHOW_TEXT : 4;
      const walker = document.createTreeWalker(lineEl, showTextFilter, null);
      let accumulated = 0;
      let currentNode: Node | null;

      while ((currentNode = walker.nextNode())) {
        if (currentNode === targetNode) {
          return accumulated + nodeOffset + 1;
        }
        // If targetNode is an element containing this text node
        if (targetNode.nodeType === 1 && targetNode.contains(currentNode)) {
          // If direct child match
          const children = Array.from(targetNode.childNodes);
          const idx = children.indexOf(currentNode as ChildNode);
          if (idx >= nodeOffset) {
            return accumulated + 1;
          }
        }
        accumulated += currentNode.textContent?.length || 0;
      }

      return accumulated + 1;
    } catch {
      return null;
    }
  }
}

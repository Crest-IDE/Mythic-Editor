import { describe, it, expect } from 'vitest';
import { PieceTreeTextBuffer } from '@mythic/core/buffer/PieceTreeTextBuffer';
import { Range } from '@mythic/core/model/Range';
import { Position } from '@mythic/core/model/Position';

describe('PieceTreeTextBuffer Subsystem', () => {
  describe('Empty Buffer', () => {
    it('initializes with 1 line and 0 length', () => {
      const buffer = new PieceTreeTextBuffer('');
      expect(buffer.getLength()).toBe(0);
      expect(buffer.getLineCount()).toBe(1);
      expect(buffer.getLineContent(1)).toBe('');
      expect(buffer.getText()).toBe('');
      expect(buffer.getPositionAt(0)).toEqual(new Position(1, 1));
      expect(buffer.getOffsetAt(new Position(1, 1))).toBe(0);
    });

    it('supports insertion into empty buffer', () => {
      const buffer = new PieceTreeTextBuffer('');
      buffer.insert(0, 'Hello World');
      expect(buffer.getLength()).toBe(11);
      expect(buffer.getText()).toBe('Hello World');
      expect(buffer.getLineCount()).toBe(1);
      expect(buffer.getLineContent(1)).toBe('Hello World');
    });

    it('handles empty insertions and deletions as no-ops', () => {
      const buffer = new PieceTreeTextBuffer('Test');
      buffer.insert(2, '');
      expect(buffer.getText()).toBe('Test');
      buffer.delete(2, 0);
      expect(buffer.getText()).toBe('Test');
      buffer.delete(2, -5);
      expect(buffer.getText()).toBe('Test');
    });
  });

  describe('Single-line Edits', () => {
    it('inserts at beginning, middle, and end', () => {
      const buffer = new PieceTreeTextBuffer('World');

      // Insert at beginning
      buffer.insert(0, 'Hello ');
      expect(buffer.getText()).toBe('Hello World');

      // Insert at end
      buffer.insert(buffer.getLength(), '!');
      expect(buffer.getText()).toBe('Hello World!');

      // Insert in middle
      buffer.insert(5, ' Beautiful');
      expect(buffer.getText()).toBe('Hello Beautiful World!');
    });

    it('deletes at beginning, middle, and end', () => {
      const buffer = new PieceTreeTextBuffer('Hello Beautiful World!');

      // Delete at beginning ("Hello ")
      buffer.delete(0, 6);
      expect(buffer.getText()).toBe('Beautiful World!');

      // Delete in middle ("Beautiful ")
      buffer.delete(0, 10);
      expect(buffer.getText()).toBe('World!');

      // Delete at end ("!")
      buffer.delete(5, 1);
      expect(buffer.getText()).toBe('World');
    });
  });

  describe('Multi-line Text & Newline Operations', () => {
    it('parses multi-line text with LF and CRLF', () => {
      const lfText = 'Line 1\nLine 2\nLine 3';
      const bufferLF = new PieceTreeTextBuffer(lfText, '\n');
      expect(bufferLF.getLineCount()).toBe(3);
      expect(bufferLF.getLineContent(1)).toBe('Line 1');
      expect(bufferLF.getLineContent(2)).toBe('Line 2');
      expect(bufferLF.getLineContent(3)).toBe('Line 3');
      expect(bufferLF.getLineLength(1)).toBe(6);

      const crlfText = 'Row 1\r\nRow 2\r\nRow 3';
      const bufferCRLF = new PieceTreeTextBuffer(crlfText, '\r\n');
      expect(bufferCRLF.getLineCount()).toBe(3);
      expect(bufferCRLF.getLineContent(1)).toBe('Row 1');
      expect(bufferCRLF.getLineContent(2)).toBe('Row 2');
      expect(bufferCRLF.getLineContent(3)).toBe('Row 3');
    });

    it('inserts newlines to split a line', () => {
      const buffer = new PieceTreeTextBuffer('HelloWorld');
      buffer.insert(5, '\n');
      expect(buffer.getLineCount()).toBe(2);
      expect(buffer.getLineContent(1)).toBe('Hello');
      expect(buffer.getLineContent(2)).toBe('World');
    });

    it('deletes newline to join two lines', () => {
      const buffer = new PieceTreeTextBuffer('Hello\nWorld');
      expect(buffer.getLineCount()).toBe(2);
      // Offset of \n is 5
      buffer.delete(5, 1);
      expect(buffer.getLineCount()).toBe(1);
      expect(buffer.getText()).toBe('HelloWorld');
    });

    it('deletes across multiple lines via deleteRange', () => {
      const buffer = new PieceTreeTextBuffer('Line 1\nLine 2\nLine 3\nLine 4');
      // Delete from line 1 col 5 (" 1\nLine 2\nLi") to line 3 col 3
      buffer.deleteRange(new Range(1, 5, 3, 3));
      expect(buffer.getLineCount()).toBe(2);
      expect(buffer.getLineContent(1)).toBe('Linene 3');
      expect(buffer.getLineContent(2)).toBe('Line 4');
    });

    it('applies edits via applyEdit', () => {
      const buffer = new PieceTreeTextBuffer('foo = 10;');
      buffer.applyEdit(new Range(1, 7, 1, 9), '20');
      expect(buffer.getText()).toBe('foo = 20;');
    });
  });

  describe('Position and Offset Conversions', () => {
    it('round-trips position to offset and offset to position accurately', () => {
      const text = 'Alpha\nBeta\nGamma\nDelta';
      const buffer = new PieceTreeTextBuffer(text, '\n');

      for (let offset = 0; offset <= text.length; offset++) {
        const pos = buffer.getPositionAt(offset);
        const roundTripOffset = buffer.getOffsetAt(pos);
        expect(roundTripOffset).toBe(offset);
      }
    });

    it('correctly handles line starts and line ends', () => {
      const buffer = new PieceTreeTextBuffer('abc\ndef\nghi', '\n');
      // line 1: abc (offset 0..2), \n is offset 3
      // line 2: def (offset 4..6), \n is offset 7
      // line 3: ghi (offset 8..10)
      expect(buffer.getOffsetAt(new Position(1, 1))).toBe(0);
      expect(buffer.getOffsetAt(new Position(1, 4))).toBe(3); // at \n
      expect(buffer.getOffsetAt(new Position(2, 1))).toBe(4); // 'd'
      expect(buffer.getOffsetAt(new Position(3, 4))).toBe(11); // end of buffer
    });

    it('clamps out of bounds offsets', () => {
      const buffer = new PieceTreeTextBuffer('abc\ndef');
      const beyond = buffer.getPositionAt(100);
      expect(beyond.lineNumber).toBe(2);
      expect(beyond.column).toBe(4);

      const before = buffer.getPositionAt(-10);
      expect(before.lineNumber).toBe(1);
      expect(before.column).toBe(1);
    });
  });

  describe('Repeated Edits & Stress Testing', () => {
    it('maintains consistency through hundreds of sequential insertions and deletions', () => {
      const buffer = new PieceTreeTextBuffer('start');
      let reference = 'start';

      for (let i = 0; i < 100; i++) {
        const insertText = ` [${i}] `;
        const insertOffset = Math.floor(Math.random() * (reference.length + 1));
        buffer.insert(insertOffset, insertText);
        reference = reference.slice(0, insertOffset) + insertText + reference.slice(insertOffset);

        if (i % 3 === 0 && reference.length > 10) {
          const deleteOffset = Math.floor(Math.random() * (reference.length - 4));
          const deleteCount = Math.min(4, reference.length - deleteOffset);
          buffer.delete(deleteOffset, deleteCount);
          reference = reference.slice(0, deleteOffset) + reference.slice(deleteOffset + deleteCount);
        }
      }

      expect(buffer.getText()).toBe(reference);
      expect(buffer.getLength()).toBe(reference.length);
    });
  });

  describe('Large Text Inputs', () => {
    it('handles text larger than average buffer size (> 65535 chars)', () => {
      const line = 'const x = "large document line content for testing pieceTree buffer chunking";\n';
      const repeatCount = 1200; // ~65k-100k chars
      const largeText = line.repeat(repeatCount);

      const buffer = new PieceTreeTextBuffer(largeText, '\n');
      expect(buffer.getLength()).toBe(largeText.length);
      expect(buffer.getLineCount()).toBe(repeatCount + 1);

      // Verify lines in the middle and end
      expect(buffer.getLineContent(500)).toBe('const x = "large document line content for testing pieceTree buffer chunking";');
      expect(buffer.getLineContent(repeatCount)).toBe('const x = "large document line content for testing pieceTree buffer chunking";');

      // Edit in the middle of large document
      buffer.insert(50000, '// INSERTION\n');
      expect(buffer.getLineCount()).toBe(repeatCount + 2);
    });
  });
});

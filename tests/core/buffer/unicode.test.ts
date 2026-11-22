import { describe, it, expect } from 'vitest';
import { PieceTreeTextBuffer } from '@mythic/core/buffer/PieceTreeTextBuffer';
import { OffsetTransformer } from '@mythic/core/model/OffsetTransformer';
import { CursorColumns } from '@mythic/core/model/CursorColumns';
import { Viewport } from '@mythic/view/Viewport';

describe('Unicode & Surrogate Pair Handling', () => {
  it('correctly counts UTF-16 code units for emojis and astral code points', () => {
    // Emoji 😀 is U+1F600, encoded as 2 UTF-16 code units (\uD83D\uDE00)
    const text = 'Hello 😀 World';
    const buffer = new PieceTreeTextBuffer(text);

    expect(text.length).toBe(14); // 5 ("Hello") + 1 (" ") + 2 (😀) + 1 (" ") + 5 ("World") = 14
    expect(buffer.getLength()).toBe(14);

    // Position of space after emoji
    const posAfterEmoji = buffer.getPositionAt(9); // 0..5 = "Hello ", 6..7 = "😀", 8 = " ", 9 = "W"
    expect(posAfterEmoji.column).toBe(10);
  });

  it('handles multi-lingual text (Devanagari, CJK, Arabic, accented characters)', () => {
    const text = 'नमस्ते दुनिया!\n你好，世界！\nمرحبا بالعالم\nBonjour le monde café';
    const buffer = new PieceTreeTextBuffer(text, '\n');

    expect(buffer.getLineCount()).toBe(4);
    expect(buffer.getLineContent(1)).toBe('नमस्ते दुनिया!');
    expect(buffer.getLineContent(2)).toBe('你好，世界！');
    expect(buffer.getLineContent(3)).toBe('مرحبا بالعالم');
    expect(buffer.getLineContent(4)).toBe('Bonjour le monde café');

    // Round-trip position and offset
    for (let offset = 0; offset < text.length; offset += 5) {
      const pos = buffer.getPositionAt(offset);
      expect(buffer.getOffsetAt(pos)).toBe(offset);
    }
  });

  it('detects and adjusts surrogate pair boundaries via OffsetTransformer', () => {
    const text = 'A😀B';
    // 'A' -> offset 0 (length 1)
    // '😀' -> high surrogate at 1, low surrogate at 2
    // 'B' -> offset 3

    expect(OffsetTransformer.isHighSurrogate(text, 1)).toBe(true);
    expect(OffsetTransformer.isLowSurrogate(text, 2)).toBe(true);

    // If offset is pointing to the low surrogate (middle of emoji), shift back to start
    expect(OffsetTransformer.adjustSurrogateOffset(text, 2)).toBe(1);
    expect(OffsetTransformer.adjustSurrogateOffset(text, 1)).toBe(1);
    expect(OffsetTransformer.adjustSurrogateOffset(text, 3)).toBe(3);
  });

  it('inserts and deletes emojis without corrupting surrogate pairs', () => {
    const buffer = new PieceTreeTextBuffer('Rocket: 🚀');
    buffer.insert(buffer.getLength(), ' Fire: 🔥');
    expect(buffer.getText()).toBe('Rocket: 🚀 Fire: 🔥');

    // Delete the fire emoji (length 2)
    const fireOffset = buffer.getText().indexOf('🔥');
    buffer.delete(fireOffset, 2);
    expect(buffer.getText()).toBe('Rocket: 🚀 Fire: ');
  });

  it('preserves surrogate pairs when text crosses chunk boundaries', () => {
    // Generate text with an emoji right at the ~65535 boundary
    const padding = 'x'.repeat(65534);
    const text = padding + '😀' + 'tail';
    const buffer = new PieceTreeTextBuffer(text);

    expect(buffer.getLength()).toBe(text.length);
    expect(buffer.getText().slice(-6)).toBe('😀tail');
  });

  it('calculates visible columns for emojis without cursor drift (Monaco CursorColumns)', () => {
    // Test a cluster of many emojis
    const emojiLine = '🚀🔥⚡💀😀🎉✨❤️';
    const charWidth = 8.4;
    const viewport = new Viewport(21, charWidth);

    // Each emoji must take exactly 2 visible columns
    const totalVisible = CursorColumns.visibleColumnFromColumn(emojiLine, emojiLine.length + 1);
    expect(totalVisible).toBe(16); // 8 emojis * 2 = 16 columns

    // Pixel X offset at the end of 8 emojis must be 16 * charWidth
    const endX = viewport.getColumnLeft(emojiLine.length + 1, emojiLine);
    expect(endX).toBeCloseTo(16 * charWidth);

    // Test with 20 emojis in a row
    const twentyEmojis = '🚀'.repeat(20);
    const visCols20 = CursorColumns.visibleColumnFromColumn(twentyEmojis, twentyEmojis.length + 1);
    expect(visCols20).toBe(40); // 20 emojis * 2 columns = 40 columns
    const endX20 = viewport.getColumnLeft(twentyEmojis.length + 1, twentyEmojis);
    expect(endX20).toBeCloseTo(40 * charWidth);

    // Test mapping X coordinate back to model column (no cursor landing inside an emoji)
    for (let i = 0; i < 20; i++) {
      const clickX = (i * 2) * charWidth + (charWidth * 0.5); // inside the i-th emoji
      const modelCol = viewport.getColumnAtX(clickX, twentyEmojis.length, twentyEmojis);
      // Model column should land on an emoji boundary (odd index: 1, 3, 5, 7, ...)
      expect((modelCol - 1) % 2).toBe(0);
    }
  });

  it('correctly calculates visual widths for complex ZWJ, skin-tone, and keycap emojis', () => {
    // 1. ZWJ emoji (family: 👨‍👩‍👧‍👦 has length 11 UTF-16 code units)
    const zwj = '👨‍👩‍👧‍👦';
    expect(zwj.length).toBe(11);
    const zwjWidth = CursorColumns.visibleColumnFromColumn(zwj, zwj.length + 1);
    expect(zwjWidth).toBe(2);

    // 2. Skin tone modifier (👍🏽 has length 4 UTF-16 code units)
    const skinTone = '👍🏽';
    expect(skinTone.length).toBe(4);
    const skinToneWidth = CursorColumns.visibleColumnFromColumn(skinTone, skinTone.length + 1);
    expect(skinToneWidth).toBe(2);

    // 3. Single code point BMP emoji (⚡ has length 1)
    const singleChar = '⚡';
    expect(singleChar.length).toBe(1);
    const singleCharWidth = CursorColumns.visibleColumnFromColumn(singleChar, singleChar.length + 1);
    expect(singleCharWidth).toBe(2);

    // 4. Keycap emoji (1️⃣ has length 3)
    const keycap = '1️⃣';
    expect(keycap.length).toBe(3);
    const keycapWidth = CursorColumns.visibleColumnFromColumn(keycap, keycap.length + 1);
    expect(keycapWidth).toBe(2);
  });
});

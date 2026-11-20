import { describe, it, expect } from 'vitest';
import { PieceTreeTextBuffer } from '@mythic/core/buffer/PieceTreeTextBuffer';
import { OffsetTransformer } from '@mythic/core/model/OffsetTransformer';

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
});

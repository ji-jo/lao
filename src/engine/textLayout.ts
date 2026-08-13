export interface GlyphLayout {
  char: string;
  x: number;
  width: number;
}

export interface TextLayoutResult {
  glyphs: GlyphLayout[];
  totalWidth: number;
  baselineY: number;
}

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export function layoutText(
  text: string,
  fontFamily: string,
  fontSize: number,
  letterSpacing: number
): TextLayoutResult {
  if (!text) {
    return { glyphs: [], totalWidth: 0, baselineY: fontSize };
  }

  // Create a temporary canvas context for measuring
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { glyphs: [], totalWidth: 0, baselineY: fontSize };
  }

  ctx.font = `${fontSize}px "${fontFamily}"`;

  const graphemes = Array.from(segmenter.segment(text)).map(s => s.segment);
  const glyphs: GlyphLayout[] = [];
  
  let currentX = 0;

  for (let i = 0; i < graphemes.length; i++) {
    const char = graphemes[i];
    const metrics = ctx.measureText(char);
    
    // We want the width of the char to advance the cursor.
    // actualBoundingBoxRight + actualBoundingBoxLeft can be used, but width is safer for generic advance.
    const charWidth = metrics.width;
    
    glyphs.push({
      char,
      x: currentX,
      width: charWidth
    });

    currentX += charWidth + letterSpacing;
  }

  // The last letter spacing shouldn't count towards total width
  const totalWidth = currentX > 0 ? currentX - letterSpacing : 0;
  
  return {
    glyphs,
    totalWidth,
    baselineY: fontSize, // Simplified baseline for MVP
  };
}

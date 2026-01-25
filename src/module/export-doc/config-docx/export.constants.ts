// export.constants.ts
export const DOCX_STYLES = {
  fonts: {
    body: 'Charter',
    heading: 'Inter',
  },
  sizes: {
    title: 32, // docx tính theo half-points (1/144 inch) nên cần x2
    subtitle: 20,
    author: 18,
    chapterTitle: 24,
    h1: 20,
    h2: 18,
    h3: 16,
    body: 12,
  },
  spacing: {
    paragraphBefore: 200,
    paragraphAfter: 200,
    chapterBefore: 400,
    chapterAfter: 300,
    headingAfter: 150,
    headingBefore: 100,
  },
};

export const TYPOGRAPHY = {
  fonts: {
    serif: 'Times-Roman',
    serifBold: 'TImes-Bold',
    sans: 'Helvetica',
    sansBold: 'Helvetica-Bold',
    sansOblique: 'Helvetica-Oblique',
    serifItalic: 'Times-Italic',
  },
  sizes: {
    title: 28,
    author: 16,
    chapterTitle: 20,
    h1: 18,
    h2: 16,
    h3: 14,
    body: 12,
    caption: 9,
  },
  spacing: {
    paragraphSpacing: 12,
    chapterSpacing: 24,
    headingSpacing: { before: 16, after: 8 },
    listSpacing: 6,
  },
  colors: {
    text: '#333333',
    heading: '#1A1A1A',
    accent: '#4F46E5',
  },
};

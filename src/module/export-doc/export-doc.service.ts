import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BooksService } from '../books/books.service';
import * as fs from 'node:fs';
import { join } from 'node:path';
import {
  Document,
  Packer,
  Paragraph,
  ImageRun,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Level,
} from 'docx';
import PDFDocuments from 'pdfkit';
import MarkdownIt from 'markdown-it';
import { DOCX_STYLES, TYPOGRAPHY } from './config-docx/export.constants';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { ChaptersService } from '../chapters/chapters.service';

@Injectable()
export class ExportDocService {
  constructor(
    private readonly bookService: BooksService,
    private readonly cloudinaryService: CloudinaryService,
    private readonly chaptersService: ChaptersService,
  ) {}

  async exportDoc(id: string): Promise<Buffer> {
    try {
      // 1. find a book
      const book = await this.bookService.findOne(id);
      if (!book) {
        throw new NotFoundException('Book not found');
      }
      const sections: any[] = [];
      const coverPage: any[] = [];

      // 2. Xử lý Ảnh bìa (Cover Image)
      if (book.imageUrl && book.imageUrl !== null) {
        const imageBuffer = await this.cloudinaryService.getBufferFromUrl(
          book.imageUrl,
        );

        try {
          coverPage.push(
            new Paragraph({ text: '', spacing: { before: 1000 } }),
          );
          coverPage.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 200, after: 400 },
              children: [
                new ImageRun({
                  data: imageBuffer,
                  transformation: { width: 400, height: 550 },
                } as any),
              ],
            }),
          );
          coverPage.push(
            new Paragraph({
              text: '',
              pageBreakBefore: true,
            }),
          );
        } catch (error) {
          // throw new BadRequestException(
          //   `Could not embed image ${imageBuffer}`,
          //   error,
          // );
          console.error(`Could not embed image: ${error.message}`);
        }
      }
      sections.push(...coverPage);

      // 3. Title Page sections
      const titlePage: any[] = [];

      titlePage.push(
        new Paragraph({
          children: [
            new TextRun({
              text: book.title,
              bold: true,
              font: DOCX_STYLES.fonts.heading,
              size: DOCX_STYLES.sizes.title * 2,
              color: '1A202C',
            }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { before: 2000 },
        }),
      );
      //4. subtitle if exists
      if (book.subtitle && book.subtitle.trim()) {
        titlePage.push(
          new Paragraph({
            children: [
              new TextRun({
                text: book.subtitle,
                font: DOCX_STYLES.fonts.heading,
                color: '4A5568',
              }),
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
          }),
        );
      }
      // 5. Author
      titlePage.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `by ${book.author}`,
              font: DOCX_STYLES.fonts.heading,
              size: DOCX_STYLES.sizes.author * 2,
              color: '2D3748',
            }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
        }),
      );
      // 6. Decorative line
      titlePage.push(
        new Paragraph({
          text: '',
          border: {
            bottom: {
              color: '4F46E5',
              space: 1,
              style: 'single',
              size: 12,
            },
          },
          alignment: AlignmentType.CENTER,
          spacing: { before: 400 },
        }),
      );
      sections.push(...titlePage);
      //7. process chapters
      const chapters = await this.chaptersService.getChaptersByBookId(id);
      if (!chapters) {
        throw new NotFoundException('Chapters not found');
      }

      chapters.forEach((chapter, index) => {
        try {
          if (index > 0) {
            // Page break before each chapter (except first)
            sections.push(
              new Paragraph({
                text: '',
                pageBreakBefore: true,
              }),
            );
          }

          // chapter title
          sections.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: chapter.title,
                  bold: true,
                  font: DOCX_STYLES.fonts.heading,
                  size: DOCX_STYLES.sizes.chapterTitle * 2,
                  color: '1A202C',
                }),
              ],
              spacing: {
                before: DOCX_STYLES.spacing.chapterBefore,
                after: DOCX_STYLES.spacing.chapterAfter,
              },
            }),
          );
          // chapter content
          const contentParagraph = this.processMarkdownToDocx(
            chapter.content || '',
          );
          sections.push(...contentParagraph);
        } catch (error) {
          throw new BadRequestException(
            `Error processing chapter ${index}`,
            error,
          );
        }
      });
      // 8. Create a new Document
      const doc = new Document({
        sections: [
          {
            properties: {
              page: {
                margin: {
                  top: 1440, // 1 inch,
                  right: 1440,
                  bottom: 1440,
                  left: 1440,
                },
              },
            },
            children: sections,
          },
        ],
      });
      // generate docx buffer
      const buffer = await Packer.toBuffer(doc);
      // 9. Return buffer
      return buffer;
    } catch (error) {
      throw new BadRequestException('Error exporting document', error);
    }
  }
  async exportPdf(id: string): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
      try {
        // 1. find a book
        const book = await this.bookService.findOne(id);
        if (!book) {
          throw new NotFoundException('Book not found');
        }
        // Create PDF with safe settings
        const doc = new PDFDocuments({
          margin: 72,
          bufferPages: true,
          autoFirstPage: true,
        });
        // Gom dữ liệu PDF vào mảng chunks
        const chunks: any[] = [];
        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', (err) => reject(err));

        if (book.imageUrl && book.imageUrl !== null) {
          const imageBuffer = await this.cloudinaryService.getBufferFromUrl(
            book.imageUrl,
          );
          try {
            const pageWith =
              doc.page.width - doc.page.margins.left - doc.page.margins.right;
            const pageHeight =
              doc.page.height - doc.page.margins.top - doc.page.margins.bottom;

            doc.image(
              imageBuffer,
              doc.page.margins.left,
              doc.page.margins.top,
              {
                fit: [pageWith * 0.8, pageHeight * 0.8],
                align: 'center',
                valign: 'center',
              },
            );
            doc.addPage();
          } catch (error) {
            console.error(
              `Could not embed image for book: ${book.title}`,
              error,
            );
          }
        }
        // Title Page
        doc
          .font(TYPOGRAPHY.fonts.sansBold)
          .fontSize(TYPOGRAPHY.sizes.title)
          .fillColor(TYPOGRAPHY.colors.heading)
          .text(book.title, { align: 'center' });
        doc.moveDown(2);

        if (book.subtitle && book.subtitle.trim()) {
          doc
            .font(TYPOGRAPHY.fonts.sans)
            .fontSize(TYPOGRAPHY.sizes.h2)
            .fillColor(TYPOGRAPHY.colors.text)
            .text(book.subtitle, { align: 'center' });
          doc.moveDown(1);
        }
        doc.font(TYPOGRAPHY.fonts.sans).fontSize(TYPOGRAPHY.sizes.author);
        doc.fillColor(TYPOGRAPHY.colors.text);
        doc.text(`by ${book.author}`, { align: 'center' });
        // Process chapters
        const chapters = await this.chaptersService.getChaptersByBookId(id);
        if (!chapters) {
          throw new NotFoundException('Chapters not found');
        }
        chapters.forEach((chapter, index) => {
          try {
            doc.addPage();

            // chapter title
            doc
              .font(TYPOGRAPHY.fonts.sansBold)
              .fontSize(TYPOGRAPHY.sizes.chapterTitle)
              .fillColor(TYPOGRAPHY.colors.heading)
              .text(chapter.title || `Chapter ${index + 1}`, {
                align: 'left',
              });
            doc.moveDown(
              TYPOGRAPHY.spacing.chapterSpacing / TYPOGRAPHY.sizes.body,
            );
            // chapter content
            if (chapter.content && chapter.content.trim()) {
              this.renderMarkdown(doc, chapter.content);
            }
          } catch (error) {
            console.error(`Error chapter ${index}`, error);
          }
        });
        // End document
        doc.end();
      } catch (error) {
        console.error(' Error exporting PDF: ', error);
        reject(error);
      }
    });
  }
  //Helper render inline
  private renderInlineTokens(
    doc: PDFKit.PDFDocument,
    tokens: any[],
    options: any = {},
  ) {
    if (!tokens || tokens.length === 0) return;
    const baseOptions = {
      align: options.align || 'justify',
      indent: options.indent || 0,
      lineGap: options.lineGap || 2,
    };
    let currentFont = TYPOGRAPHY.fonts.serif;
    let textBuffer = '';
    const flushBuffer = () => {
      if (textBuffer) {
        doc.font(currentFont).text(textBuffer, {
          ...baseOptions,
          continued: true,
        });
        textBuffer = '';
      }
    };
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (token.type === 'text') {
        textBuffer += token.content;
      } else if (token.type === 'strong_open') {
        flushBuffer();
        currentFont = TYPOGRAPHY.fonts.sansBold;
      } else if (token.type === 'strong_close') {
        flushBuffer();
        currentFont = TYPOGRAPHY.fonts.serif;
      } else if (token.type === 'em_open') {
        flushBuffer();
        currentFont = TYPOGRAPHY.fonts.serifItalic;
      } else if (token.type === 'em_close') {
        flushBuffer();
        currentFont = TYPOGRAPHY.fonts.serif;
      } else if (token.type === 'code_inline') {
        flushBuffer();
        doc
          .font('Courier')
          .text(token.content, { ...baseOptions, continued: true });
        doc.font(currentFont);
      }
    }
    if (textBuffer) {
      doc.font(currentFont).text(textBuffer, {
        ...baseOptions,
        continued: false,
      });
    } else {
      doc.text('', { continued: false });
    }
  }
  // Helper render markdown
  private renderMarkdown(doc: PDFKit.PDFDocument, markdown: any) {
    if (!markdown || markdown.trim() === '') return;
    const md = new MarkdownIt();
    const tokens = md.parse(markdown, {});
    let inList = false;
    let listType: string | null = null;
    let orderedCounter = 1;

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      try {
        if (token.type === 'heading_open') {
          const level = parseInt(token.tag.substring(1, 10));
          let fontSize;

          switch (level) {
            case 1:
              fontSize = TYPOGRAPHY.sizes.h1;
              break;
            case 2:
              fontSize = TYPOGRAPHY.sizes.h2;
              break;
            case 3:
              fontSize = TYPOGRAPHY.sizes.h3;
              break;
            default:
              fontSize = TYPOGRAPHY.sizes.h3;
              break;
          }
          doc.moveDown(
            TYPOGRAPHY.spacing.headingSpacing.before / TYPOGRAPHY.sizes.body,
          );
          doc
            .font(TYPOGRAPHY.fonts.sansBold)
            .fontSize(fontSize)
            .fillColor(TYPOGRAPHY.colors.heading);
          if (i + 1 < tokens.length && tokens[i + 1].type === 'inline') {
            this.renderInlineTokens(doc, tokens[i + 1].children!, {
              align: 'left',
              lineGap: 0,
            });
            i++;
          }
          doc.moveDown(
            TYPOGRAPHY.spacing.headingSpacing.after / TYPOGRAPHY.sizes.body,
          );
          if (i + 1 < tokens.length && tokens[i + 1].type === 'heading_close') {
            i++;
          }
        } else if (token.type === 'paragraph_open') {
          doc
            .font(TYPOGRAPHY.fonts.serif)
            .fontSize(TYPOGRAPHY.sizes.body)
            .fillColor(TYPOGRAPHY.colors.text);
          if (i + 1 < tokens.length && tokens[i + 1].type === 'inline') {
            this.renderInlineTokens(doc, tokens[i + 1].children!, {
              align: 'justify',
              indent: inList ? 20 : 0,
            });
            i++;
          }
          if (!inList) {
            doc.moveDown(
              TYPOGRAPHY.spacing.paragraphSpacing / TYPOGRAPHY.sizes.body,
            );
          } else if (
            i + 1 < tokens.length &&
            tokens[i + 1].type === 'paragraph_close'
          ) {
            i++;
          }
        } else if (token.type === 'bullet_list_open') {
          inList = true;
          listType = 'bullet';
          doc.moveDown(TYPOGRAPHY.spacing.listSpacing / TYPOGRAPHY.sizes.body);
        } else if (token.type === 'bullet_list_close') {
          inList = false;
          listType = null;
          doc.moveDown(
            TYPOGRAPHY.spacing.paragraphSpacing / TYPOGRAPHY.sizes.body,
          );
        } else if (token.type === 'ordered_list_open') {
          inList = true;
          listType = 'ordered';
          orderedCounter = 1;
          doc.moveDown(TYPOGRAPHY.spacing.listSpacing / TYPOGRAPHY.sizes.body);
        } else if (token.type === 'ordered_list_close') {
          inList = false;
          listType = null;
          orderedCounter = 1;
          doc.moveDown(
            TYPOGRAPHY.spacing.paragraphSpacing / TYPOGRAPHY.sizes.body,
          );
        } else if (token.type === 'list_item_open') {
          let bullet = '';
          if (listType === 'bullet') {
            bullet = '•';
          } else if (listType === 'ordered') {
            bullet = `${orderedCounter}.`;
            orderedCounter++;
          }
          doc
            .font(TYPOGRAPHY.fonts.serif)
            .fontSize(TYPOGRAPHY.sizes.body)
            .fillColor(TYPOGRAPHY.colors.text);
          doc.text(bullet, { continued: true, indent: 20 });
          for (let j = i + 1; j < tokens.length; j++) {
            if (tokens[j].type === 'inline' && tokens[j].children) {
              this.renderInlineTokens(doc, tokens[j].children!, {
                align: 'left',
                lineGap: 2,
              });
              break;
            } else if (tokens[j].type === 'list_item_close') {
              break;
            }
          }
          doc.moveDown(TYPOGRAPHY.spacing.listSpacing / TYPOGRAPHY.sizes.body);
        } else if (token.type === 'code_block' || token.type === 'fence') {
          doc.moveDown(
            TYPOGRAPHY.spacing.paragraphSpacing / TYPOGRAPHY.sizes.body,
          );
          doc
            .font('Courier')
            .fontSize(9)
            .fillColor(TYPOGRAPHY.colors.text)
            .text(token.content, {
              indent: 20,
              align: 'left',
            });
          doc.font(TYPOGRAPHY.fonts.serif).fontSize(TYPOGRAPHY.sizes.body);
          doc.moveDown(
            TYPOGRAPHY.spacing.paragraphSpacing / TYPOGRAPHY.sizes.body,
          );
        } else if (token.type === 'hr') {
          doc.moveDown();
          const y = doc.y;
          doc
            .moveTo(doc.page.margins.left, y)
            .lineTo(doc.page.width - doc.page.margins.right, y)
            .stroke();
          doc.moveDown();
        }
      } catch (error) {
        console.error(`Error processing token: ${token.type}`, error);
        continue;
      }
    }
  }
  // Helper function to convert markdown to docx paragraphs
  private processMarkdownToDocx(markdown: any): Paragraph[] {
    const md = new MarkdownIt();
    const tokens = md.parse(markdown, {});
    const paragraphs: any[] = [];
    let inList = false;
    let listType: null | string = null;
    let orderedCounter = 1;
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      try {
        if (token.type === 'heading_open') {
          const level = parseInt(token.tag.substring(1, 10));
          const nextToken = tokens[i + 1];
          if (nextToken && nextToken.type === 'inline') {
            let headingLevel;
            let fontSize;
            switch (level) {
              case 1:
                headingLevel = HeadingLevel.HEADING_1;
                fontSize = DOCX_STYLES.sizes.h1;
                break;
              case 2:
                headingLevel = HeadingLevel.HEADING_2;
                fontSize = DOCX_STYLES.sizes.h2;
                break;
              case 3:
                headingLevel = HeadingLevel.HEADING_3;
                fontSize = DOCX_STYLES.sizes.h3;
                break;
              default:
                headingLevel = HeadingLevel.HEADING_3;
                fontSize = DOCX_STYLES.sizes.h3;
            }
            paragraphs.push(
              new Paragraph({
                text: nextToken.content,
                heading: headingLevel,
                spacing: {
                  before: DOCX_STYLES.spacing.headingBefore,
                  after: DOCX_STYLES.spacing.headingAfter,
                },
                children: [
                  new TextRun({
                    text: nextToken.content,
                    font: DOCX_STYLES.fonts.heading,
                    size: fontSize * 2, // docx uses half-points
                    bold: true,
                    color: '1A202C',
                  }),
                ],
              }),
            );
            i += 2; // skip inline and heading_close
          }
        } else if (token.type === 'paragraph_open') {
          const nextToken = tokens[i + 1];
          if (nextToken && nextToken.type === 'inline' && nextToken.children) {
            const textRuns = this.processInlineContent(nextToken.children);
            if (textRuns.length > 0) {
              paragraphs.push(
                new Paragraph({
                  children: textRuns,
                  spacing: {
                    before: inList ? 100 : DOCX_STYLES.spacing.paragraphBefore,
                    after: inList ? 100 : DOCX_STYLES.spacing.paragraphAfter,
                    line: 360,
                  },
                  alignment: AlignmentType.JUSTIFIED,
                }),
              );
            }
            i += 2;
          }
        } else if (token.type === 'bullet_list_open') {
          inList = true;
          listType = 'bullet';
        } else if (token.type === 'bullet_list_close') {
          ((inList = false), (listType = null));
          // Add spacing after list
          paragraphs.push(new Paragraph({ text: '', spacing: { after: 100 } }));
        } else if (token.type === 'ordered_list_open') {
          ((inList = true), (listType = 'ordered'));
          orderedCounter = 1;
        } else if (token.type === 'ordered_list_close') {
          ((inList = false), (listType = null));
          orderedCounter = 1;
          paragraphs.push(new Paragraph({ text: '', spacing: { after: 100 } }));
        } else if (token.type === 'list_item_open') {
          const nextToken = tokens[i + 1];
          if (nextToken && nextToken.type === 'paragraph_open') {
            const inlineToken = tokens[i + 2];
            if (
              inlineToken &&
              inlineToken.type === 'inline' &&
              inlineToken.children
            ) {
              const textRuns = this.processInlineContent(inlineToken.children);
              let bulletText = '';
              if (listType === 'bullet') {
                bulletText = '• ';
              } else if (listType === 'ordered') {
                bulletText = `${orderedCounter}•`;
                orderedCounter++;
              }
              paragraphs.push(
                new Paragraph({
                  children: [
                    new TextRun({
                      text: bulletText,
                      font: DOCX_STYLES.fonts.body,
                    }),
                    ...textRuns,
                  ],
                  spacing: { before: 50, after: 50 },
                  indent: { left: 720 }, // 0.5 inch indent
                }),
              );
              i += 4; // skip paragraph_open, inline, paragraph_close, list_item_close
            }
          }
        } else if (token.type === 'blockquote_open') {
          const nextToken = tokens[i + 1]; // find the blockquote content
          if (nextToken && nextToken.type === 'paragraph_open') {
            const inlineToken = tokens[i + 2];
            if (inlineToken && inlineToken.type === 'inline') {
              paragraphs.push(
                new Paragraph({
                  children: [
                    new TextRun({
                      text: inlineToken.content,
                      font: DOCX_STYLES.fonts.body,
                      italics: true,
                      color: '666666',
                    }),
                  ],
                  spacing: { before: 200, after: 200 },
                  indent: { left: 720 },
                  alignment: AlignmentType.JUSTIFIED,
                  border: {
                    left: {
                      color: '4F46E5',
                      space: 1,
                      style: 'single',
                      size: 24,
                    },
                  },
                }),
              );
              i += 4;
            }
          }
        } else if (token.type === 'code_block' || token.type === 'fence') {
          paragraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: token.content,
                  font: 'Courier New',
                  size: 20,
                  color: '333333',
                }),
              ],
              spacing: { before: 200, after: 200 },
              shading: {
                fill: 'F5F5F5',
              },
            }),
          );
        } else if (token.type === 'hr') {
          paragraphs.push(
            new Paragraph({
              text: '',
              border: {
                bottom: {
                  color: 'CCCCCC',
                  space: 1,
                  style: 'single',
                  size: 6,
                },
              },
              spacing: { before: 200, after: 200 },
            }),
          );
        }
      } catch (error) {
        console.error(`Error processing token: ${token.type}`, error);
        continue;
      }
    }
    return paragraphs;
  }
  // Process inline content (bold, italic, text)
  private processInlineContent(children: any[]) {
    const textRuns: any[] = [];
    let currentFormatting = { bold: false, italic: false };
    let textBuffer = '';

    const flushText = () => {
      if (textBuffer !== '') {
        textRuns.push(
          new TextRun({
            text: textBuffer,
            bold: currentFormatting.bold,
            italics: currentFormatting.italic,
            font: DOCX_STYLES.fonts.body,
            size: DOCX_STYLES.sizes.body * 2,
          }),
        );
      }
      textBuffer = '';
    };
    children.forEach((child: any) => {
      if (child.type === 'strong_open') {
        flushText();
        currentFormatting.bold = true;
      } else if (child.type === 'strong_close') {
        flushText();
        currentFormatting.bold = false;
      } else if (child.type === 'em_open') {
        flushText();
        currentFormatting.italic = true;
      } else if (child.type === 'em_close') {
        flushText();
        currentFormatting.italic = false;
      } else if (child.type === 'text') {
        textBuffer += child.content;
      } else if (child.type === 'softbreak' || child.type === 'hardbreak') {
        flushText();
        textBuffer += ' '; // Chuyển break line thành space trong Word Paragraph
      }
    });
    flushText();
    return textRuns;
  }
}

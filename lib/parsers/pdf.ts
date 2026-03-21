import { PDFParse } from 'pdf-parse'
export async function parsePdf(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer, verbosity: 0 })
  const result = await parser.getText()
  return result.text
}

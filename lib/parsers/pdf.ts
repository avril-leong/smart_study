export async function parsePdf(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import('pdf-parse')
  const parser = new PDFParse({ data: buffer, verbosity: 0 })
  const result = await parser.getText()
  return result.text
}

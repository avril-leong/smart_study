import pdfParse from 'pdf-parse'
export async function parsePdf(buffer: Buffer): Promise<string> {
  const result = await pdfParse(buffer)
  return result.text
}

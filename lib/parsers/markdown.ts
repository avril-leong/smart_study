import { marked } from 'marked'
export async function parseMarkdown(buffer: Buffer): Promise<string> {
  const html = await marked(buffer.toString('utf-8'))
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

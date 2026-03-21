export async function parseDocx(buffer: Buffer): Promise<string> {
  const { default: officeParser } = await import('officeparser')
  const ast = await officeParser.parseOffice(buffer, { outputErrorToConsole: false })
  return ast.toText()
}

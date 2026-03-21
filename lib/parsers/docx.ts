import officeParser from 'officeparser'
export async function parseDocx(buffer: Buffer): Promise<string> {
  const ast = await officeParser.parseOffice(buffer, { outputErrorToConsole: false })
  return ast.toText()
}

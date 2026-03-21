import officeParser from 'officeparser'
export async function parsePptx(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    officeParser.parseOfficeAsync(buffer, { outputErrorToConsole: false })
      .then(resolve).catch(reject)
  })
}

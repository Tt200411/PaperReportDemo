import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import mammoth from 'mammoth'
import { PDFParse } from 'pdf-parse'

const execFileAsync = promisify(execFile)
const tempRoot = await mkdtemp(join(tmpdir(), 'ai-study-docs-'))
const textPath = join(tempRoot, 'sample.txt')
const docxPath = join(tempRoot, 'sample.docx')
const pdfPath = join(tempRoot, 'sample.pdf')
const content = '课程报告要求\n字数 3000\n引用必须真实\n'

await writeFile(textPath, content, 'utf8')
await execFileAsync('/usr/bin/textutil', ['-convert', 'docx', textPath, '-output', docxPath])
await execFileAsync('/usr/sbin/cupsfilter', [textPath], {
  encoding: 'buffer',
  maxBuffer: 10 * 1024 * 1024
}).then(async ({ stdout }) => {
  await writeFile(pdfPath, stdout)
})

const docx = await mammoth.extractRawText({ path: docxPath })
assert.match(docx.value, /课程报告要求/)
assert.match(docx.value, /引用必须真实/)

const parser = new PDFParse({ data: readFileSync(pdfPath) })
const pdf = await parser.getText()
await parser.destroy()
assert.match(pdf.text, /课程报告要求/)
assert.match(pdf.text, /3000/)

console.log('Document smoke test passed.')

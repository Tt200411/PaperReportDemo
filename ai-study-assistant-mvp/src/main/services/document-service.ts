import { app, dialog } from 'electron'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import { createHash } from 'node:crypto'
import mammoth from 'mammoth'
import { PDFParse } from 'pdf-parse'
import type { DocumentExtraction, UploadedDocumentPayload } from '@shared/types'

const MAX_TEXT_LENGTH = 20000

export async function pickAndExtractDocuments(): Promise<DocumentExtraction[]> {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Supported Documents', extensions: ['pdf', 'docx'] }
    ]
  })

  if (result.canceled) {
    return []
  }

  return extractDocumentsFromPaths(result.filePaths)
}

export async function extractDocumentsFromPaths(paths: string[]): Promise<DocumentExtraction[]> {
  return Promise.all(paths.map((path) => extractDocument(path)))
}

export async function extractDocumentsFromUploads(
  payloads: UploadedDocumentPayload[]
): Promise<DocumentExtraction[]> {
  const tempDir = `${app.getPath('temp')}/ai-study-assistant-uploads`
  await mkdir(tempDir, { recursive: true })

  return Promise.all(
    payloads.map(async (payload) => {
      const tempPath = `${tempDir}/${Date.now()}-${createHash('sha1')
        .update(`${payload.name}-${payload.size}`)
        .digest('hex')
        .slice(0, 8)}-${payload.name.replace(/[^\w.-]+/g, '_')}`
      const buffer = Buffer.from(payload.dataBase64, 'base64')
      await writeFile(tempPath, buffer)

      return extractDocumentFromBuffer({
        path: tempPath,
        name: payload.name,
        extension: payload.extension,
        buffer
      })
    })
  )
}

async function extractDocument(path: string): Promise<DocumentExtraction> {
  const buffer = await readFile(path)
  return extractDocumentFromBuffer({
    path,
    name: basename(path),
    extension: extname(path).toLowerCase(),
    buffer
  })
}

async function extractDocumentFromBuffer(input: {
  path: string
  name: string
  extension: string
  buffer: Buffer
}): Promise<DocumentExtraction> {
  const extension = input.extension.toLowerCase()
  let extractedText = ''

  if (extension === '.pdf') {
    const parser = new PDFParse({ data: input.buffer })
    const parsed = await parser.getText()
    await parser.destroy()
    extractedText = parsed.text
  } else if (extension === '.docx') {
    const parsed = await mammoth.extractRawText({ buffer: input.buffer })
    extractedText = parsed.value
  } else {
    throw new Error(`Unsupported document type: ${extension}`)
  }

  const normalized = normalizeText(extractedText)
  return {
    id: createHash('sha1').update(input.path).digest('hex').slice(0, 12),
    name: input.name,
    path: input.path,
    extension,
    size: input.buffer.byteLength,
    extractedText: normalized,
    summary: summarizeDocument(normalized)
  }
}

function normalizeText(input: string): string {
  return input.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

function summarizeDocument(text: string): string {
  if (!text) {
    return '未能从文档中提取到可用文本。'
  }

  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const prioritized = lines.filter((line) =>
    /(要求|任务|格式|字数|submit|deadline|评分|评分标准|引用|结构|主题|prompt|question)/i.test(line)
  )

  const selected = [...prioritized, ...lines].slice(0, 12)
  const clipped = selected.join('\n')
  return clipped.slice(0, MAX_TEXT_LENGTH).trim()
}

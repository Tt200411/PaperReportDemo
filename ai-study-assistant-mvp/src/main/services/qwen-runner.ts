import { dirname } from 'node:path'
import type { BaselineRequest, GenerationResult } from '@shared/types'
import { getQwenRuntimeConfig } from './settings-service'
import { buildBaselinePrompt } from './prompt-builders'
import { appendSessionEvent, readSessionSnapshot, readSourceDocuments, writeBaseline } from './session-service'

interface QwenChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
}

export async function runQwenBaseline(request: BaselineRequest): Promise<GenerationResult> {
  const settings = getQwenRuntimeConfig()
  const [snapshot, documents] = await Promise.all([
    readSessionSnapshot(request.localSessionId),
    readSourceDocuments(request.localSessionId)
  ])

  if (!settings.apiKey.trim()) {
    throw new Error('Qwen runtime API key 缺失。')
  }

  const prompt = buildBaselinePrompt({
    skillId: snapshot.skillId,
    userIntent: snapshot.userIntent,
    documents
  })
  const endpoint = resolveQwenEndpoint(settings.baseUrl)
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey.trim()}`
    },
    body: JSON.stringify({
      model: settings.model.trim(),
      temperature: 0.6,
      enable_thinking: false,
      messages: [
        {
          role: 'system',
          content: '你是一个直接写作模型。不要解释过程，只输出最终 Markdown 内容。'
        },
        {
          role: 'user',
          content: prompt
        }
      ]
    })
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Qwen 请求失败：${response.status} ${body}`)
  }

  const data = (await response.json()) as QwenChatCompletionResponse
  const markdown = data.choices?.[0]?.message?.content?.trim()

  if (!markdown) {
    throw new Error('Qwen 返回为空。')
  }

  const baselinePath = await writeBaseline(request.localSessionId, markdown)
  const workspacePath = dirname(dirname(baselinePath))
  await appendSessionEvent(request.localSessionId, {
    type: 'qwen.baseline.completed',
    completedAt: new Date().toISOString(),
    outputPath: baselinePath,
    preview: markdown.slice(0, 240)
  })

  return {
    provider: 'qwen',
    markdown,
    raw: JSON.stringify(data, null, 2),
    workspacePath,
    outputPath: baselinePath
  }
}

function resolveQwenEndpoint(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/$/, '')
  if (normalized.endsWith('/chat/completions')) {
    return normalized
  }

  return `${normalized}/chat/completions`
}

import { getSkillDefinition } from '@shared/skills'
import type { DocumentExtraction, SkillId } from '@shared/types'

const DOCUMENT_CHAR_LIMIT = 12000

export function buildBaselinePrompt(input: {
  skillId: SkillId
  userIntent: string
  documents: DocumentExtraction[]
}): string {
  const skill = getSkillDefinition(input.skillId)
  const documents = serializeDocuments(input.documents)

  return [
    `你是一个直接生成终稿的对照组模型。请直接生成 ${skill.outputLabel}。`,
    '',
    '规则：',
    '- 不要发起提问，不要展示分析过程，不要解释方法。',
    '- 只基于用户意图和文档内容生成结果。',
    '- 不要编造用户经历、文献、数据、实验结果或外部事实；如缺信息，用 `[[TO_VERIFY]]` 标记。',
    '',
    `任务描述：\n${input.userIntent.trim() || '[[未填写]]'}`,
    '',
    `上传文档提取内容：\n${documents}`,
    '',
    `输出类型：${skill.outputLabel}`,
    '只返回完整 Markdown 正文，不要加任何解释。'
  ].join('\n')
}

function serializeDocuments(documents: DocumentExtraction[]): string {
  if (documents.length === 0) {
    return '未上传文档。'
  }

  return documents
    .map((document) => {
      const content = clipBlock(document.extractedText || document.summary, DOCUMENT_CHAR_LIMIT)
      return `## ${document.name}\n${content}`
    })
    .join('\n\n')
}

function clipBlock(input: string, limit: number): string {
  return input.trim().slice(0, limit)
}

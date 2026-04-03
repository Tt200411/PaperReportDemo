import type { SkillDefinition, SkillId } from './types'

export const SKILLS: SkillDefinition[] = [
  {
    id: 'essay-craft',
    title: '申请文书',
    subtitle: 'SOP / PS / Personal Statement',
    description:
      '调用外部 essay-craft skill，真实触发 `/essay-craft`，面向留学申请文书与相关材料写作。',
    slashCommand: '/essay-craft',
    activationSignals: ['你申请的是什么类型的文书', 'Statement of Purpose (SOP)', 'Personal Statement (PS)'],
    outputLabel: '申请文书成稿'
  },
  {
    id: 'report-ta-orchestrator',
    title: '报告写作',
    subtitle: '课程报告 / 研究报告 / 实验报告',
    description:
      '调用外部 report-ta-orchestrator skill，真实触发 `/report-ta-orchestrator`，保留 references 与 scripts 的原始能力。',
    slashCommand: '/report-ta-orchestrator',
    activationSignals: ['[进度：1/6 - 写作共识]', '论文/报告写作总控台', '写作共识'],
    outputLabel: '报告写作成稿'
  }
]

export function getSkillDefinition(id: SkillId): SkillDefinition {
  const skill = SKILLS.find((item) => item.id === id)

  if (!skill) {
    throw new Error(`Unknown skill id: ${id}`)
  }

  return skill
}

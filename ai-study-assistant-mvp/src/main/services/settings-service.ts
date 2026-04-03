import type { SkillId } from '@shared/types'

interface QwenRuntimeConfig {
  baseUrl: string
  apiKey: string
  model: string
}

interface ClaudeRuntimeConfig {
  env: Record<string, string>
}

interface SkillInstallSpec {
  sourcePath: string
  installDirectoryName: SkillId
}

export interface RuntimeConfig {
  claude: ClaudeRuntimeConfig
  qwen: QwenRuntimeConfig
  skills: Record<SkillId, SkillInstallSpec>
}

const runtimeConfig: RuntimeConfig = {
  claude: {
    env: {
      ANTHROPIC_BASE_URL: 'https://api.uniapi.io/claude',
      ANTHROPIC_AUTH_TOKEN: 'sk-uXJRNgicDuxFSVv__zov9CCe331jEunxIIUs2CRBeiieSxWnDPWvFb54vXA',
      CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS: '1',
      CLAUDE_CODE_ATTRIBUTION_HEADER: '0'
    }
  },
  qwen: {
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKey: 'sk-2ca5afeaa2ec4ebbbff34a15e86731b3',
    model: 'qwen3.5-plus-2026-02-15'
  },
  skills: {
    'essay-craft': {
      sourcePath: '/Users/tangbao/project/思考/申请文书Skills/essay-craft',
      installDirectoryName: 'essay-craft'
    },
    'report-ta-orchestrator': {
      sourcePath: '/Users/tangbao/project/思考/Report_Skills',
      installDirectoryName: 'report-ta-orchestrator'
    }
  }
}

export function getRuntimeConfig(): RuntimeConfig {
  return {
    claude: {
      env: { ...runtimeConfig.claude.env }
    },
    qwen: {
      ...runtimeConfig.qwen
    },
    skills: {
      'essay-craft': { ...runtimeConfig.skills['essay-craft'] },
      'report-ta-orchestrator': { ...runtimeConfig.skills['report-ta-orchestrator'] }
    }
  }
}

export function getClaudeRuntimeEnv(): Record<string, string> {
  return { ...runtimeConfig.claude.env }
}

export function getQwenRuntimeConfig(): QwenRuntimeConfig {
  return { ...runtimeConfig.qwen }
}

export function listSkillInstallSpecs(): Array<{ skillId: SkillId } & SkillInstallSpec> {
  return (Object.entries(runtimeConfig.skills) as Array<[SkillId, SkillInstallSpec]>).map(
    ([skillId, spec]) => ({
      skillId,
      sourcePath: spec.sourcePath,
      installDirectoryName: spec.installDirectoryName
    })
  )
}

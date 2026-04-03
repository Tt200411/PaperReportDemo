import { app } from 'electron'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
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

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const repoRoot = resolve(projectRoot, '..')

const skillInstallDirectoryMap: Record<SkillId, SkillId> = {
  'essay-craft': 'essay-craft',
  'report-ta-orchestrator': 'report-ta-orchestrator'
}

const runtimeConfig: Omit<RuntimeConfig, 'skills'> = {
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
    skills: buildResolvedSkillSpecs()
  }
}

export function getClaudeRuntimeEnv(): Record<string, string> {
  return { ...runtimeConfig.claude.env }
}

export function getQwenRuntimeConfig(): QwenRuntimeConfig {
  return { ...runtimeConfig.qwen }
}

export function listSkillInstallSpecs(): Array<{ skillId: SkillId } & SkillInstallSpec> {
  return (Object.entries(buildResolvedSkillSpecs()) as Array<[SkillId, SkillInstallSpec]>).map(
    ([skillId, spec]) => ({
      skillId,
      sourcePath: spec.sourcePath,
      installDirectoryName: spec.installDirectoryName
    })
  )
}

function buildResolvedSkillSpecs(): Record<SkillId, SkillInstallSpec> {
  return {
    'essay-craft': {
      sourcePath: resolveSkillSourcePath('essay-craft'),
      installDirectoryName: skillInstallDirectoryMap['essay-craft']
    },
    'report-ta-orchestrator': {
      sourcePath: resolveSkillSourcePath('report-ta-orchestrator'),
      installDirectoryName: skillInstallDirectoryMap['report-ta-orchestrator']
    }
  }
}

function resolveSkillSourcePath(skillId: SkillId): string {
  const packagedCandidate = join(process.resourcesPath, 'resources', 'bundled-skills', skillId)
  const devCandidates = getDevelopmentSkillCandidates(skillId)
  const candidates = app.isPackaged ? [packagedCandidate, ...devCandidates] : devCandidates
  const resolved = candidates.find((candidate) => existsSync(candidate))

  if (!resolved) {
    throw new Error(
      `Skill source not found for ${skillId}. Looked in:\n${candidates
        .map((candidate) => `- ${candidate}`)
        .join('\n')}`
    )
  }

  return resolved
}

function getDevelopmentSkillCandidates(skillId: SkillId): string[] {
  const bundledCandidate = join(projectRoot, 'resources', 'bundled-skills', skillId)
  const projectSkillCandidate = join(projectRoot, 'skills', skillId)

  if (skillId === 'essay-craft') {
    return [
      bundledCandidate,
      projectSkillCandidate,
      join(repoRoot, 'skills', 'essay-craft'),
      join(repoRoot, '申请文书Skills', 'essay-craft')
    ]
  }

  return [
    bundledCandidate,
    projectSkillCandidate,
    join(repoRoot, 'skills', 'report-ta-orchestrator'),
    join(repoRoot, 'Report_Skills')
  ]
}

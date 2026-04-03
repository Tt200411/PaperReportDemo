import { app } from 'electron'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { getSkillDefinition } from '@shared/skills'
import type {
  ConversationMessage,
  SessionMessageRequest,
  SessionSnapshot,
  SessionStartRequest,
  SkillId
} from '@shared/types'
import { getClaudeRuntimeEnv } from './settings-service'
import {
  appendConversationMessages,
  appendSessionEvent,
  prepareSessionWorkspace,
  readSessionSnapshot,
  setSessionRuntimeState,
  updateClaudeSessionId,
  writeClaudeOutputVersion,
  writeClaudeRunArtifact
} from './session-service'

interface ClaudeCliEvent {
  type?: string
  subtype?: string
  session_id?: string
  result?: string
  is_error?: boolean
  duration_ms?: number
  total_cost_usd?: number
  message?: {
    id?: string
    content?: Array<
      | { type: 'text'; text: string }
      | { type: 'tool_use'; name?: string; input?: Record<string, unknown> }
      | { type: 'thinking'; thinking?: string }
    >
  }
  tool_use_result?: {
    success?: boolean
    commandName?: string
  }
}

interface ClaudeTurnResult {
  claudeSessionId: string
  finalText: string
  sourceMessageId: string | null
  rawStdout: string
  rawStderr: string
  exitCode: number
  skillCommandName: string | null
  skillDetection: 'event' | 'signal' | null
  durationMs: number | null
  totalCostUsd: number | null
  events: ClaudeCliEvent[]
}

class ClaudeTurnError extends Error {
  artifact: Omit<ClaudeTurnResult, 'exitCode'> & { exitCode: number | null }

  constructor(
    message: string,
    artifact: Omit<ClaudeTurnResult, 'exitCode'> & { exitCode: number | null }
  ) {
    super(message)
    this.name = 'ClaudeTurnError'
    this.artifact = artifact
  }
}

const CLAUDE_TIMEOUT_MS = 10 * 60 * 1000

export async function startSession(request: SessionStartRequest): Promise<SessionSnapshot> {
  ensureClaudeRuntime()
  validateStartRequest(request)

  const session = await prepareSessionWorkspace(request)
  const skill = getSkillDefinition(request.skillId)
  const userMessage = buildInitialUserMessage(request)

  await appendConversationMessages(session.localSessionId, [
    createConversationMessage({
      role: 'user',
      source: 'user',
      kind: 'text',
      content: userMessage
    })
  ])

  await runClaudeTurn({
    localSessionId: session.localSessionId,
    expectedSkillId: request.skillId,
    prompt: skill.slashCommand,
    persistAssistantOutput: false
  })

  await runClaudeTurn({
    localSessionId: session.localSessionId,
    prompt: buildInitialClaudeContextPrompt(request)
  })

  return readSessionSnapshot(session.localSessionId)
}

export async function continueSession(
  request: SessionMessageRequest
): Promise<SessionSnapshot> {
  if (!request.message.trim()) {
    throw new Error('请先输入继续发送给 Claude 的消息。')
  }

  await appendConversationMessages(request.localSessionId, [
    createConversationMessage({
      role: 'user',
      source: 'user',
      kind: 'text',
      content: request.message.trim()
    })
  ])

  await runClaudeTurn({
    localSessionId: request.localSessionId,
    prompt: request.message.trim()
  })

  return readSessionSnapshot(request.localSessionId)
}

export function resolveSelectedSlashCommand(skillId: SkillId): SessionSnapshot['slashCommand'] {
  return getSkillDefinition(skillId).slashCommand
}

async function runClaudeTurn(input: {
  localSessionId: string
  prompt: string
  expectedSkillId?: SkillId
  persistAssistantOutput?: boolean
}): Promise<void> {
  const snapshotBefore = await readSessionSnapshot(input.localSessionId)
  await setSessionRuntimeState(input.localSessionId, {
    status: 'running',
    lastError: null,
    lastClaudePrompt: input.prompt
  })

  const startedAt = new Date().toISOString()
  await appendSessionEvent(input.localSessionId, {
    type: 'claude.turn.started',
    prompt: input.prompt,
    startedAt,
    expectedSkillId: input.expectedSkillId ?? null
  })

  try {
    const turn = await executeClaudeCli({
      claudeSessionId: snapshotBefore.claudeSessionId,
      localSessionId: input.localSessionId,
      prompt: input.prompt,
      isInitialTurn: Boolean(input.expectedSkillId)
    })
    const resolvedSkillCommandName = resolveTriggeredSkillCommand({
      expectedSkillId: input.expectedSkillId ?? null,
      prompt: input.prompt,
      turn
    })

    if (input.expectedSkillId) {
      const expectedCommand = getSkillDefinition(input.expectedSkillId).id
      if (resolvedSkillCommandName !== expectedCommand) {
        throw new ClaudeTurnError(
          `Claude 未正确触发 ${getSkillDefinition(input.expectedSkillId).slashCommand}。`,
          {
            ...turn,
            exitCode: turn.exitCode,
            skillCommandName: resolvedSkillCommandName,
            skillDetection: turn.skillDetection
          }
        )
      }
    }

    await updateClaudeSessionId(input.localSessionId, turn.claudeSessionId)
    await writeClaudeRunArtifact(input.localSessionId, {
      prompt: input.prompt,
      claudeSessionId: turn.claudeSessionId,
      exitCode: turn.exitCode,
      skillCommandName: resolvedSkillCommandName,
      skillDetection: turn.skillDetection,
      durationMs: turn.durationMs,
      totalCostUsd: turn.totalCostUsd,
      stdout: turn.rawStdout,
      stderr: turn.rawStderr
    })

    const messages: ConversationMessage[] = []
    if (resolvedSkillCommandName) {
      messages.push(
        createConversationMessage({
          role: 'system',
          source: 'app',
          kind: 'event',
          content: `Claude 已触发 /${resolvedSkillCommandName}`
        })
      )
    }

    if (input.persistAssistantOutput !== false) {
      messages.push(
        createConversationMessage({
          role: 'assistant',
          source: 'claude',
          kind: 'text',
          content: turn.finalText
        })
      )
    }

    await appendConversationMessages(input.localSessionId, messages)
    if (input.persistAssistantOutput !== false) {
      await writeClaudeOutputVersion({
        localSessionId: input.localSessionId,
        markdown: turn.finalText,
        sourceMessageId: turn.sourceMessageId
      })
    }
    await setSessionRuntimeState(input.localSessionId, {
      status: 'ready',
      lastError: null
    })
    await appendSessionEvent(input.localSessionId, {
      type: 'claude.turn.completed',
      completedAt: new Date().toISOString(),
      claudeSessionId: turn.claudeSessionId,
      durationMs: turn.durationMs,
      totalCostUsd: turn.totalCostUsd,
      skillCommandName: resolvedSkillCommandName,
      skillDetection: turn.skillDetection,
      outputPreview: turn.finalText.slice(0, 240)
    })
  } catch (error) {
    const message = formatError(error)
    if (error instanceof ClaudeTurnError) {
      await writeClaudeRunArtifact(input.localSessionId, {
        prompt: input.prompt,
        claudeSessionId: error.artifact.claudeSessionId,
        exitCode: error.artifact.exitCode,
        skillCommandName: error.artifact.skillCommandName,
        skillDetection: error.artifact.skillDetection,
        durationMs: error.artifact.durationMs,
        totalCostUsd: error.artifact.totalCostUsd,
        stdout: error.artifact.rawStdout,
        stderr: error.artifact.rawStderr,
        error: message
      })
    }
    await setSessionRuntimeState(input.localSessionId, {
      status: 'error',
      lastError: message
    })
    await appendConversationMessages(input.localSessionId, [
      createConversationMessage({
        role: 'system',
        source: 'app',
        kind: 'error',
        content: message
      })
    ])
    await appendSessionEvent(input.localSessionId, {
      type: 'claude.turn.failed',
      failedAt: new Date().toISOString(),
      error: message
    })
    throw error
  }
}

async function executeClaudeCli(input: {
  localSessionId: string
  claudeSessionId: string
  prompt: string
  isInitialTurn: boolean
}): Promise<ClaudeTurnResult> {
  const snapshot = await readSessionSnapshot(input.localSessionId)
  const command = resolveClaudeCliCommand()
  const args = [
    ...command.args,
    '-p',
    '--output-format',
    'stream-json',
    '--verbose',
    '--permission-mode',
    'bypassPermissions',
    ...(input.isInitialTurn
      ? ['--session-id', input.claudeSessionId]
      : ['--resume', input.claudeSessionId]),
    input.prompt
  ]

  const runtimeEnv = {
    ...process.env,
    ...getClaudeRuntimeEnv(),
    ...(command.useElectronRunAsNode ? { ELECTRON_RUN_AS_NODE: '1' } : {})
  }

  return new Promise<ClaudeTurnResult>((resolve, reject) => {
    const child = spawn(command.command, args, {
      cwd: snapshot.workspacePath,
      env: runtimeEnv
    })
    const stdoutChunks: string[] = []
    const stderrChunks: string[] = []
    let stdoutBuffer = ''
    let timedOut = false
    let settled = false
    let timeoutId: NodeJS.Timeout | null = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, CLAUDE_TIMEOUT_MS)

    const clearTurnTimeout = (): void => {
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
    }

    const fail = (error: Error): void => {
      if (settled) {
        return
      }

      settled = true
      clearTurnTimeout()
      reject(error)
    }

    const succeed = (result: ClaudeTurnResult): void => {
      if (settled) {
        return
      }

      settled = true
      clearTurnTimeout()
      resolve(result)
    }

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString()
      stdoutChunks.push(text)
      stdoutBuffer += text
    })

    child.stderr.on('data', (chunk) => {
      stderrChunks.push(chunk.toString())
    })

    child.on('error', (error) => {
      fail(
        new ClaudeTurnError(formatError(error), {
          claudeSessionId: input.claudeSessionId,
          finalText: '',
          sourceMessageId: null,
          rawStdout: stdoutBuffer,
          rawStderr: stderrChunks.join(''),
          exitCode: null,
          skillCommandName: null,
          skillDetection: null,
          durationMs: null,
          totalCostUsd: null,
          events: []
        })
      )
    })

    child.on('close', (code) => {
      clearTurnTimeout()

      const rawStdout = stdoutChunks.join('')
      const rawStderr = stderrChunks.join('')
      const baseArtifact: Omit<ClaudeTurnResult, 'exitCode'> & { exitCode: number | null } = {
        claudeSessionId: input.claudeSessionId,
        finalText: '',
        sourceMessageId: null,
        rawStdout,
        rawStderr,
        exitCode: code ?? null,
        skillCommandName: null,
        skillDetection: null,
        durationMs: null,
        totalCostUsd: null,
        events: []
      }

      if (timedOut) {
        fail(new ClaudeTurnError('Claude 会话超时，请稍后重试。', baseArtifact))
        return
      }

      try {
        const events = parseClaudeCliEvents(rawStdout)
        const initEvent = events.find(
          (event) => event.type === 'system' && event.subtype === 'init'
        )
        const resultEvent = [...events]
          .reverse()
          .find((event) => event.type === 'result') ?? null
        const skillCommandName = extractSkillCommandName(events)
        const latestAssistantText = extractLatestAssistantText(events)
        const finalText = latestAssistantText || resultEvent?.result?.trim() || ''
        const artifact = {
          ...baseArtifact,
          claudeSessionId: initEvent?.session_id ?? resultEvent?.session_id ?? input.claudeSessionId,
          finalText,
          sourceMessageId: extractLatestAssistantMessageId(events),
          skillCommandName,
          skillDetection: skillCommandName ? ('event' as const) : null,
          durationMs: resultEvent?.duration_ms ?? null,
          totalCostUsd:
            typeof resultEvent?.total_cost_usd === 'number' ? resultEvent.total_cost_usd : null,
          events
        }

        if (code !== 0 || !resultEvent || resultEvent.is_error) {
          const errorText =
            finalText ||
            resultEvent?.result ||
            rawStderr.trim() ||
            `Claude CLI 退出异常，exit code=${code ?? -1}`
          fail(new ClaudeTurnError(errorText, artifact))
          return
        }

        if (!finalText) {
          fail(new ClaudeTurnError('Claude 返回为空。', artifact))
          return
        }

        succeed({
          claudeSessionId: artifact.claudeSessionId,
          finalText,
          sourceMessageId: artifact.sourceMessageId,
          rawStdout,
          rawStderr,
          exitCode: code ?? 0,
          skillCommandName,
          skillDetection: artifact.skillDetection,
          durationMs: artifact.durationMs,
          totalCostUsd: artifact.totalCostUsd,
          events
        })
      } catch (error) {
        if (error instanceof ClaudeTurnError) {
          fail(error)
          return
        }

        fail(new ClaudeTurnError(formatError(error), baseArtifact))
      }
    })
  })
}

function resolveClaudeCliCommand(): {
  command: string
  args: string[]
  useElectronRunAsNode: boolean
} {
  const require = createRequire(import.meta.url)

  if (app.isPackaged) {
    const unpackedCliPath = join(
      process.resourcesPath,
      'app.asar.unpacked',
      'node_modules',
      '@anthropic-ai',
      'claude-code',
      'cli.js'
    )

    if (existsSync(unpackedCliPath)) {
      return {
        command: process.execPath,
        args: [unpackedCliPath],
        useElectronRunAsNode: true
      }
    }
  }

  try {
    const packageJsonPath = require.resolve('@anthropic-ai/claude-code/package.json')
    const cliPath = join(dirname(packageJsonPath), 'cli.js')

    if (existsSync(cliPath)) {
      return {
        command: process.execPath,
        args: [cliPath],
        useElectronRunAsNode: true
      }
    }
  } catch {
    // Fall through to PATH lookup below.
  }

  return {
    command: 'claude',
    args: [],
    useElectronRunAsNode: false
  }
}

function buildInitialUserMessage(request: SessionStartRequest): string {
  const documentList =
    request.documents.length === 0
      ? '未附文档。'
      : request.documents.map((document) => `- ${document.name}`).join('\n')

  return ['启动真实 Claude 会话。', '', request.userIntent.trim(), '', '已附文档：', documentList].join(
    '\n'
  )
}

function buildInitialClaudeContextPrompt(request: SessionStartRequest): string {
  const documentLines =
    request.documents.length === 0
      ? '- 当前没有上传文档。'
      : request.documents
          .map((document) => {
            return [
              `- ${document.name}`,
              `  - workspace 根目录副本: ${document.name}`,
              '  - 原始文件位于: inputs/original-files/',
              '  - 提取缓存位于: inputs/extracted-cache/'
            ].join('\n')
          })
          .join('\n')

  return [
    '请基于当前 workspace 内的文档开始本次任务，并把你的回复直接写在对话里。',
    '',
    '用户意图：',
    request.userIntent.trim(),
    '',
    '已上传文档：',
    documentLines,
    '',
    '请优先阅读 `inputs/original-files/` 与 `inputs/extracted-cache/`。'
  ].join('\n')
}

function parseClaudeCliEvents(rawStdout: string): ClaudeCliEvent[] {
  return rawStdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ClaudeCliEvent)
}

function extractSkillCommandName(events: ClaudeCliEvent[]): string | null {
  for (const event of events) {
    if (event.tool_use_result?.success && event.tool_use_result.commandName) {
      return event.tool_use_result.commandName
    }
  }

  for (const event of events) {
    const content = event.message?.content ?? []
    for (const block of content) {
      if (block.type === 'tool_use' && block.name === 'Skill') {
        const skillName = block.input?.skill
        if (typeof skillName === 'string') {
          return skillName
        }
      }
    }
  }

  return null
}

function resolveTriggeredSkillCommand(input: {
  expectedSkillId: SkillId | null
  prompt: string
  turn: ClaudeTurnResult
}): SkillId | null {
  if (input.turn.skillCommandName) {
    return input.turn.skillCommandName as SkillId
  }

  if (!input.expectedSkillId) {
    return null
  }

  const skill = getSkillDefinition(input.expectedSkillId)
  if (input.prompt.trim() !== skill.slashCommand) {
    return null
  }

  const matched = skill.activationSignals.some((signal) => input.turn.finalText.includes(signal))
  if (!matched) {
    return null
  }

  input.turn.skillDetection = 'signal'
  return skill.id
}

function extractLatestAssistantText(events: ClaudeCliEvent[]): string {
  const textBlocks: string[] = []

  for (const event of events) {
    const content = event.message?.content ?? []
    const text = content
      .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
      .map((block) => block.text.trim())
      .filter(Boolean)
      .join('\n')

    if (text) {
      textBlocks.push(text)
    }
  }

  return textBlocks[textBlocks.length - 1] ?? ''
}

function extractLatestAssistantMessageId(events: ClaudeCliEvent[]): string | null {
  const assistantEvents = events.filter((event) => event.type === 'assistant')
  const lastAssistant = assistantEvents[assistantEvents.length - 1]
  return lastAssistant?.message?.id ?? null
}

function createConversationMessage(input: {
  role: ConversationMessage['role']
  source: ConversationMessage['source']
  kind: ConversationMessage['kind']
  content: string
}): ConversationMessage {
  return {
    id: randomUUID(),
    role: input.role,
    source: input.source,
    kind: input.kind,
    content: input.content.trim(),
    createdAt: new Date().toISOString()
  }
}

function ensureClaudeRuntime(): void {
  const runtimeEnv = getClaudeRuntimeEnv()

  if (!runtimeEnv.ANTHROPIC_AUTH_TOKEN?.trim()) {
    throw new Error('Claude hidden runtime config is incomplete.')
  }
}

function validateStartRequest(request: SessionStartRequest): void {
  if (!request.userIntent.trim()) {
    throw new Error('请先填写本次任务意图。')
  }

  getSkillDefinition(request.skillId)
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

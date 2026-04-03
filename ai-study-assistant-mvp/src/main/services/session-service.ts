import { app } from 'electron'
import {
  appendFile,
  cp,
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile
} from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { basename, join } from 'node:path'
import { getSkillDefinition } from '@shared/skills'
import type {
  ClaudeOutputVersion,
  ClaudeVersionId,
  ConversationMessage,
  DocumentExtraction,
  SessionDirectories,
  SessionInfo,
  SessionRuntimeState,
  SessionSnapshot,
  SessionStartRequest,
  WorkspaceDocument
} from '@shared/types'
import { listSkillInstallSpecs } from './settings-service'

interface SessionMetadata {
  localSessionId: string
  claudeSessionId: string
  skillId: SessionStartRequest['skillId']
  slashCommand: SessionSnapshot['slashCommand']
  userIntent: string
  createdAt: string
  installedSkills: string[]
}

interface VersionHistoryEntry {
  id: ClaudeVersionId
  index: number
  createdAt: string
  preview: string
  sourceMessageId?: string | null
}

const INITIAL_TRANSCRIPT = '# Claude Native Transcript\n'
const INITIAL_VERSION_NOTES = '# Claude Version Notes\n\n还没有生成 Claude 版本。\n'
const INITIAL_RUNTIME_STATE: Omit<SessionRuntimeState, 'lastUpdatedAt'> = {
  status: 'idle',
  lastError: null,
  assistantTurnCount: 0,
  selectedVersionId: null,
  lastClaudePrompt: null
}

export async function prepareSessionWorkspace(request: SessionStartRequest): Promise<SessionInfo> {
  const localSessionId = createLocalSessionId()
  const claudeSessionId = randomUUID()
  const rootDir = join(app.getPath('userData'), 'sessions', localSessionId)
  const workspaceDir = join(rootDir, 'workspace')
  const originalFilesDir = join(workspaceDir, 'inputs', 'original-files')
  const extractedCacheDir = join(workspaceDir, 'inputs', 'extracted-cache')
  const stateDir = join(workspaceDir, 'state')
  const outputsDir = join(workspaceDir, 'outputs')
  const claudeSkillsDir = join(workspaceDir, '.claude', 'skills')
  const skill = getSkillDefinition(request.skillId)
  const createdAt = new Date().toISOString()

  await Promise.all([
    mkdir(originalFilesDir, { recursive: true }),
    mkdir(extractedCacheDir, { recursive: true }),
    mkdir(stateDir, { recursive: true }),
    mkdir(outputsDir, { recursive: true }),
    mkdir(claudeSkillsDir, { recursive: true })
  ])

  await writeFile(join(workspaceDir, 'inputs', 'user-intent.md'), request.userIntent.trim(), 'utf8')

  const documents = await installWorkspaceDocuments({
    workspaceDir,
    originalFilesDir,
    extractedCacheDir,
    documents: request.documents
  })

  await installWorkspaceSkills(claudeSkillsDir)

  await Promise.all([
    writeFile(join(stateDir, 'current-brief.md'), buildInitialBrief(request, documents), 'utf8'),
    writeFile(join(stateDir, 'transcript.md'), INITIAL_TRANSCRIPT, 'utf8'),
    writeFile(join(stateDir, 'stage-report.md'), buildInitialStageReport(request), 'utf8'),
    writeFile(join(stateDir, 'session-documents.json'), JSON.stringify(documents, null, 2), 'utf8'),
    writeFile(join(stateDir, 'source-documents.json'), JSON.stringify(request.documents, null, 2), 'utf8'),
    writeFile(join(stateDir, 'messages.json'), '[]', 'utf8'),
    writeFile(join(stateDir, 'version-history.json'), '[]', 'utf8'),
    writeFile(
      join(stateDir, 'session-state.json'),
      JSON.stringify(
        {
          ...INITIAL_RUNTIME_STATE,
          lastUpdatedAt: createdAt
        } satisfies SessionRuntimeState,
        null,
        2
      ),
      'utf8'
    ),
    writeFile(join(outputsDir, 'version-notes.md'), INITIAL_VERSION_NOTES, 'utf8'),
    writeFile(
      join(stateDir, 'session-events.jsonl'),
      `${JSON.stringify({
        type: 'session.created',
        createdAt,
        localSessionId,
        slashCommand: skill.slashCommand
      })}\n`,
      'utf8'
    ),
    writeFile(
      join(rootDir, 'session.json'),
      JSON.stringify(
        {
          localSessionId,
          claudeSessionId,
          skillId: request.skillId,
          slashCommand: skill.slashCommand,
          userIntent: request.userIntent.trim(),
          createdAt,
          installedSkills: listSkillInstallSpecs().map((item) => item.installDirectoryName)
        } satisfies SessionMetadata,
        null,
        2
      ),
      'utf8'
    )
  ])

  return {
    localSessionId,
    claudeSessionId,
    rootDir,
    workspaceDir,
    originalFilesDir,
    extractedCacheDir,
    stateDir,
    outputsDir,
    claudeSkillsDir
  }
}

export async function loadSession(localSessionId: string): Promise<SessionInfo & SessionMetadata> {
  const rootDir = join(app.getPath('userData'), 'sessions', localSessionId)
  const workspaceDir = join(rootDir, 'workspace')
  const originalFilesDir = join(workspaceDir, 'inputs', 'original-files')
  const extractedCacheDir = join(workspaceDir, 'inputs', 'extracted-cache')
  const stateDir = join(workspaceDir, 'state')
  const outputsDir = join(workspaceDir, 'outputs')
  const claudeSkillsDir = join(workspaceDir, '.claude', 'skills')
  const metadata = JSON.parse(await readFile(join(rootDir, 'session.json'), 'utf8')) as SessionMetadata

  return {
    ...metadata,
    rootDir,
    workspaceDir,
    originalFilesDir,
    extractedCacheDir,
    stateDir,
    outputsDir,
    claudeSkillsDir
  }
}

export async function readSessionSnapshot(localSessionId: string): Promise<SessionSnapshot> {
  const session = await loadSession(localSessionId)
  const [documentsRaw, messagesRaw, stateRaw, outputFiles, versionNotesMarkdown, selectedMarkdown, baselineMarkdown] =
    await Promise.all([
      safeRead(join(session.stateDir, 'session-documents.json'), '[]'),
      safeRead(join(session.stateDir, 'messages.json'), '[]'),
      safeRead(
        join(session.stateDir, 'session-state.json'),
        JSON.stringify({ ...INITIAL_RUNTIME_STATE, lastUpdatedAt: session.createdAt })
      ),
      readdir(session.outputsDir).catch(() => []),
      safeRead(join(session.outputsDir, 'version-notes.md'), INITIAL_VERSION_NOTES),
      safeReadOptional(join(session.outputsDir, 'selected.md')),
      safeReadOptional(join(session.outputsDir, 'baseline-qwen.md'))
    ])

  const runtimeState = JSON.parse(stateRaw) as SessionRuntimeState
  const versions = await readClaudeVersions(session)

  return {
    localSessionId: session.localSessionId,
    claudeSessionId: session.claudeSessionId,
    skillId: session.skillId,
    slashCommand: session.slashCommand,
    userIntent: session.userIntent,
    createdAt: session.createdAt,
    workspacePath: session.workspaceDir,
    status: runtimeState.status,
    installedSkills: session.installedSkills,
    documents: JSON.parse(documentsRaw) as WorkspaceDocument[],
    directories: buildDirectories(session),
    outputFiles: outputFiles.sort((left, right) => left.localeCompare(right)),
    messages: JSON.parse(messagesRaw) as ConversationMessage[],
    versions,
    versionNotesMarkdown,
    selectedVersionId: runtimeState.selectedVersionId,
    selectedMarkdown,
    baselineMarkdown,
    baselinePath: baselineMarkdown ? join(session.outputsDir, 'baseline-qwen.md') : null,
    lastError: runtimeState.lastError
  }
}

export async function readSourceDocuments(localSessionId: string): Promise<DocumentExtraction[]> {
  const session = await loadSession(localSessionId)
  const raw = await safeRead(join(session.stateDir, 'source-documents.json'), '[]')
  return JSON.parse(raw) as DocumentExtraction[]
}

export async function appendConversationMessages(
  localSessionId: string,
  messages: ConversationMessage[]
): Promise<void> {
  if (messages.length === 0) {
    return
  }

  const session = await loadSession(localSessionId)
  const historyPath = join(session.stateDir, 'messages.json')
  const currentHistory = JSON.parse(await safeRead(historyPath, '[]')) as ConversationMessage[]
  const nextHistory = [...currentHistory, ...messages]

  await Promise.all([
    writeFile(historyPath, JSON.stringify(nextHistory, null, 2), 'utf8'),
    appendFile(
      join(session.stateDir, 'transcript.md'),
      messages.map((message) => formatTranscriptEntry(message)).join('\n'),
      'utf8'
    )
  ])
}

export async function setSessionRuntimeState(
  localSessionId: string,
  patch: Partial<SessionRuntimeState>
): Promise<SessionRuntimeState> {
  const session = await loadSession(localSessionId)
  const statePath = join(session.stateDir, 'session-state.json')
  const current = JSON.parse(
    await safeRead(
      statePath,
      JSON.stringify({
        ...INITIAL_RUNTIME_STATE,
        lastUpdatedAt: new Date().toISOString()
      })
    )
  ) as SessionRuntimeState

  const nextState: SessionRuntimeState = {
    ...current,
    ...patch,
    lastUpdatedAt: new Date().toISOString()
  }

  await writeFile(statePath, JSON.stringify(nextState, null, 2), 'utf8')
  return nextState
}

export async function updateClaudeSessionId(
  localSessionId: string,
  claudeSessionId: string
): Promise<void> {
  const session = await loadSession(localSessionId)
  await writeFile(
    join(session.rootDir, 'session.json'),
    JSON.stringify(
      {
        localSessionId: session.localSessionId,
        claudeSessionId,
        skillId: session.skillId,
        slashCommand: session.slashCommand,
        userIntent: session.userIntent,
        createdAt: session.createdAt,
        installedSkills: session.installedSkills
      } satisfies SessionMetadata,
      null,
      2
    ),
    'utf8'
  )
}

export async function appendSessionEvent(localSessionId: string, event: unknown): Promise<void> {
  const session = await loadSession(localSessionId)
  const payload =
    typeof event === 'object' && event !== null
      ? { timestamp: new Date().toISOString(), ...event }
      : { timestamp: new Date().toISOString(), value: event }

  await appendFile(join(session.stateDir, 'session-events.jsonl'), `${JSON.stringify(payload)}\n`, 'utf8')
}

export async function writeClaudeRunArtifact(
  localSessionId: string,
  artifact: Record<string, unknown>
): Promise<void> {
  const session = await loadSession(localSessionId)
  await writeFile(
    join(session.stateDir, 'last-claude-run.json'),
    JSON.stringify(
      {
        ...artifact,
        savedAt: new Date().toISOString()
      },
      null,
      2
    ),
    'utf8'
  )
}

export async function writeClaudeOutputVersion(input: {
  localSessionId: string
  markdown: string
  sourceMessageId?: string | null
}): Promise<ClaudeOutputVersion> {
  const session = await loadSession(input.localSessionId)
  const state = JSON.parse(
    await safeRead(
      join(session.stateDir, 'session-state.json'),
      JSON.stringify({
        ...INITIAL_RUNTIME_STATE,
        lastUpdatedAt: new Date().toISOString()
      })
    )
  ) as SessionRuntimeState

  const nextAssistantTurnCount = state.assistantTurnCount + 1
  const versionIndex = nextAssistantTurnCount > 3 ? 3 : nextAssistantTurnCount
  const versionId = `version-${versionIndex}` as ClaudeVersionId
  const fileName = `${versionId}.md` as const
  const filePath = join(session.outputsDir, fileName)
  const createdAt = new Date().toISOString()
  const historyPath = join(session.stateDir, 'version-history.json')
  const currentHistory = JSON.parse(await safeRead(historyPath, '[]')) as VersionHistoryEntry[]
  const nextEntry: VersionHistoryEntry = {
    id: versionId,
    index: versionIndex,
    createdAt,
    preview: toPreview(input.markdown),
    sourceMessageId: input.sourceMessageId ?? null
  }
  const nextHistory = [...currentHistory.filter((entry) => entry.id !== versionId), nextEntry].sort(
    (left, right) => left.index - right.index
  )

  await Promise.all([
    writeFile(filePath, input.markdown.trim(), 'utf8'),
    writeFile(historyPath, JSON.stringify(nextHistory, null, 2), 'utf8'),
    setSessionRuntimeState(input.localSessionId, {
      assistantTurnCount: nextAssistantTurnCount
    }),
    writeVersionNotes(session, nextHistory, state.selectedVersionId)
  ])

  return {
    id: versionId,
    index: versionIndex,
    label: `Claude 版本 ${versionIndex}`,
    fileName,
    filePath,
    createdAt,
    content: input.markdown.trim(),
    sourceMessageId: input.sourceMessageId ?? null
  }
}

export async function writeBaseline(localSessionId: string, markdown: string): Promise<string> {
  const session = await loadSession(localSessionId)
  const outputPath = join(session.outputsDir, 'baseline-qwen.md')
  await writeFile(outputPath, markdown.trim(), 'utf8')
  return outputPath
}

export async function selectClaudeVersion(
  localSessionId: string,
  versionId: ClaudeVersionId
): Promise<string> {
  const session = await loadSession(localSessionId)
  const sourcePath = join(session.outputsDir, `${versionId}.md`)
  const selectedPath = join(session.outputsDir, 'selected.md')
  const markdown = await readFile(sourcePath, 'utf8')
  await Promise.all([
    writeFile(selectedPath, markdown, 'utf8'),
    setSessionRuntimeState(localSessionId, {
      selectedVersionId: versionId
    }),
    rewriteVersionNotes(localSessionId)
  ])
  return selectedPath
}

async function rewriteVersionNotes(localSessionId: string): Promise<void> {
  const session = await loadSession(localSessionId)
  const state = JSON.parse(
    await safeRead(
      join(session.stateDir, 'session-state.json'),
      JSON.stringify({
        ...INITIAL_RUNTIME_STATE,
        lastUpdatedAt: new Date().toISOString()
      })
    )
  ) as SessionRuntimeState
  const history = JSON.parse(await safeRead(join(session.stateDir, 'version-history.json'), '[]')) as VersionHistoryEntry[]
  await writeVersionNotes(session, history, state.selectedVersionId)
}

async function installWorkspaceDocuments(input: {
  workspaceDir: string
  originalFilesDir: string
  extractedCacheDir: string
  documents: SessionStartRequest['documents']
}): Promise<WorkspaceDocument[]> {
  const workspaceDocuments: WorkspaceDocument[] = []

  for (const document of input.documents) {
    const cachePath = join(input.extractedCacheDir, `${document.id}-${safeName(document.name)}.md`)
    const originalPath = join(
      input.originalFilesDir,
      `${document.id}-${safeName(basename(document.path))}`
    )
    const workspaceShortcutPath = join(input.workspaceDir, safeName(document.name))

    await writeFile(
      cachePath,
      [
        `# ${document.name}`,
        '',
        `- 原始路径：${document.path}`,
        `- 文件类型：${document.extension}`,
        `- 文件大小：${document.size} bytes`,
        '',
        '## 提取摘要',
        document.summary,
        '',
        '## 完整提取文本',
        document.extractedText
      ].join('\n'),
      'utf8'
    )

    await Promise.all([copyFile(document.path, originalPath), copyFile(document.path, workspaceShortcutPath)])

    workspaceDocuments.push({
      id: document.id,
      name: document.name,
      extension: document.extension,
      size: document.size,
      summary: document.summary,
      originalPath,
      cachePath
    })
  }

  return workspaceDocuments
}

async function installWorkspaceSkills(claudeSkillsDir: string): Promise<void> {
  for (const spec of listSkillInstallSpecs()) {
    const targetDir = join(claudeSkillsDir, spec.installDirectoryName)
    await rm(targetDir, { recursive: true, force: true })
    await cp(spec.sourcePath, targetDir, { recursive: true, force: true })
  }
}

async function readClaudeVersions(
  session: Awaited<ReturnType<typeof loadSession>>
): Promise<ClaudeOutputVersion[]> {
  const history = JSON.parse(
    await safeRead(join(session.stateDir, 'version-history.json'), '[]')
  ) as VersionHistoryEntry[]

  const versions = await Promise.all(
    history.map(async (entry) => {
      const fileName = `${entry.id}.md` as const
      const filePath = join(session.outputsDir, fileName)
      const content = await safeReadOptional(filePath)

      if (!content) {
        return null
      }

      const version: ClaudeOutputVersion = {
        id: entry.id,
        index: entry.index,
        label: `Claude 版本 ${entry.index}`,
        fileName,
        filePath,
        createdAt: entry.createdAt,
        content,
        sourceMessageId: entry.sourceMessageId ?? null
      }

      return version
    })
  )

  return versions.filter((version) => version !== null)
}

async function writeVersionNotes(
  session: Awaited<ReturnType<typeof loadSession>>,
  history: VersionHistoryEntry[],
  selectedVersionId: ClaudeVersionId | null
): Promise<void> {
  const markdown =
    history.length === 0
      ? INITIAL_VERSION_NOTES
      : [
          '# Claude Version Notes',
          '',
          ...history.map((entry) => {
            const selected = entry.id === selectedVersionId ? ' | 已选中' : ''
            return `- ${entry.id}.md | ${entry.createdAt}${selected}\n  - 摘要：${entry.preview}`
          })
        ].join('\n')

  await writeFile(join(session.outputsDir, 'version-notes.md'), `${markdown.trim()}\n`, 'utf8')
}

function buildInitialBrief(request: SessionStartRequest, documents: WorkspaceDocument[]): string {
  const skill = getSkillDefinition(request.skillId)
  const documentLines =
    documents.length === 0
      ? '- 当前还没有上传文档。'
      : documents
          .map(
            (document) =>
              `- ${document.name}\n  - 原文件：${document.originalPath}\n  - 提取缓存：${document.cachePath}\n  - 摘要：${document.summary}`
          )
          .join('\n')

  return [
    '# Current Brief',
    '',
    `- Skill: ${skill.title}`,
    `- Slash Command: ${skill.slashCommand}`,
    `- User Intent: ${request.userIntent.trim() || '[[未填写]]'}`,
    '',
    '## Uploaded Documents',
    documentLines,
    '',
    '## Workspace Contract',
    '- Claude 会话在 workspace 目录内运行。',
    '- 外部 skills 已原样安装到 `.claude/skills/`。',
    '- App 会把 Claude 的回复按 turn 写入 `outputs/version-*.md`。'
  ].join('\n')
}

function buildInitialStageReport(request: SessionStartRequest): string {
  const skill = getSkillDefinition(request.skillId)

  return [
    '# Stage Report',
    '',
    `- Selected Skill: ${skill.title}`,
    `- Slash Command: ${skill.slashCommand}`,
    '- Claude Session Adapter: pending',
    '- Qwen Baseline: pending',
    '- Version Selection: pending'
  ].join('\n')
}

function formatTranscriptEntry(message: ConversationMessage): string {
  return [
    `## ${message.createdAt} | ${message.role.toUpperCase()} | ${message.kind}`,
    '',
    message.content.trim(),
    ''
  ].join('\n')
}

function toPreview(content: string): string {
  return content.replace(/\s+/g, ' ').trim().slice(0, 120) || '[[空内容]]'
}

function createLocalSessionId(): string {
  return `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`
}

function safeName(name: string): string {
  return name.replace(/[^\w.-]+/g, '_')
}

async function safeRead(path: string, fallback: string): Promise<string> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return fallback
  }
}

async function safeReadOptional(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return null
  }
}

function buildDirectories(session: SessionInfo & SessionMetadata): SessionDirectories {
  return {
    rootDir: session.rootDir,
    workspaceDir: session.workspaceDir,
    originalFilesDir: session.originalFilesDir,
    extractedCacheDir: session.extractedCacheDir,
    stateDir: session.stateDir,
    outputsDir: session.outputsDir,
    claudeSkillsDir: session.claudeSkillsDir
  }
}

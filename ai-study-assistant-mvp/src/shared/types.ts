export type AppPage = 'launch' | 'compare'
export type SkillId = 'essay-craft' | 'report-ta-orchestrator'
export type SkillCommand = '/essay-craft' | '/report-ta-orchestrator'
export type SessionStatus = 'idle' | 'running' | 'ready' | 'error'
export type ConversationRole = 'user' | 'assistant' | 'system'
export type ConversationSource = 'user' | 'claude' | 'app'
export type ConversationKind = 'text' | 'event' | 'error'
export type ClaudeVersionId = 'version-1' | 'version-2' | 'version-3'

export interface SkillDefinition {
  id: SkillId
  title: string
  subtitle: string
  description: string
  slashCommand: SkillCommand
  activationSignals: string[]
  outputLabel: string
}

export interface DocumentExtraction {
  id: string
  name: string
  path: string
  extension: string
  size: number
  extractedText: string
  summary: string
}

export interface UploadedDocumentPayload {
  name: string
  extension: string
  size: number
  dataBase64: string
}

export interface WorkspaceDocument {
  id: string
  name: string
  extension: string
  size: number
  summary: string
  originalPath: string
  cachePath: string
}

export interface SessionDirectories {
  rootDir: string
  workspaceDir: string
  originalFilesDir: string
  extractedCacheDir: string
  stateDir: string
  outputsDir: string
  claudeSkillsDir: string
}

export interface SessionInfo extends SessionDirectories {
  localSessionId: string
  claudeSessionId: string
}

export interface ConversationMessage {
  id: string
  role: ConversationRole
  source: ConversationSource
  kind: ConversationKind
  content: string
  createdAt: string
}

export interface ClaudeOutputVersion {
  id: ClaudeVersionId
  index: number
  label: string
  fileName: `${ClaudeVersionId}.md`
  filePath: string
  createdAt: string
  content: string
  sourceMessageId?: string | null
}

export interface SessionRuntimeState {
  status: SessionStatus
  lastUpdatedAt: string
  lastError: string | null
  assistantTurnCount: number
  selectedVersionId: ClaudeVersionId | null
  lastClaudePrompt: string | null
}

export interface SessionStartRequest {
  skillId: SkillId
  userIntent: string
  documents: DocumentExtraction[]
}

export interface SessionMessageRequest {
  localSessionId: string
  message: string
}

export interface BaselineRequest {
  localSessionId: string
}

export interface SelectVersionRequest {
  localSessionId: string
  versionId: ClaudeVersionId
}

export interface VersionSelectionWriteResult {
  versionId: ClaudeVersionId
  selectedPath: string
  writtenAt: string
}

export interface SessionSnapshot {
  localSessionId: string
  claudeSessionId: string
  skillId: SkillId
  slashCommand: SkillCommand
  userIntent: string
  createdAt: string
  workspacePath: string
  status: SessionStatus
  installedSkills: string[]
  documents: WorkspaceDocument[]
  directories: SessionDirectories
  outputFiles: string[]
  messages: ConversationMessage[]
  versions: ClaudeOutputVersion[]
  versionNotesMarkdown: string
  selectedVersionId: ClaudeVersionId | null
  selectedMarkdown: string | null
  baselineMarkdown: string | null
  baselinePath: string | null
  lastError: string | null
}

export interface GenerationResult {
  provider: 'qwen' | 'claude-code'
  markdown: string
  raw?: string
  workspacePath?: string
  outputPath?: string
}

export interface DesktopAPI {
  pickDocuments: () => Promise<DocumentExtraction[]>
  extractDocuments: (paths: string[]) => Promise<DocumentExtraction[]>
  extractUploadedDocuments: (documents: UploadedDocumentPayload[]) => Promise<DocumentExtraction[]>
  startSession: (request: SessionStartRequest) => Promise<SessionSnapshot>
  sendSessionMessage: (request: SessionMessageRequest) => Promise<SessionSnapshot>
  getSessionState: (localSessionId: string) => Promise<SessionSnapshot>
  runBaseline: (request: BaselineRequest) => Promise<SessionSnapshot>
  selectClaudeVersion: (request: SelectVersionRequest) => Promise<SessionSnapshot>
  openPath: (path: string) => Promise<void>
}

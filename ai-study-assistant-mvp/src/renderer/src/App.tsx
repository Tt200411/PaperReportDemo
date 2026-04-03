import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { getSkillDefinition, SKILLS } from '@shared/skills'
import type {
  AppPage,
  ClaudeVersionId,
  DocumentExtraction,
  SessionSnapshot,
  SkillId,
  UploadedDocumentPayload
} from '@shared/types'

type BusyState =
  | 'idle'
  | 'documents'
  | 'starting'
  | 'sending'
  | 'baseline'
  | 'selecting'
type StatusTone = 'neutral' | 'success' | 'error'

interface StatusState {
  tone: StatusTone
  message: string
}

const INITIAL_SKILL_ID: SkillId = 'essay-craft'
const INITIAL_STATUS: StatusState = {
  tone: 'neutral',
  message: '选择 skill、填写意图并上传文档后，即可启动真实 Claude 会话。'
}

export default function App() {
  const [page, setPage] = useState<AppPage>('launch')
  const [selectedSkillId, setSelectedSkillId] = useState<SkillId>(INITIAL_SKILL_ID)
  const [userIntent, setUserIntent] = useState('')
  const [documents, setDocuments] = useState<DocumentExtraction[]>([])
  const [session, setSession] = useState<SessionSnapshot | null>(null)
  const [followUpMessage, setFollowUpMessage] = useState('')
  const [activeVersionId, setActiveVersionId] = useState<ClaudeVersionId | null>(null)
  const [busy, setBusy] = useState<BusyState>('idle')
  const [status, setStatus] = useState<StatusState>(INITIAL_STATUS)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const selectedSkill = getSkillDefinition(selectedSkillId)
  const activeVersion =
    session?.versions.find((version) => version.id === activeVersionId) ??
    session?.versions[session.versions.length - 1] ??
    null

  useEffect(() => {
    if (!session) {
      setActiveVersionId(null)
      return
    }

    if (session.selectedVersionId) {
      setActiveVersionId(session.selectedVersionId)
      return
    }

    if (session.versions.length > 0) {
      setActiveVersionId(session.versions[session.versions.length - 1].id)
    }
  }, [session])

  async function handleSystemPicker(): Promise<void> {
    setBusy('documents')
    setStatus({
      tone: 'neutral',
      message: '正在提取文档文本。'
    })

    try {
      const pickedDocuments = await window.desktopAPI.pickDocuments()
      setDocuments(pickedDocuments)
      setStatus({
        tone: 'success',
        message:
          pickedDocuments.length > 0
            ? `已载入 ${pickedDocuments.length} 份文档。`
            : '未选择文档，仍可继续启动会话。'
      })
    } catch (error) {
      setStatus({
        tone: 'error',
        message: formatError(error)
      })
    } finally {
      setBusy('idle')
    }
  }

  async function handleFileInputChange(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const files = Array.from(event.target.files ?? [])
    if (files.length === 0) {
      return
    }

    setBusy('documents')
    setStatus({
      tone: 'neutral',
      message: '正在解析所选文档。'
    })

    try {
      const paths = files
        .map((file) => (file as File & { path?: string }).path)
        .filter((path): path is string => Boolean(path))
      const extractedDocuments =
        paths.length === files.length
          ? await window.desktopAPI.extractDocuments(paths)
          : await window.desktopAPI.extractUploadedDocuments(
              await Promise.all(files.map((file) => toUploadedDocumentPayload(file)))
            )
      setDocuments(extractedDocuments)
      setStatus({
        tone: 'success',
        message: `已载入 ${extractedDocuments.length} 份文档。`
      })
    } catch (error) {
      setStatus({
        tone: 'error',
        message: formatError(error)
      })
    } finally {
      event.target.value = ''
      setBusy('idle')
    }
  }

  async function handleStartSession(): Promise<void> {
    if (!userIntent.trim()) {
      setStatus({
        tone: 'error',
        message: '请先填写本次任务意图。'
      })
      return
    }

    setBusy('starting')
    setStatus({
      tone: 'neutral',
      message: `正在以 ${selectedSkill.slashCommand} 启动真实 Claude 会话。`
    })

    try {
      const nextSession = await window.desktopAPI.startSession({
        skillId: selectedSkillId,
        userIntent,
        documents
      })
      setSession(nextSession)
      setStatus({
        tone: 'success',
        message: `${selectedSkill.slashCommand} 已启动，第一页现在显示真实 Claude 对话。`
      })
    } catch (error) {
      setStatus({
        tone: 'error',
        message: formatError(error)
      })
    } finally {
      setBusy('idle')
    }
  }

  async function handleSendMessage(): Promise<void> {
    if (!session) {
      setStatus({
        tone: 'error',
        message: '请先启动会话。'
      })
      return
    }

    if (!followUpMessage.trim()) {
      setStatus({
        tone: 'error',
        message: '请先输入继续发送给 Claude 的内容。'
      })
      return
    }

    setBusy('sending')
    setStatus({
      tone: 'neutral',
      message: 'Claude 正在继续处理你的消息。'
    })

    try {
      const nextSession = await window.desktopAPI.sendSessionMessage({
        localSessionId: session.localSessionId,
        message: followUpMessage
      })
      setSession(nextSession)
      setFollowUpMessage('')
      setStatus({
        tone: 'success',
        message: 'Claude 已返回新一轮输出。'
      })
    } catch (error) {
      setStatus({
        tone: 'error',
        message: formatError(error)
      })
    } finally {
      setBusy('idle')
    }
  }

  async function handleRunBaseline(): Promise<void> {
    if (!session) {
      return
    }

    setBusy('baseline')
    setStatus({
      tone: 'neutral',
      message: '正在运行 Qwen baseline。'
    })

    try {
      const nextSession = await window.desktopAPI.runBaseline({
        localSessionId: session.localSessionId
      })
      setSession(nextSession)
      setStatus({
        tone: 'success',
        message: 'Qwen baseline 已写入 outputs/baseline-qwen.md。'
      })
    } catch (error) {
      setStatus({
        tone: 'error',
        message: formatError(error)
      })
    } finally {
      setBusy('idle')
    }
  }

  async function handleSelectVersion(versionId: ClaudeVersionId): Promise<void> {
    if (!session) {
      return
    }

    setBusy('selecting')
    setStatus({
      tone: 'neutral',
      message: `正在把 ${versionId}.md 写入 outputs/selected.md。`
    })

    try {
      const nextSession = await window.desktopAPI.selectClaudeVersion({
        localSessionId: session.localSessionId,
        versionId
      })
      setSession(nextSession)
      setActiveVersionId(versionId)
      setStatus({
        tone: 'success',
        message: `${versionId}.md 已写入 outputs/selected.md。`
      })
    } catch (error) {
      setStatus({
        tone: 'error',
        message: formatError(error)
      })
    } finally {
      setBusy('idle')
    }
  }

  function handleReset(): void {
    setPage('launch')
    setSelectedSkillId(INITIAL_SKILL_ID)
    setUserIntent('')
    setDocuments([])
    setSession(null)
    setFollowUpMessage('')
    setActiveVersionId(null)
    setBusy('idle')
    setStatus(INITIAL_STATUS)
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-kicker">AI Study Assistant MVP</div>
          <h1>Claude Native Session + Qwen Baseline</h1>
          <p>
            只有两页核心 UI。第一页负责真实对话与文档入口，第二页负责 Claude 多版本和
            Qwen baseline 的并排对比。
          </p>
        </div>

        <div className="topbar-actions">
          <div className="page-switch">
            <button
              className={`nav-chip ${page === 'launch' ? 'active' : ''}`}
              onClick={() => setPage('launch')}
            >
              对话页
            </button>
            <button
              className={`nav-chip ${page === 'compare' ? 'active' : ''}`}
              onClick={() => setPage('compare')}
            >
              对比页
            </button>
          </div>

          <div className="topbar-secondary">
            {session ? (
              <button
                className="ghost-button"
                onClick={() => {
                  setPage('compare')
                }}
              >
                查看结果对比
              </button>
            ) : null}
            <button className="ghost-button" onClick={handleReset}>
              重置本地状态
            </button>
          </div>
        </div>
      </header>

      <main className="page-frame">
        {page === 'launch' ? (
          <section className="launch-page">
            <div className="launch-grid">
              <article className="panel panel-light setup-panel">
                <div className="panel-tag panel-tag-dark">Launch</div>
                <h2>启动真实 Claude 会话</h2>

                <div className="skill-grid">
                  {SKILLS.map((skill) => (
                    <button
                      key={skill.id}
                      className={`skill-card ${selectedSkillId === skill.id ? 'selected' : ''}`}
                      onClick={() => setSelectedSkillId(skill.id)}
                    >
                      <span className="skill-subtitle">{skill.subtitle}</span>
                      <strong>{skill.title}</strong>
                      <p>{skill.description}</p>
                      <code>{skill.slashCommand}</code>
                    </button>
                  ))}
                </div>

                <label className="field">
                  <span>意图输入</span>
                  <textarea
                    aria-label="意图输入"
                    rows={7}
                    value={userIntent}
                    onChange={(event) => setUserIntent(event.target.value)}
                    placeholder="例如：我要申请 Columbia Learning Analytics，希望先依据 CV 和项目要求推进入学申请文书。"
                  />
                </label>

                <div className="upload-card">
                  <div>
                    <div className="upload-title">文档上传入口</div>
                    <p>支持 PDF / DOCX。你也可以直接用 Playwright 向文件输入框注入本地文件。</p>
                  </div>

                  <div className="upload-actions">
                    <button
                      className="secondary-button upload-action-button upload-action-button-primary"
                      disabled={busy !== 'idle'}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      上传文档
                    </button>
                    <button
                      className="secondary-button subtle upload-action-button upload-action-button-secondary"
                      disabled={busy !== 'idle'}
                      onClick={() => void handleSystemPicker()}
                    >
                      系统选择器
                    </button>
                    <input
                      ref={fileInputRef}
                      aria-label="上传文档文件"
                      className="visually-hidden"
                      type="file"
                      accept=".pdf,.docx"
                      multiple
                      onChange={(event) => void handleFileInputChange(event)}
                    />
                  </div>
                </div>

                <div className="document-list">
                  {documents.length === 0 ? (
                    <div className="empty-documents">还没有上传文档。</div>
                  ) : (
                    documents.map((document) => (
                      <article key={document.id} className="document-card">
                        <div className="document-meta">
                          <strong>{document.name}</strong>
                          <span>
                            {document.extension.toUpperCase().replace('.', '')} ·{' '}
                            {formatBytes(document.size)}
                          </span>
                        </div>
                        <p>{document.summary || '无摘要'}</p>
                      </article>
                    ))
                  )}
                </div>

                <div className="cta-row">
                  <button
                    className="primary-button"
                    disabled={busy !== 'idle'}
                    onClick={() => void handleStartSession()}
                  >
                    {busy === 'starting' ? '启动中...' : '开始真实 Claude 会话'}
                  </button>

                  <div className="selection-note">
                    当前将真实触发 <code>{selectedSkill.slashCommand}</code>
                  </div>
                </div>
              </article>

              <article className="panel panel-dark conversation-panel">
                <div className="conversation-header">
                  <div>
                    <div className="panel-tag">Conversation</div>
                    <h2>Claude 对话</h2>
                  </div>

                  {session ? (
                    <div className="session-summary">
                      <span>{getSkillDefinition(session.skillId).title}</span>
                      <code>{session.slashCommand}</code>
                    </div>
                  ) : (
                    <div className="muted-card">启动会话后这里显示真实对话。</div>
                  )}
                </div>

                <div className="conversation-feed">
                  {session && session.messages.length > 0 ? (
                    session.messages.map((message) => (
                      <article
                        key={message.id}
                        className={`message-bubble ${message.role} ${message.kind}`}
                      >
                        <div className="message-meta">
                          <span>{message.role === 'assistant' ? 'Claude' : message.role === 'user' ? '你' : '系统'}</span>
                          <time>{formatTime(message.createdAt)}</time>
                        </div>
                        <div className="markdown-body">
                          <ReactMarkdown>{message.content}</ReactMarkdown>
                        </div>
                      </article>
                    ))
                  ) : (
                    <div className="conversation-empty">
                      还没有对话。点击“开始真实 Claude 会话”后，这里会显示用户输入、slash command
                      触发状态和 Claude 输出。
                    </div>
                  )}
                </div>

                <div className="composer">
                  <label className="field composer-field">
                    <span>继续发送消息</span>
                    <textarea
                      aria-label="继续发送消息"
                      rows={5}
                      value={followUpMessage}
                      disabled={!session || busy !== 'idle'}
                      onChange={(event) => setFollowUpMessage(event.target.value)}
                      placeholder="例如：文书类型是 SOP，字数限制 900 words，先根据 CV1.pdf 梳理出一版更具体的问题。"
                    />
                  </label>

                  <div className="composer-actions">
                    <button
                      className="primary-button"
                      disabled={!session || busy !== 'idle'}
                      onClick={() => void handleSendMessage()}
                    >
                      {busy === 'sending' ? '发送中...' : '发送给 Claude'}
                    </button>

                    {session ? (
                      <button
                        className="secondary-button subtle"
                        disabled={busy !== 'idle'}
                        onClick={() => void window.desktopAPI.openPath(session.workspacePath)}
                      >
                        打开 workspace
                      </button>
                    ) : null}
                  </div>
                </div>
              </article>
            </div>
          </section>
        ) : (
          <section className="compare-page">
            <div className="compare-header panel panel-dark">
              <div>
                <div className="panel-tag">Compare</div>
                <h2>Claude 多版本 vs Qwen Baseline</h2>
                <p>第二页直接读取 `outputs/version-*.md`、`outputs/version-notes.md` 与 `outputs/baseline-qwen.md`。</p>
              </div>

              {session ? (
                <div className="session-summary">
                  <span>{getSkillDefinition(session.skillId).title}</span>
                  <code>{session.slashCommand}</code>
                  <button
                    className="secondary-button"
                    onClick={() => void window.desktopAPI.openPath(session.workspacePath)}
                  >
                    打开 workspace
                  </button>
                </div>
              ) : (
                <div className="muted-card">还没有会话。</div>
              )}
            </div>

            <div className="compare-grid">
              <article className="panel panel-contrast result-panel">
                <header className="result-header">
                  <div>
                    <div className="eyebrow">Before</div>
                    <h3>Qwen Baseline</h3>
                  </div>
                  <button
                    className="secondary-button"
                    disabled={!session || busy !== 'idle'}
                    onClick={() => void handleRunBaseline()}
                  >
                    {busy === 'baseline' ? '运行中...' : '运行 Qwen baseline'}
                  </button>
                </header>

                <div className="result-body result-card">
                  {session?.baselineMarkdown ? (
                    <div className="markdown-body">
                      <ReactMarkdown>{session.baselineMarkdown}</ReactMarkdown>
                    </div>
                  ) : (
                    <div className="result-placeholder">
                      运行 Qwen baseline 后，这里会展示 `outputs/baseline-qwen.md` 的内容。
                    </div>
                  )}
                </div>
              </article>

              <article className="panel panel-contrast result-panel">
                <header className="result-header">
                  <div>
                    <div className="eyebrow">After</div>
                    <h3>Claude Versions</h3>
                  </div>
                  <div className="version-tabs">
                    {session?.versions.map((version) => (
                      <button
                        key={version.id}
                        className={`version-tab ${version.id === activeVersionId ? 'active' : ''}`}
                        onClick={() => setActiveVersionId(version.id)}
                      >
                        {version.id}
                      </button>
                    ))}
                  </div>
                </header>

                <div className="result-body result-card">
                  {activeVersion ? (
                    <>
                      <div className="result-toolbar">
                        <span>{activeVersion.fileName}</span>
                        <button
                          className="secondary-button"
                          disabled={!session || busy !== 'idle'}
                          onClick={() => void handleSelectVersion(activeVersion.id)}
                        >
                          写入 selected.md
                        </button>
                      </div>
                      <div className="markdown-body">
                        <ReactMarkdown>{activeVersion.content}</ReactMarkdown>
                      </div>
                    </>
                  ) : (
                    <div className="result-placeholder">
                      Claude 每轮回复都会写入 `outputs/version-*.md`，这里支持切换查看。
                    </div>
                  )}
                </div>
              </article>
            </div>

            <div className="details-grid">
              <article className="panel panel-light detail-panel">
                <div className="panel-tag panel-tag-dark">Version Notes</div>
                <h3>版本说明与选择状态</h3>
                <div className="version-meta-row">
                  <span>当前选中</span>
                  <strong>{session?.selectedVersionId ?? '尚未写入 selected.md'}</strong>
                </div>
                <div className="result-body light-surface">
                  {session?.versionNotesMarkdown ? (
                    <div className="markdown-body dark-text">
                      <ReactMarkdown>{session.versionNotesMarkdown}</ReactMarkdown>
                    </div>
                  ) : (
                    <div className="empty-panel">这里显示 `outputs/version-notes.md`。</div>
                  )}
                </div>
              </article>

              <article className="panel panel-light detail-panel">
                <div className="panel-tag panel-tag-dark">Workspace</div>
                <h3>目录与落盘检查</h3>
                {session ? (
                  <div className="path-list">
                    <button
                      className="path-item"
                      onClick={() => void window.desktopAPI.openPath(session.directories.stateDir)}
                    >
                      <span>state</span>
                      <code>{session.directories.stateDir}</code>
                    </button>
                    <button
                      className="path-item"
                      onClick={() => void window.desktopAPI.openPath(session.directories.outputsDir)}
                    >
                      <span>outputs</span>
                      <code>{session.directories.outputsDir}</code>
                    </button>
                    <button
                      className="path-item"
                      onClick={() => void window.desktopAPI.openPath(session.directories.claudeSkillsDir)}
                    >
                      <span>.claude/skills</span>
                      <code>{session.directories.claudeSkillsDir}</code>
                    </button>
                  </div>
                ) : (
                  <div className="empty-panel">启动会话后，这里可以直接打开 workspace 目录。</div>
                )}
              </article>
            </div>
          </section>
        )}
      </main>

      <footer className={`status-bar ${status.tone}`}>
        <span>Status</span>
        <p>{session?.lastError ?? status.message}</p>
      </footer>
    </div>
  )
}

function formatBytes(size: number): string {
  if (size < 1024) {
    return `${size} B`
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function formatTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit'
      })
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

async function toUploadedDocumentPayload(file: File): Promise<UploadedDocumentPayload> {
  const extension = file.name.includes('.') ? `.${file.name.split('.').pop()?.toLowerCase()}` : ''
  const buffer = await file.arrayBuffer()

  return {
    name: file.name,
    extension,
    size: file.size,
    dataBase64: arrayBufferToBase64(buffer)
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''

  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary)
}

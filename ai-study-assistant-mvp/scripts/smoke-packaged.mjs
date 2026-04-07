import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const executablePath = resolve(
  projectRoot,
  'dist/mac-arm64/AI Study Assistant MVP.app/Contents/MacOS/AI Study Assistant MVP'
)
const packagedSkillsDir = resolve(
  projectRoot,
  'dist/mac-arm64/AI Study Assistant MVP.app/Contents/Resources/resources/bundled-skills'
)
const cvPath = join(projectRoot, 'CV1.pdf')
const reportPath = join(projectRoot, 'report1.pdf')
const artifactDir = join(projectRoot, 'tmp-smoke-artifacts-packaged')

if (!existsSync(executablePath)) {
  throw new Error(`Packaged app not found: ${executablePath}`)
}

rmSync(artifactDir, { recursive: true, force: true })
mkdirSync(artifactDir, { recursive: true })

assertPackagedSkillsArePortable()
await runEssayFlow()
await runReportFlow()

console.log('Packaged Phase 2/3 smoke test passed.')

async function runEssayFlow() {
  console.log('[essay-packaged] launching app')
  const app = await electron.launch({
    executablePath
  })

  try {
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    console.log('[essay-packaged] uploading CV1.pdf')
    await window.getByLabel('上传文档文件').setInputFiles(cvPath)
    console.log('[essay-packaged] starting Claude session')
    await window
      .getByLabel('意图输入')
      .fill('我要申请 Columbia Learning Analytics，请结合 CV1.pdf 先开启真实文书对话，并在回复里尽量形成可比较的输出。')
    await window.getByRole('button', { name: '开始真实 Claude 会话' }).click()

    await waitForConversationReady(window, 1, 480000)

    await window
      .getByLabel('继续发送消息')
      .fill('文书类型是 SOP，目标项目是 Columbia Learning Analytics，字数上限 900 words。请基于 CV1.pdf 先梳理一版更具体的问题和故事线。')
    await window.getByRole('button', { name: '发送给 Claude' }).click()
    await waitForConversationReady(window, 2, 240000)

    await window
      .getByLabel('继续发送消息')
      .fill('请继续，把目前最清晰的一版中文要点直接写出来，突出教育产品、用户研究和转向学习分析的动机。')
    await window.getByRole('button', { name: '发送给 Claude' }).click()
    await waitForConversationReady(window, 3, 240000)

    await window.getByRole('button', { name: '对比页' }).click()
    await waitForVersionButtons(window, 3, 120000)
    await window.getByRole('button', { name: '运行 Qwen baseline' }).click()
    await window.waitForFunction(
      () => {
        const cards = Array.from(document.querySelectorAll('.result-card'))
        return Boolean(cards[0] && (cards[0].textContent || '').length > 120)
      },
      undefined,
      { timeout: 240000 }
    )
    await window.getByRole('button', { name: 'version-2' }).click()
    await window.getByRole('button', { name: '写入 selected.md' }).click()
    await waitForStatusText(window, 'version-2.md 已写入 outputs/selected.md。', 120000)

    const outputsDir = await readPathByLabel(window, 'outputs')
    const workspaceDir = dirname(outputsDir)
    const stateDir = join(workspaceDir, 'state')
    const skillsDir = join(workspaceDir, '.claude', 'skills')
    const messagesJson = readFileSync(join(stateDir, 'messages.json'), 'utf8')

    assert.ok(existsSync(join(outputsDir, 'version-1.md')))
    assert.ok(existsSync(join(outputsDir, 'version-2.md')))
    assert.ok(existsSync(join(outputsDir, 'version-3.md')))
    assert.ok(existsSync(join(outputsDir, 'selected.md')))
    assert.ok(existsSync(join(outputsDir, 'baseline-qwen.md')))
    assert.ok(existsSync(join(skillsDir, 'essay-craft', 'SKILL.md')))
    assert.match(messagesJson, /Claude 已触发 \/essay-craft/)
    assertCleanSkillDirectory(skillsDir)
    assert.doesNotMatch(
      readFileSync(join(skillsDir, 'essay-craft', 'SKILL.md'), 'utf8'),
      /\/Users\//
    )

    const selectedMarkdown = readFileSync(join(outputsDir, 'selected.md'), 'utf8')
    const versionTwoMarkdown = readFileSync(join(outputsDir, 'version-2.md'), 'utf8')
    assert.equal(selectedMarkdown, versionTwoMarkdown)

    await window.screenshot({ path: join(artifactDir, 'essay-packaged.png'), fullPage: true })
    console.log('[essay-packaged] done')
  } finally {
    await app.close()
  }
}

async function runReportFlow() {
  console.log('[report-packaged] launching app')
  const app = await electron.launch({
    executablePath
  })

  try {
    const window = await app.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await window.getByRole('button', { name: '报告写作' }).click()
    await window.getByLabel('上传文档文件').setInputFiles(reportPath)
    await window
      .getByLabel('意图输入')
      .fill('请基于 report1.pdf 启动真实报告写作会话，并先识别题目、约束和后续推进方式。')
    await window.getByRole('button', { name: '开始真实 Claude 会话' }).click()

    await waitForConversationReady(window, 1, 480000)

    await window
      .getByLabel('继续发送消息')
      .fill('请继续，根据 report1.pdf 先明确 topic、字数约束、audience 和你下一步需要我补充的最小信息。')
    await window.getByRole('button', { name: '发送给 Claude' }).click()
    await waitForConversationReady(window, 2, 240000)

    await window.getByRole('button', { name: '对比页' }).click()
    const outputsDir = await readPathByLabel(window, 'outputs')
    const skillsDir = await readPathByLabel(window, '.claude/skills')
    const stateDir = join(dirname(outputsDir), 'state')
    const reportSkillDir = join(skillsDir, 'report-ta-orchestrator')
    const messagesJson = readFileSync(join(stateDir, 'messages.json'), 'utf8')

    assert.ok(existsSync(join(reportSkillDir, 'SKILL.md')))
    assert.ok(existsSync(join(reportSkillDir, 'references')))
    assert.ok(existsSync(join(reportSkillDir, 'scripts')))
    assert.match(messagesJson, /Claude 已触发 \/report-ta-orchestrator/)
    assertCleanSkillDirectory(skillsDir)

    await window.screenshot({ path: join(artifactDir, 'report-packaged.png'), fullPage: true })
    console.log('[report-packaged] done')
  } finally {
    await app.close()
  }
}

async function waitForConversationReady(window, count, timeout) {
  await window.waitForFunction(
    (expectedCount) => {
      const assistantCount = document.querySelectorAll('.message-bubble.assistant:not(.loading)').length
      const followUp = document.querySelector('textarea[aria-label="继续发送消息"]')
      return assistantCount >= expectedCount && followUp instanceof HTMLTextAreaElement && !followUp.disabled
    },
    count,
    { timeout }
  )
}

async function waitForVersionButtons(window, count, timeout) {
  await window.waitForFunction(
    (expectedCount) => document.querySelectorAll('.version-tab').length >= expectedCount,
    count,
    { timeout }
  )
}

async function waitForStatusText(window, text, timeout) {
  await window
    .locator('.status-bar')
    .filter({ hasText: text })
    .first()
    .waitFor({ state: 'visible', timeout })
}

async function readPathByLabel(window, label) {
  const button = window.locator('.path-item').filter({ hasText: label }).first()
  const pathText = (await button.locator('code').textContent())?.trim()
  assert.ok(pathText, `Unable to read path for ${label}`)
  return pathText
}

function assertPackagedSkillsArePortable() {
  assert.ok(existsSync(join(packagedSkillsDir, 'essay-craft', 'SKILL.md')))
  assert.ok(existsSync(join(packagedSkillsDir, 'report-ta-orchestrator', 'SKILL.md')))
  assertCleanSkillDirectory(packagedSkillsDir)
  assert.doesNotMatch(
    readFileSync(join(packagedSkillsDir, 'essay-craft', 'SKILL.md'), 'utf8'),
    /\/Users\//
  )
}

function assertCleanSkillDirectory(rootDir) {
  for (const skillDirName of ['essay-craft', 'report-ta-orchestrator']) {
    for (const junkFileName of ['.DS_Store', 'Untitled']) {
      const junkPath = join(rootDir, skillDirName, junkFileName)
      assert.ok(!existsSync(junkPath), `Unexpected skill artifact found: ${junkPath}`)
    }
  }
}

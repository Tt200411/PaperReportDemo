import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { _electron as electron } from 'playwright'

const executablePath = resolve(
  'dist/mac-arm64/AI Study Assistant MVP.app/Contents/MacOS/AI Study Assistant MVP'
)
const skill = process.env.SMOKE_SKILL || 'statement-writing'

if (!existsSync(executablePath)) {
  throw new Error(`Packaged app not found: ${executablePath}`)
}

const app = await electron.launch({
  executablePath
})

try {
  const window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')
  await window.waitForTimeout(1200)

  if (skill === 'report-writing') {
    await window.getByRole('button', { name: /报告写作/ }).click()
    await window
      .getByLabel('用户意图')
      .fill(
        '请帮我写一篇数字平台治理课程报告，主题是算法透明度与用户信任的关系。中文 2500 字以内，引用必须真实，我打算结合平台规则说明和课程阅读来写，整体立场偏向“透明度与信任是条件关系，而不是自动正相关”。'
      )
  } else {
    await window
      .getByLabel('用户意图')
      .fill('请帮我写一篇申请 Learning Sciences 硕士的 SOP，重点突出我在教育产品与用户研究上的经历。')
  }

  await window.getByRole('button', { name: '启动顾问会话' }).click()
  await waitForAssistantMessageCount(window, 1, 300000)

  const initialAssistantText = await latestAssistantText(window)
  assert.ok(initialAssistantText.length > 40, 'Consultant first turn is too short.')

  await window
    .getByLabel('继续补充信息')
    .fill(
      skill === 'report-writing'
        ? '老师要求中文 2500 字以内，引用必须真实。我准备使用 TikTok 的推荐系统说明作案例，课程阅读想用 Pasquale 2015《The Black Box Society》和 Diakopoulos 2016《Accountability in Algorithmic Decision Making》，核心论点是“透明度只有在可解释和可争辩时才会提升用户信任”。'
        : '我更想突出自己把真实学习问题转化成产品方案的能力，长度控制在 900 words 左右，不要编造学校信息。'
    )
  await window.getByRole('button', { name: '发送给顾问' }).click()
  await waitForAssistantMessageCount(window, 2, 300000)

  const secondAssistantText = await latestAssistantText(window)
  assert.ok(secondAssistantText.length > 40, 'Consultant second turn is too short.')

  await window.getByRole('button', { name: '生成候选版本' }).click()
  await window.waitForFunction(
    () => {
      const cards = Array.from(document.querySelectorAll('.result-card'))
      return Boolean(cards[0] && (cards[0].textContent || '').length > 160)
    },
    undefined,
    { timeout: 360000 }
  )

  const candidateCardText = (await window.locator('.result-card').nth(0).textContent()) ?? ''
  assert.ok(
    candidateCardText.length > 160 && !candidateCardText.includes('请选择要浏览的版本。'),
    'Candidate version did not render correctly.'
  )

  await window.getByRole('button', { name: '选中当前版本' }).click()
  await window.waitForFunction(
    () => Array.from(document.querySelectorAll('*')).some((node) => /已选中：version-/.test(node.textContent || '')),
    undefined,
    { timeout: 120000 }
  )

  await window.getByRole('button', { name: '运行 Qwen 对照组' }).click()
  await window.waitForFunction(
    () => {
      const cards = Array.from(document.querySelectorAll('.result-card'))
      return Boolean(cards[2] && (cards[2].textContent || '').length > 160)
    },
    undefined,
    { timeout: 240000 }
  )

  const baselineCardText = (await window.locator('.result-card').nth(2).textContent()) ?? ''
  assert.ok(
    baselineCardText.length > 160 && !baselineCardText.includes('运行 Qwen 对照组后在这里显示。'),
    'Baseline result did not render correctly.'
  )

  const workspacePath = ((await window.locator('.mono').textContent()) ?? '').trim()
  assert.ok(workspacePath.length > 10, 'Workspace path did not render.')

  assert.ok(existsSync(join(workspacePath, 'state', 'current-brief.md')))
  assert.ok(existsSync(join(workspacePath, 'outputs', 'version-1.md')))
  assert.ok(existsSync(join(workspacePath, 'outputs', 'version-2.md')))
  assert.ok(existsSync(join(workspacePath, 'outputs', 'version-3.md')))
  assert.ok(existsSync(join(workspacePath, 'outputs', 'version-notes.md')))
  assert.ok(existsSync(join(workspacePath, 'outputs', 'selected.md')))
  assert.ok(existsSync(join(workspacePath, 'outputs', 'baseline-qwen.md')))

  const statusText = (await window.locator('.status-bar').textContent()) ?? ''
  assert.match(statusText, /(完成|已生成|已写入)/)

  console.log(`Packaged smoke test passed for ${skill}.`)
} finally {
  await app.close()
}

async function waitForAssistantMessageCount(window, count, timeout) {
  await window.waitForFunction(
    (expectedCount) => document.querySelectorAll('.message-bubble.assistant').length >= expectedCount,
    count,
    { timeout }
  )
}

async function latestAssistantText(window) {
  const assistantMessages = window.locator('.message-bubble.assistant')
  const lastIndex = (await assistantMessages.count()) - 1
  return ((await assistantMessages.nth(lastIndex).textContent()) ?? '').trim()
}

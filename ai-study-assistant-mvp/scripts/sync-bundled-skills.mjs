import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = resolve(projectRoot, '..')
const outputRoot = join(projectRoot, 'resources', 'bundled-skills')
const ignoredEntryNames = new Set(['.DS_Store', 'Untitled'])

const skillSources = {
  'essay-craft': [
    join(projectRoot, 'skills', 'essay-craft'),
    join(repoRoot, 'skills', 'essay-craft'),
    join(repoRoot, '申请文书Skills', 'essay-craft')
  ],
  'report-ta-orchestrator': [
    join(projectRoot, 'skills', 'report-ta-orchestrator'),
    join(repoRoot, 'skills', 'report-ta-orchestrator'),
    join(repoRoot, 'Report_Skills')
  ]
}

mkdirSync(outputRoot, { recursive: true })

for (const [skillId, candidates] of Object.entries(skillSources)) {
  const sourcePath = candidates.find((candidate) => existsSync(candidate))

  if (!sourcePath) {
    throw new Error(
      `Unable to locate source for ${skillId}. Looked in:\n${candidates
        .map((candidate) => `- ${candidate}`)
        .join('\n')}`
    )
  }

  const targetPath = join(outputRoot, skillId)
  rmSync(targetPath, { recursive: true, force: true })
  cpSync(sourcePath, targetPath, {
    recursive: true,
    force: true
  })
  removeIgnoredEntries(targetPath)
}

console.log(`Bundled skills synchronized to ${outputRoot}`)

function removeIgnoredEntries(directoryPath) {
  for (const entry of readdirSync(directoryPath, { withFileTypes: true })) {
    const entryPath = join(directoryPath, entry.name)

    if (ignoredEntryNames.has(entry.name)) {
      rmSync(entryPath, { recursive: true, force: true })
      continue
    }

    if (entry.isDirectory()) {
      removeIgnoredEntries(entryPath)
    }
  }
}

import { ipcMain, shell } from 'electron'
import type {
  BaselineRequest,
  SelectVersionRequest,
  SessionMessageRequest,
  SessionStartRequest
} from '@shared/types'
import { continueSession, startSession } from './services/claude-runner'
import {
  extractDocumentsFromPaths,
  extractDocumentsFromUploads,
  pickAndExtractDocuments
} from './services/document-service'
import { runQwenBaseline } from './services/qwen-runner'
import { readSessionSnapshot, selectClaudeVersion } from './services/session-service'

export function registerIpcHandlers(): void {
  ipcMain.handle('documents:pick', async () => pickAndExtractDocuments())
  ipcMain.handle('documents:extract-paths', async (_event, paths: string[]) =>
    extractDocumentsFromPaths(paths)
  )
  ipcMain.handle('documents:extract-uploads', async (_event, payloads) =>
    extractDocumentsFromUploads(payloads)
  )

  ipcMain.handle('session:start', async (_event, request: SessionStartRequest) =>
    startSession(request)
  )
  ipcMain.handle('session:send-message', async (_event, request: SessionMessageRequest) =>
    continueSession(request)
  )
  ipcMain.handle('session:get-state', async (_event, localSessionId: string) =>
    readSessionSnapshot(localSessionId)
  )
  ipcMain.handle('session:run-baseline', async (_event, request: BaselineRequest) => {
    await runQwenBaseline(request)
    return readSessionSnapshot(request.localSessionId)
  })
  ipcMain.handle('session:select-version', async (_event, request: SelectVersionRequest) => {
    await selectClaudeVersion(request.localSessionId, request.versionId)
    return readSessionSnapshot(request.localSessionId)
  })

  ipcMain.handle('path:open', async (_event, path: string) => {
    await shell.openPath(path)
  })
}

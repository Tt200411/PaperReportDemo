import { contextBridge, ipcRenderer } from 'electron'
import type {
  BaselineRequest,
  DesktopAPI,
  DocumentExtraction,
  SelectVersionRequest,
  SessionMessageRequest,
  SessionSnapshot,
  SessionStartRequest,
  UploadedDocumentPayload
} from '@shared/types'

const api: DesktopAPI = {
  pickDocuments: () => ipcRenderer.invoke('documents:pick') as Promise<DocumentExtraction[]>,
  extractDocuments: (paths: string[]) =>
    ipcRenderer.invoke('documents:extract-paths', paths) as Promise<DocumentExtraction[]>,
  extractUploadedDocuments: (documents: UploadedDocumentPayload[]) =>
    ipcRenderer.invoke('documents:extract-uploads', documents) as Promise<DocumentExtraction[]>,
  startSession: (request: SessionStartRequest) =>
    ipcRenderer.invoke('session:start', request) as Promise<SessionSnapshot>,
  sendSessionMessage: (request: SessionMessageRequest) =>
    ipcRenderer.invoke('session:send-message', request) as Promise<SessionSnapshot>,
  getSessionState: (localSessionId: string) =>
    ipcRenderer.invoke('session:get-state', localSessionId) as Promise<SessionSnapshot>,
  runBaseline: (request: BaselineRequest) =>
    ipcRenderer.invoke('session:run-baseline', request) as Promise<SessionSnapshot>,
  selectClaudeVersion: (request: SelectVersionRequest) =>
    ipcRenderer.invoke('session:select-version', request) as Promise<SessionSnapshot>,
  openPath: (path: string) => ipcRenderer.invoke('path:open', path) as Promise<void>
}

contextBridge.exposeInMainWorld('desktopAPI', api)

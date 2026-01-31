// src/preload.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  runTest: (data: any) => ipcRenderer.invoke('run-playwright', data),
  saveScript: (data: any) => ipcRenderer.invoke('save-script', data),
  readScript: (fileName: string) => ipcRenderer.invoke('read-script', { fileName }),
  deleteScript: (fileName: string) => ipcRenderer.invoke('delete-script', { fileName }),
  getScripts: () => ipcRenderer.invoke('get-scripts'),
  // New Envs Management
  getEnvs: () => ipcRenderer.invoke('get-envs'),
  saveEnvs: (data: any) => ipcRenderer.invoke('save-envs', data),
  // Session Management
  getSessionStatus: (envId: string) => ipcRenderer.invoke('get-session-status', envId),
  logout: (envId: string) => ipcRenderer.invoke('logout', envId),
});
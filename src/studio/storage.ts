import { AspectRatio } from '../aspect';
import { AudioProjectState, DEFAULT_AUDIO_PROJECT } from './audioTypes';
import { CustomCharacterDef } from './characterCode';
import { AppliedSkillInstance } from './editSkills';
import { sanitizeAndValidateScript, StudioScript } from './schema';

const DB_NAME = 'blobtoon_studio_db_v3';
const SCRIPT_STORE = 'scripts';
const AUDIO_STORE = 'audios';
const CHAR_STORE = 'characters';
const AUDIO_PROJECT_KEY = 'project_audio_v1';

export interface ExportedProjectFile {
  version: 1 | 2 | 3;
  topic: string;
  aspect?: AspectRatio;
  script: StudioScript;
  lineAudios: Record<string, { durationSec: number; audioBase64: string; mimeType: string }>;
  sceneAudios: Record<number, { durationSec: number; audioBase64: string; mimeType: string }>;
  customCharacters?: CustomCharacterDef[];
  appliedSkills?: AppliedSkillInstance[];
  audioProject?: AudioProjectState;
}

export function hashString(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function openStudioDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 3);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SCRIPT_STORE)) db.createObjectStore(SCRIPT_STORE, { keyPath: 'key' });
      if (!db.objectStoreNames.contains(AUDIO_STORE)) db.createObjectStore(AUDIO_STORE, { keyPath: 'key' });
      if (!db.objectStoreNames.contains(CHAR_STORE)) db.createObjectStore(CHAR_STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadAudioProjectState(): Promise<AudioProjectState> {
  try {
    const db = await openStudioDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(AUDIO_STORE, 'readonly');
      const req = tx.objectStore(AUDIO_STORE).get(AUDIO_PROJECT_KEY);
      req.onsuccess = () => {
        const st = req.result?.state as Partial<AudioProjectState> | undefined;
        if (!st) { resolve(DEFAULT_AUDIO_PROJECT); return; }
        resolve({
          library: Array.isArray(st.library) ? st.library : [],
          placements: Array.isArray(st.placements) ? st.placements : [],
          eventBindings: Array.isArray(st.eventBindings) ? st.eventBindings : [],
          musicConfig: { ...DEFAULT_AUDIO_PROJECT.musicConfig, ...(st.musicConfig || {}) },
          mixer: { ...DEFAULT_AUDIO_PROJECT.mixer, ...(st.mixer || {}) },
        });
      };
      req.onerror = () => resolve(DEFAULT_AUDIO_PROJECT);
    });
  } catch {
    return DEFAULT_AUDIO_PROJECT;
  }
}

export async function saveAudioProjectState(state: AudioProjectState): Promise<void> {
  try {
    const db = await openStudioDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(AUDIO_STORE, 'readwrite');
      tx.objectStore(AUDIO_STORE).put({ key: AUDIO_PROJECT_KEY, state, updatedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch { /* ignore */ }
}

export async function getSavedCharacters(): Promise<CustomCharacterDef[]> {
  try {
    const db = await openStudioDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(CHAR_STORE, 'readonly');
      const req = tx.objectStore(CHAR_STORE).getAll();
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

export async function saveCustomCharacter(charDef: CustomCharacterDef): Promise<void> {
  try {
    const db = await openStudioDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(CHAR_STORE, 'readwrite');
      tx.objectStore(CHAR_STORE).put(charDef);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch { /* ignore */ }
}

export async function deleteCustomCharacter(id: string): Promise<void> {
  try {
    const db = await openStudioDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(CHAR_STORE, 'readwrite');
      tx.objectStore(CHAR_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch { /* ignore */ }
}

export async function getCachedScript(topic: string): Promise<StudioScript | null> {
  try {
    const db = await openStudioDb();
    const key = `script:${hashString(topic.trim().toLowerCase())}`;
    return await new Promise((resolve) => {
      const tx = db.transaction(SCRIPT_STORE, 'readonly');
      const req = tx.objectStore(SCRIPT_STORE).get(key);
      req.onsuccess = () => {
        if (!req.result?.script) { resolve(null); return; }
        try { resolve(sanitizeAndValidateScript(req.result.script).script); } catch { resolve(null); }
      };
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
}

export async function setCachedScript(topic: string, script: StudioScript): Promise<void> {
  try {
    const db = await openStudioDb();
    const key = `script:${hashString(topic.trim().toLowerCase())}`;
    await new Promise<void>((resolve) => {
      const tx = db.transaction(SCRIPT_STORE, 'readwrite');
      tx.objectStore(SCRIPT_STORE).put({ key, topic, script, updatedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch { /* ignore */ }
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const clean = base64.includes(',') ? base64.split(',')[1] : base64;
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

export async function decodeAudioDurationSec(audioBase64: string, fallbackText = ''): Promise<number> {
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  try {
    const decoded = await ctx.decodeAudioData(base64ToArrayBuffer(audioBase64).slice(0));
    return Number(Math.max(0.6, decoded.duration).toFixed(2));
  } catch {
    const words = fallbackText.trim().split(/\s+/).filter(Boolean).length;
    return Math.max(1.8, Number((words * 0.36 + 0.5).toFixed(2)));
  } finally {
    void ctx.close().catch(() => {});
  }
}

export function readFileAsBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve({ base64: result.includes(',') ? result.split(',')[1] : result, mimeType: file.type || 'audio/wav' });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function downloadProjectJson(project: ExportedProjectFile): void {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.script.title.slice(0, 32).replace(/\s+/g, '_')}.blobtoon.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function parseImportedProjectFile(file: File): Promise<ExportedProjectFile> {
  const raw = JSON.parse(await file.text()) as Partial<ExportedProjectFile>;
  const { script } = sanitizeAndValidateScript(raw.script ?? raw);
  return {
    version: 3,
    topic: typeof raw.topic === 'string' ? raw.topic : script.title,
    aspect: raw.aspect,
    script,
    lineAudios: raw.lineAudios ?? {},
    sceneAudios: raw.sceneAudios ?? {},
    customCharacters: Array.isArray(raw.customCharacters) ? raw.customCharacters : [],
    appliedSkills: Array.isArray(raw.appliedSkills) ? raw.appliedSkills : [],
    audioProject: raw.audioProject
      ? {
          library: Array.isArray(raw.audioProject.library) ? raw.audioProject.library : [],
          placements: Array.isArray(raw.audioProject.placements) ? raw.audioProject.placements : [],
          eventBindings: Array.isArray(raw.audioProject.eventBindings) ? raw.audioProject.eventBindings : [],
          musicConfig: { ...DEFAULT_AUDIO_PROJECT.musicConfig, ...(raw.audioProject.musicConfig || {}) },
          mixer: { ...DEFAULT_AUDIO_PROJECT.mixer, ...(raw.audioProject.mixer || {}) },
        }
      : DEFAULT_AUDIO_PROJECT,
  };
}

import React, { useState } from 'react';
import { vi } from '../i18n';
import {
  AppliedSkillInstance,
   EditSkillPreset,
  EXAMPLE_EDIT_SKILLS,
  SkillSegmentScope,
} from './editSkills';
import { StudioTimeline } from './schema';

interface EditSkillsTabProps {
  timeline: StudioTimeline;
  selectedSceneIdx: number;
  appliedSkills: AppliedSkillInstance[];
  setAppliedSkills: React.Dispatch<React.SetStateAction<AppliedSkillInstance[]>>;
  bypassSkills: boolean;
  setBypassSkills: React.Dispatch<React.SetStateAction<boolean>>;
}

export function EditSkillsTab({
  timeline,
  selectedSceneIdx,
  appliedSkills,
  setAppliedSkills,
  bypassSkills,
  setBypassSkills,
}: EditSkillsTabProps) {
  const [presets, setPresets] = useState<EditSkillPreset[]>(EXAMPLE_EDIT_SKILLS);
  const [selectedPresetId, setSelectedPresetId] = useState<string>(EXAMPLE_EDIT_SKILLS[0].id);
  const [scopeKind, setScopeKind] = useState<SkillSegmentScope['kind']>('scene');
  const [scopeSceneIdx, setScopeSceneIdx] = useState<number>(selectedSceneIdx);
  const [startLineIdx, setStartLineIdx] = useState(0);
  const [endLineIdx, setEndLineIdx] = useState(1);
  const [startSec, setStartSec] = useState(0);
  const [endSec, setEndSec] = useState(3);

  const handleAddSkill = () => {
    const preset = presets.find((p) => p.id === selectedPresetId) ?? presets[0];
    if (!preset) return;
    const scope: SkillSegmentScope =
      scopeKind === 'scene'
        ? { kind: 'scene', sceneIdx: scopeSceneIdx }
        : scopeKind === 'lineRange'
          ? { kind: 'lineRange', sceneIdx: scopeSceneIdx, startLineIdx, endLineIdx }
          : { kind: 'timeRange', startSec, endSec };

    const inst: AppliedSkillInstance = {
      instanceId: `sk_${ appliedSkills.length + 1 }_${ preset.id }`,
      presetId: preset.id,
      name: preset.name,
      description: preset.description,
      enabled: true,
      order: appliedSkills.length,
      scope,
      parameters: { ...preset.parameters },
      effects: [...preset.effects],
    };
    setAppliedSkills((prev) => [...prev, inst]);
  };

  const moveSkill = (idx: number, dir: -1 | 1) => {
    setAppliedSkills((prev) => {
      const sorted = [...prev].sort((a, b) => a.order - b.order);
      const target = idx + dir;
      if (target < 0 || target >= sorted.length) return prev;
      const tmp = sorted[idx];
      sorted[idx] = sorted[target];
      sorted[target] = tmp;
      return sorted.map((s, i) => ({ ...s, order: i }));
    });
  };

  const updateParam = <K extends keyof EditSkillPreset['parameters']>(
    instanceId: string,
    key: K,
    value: EditSkillPreset['parameters'][K]
  ) => {
    setAppliedSkills((prev) =>
      prev.map((s) =>
        s.instanceId === instanceId
          ? { ...s, parameters: { ...s.parameters, [key]: value } }
          : s
      )
    );
  };

  const ordered = [...appliedSkills].sort((a, b) => a.order - b.order);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-amber-400">{vi.skills.header}</h2>
        <div className="flex items-center gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => setBypassSkills((b) => !b)}
            className={`px-2.5 py-1 rounded font-semibold cursor-pointer ${bypassSkills ? 'bg-rose-600 text-white' : 'bg-emerald-950 text-emerald-300 border border-emerald-700'}`}
          >
            {bypassSkills ? vi.header.beforeAfterOn : vi.header.beforeAfterOff}
          </button>
          <label className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 cursor-pointer">
            {vi.skills.importSkillBtn}
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  const raw = JSON.parse(await f.text()) as EditSkillPreset;
                  if (raw.name && Array.isArray(raw.effects)) {
                    const id = raw.id || `custom_${presets.length + 1}`;
                    setPresets((p) => [...p, { ...raw, id }]);
                    setSelectedPresetId(id);
                  }
                } catch { /* ignore invalid JSON */ }
              }}
            />
          </label>
        </div>
      </div>

      <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 space-y-2 text-xs">
        <div className="flex gap-2">
          <select
            value={selectedPresetId}
            onChange={(e) => setSelectedPresetId(e.target.value)}
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5"
          >
            {presets.map((p) => (
              <option key={p.id} value={p.id}>{p.name} — {p.description.slice(0, 38)}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleAddSkill}
            className="px-3 py-1.5 rounded bg-amber-400 hover:bg-amber-300 text-zinc-950 font-bold cursor-pointer shrink-0"
          >
            {vi.skills.addSkillBtn}
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 items-center">
          <select value={scopeKind} onChange={(e) => setScopeKind(e.target.value as SkillSegmentScope['kind'])} className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1">
            <option value="scene">{vi.skills.scopeScene}</option>
            <option value="lineRange">{vi.skills.scopeLines}</option>
            <option value="timeRange">{vi.skills.scopeTime}</option>
          </select>
          {scopeKind !== 'timeRange' ? (
            <select value={scopeSceneIdx} onChange={(e) => setScopeSceneIdx(Number(e.target.value))} className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1">
              {timeline.scenes.map((sc, i) => <option key={i} value={i}>Cảnh {i + 1}: {sc.label}</option>)}
            </select>
          ) : (
            <input type="number" step={0.5} value={startSec} onChange={(e) => setStartSec(Number(e.target.value))} className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1" placeholder="Từ (s)" />
          )}
          {scopeKind === 'lineRange' && (
            <div className="flex items-center gap-1">
              <input type="number" min={0} max={5} value={startLineIdx} onChange={(e) => setStartLineIdx(Number(e.target.value))} className="w-full bg-zinc-900 border border-zinc-800 rounded px-1.5 py-1" />
              <span>→</span>
              <input type="number" min={0} max={5} value={endLineIdx} onChange={(e) => setEndLineIdx(Number(e.target.value))} className="w-full bg-zinc-900 border border-zinc-800 rounded px-1.5 py-1" />
            </div>
          )}
          {scopeKind === 'timeRange' && (
            <input type="number" step={0.5} value={endSec} onChange={(e) => setEndSec(Number(e.target.value))} className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1" placeholder="Đến (s)" />
          )}
        </div>
      </div>

      <div className="space-y-2 max-h-64 overflow-y-auto">
        {ordered.length === 0 && <div className="text-xs text-zinc-500 text-center py-3">{vi.skills.emptyNote}</div>}
        {ordered.map((sk, idx) => (
          <div key={sk.instanceId} className="bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 space-y-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-1.5 font-semibold text-amber-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sk.enabled}
                  onChange={(e) => setAppliedSkills((prev) => prev.map((x) => (x.instanceId === sk.instanceId ? { ...x, enabled: e.target.checked } : x)))}
                />
                <span>#{idx + 1} {sk.name}</span>
              </label>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => moveSkill(idx, -1)} className="px-1.5 py-0.5 rounded bg-zinc-800 cursor-pointer">↑</button>
                <button type="button" onClick={() => moveSkill(idx, 1)} className="px-1.5 py-0.5 rounded bg-zinc-800 cursor-pointer">↓</button>
                <button
                  type="button"
                  onClick={() => {
                    const blob = new Blob([JSON.stringify({ id: sk.presetId, name: sk.name, description: sk.description, parameters: sk.parameters, effects: sk.effects }, null, 2)], { type: 'application/json' });
                    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${sk.presetId}.skill.json`; a.click();
                  }}
                  className="px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300 cursor-pointer"
                >
                  {vi.skills.exportSkillBtn}
                </button>
                <button type="button" onClick={() => setAppliedSkills((prev) => prev.filter((x) => x.instanceId !== sk.instanceId))} className="px-1.5 py-0.5 rounded bg-zinc-800 text-rose-400 cursor-pointer">✕</button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] text-zinc-300">
              <label className="flex flex-col">
                <span>Zoom ({sk.parameters.zoomIntensity ?? 0})</span>
                <input type="range" min={0} max={0.5} step={0.02} value={sk.parameters.zoomIntensity ?? 0} onChange={(e) => updateParam(sk.instanceId, 'zoomIntensity', Number(e.target.value))} />
              </label>
              <label className="flex flex-col">
                <span>Rung ({sk.parameters.shakeAmount ?? 0})</span>
                <input type="range" min={0} max={36} step={2} value={sk.parameters.shakeAmount ?? 0} onChange={(e) => updateParam(sk.instanceId, 'shakeAmount', Number(e.target.value))} />
              </label>
              <label className="flex flex-col">
                <span>Tốc độ ({sk.parameters.speedRate ?? 1}x)</span>
                <input type="range" min={0.5} max={1.8} step={0.1} value={sk.parameters.speedRate ?? 1} onChange={(e) => updateParam(sk.instanceId, 'speedRate', Number(e.target.value))} />
              </label>
              <label className="flex flex-col">
                <span>Glitch ({sk.parameters.glitchAmount ?? 0})</span>
                <input type="range" min={0} max={1} step={0.05} value={sk.parameters.glitchAmount ?? 0} onChange={(e) => updateParam(sk.instanceId, 'glitchAmount', Number(e.target.value))} />
              </label>
              <label className="flex flex-col">
                <span>Letterbox ({sk.parameters.letterboxRatio ?? 0})</span>
                <input type="range" min={0} max={0.055} step={0.005} value={sk.parameters.letterboxRatio ?? 0} onChange={(e) => updateParam(sk.instanceId, 'letterboxRatio', Number(e.target.value))} />
              </label>
              <label className="flex items-center gap-1.5 pt-2">
                <span>Màu chữ:</span>
                <input type="color" value={sk.parameters.captionHighlightColor || '#facc15'} onChange={(e) => updateParam(sk.instanceId, 'captionHighlightColor', e.target.value)} />
              </label>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

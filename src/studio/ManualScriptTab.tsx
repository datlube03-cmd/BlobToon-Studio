import React, { useEffect, useMemo, useState } from 'react';
import { AspectRatio } from '../aspect';
import { vi } from '../i18n';
import { parseDslToScript, serializeScriptToDsl } from './manualScript';
import { StudioScript } from './schema';

interface ManualScriptTabProps {
  script: StudioScript;
  aspect: AspectRatio;
  onApplyManualScript: (nextScript: StudioScript, nextAspect: AspectRatio) => void;
}

export function ManualScriptTab({
  script,
  aspect,
  onApplyManualScript,
}: ManualScriptTabProps) {
  const [dslText, setDslText] = useState(() => serializeScriptToDsl(script, aspect));
  const [appliedNotice, setAppliedNotice] = useState(false);

  useEffect(() => {
    setDslText(serializeScriptToDsl(script, aspect));
  }, [script, aspect]);

  const parsed = useMemo(() => parseDslToScript(dslText), [dslText]);
  const lineCount = useMemo(() => dslText.split(/\r?\n/).length, [dslText]);
  const errorLineSet = useMemo(() => new Set(parsed.errors.map((e) => e.line)), [parsed.errors]);

  const handleApply = () => {
    if (parsed.script && parsed.errors.length === 0) {
      onApplyManualScript(parsed.script, parsed.aspect ?? aspect);
      setAppliedNotice(true);
      setTimeout(() => setAppliedNotice(false), 2000);
    }
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-amber-400">{vi.left.manualHeader}</h2>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setDslText(serializeScriptToDsl(script, aspect))}
            className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200 cursor-pointer"
          >
            {vi.left.manualSyncFromAiBtn}
          </button>
          <button
            type="button"
            disabled={parsed.errors.length > 0 || !parsed.script}
            onClick={handleApply}
            className="px-3 py-1 rounded bg-amber-400 hover:bg-amber-300 text-zinc-950 font-bold text-xs cursor-pointer disabled:opacity-40"
          >
            {vi.left.manualApplyBtn}
          </button>
        </div>
      </div>

      <div className="relative flex rounded-lg border border-zinc-800 bg-zinc-950 overflow-hidden font-mono text-xs">
        <div className="select-none py-2.5 px-2 bg-zinc-900/90 text-right border-r border-zinc-800 text-zinc-500 leading-5">
          {Array.from({ length: lineCount }).map((_, idx) => {
            const ln = idx + 1;
            const hasErr = errorLineSet.has(ln);
            return (
              <div key={ln} className={hasErr ? 'text-rose-400 font-bold bg-rose-950/60 px-1 rounded' : 'px-1'}>
                {ln}
              </div>
            );
          })}
        </div>
        <textarea
          rows={Math.min(18, Math.max(12, lineCount))}
          value={dslText}
          onChange={(e) => setDslText(e.target.value)}
          spellCheck={false}
          className="flex-1 p-2.5 bg-transparent text-zinc-100 leading-5 focus:outline-none resize-y overflow-x-auto"
        />
      </div>

      {parsed.errors.length > 0 ? (
        <div className="rounded-lg bg-rose-950/70 border border-rose-700 p-2.5 space-y-1 max-h-36 overflow-y-auto text-xs">
          {parsed.errors.map((err, idx) => (
            <div key={idx} className="text-rose-200 flex items-start gap-2">
              <span className="font-mono font-bold text-rose-400 shrink-0">Dòng {err.line}:</span>
              <span>{err.message}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-center justify-between text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-800/70 rounded-lg px-3 py-1.5">
          <span>{appliedNotice ? '✓ Đã cập nhật kịch bản vào Timeline!' : vi.left.manualValidBadge}</span>
          <span className="text-zinc-400 font-mono">{parsed.script?.scenes.length ?? 0} cảnh</span>
        </div>
      )}
    </div>
  );
}

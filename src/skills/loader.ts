import fs from 'node:fs';
import path from 'node:path';
import {
  CameraShakeLevel,
  CameraShakeLevelSchema,
  CaptionStyle,
  CaptionStyleSchema,
  SkillDefinition,
  SkillDefinitionSchema,
  SkillRenderParams,
  SkillRenderParamsSchema,
  SkillTransitionType,
  SkillTransitionTypeSchema,
} from './schema';

export {
  CameraShakeLevelSchema,
  CaptionStyleSchema,
  SkillDefinitionSchema,
  SkillRenderParamsSchema,
  SkillTransitionTypeSchema,
};
export type {
  CameraShakeLevel,
  CaptionStyle,
  SkillDefinition,
  SkillRenderParams,
  SkillTransitionType,
};

/**
 * Parses a Markdown skill file following the `skills/<name>.md` convention:
 *
 * ## name: <skill-name>
 * description: <short description>
 *
 * ## Style Rules (writing style, pacing, tone)
 * <text description>
 *
 * ## Render Params (optional — technical parameters for Remotion)
 * ```json
 * { ... }
 * ```
 *
 * Throws a descriptive error including the file name if required fields are missing
 * or if the Render Params JSON has a syntax or schema error.
 */
export function parseSkillMarkdown(rawContent: string, fileName: string, filePath = fileName): SkillDefinition {
  const normalized = rawContent.replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    throw new Error(`[Skill Validation Error in ${fileName}]: Skill file is empty.`);
  }

  // 1. Extract name (supports "## name: foo", "name: foo", or "# name: foo")
  const nameMatch = normalized.match(/^(?:#+\s*)?name\s*:\s*(.+)$/im);
  const name = nameMatch ? nameMatch[1].trim().replace(/^['"]|['"]$/g, '') : '';
  if (!name) {
    throw new Error(
      `[Skill Validation Error in ${fileName}]: Missing required field "name:" (expected "## name: <skill-name>").`
    );
  }

  // 2. Extract description (supports "## description: ...", "description: ...")
  const descMatch = normalized.match(/^(?:#+\s*)?description\s*:\s*(.+)$/im);
  const description = descMatch ? descMatch[1].trim().replace(/^['"]|['"]$/g, '') : '';
  if (!description) {
    throw new Error(
      `[Skill Validation Error in ${fileName}]: Missing required field "description:" (expected "description: <short description>").`
    );
  }

  // 3. Extract "## Style Rules" section
  const styleHeaderRegex = /^##+\s*Style Rules[^\n]*$/im;
  const renderHeaderRegex = /^##+\s*Render Params[^\n]*$/im;

  const styleMatch = styleHeaderRegex.exec(normalized);
  if (!styleMatch || styleMatch.index === undefined) {
    throw new Error(
      `[Skill Validation Error in ${fileName}]: Missing required "## Style Rules" section.`
    );
  }

  const afterStyleStart = styleMatch.index + styleMatch[0].length;
  const renderMatch = renderHeaderRegex.exec(normalized);

  const styleEnd =
    renderMatch && renderMatch.index !== undefined && renderMatch.index > afterStyleStart
      ? renderMatch.index
      : normalized.length;

  const styleRules = normalized.slice(afterStyleStart, styleEnd).trim();
  if (!styleRules) {
    throw new Error(
      `[Skill Validation Error in ${fileName}]: "## Style Rules" section cannot be empty.`
    );
  }

  // 4. Extract optional "## Render Params" JSON section
  let renderParams: SkillRenderParams | undefined;
  if (renderMatch && renderMatch.index !== undefined) {
    const afterRenderStart = renderMatch.index + renderMatch[0].length;
    const renderSectionRaw = normalized.slice(afterRenderStart).trim();

    if (renderSectionRaw.length > 0) {
      const codeFenceMatch = renderSectionRaw.match(/```(?:json)?\s*([\s\S]*?)```/i);
      const jsonCandidate = codeFenceMatch ? codeFenceMatch[1].trim() : renderSectionRaw;

      if (jsonCandidate.length > 0) {
        let parsedJson: unknown;
        try {
          parsedJson = JSON.parse(jsonCandidate);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          throw new Error(
            `[Skill Validation Error in ${fileName}]: Syntax error in "Render Params" JSON — ${msg}`
          );
        }

        const validated = SkillRenderParamsSchema.safeParse(parsedJson);
        if (!validated.success) {
          const details = validated.error.issues
            .map((i) => `${i.path.length > 0 ? i.path.join('.') : '<root>'}: ${i.message}`)
            .join('; ');
          throw new Error(
            `[Skill Validation Error in ${fileName}]: Invalid "Render Params" schema — ${details}`
          );
        }
        renderParams = validated.data;
      }
    }
  }

  return SkillDefinitionSchema.parse({
    name,
    description,
    styleRules,
    renderParams,
    filePath,
    fileName,
  });
}

export function getSkillsDirectory(customDir?: string): string {
  return customDir ? path.resolve(customDir) : path.resolve(process.cwd(), 'skills');
}

/**
 * Loads and validates a single skill by name or filename from `skills/<name>.md`.
 */
export function loadSkillByName(skillNameOrFile: string, customSkillsDir?: string): SkillDefinition {
  const skillsDir = getSkillsDirectory(customSkillsDir);
  const cleaned = skillNameOrFile.trim().replace(/\.md$/i, '');
  const candidateFilename = `${cleaned}.md`;
  const candidatePath = path.join(skillsDir, candidateFilename);

  if (fs.existsSync(candidatePath)) {
    const raw = fs.readFileSync(candidatePath, 'utf-8');
    return parseSkillMarkdown(raw, candidateFilename, candidatePath);
  }

  // Also search all .md files in skills/ in case the internal `## name:` matches `skillNameOrFile`
  if (fs.existsSync(skillsDir)) {
    const entries = fs.readdirSync(skillsDir).filter((f) => f.toLowerCase().endsWith('.md'));
    for (const entry of entries) {
      const fullPath = path.join(skillsDir, entry);
      const raw = fs.readFileSync(fullPath, 'utf-8');
      const parsed = parseSkillMarkdown(raw, entry, fullPath);
      if (parsed.name.toLowerCase() === cleaned.toLowerCase()) {
        return parsed;
      }
    }
  }

  throw new Error(
    `[Skill Error]: Skill "${skillNameOrFile}" not found. Expected file at ${candidatePath}`
  );
}

export interface SkillScanEntry {
  fileName: string;
  filePath: string;
  valid: boolean;
  skill?: SkillDefinition;
  error?: string;
}

/**
 * Scans all `.md` files in `skills/` and returns their validation status and metadata.
 */
export function listAvailableSkills(customSkillsDir?: string): SkillScanEntry[] {
  const skillsDir = getSkillsDirectory(customSkillsDir);
  if (!fs.existsSync(skillsDir)) {
    return [];
  }

  const files = fs
    .readdirSync(skillsDir)
    .filter((f) => f.toLowerCase().endsWith('.md'))
    .sort();

  return files.map((fileName) => {
    const filePath = path.join(skillsDir, fileName);
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const skill = parseSkillMarkdown(raw, fileName, filePath);
      return {
        fileName,
        filePath,
        valid: true,
        skill,
      };
    } catch (err) {
      return {
        fileName,
        filePath,
        valid: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  });
}

export function formatSkillsReport(entries: SkillScanEntry[], skillsDir = getSkillsDirectory()): string {
  const lines: string[] = [];
  lines.push('==========================================================');
  lines.push(' BlobToon Skills Registry (skills/*.md)');
  lines.push('==========================================================');
  lines.push(`Directory: ${skillsDir}\n`);

  if (entries.length === 0) {
    lines.push('No skill files (*.md) found in skills/.');
    lines.push('Create one from skills/example-fastcut.md and run `npm run skills`.');
    return lines.join('\n');
  }

  for (const entry of entries) {
    if (entry.valid && entry.skill) {
      const s = entry.skill;
      const paramsSummary = s.renderParams ? JSON.stringify(s.renderParams) : 'default';
      lines.push(`[VALID] ${s.name.padEnd(20)} (${entry.fileName})`);
      lines.push(`        Description   : ${s.description}`);
      lines.push(`        Style Rules   : ${s.styleRules.replace(/\s+/g, ' ').slice(0, 95)}${s.styleRules.length > 95 ? '...' : ''}`);
      lines.push(`        Render Params : ${paramsSummary}`);
    } else {
      lines.push(`[ERROR] ${entry.fileName}`);
      lines.push(`        ${entry.error}`);
    }
    lines.push('----------------------------------------------------------');
  }

  const validCount = entries.filter((e) => e.valid).length;
  const errorCount = entries.length - validCount;
  lines.push(
    `Summary: ${validCount} valid skill(s), ${errorCount} invalid skill(s). Run with: npm run make -- "<topic>" --skill <name>`
  );
  return lines.join('\n');
}

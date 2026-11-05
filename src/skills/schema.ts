import { z } from 'zod';

export const CameraShakeLevelSchema = z.enum(['none', 'low', 'medium', 'high']);
export type CameraShakeLevel = z.infer<typeof CameraShakeLevelSchema>;

export const CaptionStyleSchema = z.enum(['default', 'bold-pop', 'neon-glow', 'minimal']);
export type CaptionStyle = z.infer<typeof CaptionStyleSchema>;

export const SkillTransitionTypeSchema = z.enum([
  'hard-cut',
  'fade',
  'slide',
  'zoom',
  'wipe',
  'iris',
]);
export type SkillTransitionType = z.infer<typeof SkillTransitionTypeSchema>;

export const SfxIntensitySchema = z.enum(['low', 'medium', 'high']);
export type SfxIntensity = z.infer<typeof SfxIntensitySchema>;

export const SkillRenderParamsSchema = z
  .object({
    sceneDurationRange: z
      .tuple([z.number().positive(), z.number().positive()])
      .refine(([min, max]) => min <= max, {
        message:
          'sceneDurationRange[0] (min) must be less than or equal to sceneDurationRange[1] (max)',
      })
      .optional(),
    cameraShake: CameraShakeLevelSchema.optional(),
    zoomPunchOnPunchline: z.boolean().optional(),
    captionStyle: CaptionStyleSchema.optional(),
    transitionType: SkillTransitionTypeSchema.optional(),
    bgmGenre: z.string().min(1).optional(),
    sfxIntensity: SfxIntensitySchema.optional(),
    ttsSpeedMultiplier: z.number().min(0.4).max(3.0).optional(),
    colorPalette: z
      .array(
        z
          .string()
          .regex(/^#[0-9a-fA-F]{3,8}$/, 'colorPalette entries must be valid hex color codes')
      )
      .min(2)
      .optional(),
    fontFamily: z.string().min(1).optional(),
  })
  .strict();

export type SkillRenderParams = z.infer<typeof SkillRenderParamsSchema>;

export const SkillDefinitionSchema = z.object({
  name: z.string().min(1, 'Skill "name" is required'),
  description: z.string().min(1, 'Skill "description" is required'),
  styleRules: z.string().min(1, 'Skill "Style Rules" section is required and cannot be empty'),
  renderParams: SkillRenderParamsSchema.optional(),
  filePath: z.string(),
  fileName: z.string(),
});

export type SkillDefinition = z.infer<typeof SkillDefinitionSchema>;

import React from 'react';
import { Accessory, AnimationType, Emotion } from '../script/schema';

export interface AnchorPoint {
  x: number;
  y: number;
}

export interface CharacterAnchorSet {
  feet: AnchorPoint;
  head: AnchorPoint;
  bubble: AnchorPoint;
}

export interface CharacterComponentProps {
  frame: number;
  fps: number;
  unit: number;
  emotion: Emotion;
  anim: AnimationType;
  speaking: boolean;
  facing: 'left' | 'right';
  color: string;
  accentColor: string;
  scale: number;
  accessory?: Accessory;
  seed?: number;
  voiceActive?: boolean;
}

export interface CharacterDefinition {
  id: string;
  name: string;
  emotions: readonly Emotion[];
  anims: readonly AnimationType[];
  defaultVoice?: string;
  Component: React.FC<CharacterComponentProps>;
  /**
   * Computes anchor offsets (relative to the character's (0, 0) center in pixel space)
   * given the current `unit` (`min(width, height)`) and `scale`.
   */
  anchors: (unit: number, scale?: number) => CharacterAnchorSet;
}

const CHARACTER_REGISTRY = new Map<string, CharacterDefinition>();

/**
 * Registers a plug-in character type in the BlobToon character registry.
 */
export function defineCharacter(def: CharacterDefinition): CharacterDefinition {
  const normalizedId = def.id.trim().toLowerCase();
  const normalizedDef: CharacterDefinition = {
    ...def,
    id: normalizedId,
  };
  CHARACTER_REGISTRY.set(normalizedId, normalizedDef);
  return normalizedDef;
}

export function getCharacterDefinition(id: string): CharacterDefinition | undefined {
  return CHARACTER_REGISTRY.get(id.trim().toLowerCase());
}

export function listCharacterDefinitions(): CharacterDefinition[] {
  return Array.from(CHARACTER_REGISTRY.values());
}

export function getRegisteredCharacterIds(): string[] {
  return Array.from(CHARACTER_REGISTRY.keys());
}

export function validateCharacterTypeId(typeId: string): {
  valid: boolean;
  knownIds: string[];
  definition?: CharacterDefinition;
} {
  const knownIds = getRegisteredCharacterIds();
  const definition = getCharacterDefinition(typeId);
  return {
    valid: Boolean(definition),
    knownIds,
    definition,
  };
}

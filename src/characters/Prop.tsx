import React from 'react';
import { AnimationType, PropType } from '../script/schema';
import { computeAnimationTransform } from './animations';

export interface PropProps {
  id: string;
  type: PropType | string;
  x: number;
  y: number;
  scale?: number;
  rotation?: number;
  animation?: AnimationType;
  label?: string;
  frame: number;
  fps: number;
  unit?: number;
}

export interface PropDefinition {
  id: string;
  name?: string;
  render: (frame: number) => React.ReactNode;
}

const PROP_REGISTRY = new Map<string, PropDefinition>();

/**
 * Registers a reusable SVG stage prop by id.
 */
export function defineProp(def: PropDefinition): PropDefinition {
  const normalizedId = def.id.trim().toLowerCase();
  const entry = { ...def, id: normalizedId };
  PROP_REGISTRY.set(normalizedId, entry);
  return entry;
}

export function getRegisteredProps(): PropDefinition[] {
  return Array.from(PROP_REGISTRY.values());
}

defineProp({
  id: 'phone',
  name: 'Smartphone',
  render: () => (
    <g>
      <rect
        x={-48}
        y={-82}
        width={96}
        height={164}
        rx={18}
        fill="#1e293b"
        stroke="#0f172a"
        strokeWidth={8}
      />
      <rect x={-38} y={-64} width={76} height={124} rx={8} fill="#38bdf8" />
      <circle cx={0} cy={70} r={6} fill="#94a3b8" />
      <rect x={-26} y={-44} width={52} height={24} rx={6} fill="#f43f5e" />
      <rect x={-26} y={-12} width={52} height={14} rx={4} fill="#ffffff" opacity={0.85} />
    </g>
  ),
});

defineProp({
  id: 'controller',
  name: 'Gamepad Controller',
  render: () => (
    <g>
      <path
        d="M -78 -24 C -96 -24, -108 32, -82 54 C -64 68, -42 36, -24 32 L 24 32 C 42 36, 64 68, 82 54 C 108 32, 96 -24, 78 -24 Z"
        fill="#f8fafc"
        stroke="#0f172a"
        strokeWidth={8}
        strokeLinejoin="round"
      />
      <path d="M -56 -2 L -36 -2 M -46 -12 L -46 8" stroke="#0f172a" strokeWidth={8} strokeLinecap="round" />
      <circle cx={48} cy={-6} r={8} fill="#ef4444" />
      <circle cx={34} cy={6} r={8} fill="#3b82f6" />
      <circle cx={62} cy={6} r={8} fill="#22c55e" />
      <circle cx={48} cy={18} r={8} fill="#eab308" />
    </g>
  ),
});

defineProp({
  id: 'trophy',
  name: 'Golden Trophy',
  render: () => (
    <g>
      <path
        d="M -46 -64 L 46 -64 L 36 4 C 32 34, -32 34, -36 4 Z"
        fill="#facc15"
        stroke="#0f172a"
        strokeWidth={8}
        strokeLinejoin="round"
      />
      <path
        d="M -44 -48 C -72 -48, -72 -6, -38 0"
        fill="none"
        stroke="#eab308"
        strokeWidth={10}
        strokeLinecap="round"
      />
      <path
        d="M 44 -48 C 72 -48, 72 -6, 38 0"
        fill="none"
        stroke="#eab308"
        strokeWidth={10}
        strokeLinecap="round"
      />
      <rect x={-14} y={26} width={28} height={28} fill="#eab308" stroke="#0f172a" strokeWidth={7} />
      <rect x={-42} y={52} width={84} height={22} rx={6} fill="#475569" stroke="#0f172a" strokeWidth={7} />
    </g>
  ),
});

defineProp({
  id: 'clock',
  name: 'Timer Clock',
  render: (frame: number) => {
    const handAngle = (frame * 8) % 360;
    return (
      <g>
        <circle cx={0} cy={0} r={64} fill="#fef08a" stroke="#0f172a" strokeWidth={9} />
        <circle cx={0} cy={0} r={52} fill="#ffffff" />
        <line
          x1={0}
          y1={0}
          x2={0}
          y2={-34}
          stroke="#ef4444"
          strokeWidth={7}
          strokeLinecap="round"
          transform={`rotate(${handAngle})`}
        />
        <line x1={0} y1={0} x2={24} y2={0} stroke="#0f172a" strokeWidth={8} strokeLinecap="round" />
        <circle cx={0} cy={0} r={7} fill="#0f172a" />
      </g>
    );
  },
});

defineProp({
  id: 'homework',
  name: 'Homework Sheet',
  render: () => (
    <g>
      <rect
        x={-54}
        y={-68}
        width={108}
        height={136}
        rx={8}
        fill="#ffffff"
        stroke="#0f172a"
        strokeWidth={8}
      />
      <line x1={-34} y1={-36} x2={34} y2={-36} stroke="#94a3b8" strokeWidth={7} strokeLinecap="round" />
      <line x1={-34} y1={-12} x2={34} y2={-12} stroke="#94a3b8" strokeWidth={7} strokeLinecap="round" />
      <line x1={-34} y1={12} x2={18} y2={12} stroke="#94a3b8" strokeWidth={7} strokeLinecap="round" />
      <text
        x={18}
        y={48}
        textAnchor="middle"
        fill="#ef4444"
        fontSize={38}
        fontWeight="900"
        fontFamily="Plus Jakarta Sans, sans-serif"
      >
        F-
      </text>
    </g>
  ),
});

defineProp({
  id: 'door',
  name: 'Locked Door',
  render: () => (
    <g>
      <rect
        x={-52}
        y={-86}
        width={104}
        height={172}
        rx={10}
        fill="#b45309"
        stroke="#0f172a"
        strokeWidth={8}
      />
      <rect x={-34} y={-66} width={68} height={58} rx={4} fill="#92400e" />
      <rect x={-34} y={8} width={68} height={58} rx={4} fill="#92400e" />
      <circle cx={30} cy={2} r={9} fill="#facc15" stroke="#0f172a" strokeWidth={5} />
    </g>
  ),
});

defineProp({
  id: 'heart',
  name: 'Heart Counter',
  render: () => (
    <path
      d="M 0 52 C -12 42, -68 4, -68 -32 C -68 -58, -42 -72, -18 -56 C -6 -48, 0 -36, 0 -36 C 0 -36, 6 -48, 18 -56 C 42 -72, 68 -58, 68 -32 C 68 4, 12 42, 0 52 Z"
      fill="#f43f5e"
      stroke="#0f172a"
      strokeWidth={8}
      strokeLinejoin="round"
    />
  ),
});

defineProp({
  id: 'toothbrush',
  name: 'Toothbrush',
  render: () => (
    <g transform="rotate(-28)">
      <rect x={-76} y={-10} width={152} height={20} rx={10} fill="#38bdf8" stroke="#0f172a" strokeWidth={7} />
      <rect x={32} y={-32} width={38} height={22} rx={4} fill="#ffffff" stroke="#0f172a" strokeWidth={6} />
      <path d="M 34 -32 C 42 -46, 58 -46, 68 -32" fill="#fda4af" stroke="#0f172a" strokeWidth={5} />
    </g>
  ),
});

function renderPropGraphic(type: PropType | string, frame: number): React.ReactNode {
  const def = PROP_REGISTRY.get(type.toLowerCase()) ?? PROP_REGISTRY.get('phone')!;
  return def.render(frame);
}

export const Prop: React.FC<PropProps> = ({
  id,
  type,
  x,
  y,
  scale = 1,
  rotation = 0,
  animation = 'idle',
  label,
  frame,
  fps,
  unit = 1080,
}) => {
  const tf = computeAnimationTransform(frame, fps, animation, 7);
  const unitScale = unit / 1080;

  return (
    <g
      id={`prop-${id}`}
      transform={`translate(${x + tf.translateX * 0.5 * unitScale}, ${
        y + tf.translateY * 0.5 * unitScale
      }) scale(${scale * tf.scaleX * unitScale}, ${scale * tf.scaleY * unitScale}) rotate(${
        rotation + tf.rotation * 0.5
      })`}
    >
      {renderPropGraphic(type, frame)}
      {label ? (
        <g transform="translate(0, 96)">
          <rect
            x={-98}
            y={-22}
            width={196}
            height={42}
            rx={12}
            fill="#0f172a"
            stroke="#38bdf8"
            strokeWidth={4}
          />
          <text
            x={0}
            y={6}
            textAnchor="middle"
            fill="#f8fafc"
            fontSize={20}
            fontWeight="800"
            fontFamily="Plus Jakarta Sans, sans-serif"
          >
            {label.slice(0, 18)}
          </text>
        </g>
      ) : null}
    </g>
  );
};

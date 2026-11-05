import React from 'react';
import { AnimationType, PropType } from '../script/schema';
import { computeAnimationTransform } from './animations';

export interface PropProps {
  type: PropType;
  x: number;
  y: number;
  scale?: number;
  rotation?: number;
  animation?: AnimationType;
  label?: string;
  frame: number;
  fps: number;
}

export const Prop: React.FC<PropProps> = ({
  type,
  x,
  y,
  scale = 1.0,
  rotation = 0,
  animation = 'bounce',
  label,
  frame,
  fps,
}) => {
  const tf = computeAnimationTransform(frame, fps, animation, 7);

  const renderPropGraphic = () => {
    switch (type) {
      case 'controller':
        return (
          <g>
            {/* Original Cartoon Gamepad */}
            <path
              d="M -85 -25 C -95 -60, 95 -60, 85 -25 L 105 45 C 110 75, 65 85, 45 50 L -45 50 C -65 85, -110 75, -105 45 Z"
              fill="#f8fafc"
              stroke="#0f172a"
              strokeWidth={9}
              strokeLinejoin="round"
            />
            {/* D-Pad */}
            <path
              d="M -58 -15 L -42 -15 L -42 -31 L -26 -31 L -26 -15 L -10 -15 L -10 1 L -26 1 L -26 17 L -42 17 L -42 1 L -58 1 Z"
              fill="#334155"
            />
            {/* Action Buttons */}
            <circle cx={48} cy={-20} r={10} fill="#ef4444" stroke="#0f172a" strokeWidth={4} />
            <circle cx={68} cy={-2} r={10} fill="#38bdf8" stroke="#0f172a" strokeWidth={4} />
            <circle cx={28} cy={-2} r={10} fill="#facc15" stroke="#0f172a" strokeWidth={4} />
            <circle cx={48} cy={16} r={10} fill="#4ade80" stroke="#0f172a" strokeWidth={4} />
          </g>
        );

      case 'phone':
        return (
          <g>
            <rect
              x={-48}
              y={-82}
              width={96}
              height={164}
              rx={20}
              fill="#1e293b"
              stroke="#0f172a"
              strokeWidth={9}
            />
            <rect x={-36} y={-62} width={72} height={120} rx={10} fill="#38bdf8" />
            {/* Notification alert bar */}
            <rect x={-28} y={-40} width={56} height={26} rx={6} fill="#f43f5e" />
            <circle cx={0} cy={70} r={6} fill="#94a3b8" />
          </g>
        );

      case 'clock': {
        const angle = (frame * 8) % 360;
        return (
          <g>
            {/* Alarm bells */}
            <path d="M -58 -64 L -32 -84" stroke="#f59e0b" strokeWidth={14} strokeLinecap="round" />
            <path d="M 58 -64 L 32 -84" stroke="#f59e0b" strokeWidth={14} strokeLinecap="round" />
            <circle cx={0} cy={0} r={68} fill="#ef4444" stroke="#0f172a" strokeWidth={9} />
            <circle cx={0} cy={0} r={52} fill="#fefce8" stroke="#0f172a" strokeWidth={6} />
            <line
              x1={0}
              y1={0}
              x2={0}
              y2={-34}
              stroke="#0f172a"
              strokeWidth={7}
              strokeLinecap="round"
            />
            <line
              x1={0}
              y1={0}
              x2={Math.cos((angle * Math.PI) / 180) * 26}
              y2={Math.sin((angle * Math.PI) / 180) * 26}
              stroke="#ef4444"
              strokeWidth={6}
              strokeLinecap="round"
            />
            <circle cx={0} cy={0} r={7} fill="#0f172a" />
          </g>
        );
      }

      case 'homework':
        return (
          <g>
            <rect
              x={-56}
              y={-72}
              width={112}
              height={144}
              rx={10}
              fill="#ffffff"
              stroke="#0f172a"
              strokeWidth={8}
            />
            <line x1={-36} y1={-36} x2={20} y2={-36} stroke="#94a3b8" strokeWidth={7} strokeLinecap="round" />
            <line x1={-36} y1={-10} x2={36} y2={-10} stroke="#94a3b8" strokeWidth={7} strokeLinecap="round" />
            <line x1={-36} y1={16} x2={30} y2={16} stroke="#94a3b8" strokeWidth={7} strokeLinecap="round" />
            <line x1={-36} y1={42} x2={12} y2={42} stroke="#94a3b8" strokeWidth={7} strokeLinecap="round" />
            <text
              x={22}
              y={-22}
              fill="#ef4444"
              fontSize={38}
              fontWeight="800"
              fontFamily="Bricolage Grotesque, sans-serif"
            >
              F-
            </text>
          </g>
        );

      case 'toothbrush':
        return (
          <g>
            <rect
              x={-84}
              y={-12}
              width={168}
              height={24}
              rx={12}
              fill="#22d3ee"
              stroke="#0f172a"
              strokeWidth={8}
            />
            <rect
              x={30}
              y={-42}
              width={48}
              height={30}
              rx={6}
              fill="#ffffff"
              stroke="#0f172a"
              strokeWidth={7}
            />
            <path
              d="M 36 -42 C 44 -62, 66 -62, 74 -42"
              fill="#38bdf8"
              stroke="#0f172a"
              strokeWidth={6}
            />
          </g>
        );

      case 'door':
        return (
          <g>
            <rect
              x={-58}
              y={-92}
              width={116}
              height={184}
              rx={8}
              fill="#b45309"
              stroke="#0f172a"
              strokeWidth={9}
            />
            <rect
              x={-38}
              y={-68}
              width={76}
              height={56}
              rx={4}
              fill="#92400e"
              stroke="#0f172a"
              strokeWidth={5}
            />
            <circle cx={34} cy={8} r={10} fill="#facc15" stroke="#0f172a" strokeWidth={5} />
          </g>
        );

      case 'heart':
        return (
          <g>
            <path
              d="M 0 58 C -20 42, -74 6, -74 -32 C -74 -62, -46 -78, -22 -64 C -8 -56, 0 -42, 0 -42 C 0 -42, 8 -56, 22 -64 C 46 -78, 74 -62, 74 -32 C 74 6, 20 42, 0 58 Z"
              fill="#f43f5e"
              stroke="#0f172a"
              strokeWidth={9}
              strokeLinejoin="round"
            />
            <circle cx={-32} cy={-38} r={10} fill="rgba(255,255,255,0.55)" />
          </g>
        );

      case 'trophy':
        return (
          <g>
            <path
              d="M -46 -58 L 46 -58 L 34 12 C 26 42, -26 42, -34 12 Z"
              fill="#facc15"
              stroke="#0f172a"
              strokeWidth={8}
              strokeLinejoin="round"
            />
            <rect x={-16} y={32} width={32} height={28} fill="#eab308" stroke="#0f172a" strokeWidth={7} />
            <rect x={-38} y={56} width={76} height={20} rx={6} fill="#78350f" stroke="#0f172a" strokeWidth={7} />
          </g>
        );
    }
  };

  return (
    <g
      transform={`translate(${x + tf.translateX * 0.6}, ${y + tf.translateY * 0.6}) scale(${scale * tf.scaleX}, ${scale * tf.scaleY}) rotate(${rotation + tf.rotation * 0.5})`}
    >
      {renderPropGraphic()}
      {label && (
        <g transform="translate(0, 108)">
          <rect
            x={-110}
            y={-22}
            width={220}
            height={40}
            rx={12}
            fill="#0f172a"
            stroke="#facc15"
            strokeWidth={4}
          />
          <text
            x={0}
            y={5}
            textAnchor="middle"
            fill="#facc15"
            fontSize={22}
            fontWeight="800"
            fontFamily="Bricolage Grotesque, sans-serif"
          >
            {label}
          </text>
        </g>
      )}
    </g>
  );
};

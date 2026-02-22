"use client";

import { useEffect, useState } from "react";

interface CelebrationConfettiProps {
  /** Show confetti animation */
  show: boolean;
  /** Duration in ms before auto-hide */
  duration?: number;
}

const COLORS = ["#0066FF", "#10B981", "#F59E0B", "#8B5CF6", "#EF4444", "#06B6D4"];

/**
 * Lightweight CSS confetti celebration.
 * Shows when LP investment status changes to FUNDED.
 * Auto-hides after duration (default 4s). No external dependencies.
 */
export function CelebrationConfetti({ show, duration = 4000 }: CelebrationConfettiProps) {
  const [visible, setVisible] = useState(false);
  const [pieces, setPieces] = useState<Array<{
    id: number;
    left: number;
    color: string;
    delay: number;
    size: number;
    rotation: number;
  }>>([]);

  useEffect(() => {
    if (show) {
      setVisible(true);
      const newPieces = Array.from({ length: 40 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        delay: Math.random() * 0.6,
        size: 4 + Math.random() * 6,
        rotation: Math.random() * 360,
      }));
      setPieces(newPieces);

      const timer = setTimeout(() => setVisible(false), duration);
      return () => clearTimeout(timer);
    }
  }, [show, duration]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 pointer-events-none z-50 overflow-hidden"
      aria-hidden="true"
    >
      {pieces.map((piece) => (
        <div
          key={piece.id}
          className="absolute animate-confetti-fall"
          style={{
            left: `${piece.left}%`,
            top: "-10px",
            width: `${piece.size}px`,
            height: `${piece.size * 1.5}px`,
            backgroundColor: piece.color,
            borderRadius: piece.size > 7 ? "50%" : "1px",
            transform: `rotate(${piece.rotation}deg)`,
            animationDelay: `${piece.delay}s`,
            animationDuration: `${2 + Math.random() * 2}s`,
          }}
        />
      ))}
      <style jsx>{`
        @keyframes confetti-fall {
          0% {
            transform: translateY(0) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) rotate(720deg);
            opacity: 0;
          }
        }
        .animate-confetti-fall {
          animation-name: confetti-fall;
          animation-timing-function: cubic-bezier(0.25, 0.46, 0.45, 0.94);
          animation-fill-mode: forwards;
        }
      `}</style>
    </div>
  );
}

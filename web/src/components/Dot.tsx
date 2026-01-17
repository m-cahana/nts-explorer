import { memo, useState } from 'react';

interface Props {
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  isActive: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onClick: () => void;
}

export const Dot = memo(function Dot({
  x,
  y,
  isActive,
  onMouseEnter,
  onMouseLeave,
  onClick
}: Props) {
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseEnter = () => {
    setIsHovered(true);
    onMouseEnter();
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    onMouseLeave();
  };

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      style={{
        position: 'absolute',
        left: `${x}%`,
        top: `${y}%`,
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        backgroundColor: isActive ? '#ff0000' : '#000000',
        cursor: 'pointer',
        transform: `translate(-50%, -50%) scale(${isHovered || isActive ? 5 : 1})`,
        transition: 'background-color 0.15s ease, transform 0.1s ease',
        zIndex: isHovered || isActive ? 10 : 1,
      }}
    />
  );
});

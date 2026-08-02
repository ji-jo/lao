import React from 'react';
import './AuroraBackground.css';

interface AuroraBackgroundProps {
  className?: string;
}

const AuroraBackground: React.FC<AuroraBackgroundProps> = ({ className = '' }) => {
  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}>
      {/* A dark overlay gradient to blend the aurora into the background */}
      <div className="absolute inset-0 bg-ink-900 z-0"></div>
      
      <div className="aurora-container absolute inset-0 z-10 opacity-60 mix-blend-screen">
        <div className="aurora-blob aurora-blob-1"></div>
        <div className="aurora-blob aurora-blob-2"></div>
        <div className="aurora-blob aurora-blob-3"></div>
        <div className="aurora-blob aurora-blob-4"></div>
      </div>
      
      {/* Noise overlay for texture */}
      <div className="absolute inset-0 z-20 opacity-[0.03] pointer-events-none mix-blend-overlay" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }}></div>
      
      {/* Top and bottom vignettes to fade into the surrounding content */}
      <div className="absolute top-0 left-0 right-0 h-[190px] bg-gradient-to-b from-ink-900 to-transparent z-30"></div>
      <div className="absolute bottom-0 left-0 right-0 h-[260px] bg-gradient-to-t from-ink-900 to-transparent z-30"></div>
    </div>
  );
};

export default AuroraBackground;

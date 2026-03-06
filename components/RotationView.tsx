import React from 'react';
import { Player, Team } from '../types';
import { Court } from './Court';

interface RotationViewProps {
  teamA: Team;
  teamB: Team;
  rotationA: (Player | null)[];
  rotationB: (Player | null)[];
  isVertical: boolean;
}

export const RotationView: React.FC<RotationViewProps> = ({ teamA, teamB, rotationA, rotationB, isVertical }) => {
  return (
    <div className={`absolute inset-0 z-40 flex items-center justify-center p-4 animate-in fade-in duration-300 pointer-events-none 
        ${isVertical ? 'rotate-90 origin-center' : ''}
    `}>
        <div className={`flex gap-4 pointer-events-auto items-center justify-center
            ${isVertical 
                ? 'flex-row w-[85vh] h-[90vw] scale-90' // Rotated: Width becomes Height (85% screen height), Height becomes Width (90% screen width)
                : 'flex-col md:flex-row w-full max-w-5xl scale-75 md:scale-90'
            }
        `}>
            {/* Team A Court */}
            <div className={`flex-1 ${isVertical ? 'h-full' : 'w-full'}`}>
                <Court 
                    players={rotationA} 
                    serving={false} 
                    teamName={teamA.name} 
                    variant="default"
                    isVertical={false} // Always horizontal inside the view (rotated or not)
                />
            </div>

            {/* Team B Court */}
            <div className={`flex-1 ${isVertical ? 'h-full' : 'w-full'}`}>
                <Court 
                    players={rotationB} 
                    serving={false} 
                    teamName={teamB.name} 
                    variant="default"
                    isVertical={false} // Always horizontal inside the view
                />
            </div>
        </div>
    </div>
  );
};

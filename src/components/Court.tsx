import React from 'react';
import { Player } from '../types';
import { POSITIONS_LAYOUT } from '../constants';

interface CourtProps {
  players: Player[]; 
  serving: boolean; 
  teamName: string;
  rotationError?: boolean;
  variant?: 'default' | 'referee'; 
}

export const Court: React.FC<CourtProps> = ({ players = [], serving, teamName, rotationError, variant = 'default' }) => {
  const safePlayers = Array.isArray(players) ? players : [];
  const isReferee = variant === 'referee';

  return (
    <div className={`relative overflow-hidden rounded shadow-2xl transition-all ${rotationError ? 'ring-4 ring-red-500' : 'ring-1 ring-white/10'} ${isReferee ? 'bg-court-out p-1' : 'bg-court-out p-4'}`}>
      <div className={`flex justify-between items-center px-2 ${isReferee ? 'mb-1' : 'mb-3'}`}>
        <span className={`font-black text-white uppercase italic tracking-wider drop-shadow-md truncate max-w-[70%] ${isReferee ? 'text-xl' : 'text-lg'}`}>{teamName || 'Equipo'}</span>
        {serving && (
            <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-yellow-400 animate-ping"></span>
                <span className={`bg-yellow-400 text-black rounded font-black uppercase tracking-widest shadow-lg ${isReferee ? 'text-xs px-3 py-1' : 'text-[10px] px-2 py-0.5'}`}>Saque</span>
            </div>
        )}
      </div>
      <div className={`bg-court-main border-4 border-white relative shadow-[inset_0_0_20px_rgba(0,0,0,0.2)] ${isReferee ? 'h-[400px]' : 'h-64 sm:h-80'}`}>
        <div className="absolute top-1/3 left-0 right-0 h-2 bg-white/80"></div>
        <div className="absolute bottom-0 left-0 right-0 h-0 border-b-4 border-dashed border-white/50 w-full"></div>
        <div className="grid grid-cols-3 grid-rows-2 h-full">
            {POSITIONS_LAYOUT.map((layout) => {
               const playerByIndex = safePlayers[layout.pos - 1]; 
               return (
                <div key={layout.pos} className={`${layout.grid} flex flex-col items-center justify-center relative group border border-white/5`}>
                  <span className={`absolute top-1 right-1 font-black text-black/20 ${isReferee ? 'text-4xl' : 'text-[9px]'}`}>{layout.pos}</span>
                  {playerByIndex ? (
                    <div className="flex flex-col items-center z-10 transform transition group-hover:scale-105 w-full px-1">
                      <div className={`rounded-full flex items-center justify-center font-black shadow-[0_4px_6px_rgba(0,0,0,0.3)] border-2 border-white ${playerByIndex.name === 'Libero' ? 'bg-yellow-400 text-black' : 'bg-vnl-panel text-white'} ${isReferee ? 'w-20 h-20 text-3xl mb-2' : 'w-10 h-10 sm:w-12 sm:h-12 text-lg'}`}>
                        {playerByIndex.number}
                      </div>
                      <div className={`px-2 py-0.5 bg-black/60 backdrop-blur-sm rounded text-white font-bold uppercase tracking-wide truncate max-w-full text-center ${isReferee ? 'text-sm w-full' : 'text-[10px] max-w-[80px]'}`}>
                        {playerByIndex.name.split(' ')[0]}
                      </div>
                    </div>
                  ) : (
                    <span className="text-black/30 font-bold text-xs uppercase">Vacío</span>
                  )}
                </div>
               );
            })}
        </div>
      </div>
    </div>
  );
};
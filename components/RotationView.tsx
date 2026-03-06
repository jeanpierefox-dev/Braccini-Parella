import React from 'react';
import { Player, Team } from '../types';

interface RotationViewProps {
  teamA: Team;
  teamB: Team;
  rotationA: (Player | null)[];
  rotationB: (Player | null)[];
  isVertical: boolean;
}

export const RotationView: React.FC<RotationViewProps> = ({ teamA, teamB, rotationA, rotationB, isVertical }) => {
  return (
    <div className={`absolute inset-0 z-40 flex items-center justify-center p-4 animate-in fade-in duration-300 pointer-events-none ${isVertical ? 'rotate-90' : ''}`}>
        <div className={`w-full max-w-3xl flex flex-col gap-4 origin-center pointer-events-auto ${isVertical ? 'scale-75' : 'scale-75 md:scale-90'}`}>
            <div className="flex justify-between items-center text-white px-4">
                  <h2 className="text-xl font-black uppercase italic tracking-widest drop-shadow-md">Rotación</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full">
                {/* Team A Court */}
                <div className="relative bg-blue-600 border-4 border-blue-600 shadow-2xl overflow-hidden aspect-square rounded-xl">
                    {/* Orange Court Area */}
                    <div className="absolute inset-2 bg-orange-500 border-2 border-white">
                        {/* Court Lines */}
                        <div className="absolute top-1/3 left-0 right-0 h-1 bg-white/80"></div> {/* Attack Line */}
                        <div className="absolute inset-0 flex items-center justify-center opacity-20 pointer-events-none">
                            {teamA.logoUrl ? <img src={teamA.logoUrl} className="w-48 h-48 object-contain grayscale" /> : <div className="text-9xl font-black text-white">{teamA.name[0]}</div>}
                        </div>
                        
                        {/* Team Name Label */}
                        <div className="absolute top-0 left-0 bg-blue-700 text-white px-3 py-1 rounded-br-lg font-bold uppercase text-sm shadow-lg z-10">
                            {teamA.name}
                        </div>

                        {/* Players Grid */}
                        <div className="absolute inset-0 grid grid-rows-2 grid-cols-3 p-4 gap-4">
                            {/* Front Row: 4, 3, 2 */}
                            {[4, 3, 2].map((pos) => {
                                const player = rotationA[pos - 1];
                                return (
                                    <div key={pos} className="flex flex-col items-center justify-center">
                                        <div className="w-14 h-14 bg-red-600 rounded-full border-2 border-white shadow-lg flex items-center justify-center relative group">
                                            <span className="text-2xl font-black text-white">{player ? player.number : '-'}</span>
                                            <div className="absolute -bottom-3 bg-[#3f2e18] text-white text-[9px] px-2 py-0.5 rounded-md uppercase font-bold whitespace-nowrap border border-white/20 shadow-md">
                                                {player ? player.name.split(' ')[0] : 'VACÍO'}
                                            </div>
                                            <div className="absolute top-0 right-0 w-4 h-4 bg-yellow-400 text-black text-[8px] font-bold rounded-full flex items-center justify-center border border-white">
                                                {pos}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                            
                            {/* Back Row: 5, 6, 1 */}
                            {[5, 6, 1].map((pos) => {
                                const player = rotationA[pos - 1];
                                return (
                                    <div key={pos} className="flex flex-col items-center justify-center">
                                        <div className="w-14 h-14 bg-red-600 rounded-full border-2 border-white shadow-lg flex items-center justify-center relative">
                                            <span className="text-2xl font-black text-white">{player ? player.number : '-'}</span>
                                            <div className="absolute -bottom-3 bg-[#3f2e18] text-white text-[9px] px-2 py-0.5 rounded-md uppercase font-bold whitespace-nowrap border border-white/20 shadow-md">
                                                {player ? player.name.split(' ')[0] : 'VACÍO'}
                                            </div>
                                            <div className="absolute top-0 right-0 w-4 h-4 bg-slate-200 text-black text-[8px] font-bold rounded-full flex items-center justify-center border border-white">
                                                {pos}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Team B Court */}
                <div className="relative bg-blue-600 border-4 border-blue-600 shadow-2xl overflow-hidden aspect-square rounded-xl">
                    {/* Orange Court Area */}
                    <div className="absolute inset-2 bg-orange-500 border-2 border-white">
                        {/* Court Lines */}
                        <div className="absolute top-1/3 left-0 right-0 h-1 bg-white/80"></div> {/* Attack Line */}
                        <div className="absolute inset-0 flex items-center justify-center opacity-20 pointer-events-none">
                            {teamB.logoUrl ? <img src={teamB.logoUrl} className="w-48 h-48 object-contain grayscale" /> : <div className="text-9xl font-black text-white">{teamB.name[0]}</div>}
                        </div>

                        {/* Team Name Label */}
                        <div className="absolute top-0 left-0 bg-red-700 text-white px-3 py-1 rounded-br-lg font-bold uppercase text-sm shadow-lg z-10">
                            {teamB.name}
                        </div>

                        {/* Players Grid */}
                        <div className="absolute inset-0 grid grid-rows-2 grid-cols-3 p-4 gap-4">
                            {/* Front Row: 4, 3, 2 */}
                            {[4, 3, 2].map((pos) => {
                                const player = rotationB[pos - 1];
                                return (
                                    <div key={pos} className="flex flex-col items-center justify-center">
                                        <div className="w-14 h-14 bg-red-600 rounded-full border-2 border-white shadow-lg flex items-center justify-center relative">
                                            <span className="text-2xl font-black text-white">{player ? player.number : '-'}</span>
                                            <div className="absolute -bottom-3 bg-[#3f2e18] text-white text-[9px] px-2 py-0.5 rounded-md uppercase font-bold whitespace-nowrap border border-white/20 shadow-md">
                                                {player ? player.name.split(' ')[0] : 'VACÍO'}
                                            </div>
                                            <div className="absolute top-0 right-0 w-4 h-4 bg-yellow-400 text-black text-[8px] font-bold rounded-full flex items-center justify-center border border-white">
                                                {pos}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                            
                            {/* Back Row: 5, 6, 1 */}
                            {[5, 6, 1].map((pos) => {
                                const player = rotationB[pos - 1];
                                return (
                                    <div key={pos} className="flex flex-col items-center justify-center">
                                        <div className="w-14 h-14 bg-red-600 rounded-full border-2 border-white shadow-lg flex items-center justify-center relative">
                                            <span className="text-2xl font-black text-white">{player ? player.number : '-'}</span>
                                            <div className="absolute -bottom-3 bg-[#3f2e18] text-white text-[9px] px-2 py-0.5 rounded-md uppercase font-bold whitespace-nowrap border border-white/20 shadow-md">
                                                {player ? player.name.split(' ')[0] : 'VACÍO'}
                                            </div>
                                            <div className="absolute top-0 right-0 w-4 h-4 bg-slate-200 text-black text-[8px] font-bold rounded-full flex items-center justify-center border border-white">
                                                {pos}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
  );
};

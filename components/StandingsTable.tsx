
import React from 'react';
import { Tournament } from '../types';

interface StandingsTableProps {
  tournament: Tournament;
}

interface TeamStats {
  teamId: string;
  played: number;
  won: number;
  lost: number;
  points: number;
  setsWon: number;
  setsLost: number;
  pointsWon: number;
  pointsLost: number;
}

export const StandingsTable: React.FC<StandingsTableProps> = ({ tournament }) => {
  const stats: Record<string, TeamStats> = {};

  // Initialize stats for all teams to ensure they appear in the table even with 0 games
  if (tournament.teams) {
      tournament.teams.forEach(t => {
        stats[t.id] = {
          teamId: t.id, played: 0, won: 0, lost: 0, points: 0,
          setsWon: 0, setsLost: 0, pointsWon: 0, pointsLost: 0
        };
      });
  }

  // Calculate based on finished fixtures
  if (tournament.fixtures) {
      tournament.fixtures.forEach(fix => {
        if (fix.status === 'finished' && fix.resultString) {
          const parts = fix.resultString.split('-');
          if (parts.length === 2) {
              const scoreA = parseInt(parts[0]);
              const scoreB = parseInt(parts[1]);
              
              const statsA = stats[fix.teamAId];
              const statsB = stats[fix.teamBId];

              // Defensive check: Teams must exist in the stats map
              if (statsA && statsB) {
                statsA.played++;
                statsB.played++;
                statsA.setsWon += scoreA;
                statsA.setsLost += scoreB;
                statsB.setsWon += scoreB;
                statsB.setsLost += scoreA;

                const setDiff = Math.abs(scoreA - scoreB);

                if (scoreA > scoreB) {
                  statsA.won++;
                  statsB.lost++;
                  // Points logic: 3 pts for win by 2+ sets (3-0, 3-1), 2 pts for tie-break win (3-2)
                  if (setDiff >= 2) {
                    statsA.points += 3;
                    statsB.points += 0;
                  } else {
                    statsA.points += 2;
                    statsB.points += 1;
                  }
                } else {
                  statsB.won++;
                  statsA.lost++;
                  // Points logic
                  if (setDiff >= 2) {
                    statsB.points += 3;
                    statsA.points += 0;
                  } else {
                    statsB.points += 2;
                    statsA.points += 1;
                  }
                }
              }
          }
        }
      });
  }

  const sortedStats = Object.values(stats).sort((a, b) => {
    // 1. Points
    if (b.points !== a.points) return b.points - a.points;
    
    // 2. Set Ratio (Sets Won / Sets Lost)
    const ratioA = a.setsLost === 0 ? (a.setsWon > 0 ? 1000 : 0) : a.setsWon / a.setsLost;
    const ratioB = b.setsLost === 0 ? (b.setsWon > 0 ? 1000 : 0) : b.setsWon / b.setsLost;
    
    if (ratioB !== ratioA) return ratioB - ratioA;

    // 3. Games Won
    return b.won - a.won;
  });

  return (
    <div className="overflow-x-auto rounded-xl border border-white/10 shadow-xl bg-corp-panel">
      <table className="w-full text-sm text-left">
        <thead className="bg-black/40 text-slate-400 uppercase font-bold text-[10px] tracking-widest border-b border-white/10">
          <tr>
            <th className="px-4 py-3 text-center">#</th>
            <th className="px-4 py-3">Equipo</th>
            <th className="px-4 py-3 text-center text-white">PTS</th>
            <th className="px-4 py-3 text-center">PJ</th>
            <th className="px-4 py-3 text-center text-green-400">PG</th>
            <th className="px-4 py-3 text-center text-red-400">PP</th>
            <th className="px-4 py-3 text-center">Sets</th>
            <th className="px-4 py-3 text-center">Ratio</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {sortedStats.map((row, index) => {
            const team = tournament.teams?.find(t => t.id === row.teamId);
            if (!team) return null;
            const setRatio = row.setsLost === 0 ? (row.setsWon > 0 ? 'MAX' : '-') : (row.setsWon / row.setsLost).toFixed(2);

            return (
              <tr key={row.teamId} className="hover:bg-white/5 transition">
                <td className="px-4 py-3 text-center font-bold text-slate-500">{index + 1}</td>
                <td className="px-4 py-3 font-bold text-white flex items-center gap-3">
                  {team.logoUrl ? <img src={team.logoUrl} className="w-6 h-6 object-contain" /> : <div className="w-6 h-6 bg-white/10 rounded-full flex items-center justify-center text-[10px]">{team.name[0]}</div>}
                  {team.name}
                </td>
                <td className="px-4 py-3 text-center font-black text-corp-accent text-lg">{row.points}</td>
                <td className="px-4 py-3 text-center font-mono">{row.played}</td>
                <td className="px-4 py-3 text-center font-mono text-green-500">{row.won}</td>
                <td className="px-4 py-3 text-center font-mono text-red-500">{row.lost}</td>
                <td className="px-4 py-3 text-center font-mono text-xs">{row.setsWon}-{row.setsLost}</td>
                <td className="px-4 py-3 text-center font-mono text-xs text-slate-400">{setRatio}</td>
              </tr>
            );
          })}
          {sortedStats.length === 0 && (
             <tr>
                 <td colSpan={8} className="text-center py-6 text-slate-500 text-xs font-bold uppercase">No hay equipos registrados</td>
             </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

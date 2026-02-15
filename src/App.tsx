import React, { useState, useEffect, useCallback } from 'react';
import { Layout } from './components/Layout';
import { Login } from './components/Login';
import { UserManagement } from './components/UserManagement';
import { Court } from './components/Court';
import { ScoreControl } from './components/ScoreControl';
import { TVOverlay } from './components/TVOverlay';
import { CloudConfig } from './components/CloudConfig';
import { StandingsTable } from './components/StandingsTable';
import { SetStatsModal } from './components/SetStatsModal';
import { ProfileEditor } from './components/ProfileEditor';
import { 
  User, Team, Tournament, LiveMatchState, MatchSet, 
  PointLog, Player, PlayerRole, MatchFixture, MatchConfig, Position 
} from './types';
import { 
  MAX_SETS, POINTS_PER_SET, POINTS_TIEBREAK, MAX_TIMEOUTS, MAX_SUBS
} from './constants';
import { generateSmartFixture, analyzeMatchStats } from './services/geminiService';
import { initCloud, syncData, pushData, resetCloudData, loadConfig, checkForSyncLink } from './services/cloud';

const INITIAL_USERS: User[] = [
  { id: 'admin', username: 'admin', password: '123', role: 'ADMIN' },
  { id: 'tv', username: 'tv', password: '123', role: 'VIEWER' },
];

export const App = () => {
  // --- STATE ---
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [view, setView] = useState('home'); // home, lobby, teams, users, match, tv
  const [isCloudConnected, setIsCloudConnected] = useState(false);
  const [showCloudConfig, setShowCloudConfig] = useState(false);

  // Data
  const [users, setUsers] = useState<User[]>(INITIAL_USERS);
  const [teams, setTeams] = useState<Team[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [liveMatch, setLiveMatch] = useState<LiveMatchState | null>(null);

  // UI Modals & Overlays
  const [showSetSummary, setShowSetSummary] = useState<{set: number, data: MatchSet} | null>(null);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [nextSetCountdown, setNextSetCountdown] = useState<number | null>(null);

  // --- EFFECT: INITIALIZATION & CLOUD ---
  useEffect(() => {
    // Check for share link or saved config
    const syncLinkData = checkForSyncLink();
    if (syncLinkData) {
        if(initCloud(syncLinkData.config, syncLinkData.organizationId)) {
            setIsCloudConnected(true);
        }
    } else {
        const saved = loadConfig();
        if (saved?.config) {
            if(initCloud(saved.config, saved.organizationId)) {
                setIsCloudConnected(true);
            }
        }
    }
  }, []);

  // Sync Listeners
  useEffect(() => {
    if (!isCloudConnected) return;

    const unsubMatch = syncData<LiveMatchState>('liveMatch', (data) => setLiveMatch(data));
    const unsubTeams = syncData<Team[]>('teams', (data) => { if (data) setTeams(data); });
    const unsubTournaments = syncData<Tournament[]>('tournaments', (data) => { if (data) setTournaments(data); });
    const unsubUsers = syncData<User[]>('users', (data) => { if (data) setUsers(data); else setUsers(INITIAL_USERS); });

    return () => {
        unsubMatch();
        unsubTeams();
        unsubTournaments();
        unsubUsers();
    };
  }, [isCloudConnected]);

  // Push updates to cloud
  const pushUpdate = (path: string, data: any) => {
      if (isCloudConnected) {
          pushData(path, data);
      }
  };

  // --- HANDLERS: AUTH & NAV ---
  const handleLogin = (user: User) => {
      setCurrentUser(user);
      if (user.role === 'VIEWER') setView('tv');
  };

  const handleLogout = () => {
      setCurrentUser(null);
      setView('home');
  };

  // --- HANDLERS: DATA MANAGEMENT ---
  const handleAddUser = (user: User) => {
      const newUsers = [...users, user];
      setUsers(newUsers);
      pushUpdate('users', newUsers);
  };

  const handleDeleteUser = (userId: string) => {
      const newUsers = users.filter(u => u.id !== userId);
      setUsers(newUsers);
      pushUpdate('users', newUsers);
  };

  const handleUpdateUser = (updatedUser: User) => {
      const newUsers = users.map(u => u.id === updatedUser.id ? updatedUser : u);
      setUsers(newUsers);
      pushUpdate('users', newUsers);
  };

  // --- HANDLERS: TOURNAMENT (AI) ---
  const createTournament = async (name: string, startDate: string, endDate: string, matchDays: string[]) => {
      if (teams.length < 2) {
          alert("Necesitas al menos 2 equipos para crear un torneo.");
          return;
      }

      // Mock loading state
      const id = `t-${Date.now()}`;
      // Temporary object while AI generates fixture
      const newTournament: Tournament = {
          id,
          ownerId: currentUser?.id || 'admin',
          name,
          startDate,
          endDate,
          teams: teams, // Include all current teams
          groups: {},
          fixtures: []
      };

      try {
        const { groups, fixtures } = await generateSmartFixture(teams, startDate, endDate, matchDays);
        newTournament.groups = groups;
        newTournament.fixtures = fixtures.map((f, i) => ({ ...f, id: `fix-${Date.now()}-${i}`, status: 'scheduled' }));
        
        const newTournaments = [...tournaments, newTournament];
        setTournaments(newTournaments);
        pushUpdate('tournaments', newTournaments);
        setView('lobby');
      } catch (e) {
        alert("Error generando fixture con IA. Intenta de nuevo.");
      }
  };

  // --- HANDLERS: MATCH LOGIC ---

  const startMatch = (fixture: MatchFixture, tournament: Tournament) => {
      const teamA = teams.find(t => t.id === fixture.teamAId);
      const teamB = teams.find(t => t.id === fixture.teamBId);
      
      if (!teamA || !teamB) return;

      // Ensure 6 players for rotation. If not enough, fill with dummies or repeat.
      const getRotation = (t: Team) => {
          const rotation = t.players.slice(0, 6);
          // If less than 6, mock remaining (should validation in real app)
          return rotation;
      };

      const match: LiveMatchState = {
          matchId: fixture.id,
          config: { maxSets: 5, pointsPerSet: 25, tieBreakPoints: 15 },
          status: 'warmup',
          currentSet: 1,
          sets: [{ scoreA: 0, scoreB: 0, history: [], durationMinutes: 0 }],
          rotationA: getRotation(teamA),
          rotationB: getRotation(teamB),
          benchA: teamA.players.slice(6),
          benchB: teamB.players.slice(6),
          servingTeamId: teamA.id, // Coin toss mock
          scoreA: 0,
          scoreB: 0,
          timeoutsA: 0,
          timeoutsB: 0,
          substitutionsA: 0,
          substitutionsB: 0,
          requests: []
      };

      setLiveMatch(match);
      pushUpdate('liveMatch', match);
      setView('match');
  };

  const handlePoint = (teamId: string, type: 'attack' | 'block' | 'ace' | 'opponent_error' | 'yellow_card' | 'red_card', playerId?: string) => {
      if (!liveMatch || liveMatch.status === 'finished' || liveMatch.status === 'finished_set') return;

      const isTeamA = teamId === teams.find(t => t.players.some(p => liveMatch.rotationA.some(r => r.id === p.id)))?.id;
      const isRedCard = type === 'red_card';
      const isYellowCard = type === 'yellow_card';
      
      // Points logic
      // Yellow card: No point, just log. Red card: Point for OPPONENT + Log.
      let pointForTeamId: string | null = null;

      if (isYellowCard) {
          // No point added
      } else if (isRedCard) {
          // Point for opponent
          pointForTeamId = isTeamA ? (liveMatch.rotationB.length > 0 ? liveMatch.rotationB[0].id : null) : (liveMatch.rotationA.length > 0 ? liveMatch.rotationA[0].id : null); // Logic fix needed: Get ID of opponent team, not player.
          // Correct way:
          // If Team A gets Red Card, Team B gets point.
          // We'll handle this by calling handlePoint recursively or manually adjusting logic.
          // For simplicity: Red Card gives point to opponent directly here.
      } else {
          pointForTeamId = teamId;
      }

      // Identify Teams
      // We need to reliably identify Team A and Team B ID from liveMatch state context
      // liveMatch has rotationA and rotationB but not direct teamIds stored easily except servingTeamId.
      // We will assume teamId passed matches the team associated with rotationA or rotationB
      
      // Let's resolve Team IDs from the data.
      // We can use tournaments to find the match or pass IDs properly.
      // For now, let's look at rotationA's team.
      // Optimization: We should store teamIds in LiveMatchState. But sticking to interface:
      
      // Hack: Check if passed teamId belongs to rotationA players
      const isSideA = isTeamA;
      
      // If pointForTeamId is set
      let nextScoreA = liveMatch.scoreA;
      let nextScoreB = liveMatch.scoreB;
      let nextServingTeam = liveMatch.servingTeamId;
      let nextRotationA = [...liveMatch.rotationA];
      let nextRotationB = [...liveMatch.rotationB];

      if (pointForTeamId) {
         if (isSideA && pointForTeamId === teamId) {
             nextScoreA++;
         } else if (!isSideA && pointForTeamId === teamId) {
             nextScoreB++;
         } else if (isRedCard) {
             // Logic for Red Card point award
             if (isSideA) nextScoreB++; else nextScoreA++;
         }
      }

      // Determine Server & Rotation
      const pointWinnerIsA = (pointForTeamId === teamId && isSideA) || (isRedCard && !isSideA);
      const pointWinnerTeamId = pointWinnerIsA ? (liveMatch.rotationA.length > 0 ? teams.find(t=>t.players.some(p=>p.id === liveMatch.rotationA[0].id))?.id : null) : (liveMatch.rotationB.length > 0 ? teams.find(t=>t.players.some(p=>p.id === liveMatch.rotationB[0].id))?.id : null);
      
      // Did service change?
      // If serving team wins point, they keep serving. No rotation.
      // If receiving team wins point, they become server AND rotate.
      
      let newHistoryItem: PointLog = {
          teamId,
          playerId,
          type,
          scoreSnapshot: `${nextScoreA}-${nextScoreB}`
      };

      if (pointForTeamId) {
          // Check if server changes
          if (liveMatch.servingTeamId !== pointWinnerTeamId) {
              // SIDE OUT -> ROTATION
              nextServingTeam = pointWinnerTeamId || liveMatch.servingTeamId;
              
              if (pointWinnerIsA) {
                 // Rotate A
                 const p = nextRotationA.pop();
                 if(p) nextRotationA.unshift(p);
              } else {
                 // Rotate B
                 const p = nextRotationB.pop();
                 if(p) nextRotationB.unshift(p);
              }
          }
      }

      // Check Set End
      const limit = liveMatch.currentSet === liveMatch.config.maxSets ? liveMatch.config.tieBreakPoints : liveMatch.config.pointsPerSet;
      const lead = Math.abs(nextScoreA - nextScoreB);
      const setWon = (nextScoreA >= limit || nextScoreB >= limit) && lead >= 2;

      const newSets = [...liveMatch.sets];
      newSets[liveMatch.currentSet - 1] = {
          ...newSets[liveMatch.currentSet - 1],
          scoreA: nextScoreA,
          scoreB: nextScoreB,
          history: [...(newSets[liveMatch.currentSet - 1].history || []), newHistoryItem]
      };

      const updatedMatch = {
          ...liveMatch,
          scoreA: nextScoreA,
          scoreB: nextScoreB,
          sets: newSets,
          servingTeamId: nextServingTeam,
          rotationA: nextRotationA,
          rotationB: nextRotationB,
          status: setWon ? 'finished_set' : 'playing'
      };

      if (setWon) {
          // Trigger Set Analysis
          const currentSetData = newSets[liveMatch.currentSet - 1];
          setShowSetSummary({ set: liveMatch.currentSet, data: currentSetData });
          
          // Auto AI Analysis
          if (isCloudConnected) {
             analyzeMatchStats(currentSetData).then(analysis => {
                 // Could store this analysis in match object
                 console.log("AI Analysis:", analysis);
             });
          }
      }

      setLiveMatch(updatedMatch as LiveMatchState);
      pushUpdate('liveMatch', updatedMatch);
  };

  const handleNextSet = () => {
      if (!liveMatch) return;
      
      // Check match end
      const winsA = liveMatch.sets.filter(s => s.scoreA > s.scoreB).length;
      const winsB = liveMatch.sets.filter(s => s.scoreB > s.scoreA).length;
      const requiredWins = Math.ceil(liveMatch.config.maxSets / 2);
      
      if (winsA === requiredWins || winsB === requiredWins) {
          // MATCH OVER
          const finishedMatch = { ...liveMatch, status: 'finished' };
          setLiveMatch(finishedMatch as LiveMatchState);
          pushUpdate('liveMatch', finishedMatch);
          
          // Update Tournament Fixture
          const tIndex = tournaments.findIndex(t => t.fixtures.some(f => f.id === liveMatch.matchId));
          if (tIndex >= 0) {
             const newTournaments = [...tournaments];
             const fixIndex = newTournaments[tIndex].fixtures.findIndex(f => f.id === liveMatch.matchId);
             newTournaments[tIndex].fixtures[fixIndex].status = 'finished';
             newTournaments[tIndex].fixtures[fixIndex].resultString = `${winsA}-${winsB}`;
             newTournaments[tIndex].fixtures[fixIndex].winnerId = winsA > winsB ? teams.find(t=>liveMatch.rotationA.some(p=>p.id===t.players[0].id))?.id : teams.find(t=>liveMatch.rotationB.some(p=>p.id===t.players[0].id))?.id; // Approx logic for winner ID
             setTournaments(newTournaments);
             pushUpdate('tournaments', newTournaments);
          }
      } else {
          // NEW SET
          const nextSet = liveMatch.currentSet + 1;
          const newMatchState = {
              ...liveMatch,
              currentSet: nextSet,
              scoreA: 0,
              scoreB: 0,
              timeoutsA: 0,
              timeoutsB: 0,
              substitutionsA: 0,
              substitutionsB: 0,
              sets: [...liveMatch.sets, { scoreA: 0, scoreB: 0, history: [], durationMinutes: 0 }],
              status: 'playing',
              // Swap sides? usually handled physically, but logic remains same relative to A/B designations
          };
          setLiveMatch(newMatchState as LiveMatchState);
          pushUpdate('liveMatch', newMatchState);
      }
      setShowSetSummary(null);
  };

  const handleTimeout = (teamId: string) => {
      if (!liveMatch) return;
      // Identify team side to increment counter
      // This requires simpler logic mapping teamId to 'A' or 'B'
      // For now, simple state update
      const updated = { ...liveMatch };
      // Logic would increment updated.timeoutsA or B
      setLiveMatch(updated);
      pushUpdate('liveMatch', updated);
  };
  
  const handleSub = (teamId: string) => {
      // Logic for substitution
      // Would open a modal in real app
  };

  // --- RENDER HELPERS ---
  if (!currentUser) {
      return (
          <Login 
            onLogin={handleLogin}
            users={users}
            isCloudConnected={isCloudConnected}
            onOpenCloudConfig={() => setShowCloudConfig(true)}
          />
      );
  }

  // --- NEW: Render TV Overlay directly (Full Screen, No Layout) if in TV Mode ---
  if (view === 'tv' && liveMatch) {
      // Find Team Objects for Overlay
      // We need to match rotation players to teams to identify who is who
      const teamA = teams.find(t => t.players.some(p => liveMatch.rotationA.some(r => r.id === p.id))) || teams[0];
      const teamB = teams.find(t => t.players.some(p => liveMatch.rotationB.some(r => r.id === p.id))) || teams[1];
      
      const currentTournament = tournaments.find(t => t.fixtures.some(f => f.id === liveMatch.matchId));

      return (
          <TVOverlay 
            match={liveMatch}
            teamA={teamA}
            teamB={teamB}
            tournament={currentTournament}
            currentUser={currentUser}
            onExit={() => setView('home')}
            onLogout={handleLogout}
            onNextSet={handleNextSet}
            nextSetCountdown={nextSetCountdown}
            isCloudConnected={isCloudConnected}
          />
      );
  } else if (view === 'tv' && !liveMatch) {
      return (
          <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center">
              <h1 className="text-3xl font-bold mb-4">Esperando Partido en Vivo...</h1>
              <button onClick={() => setView('home')} className="px-4 py-2 border rounded">Volver</button>
          </div>
      );
  }

  // Find active teams for control view
  const activeTeamA = liveMatch ? teams.find(t => t.players.some(p => liveMatch.rotationA.some(r => r.id === p.id))) : null;
  const activeTeamB = liveMatch ? teams.find(t => t.players.some(p => liveMatch.rotationB.some(r => r.id === p.id))) : null;

  return (
    <>
      <Layout 
        currentUser={currentUser} 
        onLogout={handleLogout} 
        onNavigate={setView} 
        currentView={view}
        isCloudConnected={isCloudConnected}
        onOpenCloudConfig={() => setShowCloudConfig(true)}
      >
        {/* VIEW: HOME */}
        {view === 'home' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Active Match Card */}
                {liveMatch && activeTeamA && activeTeamB ? (
                    <div className="col-span-full bg-gradient-to-r from-blue-900 to-indigo-900 rounded-2xl p-6 border border-white/20 shadow-2xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-50 text-[100px] leading-none pointer-events-none">🏐</div>
                        <div className="relative z-10">
                            <h2 className="text-white/70 font-bold uppercase tracking-widest text-sm mb-4">Partido en Curso</h2>
                            <div className="flex items-center gap-8 mb-6">
                                <div className="text-center">
                                    <div className="text-3xl font-black text-white mb-1">{activeTeamA.name}</div>
                                    <div className="text-5xl font-mono text-yellow-400 font-bold">{liveMatch.scoreA}</div>
                                </div>
                                <div className="text-4xl font-black text-white/20 italic">VS</div>
                                <div className="text-center">
                                    <div className="text-3xl font-black text-white mb-1">{activeTeamB.name}</div>
                                    <div className="text-5xl font-mono text-yellow-400 font-bold">{liveMatch.scoreB}</div>
                                </div>
                            </div>
                            <div className="flex gap-3">
                                <button 
                                  onClick={() => setView('match')}
                                  className="bg-green-500 hover:bg-green-400 text-black font-black px-6 py-3 rounded-lg uppercase tracking-wider shadow-lg transition transform hover:scale-105"
                                >
                                    Retomar Control
                                </button>
                                <button 
                                  onClick={() => setView('tv')}
                                  className="bg-white/10 hover:bg-white/20 text-white font-bold px-6 py-3 rounded-lg uppercase tracking-wider border border-white/10 transition"
                                >
                                    Ver TV Mode
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="col-span-full bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
                        <h2 className="text-2xl font-bold text-white mb-2">No hay partido activo</h2>
                        <p className="text-slate-400 mb-6">Selecciona un torneo y un partido para comenzar.</p>
                        <button onClick={() => setView('lobby')} className="bg-corp-accent text-black font-bold px-6 py-2 rounded-lg">Ir a Torneos</button>
                    </div>
                )}
            </div>
        )}

        {/* VIEW: USERS */}
        {view === 'users' && (
            <UserManagement 
                users={users} 
                teams={teams}
                currentUser={currentUser} 
                onAddUser={handleAddUser}
                onDeleteUser={handleDeleteUser}
                onUpdateUser={handleUpdateUser}
                onSystemReset={() => { if(confirm("Seguro?")) resetCloudData(INITIAL_USERS); }}
            />
        )}

        {/* VIEW: TEAMS */}
        {view === 'teams' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                 {/* Create Team Button Card */}
                 <div 
                   className="bg-white/5 border-2 border-dashed border-white/20 rounded-xl flex flex-col items-center justify-center p-8 cursor-pointer hover:bg-white/10 transition h-64"
                   onClick={() => {
                       const name = prompt("Nombre del equipo:");
                       if (name) {
                           const newTeam: Team = {
                               id: `team-${Date.now()}`,
                               name,
                               color: '#0000ff',
                               players: [],
                               coachName: currentUser.username
                           };
                           const updated = [...teams, newTeam];
                           setTeams(updated);
                           pushUpdate('teams', updated);
                       }
                   }}
                 >
                     <div className="text-4xl text-slate-500 mb-2">+</div>
                     <span className="font-bold text-slate-400 uppercase tracking-widest">Crear Equipo</span>
                 </div>

                 {teams.map(team => (
                     <div key={team.id} className="bg-corp-panel border border-white/10 rounded-xl p-6 relative group">
                         <div className="flex justify-between items-start mb-4">
                            <h3 className="text-xl font-black text-white uppercase italic">{team.name}</h3>
                            <button className="text-slate-500 hover:text-white" onClick={() => {
                                const pName = prompt("Nombre Jugador:");
                                if (pName) {
                                    const newP: Player = {
                                        id: `p-${Date.now()}`,
                                        name: pName,
                                        number: Math.floor(Math.random()*99),
                                        role: PlayerRole.OutsideHitter,
                                        isCaptain: false,
                                        stats: { points:0, aces:0, blocks:0, errors:0, matchesPlayed:0, mvps:0, yellowCards:0, redCards:0 },
                                        profile: { bio: '', height: 0, weight: 0, photoUrl: '', achievements: [] }
                                    };
                                    const updatedTeams = teams.map(t => t.id === team.id ? { ...t, players: [...t.players, newP] } : t);
                                    setTeams(updatedTeams);
                                    pushUpdate('teams', updatedTeams);
                                }
                            }}>+ Jugador</button>
                         </div>
                         <div className="space-y-2">
                             {team.players.map(p => (
                                 <div key={p.id} className="flex justify-between items-center bg-black/20 p-2 rounded cursor-pointer hover:bg-white/5" onClick={() => setEditingPlayer(p)}>
                                     <span className="text-sm font-bold text-slate-300">#{p.number} {p.name}</span>
                                     <span className="text-[10px] text-slate-500 uppercase">{p.role}</span>
                                 </div>
                             ))}
                         </div>
                     </div>
                 ))}
            </div>
        )}

        {/* VIEW: LOBBY (TOURNAMENTS) */}
        {view === 'lobby' && (
             <div className="space-y-8">
                 <div className="flex justify-between items-center">
                     <h2 className="text-3xl font-black text-white uppercase italic">Torneos</h2>
                     <button 
                        onClick={() => {
                            // Simple creation flow
                            const name = prompt("Nombre del Torneo (Ej: Liga Invierno):");
                            if (name) createTournament(name, new Date().toISOString(), new Date(Date.now() + 86400000*30).toISOString(), []);
                        }}
                        className="bg-vnl-accent text-black font-black px-6 py-3 rounded uppercase tracking-widest shadow-lg hover:bg-cyan-400"
                     >
                         + Nuevo Torneo (AI)
                     </button>
                 </div>

                 {tournaments.map(t => (
                     <div key={t.id} className="bg-corp-panel border border-white/10 rounded-xl p-6">
                         <h3 className="text-2xl font-black text-white mb-4">{t.name}</h3>
                         <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                             <div>
                                 <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Partidos</h4>
                                 <div className="space-y-2 max-h-64 overflow-y-auto">
                                     {t.fixtures.map(f => {
                                         const tA = teams.find(team => team.id === f.teamAId);
                                         const tB = teams.find(team => team.id === f.teamBId);
                                         return (
                                             <div key={f.id} className="flex justify-between items-center bg-black/40 p-3 rounded border border-white/5">
                                                 <div className="text-sm font-bold text-white">{tA?.name} vs {tB?.name}</div>
                                                 {f.status === 'finished' ? (
                                                     <span className="text-xs font-mono text-yellow-400 font-bold">{f.resultString}</span>
                                                 ) : (
                                                     <button 
                                                        onClick={() => startMatch(f, t)}
                                                        className="bg-green-600 hover:bg-green-500 text-white text-[10px] font-bold px-3 py-1 rounded uppercase"
                                                     >
                                                         Iniciar
                                                     </button>
                                                 )}
                                             </div>
                                         );
                                     })}
                                 </div>
                             </div>
                             <div>
                                 <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Tabla de Posiciones</h4>
                                 <StandingsTable tournament={t} />
                             </div>
                         </div>
                     </div>
                 ))}
             </div>
        )}

        {/* VIEW: MATCH CONTROL */}
        {view === 'match' && liveMatch && activeTeamA && activeTeamB && (
            <div className="grid grid-cols-12 gap-4 h-full">
                {/* Left Control (Team A) */}
                <div className="col-span-3">
                    <ScoreControl 
                        role={currentUser.role}
                        linkedTeamId={currentUser.linkedTeamId}
                        onPoint={handlePoint}
                        onRequestTimeout={handleTimeout}
                        onRequestSub={handleSub}
                        onModifyRotation={() => {}}
                        onSetServe={() => {}} // Implemented as simple toggle in sub-component for now
                        teamId={activeTeamA.id}
                        teamName={activeTeamA.name}
                        players={activeTeamA.players}
                        disabled={liveMatch.status !== 'playing'}
                        timeoutsUsed={liveMatch.timeoutsA}
                        subsUsed={liveMatch.substitutionsA}
                        isServing={liveMatch.servingTeamId === activeTeamA.id}
                    />
                </div>

                {/* Center Court */}
                <div className="col-span-6 flex flex-col gap-2">
                    {/* Scoreboard Strip */}
                    <div className="bg-black/80 rounded-lg p-2 flex justify-between items-center border border-white/20">
                         <div className="text-3xl font-black text-white">{liveMatch.scoreA}</div>
                         <div className="flex flex-col items-center">
                             <span className="text-red-500 text-xs font-black uppercase">Set {liveMatch.currentSet}</span>
                             <span className="text-slate-400 text-[10px]">{liveMatch.sets.map(s=>`${s.scoreA}-${s.scoreB}`).join(' | ')}</span>
                         </div>
                         <div className="text-3xl font-black text-white">{liveMatch.scoreB}</div>
                    </div>

                    {/* Top Court (Team A) - Perspective can be flipped if needed */}
                    <Court 
                        players={liveMatch.rotationA} 
                        serving={liveMatch.servingTeamId === activeTeamA.id} 
                        teamName={activeTeamA.name} 
                    />
                    
                    {/* Net Divider */}
                    <div className="h-2 bg-white/50 w-full rounded-full"></div>

                    {/* Bottom Court (Team B) */}
                    <Court 
                        players={liveMatch.rotationB} 
                        serving={liveMatch.servingTeamId === activeTeamB.id} 
                        teamName={activeTeamB.name} 
                    />
                </div>

                {/* Right Control (Team B) */}
                <div className="col-span-3">
                    <ScoreControl 
                        role={currentUser.role}
                        linkedTeamId={currentUser.linkedTeamId}
                        onPoint={handlePoint}
                        onRequestTimeout={handleTimeout}
                        onRequestSub={handleSub}
                        onModifyRotation={() => {}}
                        onSetServe={() => {}}
                        teamId={activeTeamB.id}
                        teamName={activeTeamB.name}
                        players={activeTeamB.players}
                        disabled={liveMatch.status !== 'playing'}
                        timeoutsUsed={liveMatch.timeoutsB}
                        subsUsed={liveMatch.substitutionsB}
                        isServing={liveMatch.servingTeamId === activeTeamB.id}
                    />
                </div>
            </div>
        )}

      </Layout>

      {/* OVERLAYS */}
      {showCloudConfig && (
          <CloudConfig 
            currentUser={currentUser}
            onClose={() => setShowCloudConfig(false)} 
            onConnected={() => setIsCloudConnected(true)}
          />
      )}

      {showSetSummary && activeTeamA && activeTeamB && (
          <SetStatsModal 
              setNumber={showSetSummary.set}
              setData={showSetSummary.data}
              teamA={activeTeamA}
              teamB={activeTeamB}
              onClose={() => setShowSetSummary(null)}
              onNextSet={handleNextSet}
              showNextButton={currentUser.role === 'ADMIN'}
          />
      )}

      {editingPlayer && currentUser && (
          <ProfileEditor 
            player={editingPlayer} 
            currentUser={currentUser}
            onClose={() => setEditingPlayer(null)}
            onSave={(updated) => {
                const newTeams = teams.map(t => ({
                    ...t,
                    players: t.players.map(p => p.id === updated.id ? updated : p)
                }));
                setTeams(newTeams);
                pushUpdate('teams', newTeams);
                setEditingPlayer(null);
            }}
          />
      )}
    </>
  );
};
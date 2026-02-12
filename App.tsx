
import React, { useState, useEffect, useRef } from 'react';
import { Layout } from './components/Layout';
import { Court } from './components/Court';
import { ScoreControl } from './components/ScoreControl';
import { Login } from './components/Login';
import { TVOverlay } from './components/TVOverlay';
import { UserManagement } from './components/UserManagement';
import { SetStatsModal } from './components/SetStatsModal';
import { CloudConfig } from './components/CloudConfig';
import { StandingsTable } from './components/StandingsTable'; 
import { TopPlayers } from './components/TopPlayers'; 
import { ProfileEditor } from './components/ProfileEditor';
import { 
  Tournament, Team, LiveMatchState, 
  Player, PlayerRole, MatchSet, RequestItem, User, MatchConfig
} from './types';
import { generateSmartFixture, generateBasicFixture } from './services/geminiService';
import { initCloud, syncData, pushData, loadConfig, checkForSyncLink, resetCloudData } from './services/cloud';

// --- HELPERS ---
const createEmptyPlayer = (id: string, number: number, role: PlayerRole = PlayerRole.OutsideHitter): Player => ({
  id,
  name: `Jugador ${number}`,
  number,
  role,
  isCaptain: false,
  stats: { points: 0, aces: 0, blocks: 0, errors: 0, matchesPlayed: 0, mvps: 0, yellowCards: 0, redCards: 0 },
  profile: {
    bio: "",
    height: 180,
    weight: 75,
    achievements: [],
    photoUrl: ""
  }
});

// Initial Admin User
const DEFAULT_ADMIN: User = { id: 'admin', username: 'admin', password: '1234', role: 'ADMIN' };

const DAYS_OF_WEEK = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export const App: React.FC = () => {
  // --- STATE ---
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const isAdmin = currentUser?.role === 'ADMIN';
  
  // Navigation
  const [currentView, setCurrentView] = useState('home'); 
  
  // App Data State
  const [users, setUsers] = useState<User[]>([DEFAULT_ADMIN]);
  const [registeredTeams, setRegisteredTeams] = useState<Team[]>([]);
  
  // Tournament State
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [activeTournamentId, setActiveTournamentId] = useState<string | null>(null);
  
  const activeTournament = tournaments.find(t => t.id === activeTournamentId) || null;

  const [liveMatch, setLiveMatch] = useState<LiveMatchState | null>(null);
  
  // UI States
  const [tvMode, setTvMode] = useState(false);
  const [showStatsOnTV, setShowStatsOnTV] = useState(false); 
  const [showScoreboardOnTV, setShowScoreboardOnTV] = useState(true); 
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [loading, setLoading] = useState(false);
  const [viewingSetStats, setViewingSetStats] = useState<{setNum: number, data: MatchSet} | null>(null);
  
  // Match Config Modal
  const [showMatchConfigModal, setShowMatchConfigModal] = useState<string | null>(null); // holds fixtureId or 'LIVE_EDIT'
  const [matchConfig, setMatchConfig] = useState<MatchConfig>({ maxSets: 3, pointsPerSet: 25, tieBreakPoints: 15 });
  const [matchConfigMode, setMatchConfigMode] = useState<'control' | 'preview'>('control');
  const [isEditingRules, setIsEditingRules] = useState(false);

  // Create Tournament Modal State
  const [showCreateTourneyModal, setShowCreateTourneyModal] = useState(false);
  const [newTourneyData, setNewTourneyData] = useState({
      name: '',
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0],
      logoUrl: '',
      matchDays: [] as string[]
  });
  
  // Modals
  const [showSubModal, setShowSubModal] = useState<{teamId: string} | null>(null);
  const [showRotationModal, setShowRotationModal] = useState<{teamId: string} | null>(null);
  const [showCloudConfig, setShowCloudConfig] = useState(false);
  const [isCloudConnected, setIsCloudConnected] = useState(false);

  const [subPlayerOutNum, setSubPlayerOutNum] = useState('');
  const [subPlayerInNum, setSubPlayerInNum] = useState('');
  const [rotationInput, setRotationInput] = useState<string[]>(Array(6).fill('')); 

  // New Team Form State
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamCoach, setNewTeamCoach] = useState('');
  const [newTeamLogo, setNewTeamLogo] = useState('');

  // Auto-Start Countdown State
  const [nextSetCountdown, setNextSetCountdown] = useState<number | null>(null);

  // Refs to track previous state for auto-opening modal
  const prevMatchStatus = useRef<string | undefined>(undefined);

  // --- CLOUD SYNC INITIALIZATION ---
  useEffect(() => {
      const linkData = checkForSyncLink();
      let configToUse = null;
      let orgToUse = null;
      if (linkData) {
          configToUse = linkData.config;
          orgToUse = linkData.organizationId;
      } else {
          const saved = loadConfig();
          if (saved) {
              configToUse = saved.config;
              orgToUse = saved.organizationId;
          }
      }
      if (configToUse && orgToUse) {
          const success = initCloud(configToUse, orgToUse);
          if (success) {
              setIsCloudConnected(true);
          }
      }
  }, []);

  // --- CLOUD SYNC LISTENERS ---
  useEffect(() => {
      if (!isCloudConnected) return;
      const normalizeArray = <T,>(val: any): T[] => {
          if (!val) return [];
          if (Array.isArray(val)) return val.filter(i => !!i); 
          if (typeof val === 'object') return Object.values(val);
          return [];
      };
      const unsubUsers = syncData<any>('users', (val) => {
          const loadedUsers = normalizeArray<User>(val);
          if (loadedUsers.length > 0) {
              setUsers(loadedUsers);
          } else {
              setUsers([DEFAULT_ADMIN]);
              pushData('users', [DEFAULT_ADMIN]);
          }
      });
      const unsubTeams = syncData<any>('teams', (val) => setRegisteredTeams(normalizeArray<Team>(val)));
      const unsubTourneys = syncData<any>('tournaments', (val) => setTournaments(normalizeArray<Tournament>(val)));
      const unsubLive = syncData<LiveMatchState | null>('liveMatch', (val) => setLiveMatch(val));
      return () => { unsubUsers(); unsubTeams(); unsubTourneys(); unsubLive(); };
  }, [isCloudConnected]);

  // --- VIEWER AUTO-SYNC LOGIC ---
  useEffect(() => {
      if ((currentUser?.role === 'VIEWER' || currentUser?.role === 'REFEREE') && liveMatch && tournaments.length > 0) {
          if (!activeTournamentId || activeTournamentId !== tournaments.find(t => t.fixtures?.some(f => f.id === liveMatch.matchId))?.id) {
               const foundT = tournaments.find(t => t.fixtures?.some(f => f.id === liveMatch.matchId));
               if (foundT) {
                   setActiveTournamentId(foundT.id);
               }
          }
          if (currentView !== 'match') setCurrentView('match');
          if (currentUser?.role === 'VIEWER' && !tvMode) setTvMode(true);
      }
  }, [liveMatch, currentUser, tournaments, activeTournamentId, currentView, tvMode]);

  // --- AUTOMATIC SET TRANSITION EFFECT & AUTO-OPEN MODAL ---
  useEffect(() => {
    // Auto-open stats modal when set finishes
    if (liveMatch?.status === 'finished_set' && prevMatchStatus.current !== 'finished_set') {
        const setIndex = liveMatch.currentSet - 1;
        if (liveMatch.sets[setIndex]) {
            setViewingSetStats({ setNum: liveMatch.currentSet, data: liveMatch.sets[setIndex] });
        }
    }
    prevMatchStatus.current = liveMatch?.status;

    let timer: any;
    // Only run auto-countdown if the modal is NOT open, to avoid conflict
    if (liveMatch?.status === 'finished_set' && currentUser?.role === 'ADMIN' && !viewingSetStats) {
        setNextSetCountdown(10); 
        timer = setInterval(() => {
            setNextSetCountdown(prev => {
                if (prev !== null && prev <= 1) {
                    clearInterval(timer);
                    handleStartNextSet(); 
                    return null;
                }
                return prev !== null ? prev - 1 : null;
            });
        }, 1000);
    } else {
        setNextSetCountdown(null);
    }
    return () => clearInterval(timer);
  }, [liveMatch?.status, viewingSetStats, currentUser?.role]);


  // --- SYNC HELPERS ---
  const updateUsers = (newUsers: User[]) => { setUsers(newUsers); if (isCloudConnected) pushData('users', newUsers); };
  const updateTeams = (newTeams: Team[]) => { setRegisteredTeams(newTeams); if (isCloudConnected) pushData('teams', newTeams); };
  const updateTournaments = (newTourneys: Tournament[]) => { setTournaments(newTourneys); if (isCloudConnected) pushData('tournaments', newTourneys); };
  const updateLiveMatch = (update: LiveMatchState | null | ((prev: LiveMatchState | null) => LiveMatchState | null)) => {
      setLiveMatch(prev => {
          const newVal = update instanceof Function ? update(prev) : update;
          if (isCloudConnected) pushData('liveMatch', newVal);
          return newVal;
      });
  };
  
  const handleAddTeam = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim()) return;
    const newTeamId = `t-${Date.now()}`;
    const newTeam: Team = {
      id: newTeamId,
      name: newTeamName,
      color: '#1e3a8a',
      coachName: newTeamCoach || 'Sin entrenador',
      logoUrl: newTeamLogo,
      players: Array.from({ length: 12 }, (_, i) => createEmptyPlayer(`${newTeamId}-p${i+1}`, i + 1))
    };
    updateTeams([...registeredTeams, newTeam]);
    setNewTeamName(''); setNewTeamCoach(''); setNewTeamLogo('');
  };

  const handleDeleteTeam = (teamId: string) => {
      if (!isAdmin) return;
      if (!confirm("¿Estás seguro de eliminar este equipo?")) return;
      const updated = registeredTeams.filter(t => t.id !== teamId);
      updateTeams(updated);
  };

  const handleSystemReset = async () => {
      if (currentUser?.role !== 'ADMIN') return;
      if (!confirm("⚠️ RESET TOTAL: ¿Borrar todo el sistema?")) return;
      if (isCloudConnected) await resetCloudData([DEFAULT_ADMIN]);
      setUsers([DEFAULT_ADMIN]);
      setRegisteredTeams([]);
      setTournaments([]);
      setLiveMatch(null);
      setActiveTournamentId(null);
      setCurrentView('home');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, setter: (val: string) => void) => {
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onloadend = () => setter(reader.result as string);
          reader.readAsDataURL(file);
      }
  };

  const handleAddUser = (user: User) => updateUsers([...users, user]);
  const handleDeleteUser = (userId: string) => updateUsers(users.filter(u => u.id !== userId));
  const handleUpdateUser = (updatedUser: User) => { updateUsers(users.map(u => u.id === updatedUser.id ? updatedUser : u)); };

  const handleCreateTournament = async () => {
    if (!currentUser) return;
    if (registeredTeams.length < 2) { alert("Mínimo 2 equipos para crear un torneo."); return; }
    
    if (!newTourneyData.name.trim()) { alert("Ingresa un nombre para el torneo"); return; }

    setLoading(true);
    let fixtureData: { groups: any, fixtures: any[] } = { groups: {}, fixtures: [] };

    try {
        fixtureData = await generateSmartFixture(
            registeredTeams, 
            newTourneyData.startDate, 
            newTourneyData.endDate,
            newTourneyData.matchDays
        );
    } catch (e) {
        console.error("Smart Fixture Generation Failed, forcing basic fallback", e);
        fixtureData = generateBasicFixture(
            registeredTeams, 
            newTourneyData.startDate, 
            newTourneyData.endDate,
            newTourneyData.matchDays
        );
        alert("Aviso: Se generó un fixture básico debido a un problema de conexión con la IA.");
    } finally {
        const { groups, fixtures } = fixtureData;
        
        const newTournament: Tournament = {
          id: `tourney-${Date.now()}`,
          ownerId: currentUser.id, 
          name: newTourneyData.name,
          logoUrl: newTourneyData.logoUrl,
          startDate: newTourneyData.startDate,
          endDate: newTourneyData.endDate,
          teams: registeredTeams,
          groups,
          fixtures: fixtures.map((f: any, i: number) => ({ ...f, id: `fix-${i}-${Date.now()}`, status: 'scheduled' }))
        };
        updateTournaments([...tournaments, newTournament]);
        setActiveTournamentId(newTournament.id);
        
        setShowCreateTourneyModal(false);
        setCurrentView('dashboard');
        
        setNewTourneyData({
            name: '',
            startDate: new Date().toISOString().split('T')[0],
            endDate: new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0],
            logoUrl: '',
            matchDays: []
        });
        setLoading(false);
    }
  };

  const toggleDaySelection = (day: string) => {
      setNewTourneyData(prev => {
          const exists = prev.matchDays.includes(day);
          return {
              ...prev,
              matchDays: exists ? prev.matchDays.filter(d => d !== day) : [...prev.matchDays, day]
          };
      });
  };

  const handleDeleteTournament = async () => {
      if (!activeTournamentId || currentUser?.role !== 'ADMIN') return;
      if (!confirm("⚠️ ¿Borrar Torneo?")) return;
      const updatedList = tournaments.filter(t => t.id !== activeTournamentId);
      setActiveTournamentId(null);
      setCurrentView('lobby');
      setTournaments(updatedList);
      if (isCloudConnected) await pushData('tournaments', updatedList);
  };

  const updateActiveTournament = (updates: Partial<Tournament>) => {
      if (!activeTournamentId) return;
      updateTournaments(tournaments.map(t => t.id === activeTournamentId ? { ...t, ...updates } : t));
  };

  // --- MATCH CONTROL HANDLERS ---

  const handleInitiateMatch = (fixtureId: string, mode: 'control' | 'preview') => {
      if (liveMatch && liveMatch.matchId === fixtureId) {
          if (mode === 'preview') setTvMode(true);
          setCurrentView('match'); 
          return; 
      }
      if (currentUser?.role === 'ADMIN' || currentUser?.role.includes('COACH') || currentUser?.role === 'REFEREE') {
          // Referee enters directly without config modal if match is already live, or waits if not
          if (currentUser.role === 'REFEREE') {
              // If match is not live, referee cannot start it (only ADMIN/COACH starts via config)
              // But for simplicity in this demo, we can let them enter 'match' view which will show "Waiting for start"
              setCurrentView('match');
              return;
          }

          setShowMatchConfigModal(fixtureId);
          setMatchConfigMode(mode);
          setIsEditingRules(false);
          setMatchConfig({ maxSets: 3, pointsPerSet: 25, tieBreakPoints: 15 });
      } else {
          setCurrentView('match');
      }
  };

  const openEditRules = () => {
      if (!liveMatch) return;
      setMatchConfig(liveMatch.config);
      setIsEditingRules(true);
      setShowMatchConfigModal('LIVE_EDIT');
  };

  const handleSaveConfig = () => {
      if (isEditingRules) {
          updateLiveMatch(prev => prev ? {...prev, config: matchConfig} : null);
          setShowMatchConfigModal(null);
          setIsEditingRules(false);
      } else {
          confirmStartMatch();
      }
  };

  const confirmStartMatch = () => {
    if (!activeTournament || !showMatchConfigModal || showMatchConfigModal === 'LIVE_EDIT') return;
    const fixtureId = showMatchConfigModal;

    const fixture = activeTournament.fixtures?.find(f => f.id === fixtureId);
    if (!fixture) return;

    const updatedFixtures = activeTournament.fixtures?.map(f => f.id === fixtureId ? {...f, status: 'live' as const} : f);
    updateActiveTournament({ fixtures: updatedFixtures });

    const teamA = activeTournament.teams?.find(t => t.id === fixture.teamAId)!;
    const teamB = activeTournament.teams?.find(t => t.id === fixture.teamBId)!;
    const initialSet: MatchSet = { scoreA: 0, scoreB: 0, history: [], durationMinutes: 0 };
    const rotationA = teamA.players.slice(0, 6);
    const rotationB = teamB.players.slice(0, 6);
    
    updateLiveMatch({
      matchId: fixtureId, 
      config: matchConfig,
      status: 'warmup', // Initialize in Warmup mode
      currentSet: 1, 
      sets: [initialSet],
      rotationA, rotationB, 
      benchA: teamA.players.filter(p => !rotationA.find(r => r.id === p.id)), 
      benchB: teamB.players.filter(p => !rotationB.find(r => r.id === p.id)),
      servingTeamId: teamA.id, 
      scoreA: 0, scoreB: 0, 
      timeoutsA: 0, timeoutsB: 0, 
      substitutionsA: 0, substitutionsB: 0, 
      requests: []
    });
    
    setShowMatchConfigModal(null);
    setCurrentView('match');
    
    if (matchConfigMode === 'preview') {
        setTvMode(true);
    }
  };

  const handleStartGame = () => {
      updateLiveMatch(prev => prev ? { ...prev, status: 'playing' } : null);
  };

  const handleSetServe = (teamId: string) => {
      if (!liveMatch) return;
      updateLiveMatch({ ...liveMatch, servingTeamId: teamId });
  };

  // --- NEW SET MANAGEMENT SYSTEM ---
  
  const handleSetOperation = (action: 'START' | 'FINISH' | 'REOPEN', setIndex: number) => {
      if (!activeTournament || !liveMatch) return;

      updateLiveMatch(prev => {
          if (!prev) return null;
          
          let updatedSets = [...prev.sets];
          let updatedStatus = prev.status;
          let updatedCurrentSet = prev.currentSet;
          let updatedScoreA = prev.scoreA;
          let updatedScoreB = prev.scoreB;
          let updatedServingTeam = prev.servingTeamId;

          while (updatedSets.length <= setIndex) {
              updatedSets.push({ scoreA: 0, scoreB: 0, history: [], durationMinutes: 0 });
          }

          if (action === 'START') {
              updatedCurrentSet = setIndex + 1;
              updatedStatus = 'playing';
              updatedScoreA = updatedSets[setIndex].scoreA;
              updatedScoreB = updatedSets[setIndex].scoreB;

              const fixture = activeTournament.fixtures?.find(f => f.id === prev.matchId);
              if (fixture) {
                  updatedServingTeam = ((setIndex + 1) % 2 !== 0) ? fixture.teamAId : fixture.teamBId;
              }
              
              return {
                  ...prev,
                  status: updatedStatus,
                  currentSet: updatedCurrentSet,
                  scoreA: updatedScoreA,
                  scoreB: updatedScoreB,
                  sets: updatedSets,
                  servingTeamId: updatedServingTeam,
                  timeoutsA: 0,
                  timeoutsB: 0,
                  substitutionsA: 0,
                  substitutionsB: 0
              };
          } 
          
          if (action === 'FINISH') {
             const winsA = updatedSets.filter(s => s.scoreA > s.scoreB).length;
             const winsB = updatedSets.filter(s => s.scoreB > s.scoreA).length;
             const requiredWins = Math.ceil(prev.config.maxSets / 2);

             if (winsA >= requiredWins || winsB >= requiredWins) {
                 return { ...prev, status: 'finished', sets: updatedSets };
             }

             // Auto-increment set number if we are finishing the current set
             if (prev.currentSet === setIndex + 1) {
                 const nextSetNum = prev.currentSet + 1;
                 
                 if (updatedSets.length < nextSetNum) {
                     updatedSets.push({ scoreA: 0, scoreB: 0, history: [], durationMinutes: 0 });
                 }
                 
                 const fixture = activeTournament.fixtures?.find(f => f.id === prev.matchId);
                 // Determine next server: Odd sets Team A, Even sets Team B (simplified rule)
                 const nextServingTeam = fixture ? ((nextSetNum % 2 !== 0) ? fixture.teamAId : fixture.teamBId) : prev.servingTeamId;

                 return {
                     ...prev,
                     status: 'playing', // Set to playing to start next set
                     currentSet: nextSetNum,
                     scoreA: 0,
                     scoreB: 0,
                     sets: updatedSets,
                     servingTeamId: nextServingTeam,
                     timeoutsA: 0,
                     timeoutsB: 0,
                     substitutionsA: 0,
                     substitutionsB: 0
                 };
             }
             return { ...prev, sets: updatedSets };
          }

          if (action === 'REOPEN') {
              updatedCurrentSet = setIndex + 1;
              updatedStatus = 'paused'; 
              updatedScoreA = updatedSets[setIndex].scoreA;
              updatedScoreB = updatedSets[setIndex].scoreB;
              
              return {
                  ...prev,
                  status: updatedStatus,
                  currentSet: updatedCurrentSet,
                  scoreA: updatedScoreA,
                  scoreB: updatedScoreB,
                  sets: updatedSets
              };
          }

          return prev;
      });
  };

  const handleStartNextSet = () => {
      if (!liveMatch) return;
      handleSetOperation('FINISH', liveMatch.currentSet - 1); 
  };

  // ... (ResetMatch, EndBroadcast, etc.)
  const handleResetMatch = (fixtureId: string) => {
      if (!activeTournament || currentUser?.role !== 'ADMIN') return;
      if (!confirm("⚠️ ¿REINICIAR PARTIDO?\n\nSe borrará el resultado y el estado volverá a 'Programado'. Si hay un partido en vivo con este ID, se detendrá.")) return;

      const updatedFixtures = activeTournament.fixtures?.map(f => 
          f.id === fixtureId ? { ...f, status: 'scheduled' as const, winnerId: undefined, resultString: undefined } : f
      );
      updateActiveTournament({ fixtures: updatedFixtures });

      if (liveMatch && liveMatch.matchId === fixtureId) {
          updateLiveMatch(null);
      }
  };

  const handleEndBroadcast = async () => {
      if (!liveMatch || !activeTournament || currentUser?.role !== 'ADMIN') return;
      if (!confirm("¿Confirmar y Guardar Resultado Final?")) return;
      
      const sets = liveMatch.sets || [];
      const winsA = sets.filter(s => s.scoreA > s.scoreB).length;
      const winsB = sets.filter(s => s.scoreB > s.scoreA).length;
      const fixture = activeTournament.fixtures?.find(f => f.id === liveMatch.matchId);
      
      let updatedFixtures = activeTournament.fixtures || [];

      if (fixture) {
          const winnerId = winsA > winsB ? fixture.teamAId : (winsB > winsA ? fixture.teamBId : undefined);
          // Update local fixture variable
          updatedFixtures = activeTournament.fixtures?.map(f => f.id === liveMatch.matchId ? { ...f, status: 'finished' as const, winnerId, resultString: `${winsA}-${winsB}` } : f) || [];
      }

      const allHistory = sets.flatMap(s => s.history || []);
      const updatedTeams = registeredTeams.map(team => {
          const updatedPlayers = team.players.map(player => {
              const playerActions = allHistory.filter(h => h.playerId === player.id);
              const points = playerActions.filter(h => h.type === 'attack' || h.type === 'block' || h.type === 'ace').length;
              const aces = playerActions.filter(h => h.type === 'ace').length;
              const blocks = playerActions.filter(h => h.type === 'block').length;
              const yellowCards = playerActions.filter(h => h.type === 'yellow_card').length;
              const redCards = playerActions.filter(h => h.type === 'red_card').length;
              
              if (points > 0 || playerActions.length > 0) {
                  return {
                      ...player,
                      stats: {
                          ...player.stats,
                          matchesPlayed: player.stats.matchesPlayed + 1,
                          points: player.stats.points + points,
                          aces: player.stats.aces + aces,
                          blocks: player.stats.blocks + blocks,
                          yellowCards: (player.stats.yellowCards || 0) + yellowCards,
                          redCards: (player.stats.redCards || 0) + redCards
                      }
                  };
              }
              return player;
          });
          return { ...team, players: updatedPlayers };
      });
      
      // Update global teams pool
      updateTeams(updatedTeams);

      // Perform ATOMIC update to tournament: Fixtures AND Teams (to prevent race conditions)
      updateActiveTournament({ 
          fixtures: updatedFixtures,
          teams: updatedTeams // Important: Sync team stats to the tournament instance as well
      });

      updateLiveMatch(null);
      setTvMode(false);
      setCurrentView('fixture');
  };

  const rotateTeam = (players: Player[]) => {
    const newRotation = [...players];
    const first = newRotation.shift();
    if (first) newRotation.push(first);
    return newRotation;
  };

  const handlePoint = (teamId: string, type: 'attack' | 'block' | 'ace' | 'opponent_error' | 'yellow_card' | 'red_card', playerId?: string) => {
    if (!liveMatch || !activeTournament) return;
    const fixture = activeTournament.fixtures?.find(f => f.id === liveMatch.matchId)!;
    const teamAId = fixture.teamAId;
    const isTeamAScoring = teamId === teamAId;

    updateLiveMatch(prev => {
      if (!prev) return null;
      if (prev.status === 'finished') return prev;

      let newScoreA = prev.scoreA;
      let newScoreB = prev.scoreB;
      let newRotationA = [...prev.rotationA];
      let newRotationB = [...prev.rotationB];
      let newServingTeam = prev.servingTeamId;
      let newStatus = prev.status;

      if (newStatus === 'warmup' || newStatus === 'paused') {
          newStatus = 'playing';
      }

      let pointAwarded = true;

      if (type === 'yellow_card') {
          pointAwarded = false;
      } else if (type === 'red_card') {
          if (teamId === teamAId) {
              newScoreB++;
              if (prev.servingTeamId !== fixture.teamBId) {
                  newRotationB = rotateTeam(prev.rotationB);
                  newServingTeam = fixture.teamBId;
              }
          } else {
              newScoreA++;
              if (prev.servingTeamId !== teamAId) {
                  newRotationA = rotateTeam(prev.rotationA);
                  newServingTeam = teamAId;
              }
          }
          pointAwarded = true; 
      } else {
          if (isTeamAScoring) {
            newScoreA++;
            if (prev.servingTeamId !== teamAId) {
              newRotationA = rotateTeam(prev.rotationA);
              newServingTeam = teamAId;
            }
          } else {
            newScoreB++;
            if (prev.servingTeamId !== fixture.teamBId) {
                newRotationB = rotateTeam(prev.rotationB);
                newServingTeam = fixture.teamBId;
            }
          }
      }

      const isTieBreak = prev.currentSet === prev.config.maxSets;
      const pointsToWin = isTieBreak ? prev.config.tieBreakPoints : prev.config.pointsPerSet;
      
      const setFinished = (newScoreA >= pointsToWin || newScoreB >= pointsToWin) && Math.abs(newScoreA - newScoreB) >= 2;
      
      let finishedSets = [...prev.sets];
      
      const setIndex = prev.currentSet - 1;
      const currentSetData = finishedSets[setIndex] || { scoreA: 0, scoreB: 0, history: [], durationMinutes: 0 };
      const currentHistory = currentSetData.history || [];

      finishedSets[setIndex] = {
          ...currentSetData, 
          scoreA: newScoreA, 
          scoreB: newScoreB,
          history: [...currentHistory, { teamId, playerId, type, scoreSnapshot: `${newScoreA}-${newScoreB}` }]
      };

      if (setFinished && pointAwarded) {
          const winsA = finishedSets.filter(s => s.scoreA > s.scoreB).length;
          const winsB = finishedSets.filter(s => s.scoreB > s.scoreA).length;
          const requiredWins = Math.ceil(prev.config.maxSets / 2);

          if (winsA === requiredWins || winsB === requiredWins) {
               return { 
                   ...prev, 
                   status: 'finished', 
                   scoreA: newScoreA, 
                   scoreB: newScoreB, 
                   sets: finishedSets, 
                   servingTeamId: newServingTeam, 
                   rotationA: newRotationA, 
                   rotationB: newRotationB 
                };
          } else {
            return {
                ...prev, 
                status: 'finished_set', 
                scoreA: newScoreA, 
                scoreB: newScoreB, 
                sets: finishedSets, 
                servingTeamId: newServingTeam, 
                rotationA: newRotationA, 
                rotationB: newRotationB, 
            };
          }
      }
      return { ...prev, status: newStatus, scoreA: newScoreA, scoreB: newScoreB, sets: finishedSets, servingTeamId: newServingTeam, rotationA: newRotationA, rotationB: newRotationB };
    });
  };

  const handleSubtractPoint = (teamId: string) => {
    if (!liveMatch || !activeTournament || !isAdmin) return;
    const fixture = activeTournament.fixtures?.find(f => f.id === liveMatch.matchId)!;
    const isTeamA = teamId === fixture.teamAId;

    updateLiveMatch(prev => {
        if (!prev) return null;
        let newScoreA = prev.scoreA;
        let newScoreB = prev.scoreB;
        
        if (isTeamA && newScoreA > 0) newScoreA--;
        else if (!isTeamA && newScoreB > 0) newScoreB--;
        else return prev; 

        let finishedSets = [...prev.sets];
        const setIndex = prev.currentSet - 1;
        const currentSetData = finishedSets[setIndex] || { scoreA: 0, scoreB: 0, history: [], durationMinutes: 0 };
        const currentHistory = [...(currentSetData.history || [])];

        if (currentHistory.length > 0) {
            currentHistory.pop();
        }

        finishedSets[setIndex] = {
            ...currentSetData, 
            scoreA: newScoreA, 
            scoreB: newScoreB,
            history: currentHistory
        };

        return { ...prev, status: 'playing', scoreA: newScoreA, scoreB: newScoreB, sets: finishedSets };
    });
  };

  const handleRequestTimeout = (teamId: string) => {
    if (!liveMatch) return;
    if (currentUser?.role === 'ADMIN') {
       updateLiveMatch(prev => {
           if (!prev) return null;
           const fixture = activeTournament?.fixtures?.find(f => f.id === prev.matchId);
           const isTeamA = teamId === fixture?.teamAId;
           return { ...prev, timeoutsA: isTeamA ? prev.timeoutsA + 1 : prev.timeoutsA, timeoutsB: !isTeamA ? prev.timeoutsB + 1 : prev.timeoutsB }
       });
       return;
    }
    const newReq: RequestItem = { id: Date.now().toString(), teamId, type: 'timeout', status: 'pending' };
    updateLiveMatch(prev => prev ? { ...prev, requests: [...prev.requests, newReq] } : null);
  };

  const initiateSubRequest = (teamId: string) => {
      setSubPlayerInNum('');
      setSubPlayerOutNum('');
      setShowSubModal({ teamId });
  };

  const handleConfirmSub = () => {
      if (!liveMatch || !showSubModal || !activeTournament) return;
      const { teamId } = showSubModal;
      const fixture = activeTournament.fixtures?.find(f => f.id === liveMatch.matchId);
      const isTeamA = teamId === fixture?.teamAId;

      const outNum = parseInt(subPlayerOutNum);
      const inNum = parseInt(subPlayerInNum);

      if (isNaN(outNum) || isNaN(inNum)) return;

      updateLiveMatch(prev => {
          if (!prev) return null;
          
          const currentRotation = isTeamA ? prev.rotationA : prev.rotationB;
          const currentBench = isTeamA ? prev.benchA : prev.benchB;

          const playerOutIndex = currentRotation.findIndex(p => p.number === outNum);
          const playerInIndex = currentBench.findIndex(p => p.number === inNum);

          if (playerOutIndex === -1 || playerInIndex === -1) {
              alert("Jugadores no encontrados en rotación/banca.");
              return prev;
          }

          const playerOut = currentRotation[playerOutIndex];
          const playerIn = currentBench[playerInIndex];

          const newRotation = [...currentRotation];
          newRotation[playerOutIndex] = playerIn;

          const newBench = [...currentBench];
          newBench[playerInIndex] = playerOut;

          return {
              ...prev,
              rotationA: isTeamA ? newRotation : prev.rotationA,
              rotationB: !isTeamA ? newRotation : prev.rotationB,
              benchA: isTeamA ? newBench : prev.benchA,
              benchB: !isTeamA ? newBench : prev.benchB,
              substitutionsA: isTeamA ? prev.substitutionsA + 1 : prev.substitutionsA,
              substitutionsB: !isTeamA ? prev.substitutionsB + 1 : prev.substitutionsB,
          };
      });
      setShowSubModal(null);
  };

  const initiateRotationCheck = (teamId: string) => {
      if (!liveMatch) return;
      // Identify current rotation to pre-fill
      const fixture = activeTournament?.fixtures?.find(f => f.id === liveMatch.matchId);
      const isTeamA = teamId === fixture?.teamAId;
      const currentRot = isTeamA ? liveMatch.rotationA : liveMatch.rotationB;
      
      setRotationInput(currentRot.map(p => p.number.toString()));
      setShowRotationModal({ teamId });
  };

  const handleUpdateRotation = () => {
      if (!liveMatch || !showRotationModal || !activeTournament) return;
      const { teamId } = showRotationModal;
      const fixture = activeTournament.fixtures?.find(f => f.id === liveMatch.matchId);
      const isTeamA = teamId === fixture?.teamAId;
      
      const team = activeTournament.teams.find(t => t.id === teamId);
      if (!team) return;

      const newRotation: Player[] = [];
      for (const numStr of rotationInput) {
          const num = parseInt(numStr);
          const p = team.players.find(pl => pl.number === num);
          if (p) newRotation.push(p);
      }

      if (newRotation.length !== 6) {
          alert("Debes especificar 6 jugadores válidos.");
          return;
      }

      // Remaining players go to bench
      const newBench = team.players.filter(p => !newRotation.find(r => r.id === p.id));

      updateLiveMatch(prev => prev ? {
          ...prev,
          rotationA: isTeamA ? newRotation : prev.rotationA,
          rotationB: !isTeamA ? newRotation : prev.rotationB,
          benchA: isTeamA ? newBench : prev.benchA,
          benchB: !isTeamA ? newBench : prev.benchB
      } : null);
      
      setShowRotationModal(null);
  };

  // --- RENDER HELPERS ---

  if (!currentUser) {
      return (
          <Login 
            onLogin={(u) => { setCurrentUser(u); if(u.role !== 'VIEWER') initCloud(loadConfig()?.config || {}, loadConfig()?.organizationId || ''); }}
            users={users}
            isCloudConnected={isCloudConnected}
            onOpenCloudConfig={() => setShowCloudConfig(true)}
          />
      );
  }
  
  // Render Main App
  return (
    <Layout 
      currentUser={currentUser} 
      onLogout={() => { setCurrentUser(null); setLiveMatch(null); setCurrentView('home'); }} 
      onNavigate={setCurrentView}
      currentView={currentView}
      isCloudConnected={isCloudConnected}
      onOpenCloudConfig={() => setShowCloudConfig(true)}
    >
      {/* CLOUD CONFIG MODAL */}
      {showCloudConfig && (
          <CloudConfig 
            onClose={() => setShowCloudConfig(false)}
            onConnected={() => setIsCloudConnected(true)}
            currentUser={currentUser}
          />
      )}

      {/* VIEWS */}
      
      {/* 1. HOME VIEW */}
      {currentView === 'home' && (
         <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-8 animate-in fade-in zoom-in-95 duration-500">
             <div className="relative">
                 <div className="absolute -inset-4 bg-gradient-to-r from-blue-600 to-vnl-accent opacity-20 blur-xl rounded-full"></div>
                 <h1 className="relative text-5xl md:text-7xl font-black text-white italic tracking-tighter">
                     JSPORT <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300">MANAGER</span>
                 </h1>
             </div>
             
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl">
                 <button onClick={() => setCurrentView('lobby')} className="bg-corp-panel hover:bg-white/5 border border-white/10 p-6 rounded-xl group transition duration-300">
                     <span className="text-4xl mb-2 block group-hover:scale-110 transition">🏆</span>
                     <h3 className="text-xl font-bold text-white uppercase italic">Torneos</h3>
                     <p className="text-sm text-slate-500 mt-1">Gestionar campeonatos y fixtures</p>
                 </button>
                 <button onClick={() => setCurrentView('teams')} className="bg-corp-panel hover:bg-white/5 border border-white/10 p-6 rounded-xl group transition duration-300">
                     <span className="text-4xl mb-2 block group-hover:scale-110 transition">👥</span>
                     <h3 className="text-xl font-bold text-white uppercase italic">Equipos</h3>
                     <p className="text-sm text-slate-500 mt-1">Administrar plantillas y jugadores</p>
                 </button>
                 {isAdmin && (
                    <button onClick={() => setCurrentView('users')} className="bg-corp-panel hover:bg-white/5 border border-white/10 p-6 rounded-xl group transition duration-300 md:col-span-2">
                        <span className="text-4xl mb-2 block group-hover:scale-110 transition">⚙️</span>
                        <h3 className="text-xl font-bold text-white uppercase italic">Administración</h3>
                        <p className="text-sm text-slate-500 mt-1">Usuarios y Configuración del Sistema</p>
                    </button>
                 )}
             </div>
         </div>
      )}

      {/* 2. LOBBY VIEW (Tournaments List) */}
      {currentView === 'lobby' && (
          <div className="space-y-6 animate-in slide-in-from-right-4">
              <div className="flex justify-between items-center">
                  <h2 className="text-3xl font-black text-white uppercase italic tracking-tighter">Torneos <span className="text-vnl-accent">Activos</span></h2>
                  {isAdmin && (
                      <button onClick={() => setShowCreateTourneyModal(true)} className="bg-vnl-accent hover:bg-cyan-400 text-black font-black px-6 py-3 rounded shadow-[0_0_15px_rgba(6,182,212,0.3)] transition uppercase text-xs tracking-widest">
                          + Nuevo Torneo
                      </button>
                  )}
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {tournaments.map(t => (
                      <div key={t.id} onClick={() => { setActiveTournamentId(t.id); setCurrentView('dashboard'); }} className="bg-corp-panel border border-white/10 rounded-xl overflow-hidden hover:border-vnl-accent/50 transition cursor-pointer group">
                          <div className="h-32 bg-gradient-to-br from-blue-900/40 to-black relative flex items-center justify-center p-4">
                              {t.logoUrl ? <img src={t.logoUrl} className="h-full w-full object-contain drop-shadow-lg group-hover:scale-110 transition duration-500" /> : <span className="text-6xl group-hover:scale-110 transition duration-500">🏆</span>}
                          </div>
                          <div className="p-4">
                              <h3 className="text-xl font-black text-white uppercase italic tracking-tight">{t.name}</h3>
                              <p className="text-xs text-slate-400 font-bold uppercase mt-1">{t.teams.length} Equipos • {t.fixtures?.length || 0} Partidos</p>
                              <div className="mt-4 flex justify-between items-center">
                                  <span className="text-[10px] bg-white/10 px-2 py-1 rounded text-slate-300">{new Date(t.startDate).toLocaleDateString()}</span>
                                  <span className="text-vnl-accent text-xs font-bold uppercase tracking-widest group-hover:translate-x-1 transition">Ver Panel →</span>
                              </div>
                          </div>
                      </div>
                  ))}
                  {tournaments.length === 0 && (
                      <div className="col-span-full py-20 text-center text-slate-600 font-bold uppercase tracking-widest">No hay torneos creados</div>
                  )}
              </div>
          </div>
      )}

      {/* 3. DASHBOARD VIEW (Single Tournament) */}
      {currentView === 'dashboard' && activeTournament && (
          <div className="space-y-8 animate-in slide-in-from-right-4">
               {/* Tournament Header */}
               <div className="flex flex-col md:flex-row justify-between items-start md:items-end border-b border-white/10 pb-4 gap-4">
                   <div className="flex items-center gap-4">
                       <button onClick={() => setCurrentView('lobby')} className="text-slate-500 hover:text-white transition">← Volver</button>
                       {activeTournament.logoUrl && <img src={activeTournament.logoUrl} className="w-16 h-16 object-contain" />}
                       <div>
                           <h1 className="text-4xl font-black text-white uppercase italic tracking-tighter leading-none">{activeTournament.name}</h1>
                           <div className="flex gap-4 mt-2 text-xs font-bold text-slate-400 uppercase tracking-widest">
                               <span>📅 {new Date(activeTournament.startDate).toLocaleDateString()}</span>
                               <span>👥 {activeTournament.teams.length} Teams</span>
                           </div>
                       </div>
                   </div>
                   
                   <div className="flex gap-2">
                       <button onClick={() => setCurrentView('fixture')} className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded text-xs font-bold uppercase tracking-widest transition">Fixture</button>
                       <button onClick={() => setCurrentView('standings')} className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded text-xs font-bold uppercase tracking-widest transition">Tabla</button>
                       <button onClick={() => setCurrentView('stats')} className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded text-xs font-bold uppercase tracking-widest transition">Estadísticas</button>
                       {isAdmin && (
                           <button onClick={handleDeleteTournament} className="bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-500/30 px-4 py-2 rounded text-xs font-bold uppercase tracking-widest transition">Eliminar</button>
                       )}
                   </div>
               </div>

               {/* Fixture / Matches List */}
               <div className="grid gap-4">
                   {activeTournament.fixtures?.map((fix) => {
                       const teamA = activeTournament.teams.find(t => t.id === fix.teamAId);
                       const teamB = activeTournament.teams.find(t => t.id === fix.teamBId);
                       if (!teamA || !teamB) return null;

                       const isLive = fix.status === 'live';
                       const isFinished = fix.status === 'finished';

                       return (
                           <div key={fix.id} className={`bg-corp-panel border ${isLive ? 'border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.2)]' : 'border-white/10'} rounded-lg p-4 flex flex-col md:flex-row items-center justify-between gap-4 group transition hover:bg-white/5`}>
                               <div className="flex items-center gap-4 w-full md:w-1/3">
                                   <div className="text-center w-12 shrink-0">
                                       <div className="text-xs font-bold text-slate-500 uppercase">{new Date(fix.date).getDate()}</div>
                                       <div className="text-[10px] font-black text-slate-600 uppercase">{new Date(fix.date).toLocaleString('es-ES', { month: 'short' })}</div>
                                   </div>
                                   <div className="flex flex-col">
                                       <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{fix.group}</span>
                                       <div className="flex items-center gap-2">
                                           {isLive && <span className="bg-red-600 text-white text-[9px] px-1.5 py-0.5 rounded font-black uppercase animate-pulse">EN VIVO</span>}
                                           {isFinished && <span className="bg-slate-700 text-white text-[9px] px-1.5 py-0.5 rounded font-black uppercase">FINAL</span>}
                                       </div>
                                   </div>
                               </div>

                               <div className="flex items-center justify-center gap-4 w-full md:w-1/3">
                                   <div className={`flex items-center gap-2 ${fix.winnerId === teamA.id ? 'text-yellow-400' : 'text-white'}`}>
                                       <span className="font-bold uppercase text-sm md:text-base text-right">{teamA.name}</span>
                                       {teamA.logoUrl && <img src={teamA.logoUrl} className="w-8 h-8 object-contain" />}
                                   </div>
                                   <div className="bg-black/40 px-3 py-1 rounded text-xl font-black text-white font-mono tracking-widest">
                                       {isFinished ? fix.resultString : isLive ? 'VS' : '-'}
                                   </div>
                                   <div className={`flex items-center gap-2 ${fix.winnerId === teamB.id ? 'text-yellow-400' : 'text-white'}`}>
                                       {teamB.logoUrl && <img src={teamB.logoUrl} className="w-8 h-8 object-contain" />}
                                       <span className="font-bold uppercase text-sm md:text-base">{teamB.name}</span>
                                   </div>
                               </div>

                               <div className="w-full md:w-1/3 flex justify-end gap-2">
                                   {isAdmin && (
                                       <>
                                         {isLive ? (
                                             <button onClick={() => handleInitiateMatch(fix.id, 'control')} className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded text-xs font-black uppercase tracking-widest shadow-lg transition animate-pulse">
                                                 Continuar
                                             </button>
                                         ) : isFinished ? (
                                              <button onClick={() => handleResetMatch(fix.id)} className="text-xs font-bold text-slate-500 hover:text-red-400 uppercase tracking-wider px-3 py-2 border border-transparent hover:border-red-500/30 rounded transition">
                                                 Reiniciar
                                              </button>
                                         ) : (
                                              <button onClick={() => handleInitiateMatch(fix.id, 'control')} className="bg-vnl-accent hover:bg-cyan-400 text-black px-4 py-2 rounded text-xs font-black uppercase tracking-widest shadow transition">
                                                  Iniciar
                                              </button>
                                         )}
                                       </>
                                   )}
                                   {/* Viewers can watch live */}
                                   {(isLive || isFinished) && !isAdmin && (
                                        <button onClick={() => { setLiveMatch(liveMatch); setCurrentView('match'); setTvMode(true); }} className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded text-xs font-black uppercase tracking-widest border border-white/10 transition">
                                            {isLive ? '🔴 Ver en Vivo' : 'Ver Resultado'}
                                        </button>
                                   )}
                               </div>
                           </div>
                       );
                   })}
               </div>
          </div>
      )}

      {/* MATCH VIEW */}
      {currentView === 'match' && liveMatch && activeTournament && (
          <div className="relative min-h-[85vh]">
              {tvMode ? (
                  <TVOverlay 
                    match={liveMatch}
                    teamA={activeTournament.teams.find(t => t.id === activeTournament?.fixtures?.find(f => f.id === liveMatch.matchId)?.teamAId)!}
                    teamB={activeTournament.teams.find(t => t.id === activeTournament?.fixtures?.find(f => f.id === liveMatch.matchId)?.teamBId)!}
                    tournament={activeTournament}
                    currentUser={currentUser}
                    onExit={() => setTvMode(false)}
                    onLogout={currentUser.role === 'VIEWER' ? () => { setCurrentUser(null); setLiveMatch(null); setCurrentView('home'); } : undefined}
                    onBack={currentUser.role === 'VIEWER' ? () => { setCurrentView('dashboard'); setTvMode(false); } : undefined}
                    onNextSet={handleStartNextSet}
                    nextSetCountdown={nextSetCountdown}
                    showStatsOverlay={showStatsOnTV}
                    showScoreboard={showScoreboardOnTV}
                    isCloudConnected={isCloudConnected}
                  />
              ) : (
                <div className="space-y-4 pb-20">
                     {/* Control Bar */}
                     <div className="flex justify-between items-center bg-black/40 p-4 border-b border-white/10 rounded-t-xl backdrop-blur-md sticky top-16 z-30">
                         <div className="flex items-center gap-4">
                             <button onClick={() => setCurrentView('dashboard')} className="text-slate-400 hover:text-white font-bold text-xs uppercase tracking-widest">← Panel</button>
                             <div className="h-6 w-px bg-white/10"></div>
                             <span className="text-white font-black uppercase italic tracking-tighter text-lg">{activeTournament.name}</span>
                             <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest ${liveMatch.status === 'playing' ? 'bg-red-600 text-white animate-pulse' : 'bg-slate-700 text-slate-300'}`}>
                                 {liveMatch.status === 'warmup' ? 'Calentamiento' : liveMatch.status === 'finished_set' ? 'Set Finalizado' : liveMatch.status === 'finished' ? 'Partido Finalizado' : 'En Vivo'}
                             </span>
                         </div>
                         <div className="flex gap-2">
                             {isAdmin && (
                                 <>
                                    <button onClick={openEditRules} className="bg-white/5 hover:bg-white/10 text-slate-300 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-widest border border-white/10">Reglas</button>
                                    <button onClick={() => setShowScoreboardOnTV(!showScoreboardOnTV)} className={`px-3 py-1.5 rounded text-xs font-bold uppercase tracking-widest border border-white/10 transition ${showScoreboardOnTV ? 'bg-green-600 text-white' : 'bg-black/40 text-slate-500'}`}>Tablero</button>
                                    <button onClick={() => setShowStatsOnTV(!showStatsOnTV)} className={`px-3 py-1.5 rounded text-xs font-bold uppercase tracking-widest border border-white/10 transition ${showStatsOnTV ? 'bg-blue-600 text-white' : 'bg-black/40 text-slate-500'}`}>Stats TV</button>
                                    <button onClick={() => setTvMode(true)} className="bg-vnl-accent hover:bg-cyan-400 text-black px-3 py-1.5 rounded text-xs font-bold uppercase tracking-widest shadow">Vista TV 📺</button>
                                    <button onClick={handleEndBroadcast} className="bg-red-900/50 hover:bg-red-800 text-red-200 border border-red-500/30 px-3 py-1.5 rounded text-xs font-bold uppercase tracking-widest">Terminar</button>
                                 </>
                             )}
                         </div>
                     </div>
                     
                     {/* Game Area */}
                     <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        {/* Team A Control */}
                        <div className="lg:col-span-3 space-y-4">
                            <ScoreControl 
                                role={currentUser.role}
                                linkedTeamId={currentUser.linkedTeamId}
                                onPoint={handlePoint}
                                onSubtractPoint={handleSubtractPoint}
                                onRequestTimeout={handleRequestTimeout}
                                onRequestSub={initiateSubRequest}
                                onModifyRotation={initiateRotationCheck}
                                onSetServe={handleSetServe}
                                teamId={activeTournament.fixtures?.find(f => f.id === liveMatch.matchId)?.teamAId!}
                                teamName={activeTournament.teams.find(t => t.id === activeTournament.fixtures?.find(f => f.id === liveMatch.matchId)?.teamAId)?.name!}
                                players={liveMatch.rotationA}
                                disabled={liveMatch.status === 'finished'}
                                timeoutsUsed={liveMatch.timeoutsA}
                                subsUsed={liveMatch.substitutionsA}
                                isServing={liveMatch.servingTeamId === activeTournament.fixtures?.find(f => f.id === liveMatch.matchId)?.teamAId}
                            />
                             {/* Bench A */}
                             <div className="bg-black/20 p-3 rounded border border-white/5">
                                 <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Banca</h4>
                                 <div className="flex flex-wrap gap-2">
                                     {liveMatch.benchA.map(p => (
                                         <span key={p.id} className="bg-white/5 text-slate-300 text-xs px-2 py-1 rounded font-bold">#{p.number}</span>
                                     ))}
                                 </div>
                             </div>
                        </div>
                        
                        {/* Court Center */}
                        <div className="lg:col-span-6 flex flex-col gap-4">
                            {/* Scoreboard Display */}
                            <div className="bg-black/60 rounded-xl border border-white/10 p-4 flex justify-between items-center shadow-2xl relative overflow-hidden">
                                <div className="text-4xl lg:text-6xl font-black text-white tabular-nums">{liveMatch.scoreA}</div>
                                <div className="flex flex-col items-center z-10">
                                    <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">Set {liveMatch.currentSet}</div>
                                    <div className="text-2xl font-black text-white italic">VS</div>
                                    {liveMatch.status === 'finished_set' && (
                                        <button onClick={handleStartNextSet} className="mt-2 bg-green-600 hover:bg-green-500 text-white px-4 py-1 rounded-full text-xs font-bold uppercase animate-pulse shadow-lg">
                                            Siguiente Set
                                        </button>
                                    )}
                                    {liveMatch.status === 'warmup' && isAdmin && (
                                        <button onClick={handleStartGame} className="mt-2 bg-green-600 hover:bg-green-500 text-white px-4 py-1 rounded-full text-xs font-bold uppercase animate-pulse shadow-lg">
                                            Iniciar Partido
                                        </button>
                                    )}
                                </div>
                                <div className="text-4xl lg:text-6xl font-black text-white tabular-nums">{liveMatch.scoreB}</div>
                            </div>
                            
                            {/* Courts */}
                            <div className="flex flex-col gap-1">
                                <Court 
                                    players={liveMatch.rotationA} 
                                    serving={liveMatch.servingTeamId === activeTournament.fixtures?.find(f => f.id === liveMatch.matchId)?.teamAId}
                                    teamName={activeTournament.teams.find(t => t.id === activeTournament.fixtures?.find(f => f.id === liveMatch.matchId)?.teamAId)?.name!}
                                />
                                <div className="h-1 bg-white/20 w-full rounded-full"></div>
                                <Court 
                                    players={liveMatch.rotationB} 
                                    serving={liveMatch.servingTeamId === activeTournament.fixtures?.find(f => f.id === liveMatch.matchId)?.teamBId}
                                    teamName={activeTournament.teams.find(t => t.id === activeTournament.fixtures?.find(f => f.id === liveMatch.matchId)?.teamBId)?.name!}
                                />
                            </div>
                        </div>

                        {/* Team B Control */}
                        <div className="lg:col-span-3 space-y-4">
                            <ScoreControl 
                                role={currentUser.role}
                                linkedTeamId={currentUser.linkedTeamId}
                                onPoint={handlePoint}
                                onSubtractPoint={handleSubtractPoint}
                                onRequestTimeout={handleRequestTimeout}
                                onRequestSub={initiateSubRequest}
                                onModifyRotation={initiateRotationCheck}
                                onSetServe={handleSetServe}
                                teamId={activeTournament.fixtures?.find(f => f.id === liveMatch.matchId)?.teamBId!}
                                teamName={activeTournament.teams.find(t => t.id === activeTournament.fixtures?.find(f => f.id === liveMatch.matchId)?.teamBId)?.name!}
                                players={liveMatch.rotationB}
                                disabled={liveMatch.status === 'finished'}
                                timeoutsUsed={liveMatch.timeoutsB}
                                subsUsed={liveMatch.substitutionsB}
                                isServing={liveMatch.servingTeamId === activeTournament.fixtures?.find(f => f.id === liveMatch.matchId)?.teamBId}
                            />
                             {/* Bench B */}
                             <div className="bg-black/20 p-3 rounded border border-white/5">
                                 <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Banca</h4>
                                 <div className="flex flex-wrap gap-2">
                                     {liveMatch.benchB.map(p => (
                                         <span key={p.id} className="bg-white/5 text-slate-300 text-xs px-2 py-1 rounded font-bold">#{p.number}</span>
                                     ))}
                                 </div>
                             </div>
                        </div>
                     </div>
                </div>
              )}
          </div>
      )}
      
      {/* 4. TEAMS MANAGEMENT VIEW */}
      {currentView === 'teams' && (
          <div className="space-y-8 animate-in slide-in-from-right-4">
               <div className="flex justify-between items-center border-b border-white/10 pb-4">
                   <h2 className="text-3xl font-black text-white uppercase italic tracking-tighter">Gestión de <span className="text-vnl-accent">Equipos</span></h2>
               </div>
               
               {/* New Team Form */}
               {isAdmin && (
                   <div className="bg-corp-panel p-6 border border-white/10 rounded-xl relative overflow-hidden">
                       <h3 className="text-sm font-bold text-vnl-accent uppercase tracking-widest mb-4">Registrar Nuevo Equipo</h3>
                       <form onSubmit={handleAddTeam} className="flex flex-col md:flex-row gap-4 items-end">
                           <div className="flex-grow w-full">
                               <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Nombre del Equipo</label>
                               <input value={newTeamName} onChange={e => setNewTeamName(e.target.value)} className="w-full p-3 bg-black/40 border border-white/10 rounded text-sm text-white font-bold focus:border-vnl-accent outline-none" placeholder="Ej: Las Águilas" required />
                           </div>
                           <div className="w-full md:w-1/3">
                               <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Entrenador</label>
                               <input value={newTeamCoach} onChange={e => setNewTeamCoach(e.target.value)} className="w-full p-3 bg-black/40 border border-white/10 rounded text-sm text-white font-bold focus:border-vnl-accent outline-none" placeholder="Nombre del Coach" />
                           </div>
                           <div className="w-full md:w-auto shrink-0">
                               <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Logo URL (Opcional)</label>
                               <div className="flex gap-2">
                                   <input type="file" accept="image/*" onChange={(e) => handleFileUpload(e, setNewTeamLogo)} className="hidden" id="teamLogoUpload" />
                                   <label htmlFor="teamLogoUpload" className="bg-white/10 hover:bg-white/20 text-white px-4 py-3 rounded cursor-pointer border border-white/10 text-xs font-bold uppercase transition">Subir</label>
                                   {newTeamLogo && <img src={newTeamLogo} className="w-10 h-10 object-contain bg-white rounded p-1" />}
                               </div>
                           </div>
                           <button type="submit" className="w-full md:w-auto bg-vnl-accent hover:bg-cyan-400 text-black font-black px-8 py-3 rounded shadow-[0_0_15px_rgba(6,182,212,0.3)] transition uppercase text-xs tracking-widest">
                               Agregar
                           </button>
                       </form>
                   </div>
               )}

               {/* Teams List */}
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   {registeredTeams.map(team => (
                       <div key={team.id} className="bg-corp-panel border border-white/10 rounded-xl overflow-hidden group hover:border-vnl-accent/30 transition">
                           <div className="p-4 bg-gradient-to-r from-blue-900/20 to-transparent flex justify-between items-center border-b border-white/5">
                               <div className="flex items-center gap-3">
                                   {team.logoUrl ? <img src={team.logoUrl} className="w-10 h-10 object-contain drop-shadow" /> : <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center font-bold">{team.name[0]}</div>}
                                   <div>
                                       <h3 className="font-black text-white text-lg uppercase italic tracking-tight">{team.name}</h3>
                                       <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Coach: {team.coachName}</p>
                                   </div>
                               </div>
                               {isAdmin && <button onClick={() => handleDeleteTeam(team.id)} className="text-red-500 hover:text-red-400 font-bold text-xs uppercase">Eliminar</button>}
                           </div>
                           
                           {/* Players */}
                           <div className="p-4 grid grid-cols-4 gap-2">
                               {team.players.map(p => (
                                   <div 
                                     key={p.id} 
                                     onClick={() => setEditingPlayer(p)}
                                     className="bg-black/30 p-2 rounded border border-white/5 flex flex-col items-center cursor-pointer hover:bg-white/10 transition group/player"
                                   >
                                       <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-white mb-1 overflow-hidden">
                                           {p.profile?.photoUrl ? <img src={p.profile.photoUrl} className="w-full h-full object-cover" /> : `#${p.number}`}
                                       </div>
                                       <span className="text-[9px] font-bold text-slate-400 uppercase truncate w-full text-center group-hover/player:text-white">{p.name.split(' ')[0]}</span>
                                   </div>
                               ))}
                           </div>
                       </div>
                   ))}
               </div>
          </div>
      )}

      {/* 5. USERS VIEW */}
      {currentView === 'users' && (
          <UserManagement 
            users={users} 
            teams={registeredTeams}
            currentUser={currentUser}
            onAddUser={handleAddUser}
            onDeleteUser={handleDeleteUser}
            onUpdateUser={handleUpdateUser}
            onSystemReset={isAdmin ? handleSystemReset : undefined}
          />
      )}

      {/* 6. STANDINGS VIEW */}
      {currentView === 'standings' && activeTournament && (
         <div className="space-y-6">
             <div className="flex items-center gap-4 border-b border-white/10 pb-4">
                 <button onClick={() => setCurrentView('dashboard')} className="text-slate-500 hover:text-white transition">← Volver</button>
                 <h2 className="text-3xl font-black text-white uppercase italic tracking-tighter">Tabla de <span className="text-vnl-accent">Posiciones</span></h2>
             </div>
             <StandingsTable tournament={activeTournament} />
         </div>
      )}

      {/* 7. STATS VIEW */}
      {currentView === 'stats' && activeTournament && (
          <div className="space-y-6">
             <div className="flex items-center gap-4 border-b border-white/10 pb-4">
                 <button onClick={() => setCurrentView('dashboard')} className="text-slate-500 hover:text-white transition">← Volver</button>
                 <h2 className="text-3xl font-black text-white uppercase italic tracking-tighter">Top <span className="text-vnl-accent">Players</span></h2>
             </div>
             <TopPlayers tournament={activeTournament} />
          </div>
      )}

      {/* MODALS */}
      
      {/* Set Stats Modal (Auto or Manual) */}
      {viewingSetStats && activeTournament && (
          <SetStatsModal 
              setNumber={viewingSetStats.setNum}
              setData={viewingSetStats.data}
              teamA={activeTournament.teams.find(t => t.id === activeTournament?.fixtures?.find(f => f.id === liveMatch?.matchId)?.teamAId)!}
              teamB={activeTournament.teams.find(t => t.id === activeTournament?.fixtures?.find(f => f.id === liveMatch?.matchId)?.teamBId)!}
              onClose={() => setViewingSetStats(null)}
              onNextSet={() => { handleStartNextSet(); setViewingSetStats(null); }}
              showNextButton={isAdmin && liveMatch?.status === 'finished_set'}
          />
      )}
      
      {/* Create Tournament Modal */}
      {showCreateTourneyModal && (
          <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 backdrop-blur-md">
              <div className="bg-vnl-panel border border-white/20 p-6 w-full max-w-lg shadow-[0_0_50px_rgba(6,182,212,0.2)]">
                  <h3 className="text-xl font-black text-white uppercase italic tracking-tighter mb-6 border-b border-white/10 pb-2">Nuevo Torneo</h3>
                  <div className="space-y-4">
                      <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Nombre</label>
                          <input value={newTourneyData.name} onChange={e => setNewTourneyData({...newTourneyData, name: e.target.value})} className="w-full p-3 bg-black/40 border border-white/10 text-white font-bold focus:border-vnl-accent outline-none" placeholder="Ej: Copa Verano 2024" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Inicio</label>
                              <input type="date" value={newTourneyData.startDate} onChange={e => setNewTourneyData({...newTourneyData, startDate: e.target.value})} className="w-full p-3 bg-black/40 border border-white/10 text-white font-bold focus:border-vnl-accent outline-none" />
                          </div>
                          <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Fin</label>
                              <input type="date" value={newTourneyData.endDate} onChange={e => setNewTourneyData({...newTourneyData, endDate: e.target.value})} className="w-full p-3 bg-black/40 border border-white/10 text-white font-bold focus:border-vnl-accent outline-none" />
                          </div>
                      </div>
                      <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Días de Partido (IA)</label>
                          <div className="flex flex-wrap gap-2">
                              {DAYS_OF_WEEK.map(day => (
                                  <button 
                                    key={day} 
                                    onClick={() => toggleDaySelection(day)}
                                    className={`px-3 py-1 rounded text-[10px] font-bold uppercase transition border ${newTourneyData.matchDays.includes(day) ? 'bg-vnl-accent text-black border-vnl-accent' : 'bg-black/40 text-slate-500 border-white/10 hover:border-white'}`}
                                  >
                                      {day.substring(0,3)}
                                  </button>
                              ))}
                          </div>
                      </div>
                      <button onClick={handleCreateTournament} disabled={loading} className="w-full bg-vnl-accent hover:bg-cyan-400 text-black font-black py-4 uppercase tracking-widest text-sm shadow-lg transition mt-4 flex items-center justify-center gap-2">
                          {loading ? 'Generando Fixture...' : 'Crear & Generar Fixture'}
                      </button>
                      <button onClick={() => setShowCreateTourneyModal(false)} className="w-full text-slate-500 text-xs font-bold uppercase tracking-widest hover:text-white transition">Cancelar</button>
                  </div>
              </div>
          </div>
      )}

      {/* Match Config Modal (Pre-Match or Edit Rules) */}
      {showMatchConfigModal && activeTournament && (
          <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 backdrop-blur-md">
              <div className="bg-vnl-panel border border-white/20 p-6 w-full max-w-md shadow-2xl">
                  <h3 className="text-xl font-black text-white uppercase italic tracking-tighter mb-4">{isEditingRules ? 'Editar Reglas' : 'Configurar Partido'}</h3>
                  <div className="space-y-4">
                      <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Sets Máximos</label>
                          <div className="flex gap-2 bg-black/40 p-1 rounded border border-white/10">
                              {[1, 3, 5].map(n => (
                                  <button key={n} onClick={() => setMatchConfig({...matchConfig, maxSets: n})} className={`flex-1 py-2 text-xs font-bold uppercase rounded transition ${matchConfig.maxSets === n ? 'bg-vnl-accent text-black shadow' : 'text-slate-400 hover:text-white'}`}>{n} Sets</button>
                              ))}
                          </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Puntos por Set</label>
                              <input type="number" value={matchConfig.pointsPerSet} onChange={e => setMatchConfig({...matchConfig, pointsPerSet: parseInt(e.target.value)})} className="w-full p-2 bg-black/40 border border-white/10 text-white font-bold text-center" />
                          </div>
                          <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Tie Break</label>
                              <input type="number" value={matchConfig.tieBreakPoints} onChange={e => setMatchConfig({...matchConfig, tieBreakPoints: parseInt(e.target.value)})} className="w-full p-2 bg-black/40 border border-white/10 text-white font-bold text-center" />
                          </div>
                      </div>
                      <button onClick={handleSaveConfig} className="w-full bg-green-600 hover:bg-green-500 text-white font-black py-3 uppercase tracking-widest text-sm shadow-lg transition mt-2">
                          {isEditingRules ? 'Guardar Cambios' : 'CONFIRMAR INICIO'}
                      </button>
                      <button onClick={() => setShowMatchConfigModal(null)} className="w-full text-slate-500 text-xs font-bold uppercase tracking-widest hover:text-white transition">Cancelar</button>
                  </div>
              </div>
          </div>
      )}

      {/* Substitution Modal */}
      {showSubModal && liveMatch && activeTournament && (
          <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
              <div className="bg-vnl-panel border border-white/20 p-6 w-full max-w-sm shadow-2xl">
                  <h3 className="text-lg font-black text-white uppercase italic tracking-tighter mb-4 text-center">Realizar Cambio</h3>
                  <div className="flex items-center justify-center gap-4 mb-6">
                       <div className="text-center">
                           <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Sale (#)</label>
                           <input 
                             type="number" 
                             value={subPlayerOutNum} 
                             onChange={e => setSubPlayerOutNum(e.target.value)} 
                             className="w-16 h-16 bg-red-900/20 border border-red-500/50 text-white font-black text-2xl text-center rounded focus:outline-none focus:border-red-500"
                             placeholder="OUT"
                           />
                       </div>
                       <span className="text-2xl text-slate-500">→</span>
                       <div className="text-center">
                           <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Entra (#)</label>
                           <input 
                             type="number" 
                             value={subPlayerInNum} 
                             onChange={e => setSubPlayerInNum(e.target.value)} 
                             className="w-16 h-16 bg-green-900/20 border border-green-500/50 text-white font-black text-2xl text-center rounded focus:outline-none focus:border-green-500"
                             placeholder="IN"
                           />
                       </div>
                  </div>
                  <div className="flex gap-2">
                      <button onClick={() => setShowSubModal(null)} className="flex-1 bg-white/10 hover:bg-white/20 text-white py-3 rounded text-xs font-bold uppercase">Cancelar</button>
                      <button onClick={handleConfirmSub} className="flex-1 bg-vnl-accent hover:bg-cyan-400 text-black py-3 rounded text-xs font-black uppercase shadow-[0_0_15px_rgba(6,182,212,0.3)]">Confirmar</button>
                  </div>
              </div>
          </div>
      )}
      
      {/* Rotation Editor Modal */}
      {showRotationModal && liveMatch && (
          <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4 backdrop-blur-sm">
              <div className="bg-vnl-panel border border-white/20 p-6 w-full max-w-md shadow-2xl">
                   <h3 className="text-lg font-black text-white uppercase italic tracking-tighter mb-4 text-center">Editar Rotación (P1 - P6)</h3>
                   <div className="grid grid-cols-3 gap-2 mb-6">
                       {[0, 1, 2, 3, 4, 5].map(i => (
                           <div key={i} className="text-center">
                               <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Pos {i+1}</label>
                               <input 
                                 type="number"
                                 value={rotationInput[i] || ''}
                                 onChange={e => {
                                     const newRot = [...rotationInput];
                                     newRot[i] = e.target.value;
                                     setRotationInput(newRot);
                                 }}
                                 className="w-full p-2 bg-black/40 border border-white/10 text-white font-bold text-center focus:border-vnl-accent outline-none"
                               />
                           </div>
                       ))}
                   </div>
                   <div className="flex gap-2">
                      <button onClick={() => setShowRotationModal(null)} className="flex-1 bg-white/10 hover:bg-white/20 text-white py-3 rounded text-xs font-bold uppercase">Cancelar</button>
                      <button onClick={handleUpdateRotation} className="flex-1 bg-vnl-accent hover:bg-cyan-400 text-black py-3 rounded text-xs font-black uppercase shadow-[0_0_15px_rgba(6,182,212,0.3)]">Actualizar</button>
                   </div>
              </div>
          </div>
      )}

      {/* Player Profile Editor */}
      {editingPlayer && currentUser && (
          <ProfileEditor 
            player={editingPlayer} 
            currentUser={currentUser}
            onClose={() => setEditingPlayer(null)}
            onSave={(updated) => {
                // Determine which team this player belongs to
                // We must update registeredTeams state
                const newTeams = registeredTeams.map(t => {
                    const pIndex = t.players.findIndex(p => p.id === updated.id);
                    if (pIndex !== -1) {
                        const newPlayers = [...t.players];
                        newPlayers[pIndex] = updated;
                        return { ...t, players: newPlayers };
                    }
                    return t;
                });
                updateTeams(newTeams);
                setEditingPlayer(null);
            }}
          />
      )}

    </Layout>
  );
};

export default App;

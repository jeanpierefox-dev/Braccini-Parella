
import React, { useState, useEffect, useRef } from 'react';
import { Layout } from './components/Layout';
import { Court } from './components/Court';
import { ScoreControl } from './components/ScoreControl';
import { Login } from './components/Login';
import { TVOverlay } from './components/TVOverlay';
import { UserManagement } from './components/UserManagement';
import { ProfileEditor } from './components/ProfileEditor';
import { SetStatsModal } from './components/SetStatsModal';
import { CloudConfig } from './components/CloudConfig';
import { StandingsTable } from './components/StandingsTable'; 
import { TopPlayers } from './components/TopPlayers'; 
import { 
  Tournament, Team, MatchFixture, LiveMatchState, 
  Player, PlayerRole, MatchSet, RequestItem, User, PointLog, MatchConfig
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
  const [editingTourneyName, setEditingTourneyName] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [sharingFixture, setSharingFixture] = useState<MatchFixture | null>(null); 
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

  const handleUpdateFixtureDate = (fixId: string, newDate: string) => {
      if(!activeTournament) return;
      const updatedFixtures = activeTournament.fixtures?.map(f => f.id === fixId ? {...f, date: newDate} : f);
      updateActiveTournament({ fixtures: updatedFixtures });
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

  const handleUpdatePlayerInTeam = (updatedPlayer: Player) => {
      const updatedTeams = registeredTeams.map(t => ({
          ...t,
          players: t.players?.map(p => p.id === updatedPlayer.id ? updatedPlayer : p)
      }));
      updateTeams(updatedTeams);
      setEditingPlayer(null);
  };
  
  const handleUpdateTeam = (updatedTeam: Team) => {
      const updatedTeams = registeredTeams.map(t => t.id === updatedTeam.id ? updatedTeam : t);
      updateTeams(updatedTeams);
      setEditingTeam(null);
  }

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

  const initiateSubRequest = (teamId: string) => { setSubPlayerInNum(''); setSubPlayerOutNum(''); setShowSubModal({ teamId }); };
  
  const confirmSub = () => {
    if (!liveMatch || !showSubModal || !subPlayerOutNum || !subPlayerInNum || !activeTournament) return;
    const team = activeTournament.teams?.find(t => t.id === showSubModal.teamId);
    if (!team) return;
    const pOut = team.players.find(p => p.number === parseInt(subPlayerOutNum));
    const pIn = team.players.find(p => p.number === parseInt(subPlayerInNum));
    if (!pOut || !pIn) { alert("Jugadores no encontrados."); return; }
    
    if (currentUser?.role === 'ADMIN') { applySubstitution(showSubModal.teamId, pOut.id, pIn.id); setShowSubModal(null); return; }
    
    const newReq: RequestItem = { id: Date.now().toString(), teamId: showSubModal.teamId, type: 'substitution', status: 'pending', subDetails: { playerOutId: pOut.id, playerInId: pIn.id } };
    updateLiveMatch(prev => prev ? { ...prev, requests: [...prev.requests, newReq] } : null);
    setShowSubModal(null);
  };

  const applySubstitution = (teamId: string, pOutId: string, pInId: string) => {
      updateLiveMatch(prev => {
          if (!prev) return null;
          const fixture = activeTournament?.fixtures?.find(f => f.id === prev.matchId);
          const isTeamA = teamId === fixture?.teamAId;
          
          let rotation = isTeamA ? [...prev.rotationA] : [...prev.rotationB];
          let bench = isTeamA ? [...prev.benchA] : [...prev.benchB];
          
          const outIndex = rotation.findIndex(p => p.id === pOutId);
          const inIndex = bench.findIndex(p => p.id === pInId);
          
          const fullTeam = activeTournament?.teams?.find(t => t.id === teamId);
          const playerIn = inIndex !== -1 ? bench[inIndex] : fullTeam?.players.find(p => p.id === pInId);
          const playerOut = rotation[outIndex];

          if (outIndex === -1 || !playerIn) return prev; 
          
          rotation[outIndex] = playerIn;
          
          if (inIndex !== -1) {
              bench[inIndex] = playerOut; 
          } else {
              bench.push(playerOut);
          }

          return { 
              ...prev, 
              rotationA: isTeamA ? rotation : prev.rotationA, 
              rotationB: !isTeamA ? rotation : prev.rotationB, 
              benchA: isTeamA ? bench : prev.benchA, 
              benchB: !isTeamA ? bench : prev.benchB, 
              substitutionsA: isTeamA ? prev.substitutionsA + 1 : prev.substitutionsA, 
              substitutionsB: !isTeamA ? prev.substitutionsB + 1 : prev.substitutionsB 
          };
      });
  };

  const processRequest = (reqId: string, action: 'approve' | 'reject') => {
      updateLiveMatch(prev => {
          if (!prev) return null;
          const req = prev.requests.find(r => r.id === reqId);
          if (!req) return prev;
          if (action === 'approve') {
             if (req.type === 'timeout') {
                 const fixture = activeTournament?.fixtures?.find(f => f.id === prev.matchId);
                 const isTeamA = req.teamId === fixture?.teamAId;
                 return { ...prev, timeoutsA: isTeamA ? prev.timeoutsA + 1 : prev.timeoutsA, timeoutsB: !isTeamA ? prev.timeoutsB + 1 : prev.timeoutsB, requests: prev.requests.filter(r => r.id !== reqId) };
             } else if (req.type === 'substitution' && req.subDetails) { applySubstitution(req.teamId, req.subDetails.playerOutId, req.subDetails.playerInId); }
          }
          return { ...prev, requests: prev.requests.filter(r => r.id !== reqId) };
      });
  };

  const handleModifyRotation = (teamId: string) => {
      if(!liveMatch || !activeTournament) return;
      const fixture = activeTournament.fixtures?.find(f => f.id === liveMatch.matchId);
      const isTeamA = fixture?.teamAId === teamId;
      const rotation = isTeamA ? liveMatch.rotationA : liveMatch.rotationB;
      setRotationInput(rotation.map(p => p.number.toString()));
      setShowRotationModal({ teamId });
  };

  const confirmRotation = () => {
      if(!liveMatch || !showRotationModal || !activeTournament) return;
      const team = activeTournament.teams?.find(t => t.id === showRotationModal.teamId);
      if (!team) return;
      const newRotation: Player[] = [];
      const newBench: Player[] = [];
      rotationInput.forEach(numStr => {
          const num = parseInt(numStr);
          const player = team.players.find(p => p.number === num);
          if (player) newRotation.push(player); else newRotation.push(createEmptyPlayer(`${team.id}-temp-${num}`, num));
      });
      if (newRotation.length !== 6) { alert("Debes ingresar 6 números."); return; }
      team.players.forEach(p => { if (!newRotation.find(nr => nr.id === p.id)) newBench.push(p); });
      updateLiveMatch(prev => {
          if (!prev) return null;
          const fixture = activeTournament.fixtures?.find(f => f.id === prev.matchId);
          const isTeamA = fixture?.teamAId === showRotationModal.teamId;
          return { ...prev, rotationA: isTeamA ? newRotation : prev.rotationA, rotationB: !isTeamA ? newRotation : prev.rotationB, benchA: isTeamA ? newBench : prev.benchA, benchB: !isTeamA ? newBench : prev.benchB };
      });
      setShowRotationModal(null);
  };

  const getMatchStats = () => {
    if (!liveMatch || !activeTournament) return [];
    const allHistory = liveMatch.sets?.flatMap(s => s.history || []) || [];
    const statsMap: Record<string, {name: string, team: string, points: number, aces: number, blocks: number}> = {};
    allHistory.forEach(h => {
        if (h.playerId) {
            if (!statsMap[h.playerId]) {
                 let player: Player | undefined; let teamName = "Unknown";
                 activeTournament.teams?.forEach(t => { const f = t.players.find(p => p.id === h.playerId); if(f) { player = f; teamName = t.name; } });
                 if (player) statsMap[h.playerId] = { name: player.name, team: teamName, points: 0, aces: 0, blocks: 0 };
            }
            if (statsMap[h.playerId]) {
                if (h.type === 'attack') statsMap[h.playerId].points++;
                if (h.type === 'ace') { statsMap[h.playerId].points++; statsMap[h.playerId].aces++; }
                if (h.type === 'block') { statsMap[h.playerId].points++; statsMap[h.playerId].blocks++; }
            }
        }
    });
    return Object.values(statsMap).sort((a,b) => b.points - a.points);
  };

  // ... (MenuButton, Icons, Logout, etc.)
  const MenuButton = ({ title, icon, onClick, subtext }: { title: string, icon: React.ReactNode, onClick: () => void, subtext: string }) => (
      <button 
        onClick={onClick}
        className="relative group overflow-hidden bg-corp-panel border border-white/5 rounded-2xl p-6 hover:border-corp-accent/50 transition-all duration-300 hover:shadow-lg hover:shadow-corp-accent/10 flex flex-col items-start text-left h-full"
      >
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity transform group-hover:scale-110 duration-500 text-5xl grayscale">
              {icon}
          </div>
          <div className="mb-4 p-3 bg-corp-bg rounded-lg text-corp-accent group-hover:bg-corp-accent group-hover:text-white transition-colors">
              {icon}
          </div>
          <h3 className="text-lg font-bold text-white mb-1">{title}</h3>
          <p className="text-xs text-slate-400 font-medium">{subtext}</p>
      </button>
  );

  const HomeIcons = {
      Trophy: <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>,
      Users: <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
      Play: <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>,
      Settings: <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43.25a2 2 0 0 1-1 1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>,
      Chart: <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" x2="18" y1="20" y2="10"/><line x1="12" x2="12" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="14"/></svg>
  };

  const handleLogout = () => {
    setLiveMatch(null);
    setCurrentUser(null);
    setTvMode(false);
  };

  // --- VIEWER & REFEREE PRE-RENDER LOGIC ---
  let fixture: MatchFixture | undefined;
  let teamA: Team | undefined;
  let teamB: Team | undefined;

  if (activeTournament && liveMatch) {
      fixture = activeTournament.fixtures?.find(f => f.id === liveMatch.matchId);
      if (fixture) {
          teamA = activeTournament.teams?.find(t => t.id === fixture?.teamAId);
          teamB = activeTournament.teams?.find(t => t.id === fixture?.teamBId);
      }
  }

  // --- VIEWS ---

  if (!currentUser) {
      return (
          <>
            <Login 
                onLogin={setCurrentUser} 
                users={users} 
                isCloudConnected={isCloudConnected} 
                onOpenCloudConfig={() => setShowCloudConfig(true)}
            />
            {showCloudConfig && <CloudConfig onClose={() => setShowCloudConfig(false)} onConnected={() => setIsCloudConnected(true)} currentUser={currentUser} />}
          </>
      );
  }

  if (tvMode && liveMatch && activeTournament && teamA && teamB) {
      return <TVOverlay 
                match={liveMatch} 
                teamA={teamA} 
                teamB={teamB} 
                tournament={activeTournament} 
                currentUser={currentUser} 
                onExit={() => { setTvMode(false); setCurrentView('fixture'); }} 
                onLogout={handleLogout}
                onNextSet={handleStartNextSet} 
                nextSetCountdown={nextSetCountdown} 
                tournamentStats={getMatchStats()} 
                showStatsOverlay={showStatsOnTV} 
                showScoreboard={showScoreboardOnTV} 
                isCloudConnected={isCloudConnected} 
              />;
  }

  return (
    <Layout 
        currentUser={currentUser} 
        onLogout={handleLogout} 
        onNavigate={setCurrentView} 
        currentView={currentView} 
        isCloudConnected={isCloudConnected} 
        onOpenCloudConfig={() => setShowCloudConfig(true)}
    >
      {showCloudConfig && <CloudConfig onClose={() => setShowCloudConfig(false)} onConnected={() => setIsCloudConnected(true)} currentUser={currentUser} />}

      {/* ... (Home, Lobby, Dashboard, Stats, Teams, Users views remain unchanged) ... */}
      {currentView === 'home' && (
          <div className="max-w-4xl mx-auto py-8 animate-in fade-in slide-in-from-bottom-4">
              <div className="mb-8">
                  <h1 className="text-3xl font-bold text-white mb-2">Hola, {currentUser.username}</h1>
                  <p className="text-slate-400 text-sm">Bienvenido al panel de control.</p>
              </div>

              {activeTournament && (
                  <div className="mb-8 bg-gradient-to-r from-blue-900 to-corp-panel rounded-2xl p-6 border border-white/5 relative overflow-hidden shadow-2xl">
                      <div className="relative z-10">
                          <span className="text-xs font-bold text-blue-300 uppercase tracking-widest bg-blue-900/50 px-2 py-1 rounded">Torneo Activo</span>
                          <h2 className="text-2xl font-bold text-white mt-2 mb-4">{activeTournament.name}</h2>
                          <div className="flex gap-3">
                              <button onClick={() => setCurrentView('dashboard')} className="bg-white text-blue-900 px-5 py-2 rounded-lg font-bold text-sm hover:bg-blue-50 transition">Ver Dashboard</button>
                              {liveMatch && liveMatch.matchId && activeTournament.fixtures?.find(f => f.id === liveMatch.matchId) && (
                                 <button onClick={() => setCurrentView('match')} className="bg-red-500 text-white px-5 py-2 rounded-lg font-bold text-sm hover:bg-red-600 transition animate-pulse">🔴 Ir al Partido</button>
                              )}
                          </div>
                      </div>
                  </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <MenuButton title="Torneos" icon={HomeIcons.Trophy} subtext="Gestionar campeonatos y fixtures" onClick={() => setCurrentView('lobby')} />
                  {(currentUser.role === 'ADMIN' || currentUser.role.includes('COACH')) && <MenuButton title="Equipos" icon={HomeIcons.Users} subtext="Administrar planteles y jugadores" onClick={() => setCurrentView('teams')} />}
                  {activeTournament && <MenuButton title="Fixture" icon={HomeIcons.Play} subtext="Calendario de partidos" onClick={() => setCurrentView('fixture')} />}
                  {activeTournament && <MenuButton title="Estadísticas" icon={HomeIcons.Chart} subtext="Tablas y Mejores Jugadores" onClick={() => setCurrentView('stats')} />}
                  {(currentUser.role === 'ADMIN' || currentUser.role.includes('COACH')) && <MenuButton title={currentUser.role === 'ADMIN' ? "Admin" : "Usuarios"} icon={HomeIcons.Settings} subtext="Gestión de usuarios y accesos" onClick={() => setCurrentView('users')} />}
              </div>
          </div>
      )}

      {currentView === 'lobby' && (
         <div className="max-w-5xl mx-auto space-y-8">
            <div className="flex justify-between items-center pb-4 border-b border-white/5">
                <div>
                    <h1 className="text-2xl font-bold text-white tracking-tight">Mis Torneos</h1>
                    <p className="text-slate-400 text-sm mt-1">Selecciona una competencia para gestionar</p>
                </div>
                {(currentUser.role === 'ADMIN') && (
                    <button onClick={() => setShowCreateTourneyModal(true)} className="bg-corp-accent hover:bg-corp-accent-hover text-white px-5 py-2.5 rounded-lg font-bold text-sm shadow-lg transition">+ Nuevo Torneo</button>
                )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
               {tournaments.map(t => (
                   <div key={t.id} onClick={() => { setActiveTournamentId(t.id); setCurrentView('dashboard'); }} className="group relative bg-corp-panel border border-white/5 rounded-xl overflow-hidden cursor-pointer hover:border-corp-accent/50 hover:shadow-xl hover:shadow-corp-accent/10 transition-all duration-300">
                      <div className="h-32 bg-gradient-to-br from-slate-800 to-black flex items-center justify-center p-6 relative">
                          {t.logoUrl ? <img src={t.logoUrl} className="h-full object-contain filter drop-shadow-2xl" /> : <div className="text-5xl text-white/10">🏆</div>}
                      </div>
                      <div className="p-5">
                          <h3 className="font-bold text-lg text-white mb-2 group-hover:text-corp-accent transition-colors">{t.name}</h3>
                          <div className="flex justify-between items-center text-sm text-slate-400">
                              <span>{t.teams?.length || 0} Equipos</span>
                              <span className="bg-green-500/10 text-green-400 text-[10px] font-bold px-2 py-0.5 rounded uppercase">Activo</span>
                          </div>
                      </div>
                   </div>
               ))}
               {tournaments.length === 0 && (
                   <div className="col-span-full text-center py-16 bg-corp-panel/50 border border-dashed border-slate-700 rounded-xl">
                       <p className="text-slate-500 font-medium">No hay torneos disponibles</p>
                   </div>
               )}
            </div>
         </div>
      )}

      {currentView === 'dashboard' && activeTournament && (
         <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2">
             <div className="bg-corp-panel border border-white/5 p-8 rounded-2xl shadow-xl relative overflow-hidden">
                <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
                    {activeTournament.logoUrl ? <img src={activeTournament.logoUrl} alt="Logo" className="h-32 w-32 object-contain drop-shadow-md bg-white/5 rounded-xl p-2" /> : <div className="h-32 w-32 bg-white/5 rounded-xl flex items-center justify-center border border-white/10 text-4xl">🏐</div>}
                    <div className="text-center md:text-left flex-1">
                        <h2 className="text-4xl font-bold text-white tracking-tight mb-2">{activeTournament.name}</h2>
                        <div className="flex flex-wrap justify-center md:justify-start gap-3 mt-4">
                             <button onClick={() => setCurrentView('fixture')} className="bg-corp-accent hover:bg-corp-accent-hover text-white px-6 py-2.5 rounded-lg font-bold shadow-lg shadow-blue-500/20 transition-all transform hover:-translate-y-0.5">Ver Fixture</button>
                             <button onClick={() => setCurrentView('stats')} className="bg-white/10 hover:bg-white/20 text-white px-6 py-2.5 rounded-lg font-bold transition">Estadísticas</button>
                             {currentUser.role === 'ADMIN' && <button onClick={handleDeleteTournament} className="text-red-400 hover:text-red-300 text-sm font-bold uppercase tracking-widest px-4 py-2">Eliminar Torneo</button>}
                        </div>
                    </div>
                </div>
             </div>
         </div>
      )}

      {currentView === 'stats' && activeTournament && (
         <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 max-w-6xl mx-auto">
             <div>
                <h2 className="text-2xl font-bold text-white tracking-tight mb-2">Estadísticas del Torneo</h2>
                <p className="text-slate-400 text-sm">Tabla de posiciones y rendimiento de jugadores.</p>
             </div>

             <div>
                <h3 className="text-lg font-bold text-vnl-accent uppercase tracking-widest mb-4 border-b border-white/10 pb-2">Tabla de Posiciones</h3>
                <StandingsTable tournament={activeTournament} />
             </div>

             <div>
                <h3 className="text-lg font-bold text-vnl-accent uppercase tracking-widest mb-4 border-b border-white/10 pb-2">Mejores Jugadores</h3>
                <TopPlayers tournament={activeTournament} />
             </div>
         </div>
      )}

      {currentView === 'teams' && (
        <div className="space-y-6">
           <div className="flex justify-between items-end border-b border-white/5 pb-3">
              <h2 className="text-2xl font-bold text-white tracking-tight">Equipos <span className="text-slate-500 text-lg font-medium ml-2">{registeredTeams.length}</span></h2>
           </div>
           {(currentUser.role === 'ADMIN') && (
               <div className="bg-corp-panel/50 p-6 border border-white/5 rounded-xl mb-8">
                   <h3 className="font-bold text-sm text-corp-accent uppercase tracking-widest mb-4">Registro Rápido</h3>
                   <form onSubmit={handleAddTeam} className="flex flex-col md:flex-row gap-4 items-end">
                       <input type="text" placeholder="Nombre del Equipo" className="flex-1 bg-black/20 border border-white/10 rounded-lg p-3 text-white text-sm focus:border-corp-accent outline-none" value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)} />
                       <input type="text" placeholder="Entrenador" className="flex-1 bg-black/20 border border-white/10 rounded-lg p-3 text-white text-sm focus:border-corp-accent outline-none" value={newTeamCoach} onChange={(e) => setNewTeamCoach(e.target.value)} />
                       <div className="w-full md:w-auto relative">
                           <input type="file" accept="image/*" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={(e) => handleFileUpload(e, setNewTeamLogo)} />
                           <button type="button" className="bg-white/5 border border-white/10 text-slate-300 px-4 py-3 rounded-lg font-bold text-xs w-full hover:bg-white/10">Subir Logo</button>
                       </div>
                       <button type="submit" className="bg-corp-accent text-white px-6 py-3 rounded-lg font-bold hover:bg-corp-accent-hover transition">Añadir</button>
                   </form>
               </div>
           )}
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
               {registeredTeams.map(team => (
                   <div key={team.id} className="bg-corp-panel border border-white/5 rounded-xl hover:border-corp-accent/30 transition group overflow-hidden relative">
                       {/* Team card content ... */}
                       <div className="p-4 flex items-center justify-between bg-black/20">
                           <div className="flex items-center gap-3">
                               <div className="w-12 h-12 bg-white rounded-lg p-1 flex items-center justify-center shadow-lg overflow-hidden">
                                   {team.logoUrl ? <img src={team.logoUrl} className="object-contain w-full h-full" /> : <span className="text-black font-bold text-xl">{team.name[0]}</span>}
                               </div>
                               <div>
                                   <h3 className="font-bold text-white text-lg leading-tight">{team.name}</h3>
                                   <p className="text-xs text-slate-400 font-medium mt-0.5">DT: {team.coachName}</p>
                               </div>
                           </div>
                           {(currentUser.role === 'ADMIN') && (
                               <div className="flex gap-2">
                                   <button onClick={() => setEditingTeam(team)} className="text-xs text-corp-accent hover:text-white font-bold uppercase">Editar</button>
                                   <button onClick={() => handleDeleteTeam(team.id)} className="text-xs text-red-500 hover:text-red-400 font-bold uppercase">Eliminar</button>
                               </div>
                           )}
                       </div>
                       <div className="p-4 grid grid-cols-2 gap-2">
                           {team.players?.slice(0, 14).map(p => (
                               <div key={p.id} onClick={() => setEditingPlayer(p)} className="flex items-center gap-2 p-1.5 hover:bg-white/5 rounded cursor-pointer transition">
                                   <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${p.name === 'Libero' ? 'bg-yellow-500 text-black' : 'bg-slate-700 text-white'}`}>{p.number}</div>
                                   <div className="truncate text-xs font-medium text-slate-300">{p.name}</div>
                               </div>
                           ))}
                       </div>
                   </div>
               ))}
           </div>
        </div>
      )}

      {currentView === 'users' && (isAdmin || currentUser.role.includes('COACH')) && (
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

      {currentView === 'fixture' && activeTournament && (
          <div className="space-y-6">
              <h2 className="text-2xl font-bold text-white tracking-tight mb-8">Calendario y Resultados</h2>
              <div className="space-y-4">
                  {[...(activeTournament.fixtures || [])].sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime()).map((fixture) => {
                      const teamA = activeTournament.teams?.find(t => t.id === fixture.teamAId);
                      const teamB = activeTournament.teams?.find(t => t.id === fixture.teamBId);
                      if (!teamA || !teamB) return null;
                      const isLive = fixture.status === 'live';
                      
                      return (
                          <div key={fixture.id} className={`flex flex-col md:flex-row bg-corp-panel border ${isLive ? 'border-red-500/50 shadow-lg shadow-red-500/10' : 'border-white/5 hover:border-white/20'} rounded-xl transition overflow-hidden group`}>
                              <div className={`md:w-32 flex flex-col items-center justify-center p-4 border-b md:border-b-0 md:border-r border-white/5 ${isLive ? 'bg-red-900/10' : 'bg-black/10'}`}>
                                  <span className="text-xs font-bold text-slate-400 uppercase">{fixture.group}</span>
                                  {currentUser.role === 'ADMIN' ? (
                                      <input type="date" value={fixture.date} onChange={(e) => handleUpdateFixtureDate(fixture.id, e.target.value)} className="bg-transparent text-white font-bold text-xs mt-1 text-center outline-none" />
                                  ) : <span className="text-white font-bold text-sm mt-1">{fixture.date}</span>}
                                  {isLive && <span className="mt-2 bg-red-600 text-white text-[10px] px-2 py-0.5 font-bold uppercase rounded-full animate-pulse">LIVE</span>}
                              </div>

                              <div className="flex-1 flex items-center justify-between p-4 md:px-8 relative">
                                  <div className="flex items-center gap-4 flex-1 justify-end">
                                      <span className="text-lg md:text-xl font-bold text-white text-right">{teamA.name}</span>
                                      {teamA.logoUrl && <img src={teamA.logoUrl} className="w-10 h-10 object-contain bg-white rounded-full p-1" />}
                                  </div>
                                  <div className="px-6 flex flex-col items-center">
                                      {fixture.status === 'finished' ? (
                                          <div className="bg-white/5 px-4 py-2 rounded-lg border border-white/10">
                                              <span className="text-2xl font-bold text-yellow-400 tracking-wider">{fixture.resultString}</span>
                                          </div>
                                      ) : <span className="text-sm font-bold text-slate-500 uppercase">VS</span>}
                                  </div>
                                  <div className="flex items-center gap-4 flex-1">
                                      {teamB.logoUrl && <img src={teamB.logoUrl} className="w-10 h-10 object-contain bg-white rounded-full p-1" />}
                                      <span className="text-lg md:text-xl font-bold text-white">{teamB.name}</span>
                                  </div>
                              </div>

                              <div className="md:w-40 flex items-center justify-center p-4 bg-black/10 border-t md:border-t-0 md:border-l border-white/5 gap-2">
                                  {isLive ? (
                                      <button onClick={() => handleInitiateMatch(fixture.id, 'control')} className="bg-red-600 hover:bg-red-500 text-white px-6 py-2 rounded-full font-bold text-xs shadow-lg transition transform hover:scale-105">
                                          {currentUser.role === 'REFEREE' ? 'Ver Cancha' : 'Ver Ahora'}
                                      </button>
                                  ) : fixture.status === 'finished' ? (
                                      <div className="flex flex-col items-center gap-1">
                                          <span className="text-xs text-slate-500 font-bold uppercase tracking-widest">Finalizado</span>
                                          {currentUser.role === 'ADMIN' && (
                                              <button onClick={() => handleResetMatch(fixture.id)} className="text-[10px] text-red-400 hover:text-white uppercase font-bold underline">Reiniciar</button>
                                          )}
                                      </div>
                                  ) : (
                                      <>
                                          <button onClick={() => handleInitiateMatch(fixture.id, 'control')} className="border border-white/20 hover:bg-white/5 text-white px-4 py-2 rounded-full font-bold text-xs transition">
                                              {currentUser.role === 'ADMIN' ? 'Controlar' : currentUser.role === 'REFEREE' ? 'Ingresar' : 'Entrar'}
                                          </button>
                                          {currentUser.role === 'ADMIN' && (
                                              <button 
                                                onClick={() => handleInitiateMatch(fixture.id, 'preview')} 
                                                className="bg-white/10 hover:bg-white/20 text-white p-2 rounded-full transition"
                                                title="Transmitir Previa"
                                              >
                                                  🎥
                                              </button>
                                          )}
                                      </>
                                  )}
                              </div>
                          </div>
                      );
                  })}
              </div>
          </div>
      )}

      {/* --- MATCH VIEW --- */}
      {currentView === 'match' && liveMatch && activeTournament && fixture && teamA && teamB && (
        <div className="max-w-7xl mx-auto pb-20">
            {/* Header */}
            <div className="flex justify-between items-center mb-6 bg-corp-panel/80 border border-white/10 p-4 shadow-lg rounded-xl sticky top-20 z-40 backdrop-blur-md">
                <div className="flex items-center gap-4">
                    {liveMatch.status === 'finished' ? (
                        <span className="bg-slate-700 text-white text-xs font-bold px-3 py-1 rounded-full uppercase">FINALIZADO</span>
                    ) : liveMatch.status === 'finished_set' ? (
                        <span className="bg-yellow-500 text-black text-xs font-bold px-3 py-1 rounded-full uppercase animate-pulse">FIN SET {liveMatch.currentSet}</span>
                    ) : (
                        <span className="bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-full uppercase animate-pulse">LIVE</span>
                    )}
                    <span className="text-slate-300 font-bold uppercase text-sm tracking-wider">Set <span className="text-white text-lg">{liveMatch.currentSet}</span></span>
                    
                    {liveMatch.status === 'warmup' && currentUser?.role === 'ADMIN' && (
                       <button 
                         onClick={handleStartGame}
                         className="ml-4 bg-green-600 hover:bg-green-500 text-white px-4 py-1 rounded shadow-lg animate-bounce font-bold text-xs uppercase"
                       >
                         ▶ Iniciar Partido
                       </button>
                    )}
                </div>
                
                <div className="flex gap-2">
                   {(currentUser?.role === 'ADMIN') && (
                       <>
                           <button onClick={openEditRules} className="bg-white/10 text-slate-300 px-3 py-1.5 rounded-lg font-bold text-xs uppercase hover:bg-white/20 hover:text-white transition flex items-center gap-1">
                               <span>⚙️</span> Reglas
                           </button>
                           <button onClick={handleEndBroadcast} className="bg-red-600 hover:bg-red-500 text-white border border-red-500/30 px-4 py-1.5 rounded-lg font-bold text-xs uppercase transition shadow-lg shadow-red-900/20 flex items-center gap-2">
                               <span>🏁</span> {liveMatch.status === 'finished' ? 'Confirmar y Salir' : 'Finalizar Partido'}
                           </button>
                           <button onClick={() => setShowScoreboardOnTV(!showScoreboardOnTV)} className="bg-white/10 text-white px-3 py-1.5 rounded-lg font-bold text-xs uppercase hover:bg-white/20 transition">Score</button>
                           <button onClick={() => setShowStatsOnTV(!showStatsOnTV)} className="bg-white/10 text-white px-3 py-1.5 rounded-lg font-bold text-xs uppercase hover:bg-white/20 transition">Stats</button>
                       </>
                   )}
                   {(currentUser.role === 'ADMIN' || currentUser.role === 'VIEWER') && (
                        <button onClick={() => setTvMode(true)} className="bg-corp-accent text-white px-4 py-1.5 rounded-lg font-bold text-xs uppercase hover:bg-corp-accent-hover transition">TV Mode</button>
                   )}
                   <button onClick={() => setCurrentView('fixture')} className="border border-white/20 text-slate-400 px-4 py-1.5 rounded-lg font-bold text-xs uppercase hover:text-white transition">Exit</button>
                </div>
            </div>

            {/* Set Management Panel - Admin Only */}
            {currentUser?.role === 'ADMIN' && (
                <div className="mb-6 bg-black/40 border border-white/10 p-4 rounded-xl">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Gestión de Sets</h3>
                    <div className="grid grid-cols-5 gap-2">
                        {Array.from({ length: liveMatch.config.maxSets }).map((_, i) => {
                            const setNumber = i + 1;
                            const setData = liveMatch.sets[i];
                            const isCurrent = liveMatch.currentSet === setNumber;
                            const isFinished = (setData && (setData.scoreA > 0 || setData.scoreB > 0) && (liveMatch.currentSet > setNumber || liveMatch.status === 'finished'));
                            const isPending = !setData || (liveMatch.currentSet < setNumber && !isFinished);
                            
                            return (
                                <div key={i} className={`flex flex-col items-center justify-between p-2 rounded border transition ${isCurrent ? 'bg-white/10 border-corp-accent' : 'bg-transparent border-white/5'} ${isFinished ? 'opacity-75' : ''}`}>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase">Set {setNumber}</span>
                                    <span className="text-lg font-mono font-bold text-white my-1">{setData ? `${setData.scoreA}-${setData.scoreB}` : '0-0'}</span>
                                    
                                    {/* Unified Action Button for Current Set */}
                                    {isCurrent && (liveMatch.status === 'playing' || liveMatch.status === 'finished_set') && (
                                        <button 
                                            onClick={() => {
                                                if (liveMatch.status === 'finished_set') {
                                                    handleStartNextSet();
                                                } else {
                                                    if(confirm("¿Forzar fin de set?")) {
                                                        handleSetOperation('FINISH', i);
                                                    }
                                                }
                                            }} 
                                            className={`text-[9px] px-2 py-1 rounded w-full uppercase font-bold shadow-sm transition-all ${
                                                liveMatch.status === 'finished_set' 
                                                ? 'bg-green-600 hover:bg-green-500 text-white animate-pulse border border-green-400' 
                                                : 'bg-blue-600 hover:bg-blue-500 text-white'
                                            }`}
                                        >
                                            {liveMatch.status === 'finished_set' ? '>> Siguiente >>' : 'Finalizar'}
                                        </button>
                                    )}

                                    {/* Start Button for Pending Sets */}
                                    {isPending && liveMatch.currentSet === setNumber && liveMatch.status === 'warmup' && (
                                        <button onClick={() => handleSetOperation('START', i)} className="text-[9px] bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded w-full uppercase font-bold">
                                            Iniciar
                                        </button>
                                    )}

                                    {/* Correction Options */}
                                    {(isFinished || (isCurrent && liveMatch.status === 'finished_set')) && (
                                        <div className="flex gap-1 mt-1 w-full">
                                            {/* Renamed "Corregir" to "Editar" and kept it as secondary action */}
                                            {isFinished && (
                                                <button onClick={() => handleSetOperation('REOPEN', i)} className="flex-1 text-[9px] bg-white/10 hover:bg-white/20 text-yellow-400 px-1 py-1 rounded uppercase font-bold">
                                                    Editar
                                                </button>
                                            )}
                                            {/* Button to view Set Stats */}
                                            {setData && (
                                                <button onClick={() => setViewingSetStats({setNum: setNumber, data: setData})} className="flex-1 text-[9px] bg-white/10 hover:bg-white/20 text-blue-400 px-1 py-1 rounded uppercase font-bold">
                                                    Stats
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* REFEREE SPECIFIC VIEW */}
            {currentUser?.role === 'REFEREE' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-10 animate-in fade-in">
                    <div className="col-span-1 md:col-span-2 text-center bg-black/40 p-4 rounded-xl border border-white/10 mb-4">
                        <h2 className="text-2xl font-bold text-white mb-2">Verificación de Rotación</h2>
                        <div className="text-5xl font-mono font-bold text-yellow-400">
                             {liveMatch.scoreA} - {liveMatch.scoreB}
                        </div>
                    </div>

                    <div className="space-y-4">
                         <div className="flex items-center justify-center gap-3 mb-2">
                             {teamA.logoUrl && (
                                 <img src={teamA.logoUrl} className="w-10 h-10 object-contain bg-white rounded-full p-1" />
                             )}
                             <h3 className="text-2xl font-bold text-white text-center uppercase tracking-tighter">{teamA.name}</h3>
                         </div>
                         <Court players={liveMatch.rotationA || []} serving={liveMatch.servingTeamId === teamA.id} teamName={teamA.name} variant="referee" />
                    </div>

                    <div className="space-y-4">
                         <div className="flex items-center justify-center gap-3 mb-2">
                             {teamB.logoUrl && (
                                 <img src={teamB.logoUrl} className="w-10 h-10 object-contain bg-white rounded-full p-1" />
                             )}
                             <h3 className="text-2xl font-bold text-white text-center uppercase tracking-tighter">{teamB.name}</h3>
                         </div>
                         <Court players={liveMatch.rotationB || []} serving={liveMatch.servingTeamId === teamB.id} teamName={teamB.name} variant="referee" />
                    </div>
                </div>
            ) : (
                /* STANDARD VIEW FOR ADMIN/COACH/VIEWER */
                <>
                    {/* ... (Set Finished Interstitial, Winner Banner, Scoreboard - kept same) ... */}
                    {liveMatch.status === 'finished_set' && (
                        <div className="mb-6 p-6 bg-gradient-to-r from-blue-900/90 to-purple-900/90 border border-white/20 rounded-xl text-center animate-in zoom-in shadow-2xl relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-white/50 to-transparent"></div>
                            <h3 className="text-3xl font-black text-white uppercase italic tracking-tighter mb-2">¡SET {liveMatch.currentSet} FINALIZADO!</h3>
                            <div className="text-6xl font-mono font-bold text-yellow-400 drop-shadow-md mb-6">
                                {liveMatch.scoreA} - {liveMatch.scoreB}
                            </div>
                            {(() => {
                                const sets = liveMatch.sets || [];
                                const winsA = sets.filter(s => s.scoreA > s.scoreB).length;
                                const winsB = sets.filter(s => s.scoreB > s.scoreA).length;
                                const isTieBreakNext = liveMatch.currentSet + 1 === liveMatch.config.maxSets;
                                return (
                                    <div className="flex flex-col items-center">
                                        <p className="text-sm font-bold text-slate-300 uppercase tracking-widest mb-4">
                                            Marcador Global: {winsA} - {winsB}
                                            {isTieBreakNext && <span className="block text-red-400 animate-pulse mt-1">⚠️ Empate: Se requiere Set Decisivo</span>}
                                        </p>
                                        {currentUser?.role === 'ADMIN' && (
                                            <div className="flex flex-col items-center gap-2">
                                                <button 
                                                    onClick={handleStartNextSet}
                                                    className={`
                                                        px-10 py-5 rounded-xl font-black text-2xl uppercase tracking-widest shadow-2xl transition transform hover:scale-105 border-b-4 
                                                        ${isTieBreakNext 
                                                            ? 'bg-red-600 hover:bg-red-500 text-white border-red-800 shadow-red-900/50' 
                                                            : 'bg-green-600 hover:bg-green-500 text-white border-green-800 shadow-green-900/50'
                                                        }
                                                    `}
                                                >
                                                    {isTieBreakNext ? '🔥 INICIAR TIE-BREAK 🔥' : `Iniciar Set ${liveMatch.currentSet + 1}`}
                                                </button>
                                                {nextSetCountdown !== null && (
                                                    <div className="text-xs text-slate-400 font-mono mt-2">
                                                        Auto-inicio en {nextSetCountdown}s...
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}
                        </div>
                    )}

                    {liveMatch.status === 'finished' && (
                        <div className="mb-6 p-4 bg-yellow-500/20 border border-yellow-500/50 rounded-lg text-center animate-in zoom-in">
                            <h3 className="text-2xl font-black text-yellow-400 uppercase italic">¡PARTIDO FINALIZADO!</h3>
                            <p className="text-sm text-yellow-200 font-bold">Por favor, presiona "🏁 Confirmar y Salir" para guardar los resultados.</p>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                        <div className="col-span-1 md:col-span-3 bg-gradient-to-b from-slate-900 to-corp-panel rounded-2xl border border-white/5 p-8 text-white shadow-2xl flex justify-between items-center relative overflow-hidden">
                             <div className={`text-center w-1/3 flex flex-col items-center z-10 ${isAdmin && liveMatch.status === 'playing' ? 'cursor-pointer hover:scale-105 transition' : ''}`} onClick={() => isAdmin && liveMatch.status === 'playing' && handlePoint(teamA.id, 'opponent_error')}>
                                 {teamA.logoUrl && (
                                     <img src={teamA.logoUrl} className="w-20 h-20 bg-white rounded-xl p-2 mb-2 object-contain shadow-lg" />
                                 )}
                                 <h2 className="text-2xl font-bold uppercase tracking-tight">{teamA.name}</h2>
                                 <div className="flex gap-1 mt-2">
                                     {liveMatch.sets?.map((s,i) => i < liveMatch.currentSet - 1 && (
                                         <div key={i} className={`w-3 h-3 rounded-full border ${s.scoreA > s.scoreB ? 'bg-yellow-400 border-yellow-400' : 'bg-transparent border-slate-600'}`}></div>
                                     ))}
                                 </div>
                             </div>
                             <div className="text-center w-1/3 z-10">
                                 <div className="text-7xl md:text-9xl font-bold tracking-tighter text-white drop-shadow-2xl">
                                     {liveMatch.scoreA}-{liveMatch.scoreB}
                                 </div>
                             </div>
                             <div className={`text-center w-1/3 flex flex-col items-center z-10 ${isAdmin && liveMatch.status === 'playing' ? 'cursor-pointer hover:scale-105 transition' : ''}`} onClick={() => isAdmin && liveMatch.status === 'playing' && handlePoint(teamB.id, 'opponent_error')}>
                                 {teamB.logoUrl && (
                                     <img src={teamB.logoUrl} className="w-20 h-20 bg-white rounded-xl p-2 mb-2 object-contain shadow-lg" />
                                 )}
                                 <h2 className="text-2xl font-bold uppercase tracking-tight">{teamB.name}</h2>
                                 <div className="flex gap-1 mt-2">
                                     {liveMatch.sets?.map((s,i) => i < liveMatch.currentSet - 1 && (
                                         <div key={i} className={`w-3 h-3 rounded-full border ${s.scoreB > s.scoreA ? 'bg-yellow-400 border-yellow-400' : 'bg-transparent border-slate-600'}`}></div>
                                     ))}
                                 </div>
                             </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <div className="space-y-4">
                             <Court players={liveMatch.rotationA || []} serving={liveMatch.servingTeamId === teamA.id} teamName={teamA.name} />
                             <ScoreControl 
                                role={currentUser.role} 
                                linkedTeamId={currentUser.linkedTeamId} 
                                onPoint={handlePoint} 
                                onSubtractPoint={handleSubtractPoint}
                                onRequestTimeout={handleRequestTimeout} 
                                onRequestSub={initiateSubRequest} 
                                onModifyRotation={handleModifyRotation} 
                                onSetServe={handleSetServe}
                                isServing={liveMatch.servingTeamId === teamA.id}
                                teamId={teamA.id} 
                                teamName={teamA.name} 
                                players={liveMatch.rotationA} 
                                disabled={liveMatch.status !== 'playing'} 
                                timeoutsUsed={liveMatch.timeoutsA} 
                                subsUsed={liveMatch.substitutionsA} 
                              />
                        </div>
                        <div className="space-y-4">
                             <Court players={liveMatch.rotationB || []} serving={liveMatch.servingTeamId === teamB.id} teamName={teamB.name} />
                             <ScoreControl 
                                role={currentUser.role} 
                                linkedTeamId={currentUser.linkedTeamId} 
                                onPoint={handlePoint} 
                                onSubtractPoint={handleSubtractPoint}
                                onRequestTimeout={handleRequestTimeout} 
                                onRequestSub={initiateSubRequest} 
                                onModifyRotation={handleModifyRotation}
                                onSetServe={handleSetServe}
                                isServing={liveMatch.servingTeamId === teamB.id}
                                teamId={teamB.id} 
                                teamName={teamB.name} 
                                players={liveMatch.rotationB} 
                                disabled={liveMatch.status !== 'playing'} 
                                timeoutsUsed={liveMatch.timeoutsB} 
                                subsUsed={liveMatch.substitutionsB} 
                              />
                        </div>
                    </div>
                </>
            )}
        </div>
      )}

      {/* --- MODALS --- */}
      {/* Set Stats Modal */}
      {viewingSetStats && activeTournament && fixture && teamA && teamB && (() => {
          return (
            <SetStatsModal 
                setNumber={viewingSetStats.setNum}
                setData={viewingSetStats.data}
                teamA={teamA}
                teamB={teamB}
                onClose={() => setViewingSetStats(null)}
                onNextSet={() => {
                    handleStartNextSet();
                    setViewingSetStats(null); // Close modal when starting next set
                }}
                showNextButton={isAdmin && liveMatch.status === 'finished_set' && viewingSetStats.setNum === liveMatch.currentSet}
            />
          );
      })()}

      {showRotationModal && (
          <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[70] backdrop-blur-md">
              <div className="bg-corp-panel p-6 border border-white/20 rounded-xl w-full max-w-sm shadow-2xl">
                  <h3 className="text-xl font-bold text-white mb-6 uppercase italic text-center">Modificar Rotación</h3>
                  <div className="grid grid-cols-3 gap-3 mb-6">
                      {rotationInput.map((val, idx) => (
                          <div key={idx} className="flex flex-col items-center">
                              <label className="text-[10px] text-slate-500 font-bold mb-1">P{idx + 1}</label>
                              <input 
                                type="number" 
                                value={val}
                                onChange={(e) => {
                                    const newRot = [...rotationInput];
                                    newRot[idx] = e.target.value;
                                    setRotationInput(newRot);
                                }}
                                className="w-full bg-black/40 border border-white/10 rounded p-2 text-white font-bold text-center outline-none focus:border-corp-accent"
                              />
                          </div>
                      ))}
                  </div>
                  <div className="flex gap-3">
                      <button onClick={() => setShowRotationModal(null)} className="flex-1 py-3 text-slate-400 hover:text-white font-bold uppercase text-xs">Cancelar</button>
                      <button onClick={confirmRotation} className="flex-1 py-3 bg-corp-accent text-white rounded font-bold uppercase text-xs hover:bg-corp-accent-hover shadow-lg transition">Confirmar</button>
                  </div>
              </div>
          </div>
      )}

      {showMatchConfigModal && (
          <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[70] backdrop-blur-md">
              <div className="bg-corp-panel p-6 border border-white/20 rounded-xl w-full max-w-sm shadow-2xl">
                  {/* ... match config modal content ... */}
                  <h3 className="text-xl font-bold text-white mb-6 uppercase italic text-center">
                      {isEditingRules ? 'Modificar Reglas' : 'Configurar Partido'}
                  </h3>
                  
                  <div className="space-y-6 mb-8">
                      <div>
                          <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Cantidad de Sets</label>
                          <div className="flex gap-2 mb-2">
                              <input 
                                type="number" 
                                value={matchConfig.maxSets}
                                onChange={(e) => setMatchConfig({...matchConfig, maxSets: parseInt(e.target.value) || 0})}
                                className="w-full bg-black/40 border border-white/10 rounded p-2 text-white font-bold text-center outline-none focus:border-corp-accent"
                              />
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                              {[1, 3, 5].map(sets => (
                                  <button 
                                    key={sets} 
                                    onClick={() => setMatchConfig({...matchConfig, maxSets: sets})}
                                    className={`py-1 rounded text-xs font-bold transition ${matchConfig.maxSets === sets ? 'bg-corp-accent text-white' : 'bg-black/30 text-slate-500 hover:text-white'}`}
                                  >
                                      {sets}
                                  </button>
                              ))}
                          </div>
                      </div>

                      <div>
                          <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Puntos por Set</label>
                          <div className="flex gap-2 mb-2">
                              <input 
                                type="number" 
                                value={matchConfig.pointsPerSet}
                                onChange={(e) => setMatchConfig({...matchConfig, pointsPerSet: parseInt(e.target.value) || 0})}
                                className="w-full bg-black/40 border border-white/10 rounded p-2 text-white font-bold text-center outline-none focus:border-corp-accent"
                              />
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                              {[15, 21, 25].map(pts => (
                                  <button 
                                    key={pts} 
                                    onClick={() => setMatchConfig({...matchConfig, pointsPerSet: pts})}
                                    className={`py-1 rounded text-xs font-bold transition ${matchConfig.pointsPerSet === pts ? 'bg-corp-accent text-white' : 'bg-black/30 text-slate-500 hover:text-white'}`}
                                  >
                                      {pts}
                                  </button>
                              ))}
                          </div>
                      </div>

                      <div>
                          <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Tie-Break (Último Set)</label>
                          <div className="flex gap-2 mb-2">
                              <input 
                                type="number" 
                                value={matchConfig.tieBreakPoints}
                                onChange={(e) => setMatchConfig({...matchConfig, tieBreakPoints: parseInt(e.target.value) || 0})}
                                className="w-full bg-black/40 border border-white/10 rounded p-2 text-white font-bold text-center outline-none focus:border-corp-accent"
                              />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                              {[15, 25].map(pts => (
                                  <button 
                                    key={pts} 
                                    onClick={() => setMatchConfig({...matchConfig, tieBreakPoints: pts})}
                                    className={`py-1 rounded text-xs font-bold transition ${matchConfig.tieBreakPoints === pts ? 'bg-corp-accent text-white' : 'bg-black/30 text-slate-500 hover:text-white'}`}
                                  >
                                      {pts}
                                  </button>
                              ))}
                          </div>
                      </div>
                  </div>

                  <div className="flex gap-3">
                      <button onClick={() => { setShowMatchConfigModal(null); setIsEditingRules(false); }} className="flex-1 py-3 text-slate-400 hover:text-white font-bold uppercase text-xs">Cancelar</button>
                      <button onClick={handleSaveConfig} className="flex-1 py-3 bg-green-600 text-white rounded font-bold uppercase text-xs hover:bg-green-500 shadow-lg transition">
                          {isEditingRules ? 'Guardar Cambios' : 'Comenzar'}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {showCreateTourneyModal && (
          <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[60] backdrop-blur-md p-4">
              <div className="bg-corp-panel border border-white/20 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
                  {/* ... create tourney modal content ... */}
                  <div className="p-6 border-b border-white/10">
                      <h2 className="text-2xl font-bold text-white">Nuevo Torneo</h2>
                      <p className="text-xs text-slate-400">Configura la competencia y genera el fixture con IA.</p>
                  </div>
                  
                  <div className="p-6 space-y-6 overflow-y-auto">
                      <div className="flex gap-4">
                          <div className="w-24 h-24 bg-black/30 rounded-lg flex-shrink-0 flex items-center justify-center border border-white/10 overflow-hidden relative group">
                              {newTourneyData.logoUrl ? <img src={newTourneyData.logoUrl} className="w-full h-full object-contain" /> : <span className="text-2xl">🏆</span>}
                              <input type="file" accept="image/*" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20" onChange={(e) => handleFileUpload(e, (val) => setNewTourneyData({...newTourneyData, logoUrl: val}))} />
                              <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition text-[10px] font-bold text-white uppercase z-10 pointer-events-none">Cambiar</div>
                          </div>
                          <div className="flex-1">
                              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Nombre del Torneo</label>
                              <input 
                                  type="text" 
                                  value={newTourneyData.name} 
                                  onChange={(e) => setNewTourneyData({...newTourneyData, name: e.target.value})} 
                                  className="w-full bg-black/40 border border-white/10 rounded p-2 text-white font-bold text-xs outline-none focus:border-corp-accent" 
                                  placeholder="Ej: Torneo Verano 2024"
                              />
                          </div>
                      </div>

                      {/* Date Range */}
                      <div className="grid grid-cols-2 gap-4">
                          <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Inicio</label>
                              <input 
                                type="date" 
                                value={newTourneyData.startDate} 
                                onChange={(e) => setNewTourneyData({...newTourneyData, startDate: e.target.value})} 
                                className="w-full bg-black/40 border border-white/10 rounded p-2 text-white font-bold text-xs outline-none focus:border-corp-accent"
                              />
                          </div>
                          <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Fin</label>
                              <input 
                                type="date" 
                                value={newTourneyData.endDate} 
                                onChange={(e) => setNewTourneyData({...newTourneyData, endDate: e.target.value})} 
                                className="w-full bg-black/40 border border-white/10 rounded p-2 text-white font-bold text-xs outline-none focus:border-corp-accent"
                              />
                          </div>
                      </div>

                      {/* Match Days */}
                      <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-2">Días de Partido</label>
                          <div className="flex flex-wrap gap-2">
                              {DAYS_OF_WEEK.map(day => (
                                  <button 
                                    key={day} 
                                    onClick={() => toggleDaySelection(day)}
                                    className={`px-3 py-1.5 rounded text-[10px] font-bold uppercase transition border ${newTourneyData.matchDays.includes(day) ? 'bg-corp-accent text-white border-corp-accent' : 'bg-black/40 text-slate-500 border-white/10 hover:border-white/30'}`}
                                  >
                                      {day}
                                  </button>
                              ))}
                          </div>
                          <p className="text-[9px] text-slate-500 mt-2">* La IA priorizará estos días para el fixture.</p>
                      </div>
                  </div>

                  <div className="p-6 border-t border-white/10 bg-black/20 flex justify-end gap-3">
                      <button onClick={() => setShowCreateTourneyModal(false)} className="px-4 py-2 text-slate-400 hover:text-white font-bold uppercase text-xs">Cancelar</button>
                      <button 
                        onClick={handleCreateTournament} 
                        disabled={loading}
                        className="px-6 py-2 bg-corp-accent text-white rounded font-bold uppercase text-xs hover:bg-corp-accent-hover shadow-lg transition disabled:opacity-50 disabled:grayscale flex items-center gap-2"
                      >
                          {loading ? <span className="animate-spin">⏳</span> : '✨'} {loading ? 'Generando...' : 'Crear Torneo'}
                      </button>
                  </div>
              </div>
          </div>
      )}

    </Layout>
  );
};

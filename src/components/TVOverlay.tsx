
import React, { useEffect, useRef, useState } from 'react';
import { LiveMatchState, Team, Tournament, User } from '../types';

interface TVOverlayProps {
  match: LiveMatchState;
  teamA: Team;
  teamB: Team;
  tournament?: Tournament | null;
  currentUser?: User | null;
  onExit: () => void;
  onLogout?: () => void;
  onBack?: () => void; // New prop for Viewers to go back to Dashboard
  onNextSet?: () => void;
  nextSetCountdown?: number | null;
  showStatsOverlay?: boolean;
  showScoreboard?: boolean;
  isCloudConnected?: boolean;
}

export const TVOverlay: React.FC<TVOverlayProps> = ({ 
  match, 
  teamA, 
  teamB, 
  tournament,
  currentUser,
  onExit, 
  onLogout,
  onBack,
  onNextSet,
  nextSetCountdown,
  showStatsOverlay = false,
  showScoreboard = true,
  isCloudConnected = true
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const isViewer = currentUser?.role === 'VIEWER';
  const isAdmin = currentUser?.role === 'ADMIN' || currentUser?.role?.includes('COACH');

  // Transition States (Stinger)
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [visibleScoreboard, setVisibleScoreboard] = useState(showScoreboard);
  const [visibleStats, setVisibleStats] = useState(showStatsOverlay);

  // Camera Selection State
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [showSettings, setShowSettings] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Determine if it's "Pre-Match" based on status
  const isPreMatch = match.status === 'warmup';
  
  // Determine if set is finished
  const isSetFinished = match.status === 'finished_set';

  // Handle Transitions ("Stinger Effect")
  useEffect(() => {
    const scoreChanged = showScoreboard !== visibleScoreboard;
    const statsChanged = showStatsOverlay !== visibleStats;

    if (scoreChanged || statsChanged) {
        setIsTransitioning(true);
        
        const updateTimer = setTimeout(() => {
            if (scoreChanged) setVisibleScoreboard(showScoreboard);
            if (statsChanged) setVisibleStats(showStatsOverlay);
        }, 500);
        
        const endTimer = setTimeout(() => {
            setIsTransitioning(false);
        }, 1100);
        
        return () => { clearTimeout(updateTimer); clearTimeout(endTimer); };
    }
  }, [showScoreboard, showStatsOverlay]); // Only depend on props changing

  // Enumerate Devices on Mount (Admin Only)
  useEffect(() => {
      if (isViewer) return;
      
      // Check support
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
          console.warn("Media Devices API not supported");
          return;
      }

      const getDevices = async () => {
          try {
              // Request permission first to get labels, handle rejection gracefully
              try {
                  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                  // Stop the stream immediately, we just needed permission
                  stream.getTracks().forEach(track => track.stop());
              } catch (e) {
                  console.warn("Permission check failed, proceeding without labels if possible");
              }
              
              const devices = await navigator.mediaDevices.enumerateDevices();
              const videoInputs = devices.filter(d => d.kind === 'videoinput');
              setVideoDevices(videoInputs);
              if (videoInputs.length > 0 && !selectedDeviceId) {
                  // Prefer back camera if available, otherwise first
                  const backCam = videoInputs.find(d => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('environment'));
                  setSelectedDeviceId(backCam ? backCam.deviceId : videoInputs[0].deviceId);
              }
          } catch (e) {
              console.warn("Error enumerating devices", e);
          }
      };
      getDevices();
  }, [isViewer]);

  // Activate Camera Logic
  useEffect(() => {
    if (isViewer) return; // Skip camera for viewers

    let activeStream: MediaStream | null = null;
    let isMounted = true;

    async function setupCamera() {
      // Reset error state
      setCameraError(null);

      // FORCE STOP previous stream if exists in ref
      if (videoRef.current && videoRef.current.srcObject) {
         try {
            const oldStream = videoRef.current.srcObject as MediaStream;
            oldStream.getTracks().forEach(track => track.stop());
         } catch(e) { /* ignore */ }
         if (videoRef.current) videoRef.current.srcObject = null;
      }

      // Check if API exists
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          if (isMounted) setCameraError("Navegador no soporta cámara o contexto inseguro (HTTPS requerido).");
          return;
      }

      try {
        const constraints: MediaStreamConstraints = {
            video: selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : { facingMode: 'environment' }
        };

        // Try high res if possible
        if (!selectedDeviceId) {
             // @ts-ignore
             constraints.video.width = { ideal: 1920 };
             // @ts-ignore
             constraints.video.height = { ideal: 1080 };
        }

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        if (isMounted) {
            activeStream = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = activeStream;
                await videoRef.current.play().catch(e => console.warn("Autoplay blocked", e));
            }
        } else {
            stream.getTracks().forEach(track => track.stop());
        }

      } catch (err) {
        console.warn("High-spec camera failed, trying fallback...", err);
        
        try {
            if (!isMounted) return;
            if (activeStream) {
                activeStream.getTracks().forEach(track => track.stop());
                activeStream = null;
            }
            await new Promise(resolve => setTimeout(resolve, 800));
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { width: 640, height: 480 } 
            });
            if (isMounted) {
                activeStream = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = activeStream;
                    await videoRef.current.play().catch(e => console.warn("Autoplay blocked", e));
                }
            } else {
                stream.getTracks().forEach(track => track.stop());
            }
        } catch (err2: any) {
            console.error("Critical Camera Error:", err2);
            if (isMounted) {
                let msg = "No se pudo iniciar la cámara.";
                setCameraError(msg);
            }
        }
      }
    }
    
    setupCamera();
    
    return () => {
       isMounted = false;
       if (activeStream) {
         try {
            activeStream.getTracks().forEach(track => track.stop());
         } catch (e) { /* ignore */ }
       }
    };
  }, [isViewer, selectedDeviceId]);

  // Determine match state
  const sets = match.sets || [];
  const requiredWins = Math.ceil(match.config.maxSets / 2);
  const winThreshold = match.config.pointsPerSet; 

  const winsA = sets.filter(s => s.scoreA > s.scoreB && Math.max(s.scoreA, s.scoreB) >= (match.currentSet === match.config.maxSets ? match.config.tieBreakPoints : winThreshold)).length;
  const winsB = sets.filter(s => s.scoreB > s.scoreA && Math.max(s.scoreA, s.scoreB) >= (match.currentSet === match.config.maxSets ? match.config.tieBreakPoints : winThreshold)).length;
  
  const matchEnded = winsA === requiredWins || winsB === requiredWins;
  const winner = winsA === requiredWins ? teamA : (winsB === requiredWins ? teamB : null);

  // Stats Logic
  const calculateTeamTotal = (teamId: string, type: 'attack' | 'block' | 'ace') => {
      let total = 0;
      sets.forEach(set => {
          total += (set.history || []).filter(h => h.teamId === teamId && h.type === type).length;
      });
      return total;
  };
  const calculateTeamErrors = (teamId: string) => {
      let total = 0;
      sets.forEach(set => {
           total += (set.history || []).filter(h => h.teamId !== teamId && h.type === 'opponent_error').length;
      });
      return total;
  };

  const statsA = {
      attacks: calculateTeamTotal(teamA.id, 'attack'),
      blocks: calculateTeamTotal(teamA.id, 'block'),
      aces: calculateTeamTotal(teamA.id, 'ace'),
      errors: calculateTeamErrors(teamA.id)
  };

  const statsB = {
      attacks: calculateTeamTotal(teamB.id, 'attack'),
      blocks: calculateTeamTotal(teamB.id, 'block'),
      aces: calculateTeamTotal(teamB.id, 'ace'),
      errors: calculateTeamErrors(teamB.id)
  };

  const handleTikTokLive = () => {
      const text = `🏆 Torneo: ${tournament?.name || 'Voley'} | 🏐 ${teamA.name} VS ${teamB.name} | 🔴 EN VIVO`;
      window.open(`https://www.tiktok.com/studio/download?params=${encodeURIComponent(text)}`, '_blank');
  };

  const canUseTikTok = currentUser?.role === 'ADMIN';

  return (
    <div className="fixed inset-0 z-[100] flex flex-col justify-end pb-0 font-sans bg-transparent overflow-hidden transition-all duration-300">
      
      {/* Background */}
      {!isViewer && !cameraError ? (
        <video 
            ref={videoRef}
            autoPlay 
            playsInline 
            muted 
            className="absolute inset-0 w-full h-full object-cover"
            style={{ zIndex: -1 }} 
        />
      ) : (
        <div className="absolute inset-0 bg-corp-bg w-full h-full" style={{ zIndex: -1 }}>
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/40 via-corp-bg to-black"></div>
            <div className="absolute top-0 left-0 w-full h-full opacity-20" style={{ backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)', backgroundSize: '30px 30px' }}></div>
            
            {!isViewer && cameraError && (
                <div className="absolute top-20 right-6 flex items-center gap-2 bg-red-900/50 text-red-200 px-3 py-1 rounded-full border border-red-500/30 backdrop-blur-sm pointer-events-none">
                    <span className="text-xs">📷 {cameraError} (Modo Gráfico)</span>
                </div>
            )}
        </div>
      )}
      
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" style={{ zIndex: 0 }}></div>

      {/* --- STINGER TRANSITION OVERLAY --- */}
      <div 
        className={`absolute inset-0 z-50 flex items-center justify-center bg-blue-900 transition-transform duration-500 ease-in-out ${isTransitioning ? 'scale-100' : 'scale-0'} origin-center rounded-full md:rounded-none`}
        style={{ pointerEvents: 'none' }}
      >
          <div className="flex flex-col items-center animate-pulse">
              {tournament?.logoUrl ? <img src={tournament.logoUrl} className="w-48 h-48 object-contain mb-4" /> : <div className="text-9xl">🏐</div>}
              <h1 className="text-4xl font-black text-white uppercase italic tracking-widest">{tournament?.name}</h1>
          </div>
      </div>


      {/* --- HEADER ELEMENTS (TOP LEFT) - NAV BAR --- */}
      <div className="absolute top-4 left-4 md:top-6 md:left-6 landscape:top-3 landscape:left-4 landscape:scale-90 flex flex-col gap-3 z-50 items-start transition-all">
          
          {/* NAVIGATION BUTTONS */}
          <div className="flex flex-col gap-2">
              {isViewer ? (
                  <>
                    {/* Viewer: Back to Dashboard */}
                    {onBack && (
                        <button 
                            onClick={onBack}
                            className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg text-xs font-black transition backdrop-blur-md border border-white/20 uppercase tracking-widest flex items-center gap-2 shadow-lg group"
                        >
                            <span>←</span> Volver al Fixture
                        </button>
                    )}
                    {/* Viewer: Logout */}
                    {onLogout && (
                        <button 
                            onClick={onLogout}
                            className="bg-red-600/80 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-xs font-bold transition backdrop-blur-md border border-white/20 uppercase tracking-widest shadow-lg"
                        >
                            Cerrar Sesión
                        </button>
                    )}
                  </>
              ) : (
                  // Admin: Back to Controls
                  <div className="flex items-center gap-2">
                    <button 
                        onClick={onExit}
                        className="bg-corp-accent hover:bg-corp-accent-hover text-white px-5 py-3 rounded-lg text-xs font-black transition backdrop-blur-md border border-white/20 uppercase tracking-widest shadow-[0_0_15px_rgba(59,130,246,0.5)] flex items-center gap-2 transform hover:scale-105 active:scale-95"
                    >
                        <span>🎛️</span> Panel de Control
                    </button>
                    
                    {/* Camera Settings Toggle */}
                    <button 
                        onClick={() => setShowSettings(!showSettings)}
                        className={`px-3 py-3 rounded-lg text-xs font-bold transition backdrop-blur-md border border-white/20 shadow-lg ${cameraError ? 'bg-red-600/80 text-white hover:bg-red-500' : 'bg-black/60 hover:bg-white text-white hover:text-black'}`}
                        title="Configuración de Cámara"
                    >
                        📷
                    </button>
                  </div>
              )}
              
              {/* Camera Selector Dropdown */}
              {showSettings && !isViewer && (
                  <div className="bg-black/90 backdrop-blur-xl p-3 rounded-lg border border-white/20 mt-1 max-w-[240px] shadow-2xl animate-in slide-in-from-top-2">
                      <label className="block text-[9px] font-black text-slate-400 uppercase mb-2 tracking-widest">Seleccionar Cámara</label>
                      <select 
                         value={selectedDeviceId}
                         onChange={(e) => { setSelectedDeviceId(e.target.value); setCameraError(null); }}
                         className="w-full bg-white/10 text-white text-[10px] p-2 rounded outline-none border border-white/10 focus:border-corp-accent"
                      >
                          {videoDevices.length === 0 && <option value="">Detectando...</option>}
                          {videoDevices.map(device => (
                              <option key={device.deviceId} value={device.deviceId}>
                                  {device.label || `Cámara ${device.deviceId.slice(0, 5)}...`}
                              </option>
                          ))}
                      </select>
                  </div>
              )}
          </div>

          {/* STATUS BADGES */}
          {!matchEnded && (
              <div className="hidden md:flex gap-2"> 
                  {!isPreMatch && (
                   <div className="bg-black/60 text-white px-3 py-1 rounded font-bold text-sm backdrop-blur-md border border-white/10 uppercase tracking-wider">
                      SET {match.currentSet}
                   </div>
                  )}
                  {!isCloudConnected && (
                      <div className="bg-yellow-500 text-black px-3 py-1 rounded font-bold text-xs uppercase animate-bounce shadow-lg">
                          ⚠️ Sin Conexión
                      </div>
                  )}
                  {/* NEXT SET BUTTON IN OVERLAY */}
                  {isSetFinished && isAdmin && onNextSet && (
                      <button 
                        onClick={onNextSet}
                        className="bg-green-600 hover:bg-green-500 text-white px-3 py-1 rounded font-bold text-xs uppercase animate-pulse shadow-lg flex items-center gap-1"
                      >
                        ▶ Siguiente Set {nextSetCountdown ? `(${nextSetCountdown})` : ''}
                      </button>
                  )}
              </div>
          )}
      </div>

      {/* --- TOURNAMENT LOGO (TOP RIGHT) --- */}
      {tournament?.logoUrl && (
          <div className="absolute top-4 right-4 landscape:top-2 landscape:right-2 z-40 landscape:scale-75 origin-top-right transition-all pointer-events-none">
              <img 
                src={tournament.logoUrl} 
                alt="Torneo" 
                className="h-16 w-16 md:h-24 md:w-24 object-contain drop-shadow-2xl opacity-90" 
              />
          </div>
      )}

      {/* TikTok Live Button - Admin Only */}
      {canUseTikTok && (
        <div className="absolute top-36 right-6 landscape:top-24 landscape:right-4 flex flex-col items-center gap-4 opacity-100 z-20 transition-all">
           <button 
             onClick={handleTikTokLive}
             className="flex flex-col items-center gap-2 group hover:scale-105 transition"
             title="Ir a TikTok Live Studio"
           >
               <div className="w-12 h-12 bg-black/80 rounded-full flex items-center justify-center border-2 border-[#ff0050] group-hover:bg-[#ff0050] transition shadow-[0_0_15px_rgba(255,0,80,0.6)]">
                   <svg fill="#ffffff" width="20px" height="20px" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
                       <path d="M412.19,118.66a109.27,109.27,0,0,1-9.45-5.5,132.87,132.87,0,0,1-24.27-20.62c-18.1-20.71-24.86-41.72-27.35-56.43h.1C349.14,23.9,350,16,350.13,16H267.69V334.78c0,4.28,0,8.51-.18,12.69,0,45.25-35.31,81.93-78.88,81.93-43.58,0-78.89-36.68-78.89-81.93s35.31-81.93,78.89-81.93,77.54,77.54,0,0,1,31.74,6.75A79.44,79.44,0,0,1,232.06,278h79.14c-1.57-23.77-5.51-45.92-11.49-65.73-12.87-42.61-46.12-75.13-88.7-86.82-14-3.85-28.78-5.73-43.58-5.73-87.35,0-158.18,73.56-158.18,164.29C9.36,374.74,80.19,448.3,167.54,448.3c75.61,0,138.56-54.89,153.11-127.35.6-2.98.9-5.78,1.21-8.54V154.55c23.08,17.47,50.69,27.81,80.59,27.81a134.33,134.33,0,0,0,9.75-.41V118.66Z"/>
                   </svg>
               </div>
           </button>
        </div>
      )}

      {/* --- COMPARATIVE STATS OVERLAY --- */}
      {visibleStats && !matchEnded && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl px-2 z-40 transition-transform scale-75 md:scale-90">
            <div className="bg-slate-900/70 backdrop-blur-md border border-white/20 rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)]">
                 <div className="bg-gradient-to-b from-white/10 to-transparent p-4 flex justify-between items-end border-b border-white/10">
                    <div className="flex flex-col items-center w-1/4">
                         {teamA.logoUrl ? <img src={teamA.logoUrl} className="w-14 h-14 object-contain bg-white rounded-lg p-1" /> : <div className="w-14 h-14 bg-blue-900 rounded-lg flex items-center justify-center font-bold text-2xl">{teamA.name[0]}</div>}
                         <span className="text-white font-black uppercase text-xs mt-2 text-center">{teamA.name}</span>
                    </div>
                    <div className="flex flex-col items-center mb-2">
                         <span className="text-yellow-400 font-black italic text-3xl">VS</span>
                         <span className="text-gray-300 text-[10px] uppercase font-bold tracking-[0.2em]">ESTADÍSTICAS</span>
                    </div>
                    <div className="flex flex-col items-center w-1/4">
                         {teamB.logoUrl ? <img src={teamB.logoUrl} className="w-14 h-14 object-contain bg-white rounded-lg p-1" /> : <div className="w-14 h-14 bg-red-900 rounded-lg flex items-center justify-center font-bold text-2xl">{teamB.name[0]}</div>}
                         <span className="text-white font-black uppercase text-xs mt-2 text-center">{teamB.name}</span>
                    </div>
                 </div>

                 <div className="p-2 space-y-1">
                     {[
                        { l: statsA.attacks, label: 'ATAQUES', r: statsB.attacks, c: 'text-white' },
                        { l: statsA.blocks, label: 'BLOQUEOS', r: statsB.blocks, c: 'text-blue-400' },
                        { l: statsA.aces, label: 'ACES', r: statsB.aces, c: 'text-green-400' },
                        { l: statsA.errors, label: 'ERRORES', r: statsB.errors, c: 'text-red-400' }
                     ].map((row, idx) => (
                        <div key={idx} className="flex items-center py-2 border-b border-white/5 bg-black/20">
                           <div className={`w-1/3 text-center text-xl font-bold font-mono ${row.c}`}>{row.l}</div>
                           <div className="w-1/3 text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest">{row.label}</div>
                           <div className={`w-1/3 text-center text-xl font-bold font-mono ${row.c}`}>{row.r}</div>
                        </div>
                     ))}
                 </div>
            </div>
        </div>
      )}

      {/* --- PRE-MATCH / WARMUP BANNER & TEAM VS (COMPACT MODE) --- */}
      {(isPreMatch || isSetFinished) && !matchEnded && (
          <div className="absolute bottom-12 left-1/2 transform -translate-x-1/2 w-[90%] max-w-4xl z-30 animate-in slide-in-from-bottom-10 duration-700">
             {/* Compact Pre-Match Bar - Allows full camera visibility */}
            <div className="bg-black/70 backdrop-blur-md border border-white/20 rounded-2xl overflow-hidden shadow-2xl flex items-stretch h-20 md:h-24">
                
                {/* Team A */}
                <div className="flex-1 flex items-center justify-end px-4 md:px-6 gap-3 md:gap-4 bg-gradient-to-r from-transparent to-blue-900/30">
                    <h3 className="hidden md:block text-xl md:text-2xl font-black text-white uppercase italic tracking-tighter text-right leading-none">{teamA.name}</h3>
                    <div className="w-12 h-12 md:w-16 md:h-16 bg-white/10 rounded-lg p-1 md:p-2 border border-white/10 shadow-lg">
                        {teamA.logoUrl ? (
                            <img src={teamA.logoUrl} className="w-full h-full object-contain" /> 
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-xl font-black text-blue-400">{teamA.name[0]}</div>
                        )}
                    </div>
                </div>

                {/* Center VS / Status */}
                <div className="w-32 md:w-40 flex flex-col items-center justify-center bg-black/50 border-x border-white/10 relative">
                     <div className="absolute inset-0 bg-gradient-to-t from-red-900/20 to-transparent animate-pulse"></div>
                     <span className="text-2xl md:text-4xl font-black text-yellow-400 italic drop-shadow-lg">VS</span>
                     <span className="text-[9px] md:text-[10px] font-bold text-white uppercase tracking-widest bg-red-600/80 px-2 py-0.5 rounded mt-1">
                        {isSetFinished ? 'INTERMEDIO' : 'Calentamiento'}
                     </span>
                </div>

                {/* Team B */}
                <div className="flex-1 flex items-center justify-start px-4 md:px-6 gap-3 md:gap-4 bg-gradient-to-l from-transparent to-red-900/30">
                    <div className="w-12 h-12 md:w-16 md:h-16 bg-white/10 rounded-lg p-1 md:p-2 border border-white/10 shadow-lg">
                        {teamB.logoUrl ? (
                            <img src={teamB.logoUrl} className="w-full h-full object-contain" /> 
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-xl font-black text-red-400">{teamB.name[0]}</div>
                        )}
                    </div>
                    <h3 className="hidden md:block text-xl md:text-2xl font-black text-white uppercase italic tracking-tighter text-left leading-none">{teamB.name}</h3>
                </div>

            </div>
          </div>
      )}

      {/* --- MATCH FINISHED SUMMARY --- */}
      {matchEnded && winner ? (
          <div className="relative z-10 w-full max-w-4xl mx-auto mb-10 animate-in slide-in-from-bottom-10 fade-in duration-700 mt-20 md:mt-0">
             <div className="bg-gradient-to-b from-slate-900/95 to-blue-950/95 text-white rounded-xl overflow-hidden shadow-2xl border border-white/20 backdrop-blur-xl m-4">
                 <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-4 text-center border-b border-white/10">
                     <h2 className="text-2xl font-black uppercase tracking-widest italic">Resultado Final</h2>
                 </div>
                 
                 <div className="p-8 flex flex-col items-center">
                     <div className="text-sm font-bold text-blue-200 uppercase tracking-widest mb-4">Ganador del Partido</div>
                     <div className="flex items-center gap-6 mb-8 transform scale-125">
                         {winner.logoUrl && <img src={winner.logoUrl} className="w-20 h-20 object-contain bg-white rounded-full p-2 shadow-lg" alt="" />}
                         <div className="text-5xl font-black text-white italic drop-shadow-lg uppercase">{winner.name}</div>
                     </div>
                     
                     <div className="flex gap-2 mb-8">
                         {sets.map((s, i) => (
                             (s.scoreA > 0 || s.scoreB > 0) && (
                                 <div key={i} className="flex flex-col items-center bg-black/40 px-4 py-2 rounded border border-white/10">
                                     <div className="text-[10px] text-gray-400 uppercase font-bold mb-1">Set {i+1}</div>
                                     <div className={`text-xl font-mono font-bold ${matchEnded ? (winner.id === teamA.id ? (s.scoreA > s.scoreB ? 'text-yellow-400' : 'text-white') : (s.scoreB > s.scoreA ? 'text-yellow-400' : 'text-white')) : 'text-white'}`}>
                                         {s.scoreA}-{s.scoreB}
                                     </div>
                                 </div>
                             )
                         ))}
                     </div>
                 </div>
             </div>
          </div>
      ) : (
          /* --- SCOREBOARD (RESPONSIVE VERTICAL/HORIZONTAL) --- */
          visibleScoreboard && !isPreMatch && (
            <
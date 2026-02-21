
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
  const [showRotationView, setShowRotationView] = useState(false);

  // Camera Selection State
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [showSettings, setShowSettings] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [showTikTokHelp, setShowTikTokHelp] = useState(false);

  // Determine if it's "Pre-Match" based on status
  const isPreMatch = match.status === 'warmup';
  
  // Determine if set is finished
  const isSetFinished = match.status === 'finished_set';

  // Broadcast Settings
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('9:16');
  const isVertical = aspectRatio === '9:16';

  // Handle Transitions ("Stinger Effect")
  useEffect(() => {
    // Scoreboard Toggle: Standard Stinger (Cover -> Change -> Reveal)
    if (showScoreboard !== visibleScoreboard) {
        setIsTransitioning(true);
        const updateTimer = setTimeout(() => {
            setVisibleScoreboard(showScoreboard);
        }, 500);
        const endTimer = setTimeout(() => {
            setIsTransitioning(false);
        }, 1100);
        return () => { clearTimeout(updateTimer); clearTimeout(endTimer); };
    }
    
    // Stats Toggle: User requested Sequence (Logo Appears -> Logo Disappears -> Stats Appear)
    if (showStatsOverlay !== visibleStats) {
        setIsTransitioning(true); // 1. Logo In
        
        // 2. Logo Out (after it fully appeared)
        const hideLogoTimer = setTimeout(() => {
            setIsTransitioning(false);
        }, 1000); // Wait 1s keeping logo, then hide

        // 3. Stats Change (after logo is gone)
        const showStatsTimer = setTimeout(() => {
            setVisibleStats(showStatsOverlay);
        }, 1600); // 1.0s + 0.6s transition out

        return () => { clearTimeout(hideLogoTimer); clearTimeout(showStatsTimer); };
    }
  }, [showScoreboard, showStatsOverlay, visibleScoreboard, visibleStats]);

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

        console.log("Requesting camera with constraints:", constraints);
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
      // If specific set is selected, only count that set
      const setsToCount = (match.statsSetIndex !== undefined && match.sets[match.statsSetIndex]) 
          ? [match.sets[match.statsSetIndex]] 
          : sets;

      setsToCount.forEach(set => {
          total += (set.history || []).filter(h => h.teamId === teamId && h.type === type).length;
      });
      return total;
  };
  const calculateTeamErrors = (teamId: string) => {
      let total = 0;
      const setsToCount = (match.statsSetIndex !== undefined && match.sets[match.statsSetIndex]) 
          ? [match.sets[match.statsSetIndex]] 
          : sets;

      setsToCount.forEach(set => {
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
        className={`absolute inset-0 z-50 flex items-center justify-center transition-transform duration-500 ease-in-out ${isTransitioning ? 'scale-100' : 'scale-0'} origin-center rounded-full md:rounded-none`}
        style={{ pointerEvents: 'none' }}
      >
          <div className="flex flex-col items-center animate-pulse">
              {tournament?.logoUrl ? <img src={tournament.logoUrl} className="w-48 h-48 object-contain mb-4" /> : <div className="text-9xl">🏐</div>}
          </div>
      </div>


      {/* --- HEADER ELEMENTS (TOP LEFT) - NAV BAR --- */}
      <div className="absolute top-4 left-4 md:top-6 md:left-6 landscape:top-3 landscape:left-4 landscape:scale-90 flex flex-col gap-3 z-50 items-start transition-all">
          
          {/* NAVIGATION BUTTONS */}
          <div className="flex flex-col gap-2">
              {!isViewer && (
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
              
              {/* Camera Selector & Broadcast Settings Dropdown */}
              {showSettings && !isViewer && (
                  <div className="bg-black/90 backdrop-blur-xl p-3 rounded-lg border border-white/20 mt-1 max-w-[240px] shadow-2xl animate-in slide-in-from-top-2 space-y-4">
                      {/* Camera Select */}
                      <div>
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

                      {/* Aspect Ratio Toggle */}
                      <div>
                          <label className="block text-[9px] font-black text-slate-400 uppercase mb-2 tracking-widest">Formato de Transmisión</label>
                          <div className="flex gap-2">
                              <button 
                                onClick={() => setAspectRatio('16:9')}
                                className={`flex-1 py-2 rounded text-[10px] font-bold uppercase border ${aspectRatio === '16:9' ? 'bg-corp-accent border-corp-accent text-white' : 'bg-white/5 border-white/10 text-slate-400'}`}
                              >
                                  Horizontal (FB)
                              </button>
                              <button 
                                onClick={() => setAspectRatio('9:16')}
                                className={`flex-1 py-2 rounded text-[10px] font-bold uppercase border ${aspectRatio === '9:16' ? 'bg-corp-accent border-corp-accent text-white' : 'bg-white/5 border-white/10 text-slate-400'}`}
                              >
                                  Vertical (TikTok)
                              </button>
                          </div>
                      </div>
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
          <div className={`absolute z-40 transition-all duration-500 pointer-events-none origin-top-right
              ${isVertical 
                  ? 'top-16 right-4 scale-90' 
                  : 'top-2 right-2 scale-75'
              }
          `}>
              <img 
                src={tournament.logoUrl} 
                alt="Torneo" 
                className="h-16 w-16 md:h-24 md:w-24 object-contain drop-shadow-2xl opacity-90" 
              />
          </div>
      )}

      {/* TikTok & Facebook Live Buttons - Admin Only */}
      {canUseTikTok && (
        <div className="absolute top-36 right-6 landscape:top-24 landscape:right-4 portrait:bottom-24 portrait:right-4 portrait:top-auto flex flex-col items-center gap-4 opacity-100 z-20 transition-all">
           {/* Viewer Link Button */}
           <button 
             onClick={() => {
                 navigator.clipboard.writeText(window.location.origin + '/?view=' + match.matchId);
                 alert("Enlace de transmisión copiado al portapapeles: " + window.location.origin + '/?view=' + match.matchId);
             }}
             className="flex flex-col items-center gap-2 group hover:scale-105 transition"
             title="Copiar Enlace de Transmisión"
           >
               <div className="w-12 h-12 bg-black/80 rounded-full flex items-center justify-center border-2 border-blue-500 group-hover:bg-blue-500 transition shadow-[0_0_15px_rgba(59,130,246,0.6)]">
                   <span className="text-2xl">🔗</span>
               </div>
               <span className="text-[8px] font-bold text-white bg-black/50 px-1 rounded">Compartir</span>
           </button>
           
           {/* Rotation View Toggle */}
           <button 
             onClick={() => setShowRotationView(!showRotationView)}
             className={`flex flex-col items-center gap-2 group hover:scale-105 transition ${showRotationView ? 'opacity-100' : 'opacity-80'}`}
             title="Ver Rotación"
           >
               <div className={`w-12 h-12 rounded-full flex items-center justify-center border-2 transition shadow-lg ${showRotationView ? 'bg-yellow-500 border-yellow-300 text-black' : 'bg-black/80 border-white/30 text-white'}`}>
                   <span className="font-black text-xl">R</span>
               </div>
           </button>
        </div>
      )}

      {/* --- TIKTOK HELP MODAL --- */}
      {showTikTokHelp && (
          <div className="absolute inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in">
              <div className="bg-slate-900 border border-white/20 rounded-2xl max-w-md w-full p-6 shadow-2xl">
                  <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-2">
                      <h3 className="text-xl font-black text-white uppercase italic">Transmitir en TikTok</h3>
                      <button onClick={() => setShowTikTokHelp(false)} className="text-slate-400 hover:text-white">✕</button>
                  </div>
                  <div className="space-y-4 text-sm text-slate-300">
                      <p>Para transmitir este marcador en TikTok Live, necesitas usar <strong>TikTok Live Studio</strong> (PC) o una app de captura.</p>
                      
                      <div className="bg-black/40 p-3 rounded border border-white/5">
                          <h4 className="font-bold text-white mb-2">Pasos Recomendados:</h4>
                          <ol className="list-decimal list-inside space-y-2">
                              <li>Abre esta vista en tu PC/Laptop.</li>
                              <li>Descarga e instala <a href="https://www.tiktok.com/live/studio" target="_blank" className="text-pink-500 underline hover:text-pink-400">TikTok Live Studio</a>.</li>
                              <li>En Live Studio, añade una fuente de <strong>"Captura de Ventana"</strong> o <strong>"Captura de Pantalla"</strong>.</li>
                              <li>Selecciona esta ventana del navegador.</li>
                              <li>¡Inicia tu transmisión!</li>
                          </ol>
                      </div>
                      
                      <div className="text-xs text-slate-500 italic">
                          Nota: TikTok requiere 1000+ seguidores para habilitar Live Studio en algunas cuentas.
                      </div>

                      <button 
                        onClick={() => window.open('https://www.tiktok.com/live/studio', '_blank')}
                        className="w-full bg-[#ff0050] hover:bg-[#d60043] text-white font-bold py-3 rounded uppercase tracking-widest mt-2"
                      >
                          Descargar Live Studio
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* --- ROTATION OVERLAY (COURT VISUALIZATION) --- */}
      {showRotationView && (
          <div className="absolute inset-0 z-40 flex items-center justify-center p-4 animate-in fade-in duration-300 pointer-events-none">
              <div className="w-full max-w-3xl flex flex-col gap-4 scale-75 md:scale-90 origin-center pointer-events-auto">
                  <div className="flex justify-between items-center text-white px-4">
                       <h2 className="text-xl font-black uppercase italic tracking-widest drop-shadow-md">Rotación</h2>
                       <button 
                          onClick={() => setShowRotationView(false)}
                          className="bg-black/40 hover:bg-black/60 text-white w-8 h-8 rounded-full flex items-center justify-center transition backdrop-blur-sm border border-white/20"
                      >
                          ✕
                      </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full">
                      {/* Team A Court */}
                      <div className="relative bg-black/20 border-2 border-white/80 shadow-2xl overflow-hidden aspect-square rounded-lg backdrop-blur-sm">
                          {/* Court Lines */}
                          <div className="absolute top-1/3 left-0 right-0 h-1 bg-white/80"></div> {/* Attack Line */}
                          <div className="absolute inset-0 flex items-center justify-center opacity-30 pointer-events-none">
                              {teamA.logoUrl ? <img src={teamA.logoUrl} className="w-48 h-48 object-contain" /> : <div className="text-9xl font-black text-white">{teamA.name[0]}</div>}
                          </div>
                          
                          {/* Team Name Label */}
                          <div className="absolute top-2 left-2 bg-blue-900/90 text-white px-3 py-1 rounded font-bold uppercase text-sm border border-white/20 shadow-lg z-10">
                              {teamA.name}
                          </div>

                          {/* Players Grid (Geographic) */}
                          {/* 
                             Net is at the TOP for this view (or bottom depending on perspective). 
                             Standard rotation positions:
                             4 3 2  (Front Row)
                             5 6 1  (Back Row)
                          */}
                          <div className="absolute inset-0 grid grid-rows-2 grid-cols-3 p-4 gap-4">
                              {/* Front Row: 4, 3, 2 */}
                              {[4, 3, 2].map((pos) => {
                                  const player = match.rotationA[pos - 1];
                                  return (
                                      <div key={pos} className="flex flex-col items-center justify-center">
                                          <div className="w-16 h-16 bg-blue-900 rounded-full border-2 border-white shadow-lg flex items-center justify-center relative group">
                                              <span className="text-2xl font-black text-white">{player ? player.number : '-'}</span>
                                              <div className="absolute -bottom-2 bg-black/80 text-white text-[10px] px-2 py-0.5 rounded-full uppercase font-bold whitespace-nowrap">
                                                  {player ? player.name.split(' ')[0] : 'VACÍO'}
                                              </div>
                                              <div className="absolute top-0 right-0 w-5 h-5 bg-yellow-400 text-black text-[10px] font-bold rounded-full flex items-center justify-center border border-white">
                                                  P{pos}
                                              </div>
                                          </div>
                                      </div>
                                  );
                              })}
                              
                              {/* Back Row: 5, 6, 1 */}
                              {[5, 6, 1].map((pos) => {
                                  const player = match.rotationA[pos - 1];
                                  return (
                                      <div key={pos} className="flex flex-col items-center justify-center">
                                          <div className="w-16 h-16 bg-blue-800 rounded-full border-2 border-white/50 shadow-lg flex items-center justify-center relative">
                                              <span className="text-2xl font-black text-white">{player ? player.number : '-'}</span>
                                              <div className="absolute -bottom-2 bg-black/80 text-white text-[10px] px-2 py-0.5 rounded-full uppercase font-bold whitespace-nowrap">
                                                  {player ? player.name.split(' ')[0] : 'VACÍO'}
                                              </div>
                                              <div className="absolute top-0 right-0 w-5 h-5 bg-slate-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center border border-white">
                                                  P{pos}
                                              </div>
                                          </div>
                                      </div>
                                  );
                              })}
                          </div>
                      </div>

                      {/* Team B Court */}
                      <div className="relative bg-black/20 border-2 border-white/80 shadow-2xl overflow-hidden aspect-square rounded-lg backdrop-blur-sm">
                          {/* Court Lines */}
                          <div className="absolute top-1/3 left-0 right-0 h-1 bg-white/80"></div> {/* Attack Line */}
                          <div className="absolute inset-0 flex items-center justify-center opacity-30 pointer-events-none">
                              {teamB.logoUrl ? <img src={teamB.logoUrl} className="w-48 h-48 object-contain" /> : <div className="text-9xl font-black text-white">{teamB.name[0]}</div>}
                          </div>

                          {/* Team Name Label */}
                          <div className="absolute top-2 left-2 bg-red-900/90 text-white px-3 py-1 rounded font-bold uppercase text-sm border border-white/20 shadow-lg z-10">
                              {teamB.name}
                          </div>

                          {/* Players Grid (Geographic) */}
                          <div className="absolute inset-0 grid grid-rows-2 grid-cols-3 p-4 gap-4">
                              {/* Front Row: 4, 3, 2 (Mapped from Team B perspective positions) */}
                              {/* Note: Standard logic usually mirrors, but for simplicity we show same layout P4-P3-P2 top */}
                              {[4, 3, 2].map((pos) => {
                                  const player = match.rotationB[pos - 1];
                                  return (
                                      <div key={pos} className="flex flex-col items-center justify-center">
                                          <div className="w-16 h-16 bg-red-900 rounded-full border-2 border-white shadow-lg flex items-center justify-center relative">
                                              <span className="text-2xl font-black text-white">{player ? player.number : '-'}</span>
                                              <div className="absolute -bottom-2 bg-black/80 text-white text-[10px] px-2 py-0.5 rounded-full uppercase font-bold whitespace-nowrap">
                                                  {player ? player.name.split(' ')[0] : 'VACÍO'}
                                              </div>
                                              <div className="absolute top-0 right-0 w-5 h-5 bg-yellow-400 text-black text-[10px] font-bold rounded-full flex items-center justify-center border border-white">
                                                  P{pos}
                                              </div>
                                          </div>
                                      </div>
                                  );
                              })}
                              
                              {/* Back Row: 5, 6, 1 */}
                              {[5, 6, 1].map((pos) => {
                                  const player = match.rotationB[pos - 1];
                                  return (
                                      <div key={pos} className="flex flex-col items-center justify-center">
                                          <div className="w-16 h-16 bg-red-800 rounded-full border-2 border-white/50 shadow-lg flex items-center justify-center relative">
                                              <span className="text-2xl font-black text-white">{player ? player.number : '-'}</span>
                                              <div className="absolute -bottom-2 bg-black/80 text-white text-[10px] px-2 py-0.5 rounded-full uppercase font-bold whitespace-nowrap">
                                                  {player ? player.name.split(' ')[0] : 'VACÍO'}
                                              </div>
                                              <div className="absolute top-0 right-0 w-5 h-5 bg-slate-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center border border-white">
                                                  P{pos}
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
                         <span className="text-gray-300 text-[10px] uppercase font-bold tracking-[0.2em]">
                             {match.statsSetIndex !== undefined ? `ESTADÍSTICAS SET ${match.statsSetIndex + 1}` : 'ESTADÍSTICAS TOTALES'}
                         </span>
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
          visibleScoreboard && !isPreMatch && !showRotationView && (
            <div className={`relative z-10 w-full mx-auto px-2 md:px-4 absolute 
                ${isVertical 
                    ? 'top-32 max-w-sm' 
                    : 'top-20 md:bottom-6 md:top-auto max-w-6xl'
                }
            `}>
                <div className={`flex items-stretch shadow-[0_10px_30px_rgba(0,0,0,0.5)] rounded-lg overflow-hidden border border-white/10 
                    ${isVertical 
                        ? 'flex-col h-auto' 
                        : 'h-16 md:h-20 flex-row'
                    }
                `}>
                    
                    {/* Team A Section */}
                    <div className={`flex-1 bg-gradient-to-r from-blue-900 to-blue-800 flex items-center justify-between relative 
                        ${isVertical 
                            ? 'p-3 border-b border-white/10 flex-row' 
                            : 'px-2 md:px-4 border-b-0 flex-row'
                        }
                    `}>
                        {match.servingTeamId === teamA.id && (
                            <div className={`absolute inset-0 flex items-center justify-start opacity-20 pointer-events-none 
                                ${isVertical ? 'pl-4' : 'pl-1'}
                            `}>
                                <span className="text-4xl">🏐</span>
                            </div>
                        )}
                        <div className="flex items-center gap-2 md:gap-3 z-10">
                            <div className="w-8 h-8 md:w-12 md:h-12 bg-white rounded p-1 shadow-md relative">
                                {teamA.logoUrl ? <img src={teamA.logoUrl} className="w-full h-full object-contain" /> : <div className="text-blue-900 font-bold text-lg md:text-xl flex items-center justify-center h-full">{teamA.name[0]}</div>}
                                {match.servingTeamId === teamA.id && <div className="absolute -top-1 -left-1 text-lg bg-white rounded-full leading-none shadow-sm border border-slate-200">🏐</div>}
                            </div>
                            <div className="flex flex-col">
                                <h2 className="text-white font-black uppercase italic tracking-tighter text-sm md:text-xl leading-none">{teamA.name}</h2>
                                <div className="flex gap-1 mt-1">
                                    {sets.filter(s => s.scoreA > s.scoreB && Math.max(s.scoreA, s.scoreB) >= (match.currentSet === match.config.maxSets ? match.config.tieBreakPoints : match.config.pointsPerSet)).map((_,i) => (
                                        <div key={i} className="w-2 h-2 md:w-3 md:h-3 bg-yellow-400 rounded-full border border-yellow-600"></div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="w-24 text-center text-3xl md:text-5xl font-black text-white tabular-nums tracking-tighter drop-shadow-md z-10 pl-2">
                            {match.scoreA}
                        </div>
                    </div>

                    {/* Center Info */}
                    <div className={`bg-black/90 flex flex-col items-center justify-center border-x border-white/10 z-10 relative 
                        ${isVertical ? 'py-1 w-full' : 'w-12 md:w-24 py-0'}
                    `}>
                        <div className="text-[9px] md:text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-0.5">Set {match.currentSet}</div>
                        <div className={`text-[10px] md:text-xs font-bold text-white px-1 md:px-2 rounded ${isSetFinished ? 'bg-yellow-500 text-black' : 'bg-red-600 animate-pulse'}`}>
                            {isSetFinished ? 'FIN' : 'LIVE'}
                        </div>
                        
                        {/* Set Summary (Small) */}
                        <div className="flex gap-1 mt-1">
                            {sets.map((s, i) => (
                                (s.scoreA > 0 || s.scoreB > 0) && i < match.currentSet - 1 && (
                                    <div key={i} className="text-[8px] text-slate-400 font-mono">
                                        {s.scoreA}-{s.scoreB}
                                    </div>
                                )
                            ))}
                        </div>
                    </div>

                    {/* Team B Section */}
                    <div className={`flex-1 bg-gradient-to-l from-red-900 to-red-800 flex items-center justify-between relative 
                        ${isVertical 
                            ? 'p-3 flex-row border-t border-white/10' 
                            : 'px-2 md:px-4 flex-row-reverse border-t-0'
                        }
                    `}>
                         {match.servingTeamId === teamB.id && (
                            <div className={`absolute inset-0 flex items-center justify-end opacity-20 pointer-events-none 
                                ${isVertical ? 'pr-4' : 'pr-1'}
                            `}>
                                <span className="text-4xl">🏐</span>
                            </div>
                         )}
                        <div className={`flex items-center gap-2 md:gap-3 z-10 
                            ${isVertical ? '' : 'flex-row-reverse'}
                        `}>
                            <div className="w-8 h-8 md:w-12 md:h-12 bg-white rounded p-1 shadow-md relative">
                                {teamB.logoUrl ? <img src={teamB.logoUrl} className="w-full h-full object-contain" /> : <div className="text-red-900 font-bold text-lg md:text-xl flex items-center justify-center h-full">{teamB.name[0]}</div>}
                                {match.servingTeamId === teamB.id && <div className="absolute -top-1 -right-1 text-lg bg-white rounded-full leading-none shadow-sm border border-slate-200">🏐</div>}
                            </div>
                            <div className={`flex flex-col 
                                ${isVertical ? '' : 'items-end'}
                            `}>
                                <h2 className={`text-white font-black uppercase italic tracking-tighter text-sm md:text-xl leading-none 
                                    ${isVertical ? '' : 'text-right'}
                                `}>{teamB.name}</h2>
                                <div className={`flex gap-1 mt-1 
                                    ${isVertical ? '' : 'justify-end'}
                                `}>
                                    {sets.filter(s => s.scoreB > s.scoreA && Math.max(s.scoreA, s.scoreB) >= (match.currentSet === match.config.maxSets ? match.config.tieBreakPoints : match.config.pointsPerSet)).map((_,i) => (
                                        <div key={i} className="w-2 h-2 md:w-3 md:h-3 bg-yellow-400 rounded-full border border-yellow-600"></div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className={`w-24 text-center text-3xl md:text-5xl font-black text-white tabular-nums tracking-tighter drop-shadow-md z-10 
                            ${isVertical ? 'pr-2' : 'pr-2'}
                        `}>
                            {match.scoreB}
                        </div>
                    </div>
                </div>
            </div>
          )
      )}
    </div>
  );
};

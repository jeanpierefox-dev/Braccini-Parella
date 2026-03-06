
import React, { useEffect, useRef, useState } from 'react';
import { Peer } from 'peerjs';
import { LiveMatchState, Team, Tournament, User } from '../types';
import { ScoreControl } from './ScoreControl';

interface TVOverlayProps {
  match: LiveMatchState;
  onUpdateMatch?: (updates: Partial<LiveMatchState>) => void;
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
  // Control Handlers
  onPoint?: (teamId: string, type: 'attack' | 'block' | 'ace' | 'opponent_error' | 'yellow_card' | 'red_card', playerId?: string) => void;
  onSubtractPoint?: (teamId: string) => void;
  onRequestTimeout?: (teamId: string) => void;
  onRequestSub?: (teamId: string) => void;
  onModifyRotation?: (teamId: string) => void;
  onSetServe?: (teamId: string) => void;
}

const TVOverlay: React.FC<TVOverlayProps> = ({ 
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
  isCloudConnected = true,
  onUpdateMatch,
  onPoint,
  onSubtractPoint,
  onRequestTimeout,
  onRequestSub,
  onModifyRotation,
  onSetServe
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const isViewer = currentUser?.role === 'VIEWER';
  const isAdmin = currentUser?.role === 'ADMIN' || currentUser?.role?.includes('COACH');

  // PeerJS State
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [viewerStream, setViewerStream] = useState<MediaStream | null>(null);
  
  // Controls State
  const [showControls, setShowControls] = useState(false);

  // Transition States (Stinger)
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [visibleScoreboard, setVisibleScoreboard] = useState(showScoreboard);
  const [visibleStats, setVisibleStats] = useState(showStatsOverlay);
  // const [showRotationView, setShowRotationView] = useState(false); // Removed, now using match.showRotation

  // Camera Selection State
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [showSettings, setShowSettings] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [showTikTokHelp, setShowTikTokHelp] = useState(false);
  const [showMobileHelp, setShowMobileHelp] = useState(false);
  const [showOBSHelp, setShowOBSHelp] = useState(false);
  const [showUI, setShowUI] = useState(true);

  // PeerJS Logic (Admin - Broadcaster)
  useEffect(() => {
      if (!isAdmin || !isBroadcasting || !videoRef.current || !videoRef.current.srcObject) return;

      const stream = videoRef.current.srcObject as MediaStream;
      const peer = new Peer();

      peer.on('open', (id) => {
          console.log('My peer ID is: ' + id);
          if (onUpdateMatch) {
              onUpdateMatch({ adminPeerId: id });
          }
      });

      peer.on('call', (call) => {
          call.answer(stream); // Answer the call with an A/V stream.
      });

      return () => {
          peer.destroy();
          if (onUpdateMatch) {
             // onUpdateMatch({ adminPeerId: undefined }); // Optional: clear ID on stop
          }
      };
  }, [isAdmin, isBroadcasting, selectedDeviceId]); // Re-run if camera changes

  // PeerJS Logic (Viewer - Receiver)
  useEffect(() => {
      if (!isViewer || !match.adminPeerId || viewerStream) return;

      const peer = new Peer();

      peer.on('open', () => {
          // const conn = peer.connect(match.adminPeerId!); // Not needed for stream only
          const call = peer.call(match.adminPeerId!, new MediaStream()); // Call to get stream

          call.on('stream', (remoteStream) => {
              setViewerStream(remoteStream);
              if (videoRef.current) {
                  videoRef.current.srcObject = remoteStream;
                  videoRef.current.play().catch(e => console.error("Error playing remote stream", e));
              }
          });
      });

      return () => {
          peer.destroy();
      };
  }, [isViewer, match.adminPeerId]);

  // Determine if it's "Pre-Match" based on status
  const isPreMatch = match.status === 'warmup';
  
  // Determine if set is finished
  const isSetFinished = match.status === 'finished_set';

  // Broadcast Settings
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('9:16');
  const isVertical = aspectRatio === '9:16';

  // Auto-detect orientation
  useEffect(() => {
    const handleResize = () => {
      setAspectRatio(window.innerWidth > window.innerHeight ? '16:9' : '9:16');
    };
    
    // Add listener
    window.addEventListener('resize', handleResize);
    // Initial check
    handleResize();
    
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Handle Transitions ("Stinger Effect")
  useEffect(() => {
    // Scoreboard Toggle: Sync local state with prop
    if (showScoreboard !== visibleScoreboard) {
        setVisibleScoreboard(showScoreboard);
    }
  }, [showScoreboard]); // Only run when prop changes

  useEffect(() => {
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
  }, [showStatsOverlay]); // Only run when prop changes

  // ... (rest of the code)

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
            // Stop any previous stream if it exists (though it shouldn't if we are in catch)
            if (activeStream) {
                activeStream.getTracks().forEach(track => track.stop());
                activeStream = null;
            }
            
            // Wait a bit before retrying to let the hardware release
            await new Promise(resolve => setTimeout(resolve, 500));

            // Fallback 1: Standard VGA
            const fallbackConstraints = { 
                video: { width: 640, height: 480, facingMode: 'environment' } 
            };
            console.log("Trying fallback 1:", fallbackConstraints);
            
            const stream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
            
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
            console.warn("Fallback 1 failed, trying ultimate fallback...", err2);
            
            try {
                if (!isMounted) return;
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // Fallback 2: Any video source
                const ultimateFallback = { video: true };
                console.log("Trying ultimate fallback:", ultimateFallback);
                
                const stream = await navigator.mediaDevices.getUserMedia(ultimateFallback);
                
                if (isMounted) {
                    activeStream = stream;
                    if (videoRef.current) {
                        videoRef.current.srcObject = activeStream;
                        await videoRef.current.play().catch(e => console.warn("Autoplay blocked", e));
                    }
                } else {
                    stream.getTracks().forEach(track => track.stop());
                }
            } catch (err3: any) {
                console.error("Critical Camera Error:", err3);
                if (isMounted) {
                    let msg = "No se pudo iniciar la cámara. " + (err3.message || err3.name);
                    if (err3.name === 'NotAllowedError' || err3.name === 'PermissionDeniedError') {
                        msg = "Permiso de cámara denegado. Por favor, habilítalo en la configuración del navegador.";
                    } else if (err3.name === 'NotFoundError' || err3.name === 'DevicesNotFoundError') {
                        msg = "No se encontró ninguna cámara.";
                    } else if (err3.name === 'NotReadableError' || err3.name === 'TrackStartError') {
                        msg = "La cámara está en uso por otra aplicación o no se puede acceder.";
                    }
                    setCameraError(msg);
                }
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

  // Function to toggle scoreboard safely
  const toggleScoreboard = () => {
      const newState = !visibleScoreboard;
      setVisibleScoreboard(newState);
      if (onUpdateMatch) {
          onUpdateMatch({ showScoreboard: newState });
      }
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col justify-end pb-0 font-sans bg-transparent overflow-hidden transition-all duration-300">
      
      {/* Background */}
      {(!isViewer && !cameraError) || (isViewer && viewerStream) ? (
        <video 
            ref={videoRef}
            autoPlay 
            playsInline 
            muted={!isViewer}
            className="absolute inset-0 w-full h-full object-cover"
            style={{ zIndex: -1 }} 
        />
      ) : (
        <div className={`absolute inset-0 w-full h-full ${isViewer ? 'bg-transparent' : 'bg-corp-bg'}`} style={{ zIndex: -1 }}>
            {!isViewer && (
                <>
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/40 via-corp-bg to-black"></div>
                    <div className="absolute top-0 left-0 w-full h-full opacity-20" style={{ backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)', backgroundSize: '30px 30px' }}></div>
                </>
            )}
            {/* Viewer Mode: Transparent background for OBS/Overlay usage */}
            {isViewer && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    {/* Optional: Placeholder or just transparent */}
                </div>
            )}
        </div>
      )}
      
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" style={{ zIndex: 0 }}></div>

      {/* --- STINGER TRANSITION OVERLAY --- */}
      <div 
        className={`absolute inset-0 z-50 flex items-center justify-center transition-transform duration-500 ease-in-out ${isTransitioning ? 'scale-100' : 'scale-0'} origin-center rounded-full md:rounded-none ${isVertical ? 'rotate-90' : ''}`}
        style={{ pointerEvents: 'none' }}
      >
          <div className="flex flex-col items-center animate-pulse">
              {tournament?.logoUrl ? <img src={tournament.logoUrl} className="w-48 h-48 object-contain mb-4" /> : <div className="text-9xl">🏐</div>}
          </div>
      </div>


      {/* UI Toggle Button (Always visible but subtle) */}
      {!isViewer && (
        <div className="absolute top-4 right-4 z-[60]">
            <button 
                onClick={() => setShowUI(!showUI)}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${showUI ? 'bg-white/10 text-white/50 hover:bg-white/20 hover:text-white' : 'bg-red-600 text-white animate-pulse shadow-lg'}`}
                title={showUI ? "Ocultar Interfaz (Modo Limpio)" : "Mostrar Interfaz"}
            >
                {showUI ? '👁️' : '👁️‍🗨️'}
            </button>
        </div>
      )}

      {/* --- HEADER ELEMENTS (TOP LEFT) - NAV BAR --- */}
      {showUI && (
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

                    {/* Controls Toggle */}
                    <button 
                        onClick={() => setShowControls(!showControls)}
                        className={`px-3 py-3 rounded-lg text-xs font-bold transition backdrop-blur-md border border-white/20 shadow-lg ${showControls ? 'bg-green-600 text-white' : 'bg-black/60 hover:bg-white text-white hover:text-black'}`}
                        title="Controles de Marcador"
                    >
                        🎮
                    </button>
                    
                    {/* Mobile Help Toggle */}
                    <button 
                        onClick={() => setShowMobileHelp(!showMobileHelp)}
                        className={`px-3 py-3 rounded-lg text-xs font-bold transition backdrop-blur-md border border-white/20 shadow-lg ${showMobileHelp ? 'bg-blue-600 text-white' : 'bg-black/60 hover:bg-white text-white hover:text-black'}`}
                        title="Usar Celular como Cámara"
                    >
                        📱
                    </button>

                    {/* OBS Help Toggle */}
                    <button 
                        onClick={() => setShowOBSHelp(!showOBSHelp)}
                        className={`px-3 py-3 rounded-lg text-xs font-bold transition backdrop-blur-md border border-white/20 shadow-lg ${showOBSHelp ? 'bg-purple-600 text-white' : 'bg-black/60 hover:bg-white text-white hover:text-black'}`}
                        title="Instrucciones OBS Studio"
                    >
                        🎥
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
                          <div className="flex gap-2 mb-4">
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

                          {/* Broadcast Button */}
                          {selectedDeviceId && (
                              <button 
                                  onClick={() => setIsBroadcasting(!isBroadcasting)}
                                  className={`w-full py-3 rounded text-xs font-black uppercase tracking-widest border ${isBroadcasting ? 'bg-red-600 border-red-600 text-white animate-pulse' : 'bg-green-600 border-green-600 text-white'}`}
                              >
                                  {isBroadcasting ? '🔴 Detener Transmisión' : '📡 Iniciar Transmisión'}
                              </button>
                          )}
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
      )}
      {tournament?.logoUrl && (
          <div className={`absolute z-40 transition-all duration-500 pointer-events-none origin-top-right
              ${isVertical 
                  ? 'bottom-4 right-4 scale-100 origin-bottom-right rotate-90' 
                  : 'top-6 right-4 scale-100'
              }
          `}>
              <img 
                src={tournament.logoUrl} 
                alt="Torneo" 
                className="h-16 w-16 md:h-24 md:w-24 object-contain drop-shadow-2xl opacity-100" 
              />
          </div>
      )}

      {/* TikTok & Facebook Live Buttons - Admin Only */}
      {canUseTikTok && showUI && (
        <div className="absolute top-36 right-6 landscape:top-24 landscape:right-4 portrait:bottom-24 portrait:right-4 portrait:top-auto flex flex-col items-center gap-4 opacity-100 z-20 transition-all">
           {/* Scoreboard Toggle Button */}
           <button 
             onClick={toggleScoreboard}
             className={`flex flex-col items-center gap-2 group hover:scale-105 transition`}
             title={visibleScoreboard ? "Ocultar Marcador" : "Mostrar Marcador"}
           >
               <div className={`w-12 h-12 rounded-full flex items-center justify-center border-2 transition shadow-[0_0_15px_rgba(59,130,246,0.6)] ${visibleScoreboard ? 'bg-blue-600 border-blue-400' : 'bg-black/80 border-gray-500'}`}>
                   <span className="text-2xl">🔢</span>
               </div>
               <span className="text-[8px] font-bold text-white bg-black/50 px-1 rounded">{visibleScoreboard ? 'Ocultar' : 'Mostrar'}</span>
           </button>
        </div>
      )}

      {/* --- MOBILE CAMERA HELP MODAL --- */}
      {showMobileHelp && (
          <div className="absolute inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in">
              <div className="bg-slate-900 border border-white/20 rounded-2xl max-w-lg w-full p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
                  <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-2">
                      <h3 className="text-xl font-black text-white uppercase italic">Usar Cámara del Celular</h3>
                      <button onClick={() => setShowMobileHelp(false)} className="text-slate-400 hover:text-white">✕</button>
                  </div>
                  <div className="space-y-4 text-sm text-slate-300">
                      <p>Puedes usar la cámara de tu celular de dos formas:</p>
                      
                      <div className="bg-blue-900/20 p-3 rounded border border-blue-500/30">
                          <h4 className="font-bold text-blue-200 mb-2">Opción 1: Directo en la App (Fácil)</h4>
                          <ol className="list-decimal list-inside space-y-2 marker:text-blue-500">
                              <li>Abre esta aplicación en el navegador de tu celular (Chrome/Safari).</li>
                              <li>Inicia sesión como ADMIN.</li>
                              <li>Entra al partido y activa la <strong>"Vista TV 📺"</strong>.</li>
                              <li>Toca el icono 📷 y selecciona la <strong>cámara trasera</strong> (Environment).</li>
                              <li>Gira tu celular en horizontal.</li>
                              <li>¡Listo! El marcador aparecerá sobre tu video.</li>
                          </ol>
                      </div>

                      <div className="bg-purple-900/20 p-3 rounded border border-purple-500/30">
                          <h4 className="font-bold text-purple-200 mb-2">Opción 2: Con OBS Studio (Profesional)</h4>
                          <p className="mb-2">Para enviar el video de tu celular a OBS en tu PC sin cables:</p>
                          <ol className="list-decimal list-inside space-y-2 marker:text-purple-500">
                              <li>Instala la app <strong>VDO.Ninja</strong> (o usa vdo.ninja en el navegador del celular).</li>
                              <li>Selecciona "Add your Camera to OBS".</li>
                              <li>Escanea el código QR o copia el enlace generado.</li>
                              <li>En OBS (en tu PC), añade una fuente de <strong>"Navegador"</strong> y pega ese enlace.</li>
                              <li>Coloca esa capa de video <em>debajo</em> de la captura de esta aplicación.</li>
                          </ol>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* --- OBS HELP MODAL --- */}
      {showOBSHelp && (
          <div className="absolute inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in">
              <div className="bg-slate-900 border border-white/20 rounded-2xl max-w-lg w-full p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
                  <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-2">
                      <h3 className="text-xl font-black text-white uppercase italic">Transmitir con OBS Studio</h3>
                      <button onClick={() => setShowOBSHelp(false)} className="text-slate-400 hover:text-white">✕</button>
                  </div>
                  <div className="space-y-4 text-sm text-slate-300">
                      <p>Para una transmisión profesional a Facebook, YouTube o Twitch, usa <strong>OBS Studio</strong>.</p>
                      
                      <div className="bg-black/40 p-3 rounded border border-white/5">
                          <h4 className="font-bold text-white mb-2">Pasos para Configurar:</h4>
                          <ol className="list-decimal list-inside space-y-2 marker:text-purple-500">
                              <li>Descarga e instala <a href="https://obsproject.com/" target="_blank" className="text-purple-400 underline hover:text-purple-300">OBS Studio</a>.</li>
                              <li>En OBS, ve al panel de <strong>"Fuentes"</strong> (Sources) y haz clic en el botón <strong>+</strong>.</li>
                              <li>Selecciona <strong>"Captura de Ventana"</strong> (Window Capture).</li>
                              <li>Elige la ventana de tu navegador donde está esta aplicación.</li>
                              <li>Si quieres usar tu cámara web, añade una fuente de <strong>"Dispositivo de Captura de Video"</strong> y colócala <em>debajo</em> de la capa del marcador.</li>
                              <li>Ajusta el tamaño y posición de los elementos en la vista previa.</li>
                              <li>Ve a <strong>Ajustes &gt; Emisión</strong>, selecciona tu servicio (Facebook Live, YouTube, etc.) y pega tu Clave de Transmisión.</li>
                              <li>Haz clic en <strong>"Iniciar Transmisión"</strong>.</li>
                          </ol>
                      </div>
                      
                      <div className="bg-purple-900/20 p-3 rounded border border-purple-500/30">
                          <h4 className="font-bold text-purple-200 mb-1">💡 Tip Pro:</h4>
                          <p className="text-xs">
                              Para un fondo transparente perfecto, asegúrate de que no haya ninguna cámara activa en esta aplicación (usa el botón 📷 para desactivarla si es necesario). El fondo negro/transparente se puede eliminar en OBS usando un filtro de "Clave de Color" (Color Key) si es necesario, pero esta vista ya está optimizada.
                          </p>
                      </div>

                      <button 
                        onClick={() => window.open('https://obsproject.com/', '_blank')}
                        className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 rounded uppercase tracking-widest mt-2 shadow-lg"
                      >
                          Descargar OBS Studio
                      </button>
                  </div>
              </div>
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
      {match.showRotation && (
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
                                      const player = match.rotationA[pos - 1];
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
                                      const player = match.rotationA[pos - 1];
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
                                      const player = match.rotationB[pos - 1];
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
                                      const player = match.rotationB[pos - 1];
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
      )}

      {/* --- COMPARATIVE STATS OVERLAY --- */}
      {visibleStats && !matchEnded && !match.showRotation && (
        <div className={`absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-full max-w-3xl px-2 z-40 transition-transform 
            ${isVertical ? 'rotate-90 scale-75 origin-center h-[50vh] w-[80vh] flex items-center justify-center' : 'scale-90 md:scale-100'}
        `}>
            <div className="bg-[#0000FF] border-4 border-[#facc15] rounded-3xl overflow-hidden shadow-[0_0_30px_rgba(250,204,21,0.4)] w-full">
                 <div className="bg-[#dc2626] p-6 flex justify-between items-end border-b-4 border-[#facc15]">
                    <div className="flex flex-col items-center w-1/4">
                         {teamA.logoUrl ? <img src={teamA.logoUrl} className="w-14 h-14 object-contain bg-white rounded-lg p-1" /> : <div className="w-14 h-14 bg-blue-900 rounded-lg flex items-center justify-center font-bold text-2xl">{teamA.name[0]}</div>}
                         <span className="text-white font-black uppercase text-xs mt-2 text-center">{teamA.name}</span>
                    </div>
                    <div className="flex flex-col items-center mb-2">
                         <span className="text-[#facc15] font-black italic text-3xl drop-shadow-[0_2px_0_rgba(220,38,38,0.8)]">VS</span>
                         <span className="text-white text-[10px] uppercase font-bold tracking-[0.2em]">
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
                        { l: statsA.attacks, label: 'ATAQUES', r: statsB.attacks, c: 'text-[#facc15]', bg: 'bg-[#0000FF] border-[#facc15]/30' },
                        { l: statsA.blocks, label: 'BLOQUEOS', r: statsB.blocks, c: 'text-white', bg: 'bg-[#0000FF] border-[#facc15]/30' },
                        { l: statsA.aces, label: 'ACES', r: statsB.aces, c: 'text-white', bg: 'bg-[#0000FF] border-[#facc15]/30' },
                        { l: statsA.errors, label: 'ERRORES', r: statsB.errors, c: 'text-red-200', bg: 'bg-[#0000FF] border-[#facc15]/30' }
                     ].map((row, idx) => (
                        <div key={idx} className={`flex items-center py-3 border ${row.bg} rounded-lg mb-1`}>
                           <div className={`w-1/3 text-center text-2xl font-black font-mono ${row.c} drop-shadow-sm`}>{row.l}</div>
                           <div className="w-1/3 text-center text-xs font-bold text-white uppercase tracking-widest opacity-80">{row.label}</div>
                           <div className={`w-1/3 text-center text-2xl font-black font-mono ${row.c} drop-shadow-sm`}>{row.r}</div>
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
          visibleScoreboard && !isPreMatch && !match.showRotation && (
            <div className={`relative z-10 transition-all duration-300
                ${isVertical 
                    ? 'absolute top-0 left-0 h-full w-32 md:w-40 flex items-center justify-center pointer-events-none' 
                    : 'absolute bottom-4 md:bottom-10 left-1/2 -translate-x-1/2 w-[98%] md:w-full max-w-5xl pointer-events-none'
                }
            `}>
                <div className={`bg-white border-4 border-[#facc15] rounded-xl md:rounded-2xl overflow-hidden shadow-[0_0_30px_rgba(250,204,21,0.3)] flex items-stretch pointer-events-auto shrink-0
                    ${isVertical 
                        ? 'rotate-90 origin-center w-[50vh] max-w-none h-12 md:h-16' 
                        : 'w-full flex-row h-14 md:h-24'
                    }
                `}>
                    
                    {/* Tournament Logo (Vertical Only - Start) - REMOVED */}


                    {/* Team A Section */}
                    <div className="flex-1 flex items-center relative h-full px-2 md:px-4 bg-[#0000FF]">
                        {/* Logo */}
                        <div className="bg-white/20 rounded-lg border border-white/20 shadow-lg relative flex-shrink-0 flex items-center justify-center w-8 h-8 md:w-16 md:h-16 p-0.5 md:p-2 mr-1 md:mr-4">
                            {teamA.logoUrl ? <img src={teamA.logoUrl} className="w-full h-full object-contain" /> : <div className="text-blue-400 font-bold text-xs md:text-lg">{teamA.name[0]}</div>}
                            {match.servingTeamId === teamA.id && <div className="absolute -top-1 -left-1 text-[8px] md:text-sm bg-white rounded-full leading-none shadow-sm border border-slate-200">🏐</div>}
                        </div>
                        
                        {/* Name */}
                        <div className="flex-1 min-w-0 flex flex-col justify-center mr-1 md:mr-4">
                            <h2 className={`text-white font-black uppercase italic tracking-tighter leading-none truncate ${isVertical ? 'text-[8px] md:text-xl' : 'text-[10px] md:text-2xl'}`}>{teamA.name}</h2>
                            <div className="flex gap-0.5 md:gap-1 mt-0.5 md:mt-1">
                                {sets.filter(s => s.scoreA > s.scoreB && Math.max(s.scoreA, s.scoreB) >= (match.currentSet === match.config.maxSets ? match.config.tieBreakPoints : match.config.pointsPerSet)).map((_,i) => (
                                    <div key={i} className="w-1.5 h-1.5 md:w-3 md:h-3 bg-[#facc15] rounded-full border border-yellow-600 shadow-[0_0_5px_rgba(250,204,21,0.6)]"></div>
                                ))}
                            </div>
                        </div>

                        {/* Score */}
                        <div className="flex items-center justify-center bg-white rounded md:rounded-xl border-2 border-[#0000FF] shadow-lg w-10 md:w-28 h-8 md:h-16">
                            <span className={`font-black text-[#0000FF] tabular-nums tracking-tighter leading-none ${isVertical ? 'text-lg md:text-4xl' : 'text-xl md:text-6xl'}`}>
                                {match.scoreA}
                            </span>
                        </div>
                    </div>

                    {/* Center Info */}
                    <div className="flex flex-col items-center justify-center border-x-2 border-[#facc15] z-10 relative flex-shrink-0 bg-[#facc15] w-14 md:w-40 h-full px-1">
                        {tournament?.logoUrl && (
                            <img src={tournament.logoUrl} className="h-4 md:h-10 object-contain mb-0.5 drop-shadow-sm" />
                        )}
                        <div className="flex items-center gap-1">
                            <div className="text-[6px] md:text-[10px] text-[#dc2626] font-bold uppercase tracking-widest">Set {match.currentSet}</div>
                            {!tournament?.logoUrl && (
                                <div className={`text-[6px] md:text-xs font-bold px-1 md:px-1.5 py-0.5 rounded ${isSetFinished ? 'bg-white text-[#dc2626]' : 'bg-white text-[#dc2626] animate-pulse'}`}>
                                    {isSetFinished ? 'FIN' : 'LIVE'}
                                </div>
                            )}
                        </div>
                        <div className="flex gap-0.5 md:gap-1 mt-0.5">
                            {sets.map((s, i) => (
                                (s.scoreA > 0 || s.scoreB > 0) && i < match.currentSet - 1 && (
                                    <div key={i} className="text-[6px] md:text-[9px] text-[#dc2626] font-mono font-bold">
                                        {s.scoreA}-{s.scoreB}
                                    </div>
                                )
                            ))}
                        </div>
                    </div>

                    {/* Team B Section */}
                    <div className="flex-1 flex items-center relative h-full px-2 md:px-4 flex-row-reverse bg-[#dc2626]">
                         {/* Logo */}
                        <div className="bg-white/20 rounded-lg border border-white/20 shadow-lg relative flex-shrink-0 flex items-center justify-center w-8 h-8 md:w-16 md:h-16 p-0.5 md:p-2 ml-1 md:ml-4">
                            {teamB.logoUrl ? <img src={teamB.logoUrl} className="w-full h-full object-contain" /> : <div className="text-red-400 font-bold text-xs md:text-lg">{teamB.name[0]}</div>}
                            {match.servingTeamId === teamB.id && <div className="absolute -top-1 -right-1 text-[8px] md:text-sm bg-white rounded-full leading-none shadow-sm border border-slate-200">🏐</div>}
                        </div>
                        
                        {/* Name */}
                        <div className="flex-1 min-w-0 flex flex-col justify-center ml-1 md:ml-4 items-end text-right">
                            <h2 className={`text-white font-black uppercase italic tracking-tighter leading-none truncate ${isVertical ? 'text-[8px] md:text-xl' : 'text-[10px] md:text-2xl'}`}>{teamB.name}</h2>
                            <div className="flex gap-0.5 md:gap-1 mt-0.5 md:mt-1 justify-end">
                                {sets.filter(s => s.scoreB > s.scoreA && Math.max(s.scoreA, s.scoreB) >= (match.currentSet === match.config.maxSets ? match.config.tieBreakPoints : match.config.pointsPerSet)).map((_,i) => (
                                    <div key={i} className="w-1.5 h-1.5 md:w-3 md:h-3 bg-[#facc15] rounded-full border border-yellow-600 shadow-[0_0_5px_rgba(250,204,21,0.6)]"></div>
                                ))}
                            </div>
                        </div>

                        {/* Score */}
                        <div className="flex items-center justify-center bg-white rounded md:rounded-xl border-2 border-[#dc2626] shadow-lg w-10 md:w-28 h-8 md:h-16">
                            <span className={`font-black text-[#dc2626] tabular-nums tracking-tighter leading-none ${isVertical ? 'text-lg md:text-4xl' : 'text-xl md:text-6xl'}`}>
                                {match.scoreB}
                            </span>
                        </div>
                    </div>

                    {/* Tournament Logo (Horizontal Only - End) - REMOVED */}

                </div>
            </div>
          )
      )}

      {/* --- CONTROLS OVERLAY --- */}
      {showControls && isAdmin && onPoint && (
          <div className="absolute inset-x-0 bottom-0 z-50 bg-black/80 backdrop-blur-xl border-t border-white/20 p-4 animate-in slide-in-from-bottom-10 max-h-[60vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-black text-white uppercase italic">Controles de Partido</h3>
                  <button onClick={() => setShowControls(false)} className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded font-bold uppercase text-xs">Cerrar</button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Team A Controls */}
                  <ScoreControl 
                      role={currentUser?.role as any}
                      linkedTeamId={currentUser?.linkedTeamId}
                      onPoint={onPoint}
                      onSubtractPoint={onSubtractPoint}
                      onRequestTimeout={onRequestTimeout!}
                      onRequestSub={onRequestSub!}
                      onModifyRotation={onModifyRotation!}
                      onSetServe={onSetServe!}
                      teamId={teamA.id}
                      teamName={teamA.name}
                      players={match.rotationA}
                      disabled={match.status === 'finished'}
                      timeoutsUsed={match.timeoutsA}
                      subsUsed={match.substitutionsA}
                      isServing={match.servingTeamId === teamA.id}
                  />

                  {/* Team B Controls */}
                  <ScoreControl 
                      role={currentUser?.role as any}
                      linkedTeamId={currentUser?.linkedTeamId}
                      onPoint={onPoint}
                      onSubtractPoint={onSubtractPoint}
                      onRequestTimeout={onRequestTimeout!}
                      onRequestSub={onRequestSub!}
                      onModifyRotation={onModifyRotation!}
                      onSetServe={onSetServe!}
                      teamId={teamB.id}
                      teamName={teamB.name}
                      players={match.rotationB}
                      disabled={match.status === 'finished'}
                      timeoutsUsed={match.timeoutsB}
                      subsUsed={match.substitutionsB}
                      isServing={match.servingTeamId === teamB.id}
                  />
              </div>
          </div>
      )}

    </div>
  );
};

export default TVOverlay;

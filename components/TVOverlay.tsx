import { useState, useEffect, useRef } from 'react';
import { LiveMatchState, Player, Tournament } from '../types';

interface TVOverlayProps {
  match: LiveMatchState;
  teamA: { id: string, name: string, logoUrl?: string, players: Player[] };
  teamB: { id: string, name: string, logoUrl?: string, players: Player[] };
  tournament?: Tournament;
  currentUser: any;
  onExit: () => void;
  onLogout?: () => void;
  onBack?: () => void;
  onNextSet?: () => void;
  nextSetCountdown?: number | null;
  
  // Cloud State
  showStatsOverlay: boolean;
  showScoreboard: boolean;
  isCloudConnected: boolean;
  onUpdateMatch?: (updates: Partial<LiveMatchState>) => void;

  // Control Handlers
  onPoint?: (teamId: string) => void;
  onSubtractPoint?: (teamId: string) => void;
  onRequestTimeout?: (teamId: string) => void;
  onRequestSub?: (teamId: string) => void;
  onModifyRotation?: (teamId: string) => void;
  onSetServe?: (teamId: string) => void;
}

export default function TVOverlay({ 
  match, 
  teamA, 
  teamB, 
  tournament,
  currentUser,
  onExit, 
  onNextSet,
  nextSetCountdown,
  showScoreboard,
  isCloudConnected,
  onPoint,
  onSubtractPoint,
  onRequestTimeout,
  onRequestSub,
  onModifyRotation,
  onSetServe
}: TVOverlayProps) {
  const [showControls, setShowControls] = useState(false);
  const [visibleScoreboard, setVisibleScoreboard] = useState(showScoreboard);
  const [isVertical, setIsVertical] = useState(window.innerHeight > window.innerWidth);
  const [showMobileHelp, setShowMobileHelp] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isBroadcasting, setIsBroadcasting] = useState(false); // Mock broadcasting state
  
  // Sync local state with props (cloud updates)
  useEffect(() => {
      setVisibleScoreboard(showScoreboard);
  }, [showScoreboard]);

  // Handle Resize for Responsive Layout
  useEffect(() => {
      const handleResize = () => setIsVertical(window.innerHeight > window.innerWidth);
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Camera Handling
  const startCamera = async () => {
      try {
          const stream = await navigator.mediaDevices.getUserMedia({ 
              video: { 
                  facingMode: 'environment', // Use back camera on mobile
                  width: { ideal: 1920 },
                  height: { ideal: 1080 }
              }, 
              audio: false 
          });
          setCameraStream(stream);
          if (videoRef.current) {
              videoRef.current.srcObject = stream;
          }
      } catch (err) {
          console.error("Error accessing camera:", err);
          alert("No se pudo acceder a la cámara. Asegúrate de dar permisos.");
      }
  };

  const stopCamera = () => {
      if (cameraStream) {
          cameraStream.getTracks().forEach(track => track.stop());
          setCameraStream(null);
      }
  };

  // Cleanup on unmount
  useEffect(() => {
      return () => stopCamera();
  }, []);

  const sets = match.sets;
  const isSetFinished = match.status === 'finished_set';
  const isMatchFinished = match.status === 'finished';
  const isPreMatch = match.status === 'warmup';
  
  // Determine winner if finished
  let winner = null;
  if (isMatchFinished) {
      const setsA = sets.filter(s => s.scoreA > s.scoreB).length;
      const setsB = sets.filter(s => s.scoreB > s.scoreA).length;
      winner = setsA > setsB ? teamA : teamB;
  }

  const isAdmin = currentUser?.role === 'ADMIN' || currentUser?.role === 'REFEREE';
  const canUseTikTok = true; // Placeholder for feature flag

  // Calculate if match ended
  const matchEnded = match.status === 'finished';

  return (
    <div className="fixed inset-0 bg-black text-white overflow-hidden z-[100]">
      {/* BACKGROUND VIDEO LAYER */}
      {cameraStream ? (
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            muted 
            className="absolute inset-0 w-full h-full object-cover z-0"
          />
      ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-blue-900 to-black z-0">
              {/* Animated Background Elements */}
              <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]"></div>
              <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-black/40 via-transparent to-black/60"></div>
          </div>
      )}

      {/* --- TOP BAR (Always Visible, Auto-Hide on Idle could be added) --- */}
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start z-50 bg-gradient-to-b from-black/80 to-transparent">
          <div className="flex gap-2">
              <button onClick={onExit} className="bg-white/10 hover:bg-white/20 backdrop-blur-md px-3 py-1.5 rounded text-xs font-bold uppercase border border-white/10 transition">
                  ✕ Salir
              </button>
              {cameraStream ? (
                  <button onClick={stopCamera} className="bg-red-600/80 hover:bg-red-500 backdrop-blur-md px-3 py-1.5 rounded text-xs font-bold uppercase border border-red-400 transition animate-pulse">
                      📷 Apagar Cam
                  </button>
              ) : (
                  <button onClick={startCamera} className="bg-blue-600/80 hover:bg-blue-500 backdrop-blur-md px-3 py-1.5 rounded text-xs font-bold uppercase border border-blue-400 transition">
                      📷 Usar Cam
                  </button>
              )}
              <button onClick={() => setShowMobileHelp(true)} className="bg-white/10 hover:bg-white/20 backdrop-blur-md w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border border-white/10 transition">
                  ?
              </button>
          </div>

          <div className="flex gap-2">
               {isAdmin && (
                   <button onClick={() => setShowControls(!showControls)} className="bg-vnl-accent hover:bg-cyan-400 text-black px-3 py-1.5 rounded text-xs font-black uppercase shadow-[0_0_15px_rgba(6,182,212,0.4)] transition">
                       {showControls ? 'Ocultar Controles' : 'Controles'}
                   </button>
               )}
          </div>
      </div>

      {/* --- MAIN CONTENT AREA --- */}
      
      {/* MATCH FINISHED OVERLAY */}
      {matchEnded && winner ? (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in zoom-in duration-500">
             <div className="bg-slate-900 border border-white/20 rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden relative">
                 <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-purple-500/10"></div>
                 <div className="relative z-10">
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
          </div>
      ) : (
          /* --- SCOREBOARD (RESPONSIVE VERTICAL/HORIZONTAL) --- */
          visibleScoreboard && !isPreMatch && !match.showRotation && (
            <div className={`relative z-10 transition-all duration-300
                ${isVertical 
                    ? 'fixed top-0 bottom-0 right-0 w-20 flex items-center justify-center pointer-events-none' 
                    : 'absolute bottom-10 left-1/2 -translate-x-1/2 w-full max-w-5xl pointer-events-none'
                }
            `}>
                {/* Independent Logo for Vertical Mode - Top Left (Rotated for CW) */}
                {tournament?.logoUrl && isVertical && (
                    <div className="fixed top-8 left-8 z-50 pointer-events-auto transition-all duration-500 origin-center rotate-90">
                        <img 
                            src={tournament.logoUrl} 
                            alt="Torneo" 
                            className="h-24 w-24 object-contain drop-shadow-2xl opacity-100" 
                        />
                    </div>
                )}

                <div className={`bg-black/80 backdrop-blur-md border border-white/20 rounded-2xl overflow-hidden shadow-2xl flex items-stretch pointer-events-auto
                    ${isVertical 
                        ? 'rotate-90 origin-center w-[80vh] max-w-[600px] flex-row-reverse' 
                        : 'w-full flex-row h-20 md:h-24'
                    }
                `}>
                    
                    {/* Tournament Logo (Integrated - Horizontal Only) */}
                    {tournament?.logoUrl && !isVertical && (
                        <div className="bg-white/5 px-4 flex items-center justify-center border-r border-white/10">
                            <img src={tournament.logoUrl} className="h-12 w-12 object-contain drop-shadow" />
                        </div>
                    )}

                    {/* Team A Section */}
                    <div className="flex-1 flex items-center relative h-full px-4 bg-gradient-to-r from-blue-900/40 to-transparent">
                        {/* Logo */}
                        <div className="bg-white/10 rounded-lg border border-white/10 shadow-lg relative flex-shrink-0 flex items-center justify-center w-12 h-12 md:w-16 md:h-16 p-1 md:p-2 mr-3 md:mr-4">
                            {teamA.logoUrl ? <img src={teamA.logoUrl} className="w-full h-full object-contain" /> : <div className="text-blue-400 font-bold text-lg">{teamA.name[0]}</div>}
                            {match.servingTeamId === teamA.id && <div className="absolute -top-1 -left-1 text-sm bg-white rounded-full leading-none shadow-sm border border-slate-200">🏐</div>}
                        </div>
                        
                        {/* Name */}
                        <div className="flex-1 min-w-0 flex flex-col justify-center mr-2 md:mr-4">
                            <h2 className="text-white font-black uppercase italic tracking-tighter leading-none truncate text-sm md:text-2xl">{teamA.name}</h2>
                            <div className="flex gap-1 mt-1">
                                {sets.filter(s => s.scoreA > s.scoreB && Math.max(s.scoreA, s.scoreB) >= (match.currentSet === match.config.maxSets ? match.config.tieBreakPoints : match.config.pointsPerSet)).map((_,i) => (
                                    <div key={i} className="w-1.5 h-1.5 md:w-3 md:h-3 bg-yellow-400 rounded-full border border-yellow-600 shadow-[0_0_5px_rgba(250,204,21,0.6)]"></div>
                                ))}
                            </div>
                        </div>

                        {/* Score */}
                        <div className="flex items-center justify-center bg-black/40 rounded-xl border border-white/10 shadow-inner w-20 md:w-28 h-14 md:h-16">
                            <span className="font-black text-white tabular-nums tracking-tighter drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] leading-none text-4xl md:text-6xl">
                                {match.scoreA}
                            </span>
                        </div>
                    </div>

                    {/* Center Info */}
                    <div className="flex flex-col items-center justify-center border-x border-white/10 z-10 relative flex-shrink-0 bg-black/50 w-20 md:w-32 h-full">
                        <div className="text-[8px] md:text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-0.5">Set {match.currentSet}</div>
                        <div className={`text-[8px] md:text-xs font-bold text-white px-1.5 py-0.5 rounded ${isSetFinished ? 'bg-yellow-500 text-black' : 'bg-red-600 animate-pulse'}`}>
                            {isSetFinished ? 'FIN' : 'LIVE'}
                        </div>
                        <div className="flex gap-1 mt-2">
                            {sets.map((s, i) => (
                                (s.scoreA > 0 || s.scoreB > 0) && i < match.currentSet - 1 && (
                                    <div key={i} className="text-[9px] text-slate-400 font-mono font-bold">
                                        {s.scoreA}-{s.scoreB}
                                    </div>
                                )
                            ))}
                        </div>
                    </div>

                    {/* Team B Section */}
                    <div className="flex-1 flex items-center relative h-full px-4 flex-row-reverse bg-gradient-to-l from-red-900/40 to-transparent">
                         {/* Logo */}
                        <div className="bg-white/10 rounded-lg border border-white/10 shadow-lg relative flex-shrink-0 flex items-center justify-center w-12 h-12 md:w-16 md:h-16 p-1 md:p-2 ml-3 md:ml-4">
                            {teamB.logoUrl ? <img src={teamB.logoUrl} className="w-full h-full object-contain" /> : <div className="text-red-400 font-bold text-lg">{teamB.name[0]}</div>}
                            {match.servingTeamId === teamB.id && <div className="absolute -top-1 -right-1 text-sm bg-white rounded-full leading-none shadow-sm border border-slate-200">🏐</div>}
                        </div>
                        
                        {/* Name */}
                        <div className="flex-1 min-w-0 flex flex-col justify-center ml-2 md:ml-4 items-end text-right">
                            <h2 className="text-white font-black uppercase italic tracking-tighter leading-none truncate text-sm md:text-2xl">{teamB.name}</h2>
                            <div className="flex gap-1 mt-1 justify-end">
                                {sets.filter(s => s.scoreB > s.scoreA && Math.max(s.scoreA, s.scoreB) >= (match.currentSet === match.config.maxSets ? match.config.tieBreakPoints : match.config.pointsPerSet)).map((_,i) => (
                                    <div key={i} className="w-1.5 h-1.5 md:w-3 md:h-3 bg-yellow-400 rounded-full border border-yellow-600 shadow-[0_0_5px_rgba(250,204,21,0.6)]"></div>
                                ))}
                            </div>
                        </div>

                        {/* Score */}
                        <div className="flex items-center justify-center bg-black/40 rounded-xl border border-white/10 shadow-inner w-20 md:w-28 h-14 md:h-16">
                            <span className="font-black text-white tabular-nums tracking-tighter drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] leading-none text-4xl md:text-6xl">
                                {match.scoreB}
                            </span>
                        </div>
                    </div>
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
                  <div className="bg-blue-900/20 p-4 rounded-xl border border-blue-500/30">
                      <div className="flex justify-between items-center mb-4">
                          <h4 className="font-bold text-blue-200 uppercase">{teamA.name}</h4>
                          <span className="text-2xl font-black text-white">{match.scoreA}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                          <button onClick={() => onPoint(teamA.id)} className="bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-lg font-black text-xl shadow-lg active:scale-95 transition">
                              +1 Punto
                          </button>
                          <button onClick={() => onSubtractPoint && onSubtractPoint(teamA.id)} className="bg-white/5 hover:bg-white/10 text-slate-300 py-4 rounded-lg font-bold text-sm border border-white/10">
                              -1 Corregir
                          </button>
                          <button onClick={() => onRequestTimeout && onRequestTimeout(teamA.id)} className="bg-yellow-600/20 hover:bg-yellow-600/40 text-yellow-400 py-2 rounded font-bold text-xs border border-yellow-600/30 uppercase">
                              Tiempo Fuera
                          </button>
                          <button onClick={() => onRequestSub && onRequestSub(teamA.id)} className="bg-purple-600/20 hover:bg-purple-600/40 text-purple-400 py-2 rounded font-bold text-xs border border-purple-600/30 uppercase">
                              Cambio
                          </button>
                          <button onClick={() => onSetServe && onSetServe(teamA.id)} className={`col-span-2 py-2 rounded font-bold text-xs border uppercase ${match.servingTeamId === teamA.id ? 'bg-green-600 text-white border-green-500' : 'bg-white/5 text-slate-400 border-white/10'}`}>
                              {match.servingTeamId === teamA.id ? '🏐 Al Saque' : 'Definir Saque'}
                          </button>
                      </div>
                  </div>

                  {/* Team B Controls */}
                  <div className="bg-red-900/20 p-4 rounded-xl border border-red-500/30">
                      <div className="flex justify-between items-center mb-4">
                          <h4 className="font-bold text-red-200 uppercase">{teamB.name}</h4>
                          <span className="text-2xl font-black text-white">{match.scoreB}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                          <button onClick={() => onPoint(teamB.id)} className="bg-red-600 hover:bg-red-500 text-white py-4 rounded-lg font-black text-xl shadow-lg active:scale-95 transition">
                              +1 Punto
                          </button>
                          <button onClick={() => onSubtractPoint && onSubtractPoint(teamB.id)} className="bg-white/5 hover:bg-white/10 text-slate-300 py-4 rounded-lg font-bold text-sm border border-white/10">
                              -1 Corregir
                          </button>
                          <button onClick={() => onRequestTimeout && onRequestTimeout(teamB.id)} className="bg-yellow-600/20 hover:bg-yellow-600/40 text-yellow-400 py-2 rounded font-bold text-xs border border-yellow-600/30 uppercase">
                              Tiempo Fuera
                          </button>
                          <button onClick={() => onRequestSub && onRequestSub(teamB.id)} className="bg-purple-600/20 hover:bg-purple-600/40 text-purple-400 py-2 rounded font-bold text-xs border border-purple-600/30 uppercase">
                              Cambio
                          </button>
                          <button onClick={() => onSetServe && onSetServe(teamB.id)} className={`col-span-2 py-2 rounded font-bold text-xs border uppercase ${match.servingTeamId === teamB.id ? 'bg-green-600 text-white border-green-500' : 'bg-white/5 text-slate-400 border-white/10'}`}>
                              {match.servingTeamId === teamB.id ? '🏐 Al Saque' : 'Definir Saque'}
                          </button>
                      </div>
                  </div>
              </div>

              {/* General Controls */}
              <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
                  <button onClick={() => onModifyRotation && onModifyRotation(teamA.id)} className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-3 rounded font-bold text-xs uppercase whitespace-nowrap">
                      Rotación A
                  </button>
                  <button onClick={() => onModifyRotation && onModifyRotation(teamB.id)} className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-3 rounded font-bold text-xs uppercase whitespace-nowrap">
                      Rotación B
                  </button>
                  {/* Broadcast Button */}
                  {canUseTikTok && (
                      <div className="ml-auto">
                          {isBroadcasting ? (
                              <button 
                                  onClick={() => setIsBroadcasting(false)}
                                  className="bg-red-600 hover:bg-red-500 text-white px-4 py-3 rounded font-bold text-xs uppercase whitespace-nowrap animate-pulse shadow-[0_0_15px_rgba(220,38,38,0.6)]"
                              >
                                  🔴 Detener Live
                              </button>
                          ) : (
                              <button 
                                  onClick={() => setIsBroadcasting(true)}
                                  className="bg-green-600 hover:bg-green-500 text-white px-4 py-3 rounded font-bold text-xs uppercase whitespace-nowrap shadow-lg"
                              >
                                  📡 Iniciar Live
                              </button>
                          )}
                      </div>
                  )}
              </div>
          </div>
      )}

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

      {/* TikTok & Facebook Live Buttons - Admin Only */}
      {canUseTikTok && (
        <div className="absolute top-36 right-6 landscape:top-24 landscape:right-4 portrait:bottom-24 portrait:right-4 portrait:top-auto flex flex-col items-center gap-4 opacity-100 z-20 transition-all">
           {/* Scoreboard Toggle Button */}
           <button 
             onClick={() => setVisibleScoreboard(!visibleScoreboard)}
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
    </div>
  );
}

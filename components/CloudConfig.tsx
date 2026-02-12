
import React, { useState, useEffect } from 'react';
import { loadConfig, saveConfig, initCloud, testConnection, generateSyncLink } from '../services/cloud';
import { User } from '../types';

interface CloudConfigProps {
    onClose: () => void;
    onConnected: () => void;
    currentUser?: User | null;
}

export const CloudConfig: React.FC<CloudConfigProps> = ({ onClose, onConnected, currentUser }) => {
    // Config State
    const [apiKey, setApiKey] = useState('');
    const [authDomain, setAuthDomain] = useState('');
    const [databaseURL, setDatabaseURL] = useState('');
    const [projectId, setProjectId] = useState('');
    const [storageBucket, setStorageBucket] = useState('');
    const [messagingSenderId, setMessagingSenderId] = useState('');
    const [appId, setAppId] = useState('');
    const [orgId, setOrgId] = useState('mi-liga-voley');
    
    // UI State
    const [jsonInput, setJsonInput] = useState('');
    const [showJsonMode, setShowJsonMode] = useState(true);
    const [isTesting, setIsTesting] = useState(false);
    const [isConnected, setIsConnected] = useState(false);

    // Permission logic: 
    // - If no user logged in (Login screen), allow editing.
    // - If user logged in, only allow editing if Admin.
    const canEdit = !currentUser || currentUser.role === 'ADMIN';

    useEffect(() => {
        const existing = loadConfig();
        if (existing) {
            const c = existing.config;
            setApiKey(c.apiKey || '');
            setAuthDomain(c.authDomain || '');
            setDatabaseURL(c.databaseURL || '');
            setProjectId(c.projectId || '');
            setStorageBucket(c.storageBucket || '');
            setMessagingSenderId(c.messagingSenderId || '');
            setAppId(c.appId || '');
            setOrgId(existing.organizationId || 'mi-liga-voley');
            setIsConnected(true);
            
            // If config exists, default to manual view so the ID is visible
            setShowJsonMode(false);
        }
    }, []);

    const parseJson = () => {
        try {
            let input = jsonInput;
            const start = input.indexOf('{');
            const end = input.lastIndexOf('}');
            
            if (start === -1 || end === -1) throw new Error("Formato no reconocido");

            let jsonBody = input.substring(start, end + 1);
            // Relaxed parsing for "const x =" or raw JSON
            jsonBody = jsonBody.replace(/(\w+)\s*:/g, '"$1":'); // key: value -> "key": value
            jsonBody = jsonBody.replace(/'/g, '"'); // 'value' -> "value"
            jsonBody = jsonBody.replace(/,\s*}/g, '}'); // remove trailing commas

            const config = JSON.parse(jsonBody);
            
            if (config.apiKey) setApiKey(config.apiKey);
            if (config.authDomain) setAuthDomain(config.authDomain);
            if (config.projectId) setProjectId(config.projectId);
            if (config.storageBucket) setStorageBucket(config.storageBucket);
            if (config.messagingSenderId) setMessagingSenderId(config.messagingSenderId);
            if (config.appId) setAppId(config.appId);
            
            if (config.databaseURL) {
                setDatabaseURL(config.databaseURL);
                setShowJsonMode(false);
            } else {
                setShowJsonMode(false);
                setTimeout(() => {
                    alert("⚠️ Aviso: Falta 'databaseURL'. Por favor pégala manualmente.");
                }, 200);
            }
        } catch (e) {
            alert("No se pudo leer el código. Asegúrate de copiar todo el bloque {} correctamente.");
        }
    };

    const handleConnectManual = async () => {
        const config = { apiKey, authDomain, databaseURL, projectId, storageBucket, messagingSenderId, appId };
        if (!databaseURL) {
            alert("❌ Falta la 'Database URL'.");
            return;
        }

        setIsTesting(true);
        // Initialize
        const initSuccess = initCloud(config, orgId);
        
        if (!initSuccess) {
            setIsTesting(false);
            alert("Error: Datos de configuración inválidos.");
            return;
        }

        // Test
        const testResult = await testConnection();
        setIsTesting(false);

        if (testResult.success) {
            saveConfig(config, orgId);
            setIsConnected(true);
            onConnected();
            alert("✅ ¡Conectado y Sincronizado!");
            onClose(); 
        } else {
            alert(`❌ Error de Conexión:\n\n${testResult.message}`);
        }
    };

    const getExportCode = () => {
        const config = { apiKey, authDomain, databaseURL, projectId, storageBucket, messagingSenderId, appId };
        return `// Copia este código para el otro dispositivo\nconst firebaseConfig = ${JSON.stringify(config, null, 2)};`;
    };

    const getShareLink = () => {
        const config = { apiKey, authDomain, databaseURL, projectId, storageBucket, messagingSenderId, appId };
        return generateSyncLink(config, orgId);
    };

    return (
        <div className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-4 backdrop-blur-md">
            <div className="bg-vnl-panel border border-white/20 rounded-none shadow-[0_0_50px_rgba(0,0,0,0.5)] p-8 w-full max-w-lg max-h-[90vh] overflow-y-auto relative">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 to-vnl-accent"></div>
                
                <button onClick={onClose} className="absolute top-4 right-4 text-slate-500 hover:text-white font-bold text-xl transition">✕</button>
                
                <h2 className="text-2xl font-black text-white mb-6 flex items-center gap-3 uppercase italic tracking-tighter">
                    <span className="text-3xl">☁️</span> Cloud Sync
                </h2>

                {canEdit ? (
                    <div className="animate-in fade-in">
                         {/* Config Inputs */}
                         <div className="mb-6">
                            <label className="block text-[10px] font-bold uppercase text-vnl-accent mb-2">ID Organización</label>
                            <input 
                                value={orgId} 
                                onChange={e => setOrgId(e.target.value)} 
                                className="w-full p-3 bg-black/40 border border-white/10 text-white font-bold focus:border-vnl-accent focus:ring-1 focus:ring-vnl-accent outline-none" 
                                placeholder="Ej: liga-voley-2024"
                            />
                            <p className="text-[10px] text-slate-500 mt-2 font-mono">Unique League Identifier</p>
                        </div>

                        <div className="flex gap-1 mb-6 border-b border-white/10 pb-1">
                            <button onClick={() => setShowJsonMode(true)} className={`text-[10px] uppercase font-black tracking-widest px-4 py-2 transition ${showJsonMode ? 'bg-white/10 text-white border-b-2 border-vnl-accent' : 'text-slate-500 hover:text-slate-300'}`}>Import Code</button>
                            <button onClick={() => setShowJsonMode(false)} className={`text-[10px] uppercase font-black tracking-widest px-4 py-2 transition ${!showJsonMode ? 'bg-white/10 text-white border-b-2 border-vnl-accent' : 'text-slate-500 hover:text-slate-300'}`}>Manual Input</button>
                        </div>

                        {showJsonMode ? (
                            <div className="mb-6">
                                <p className="text-xs text-slate-400 mb-3 font-bold">Pega el código de configuración de Firebase:</p>
                                <textarea 
                                    value={jsonInput}
                                    onChange={e => setJsonInput(e.target.value)}
                                    className="w-full h-32 p-3 bg-black/50 border border-white/10 text-green-400 font-mono text-[10px] rounded-none focus:border-vnl-accent outline-none"
                                    placeholder={'const firebaseConfig = { ... };'}
                                />
                                <button onClick={parseJson} className="mt-3 w-full bg-white/10 hover:bg-white/20 text-white py-2 font-bold uppercase text-xs transition border border-white/10">Procesar Código</button>
                            </div>
                        ) : (
                            <div className="space-y-3 mb-8">
                                <div className="grid grid-cols-2 gap-3">
                                    <input value={apiKey} onChange={e => setApiKey(e.target.value)} className="w-full p-2 bg-black/40 border border-white/10 text-white text-xs font-mono placeholder-slate-600 focus:border-vnl-accent outline-none" placeholder="API Key" />
                                    <input value={authDomain} onChange={e => setAuthDomain(e.target.value)} className="w-full p-2 bg-black/40 border border-white/10 text-white text-xs font-mono placeholder-slate-600 focus:border-vnl-accent outline-none" placeholder="Auth Domain" />
                                    <input value={databaseURL} onChange={e => setDatabaseURL(e.target.value)} className="col-span-2 w-full p-2 bg-black/40 border border-vnl-accent/50 text-white text-xs font-mono placeholder-slate-600 focus:border-vnl-accent outline-none" placeholder="Database URL (Requerido)" />
                                    <input value={projectId} onChange={e => setProjectId(e.target.value)} className="w-full p-2 bg-black/40 border border-white/10 text-white text-xs font-mono placeholder-slate-600 focus:border-vnl-accent outline-none" placeholder="Project ID" />
                                    <input value={appId} onChange={e => setAppId(e.target.value)} className="w-full p-2 bg-black/40 border border-white/10 text-white text-xs font-mono placeholder-slate-600 focus:border-vnl-accent outline-none" placeholder="App ID" />
                                </div>
                            </div>
                        )}

                        <button 
                            onClick={handleConnectManual} 
                            disabled={isTesting}
                            className="w-full bg-vnl-accent hover:bg-cyan-400 text-black font-black py-4 uppercase tracking-widest text-sm shadow-[0_0_20px_rgba(6,182,212,0.4)] transition disabled:opacity-50 disabled:grayscale"
                        >
                            {isTesting ? 'Verificando...' : 'Conectar Sistema'}
                        </button>
                        
                        {/* EXPORT SECTION */}
                        {isConnected && (
                            <div className="mt-8 pt-6 border-t border-white/10">
                                <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2 uppercase tracking-widest">
                                    📲 Vincular Dispositivos
                                </h3>

                                {/* Option 1: Link (Recommended) */}
                                <div className="mb-6 bg-blue-900/20 p-4 border border-blue-500/30">
                                    <label className="block text-[10px] font-black text-blue-400 uppercase mb-2">Opción 1: Enlace Rápido (Recomendado)</label>
                                    <div className="flex gap-2">
                                        <input 
                                            readOnly
                                            className="w-full p-2 text-[10px] border border-blue-500/30 bg-black/50 text-blue-200 font-mono select-all"
                                            value={getShareLink()}
                                        />
                                        <button 
                                            onClick={() => {
                                                navigator.clipboard.writeText(getShareLink());
                                                alert("Enlace copiado al portapapeles");
                                            }}
                                            className="bg-blue-600 text-white px-4 py-2 text-[10px] font-bold hover:bg-blue-500 uppercase tracking-wider"
                                        >
                                            Copiar
                                        </button>
                                    </div>
                                </div>

                                {/* Option 2: JSON Code (Fallback) */}
                                <div className="opacity-75 hover:opacity-100 transition">
                                    <label className="block text-[10px] font-black text-slate-500 uppercase mb-2">Opción 2: Código Manual</label>
                                    <div className="relative">
                                        <textarea 
                                            readOnly
                                            className="w-full h-16 p-2 bg-black/50 border border-white/10 text-[10px] font-mono text-slate-400"
                                            value={getExportCode()}
                                        />
                                        <button 
                                            onClick={() => {
                                                navigator.clipboard.writeText(getExportCode());
                                                alert("Código copiado al portapapeles");
                                            }}
                                            className="absolute top-2 right-2 bg-white/10 hover:bg-white/20 border border-white/10 px-2 py-1 text-[10px] font-bold text-white uppercase"
                                        >
                                            Copiar
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="text-center py-10">
                        <div className="text-4xl mb-4 grayscale opacity-50">🔒</div>
                        <h3 className="text-lg font-bold text-white mb-2 uppercase">Acceso Restringido</h3>
                        <p className="text-slate-500 text-xs mb-6 font-bold uppercase">Solo administradores</p>
                        <div className="bg-green-900/20 p-4 border border-green-500/30 inline-block text-left">
                             <p className="text-[10px] font-black text-green-500 uppercase mb-1">Estado</p>
                             <p className="text-sm text-green-400 font-mono">CONNECTED: <b>{orgId}</b></p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

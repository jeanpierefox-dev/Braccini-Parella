import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set, update } from "firebase/database";

let db: any = null;
let orgId = "default-org";

export const initCloud = (config: any, organizationId: string) => {
    try {
        if (!config.databaseURL) { console.error("Missing databaseURL in config"); return false; }
        const app = initializeApp(config);
        db = getDatabase(app);
        orgId = organizationId || "default-org";
        return true;
    } catch (e) { console.error("Firebase Init Error:", e); return false; }
};

export const testConnection = async (): Promise<{ success: boolean; message?: string }> => {
    if (!db) return { success: false, message: "Base de datos no inicializada." };
    try {
        const testRef = ref(db, `${orgId}/_connection_test`);
        await set(testRef, { connectedAt: Date.now(), status: "ok" });
        return { success: true };
    } catch (error: any) {
        let msg = error.message;
        if (error.code === 'PERMISSION_DENIED') { msg = "Permiso denegado. Asegúrate de que las Reglas de Firebase estén en 'Modo Test' (read: true, write: true)."; } 
        else if (error.code === 'NETWORK_ERROR') { msg = "Error de red. Verifica tu conexión a internet."; }
        return { success: false, message: msg };
    }
};

export const syncData = <T>(path: string, onData: (data: T | null) => void) => {
    if (!db) return () => {};
    const dataRef = ref(db, `${orgId}/${path}`);
    const unsubscribe = onValue(dataRef, (snapshot) => { const val = snapshot.val(); onData(val); });
    return unsubscribe;
};

export const pushData = async (path: string, data: any) => {
    if (!db) return;
    const dataRef = ref(db, `${orgId}/${path}`);
    try { const cleanData = JSON.parse(JSON.stringify(data)); await set(dataRef, cleanData); } catch (e) { console.error("Sync Error:", e); }
};

export const resetCloudData = async (defaultUsers: any[]) => {
    if (!db) return;
    try {
        const updates: any = {};
        updates[`${orgId}/tournaments`] = null; updates[`${orgId}/teams`] = null; updates[`${orgId}/liveMatch`] = null; updates[`${orgId}/users`] = JSON.parse(JSON.stringify(defaultUsers));
        await update(ref(db), updates);
    } catch (e) { console.error("Reset Error:", e); alert("Error al restablecer la nube."); }
};

export const loadConfig = () => { const stored = localStorage.getItem('volleypro_cloud_config'); return stored ? JSON.parse(stored) : null; };
export const saveConfig = (config: any, organizationId: string) => { localStorage.setItem('volleypro_cloud_config', JSON.stringify({ config, organizationId })); };
export const generateSyncLink = (config: any, organizationId: string) => { try { const payload = JSON.stringify({ c: config, o: organizationId }); const encoded = btoa(payload); const url = new URL(window.location.href); url.searchParams.set('sync', encoded); return url.toString(); } catch (e) { return ""; } };
export const checkForSyncLink = (): { config: any, organizationId: string } | null => { try { const params = new URLSearchParams(window.location.search); const syncParam = params.get('sync'); if (syncParam) { const decoded = atob(syncParam); const data = JSON.parse(decoded); if (data.c && data.o) { saveConfig(data.c, data.o); const newUrl = window.location.pathname; window.history.replaceState({}, '', newUrl); return { config: data.c, organizationId: data.o }; } } } catch (e) { console.error("Error parsing sync link", e); } return null; };
// network.js - Blindaje de Datos para MTTP Arándano
export const STORAGE_KEY = "tiempos_agro_seguro_v1";
const API_URL = "https://script.google.com/macros/s/AKfycbyBCmkCN85Y_35jBxHnUyFJ_myHi6Khgoyh0dKq1Zqup_oNtWfdnVMnlEQssXJYotSF/exec"; // Reemplaza con tu URL de Apps Script

let isSyncing = false;

// Actualiza el Card de Conexión y el contador de pendientes
export function updateUI() {
    const items = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    const pendingCount = items.filter(i => i.status !== 'subido').length;
    const countText = document.getElementById("pending-count");
    const statusText = document.getElementById("status-text");
    const statusCard = document.getElementById("network-status-container");

    if (countText) countText.textContent = `Pendientes: ${pendingCount}`;
    
    if (navigator.onLine) {
        if (statusText) statusText.textContent = "En línea";
        if (statusCard) { statusCard.className = "status-card online"; }
        sync(); 
    } else {
        if (statusText) statusText.textContent = "Sin conexión";
        if (statusCard) { statusCard.className = "status-card offline"; }
    }
}

// Guarda en LocalStorage con un ID único antes de intentar subir
export const saveLocal = (data) => {
    const current = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    const dataConId = { 
        ...data, 
        uid: 'REG-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
        timestamp: new Date().toLocaleString(),
        status: 'pendiente'
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...current, dataConId]));
    updateUI();
};

// Enviar a Google Apps Script (mode no-cors evita CORS)
async function sendToCloud(d) {
    await fetch(API_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(d)
    });
}

// Sincronización inteligente (Cola de registros)
async function sync() {
    if (isSyncing || !navigator.onLine) return;
    
    const items = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    const pendingItems = items.filter(i => i.status !== 'subido');
    if (pendingItems.length === 0) return;

    isSyncing = true;
    let queue = [...pendingItems];

    while (queue.length > 0) {
        const item = queue[0];
        try {
            await sendToCloud(item);

            // Marcar como subido (con no-cors asumimos éxito)
            let currentItems = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
            currentItems = currentItems.map(i => 
                i.uid === item.uid ? { ...i, status: 'subido' } : i
            );
            localStorage.setItem(STORAGE_KEY, JSON.stringify(currentItems));

            queue.shift();
            updateUI();

            await new Promise(r => setTimeout(r, 1000));
        } catch (e) {
            console.error("Fallo en envío, se mantiene en cola:", e);
            break;
        }
    }

    isSyncing = false;
}

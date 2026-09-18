// ===== Serviarr - modals.js (extrait de script.js) =====

let pendingConfirmAction = null;

function showConfirmModal(title, message, actionCallback) {
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').innerHTML = message;
    pendingConfirmAction = actionCallback;
    const modal = document.getElementById('modal-confirm');
    modal.style.zIndex = '999999999'; // 🌟 FORCE LA MODALE AU-DESSUS DE TOUT
    modal.classList.add('open');
}

function closeConfirmModal() {
    document.getElementById('modal-confirm').classList.remove('open');
    pendingConfirmAction = null;
}

document.getElementById('btn-confirm-action').addEventListener('click', () => {
    if (pendingConfirmAction) pendingConfirmAction();
    closeConfirmModal();
});

document.getElementById('modal-confirm').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeConfirmModal();
});

document.addEventListener('mousedown', e => {
    _modalMousedownTarget = e.target;
});

document.addEventListener('click', e => {
    const target = e.target;
    
    // Si l'utilisateur relâche le clic sur le fond sombre d'une modale
    if (target && ((target.id && target.id.startsWith('modal-')) || (target.classList && target.classList.contains('modal-bg')))) {
        
        // Et que le clic a commencé AILLEURS (dans un champ texte par exemple)
        if (_modalMousedownTarget !== target) {
            // On bloque immédiatement l'événement, la modale ne se fermera pas !
            e.stopPropagation();
        }
    }
}, true);

window.openMediaFileInfoModal = function(fileObjStr, deleteParams = null) {
    if (!fileObjStr || fileObjStr === 'null') return;
    const file = JSON.parse(decodeURIComponent(fileObjStr));

    let overlay = document.getElementById('file-info-overlay');
    let sheet = document.getElementById('file-info-sheet');

    if (!overlay) {
        const html = `
        <div class="mobile-menu-overlay" id="file-info-overlay" onclick="closeMediaFileInfoModal()" style="z-index:100008; display:none;"></div>
        <div class="mobile-bottom-sheet" id="file-info-sheet" style="z-index:100009; padding:0; background:var(--bg2); display:flex; flex-direction:column; max-height:90vh; border-radius: 24px 24px 0 0; width:100%; max-width:600px; margin:auto; margin-bottom:0; box-shadow: 0 -10px 40px rgba(0,0,0,0.8); transform: translateY(100%); transition: transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);">
            <div id="file-info-content" style="display:flex; flex-direction:column; overflow:hidden; max-height:90vh;"></div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
        overlay = document.getElementById('file-info-overlay');
        sheet = document.getElementById('file-info-sheet');
    }

    let cfsHtml = '';
    if (file.customFormats && file.customFormats.length > 0) {
        const pills = file.customFormats.map(cf => `<span style="background:rgba(255,193,50,0.05); border:1px solid var(--radarr); color:var(--radarr); padding:4px 10px; border-radius:6px; font-size:11px; font-weight:700;">${esc(cf)}</span>`).join('');
        cfsHtml = `
        <div style="margin-bottom:20px;">
            <div style="font-size:11px; font-weight:bold; color:var(--text); margin-bottom:10px; display:flex; align-items:center; gap:6px;">
                <span style="text-transform:uppercase;">Custom Formats</span>
                <span style="background:rgba(74, 222, 128, 0.2); color:var(--accent); padding:2px 8px; border-radius:10px; font-size:10px; font-weight:bold;">+${file.customFormats.length} formats</span>
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:8px;">${pills}</div>
        </div>`;
    }

    const cleanVal = (val) => (val && val !== '?' && val !== '0' && val !== 0 && val !== '') ? esc(val.toString()) : '—';

    document.getElementById('file-info-content').innerHTML = `
        <div style="width: 40px; height: 5px; background: var(--border); border-radius: 5px; margin: 15px auto; flex-shrink:0;"></div>
        
        <div style="padding:0 25px 25px 25px; overflow-y:auto; scrollbar-width:none;">
            <h3 style="margin:0 0 5px 0; font-size:15px; color:var(--text); word-break:break-all; line-height:1.3;">${esc(file.releaseName || file.path)}</h3>
            <div style="font-size:12px; color:var(--muted); margin-bottom:20px; font-family:var(--mono); word-break:break-all; line-height:1.4;">${esc(file.path)}</div>

            ${cfsHtml}

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:30px; margin-bottom:25px;">
                <!-- VIDEO -->
                <div>
                    <div style="font-size:11px; font-weight:bold; color:var(--muted); text-transform:uppercase; margin-bottom:12px; letter-spacing:1px;">Video</div>
                    <div style="display:grid; grid-template-columns:1fr auto; gap:8px 10px; font-size:13px; align-items:center;">
                        <span style="color:var(--muted)">Resolution</span> <span style="text-align:right; font-family:var(--mono); color:var(--text);">${cleanVal(file.resolution)}</span>
                        <span style="color:var(--muted)">Codec</span> <span style="text-align:right; font-family:var(--mono); color:var(--text);">${cleanVal(file.videoCodec)}</span>
                        <span style="color:var(--muted)">Bit Depth</span> <span style="text-align:right; font-family:var(--mono); color:var(--text);">${cleanVal(file.bitDepth)}</span>
                        <span style="color:var(--muted)">Bit Rate</span> <span style="text-align:right; font-family:var(--mono); color:var(--text);">${cleanVal(file.bitRate)}</span>
                        <span style="color:var(--muted)">FPS</span> <span style="text-align:right; font-family:var(--mono); color:var(--text);">${cleanVal(file.fps)}</span>
                    </div>
                </div>
                <!-- AUDIO -->
                <div>
                    <div style="font-size:11px; font-weight:bold; color:var(--muted); text-transform:uppercase; margin-bottom:12px; letter-spacing:1px;">Audio</div>
                    <div style="display:grid; grid-template-columns:1fr auto; gap:8px 10px; font-size:13px; align-items:center;">
                        <span style="color:var(--muted)">Channels</span> <span style="text-align:right; font-family:var(--mono); color:var(--text);">${cleanVal(file.audioChannels)}</span>
                        <span style="color:var(--muted)">Codec</span> <span style="text-align:right; font-family:var(--mono); color:var(--text);">${cleanVal(file.audioCodec)}</span>
                        <span style="color:var(--muted)">Languages</span> <span style="text-align:right; font-family:var(--mono); color:var(--text);">${cleanVal(file.audioLanguages)}</span>
                        <span style="color:var(--muted)">Streams</span> <span style="text-align:right; font-family:var(--mono); color:var(--text);">${cleanVal(file.audioStreams)}</span>
                    </div>
                </div>
            </div>

            <!-- OTHER -->
            <div style="margin-bottom:25px;">
                <div style="font-size:11px; font-weight:bold; color:var(--muted); text-transform:uppercase; margin-bottom:12px; letter-spacing:1px;">Other</div>
                <div style="display:grid; grid-template-columns:80px 1fr; gap:8px 15px; font-size:13px; align-items:baseline;">
                    <span style="color:var(--muted)">Runtime</span> <span style="text-align:right; font-family:var(--mono); color:var(--text);">${cleanVal(file.runTime)}</span>
                    <span style="color:var(--muted)">Release</span> <span style="text-align:right; font-family:var(--mono); color:var(--text); word-break:break-all; line-height:1.3;">${cleanVal(file.releaseGroup)}</span>
                    <span style="color:var(--muted)">Subtitles</span> <span style="text-align:right; font-family:var(--mono); color:var(--text); word-break:break-all; line-height:1.3;">${cleanVal(file.subtitles)}</span>
                </div>
            </div>

            ${deleteParams ? `
            <button onclick="closeMediaFileInfoModal(); setTimeout(() => { ${deleteParams} }, 300);" style="width:100%; background:var(--accent3); color:#fff; border:none; padding:16px; border-radius:12px; font-size:15px; font-weight:bold; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:10px; transition:transform 0.2s;" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">
                <span style="font-size:20px;">🗑️</span> Delete File
            </button>
            ` : ''}
        </div>
    `;

    overlay.style.display = 'block';
    sheet.style.display = 'flex';
    // Petit délai pour laisser le navigateur appliquer le display block avant de lancer la transition CSS
    setTimeout(() => { 
        overlay.classList.add('open'); 
        sheet.style.transform = 'translateY(0)'; 
    }, 10);
}

window.closeMediaFileInfoModal = function() {
    const overlay = document.getElementById('file-info-overlay');
    const sheet = document.getElementById('file-info-sheet');
    if (overlay && sheet) {
        sheet.style.transform = 'translateY(100%)';
        overlay.classList.remove('open');
        setTimeout(() => { 
            sheet.style.display = 'none'; 
            overlay.style.display = 'none'; 
        }, 300);
    }
}

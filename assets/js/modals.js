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

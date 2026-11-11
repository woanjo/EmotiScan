document.addEventListener('DOMContentLoaded', () => {
    const toast = document.getElementById('toast');
    let toastTimeout = null;

    function showToast(message, type = 'normal') {
        if (!toast) return;
        toast.textContent = message;
        toast.className = `toast show ${type}`;
        clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    // Emotion color palette mapping matching card variant styles
    const emotionColorMap = {
        "HAPPY": "#F59E0B",
        "SAD": "#3B82F6",
        "ANGRY": "#EF4444",
        "FEAR": "#F97316",
        "DISGUST": "#10B981",
        "SURPRISE": "#A855F7",
        "NEUTRAL": "#334155"
    };

    // The backend saves emotions in lowercase (happy, sad, ...).
    // The History page shows them in uppercase labels.
    const emotionLabels = {
        happy: "HAPPY",
        sad: "SAD",
        angry: "ANGRY",
        fear: "FEAR",
        disgust: "DISGUST",
        surprise: "SURPRISE",
        neutral: "NEUTRAL"
    };

    // History data now comes from the backend (Neon database).
    // It starts empty and is filled by loadHistory().
    const historyData = [];

    let selectedItems = new Set();
    let currentModalItem = null;

    const historyGrid = document.getElementById('historyGrid');
    const selectedCountEl = document.getElementById('selectedCount');
    const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
    const selectAllBtn = document.getElementById('selectAllBtn');
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');

    // Modal elements
    const modalOverlay = document.getElementById('modalOverlay');
    const modalCloseBtn = document.getElementById('modalCloseBtn');
    const modalTitle = document.getElementById('modalTitle');
    const modalTimestamp = document.getElementById('modalTimestamp');
    const modalTimestampCircle = document.getElementById('modalTimestampCircle');
    const modalImage = document.getElementById('modalImage');
    const modalEmotionName = document.getElementById('modalEmotionName');
    const modalDot = document.getElementById('modalDot');
    const modalPreviewCard = document.getElementById('modalPreviewCard');
    const modalDeleteBtn = document.getElementById('modalDeleteBtn');

    // ========================================
    // BACKEND CONNECTION
    // ========================================

    // Turn "2026-11-10T09:15:00+00:00" into "Nov 10, 2026 • 5:15 PM"
    function formatDate(isoString) {
        const date = new Date(isoString);

        const day = date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });

        const time = date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit'
        });

        return `${day} • ${time}`;
    }

    // Convert one scan from the backend into the shape the cards use.
    function toHistoryItem(scan) {
        const label = emotionLabels[scan.emotion] || scan.emotion.toUpperCase();

        return {
            dbId: scan.id,                       // real id in the database
            id: `LOG #${scan.id}`,               // text shown on the card
            emotion: label,
            date: formatDate(scan.created_at),
            variant: `variant-${label.toLowerCase()}`,
            image: scan.image_url                // /api/scans/<id>/image
        };
    }

    // Ask the backend for all saved scans, then draw the cards.
    async function loadHistory() {
        try {
            const response = await fetch('/api/history');

            if (!response.ok) {
                throw new Error('Server returned an error.');
            }

            const scans = await response.json();

            historyData.length = 0;
            scans.forEach(scan => historyData.push(toHistoryItem(scan)));
        } catch (error) {
            console.error('Unable to load history:', error);
            showToast('Unable to load history. Is the server running?', 'error');
        }

        renderCards();
    }

    // Delete one scan (and its photo) from the database.
    async function deleteFromServer(dbId) {
        const response = await fetch(`/api/scans/${dbId}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            throw new Error('Delete failed.');
        }
    }

    // ========================================
    // CARDS
    // ========================================

    function renderCards() {
        if (!historyGrid) return;
        historyGrid.innerHTML = '';
        
        if (historyData.length === 0) {
            historyGrid.innerHTML = '<p style="color: #4C444F; grid-column: 1/-1; text-align: center; padding: 40px;">No history logs found.</p>';
            updateToolbarState();
            return;
        }

        historyData.forEach(item => {
            const isSelected = selectedItems.has(item.id);
            const emotionColor = emotionColorMap[item.emotion] || '#7D7480';
            const card = document.createElement('div');
            card.className = `history-card ${item.variant}`;
            card.innerHTML = `
                <div class="card-header">
                    <div class="checkbox card-checkbox ${isSelected ? 'checked' : ''}" data-id="${item.id}"></div>
                    <div class="card-id">${item.id}</div>
                </div>
                <div class="card-preview-box" data-id="${item.id}">
                    <div class="card-image-container">
                        <img src="${item.image}" alt="${item.emotion}" />
                    </div>
                    <div style="display: flex; align-items: center;">
                        <div class="badge">${item.emotion}</div>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 6px; padding-top: 8px;">
                    <svg width="12.5" height="12.5" viewBox="0 0 14 14" fill="${emotionColor}"><circle cx="7" cy="7" r="6"/></svg>
                    <span class="timestamp">${item.date}</span>
                </div>
                <div class="card-actions">
                    <button class="delete-btn" data-id="${item.id}">
                        <img src="icons/delete.svg" alt="Delete" width="12" height="12" onerror="this.onerror=null; this.outerHTML='<svg width=&quot;12&quot; height=&quot;14&quot; viewBox=&quot;0 0 12 14&quot; fill=&quot;#BA1A1A&quot;><path d=&quot;M1 3h10v10H1z&quot;/></svg>'" />
                        <span>Delete</span>
                    </button>
                </div>
            `;

            card.querySelector('.card-checkbox').addEventListener('click', (e) => {
                e.stopPropagation();
                toggleSelectItem(item.id);
            });

            card.querySelector('.card-preview-box').addEventListener('click', () => {
                openModal(item);
            });

            card.querySelector('.delete-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                deleteItem(item.id);
            });

            historyGrid.appendChild(card);
        });

        updateToolbarState();
    }

    function toggleSelectItem(id) {
        if (selectedItems.has(id)) {
            selectedItems.delete(id);
        } else {
            selectedItems.add(id);
        }
        renderCards();
    }

    function updateToolbarState() {
        if (!selectedCountEl || !deleteSelectedBtn || !selectAllCheckbox) return;
        
        selectedCountEl.textContent = selectedItems.size;
        
        if (selectedItems.size > 0) {
            deleteSelectedBtn.style.opacity = '1';
            deleteSelectedBtn.style.pointerEvents = 'auto';
            deleteSelectedBtn.classList.add('active');
        } else {
            deleteSelectedBtn.style.opacity = '0.5';
            deleteSelectedBtn.style.pointerEvents = 'none';
            deleteSelectedBtn.classList.remove('active');
        }

        // Automatically sync Select All checkbox with selected items count
        if (historyData.length > 0 && selectedItems.size === historyData.length) {
            selectAllCheckbox.classList.add('checked');
        } else {
            selectAllCheckbox.classList.remove('checked');
        }
    }

    if (selectAllBtn) {
        selectAllBtn.addEventListener('click', () => {
            if (selectedItems.size === historyData.length) {
                selectedItems.clear();
            } else {
                historyData.forEach(item => selectedItems.add(item.id));
            }
            renderCards();
        });
    }

    // Delete all selected scans
    if (deleteSelectedBtn) {
        deleteSelectedBtn.addEventListener('click', async () => {
            const itemsToDelete = historyData.filter(item => selectedItems.has(item.id));

            try {
                // Delete each selected scan in the database first.
                await Promise.all(
                    itemsToDelete.map(item => deleteFromServer(item.dbId))
                );
            } catch (error) {
                console.error('Delete selected error:', error);
                showToast('Unable to delete the selected items.', 'error');
                await loadHistory();   // reload so the page matches the database
                return;
            }

            // Then remove them from the page.
            itemsToDelete.forEach(item => {
                const idx = historyData.indexOf(item);
                if (idx > -1) historyData.splice(idx, 1);
            });

            selectedItems.clear();
            renderCards();
            showToast('Selected items deleted successfully.', 'success');
        });
    }

    // Delete one scan
    async function deleteItem(id) {
        const item = historyData.find(entry => entry.id === id);
        if (!item) return;

        try {
            await deleteFromServer(item.dbId);
        } catch (error) {
            console.error('Delete error:', error);
            showToast('Unable to delete this log.', 'error');
            return;
        }

        const idx = historyData.indexOf(item);
        if (idx > -1) historyData.splice(idx, 1);

        selectedItems.delete(id);
        renderCards();
        closeModal();
        showToast(`Log ${id} deleted.`, 'success');
    }

    // Modal display logic
    function openModal(item) {
        currentModalItem = item;
        const color = emotionColorMap[item.emotion] || '#7D7480';
        
        if (modalTimestamp) modalTimestamp.textContent = item.date;
        if (modalEmotionName) modalEmotionName.textContent = item.emotion;
        if (modalImage) modalImage.src = item.image;
        if (modalTitle) modalTitle.textContent = "Analysis Result";
        
        if (modalDot) modalDot.style.backgroundColor = color;
        if (modalTimestampCircle) modalTimestampCircle.setAttribute('fill', color);
        if (modalPreviewCard) modalPreviewCard.style.borderColor = color;

        if (modalOverlay) modalOverlay.classList.add('open');
    }

    function closeModal() {
        if (modalOverlay) modalOverlay.classList.remove('open');
        currentModalItem = null;
    }

    if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);
    if (modalOverlay) modalOverlay.addEventListener('click', closeModal);

    if (modalDeleteBtn) {
        modalDeleteBtn.addEventListener('click', () => {
            if (currentModalItem) {
                deleteItem(currentModalItem.id);
            }
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal();
        }
    });

    // Load the saved scans from the backend when the page opens.
    loadHistory();
});
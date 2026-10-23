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
        "NEUTRAL": "#334155"
    };

    // History data source with updated short emotion labels
    const historyData = [
        { id: "LOG #8491", emotion: "HAPPY", date: "Oct 24, 2025 • 10:42 AM", variant: "variant-happy", image: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=600&q=80" },
        { id: "LOG #8489", emotion: "SAD", date: "Oct 24, 2025 • 09:18 AM", variant: "variant-sad", image: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=80" },
        { id: "LOG #8485", emotion: "ANGRY", date: "Oct 23, 2025 • 04:15 PM", variant: "variant-angry", image: "https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=600&q=80" },
        { id: "LOG #8480", emotion: "FEAR", date: "Oct 23, 2025 • 02:45 PM", variant: "variant-fear", image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=600&q=80" },
        { id: "LOG #8477", emotion: "DISGUST", date: "Oct 23, 2025 • 01:20 PM", variant: "variant-disgust", image: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=600&q=80" },
        { id: "LOG #8472", emotion: "NEUTRAL", date: "Oct 22, 2025 • 11:05 AM", variant: "variant-neutral", image: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=600&q=80" }
    ];

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

    if (deleteSelectedBtn) {
        deleteSelectedBtn.addEventListener('click', () => {
            const indexToRemove = historyData.filter(item => selectedItems.has(item.id));
            indexToRemove.forEach(item => {
                const idx = historyData.indexOf(item);
                if (idx > -1) historyData.splice(idx, 1);
            });
            selectedItems.clear();
            renderCards();
            showToast('Selected items deleted successfully.', 'success');
        });
    }

    function deleteItem(id) {
        const idx = historyData.findIndex(item => item.id === id);
        if (idx > -1) {
            historyData.splice(idx, 1);
            selectedItems.delete(id);
            renderCards();
            closeModal();
            showToast(`Log ${id} deleted.`, 'success');
        }
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

    // Initialize Grid
    renderCards();
});
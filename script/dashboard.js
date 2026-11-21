document.addEventListener('DOMContentLoaded', () => {
    const toast = document.getElementById('toast');
    const fileInputPicker = document.getElementById('fileInputPicker');

    // Analysis Result Modal Elements
    const analysisModal = document.getElementById('analysisModal');
    const closeAnalysisBtn = document.getElementById('closeAnalysisBtn');
    const analysisModalTimestamp = document.getElementById('analysisModalTimestamp');
    const analysisPhotoCard = document.getElementById('analysisPhotoCard');
    const analysisModalImg = document.getElementById('analysisModalImg');
    const analysisModalPill = document.getElementById('analysisModalPill');
    const analysisModalDot = document.getElementById('analysisModalDot');
    const analysisModalEmotionText = document.getElementById('analysisModalEmotionText');

    const navDashboard = document.getElementById('navDashboard');
    const navCapture = document.getElementById('navCapture');
    const navUpload = document.getElementById('navUpload');
    const navHistory = document.getElementById('navHistory');

    let mediaStreamInstance = null;
    let toastTimeout = null;

    // Toast notifications
    function showToast(message, type = 'normal') {
        toast.textContent = message;
        toast.className = `toast show ${type}`;

        clearTimeout(toastTimeout);

        toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    // Navigation
    function setActiveNav(activeBtn) {
        [
            navDashboard,
            navCapture,
            navUpload,
            navHistory
        ].forEach(btn => btn.classList.remove('active'));

        activeBtn.classList.add('active');
    }

    navDashboard.addEventListener('click', () => {
        setActiveNav(navDashboard);
        showToast('You are on the Dashboard screen.', 'success');
    });

    // Camera activation
    async function openCamera() {
        if (!navigator.mediaDevices?.getUserMedia) {
            showToast(
                'Camera access requires a supported browser and secure connection.',
                'error'
            );
            return;
        }

        try {
            mediaStreamInstance =
                await navigator.mediaDevices.getUserMedia({
                    video: true
                });

            cameraStream.srcObject = mediaStreamInstance;
            cameraModal.classList.remove('hidden');
        } catch (err) {
            showToast(
                'Unable to access camera or permission denied.',
                'error'
            );
        }
    }

    // Stop camera and release resources
    function stopCamera() {
        if (mediaStreamInstance) {
            mediaStreamInstance.getTracks().forEach(track => track.stop());
            mediaStreamInstance = null;
        }

        cameraStream.srcObject = null;
        cameraModal.classList.add('hidden');
    }

    btnCaptureAction.addEventListener('click', () => {
        setActiveNav(navCapture);
        openCamera();
    });

    navCapture.addEventListener('click', () => {
        setActiveNav(navCapture);
        openCamera();
    });

    closeCameraBtn.addEventListener('click', stopCamera);

    // Close Analysis Result Modal
    function closeAnalysisModal() {
        analysisModal.classList.add('hidden');
    }

    closeAnalysisBtn.addEventListener('click', closeAnalysisModal);

    // Close Modals on clicking outside or ESC key
    analysisModal.addEventListener('click', event => {
        if (event.target === analysisModal) {
            closeAnalysisModal();
        }
    });

    cameraModal.addEventListener('click', event => {
        if (event.target === cameraModal) {
            stopCamera();
        }
    });

    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeAnalysisModal();
            stopCamera();
        }
    });

    window.addEventListener('pagehide', stopCamera);

    // ========================================
    // RECENT RESULTS
    // ========================================

    const recentResultsContainer = document.getElementById(
        'recentResultsContainer'
    );

    // Emotion colors used for the result badges and modal
    const emotionStyles = {
        happy: {
            background: '#FEF3C7',
            dot: '#F59E0B',
            outline: '#FBBF24',
            text: '#B45309'
        },
        sad: {
            background: '#DBEAFE',
            dot: '#3B82F6',
            outline: '#60A5FA',
            text: '#1D4ED8'
        },
        angry: {
            background: '#FEE2E2',
            dot: '#EF4444',
            outline: '#F87171',
            text: '#B91C1C'
        },
        fear: {
            background: '#EDE9FE',
            dot: '#8B5CF6',
            outline: '#A78BFA',
            text: '#6D28D9'
        },
        disgust: {
            background: '#DCFCE7',
            dot: '#22C55E',
            outline: '#4ADE80',
            text: '#15803D'
        },
        surprise: {
            background: '#FCE7F3',
            dot: '#EC4899',
            outline: '#F472B6',
            text: '#BE185D'
        },
        neutral: {
            background: '#F3F4F6',
            dot: '#9CA3AF',
            outline: '#474747',
            text: '#4B5563'
        },
        neutrality: {
            background: '#F3F4F6',
            dot: '#9CA3AF',
            outline: '#424242',
            text: '#4B5563'
        }
    };

    // Format the saved date and time
    function formatScanDate(dateValue) {
        const date = new Date(dateValue);

        if (isNaN(date.getTime())) {
            return 'Date unavailable';
        }

        return date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });
    }

    // Open the existing Analysis Result modal
    function openRecentResult(scan) {
        const emotion = scan.emotion || 'Neutrality';
        const style = emotionStyles[emotion.toLowerCase()] ||
            emotionStyles.neutrality;

        analysisModalImg.src = scan.image_url;
        analysisModalTimestamp.textContent =
            formatScanDate(scan.created_at);

        analysisModalEmotionText.textContent = emotion.toUpperCase();
        analysisModalEmotionText.style.color = style.text;

        analysisModalPill.style.background = style.background;
        analysisModalDot.style.background = style.dot;

        analysisPhotoCard.style.outlineColor = style.outline;
        analysisPhotoCard.style.boxShadow =
            `0px 4px 15px -3px ${style.outline}40,
             0px 10px 35px -5px ${style.outline}50`;

        analysisModal.classList.remove('hidden');
    }

    // Display the result cards
    function displayRecentResults(scans) {
        recentResultsContainer.innerHTML = '';

        if (!scans || scans.length === 0) {
            recentResultsContainer.innerHTML = `
                <p class="recent-results-message">
                    No recent results yet. Capture or upload a photo
                    to see your analysis results here.
                </p>
            `;
            return;
        }

        // Display only the three newest results
        const recentScans = scans.slice(0, 8);

        recentScans.forEach(scan => {
            const emotion = (scan.emotion || 'neutral').toLowerCase();
            const style = emotionStyles[emotion] || emotionStyles.neutral;

            // Create result card
            const card = document.createElement('div');
            card.className = 'result-card';

            // Apply emotion-based outline
            card.style.borderColor = style.outline;

            const image = document.createElement('img');
            image.className = 'result-img';
            image.src = scan.image_url;
            image.alt = 'Analyzed photo';
            image.loading = 'lazy';

            const details = document.createElement('div');
            details.className = 'result-details';

            const badge = document.createElement('span');
            badge.className = 'emotion-badge';
            badge.textContent = emotion.toUpperCase();

            badge.style.backgroundColor = style.background;
            badge.style.color = style.text;

            badge.setAttribute('data-badge-bg', style.background);
            badge.setAttribute('data-dot-color', style.dot);
            badge.setAttribute('data-outline', style.outline);

            const timestamp = document.createElement('span');
            timestamp.className = 'result-timestamp';
            timestamp.textContent = formatScanDate(scan.created_at);

            details.appendChild(badge);
            details.appendChild(timestamp);

            card.appendChild(image);
            card.appendChild(details);

            // Open the matching result in the modal
            card.addEventListener('click', () => {
                openRecentResult(scan);
            });

            recentResultsContainer.appendChild(card);
        });
    }

    // Fetch the logged-in user's saved results
    async function loadRecentResults() {
        try {
            const response = await fetch('/api/history', {
                method: 'GET',
                credentials: 'same-origin'
            });

            if (response.status === 401) {
                window.location.href = 'index.html';
                return;
            }

            if (!response.ok) {
                throw new Error('Unable to retrieve recent results.');
            }

            const scans = await response.json();

            displayRecentResults(scans);

        } catch (error) {
            console.error('Recent Results Error:', error);

            recentResultsContainer.innerHTML = `
                <p class="recent-results-message">
                    Unable to load recent results. Please refresh the page.
                </p>
            `;
        }
    }

    // Load the user's profile and recent results
    verifySessionAndHeader();
    loadRecentResults();

    // ========================================
    // SESSION & NAVBAR PROFILE
    // ========================================
    async function verifySessionAndHeader() {
        const headerAvatar = document.getElementById('headerUserAvatar');
        const headerName = document.getElementById('headerUserName');

        try {
            const res = await fetch('/api/me');

            if (res.status === 401) {
                window.location.href = 'index.html';
                return false;
            }

            const data = await res.json();
            if (data.user) {
                const user = data.user;
                const fullName = `${user.first_name} ${user.last_name}`;
                const initials = `${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}` || 'U';
                const fallbackAvatar = `https://placehold.co/100x100/F4DAFF/794A98?text=${initials}`;

                if (headerName) headerName.textContent = fullName;
                if (headerAvatar) headerAvatar.src = user.avatar_url || fallbackAvatar;
            }
            return true;
        } catch (err) {
            console.error('Failed to verify session:', err);
            return true;
        }
    }
});
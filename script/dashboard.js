document.addEventListener('DOMContentLoaded', () => {
    const toast = document.getElementById('toast');
    const fileInputPicker = document.getElementById('fileInputPicker');
    
    // Camera Elements
    const cameraModal = document.getElementById('cameraModal');
    const cameraStream = document.getElementById('cameraStream');
    const closeCameraBtn = document.getElementById('closeCameraBtn');
    const snapPhotoBtn = document.getElementById('snapPhotoBtn');

    // Analysis Result Modal Elements
    const analysisModal = document.getElementById('analysisModal');
    const closeAnalysisBtn = document.getElementById('closeAnalysisBtn');
    const analysisModalTimestamp = document.getElementById('analysisModalTimestamp');
    const analysisPhotoCard = document.getElementById('analysisPhotoCard');
    const analysisModalImg = document.getElementById('analysisModalImg');
    const analysisModalPill = document.getElementById('analysisModalPill');
    const analysisModalDot = document.getElementById('analysisModalDot');
    const analysisModalEmotionText = document.getElementById('analysisModalEmotionText');

    const btnCaptureAction = document.getElementById('btnCaptureAction');
    const btnUploadAction = document.getElementById('btnUploadAction');
    const btnHistoryAction = document.getElementById('btnHistoryAction');

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

    // Capture photo
    snapPhotoBtn.addEventListener('click', () => {
        if (!cameraStream.videoWidth) {
            showToast('Camera is not ready yet. Please try again.', 'error');
            return;
        }

        const canvas = document.createElement('canvas');
        canvas.width = cameraStream.videoWidth;
        canvas.height = cameraStream.videoHeight;

        const context = canvas.getContext('2d');
        context.drawImage(cameraStream, 0, 0);

        stopCamera();

        setActiveNav(navDashboard);
        showToast(
            'Photo captured! Processing emotion analysis...',
            'success'
        );
    });

    // Upload image
    function triggerUpload() {
        setActiveNav(navUpload);
        fileInputPicker.click();
    }

    btnUploadAction.addEventListener('click', triggerUpload);
    navUpload.addEventListener('click', triggerUpload);

    fileInputPicker.addEventListener('change', event => {
        const file = event.target.files?.[0];

        if (!file) return;

        if (!file.type.startsWith('image/')) {
            showToast('Please select a valid image file.', 'error');
            fileInputPicker.value = '';
            return;
        }

        showToast(
            `Selected "${file.name}". Processing upload...`,
            'success'
        );
    });

    // History navigation
    function navigateHistory() {
        setActiveNav(navHistory);
        showToast('Navigating to History view...', 'success');
    }

    btnHistoryAction.addEventListener('click', navigateHistory);
    navHistory.addEventListener('click', navigateHistory);

    // Open Analysis Result Modal on clicking any Recent Result card
    document.querySelectorAll('.result-card').forEach((card) => {
        card.addEventListener('click', () => {
            const imgElement = card.querySelector('.result-img');
            const badgeElement = card.querySelector('.emotion-badge');
            const timeElement = card.querySelector('.result-timestamp');

            const imgSrc = imgElement.src;
            const emotionText = badgeElement.textContent.trim();
            const timestampText = timeElement.textContent.trim();

            const badgeBg = badgeElement.getAttribute('data-badge-bg') || '#FEF3C7';
            const dotColor = badgeElement.getAttribute('data-dot-color') || '#F59E0B';
            const outlineColor = badgeElement.getAttribute('data-outline') || '#FBBF24';
            const textColor = badgeElement.style.color || '#B45309';

            // Populate Modal Content
            analysisModalImg.src = imgSrc;
            analysisModalTimestamp.textContent = timestampText;
            analysisModalEmotionText.textContent = emotionText;
            analysisModalEmotionText.style.color = textColor;
            
            analysisModalPill.style.background = badgeBg;
            analysisModalDot.style.background = dotColor;

            // Apply card outline color and box-shadow based on emotion
            analysisPhotoCard.style.outlineColor = outlineColor;
            analysisPhotoCard.style.boxShadow = `0px 4px 15px -3px ${outlineColor}40, 0px 10px 35px -5px ${outlineColor}50`;

            // Display Modal
            analysisModal.classList.remove('hidden');
        });
    });

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
});
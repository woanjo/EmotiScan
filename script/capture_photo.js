
document.addEventListener('DOMContentLoaded', () => {
    // ========================================
    // UI REFERENCES
    // ========================================

    const webcamVideo = document.getElementById('webcamVideo');
    const photoCanvas = document.getElementById('photoCanvas');
    const faceGuide = document.getElementById('faceGuide');

    const btnCapture = document.getElementById('btnCapture');
    const btnRetake = document.getElementById('btnRetake');
    const btnAnalyze = document.getElementById('btnAnalyze');
    const btnCaptureAnother = document.getElementById('btnCaptureAnother');

    const analyzeSpinner = document.getElementById('analyzeSpinner');
    const analyzeBtnLabel = document.getElementById('analyzeBtnLabel');

    const cameraStatusBadge = document.getElementById('cameraStatusBadge');
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');

    const detectedEmotionSection = document.getElementById('detectedEmotionSection');
    const resultPhoto = document.getElementById('resultPhoto');
    const resultEmotionBadge = document.getElementById('resultEmotionBadge');
    const toast = document.getElementById('toast');

    // ========================================
    // VARIABLES
    // ========================================

    let mediaStream = null;
    let capturedDataUrl = null;

    // ========================================
    // TOAST NOTIFICATION
    // ========================================

    function showToast(msg, isError = false) {
        toast.textContent = msg;
        toast.className = `toast show ${isError ? 'error' : ''}`;

        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    // ========================================
    // INITIALIZE CAMERA
    // ========================================

    async function initCamera() {
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('Camera access is not supported by this browser.');
            }

            mediaStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: 'user'
                }
            });

            webcamVideo.srcObject = mediaStream;

            statusDot.className = 'status-dot';
            statusText.textContent = 'Camera Active';

        } catch (err) {
            console.error('Camera initialization failed:', err);

            statusDot.className = 'status-dot standby';
            statusText.textContent = 'Camera Unavailable';

            showToast(
                'Unable to access webcam. Please check permissions.',
                true
            );
        }
    }

    // ========================================
    // CAPTURE PHOTO
    // ========================================

    function captureFrame() {
        if (
            !mediaStream ||
            !webcamVideo.srcObject ||
            webcamVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
        ) {
            showToast('No active camera feed found.', true);
            return;
        }

        const ctx = photoCanvas.getContext('2d');

        photoCanvas.width = webcamVideo.videoWidth || 640;
        photoCanvas.height = webcamVideo.videoHeight || 480;

        ctx.drawImage(
            webcamVideo,
            0,
            0,
            photoCanvas.width,
            photoCanvas.height
        );

        capturedDataUrl = photoCanvas.toDataURL('image/png');

        // Display the captured photo
        photoCanvas.classList.remove('hidden');
        webcamVideo.style.display = 'none';
        faceGuide.style.display = 'none';

        // Update action buttons
        btnCapture.style.display = 'none';
        btnRetake.style.display = 'inline-flex';
        btnAnalyze.style.display = 'inline-flex';

        // Update camera status
        statusDot.className = 'status-dot standby';
        statusText.textContent = 'Photo Captured';

        showToast('Photo captured successfully!');
    }

    // ========================================
    // RETAKE PHOTO
    // ========================================

    function resetToCameraPreview() {
        photoCanvas.classList.add('hidden');

        webcamVideo.style.display = 'block';
        faceGuide.style.display = 'block';

        btnCapture.style.display = 'inline-flex';
        btnRetake.style.display = 'none';
        btnAnalyze.style.display = 'none';

        capturedDataUrl = null;

        // Reset analysis button
        btnAnalyze.disabled = false;
        analyzeSpinner.style.display = 'none';
        analyzeBtnLabel.textContent = 'Analyze Emotion';

        // Update camera status
        if (mediaStream && mediaStream.active) {
            statusDot.className = 'status-dot';
            statusText.textContent = 'Camera Active';
        } else {
            statusDot.className = 'status-dot standby';
            statusText.textContent = 'Camera Unavailable';
        }
    }

    // ========================================
    // EMOTION CATEGORIES
    // ========================================

    const emotionsConfig = [
        {
            name: 'HAPPINESS',
            className: 'pill-happy',
            color: '#FEF3C7',
            textColor: '#B45309'
        },
        {
            name: 'NEUTRAL',
            className: 'pill-neutral',
            color: '#F1F5F9',
            textColor: '#1E293B'
        },
        {
            name: 'SURPRISE',
            className: 'pill-surprise',
            color: '#DBEAFE',
            textColor: '#1D4ED8'
        },
        {
            name: 'SADNESS',
            className: 'pill-sadness',
            color: '#E5E7EB',
            textColor: '#374151'
        },
        {
            name: 'FEAR',
            className: 'pill-fear',
            color: '#F3E8FF',
            textColor: '#6D28D9'
        },
        {
            name: 'ANGER',
            className: 'pill-anger',
            color: '#FEE2E2',
            textColor: '#B91C1C'
        }
    ];

    // ========================================
    // ANALYZE EMOTION
    // ========================================

    function analyzeEmotion() {
        if (!capturedDataUrl) {
            showToast('Please capture a photo first.', true);
            return;
        }

        // Prevent repeated analysis clicks
        if (btnAnalyze.disabled) {
            return;
        }

        // Display loading state
        btnAnalyze.disabled = true;
        analyzeSpinner.style.display = 'inline-block';
        analyzeBtnLabel.textContent = 'Analyzing...';

        setTimeout(() => {
            // Simulated emotion detection.
            // This randomly selects an emotion and does not
            // perform actual facial emotion recognition.
            const detected =
                emotionsConfig[
                    Math.floor(Math.random() * emotionsConfig.length)
                ];

            // Display captured photo
            resultPhoto.src = capturedDataUrl;

            // Display detected emotion
            resultEmotionBadge.textContent = detected.name;
            resultEmotionBadge.style.background = detected.color;
            resultEmotionBadge.style.color = detected.textColor;

            // Show the results section
            detectedEmotionSection.classList.remove('hidden');

            // Reset loading state
            btnAnalyze.disabled = false;
            analyzeSpinner.style.display = 'none';
            analyzeBtnLabel.textContent = 'Analyze Emotion';

            // Scroll to the results
            detectedEmotionSection.scrollIntoView({
                behavior: 'smooth'
            });

            showToast('Emotion analysis complete!');
        }, 1500);
    }

    // ========================================
    // RESET AND CAPTURE ANOTHER PHOTO
    // ========================================

    function resetAll() {
        detectedEmotionSection.classList.add('hidden');

        resetToCameraPreview();

        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    }

    // ========================================
    // BUTTON EVENT LISTENERS
    // ========================================

    btnCapture.addEventListener('click', captureFrame);

    btnRetake.addEventListener('click', resetToCameraPreview);

    btnAnalyze.addEventListener('click', analyzeEmotion);

    btnCaptureAnother.addEventListener('click', resetAll);

    // ========================================
    // NAVIGATION BUTTONS
    // ========================================

    document.getElementById('navDashboard').addEventListener('click', () => {
        showToast('Dashboard screen selected.');
    });

    document.getElementById('navCapture').addEventListener('click', () => {
        showToast('You are on the Capture screen.');
    });

    document.getElementById('navUpload').addEventListener('click', () => {
        showToast('Upload screen selected.');
    });

    document.getElementById('navHistory').addEventListener('click', () => {
        showToast('History screen selected.');
    });

    // ========================================
    // START CAMERA WHEN PAGE LOADS
    // ========================================

    initCamera();
});

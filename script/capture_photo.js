document.addEventListener('DOMContentLoaded', () => {
    // ========================================
    // UI REFERENCES
    // ========================================

    const webcamVideo = document.getElementById('webcamVideo');
    const photoCanvas = document.getElementById('photoCanvas');

    const btnCapture = document.getElementById('btnCapture');
    const btnRetake = document.getElementById('btnRetake');
    const btnAnalyze = document.getElementById('btnAnalyze');
    const btnCaptureAnother = document.getElementById('btnCaptureAnother');

    const analyzeSpinner = document.getElementById('analyzeSpinner');
    const analyzeBtnLabel = document.getElementById('analyzeBtnLabel');

    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');

    const detectedEmotionSection = document.getElementById('detectedEmotionSection');
    const resultPhoto = document.getElementById('resultPhoto');
    const resultEmotionText = document.getElementById('resultEmotionText');
    const resultCard = document.querySelector('.result-box-card');
    const toast = document.getElementById('toast');

    // ========================================
    // VARIABLES
    // ========================================

    let mediaStream = null;
    let capturedDataUrl = null;

    // ========================================
    // EMOTION CATEGORIES
    // ========================================

    const emotionsConfig = [
        {
            name: 'HAPPINESS',
            className: 'pill-happy',
            color: '#ff9900'
        },
        {
            name: 'ANGER',
            className: 'pill-anger',
            color: '#f04438'
        },
        {
            name: 'DISGUST',
            className: 'pill-disgust',
            color: '#22c875'
        },
        {
            name: 'FEAR',
            className: 'pill-fear',
            color: '#ff7955'
        },
        {
            name: 'NEUTRALITY',
            className: 'pill-neutral',
            color: '#303642'
        },
        {
            name: 'SADNESS',
            className: 'pill-sadness',
            color: '#258bff'
        },
        {
            name: 'SURPRISE',
            className: 'pill-surprise',
            color: '#a855f7'
        }
    ];

    // ========================================
    // TOAST NOTIFICATION
    // ========================================

    function showToast(msg, isError = false) {
        if (!toast) return;
        toast.textContent = msg;
        toast.className = `toast show ${isError ? 'error' : ''}`;

        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    // ========================================
    // DISPLAY RESULT
    // ========================================

    function displayEmotion(emotion) {
        if (!emotion) return;

        // Emotion name in the result badge
        resultEmotionText.textContent = emotion.name;

        // Dot color in the badge and in the "Analysis Complete" pill
        const badge = resultEmotionText.parentElement;
        if (badge) {
            badge.style.setProperty('--result-color', emotion.color);
            const resultDot = badge.querySelector('.result-dot');
            if (resultDot) {
                resultDot.style.backgroundColor = emotion.color;
            }
        }
        detectedEmotionSection.style.setProperty('--result-color', emotion.color);

        // Card colors: remove the old emotion class, add the new one
        emotionsConfig.forEach(item => resultCard.classList.remove(item.className));
        resultCard.classList.add(emotion.className);

        // Highlight the matching pill in the legend
        document.querySelectorAll('.legend-pill').forEach(pill => {
            pill.classList.toggle('active', pill.dataset.emotion === emotion.name);
        });
    }

    // ========================================
    // INITIALIZE & CLEAN UP CAMERA
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

            showToast('Unable to access webcam. Please check permissions.', true);
        }
    }

    window.addEventListener('beforeunload', () => {
        if (mediaStream) {
            mediaStream.getTracks().forEach(track => track.stop());
        }
    });

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

        // Update action buttons
        btnCapture.style.display = 'none';
        btnRetake.style.display = 'inline-flex';
        btnAnalyze.style.display = 'inline-flex';
        btnAnalyze.disabled = false;

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

        btnCapture.style.display = 'inline-flex';
        btnRetake.style.display = 'none';
        btnAnalyze.style.display = 'none';

        capturedDataUrl = null;

        // Reset analysis button
        btnAnalyze.disabled = false;
        if (analyzeSpinner) {
            analyzeSpinner.style.display = 'none';
        }
        analyzeBtnLabel.textContent = 'Analyze Photo';

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
    // ANALYZE EMOTION
    // ========================================

    async function analyzeEmotion() {
        if (!capturedDataUrl) {
            showToast('Please capture a photo first.', true);
            return;
        }

        if (btnAnalyze.disabled) {
            return;
        }

        // Show loading state
        btnAnalyze.disabled = true;
        if (analyzeSpinner) {
            analyzeSpinner.style.display = 'inline-block';
        }
        analyzeBtnLabel.textContent = 'Analyzing...';

        try {
            const photoBlob = await fetch(capturedDataUrl).then(res => res.blob());
            const photoFile = new File([photoBlob], 'captured_photo.png', {
                type: 'image/png'
            });

            const formData = new FormData();
            formData.append('image', photoFile);

            const response = await fetch('/api/analyze', {
                method: 'POST',
                body: formData
            });

            const responseText = await response.text();
            let data;

            try {
                data = JSON.parse(responseText);
            } catch (error) {
                console.error('Invalid backend response:', responseText);
                throw new Error(`Invalid backend response. HTTP status: ${response.status}`);
            }

            if (!response.ok || !data.success) {
                throw new Error(data.error || 'Unable to analyze the captured photo.');
            }

            const emotionNames = {
                happy: 'HAPPINESS',
                angry: 'ANGER',
                disgust: 'DISGUST',
                fear: 'FEAR',
                neutral: 'NEUTRALITY',
                sad: 'SADNESS',
                surprise: 'SURPRISE'
            };

            const detectedName = emotionNames[String(data.emotion).toLowerCase()];

            if (!detectedName) {
                throw new Error('Unknown emotion returned by the backend.');
            }

            resultPhoto.src = capturedDataUrl;

            const detected = emotionsConfig.find(item => item.name === detectedName);
            displayEmotion(detected);

            detectedEmotionSection.classList.remove('hidden');
            detectedEmotionSection.scrollIntoView({ behavior: 'smooth' });

            showToast('Emotion analysis complete!');
        } catch (error) {
            console.error('Emotion analysis error:', error);
            showToast(error.message || 'Unable to connect to the backend.', true);
        } finally {
            btnAnalyze.disabled = false;
            if (analyzeSpinner) {
                analyzeSpinner.style.display = 'none';
            }
            analyzeBtnLabel.textContent = 'Analyze Photo';
        }
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
    // SESSION & NAVBAR PROFILE
    // ========================================

    (async () => {
        const headerAvatar = document.getElementById('headerUserAvatar');
        const headerName = document.getElementById('headerUserName');

        try {
            const res = await fetch('/api/me');

            if (res.status === 401) {
                window.location.href = 'index.html';
                return;
            }

            const data = await res.json();
            if (data.user) {
                const user = data.user;
                const fullName = `${user.first_name} ${user.last_name}`;
                const initials = `${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}`.toUpperCase() || 'U';
                const fallbackAvatar =
                    'data:image/svg+xml;utf8,' +
                    encodeURIComponent(
                        `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' fill='%23F4DAFF'/><text x='50' y='58' text-anchor='middle' font-family='Inter,sans-serif' font-size='36' font-weight='700' fill='%23794A98'>${initials}</text></svg>`
                    );

                if (headerName) headerName.textContent = fullName;
                if (headerAvatar) headerAvatar.src = user.avatar_url || fallbackAvatar;
            }
        } catch (err) {
            console.error('Failed to verify session:', err);
        }
    })();

    // ========================================
    // START CAMERA WHEN PAGE LOADS
    // ========================================

    initCamera();
});
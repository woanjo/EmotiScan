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
    const resultEmotionText = document.getElementById('resultEmotionText');
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
        }
    ];

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
            // Convert the captured photo into a file.
            const photoBlob = await fetch(capturedDataUrl)
                .then(response => response.blob());

            const photoFile = new File(
                [photoBlob],
                'captured_photo.png',
                { type: 'image/png' }
            );

            // Send the photo to the Flask backend.
            const formData = new FormData();
            formData.append('image', photoFile);

            const response = await fetch('/api/analyze', {
                method: 'POST',
                body: formData
            });

            // Safely read the backend response.
            const responseText = await response.text();
            let data;

            try {
                data = JSON.parse(responseText);
            } catch (error) {
                console.error('Invalid backend response:', responseText);
                throw new Error(
                    `Invalid backend response. HTTP status: ${response.status}`
                );
            }

            if (!response.ok || !data.success) {
                throw new Error(
                    data.message || 'Unable to analyze the captured photo.'
                );
            }

            // Match DeepFace emotion names with the existing UI.
            const emotionNames = {
                happy: 'HAPPINESS',
                angry: 'ANGER',
                disgust: 'DISGUST',
                fear: 'FEAR',
                neutral: 'NEUTRALITY',
                sad: 'SADNESS',
            };

            const detectedName =
                emotionNames[String(data.emotion).toLowerCase()];

            if (!detectedName) {
                throw new Error('Unknown emotion returned by the backend.');
            }

            // Display the captured photo.
            resultPhoto.src = capturedDataUrl;

            // Find the matching emotion design.
            const detected = emotionsConfig.find(
                item => item.name === detectedName
            );

            // Display the detected emotion.
            if (resultEmotionText) {
                resultEmotionText.textContent = detectedName;
            }

            // Update the result indicator color.
            const resultEmotionBadge = resultEmotionText
                ? resultEmotionText.parentElement
                : null;

            const resultDot = resultEmotionBadge
                ? resultEmotionBadge.querySelector('.result-dot')
                : null;

            if (resultDot && detected) {
                resultDot.style.backgroundColor = detected.color;
            }

            // Update the active emotion in the legend.
            document.querySelectorAll('.legend-pill').forEach(pill => {
                pill.classList.toggle(
                    'active',
                    pill.dataset.emotion === detectedName
                );
            });

            // Display the result section.
            detectedEmotionSection.classList.remove('hidden');

            detectedEmotionSection.scrollIntoView({
                behavior: 'smooth'
            });

            showToast('Emotion analysis complete!');

        } catch (error) {
            console.error('Emotion analysis error:', error);
            showToast(
                error.message || 'Unable to connect to the backend.',
                true
            );

        } finally {
            // Restore the Analyze button.
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
        if (analyzeSpinner) {
            analyzeSpinner.style.display = 'none';
        }
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

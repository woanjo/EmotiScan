document.addEventListener('DOMContentLoaded', () => {
    // ========================================
    // UI REFERENCES
    // ========================================

    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('fileInput');
    const btnSelectFile = document.getElementById('btnSelectFile');
    const uploadDefaultContent = document.getElementById('uploadDefaultContent');
    const previewContainer = document.getElementById('previewContainer');
    const previewImage = document.getElementById('previewImage');
    const fileInfo = document.getElementById('fileInfo');

    const btnReset = document.getElementById('btnReset');
    const btnAnalyze = document.getElementById('btnAnalyze');
    const analyzeIcon = document.getElementById('analyzeIcon');
    const analyzeSpinner = document.getElementById('analyzeSpinner');
    const analyzeLabel = document.getElementById('analyzeLabel');

    const detectedEmotionSection =
        document.getElementById('detectedEmotionSection');

    const resultPhoto = document.getElementById('resultPhoto');
    const resultEmotionBadge =
        document.getElementById('resultEmotionBadge');

    const resultEmotionText =
        document.getElementById('resultEmotionText');

    const resultCard = document.querySelector('.result-box-card');

    const btnUploadAnother =
        document.getElementById('btnUploadAnother');

    const toast = document.getElementById('toast');

    let selectedFile = null;
    let imageBase64 = null;

    // Prevent multiple analysis requests at the same time.
    let isAnalyzing = false;

    // ========================================
    // EMOTION CONFIGURATION
    // ========================================
    // These are demo results. Random selection is NOT
    // actual facial emotion recognition.

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
    // TOAST NOTIFICATION
    // ========================================

    let toastTimeout = null;

    function showToast(message, isError = false) {
        if (!toast) return;

        toast.textContent = message;
        toast.className = `toast show${isError ? ' error' : ''}`;

        if (toastTimeout) {
            clearTimeout(toastTimeout);
        }

        toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }

    // ========================================
    // FILE SELECTION
    // ========================================

    if (btnSelectFile && fileInput) {
        btnSelectFile.addEventListener('click', (event) => {
            event.stopPropagation();
            fileInput.click();
        });
    }

    if (dropzone && fileInput) {
        dropzone.addEventListener('click', (event) => {
            // Do not open the file dialog when clicking
            // the preview or its information.
            if (event.target.closest('#previewContainer')) {
                return;
            }

            if (
                !selectedFile &&
                !event.target.closest('#btnSelectFile')
            ) {
                fileInput.click();
            }
        });

        // ========================================
        // DRAG AND DROP
        // ========================================

        ['dragenter', 'dragover'].forEach((eventName) => {
            dropzone.addEventListener(eventName, (event) => {
                event.preventDefault();
                event.stopPropagation();

                dropzone.classList.add('dragover');
            });
        });

        ['dragleave', 'drop'].forEach((eventName) => {
            dropzone.addEventListener(eventName, (event) => {
                event.preventDefault();
                event.stopPropagation();

                dropzone.classList.remove('dragover');
            });
        });

        dropzone.addEventListener('drop', (event) => {
            if (isAnalyzing) return;

            const files = event.dataTransfer?.files;

            if (files && files.length > 0) {
                handleFileSelection(files[0]);
            }
        });
    }

    // ========================================
    // FILE INPUT CHANGE
    // ========================================

    if (fileInput) {
        fileInput.addEventListener('change', () => {
            if (isAnalyzing) return;

            if (fileInput.files && fileInput.files[0]) {
                handleFileSelection(fileInput.files[0]);
            }
        });
    }

    // ========================================
    // VALIDATE AND DISPLAY IMAGE
    // ========================================

    function handleFileSelection(file) {
        const validTypes = [
            'image/jpeg',
            'image/jpg',
            'image/png',
            'image/webp'
        ];

        const maxSize = 10 * 1024 * 1024; // 10 MB

        if (!validTypes.includes(file.type)) {
            showToast(
                'Invalid file format. Please upload JPG, JPG, PNG, or WEBP.',
                true
            );

            if (fileInput) {
                fileInput.value = '';
            }

            return;
        }

        if (file.size > maxSize) {
            showToast(
                'File is too large. Maximum allowed size is 10MB.',
                true
            );

            if (fileInput) {
                fileInput.value = '';
            }

            return;
        }

        selectedFile = file;
        imageBase64 = null;

        const reader = new FileReader();

        reader.onload = (event) => {
            // Ignore outdated reads if the selection changed.
            if (selectedFile !== file) return;

            if (typeof event.target.result !== 'string') {
                showToast(
                    'Unable to read this image. Please try again.',
                    true
                );
                return;
            }

            imageBase64 = event.target.result;

            if (previewImage) {
                previewImage.src = imageBase64;
            }

            if (fileInfo) {
                const sizeMB = (
                    file.size / (1024 * 1024)
                ).toFixed(2);

                fileInfo.textContent =
                    `${file.name} (${sizeMB} MB)`;
            }

            if (uploadDefaultContent) {
                uploadDefaultContent.style.display = 'none';
            }

            if (previewContainer) {
                previewContainer.style.display = 'flex';
            }

            // A new image should not leave the previous
            // analysis result visible.
            if (detectedEmotionSection) {
                detectedEmotionSection.classList.add('hidden');
            }

            showToast('Image uploaded successfully!');
        };

        reader.onerror = () => {
            if (selectedFile === file) {
                selectedFile = null;
                imageBase64 = null;
            }

            if (fileInput) {
                fileInput.value = '';
            }

            showToast(
                'Unable to read this image. Please try another file.',
                true
            );
        };

        reader.readAsDataURL(file);
    }

    // ========================================
    // UPDATE EMOTION RESULT
    // ========================================

    function displayEmotion(emotion) {
        if (
            !emotion ||
            !resultEmotionBadge ||
            !resultEmotionText
        ) {
            return;
        }

        resultEmotionText.textContent = emotion.name;

        // The CSS uses this variable for the colored dot.
        resultEmotionBadge.style.setProperty(
            '--result-color',
            emotion.color
        );

        // The status dot at the top follows the emotion color too.
        if (detectedEmotionSection) {
            detectedEmotionSection.style.setProperty(
                '--result-color',
                emotion.color
            );
        }

        // Give the result card the same color theme as the
        // selected emotion (border, glow, handle, background).
        if (resultCard) {
            emotionsConfig.forEach((item) => {
                resultCard.classList.remove(item.className);
            });

            resultCard.classList.add(emotion.className);
        }

        // Highlight the matching legend item.
        document.querySelectorAll('.legend-pill').forEach((pill) => {
            const isActive =
                pill.dataset.emotion === emotion.name;

            pill.classList.toggle('active', isActive);
        });
    }

    // ========================================
    // RESET UPLOAD AND RESULTS
    // ========================================

    function clearSelection() {
        selectedFile = null;
        imageBase64 = null;
        isAnalyzing = false;

        if (fileInput) {
            fileInput.value = '';
        }

        if (previewImage) {
            previewImage.removeAttribute('src');
        }

        if (fileInfo) {
            fileInfo.textContent = '';
        }

        if (resultPhoto) {
            resultPhoto.removeAttribute('src');
        }

        if (previewContainer) {
            previewContainer.style.display = 'none';
        }

        if (uploadDefaultContent) {
            uploadDefaultContent.style.display = 'flex';
        }

        if (detectedEmotionSection) {
            detectedEmotionSection.classList.add('hidden');
        }

        // Restore the Analyze button.
        if (btnAnalyze) {
            btnAnalyze.disabled = false;
        }

        if (analyzeIcon) {
            analyzeIcon.style.display = 'inline-block';
        }

        if (analyzeSpinner) {
            analyzeSpinner.style.display = 'none';
        }

        if (analyzeLabel) {
            analyzeLabel.textContent = 'Analyze Emotion';
        }

        // Clear the active legend selection.
        document.querySelectorAll('.legend-pill').forEach((pill) => {
            pill.classList.remove('active');
        });

        // Restore the default result label.
        const defaultEmotion = emotionsConfig[0];

        displayEmotion(defaultEmotion);
    }

    if (btnReset) {
        btnReset.addEventListener('click', () => {
            if (isAnalyzing) return;

            clearSelection();
            showToast('Upload reset.');
        });
    }

    // ========================================
    // ANALYZE EMOTION
    // ========================================

    if (btnAnalyze) {
        btnAnalyze.addEventListener('click', async () => {
            if (isAnalyzing) return;

            if (!selectedFile) {
                showToast('Please select an image first.', true);
                return;
            }

            isAnalyzing = true;
            btnAnalyze.disabled = true;

            if (analyzeIcon) {
                analyzeIcon.style.display = 'none';
            }

            if (analyzeSpinner) {
                analyzeSpinner.style.display = 'inline-block';
                analyzeSpinner.classList.add('spinner');
            }

            if (analyzeLabel) {
                analyzeLabel.textContent = 'Analyzing...';
            }

            try {
                // Send the selected photo to the Flask backend.
                const formData = new FormData();
                formData.append('image', selectedFile);

                const response = await fetch('/api/analyze', {
                    method: 'POST',
                    body: formData
                });

                const data = await response.json();

                if (!response.ok || !data.success) {
                    throw new Error(
                        data.message || 'Unable to analyze the image.'
                    );
                }

                // Convert the backend emotion into the UI label.
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

                const detected = emotionsConfig.find(
                    item => item.name === detectedName
                );

                if (!detected) {
                    throw new Error(
                        'The backend returned an unsupported emotion.'
                    );
                }

                // Show the uploaded photo and actual backend result.
                if (resultPhoto) {
                    resultPhoto.src = imageBase64;
                }

                displayEmotion(detected);

                if (detectedEmotionSection) {
                    detectedEmotionSection.classList.remove('hidden');
                    detectedEmotionSection.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center'
                    });
                }

                const score = Number(data.score);

                if (Number.isFinite(score)) {
                    showToast(
                        `${detected.name} detected. Model score: ${score.toFixed(2)}%.`
                    );
                } else {
                    showToast(`${detected.name} detected successfully!`);
                }

            } catch (error) {
                console.error('Emotion analysis error:', error);

                showToast(
                    error.message ||
                    'Cannot connect to the backend. Check that Flask is running.',
                    true
                );

            } finally {
                isAnalyzing = false;
                btnAnalyze.disabled = false;

                if (analyzeIcon) {
                    analyzeIcon.style.display = 'inline-block';
                }

                if (analyzeSpinner) {
                    analyzeSpinner.style.display = 'none';
                    analyzeSpinner.classList.remove('spinner');
                }

                if (analyzeLabel) {
                    analyzeLabel.textContent = 'Analyze Emotion';
                }
            }
        });
    }

    // ========================================
    // UPLOAD ANOTHER PHOTO
    // ========================================

    if (btnUploadAnother) {
        btnUploadAnother.addEventListener('click', () => {
            if (isAnalyzing) return;

            clearSelection();

            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });
    }

    // ========================================
    // NAVIGATION HANDLERS
    // ========================================

    const navDashboard = document.getElementById('navDashboard');
    const navCapture = document.getElementById('navCapture');
    const navUpload = document.getElementById('navUpload');
    const navHistory = document.getElementById('navHistory');

    if (navDashboard) {
        navDashboard.addEventListener('click', () => {
            showToast('Navigating to Dashboard...');
        });
    }

    if (navCapture) {
        navCapture.addEventListener('click', () => {
            showToast('Navigating to Capture...');
        });
    }

    if (navUpload) {
        navUpload.addEventListener('click', () => {
            showToast('You are currently on Upload screen.');
        });
    }

    if (navHistory) {
        navHistory.addEventListener('click', () => {
            showToast('Navigating to History...');
        });
    }

    // ========================================
    // INITIALIZE
    // ========================================

    if (detectedEmotionSection) {
        detectedEmotionSection.classList.add('hidden');
    }

    if (analyzeSpinner) {
        analyzeSpinner.classList.remove('spinner');
        analyzeSpinner.style.display = 'none';
    }
});
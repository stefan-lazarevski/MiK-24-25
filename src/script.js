// Global variables for models
let mobileNetModel;
let toxicityModel;
let tesseractWorker;

// Wait for the page to load
document.addEventListener('DOMContentLoaded', async () => {
    // Set up the upload area interaction
    const uploadArea = document.getElementById('uploadArea');
    const imageInput = document.getElementById('imageInput');
    const imagePreview = document.getElementById('imagePreview');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const resultContainer = document.getElementById('resultContainer');
    const safetyResult = document.getElementById('safetyResult');
    const contentDescription = document.getElementById('contentDescription');
    const textAnalysisResult = document.getElementById('textAnalysisResult');
    const pointsDisplay = document.getElementById('points');
    const progressBar = document.getElementById('progressBar');
    const badgesContainer = document.getElementById('badges');

    // Initialize points system
    initPointsSystem();

    // Progress button
    const progressButton = document.createElement('button');
    progressButton.id = 'progressButton';
    progressButton.className = 'progress-button';
    progressButton.textContent = 'View Progress';
    progressButton.onclick = () => window.location.href = 'progress.html';
    document.querySelector('.container').appendChild(progressButton);

    // Unsafe content categories to check
    const unsafeCategories = {
        'weapon': 'оружје',
        'knife': 'нож',
        'gun': 'пиштол',
        'blood': 'крв',
        'violence': 'насилство',
        'injury': 'повреда',
        'drugs': 'дрога',
        'pills': 'таблети',
        'alcohol': 'алкохол',
        'cigarette': 'цигари',
        'smoking': 'пушење',
        'inappropriate': 'несоодветно',
        'nude': 'голо',
        'scary': 'страшно',
        'horror': 'хорор'
    };

    // Offensive word patterns in Macedonian and English
    const offensivePatterns = [
        // Macedonian offensive words
        /глуп/i, /идиот/i, /будала/i, /ретардиран/i, /дебел/i, /грд/i,
        /мрзам/i, /умри/i, /убиј/i, /згини/i,
        /неспособен/i, /некомпетентен/i, /отепај/i, /смрден/i,

        // English offensive words
        /stupid/i, /idiot/i, /dumb/i, /fat/i, /ugly/i, /hate/i, /kill/i, /die/i,
        /loser/i, /failure/i, /retard/i, /incompetent/i
    ];

    // Load models on page load
    try {
        loadingIndicator.style.display = 'block';

        // Load MobileNet model for image classification
        console.log("Вчитување на MobileNet модел...");
        mobileNetModel = await mobilenet.load();

        // Load toxicity model for text analysis
        console.log("Вчитување на модел за токсичност...");
        toxicityModel = await toxicity.load(0.7, ['identity_attack', 'insult', 'threat', 'toxicity', 'severe_toxicity']);

        // Initialize Tesseract OCR with Macedonian and English languages
        console.log("Иницијализација на OCR за препознавање текст...");
        tesseractWorker = await Tesseract.createWorker();
        await tesseractWorker.loadLanguage('mkd+eng');
        await tesseractWorker.initialize('mkd+eng');

        console.log("Сите модели се успешно вчитани!");
        loadingIndicator.style.display = 'none';
    } catch (error) {
        console.error("Грешка при вчитување на моделите:", error);
        loadingIndicator.style.display = 'none';
        alert("Грешка при вчитување на моделите. Ве молиме проверете ја вашата интернет конекција и пробајте повторно.");
    }

    // Set up click event for upload area
    uploadArea.addEventListener('click', () => {
        imageInput.click();
    });

    // Handle drag and drop
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.style.backgroundColor = '#f0f0ff';
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.style.backgroundColor = '';
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.style.backgroundColor = '';

        if (e.dataTransfer.files.length) {
            handleFile(e.dataTransfer.files[0]);
        }
    });

    // Handle file input change
    imageInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            handleFile(e.target.files[0]);
        }
    });

    // Add onload event to image preview to ensure the image is fully loaded
    imagePreview.addEventListener('load', async () => {
        if (imagePreview.complete && imagePreview.naturalWidth > 0) {
            try {
                await analyzeImage();
            } catch (error) {
                console.error("Грешка при анализа на сликата:", error);
                displayResult('warning', 'Се појави грешка при анализата на сликата.');
            }
        }
    });

    // Function to handle the selected file
    function handleFile(file) {
        if (!file.type.match('image.*')) {
            alert('Ве молиме поставете само слики.');
            return;
        }

        const reader = new FileReader();

        reader.onload = (e) => {
            // Display the image
            imagePreview.src = e.target.result;
            imagePreview.style.display = 'block';

            // Show loading indicator and hide previous results
            loadingIndicator.style.display = 'block';
            resultContainer.style.display = 'none';
            textAnalysisResult.innerHTML = '';

            // Note: Analysis will be triggered by the imagePreview.onload event
        };

        reader.readAsDataURL(file);
    }

    // Function to analyze the image
    async function analyzeImage() {
        if (!mobileNetModel || !toxicityModel || !tesseractWorker) {
            alert('Моделите сè уште не се вчитани. Ве молиме почекајте и обидете се повторно.');
            loadingIndicator.style.display = 'none';
            return;
        }

        // Double-check image is valid before proceeding
        if (!imagePreview.complete || imagePreview.naturalWidth === 0) {
            console.error("Сликата не е целосно вчитана");
            displayResult('warning', 'Грешка при вчитување на сликата. Обидете се повторно.');
            loadingIndicator.style.display = 'none';
            return;
        }

        try {
            // Use MobileNet to classify the image content
            const imageClassification = await mobileNetModel.classify(imagePreview);
            console.log("Резултати од класификација на слика:", imageClassification);

            // Extract text from image using OCR
            console.log("Екстрахирање текст од слика...");
            const {data} = await tesseractWorker.recognize(imagePreview);
            const extractedText = data.text.trim();
            console.log("Екстрахиран текст:", extractedText);

            // Variables to track safety status
            let isSafe = true;
            let unsafeReasons = [];
            let detectedObjects = [];
            let textAnalysisHTML = '';

            // Check image content against unsafe categories
            imageClassification.forEach(prediction => {
                const className = prediction.className.toLowerCase();
                detectedObjects.push(`${prediction.className} (${(prediction.probability * 100).toFixed(1)}%)`);

                // Check detected objects against unsafe categories
                for (const [key, value] of Object.entries(unsafeCategories)) {
                    if (className.includes(key)) {
                        isSafe = false;
                        if (!unsafeReasons.includes(value)) {
                            unsafeReasons.push(value);
                        }
                    }
                }
            });

            // Only proceed with text analysis if text was found
            if (extractedText && extractedText.length > 0) {
                // Check if the extracted text is meaningful (not just spaces, punctuation, or OCR errors)
                const meaningfulText = extractedText.replace(/[\s\n\r\t.,;:!?()]/g, '');

                if (meaningfulText.length > 0) {
                    textAnalysisHTML = `<div class="text-analysis"><h3>Препознаен текст во сликата:</h3><p class="extracted-text">${extractedText}</p>`;

                    // Check for offensive words using patterns
                    let containsOffensiveWords = false;
                    const offensiveWordsFound = [];

                    offensivePatterns.forEach(pattern => {
                        if (pattern.test(extractedText)) {
                            containsOffensiveWords = true;
                            // Extract the matching word
                            const match = extractedText.match(pattern);
                            if (match && match[0] && !offensiveWordsFound.includes(match[0])) {
                                offensiveWordsFound.push(match[0]);
                            }
                        }
                    });

                    // Also check using the toxicity model for more advanced analysis
                    const toxicityResults = await checkTextToxicity(extractedText);

                    if (containsOffensiveWords || toxicityResults.isToxic) {
                        isSafe = false;

                        if (containsOffensiveWords) {
                            unsafeReasons.push('навредлив текст');
                            textAnalysisHTML += `<p class="text-warning">⚠️ Пронајдени потенцијално навредливи зборови: ${offensiveWordsFound.join(', ')}</p>`;
                        }

                        if (toxicityResults.isToxic) {
                            unsafeReasons.push('токсичен/малтретирачки текст');
                            textAnalysisHTML += `<p class="text-warning">⚠️ Текстот содржи: ${toxicityResults.categories.join(', ')}</p>`;
                        }
                    } else {
                        textAnalysisHTML += '<p class="text-safe">✓ Текстот изгледа безбеден</p>';
                    }

                    textAnalysisHTML += '</div>';
                } else {
                    // If there's no meaningful text, don't display the text analysis section
                    textAnalysisHTML = '';
                }
            } else {
                // No text found, don't display the text analysis section
                textAnalysisHTML = '<div class="text-analysis"><p>Нема препознаен текст во сликата.</p></div>';
            }

            // Create a safety status message
            let safetyStatusMessage = '';
            if (isSafe) {
                safetyStatusMessage = '<p class="text-safe" style="font-size: 18px; text-align: center; margin-top: 10px;">✓ Оваа слика е БЕЗБЕДНА</p>';
                // Add points for safe image
                updatePoints(5);
            } else {
                safetyStatusMessage = '<p class="text-warning" style="font-size: 18px; text-align: center; margin-top: 10px;">⚠️ Оваа слика е НЕБЕЗБЕДНА</p>';
                // Add encouraging message for unsafe image
                safetyStatusMessage += '<p style="text-align: center;">Не се грижи, обиди се со друга слика! Ќе успееш следниот пат!</p>';
            }

            // Display the results
            if (isSafe) {
                displayResult('safe', 'Оваа слика изгледа безбедна.', detectedObjects, textAnalysisHTML, safetyStatusMessage);
            } else {
                const reasonText = `Можеби содржи: ${unsafeReasons.join(', ')}`;
                displayResult('unsafe', reasonText, detectedObjects, textAnalysisHTML, safetyStatusMessage);
            }

        } catch (error) {
            console.error("Грешка при анализа:", error);
            displayResult('warning', 'Не можам да ја анализирам сликата. Обидете се со друга слика.');
        } finally {
            loadingIndicator.style.display = 'none';
        }
    }

    // Function to check text for toxicity
    async function checkTextToxicity(text) {
        if (!toxicityModel || !text || text.trim().length < 3) {
            return {isToxic: false, categories: []};
        }

        try {
            const predictions = await toxicityModel.classify(text);

            let isToxic = false;
            let categories = [];

            predictions.forEach(prediction => {
                if (prediction.results[0].match) {
                    isToxic = true;

                    // Convert toxicity categories to Macedonian
                    let categoryName;
                    switch (prediction.label) {
                        case 'identity_attack':
                            categoryName = 'напад на идентитет';
                            break;
                        case 'insult':
                            categoryName = 'навреда';
                            break;
                        case 'threat':
                            categoryName = 'закана';
                            break;
                        case 'toxicity':
                            categoryName = 'токсичност';
                            break;
                        case 'severe_toxicity':
                            categoryName = 'сериозна токсичност';
                            break;
                        default:
                            categoryName = prediction.label;
                    }

                    categories.push(categoryName);
                }
            });

            return {isToxic, categories};
        } catch (error) {
            console.error("Грешка при проверка на токсичност:", error);
            return {isToxic: false, categories: []};
        }
    }

    // Function to display results
    function displayResult(status, message, objects = [], textAnalysisHTML = '', safetyStatusMessage = '') {
        resultContainer.className = status;
        resultContainer.style.display = 'block';

        safetyResult.innerHTML = `<strong>${message}</strong>`;

        if (objects && objects.length > 0) {
            contentDescription.innerHTML = '<p><strong>Препознавам:</strong></p><ul>' +
                objects.map(obj => `<li>${obj}</li>`).join('') +
                '</ul>';
        } else {
            contentDescription.innerHTML = '';
        }

        // Set the text analysis result
        textAnalysisResult.innerHTML = textAnalysisHTML;

        // Add the safety status message after the content description
        if (safetyStatusMessage) {
            contentDescription.innerHTML += safetyStatusMessage;
        }
    }

// Points system functions
    function initPointsSystem() {
        const userPoints = getUserPoints();
        updatePointsDisplay(userPoints);

        // Display earned badges
        displayBadges();

        // Add CSS for points system
        const style = document.createElement('style');
        style.textContent = `
        #progressBar {
            height: 20px;
            width: 0%;
            background-color: #4CAF50;
            transition: width 0.3s ease-in-out;
        }
        
        .progress-bar-container {
            width: 100%;
            height: 20px;
            background-color: #e0e0e0;
            border-radius: 5px;
            margin-top: 10px;
            overflow: hidden;
        }
        
        #badges {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            margin-top: 10px;
        }
        
        .badge {
            padding: 5px 10px;
            background-color: #f0f0f0;
            border-radius: 5px;
            display: inline-block;
            font-weight: bold;
            border: 2px solid #4CAF50;
        }
        
        .progress-button {
            background-color: #000000;
            color: white;
            border: none;
            border-radius: 5px;
            padding: 10px 0px;
            cursor: pointer;
            font-weight: bold;
            margin-top: 10px;
            display: block;
            width: 200px;
            margin: 10px auto;
        }

        
        @keyframes celebrate {
            0% { transform: scale(1); }
            50% { transform: scale(1.2); }
            100% { transform: scale(1); }
        }
        
        .celebrate {
            animation: celebrate 0.5s ease-in-out;
        }
        
        .badge-message {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background-color: rgba(0,0,0,0.8);
            color: white;
            padding: 20px;
            border-radius: 10px;
            text-align: center;
            z-index: 2000;
        }
        
        .badge-message h2 {
            margin-top: 0;
        }
        
        .badge-message p {
            margin-bottom: 0;
        }
    `;
        document.head.appendChild(style);
    }

    function getUserPoints() {
        return parseInt(localStorage.getItem('userPoints') || '0');
    }

    function updatePoints(points) {
        const currentPoints = getUserPoints();
        const newPoints = currentPoints + points;
        localStorage.setItem('userPoints', newPoints.toString());

        updatePointsDisplay(newPoints);

        // Check if user reached a milestone
        checkMilestone(currentPoints, newPoints);

        // Update leaderboard
        updateLeaderboard(newPoints);
    }

    function updatePointsDisplay(points) {
        // Update the points display
        if (pointsDisplay) {
            pointsDisplay.textContent = points;
        }

        // Get the next milestone
        const nextMilestone = getNextMilestone(points);
        const progress = ((points % nextMilestone.threshold) / nextMilestone.threshold) * 100;

        // Update progress bar
        if (progressBar) {
            progressBar.style.width = `${progress}%`;
        }

        // Update badges display
        displayBadges();
    }

    function displayBadges() {
        if (!badgesContainer) return;

        const badges = getEarnedBadges();
        badgesContainer.innerHTML = '';

        if (badges.length === 0) {
            badgesContainer.innerHTML = '<p>Немате освоено значки. Продолжете да поставувате безбедни слики!</p>';
        } else {
            badges.forEach(badge => {
                const badgeElement = document.createElement('div');
                badgeElement.className = 'badge';
                badgeElement.textContent = badge;
                badgesContainer.appendChild(badgeElement);
            });
        }
    }

    function getEarnedBadges() {
        return JSON.parse(localStorage.getItem('earnedBadges') || '[]');
    }

    function getNextMilestone(points) {
        const milestones = [
            {threshold: 10, badge: "Почетник"},
            {threshold: 25, badge: "Истражувач"},
            {threshold: 50, badge: "Чувар"},
            {threshold: 100, badge: "Заштитник"},
            {threshold: 200, badge: "Шампион"}
        ];

        for (const milestone of milestones) {
            if (points < milestone.threshold) {
                return milestone;
            }
        }

        // If all milestones achieved, return the last one
        return milestones[milestones.length - 1];
    }

    function checkMilestone(oldPoints, newPoints) {
        const milestones = [
            {threshold: 10, badge: "Почетник"},
            {threshold: 25, badge: "Истражувач"},
            {threshold: 50, badge: "Чувар"},
            {threshold: 100, badge: "Заштитник"},
            {threshold: 200, badge: "Шампион"}
        ];

        for (const milestone of milestones) {
            if (oldPoints < milestone.threshold && newPoints >= milestone.threshold) {
                showBadgeEarned(milestone.badge);
                saveBadge(milestone.badge);
                break;
            }
        }
    }

    function showBadgeEarned(badge) {
        const badgeMessage = document.createElement('div');
        badgeMessage.className = 'badge-message';
        badgeMessage.innerHTML = `
        <h2>🎉 Нова значка! 🎉</h2>
        <p>Честитки! Освоивте ја значката "${badge}"!</p>
    `;
        document.body.appendChild(badgeMessage);

        // Add celebration animation to points display
        if (pointsDisplay) {
            pointsDisplay.classList.add('celebrate');
        }

        setTimeout(() => {
            badgeMessage.remove();
            if (pointsDisplay) {
                pointsDisplay.classList.remove('celebrate');
            }
        }, 3000);
    }

    function saveBadge(badge) {
        const badges = getEarnedBadges();
        if (!badges.includes(badge)) {
            badges.push(badge);
            localStorage.setItem('earnedBadges', JSON.stringify(badges));
        }
    }

// New functions for leaderboard and progress page integration
    function updateLeaderboard(points) {
        let leaderboard = getLeaderboard();
        const username = localStorage.getItem('username') || 'You';

        // Update or add the current user
        const currentUser = leaderboard.find(user => user.name === username);
        if (currentUser) {
            currentUser.points = points;
        } else {
            leaderboard.push({name: username, points: points});
        }

        // Sort the leaderboard by points (highest first)
        leaderboard.sort((a, b) => b.points - a.points);

        // Save the updated leaderboard
        localStorage.setItem('leaderboard', JSON.stringify(leaderboard));
    }

    function getLeaderboard() {
        const storedLeaderboard = localStorage.getItem('leaderboard');

        if (storedLeaderboard) {
            return JSON.parse(storedLeaderboard);
        } else {
            // Create a default leaderboard with the current user
            const points = getUserPoints();
            const username = localStorage.getItem('username') || 'You';

            const defaultLeaderboard = [
                {name: "TopPlayer", points: Math.max(points + 50, 100)},
                {name: "Achiever99", points: Math.max(points + 25, 75)},
                {name: username, points: points},
                {name: "GameMaster", points: Math.max(points - 25, 20)},
                {name: "LearningQueen", points: Math.max(points - 50, 10)}
            ];

            return defaultLeaderboard;
        }
    }

// Function to get formatted badge data for progress.html
    function getBadgesForProgressPage() {
        const earnedBadges = getEarnedBadges();
        const milestones = [
            {threshold: 10, badge: "Почетник", icon: "🔰"},
            {threshold: 25, badge: "Истражувач", icon: "🔍"},
            {threshold: 50, badge: "Чувар", icon: "🛡️"},
            {threshold: 100, badge: "Заштитник", icon: "⚔️"},
            {threshold: 200, badge: "Шампион", icon: "🏆"}
        ];

        return milestones.map(milestone => {
            return {
                name: milestone.badge,
                icon: milestone.icon,
                earned: earnedBadges.includes(milestone.badge)
            };
        });
    }




// Expose key functions and data for progress.html to access
    window.getUserPoints = getUserPoints;
    window.getEarnedBadges = getEarnedBadges;
    window.getLeaderboard = getLeaderboard;
    window.getBadgesForProgressPage = getBadgesForProgressPage;
    window.getNextMilestone = getNextMilestone;

});
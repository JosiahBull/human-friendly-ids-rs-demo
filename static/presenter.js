'use strict';
(function () {
    let basicAuth = '';
    let currentMediaIndex = 0;
    let mediaEntries = [];
    let showCrustacean = false;
    let isBlurred = true;
    let blurAnswer = true;
    let all_submissions = [];

    // Fetch and display media entries
    function initializeMedia() {
        fetch('/medias', {
            headers: { Authorization: 'Basic ' + basicAuth },
        })
            .then((res) => res.json())
            .then((data) => {
                mediaEntries = data;
                updateMediaDisplay();
            })
            .catch((error) => {
                console.error('Error loading media:', error);
                showToast('Error loading media', 'error');
            });
    }

    // Render the current media (image or audio)
    function updateMediaDisplay() {
        const container = document.getElementById('media-container');
        container.innerHTML = '';
        if (!mediaEntries.length) return;

        const currentMedia = mediaEntries[currentMediaIndex];
        let element;

        if (currentMedia.type.startsWith('image/')) {
            element = document.createElement('img');
            element.src = `/media/${currentMedia.name}`;
            element.alt = 'Current Media';
            element.id = 'media-display';
        } else if (currentMedia.type.startsWith('audio/')) {
            element = document.createElement('audio');
            element.controls = true;
            const source = document.createElement('source');
            source.src = `/media/${currentMedia.name}`;
            source.type = currentMedia.type;
            element.appendChild(source);
        }

        element.dataset.answer = currentMedia.answer;
        document.getElementById('answer').textContent = currentMedia.answer;

        container.appendChild(element);
    }

    // Format timestamp into relative time string
    function formatTimeAgo(timestamp) {
        const diff = Math.floor((new Date() - new Date(timestamp)) / 1000);
        if (diff < 60) return `${diff} second${diff !== 1 ? 's' : ''} ago`;
        if (diff < 3600) return `${Math.floor(diff / 60)} minute${Math.floor(diff / 60) !== 1 ? 's' : ''} ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)} hour${Math.floor(diff / 3600) !== 1 ? 's' : ''} ago`;
        return `${Math.floor(diff / 86400)} day${Math.floor(diff / 86400) !== 1 ? 's' : ''} ago`;
    }

    // Update recent submissions list
    function updateRecentSubmissions(submissions) {
        const list = document.getElementById('recent-submissions');
        list.innerHTML = '';
        submissions
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .forEach((submission) => {
                const li = document.createElement('li');
                const usernameSpan = document.createElement('span');
                usernameSpan.className = 'username';
                usernameSpan.textContent = showCrustacean ? 'Crustacean' : submission.username;
                if (showCrustacean) usernameSpan.dataset.original = submission.username;

                const codeSpan = document.createElement('span');
                codeSpan.innerHTML = ` - <span class="${isBlurred ? 'blurred-text' : ''}">${submission.original_id}</span>
            <span class="${isBlurred ? 'blurred-text' : ''}">(${submission.corrected_id || 'N/A'})</span>
             - ${submission.was_valid ? 'Correct' : 'Incorrect'} - ${formatTimeAgo(submission.timestamp)}`;

                li.appendChild(usernameSpan);
                li.appendChild(codeSpan);

                // Set color based on validity and correction status:
                // - Correct: green (#4caf50)
                // - Wrong with correction: orange
                // - Wrong without correction: red (#f44336)
                li.style.color = submission.was_valid
                    ? '#4caf50'
                    : (submission.corrected_id ? 'orange' : '#f44336');

                list.appendChild(li);
            });
    }

    // Update top codes list based on frequency
    function updateTopCodes(submissions) {
        const list = document.getElementById('top-codes');
        list.innerHTML = '';
        const frequency = submissions.reduce((acc, { original_id }) => {
            acc[original_id] = (acc[original_id] || 0) + 1;
            return acc;
        }, {});

        Object.entries(frequency)
            .sort(([, a], [, b]) => b - a)
            .forEach(([code, count]) => {
                const li = document.createElement('li');
                const codeSpan = document.createElement('span');
                codeSpan.textContent = code;
                if (isBlurred) codeSpan.classList.add('blurred-text');
                const countSpan = document.createElement('span');
                countSpan.textContent = ` - ${count} submission${count !== 1 ? 's' : ''}`;
                li.appendChild(codeSpan);
                li.appendChild(countSpan);
                list.appendChild(li);
            });
    }

    // Recursively fetch and update submission stats
    let statsFetching = false;

    function fetchStats() {
        if (statsFetching) return;
        statsFetching = true;

        let lastTimestamp = null;

        function fetchAndUpdateStats() {
            let url = '/stats';
            if (lastTimestamp) {
                url += `?after=${lastTimestamp}`;
            }

            fetch(url)
                .then((res) => res.json())
                .then((data) => {
                    all_submissions = all_submissions.concat(data);

                    if (all_submissions.length > 0) {
                        all_submissions.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
                        lastTimestamp = all_submissions[all_submissions.length - 1].timestamp;
                    }
                    updateRecentSubmissions(all_submissions);
                    updateTopCodes(all_submissions);
                    setTimeout(fetchAndUpdateStats, 500);
                })
                .catch((error) => {
                    console.error('Error fetching stats:', error);
                    setTimeout(fetchAndUpdateStats, 1000);
                });
        }

        fetchAndUpdateStats();
    }

    // Reset stats and cycle to the next media entry
    function resetStats() {
        isBlurred = true;
        blurAnswer = true;
        all_submissions = [];
        fetch('/reset-stats', {
            method: 'POST',
            headers: { Authorization: 'Basic ' + basicAuth },
        })
            .then((res) => {
                if (!res.ok) throw new Error('Reset failed');
                currentMediaIndex = (currentMediaIndex + 1) % mediaEntries.length;
                updateMediaDisplay();
                fetchStats();
            })
            .catch(() => showToast('Error resetting stats', 'error'));
    }

    // Show a temporary toast notification
    function showToast(message, type = 'success') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = 'toast ' + type;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => container.removeChild(toast), 4000);
    }

    // Event Listeners setup after DOM is loaded
    document.addEventListener('DOMContentLoaded', () => {
        const savedAuth = localStorage.getItem('rustAuth');
        if (savedAuth) {
            basicAuth = savedAuth;
            document.getElementById('login-modal').style.display = 'none';
            document.querySelector('.main-content').classList.remove('hidden');
            fetchStats();
            initializeMedia();
        }

        document.getElementById('login-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            if (username && password) {
                basicAuth = btoa(username + ':' + password);
                localStorage.setItem('rustAuth', basicAuth);
                document.getElementById('login-modal').style.display = 'none';
                document.querySelector('.main-content').classList.remove('hidden');
                fetchStats();
                initializeMedia();
            }
        });

        document.getElementById('logout-button').addEventListener('click', () => {
            localStorage.removeItem('rustAuth');
            basicAuth = '';
            document.getElementById('login-modal').style.display = 'flex';
            document.querySelector('.main-content').classList.add('hidden');
        });

        document.getElementById('toggle-names').addEventListener('click', () => {
            showCrustacean = !showCrustacean;
            document.querySelectorAll('.username').forEach((span) => {
                if (showCrustacean) {
                    span.dataset.original = span.textContent;
                    span.textContent = 'Crustacean';
                } else {
                    span.textContent = span.dataset.original;
                }
            });
        });

        document.getElementById('toggle-answer').addEventListener('click', function () {
            blurAnswer = !blurAnswer;
            document.getElementById('answer').classList.toggle('blurred-text', blurAnswer);
            this.textContent = blurAnswer ? 'Show Answer' : 'Hide Answer';
        });

        document.getElementById('toggle-blur').addEventListener('click', function () {
            isBlurred = !isBlurred;
            document.querySelectorAll('#recent-submissions span:not(.username)').forEach((span) =>
                span.classList.toggle('blurred-text', isBlurred)
            );
            this.textContent = isBlurred ? 'Show Submission Text' : 'Hide Submission Text';
        });

        document.getElementById('next-button').addEventListener('click', resetStats);

        document.addEventListener('keydown', (e) => {
            const loginModal = document.getElementById('login-modal');
            if (
                loginModal.style.display === 'none' &&
                (e.key.toLowerCase() === 'n' || e.key === 'Enter')
            ) {
                resetStats();
            }
        });
    });
})();

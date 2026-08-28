(function () {
    const STORAGE_KEY = 'mirai_watch_list';

    function getCurrentUser() {
        const email = localStorage.getItem('mirai_current_user');
        if (!email) return null;
        try {
            const users = JSON.parse(localStorage.getItem('mirai_users')) || [];
            return users.find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
        } catch {
            return null;
        }
    }

    function getUserList() {
        const user = getCurrentUser();
        if (!user) return [];
        try {
            const lists = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
            return lists[user.email.toLowerCase()] || [];
        } catch {
            return [];
        }
    }

    function saveUserList(list) {
        const user = getCurrentUser();
        if (!user) return;
        try {
            const lists = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
            lists[user.email.toLowerCase()] = list;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(lists));
        } catch (e) {
            console.error('Failed to save list:', e);
        }
    }

    function isInList(animeId) {
        return getUserList().some(item => item.id === animeId);
    }

    function addToList(anime) {
        const list = getUserList();
        if (list.some(item => item.id === anime.id)) return;
        list.unshift({
            id: anime.id,
            title: anime.title,
            cover: anime.cover,
            format: anime.format || 'TV',
            episodes: anime.episodes || null,
            addedAt: Date.now()
        });
        saveUserList(list);
    }

    function removeFromList(animeId) {
        const list = getUserList().filter(item => item.id !== animeId);
        saveUserList(list);
    }

    function downloadList() {
        const list = getUserList();
        if (list.length === 0) return;

        const user = getCurrentUser();
        const data = {
            user: user ? user.email : 'unknown',
            exportedAt: new Date().toISOString(),
            totalAnime: list.length,
            animeList: list.map(item => ({
                title: item.title,
                format: item.format,
                episodes: item.episodes,
                anilistId: item.id,
                addedAt: item.addedAt ? new Date(item.addedAt).toISOString() : null
            }))
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mirai-watch-list-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function renderList() {
        const container = document.getElementById('mylistContent');
        const list = getUserList();

        document.getElementById('listCount').textContent = `${list.length} anime`;

        if (list.length === 0) {
            container.innerHTML = `
                <div class="mylist-empty">
                    <i class="fas fa-list"></i>
                    <h3>Your list is empty</h3>
                    <p>Browse anime and add them to your watch list.<br>Go to <a href="home.html">Home</a> or <a href="all-anime-index.html">All Anime</a> to find something to watch.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = '<div class="mylist-grid" id="mylistGrid"></div>';
        const grid = document.getElementById('mylistGrid');

        list.forEach(item => {
            const card = document.createElement('div');
            card.className = 'mylist-card';
            card.innerHTML = `
                <div class="mylist-card-poster">
                    <img src="${item.cover || ''}" alt="${item.title}" loading="lazy">
                    <button class="mylist-card-remove" data-id="${item.id}" title="Remove from list"><i class="fas fa-times"></i></button>
                </div>
                <div class="mylist-card-info">
                    <h4 class="mylist-card-title">${item.title}</h4>
                    <div class="mylist-card-meta">
                        <span><i class="fas fa-tv"></i> ${item.format}</span>
                        ${item.episodes ? `<span><i class="fas fa-film"></i> ${item.episodes} eps</span>` : ''}
                    </div>
                </div>
            `;

            card.querySelector('.mylist-card-poster').addEventListener('click', (e) => {
                if (!e.target.closest('.mylist-card-remove')) {
                    window.location.href = `anime-details.html?id=${item.id}`;
                }
            });

            card.querySelector('.mylist-card-remove').addEventListener('click', (e) => {
                e.stopPropagation();
                removeFromList(item.id);
                renderList();
            });

            grid.appendChild(card);
        });
    }

    function init() {
        const user = getCurrentUser();
        const authGate = document.getElementById('authGate');
        const content = document.querySelector('.mylist-main');

        if (!user) {
            authGate.classList.add('active');
            content.style.display = 'none';
            return;
        }

        renderList();

        document.getElementById('downloadBtn').addEventListener('click', downloadList);
    }

    document.addEventListener('DOMContentLoaded', init);

    window.MiraiList = {
        addToList,
        removeFromList,
        isInList,
        getUserList
    };
})();

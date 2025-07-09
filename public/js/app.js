document.addEventListener('DOMContentLoaded', () => {
    // Состояние приложения
    const state = {
        items: [],
        filteredItems: [],
        sites: [],
        profiles: [],
        parsersStatus: [],
        currentComparison: null,
        autoRefreshInterval: null,
        autoRefreshEnabled: false,
        filters: {
            search: '',
            price1Min: null,
            price1Max: null,
            price2Min: null,
            price2Max: null,
            stock1Min: null,
            stock1Max: null,
            stock2Min: null,
            stock2Max: null,
            profitPercentMin: null,
            profitPercentMax: null,
            hideOverstock: false,
            sortBy: 'profitPercent'
        }
    };

    // DOM элементы
    const elements = {
        site1Select: document.getElementById('site1'),
        site2Select: document.getElementById('site2'),
        compareBtn: document.getElementById('compareBtn'),
        refreshBtn: document.getElementById('refreshBtn'),
        refreshSpinner: document.getElementById('refreshSpinner'),
        searchInput: document.getElementById('searchInput'),
        hideOverstock: document.getElementById('hideOverstock'),
        sortBy: document.getElementById('sortBy'),
        resultsTable: document.getElementById('resultsTable'),
        site1Header: document.getElementById('site1Header'),
        site2Header: document.getElementById('site2Header'),
        site1HeaderSmall: document.getElementById('site1HeaderSmall'),
        site2HeaderSmall: document.getElementById('site2HeaderSmall'),
        lastUpdate: document.getElementById('lastUpdate'),
        lastUpdateFooter: document.getElementById('lastUpdateFooter'),
        loadingSpinner: document.getElementById('loadingSpinner'),
        autoRefreshToggle: document.getElementById('autoRefreshToggle'),
        autoRefreshIntervalInput: document.getElementById('autoRefreshInterval'),
        toggleFilters: document.getElementById('toggleFilters'),
        filtersContainer: document.getElementById('filtersContainer'),
        swapSitesBtn: document.getElementById('swapSitesBtn'),
        toggleProfiles: document.getElementById('toggleProfiles'),
        profilesContainer: document.getElementById('profilesContainer'),
        profilesList: document.getElementById('profilesList'),
        addProfileBtn: document.getElementById('addProfileBtn'),
        profileFormContainer: document.getElementById('profileFormContainer'),
        profileForm: document.getElementById('profileForm'),
        profileId: document.getElementById('profileId'),
        profileName: document.getElementById('profileName'),
        profileSite1: document.getElementById('profileSite1'),
        profileSite2: document.getElementById('profileSite2'),
        profileMinProfit: document.getElementById('profileMinProfit'),
        profileHideOverstock: document.getElementById('profileHideOverstock'),
        profileTelegramEnabled: document.getElementById('profileTelegramEnabled'),
        profileIsActive: document.getElementById('profileIsActive'),
        cancelProfileBtn: document.getElementById('cancelProfileBtn'),
        toggleParsersStatus: document.getElementById('toggleParsersStatus'),
        parsersStatusContainer: document.getElementById('parsersStatusContainer')
    };

    // Инициализация приложения
    init();

    async function init() {
        try {
            // Инициализация фильтров (скрыты по умолчанию)
            elements.filtersContainer.style.display = 'none';
            elements.toggleFilters.innerHTML = '<i class="fas fa-eye me-1"></i>Показать';
            
            // Инициализация профилей (скрыты по умолчанию)
            elements.profilesContainer.style.display = 'none';
            elements.toggleProfiles.innerHTML = '<i class="fas fa-eye me-1"></i>Показать';
            
            // Инициализация статуса парсеров (скрыты по умолчанию)
            elements.parsersStatusContainer.style.display = 'none';
            elements.toggleParsersStatus.innerHTML = '<i class="fas fa-eye me-1"></i>Показать';
            
            loadEventListeners();
            await fetchAvailableSites();
            setDefaultSelections();
            console.log('Приложение инициализировано');
        } catch (error) {
            console.error('Ошибка инициализации:', error);
            showError('Не удалось инициализировать приложение');
        }
    }

    function loadEventListeners() {
        // Основные элементы
        elements.compareBtn.addEventListener('click', comparePrices);
        elements.searchInput.addEventListener('input', handleSearch);
        elements.hideOverstock.addEventListener('change', handleOverstockFilter);
        elements.sortBy.addEventListener('change', handleSortChange);
        elements.swapSitesBtn.addEventListener('click', swapSites);
        
        // Автообновление
        elements.autoRefreshToggle.addEventListener('change', toggleAutoRefresh);
        elements.autoRefreshIntervalInput.addEventListener('change', updateAutoRefreshInterval);
        
        // Профили
        elements.toggleProfiles.addEventListener('click', toggleProfilesVisibility);
        elements.addProfileBtn.addEventListener('click', showProfileForm);
        elements.cancelProfileBtn.addEventListener('click', hideProfileForm);
        elements.profileForm.addEventListener('submit', handleProfileSubmit);
        
        // Статус парсеров
        elements.toggleParsersStatus.addEventListener('click', toggleParsersStatusVisibility);
        
        // Фильтры
        elements.toggleFilters.addEventListener('click', function(e) {
            e.preventDefault();
            toggleFiltersVisibility();
        });

        // Фильтры по диапазонам
        const rangeFilters = [
            'price1Min', 'price1Max', 'price2Min', 'price2Max',
            'stock1Min', 'stock1Max', 'stock2Min', 'stock2Max',
            'profitPercentMin', 'profitPercentMax'
        ];

        rangeFilters.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener('input', (e) => {
                    state.filters[id] = e.target.value ? parseFloat(e.target.value) : null;
                    applyFilters();
                });
            }
        });
    }

    // ==================== Функции для работы с профилями ====================
    async function loadProfiles() {
        try {
            const response = await fetch('/api/profiles');
            if (!response.ok) throw new Error('Ошибка загрузки профилей');
            const data = await response.json();
            state.profiles = data.profiles || [];
            renderProfiles();
        } catch (error) {
            console.error('Ошибка загрузки профилей:', error);
            showError('Не удалось загрузить профили');
        }
    }

    function renderProfiles() {
        if (!state.profiles.length) {
            elements.profilesList.innerHTML = `
                <div class="text-center text-muted py-3">
                    <i class="fas fa-info-circle me-2"></i>Нет сохраненных профилей
                </div>
            `;
            return;
        }

        elements.profilesList.innerHTML = state.profiles.map(profile => `
            <div class="card mb-2" data-profile-id="${profile.id}">
                <div class="card-body p-2">
                    <div class="d-flex justify-content-between align-items-center">
                        <div>
                            <h6 class="mb-1">${escapeHtml(profile.name)}</h6>
                            <small class="text-muted">
                                ${formatSiteName(profile.site1)} → ${formatSiteName(profile.site2)} | 
                                Прибыль: ≥${profile.minProfitPercent}% | 
                                Статус: ${profile.isActive ? 'Активен' : 'Неактивен'}
                            </small>
                        </div>
                        <div class="d-flex gap-1">
                            <button class="btn btn-sm btn-outline-primary edit-profile" title="Редактировать">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-danger delete-profile" title="Удалить">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');

        // Добавление обработчиков для кнопок
        document.querySelectorAll('.edit-profile').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const card = e.target.closest('[data-profile-id]');
                const profileId = card.getAttribute('data-profile-id');
                editProfile(profileId);
            });
        });

        document.querySelectorAll('.delete-profile').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const card = e.target.closest('[data-profile-id]');
                const profileId = card.getAttribute('data-profile-id');
                deleteProfile(profileId);
            });
        });
    }

    function toggleProfilesVisibility(e) {
        e.preventDefault();
        if (elements.profilesContainer.style.display === 'none' || !elements.profilesContainer.style.display) {
            elements.profilesContainer.style.display = 'block';
            elements.toggleProfiles.innerHTML = '<i class="fas fa-eye-slash me-1"></i>Скрыть';
            loadProfiles();
        } else {
            elements.profilesContainer.style.display = 'none';
            elements.toggleProfiles.innerHTML = '<i class="fas fa-eye me-1"></i>Показать';
        }
    }

    function showProfileForm() {
        elements.profileForm.reset();
        elements.profileId.value = '';
        elements.profileFormContainer.style.display = 'block';
        
        // Заполнение селектов площадками
        elements.profileSite1.innerHTML = state.sites.map(site => 
            `<option value="${site.name}">${formatSiteName(site.name)}</option>`
        ).join('');
        
        elements.profileSite2.innerHTML = state.sites.map(site => 
            `<option value="${site.name}">${formatSiteName(site.name)}</option>`
        ).join('');
    }

    function hideProfileForm() {
        elements.profileFormContainer.style.display = 'none';
    }

    async function editProfile(profileId) {
        const profile = state.profiles.find(p => p.id == profileId);
        if (!profile) {
            showError('Профиль не найден');
            return;
        }
        
        // Заполнение формы данными профиля
        elements.profileId.value = profile.id;
        elements.profileName.value = profile.name;
        elements.profileSite1.value = profile.site1;
        elements.profileSite2.value = profile.site2;
        elements.profileMinProfit.value = profile.minProfitPercent;
        elements.profileHideOverstock.checked = profile.hideOverstock;
        elements.profileTelegramEnabled.checked = profile.telegramEnabled;
        elements.profileIsActive.checked = profile.isActive;
        
        // Показ формы
        elements.profileFormContainer.style.display = 'block';
    }

    async function deleteProfile(profileId) {
        if (!confirm('Вы уверены, что хотите удалить этот профиль?')) {
            return;
        }

        try {
            showLoading();
            const response = await fetch(`/api/profiles/${profileId}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Ошибка удаления профиля');
            }
            
            await loadProfiles();
            showToast('Профиль успешно удалён');
        } catch (error) {
            console.error('Ошибка удаления профиля:', error);
            showError(error.message || 'Не удалось удалить профиль');
        } finally {
            hideLoading();
        }
    }

    async function handleProfileSubmit(e) {
        e.preventDefault();
        
        try {
            showLoading();
            const profileData = {
                name: elements.profileName.value,
                site1: elements.profileSite1.value,
                site2: elements.profileSite2.value,
                minProfitPercent: parseFloat(elements.profileMinProfit.value),
                hideOverstock: elements.profileHideOverstock.checked,
                telegramEnabled: elements.profileTelegramEnabled.checked,
                isActive: elements.profileIsActive.checked
            };

            let response;
            if (elements.profileId.value) {
                // Редактирование существующего профиля
                response = await fetch(`/api/profiles/${elements.profileId.value}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(profileData)
                });
            } else {
                // Создание нового профиля
                response = await fetch('/api/profiles', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(profileData)
                });
            }

            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Ошибка сохранения профиля');
            }
            
            await loadProfiles();
            hideProfileForm();
            showToast('Профиль успешно сохранён');
        } catch (error) {
            console.error('Ошибка сохранения профиля:', error);
            showError(error.message || 'Не удалось сохранить профиль');
        } finally {
            hideLoading();
        }
    }

    // ==================== Функции для работы со статусом парсеров ====================
    async function fetchParsersStatus() {
        try {
            const response = await fetch('/api/parsers/status');
            if (!response.ok) throw new Error('Ошибка загрузки статуса парсеров');
            const data = await response.json();
            state.parsersStatus = data.parsers || [];
            renderParsersStatus();
        } catch (error) {
            console.error('Ошибка загрузки статуса парсеров:', error);
            showError('Не удалось загрузить статус парсеров');
        }
    }

    function renderParsersStatus() {
        elements.parsersStatusContainer.innerHTML = `
            <div class="card mb-3">
                <div class="card-header d-flex justify-content-between align-items-center py-2">
                    <h5 class="mb-0"><i class="fas fa-plug me-2"></i>Статус парсеров</h5>
                    <button id="refreshParsersStatus" class="btn btn-sm btn-outline-secondary">
                        <i class="fas fa-sync-alt"></i>
                    </button>
                </div>
                <div class="card-body p-0">
                    <div class="table-responsive">
                        <table class="table table-hover mb-0">
                            <thead>
                                <tr>
                                    <th>Парсер</th>
                                    <th>Статус</th>
                                    <th>Последнее обновление</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${state.parsersStatus.map(parser => `
                                    <tr>
                                        <td>${escapeHtml(parser.displayName)}</td>
                                        <td>
                                            <span class="badge ${getStatusBadgeClass(parser.status)}">
                                                ${parser.status}
                                            </span>
                                        </td>
                                        <td>${formatDateTime(parser.lastUpdate)}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        // Добавление обработчика для кнопки обновления
        document.getElementById('refreshParsersStatus')?.addEventListener('click', fetchParsersStatus);
    }

    function getStatusBadgeClass(status) {
        switch (status) {
            case 'Активен': return 'bg-success';
            case 'Обновляется': return 'bg-warning text-dark';
            case 'Неактивен': return 'bg-secondary';
            default: return 'bg-info';
        }
    }

    function formatDateTime(dateString) {
        if (dateString === 'Никогда') return dateString;
        const date = new Date(dateString);
        return date.toLocaleString();
    }

    function toggleParsersStatusVisibility(e) {
        e.preventDefault();
        if (elements.parsersStatusContainer.style.display === 'none' || !elements.parsersStatusContainer.style.display) {
            elements.parsersStatusContainer.style.display = 'block';
            elements.toggleParsersStatus.innerHTML = '<i class="fas fa-eye-slash me-1"></i>Скрыть';
            fetchParsersStatus();
        } else {
            elements.parsersStatusContainer.style.display = 'none';
            elements.toggleParsersStatus.innerHTML = '<i class="fas fa-eye me-1"></i>Показать';
        }
    }

    // ==================== Основные функции приложения ====================
    function toggleFiltersVisibility() {
        if (elements.filtersContainer.style.display === 'none' || !elements.filtersContainer.style.display) {
            elements.filtersContainer.style.display = 'block';
            elements.toggleFilters.innerHTML = '<i class="fas fa-eye-slash me-1"></i>Скрыть';
        } else {
            elements.filtersContainer.style.display = 'none';
            elements.toggleFilters.innerHTML = '<i class="fas fa-eye me-1"></i>Показать';
        }
    }

    function swapSites() {
        const temp = elements.site1Select.value;
        elements.site1Select.value = elements.site2Select.value;
        elements.site2Select.value = temp;
        
        if (state.currentComparison) {
            comparePrices();
        }
    }

    function setDefaultSelections() {
        elements.site1Select.value = 'rustmagic';
        elements.site2Select.value = 'lootfarm';
    }

    // ==================== API взаимодействия ====================
    async function fetchAvailableSites() {
        try {
            showLoading(elements.site1Select, 'Загрузка площадок...');
            
            const response = await fetch('/api/parsers');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            if (!data?.parsers?.length) {
                throw new Error('Нет доступных площадок');
            }
            
            state.sites = data.parsers;
            populateSiteSelects(data.parsers);
            
        } catch (error) {
            console.error('Ошибка загрузки площадок:', error);
            showError('Не удалось загрузить список площадок');
            throw error;
        } finally {
            hideLoading(elements.site1Select);
        }
    }

    async function comparePrices() {
        const site1 = elements.site1Select.value;
        const site2 = elements.site2Select.value;
        
        if (!site1 || !site2) {
            showError('Выберите обе площадки для сравнения');
            return;
        }
        
        if (site1 === site2) {
            showError('Нельзя сравнивать одинаковые площадки');
            return;
        }

        try {
            showLoading();
            
            const response = await fetch(`/api/compare?site1=${encodeURIComponent(site1)}&site2=${encodeURIComponent(site2)}`);
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Ошибка сервера: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (!data?.comparison) {
                throw new Error('Некорректный формат данных');
            }
            
            // Обновление состояния
            state.currentComparison = {
                site1,
                site2,
                items: Array.isArray(data.comparison) ? data.comparison : [],
                lastUpdate: data.lastUpdate || 'Неизвестно'
            };
            
            // Обновление UI
            updateHeaders(site1, site2);
            elements.lastUpdate.textContent = `Обновлено: ${state.currentComparison.lastUpdate}`;
            elements.lastUpdateFooter.textContent = state.currentComparison.lastUpdate;
            applyFilters();
            
        } catch (error) {
            console.error('Ошибка сравнения цен:', error);
            showError(error.message || 'Ошибка при сравнении цен');
        } finally {
            hideLoading();
        }
    }

    async function refreshData() {
        try {
            elements.refreshBtn.disabled = true;
            elements.refreshSpinner.classList.remove('d-none');
            
            const response = await fetch('/api/refresh', { method: 'POST' });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Ошибка обновления');
            }
            
            showToast('Данные успешно обновлены!');
            
            // Повтор текущего сравнения
            if (state.currentComparison) {
                await comparePrices();
            }
            
        } catch (error) {
            console.error('Ошибка обновления данных:', error);
            showError(error.message || 'Ошибка обновления данных');
        } finally {
            elements.refreshBtn.disabled = false;
            elements.refreshSpinner.classList.add('d-none');
        }
    }

    // ==================== Автообновление ====================
    function toggleAutoRefresh() {
        state.autoRefreshEnabled = elements.autoRefreshToggle.checked;
        
        if (state.autoRefreshEnabled) {
            startAutoRefresh();
        } else {
            stopAutoRefresh();
        }
    }

    function startAutoRefresh() {
        stopAutoRefresh();
        const interval = parseInt(elements.autoRefreshIntervalInput.value) * 1000 || 30000;
        state.autoRefreshInterval = setInterval(() => {
            if (state.currentComparison) {
                comparePrices();
            }
        }, interval);
        showToast(`Автообновление включено (каждые ${interval/1000} сек)`);
    }

    function stopAutoRefresh() {
        if (state.autoRefreshInterval) {
            clearInterval(state.autoRefreshInterval);
            state.autoRefreshInterval = null;
            showToast('Автообновление выключено');
        }
    }

    function updateAutoRefreshInterval() {
        if (state.autoRefreshEnabled) {
            startAutoRefresh();
        }
    }

    // ==================== Управление фильтрами ====================
    function handleSearch(e) {
        state.filters.search = e.target.value.toLowerCase();
        applyFilters();
    }

    function handleOverstockFilter(e) {
        state.filters.hideOverstock = e.target.checked;
        applyFilters();
    }

    function handleSortChange(e) {
        state.filters.sortBy = e.target.value;
        applyFilters();
    }

    function applyFilters() {
        if (!state.currentComparison?.items) return;
        
        let filteredItems = [...state.currentComparison.items];
        
        // Поиск по имени
        if (state.filters.search) {
            filteredItems = filteredItems.filter(item => 
                item.name.toLowerCase().includes(state.filters.search)
            );
        }
        
        // Фильтры по цене
        if (state.filters.price1Min !== null) {
            filteredItems = filteredItems.filter(item => item.price1 >= state.filters.price1Min);
        }
        if (state.filters.price1Max !== null) {
            filteredItems = filteredItems.filter(item => item.price1 <= state.filters.price1Max);
        }
        if (state.filters.price2Min !== null) {
            filteredItems = filteredItems.filter(item => item.price2 >= state.filters.price2Min);
        }
        if (state.filters.price2Max !== null) {
            filteredItems = filteredItems.filter(item => item.price2 <= state.filters.price2Max);
        }
        
        // Фильтры по количеству
        if (state.filters.stock1Min !== null) {
            filteredItems = filteredItems.filter(item => {
                const stock = parseInt(item.stock1?.split('/')[0]) || 0;
                return stock >= state.filters.stock1Min;
            });
        }
        if (state.filters.stock1Max !== null) {
            filteredItems = filteredItems.filter(item => {
                const stock = parseInt(item.stock1?.split('/')[0]) || 0;
                return stock <= state.filters.stock1Max;
            });
        }
        if (state.filters.stock2Min !== null) {
            filteredItems = filteredItems.filter(item => {
                const stock = parseInt(item.stock2?.split('/')[0]) || 0;
                return stock >= state.filters.stock2Min;
            });
        }
        if (state.filters.stock2Max !== null) {
            filteredItems = filteredItems.filter(item => {
                const stock = parseInt(item.stock2?.split('/')[0]) || 0;
                return stock <= state.filters.stock2Max;
            });
        }
        
        // Фильтры по прибыли
        if (state.filters.profitPercentMin !== null) {
            filteredItems = filteredItems.filter(item => item.profitPercent >= state.filters.profitPercentMin);
        }
        if (state.filters.profitPercentMax !== null) {
            filteredItems = filteredItems.filter(item => item.profitPercent <= state.filters.profitPercentMax);
        }
        
        // Фильтр перезапаса
        if (state.filters.hideOverstock) {
            filteredItems = filteredItems.filter(item => {
                if (!item.stock2?.includes('/')) return true;
                const [have, max] = item.stock2.split('/').map(Number);
                return !(have >= max || max === 0);
            });
        }
        
        // Сортировка
        filteredItems.sort((a, b) => {
            switch (state.filters.sortBy) {
                case 'name': return a.name.localeCompare(b.name);
                case 'profitPercent': return b.profitPercent - a.profitPercent;
                default: return b.profitPercent - a.profitPercent;
            }
        });
        
        state.filteredItems = filteredItems;
        renderResults();
    }

    // ==================== Отображение результатов ====================
    function renderResults() {
        if (!state.filteredItems.length) {
            elements.resultsTable.innerHTML = `
                <tr>
                    <td colspan="4" class="text-center py-4 text-muted">
                        <i class="fas fa-search me-2"></i>Ничего не найдено. Попробуйте изменить параметры поиска.
                    </td>
                </tr>
            `;
            return;
        }
        
        elements.resultsTable.innerHTML = state.filteredItems.map(item => {
            const profitClass = item.profitPercent > 20 ? 'profit-high' : '';
            
            return `
                <tr data-item="${escapeHtml(item.name)}" class="${profitClass}">
                    <td onclick="copyToClipboard('${escapeHtml(item.name)}', event)" style="cursor: pointer; position: relative;">
                        <div class="d-flex align-items-center">
                            <span class="me-2">${escapeHtml(item.name)}</span>
                            <span class="badge bg-success copy-notification" style="display: none; position: absolute; right: 10px;">
                                <i class="fas fa-check me-1"></i>Скопировано
                            </span>
                        </div>
                    </td>
                    <td>
                        <div class="fw-semibold">$${(item.price1 || 0).toFixed(2)}</div>
                        <div class="stock-info small">${formatStock(item.stock1)}</div>
                    </td>
                    <td>
                        <div class="fw-semibold">$${(item.price2 || 0).toFixed(2)}</div>
                        <div class="stock-info small">${formatStock(item.stock2, true)}</div>
                        <div class="text-muted small mt-1">После комиссии: $${(item.price2AfterCommission || 0).toFixed(2)}</div>
                    </td>
                    <td class="profit-cell ${getProfitClass(item.profitPercent)}">
                        ${item.profitPercent > 0 ? '+' : ''}${(item.profitPercent || 0).toFixed(2)}%
                    </td>
                </tr>
            `;
        }).join('');
    }

    function formatStock(stock, isSecondSite = false) {
        if (!stock) return '0';
        
        if (stock.includes('/')) {
            const [have, max] = stock.split('/').map(Number);
            
            if (isSecondSite) {
                if (max === 0) return `<span class="text-danger">${have}/0 (Нет в наличии)</span>`;
                if (have >= max) return `<span class="text-warning">${stock} (Перезапас)</span>`;
            }
            
            return stock;
        }
        
        return stock;
    }

    function getProfitClass(value) {
        if (value > 0) return 'text-success';
        if (value < 0) return 'text-danger';
        return '';
    }

    // ==================== Вспомогательные функции ====================
    function populateSiteSelects(parsers) {
        elements.site1Select.innerHTML = '';
        elements.site2Select.innerHTML = '';
        
        const createOption = (value) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = formatSiteName(value);
            return option;
        };
        
        parsers.forEach(parser => {
            elements.site1Select.appendChild(createOption(parser.name));
            elements.site2Select.appendChild(createOption(parser.name));
        });
    }

    function updateHeaders(site1, site2) {
        const site1Name = formatSiteName(site1);
        const site2Name = formatSiteName(site2);
        
        elements.site1Header.textContent = site1Name;
        elements.site2Header.textContent = site2Name;
        elements.site1HeaderSmall.textContent = site1Name;
        elements.site2HeaderSmall.textContent = site2Name;
    }

    function formatSiteName(site) {
        const names = {
            'rustmagic': 'RustMagic.com',
            'lootfarm': 'Loot.Farm',
            'cstrade': 'CS.Trade',
            'tradeit': 'TradeIt.gg',
            'itrade': 'ITrade.gg',
            'swapgg': 'Swap.gg',
            'rusttm': 'Rust.TM',
            'skinswap': 'Skinswap.com',
            'rustreaper': 'Rustreaper.com',
            'rustbet': 'Rustbet.com',
            'rustclash': 'Rustclash.com',
            'lis-skins': 'LIS Skins'
        };
        return names[site] || site;
    }

    function showLoading(element = elements.resultsTable, message = 'Загрузка...') {
        if (element === elements.resultsTable) {
            elements.loadingSpinner.classList.remove('d-none');
            elements.resultsTable.innerHTML = '';
        } else if (element) {
            element.innerHTML = `<option value="">${message}</option>`;
        }
    }

    function hideLoading(element = elements.resultsTable) {
        if (element === elements.resultsTable) {
            elements.loadingSpinner.classList.add('d-none');
        }
    }

    function showError(message) {
        elements.resultsTable.innerHTML = `
            <tr>
                <td colspan="4" class="text-center py-4 text-danger">
                    ${escapeHtml(message)}
                </td>
            </tr>
        `;
    }

    function showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'position-fixed bottom-0 end-0 p-3';
        toast.style.zIndex = '1100';
        toast.innerHTML = `
            <div class="toast show" role="alert">
                <div class="toast-body d-flex align-items-center">
                    <span class="me-3">${escapeHtml(message)}</span>
                    <button type="button" class="btn-close ms-auto" data-bs-dismiss="toast"></button>
                </div>
            </div>
        `;
        
        document.body.appendChild(toast);
        
        toast.querySelector('.btn-close').addEventListener('click', () => {
            toast.remove();
        });
        
        setTimeout(() => toast.remove(), 5000);
    }

    function escapeHtml(unsafe) {
        if (!unsafe) return '';
        return unsafe.toString()
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
});

// Глобальные функции
window.copyToClipboard = function(text, event) {
    if (!text) return;
    
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }

    navigator.clipboard.writeText(text).then(() => {
        const badges = document.querySelectorAll('.copy-notification');
        badges.forEach(badge => badge.style.display = 'none');
        
        if (event) {
            const clickedElement = event.currentTarget;
            const clickedBadge = clickedElement.querySelector('.copy-notification');
            if (clickedBadge) {
                clickedBadge.style.display = 'inline-block';
                setTimeout(() => {
                    clickedBadge.style.display = 'none';
                }, 2000);
            }
        }
    }).catch(err => {
        console.error('Ошибка копирования:', err);
        // Fallback для старых браузеров
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
        } catch (err) {
            console.error('Fallback copy failed:', err);
        }
        document.body.removeChild(textarea);
    });
};
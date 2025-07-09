document.addEventListener('DOMContentLoaded', function() {
    const searchInput = document.getElementById('itemSearch');
    const searchBtn = document.getElementById('searchBtn');
    const resultsBody = document.getElementById('resultsBody');
    
    // Обработчик поиска по кнопке
    searchBtn.addEventListener('click', searchItem);
    
    // Обработчик поиска по Enter
    searchInput.addEventListener('keyup', function(e) {
        if (e.key === 'Enter') {
            searchItem();
        }
    });

    // Функция поиска предмета
    async function searchItem() {
        const itemName = searchInput.value.trim();
        
        if (!itemName) {
            showMessage('Введите название предмета', 'warning');
            return;
        }
        
        try {
            showLoading();
            
            const response = await fetch(`/api/all-prices?item=${encodeURIComponent(itemName)}`);
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Ошибка при поиске');
            }
            
            if (data.prices.length === 0) {
                showMessage('Предмет не найден на площадках', 'info');
                return;
            }
            
            displayResults(data.item, data.prices);
        } catch (error) {
            console.error('Search error:', error);
            showMessage(error.message, 'danger');
        } finally {
            hideLoading();
        }
    }
    
    // Отображение результатов
    function displayResults(itemName, prices) {
        // Сортируем по цене после комиссии (от меньшей к большей)
        prices.sort((a, b) => a.priceAfterCommission - b.priceAfterCommission);
        
        resultsBody.innerHTML = prices.map(item => `
            <tr>
                <td>${formatSiteName(item.source)}</td>
                <td>$${item.price.toFixed(2)}</td>
                <td>
                    <span class="price-badge badge rounded-pill">
                        $${item.priceAfterCommission.toFixed(2)}
                    </span>
                </td>
                <td class="d-none-sm">${formatStock(item.stock)}</td>
                <td class="d-none-sm">${formatDate(item.timestamp)}</td>
            </tr>
        `).join('');
        
        // Обновляем заголовок с названием предмета
        document.querySelector('header h1').innerHTML = `
            <i class="fas fa-search-dollar me-2"></i>Цены на: ${itemName}
        `;
    }
    
    // Форматирование названия площадки
    function formatSiteName(source) {
        const nameMap = {
            'rustmagic': 'RustMagic',
            'lootfarm': 'LootFarm',
            'cstrade': 'CS.Trade',
            'tradeit': 'TradeIt.gg',
            'itrade': 'ITrade.gg',
            'swapgg': 'Swap.gg',
            'rusttm': 'Rust.TM',
            'skinswap': 'Skinswap',
            'rustreaper': 'RustReaper',
            'rustbet': 'RustBet',
            'rustclash': 'RustClash'
        };
        return nameMap[source] || source;
    }
    
    // Форматирование наличия
    function formatStock(stock) {
        if (!stock) return 'N/A';
        if (stock.includes('/')) {
            const [have, max] = stock.split('/');
            return `${have} / ${max}`;
        }
        return stock;
    }
    
    // Форматирование даты
    function formatDate(timestamp) {
        if (!timestamp) return 'N/A';
        const date = new Date(timestamp);
        return date.toLocaleString();
    }
    
    // Показать сообщение
    function showMessage(text, type = 'info') {
        resultsBody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center py-4 text-${type}">
                    <i class="fas fa-${getIcon(type)} me-2"></i>${text}
                </td>
            </tr>
        `;
    }
    
    function getIcon(type) {
        const icons = {
            'info': 'info-circle',
            'warning': 'exclamation-triangle',
            'danger': 'times-circle',
            'success': 'check-circle'
        };
        return icons[type] || 'info-circle';
    }
    
    // Показать индикатор загрузки
    function showLoading() {
        resultsBody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center py-4">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Загрузка...</span>
                    </div>
                    <p class="mt-2">Поиск цен...</p>
                </td>
            </tr>
        `;
    }
    
    // Скрыть индикатор загрузки
    function hideLoading() {
        // Уже обрабатывается в displayResults/showMessage
    }
});
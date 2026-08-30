/**
 * 모의 주식 게임 - 실시간 환율 및 주식 가격 변동
 */

class StockGame {
    constructor() {
        this.stocks = [];
        this.portfolio = {};
        this.tradeHistory = [];
        this.initialCapital = 1000000;
        this.exchangeRate = 1381.93;
        this.priceUpdateIntervals = {};
        
        this.currentTab = 'stocks';
        this.filteredStocks = [];
        this.sortBy = 'name';
        this.searchQuery = '';
        
        this.init();
    }

    async init() {
        await this.loadStocks();
        this.loadGameData();
        this.attachEventListeners();
        this.startPriceUpdates();
        this.render();
    }

    async loadStocks() {
        try {
            const response = await fetch('stocks.json');
            this.stocks = await response.json();
            this.filteredStocks = [...this.stocks];
        } catch (error) {
            console.error('Failed to load stocks:', error);
            this.showNotification('주식 데이터를 불러올 수 없습니다.', 'error');
        }
    }

    loadGameData() {
        const saved = localStorage.getItem('stockGameData');
        if (saved) {
            const data = JSON.parse(saved);
            this.portfolio = data.portfolio || {};
            this.tradeHistory = data.tradeHistory || [];
            this.initialCapital = data.initialCapital || 1000000;
        } else {
            this.saveGameData();
        }
    }

    saveGameData() {
        const data = {
            portfolio: this.portfolio,
            tradeHistory: this.tradeHistory,
            initialCapital: this.initialCapital
        };
        localStorage.setItem('stockGameData', JSON.stringify(data));
    }

    // 환율 변동 시작
    startExchangeRateUpdates() {
        setInterval(() => {
            const volatility = (Math.random() - 0.5) * 0.001; // ±0.05%
            this.exchangeRate *= (1 + volatility);
            if (Math.abs(volatility) > 0.00001) {
                document.getElementById('exchangeRateDisplay').textContent = 
                    `₩${this.exchangeRate.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}`;
            }
        }, 1000);
    }

    // 주식 가격 업데이트 시작
    startPriceUpdates() {
        this.startExchangeRateUpdates();
        this.stocks.forEach(stock => {
            const updateInterval = this.getUpdateInterval(stock.priceUSD);
            this.scheduleStockUpdate(stock, updateInterval);
        });
    }

    getUpdateInterval(price) {
        // $250 이상 또는 ₩200,000 이상이면 0.05~0.5초
        if (price >= 250 || price * this.exchangeRate >= 200000) {
            return Math.random() * 450 + 50; // 50~500ms
        }
        return 1000; // 매 초
    }

    scheduleStockUpdate(stock, interval) {
        const update = () => {
            if (this.stocks.find(s => s.symbol === stock.symbol)) {
                const volatility = (Math.random() - 0.5) * 0.006; // ±0.3%
                stock.priceUSD *= (1 + volatility);
                stock.priceUSD = Math.round(stock.priceUSD * 100) / 100;
                this.render();
            }

            const nextInterval = this.getUpdateInterval(stock.priceUSD);
            this.priceUpdateIntervals[stock.symbol] = setTimeout(
                () => update(),
                nextInterval
            );
        };

        this.priceUpdateIntervals[stock.symbol] = setTimeout(
            () => update(),
            interval
        );
    }

    attachEventListeners() {
        // 탭 네비게이션
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });

        // 테마 토글
        document.getElementById('themeToggle').addEventListener('click', () => this.toggleTheme());

        // 검색 및 정렬
        document.getElementById('searchInput').addEventListener('input', (e) => {
            this.searchQuery = e.target.value.toLowerCase();
            this.filterAndSortStocks();
        });

        document.getElementById('sortSelect').addEventListener('change', (e) => {
            this.sortBy = e.target.value;
            this.filterAndSortStocks();
        });

        // 모달 제어
        document.getElementById('closeModalBtn').addEventListener('click', () => this.closeTradeModal());
        document.getElementById('tradeModal').addEventListener('click', (e) => {
            if (e.target === document.getElementById('tradeModal')) this.closeTradeModal();
        });

        // 거래 수량 제어
        document.getElementById('qtyMinusBtn').addEventListener('click', () => this.adjustQuantity(-1));
        document.getElementById('qtyPlusBtn').addEventListener('click', () => this.adjustQuantity(1));
        document.getElementById('tradeQuantity').addEventListener('input', () => this.updateEstimatedCost());

        // 거래 버튼
        document.getElementById('buyBtn').addEventListener('click', () => this.buyStock());
        document.getElementById('sellBtn').addEventListener('click', () => this.sellStock());

        // 설정
        document.getElementById('initialCapitalSlider').addEventListener('change', (e) => {
            this.initialCapital = parseInt(e.target.value);
            this.portfolio = {};
            this.tradeHistory = [];
            this.saveGameData();
            this.updateCapitalDisplay();
            this.render();
        });

        document.getElementById('clearHistoryBtn').addEventListener('click', () => this.clearHistory());
        document.getElementById('exportDataBtn').addEventListener('click', () => this.exportData());
        document.getElementById('importDataBtn').addEventListener('click', () => {
            document.getElementById('fileInput').click();
        });
        document.getElementById('fileInput').addEventListener('change', (e) => this.importData(e));
        document.getElementById('resetGameBtn').addEventListener('click', () => this.resetGame());
    }

    switchTab(tab) {
        this.currentTab = tab;
        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        document.getElementById(`${tab}-tab`).classList.add('active');
    }

    toggleTheme() {
        document.body.classList.toggle('dark-mode');
        localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
        document.getElementById('themeToggle').textContent = document.body.classList.contains('dark-mode') ? '☀️' : '🌙';
    }

    filterAndSortStocks() {
        this.filteredStocks = this.stocks.filter(stock => {
            const query = this.searchQuery;
            return stock.name.toLowerCase().includes(query) || stock.symbol.toLowerCase().includes(query);
        });

        this.filteredStocks.sort((a, b) => {
            if (this.sortBy === 'name') {
                return a.name.localeCompare(b.name);
            } else if (this.sortBy === 'price') {
                return b.priceUSD - a.priceUSD;
            } else if (this.sortBy === 'change') {
                const changeA = ((a.priceUSD - a.previousCloseUSD) / a.previousCloseUSD) * 100;
                const changeB = ((b.priceUSD - b.previousCloseUSD) / b.previousCloseUSD) * 100;
                return changeB - changeA;
            }
        });

        this.renderStocksList();
    }

    openTradeModal(symbol) {
        const stock = this.stocks.find(s => s.symbol === symbol);
        if (!stock) return;

        const modal = document.getElementById('tradeModal');
        document.getElementById('modalTitle').textContent = `${stock.name} 거래`;
        document.getElementById('modalStockName').textContent = `${stock.name} (${stock.symbol})`;
        
        const priceKRW = stock.priceUSD * this.exchangeRate;
        const priceDisplay = `$${stock.priceUSD.toLocaleString('en-US', { maximumFractionDigits: 2 })} (₩${priceKRW.toLocaleString('ko-KR', { maximumFractionDigits: 0 })})`;
        document.getElementById('modalCurrentPrice').textContent = priceDisplay;

        const change = stock.priceUSD - stock.previousCloseUSD;
        const changePercent = (change / stock.previousCloseUSD) * 100;
        const changeText = `${change >= 0 ? '+' : ''}${change.toFixed(2)} (${changePercent.toFixed(2)}%)`;
        document.getElementById('modalChangeRate').textContent = changeText;

        const holding = this.portfolio[symbol];
        const holdingQty = holding ? holding.quantity : 0;
        document.getElementById('modalHoldingQty').textContent = `${holdingQty}주`;

        document.getElementById('tradeQuantity').value = 1;
        document.getElementById('tradeMessage').textContent = '';
        document.getElementById('tradeMessage').className = 'trade-message';

        modal.dataset.currentSymbol = symbol;
        modal.classList.add('show');
        this.updateEstimatedCost();
    }

    closeTradeModal() {
        document.getElementById('tradeModal').classList.remove('show');
    }

    adjustQuantity(delta) {
        const input = document.getElementById('tradeQuantity');
        let value = parseInt(input.value) || 1;
        value = Math.max(1, value + delta);
        input.value = value;
        this.updateEstimatedCost();
    }

    updateEstimatedCost() {
        const symbol = document.getElementById('tradeModal').dataset.currentSymbol;
        const stock = this.stocks.find(s => s.symbol === symbol);
        const quantity = parseInt(document.getElementById('tradeQuantity').value) || 1;

        if (stock) {
            const costUSD = stock.priceUSD * quantity;
            const costKRW = costUSD * this.exchangeRate;
            document.getElementById('estimatedCost').textContent = 
                `$${costUSD.toLocaleString('en-US', { maximumFractionDigits: 2 })} (₩${costKRW.toLocaleString('ko-KR', { maximumFractionDigits: 0 })})`;
        }
    }

    buyStock() {
        const symbol = document.getElementById('tradeModal').dataset.currentSymbol;
        const quantity = parseInt(document.getElementById('tradeQuantity').value) || 1;
        const stock = this.stocks.find(s => s.symbol === symbol);

        if (!stock || quantity <= 0) {
            this.showTradeError('올바른 수량을 입력해주세요.');
            return;
        }

        const costKRW = stock.priceUSD * quantity * this.exchangeRate;
        const currentCash = this.getCashBalance();

        if (costKRW > currentCash) {
            this.showTradeError('보유 자금이 부족합니다.');
            return;
        }

        if (!this.portfolio[symbol]) {
            this.portfolio[symbol] = {
                quantity: 0,
                totalCostKRW: 0,
                name: stock.name,
                symbol: stock.symbol
            };
        }

        const holding = this.portfolio[symbol];
        holding.quantity += quantity;
        holding.totalCostKRW += costKRW;

        this.tradeHistory.unshift({
            type: 'buy',
            symbol: stock.symbol,
            name: stock.name,
            quantity: quantity,
            priceUSD: stock.priceUSD,
            costKRW: costKRW,
            timestamp: new Date().toISOString()
        });

        this.saveGameData();
        this.showTradeSuccess(`${quantity}주 매수했습니다.`);
        this.render();
    }

    sellStock() {
        const symbol = document.getElementById('tradeModal').dataset.currentSymbol;
        const quantity = parseInt(document.getElementById('tradeQuantity').value) || 1;
        const stock = this.stocks.find(s => s.symbol === symbol);

        if (!stock || quantity <= 0) {
            this.showTradeError('올바른 수량을 입력해주세요.');
            return;
        }

        const holding = this.portfolio[symbol];
        if (!holding || holding.quantity < quantity) {
            this.showTradeError('보유한 주식이 부족합니다.');
            return;
        }

        const avgPriceKRW = holding.totalCostKRW / holding.quantity;
        const revenueKRW = stock.priceUSD * quantity * this.exchangeRate;
        const profitKRW = revenueKRW - (avgPriceKRW * quantity);

        holding.quantity -= quantity;
        holding.totalCostKRW -= avgPriceKRW * quantity;

        if (holding.quantity === 0) {
            delete this.portfolio[symbol];
        }

        this.tradeHistory.unshift({
            type: 'sell',
            symbol: stock.symbol,
            name: stock.name,
            quantity: quantity,
            priceUSD: stock.priceUSD,
            revenueKRW: revenueKRW,
            profitKRW: profitKRW,
            timestamp: new Date().toISOString()
        });

        this.saveGameData();
        this.showTradeSuccess(`${quantity}주 매도했습니다.`);
        this.render();
    }

    clearHistory() {
        if (confirm('거래 기록을 모두 삭제하시겠습니까?')) {
            this.tradeHistory = [];
            this.saveGameData();
            this.renderTradeHistory();
        }
    }

    exportData() {
        const data = {
            portfolio: this.portfolio,
            tradeHistory: this.tradeHistory,
            initialCapital: this.initialCapital,
            exportDate: new Date().toISOString()
        };
        const dataStr = JSON.stringify(data, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `stock-game-data-${new Date().getTime()}.json`;
        link.click();
    }

    importData(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                this.portfolio = data.portfolio || {};
                this.tradeHistory = data.tradeHistory || [];
                this.initialCapital = data.initialCapital || 1000000;
                this.saveGameData();
                this.render();
                this.showNotification('데이터를 가져왔습니다.', 'success');
            } catch (error) {
                this.showNotification('파일을 읽을 수 없습니다.', 'error');
            }
        };
        reader.readAsText(file);
    }

    resetGame() {
        if (confirm('게임을 초기화하시겠습니까?')) {
            this.portfolio = {};
            this.tradeHistory = [];
            this.saveGameData();
            this.render();
            this.showNotification('게임이 초기화되었습니다.', 'success');
        }
    }

    getCashBalance() {
        let totalInvestedKRW = 0;
        for (const symbol in this.portfolio) {
            totalInvestedKRW += this.portfolio[symbol].totalCostKRW;
        }
        return this.initialCapital - totalInvestedKRW;
    }

    getTotalAssets() {
        let currentValueKRW = this.getCashBalance();
        for (const symbol in this.portfolio) {
            const holding = this.portfolio[symbol];
            const stock = this.stocks.find(s => s.symbol === symbol);
            if (stock) {
                currentValueKRW += stock.priceUSD * holding.quantity * this.exchangeRate;
            }
        }
        return currentValueKRW;
    }

    getTotalProfit() {
        return this.getTotalAssets() - this.initialCapital;
    }

    getTotalProfitRate() {
        return (this.getTotalProfit() / this.initialCapital) * 100;
    }

    render() {
        this.renderBalanceInfo();
        if (this.currentTab === 'stocks') {
            this.renderStocksList();
        } else if (this.currentTab === 'portfolio') {
            this.renderPortfolio();
        } else if (this.currentTab === 'history') {
            this.renderTradeHistory();
        }
        this.updateCapitalDisplay();
    }

    renderBalanceInfo() {
        const cash = this.getCashBalance();
        const total = this.getTotalAssets();
        const profit = this.getTotalProfit();
        const profitRate = this.getTotalProfitRate();

        document.getElementById('cashBalance').textContent = `₩${cash.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}`;
        document.getElementById('totalAssets').textContent = `₩${total.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}`;
        document.getElementById('investedAmount').textContent = `₩${(this.initialCapital - cash).toLocaleString('ko-KR', { maximumFractionDigits: 0 })}`;
        document.getElementById('exchangeRateDisplay').textContent = `₩${this.exchangeRate.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}`;

        const totalChangeEl = document.getElementById('totalChange');
        totalChangeEl.textContent = `${profitRate >= 0 ? '+' : ''}${profitRate.toFixed(2)}%`;
        totalChangeEl.style.color = profitRate >= 0 ? '#10b981' : '#ef4444';

        document.getElementById('totalProfit').textContent = `${profit >= 0 ? '+' : ''}₩${Math.abs(profit).toLocaleString('ko-KR', { maximumFractionDigits: 0 })}`;
        document.getElementById('totalProfit').className = profit >= 0 ? 'value-positive' : 'value-negative';

        document.getElementById('totalProfitRate').textContent = `${profitRate >= 0 ? '+' : ''}${profitRate.toFixed(2)}%`;
        document.getElementById('totalProfitRate').className = profitRate >= 0 ? 'value-positive' : 'value-negative';
    }

    renderStocksList() {
        const container = document.getElementById('stocksList');
        container.innerHTML = '';

        if (this.filteredStocks.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>검색 결과가 없습니다.</p></div>';
            return;
        }

        this.filteredStocks.forEach(stock => {
            const card = document.createElement('div');
            card.className = 'stock-card';

            const change = stock.priceUSD - stock.previousCloseUSD;
            const changePercent = (change / stock.previousCloseUSD) * 100;
            const isPositive = change >= 0;

            const holding = this.portfolio[stock.symbol];
            const holdingQty = holding ? holding.quantity : 0;
            const holdingValueKRW = holding ? stock.priceUSD * holding.quantity * this.exchangeRate : 0;
            const priceKRW = stock.priceUSD * this.exchangeRate;

            card.innerHTML = `
                <div class="stock-header">
                    <div>
                        <div class="stock-name">${stock.name}</div>
                        <div class="stock-symbol">${stock.symbol}</div>
                    </div>
                </div>
                <div class="stock-price">$${stock.priceUSD.toLocaleString('en-US', { maximumFractionDigits: 2 })}</div>
                <div style="font-size: 12px; color: var(--neutral-text); margin-bottom: 8px;">
                    ₩${priceKRW.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}
                </div>
                <div class="stock-change">
                    <span class="change-amount">${isPositive ? '+' : ''}${change.toFixed(2)}</span>
                    <span class="change-percent ${isPositive ? 'positive' : 'negative'}">${isPositive ? '+' : ''}${changePercent.toFixed(2)}%</span>
                </div>
                <div style="font-size: 12px; color: var(--neutral-text); margin-bottom: 12px;">
                    보유: ${holdingQty}주 / ₩${holdingValueKRW.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}
                </div>
                <div class="stock-actions">
                    <button class="btn-trade">거래</button>
                </div>
            `;

            card.querySelector('.btn-trade').addEventListener('click', () => {
                this.openTradeModal(stock.symbol);
            });

            container.appendChild(card);
        });
    }

    renderPortfolio() {
        const container = document.getElementById('portfolio');
        container.innerHTML = '';

        const holdings = Object.entries(this.portfolio).filter(([_, h]) => h.quantity > 0);

        if (holdings.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>보유 주식이 없습니다.</p></div>';
            return;
        }

        holdings.forEach(([symbol, holding]) => {
            const stock = this.stocks.find(s => s.symbol === symbol);
            if (!stock) return;

            const currentValueKRW = stock.priceUSD * holding.quantity * this.exchangeRate;
            const profitKRW = currentValueKRW - holding.totalCostKRW;
            const avgPriceKRW = holding.totalCostKRW / holding.quantity;
            const profitRate = (profitKRW / holding.totalCostKRW) * 100;

            const item = document.createElement('div');
            item.className = 'portfolio-item';
            item.innerHTML = `
                <h4>${holding.name} <span class="change-percent ${profitKRW >= 0 ? 'positive' : 'negative'}">${profitKRW >= 0 ? '+' : ''}${profitRate.toFixed(2)}%</span></h4>
                <div class="portfolio-info">
                    <p><strong>종목코드:</strong> ${symbol}</p>
                    <p><strong>보유량:</strong> ${holding.quantity}주</p>
                    <p><strong>평단가:</strong> ₩${avgPriceKRW.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}</p>
                    <p><strong>현재가:</strong> $${stock.priceUSD.toLocaleString('en-US', { maximumFractionDigits: 2 })} (₩${(stock.priceUSD * this.exchangeRate).toLocaleString('ko-KR', { maximumFractionDigits: 0 })})</p>
                    <p><strong>투자금:</strong> ₩${holding.totalCostKRW.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}</p>
                    <p><strong>현재가치:</strong> ₩${currentValueKRW.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}</p>
                    <p><strong>손익:</strong> <span class="${profitKRW >= 0 ? 'value-positive' : 'value-negative'}">${profitKRW >= 0 ? '+' : ''}₩${Math.abs(profitKRW).toLocaleString('ko-KR', { maximumFractionDigits: 0 })}</span></p>
                </div>
            `;
            container.appendChild(item);
        });
    }

    renderTradeHistory() {
        const container = document.getElementById('tradeHistory');
        container.innerHTML = '';

        if (this.tradeHistory.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>거래 기록이 없습니다.</p></div>';
            return;
        }

        this.tradeHistory.forEach(trade => {
            const item = document.createElement('div');
            item.className = 'trade-item';

            const date = new Date(trade.timestamp);
            const dateStr = date.toLocaleString('ko-KR');

            let amountText = '';
            let typeClass = '';
            if (trade.type === 'buy') {
                amountText = `-₩${trade.costKRW.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}`;
                typeClass = 'buy';
            } else {
                const profitText = trade.profitKRW >= 0 ? '+' : '';
                amountText = `+₩${trade.revenueKRW.toLocaleString('ko-KR', { maximumFractionDigits: 0 })} (${profitText}₩${trade.profitKRW.toLocaleString('ko-KR', { maximumFractionDigits: 0 })})`;
                typeClass = 'sell';
            }

            item.innerHTML = `
                <span class="trade-type-badge ${typeClass}">${trade.type === 'buy' ? '매수' : '매도'}</span>
                <div class="trade-details">
                    <div class="trade-symbol">${trade.name} (${trade.symbol})</div>
                    <div class="trade-timestamp">${dateStr} • ${trade.quantity}주 @ $${trade.priceUSD.toLocaleString('en-US', { maximumFractionDigits: 2 })}</div>
                </div>
                <div class="trade-amount">${amountText}</div>
            `;

            container.appendChild(item);
        });
    }

    updateCapitalDisplay() {
        document.getElementById('initialCapitalDisplay').textContent = 
            `₩${this.initialCapital.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}`;
        document.getElementById('initialCapitalSlider').value = this.initialCapital;
    }

    showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            padding: 16px 24px;
            background: ${type === 'success' ? '#10b981' : '#ef4444'};
            color: white;
            border-radius: 8px;
            box-shadow: 0 10px 15px rgba(0, 0, 0, 0.1);
            animation: slideIn 0.3s ease;
            z-index: 9999;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    showTradeError(message) {
        const tradeMsg = document.getElementById('tradeMessage');
        tradeMsg.textContent = message;
        tradeMsg.className = 'trade-message error';
    }

    showTradeSuccess(message) {
        const tradeMsg = document.getElementById('tradeMessage');
        tradeMsg.textContent = message;
        tradeMsg.className = 'trade-message success';
    }
}

// 페이지 로드 시 게임 초기화
document.addEventListener('DOMContentLoaded', () => {
    const theme = localStorage.getItem('theme');
    if (theme === 'dark') {
        document.body.classList.add('dark-mode');
        document.getElementById('themeToggle').textContent = '☀️';
    }

    new StockGame();
});

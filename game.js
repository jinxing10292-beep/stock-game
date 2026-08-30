/**
 * 모의 주식 게임
 * JSON 기반 주식 관리, 로컬 스토리지 데이터 저장
 */

class StockGame {
    constructor() {
        this.stocks = [];
        this.portfolio = {};
        this.tradeHistory = [];
        this.initialCapital = 1000000;
        
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
        this.render();
    }

    // 주식 데이터 로드
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

    // 로컬 스토리지에서 게임 데이터 로드
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

    // 로컬 스토리지에 게임 데이터 저장
    saveGameData() {
        const data = {
            portfolio: this.portfolio,
            tradeHistory: this.tradeHistory,
            initialCapital: this.initialCapital
        };
        localStorage.setItem('stockGameData', JSON.stringify(data));
    }

    // 이벤트 리스너 설정
    attachEventListeners() {
        // 탭 네비게이션
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });

        // 테마 토글
        document.getElementById('themeToggle').addEventListener('click', () => this.toggleTheme());

        // 메뉴 토글
        document.getElementById('menuToggle').addEventListener('click', () => this.toggleMenu());

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

    // 탭 전환
    switchTab(tab) {
        this.currentTab = tab;
        document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelector(`[data-tab="${tab}"]`).classList.add('active');

        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        document.getElementById(`${tab}-tab`).classList.add('active');
    }

    // 테마 토글
    toggleTheme() {
        document.body.classList.toggle('dark-mode');
        localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
        document.getElementById('themeToggle').textContent = document.body.classList.contains('dark-mode') ? '☀️' : '🌙';
    }

    // 메뉴 토글 (모바일)
    toggleMenu() {
        // 향후 구현
    }

    // 검색 및 정렬
    filterAndSortStocks() {
        this.filteredStocks = this.stocks.filter(stock => {
            const query = this.searchQuery;
            return stock.name.toLowerCase().includes(query) || stock.symbol.toLowerCase().includes(query);
        });

        this.filteredStocks.sort((a, b) => {
            if (this.sortBy === 'name') {
                return a.name.localeCompare(b.name);
            } else if (this.sortBy === 'price') {
                return b.price - a.price;
            } else if (this.sortBy === 'change') {
                const changeA = ((a.price - a.previousClose) / a.previousClose) * 100;
                const changeB = ((b.price - b.previousClose) / b.previousClose) * 100;
                return changeB - changeA;
            }
        });

        this.renderStocksList();
    }

    // 거래 모달 열기
    openTradeModal(symbol) {
        const stock = this.stocks.find(s => s.symbol === symbol);
        if (!stock) return;

        const modal = document.getElementById('tradeModal');
        document.getElementById('modalTitle').textContent = `${stock.name} 거래`;
        document.getElementById('modalStockName').textContent = `${stock.name} (${stock.symbol})`;
        
        const price = stock.price.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
        document.getElementById('modalCurrentPrice').textContent = `${price} ${stock.currency}`;

        const change = stock.price - stock.previousClose;
        const changePercent = (change / stock.previousClose) * 100;
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

    // 거래 모달 닫기
    closeTradeModal() {
        document.getElementById('tradeModal').classList.remove('show');
    }

    // 수량 조정
    adjustQuantity(delta) {
        const input = document.getElementById('tradeQuantity');
        let value = parseInt(input.value) || 1;
        value = Math.max(1, value + delta);
        input.value = value;
        this.updateEstimatedCost();
    }

    // 예상 금액 업데이트
    updateEstimatedCost() {
        const symbol = document.getElementById('tradeModal').dataset.currentSymbol;
        const stock = this.stocks.find(s => s.symbol === symbol);
        const quantity = parseInt(document.getElementById('tradeQuantity').value) || 1;

        if (stock) {
            const cost = stock.price * quantity;
            document.getElementById('estimatedCost').textContent = 
                `${cost.toLocaleString('ko-KR', { maximumFractionDigits: 2 })} ${stock.currency}`;
        }
    }

    // 매수
    buyStock() {
        const symbol = document.getElementById('tradeModal').dataset.currentSymbol;
        const quantity = parseInt(document.getElementById('tradeQuantity').value) || 1;
        const stock = this.stocks.find(s => s.symbol === symbol);

        if (!stock || quantity <= 0) {
            this.showTradeError('올바른 수량을 입력해주세요.');
            return;
        }

        const cost = stock.price * quantity;
        const currentCash = this.getCashBalance();

        if (cost > currentCash) {
            this.showTradeError('보유 자금이 부족합니다.');
            return;
        }

        // 포트폴리오 업데이트
        if (!this.portfolio[symbol]) {
            this.portfolio[symbol] = {
                quantity: 0,
                totalCost: 0,
                name: stock.name,
                symbol: stock.symbol
            };
        }

        const holding = this.portfolio[symbol];
        const newQuantity = holding.quantity + quantity;
        const newTotalCost = holding.totalCost + cost;

        holding.quantity = newQuantity;
        holding.totalCost = newTotalCost;

        // 거래 기록 추가
        this.tradeHistory.unshift({
            type: 'buy',
            symbol: stock.symbol,
            name: stock.name,
            quantity: quantity,
            price: stock.price,
            cost: cost,
            timestamp: new Date().toISOString()
        });

        this.saveGameData();
        this.showTradeSuccess(`${quantity}주 매수했습니다.`);
        this.render();
    }

    // 매도
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

        const avgPrice = holding.totalCost / holding.quantity;
        const revenue = stock.price * quantity;

        holding.quantity -= quantity;
        holding.totalCost -= avgPrice * quantity;

        if (holding.quantity === 0) {
            delete this.portfolio[symbol];
        }

        // 거래 기록 추가
        this.tradeHistory.unshift({
            type: 'sell',
            symbol: stock.symbol,
            name: stock.name,
            quantity: quantity,
            price: stock.price,
            revenue: revenue,
            profit: revenue - (avgPrice * quantity),
            timestamp: new Date().toISOString()
        });

        this.saveGameData();
        this.showTradeSuccess(`${quantity}주 매도했습니다.`);
        this.render();
    }

    // 거래 기록 삭제
    clearHistory() {
        if (confirm('거래 기록을 모두 삭제하시겠습니까?')) {
            this.tradeHistory = [];
            this.saveGameData();
            this.renderTradeHistory();
        }
    }

    // 데이터 내보내기
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

    // 데이터 가져오기
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

    // 게임 초기화
    resetGame() {
        if (confirm('게임을 초기화하시겠습니까? 모든 데이터가 삭제됩니다.')) {
            this.portfolio = {};
            this.tradeHistory = [];
            this.saveGameData();
            this.render();
            this.showNotification('게임이 초기화되었습니다.', 'success');
        }
    }

    // 계산 메서드
    getCashBalance() {
        let totalInvested = 0;
        for (const symbol in this.portfolio) {
            const holding = this.portfolio[symbol];
            const stock = this.stocks.find(s => s.symbol === symbol);
            if (stock) {
                totalInvested += stock.price * holding.quantity;
            }
        }
        return this.initialCapital - totalInvested;
    }

    getTotalAssets() {
        let currentValue = this.getCashBalance();
        for (const symbol in this.portfolio) {
            const holding = this.portfolio[symbol];
            const stock = this.stocks.find(s => s.symbol === symbol);
            if (stock) {
                currentValue += stock.price * holding.quantity;
            }
        }
        return currentValue;
    }

    getTotalProfit() {
        const totalAssets = this.getTotalAssets();
        return totalAssets - this.initialCapital;
    }

    getTotalProfitRate() {
        const profit = this.getTotalProfit();
        const rate = (profit / this.initialCapital) * 100;
        return rate;
    }

    // 렌더링
    render() {
        this.renderBalanceInfo();
        this.renderStocksList();
        this.renderPortfolio();
        this.renderTradeHistory();
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

        const totalChangeEl = document.getElementById('totalChange');
        totalChangeEl.textContent = `${profitRate >= 0 ? '+' : ''}${profitRate.toFixed(2)}%`;
        totalChangeEl.className = profitRate >= 0 ? 'asset-change' : 'asset-change';
        totalChangeEl.style.color = profitRate >= 0 ? '#10b981' : '#ef4444';

        // 포트폴리오 요약
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

            const change = stock.price - stock.previousClose;
            const changePercent = (change / stock.previousClose) * 100;
            const isPositive = change >= 0;

            const holding = this.portfolio[stock.symbol];
            const holdingQty = holding ? holding.quantity : 0;
            const holdingValue = holding ? stock.price * holding.quantity : 0;

            card.innerHTML = `
                <div class="stock-header">
                    <div>
                        <div class="stock-name">${stock.name}</div>
                        <div class="stock-symbol">${stock.symbol}</div>
                    </div>
                </div>
                <div class="stock-price">${stock.price.toLocaleString('ko-KR', { maximumFractionDigits: 2 })} ${stock.currency}</div>
                <div class="stock-change">
                    <span class="change-amount">${isPositive ? '+' : ''}${change.toFixed(2)}</span>
                    <span class="change-percent ${isPositive ? 'positive' : 'negative'}">${isPositive ? '+' : ''}${changePercent.toFixed(2)}%</span>
                </div>
                <div style="font-size: 12px; color: var(--neutral-text); margin-bottom: 12px;">
                    보유: ${holdingQty}주 / ₩${holdingValue.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}
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

            const currentValue = stock.price * holding.quantity;
            const profit = currentValue - holding.totalCost;
            const avgPrice = holding.totalCost / holding.quantity;
            const profitRate = (profit / holding.totalCost) * 100;

            const item = document.createElement('div');
            item.className = 'portfolio-item';
            item.innerHTML = `
                <h4>${holding.name} <span class="change-percent ${profit >= 0 ? 'positive' : 'negative'}">${profit >= 0 ? '+' : ''}${profitRate.toFixed(2)}%</span></h4>
                <div class="portfolio-info">
                    <p><strong>종목코드:</strong> ${symbol}</p>
                    <p><strong>보유량:</strong> ${holding.quantity}주</p>
                    <p><strong>평단가:</strong> ${avgPrice.toLocaleString('ko-KR', { maximumFractionDigits: 2 })} ${stock.currency}</p>
                    <p><strong>현재가:</strong> ${stock.price.toLocaleString('ko-KR', { maximumFractionDigits: 2 })} ${stock.currency}</p>
                    <p><strong>투자금:</strong> ${holding.totalCost.toLocaleString('ko-KR', { maximumFractionDigits: 0 })} 원</p>
                    <p><strong>현재가치:</strong> ${currentValue.toLocaleString('ko-KR', { maximumFractionDigits: 0 })} 원</p>
                    <p><strong>손익:</strong> <span class="${profit >= 0 ? 'value-positive' : 'value-negative'}">${profit >= 0 ? '+' : ''}${Math.abs(profit).toLocaleString('ko-KR', { maximumFractionDigits: 0 })} 원</span></p>
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
                amountText = `-₩${trade.cost.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}`;
                typeClass = 'buy';
            } else {
                const profitText = trade.profit >= 0 ? '+' : '';
                amountText = `+₩${trade.revenue.toLocaleString('ko-KR', { maximumFractionDigits: 0 })} (${profitText}${trade.profit.toLocaleString('ko-KR', { maximumFractionDigits: 0 })})`;
                typeClass = 'sell';
            }

            item.innerHTML = `
                <span class="trade-type-badge ${typeClass}">${trade.type === 'buy' ? '매수' : '매도'}</span>
                <div class="trade-details">
                    <div class="trade-symbol">${trade.name} (${trade.symbol})</div>
                    <div class="trade-timestamp">${dateStr} • ${trade.quantity}주 @ ${trade.price.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}</div>
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

    // 알림 메시지
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
    // 저장된 테마 복원
    const theme = localStorage.getItem('theme');
    if (theme === 'dark') {
        document.body.classList.add('dark-mode');
        document.getElementById('themeToggle').textContent = '☀️';
    }

    new StockGame();
});

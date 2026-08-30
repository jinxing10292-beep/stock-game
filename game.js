/**
 * 모의 주식 게임 - 실시간 환율 및 주식 가격 변동
 */

class StockGame {
    constructor() {
        this.stocks = [];
        this.portfolio = {};
        this.tradeHistory = [];
        this.initialCapital = 10000000; // 1000만원 고정
        this.exchangeRate = 1381.93;
        this.priceUpdateIntervals = {};
        this.priceHistory = {}; // 주식별 가격 이력 저장
        
        this.currentTab = 'stocks';
        this.filteredStocks = [];
        this.sortBy = 'name';
        this.searchQuery = '';
        this.selectedStock = null; // 선택된 주식
        this.stockTypeFilter = 'all'; // 주식 타입 필터 (all, korean, us)
        this.detailUpdateInterval = null; // 상세 페이지 업데이트 인터벌
        this.deviceId = this.generateDeviceId(); // 기기 고유 ID
        this.adminUpdateInterval = null; // 어드민 페이지 업데이트 인터벌
        
        this.init();
    }

    async init() {
        await this.loadStocks();
        this.loadGameData();
        this.attachEventListeners();
        this.startPriceUpdates();
        this.render();
    }

    // 기기 고유 ID 생성 (localStorage에 저장)
    generateDeviceId() {
        let deviceId = localStorage.getItem('stockGameDeviceId');
        if (!deviceId) {
            deviceId = 'device-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now();
            localStorage.setItem('stockGameDeviceId', deviceId);
        }
        return deviceId;
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
            // initialCapital은 항상 10000000으로 고정
            this.initialCapital = 10000000;
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
        
        // 어드민용: 모든 기기의 거래 정보를 별도로 저장
        this.saveAdminTradeData({
            deviceId: this.deviceId,
            timestamp: new Date().toISOString(),
            type: 'update',
            tradeHistory: this.tradeHistory,
            cash: this.getCashBalance()
        });
    }

    // 어드민용 거래 데이터 저장
    saveAdminTradeData(tradeData) {
        let allTrades = JSON.parse(localStorage.getItem('stockGameAdminTrades') || '[]');
        allTrades.push(tradeData);
        
        // 최근 1000개만 유지 (메모리 절약)
        if (allTrades.length > 1000) {
            allTrades = allTrades.slice(-1000);
        }
        
        localStorage.setItem('stockGameAdminTrades', JSON.stringify(allTrades));
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
        // $350 이상 또는 ₩300,000 이상이면 0.1~0.9초
        if (price >= 350 || price * this.exchangeRate >= 300000) {
            return Math.random() * 800 + 100; // 100~900ms
        }
        return 1000; // 매 초
    }

    scheduleStockUpdate(stock, interval) {
        // 초기 가격 이력 설정
        if (!this.priceHistory[stock.symbol]) {
            this.priceHistory[stock.symbol] = {
                startPrice: stock.priceUSD,
                prices: [stock.priceUSD],
                timestamps: [Date.now()]
            };
        }

        const update = () => {
            if (this.stocks.find(s => s.symbol === stock.symbol)) {
                const volatility = (Math.random() - 0.5) * 0.006; // ±0.3%
                stock.priceUSD *= (1 + volatility);
                stock.priceUSD = Math.round(stock.priceUSD * 100) / 100;
                
                // 가격 이력 저장 (최대 60개까지만)
                if (this.priceHistory[stock.symbol].prices.length >= 60) {
                    this.priceHistory[stock.symbol].prices.shift();
                    this.priceHistory[stock.symbol].timestamps.shift();
                }
                this.priceHistory[stock.symbol].prices.push(stock.priceUSD);
                this.priceHistory[stock.symbol].timestamps.push(Date.now());
                
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

        // 주식 타입 필터
        document.querySelectorAll('.stock-type-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.stock-type-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.stockTypeFilter = e.target.dataset.type;
                this.filterAndSortStocks();
            });
        });

        // 어드민 버튼
        document.getElementById('adminBtn').addEventListener('click', () => {
            this.showAdminPassword();
        });

        // 어드민 비밀번호 확인
        document.getElementById('adminPasswordBtn')?.addEventListener('click', () => {
            this.checkAdminPassword();
        });

        document.getElementById('adminPassword')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.checkAdminPassword();
            }
        });

        // 어드민 비밀번호 취소
        document.getElementById('adminPasswordCancelBtn')?.addEventListener('click', () => {
            document.getElementById('adminModal').classList.remove('show');
            document.getElementById('adminPassword').value = '';
        });

        // 어드민 모달 닫기
        document.getElementById('closeAdminBtn')?.addEventListener('click', () => {
            document.getElementById('adminModal').classList.remove('show');
            if (this.adminUpdateInterval) {
                clearInterval(this.adminUpdateInterval);
                this.adminUpdateInterval = null;
            }
        });

        document.getElementById('adminModal')?.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-overlay')) {
                document.getElementById('adminModal').classList.remove('show');
                if (this.adminUpdateInterval) {
                    clearInterval(this.adminUpdateInterval);
                    this.adminUpdateInterval = null;
                }
            }
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

        // 상세 모달 제어
        document.getElementById('stockDetailModal').addEventListener('click', (e) => {
            if (e.target === document.getElementById('stockDetailModal') || e.target.classList.contains('modal-overlay')) {
                document.getElementById('stockDetailModal').classList.remove('show');
                this.stopDetailUpdate();
            }
        });

        // 거래 수량 제어
        document.getElementById('qtyMinusBtn').addEventListener('click', () => this.adjustQuantity(-1));
        document.getElementById('qtyPlusBtn').addEventListener('click', () => this.adjustQuantity(1));
        document.getElementById('tradeQuantity').addEventListener('input', () => this.updateEstimatedCost());

        // 거래 버튼
        document.getElementById('buyBtn').addEventListener('click', () => this.buyStock());
        document.getElementById('sellBtn').addEventListener('click', () => this.sellStock());

        // 설정
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
            const matchesSearch = stock.name.toLowerCase().includes(query) || stock.symbol.toLowerCase().includes(query);
            
            if (this.stockTypeFilter === 'all') {
                return matchesSearch;
            } else if (this.stockTypeFilter === 'korean') {
                return matchesSearch && this.isKoreanStock(stock.symbol);
            } else if (this.stockTypeFilter === 'us') {
                return matchesSearch && !this.isKoreanStock(stock.symbol);
            }
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

    // 한국 주식 판단
    isKoreanStock(symbol) {
        // 한국 주식은 숫자로만 이루어짐, 미국 주식은 문자로만 이루어짐
        return /^\d+$/.test(symbol);
    }

    // 주식 상세 페이지 열기
    openStockDetail(symbol) {
        try {
            this.selectedStock = symbol;
            const modal = document.getElementById('stockDetailModal');
            if (!modal) {
                console.error('Modal not found');
                return;
            }
            modal.classList.add('show');
            this.renderStockDetail();
            
            // 상세 페이지 실시간 업데이트 시작
            this.startDetailUpdate();
        } catch (error) {
            console.error('Error opening stock detail:', error);
        }
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
            this.initialCapital = 10000000; // 1000만원으로 리셋
            this.priceHistory = {}; // 가격 이력도 초기화
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
            const change = stock.priceUSD - stock.previousCloseUSD;
            const changePercent = (change / stock.previousCloseUSD) * 100;
            const isPositive = change >= 0;

            const holding = this.portfolio[stock.symbol];
            const holdingQty = holding ? holding.quantity : 0;
            const priceKRW = stock.priceUSD * this.exchangeRate;

            const row = document.createElement('div');
            row.className = 'stock-row';
            row.innerHTML = `
                <div class="stock-row-header">
                    <div class="stock-row-name">
                        <div class="stock-row-title">${stock.name}</div>
                        <div class="stock-row-symbol">${stock.symbol}</div>
                    </div>
                    <div class="stock-row-price">
                        <div class="stock-row-price-usd">$${stock.priceUSD.toLocaleString('en-US', { maximumFractionDigits: 2 })}</div>
                        <div class="stock-row-price-krw">₩${priceKRW.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}</div>
                    </div>
                    <div class="stock-row-change">
                        <span class="change-amount ${isPositive ? 'positive' : 'negative'}">${isPositive ? '▲' : '▼'} ${Math.abs(change).toFixed(2)}</span>
                        <span class="change-percent ${isPositive ? 'positive' : 'negative'}">${isPositive ? '+' : ''}${changePercent.toFixed(2)}%</span>
                    </div>
                    <div class="stock-row-holding">
                        <span class="holding-qty">${holdingQty}주</span>
                    </div>
                    <div class="stock-row-action">
                        <button class="btn-stock-detail">상세</button>
                    </div>
                </div>
            `;

            row.querySelector('.btn-stock-detail').addEventListener('click', () => {
                this.openStockDetail(stock.symbol);
            });

            container.appendChild(row);
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
            const currentValueUSD = stock.priceUSD * holding.quantity;
            const profitKRW = currentValueKRW - holding.totalCostKRW;
            const avgPriceKRW = holding.totalCostKRW / holding.quantity;
            const avgPriceUSD = avgPriceKRW / this.exchangeRate;
            const profitRate = (profitKRW / holding.totalCostKRW) * 100;
            const investedUSD = holding.totalCostKRW / this.exchangeRate;

            const item = document.createElement('div');
            item.className = 'portfolio-item';
            item.innerHTML = `
                <h4>${holding.name} <span class="change-percent ${profitKRW >= 0 ? 'positive' : 'negative'}">${profitKRW >= 0 ? '+' : ''}${profitRate.toFixed(2)}%</span></h4>
                <div class="portfolio-info">
                    <p><strong>종목코드:</strong> ${symbol}</p>
                    <p><strong>보유량:</strong> ${holding.quantity}주</p>
                    <p><strong>평단가:</strong> $${avgPriceUSD.toLocaleString('en-US', { maximumFractionDigits: 2 })} / ₩${avgPriceKRW.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}</p>
                    <p><strong>현재가:</strong> $${stock.priceUSD.toLocaleString('en-US', { maximumFractionDigits: 2 })} (₩${(stock.priceUSD * this.exchangeRate).toLocaleString('ko-KR', { maximumFractionDigits: 0 })})</p>
                    <p><strong>투자금:</strong> $${investedUSD.toLocaleString('en-US', { maximumFractionDigits: 0 })} / ₩${holding.totalCostKRW.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}</p>
                    <p><strong>현재가치:</strong> $${currentValueUSD.toLocaleString('en-US', { maximumFractionDigits: 0 })} / ₩${currentValueKRW.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}</p>
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
    }

    // 어드민 비밀번호 화면 표시
    showAdminPassword() {
        const modal = document.getElementById('adminModal');
        if (!modal) return;
        
        modal.classList.add('show');
        document.getElementById('adminPasswordScreen').style.display = 'flex';
        document.getElementById('adminTradesScreen').style.display = 'none';
        document.getElementById('adminPassword').value = '';
        document.getElementById('adminPassword').focus();
    }

    // 어드민 비밀번호 검증
    checkAdminPassword() {
        const password = document.getElementById('adminPassword').value;
        const correctPassword = '18123';

        if (password === correctPassword) {
            document.getElementById('adminPasswordScreen').style.display = 'none';
            document.getElementById('adminTradesScreen').style.display = 'flex';
            this.showAdminPage();
        } else {
            alert('비밀번호가 틀렸습니다.');
            document.getElementById('adminPassword').value = '';
            document.getElementById('adminPassword').focus();
        }
    }

    // 어드민 페이지 표시
    showAdminPage() {
        const modal = document.getElementById('adminModal');
        if (!modal) return;
        
        this.updateAdminTradesList();
        
        // 매 2초마다 자동 새로고침
        if (this.adminUpdateInterval) {
            clearInterval(this.adminUpdateInterval);
        }
        
        this.adminUpdateInterval = setInterval(() => {
            this.updateAdminTradesList();
        }, 2000);
    }

    // 어드민 거래 목록 업데이트
    updateAdminTradesList() {
        const adminTradesList = document.getElementById('adminTradesList');
        if (!adminTradesList) return;
        
        const allTrades = JSON.parse(localStorage.getItem('stockGameAdminTrades') || '[]');
        
        if (allTrades.length === 0) {
            adminTradesList.innerHTML = '<div class="admin-empty">아직 거래 기록이 없습니다.</div>';
            return;
        }

        // 기기별 가장 최근 데이터만 추출
        const deviceMap = new Map();
        allTrades.forEach(trade => {
            if (!deviceMap.has(trade.deviceId) || new Date(trade.timestamp) > new Date(deviceMap.get(trade.deviceId).timestamp)) {
                deviceMap.set(trade.deviceId, trade);
            }
        });

        let html = '';
        
        // 모든 거래 기록을 역순으로 표시
        const displayTrades = allTrades.slice().reverse();
        
        displayTrades.forEach((trade, index) => {
            if (index >= 50) return; // 최근 50개만 표시
            
            const timestamp = new Date(trade.timestamp);
            const timeStr = timestamp.toLocaleString('ko-KR', {
                month: 'numeric',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
            
            // 해당 거래가 속한 거래 기록 찾기
            let lastTrade = null;
            if (trade.tradeHistory && trade.tradeHistory.length > 0) {
                lastTrade = trade.tradeHistory[0];
            }
            
            if (lastTrade) {
                const isKorean = this.isKoreanStock(lastTrade.symbol);
                const price = isKorean ? 
                    `₩${(lastTrade.priceUSD * this.exchangeRate).toLocaleString('ko-KR', { maximumFractionDigits: 0 })}` :
                    `$${lastTrade.priceUSD.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
                
                const action = lastTrade.type === 'buy' ? '매수' : '매도';
                const actionClass = lastTrade.type === 'buy' ? 'buy' : 'sell';
                
                html += `
                    <div class="admin-trade-item">
                        <div class="admin-trade-device">${trade.deviceId.substring(0, 15)}</div>
                        <div class="admin-trade-action ${actionClass}">${action}</div>
                        <div class="admin-trade-info">
                            ${lastTrade.symbol} (${lastTrade.name})<br>
                            ${lastTrade.quantity}주 @ ${price}
                        </div>
                        <div class="admin-trade-cash">
                            💰 ${trade.cash.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}₩<br>
                            <small style="color: var(--neutral-text);">${timeStr}</small>
                        </div>
                    </div>
                `;
            }
        });

        adminTradesList.innerHTML = html || '<div class="admin-empty">거래 기록이 없습니다.</div>';
    }

    // 상세 페이지 실시간 업데이트 시작
    startDetailUpdate() {
        if (this.detailUpdateInterval) {
            clearInterval(this.detailUpdateInterval);
        }
        
        this.detailUpdateInterval = setInterval(() => {
            if (this.selectedStock) {
                this.updateStockDetailUI();
            }
        }, 1000);
    }

    // 상세 페이지 실시간 업데이트 중지
    stopDetailUpdate() {
        if (this.detailUpdateInterval) {
            clearInterval(this.detailUpdateInterval);
            this.detailUpdateInterval = null;
        }
    }

    // 상세 페이지 UI 업데이트 (가격, 그래프만 업데이트)
    updateStockDetailUI() {
        const stock = this.stocks.find(s => s.symbol === this.selectedStock);
        if (!stock) return;

        const change = stock.priceUSD - stock.previousCloseUSD;
        const changePercent = (change / stock.previousCloseUSD) * 100;
        const isPositive = change >= 0;
        const priceKRW = stock.priceUSD * this.exchangeRate;

        // 가격 업데이트
        const priceUSDEl = document.querySelector('.price-usd .price');
        const priceKRWEl = document.querySelector('.price-krw .price');
        const changeAmountEl = document.querySelector('.stock-detail-change .change-amount');
        const changePercentEl = document.querySelector('.stock-detail-change .change-percent');
        const modalCurrentPriceEl = document.querySelector('.trade-info p:nth-child(2) strong + *');
        const estimatedCostEl = document.getElementById('detailEstimatedCost');

        if (priceUSDEl) priceUSDEl.textContent = `$${stock.priceUSD.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
        if (priceKRWEl) priceKRWEl.textContent = `₩${priceKRW.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}`;
        
        if (changeAmountEl) {
            changeAmountEl.textContent = `${isPositive ? '+' : ''}${change.toFixed(2)}`;
            changeAmountEl.className = `change-amount ${isPositive ? 'positive' : 'negative'}`;
        }
        
        if (changePercentEl) {
            changePercentEl.textContent = `${isPositive ? '+' : ''}${changePercent.toFixed(2)}%`;
            changePercentEl.className = `change-percent ${isPositive ? 'positive' : 'negative'}`;
        }

        // 예상 금액 업데이트
        this.updateDetailEstimatedCost();

        // 그래프 업데이트
        this.drawChart(stock);
    }

    renderStockDetail() {
        try {
            if (!this.selectedStock) return;

            const stock = this.stocks.find(s => s.symbol === this.selectedStock);
            if (!stock) {
                console.error('Stock not found:', this.selectedStock);
                return;
            }

            const container = document.getElementById('stockDetailContainer');
            if (!container) {
                console.error('Container not found');
                return;
            }

        const change = stock.priceUSD - stock.previousCloseUSD;
        const changePercent = (change / stock.previousCloseUSD) * 100;
        const isPositive = change >= 0;
        const priceKRW = stock.priceUSD * this.exchangeRate;

        const holding = this.portfolio[stock.symbol];
        const holdingQty = holding ? holding.quantity : 0;

        container.innerHTML = `
            <div class="stock-detail">
                <div class="stock-detail-header">
                    <button class="btn-back" id="backBtn">← 돌아가기</button>
                </div>
                
                <div class="stock-detail-top">
                    <div class="stock-detail-info">
                        <h2>${stock.name}</h2>
                        <div class="stock-detail-ticker">${stock.symbol}</div>
                    </div>
                    <div class="stock-detail-prices">
                        <div class="price-usd">
                            <span class="label">USD</span>
                            <span class="price">$${stock.priceUSD.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
                        </div>
                        <div class="price-krw">
                            <span class="label">KRW</span>
                            <span class="price">₩${priceKRW.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}</span>
                        </div>
                    </div>
                </div>

                <div class="stock-detail-change">
                    <span class="change-amount ${isPositive ? 'positive' : 'negative'}">${isPositive ? '+' : ''}${change.toFixed(2)}</span>
                    <span class="change-percent ${isPositive ? 'positive' : 'negative'}">${isPositive ? '+' : ''}${changePercent.toFixed(2)}%</span>
                </div>

                <div class="stock-detail-content">
                    <div class="stock-detail-chart">
                        <canvas id="priceChart" width="600" height="280"></canvas>
                    </div>
                    <div class="stock-detail-trade">
                        <div class="trade-panel">
                            <h3>거래</h3>
                            <div class="trade-info">
                                <p><strong>보유량:</strong> ${holdingQty}주</p>
                                <p><strong>현재가:</strong> $${stock.priceUSD.toLocaleString('en-US', { maximumFractionDigits: 2 })}</p>
                            </div>
                            <div class="quantity-group">
                                <label>거래 수량</label>
                                <div class="quantity-controls">
                                    <button class="btn-qty" id="detailQtyMinusBtn">−</button>
                                    <input type="number" id="detailTradeQuantity" min="1" value="1" class="qty-input">
                                    <button class="btn-qty" id="detailQtyPlusBtn">+</button>
                                </div>
                            </div>
                            <div class="trade-cost">
                                <span>예상 금액</span>
                                <span id="detailEstimatedCost">₩0</span>
                            </div>
                            <div class="trade-buttons">
                                <button id="detailBuyBtn" class="btn btn-buy">매수</button>
                                <button id="detailSellBtn" class="btn btn-sell">매도</button>
                            </div>
                            <div id="detailTradeMessage" class="trade-message"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // 이벤트 리스너 추가
        document.getElementById('backBtn').addEventListener('click', () => {
            this.stopDetailUpdate();
            document.getElementById('stockDetailModal').classList.remove('show');
        });

        document.getElementById('detailQtyMinusBtn').addEventListener('click', () => {
            const input = document.getElementById('detailTradeQuantity');
            let value = parseInt(input.value) || 1;
            input.value = Math.max(1, value - 1);
            this.updateDetailEstimatedCost();
        });

        document.getElementById('detailQtyPlusBtn').addEventListener('click', () => {
            const input = document.getElementById('detailTradeQuantity');
            let value = parseInt(input.value) || 1;
            input.value = value + 1;
            this.updateDetailEstimatedCost();
        });

        document.getElementById('detailTradeQuantity').addEventListener('input', () => this.updateDetailEstimatedCost());

        document.getElementById('detailBuyBtn').addEventListener('click', () => this.buyStockDetail());
        document.getElementById('detailSellBtn').addEventListener('click', () => this.sellStockDetail());

        this.updateDetailEstimatedCost();
        this.drawChart(stock);
        } catch (error) {
            console.error('Error rendering stock detail:', error);
        }
    }

    updateDetailEstimatedCost() {
        const stock = this.stocks.find(s => s.symbol === this.selectedStock);
        const quantity = parseInt(document.getElementById('detailTradeQuantity')?.value) || 1;

        if (stock) {
            const costUSD = stock.priceUSD * quantity;
            const costKRW = costUSD * this.exchangeRate;
            document.getElementById('detailEstimatedCost').textContent = 
                `₩${costKRW.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}`;
        }
    }

    buyStockDetail() {
        const symbol = this.selectedStock;
        const quantity = parseInt(document.getElementById('detailTradeQuantity').value) || 1;
        const stock = this.stocks.find(s => s.symbol === symbol);

        if (!stock || quantity <= 0) {
            this.showDetailTradeError('올바른 수량을 입력해주세요.');
            return;
        }

        const costKRW = stock.priceUSD * quantity * this.exchangeRate;
        const currentCash = this.getCashBalance();

        if (costKRW > currentCash) {
            this.showDetailTradeError('보유 자금이 부족합니다.');
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
        this.showDetailTradeSuccess(`${quantity}주 매수했습니다.`);
        this.renderStockDetail();
        this.render();
    }

    sellStockDetail() {
        const symbol = this.selectedStock;
        const quantity = parseInt(document.getElementById('detailTradeQuantity').value) || 1;
        const stock = this.stocks.find(s => s.symbol === symbol);

        if (!stock || quantity <= 0) {
            this.showDetailTradeError('올바른 수량을 입력해주세요.');
            return;
        }

        const holding = this.portfolio[symbol];
        if (!holding || holding.quantity < quantity) {
            this.showDetailTradeError('보유한 주식이 부족합니다.');
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
        this.showDetailTradeSuccess(`${quantity}주 매도했습니다.`);
        this.renderStockDetail();
        this.render();
    }

    drawChart(stock) {
        // DOM이 렌더링될 때까지 대기
        requestAnimationFrame(() => {
            const canvas = document.getElementById('priceChart');
            if (!canvas) return;

            const ctx = canvas.getContext('2d');
            const priceData = this.priceHistory[stock.symbol];
            
            if (!priceData || priceData.prices.length === 0) return;

            const prices = priceData.prices;
            const startPrice = priceData.startPrice;
            const maxPrice = Math.max(...prices);
            const minPrice = Math.min(...prices);
            const range = maxPrice - minPrice || 1;

            const rect = canvas.getBoundingClientRect();
            canvas.width = rect.width;
            canvas.height = rect.height;

            const width = canvas.width;
            const height = canvas.height;
            const padding = 40;

            // 실제 포인트 간격
            const pointSpacing = prices.length > 1 ? (width - padding * 2) / (prices.length - 1) : 0;

            // 배경
            ctx.fillStyle = '#f9fafb';
            ctx.fillRect(0, 0, width, height);

            // 그리드 라인
            ctx.strokeStyle = '#e5e7eb';
            ctx.lineWidth = 1;
            for (let i = 0; i <= 5; i++) {
                const y = padding + (i * (height - padding * 2) / 5);
                ctx.beginPath();
                ctx.moveTo(padding, y);
                ctx.lineTo(width - padding, y);
                ctx.stroke();
            }

            // 시작 가격 선 (기준선)
            ctx.strokeStyle = '#d1d5db';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            const startY = padding + (height - padding * 2) * (maxPrice - startPrice) / range;
            ctx.beginPath();
            ctx.moveTo(padding, startY);
            ctx.lineTo(width - padding, startY);
            ctx.stroke();
            ctx.setLineDash([]);

            // 가격 곡선 그리기
            ctx.strokeStyle = '#2563eb';
            ctx.lineWidth = 2.5;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();

            prices.forEach((price, index) => {
                const x = padding + (index * pointSpacing);
                const y = padding + (height - padding * 2) * (maxPrice - price) / range;
                
                if (index === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            });

            ctx.stroke();

            // 현재가 포인트 표시
            if (prices.length > 0) {
                const lastPrice = prices[prices.length - 1];
                const lastX = padding + ((prices.length - 1) * pointSpacing);
                const lastY = padding + (height - padding * 2) * (maxPrice - lastPrice) / range;

                ctx.fillStyle = '#2563eb';
                ctx.beginPath();
                ctx.arc(lastX, lastY, 5, 0, 2 * Math.PI);
                ctx.fill();
            }

            // 축 레이블
            ctx.fillStyle = '#6b7280';
            ctx.font = 'bold 12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('시간 흐름 →', width / 2, height - 10);

            ctx.textAlign = 'right';
            ctx.font = '11px sans-serif';
            ctx.fillText(`$${maxPrice.toFixed(2)}`, padding - 5, padding + 10);
            ctx.fillText(`$${minPrice.toFixed(2)}`, padding - 5, height - padding + 10);

            // 기준선 레이블
            ctx.fillStyle = '#9ca3af';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'left';
            ctx.fillText(`기준: $${startPrice.toFixed(2)}`, padding + 5, startY - 5);
        });
    }

    showDetailTradeError(message) {
        const msg = document.getElementById('detailTradeMessage');
        if (msg) {
            msg.textContent = message;
            msg.className = 'trade-message error';
        }
    }

    showDetailTradeSuccess(message) {
        const msg = document.getElementById('detailTradeMessage');
        if (msg) {
            msg.textContent = message;
            msg.className = 'trade-message success';
        }
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

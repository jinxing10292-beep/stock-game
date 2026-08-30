/**
 * 모의 주식 게임
 * 로컬 스토리지를 사용하여 게임 데이터 저장
 */

class StockGame {
    constructor() {
        this.initialBalance = 1000000; // 초기 자금
        this.stocks = []; // 보유 주식 목록
        this.portfolio = {}; // 포트폴리오 {symbol: {quantity, avgPrice, ...}}
        this.availableStocks = []; // 거래 가능한 주식 목록

        this.init();
    }

    init() {
        // 로컬 스토리지에서 데이터 로드
        this.loadGameData();
        this.attachEventListeners();
        this.render();
    }

    // 로컬 스토리지 관리
    loadGameData() {
        const saved = localStorage.getItem('stockGameData');
        if (saved) {
            const data = JSON.parse(saved);
            this.initialBalance = data.initialBalance || this.initialBalance;
            this.stocks = data.stocks || [];
            this.portfolio = data.portfolio || {};
            this.availableStocks = data.availableStocks || [];
        } else {
            this.saveGameData();
        }
    }

    saveGameData() {
        const data = {
            initialBalance: this.initialBalance,
            stocks: this.stocks,
            portfolio: this.portfolio,
            availableStocks: this.availableStocks
        };
        localStorage.setItem('stockGameData', JSON.stringify(data));
    }

    // 주식 추가
    addStock() {
        const nameInput = document.getElementById('stockName');
        const symbolInput = document.getElementById('stockSymbol');
        const priceInput = document.getElementById('stockPrice');
        const errorMsg = document.getElementById('errorMessage');

        const name = nameInput.value.trim();
        const symbol = symbolInput.value.trim().toUpperCase();
        const price = parseFloat(priceInput.value);

        // 유효성 검사
        if (!name || !symbol || !price || price <= 0) {
            this.showError('모든 필드를 올바르게 입력해주세요.');
            return;
        }

        if (this.availableStocks.some(s => s.symbol === symbol)) {
            this.showError('이미 존재하는 종목입니다.');
            return;
        }

        // 주식 추가
        const stock = {
            symbol,
            name,
            price,
            addedDate: new Date().toISOString()
        };

        this.availableStocks.push(stock);
        this.saveGameData();

        // 입력창 초기화
        nameInput.value = '';
        symbolInput.value = '';
        priceInput.value = '';
        errorMsg.classList.remove('show');

        this.render();
        this.showSuccess('주식이 추가되었습니다.');
    }

    // 주식 제거
    deleteStock(symbol) {
        const index = this.availableStocks.findIndex(s => s.symbol === symbol);
        if (index > -1) {
            // 보유 주식이 있으면 제거 불가
            if (this.portfolio[symbol] && this.portfolio[symbol].quantity > 0) {
                this.showError('보유 주식이 있어서 삭제할 수 없습니다.');
                return;
            }

            this.availableStocks.splice(index, 1);
            if (this.portfolio[symbol]) {
                delete this.portfolio[symbol];
            }
            this.saveGameData();
            this.render();
            this.showSuccess('주식이 제거되었습니다.');
        }
    }

    // 거래 모달 열기
    openTradeModal(symbol) {
        const stock = this.availableStocks.find(s => s.symbol === symbol);
        if (!stock) return;

        const modal = document.getElementById('tradeModal');
        document.getElementById('modalTitle').textContent = `${stock.name} 거래`;
        document.getElementById('modalStockName').textContent = `${stock.name} (${symbol})`;
        document.getElementById('modalCurrentPrice').textContent = `₩${stock.price.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}`;

        const holding = this.portfolio[symbol];
        const holdingQty = holding ? holding.quantity : 0;
        document.getElementById('modalHoldingQty').textContent = `${holdingQty}주`;

        document.getElementById('tradeQuantity').value = 1;
        document.getElementById('tradeMessage').textContent = '';
        document.getElementById('tradeMessage').className = 'trade-message';

        // 저장할 심볼 (클로저)
        modal.dataset.currentSymbol = symbol;

        modal.classList.add('show');
    }

    // 거래 모달 닫기
    closeTradeModal() {
        document.getElementById('tradeModal').classList.remove('show');
    }

    // 매수
    buyStock() {
        const symbol = document.getElementById('tradeModal').dataset.currentSymbol;
        const quantity = parseInt(document.getElementById('tradeQuantity').value) || 1;
        const stock = this.availableStocks.find(s => s.symbol === symbol);

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
                name: stock.name
            };
        }

        const holding = this.portfolio[symbol];
        const newQuantity = holding.quantity + quantity;
        const newTotalCost = holding.totalCost + cost;
        const avgPrice = newTotalCost / newQuantity;

        holding.quantity = newQuantity;
        holding.totalCost = newTotalCost;
        holding.avgPrice = avgPrice;

        this.saveGameData();
        this.showTradeSuccess(`${quantity}주 매수했습니다. (총 ₩${cost.toLocaleString()})`);
        this.render();
    }

    // 매도
    sellStock() {
        const symbol = document.getElementById('tradeModal').dataset.currentSymbol;
        const quantity = parseInt(document.getElementById('tradeQuantity').value) || 1;
        const stock = this.availableStocks.find(s => s.symbol === symbol);

        if (!stock || quantity <= 0) {
            this.showTradeError('올바른 수량을 입력해주세요.');
            return;
        }

        const holding = this.portfolio[symbol];
        if (!holding || holding.quantity < quantity) {
            this.showTradeError('보유한 주식이 부족합니다.');
            return;
        }

        const revenue = stock.price * quantity;
        const profit = revenue - (holding.avgPrice * quantity);

        holding.quantity -= quantity;
        holding.totalCost -= holding.avgPrice * quantity;

        if (holding.quantity === 0) {
            delete this.portfolio[symbol];
        }

        this.saveGameData();
        const profitText = profit >= 0 ? `+₩${profit.toLocaleString()}` : `-₩${Math.abs(profit).toLocaleString()}`;
        this.showTradeSuccess(`${quantity}주 매도했습니다. (수익 ${profitText})`);
        this.render();
    }

    // 게임 리셋
    resetGame() {
        if (confirm('게임을 초기화하시겠습니까? 모든 데이터가 삭제됩니다.')) {
            localStorage.removeItem('stockGameData');
            this.initialBalance = 1000000;
            this.stocks = [];
            this.portfolio = {};
            this.availableStocks = [];
            this.saveGameData();
            this.render();
            this.showSuccess('게임이 초기화되었습니다.');
        }
    }

    // 계산 메서드
    getCashBalance() {
        let totalInvested = 0;
        for (const symbol in this.portfolio) {
            const holding = this.portfolio[symbol];
            const stock = this.availableStocks.find(s => s.symbol === symbol);
            if (stock) {
                totalInvested += stock.price * holding.quantity;
            }
        }
        return this.initialBalance - totalInvested;
    }

    getTotalAssets() {
        let total = this.initialBalance;
        for (const symbol in this.portfolio) {
            const holding = this.portfolio[symbol];
            const stock = this.availableStocks.find(s => s.symbol === symbol);
            if (stock) {
                total = total - holding.totalCost + (stock.price * holding.quantity);
            }
        }
        return total;
    }

    getProfitRate() {
        const totalAssets = this.getTotalAssets();
        const profit = totalAssets - this.initialBalance;
        const rate = (profit / this.initialBalance) * 100;
        return rate;
    }

    // UI 렌더링
    render() {
        this.renderBalanceInfo();
        this.renderStocksList();
        this.renderPortfolio();
    }

    renderBalanceInfo() {
        const cash = this.getCashBalance();
        const total = this.getTotalAssets();
        const rate = this.getProfitRate();

        document.getElementById('cashBalance').textContent = `₩${cash.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}`;
        document.getElementById('totalAssets').textContent = `₩${total.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}`;

        const rateEl = document.getElementById('profitRate');
        rateEl.textContent = `${rate.toFixed(2)}%`;
        rateEl.className = 'value';
        if (rate >= 0) {
            rateEl.style.color = '#10b981';
        } else {
            rateEl.style.color = '#ef4444';
        }
    }

    renderStocksList() {
        const container = document.getElementById('stocksList');
        container.innerHTML = '';

        if (this.availableStocks.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>주식을 추가해주세요.</p></div>';
            return;
        }

        this.availableStocks.forEach(stock => {
            const card = document.createElement('div');
            card.className = 'stock-card';

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
                <div class="stock-price">₩${stock.price.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}</div>
                <div style="font-size: 12px; color: #6b7280; margin-bottom: 12px;">
                    보유: ${holdingQty}주 / ₩${holdingValue.toLocaleString()}
                </div>
                <div class="stock-actions">
                    <button class="btn-trade">거래</button>
                    <button class="btn-delete">삭제</button>
                </div>
            `;

            card.querySelector('.btn-trade').addEventListener('click', () => {
                this.openTradeModal(stock.symbol);
            });

            card.querySelector('.btn-delete').addEventListener('click', () => {
                this.deleteStock(stock.symbol);
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
            const stock = this.availableStocks.find(s => s.symbol === symbol);
            if (!stock) return;

            const currentValue = stock.price * holding.quantity;
            const profit = currentValue - holding.totalCost;
            const profitRate = (profit / holding.totalCost) * 100;
            const profitClass = profit >= 0 ? 'profit-positive' : 'profit-negative';
            const profitSign = profit >= 0 ? '+' : '';

            const item = document.createElement('div');
            item.className = 'portfolio-item';
            item.innerHTML = `
                <h4>${holding.name}</h4>
                <div class="portfolio-info">
                    <p><strong>종목코드:</strong> ${symbol}</p>
                    <p><strong>보유량:</strong> ${holding.quantity}주</p>
                    <p><strong>평단가:</strong> ₩${holding.avgPrice.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}</p>
                    <p><strong>현재가:</strong> ₩${stock.price.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}</p>
                    <p><strong>투자금:</strong> ₩${holding.totalCost.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}</p>
                    <p><strong>현재가치:</strong> ₩${currentValue.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}</p>
                    <p><strong>손익:</strong> <span class="${profitClass}">${profitSign}₩${Math.abs(profit).toLocaleString('ko-KR', { maximumFractionDigits: 0 })} (${profitSign}${profitRate.toFixed(2)}%)</span></p>
                </div>
            `;

            container.appendChild(item);
        });
    }

    // 이벤트 리스너
    attachEventListeners() {
        // 주식 추가
        document.getElementById('addStockBtn').addEventListener('click', () => this.addStock());
        document.getElementById('stockPrice').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addStock();
        });

        // 모달 제어
        document.getElementById('closeModalBtn').addEventListener('click', () => this.closeTradeModal());
        document.getElementById('tradeModal').addEventListener('click', (e) => {
            if (e.target.id === 'tradeModal') this.closeTradeModal();
        });

        // 거래 버튼
        document.getElementById('buyBtn').addEventListener('click', () => this.buyStock());
        document.getElementById('sellBtn').addEventListener('click', () => this.sellStock());

        // 게임 리셋
        document.getElementById('resetGameBtn').addEventListener('click', () => this.resetGame());
    }

    // 메시지 표시
    showError(message) {
        const errorMsg = document.getElementById('errorMessage');
        errorMsg.textContent = message;
        errorMsg.classList.add('show');
        setTimeout(() => errorMsg.classList.remove('show'), 4000);
    }

    showSuccess(message) {
        const errorMsg = document.getElementById('errorMessage');
        errorMsg.textContent = message;
        errorMsg.className = 'error-message show';
        errorMsg.style.backgroundColor = '#d1fae5';
        errorMsg.style.color = '#065f46';
        errorMsg.style.borderColor = '#6ee7b7';
        setTimeout(() => errorMsg.classList.remove('show'), 4000);
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

// 게임 초기화
document.addEventListener('DOMContentLoaded', () => {
    new StockGame();
});

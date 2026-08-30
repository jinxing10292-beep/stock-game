class StockGame {
    constructor() {
        this.stocks = [];
        this.portfolio = {};
        this.tradeHistory = [];
        this.currentUser = null;
        this.initialCapital = 10000000;
        this.exchangeRate = 1381.93;
        this.currentTab = 'stocks';
        this.filteredStocks = [];
        this.sortBy = 'name';
        this.searchQuery = '';
        this.selectedStock = null;
        this.stockTypeFilter = 'all';
        this.detailUpdateInterval = null;
        this.adminUpdateInterval = null;
        this.priceUpdateIntervals = new Map();
        
        this.setupAuthListeners();
        this.checkAuthStatus();
    }

    // 인증 상태 확인
    async checkAuthStatus() {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            this.currentUser = session.user;
            await this.loadUserData();
            this.showGameScreen();
        } else {
            this.showAuthScreen();
        }
    }

    // 인증 화면 표시
    showAuthScreen() {
        document.getElementById('authScreen').style.display = 'block';
        document.getElementById('gameScreen').style.display = 'none';
    }

    // 게임 화면 표시
    async showGameScreen() {
        document.getElementById('authScreen').style.display = 'none';
        document.getElementById('gameScreen').style.display = 'block';
        
        await this.init();
    }

    // 로그인/회원가입 폼 전환
    setupAuthListeners() {
        // 로그인 폼
        document.getElementById('loginForm')?.addEventListener('submit', (e) => this.handleLogin(e));
        
        // 회원가입 폼
        document.getElementById('signupForm')?.addEventListener('submit', (e) => this.handleSignup(e));
        
        // 로그아웃
        document.getElementById('logoutBtn')?.addEventListener('click', () => this.handleLogout());
    }

    // 로그인 처리
    async handleLogin(e) {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        
        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password
            });

            if (error) throw error;
            
            this.currentUser = data.session.user;
            await this.loadUserData();
            this.showGameScreen();
            this.showAuthMessage('로그인 성공!', 'success');
        } catch (error) {
            this.showAuthMessage(error.message || '로그인 실패', 'error');
        }
    }

    // 회원가입 처리
    async handleSignup(e) {
        e.preventDefault();
        const username = document.getElementById('signupUsername').value;
        const email = document.getElementById('signupEmail').value;
        const password = document.getElementById('signupPassword').value;
        const passwordConfirm = document.getElementById('signupPasswordConfirm').value;

        if (password !== passwordConfirm) {
            this.showAuthMessage('비밀번호가 일치하지 않습니다', 'error');
            return;
        }

        try {
            // Supabase Auth 회원가입
            const { data, error } = await supabase.auth.signUp({
                email,
                password
            });

            if (error) throw error;

            // 사용자 정보 저장
            const { error: insertError } = await supabase
                .from('users')
                .insert({
                    id: data.user.id,
                    email,
                    username,
                    password_hash: password, // 실제로는 해싱 필요 (Supabase에서 자동 처리)
                    current_cash: this.initialCapital,
                    invested_amount: 0
                });

            if (insertError) throw insertError;

            // 포트폴리오 생성
            const { error: portfolioError } = await supabase
                .from('portfolios')
                .insert({
                    user_id: data.user.id,
                    holdings: {}
                });

            if (portfolioError) throw portfolioError;

            this.showAuthMessage('회원가입 성공! 로그인해주세요', 'success');
            document.getElementById('signupForm').reset();
            switchAuthForm({ preventDefault: () => {} });
        } catch (error) {
            this.showAuthMessage(error.message || '회원가입 실패', 'error');
        }
    }

    // 로그아웃
    async handleLogout() {
        if (confirm('로그아웃하시겠습니까?')) {
            await supabase.auth.signOut();
            this.currentUser = null;
            this.clearGame();
            this.showAuthScreen();
        }
    }

    // 인증 메시지 표시
    showAuthMessage(message, type) {
        const msgEl = document.getElementById('authMessage');
        msgEl.textContent = message;
        msgEl.className = `auth-message show ${type}`;
        setTimeout(() => msgEl.classList.remove('show'), 3000);
    }

    // 사용자 데이터 로드
    async loadUserData() {
        try {
            const { data: userData, error: userError } = await supabase
                .from('users')
                .select('*')
                .eq('id', this.currentUser.id)
                .single();

            if (userError) throw userError;

            this.portfolio = {};
            this.tradeHistory = [];

            // 포트폴리오 로드
            const { data: portfolioData, error: portfolioError } = await supabase
                .from('portfolios')
                .select('holdings')
                .eq('user_id', this.currentUser.id)
                .single();

            if (portfolioError && portfolioError.code !== 'PGRST116') throw portfolioError;
            if (portfolioData) this.portfolio = portfolioData.holdings || {};

            // 거래 기록 로드
            const { data: tradeData, error: tradeError } = await supabase
                .from('trades')
                .select('*')
                .eq('user_id', this.currentUser.id)
                .order('timestamp', { ascending: false });

            if (tradeError) throw tradeError;
            this.tradeHistory = tradeData || [];

        } catch (error) {
            console.error('Error loading user data:', error);
        }
    }

    // 게임 초기화
    async init() {
        await this.loadStocks();
        this.attachEventListeners();
        this.startPriceUpdates();
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

    // 가격 업데이트 시작
    startPriceUpdates() {
        this.stocks.forEach(stock => {
            const interval = this.getUpdateInterval(stock.priceUSD);
            this.scheduleStockUpdate(stock, interval);
        });
    }

    // 개별 주식 업데이트 스케줄
    scheduleStockUpdate(stock, interval) {
        if (this.priceUpdateIntervals.has(stock.symbol)) {
            clearInterval(this.priceUpdateIntervals.get(stock.symbol));
        }

        const updateInterval = setInterval(() => {
            const changePercent = (Math.random() - 0.5) * 2;
            stock.priceUSD = Math.max(stock.priceUSD * (1 + changePercent / 100), 0.01);
            
            this.renderStocksList();
            
            const newInterval = this.getUpdateInterval(stock.priceUSD);
            if (newInterval !== interval) {
                this.scheduleStockUpdate(stock, newInterval);
            }
        }, interval);

        this.priceUpdateIntervals.set(stock.symbol, updateInterval);
    }

    // 업데이트 간격 결정
    getUpdateInterval(price) {
        if (price >= 350 || price * this.exchangeRate >= 300000) {
            return Math.random() * 800 + 100;
        }
        return 1000;
    }

    // 이벤트 리스너 부착
    attachEventListeners() {
        // 탭 네비게이션
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (e.target.id !== 'adminBtn') {
                    this.switchTab(e.target.dataset.tab);
                }
            });
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

        // 검색
        document.getElementById('searchInput')?.addEventListener('input', (e) => {
            this.searchQuery = e.target.value;
            this.filterAndSortStocks();
        });

        // 정렬
        document.getElementById('sortSelect')?.addEventListener('change', (e) => {
            this.sortBy = e.target.value;
            this.filterAndSortStocks();
        });

        // 테마 토글
        document.getElementById('themeToggle')?.addEventListener('click', () => this.toggleTheme());

        // 상세 모달
        document.getElementById('stockDetailModal')?.addEventListener('click', (e) => {
            if (e.target === document.getElementById('stockDetailModal') || e.target.classList.contains('modal-overlay')) {
                document.getElementById('stockDetailModal').classList.remove('show');
                this.stopDetailUpdate();
            }
        });

        // 어드민 버튼
        document.getElementById('adminBtn')?.addEventListener('click', () => {
            this.showAdminPassword();
        });

        // 어드민 비밀번호
        document.getElementById('adminPasswordBtn')?.addEventListener('click', () => {
            this.checkAdminPassword();
        });

        document.getElementById('adminPassword')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.checkAdminPassword();
            }
        });

        document.getElementById('adminPasswordCancelBtn')?.addEventListener('click', () => {
            document.getElementById('adminModal').classList.remove('show');
            document.getElementById('adminPassword').value = '';
        });

        document.getElementById('adminModal')?.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-overlay')) {
                document.getElementById('adminModal').classList.remove('show');
                if (this.adminUpdateInterval) {
                    clearInterval(this.adminUpdateInterval);
                }
            }
        });

        document.getElementById('closeAdminBtn')?.addEventListener('click', () => {
            document.getElementById('adminModal').classList.remove('show');
            if (this.adminUpdateInterval) {
                clearInterval(this.adminUpdateInterval);
            }
        });
    }

    // 탭 전환
    switchTab(tab) {
        this.currentTab = tab;
        document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
        document.getElementById(`${tab}-tab`).classList.add('active');
        this.render();
    }

    // 테마 토글
    toggleTheme() {
        document.body.classList.toggle('dark-mode');
        localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
    }

    // 주식 필터 및 정렬
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
        return /^\d+$/.test(symbol);
    }

    // 주식 목록 렌더링
    renderStocksList() {
        const container = document.getElementById('stocksList');
        if (!container) return;

        container.innerHTML = this.filteredStocks.map(stock => {
            const change = stock.priceUSD - stock.previousCloseUSD;
            const changePercent = (change / stock.previousCloseUSD) * 100;
            const isPositive = change >= 0;
            const priceKRW = stock.priceUSD * this.exchangeRate;

            return `
                <div class="stock-row" onclick="game.openStockDetail('${stock.symbol}')">
                    <div class="stock-header">
                        <div class="stock-info">
                            <span class="stock-symbol">${stock.symbol}</span>
                            <span class="stock-name">${stock.name}</span>
                        </div>
                        <div class="stock-price">
                            <span class="price-usd">$${stock.priceUSD.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
                            <span class="price-krw">₩${priceKRW.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}</span>
                        </div>
                    </div>
                    <div class="stock-change ${isPositive ? 'positive' : 'negative'}">
                        <span>${isPositive ? '+' : ''}${change.toFixed(2)}</span>
                        <span>${isPositive ? '+' : ''}${changePercent.toFixed(2)}%</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    // 포트폴리오 렌더링
    renderPortfolio() {
        const container = document.getElementById('portfolioContent');
        if (!container) return;

        const holdings = Object.entries(this.portfolio).map(([symbol, holding]) => {
            const stock = this.stocks.find(s => s.symbol === symbol);
            if (!stock) return '';

            const currentValue = stock.priceUSD * this.exchangeRate * holding.quantity;
            const profit = currentValue - holding.totalCostKRW;
            const profitPercent = (profit / holding.totalCostKRW) * 100;
            const isPositive = profit >= 0;

            return `
                <div class="portfolio-item">
                    <div class="portfolio-stock">
                        <span class="stock-symbol">${symbol}</span>
                        <span class="stock-name">${holding.name}</span>
                    </div>
                    <div class="portfolio-quantity">${holding.quantity}주</div>
                    <div class="portfolio-cost">₩${holding.totalCostKRW.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}</div>
                    <div class="portfolio-value">₩${currentValue.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}</div>
                    <div class="portfolio-profit ${isPositive ? 'positive' : 'negative'}">
                        ${isPositive ? '+' : ''}₩${profit.toLocaleString('ko-KR', { maximumFractionDigits: 0 })} (${isPositive ? '+' : ''}${profitPercent.toFixed(2)}%)
                    </div>
                </div>
            `;
        }).filter(x => x);

        container.innerHTML = holdings.length > 0 ? 
            holdings.join('') : 
            '<p class="empty-state">아직 보유한 주식이 없습니다.</p>';
    }

    // 거래 기록 렌더링
    renderTradeHistory() {
        const container = document.getElementById('historyContent');
        if (!container) return;

        container.innerHTML = this.tradeHistory.map(trade => {
            const date = new Date(trade.timestamp).toLocaleString('ko-KR');
            const type = trade.type === 'buy' ? '매수' : '매도';
            const typeClass = trade.type === 'buy' ? 'buy' : 'sell';
            const amount = trade.type === 'buy' ? trade.costKRW : trade.revenueKRW;
            const profit = trade.profit_krw || 0;

            return `
                <div class="history-item">
                    <div class="history-type ${typeClass}">${type}</div>
                    <div class="history-stock">${trade.symbol} (${trade.name})</div>
                    <div class="history-quantity">${trade.quantity}주</div>
                    <div class="history-price">₩${trade.price_krw.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}</div>
                    <div class="history-amount">₩${amount.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}</div>
                    ${profit ? `<div class="history-profit">${profit > 0 ? '+' : ''}₩${profit.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}</div>` : ''}
                    <div class="history-date">${date}</div>
                </div>
            `;
        }).join('') || '<p class="empty-state">거래 기록이 없습니다.</p>';
    }

    // 자산 정보 렌더링
    render() {
        this.renderBalanceInfo();
        
        if (this.currentTab === 'stocks') {
            this.renderStocksList();
        } else if (this.currentTab === 'portfolio') {
            this.renderPortfolio();
        } else if (this.currentTab === 'history') {
            this.renderTradeHistory();
        }
    }

    // 자산 정보 렌더링
    renderBalanceInfo() {
        const totalInvested = Object.values(this.portfolio).reduce((sum, h) => sum + h.totalCostKRW, 0);
        const totalStockValue = Object.entries(this.portfolio).reduce((sum, [symbol, holding]) => {
            const stock = this.stocks.find(s => s.symbol === symbol);
            return sum + (stock ? stock.priceUSD * this.exchangeRate * holding.quantity : 0);
        }, 0);

        const cash = this.initialCapital - totalInvested;
        const totalAssets = cash + totalStockValue;
        const totalProfit = totalAssets - this.initialCapital;
        const totalProfitRate = (totalProfit / this.initialCapital) * 100;

        document.getElementById('totalAssets').textContent = `₩${totalAssets.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}`;
        document.getElementById('totalChange').textContent = `${totalProfitRate >= 0 ? '+' : ''}${totalProfitRate.toFixed(2)}%`;
        document.getElementById('totalChange').className = `asset-change ${totalProfitRate >= 0 ? 'positive' : 'negative'}`;
        
        document.getElementById('cashBalance').textContent = `₩${cash.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}`;
        document.getElementById('investedAmount').textContent = `₩${totalInvested.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}`;
        document.getElementById('exchangeRateDisplay').textContent = `₩${this.exchangeRate.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}`;
    }

    // 주식 상세 페이지 열기
    openStockDetail(symbol) {
        this.selectedStock = symbol;
        const modal = document.getElementById('stockDetailModal');
        if (!modal) return;
        
        modal.classList.add('show');
        this.renderStockDetail();
        this.startDetailUpdate();
    }

    // 주식 상세 페이지 렌더링
    renderStockDetail() {
        const stock = this.stocks.find(s => s.symbol === this.selectedStock);
        if (!stock) return;

        const container = document.getElementById('stockDetailContainer');
        const change = stock.priceUSD - stock.previousCloseUSD;
        const changePercent = (change / stock.previousCloseUSD) * 100;
        const isPositive = change >= 0;
        const priceKRW = stock.priceUSD * this.exchangeRate;
        const holding = this.portfolio[stock.symbol] || { quantity: 0, totalCostKRW: 0 };

        container.innerHTML = `
            <div class="stock-detail-header">
                <button class="btn-back" id="backBtn">← 뒤로</button>
                <h2>${stock.symbol} - ${stock.name}</h2>
            </div>

            <div class="stock-detail-price">
                <div class="price-usd">
                    <span class="label">USD</span>
                    <span class="price">$${stock.priceUSD.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
                </div>
                <div class="price-krw">
                    <span class="label">KRW</span>
                    <span class="price">₩${priceKRW.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}</span>
                </div>
            </div>

            <div class="stock-detail-change">
                <span class="change-amount ${isPositive ? 'positive' : 'negative'}">${isPositive ? '+' : ''}${change.toFixed(2)}</span>
                <span class="change-percent ${isPositive ? 'positive' : 'negative'}">${isPositive ? '+' : ''}${changePercent.toFixed(2)}%</span>
            </div>

            <div class="stock-detail-chart">
                <canvas id="chartCanvas" width="300" height="150"></canvas>
            </div>

            <div class="stock-detail-info">
                <div class="info-item">
                    <span class="label">보유량</span>
                    <span class="value">${holding.quantity}주</span>
                </div>
                <div class="info-item">
                    <span class="label">매입금액</span>
                    <span class="value">₩${holding.totalCostKRW.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}</span>
                </div>
            </div>

            <div class="trade-form">
                <div class="quantity-group">
                    <label>수량</label>
                    <div class="quantity-controls">
                        <button class="btn-qty" id="detailQtyMinus">−</button>
                        <input type="number" id="detailQuantity" min="1" value="1" class="qty-input">
                        <button class="btn-qty" id="detailQtyPlus">+</button>
                    </div>
                </div>

                <div class="trade-cost">
                    <span>예상 금액</span>
                    <span id="detailEstimatedCost">₩0</span>
                </div>

                <div class="trade-buttons">
                    <button class="btn btn-buy" id="detailBuyBtn">매수</button>
                    <button class="btn btn-sell" id="detailSellBtn">매도</button>
                </div>
            </div>
        `;

        // 이벤트 리스너 추가
        document.getElementById('backBtn').addEventListener('click', () => {
            this.stopDetailUpdate();
            document.getElementById('stockDetailModal').classList.remove('show');
        });

        document.getElementById('detailQtyMinus')?.addEventListener('click', () => {
            const input = document.getElementById('detailQuantity');
            input.value = Math.max(1, parseInt(input.value) - 1);
            this.updateDetailEstimatedCost();
        });

        document.getElementById('detailQtyPlus')?.addEventListener('click', () => {
            const input = document.getElementById('detailQuantity');
            input.value = parseInt(input.value) + 1;
            this.updateDetailEstimatedCost();
        });

        document.getElementById('detailQuantity')?.addEventListener('input', () => {
            this.updateDetailEstimatedCost();
        });

        document.getElementById('detailBuyBtn')?.addEventListener('click', () => this.buyStockDetail());
        document.getElementById('detailSellBtn')?.addEventListener('click', () => this.sellStockDetail());

        this.drawChart(stock);
        this.updateDetailEstimatedCost();
    }

    // 상세 페이지 예상 금액 업데이트
    updateDetailEstimatedCost() {
        const stock = this.stocks.find(s => s.symbol === this.selectedStock);
        if (!stock) return;

        const quantity = parseInt(document.getElementById('detailQuantity')?.value) || 1;
        const costKRW = stock.priceUSD * quantity * this.exchangeRate;

        const el = document.getElementById('detailEstimatedCost');
        if (el) {
            el.textContent = `₩${costKRW.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}`;
        }
    }

    // 상세 페이지 매수
    async buyStockDetail() {
        const stock = this.stocks.find(s => s.symbol === this.selectedStock);
        const quantity = parseInt(document.getElementById('detailQuantity')?.value) || 1;

        if (!stock || quantity <= 0) {
            this.showDetailTradeError('올바른 수량을 입력해주세요.');
            return;
        }

        const costKRW = stock.priceUSD * quantity * this.exchangeRate;
        const totalInvested = Object.values(this.portfolio).reduce((sum, h) => sum + h.totalCostKRW, 0);
        const cash = this.initialCapital - totalInvested;

        if (costKRW > cash) {
            this.showDetailTradeError('보유 자금이 부족합니다.');
            return;
        }

        try {
            if (!this.portfolio[stock.symbol]) {
                this.portfolio[stock.symbol] = {
                    quantity: 0,
                    totalCostKRW: 0,
                    name: stock.name,
                    symbol: stock.symbol
                };
            }

            const holding = this.portfolio[stock.symbol];
            holding.quantity += quantity;
            holding.totalCostKRW += costKRW;

            // Supabase에 거래 기록 저장
            const { error } = await supabase.from('trades').insert({
                user_id: this.currentUser.id,
                type: 'buy',
                symbol: stock.symbol,
                name: stock.name,
                quantity: quantity,
                price_usd: stock.priceUSD,
                price_krw: stock.priceUSD * this.exchangeRate,
                cost_krw: costKRW
            });

            if (error) throw error;

            // 포트폴리오 업데이트
            await supabase
                .from('portfolios')
                .update({ holdings: this.portfolio })
                .eq('user_id', this.currentUser.id);

            // 현금 업데이트
            const newCash = cash - costKRW;
            await supabase
                .from('users')
                .update({
                    current_cash: newCash,
                    invested_amount: Object.values(this.portfolio).reduce((sum, h) => sum + h.totalCostKRW, 0)
                })
                .eq('id', this.currentUser.id);

            this.showDetailTradeSuccess(`${quantity}주 매수했습니다.`);
            this.render();
            document.getElementById('detailQuantity').value = 1;
            this.updateDetailEstimatedCost();
        } catch (error) {
            this.showDetailTradeError('거래 실패: ' + error.message);
        }
    }

    // 상세 페이지 매도
    async sellStockDetail() {
        const stock = this.stocks.find(s => s.symbol === this.selectedStock);
        const quantity = parseInt(document.getElementById('detailQuantity')?.value) || 1;

        if (!stock || quantity <= 0) {
            this.showDetailTradeError('올바른 수량을 입력해주세요.');
            return;
        }

        const holding = this.portfolio[stock.symbol];
        if (!holding || holding.quantity < quantity) {
            this.showDetailTradeError('보유한 주식이 부족합니다.');
            return;
        }

        try {
            const avgPriceKRW = holding.totalCostKRW / holding.quantity;
            const revenueKRW = stock.priceUSD * quantity * this.exchangeRate;
            const profitKRW = revenueKRW - (avgPriceKRW * quantity);

            holding.quantity -= quantity;
            holding.totalCostKRW -= avgPriceKRW * quantity;

            if (holding.quantity === 0) {
                delete this.portfolio[stock.symbol];
            }

            // Supabase에 거래 기록 저장
            const { error } = await supabase.from('trades').insert({
                user_id: this.currentUser.id,
                type: 'sell',
                symbol: stock.symbol,
                name: stock.name,
                quantity: quantity,
                price_usd: stock.priceUSD,
                price_krw: stock.priceUSD * this.exchangeRate,
                revenue_krw: revenueKRW,
                profit_krw: profitKRW
            });

            if (error) throw error;

            // 포트폴리오 업데이트
            await supabase
                .from('portfolios')
                .update({ holdings: this.portfolio })
                .eq('user_id', this.currentUser.id);

            // 현금 업데이트
            const totalInvested = Object.values(this.portfolio).reduce((sum, h) => sum + h.totalCostKRW, 0);
            const newCash = this.initialCapital - totalInvested;

            await supabase
                .from('users')
                .update({
                    current_cash: newCash,
                    invested_amount: totalInvested
                })
                .eq('id', this.currentUser.id);

            this.showDetailTradeSuccess(`${quantity}주 매도했습니다.`);
            this.render();
            document.getElementById('detailQuantity').value = 1;
            this.updateDetailEstimatedCost();
        } catch (error) {
            this.showDetailTradeError('거래 실패: ' + error.message);
        }
    }

    // 차트 그리기
    drawChart(stock) {
        const canvas = document.getElementById('chartCanvas');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        // 배경
        ctx.fillStyle = '#f8f9fa';
        ctx.fillRect(0, 0, width, height);

        // 그리드
        ctx.strokeStyle = '#e0e0e0';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 10; i++) {
            const y = (height / 10) * i;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }

        // 샘플 데이터로 차트 표시 (실제로는 가격 히스토리 필요)
        const change = stock.priceUSD - stock.previousCloseUSD;
        const isPositive = change >= 0;

        ctx.strokeStyle = isPositive ? '#22c55e' : '#ef4444';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, isPositive ? height / 3 : (height * 2 / 3));
        ctx.stroke();
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

    // 상세 페이지 UI 업데이트
    updateStockDetailUI() {
        const stock = this.stocks.find(s => s.symbol === this.selectedStock);
        if (!stock) return;

        const change = stock.priceUSD - stock.previousCloseUSD;
        const changePercent = (change / stock.previousCloseUSD) * 100;
        const isPositive = change >= 0;
        const priceKRW = stock.priceUSD * this.exchangeRate;

        const priceUSDEl = document.querySelector('.price-usd .price');
        const priceKRWEl = document.querySelector('.price-krw .price');
        const changeAmountEl = document.querySelector('.stock-detail-change .change-amount');
        const changePercentEl = document.querySelector('.stock-detail-change .change-percent');

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

        this.updateDetailEstimatedCost();
        this.drawChart(stock);
    }

    // 어드민 비밀번호 화면
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
        if (password === '18123') {
            document.getElementById('adminPasswordScreen').style.display = 'none';
            document.getElementById('adminTradesScreen').style.display = 'flex';
            this.showAdminPage();
        } else {
            alert('비밀번호가 틀렸습니다.');
            document.getElementById('adminPassword').value = '';
        }
    }

    // 어드민 페이지 표시
    showAdminPage() {
        this.updateAdminTradesList();
        
        if (this.adminUpdateInterval) {
            clearInterval(this.adminUpdateInterval);
        }
        
        this.adminUpdateInterval = setInterval(() => {
            this.updateAdminTradesList();
        }, 2000);
    }

    // 어드민 거래 목록 업데이트 (Supabase에서 모든 거래 조회)
    async updateAdminTradesList() {
        const adminTradesList = document.getElementById('adminTradesList');
        if (!adminTradesList) return;

        try {
            // 모든 거래 조회 (최신 50개)
            const { data: trades, error } = await supabase
                .from('trades')
                .select('*, users(username, current_cash)')
                .order('timestamp', { ascending: false })
                .limit(50);

            if (error) throw error;

            if (!trades || trades.length === 0) {
                adminTradesList.innerHTML = '<div class="admin-empty">거래 기록이 없습니다.</div>';
                return;
            }

            let html = '';
            trades.forEach(trade => {
                const timestamp = new Date(trade.timestamp).toLocaleString('ko-KR', {
                    month: 'numeric',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });

                const type = trade.type === 'buy' ? '매수' : '매도';
                const typeClass = trade.type === 'buy' ? 'buy' : 'sell';
                const username = trade.users?.username || '사용자';
                const cash = trade.users?.current_cash || 0;

                html += `
                    <div class="admin-trade-item">
                        <div class="admin-trade-device">${username}</div>
                        <div class="admin-trade-action ${typeClass}">${type}</div>
                        <div class="admin-trade-info">
                            ${trade.symbol} (${trade.name})<br>
                            ${trade.quantity}주 @ ₩${trade.price_krw.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}
                        </div>
                        <div class="admin-trade-cash">
                            💰 ${cash.toLocaleString('ko-KR', { maximumFractionDigits: 0 })}₩<br>
                            <small style="color: var(--neutral-text);">${timestamp}</small>
                        </div>
                    </div>
                `;
            });

            adminTradesList.innerHTML = html;
        } catch (error) {
            console.error('Error loading admin trades:', error);
        }
    }

    // 게임 정리
    clearGame() {
        this.stocks = [];
        this.portfolio = {};
        this.tradeHistory = [];
        this.priceUpdateIntervals.forEach(interval => clearInterval(interval));
        this.priceUpdateIntervals.clear();
        if (this.detailUpdateInterval) clearInterval(this.detailUpdateInterval);
        if (this.adminUpdateInterval) clearInterval(this.adminUpdateInterval);
    }

    // 알림
    showNotification(message, type = 'success') {
        console.log(`[${type}] ${message}`);
    }

    showDetailTradeError(message) {
        alert(message);
    }

    showDetailTradeSuccess(message) {
        this.showNotification(message, 'success');
    }
}

// 전역 함수들
function switchAuthForm(e) {
    e.preventDefault();
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    
    loginForm.classList.toggle('active');
    signupForm.classList.toggle('active');
}

// 게임 초기화
let game;
document.addEventListener('DOMContentLoaded', () => {
    game = new StockGame();
});

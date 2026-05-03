// --- STATE & CONSTANTS ---
const API_BASE = 'http://127.0.0.1:8000/api';
let currentUser = null;

// DOM Elements
const authScreen = document.getElementById('auth-screen');
const appScreen = document.getElementById('app');
const loginForm = document.getElementById('login-form');
const authAlert = document.getElementById('auth-alert');
const navLinks = document.querySelectorAll('.nav-link');
const views = document.querySelectorAll('.view-container');
const viewTitle = document.getElementById('current-view-title');

// APP INITIALIZATION
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    setupThemeToggle();
    document.getElementById('logout-btn').addEventListener('click', logout);
    
    // Setup Navigation
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const target = link.getAttribute('data-target');
            if(currentUser && currentUser.role.toLowerCase() !== 'admin' && currentUser.role.toLowerCase() !== 'owner' && link.classList.contains('admin-only')) {
                alert("Access Denied.");
                return;
            }
            switchView(target, link);
        });
    });

    // Form Submissions
    loginForm.addEventListener('submit', handleLogin);
});

// --- AUTHENTICATION ---
function checkAuth() {
    const saved = localStorage.getItem('erp_user');
    if (saved) {
        currentUser = JSON.parse(saved);
        showApp();
    } else {
        showAuth();
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    try {
        const res = await fetch(`${API_BASE}/login`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({email, password})
        });
        
        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.detail || 'Login failed');
        }
        
        const user = await res.json();
        localStorage.setItem('erp_user', JSON.stringify(user));
        currentUser = user;
        showApp();
    } catch (error) {
        authAlert.textContent = error.message;
        authAlert.style.display = 'block';
    }
}

function logout() {
    localStorage.removeItem('erp_user');
    currentUser = null;
    showAuth();
}

function showAuth() {
    authScreen.style.display = 'flex';
    appScreen.style.display = 'none';
}

function showApp() {
    authScreen.style.display = 'none';
    appScreen.style.display = 'flex';
    
    document.getElementById('user-display-name').textContent = `Hello, ${currentUser.name}`;
    document.getElementById('user-role-badge').textContent = currentUser.role;
    
    // Apply RBAC UI
    const isAdmin = ['admin', 'owner'].includes(currentUser.role.toLowerCase());
    document.querySelectorAll('.admin-only').forEach(el => {
        el.style.display = isAdmin ? '' : 'none';
    });

    switchView(isAdmin ? 'dashboard' : 'pos', isAdmin ? navLinks[0] : navLinks[1]);
}

// --- UTILS ---
function authHeaders() {
    return {
        'Content-Type': 'application/json',
        'x-user-id': currentUser.id.toString()
    };
}

function switchView(target, targetLinkElement) {
    // Hide all
    views.forEach(v => v.classList.remove('active'));
    navLinks.forEach(l => l.classList.remove('active'));
    
    // Show target
    document.getElementById(`view-${target}`).classList.add('active');
    if (targetLinkElement) {
        targetLinkElement.classList.add('active');
        viewTitle.textContent = targetLinkElement.textContent.trim();
    }
    
    // Fire specific load functions
    if(target === 'dashboard') loadDashboard();
    if(target === 'medicines') loadMedicines();
    if(target === 'staff') loadStaff();
    if(target === 'pos') initPOS();
    if(target === 'purchases') initPurchases();
    if(target === 'returns') initReturns();
    if(target === 'suppliers') loadSuppliers();
    if(target === 'customers') loadCustomers();
}

function setupThemeToggle() {
    const btn = document.getElementById('theme-toggle');
    btn.addEventListener('click', () => {
        const doc = document.documentElement;
        if(doc.getAttribute('data-theme') === 'dark') {
            doc.setAttribute('data-theme', 'light');
        } else {
            doc.setAttribute('data-theme', 'dark');
        }
    });
}

function formatMoney(amount) {
    return `EGP ${parseFloat(amount).toFixed(2)}`;
}

// --- DASHBOARD LAYER ---
let dailyChartInstance = null;
let monthlyChartInstance = null;
let breakdownChartInstance = null;
let topSellersChartInstance = null;

function getChartColors() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    return {
        gridColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
        textColor: isDark ? '#94a3b8' : '#64748b',
        cyan: '#00d0ff',
        cyanBg: 'rgba(0, 208, 255, 0.15)',
        green: '#00e58d',
        greenBg: 'rgba(0, 229, 141, 0.15)',
        purple: '#a259ff',
        purpleBg: 'rgba(162, 89, 255, 0.15)',
        orange: '#ffb300',
        orangeBg: 'rgba(255, 179, 0, 0.15)',
        pink: '#ff3366',
        pinkBg: 'rgba(255, 51, 102, 0.15)',
    };
}

async function loadDashboard() {
    try {
        const res = await fetch(`${API_BASE}/dashboard/stats`, { headers: authHeaders() });
        const data = await res.json();
        
        // Stat Cards
        document.getElementById('dash-revenue').textContent = formatMoney(data.revenue_today);
        document.getElementById('dash-profit').textContent = formatMoney(data.profit_today);
        document.getElementById('dash-cogs').textContent = formatMoney(data.cost_of_goods || 0);
        document.getElementById('dash-discount').textContent = formatMoney(data.total_discount || 0);
        document.getElementById('dash-invoices-count').textContent = data.invoices_today;
        document.getElementById('dash-items-sold').textContent = data.total_items_sold || 0;
        
        // Low Stock
        const lsTbody = document.getElementById('dash-low-stock-table');
        lsTbody.innerHTML = data.alerts.low_stock.map(m => `
            <tr>
                <td>${m.name}</td>
                <td style="color:var(--danger); font-weight:bold;">${m.quantity}</td>
                <td>${m.min_stock_level}</td>
            </tr>
        `).join('') || '<tr><td colspan="3" style="text-align:center;padding:24px;color:var(--text-secondary);font-size:13px;">No low stock items 🎉</td></tr>';

        // Expirations
        const expTbody = document.getElementById('dash-expiry-table');
        expTbody.innerHTML = data.alerts.expiring_soon.map(b => `
            <tr>
                <td>${b.batch_number}</td>
                <td>ID: ${b.medicine_id}</td>
                <td style="color:var(--warning); font-weight:bold;">${b.expiry_date}</td>
            </tr>
        `).join('') || '<tr><td colspan="3" style="text-align:center;padding:24px;color:var(--text-secondary);font-size:13px;">No expiring batches 🎉</td></tr>';
        
        // Recent Sales
        const rsTbody = document.getElementById('dash-recent-sales-table');
        if(rsTbody) {
            rsTbody.innerHTML = data.recent_sales.map(s => `
                <tr>
                    <td>#${s.id}</td>
                    <td style="font-weight:bold;">${formatMoney(s.total_price)}</td>
                    <td><span class="badge badge-success">${s.pharmacist}</span></td>
                    <td>${s.time}</td>
                    <td><button class="btn btn-outline" style="padding: 4px 8px; font-size: 12px;" onclick="viewSaleDetails(${s.id})">Details</button></td>
                </tr>
            `).join('') || '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-secondary);font-size:13px;">No sales yet today</td></tr>';
        }
        
        // Recent Returns
        const rrTbody = document.getElementById('dash-recent-returns-table');
        if(rrTbody && data.recent_returns) {
            rrTbody.innerHTML = data.recent_returns.map(r => `
                <tr>
                    <td>#${r.sale_id}</td>
                    <td style="font-weight:500;">${r.medicine_name}</td>
                    <td style="text-align:center;">${r.quantity}</td>
                    <td style="color:var(--danger); font-weight:bold;">${formatMoney(r.refund_amount)}</td>
                    <td style="font-size: 12px; color: var(--text-secondary);">${r.date}</td>
                </tr>
            `).join('') || '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-secondary);font-size:13px;">No returns</td></tr>';
        }

        // --- Build Breakdown Doughnut ---
        renderBreakdownChart(data);
        
        // --- Build Top Sellers Chart ---
        renderTopSellersChart(data.top_sellers || []);
        
        // Load daily/monthly reports
        loadDashboardReports();
        
        lucide.createIcons();
    } catch(e) {
        console.error(e);
    }
}

function renderBreakdownChart(data) {
    const ctx = document.getElementById('today-breakdown-chart');
    if(!ctx) return;
    if(breakdownChartInstance) breakdownChartInstance.destroy();
    
    const c = getChartColors();
    const revenue = parseFloat(data.revenue_today) || 0;
    const cogs = parseFloat(data.cost_of_goods) || 0;
    const profit = parseFloat(data.profit_today) || 0;
    const discount = parseFloat(data.total_discount) || 0;
    
    const hasData = revenue > 0 || cogs > 0 || discount > 0;
    
    breakdownChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: hasData ? ['Revenue', 'Cost of Goods', 'Discounts'] : ['No Data'],
            datasets: [{
                data: hasData ? [revenue, cogs, discount] : [1],
                backgroundColor: hasData ? [c.cyan, c.purple, c.orange] : ['rgba(100,100,100,0.15)'],
                borderColor: hasData ? [c.cyan, c.purple, c.orange] : ['rgba(100,100,100,0.3)'],
                borderWidth: 2,
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: c.textColor,
                        padding: 16,
                        usePointStyle: true,
                        pointStyleWidth: 10,
                        font: { size: 12, family: 'Inter' }
                    }
                }
            }
        }
    });
}

function renderTopSellersChart(topSellers) {
    const ctx = document.getElementById('top-sellers-chart');
    if(!ctx) return;
    if(topSellersChartInstance) topSellersChartInstance.destroy();
    
    const c = getChartColors();
    const labels = topSellers.map(s => s.name);
    const values = topSellers.map(s => s.qty);
    const colors = [c.cyan, c.green, c.purple, c.orange, c.pink];
    
    topSellersChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels.length ? labels : ['No data'],
            datasets: [{
                label: 'Qty Sold',
                data: values.length ? values : [0],
                backgroundColor: labels.length ? colors.slice(0, labels.length) : ['rgba(100,100,100,0.15)'],
                borderColor: labels.length ? colors.slice(0, labels.length) : ['rgba(100,100,100,0.3)'],
                borderWidth: 2,
                borderRadius: 8,
                barPercentage: 0.6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            scales: {
                x: {
                    grid: { color: c.gridColor },
                    ticks: { color: c.textColor, font: { family: 'Inter' } }
                },
                y: {
                    grid: { display: false },
                    ticks: { color: c.textColor, font: { family: 'Inter', weight: 500 } }
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

async function loadDashboardReports() {
    try {
        const res = await fetch(`${API_BASE}/dashboard/reports`, { headers: authHeaders() });
        if(!res.ok) return;
        const data = await res.json();
        const c = getChartColors();
        
        // --- Daily Revenue Bar Chart ---
        const dailyCtx = document.getElementById('daily-sales-chart');
        if(dailyCtx) {
            if(dailyChartInstance) dailyChartInstance.destroy();
            const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
            const labels = Array.from({length: daysInMonth}, (_, i) => i + 1);
            const dataPts = new Array(daysInMonth).fill(0);
            data.daily.forEach(d => { dataPts[d.day - 1] = d.revenue; });
            
            dailyChartInstance = new Chart(dailyCtx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Revenue (EGP)',
                        data: dataPts,
                        backgroundColor: dataPts.map((v, i) => {
                            const today = new Date().getDate();
                            return i + 1 === today ? c.cyan : c.cyanBg;
                        }),
                        borderColor: c.cyan,
                        borderWidth: 0,
                        borderRadius: 6,
                        barPercentage: 0.7
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            grid: { color: c.gridColor },
                            ticks: {
                                color: c.textColor,
                                font: { family: 'Inter' },
                                callback: v => 'EGP ' + v
                            }
                        },
                        x: {
                            grid: { display: false },
                            ticks: { color: c.textColor, font: { family: 'Inter', size: 11 } }
                        }
                    },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: 'rgba(0,0,0,0.8)',
                            titleFont: { family: 'Inter' },
                            bodyFont: { family: 'Inter' },
                            callbacks: {
                                label: ctx => `Revenue: EGP ${ctx.parsed.y.toFixed(2)}`
                            }
                        }
                    }
                }
            });
        }
        
        // --- Monthly Performance Line Chart with gradient fill ---
        const monthlyCtx = document.getElementById('monthly-sales-chart');
        if(monthlyCtx) {
            if(monthlyChartInstance) monthlyChartInstance.destroy();
            const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const dataPts = new Array(12).fill(0);
            data.monthly.forEach(d => { dataPts[d.month - 1] = d.revenue; });
            
            // Create gradient
            const chartCanvas = monthlyCtx.getContext('2d');
            const gradient = chartCanvas.createLinearGradient(0, 0, 0, 300);
            gradient.addColorStop(0, 'rgba(0, 229, 141, 0.3)');
            gradient.addColorStop(1, 'rgba(0, 229, 141, 0.01)');
            
            monthlyChartInstance = new Chart(monthlyCtx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Revenue (EGP)',
                        data: dataPts,
                        backgroundColor: gradient,
                        borderColor: c.green,
                        borderWidth: 3,
                        fill: true,
                        tension: 0.4,
                        pointBackgroundColor: c.green,
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2,
                        pointRadius: 5,
                        pointHoverRadius: 8
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            grid: { color: c.gridColor },
                            ticks: {
                                color: c.textColor,
                                font: { family: 'Inter' },
                                callback: v => 'EGP ' + v
                            }
                        },
                        x: {
                            grid: { display: false },
                            ticks: { color: c.textColor, font: { family: 'Inter' } }
                        }
                    },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: 'rgba(0,0,0,0.8)',
                            titleFont: { family: 'Inter' },
                            bodyFont: { family: 'Inter' },
                            callbacks: {
                                label: ctx => `Revenue: EGP ${ctx.parsed.y.toFixed(2)}`
                            }
                        }
                    }
                }
            });
        }
        
    } catch(e) {
        console.error("Failed to load reports", e);
    }
}

window.viewSaleDetails = async function(saleId) {
    try {
        const res = await fetch(`${API_BASE}/sales/${saleId}`, { headers: authHeaders() });
        if(!res.ok) throw new Error("Sale not found");
        const sale = await res.json();
        
        document.getElementById('order-details-subtitle').textContent = `Invoice ID: #${sale.id}`;
        document.getElementById('od-date').textContent = sale.date;
        document.getElementById('od-pharmacist').textContent = sale.pharmacist;
        document.getElementById('od-customer').textContent = sale.customer;
        document.getElementById('od-payment').textContent = sale.payment_method;
        document.getElementById('od-discount').textContent = formatMoney(sale.discount);
        document.getElementById('od-total').textContent = formatMoney(sale.total_price);
        
        // Render Items
        document.getElementById('od-items-table').innerHTML = sale.items.map(i => `
            <tr>
                <td style="font-weight: 500;">${i.medicine_name}</td>
                <td style="text-align: center;">${i.quantity}</td>
                <td style="text-align: right;">${formatMoney(i.sell_price)}</td>
                <td style="text-align: right; font-weight: 600;">${formatMoney(i.subtotal)}</td>
                <td style="text-align: center;">
                    <button class="btn btn-outline" style="padding: 4px 8px; font-size: 12px; color: var(--warning); border-color: var(--warning);" onclick="initiateReturnFromSale(${sale.id}, ${i.medicine_id}, ${i.quantity})">
                        Return
                    </button>
                </td>
            </tr>
        `).join('');
        
        // Render Returns if any
        const returnsSec = document.getElementById('od-returns-section');
        if(sale.returns && sale.returns.length > 0) {
            returnsSec.style.display = 'block';
            document.getElementById('od-returns-table').innerHTML = sale.returns.map(r => `
                <tr>
                    <td style="font-weight: 500;">${r.medicine_name}</td>
                    <td style="text-align: center; color: var(--danger); font-weight: bold;">${r.quantity}</td>
                    <td style="text-align: right; font-weight: 600;">${formatMoney(r.refund_amount)}</td>
                    <td>${r.reason}</td>
                    <td style="font-size: 12px;">${r.date}</td>
                </tr>
            `).join('');
        } else {
            returnsSec.style.display = 'none';
        }
        
        document.getElementById('modal-order-details').style.display = 'flex';
    } catch(e) {
        alert(e.message);
    }
}

window.initiateReturnFromSale = function(saleId, medId, maxQty) {
    document.getElementById('modal-order-details').style.display = 'none';
    
    // Switch to returns tab
    document.querySelector('[data-target="returns"]').click();
    
    // Pre-fill and lookup
    setTimeout(() => {
        document.getElementById('return-sale-id').value = saleId;
        document.getElementById('btn-lookup-invoice').click();
    }, 100);
}

// --- MEDICINES LAYER ---
let allMedicines = [];
let allCategories = [];

function renderMedicinesTable(meds) {
    document.getElementById('med-table-body').innerHTML = meds.map(m => {
        let statusBadge = '';
        if(m.quantity <= 0) statusBadge = '<span class="badge badge-danger">Out of Stock</span>';
        else if(m.quantity <= m.min_stock_level) statusBadge = '<span class="badge badge-warning">Low Stock</span>';
        else statusBadge = '<span class="badge badge-success">In Stock</span>';
        
        const catName = allCategories.find(c => c.id === m.category_id)?.name || m.category_id;
        
        // Get nearest expiry from batches, fallback to medicine-level expiry_date
        let expiryDisplay = '-';
        let expiryClass = '';
        if(m.batches && m.batches.length > 0) {
            const activeBatches = m.batches.filter(b => b.quantity > 0);
            if(activeBatches.length > 0) {
                const nearest = activeBatches.sort((a, b) => new Date(a.expiry_date) - new Date(b.expiry_date))[0];
                expiryDisplay = nearest.expiry_date;
                const daysLeft = Math.ceil((new Date(nearest.expiry_date) - new Date()) / (1000*60*60*24));
                if(daysLeft <= 0) expiryClass = 'color: var(--danger); font-weight: 600;';
                else if(daysLeft <= 30) expiryClass = 'color: var(--warning); font-weight: 600;';
            }
        } else if(m.expiry_date) {
            expiryDisplay = m.expiry_date;
            const daysLeft = Math.ceil((new Date(m.expiry_date) - new Date()) / (1000*60*60*24));
            if(daysLeft <= 0) expiryClass = 'color: var(--danger); font-weight: 600;';
            else if(daysLeft <= 30) expiryClass = 'color: var(--warning); font-weight: 600;';
        }

        return `
            <tr style="border-bottom: 1px solid var(--border); transition: background 0.2s;" onmouseover="this.style.background='rgba(0,0,0,0.02)'" onmouseout="this.style.background='transparent'">
                <td style="padding: 14px 16px;">
                    <div style="display:flex; align-items:center; gap:12px;">
                        ${m.image_url ? `<img src="${m.image_url}" style="width:40px; height:40px; border-radius:8px; object-fit:cover; border:1px solid var(--border);">` : '<div style="width:40px;height:40px;background:var(--bg-main);border-radius:8px;border:1px solid var(--border);display:flex;align-items:center;justify-content:center;"><i data-lucide="pill" style="width:18px;height:18px;color:var(--text-secondary)"></i></div>'}
                        <div>
                            <div style="font-weight: 600; font-size: 14px;">${m.name}</div>
                            <div style="font-size: 12px; color: var(--text-secondary);">ID: ${m.id}</div>
                        </div>
                    </div>
                </td>
                <td style="padding: 14px 16px; color: var(--text-secondary); font-family: monospace; font-size: 13px;">${m.barcode || '-'}</td>
                <td style="padding: 14px 16px;">
                    <span style="background: var(--bg-main); padding: 4px 12px; border-radius: 12px; border: 1px solid var(--border); font-size: 13px;">${catName}</span>
                </td>
                <td style="padding: 14px 16px; text-align: right; color: var(--text-secondary); font-size: 13px;">${formatMoney(m.cost_price)}</td>
                <td style="padding: 14px 16px; text-align: right; font-weight: 600;">${formatMoney(m.sell_price)}</td>
                <td style="padding: 14px 16px; text-align: center;">
                    <span style="font-weight: 600; ${m.quantity <= 0 ? 'color:var(--danger)' : m.quantity <= m.min_stock_level ? 'color:var(--warning)' : ''}">${m.quantity}</span>
                </td>
                <td style="padding: 14px 16px; text-align: center; font-size: 13px; ${expiryClass}">${expiryDisplay}</td>
                <td style="padding: 14px 16px; text-align: center;">${statusBadge}</td>
                <td style="padding: 14px 16px; text-align: center;">
                    <div style="display: flex; gap: 8px; justify-content: center;">
                        <button class="btn btn-outline" style="padding: 6px; font-size: 12px;" onclick="viewMedicineBatches(${m.id}, '${m.name.replace(/'/g, "\\'")}')" title="View Batches">
                            <i data-lucide="layers" style="width:14px;height:14px;"></i>
                        </button>
                        ${(currentUser && (currentUser.role.toLowerCase() === 'admin' || currentUser.role.toLowerCase() === 'owner')) ? `
                        <button class="btn btn-outline" style="padding: 6px; font-size: 12px; color: var(--primary); border-color: var(--primary);" onclick="editMedicine(${m.id})" title="Edit Profile">
                            <i data-lucide="edit-2" style="width:14px;height:14px;"></i>
                        </button>
                        <button class="btn btn-outline" style="padding: 6px; font-size: 12px; color: var(--danger); border-color: var(--danger);" onclick="deleteMedicine(${m.id})" title="Delete Profile">
                            <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
                        </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
    lucide.createIcons();
}

async function loadMedicines() {
    try {
        if(allCategories.length === 0) {
            try {
                const catRes = await fetch(`${API_BASE}/categories`, { headers: authHeaders() });
                allCategories = await catRes.json();
                const catSelect = document.getElementById('med-category-filter');
                if(catSelect) {
                    catSelect.innerHTML = '<option value="">All Classifications</option>' + allCategories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
                }
            } catch(e) {}
        }

        const res = await fetch(`${API_BASE}/medicines`, { headers: authHeaders() });
        if(!res.ok) throw new Error("Failed");
        allMedicines = await res.json();
        
        renderMedicinesTable(allMedicines);
        
        const searchInput = document.getElementById('med-search');
        const catFilter = document.getElementById('med-category-filter');
        
        const filterMeds = () => {
            const q = searchInput ? searchInput.value.toLowerCase().trim() : '';
            const catId = catFilter ? catFilter.value : '';
            let filtered = allMedicines;
            if(q) {
                filtered = filtered.filter(m => m.name.toLowerCase().includes(q) || (m.barcode && m.barcode.includes(q)));
            }
            if(catId) {
                filtered = filtered.filter(m => m.category_id.toString() === catId);
            }
            renderMedicinesTable(filtered);
        };
        
        if(searchInput) searchInput.oninput = filterMeds;
        if(catFilter) catFilter.onchange = filterMeds;
        
        // Bind Add Classification button
        const addCatBtn = document.getElementById('btn-add-category');
        if(addCatBtn) {
            addCatBtn.onclick = () => addNewCategory();
        }
        
        // Bind Add button
        const addBtn = document.getElementById('btn-add-medicine');
        if(addBtn) {
            addBtn.onclick = () => {
                document.getElementById('form-new-medicine').reset();
                document.getElementById('new-med-id').value = '';
                const nameSpan = document.getElementById('new-med-file-name');
                if(nameSpan) nameSpan.textContent = '';
                
                // Populate category dropdown in modal
                const catDropdown = document.getElementById('new-med-cat');
                if(catDropdown && allCategories.length > 0) {
                    catDropdown.innerHTML = '<option value="">Select classification...</option>' + allCategories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
                }
                document.querySelector('#modal-new-medicine h3').textContent = 'Register New Medicine';
                document.getElementById('modal-new-medicine').style.display = 'flex';
                lucide.createIcons();
            };
        }

        // File name preview
        const fileInput = document.getElementById('new-med-image-file');
        if(fileInput) {
            fileInput.onchange = () => {
                const nameSpan = document.getElementById('new-med-file-name');
                if(nameSpan && fileInput.files.length > 0) {
                    nameSpan.textContent = '✓ ' + fileInput.files[0].name;
                }
            };
        }
        
        // Bind form
        const addForm = document.getElementById('form-new-medicine');
        if(addForm) {
            addForm.onsubmit = async (e) => {
                e.preventDefault();
                
                let uploadedUrl = null;
                const imgInput = document.getElementById('new-med-image-file');
                if(imgInput && imgInput.files.length > 0) {
                    const fd = new FormData();
                    fd.append('file', imgInput.files[0]);
                    try {
                        const upRes = await fetch(`${API_BASE}/upload`, { method: 'POST', body: fd, headers: { 'x-user-id': currentUser.id.toString() } });
                        if(upRes.ok) {
                            const upData = await upRes.json();
                            uploadedUrl = upData.url;
                        } else {
                            const errData = await upRes.json();
                            throw new Error(errData.detail || "Image upload failed from server");
                        }
                    } catch(e) { 
                        alert("Image Upload Error: " + e.message); 
                        return; // Stop addition if image fails
                    }
                }

                const medId = document.getElementById('new-med-id').value;

                const payload = {
                    name: document.getElementById('new-med-name').value,
                    sell_price: parseFloat(document.getElementById('new-med-sell').value),
                    cost_price: parseFloat(document.getElementById('new-med-cost').value),
                    category_id: parseInt(document.getElementById('new-med-cat').value),
                    barcode: document.getElementById('new-med-barcode').value || null,
                    quantity: parseInt(document.getElementById('new-med-qty').value) || 0,
                    min_stock_level: parseInt(document.getElementById('new-med-min-stock').value) || 5,
                    expiry_date: document.getElementById('new-med-expiry').value || null,
                };
                
                if (uploadedUrl) {
                    payload.image_url = uploadedUrl;
                } else if (!medId) {
                    payload.image_url = null;
                }
                
                try {
                    const url = medId ? `${API_BASE}/medicines/${medId}` : `${API_BASE}/medicines`;
                    const method = medId ? 'PUT' : 'POST';
                    
                    const res = await fetch(url, {
                        method: method,
                        headers: authHeaders(),
                        body: JSON.stringify(payload)
                    });
                    
                    if(!res.ok) {
                        let errMsg = "Failed to save medication";
                        const contentType = res.headers.get("content-type");
                        if (contentType && contentType.includes("application/json")) {
                            const err = await res.json();
                            errMsg = err.detail || errMsg;
                        } else {
                            errMsg = await res.text() || errMsg;
                        }
                        throw new Error(errMsg);
                    }
                    
                    document.getElementById('modal-new-medicine').style.display = 'none';
                    addForm.reset();
                    const nameSpan = document.getElementById('new-med-file-name');
                    if(nameSpan) nameSpan.textContent = '';
                    loadMedicines();
                } catch(err) {
                    alert('Error: ' + err.message);
                }
            };
        }
    } catch(e) {
        console.error(e);
    }
}

window.editMedicine = function(id) {
    const med = allMedicines.find(m => m.id === id);
    if(!med) return;
    
    document.getElementById('form-new-medicine').reset();
    document.getElementById('new-med-id').value = med.id;
    
    const catDropdown = document.getElementById('new-med-cat');
    if(catDropdown && allCategories.length > 0) {
        catDropdown.innerHTML = '<option value="">Select classification...</option>' + allCategories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    }
    
    document.getElementById('new-med-name').value = med.name;
    document.getElementById('new-med-cat').value = med.category_id;
    document.getElementById('new-med-barcode').value = med.barcode || '';
    document.getElementById('new-med-cost').value = med.cost_price;
    document.getElementById('new-med-sell').value = med.sell_price;
    document.getElementById('new-med-qty').value = med.quantity;
    document.getElementById('new-med-min-stock').value = med.min_stock_level;
    document.getElementById('new-med-expiry').value = med.expiry_date || '';
    
    const nameSpan = document.getElementById('new-med-file-name');
    if(nameSpan) nameSpan.textContent = med.image_url ? '(Current Image Set)' : '';
    
    document.querySelector('#modal-new-medicine h3').textContent = 'Edit Medicine Profile';
    document.getElementById('modal-new-medicine').style.display = 'flex';
    lucide.createIcons();
}

window.deleteMedicine = async function(id) {
    if(!confirm("Are you sure you want to permanently delete this medication?")) return;
    try {
        const res = await fetch(`${API_BASE}/medicines/${id}`, { method: 'DELETE', headers: authHeaders() });
        if(!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || "Failed to delete");
        }
        loadMedicines();
    } catch(e) {
        alert("Delete Error: " + e.message);
    }
}

window.openManageCategories = async function() {
    try {
        const res = await fetch(`${API_BASE}/categories`, { headers: authHeaders() });
        allCategories = await res.json();
        renderManageCategories();
        document.getElementById('modal-manage-categories').style.display = 'flex';
        lucide.createIcons();
    } catch(e) {}
}

window.renderManageCategories = function() {
    const tbody = document.getElementById('manage-categories-table');
    tbody.innerHTML = allCategories.map(c => `
        <tr>
            <td>${c.id}</td>
            <td style="font-weight: 500;">${c.name}</td>
            <td style="text-align: right;">
                <button class="btn btn-outline" style="padding: 4px 8px; font-size: 12px; color: var(--primary); border-color: var(--primary);" onclick="editCategory(${c.id}, '${c.name.replace(/'/g, "\\'")}')">Edit</button>
                <button class="btn btn-outline" style="padding: 4px 8px; font-size: 12px; color: var(--danger); border-color: var(--danger);" onclick="deleteCategory(${c.id})">Delete</button>
            </td>
        </tr>
    `).join('');
}

window.editCategory = async function(id, oldName) {
    const newName = prompt("Edit classification name:", oldName);
    if (!newName || newName.trim() === oldName) return;
    
    try {
        const res = await fetch(`${API_BASE}/categories/${id}`, {
            method: 'PUT',
            headers: authHeaders(),
            body: JSON.stringify({ name: newName.trim() })
        });
        if(!res.ok) {
            const err = await res.json();
            throw new Error(err.detail);
        }
        openManageCategories(); // reload
        
        // Quietly update filters
        const catRes = await fetch(`${API_BASE}/categories`, { headers: authHeaders() });
        allCategories = await catRes.json();
        const catSelect = document.getElementById('med-category-filter');
        if(catSelect) catSelect.innerHTML = '<option value="">All Classifications</option>' + allCategories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    } catch(e) {
        alert("Error: " + e.message);
    }
}

window.addCategory = async function() {
    const name = document.getElementById('new-cat-name').value.trim();
    if(!name) return;
    try {
        const res = await fetch(`${API_BASE}/categories`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ name })
        });
        if(!res.ok) {
            const err = await res.json();
            throw new Error(err.detail);
        }
        document.getElementById('new-cat-name').value = '';
        openManageCategories(); // reload
        
        // Also update allCategories and the filter dropdown quietly
        const catRes = await fetch(`${API_BASE}/categories`, { headers: authHeaders() });
        allCategories = await catRes.json();
        const catSelect = document.getElementById('med-category-filter');
        if(catSelect) catSelect.innerHTML = '<option value="">All Classifications</option>' + allCategories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    } catch(e) {
        alert(e.message);
    }
}

window.deleteCategory = async function(id) {
    if(!confirm("Delete this classification?")) return;
    try {
        const res = await fetch(`${API_BASE}/categories/${id}`, { method: 'DELETE', headers: authHeaders() });
        if(!res.ok) {
            const err = await res.json();
            throw new Error(err.detail);
        }
        openManageCategories(); // reload
        
        // Also update allCategories and the filter dropdown quietly
        const catRes = await fetch(`${API_BASE}/categories`, { headers: authHeaders() });
        allCategories = await catRes.json();
        const catSelect = document.getElementById('med-category-filter');
        if(catSelect) catSelect.innerHTML = '<option value="">All Classifications</option>' + allCategories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    } catch(e) {
        alert("Error: " + e.message);
    }
}

// --- STAFF LAYER ---
let allUsers = [];

async function loadStaff() {
    try {
        const res = await fetch(`${API_BASE}/users`, { headers: authHeaders() });
        allUsers = await res.json();
        
        document.getElementById('staff-table-body').innerHTML = allUsers.map(u => `
            <tr>
                <td>${u.id}</td>
                <td>${u.name}</td>
                <td>${u.email}</td>
                <td><span class="badge badge-warning">${u.role}</span></td>
                <td>${u.is_active ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-danger">Disabled</span>'}</td>
                <td>
                    <button class="btn btn-outline" style="padding: 4px 8px; font-size: 12px;" onclick="toggleStaff(${u.id})">Toggle Active</button>
                    <button class="btn btn-outline" style="padding: 4px 8px; font-size: 12px; color: var(--primary); border-color: var(--primary);" onclick="editStaff(${u.id})">Edit</button>
                    <button class="btn btn-outline" style="padding: 4px 8px; font-size: 12px; color: var(--danger); border-color: var(--danger);" onclick="deleteStaff(${u.id})">Delete</button>
                </td>
            </tr>
        `).join('');
        
        // Bind save staff
        const saveBtn = document.getElementById('btn-save-staff');
        if (saveBtn) {
            saveBtn.onclick = saveStaffChanges;
        }
    } catch(e) {
        console.error(e);
    }
}

window.toggleStaff = async function(id) {
    try {
        await fetch(`${API_BASE}/users/${id}/toggle_active`, { method: 'PUT', headers: authHeaders() });
        loadStaff();
    } catch(e) {
        alert("Failed to toggle staff");
    }
}

window.editStaff = function(id) {
    const user = allUsers.find(u => u.id === id);
    if(!user) return;
    document.getElementById('staff-edit-id').value = user.id;
    document.getElementById('staff-edit-name').value = user.name;
    document.getElementById('staff-edit-email').value = user.email;
    document.getElementById('staff-edit-phone').value = user.mobile || '';
    document.getElementById('staff-edit-role').value = user.role;
    document.getElementById('staff-form-panel').style.display = 'block';
}

window.deleteStaff = async function(id) {
    if(!confirm("Are you sure you want to delete this staff member?")) return;
    try {
        const res = await fetch(`${API_BASE}/users/${id}`, { method: 'DELETE', headers: authHeaders() });
        if(!res.ok) {
            const err = await res.json();
            throw new Error(err.detail);
        }
        loadStaff();
    } catch(e) {
        alert("Delete error: " + e.message);
    }
}

async function saveStaffChanges() {
    const id = document.getElementById('staff-edit-id').value;
    const payload = {
        name: document.getElementById('staff-edit-name').value,
        email: document.getElementById('staff-edit-email').value,
        mobile: document.getElementById('staff-edit-phone').value,
        role: document.getElementById('staff-edit-role').value
    };
    
    try {
        const res = await fetch(`${API_BASE}/users/${id}`, {
            method: 'PUT',
            headers: authHeaders(),
            body: JSON.stringify(payload)
        });
        if(!res.ok) {
            const err = await res.json();
            throw new Error(err.detail);
        }
        document.getElementById('staff-form-panel').style.display = 'none';
        loadStaff();
    } catch(e) {
        alert("Save error: " + e.message);
    }
}

// --- POS SYSTEM ---
let posCart = [];

let posAllMedicines = [];

async function initPOS() {
    const searchInput = document.getElementById('pos-search');
    const catFilter = document.getElementById('pos-category-filter');
    const gridDiv = document.getElementById('pos-product-grid');
    
    if(allCategories.length === 0) {
        try {
            const catRes = await fetch(`${API_BASE}/categories`, { headers: authHeaders() });
            allCategories = await catRes.json();
        } catch(e) {}
    }
    
    if(catFilter) {
        catFilter.innerHTML = '<option value="">All Classifications</option>' + allCategories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    }

    // Fetch all for grid
    try {
        const res = await fetch(`${API_BASE}/medicines`, { headers: authHeaders() });
        posAllMedicines = await res.json();
        renderPOSGrid(posAllMedicines);
    } catch(e) {
        console.error("Failed to load POS inventory", e);
    }
    
    // Customer Search Setup
    let posCustomers = [];
    try {
        const custRes = await fetch(`${API_BASE}/customers`, { headers: authHeaders() });
        posCustomers = await custRes.json();
    } catch(e) {}
    
    const custSearchInput = document.getElementById('pos-customer-search');
    const custDropdown = document.getElementById('pos-customer-dropdown');
    
    if(custSearchInput) {
        custSearchInput.oninput = () => {
            const q = custSearchInput.value.toLowerCase().trim();
            if(!q) { custDropdown.style.display = 'none'; document.getElementById('pos-customer-id').value = ''; return; }
            
            const filtered = posCustomers.filter(c => c.name.toLowerCase().includes(q) || (c.phone && c.phone.includes(q)));
            if(filtered.length === 0) {
                custDropdown.innerHTML = '<div style="padding: 10px 12px; color: var(--text-secondary);">No matches</div>';
            } else {
                custDropdown.innerHTML = filtered.map(c => `
                    <div class="dropdown-item" onclick="selectPOSCustomer(${c.id}, '${c.name.replace(/'/g, "\\'")}')" style="padding: 10px 12px; cursor: pointer; border-bottom: 1px solid var(--border);">
                        <div style="font-weight: 600;">${c.name}</div>
                        <div style="font-size: 12px; color: var(--text-secondary);">Phone: ${c.phone || '-'}</div>
                    </div>
                `).join('');
            }
            custDropdown.style.display = 'block';
        };
        
        document.addEventListener('click', (e) => {
            if(custSearchInput && custDropdown && !custSearchInput.contains(e.target) && !custDropdown.contains(e.target)) {
                custDropdown.style.display = 'none';
            }
        });
    }

    const filterPOS = () => {
        const q = searchInput ? searchInput.value.trim().toLowerCase() : '';
        const catId = catFilter ? catFilter.value : '';
        let filtered = posAllMedicines;
        if(q) {
            filtered = filtered.filter(m => m.name.toLowerCase().includes(q) || (m.barcode && m.barcode.includes(q)));
        }
        if(catId) {
            filtered = filtered.filter(m => m.category_id.toString() === catId);
        }
        renderPOSGrid(filtered);
    };

    if(searchInput) searchInput.addEventListener('input', filterPOS);
    if(catFilter) catFilter.addEventListener('change', filterPOS);

    document.getElementById('pos-discount').addEventListener('input', renderCart);
    document.getElementById('pos-checkout-btn').onclick = handleCheckout;
}

window.selectPOSCustomer = function(id, name) {
    document.getElementById('pos-customer-search').value = name;
    document.getElementById('pos-customer-id').value = id;
    document.getElementById('pos-customer-dropdown').style.display = 'none';
}

function renderPOSGrid(items) {
    const gridDiv = document.getElementById('pos-product-grid');
    gridDiv.innerHTML = items.map(m => {
        const imgHtml = m.image_url 
            ? `<img src="${m.image_url}" style="width:100%; height:120px; object-fit:cover; border-radius:8px 8px 0 0;">` 
            : `<div style="width:100%; height:120px; background:var(--bg-main); border-radius:8px 8px 0 0; display:flex; align-items:center; justify-content:center; color:var(--text-secondary);"><i data-lucide="image"></i></div>`;
        return `
            <div class="pos-card" style="border: 1px solid var(--border); border-radius: 8px; cursor: pointer; transition: all 0.2s;" onclick='addToCart(${JSON.stringify(m).replace(/'/g, "&#39;")})' onmouseover="this.style.borderColor='var(--primary)'" onmouseout="this.style.borderColor='var(--border)'">
                ${imgHtml}
                <div style="padding: 12px;">
                    <div style="font-weight: 600; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${m.name}">${m.name}</div>
                    <div style="color: var(--text-secondary); font-size: 12px; margin-top: 4px;">Stk: <span style="${m.quantity <= 0 ? 'color:var(--danger)' : ''}">${m.quantity}</span></div>
                    <div style="color: var(--primary); font-weight: 700; margin-top: 8px;">${formatMoney(m.sell_price)}</div>
                </div>
            </div>
        `;
    }).join('');
    lucide.createIcons();
}

window.addToCart = function(med) {
    if(med.quantity <= 0) return alert("Out of stock!");
    document.getElementById('pos-search').value = '';
    renderPOSGrid(posAllMedicines);
    
    const existing = posCart.find(i => i.medicine_id === med.id);
    if(existing) {
        existing.quantity += 1;
    } else {
        posCart.push({
            medicine_id: med.id,
            name: med.name,
            price: med.sell_price,
            stock: med.quantity, // Informational
            quantity: 1,
            image_url: med.image_url
        });
    }
    renderCart();
};

window.removeFromCart = function(idx) {
    posCart.splice(idx, 1);
    renderCart();
}

window.changeCartQty = function(idx, val) {
    const newVal = parseInt(val);
    if(newVal > 0) posCart[idx].quantity = newVal;
    renderCart();
}

function renderCart() {
    const listDiv = document.getElementById('pos-cart-list');
    let subtotal = 0;
    
    listDiv.innerHTML = posCart.map((item, idx) => {
        const total = item.price * item.quantity;
        subtotal += total;
        return `
            <div style="display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid var(--border); padding-bottom:12px;">
                <div style="display:flex; align-items:center; gap:12px; flex:1;">
                    ${item.image_url ? `<img src="${item.image_url}" style="width:40px; height:40px; border-radius:6px; object-fit:cover;">` : '<div style="width:40px;height:40px;background:rgba(0,0,0,0.05);border-radius:6px;"></div>'}
                    <div style="overflow:hidden;">
                        <div style="font-weight:600; font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.name}</div>
                        <div style="color:var(--text-secondary); font-size:12px;">${formatMoney(item.price)}</div>
                    </div>
                </div>
                <div style="display:flex; align-items:center; gap:16px;">
                    <input type="number" value="${item.quantity}" min="1" style="width:60px; padding:6px; border-radius:4px; border:1px solid var(--border);" onchange="changeCartQty(${idx}, this.value)">
                    <div style="font-weight:700; width:70px; text-align:right;">${formatMoney(total)}</div>
                    <button class="btn btn-outline" style="padding:6px; color:var(--danger); border-color:var(--danger);" onclick="removeFromCart(${idx})"><i data-lucide="trash-2" style="width:16px; height:16px;"></i></button>
                </div>
            </div>
        `;
    }).join('');
    lucide.createIcons();
    
    const discountPercent = parseFloat(document.getElementById('pos-discount').value) || 0;
    const discountAmount = subtotal * (discountPercent / 100);
    const finalTotal = subtotal - discountAmount;
    
    document.getElementById('pos-subtotal').textContent = formatMoney(subtotal);
    document.getElementById('pos-total').textContent = formatMoney(finalTotal > 0 ? finalTotal : 0);
}

async function handleCheckout() {
    if(posCart.length === 0) return alert("Cart is empty");
    
    const items = posCart.map(i => ({ medicine_id: i.medicine_id, quantity: i.quantity }));
    const subtotal = posCart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const discountPercent = parseFloat(document.getElementById('pos-discount').value) || 0;
    const discountAmount = subtotal * (discountPercent / 100);
    const method = document.getElementById('pos-payment').value;
    const customerId = document.getElementById('pos-customer-id').value;
    
    const payload = { 
        user_id: currentUser.id, 
        items: items, 
        discount: discountAmount, 
        payment_method: method 
    };
    if (customerId) payload.customer_id = parseInt(customerId);
    
    try {
        const res = await fetch(`${API_BASE}/sales`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify(payload)
        });
        
        if(!res.ok) {
            const err = await res.json();
            throw new Error(err.detail);
        }
        
        alert("Sale Completed Successfully!");
        posCart = [];
        document.getElementById('pos-discount').value = "0";
        if(document.getElementById('pos-customer-search')) document.getElementById('pos-customer-search').value = '';
        if(document.getElementById('pos-customer-id')) document.getElementById('pos-customer-id').value = '';
        if(document.getElementById('pos-search')) document.getElementById('pos-search').value = '';
        renderCart();
    } catch(e) {
        alert("Error: " + e.message);
    }
}

// --- RESTOCK PURCHASES ---
let restockItems = [];
let restockMeds = [];

async function initPurchases() {
    // Populate supplier dropdown
    try {
        const supRes = await fetch(`${API_BASE}/suppliers`, { headers: authHeaders() });
        const suppliers = await supRes.json();
        const supSelect = document.getElementById('restock-supplier-id');
        if(supSelect) {
            supSelect.innerHTML = '<option value="">Select Supplier (Optional)</option>' + suppliers.map(s => `<option value="${s.id}">${s.name}${s.company_name ? ' — ' + s.company_name : ''}</option>`).join('');
        }
        
        const medRes = await fetch(`${API_BASE}/medicines`, { headers: authHeaders() });
        restockMeds = await medRes.json();
    } catch(e) {}
    
    const searchInput = document.getElementById('restock-med-search');
    const dropdown = document.getElementById('restock-med-dropdown');
    
    if(searchInput) {
        searchInput.oninput = () => {
            const q = searchInput.value.toLowerCase().trim();
            if(!q) { dropdown.style.display = 'none'; return; }
            
            const filtered = restockMeds.filter(m => m.name.toLowerCase().includes(q) || m.id.toString() === q);
            if(filtered.length === 0) {
                dropdown.innerHTML = '<div style="padding: 10px 12px; color: var(--text-secondary);">No matches found</div>';
            } else {
                dropdown.innerHTML = filtered.map(m => `
                    <div class="dropdown-item" onclick="selectRestockMed(${m.id}, '${m.name.replace(/'/g, "\\'")}', ${m.cost_price})" style="padding: 10px 12px; cursor: pointer; border-bottom: 1px solid var(--border);">
                        <div style="font-weight: 600;">${m.name}</div>
                        <div style="font-size: 12px; color: var(--text-secondary);">ID: ${m.id} | Current Cost: ${formatMoney(m.cost_price)}</div>
                    </div>
                `).join('');
            }
            dropdown.style.display = 'block';
        };
        
        document.addEventListener('click', (e) => {
            if(!searchInput.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.style.display = 'none';
            }
        });
    }

    document.getElementById('btn-restock-add-item').onclick = () => {
        const m = document.getElementById('restock-med-id').value;
        const q = document.getElementById('restock-qty').value;
        const c = document.getElementById('restock-cost').value;
        const e = document.getElementById('restock-expiry').value;
        
        if(!m || !q || !c || !e) return alert("Fill all fields including Expiry Date");
        restockItems.push({ medicine_id: parseInt(m), quantity: parseInt(q), cost_price: parseFloat(c), expiry_date: e });
        
        document.getElementById('restock-med-id').value = '';
        if(searchInput) searchInput.value = '';
        document.getElementById('restock-qty').value = '';
        document.getElementById('restock-cost').value = '';
        document.getElementById('restock-expiry').value = '';
        renderRestock();
    };
    
    document.getElementById('btn-submit-restock').onclick = async () => {
        if(restockItems.length === 0) return alert("No items");
        let sum = restockItems.reduce((acc, curr) => acc + (curr.quantity * curr.cost_price), 0);
        const supp = document.getElementById('restock-supplier-id').value;
        
        const payload = {
            total_cost: sum,
            items: restockItems
        };
        if(supp) payload.supplier_id = parseInt(supp);
        
        try {
            const res = await fetch(`${API_BASE}/purchases`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify(payload)
            });
            if(res.ok) {
                alert("Restock logged!");
                restockItems = [];
                renderRestock();
            } else {
                alert("Failed");
            }
        }catch(e) { alert(e); }
    }
}
window.selectRestockMed = function(id, name, costPrice) {
    document.getElementById('restock-med-search').value = name;
    document.getElementById('restock-med-id').value = id;
    document.getElementById('restock-med-dropdown').style.display = 'none';
    document.getElementById('restock-cost').value = costPrice;
    document.getElementById('restock-qty').focus();
}

function renderRestock() {
    document.getElementById('restock-items-table').innerHTML = restockItems.map((i, idx) => {
        const med = restockMeds.find(m => m.id === i.medicine_id);
        const name = med ? med.name : i.medicine_id;
        return `
        <tr style="border-bottom: 1px solid var(--border);">
            <td style="font-weight: 500; padding: 12px 16px;">${name}</td>
            <td style="text-align: center; padding: 12px 16px;">${i.quantity}</td>
            <td style="text-align: right; padding: 12px 16px; font-weight: 600;">${formatMoney(i.cost_price)}</td>
            <td style="text-align: center; padding: 12px 16px;">${i.expiry_date}</td>
            <td style="text-align: center; padding: 12px 16px;">
                <button class="btn btn-outline" style="padding: 4px 8px; font-size: 12px; color: var(--danger); border-color: var(--danger);" onclick="restockItems.splice(${idx},1); renderRestock()">Drop</button>
            </td>
        </tr>
        `;
    }).join('');
}

// --- RETURNS ---
let currentReturnInvoice = null;

async function initReturns() {
    document.getElementById('btn-lookup-invoice').onclick = async () => {
        const saleId = document.getElementById('return-sale-id').value;
        if(!saleId) return alert("Enter an Invoice ID");
        
        try {
            const res = await fetch(`${API_BASE}/sales/${saleId}`, { headers: authHeaders() });
            if(!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || "Invoice not found");
            }
            
            const sale = await res.json();
            currentReturnInvoice = sale;
            
            document.getElementById('return-lbl-invoice-id').textContent = sale.id;
            document.getElementById('return-lbl-date').textContent = sale.date || new Date().toLocaleString();
            
            // We need medicine names. Let's fetch them if not loaded.
            let meds = [];
            try {
                const mRes = await fetch(`${API_BASE}/medicines`, { headers: authHeaders() });
                meds = await mRes.json();
            } catch(e) {}
            
            document.getElementById('return-items-table').innerHTML = sale.items.map(item => {
                const med = meds.find(m => m.id === item.medicine_id);
                const name = med ? med.name : `Medicine #${item.medicine_id}`;
                
                // Calculate how many were already returned
                let alreadyReturned = 0;
                if (sale.returns && Array.isArray(sale.returns)) {
                    sale.returns.forEach(r => {
                        if (r.medicine_id === item.medicine_id) {
                            alreadyReturned += r.quantity;
                        }
                    });
                }
                const refundable = item.quantity - alreadyReturned;
                
                return `
                <tr style="border-bottom: 1px solid var(--border);">
                    <td style="font-weight: 500; padding: 12px 16px;">${name}</td>
                    <td style="text-align: center; padding: 12px 16px;">${item.quantity}</td>
                    <td style="text-align: right; padding: 12px 16px; font-weight: 600;">${formatMoney(item.sell_price)}</td>
                    <td style="text-align: center; padding: 12px 16px;">
                        ${refundable > 0 ? `
                        <button class="btn btn-outline" style="padding: 4px 12px; font-size: 12px; color: var(--warning); border-color: var(--warning);" onclick="promptReturnItem(${sale.id}, ${item.medicine_id}, ${refundable})">
                            <i data-lucide="rotate-ccw" style="width:14px;height:14px;"></i> Return
                        </button>
                        ` : `<span style="font-size: 12px; color: var(--success); font-weight: 500;">Returned</span>`}
                    </td>
                </tr>
                `;
            }).join('');
            
            document.getElementById('return-invoice-details').style.display = 'block';
            lucide.createIcons();
            
        } catch(e) {
            alert(e.message);
            document.getElementById('return-invoice-details').style.display = 'none';
        }
    };
}

window.promptReturnItem = async function(saleId, medId, maxQty) {
    let medName = `Medicine #${medId}`;
    if (currentReturnInvoice && currentReturnInvoice.items) {
        const item = currentReturnInvoice.items.find(i => i.medicine_id === medId);
        if (item && item.medicine_name) {
            medName = item.medicine_name;
        }
    }
    
    document.getElementById('return-modal-sale-id').value = saleId;
    document.getElementById('return-modal-med-id').value = medId;
    document.getElementById('return-modal-max-qty').value = maxQty;
    document.getElementById('return-modal-med-name').textContent = medName;
    document.getElementById('return-modal-max-qty-label').textContent = maxQty;
    document.getElementById('return-modal-qty').value = 1;
    document.getElementById('return-modal-qty').max = maxQty;
    document.getElementById('return-modal-reason').value = '';
    
    document.getElementById('modal-return-item').style.display = 'flex';
}

document.addEventListener('DOMContentLoaded', () => {
    // Bind return confirm button
    const btnConfirmReturn = document.getElementById('btn-confirm-return');
    if (btnConfirmReturn) {
        btnConfirmReturn.onclick = async () => {
            const saleId = parseInt(document.getElementById('return-modal-sale-id').value);
            const medId = parseInt(document.getElementById('return-modal-med-id').value);
            const maxQty = parseInt(document.getElementById('return-modal-max-qty').value);
            const qty = parseInt(document.getElementById('return-modal-qty').value);
            const reason = document.getElementById('return-modal-reason').value.trim();
            
            if(isNaN(qty) || qty <= 0 || qty > maxQty) {
                alert("Invalid quantity. Must be between 1 and " + maxQty);
                return;
            }
            
            btnConfirmReturn.disabled = true;
            btnConfirmReturn.textContent = "Processing...";
            
            try {
                const res = await fetch(`${API_BASE}/returns`, {
                    method: 'POST',
                    headers: authHeaders(),
                    body: JSON.stringify({
                        sale_id: saleId,
                        medicine_id: medId,
                        quantity: qty,
                        reason: reason || null
                    })
                });
                
                if(!res.ok) {
                    const data = await res.json();
                    throw new Error(data.detail);
                }
                
                const ret = await res.json();
                alert(`Return Processed Successfully. Refund: ${formatMoney(ret.refund_amount)}`);
                document.getElementById('modal-return-item').style.display = 'none';
                document.getElementById('btn-lookup-invoice').click(); // refresh
                
            } catch(e) {
                alert("Return Error: " + e.message);
            } finally {
                btnConfirmReturn.disabled = false;
                btnConfirmReturn.textContent = "Confirm Return";
            }
        };
    }
});

// --- VIEW MEDICINE BATCHES ---
window.viewMedicineBatches = function(medId, medName) {
    const med = allMedicines.find(m => m.id === medId) || posAllMedicines.find(m => m.id === medId);
    if(!med || !med.batches || med.batches.length === 0) {
        alert(`No batches found for "${medName}". Use the Restock page to add inventory.`);
        return;
    }

    const batchRows = med.batches.map(b => {
        const daysLeft = Math.ceil((new Date(b.expiry_date) - new Date()) / (1000*60*60*24));
        let expiryStyle = '';
        let expiryLabel = '';
        if(daysLeft <= 0) { expiryStyle = 'color:#e11d48;font-weight:600;'; expiryLabel = ' (EXPIRED)'; }
        else if(daysLeft <= 30) { expiryStyle = 'color:#f59e0b;font-weight:600;'; expiryLabel = ` (${daysLeft}d)`; }

        return `<tr>
            <td style="padding:10px 14px; font-family:monospace; font-size:13px;">${b.batch_number || '-'}</td>
            <td style="padding:10px 14px; text-align:center; font-weight:600;">${b.quantity}</td>
            <td style="padding:10px 14px; text-align:center; ${expiryStyle}">${b.expiry_date}${expiryLabel}</td>
            <td style="padding:10px 14px; text-align:right;">${formatMoney(b.cost_price)}</td>
        </tr>`;
    }).join('');

    // Create a temporary modal
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;z-index:20000;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;';
    modal.innerHTML = `
        <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:16px;max-width:600px;width:95%;max-height:80vh;overflow:auto;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);">
            <div style="padding:24px 28px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;">
                <div>
                    <h3 style="margin:0;font-size:18px;">${medName}</h3>
                    <p style="margin:4px 0 0;font-size:13px;color:var(--text-secondary);">Batch Inventory Details • Total Qty: ${med.quantity}</p>
                </div>
                <button onclick="this.closest('div[style]').parentElement.remove()" style="background:none;border:none;cursor:pointer;padding:6px;color:var(--text-secondary);">✕</button>
            </div>
            <div style="padding:24px 28px;">
                <table style="width:100%;border-collapse:collapse;">
                    <thead>
                        <tr style="border-bottom:2px solid var(--border);">
                            <th style="padding:10px 14px;text-align:left;font-size:12px;text-transform:uppercase;color:var(--text-secondary);">Batch #</th>
                            <th style="padding:10px 14px;text-align:center;font-size:12px;text-transform:uppercase;color:var(--text-secondary);">Qty</th>
                            <th style="padding:10px 14px;text-align:center;font-size:12px;text-transform:uppercase;color:var(--text-secondary);">Expiry Date</th>
                            <th style="padding:10px 14px;text-align:right;font-size:12px;text-transform:uppercase;color:var(--text-secondary);">Cost</th>
                        </tr>
                    </thead>
                    <tbody>${batchRows}</tbody>
                </table>
            </div>
        </div>
    `;
    modal.addEventListener('click', (e) => { if(e.target === modal) modal.remove(); });
    document.body.appendChild(modal);
}

// --- SUPPLIERS MANAGEMENT ---
let allSuppliers = [];
async function loadSuppliers() {
    try {
        const res = await fetch(`${API_BASE}/suppliers`, { headers: authHeaders() });
        allSuppliers = await res.json();
        
        document.getElementById('supplier-table-body').innerHTML = allSuppliers.map(s => `
            <tr>
                <td>${s.id}</td>
                <td style="font-weight: 500;">${s.name}</td>
                <td>${s.company_name || '-'}</td>
                <td>${s.phone || '-'}</td>
                <td style="color: var(--text-secondary); font-size: 13px;">${s.created_at ? new Date(s.created_at).toLocaleDateString() : '-'}</td>
                <td>
                    <button class="btn btn-outline" style="padding: 6px 12px; font-size: 12px; color: var(--primary); border-color: var(--primary); margin-right: 8px;" onclick="editSupplier(${s.id})">
                        <i data-lucide="edit-2" style="width:14px;height:14px;"></i> Edit
                    </button>
                    <button class="btn btn-outline" style="padding: 6px 12px; font-size: 12px; color: var(--danger); border-color: var(--danger);" onclick="deleteSupplier(${s.id})">
                        <i data-lucide="trash-2" style="width:14px;height:14px;"></i> Remove
                    </button>
                </td>
            </tr>
        `).join('') || '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-secondary);">No suppliers added yet.</td></tr>';
        lucide.createIcons();
        
        // Bind add button
        document.getElementById('btn-add-supplier').onclick = () => {
            document.getElementById('sup-id').value = '';
            document.getElementById('sup-name').value = '';
            document.getElementById('sup-company').value = '';
            document.getElementById('sup-phone').value = '';
            document.getElementById('sup-form-title').textContent = 'New Supplier';
            document.getElementById('supplier-form-panel').style.display = 'block';
        };
        
        // Bind save
        document.getElementById('btn-save-supplier').onclick = async () => {
            const id = document.getElementById('sup-id').value;
            const name = document.getElementById('sup-name').value;
            if(!name) return alert('Supplier name is required');
            
            try {
                const url = id ? `${API_BASE}/suppliers/${id}` : `${API_BASE}/suppliers`;
                const method = id ? 'PUT' : 'POST';
                
                const res = await fetch(url, {
                    method: method,
                    headers: authHeaders(),
                    body: JSON.stringify({
                        name: name,
                        company_name: document.getElementById('sup-company').value || null,
                        phone: document.getElementById('sup-phone').value || null
                    })
                });
                if(!res.ok) { const err = await res.json(); throw new Error(err.detail); }
                document.getElementById('supplier-form-panel').style.display = 'none';
                document.getElementById('sup-id').value = '';
                document.getElementById('sup-name').value = '';
                document.getElementById('sup-company').value = '';
                document.getElementById('sup-phone').value = '';
                loadSuppliers();
            } catch(e) { alert('Error: ' + e.message); }
        };
    } catch(e) { console.error(e); }
}

window.editSupplier = function(id) {
    const sup = allSuppliers.find(s => s.id === id);
    if(!sup) return;
    document.getElementById('sup-id').value = sup.id;
    document.getElementById('sup-name').value = sup.name;
    document.getElementById('sup-company').value = sup.company_name || '';
    document.getElementById('sup-phone').value = sup.phone || '';
    document.getElementById('sup-form-title').textContent = 'Edit Supplier';
    document.getElementById('supplier-form-panel').style.display = 'block';
}

window.deleteSupplier = async function(id) {
    if(!confirm('Delete this supplier?')) return;
    try {
        const res = await fetch(`${API_BASE}/suppliers/${id}`, { method: 'DELETE', headers: authHeaders() });
        if(!res.ok) { const err = await res.json(); throw new Error(err.detail); }
        loadSuppliers();
    } catch(e) { alert('Error: ' + e.message); }
}

// --- CUSTOMERS MANAGEMENT ---
let allCustomers = [];
async function loadCustomers() {
    try {
        const res = await fetch(`${API_BASE}/customers`, { headers: authHeaders() });
        allCustomers = await res.json();
        
        document.getElementById('customer-table-body').innerHTML = allCustomers.map(c => `
            <tr>
                <td>${c.id}</td>
                <td style="font-weight: 500;">${c.name}</td>
                <td>${c.phone || '-'}</td>
                <td>${c.address || '-'}</td>
                <td style="color: var(--text-secondary); font-size: 13px;">${c.created_at ? new Date(c.created_at).toLocaleDateString() : '-'}</td>
                <td>
                    <button class="btn btn-outline" style="padding: 6px 12px; font-size: 12px; color: var(--primary); border-color: var(--primary); margin-right: 8px;" onclick="editCustomer(${c.id})">
                        <i data-lucide="edit-2" style="width:14px;height:14px;"></i> Edit
                    </button>
                    ${(currentUser && (currentUser.role.toLowerCase() === 'admin' || currentUser.role.toLowerCase() === 'owner')) ? `
                    <button class="btn btn-outline" style="padding: 6px 12px; font-size: 12px; color: var(--danger); border-color: var(--danger);" onclick="deleteCustomer(${c.id})">
                        <i data-lucide="trash-2" style="width:14px;height:14px;"></i> Delete
                    </button>
                    ` : ''}
                </td>
            </tr>
        `).join('') || '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-secondary);">No customers added yet.</td></tr>';
        lucide.createIcons();
        
        // Bind add button
        document.getElementById('btn-add-customer').onclick = () => {
            document.getElementById('cust-id').value = '';
            document.getElementById('cust-name').value = '';
            document.getElementById('cust-phone').value = '';
            document.getElementById('cust-address').value = '';
            document.getElementById('cust-form-title').textContent = 'New Customer';
            document.getElementById('customer-form-panel').style.display = 'block';
        };
        
        // Bind save
        document.getElementById('btn-save-customer').onclick = async () => {
            const id = document.getElementById('cust-id').value;
            const name = document.getElementById('cust-name').value;
            if(!name) return alert('Customer name is required');
            
            try {
                const url = id ? `${API_BASE}/customers/${id}` : `${API_BASE}/customers`;
                const method = id ? 'PUT' : 'POST';
                
                const res = await fetch(url, {
                    method: method,
                    headers: authHeaders(),
                    body: JSON.stringify({
                        name: name,
                        phone: document.getElementById('cust-phone').value || null,
                        address: document.getElementById('cust-address').value || null
                    })
                });
                if(!res.ok) { const err = await res.json(); throw new Error(err.detail); }
                document.getElementById('customer-form-panel').style.display = 'none';
                document.getElementById('cust-id').value = '';
                document.getElementById('cust-name').value = '';
                document.getElementById('cust-phone').value = '';
                document.getElementById('cust-address').value = '';
                loadCustomers();
            } catch(e) { alert('Error: ' + e.message); }
        };
    } catch(e) { console.error(e); }
}

window.editCustomer = function(id) {
    const c = allCustomers.find(x => x.id === id);
    if(!c) return;
    document.getElementById('cust-id').value = c.id;
    document.getElementById('cust-name').value = c.name;
    document.getElementById('cust-phone').value = c.phone || '';
    document.getElementById('cust-address').value = c.address || '';
    document.getElementById('cust-form-title').textContent = 'Edit Customer Profile';
    document.getElementById('customer-form-panel').style.display = 'block';
}

window.deleteCustomer = async function(id) {
    if(!confirm("Are you sure you want to delete this customer? Their past invoices will become anonymous.")) return;
    try {
        const res = await fetch(`${API_BASE}/customers/${id}`, { method: 'DELETE', headers: authHeaders() });
        if(!res.ok) { const err = await res.json(); throw new Error(err.detail); }
        loadCustomers();
    } catch(e) { alert('Error: ' + e.message); }
}

// --- ADD CATEGORY (from Medicines page) ---
window.addNewCategory = async function() {
    const name = prompt('Enter new drug classification name:');
    if(!name || !name.trim()) return;
    
    try {
        const res = await fetch(`${API_BASE}/categories`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ name: name.trim() })
        });
        if(!res.ok) { const err = await res.json(); throw new Error(err.detail); }
        alert('Classification added: ' + name.trim());
        allCategories = []; // force reload
        loadMedicines();
    } catch(e) { alert('Error: ' + e.message); }
}

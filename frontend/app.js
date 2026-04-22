const API_BASE = window.location.origin + "/api";

// State Management
let state = {
    medicines: [],
    sales: [],
    cart: [], // Array of {medId, qty, price, name}
    currentView: 'dashboard',
    loggedInUser: null
};

// --- Initialization ---
document.addEventListener("DOMContentLoaded", () => {
    initNavigation();
    initThemeToggle();
    setupAuthListeners();
    setupCartListeners();
    setupModalListeners();
});

// --- Auth & Modals ---
let isRegisterMode = false;
function setupAuthListeners() {
    const toggleBtn = document.getElementById("toggle-auth-mode");
    const nameInput = document.getElementById("auth-name");
    const title = document.getElementById("auth-title");
    const submitBtn = document.getElementById("auth-submit-btn");
    const form = document.getElementById("auth-form");

    toggleBtn.addEventListener("click", (e) => {
        e.preventDefault();
        isRegisterMode = !isRegisterMode;
        if (isRegisterMode) {
            title.innerText = "Register Dashboard";
            nameInput.style.display = "block";
            nameInput.required = true;
            submitBtn.innerText = "Register";
            toggleBtn.innerText = "Already have an account? Login";
        } else {
            title.innerText = "Login to Dashboard";
            nameInput.style.display = "none";
            nameInput.required = false;
            submitBtn.innerText = "Login";
            toggleBtn.innerText = "Need an account? Register";
        }
    });

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = document.getElementById("auth-email").value;
        const password = document.getElementById("auth-password").value;
        
        try {
            if (isRegisterMode) {
                const name = document.getElementById("auth-name").value;
                const res = await fetch(`${API_BASE}/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, email, password, role: 'Pharmacist' })
                });
                if(!res.ok) throw new Error("Registration failed");
                const user = await res.json();
                showToast("Registration successful", "success");
                initApp(user);
            } else {
                const res = await fetch(`${API_BASE}/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                if(!res.ok) throw new Error("Invalid credentials");
                const user = await res.json();
                showToast("Login successful", "success");
                initApp(user);
            }
        } catch (err) {
            showToast(err.message || "Auth failed", "error");
        }
    });

    document.getElementById("logout-btn").addEventListener("click", (e) => {
        e.preventDefault();
        state.loggedInUser = null;
        document.getElementById("auth-view").style.display = "flex";
        document.getElementById("app-container").style.display = "none";
        document.getElementById("auth-password").value = "";
    });
}

function initApp(user) {
    state.loggedInUser = user;
    document.getElementById("auth-view").style.display = "none";
    document.getElementById("app-container").style.display = "flex";
    document.getElementById("display-user-name").innerText = user.name;
    document.getElementById("display-user-role").innerText = user.role;
    fetchMedicines();
}

function setupModalListeners() {
    const modal = document.getElementById("add-medicine-modal");
    document.getElementById("open-add-modal-btn").addEventListener("click", () => {
        modal.style.display = "flex";
    });
    document.getElementById("close-modal-btn").addEventListener("click", () => {
        modal.style.display = "none";
    });
    document.getElementById("add-medicine-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const payload = {
            name: document.getElementById("med-name").value,
            category: document.getElementById("med-category").value,
            price: parseFloat(document.getElementById("med-price").value),
            quantity: parseInt(document.getElementById("med-quantity").value),
            expiry_date: document.getElementById("med-expiry").value
        };
        try {
            const res = await fetch(`${API_BASE}/medicines`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error("Failed to add medicine");
            showToast("Medicine added!", "success");
            modal.style.display = "none";
            e.target.reset();
            fetchMedicines();
        } catch(err) {
            showToast(err.message, "error");
        }
    });
}

// --- Theme Management ---
function initThemeToggle() {
    const btn = document.getElementById("theme-toggle");
    const html = document.documentElement;
    
    btn.addEventListener("click", () => {
        const currentThm = html.getAttribute("data-theme");
        const newThm = currentThm === "dark" ? "light" : "dark";
        html.setAttribute("data-theme", newThm);
        btn.querySelector("i").setAttribute("data-lucide", newThm === "dark" ? "sun" : "moon");
        lucide.createIcons();
    });
}

// --- Navigation Management ---
function initNavigation() {
    const links = document.querySelectorAll(".nav-links li");
    
    links.forEach(link => {
        link.addEventListener("click", (e) => {
            // Remove active classes
            links.forEach(l => l.classList.remove("active"));
            document.querySelectorAll(".view").forEach(v => v.classList.remove("active-view"));
            
            // Add active class to clicked link
            const targetView = link.getAttribute("data-view");
            link.classList.add("active");
            document.getElementById(`view-${targetView}`).classList.add("active-view");
            
            // Fetch view-specific data
            state.currentView = targetView;
            if (targetView === 'inventory') fetchMedicines();
            if (targetView === 'sales') fetchSales();
        });
    });
}

// --- API Calls ---
async function fetchMedicines() {
    try {
        const response = await fetch(`${API_BASE}/medicines`);
        if (!response.ok) throw new Error("Failed to fetch medicines");
        state.medicines = await response.json();
        
        // Ensure medicines list is rendering dummy data gracefully if DB empty
        if (state.medicines.length === 0) {
            // Provide mock data if DB is empty to showcase the beautiful interface
            state.medicines = [
                {id: 1, name: "Amoxicillin 500mg", category: "Antibiotic", price: 12.50, quantity: 150, expiry_date: "2025-10-01"},
                {id: 2, name: "Ibuprofen 400mg", category: "Painkiller", price: 8.99, quantity: 5, expiry_date: "2024-12-11"},
                {id: 3, name: "Cetirizine 10mg", category: "Antihistamine", price: 15.00, quantity: 80, expiry_date: "2026-05-20"},
                {id: 4, name: "Lisinopril 20mg", category: "Blood Pressure", price: 21.00, quantity: 120, expiry_date: "2025-01-15"}
            ];
        }

        renderMedicinesGrid();
        renderInventoryTable();
    } catch (e) {
        showToast("Error connecting to database. Using offline demo mode.", "error");
        // Fallback demo data
        state.medicines = [
            {id: 1, name: "Amoxicillin 500mg", category: "Antibiotic", price: 12.50, quantity: 150, expiry_date: "2025-10-01"},
            {id: 2, name: "Ibuprofen 400mg", category: "Painkiller", price: 8.99, quantity: 5, expiry_date: "2024-12-11"},
        ];
        renderMedicinesGrid();
        renderInventoryTable();
    }
}

async function fetchSales() {
    try {
        const response = await fetch(`${API_BASE}/sales`);
        if (!response.ok) throw new Error("Failed to fetch sales");
        state.sales = await response.json();
        renderSalesTable();
    } catch (e) {
        console.error(e);
    }
}

// --- Rendering ---
function renderMedicinesGrid() {
    const grid = document.getElementById("pos-medicine-grid");
    grid.innerHTML = "";
    
    state.medicines.forEach(med => {
        const isLowStock = med.quantity < 10;
        const card = document.createElement("div");
        card.className = "medicine-card";
        card.innerHTML = `
            <span class="med-cat">${med.category || 'General'}</span>
            <span class="med-name">${med.name}</span>
            <div class="med-footer">
                <span class="med-price">$${med.price.toFixed(2)}</span>
                <span class="med-stock ${isLowStock ? 'low' : ''}">${med.quantity} in stock</span>
            </div>
        `;
        
        card.addEventListener("click", () => addToCart(med));
        grid.appendChild(card);
    });
}

function renderInventoryTable() {
    const tbody = document.getElementById("inventory-table-body");
    tbody.innerHTML = "";
    
    state.medicines.forEach(med => {
        const tr = document.createElement("tr");
        const isLowStock = med.quantity < 10;
        tr.innerHTML = `
            <td>#${med.id}</td>
            <td style="font-weight: 500;">${med.name}</td>
            <td>${med.category || '-'}</td>
            <td style="font-weight: 600; color: var(--accent-primary)">$${med.price.toFixed(2)}</td>
            <td><span class="med-stock ${isLowStock ? 'low' : ''}">${med.quantity}</span></td>
            <td>${med.expiry_date || '-'}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderSalesTable() {
    const tbody = document.getElementById("sales-table-body");
    tbody.innerHTML = "";
    
    if (state.sales.length === 0) {
        tbody.innerHTML = "<tr><td colspan='4'>No past sales</td></tr>";
        return;
    }

    state.sales.forEach(sale => {
        const d = new Date(sale.created_at);
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td style="font-weight: 500">TXN-${sale.id}</td>
            <td>${d.toLocaleDateString()} ${d.toLocaleTimeString()}</td>
            <td>User ID: ${sale.user_id}</td>
            <td style="font-weight: 600; color: var(--accent-success)">$${sale.total_price.toFixed(2)}</td>
        `;
        tbody.appendChild(tr);
    });
}

// --- Cart Logic ---
function addToCart(med) {
    if (med.quantity <= 0) {
        showToast("Out of stock!", "error");
        return;
    }
    
    const existing = state.cart.find(item => item.medId === med.id);
    if (existing) {
        if (existing.qty >= med.quantity) {
            showToast(`Only ${med.quantity} ${med.name} available!`, "error");
            return;
        }
        existing.qty += 1;
    } else {
        state.cart.push({
            medId: med.id,
            name: med.name,
            price: med.price,
            qty: 1
        });
    }
    
    updateCartUI();
}

function changeCartQty(medId, delta) {
    const item = state.cart.find(i => i.medId === medId);
    if (!item) return;

    item.qty += delta;
    if (item.qty <= 0) {
        state.cart = state.cart.filter(i => i.medId !== medId);
    }
    updateCartUI();
}

function updateCartUI() {
    const cartEl = document.getElementById("cart-items");
    cartEl.innerHTML = "";
    
    if (state.cart.length === 0) {
        cartEl.innerHTML = `<div class="empty-cart-msg" style="color: var(--text-secondary); text-align: center; padding: 2rem;">Cart is empty. Select medicines.</div>`;
        document.getElementById("checkout-btn").disabled = true;
    } else {
        document.getElementById("checkout-btn").disabled = false;
        state.cart.forEach(item => {
            const div = document.createElement("div");
            div.className = "cart-item";
            div.innerHTML = `
                <div class="cart-item-info">
                    <span class="cart-item-name">${item.name}</span>
                    <span class="cart-item-price">$${item.price.toFixed(2)}</span>
                </div>
                <div class="cart-item-actions">
                    <button class="qty-btn" onclick="changeCartQty(${item.medId}, -1)"><i data-lucide="minus"></i></button>
                    <span class="cart-item-qty">${item.qty}</span>
                    <button class="qty-btn" onclick="changeCartQty(${item.medId}, 1)"><i data-lucide="plus"></i></button>
                </div>
            `;
            cartEl.appendChild(div);
        });
        lucide.createIcons();
    }
    
    // Total calculation
    const total = state.cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    document.getElementById("cart-subtotal").innerText = `$${total.toFixed(2)}`;
    document.getElementById("cart-total").innerText = `$${total.toFixed(2)}`;
}

// --- Checkout Logic ---
function setupCartListeners() {
    const checkoutBtn = document.getElementById("checkout-btn");
    checkoutBtn.addEventListener("click", async () => {
        if (state.cart.length === 0) return;
        
        checkoutBtn.disabled = true;
        checkoutBtn.innerHTML = "Processing...";
        
        try {
            // Use the actual logged-in user instead of a mock ID
            const payload = {
                user_id: state.loggedInUser.id, 
                items: state.cart.map(item => ({
                    medicine_id: item.medId,
                    quantity: item.qty,
                    price: item.price
                }))
            };
            
            const response = await fetch(`${API_BASE}/sales`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || "Sale failed");
            }
            
            showToast("Sale completed successfully!", "success");
            state.cart = [];
            updateCartUI();
            fetchMedicines(); // Refresh stock
            
        } catch (error) {
            showToast(error.message, "error");
        } finally {
            checkoutBtn.innerHTML = `<i data-lucide="credit-card"></i> Process Sale`;
            checkoutBtn.disabled = state.cart.length === 0;
            lucide.createIcons();
        }
    });

    // Search filter
    const search = document.getElementById("medicine-search");
    search.addEventListener("input", (e) => {
        const query = e.target.value.toLowerCase();
        const cards = document.querySelectorAll(".medicine-card");
        cards.forEach(card => {
            const name = card.querySelector(".med-name").innerText.toLowerCase();
            if (name.includes(query)) card.style.display = "flex";
            else card.style.display = "none";
        });
    });
}

// --- Toasts ---
function showToast(message, type = "success") {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    
    const icon = type === "success" ? "check-circle" : "alert-circle";
    toast.innerHTML = `<i data-lucide="${icon}"></i> <span>${message}</span>`;
    
    container.appendChild(toast);
    lucide.createIcons();
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}
